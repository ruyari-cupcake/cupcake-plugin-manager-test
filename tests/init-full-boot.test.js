/**
 * init-full-boot.test.js — Triggers the init.js IIFE with full-path mocking
 * to cover model registration loop, custom model migration, dynamic models,
 * hotkey registration, and boot status recording.
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
        smartFetch: vi.fn(),
        addProvider: vi.fn(async () => {}),
        risu: {
            setArgument: vi.fn(),
            log: vi.fn(),
            getArgument: vi.fn(async () => ''),
            addProvider: vi.fn(async () => {}),
            registerSetting: vi.fn(async () => {}),
            getRootDocument: vi.fn(async () => mockRootDoc),
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
        mockPendingDynamicFetchers: [],
        mockIsDynamicFetchEnabled: vi.fn(async () => false),
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
vi.mock('../src/lib/smart-fetch.js', () => ({ smartNativeFetch: h.smartFetch }));
vi.mock('../src/lib/model-helpers.js', () => ({ needsCopilotResponsesAPI: vi.fn(() => false) }));
vi.mock('../src/lib/response-parsers.js', () => ({ parseClaudeNonStreamingResponse: vi.fn(), parseGeminiNonStreamingResponse: vi.fn(), parseOpenAINonStreamingResponse: vi.fn(), parseResponsesAPINonStreamingResponse: vi.fn() }));
vi.mock('../src/lib/stream-builders.js', () => ({ createSSEStream: vi.fn(), createOpenAISSEStream: vi.fn(), createResponsesAPISSEStream: vi.fn(), createAnthropicSSEStream: vi.fn(), saveThoughtSignatureFromStream: vi.fn(), setApiRequestLogger: vi.fn() }));
vi.mock('../src/lib/stream-utils.js', () => ({ collectStream: vi.fn(), checkStreamCapability: vi.fn(async () => true) }));
vi.mock('../src/lib/copilot-token.js', () => ({ ensureCopilotApiToken: vi.fn(async () => 'tok'), setCopilotGetArgFn: vi.fn(), setCopilotFetchFn: vi.fn() }));
vi.mock('../src/lib/key-pool.js', () => ({ KeyPool: { setGetArgFn: vi.fn(), pick: vi.fn(async () => 'key') } }));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: {
        load: vi.fn(async () => {}),
        restoreIfEmpty: vi.fn(async () => 3),
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
vi.mock('../src/lib/settings-ui.js', () => ({ openCpmSettings: vi.fn() }));

// Helper: wait for async IIFE to settle
const tick = (ms = 100) => new Promise(r => setTimeout(r, ms));

describe('init.js full boot — model registration path', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        Object.keys(h.mockArgStore).forEach(k => delete h.mockArgStore[k]);
        h.mockState.ALL_DEFINED_MODELS = [];
        h.mockState.CUSTOM_MODELS_CACHE = [];
        h.mockState._currentExecutingPluginId = null;
        h.mockPendingDynamicFetchers.length = 0;
        globalThis.risuai = h.risu;
        globalThis.Risuai = h.risu;
        globalThis.window = globalThis;
        // Reset the _cpmVersionChecked flag
        delete globalThis._cpmVersionChecked;
        // Reset the cpmShortcutRegistered flag
        delete globalThis.cpmShortcutRegistered;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('registers models with Risu.addProvider for each model in ALL_DEFINED_MODELS', async () => {
        // Pre-seed models — init.js model registration reads from state.ALL_DEFINED_MODELS
        // after custom models are loaded. We add models that will be registered.
        h.mockArgStore['cpm_custom_models'] = JSON.stringify([
            { uniqueId: 'c1', name: 'My OpenAI', model: 'gpt-4o', url: 'http://x', format: 'openai' },
        ]);

        await import('../src/lib/init.js');
        await tick(200);

        // Custom model should be registered
        expect(h.risu.addProvider).toHaveBeenCalled();
    });

    it('registers hotkey listener on rootDocument', async () => {
        h.risu.getRootDocument.mockResolvedValue(h.mockRootDoc);

        await import('../src/lib/init.js');
        await tick(200);

        // hotkey-registration phase should have added event listeners
        expect(h.mockRootDoc.addEventListener).toHaveBeenCalled();
        const calls = h.mockRootDoc.addEventListener.mock.calls;
        const eventTypes = calls.map(c => c[0]);
        expect(eventTypes).toContain('keydown');
        expect(eventTypes).toContain('pointerdown');
    });

    it('records boot status to pluginStorage', async () => {
        await import('../src/lib/init.js');
        await tick(200);

        expect(h.risu.pluginStorage.setItem).toHaveBeenCalledWith(
            'cpm_last_boot_status',
            expect.any(String)
        );

        const [, json] = h.risu.pluginStorage.setItem.mock.calls.find(
            c => c[0] === 'cpm_last_boot_status'
        );
        const status = JSON.parse(json);
        expect(status.version).toBe('1.19.6');
        expect(status.ok).toEqual(expect.arrayContaining(['register-settings']));
    });

    it('continues booting and records register-settings failure when settings registration throws', async () => {
        h.risu.registerSetting.mockRejectedValueOnce(new Error('settings bridge down'));

        await import('../src/lib/init.js');
        await tick(200);

        expect(h.risu.pluginStorage.setItem).toHaveBeenCalledWith(
            'cpm_last_boot_status',
            expect.any(String)
        );

        const [, json] = h.risu.pluginStorage.setItem.mock.calls.find(
            c => c[0] === 'cpm_last_boot_status'
        );
        const status = JSON.parse(json);
        expect(status.settingsOk).toBe(false);
        expect(status.fail.some(entry => entry.includes('register-settings'))).toBe(true);
        expect(status.ok).toEqual(expect.arrayContaining(['subplugin-registry', 'settings-restore']));
    });

    it('fetches pending dynamic models when enabled', async () => {
        const fetchDyn = vi.fn(async () => [
            { id: 'dyn-1', name: 'Dynamic Model', provider: 'DynProv' },
        ]);
        h.mockPendingDynamicFetchers.push({
            name: 'DynProv',
            fetchDynamicModels: fetchDyn,
        });
        h.mockIsDynamicFetchEnabled.mockResolvedValue(true);

        await import('../src/lib/init.js');
        await tick(200);

        expect(fetchDyn).toHaveBeenCalled();
        expect(h.mockState.ALL_DEFINED_MODELS.some(m => m.name === 'Dynamic Model')).toBe(true);
    });

    it('runs JS fallback check when boot retry returns false', async () => {
        vi.useFakeTimers();

        await import('../src/lib/init.js');
        await vi.advanceTimersByTimeAsync(5200);

        const { SubPluginManager } = await import('../src/lib/sub-plugin-manager.js');
        expect(SubPluginManager.retryPendingMainPluginUpdateOnBoot).toHaveBeenCalled();
        expect(SubPluginManager.checkVersionsQuiet).toHaveBeenCalled();
        expect(SubPluginManager.checkMainPluginVersionQuiet).toHaveBeenCalled();
    });

    it('skips JS fallback check when boot retry already handled the main update', async () => {
        vi.useFakeTimers();
        const { SubPluginManager } = await import('../src/lib/sub-plugin-manager.js');
        SubPluginManager.retryPendingMainPluginUpdateOnBoot.mockResolvedValue(true);

        await import('../src/lib/init.js');
        await vi.advanceTimersByTimeAsync(5200);

        expect(SubPluginManager.retryPendingMainPluginUpdateOnBoot).toHaveBeenCalled();
        expect(SubPluginManager.checkVersionsQuiet).toHaveBeenCalled();
        expect(SubPluginManager.checkMainPluginVersionQuiet).not.toHaveBeenCalled();
    });

    it('auto-migrates C1-C9 legacy custom models when JSON is empty', async () => {
        h.mockArgStore['cpm_custom_models'] = '[]';
        h.mockArgStore['cpm_c1_url'] = 'http://legacy-url.com';
        h.mockArgStore['cpm_c1_model'] = 'gpt-3.5-turbo';
        h.mockArgStore['cpm_c1_name'] = 'Legacy Model';

        await import('../src/lib/init.js');
        await tick(200);

        // Should have migrated the legacy model
        expect(h.mockState.CUSTOM_MODELS_CACHE.length).toBeGreaterThanOrEqual(1);
        expect(h.risu.setArgument).toHaveBeenCalledWith(
            'cpm_custom_models',
            expect.stringContaining('Legacy Model')
        );
    });

    it('auto-migrates C1-C9 with all boolean/string fields preserved', async () => {
        h.mockArgStore['cpm_custom_models'] = '[]';
        h.mockArgStore['cpm_c1_url'] = 'http://legacy.com';
        h.mockArgStore['cpm_c1_model'] = 'legacy-model';
        h.mockArgStore['cpm_c1_name'] = 'Legacy 1';
        h.mockArgStore['cpm_c1_key'] = 'sk-legacy';
        h.mockArgStore['cpm_c1_format'] = 'anthropic';
        h.mockArgStore['cpm_c1_sysfirst'] = 'true';
        h.mockArgStore['cpm_c1_altrole'] = 'true';
        h.mockArgStore['cpm_c1_mustuser'] = 'true';
        h.mockArgStore['cpm_c1_maxout'] = 'true';
        h.mockArgStore['cpm_c1_mergesys'] = 'true';
        h.mockArgStore['cpm_c1_decoupled'] = 'true';
        h.mockArgStore['cpm_c1_thought'] = 'true';
        h.mockArgStore['cpm_c1_reasoning'] = 'parsed';
        h.mockArgStore['cpm_c1_verbosity'] = 'high';
        h.mockArgStore['cpm_c1_thinking'] = 'auto';
        h.mockArgStore['cpm_c1_tok'] = 'cl100k_base';

        // Also add C2 with minimal fields to verify multiple models
        h.mockArgStore['cpm_c2_url'] = 'http://legacy2.com';
        h.mockArgStore['cpm_c2_model'] = 'model-2';

        await import('../src/lib/init.js');
        await tick(200);

        expect(h.mockState.CUSTOM_MODELS_CACHE.length).toBe(2);

        const c1 = h.mockState.CUSTOM_MODELS_CACHE.find(m => m.uniqueId === 'custom1');
        expect(c1).toBeDefined();
        expect(c1.name).toBe('Legacy 1');
        expect(c1.model).toBe('legacy-model');
        expect(c1.url).toBe('http://legacy.com');
        expect(c1.key).toBe('sk-legacy');
        expect(c1.format).toBe('anthropic');
        expect(c1.sysfirst).toBe(true);
        expect(c1.altrole).toBe(true);
        expect(c1.mustuser).toBe(true);
        expect(c1.maxout).toBe(true);
        expect(c1.mergesys).toBe(true);
        expect(c1.decoupled).toBe(true);
        expect(c1.thought).toBe(true);
        expect(c1.reasoning).toBe('parsed');
        expect(c1.verbosity).toBe('high');
        expect(c1.thinking).toBe('auto');
        expect(c1.tok).toBe('cl100k_base');
        expect(c1.customParams).toBe('');
        expect(c1.responsesMode).toBe('auto');

        const c2 = h.mockState.CUSTOM_MODELS_CACHE.find(m => m.uniqueId === 'custom2');
        expect(c2).toBeDefined();
        expect(c2.name).toBe('Custom 2'); // default name
        expect(c2.model).toBe('model-2');
        expect(c2.format).toBe('openai'); // default
    });

    it('normalizes persisted custom models loaded from cpm_custom_models JSON', async () => {
        h.mockArgStore['cpm_custom_models'] = JSON.stringify([
            {
                uniqueId: 'custom_saved',
                name: 'Saved Model',
                model: 'gpt-4.1-mini',
                url: 'https://api.example.com/v1',
                key: 'keep-on-boot',
                proxyUrl: ' https://proxy.example.com ',
                responsesMode: 'on',
                thinkingBudget: '2048',
                maxOutputLimit: '4096',
                promptCacheRetention: '24h',
                sysfirst: 'true',
                mergesys: 'true',
                altrole: 'false',
                mustuser: 'true',
                maxout: 'true',
                decoupled: 'false',
                thought: 'true',
                adaptiveThinking: 'true',
                customParams: '{"top_p":0.9}',
            },
        ]);

        await import('../src/lib/init.js');
        await tick(200);

        expect(h.mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(h.mockState.CUSTOM_MODELS_CACHE[0]).toMatchObject({
            uniqueId: 'custom_saved',
            name: 'Saved Model',
            model: 'gpt-4.1-mini',
            url: 'https://api.example.com/v1',
            key: 'keep-on-boot',
            proxyUrl: 'https://proxy.example.com',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'none',
            thinkingBudget: 2048,
            maxOutputLimit: 4096,
            promptCacheRetention: '24h',
            sysfirst: true,
            mergesys: true,
            altrole: false,
            mustuser: true,
            maxout: true,
            streaming: true,
            decoupled: false,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"top_p":0.9}',
        });
    });

    it('silent update check handles retryPendingMainPluginUpdateOnBoot throwing', async () => {
        vi.useFakeTimers();
        const { SubPluginManager } = await import('../src/lib/sub-plugin-manager.js');
        SubPluginManager.retryPendingMainPluginUpdateOnBoot.mockRejectedValue(
            new Error('network error during retry')
        );

        await import('../src/lib/init.js');
        // Advance past the 5s deferred setTimeout
        await vi.advanceTimersByTimeAsync(5200);

        // Should not crash — error is caught silently
        expect(SubPluginManager.retryPendingMainPluginUpdateOnBoot).toHaveBeenCalled();
        // checkVersionsQuiet should still be called (in the catch-all or after)
        expect(SubPluginManager.checkVersionsQuiet).toHaveBeenCalled();
    });

    it('handles streaming enabled + capable branch', async () => {
        h.mockArgStore['cpm_streaming_enabled'] = 'true';

        await import('../src/lib/init.js');
        await tick(200);

        // No error = streaming check phase completed
        expect(h.risu.pluginStorage.setItem).toHaveBeenCalled();
    });

    it('calls setupCupcakeAPI during boot', async () => {
        await import('../src/lib/init.js');
        await tick(200);

        expect(h.setupCupcakeAPI).toHaveBeenCalled();
    });

    it('calls setExposeScopeFunction with the _exposeScopeToWindow fn', async () => {
        await import('../src/lib/init.js');
        await tick(200);

        expect(h.setExposeScopeFunction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('restores settings and logs restored count', async () => {
        const { SettingsBackup } = await import('../src/lib/settings-backup.js');
        SettingsBackup.restoreIfEmpty.mockResolvedValue(5);

        await import('../src/lib/init.js');
        await tick(200);

        expect(SettingsBackup.load).toHaveBeenCalled();
        expect(SettingsBackup.restoreIfEmpty).toHaveBeenCalled();
    });

    it('skips duplicate hotkey registration when shortcut flag is already set', async () => {
        globalThis.cpmShortcutRegistered = true;

        await import('../src/lib/init.js');
        await tick(200);

        expect(h.risu.getRootDocument).not.toHaveBeenCalled();
        expect(h.mockRootDoc.addEventListener).not.toHaveBeenCalled();
    });

    it('warns in boot summary when a phase fails but boot continues', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { SettingsBackup } = await import('../src/lib/settings-backup.js');
        SettingsBackup.load.mockRejectedValueOnce(new Error('restore failed'));

        await import('../src/lib/init.js');
        await tick(200);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Boot completed with 1 warning(s):'), expect.arrayContaining([expect.stringContaining('settings-restore')]));
        warnSpy.mockRestore();
    });

    it('ignores boot-status persistence failures at the end of boot', async () => {
        h.risu.pluginStorage.setItem.mockRejectedValueOnce(new Error('pluginStorage down'));

        await expect(import('../src/lib/init.js')).resolves.toBeDefined();
        await tick(200);

        expect(h.risu.registerSetting).toHaveBeenCalled();
    });

    it('logs fallback message when dynamic fetch returns no models', async () => {
        const fetchDyn = vi.fn(async () => []);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        h.mockPendingDynamicFetchers.push({
            name: 'DynProv',
            fetchDynamicModels: fetchDyn,
        });
        h.mockIsDynamicFetchEnabled.mockResolvedValue(true);

        await import('../src/lib/init.js');
        await tick(200);

        expect(fetchDyn).toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith('[CupcakePM] No dynamic models for DynProv, using fallback.');
        logSpy.mockRestore();
    });
});
