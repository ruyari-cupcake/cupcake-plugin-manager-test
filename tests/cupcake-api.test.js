import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockRisu,
    mockState,
    mockCustomFetchers,
    mockRegisteredProviderTabs,
    mockPendingDynamicFetchers,
    mockPluginRegistrations,
    mockPluginCleanupHooks,
    mockSafeGetArg,
    mockSafeGetBoolArg,
    mockCheckStreamCapability,
    mockSmartNativeFetch,
    mockEnsureCopilotApiToken,
    mockSubPluginManager,
    mockKeyPool,
    mockSafeUUID,
    mockNormalizeTokenUsage,
    mockThoughtSignatureCache,
    mockNeedsCopilotResponsesAPI,
} = vi.hoisted(() => ({
    mockRisu: { setArgument: vi.fn() },
    mockState: {
        _currentExecutingPluginId: null,
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
    },
    mockCustomFetchers: {},
    mockRegisteredProviderTabs: [],
    mockPendingDynamicFetchers: [],
    mockPluginRegistrations: {},
    mockPluginCleanupHooks: {},
    mockSafeGetArg: vi.fn(),
    mockSafeGetBoolArg: vi.fn(async () => false),
    mockCheckStreamCapability: vi.fn(async () => true),
    mockSmartNativeFetch: vi.fn(async () => new Response('ok', { status: 200 })),
    mockEnsureCopilotApiToken: vi.fn(() => 'token'),
    mockSubPluginManager: {
        hotReload: vi.fn(async () => true),
        hotReloadAll: vi.fn(async () => true),
    },
    mockKeyPool: {
        pick: vi.fn(() => 'key1'),
        drain: vi.fn(() => true),
        remaining: vi.fn(() => 2),
        reset: vi.fn(),
        withRotation: vi.fn(async () => 'rotated'),
        pickJson: vi.fn(() => ({ id: 1 })),
        withJsonRotation: vi.fn(async () => 'json-rotated'),
    },
    mockSafeUUID: vi.fn(() => 'uuid-1'),
    mockNormalizeTokenUsage: vi.fn((v) => ({ normalized: v })),
    mockThoughtSignatureCache: { clear: vi.fn(), get: vi.fn(() => 'sig') },
    mockNeedsCopilotResponsesAPI: vi.fn(() => true),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: mockRisu,
    state: mockState,
    safeGetArg: (...a) => mockSafeGetArg(...a),
    safeGetBoolArg: (...a) => mockSafeGetBoolArg(...a),
    customFetchers: mockCustomFetchers,
    registeredProviderTabs: mockRegisteredProviderTabs,
    pendingDynamicFetchers: mockPendingDynamicFetchers,
    _pluginRegistrations: mockPluginRegistrations,
    _pluginCleanupHooks: mockPluginCleanupHooks,
}));

vi.mock('../src/lib/helpers.js', () => ({ safeUUID: (...a) => mockSafeUUID(...a) }));
vi.mock('../src/lib/format-openai.js', () => ({ formatToOpenAI: vi.fn(() => ({ messages: [] })) }));
vi.mock('../src/lib/format-anthropic.js', () => ({ formatToAnthropic: vi.fn(() => ({ messages: [], system: '' })) }));
vi.mock('../src/lib/format-gemini.js', () => ({
    formatToGemini: vi.fn(() => ({ contents: [] })),
    buildGeminiThinkingConfig: vi.fn(() => ({})),
    getGeminiSafetySettings: vi.fn(() => []),
    validateGeminiParams: vi.fn(() => true),
    isExperimentalGeminiModel: vi.fn(() => false),
    cleanExperimentalModelParams: vi.fn((v) => v),
    ThoughtSignatureCache: mockThoughtSignatureCache,
}));
vi.mock('../src/lib/stream-builders.js', () => ({
    createSSEStream: vi.fn(),
    createOpenAISSEStream: vi.fn(),
    createResponsesAPISSEStream: vi.fn(),
    createAnthropicSSEStream: vi.fn(),
    saveThoughtSignatureFromStream: vi.fn(),
    setApiRequestLogger: vi.fn(),
}));
vi.mock('../src/lib/sse-parsers.js', () => ({ parseOpenAISSELine: vi.fn(), parseGeminiSSELine: vi.fn() }));
vi.mock('../src/lib/response-parsers.js', () => ({
    parseClaudeNonStreamingResponse: vi.fn(),
    parseGeminiNonStreamingResponse: vi.fn(),
    parseOpenAINonStreamingResponse: vi.fn(),
    parseResponsesAPINonStreamingResponse: vi.fn(),
}));
vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: vi.fn(async () => 'stream'),
    checkStreamCapability: (...a) => mockCheckStreamCapability(...a),
}));
vi.mock('../src/lib/token-usage.js', () => ({ _normalizeTokenUsage: (...a) => mockNormalizeTokenUsage(...a) }));
vi.mock('../src/lib/model-helpers.js', () => ({ needsCopilotResponsesAPI: (...a) => mockNeedsCopilotResponsesAPI(...a) }));
vi.mock('../src/lib/key-pool.js', () => ({ KeyPool: mockKeyPool }));
vi.mock('../src/lib/aws-signer.js', () => ({ AwsV4Signer: { sign: vi.fn() } }));
vi.mock('../src/lib/smart-fetch.js', () => ({ smartNativeFetch: (...a) => mockSmartNativeFetch(...a) }));
vi.mock('../src/lib/copilot-token.js', () => ({ ensureCopilotApiToken: (...a) => mockEnsureCopilotApiToken(...a) }));
vi.mock('../src/lib/sub-plugin-manager.js', () => ({ SubPluginManager: mockSubPluginManager }));

import { setupCupcakeAPI } from '../src/lib/cupcake-api.js';

describe('setupCupcakeAPI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.window = {};
        mockState._currentExecutingPluginId = null;
        mockState.ALL_DEFINED_MODELS.length = 0;
        mockState.CUSTOM_MODELS_CACHE.length = 0;
        mockState.vertexTokenCache = { token: null, expiry: 0 };
        Object.keys(mockCustomFetchers).forEach(k => delete mockCustomFetchers[k]);
        mockRegisteredProviderTabs.length = 0;
        mockPendingDynamicFetchers.length = 0;
        Object.keys(mockPluginRegistrations).forEach(k => delete mockPluginRegistrations[k]);
        Object.keys(mockPluginCleanupHooks).forEach(k => delete mockPluginCleanupHooks[k]);
        mockRisu.setArgument.mockResolvedValue(undefined);
        mockSafeGetBoolArg.mockResolvedValue(false);
        mockCheckStreamCapability.mockResolvedValue(true);
    });

    it('initializes window.CupcakePM', () => {
        setupCupcakeAPI();
        expect(window.CupcakePM).toBeDefined();
        expect(typeof window.CupcakePM.registerProvider).toBe('function');
    });

    it('registerProvider stores fetcher, models, tabs and dynamic fetchers', () => {
        setupCupcakeAPI();
        const fetcher = vi.fn();
        const settingsTab = { id: 'tab-1' };
        const fetchDynamicModels = vi.fn();

        window.CupcakePM.registerProvider({
            name: 'Alpha',
            models: [{ id: 'm1', name: 'Model 1' }],
            fetcher,
            settingsTab,
            fetchDynamicModels,
        });

        expect(mockCustomFetchers.Alpha).toBe(fetcher);
        expect(mockState.ALL_DEFINED_MODELS).toEqual([{ id: 'm1', name: 'Model 1', provider: 'Alpha' }]);
        expect(mockRegisteredProviderTabs).toEqual([settingsTab]);
        expect(mockPendingDynamicFetchers).toEqual([{ name: 'Alpha', fetchDynamicModels }]);
    });

    it('registerProvider records plugin-scoped registrations during plugin execution', () => {
        setupCupcakeAPI();
        mockState._currentExecutingPluginId = 'plugin-1';
        const settingsTab = { id: 'tab-1' };
        const fetchDynamicModels = vi.fn();

        window.CupcakePM.registerProvider({ name: 'Alpha', settingsTab, fetchDynamicModels });

        expect(mockPluginRegistrations['plugin-1']).toEqual({
            providerNames: ['Alpha'],
            tabObjects: [settingsTab],
            fetcherEntries: [{ name: 'Alpha', fetchDynamicModels }],
        });
    });

    it('registerProvider deduplicates models, tabs and fetchers on re-registration', () => {
        setupCupcakeAPI();
        const fetcher1 = vi.fn();
        const fetcher2 = vi.fn();
        const tab1 = { id: 'tab-1', providerName: 'Alpha' };
        const tab2 = { id: 'tab-2', providerName: 'Alpha' };
        const dynFetch1 = vi.fn();
        const dynFetch2 = vi.fn();

        // First registration
        window.CupcakePM.registerProvider({
            name: 'Alpha',
            models: [{ id: 'm1', name: 'M1' }],
            fetcher: fetcher1,
            settingsTab: tab1,
            fetchDynamicModels: dynFetch1,
        });

        // Second registration (same name — should replace, not accumulate)
        window.CupcakePM.registerProvider({
            name: 'Alpha',
            models: [{ id: 'm2', name: 'M2' }, { id: 'm3', name: 'M3' }],
            fetcher: fetcher2,
            settingsTab: tab2,
            fetchDynamicModels: dynFetch2,
        });

        // Fetcher replaced
        expect(mockCustomFetchers.Alpha).toBe(fetcher2);
        // Models: old ones removed, only new ones present
        const alphaModels = mockState.ALL_DEFINED_MODELS.filter(m => m.provider === 'Alpha');
        expect(alphaModels).toHaveLength(2);
        expect(alphaModels.map(m => m.id)).toEqual(['m2', 'm3']);
        // Tabs: no duplicates
        const alphaTabs = mockRegisteredProviderTabs.filter(t => t.providerName === 'Alpha');
        expect(alphaTabs).toHaveLength(1);
        expect(alphaTabs[0]).toBe(tab2);
        // Dynamic fetchers: no duplicates
        const alphaFetchers = mockPendingDynamicFetchers.filter(f => f.name === 'Alpha');
        expect(alphaFetchers).toHaveLength(1);
        expect(alphaFetchers[0].fetchDynamicModels).toBe(dynFetch2);
    });

    it('registerCleanup warns outside plugin execution context', () => {
        setupCupcakeAPI();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cleanup = vi.fn();

        window.CupcakePM.registerCleanup(cleanup);

        expect(warnSpy).toHaveBeenCalled();
        expect(mockPluginCleanupHooks).toEqual({});
    });

    it('registerCleanup stores cleanup handler for current plugin', () => {
        setupCupcakeAPI();
        mockState._currentExecutingPluginId = 'plugin-1';
        const cleanup = vi.fn();

        window.CupcakePM.registerCleanup(cleanup);

        expect(mockPluginCleanupHooks['plugin-1']).toEqual([cleanup]);
    });

    it('registerCleanup ignores non-function values', () => {
        setupCupcakeAPI();
        mockState._currentExecutingPluginId = 'plugin-1';

        window.CupcakePM.registerCleanup('not-a-function');

        expect(mockPluginCleanupHooks).toEqual({});
    });

    it('addCustomModel creates a new custom model and persists it', () => {
        setupCupcakeAPI();

        const result = window.CupcakePM.addCustomModel({ model: 'x-model', name: 'X Model' }, 'tag-1');

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
        expect(result.uniqueId).toContain('custom_');
        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(mockState.ALL_DEFINED_MODELS[0]).toMatchObject({ id: 'x-model', name: 'X Model', provider: 'Custom' });
        expect(mockRisu.setArgument).toHaveBeenCalledWith('cpm_custom_models', expect.any(String));
    });

    it('addCustomModel updates existing tagged model instead of creating duplicate', () => {
        setupCupcakeAPI();
        mockState.CUSTOM_MODELS_CACHE.push({ uniqueId: 'custom_1', model: 'old', name: 'Old', _tag: 'same-tag' });

        const result = window.CupcakePM.addCustomModel({ model: 'new-model', name: 'New Name' }, 'same-tag');

        expect(result).toEqual({ success: true, created: false, uniqueId: 'custom_1' });
        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0]).toMatchObject({ uniqueId: 'custom_1', model: 'new-model', name: 'New Name', _tag: 'same-tag' });
    });

    it('addCustomModel returns failure when persistence throws', () => {
        setupCupcakeAPI();
        mockRisu.setArgument.mockImplementation(() => { throw new Error('persist failed'); });

        const result = window.CupcakePM.addCustomModel({ model: 'x' }, 't');

        expect(result.success).toBe(false);
        expect(result.error).toBe('persist failed');
    });

    it('isStreamingAvailable combines setting and capability state', async () => {
        setupCupcakeAPI();
        mockSafeGetBoolArg.mockResolvedValue(true);
        mockCheckStreamCapability.mockResolvedValue(false);

        await expect(window.CupcakePM.isStreamingAvailable()).resolves.toEqual({
            enabled: true,
            bridgeCapable: false,
            active: false,
        });
    });

    it('setArg stringifies values before delegating to Risu', () => {
        setupCupcakeAPI();
        window.CupcakePM.setArg('foo', 123);
        expect(mockRisu.setArgument).toHaveBeenCalledWith('foo', '123');
    });

    it('proxies smartFetch, key rotation, token, and hot reload helpers', async () => {
        setupCupcakeAPI();

        await window.CupcakePM.smartFetch('https://example.com', { method: 'GET' });
        await window.CupcakePM.smartNativeFetch('https://example.com', { method: 'GET' });
        await window.CupcakePM.hotReload('plugin-1');
        await window.CupcakePM.hotReloadAll();

        expect(mockSmartNativeFetch).toHaveBeenCalledTimes(2);
        expect(window.CupcakePM.pickKey('arg')).toBe('key1');
        expect(window.CupcakePM.keyPoolRemaining('arg')).toBe(2);
        expect(window.CupcakePM.pickJsonKey('json')).toEqual({ id: 1 });
        expect(window.CupcakePM.ensureCopilotApiToken()).toBe('token');
        expect(mockSubPluginManager.hotReload).toHaveBeenCalledWith('plugin-1');
        expect(mockSubPluginManager.hotReloadAll).toHaveBeenCalled();
    });

    it('exposes passthrough helpers and advanced wrappers', async () => {
        setupCupcakeAPI();
        mockSafeGetArg.mockResolvedValue('value-from-arg');
        mockSafeGetBoolArg.mockResolvedValue(true);

        await expect(window.CupcakePM.safeGetArg('foo')).resolves.toBe('value-from-arg');
        await expect(window.CupcakePM.safeGetBoolArg('flag', false)).resolves.toBe(true);
        expect(window.CupcakePM.safeUUID()).toBe('uuid-1');
        expect(window.CupcakePM.ThoughtSignatureCache).toBe(mockThoughtSignatureCache);
        expect(window.CupcakePM._needsCopilotResponsesAPI('gpt-5')).toBe(true);
        await expect(window.CupcakePM.checkStreamCapability()).resolves.toBe(true);
        expect(window.CupcakePM.drainKey('arg', 'bad')).toBe(true);
        expect(window.CupcakePM.resetKeyPool('arg')).toBeUndefined();
        await expect(window.CupcakePM.withKeyRotation('arg', async () => 'ok', { retries: 2 })).resolves.toBe('rotated');
        await expect(window.CupcakePM.withJsonKeyRotation('json', async () => 'ok', { retries: 1 })).resolves.toBe('json-rotated');
        expect(window.CupcakePM._normalizeTokenUsage({ total: 1 })).toEqual({ normalized: { total: 1 } });

        expect(mockNeedsCopilotResponsesAPI).toHaveBeenCalledWith('gpt-5');
        expect(mockCheckStreamCapability).toHaveBeenCalledTimes(1);
        expect(mockKeyPool.drain).toHaveBeenCalledWith('arg', 'bad');
        expect(mockKeyPool.reset).toHaveBeenCalledWith('arg');
        expect(mockKeyPool.withRotation).toHaveBeenCalledWith('arg', expect.any(Function), { retries: 2 });
        expect(mockKeyPool.withJsonRotation).toHaveBeenCalledWith('json', expect.any(Function), { retries: 1 });
        expect(mockNormalizeTokenUsage).toHaveBeenCalledWith({ total: 1 });
    });

    it('exposes vertexTokenCache through getter/setter', () => {
        setupCupcakeAPI();
        window.CupcakePM.vertexTokenCache = { token: 'abc', expiry: 99 };
        expect(mockState.vertexTokenCache).toEqual({ token: 'abc', expiry: 99 });
        expect(window.CupcakePM.vertexTokenCache).toEqual({ token: 'abc', expiry: 99 });
    });
});
