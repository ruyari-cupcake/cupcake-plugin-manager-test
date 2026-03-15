/**
 * init-uncovered.test.js — Targets remaining uncovered lines in init.js
 *
 * Specifically:
 * - Line 289: model sorting secondary key (same provider, different name)
 * - Lines 415-427: outer catch fallback error panel (settings NOT registered + outer crash)
 * - Function coverage: _exposeScopeToWindow window scope bridge
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
    const mockArgStore = {};
    const mockState = {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    };
    const mockRootDoc = {
        addEventListener: vi.fn(async () => {}),
    };
    return {
        mockArgStore,
        mockState,
        mockRootDoc,
        safeGetArg: vi.fn(async (key, def = '') => (key in mockArgStore ? mockArgStore[key] : def)),
        safeGetBoolArg: vi.fn(async (key, def = false) => {
            const v = mockArgStore[key];
            if (v === undefined) return def;
            return v === true || v === 'true';
        }),
        risu: {
            setArgument: vi.fn(),
            log: vi.fn(),
            getArgument: vi.fn(async () => ''),
            addProvider: vi.fn(async () => {}),
            registerSetting: vi.fn(async () => {}),
            showContainer: vi.fn(),
            hideContainer: vi.fn(),
            getRootDocument: vi.fn(async () => mockRootDoc),
            pluginStorage: {
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
                removeItem: vi.fn(async () => {}),
                keys: vi.fn(async () => []),
            },
        },
        setExposeScopeFunction: vi.fn(),
        setupCupcakeAPI: vi.fn(),
        mockPendingDynamicFetchers: [],
        mockIsDynamicFetchEnabled: vi.fn(async () => false),
        mockOpenSettings: vi.fn(),
        mockCheckStreamCapability: vi.fn(async () => true),
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
    registeredProviderTabs: [],
    pendingDynamicFetchers: h.mockPendingDynamicFetchers,
    _pluginRegistrations: {},
    isDynamicFetchEnabled: (...a) => h.mockIsDynamicFetchEnabled(...a),
}));
vi.mock('../src/lib/helpers.js', () => ({ safeStringify: JSON.stringify }));
vi.mock('../src/lib/sanitize.js', () => ({ sanitizeMessages: vi.fn(x => x), stripInternalTags: vi.fn(x => x), sanitizeBodyJSON: vi.fn(x => x), stripThoughtDisplayContent: vi.fn(x => x) }));
vi.mock('../src/lib/token-usage.js', () => ({ _normalizeTokenUsage: vi.fn(x => x), _tokenUsageStore: {} }));
vi.mock('../src/lib/token-toast.js', () => ({ showTokenUsageToast: vi.fn() }));
vi.mock('../src/lib/format-openai.js', () => ({ formatToOpenAI: vi.fn() }));
vi.mock('../src/lib/format-anthropic.js', () => ({ formatToAnthropic: vi.fn() }));
vi.mock('../src/lib/format-gemini.js', () => ({ formatToGemini: vi.fn(), getGeminiSafetySettings: vi.fn(), validateGeminiParams: vi.fn(), isExperimentalGeminiModel: vi.fn(() => false), cleanExperimentalModelParams: vi.fn(x => x), buildGeminiThinkingConfig: vi.fn(), ThoughtSignatureCache: {} }));
vi.mock('../src/lib/sse-parsers.js', () => ({ parseOpenAISSELine: vi.fn(), parseGeminiSSELine: vi.fn() }));
vi.mock('../src/lib/slot-inference.js', () => ({ CPM_SLOT_LIST: ['translation'], inferSlot: vi.fn(async () => 'chat') }));
vi.mock('../src/lib/aws-signer.js', () => ({ AwsV4Signer: class {} }));
vi.mock('../src/lib/smart-fetch.js', () => ({ smartNativeFetch: vi.fn() }));
vi.mock('../src/lib/model-helpers.js', () => ({ needsCopilotResponsesAPI: vi.fn(() => false) }));
vi.mock('../src/lib/response-parsers.js', () => ({ parseClaudeNonStreamingResponse: vi.fn(), parseGeminiNonStreamingResponse: vi.fn(), parseOpenAINonStreamingResponse: vi.fn(), parseResponsesAPINonStreamingResponse: vi.fn() }));
vi.mock('../src/lib/stream-builders.js', () => ({ createSSEStream: vi.fn(), createOpenAISSEStream: vi.fn(), createResponsesAPISSEStream: vi.fn(), createAnthropicSSEStream: vi.fn(), saveThoughtSignatureFromStream: vi.fn(), setApiRequestLogger: vi.fn() }));
vi.mock('../src/lib/stream-utils.js', () => ({ collectStream: vi.fn(), checkStreamCapability: (...a) => h.mockCheckStreamCapability(...a) }));
vi.mock('../src/lib/copilot-token.js', () => ({ ensureCopilotApiToken: vi.fn(async () => 'tok'), setCopilotGetArgFn: vi.fn(), setCopilotFetchFn: vi.fn() }));
vi.mock('../src/lib/key-pool.js', () => ({ KeyPool: { setGetArgFn: vi.fn(), pick: vi.fn(async () => 'key') } }));
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
        retryPendingMainPluginUpdateOnBoot: vi.fn(async () => false),
        checkVersionsQuiet: vi.fn(async () => {}),
        checkMainPluginVersionQuiet: vi.fn(async () => {}),
        _pendingUpdateNames: [],
    },
    setExposeScopeFunction: h.setExposeScopeFunction,
}));
vi.mock('../src/lib/fetch-custom.js', () => ({ fetchCustom: vi.fn() }));
vi.mock('../src/lib/router.js', () => ({ handleRequest: vi.fn(), fetchByProviderId: vi.fn() }));
vi.mock('../src/lib/cupcake-api.js', () => ({ setupCupcakeAPI: h.setupCupcakeAPI }));
vi.mock('../src/lib/settings-ui.js', () => ({ openCpmSettings: h.mockOpenSettings }));

const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));

describe('init.js — model sorting secondary key', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockState._currentExecutingPluginId = null;
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('sorts models by provider first, then by name within the same provider', async () => {
        // Custom models JSON with multiple entries from the SAME provider (different names)
        // to exercise the secondary sort path (localeCompare on name when provider is equal)
        h.mockArgStore['cpm_custom_models'] = JSON.stringify([
            { uniqueId: 'c1', name: 'Zulu Custom', model: 'z-model', url: 'http://a', format: 'openai' },
            { uniqueId: 'c2', name: 'Alpha Custom', model: 'a-model', url: 'http://b', format: 'openai' },
        ]);

        await import('../src/lib/init.js');
        await tick();

        // After boot, ALL_DEFINED_MODELS should be sorted: all have provider='Custom', 
        // so the secondary sort (name) applies — Alpha Custom before Zulu Custom
        const customModels = h.mockState.ALL_DEFINED_MODELS.filter(m => m.provider === 'Custom');
        expect(customModels.length).toBe(2);
        expect(customModels[0].name).toBe('Alpha Custom');
        expect(customModels[1].name).toBe('Zulu Custom');
    });
});

describe('init.js — outer catch fallback error panel', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockState._currentExecutingPluginId = null;
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('registers fallback error panel when settings registration fails AND outer block crashes', async () => {
        // 1) Make registerSetting fail on first call → _settingsRegistered stays false
        // 2) Push null into pendingDynamicFetchers → for-of destructure throws (escapes phase catch)
        // 3) Outer catch fires → calls registerSetting again for fallback error panel
        let callCount = 0;
        h.risu.registerSetting.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('RPC bridge broken');
            // Second call (fallback error panel) succeeds
        });

        // Push null to trigger TypeError in for-of destructure (not caught by inner try)
        h.mockPendingDynamicFetchers.push(null);

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick(300);

        // The fallback registerSetting should have been called (second call)
        expect(callCount).toBe(2);
        expect(h.risu.registerSetting).toHaveBeenCalledWith(
            expect.stringContaining('Error'),
            expect.any(Function),
            '🧁',
            'html',
        );

        // Exercise the fallback panel callback (lines 415-427)
        const fallbackCall = h.risu.registerSetting.mock.calls[1];
        const renderFn = fallbackCall[1];
        document.body.innerHTML = '';
        await renderFn();
        expect(h.risu.showContainer).toHaveBeenCalledWith('fullscreen');
        expect(document.body.innerHTML).toContain('Initialization Error');

        errSpy.mockRestore();
    });
});

describe('init.js — _exposeScopeToWindow function coverage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockState._currentExecutingPluginId = null;
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('setExposeScopeFunction receives _exposeScopeToWindow and calling it populates window', async () => {
        await import('../src/lib/init.js');
        await tick();

        // setExposeScopeFunction was called with _exposeScopeToWindow
        expect(h.setExposeScopeFunction).toHaveBeenCalledWith(expect.any(Function));

        // Call the function to exercise _exposeScopeToWindow body
        const exposeFn = h.setExposeScopeFunction.mock.calls[0][0];
        exposeFn();

        // Verify it put CPM_VERSION on window
        expect(window.CPM_VERSION).toBe('1.19.6');
        // Verify mutable state getters/setters
        expect(typeof Object.getOwnPropertyDescriptor(window, 'ALL_DEFINED_MODELS')?.get).toBe('function');
        expect(typeof Object.getOwnPropertyDescriptor(window, 'ALL_DEFINED_MODELS')?.set).toBe('function');
        // Test the proxy works
        window.ALL_DEFINED_MODELS = [{ id: 'test' }];
        expect(h.mockState.ALL_DEFINED_MODELS).toEqual([{ id: 'test' }]);
        expect(window.ALL_DEFINED_MODELS).toEqual([{ id: 'test' }]);
    });
});
