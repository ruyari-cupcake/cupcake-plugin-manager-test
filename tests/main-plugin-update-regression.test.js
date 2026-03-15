import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAIN_UPDATE_URL } from '../src/lib/endpoints.js';

const TEST_MAIN_UPDATE_URL = 'https://cupcake-plugin-manager-test.vercel.app/api/main-plugin';
const EXPECTED_BUILD_ENV = MAIN_UPDATE_URL.includes('cupcake-plugin-manager.vercel.app/api/main-plugin')
    ? 'production'
    : 'test';

const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);
const packageLock = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf-8')
);
const versionsManifest = JSON.parse(
    readFileSync(new URL('../versions.json', import.meta.url), 'utf-8')
);
const releaseHashes = JSON.parse(
    readFileSync(new URL('../release-hashes.json', import.meta.url), 'utf-8')
);
const updateBundle = JSON.parse(
    readFileSync(new URL('../update-bundle.json', import.meta.url), 'utf-8')
);
const pluginHeader = readFileSync(new URL('../src/plugin-header.js', import.meta.url), 'utf-8');
const sharedState = readFileSync(new URL('../src/lib/shared-state.js', import.meta.url), 'utf-8');
const rootBundle = readFileSync(new URL('../provider-manager.js', import.meta.url), 'utf-8');
const distBundle = readFileSync(new URL('../dist/provider-manager.js', import.meta.url), 'utf-8');

function sha256(text) {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
}

function getRequiredMatch(source, regex, label) {
    const match = source.match(regex);
    expect(match, `${label} should exist`).toBeTruthy();
    return match[1].trim();
}

describe('main plugin update regression guard', () => {
    it('keeps runtime version, header version, package version, and built bundle version in sync', () => {
        const headerVersion = getRequiredMatch(pluginHeader, /^\/\/@version\s+([^\r\n]+)/m, 'plugin header version');
        const sharedStateVersion = getRequiredMatch(sharedState, /export const CPM_VERSION = '([^']+)'/, 'shared-state CPM_VERSION');
        const rootVersion = getRequiredMatch(rootBundle, /^\/\/@version\s+([^\r\n]+)/m, 'root bundle version');
        const distVersion = getRequiredMatch(distBundle, /^\/\/@version\s+([^\r\n]+)/m, 'dist bundle version');

        expect(packageLock.version).toBe(packageJson.version);
        expect(packageLock.packages[''].version).toBe(packageJson.version);
        expect(headerVersion).toBe(packageJson.version);
        expect(sharedStateVersion).toBe(packageJson.version);
        expect(rootVersion).toBe(packageJson.version);
        expect(distVersion).toBe(packageJson.version);
    });

    it('keeps shipped release artifacts and metadata in sync', () => {
        const rootConstVersion = getRequiredMatch(rootBundle, /const CPM_VERSION = '([^']+)'/, 'root bundle CPM_VERSION');
        const distConstVersion = getRequiredMatch(distBundle, /const CPM_VERSION = '([^']+)'/, 'dist bundle CPM_VERSION');
        const bundledCode = updateBundle.code['provider-manager.js'];
        const bundledVersion = updateBundle.versions['Cupcake Provider Manager'];
        const hashEntry = releaseHashes.files['provider-manager.js'];
        const actualHash = sha256(rootBundle);

        expect(rootConstVersion).toBe(packageJson.version);
        expect(distConstVersion).toBe(packageJson.version);
        expect(rootBundle).toBe(distBundle);

        expect(versionsManifest['Cupcake Provider Manager'].version).toBe(packageJson.version);
        expect(releaseHashes.version).toBe(packageJson.version);
        expect(hashEntry.version).toBe(packageJson.version);
        expect(hashEntry.sha256).toBe(actualHash);

        expect(bundledVersion.version).toBe(packageJson.version);
        expect(bundledVersion.sha256).toBe(actualHash);
        expect(bundledCode).toBe(rootBundle);
        expect(getRequiredMatch(bundledCode, /^\/\/@version\s+([^\r\n]+)/m, 'bundled provider-manager version')).toBe(packageJson.version);
        expect(getRequiredMatch(bundledCode, /const CPM_VERSION = '([^']+)'/, 'bundled provider-manager CPM_VERSION')).toBe(packageJson.version);
    });

    it('keeps the RisuAI update identity stable in source and built artifact', () => {
        const headerName = getRequiredMatch(pluginHeader, /^\/\/@name\s+([^\r\n]+)/m, 'plugin header name');
        const headerDisplayName = getRequiredMatch(pluginHeader, /^\/\/@display-name\s+([^\r\n]+)/m, 'plugin header display name');
        const rootName = getRequiredMatch(rootBundle, /^\/\/@name\s+([^\r\n]+)/m, 'root bundle name');
        const rootDisplayName = getRequiredMatch(rootBundle, /^\/\/@display-name\s+([^\r\n]+)/m, 'root bundle display name');
        const distName = getRequiredMatch(distBundle, /^\/\/@name\s+([^\r\n]+)/m, 'dist bundle name');
        const distDisplayName = getRequiredMatch(distBundle, /^\/\/@display-name\s+([^\r\n]+)/m, 'dist bundle display name');
        const updateUrl = getRequiredMatch(pluginHeader, /^\/\/@update-url\s+([^\r\n]+)/m, 'plugin update URL');
        const rootUpdateUrl = getRequiredMatch(rootBundle, /^\/\/@update-url\s+([^\r\n]+)/m, 'root bundle update URL');
        const distUpdateUrl = getRequiredMatch(distBundle, /^\/\/@update-url\s+([^\r\n]+)/m, 'dist bundle update URL');
        const versionOffset = pluginHeader.indexOf('//@version');

        expect(headerName).toBe('Cupcake_Provider_Manager');
        expect(headerDisplayName).toBe('Cupcake Provider Manager');
        expect(rootName).toBe(headerName);
        expect(rootDisplayName).toBe(headerDisplayName);
        expect(distName).toBe(headerName);
        expect(distDisplayName).toBe(headerDisplayName);
        expect(updateUrl).toBe(TEST_MAIN_UPDATE_URL);
        expect(rootUpdateUrl).toBe(MAIN_UPDATE_URL);
        expect(distUpdateUrl).toBe(MAIN_UPDATE_URL);
        expect(versionOffset).toBeGreaterThanOrEqual(0);
        expect(new TextEncoder().encode(pluginHeader.slice(0, versionOffset) + '//@version').length).toBeLessThanOrEqual(512);
    });

    it('pins the built CPM environment without corrupting the bundled URL map', () => {
        const distEnv = getRequiredMatch(distBundle, /const _env = '([^']+)'/, 'dist CPM_ENV');
        const rootEnv = getRequiredMatch(rootBundle, /const _env = '([^']+)'/, 'root CPM_ENV');
        const distProductionUrl = getRequiredMatch(distBundle, /production:\s*'([^']+)'/, 'dist production URL');
        const distTestUrl = getRequiredMatch(distBundle, /test:\s*'([^']+)'/, 'dist test URL');
        const rootProductionUrl = getRequiredMatch(rootBundle, /production:\s*'([^']+)'/, 'root production URL');
        const rootTestUrl = getRequiredMatch(rootBundle, /test:\s*'([^']+)'/, 'root test URL');

        expect(distEnv).toBe(EXPECTED_BUILD_ENV);
        expect(rootEnv).toBe(EXPECTED_BUILD_ENV);
        expect(distProductionUrl).toBe('https://cupcake-plugin-manager.vercel.app');
        expect(distTestUrl).toBe('https://cupcake-plugin-manager-test.vercel.app');
        expect(rootProductionUrl).toBe('https://cupcake-plugin-manager.vercel.app');
        expect(rootTestUrl).toBe('https://cupcake-plugin-manager-test.vercel.app');
    });

    it('registers the settings panel before risky init phases in the shipped bundle', () => {
        // The init IIFE scope starts around the _bootPhase variable.
        // We scope our search to the init IIFE section to avoid matching
        // identical strings that appear in non-init helper functions
        // (e.g. settings import/restore reloading sub-plugins).
        const initIIFEStart = distBundle.indexOf("_bootPhase = 'pre-init'");
        expect(initIIFEStart).toBeGreaterThan(-1);

        const initSection = distBundle.substring(initIIFEStart);
        const registerSettingIndex = initSection.indexOf('await Risu.registerSetting(');
        const loadRegistryIndex = initSection.indexOf('await SubPluginManager.loadRegistry()');
        const executeEnabledIndex = initSection.indexOf('await SubPluginManager.executeEnabled()');
        const restoreSettingsIndex = initSection.indexOf('await SettingsBackup.load()');
        const fallbackRegisterIndex = initSection.indexOf('⚠️ CPM v${CPM_VERSION} (Error)');

        expect(registerSettingIndex).toBeGreaterThan(-1);
        expect(loadRegistryIndex).toBeGreaterThan(-1);
        expect(executeEnabledIndex).toBeGreaterThan(-1);
        expect(restoreSettingsIndex).toBeGreaterThan(-1);
        expect(fallbackRegisterIndex).toBeGreaterThan(-1);
        expect(registerSettingIndex).toBeLessThan(loadRegistryIndex);
        expect(registerSettingIndex).toBeLessThan(executeEnabledIndex);
        expect(registerSettingIndex).toBeLessThan(restoreSettingsIndex);
    });
});
