import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);
const pluginHeader = readFileSync(new URL('../src/plugin-header.js', import.meta.url), 'utf-8');
const sharedState = readFileSync(new URL('../src/lib/shared-state.js', import.meta.url), 'utf-8');
const distBundle = readFileSync(new URL('../dist/provider-manager.js', import.meta.url), 'utf-8');

function getRequiredMatch(source, regex, label) {
    const match = source.match(regex);
    expect(match, `${label} should exist`).toBeTruthy();
    return match[1].trim();
}

describe('main plugin update regression guard', () => {
    it('keeps runtime version, header version, package version, and built bundle version in sync', () => {
        const headerVersion = getRequiredMatch(pluginHeader, /^\/\/@version\s+([^\r\n]+)/m, 'plugin header version');
        const sharedStateVersion = getRequiredMatch(sharedState, /export const CPM_VERSION = '([^']+)'/, 'shared-state CPM_VERSION');
        const distVersion = getRequiredMatch(distBundle, /^\/\/@version\s+([^\r\n]+)/m, 'dist bundle version');

        expect(headerVersion).toBe(packageJson.version);
        expect(sharedStateVersion).toBe(packageJson.version);
        expect(distVersion).toBe(packageJson.version);
    });

    it('keeps the RisuAI update identity stable in source and built artifact', () => {
        const headerName = getRequiredMatch(pluginHeader, /^\/\/@name\s+([^\r\n]+)/m, 'plugin header name');
        const headerDisplayName = getRequiredMatch(pluginHeader, /^\/\/@display-name\s+([^\r\n]+)/m, 'plugin header display name');
        const distName = getRequiredMatch(distBundle, /^\/\/@name\s+([^\r\n]+)/m, 'dist bundle name');
        const distDisplayName = getRequiredMatch(distBundle, /^\/\/@display-name\s+([^\r\n]+)/m, 'dist bundle display name');
        const updateUrl = getRequiredMatch(pluginHeader, /^\/\/@update-url\s+([^\r\n]+)/m, 'plugin update URL');
        const versionOffset = pluginHeader.indexOf('//@version');

        expect(headerName).toBe('Cupcake_Provider_Manager');
        expect(headerDisplayName).toBe('Cupcake Provider Manager');
        expect(distName).toBe(headerName);
        expect(distDisplayName).toBe(headerDisplayName);
        expect(updateUrl).toBe('https://cupcake-plugin-manager-test.vercel.app/provider-manager.js');
        expect(versionOffset).toBeGreaterThanOrEqual(0);
        expect(new TextEncoder().encode(pluginHeader.slice(0, versionOffset) + '//@version').length).toBeLessThanOrEqual(512);
    });

    it('registers the settings panel before risky init phases in the shipped bundle', () => {
        const registerSettingIndex = distBundle.indexOf('await Risu.registerSetting(');
        const loadRegistryIndex = distBundle.indexOf('await SubPluginManager.loadRegistry()');
        const executeEnabledIndex = distBundle.indexOf('await SubPluginManager.executeEnabled()');
        const restoreSettingsIndex = distBundle.indexOf('await SettingsBackup.load()');
        const fallbackRegisterIndex = distBundle.indexOf('⚠️ CPM v${CPM_VERSION} (Error)');

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
