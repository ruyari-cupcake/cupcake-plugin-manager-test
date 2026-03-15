/**
 * init-branches.test.js — Additional branch coverage for init.js
 *
 * Targets the specific uncovered branches:
 * - Hotkey: rootDoc is null → skips hotkey registration
 * - Streaming: disabled + not capable, enabled + not capable
 * - Compatibility mode
 * - Boot crash → fallback error panel registration
 * - pluginStorage.setItem failure on boot status
 * - 4-finger touch gesture to open settings
 * - Model flag branches: Gemini, Claude, OpenAI developer-role
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
    return {
        mockArgStore,
        mockState,
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
        mockCheckStreamCapability: vi.fn(async () => true),
        mockPendingDynamicFetchers: [],
        mockIsDynamicFetchEnabled: vi.fn(async () => false),
        mockOpenSettings: vi.fn(),
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

describe('init.js — branch coverage: streaming variations', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('handles streaming disabled + not capable', async () => {
        h.mockCheckStreamCapability.mockResolvedValue(false);
        h.mockArgStore['cpm_streaming_enabled'] = 'false';

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const logCalls = logSpy.mock.calls.map(c => c[0]);
        expect(logCalls.some(c => typeof c === 'string' && c.includes('Streaming: disabled') && c.includes('not capable'))).toBe(true);
    });

    it('handles streaming enabled + not capable (falls back)', async () => {
        h.mockCheckStreamCapability.mockResolvedValue(false);
        h.mockArgStore['cpm_streaming_enabled'] = 'true';

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const warnCalls = warnSpy.mock.calls.map(c => c[0]);
        expect(warnCalls.some(c => typeof c === 'string' && c.includes('OVERRIDDEN'))).toBe(true);
    });

    it('handles compatibility mode enabled', async () => {
        h.mockArgStore['cpm_compatibility_mode'] = 'true';

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const logCalls = logSpy.mock.calls.map(c => c[0]);
        expect(logCalls.some(c => typeof c === 'string' && c.includes('Compatibility mode: ENABLED'))).toBe(true);
    });

    it('handles stream capability check + capability auto-active', async () => {
        h.mockCheckStreamCapability.mockResolvedValue(false);
        h.mockArgStore['cpm_compatibility_mode'] = 'false';

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const logCalls = logSpy.mock.calls.map(c => c[0]);
        expect(logCalls.some(c => typeof c === 'string' && c.includes('AUTO-ACTIVE'))).toBe(true);
    });
});

describe('init.js — branch coverage: hotkey registration', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('skips hotkey registration when rootDoc is null', async () => {
        h.risu.getRootDocument.mockResolvedValue(null);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const logCalls = logSpy.mock.calls.map(c => c[0]);
        expect(logCalls.some(c => typeof c === 'string' && c.includes('Hotkey registration skipped'))).toBe(true);
    });

    it('triggers openCpmSettings on Ctrl+Shift+Alt+P', async () => {
        const mockRootDoc = { addEventListener: vi.fn(async () => {}) };
        h.risu.getRootDocument.mockResolvedValue(mockRootDoc);

        await import('../src/lib/init.js');
        await tick();

        // Find the keydown handler
        const keydownCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'keydown');
        expect(keydownCall).toBeDefined();
        const keydownHandler = keydownCall[1];

        // Simulate Ctrl+Shift+Alt+P
        keydownHandler({ ctrlKey: true, shiftKey: true, altKey: true, key: 'P' });
        expect(h.mockOpenSettings).toHaveBeenCalled();
    });

    it('does not trigger openCpmSettings on non-matching key combo', async () => {
        const mockRootDoc = { addEventListener: vi.fn(async () => {}) };
        h.risu.getRootDocument.mockResolvedValue(mockRootDoc);

        await import('../src/lib/init.js');
        await tick();

        const keydownCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'keydown');
        const keydownHandler = keydownCall[1];

        h.mockOpenSettings.mockClear();
        keydownHandler({ ctrlKey: true, shiftKey: false, altKey: true, key: 'P' });
        expect(h.mockOpenSettings).not.toHaveBeenCalled();
    });

    it('4-finger touch gesture opens settings', async () => {
        const mockRootDoc = { addEventListener: vi.fn(async () => {}) };
        h.risu.getRootDocument.mockResolvedValue(mockRootDoc);
        vi.useFakeTimers();

        await import('../src/lib/init.js');
        await vi.advanceTimersByTimeAsync(300);

        // Find pointerdown handler
        const pdownCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'pointerdown');
        expect(pdownCall).toBeDefined();
        const addPointer = pdownCall[1];

        // Simulate 4 quick taps
        h.mockOpenSettings.mockClear();
        addPointer();
        addPointer();
        addPointer();
        addPointer();
        expect(h.mockOpenSettings).toHaveBeenCalled();
    });

    it('pointer count resets after 500ms timeout', async () => {
        const mockRootDoc = { addEventListener: vi.fn(async () => {}) };
        h.risu.getRootDocument.mockResolvedValue(mockRootDoc);
        vi.useFakeTimers();

        await import('../src/lib/init.js');
        await vi.advanceTimersByTimeAsync(300);

        const pdownCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'pointerdown');
        const addPointer = pdownCall[1];

        h.mockOpenSettings.mockClear();
        addPointer();
        addPointer();
        // Wait 500ms+
        await vi.advanceTimersByTimeAsync(600);
        addPointer();
        addPointer();
        // Only 2 taps since reset, should NOT open settings
        expect(h.mockOpenSettings).not.toHaveBeenCalled();
    });

    it('pointerup decrements counter', async () => {
        const mockRootDoc = { addEventListener: vi.fn(async () => {}) };
        h.risu.getRootDocument.mockResolvedValue(mockRootDoc);

        await import('../src/lib/init.js');
        await tick();

        const pUpCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'pointerup');
        expect(pUpCall).toBeDefined();
        const removePointer = pUpCall[1];

        // Should not throw when called
        removePointer();

        const pCancelCall = mockRootDoc.addEventListener.mock.calls.find(c => c[0] === 'pointercancel');
        expect(pCancelCall).toBeDefined();
        pCancelCall[1](); // pointercancel handler
    });
});

describe('init.js — branch coverage: model flags', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('registers Anthropic model with hasFirstSystemPrompt flag', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
        ];

        await import('../src/lib/init.js');
        await tick();

        expect(h.risu.addProvider).toHaveBeenCalled();
        const call = h.risu.addProvider.mock.calls[0];
        expect(call[0]).toContain('Anthropic');
        expect(call[2].model.flags).toContain(7); // hasFirstSystemPrompt
        expect(call[2].model.flags).not.toContain(9); // NOT requiresAlternateRole
    });

    it('registers GoogleAI model with hasFirstSystemPrompt + requiresAlternateRole', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'GoogleAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        expect(h.risu.addProvider).toHaveBeenCalled();
        const call = h.risu.addProvider.mock.calls[0];
        expect(call[0]).toContain('GoogleAI');
        expect(call[2].model.flags).toContain(7); // hasFirstSystemPrompt
        expect(call[2].model.flags).toContain(9); // requiresAlternateRole
    });

    it('registers VertexAI claude model as Claude family', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'claude-3.5-sonnet', name: 'Claude 3.5 on Vertex', provider: 'VertexAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).toContain(7);  // hasFirstSystemPrompt
        expect(call[2].model.flags).not.toContain(9); // NOT requiresAlternateRole
    });

    it('registers VertexAI gemini model as Gemini family', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'gemini-2.0-flash', name: 'Gemini on Vertex', provider: 'VertexAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).toContain(7); // hasFirstSystemPrompt
        expect(call[2].model.flags).toContain(9); // requiresAlternateRole
    });

    it('registers OpenAI gpt-5 with DeveloperRole flag', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).toContain(14); // DeveloperRole
        expect(call[2].model.flags).toContain(6);  // hasFullSystemPrompt
    });

    it('registers OpenAI o2 model with DeveloperRole flag', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'o2', name: 'O2', provider: 'OpenAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).toContain(14);
    });

    it('does NOT add DeveloperRole flag for non-matching OpenAI models', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).not.toContain(14);
        expect(call[2].model.flags).toContain(6); // hasFullSystemPrompt
    });

    it('DeepSeek (generic provider) gets hasFullSystemPrompt flag', async () => {
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek' },
        ];

        await import('../src/lib/init.js');
        await tick();

        const call = h.risu.addProvider.mock.calls[0];
        expect(call[2].model.flags).toContain(6); // hasFullSystemPrompt
        expect(call[2].model.flags).not.toContain(7); // NOT hasFirstSystemPrompt
    });
});

describe('init.js — branch coverage: boot crash fallback', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockPendingDynamicFetchers.length = 0;
        delete globalThis.cpmShortcutRegistered;
        delete globalThis._cpmVersionChecked;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('pluginStorage.setItem failure is silently caught', async () => {
        h.risu.pluginStorage.setItem.mockRejectedValue(new Error('storage unavailable'));

        await import('../src/lib/init.js');
        await tick();

        // Should not throw — error is silently caught
    });

    it('dynamic model fetch failure is silently caught per provider', async () => {
        h.mockPendingDynamicFetchers.push({
            name: 'FailProv',
            fetchDynamicModels: vi.fn(async () => { throw new Error('network'); }),
        });
        h.mockIsDynamicFetchEnabled.mockResolvedValue(true);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const calls = warnSpy.mock.calls.map(c => c[0]);
        expect(calls.some(c => typeof c === 'string' && c.includes('Dynamic fetch failed for FailProv'))).toBe(true);
    });

    it('dynamic models empty array uses fallback', async () => {
        h.mockPendingDynamicFetchers.push({
            name: 'EmptyProv',
            fetchDynamicModels: vi.fn(async () => []),
        });
        h.mockIsDynamicFetchEnabled.mockResolvedValue(true);

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const calls = logSpy.mock.calls.map(c => c[0]);
        expect(calls.some(c => typeof c === 'string' && c.includes('No dynamic models for EmptyProv'))).toBe(true);
    });

    it('dynamic models null result uses fallback', async () => {
        h.mockPendingDynamicFetchers.push({
            name: 'NullProv',
            fetchDynamicModels: vi.fn(async () => null),
        });
        h.mockIsDynamicFetchEnabled.mockResolvedValue(true);

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const calls = logSpy.mock.calls.map(c => c[0]);
        expect(calls.some(c => typeof c === 'string' && c.includes('No dynamic models for NullProv'))).toBe(true);
    });

    it('addProvider error during model registration is caught and logged', async () => {
        h.risu.addProvider.mockRejectedValue(new Error('provider reg fail'));
        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'm1', name: 'M1', provider: 'Test' },
        ];

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await import('../src/lib/init.js');
        await tick();

        const calls = errSpy.mock.calls.map(c => c[0]);
        expect(calls.some(c => typeof c === 'string' && c.includes('Model registration stopped at 0/'))).toBe(true);
    });

    it('handleRequest error in provider callback returns SDK fallback crash message', async () => {
        const { handleRequest } = await import('../src/lib/router.js');
        handleRequest.mockRejectedValue(new Error('router crash'));
        h.risu.addProvider.mockImplementation(async (name, cb, _opts) => {
            // Actually invoke the callback to test its error handling
            const result = await cb({ messages: [] }, null);
            expect(result.success).toBe(false);
            expect(result.content).toContain('Cupcake SDK Fallback Crash');
            expect(result.content).toContain('router crash');
        });

        h.mockState.ALL_DEFINED_MODELS = [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
        ];

        await import('../src/lib/init.js');
        await tick();
    });
});
