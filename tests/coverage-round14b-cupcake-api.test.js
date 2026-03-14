/**
 * Round 14b: cupcake-api.js branch coverage tests.
 * Separated to avoid vi.mock contamination from other test sections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('cupcake-api.js branches — Round 14b', () => {
    /** @type {any} */
    let CupcakePM;
    let sharedState;
    const origWindow = globalThis.window;

    beforeEach(async () => {
        vi.resetModules();
        delete globalThis.CupcakePM;
        // cupcake-api.js references `window`
        if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
        // Risu is resolved as window.risuai || window.Risuai in shared-state.js
        globalThis.risuai = {
            setArgument: vi.fn(),
            getArgument: vi.fn().mockReturnValue(''),
        };
        sharedState = await import('../src/lib/shared-state.js');
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        setupCupcakeAPI();
        CupcakePM = globalThis.CupcakePM;
    });

    afterEach(() => {
        if (origWindow === undefined) delete globalThis.window;
    });

    it('registerProvider creates plugin registration when executing plugin', () => {
        sharedState.state._currentExecutingPluginId = 'plugin-test-1';

        CupcakePM.registerProvider({
            name: 'TestProvider',
            models: [{ name: 'Test Model', uniqueId: 'test-1' }],
            fetcher: vi.fn(),
        });

        expect(sharedState._pluginRegistrations['plugin-test-1']).toBeDefined();
        expect(sharedState._pluginRegistrations['plugin-test-1'].providerNames).toContain('TestProvider');

        // Cleanup
        delete sharedState.customFetchers['TestProvider'];
        sharedState.state.ALL_DEFINED_MODELS = [];
        sharedState.state._currentExecutingPluginId = '';
        delete sharedState._pluginRegistrations['plugin-test-1'];
    });

    it('registerProvider with dynamic fetcher records fetcherEntry', () => {
        sharedState.state._currentExecutingPluginId = 'plugin-dyn';
        sharedState._pluginRegistrations['plugin-dyn'] = { providerNames: [], tabObjects: [], fetcherEntries: [] };

        CupcakePM.registerProvider({
            name: 'DynProvider',
            models: [],
            fetcher: vi.fn(),
            fetchDynamicModels: vi.fn().mockResolvedValue([]),
        });

        expect(sharedState._pluginRegistrations['plugin-dyn'].fetcherEntries.length).toBeGreaterThan(0);

        delete sharedState.customFetchers['DynProvider'];
        sharedState.state._currentExecutingPluginId = '';
        delete sharedState._pluginRegistrations['plugin-dyn'];
    });

    it('registerProvider with settingsTab tracks tab in registration', () => {
        sharedState.state._currentExecutingPluginId = 'plugin-tab';

        CupcakePM.registerProvider({
            name: 'TabProvider',
            models: [],
            fetcher: vi.fn(),
            settingsTab: { providerName: 'TabProvider', label: 'Settings' },
        });

        const reg = sharedState._pluginRegistrations['plugin-tab'];
        expect(reg.tabObjects.length).toBe(1);

        delete sharedState.customFetchers['TabProvider'];
        sharedState.state._currentExecutingPluginId = '';
        delete sharedState._pluginRegistrations['plugin-tab'];
    });

    it('registerProvider removes existing tab/fetcher for same name (duplicate guard)', () => {
        // First registration
        CupcakePM.registerProvider({
            name: 'DupProvider',
            models: [{ name: 'M1', uniqueId: 'dup-1' }],
            fetcher: vi.fn(),
            settingsTab: { providerName: 'DupProvider', label: 'First' },
            fetchDynamicModels: vi.fn(),
        });
        // Second registration with same name → should splice existing
        CupcakePM.registerProvider({
            name: 'DupProvider',
            models: [{ name: 'M2', uniqueId: 'dup-2' }],
            fetcher: vi.fn(),
            settingsTab: { providerName: 'DupProvider', label: 'Second' },
            fetchDynamicModels: vi.fn(),
        });

        // Should have only models from second registration
        const dupModels = sharedState.state.ALL_DEFINED_MODELS.filter(m => m.provider === 'DupProvider');
        expect(dupModels.length).toBe(1);
        expect(dupModels[0].name).toBe('M2');

        // Only one tab for DupProvider
        const dupTabs = sharedState.registeredProviderTabs.filter(t => t?.providerName === 'DupProvider');
        expect(dupTabs.length).toBe(1);

        // Only one dynamic fetcher
        const dupFetchers = sharedState.pendingDynamicFetchers.filter(f => f.name === 'DupProvider');
        expect(dupFetchers.length).toBe(1);

        delete sharedState.customFetchers['DupProvider'];
    });

    it('registerCleanup registers hook for current plugin', () => {
        sharedState.state._currentExecutingPluginId = 'plugin-cleanup';
        const cleanup = vi.fn();
        CupcakePM.registerCleanup(cleanup);

        expect(sharedState._pluginCleanupHooks['plugin-cleanup']).toBeDefined();
        expect(sharedState._pluginCleanupHooks['plugin-cleanup']).toContain(cleanup);

        sharedState.state._currentExecutingPluginId = '';
        delete sharedState._pluginCleanupHooks['plugin-cleanup'];
    });

    it('registerCleanup warns when called outside plugin context', () => {
        sharedState.state._currentExecutingPluginId = '';
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        CupcakePM.registerCleanup(() => {});
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('outside'));
        spy.mockRestore();
    });

    it('registerCleanup ignores non-function argument', () => {
        sharedState.state._currentExecutingPluginId = 'plugin-noop';
        CupcakePM.registerCleanup('not_a_function');
        expect(sharedState._pluginCleanupHooks['plugin-noop']).toBeUndefined();
        sharedState.state._currentExecutingPluginId = '';
    });

    it('addCustomModel adds and returns uniqueId', () => {
        const result = CupcakePM.addCustomModel({ name: 'Custom Test', url: 'https://test.com' });
        expect(result.success).toBe(true);
        expect(result.uniqueId).toBeTruthy();
        expect(result.created).toBe(true);
    });

    it('addCustomModel with tag updates existing model', () => {
        sharedState.state.CUSTOM_MODELS_CACHE.push({ name: 'Old', uniqueId: 'old-1', _tag: 'my-tag' });

        const result = CupcakePM.addCustomModel({ name: 'Updated' }, 'my-tag');
        expect(result.success).toBe(true);
        expect(result.created).toBe(false);
        expect(result.uniqueId).toBe('old-1');
    });

    it('addCustomModel with empty tag creates new model', () => {
        const result = CupcakePM.addCustomModel({ name: 'NoTag' }, '');
        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
    });

    it('addCustomModel when Risu.setArgument throws returns error', () => {
        globalThis.risuai.setArgument = vi.fn(() => { throw new Error('Storage full'); });
        const result = CupcakePM.addCustomModel({ name: 'FailModel' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Storage full');
    });

    it('isStreamingAvailable returns enable/capable flags', async () => {
        globalThis.risuai.getArgument = vi.fn().mockResolvedValue('false');
        const result = await CupcakePM.isStreamingAvailable();
        expect(typeof result.enabled).toBe('boolean');
        expect(typeof result.bridgeCapable).toBe('boolean');
        expect(typeof result.active).toBe('boolean');
    });
});
