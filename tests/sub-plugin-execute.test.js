/**
 * sub-plugin-execute.test.js — Tests for SubPluginManager execution & lifecycle:
 *   - executeEnabled (loads all enabled sub-plugins via script tag)
 *   - executeOne (single plugin execution)
 *   - unloadPlugin (cleanup hooks, window globals, registrations)
 *   - hotReload / hotReloadAll (unload + re-execute)
 *   - purgeAllCpmData (full data wipe)
 *
 * Complements sub-plugin-manager.test.js (metadata), sub-plugin-lifecycle.test.js
 * (CRUD, registry load), and sub-plugin-integrity.test.js (SHA-256).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Ensure `window` is available in Node test environment ──
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

const {
    mockPluginStorage, mockRisuFetch, mockExecuteViaScriptTag,
    mockState, mockPluginRegistrations, mockPluginCleanupHooks,
    mockCustomFetchers, mockRegisteredProviderTabs, mockPendingDynamicFetchers,
    mockIsDynamicFetchEnabled,
} = vi.hoisted(() => ({
    mockPluginStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        keys: vi.fn(),
    },
    mockRisuFetch: vi.fn(),
    mockExecuteViaScriptTag: vi.fn(),
    mockState: {
        _currentExecutingPluginId: null,
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
    },
    mockPluginRegistrations: {},
    mockPluginCleanupHooks: {},
    mockCustomFetchers: {},
    mockRegisteredProviderTabs: [],
    mockPendingDynamicFetchers: [],
    mockIsDynamicFetchEnabled: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        risuFetch: (...a) => mockRisuFetch(...a),
        getRootDocument: vi.fn().mockResolvedValue(null),
        addProvider: vi.fn(),
        setArgument: vi.fn(),
    },
    CPM_VERSION: '1.19.6',
    state: mockState,
    customFetchers: mockCustomFetchers,
    registeredProviderTabs: mockRegisteredProviderTabs,
    pendingDynamicFetchers: mockPendingDynamicFetchers,
    _pluginRegistrations: mockPluginRegistrations,
    _pluginCleanupHooks: mockPluginCleanupHooks,
    isDynamicFetchEnabled: (...a) => mockIsDynamicFetchEnabled(...a),
    getManagedSettingKeys: vi.fn(() => ['cpm_key1', 'cpm_key2']),
}));

vi.mock('../src/lib/csp-exec.js', () => ({
    _executeViaScriptTag: (...a) => mockExecuteViaScriptTag(...a),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    getManagedSettingKeys: vi.fn(() => ['cpm_key1', 'cpm_key2']),
    SettingsBackup: { updateKey: vi.fn() },
}));

import { SubPluginManager, setExposeScopeFunction } from '../src/lib/sub-plugin-manager.js';

// ════════════════════════════════════════════════════════════════
// A. executeEnabled
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — executeEnabled', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteViaScriptTag.mockResolvedValue(undefined);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        setExposeScopeFunction(() => {});
        SubPluginManager.plugins = [];
        mockState._currentExecutingPluginId = null;
    });

    it('executes all enabled plugins', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'A', code: 'console.log("a")', enabled: true },
            { id: 'sp_2', name: 'B', code: 'console.log("b")', enabled: true },
        ];

        await SubPluginManager.executeEnabled();

        expect(mockExecuteViaScriptTag).toHaveBeenCalledTimes(2);
        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('console.log("a")', 'A');
        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('console.log("b")', 'B');
    });

    it('skips disabled plugins', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'A', code: 'a', enabled: true },
            { id: 'sp_2', name: 'B', code: 'b', enabled: false },
            { id: 'sp_3', name: 'C', code: 'c', enabled: true },
        ];

        await SubPluginManager.executeEnabled();

        expect(mockExecuteViaScriptTag).toHaveBeenCalledTimes(2);
        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('a', 'A');
        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('c', 'C');
    });

    it('continues executing after individual plugin failure', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'Failing', code: 'fail', enabled: true },
            { id: 'sp_2', name: 'Success', code: 'ok', enabled: true },
        ];
        mockExecuteViaScriptTag
            .mockRejectedValueOnce(new Error('script error'))
            .mockResolvedValueOnce(undefined);

        await SubPluginManager.executeEnabled();

        expect(mockExecuteViaScriptTag).toHaveBeenCalledTimes(2);
    });

    it('resets _currentExecutingPluginId after each plugin', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'A', code: 'a', enabled: true },
        ];

        await SubPluginManager.executeEnabled();

        expect(mockState._currentExecutingPluginId).toBeNull();
    });

    it('handles empty plugins array gracefully', async () => {
        SubPluginManager.plugins = [];
        await SubPluginManager.executeEnabled();
        expect(mockExecuteViaScriptTag).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// B. executeOne
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — executeOne', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteViaScriptTag.mockResolvedValue(undefined);
        setExposeScopeFunction(() => {});
        mockState._currentExecutingPluginId = null;
    });

    it('executes a single enabled plugin', async () => {
        const plugin = { id: 'sp_1', name: 'Alpha', code: 'hello', enabled: true };
        await SubPluginManager.executeOne(plugin);

        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('hello', 'Alpha');
        expect(mockState._currentExecutingPluginId).toBeNull();
    });

    it('does not execute disabled plugin', async () => {
        const plugin = { id: 'sp_1', name: 'Alpha', code: 'hello', enabled: false };
        await SubPluginManager.executeOne(plugin);
        expect(mockExecuteViaScriptTag).not.toHaveBeenCalled();
    });

    it('does not execute null/undefined plugin', async () => {
        await SubPluginManager.executeOne(null);
        await SubPluginManager.executeOne(undefined);
        expect(mockExecuteViaScriptTag).not.toHaveBeenCalled();
    });

    it('swallows executeOne script errors and resets current plugin id', async () => {
        mockExecuteViaScriptTag.mockRejectedValueOnce(new Error('hot-load failed'));

        await expect(SubPluginManager.executeOne({ id: 'sp_1', name: 'Broken', code: 'boom', enabled: true })).resolves.toBeUndefined();

        expect(mockState._currentExecutingPluginId).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════
// C. unloadPlugin
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — unloadPlugin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clean up any registrations
        for (const key of Object.keys(mockPluginRegistrations)) delete mockPluginRegistrations[key];
        for (const key of Object.keys(mockPluginCleanupHooks)) delete mockPluginCleanupHooks[key];
        for (const key of Object.keys(mockCustomFetchers)) delete mockCustomFetchers[key];
        mockRegisteredProviderTabs.length = 0;
        mockPendingDynamicFetchers.length = 0;
        mockState.ALL_DEFINED_MODELS = [];
    });

    it('does nothing for unregistered plugin id', () => {
        expect(() => SubPluginManager.unloadPlugin('sp_nonexistent')).not.toThrow();
    });

    it('removes provider names from customFetchers and ALL_DEFINED_MODELS', () => {
        mockPluginRegistrations['sp_1'] = {
            providerNames: ['MyProvider'],
            tabObjects: [],
            fetcherEntries: [],
        };
        mockCustomFetchers['MyProvider'] = () => {};
        mockState.ALL_DEFINED_MODELS = [
            { provider: 'MyProvider', name: 'Model A' },
            { provider: 'OtherProvider', name: 'Model B' },
        ];

        SubPluginManager.unloadPlugin('sp_1');

        expect(mockCustomFetchers['MyProvider']).toBeUndefined();
        expect(mockState.ALL_DEFINED_MODELS).toHaveLength(1);
        expect(mockState.ALL_DEFINED_MODELS[0].provider).toBe('OtherProvider');
    });

    it('removes tab objects from registeredProviderTabs', () => {
        const tab1 = { id: 'tab-1' };
        const tab2 = { id: 'tab-2' };
        mockRegisteredProviderTabs.push(tab1, tab2);
        mockPluginRegistrations['sp_1'] = {
            providerNames: [],
            tabObjects: [tab1],
            fetcherEntries: [],
        };

        SubPluginManager.unloadPlugin('sp_1');

        expect(mockRegisteredProviderTabs).toHaveLength(1);
        expect(mockRegisteredProviderTabs[0]).toBe(tab2);
    });

    it('calls and removes cleanup hooks', () => {
        const cleanupFn = vi.fn();
        mockPluginCleanupHooks['sp_1'] = [cleanupFn];
        mockPluginRegistrations['sp_1'] = {
            providerNames: [],
            tabObjects: [],
            fetcherEntries: [],
        };

        SubPluginManager.unloadPlugin('sp_1');

        expect(cleanupFn).toHaveBeenCalledOnce();
        expect(mockPluginCleanupHooks['sp_1']).toBeUndefined();
    });

    it('gracefully handles cleanup hook throwing', () => {
        const badHook = vi.fn(() => { throw new Error('cleanup boom'); });
        const goodHook = vi.fn();
        mockPluginCleanupHooks['sp_1'] = [badHook, goodHook];
        mockPluginRegistrations['sp_1'] = {
            providerNames: [],
            tabObjects: [],
            fetcherEntries: [],
        };

        expect(() => SubPluginManager.unloadPlugin('sp_1')).not.toThrow();
        expect(badHook).toHaveBeenCalled();
    });

    it('removes fetcher entries from pendingDynamicFetchers', () => {
        mockPendingDynamicFetchers.push(
            { name: 'MyProvider', fetchDynamicModels: vi.fn() },
            { name: 'Other', fetchDynamicModels: vi.fn() },
        );
        mockPluginRegistrations['sp_1'] = {
            providerNames: [],
            tabObjects: [],
            fetcherEntries: [{ name: 'MyProvider' }],
        };

        SubPluginManager.unloadPlugin('sp_1');

        expect(mockPendingDynamicFetchers).toHaveLength(1);
        expect(mockPendingDynamicFetchers[0].name).toBe('Other');
    });
});

// ════════════════════════════════════════════════════════════════
// D. hotReload
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — hotReload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteViaScriptTag.mockResolvedValue(undefined);
        setExposeScopeFunction(() => {});
        SubPluginManager.plugins = [];
        for (const key of Object.keys(mockPluginRegistrations)) delete mockPluginRegistrations[key];
        for (const key of Object.keys(mockPluginCleanupHooks)) delete mockPluginCleanupHooks[key];
        mockPendingDynamicFetchers.length = 0;
    });

    it('returns false for non-existent plugin', async () => {
        const ok = await SubPluginManager.hotReload('sp_nonexistent');
        expect(ok).toBe(false);
    });

    it('unloads and re-executes enabled plugin', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'Alpha', code: 'hello', enabled: true },
        ];
        mockPluginRegistrations['sp_1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };

        const ok = await SubPluginManager.hotReload('sp_1');

        expect(ok).toBe(true);
        expect(mockExecuteViaScriptTag).toHaveBeenCalledWith('hello', 'Alpha');
    });

    it('unloads but skips re-execution for disabled plugin', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'Alpha', code: 'hello', enabled: false },
        ];
        mockPluginRegistrations['sp_1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };

        const ok = await SubPluginManager.hotReload('sp_1');

        expect(ok).toBe(true);
        expect(mockExecuteViaScriptTag).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// E. hotReloadAll
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — hotReloadAll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteViaScriptTag.mockResolvedValue(undefined);
        setExposeScopeFunction(() => {});
        for (const key of Object.keys(mockPluginRegistrations)) delete mockPluginRegistrations[key];
        for (const key of Object.keys(mockPluginCleanupHooks)) delete mockPluginCleanupHooks[key];
        mockPendingDynamicFetchers.length = 0;
    });

    it('reloads all plugins', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'A', code: 'a', enabled: true },
            { id: 'sp_2', name: 'B', code: 'b', enabled: true },
        ];
        mockPluginRegistrations['sp_1'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
        mockPluginRegistrations['sp_2'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };

        await SubPluginManager.hotReloadAll();

        expect(mockExecuteViaScriptTag).toHaveBeenCalledTimes(2);
    });

    it('fetches dynamic models for pending fetchers after reload', async () => {
        SubPluginManager.plugins = [];
        const fetchDyn = vi.fn().mockResolvedValue([
            { id: 'dyn-1', name: 'Dynamic', provider: 'DynProvider' },
        ]);
        mockPendingDynamicFetchers.push({ name: 'DynProvider', fetchDynamicModels: fetchDyn });
        mockIsDynamicFetchEnabled.mockResolvedValue(true);
        mockState.ALL_DEFINED_MODELS = [];

        await SubPluginManager.hotReloadAll();

        expect(fetchDyn).toHaveBeenCalled();
        expect(mockState.ALL_DEFINED_MODELS).toHaveLength(1);
        expect(mockState.ALL_DEFINED_MODELS[0].name).toBe('Dynamic');
    });

    it('skips hotReloadAll dynamic fetchers when disabled', async () => {
        const fetchDyn = vi.fn().mockResolvedValue([{ id: 'dyn-1', name: 'Dynamic', provider: 'DynProvider' }]);
        mockPendingDynamicFetchers.push({ name: 'DynProvider', fetchDynamicModels: fetchDyn });
        mockIsDynamicFetchEnabled.mockResolvedValue(false);

        await SubPluginManager.hotReloadAll();

        expect(fetchDyn).not.toHaveBeenCalled();
    });

    it('continues hotReloadAll when dynamic fetch throws', async () => {
        const fetchDyn = vi.fn().mockRejectedValue(new Error('dynamic boom'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockPendingDynamicFetchers.push({ name: 'DynProvider', fetchDynamicModels: fetchDyn });
        mockIsDynamicFetchEnabled.mockResolvedValue(true);

        await expect(SubPluginManager.hotReloadAll()).resolves.toBeUndefined();

        expect(fetchDyn).toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

// ════════════════════════════════════════════════════════════════
// F. purgeAllCpmData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — purgeAllCpmData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockPluginStorage.keys.mockResolvedValue([]);
        SubPluginManager.plugins = [{ id: 'sp_1', name: 'A', code: 'a', enabled: true }];
        mockState.ALL_DEFINED_MODELS = [{ provider: 'X', name: 'M' }];
        mockState.CUSTOM_MODELS_CACHE = [{ uniqueId: 'c1' }];
    });

    it('clears all known pluginStorage keys', async () => {
        const _result = await SubPluginManager.purgeAllCpmData();

        expect(_result.pluginStorageCleared).toBeGreaterThanOrEqual(SubPluginManager._PLUGIN_STORAGE_KEYS.length);
        for (const key of SubPluginManager._PLUGIN_STORAGE_KEYS) {
            expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(key);
        }
    });

    it('clears in-memory state including vertex token cache', async () => {
        mockState.vertexTokenCache = { token: 'ya29.secret-token', expiry: Date.now() + 3600000 };

        await SubPluginManager.purgeAllCpmData();

        expect(SubPluginManager.plugins).toEqual([]);
        expect(mockState.ALL_DEFINED_MODELS).toEqual([]);
        expect(mockState.CUSTOM_MODELS_CACHE).toEqual([]);
        expect(mockState.vertexTokenCache).toEqual({ token: null, expiry: 0 });
    });

    it('clears CPM window globals while leaving non-CPM globals', async () => {
        // Simulate CPM globals
        globalThis._cpmCopilotApiToken = 'secret-bearer-token';
        globalThis._cpmCopilotMachineId = 'abc123';
        globalThis._cpmCopilotSessionId = 'sess-456';
        globalThis._cpmResizerCleanup = () => {};
        globalThis._cpmTransCache = {};
        globalThis.CupcakePM = { version: '1.19.6' };
        globalThis.CPM_VERSION = '1.19.6';
        globalThis.cpmShortcutRegistered = true;
        // Non-CPM global that must survive
        globalThis._myOtherPlugin = 'should-survive';

        await SubPluginManager.purgeAllCpmData();

        expect(globalThis._cpmCopilotApiToken).toBeUndefined();
        expect(globalThis._cpmCopilotMachineId).toBeUndefined();
        expect(globalThis._cpmCopilotSessionId).toBeUndefined();
        expect(globalThis._cpmResizerCleanup).toBeUndefined();
        expect(globalThis._cpmTransCache).toBeUndefined();
        expect(globalThis.CupcakePM).toBeUndefined();
        expect(globalThis.CPM_VERSION).toBeUndefined();
        expect(globalThis.cpmShortcutRegistered).toBeUndefined();
        // Non-CPM global must survive
        expect(globalThis._myOtherPlugin).toBe('should-survive');

        // Cleanup test global
        delete globalThis._myOtherPlugin;
    });

    it('removes dynamically discovered cpm_ keys from storage', async () => {
        mockPluginStorage.keys.mockResolvedValue(['cpm_extra_key', 'other_key', 'cpm-data']);

        const _result = await SubPluginManager.purgeAllCpmData();

        // cpm_extra_key and cpm-data should be removed (cpm_ and cpm- prefix)
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith('cpm_extra_key');
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith('cpm-data');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('other_key');
    });

    it('handles pluginStorage.keys() throwing', async () => {
        mockPluginStorage.keys.mockRejectedValue(new Error('unsupported'));

        // Should not throw
        const result = await SubPluginManager.purgeAllCpmData();
        expect(result.pluginStorageCleared).toBeGreaterThanOrEqual(SubPluginManager._PLUGIN_STORAGE_KEYS.length);
    });

    it('returns count of cleared args', async () => {
        const result = await SubPluginManager.purgeAllCpmData();

        // Managed setting keys ('cpm_key1', 'cpm_key2') + legacy C1-C10 fields
        expect(result.argsCleared).toBeGreaterThanOrEqual(2);
    });

    it('does not touch pluginStorage keys without cpm prefix', async () => {
        mockPluginStorage.keys.mockResolvedValue([
            'cpm_extra', 'cpm-extra', 'other_plugin_key',
            'assets_index', 'dataset_cache', 'user_settings',
            'chat_history_v2', 'translation_db',
        ]);

        await SubPluginManager.purgeAllCpmData();

        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith('cpm_extra');
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith('cpm-extra');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('other_plugin_key');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('assets_index');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('dataset_cache');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('user_settings');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('chat_history_v2');
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith('translation_db');
    });
});
