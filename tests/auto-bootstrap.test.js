/**
 * @file auto-bootstrap.test.js — Tests for autoBootstrapBundledPlugins
 * Verifies that new sub-plugins in the update bundle are auto-installed
 * on first load when not yet in the user's registry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    risu: {
        log: vi.fn(),
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        },
    },
    cpmVersion: '1.22.26',
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: h.cpmVersion,
    safeGetBoolArg: vi.fn(async () => false),
}));
vi.mock('../src/lib/endpoints.js', () => ({
    VERSIONS_URL: 'https://test.example.com/versions.json',
    MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
    UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
    CPM_ENV: 'test2',
}));

import { autoUpdaterMethods, _computeSHA256 } from '../src/lib/auto-updater.js';

// ── Helpers ──
const MOCK_SUB_PLUGIN_CODE = `//@name CPM Component - Chat Limiter
//@display-name 🧁 Cupcake Chat Limiter
//@version 0.2.0
//@description Test limiter
//@icon 📋
//@update-url https://raw.githubusercontent.com/test/test/main/cpm-chat-limiter.js
(async()=>{console.log('limiter loaded');})();`;

function makeBundle(extraVersions = {}, extraCode = {}) {
    return {
        versions: {
            'Cupcake Provider Manager': { version: '1.22.26', file: 'provider-manager.js' },
            'CPM Provider - OpenAI': { version: '1.5.9', file: 'cpm-provider-openai.js' },
            ...extraVersions,
        },
        code: {
            'provider-manager.js': '//main plugin code',
            'cpm-provider-openai.js': `//@name CPM Provider - OpenAI\n//@version 1.5.9\n(()=>{})();`,
            ...extraCode,
        },
    };
}

describe('autoBootstrapBundledPlugins', () => {
    /** @type {any} */
    let mgr;

    beforeEach(async () => {
        vi.clearAllMocks();

        mgr = {
            ...autoUpdaterMethods,
            plugins: [],
            BLOCKED_NAMES: ['Cupcake_Provider_Manager', 'Cupcake Provider Manager'],
            MAX_INSTALL_BYTES: 300 * 1024,
            extractMetadata: autoUpdaterMethods.extractMetadata || function (code) {
                const meta = { name: 'Unnamed', version: '', description: '', icon: '📦', updateUrl: '' };
                for (const line of code.split(/\r?\n/)) {
                    const t = line.trim();
                    if (!t.startsWith('//')) break;
                    const nm = t.match(/\/\/\s*@name\s+(.+)/i);
                    if (nm) meta.name = nm[1].trim();
                    const vm = t.match(/\/\/\s*@version\s+(.+)/i);
                    if (vm) meta.version = vm[1].trim();
                    const um = t.match(/\/\/\s*@update-url\s+(.+)/i);
                    if (um) meta.updateUrl = um[1].trim();
                    const dm = t.match(/\/\/\s*@description\s+(.+)/i);
                    if (dm) meta.description = dm[1].trim();
                    const im = t.match(/\/\/\s*@icon\s+(.+)/i);
                    if (im) meta.icon = im[1].trim();
                }
                return meta;
            },
            getCodeSizeBytes: function (code) {
                return new TextEncoder().encode(code || '').length;
            },
            install: vi.fn(async function (code) {
                const meta = this.extractMetadata(code);
                const existing = this.plugins.find(p => p.name === meta.name);
                if (existing) {
                    existing.code = code;
                    existing.version = meta.version;
                    return meta.name;
                }
                this.plugins.push({ id: 'subplugin_' + Date.now(), code, enabled: true, ...meta });
                return meta.name;
            }),
            saveRegistry: vi.fn(async () => {}),
            compareVersions: autoUpdaterMethods.compareVersions,
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('installs a new sub-plugin from the bundle', async () => {
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js' } },
            { 'cpm-chat-limiter.js': MOCK_SUB_PLUGIN_CODE }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toContain('CPM Component - Chat Limiter');
        expect(mgr.install).toHaveBeenCalled();
    });

    it('does NOT install already-installed plugins', async () => {
        mgr.plugins = [{ name: 'CPM Provider - OpenAI', version: '1.5.9', enabled: true }];
        const bundle = makeBundle();
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
        expect(mgr.install).not.toHaveBeenCalled();
    });

    it('does NOT install the main plugin (Cupcake Provider Manager)', async () => {
        const bundle = makeBundle();
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).not.toContain('Cupcake Provider Manager');
    });

    it('skips plugins with missing code in bundle', async () => {
        const bundle = makeBundle(
            { 'Ghost Plugin': { version: '1.0.0', file: 'ghost.js' } },
            // ghost.js NOT in code section
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).not.toContain('Ghost Plugin');
    });

    it('rejects plugins with SHA-256 mismatch', async () => {
        // Pre-install OpenAI so only Limiter is the "new" plugin
        mgr.plugins = [{ name: 'CPM Provider - OpenAI', version: '1.5.9', enabled: true }];
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js', sha256: 'deadbeef_wrong_hash' } },
            { 'cpm-chat-limiter.js': MOCK_SUB_PLUGIN_CODE }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
    });

    it('installs plugins without sha256 (no integrity check required)', async () => {
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js' /* no sha256 */ } },
            { 'cpm-chat-limiter.js': MOCK_SUB_PLUGIN_CODE }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toContain('CPM Component - Chat Limiter');
    });

    it('returns empty array when bundle fetch fails', async () => {
        h.risu.risuFetch.mockResolvedValue({ data: null, status: 500 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
    });

    it('returns empty array when bundle has invalid schema', async () => {
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify('not-an-object'), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
    });

    it('handles network error gracefully', async () => {
        h.risu.risuFetch.mockRejectedValue(new Error('Network timeout'));

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
    });

    it('installs multiple new plugins at once', async () => {
        // Pre-install OpenAI so only Limiter and Navi are "new"
        mgr.plugins = [{ name: 'CPM Provider - OpenAI', version: '1.5.9', enabled: true }];
        const limiterCode = MOCK_SUB_PLUGIN_CODE;
        const naviCode = `//@name CPM Component - Chat Navigation\n//@version 2.1.4\n(()=>{})();`;
        const bundle = makeBundle(
            {
                'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js' },
                'CPM Component - Chat Navigation': { version: '2.1.4', file: 'cpm-chat-navigation.js' },
            },
            {
                'cpm-chat-limiter.js': limiterCode,
                'cpm-chat-navigation.js': naviCode,
            }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed.length).toBe(2);
        expect(installed).toContain('CPM Component - Chat Limiter');
        expect(installed).toContain('CPM Component - Chat Navigation');
    });

    it('passes SHA-256 integrity check when hash matches', async () => {
        const hash = await _computeSHA256(MOCK_SUB_PLUGIN_CODE);
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js', sha256: hash } },
            { 'cpm-chat-limiter.js': MOCK_SUB_PLUGIN_CODE }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toContain('CPM Component - Chat Limiter');
    });
});
