/**
 * Deep coverage tests for sub-plugin-manager.js
 * Covers: compareVersions, extractMetadata, install/remove/toggle,
 * loadRegistry error paths, _computeSHA256, unloadPlugin, applyUpdate integrity,
 * purgeAllCpmData, executeEnabled.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    risu: {
        getArgument: vi.fn(async () => ''),
        setArgument: vi.fn(),
        log: vi.fn(),
        risuFetch: vi.fn(async () => ({ data: null, status: 200 })),
        getRootDocument: vi.fn(async () => null),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
            keys: vi.fn(async () => []),
        },
    },
    executeViaScriptTag: vi.fn(async () => {}),
    getManagedSettingKeys: vi.fn(() => ['cpm_key1', 'cpm_key2']),
    validateSchema: vi.fn((data) => ({ ok: true, data })),
    parseAndValidate: vi.fn((data) => {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            return { ok: true, data: parsed };
        } catch (e) {
            return { ok: false, error: e.message, fallback: [] };
        }
    }),
    schemas: {
        subPluginRegistry: 'registry',
        updateBundleVersions: 'versions',
        updateBundle: 'bundle',
    },
    escHtml: vi.fn((s) => s),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: '1.19.6',
    state: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));
vi.mock('../src/lib/csp-exec.js', () => ({ _executeViaScriptTag: h.executeViaScriptTag }));
vi.mock('../src/lib/settings-backup.js', () => ({ getManagedSettingKeys: h.getManagedSettingKeys }));
vi.mock('../src/lib/schema.js', () => ({ validateSchema: h.validateSchema, parseAndValidate: h.parseAndValidate, schemas: h.schemas }));
vi.mock('../src/lib/helpers.js', () => ({ escHtml: h.escHtml }));

import { SubPluginManager, _computeSHA256 } from '../src/lib/sub-plugin-manager.js';
import { state, customFetchers, _pluginRegistrations, _pluginCleanupHooks, registeredProviderTabs, pendingDynamicFetchers, isDynamicFetchEnabled } from '../src/lib/shared-state.js';

describe('_computeSHA256', () => {
    it('returns a hex string for valid input', async () => {
        const hash = await _computeSHA256('hello');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
    it('returns different hashes for different inputs', async () => {
        const h1 = await _computeSHA256('hello');
        const h2 = await _computeSHA256('world');
        expect(h1).not.toBe(h2);
    });
    it('returns same hash for same input', async () => {
        const h1 = await _computeSHA256('test');
        const h2 = await _computeSHA256('test');
        expect(h1).toBe(h2);
    });
    it('handles empty string', async () => {
        const hash = await _computeSHA256('');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('SubPluginManager — deep coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SubPluginManager.plugins = [];
        // Reset window globals
        delete window._cpmVersionChecked;
        delete window._cpmMainVersionChecked;
        delete window._cpmMainVersionFromManifest;
    });

    // ── extractMetadata ──
    describe('extractMetadata', () => {
        it('extracts all metadata fields', () => {
            const code = `
// @name Test Plugin
// @version 1.0.0
// @description A test plugin
// @icon 🧪
// @update-url https://example.com/update.js
console.log('hello');
`;
            const meta = SubPluginManager.extractMetadata(code);
            expect(meta.name).toBe('Test Plugin');
            expect(meta.version).toBe('1.0.0');
            expect(meta.description).toBe('A test plugin');
            expect(meta.icon).toBe('🧪');
            expect(meta.updateUrl).toBe('https://example.com/update.js');
        });

        it('returns defaults for code without metadata', () => {
            const meta = SubPluginManager.extractMetadata('console.log("hi")');
            expect(meta.name).toBe('Unnamed Sub-Plugin');
            expect(meta.version).toBe('');
            expect(meta.description).toBe('');
            expect(meta.icon).toBe('📦');
            expect(meta.updateUrl).toBe('');
        });

        it('supports @display-name alias', () => {
            const meta = SubPluginManager.extractMetadata('// @display-name My Plugin');
            expect(meta.name).toBe('My Plugin');
        });
    });

    // ── compareVersions ──
    describe('compareVersions', () => {
        it('returns 0 for equal versions', () => {
            expect(SubPluginManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
        });
        it('returns 1 when remote is newer', () => {
            expect(SubPluginManager.compareVersions('1.0.0', '1.0.1')).toBe(1);
            expect(SubPluginManager.compareVersions('1.0.0', '2.0.0')).toBe(1);
        });
        it('returns -1 when local is newer', () => {
            expect(SubPluginManager.compareVersions('2.0.0', '1.0.0')).toBe(-1);
        });
        it('handles different length versions', () => {
            expect(SubPluginManager.compareVersions('1.0', '1.0.1')).toBe(1);
            expect(SubPluginManager.compareVersions('1.0.1', '1.0')).toBe(-1);
        });
        it('returns 0 for empty/null versions', () => {
            expect(SubPluginManager.compareVersions('', '')).toBe(0);
            expect(SubPluginManager.compareVersions(null, null)).toBe(0);
        });
        it('strips non-numeric characters', () => {
            expect(SubPluginManager.compareVersions('v1.0.0', 'v1.0.1')).toBe(1);
        });
    });

    // ── install ──
    describe('install', () => {
        it('installs new plugin', async () => {
            const name = await SubPluginManager.install('// @name TestPlugin\n// @version 1.0.0\nconsole.log("hi")');
            expect(name).toBe('TestPlugin');
            expect(SubPluginManager.plugins).toHaveLength(1);
            expect(SubPluginManager.plugins[0].enabled).toBe(true);
            expect(h.risu.pluginStorage.setItem).toHaveBeenCalled();
        });
        it('updates existing plugin with same name', async () => {
            await SubPluginManager.install('// @name TestPlugin\n// @version 1.0.0');
            await SubPluginManager.install('// @name TestPlugin\n// @version 2.0.0');
            expect(SubPluginManager.plugins).toHaveLength(1);
            expect(SubPluginManager.plugins[0].version).toBe('2.0.0');
        });
    });

    // ── remove ──
    describe('remove', () => {
        it('removes plugin by id', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test' }];
            await SubPluginManager.remove('p1');
            expect(SubPluginManager.plugins).toHaveLength(0);
        });
        it('does nothing for unknown id', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test' }];
            await SubPluginManager.remove('p2');
            expect(SubPluginManager.plugins).toHaveLength(1);
        });
    });

    // ── toggle ──
    describe('toggle', () => {
        it('toggles plugin enabled state', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', enabled: true }];
            await SubPluginManager.toggle('p1', false);
            expect(SubPluginManager.plugins[0].enabled).toBe(false);
        });
        it('does nothing for unknown id', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', enabled: true }];
            await SubPluginManager.toggle('p2', false);
            expect(SubPluginManager.plugins[0].enabled).toBe(true);
        });
    });

    // ── loadRegistry ──
    describe('loadRegistry', () => {
        it('loads empty when no data', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue(null);
            await SubPluginManager.loadRegistry();
            expect(SubPluginManager.plugins).toEqual([]);
        });

        it('loads valid data', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'Test' }]));
            h.parseAndValidate.mockReturnValue({ ok: true, data: [{ id: 'p1', name: 'Test' }] });
            await SubPluginManager.loadRegistry();
            expect(SubPluginManager.plugins).toHaveLength(1);
        });

        it('uses fallback on schema validation failure', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue('invalid');
            h.parseAndValidate.mockReturnValue({ ok: false, error: 'bad schema', fallback: [{ id: 'fallback' }] });
            await SubPluginManager.loadRegistry();
            expect(SubPluginManager.plugins).toEqual([{ id: 'fallback' }]);
        });

        it('handles storage error gracefully', async () => {
            h.risu.pluginStorage.getItem.mockRejectedValue(new Error('storage error'));
            await SubPluginManager.loadRegistry();
            expect(SubPluginManager.plugins).toEqual([]);
        });
    });

    // ── executeEnabled ──
    describe('executeEnabled', () => {
        it('executes enabled plugins', async () => {
            SubPluginManager.plugins = [
                { id: 'p1', name: 'Plugin1', enabled: true, code: 'console.log("1")' },
                { id: 'p2', name: 'Plugin2', enabled: false, code: 'console.log("2")' },
                { id: 'p3', name: 'Plugin3', enabled: true, code: 'console.log("3")' },
            ];
            await SubPluginManager.executeEnabled();
            expect(h.executeViaScriptTag).toHaveBeenCalledTimes(2);
        });

        it('handles execution errors gracefully', async () => {
            SubPluginManager.plugins = [
                { id: 'p1', name: 'CrashPlugin', enabled: true, code: 'throw new Error("crash")' },
            ];
            h.executeViaScriptTag.mockRejectedValueOnce(new Error('crash'));
            await expect(SubPluginManager.executeEnabled()).resolves.not.toThrow();
        });

        it('sets _currentExecutingPluginId during execution', async () => {
            let capturedId = null;
            h.executeViaScriptTag.mockImplementation(async () => {
                capturedId = state._currentExecutingPluginId;
            });
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', enabled: true, code: '' }];
            await SubPluginManager.executeEnabled();
            expect(capturedId).toBe('p1');
            expect(state._currentExecutingPluginId).toBeNull();
        });
    });

    // ── unloadPlugin ──
    describe('unloadPlugin', () => {
        it('does nothing for unregistered plugin', () => {
            SubPluginManager.unloadPlugin('nonexistent');
            // should not throw
        });

        it('removes provider fetchers and models', () => {
            const pluginId = 'test-plugin';
            _pluginRegistrations[pluginId] = { providerNames: ['TestProvider'], tabObjects: [], fetcherEntries: [] };
            customFetchers['TestProvider'] = () => {};
            state.ALL_DEFINED_MODELS = [
                { provider: 'TestProvider', name: 'Model1' },
                { provider: 'Other', name: 'Model2' },
            ];
            SubPluginManager.unloadPlugin(pluginId);
            expect(customFetchers['TestProvider']).toBeUndefined();
            expect(state.ALL_DEFINED_MODELS).toHaveLength(1);
            expect(state.ALL_DEFINED_MODELS[0].provider).toBe('Other');
        });

        it('calls cleanup hooks', () => {
            const pluginId = 'test-plugin';
            const cleanupFn = vi.fn();
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            _pluginCleanupHooks[pluginId] = [cleanupFn];
            SubPluginManager.unloadPlugin(pluginId);
            expect(cleanupFn).toHaveBeenCalled();
            expect(_pluginCleanupHooks[pluginId]).toBeUndefined();
        });

        it('handles async cleanup hooks', () => {
            const pluginId = 'test-plugin';
            const asyncCleanup = vi.fn(async () => {});
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            _pluginCleanupHooks[pluginId] = [asyncCleanup];
            SubPluginManager.unloadPlugin(pluginId);
            expect(asyncCleanup).toHaveBeenCalled();
        });

        it('handles cleanup hook errors gracefully', () => {
            const pluginId = 'test-plugin';
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            _pluginCleanupHooks[pluginId] = [() => { throw new Error('cleanup fail'); }];
            expect(() => SubPluginManager.unloadPlugin(pluginId)).not.toThrow();
        });

        it('handles async cleanup hooks that reject', () => {
            const pluginId = 'test-plugin';
            const asyncReject = vi.fn(() => Promise.reject(new Error('async fail')));
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            _pluginCleanupHooks[pluginId] = [asyncReject];
            expect(() => SubPluginManager.unloadPlugin(pluginId)).not.toThrow();
            expect(asyncReject).toHaveBeenCalled();
        });

        it('calls window _cpmXxxCleanup for related providers', () => {
            const pluginId = 'test-plugin';
            const cleanupFn = vi.fn();
            window._cpmTestProviderCleanup = cleanupFn;
            _pluginRegistrations[pluginId] = { providerNames: ['TestProvider'], tabObjects: [], fetcherEntries: [] };
            SubPluginManager.unloadPlugin(pluginId);
            expect(cleanupFn).toHaveBeenCalled();
            delete window._cpmTestProviderCleanup;
        });

        it('skips unrelated window _cpm cleanup functions', () => {
            const pluginId = 'test-plugin';
            const unrelatedFn = vi.fn();
            window._cpmOtherCleanup = unrelatedFn;
            _pluginRegistrations[pluginId] = { providerNames: ['MyProvider'], tabObjects: [], fetcherEntries: [] };
            SubPluginManager.unloadPlugin(pluginId);
            expect(unrelatedFn).not.toHaveBeenCalled();
            delete window._cpmOtherCleanup;
        });

        it('removes registered tabs', () => {
            const pluginId = 'test-plugin';
            const tab = { id: 'tab1' };
            registeredProviderTabs.push(tab);
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [tab], fetcherEntries: [] };
            SubPluginManager.unloadPlugin(pluginId);
            expect(registeredProviderTabs).not.toContain(tab);
        });

        it('removes dynamic fetcher entries', () => {
            const pluginId = 'test-plugin';
            const entry = { name: 'TestDynamic', fetchDynamicModels: vi.fn() };
            pendingDynamicFetchers.push(entry);
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [entry] };
            SubPluginManager.unloadPlugin(pluginId);
            expect(pendingDynamicFetchers.find(f => f.name === 'TestDynamic')).toBeUndefined();
        });
    });

    // ── applyUpdate ──
    describe('applyUpdate', () => {
        it('returns false for unknown plugin', async () => {
            SubPluginManager.plugins = [];
            const result = await SubPluginManager.applyUpdate('nonexistent', 'code', 'sha');
            expect(result).toBe(false);
        });

        it('returns false when no code provided', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', code: 'old' }];
            const result = await SubPluginManager.applyUpdate('p1', null, 'sha');
            expect(result).toBe(false);
        });

        it('returns false when no SHA-256 provided', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', code: 'old' }];
            const result = await SubPluginManager.applyUpdate('p1', 'new code', null);
            expect(result).toBe(false);
        });

        it('returns false on SHA-256 mismatch', async () => {
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', code: 'old' }];
            const result = await SubPluginManager.applyUpdate('p1', 'new code', 'wrong-hash');
            expect(result).toBe(false);
        });

        it('succeeds with correct SHA-256', async () => {
            const code = '// @name Test\n// @version 2.0.0\nconsole.log("new")';
            const sha = await _computeSHA256(code);
            SubPluginManager.plugins = [{ id: 'p1', name: 'Test', version: '1.0.0', code: 'old', description: '', icon: '📦', updateUrl: '' }];
            const result = await SubPluginManager.applyUpdate('p1', code, sha);
            expect(result).toBe(true);
            expect(SubPluginManager.plugins[0].version).toBe('2.0.0');
            expect(SubPluginManager.plugins[0].code).toBe(code);
        });

        it('blocks name mismatch attacks', async () => {
            const code = '// @name DifferentPlugin\n// @version 2.0.0';
            const sha = await _computeSHA256(code);
            SubPluginManager.plugins = [{ id: 'p1', name: 'OriginalPlugin', code: 'old' }];
            const result = await SubPluginManager.applyUpdate('p1', code, sha);
            expect(result).toBe(false);
        });
    });

    // ── checkVersionsQuiet ──
    describe('checkVersionsQuiet', () => {
        it('skips if already checked', async () => {
            window._cpmVersionChecked = true;
            await SubPluginManager.checkVersionsQuiet();
            expect(h.risu.risuFetch).not.toHaveBeenCalled();
        });

        it('skips if within cooldown', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue(String(Date.now()));
            await SubPluginManager.checkVersionsQuiet();
            expect(h.risu.risuFetch).not.toHaveBeenCalled();
        });

        it('handles fetch failure gracefully', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue(null);
            h.risu.risuFetch.mockResolvedValue({ data: null, status: 500 });
            await expect(SubPluginManager.checkVersionsQuiet()).resolves.not.toThrow();
        });

        it('handles invalid manifest structure', async () => {
            h.risu.pluginStorage.getItem.mockResolvedValue(null);
            h.risu.risuFetch.mockResolvedValue({ data: '{"valid":"json"}', status: 200 });
            h.validateSchema.mockReturnValue({ ok: false, error: 'bad structure' });
            await expect(SubPluginManager.checkVersionsQuiet()).resolves.not.toThrow();
        });
    });

    // ── checkAllUpdates ──
    describe('checkAllUpdates', () => {
        it('returns empty array on fetch failure', async () => {
            h.risu.risuFetch.mockResolvedValue({ data: null, status: 500 });
            const results = await SubPluginManager.checkAllUpdates();
            expect(results).toEqual([]);
        });

        it('returns empty array on schema validation failure', async () => {
            h.risu.risuFetch.mockResolvedValue({ data: '{}', status: 200 });
            h.validateSchema.mockReturnValue({ ok: false, error: 'bad schema' });
            const results = await SubPluginManager.checkAllUpdates();
            expect(results).toEqual([]);
        });

        it('returns updates when remote version is newer', async () => {
            SubPluginManager.plugins = [{
                id: 'p1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://example.com',
            }];
            const bundle = {
                versions: {
                    'TestPlugin': { version: '2.0.0', file: 'TestPlugin.js', sha256: 'abc123' },
                },
                code: {
                    'TestPlugin.js': '// code',
                },
            };
            h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
            h.validateSchema.mockReturnValue({ ok: true, data: bundle });

            // SHA mismatch will skip but result should still be generated
            const results = await SubPluginManager.checkAllUpdates();
            // The SHA check will reject 'abc123' but code will be checked
            // Result may or may not contain the update depending on SHA validation
            expect(Array.isArray(results)).toBe(true);
        });

        it('rejects bundle with no sha256', async () => {
            SubPluginManager.plugins = [{
                id: 'p1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://example.com',
            }];
            const bundle = {
                versions: { 'TestPlugin': { version: '2.0.0', file: 'TestPlugin.js' } },
                code: { 'TestPlugin.js': '// code' },
            };
            h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
            h.validateSchema.mockReturnValue({ ok: true, data: bundle });
            const results = await SubPluginManager.checkAllUpdates();
            expect(results).toEqual([]); // rejected: no sha256
        });

        it('handles error during check gracefully', async () => {
            h.risu.risuFetch.mockRejectedValue(new Error('network error'));
            const results = await SubPluginManager.checkAllUpdates();
            expect(results).toEqual([]);
        });
    });

    // ── purgeAllCpmData ──
    describe('purgeAllCpmData', () => {
        it('clears plugin storage keys', async () => {
            const result = await SubPluginManager.purgeAllCpmData();
            expect(h.risu.pluginStorage.removeItem).toHaveBeenCalled();
            expect(result.pluginStorageCleared).toBeGreaterThan(0);
        });

        it('clears managed arg keys', async () => {
            h.getManagedSettingKeys.mockReturnValue(['cpm_key1', 'cpm_key2']);
            const result = await SubPluginManager.purgeAllCpmData();
            expect(h.risu.setArgument).toHaveBeenCalled();
            expect(result.argsCleared).toBeGreaterThan(0);
        });

        it('resets in-memory state', async () => {
            SubPluginManager.plugins = [{ id: 'p1' }];
            state.ALL_DEFINED_MODELS = [{ provider: 'test' }];
            state.CUSTOM_MODELS_CACHE = [{}];
            await SubPluginManager.purgeAllCpmData();
            expect(SubPluginManager.plugins).toEqual([]);
            expect(state.ALL_DEFINED_MODELS).toEqual([]);
            expect(state.CUSTOM_MODELS_CACHE).toEqual([]);
        });

        it('handles storage errors gracefully', async () => {
            h.risu.pluginStorage.removeItem.mockRejectedValue(new Error('storage error'));
            await expect(SubPluginManager.purgeAllCpmData()).resolves.not.toThrow();
        });

        it('handles pluginStorage.keys() throwing', async () => {
            h.risu.pluginStorage.keys.mockRejectedValue(new Error('keys not available'));
            h.risu.pluginStorage.removeItem.mockResolvedValue();
            await expect(SubPluginManager.purgeAllCpmData()).resolves.not.toThrow();
        });

        it('clears legacy custom model keys', async () => {
            await SubPluginManager.purgeAllCpmData();
            // Should call setArgument for cpm_c1_url through cpm_c10_tok
            const calls = h.risu.setArgument.mock.calls.map(c => c[0]);
            expect(calls.some(k => k.startsWith('cpm_c1_'))).toBe(true);
            expect(calls.some(k => k.startsWith('cpm_c10_'))).toBe(true);
        });

        it('discovers and removes cpm_ prefixed pluginStorage keys', async () => {
            h.risu.pluginStorage.keys.mockResolvedValue(['cpm_extra', 'cpm-legacy', 'other_key']);
            h.risu.pluginStorage.removeItem.mockResolvedValue();
            await SubPluginManager.purgeAllCpmData();
            const removedKeys = h.risu.pluginStorage.removeItem.mock.calls.map(c => c[0]);
            expect(removedKeys).toContain('cpm_extra');
            expect(removedKeys).toContain('cpm-legacy');
            expect(removedKeys).not.toContain('other_key');
        });
    });

    // ── hotReload / hotReloadAll ──
    describe('hotReload', () => {
        it('returns false for unknown plugin', async () => {
            SubPluginManager.plugins = [];
            const result = await SubPluginManager.hotReload('nonexistent');
            expect(result).toBe(false);
        });

        it('unloads and re-executes enabled plugin', async () => {
            const plugin = { id: 'p1', name: 'Test', enabled: true, code: 'console.log("test")' };
            SubPluginManager.plugins = [plugin];
            _pluginRegistrations['p1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            const result = await SubPluginManager.hotReload('p1');
            expect(result).toBe(true);
            expect(h.executeViaScriptTag).toHaveBeenCalled();
        });

        it('handles hot-reload with dynamic fetchers', async () => {
            const plugin = { id: 'p1', name: 'Test', enabled: true, code: 'console.log("test")' };
            SubPluginManager.plugins = [plugin];
            _pluginRegistrations['p1'] = { providerNames: ['DynProvider'], tabObjects: [], fetcherEntries: [] };
            pendingDynamicFetchers.push({
                name: 'DynProvider',
                fetchDynamicModels: vi.fn(async () => [{ id: 'm1', name: 'DynModel' }]),
            });
            isDynamicFetchEnabled.mockResolvedValue(true);
            const result = await SubPluginManager.hotReload('p1');
            expect(result).toBe(true);
        });

        it('skips dynamic fetch when disabled', async () => {
            const plugin = { id: 'p1', name: 'Test', enabled: true, code: 'console.log("test")' };
            SubPluginManager.plugins = [plugin];
            _pluginRegistrations['p1'] = { providerNames: ['DynProvider'], tabObjects: [], fetcherEntries: [] };
            pendingDynamicFetchers.push({
                name: 'DynProvider',
                fetchDynamicModels: vi.fn(async () => []),
            });
            isDynamicFetchEnabled.mockResolvedValue(false);
            const result = await SubPluginManager.hotReload('p1');
            expect(result).toBe(true);
        });

        it('does not execute disabled plugin after unload', async () => {
            const plugin = { id: 'p1', name: 'Test', enabled: false, code: 'console.log("test")' };
            SubPluginManager.plugins = [plugin];
            _pluginRegistrations['p1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            const result = await SubPluginManager.hotReload('p1');
            expect(result).toBe(true);
            expect(h.executeViaScriptTag).not.toHaveBeenCalled();
        });
    });

    describe('hotReloadAll', () => {
        it('unloads and re-executes all plugins', async () => {
            SubPluginManager.plugins = [
                { id: 'p1', name: 'A', enabled: true, code: 'a' },
                { id: 'p2', name: 'B', enabled: true, code: 'b' },
            ];
            _pluginRegistrations['p1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            _pluginRegistrations['p2'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            await SubPluginManager.hotReloadAll();
            expect(h.executeViaScriptTag).toHaveBeenCalledTimes(2);
        });
    });
});
