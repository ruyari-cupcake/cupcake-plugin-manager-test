import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
    const mockArgStore = {};
    const mockState = {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    };
    return {
        mockArgStore,
        mockState,
        safeGetArg: vi.fn(async (key, def = '') => (key in mockArgStore ? mockArgStore[key] : def)),
        safeGetBoolArg: vi.fn(async (key, def = false) => {
            const v = mockArgStore[key];
            if (v === undefined) return def;
            return v === true || v === 'true';
        }),
        smartFetch: vi.fn(),
        risu: {
            setArgument: vi.fn(),
            log: vi.fn(),
            getArgument: vi.fn(async () => ''),
            addProvider: vi.fn(async () => {}),
            registerSetting: vi.fn(async () => {}),
            getRootDocument: vi.fn(async () => null),
            showContainer: vi.fn(),
            hideContainer: vi.fn(),
            pluginStorage: {
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
                removeItem: vi.fn(async () => {}),
                keys: vi.fn(async () => []),
            },
        },
        setExposeScopeFunction: vi.fn(),
        setupCupcakeAPI: vi.fn(),
    };
});

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
globalThis.risuai = h.risu;
globalThis.Risuai = h.risu;

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: '1.19.6',
    state: h.mockState,
    safeGetArg: h.safeGetArg,
    safeGetBoolArg: h.safeGetBoolArg,
    customFetchers: {},
    registeredProviderTabs: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/helpers.js', () => ({
    safeStringify: JSON.stringify,
}));

vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeMessages: vi.fn((x) => x),
    stripInternalTags: vi.fn((x) => x),
    sanitizeBodyJSON: vi.fn((x) => x),
    stripThoughtDisplayContent: vi.fn((x) => x),
}));

vi.mock('../src/lib/token-usage.js', () => ({
    _normalizeTokenUsage: vi.fn((x) => x),
    _tokenUsageStore: {},
}));

vi.mock('../src/lib/token-toast.js', () => ({
    showTokenUsageToast: vi.fn(),
}));

vi.mock('../src/lib/format-openai.js', () => ({
    formatToOpenAI: vi.fn(),
}));

vi.mock('../src/lib/format-anthropic.js', () => ({
    formatToAnthropic: vi.fn(),
}));

vi.mock('../src/lib/format-gemini.js', () => ({
    formatToGemini: vi.fn(),
    getGeminiSafetySettings: vi.fn(),
    validateGeminiParams: vi.fn(),
    isExperimentalGeminiModel: vi.fn(() => false),
    cleanExperimentalModelParams: vi.fn((x) => x),
    buildGeminiThinkingConfig: vi.fn(),
    ThoughtSignatureCache: {},
}));

vi.mock('../src/lib/sse-parsers.js', () => ({
    parseOpenAISSELine: vi.fn(),
    parseGeminiSSELine: vi.fn(),
}));

vi.mock('../src/lib/slot-inference.js', () => ({
    CPM_SLOT_LIST: ['translation', 'emotion', 'memory', 'other'],
    inferSlot: vi.fn(async () => 'chat'),
}));

vi.mock('../src/lib/aws-signer.js', () => ({
    AwsV4Signer: class {},
}));

vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: h.smartFetch,
}));

vi.mock('../src/lib/model-helpers.js', () => ({
    needsCopilotResponsesAPI: vi.fn(() => false),
}));

vi.mock('../src/lib/response-parsers.js', () => ({
    parseClaudeNonStreamingResponse: vi.fn(),
    parseGeminiNonStreamingResponse: vi.fn(),
    parseOpenAINonStreamingResponse: vi.fn(),
    parseResponsesAPINonStreamingResponse: vi.fn(),
}));

vi.mock('../src/lib/stream-builders.js', () => ({
    createSSEStream: vi.fn(),
    createOpenAISSEStream: vi.fn(),
    createResponsesAPISSEStream: vi.fn(),
    createAnthropicSSEStream: vi.fn(),
    saveThoughtSignatureFromStream: vi.fn(),
    setApiRequestLogger: vi.fn(),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: vi.fn(),
    checkStreamCapability: vi.fn(async () => false),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: {
        load: vi.fn(async () => {}),
        restoreIfEmpty: vi.fn(async () => 0),
        updateKey: vi.fn(),
    },
}));

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: {
        loadRegistry: vi.fn(async () => {}),
        executeEnabled: vi.fn(async () => {}),
        checkVersionsQuiet: vi.fn(async () => {}),
        checkMainPluginVersionQuiet: vi.fn(async () => {}),
    },
    setExposeScopeFunction: h.setExposeScopeFunction,
}));

vi.mock('../src/lib/fetch-custom.js', () => ({
    fetchCustom: vi.fn(),
}));

vi.mock('../src/lib/router.js', () => ({
    handleRequest: vi.fn(),
    fetchByProviderId: vi.fn(),
}));

vi.mock('../src/lib/cupcake-api.js', () => ({
    setupCupcakeAPI: h.setupCupcakeAPI,
}));

vi.mock('../src/lib/settings-ui.js', () => ({
    openCpmSettings: vi.fn(),
}));

describe('init bootstrap wiring', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach((k) => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockState.vertexTokenCache = { token: null, expiry: 0 };
        h.mockState._currentExecutingPluginId = null;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
        globalThis.window = globalThis;
    });

    it('boot wires KeyPool to safeGetArg so provider key rotation can run', async () => {
        h.mockArgStore.test_keys = 'key1 key2';

        await import('../src/lib/init.js');
        const { KeyPool } = await import('../src/lib/key-pool.js');

        const picked = await KeyPool.pick('test_keys');
        expect(['key1', 'key2']).toContain(picked);
        expect(h.safeGetArg).toHaveBeenCalledWith('test_keys');
    });

    it('boot wires Copilot token module to safeGetArg and smartNativeFetch', async () => {
        h.mockArgStore.tools_githubCopilotToken = 'ghp_testtoken';
        h.smartFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'copilot-api-token-123',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });

        await import('../src/lib/init.js');
        const { ensureCopilotApiToken, clearCopilotTokenCache } = await import('../src/lib/copilot-token.js');

        clearCopilotTokenCache();
        const token = await ensureCopilotApiToken();

        expect(token).toBe('copilot-api-token-123');
        expect(h.smartFetch).toHaveBeenCalledOnce();
        expect(h.smartFetch.mock.calls[0][0]).toContain('copilot_internal/v2/token');
        expect(h.safeGetArg).toHaveBeenCalledWith('tools_githubCopilotToken');
    });
});
