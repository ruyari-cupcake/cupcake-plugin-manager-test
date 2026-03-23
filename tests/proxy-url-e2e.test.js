/**
 * End-to-end proxy URL test.
 * Tests the FULL flow: CUSTOM_MODELS_CACHE → router → fetchCustom → actual fetch URL.
 * This validates that proxyUrl set in a custom model config is actually applied
 * to the outgoing request URL, not just passed through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    mockSmartFetch: vi.fn(),
    mockGetArg: vi.fn().mockResolvedValue(''),
    mockGetBoolArg: vi.fn().mockResolvedValue(false),
    state: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    customFetchers: {},
    risu: {
        log: vi.fn(),
        setArgument: vi.fn(),
        getArgument: vi.fn(async () => ''),
    },
}));

// ── Mock smartNativeFetch to capture the actual URL being fetched ──
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => h.mockSmartFetch(...args),
}));

vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    safeGetArg: (...args) => h.mockGetArg(...args),
    safeGetBoolArg: (...args) => h.mockGetBoolArg(...args),
    state: h.state,
    customFetchers: h.customFetchers,
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/api-request-log.js', () => ({
    API_LOG_RESPONSE_MAX_CHARS: 0,
    API_LOG_CONSOLE_MAX_CHARS: 8000,
    API_LOG_RISU_MAX_CHARS: 2000,
    updateApiRequest: vi.fn(),
    storeApiRequest: vi.fn(() => 'req-1'),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: vi.fn().mockResolvedValue(false),
    collectStream: vi.fn(async () => ''),
}));

vi.mock('../src/lib/slot-inference.js', () => ({
    inferSlot: vi.fn(async () => ({ slot: 'chat', heuristicConfirmed: false })),
}));

vi.mock('../src/lib/token-usage.js', () => ({
    _takeTokenUsage: vi.fn(() => null),
}));

vi.mock('../src/lib/token-toast.js', () => ({
    showTokenUsageToast: vi.fn(),
}));

import { fetchByProviderId } from '../src/lib/router.js';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

function makeOkJsonResponse(body, status = 200) {
    return {
        ok: true,
        status,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

const BASIC_ARGS = {
    prompt_chat: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' },
    ],
};

describe('proxyUrl end-to-end: CUSTOM_MODELS_CACHE → router → fetchCustom → fetch URL', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.mockGetArg.mockResolvedValue('');
        h.mockGetBoolArg.mockResolvedValue(false);
        h.state.CUSTOM_MODELS_CACHE = [];
        h.state.ALL_DEFINED_MODELS = [];
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
    });

    it('proxyUrl from CUSTOM_MODELS_CACHE is applied to the fetch URL via router', async () => {
        // Simulate: user saved a custom model with proxyUrl
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'nvidia-nim-test',
            name: '[NIM] Qwen 3.5',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            proxyUrl: 'https://myserver.kr/proxy2',
            format: 'openai',
            sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
            reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
            thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
            maxOutputLimit: 0, promptCacheRetention: 'none',
            decoupled: false, thought: false, streaming: false,
            customParams: '', effort: 'none', adaptiveThinking: false,
        }];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'proxied response' } }] })
        );

        const result = await fetchByProviderId(
            { provider: 'Custom', name: '[NIM] Qwen 3.5', uniqueId: 'nvidia-nim-test' },
            BASIC_ARGS,
        );

        expect(result.success).toBe(true);
        expect(h.mockSmartFetch).toHaveBeenCalled();

        // THE CRITICAL CHECK: the URL passed to smartNativeFetch must be the PROXY URL
        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://myserver.kr/proxy2/v1/chat/completions');
        expect(fetchedUrl).not.toContain('integrate.api.nvidia.com');
    });

    it('empty proxyUrl results in direct request to original URL', async () => {
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'nvidia-direct',
            name: '[NIM] Direct',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            proxyUrl: '',
            format: 'openai',
            sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
            reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
            thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
            maxOutputLimit: 0, promptCacheRetention: 'none',
            decoupled: false, thought: false, streaming: false,
            customParams: '', effort: 'none', adaptiveThinking: false,
        }];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'direct response' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[NIM] Direct', uniqueId: 'nvidia-direct' },
            BASIC_ARGS,
        );

        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    });

    it('proxyUrl without scheme gets https:// auto-prepended', async () => {
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'nvidia-bare',
            name: '[NIM] Bare Proxy',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            proxyUrl: 'myserver.kr/proxy2',
            format: 'openai',
            sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
            reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
            thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
            maxOutputLimit: 0, promptCacheRetention: 'none',
            decoupled: false, thought: false, streaming: false,
            customParams: '', effort: 'none', adaptiveThinking: false,
        }];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'bare proxy ok' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[NIM] Bare Proxy', uniqueId: 'nvidia-bare' },
            BASIC_ARGS,
        );

        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://myserver.kr/proxy2/v1/chat/completions');
    });

    it('proxyUrl survives normalizeCustomModel round-trip', async () => {
        // Simulate the init flow: JSON → parseCustomModelsValue → normalizeCustomModel → CACHE
        const { normalizeCustomModel, parseCustomModelsValue } = await import('../src/lib/custom-model-serialization.js');

        const rawJson = JSON.stringify([{
            uniqueId: 'nvidia-rt',
            name: '[NIM] Round Trip',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            proxyUrl: 'https://myserver.kr/proxy2',
            format: 'openai',
        }]);

        const parsed = parseCustomModelsValue(rawJson).map(m => normalizeCustomModel(m));
        expect(parsed[0].proxyUrl).toBe('https://myserver.kr/proxy2');

        // Set it in CACHE and test via router
        h.state.CUSTOM_MODELS_CACHE = parsed;

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'round-trip ok' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[NIM] Round Trip', uniqueId: 'nvidia-rt' },
            BASIC_ARGS,
        );

        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://myserver.kr/proxy2/v1/chat/completions');
    });

    it('proxyUrl survives JSON serialize → deserialize round-trip (simulating page reload)', async () => {
        const { normalizeCustomModel, parseCustomModelsValue } = await import('../src/lib/custom-model-serialization.js');

        // Step 1: Create model with proxyUrl (simulates user save)
        const original = normalizeCustomModel({
            uniqueId: 'nvidia-persist',
            name: '[NIM] Persist Test',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            proxyUrl: 'myserver.kr/proxy2',  // bare domain — should get https:// prepended
            format: 'openai',
        });

        expect(original.proxyUrl).toBe('https://myserver.kr/proxy2');

        // Step 2: Serialize (simulates Risu.setArgument)
        const json = JSON.stringify([original]);

        // Step 3: Deserialize (simulates init.js loading)
        const restored = parseCustomModelsValue(json).map(m => normalizeCustomModel(m));
        expect(restored[0].proxyUrl).toBe('https://myserver.kr/proxy2');

        // Step 4: Use in router
        h.state.CUSTOM_MODELS_CACHE = restored;
        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'persist ok' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[NIM] Persist Test', uniqueId: 'nvidia-persist' },
            BASIC_ARGS,
        );

        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://myserver.kr/proxy2/v1/chat/completions');
    });

    it('proxyUrl is NOT lost when model has undefined proxyUrl (old data migration)', async () => {
        // Simulate: model data from before proxyUrl feature existed (no proxyUrl field)
        const { normalizeCustomModel, parseCustomModelsValue } = await import('../src/lib/custom-model-serialization.js');

        const oldModelData = JSON.stringify([{
            uniqueId: 'nvidia-old',
            name: '[NIM] Old Model',
            model: 'qwen3.5-397b',
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            key: 'nvapi-test123',
            format: 'openai',
            // NOTE: NO proxyUrl field — simulating old data
        }]);

        const loaded = parseCustomModelsValue(oldModelData).map(m => normalizeCustomModel(m));

        // proxyUrl should be empty string, NOT undefined
        expect(loaded[0].proxyUrl).toBe('');
        expect(loaded[0]).toHaveProperty('proxyUrl');

        // Now simulate user editing: they set proxyUrl in UI and save
        // readEditorValues equivalent:
        const updated = normalizeCustomModel({
            ...loaded[0],
            proxyUrl: 'https://myserver.kr/proxy2',
        });

        // Merge like the save handler does:
        // state.CUSTOM_MODELS_CACHE[idx] = { ...existing, ...newModel }
        const merged = { ...loaded[0], ...updated };
        expect(merged.proxyUrl).toBe('https://myserver.kr/proxy2');

        // Serialize and restore (simulating page reload)
        const savedJson = JSON.stringify([merged]);
        const afterReload = parseCustomModelsValue(savedJson).map(m => normalizeCustomModel(m));
        expect(afterReload[0].proxyUrl).toBe('https://myserver.kr/proxy2');
    });
});

// ──────────────────────────────────────────────────────────
// proxyDirect + proxyKey: Direct mode & X-Proxy-Token header
// ──────────────────────────────────────────────────────────
describe('proxyDirect + proxyKey end-to-end', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.mockGetArg.mockResolvedValue('');
        h.mockGetBoolArg.mockResolvedValue(false);
        h.state.CUSTOM_MODELS_CACHE = [];
        h.state.ALL_DEFINED_MODELS = [];
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
    });

    /** @param {Record<string,any>} overrides */
    function makeModel(overrides = {}) {
        return {
            uniqueId: 'proxy-direct-test',
            name: '[Test] Proxy Direct',
            model: 'gpt-4o',
            url: 'https://api.openai.com/v1/chat/completions',
            key: 'sk-test123',
            proxyUrl: 'https://my-proxy.example.com',
            proxyDirect: true,
            proxyKey: '',
            format: 'openai',
            sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
            reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
            thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
            maxOutputLimit: 0, promptCacheRetention: 'none',
            decoupled: false, thought: false, streaming: false,
            customParams: '', effort: 'none', adaptiveThinking: false,
            ...overrides,
        };
    }

    it('Direct mode sends request to proxyUrl with X-Target-URL header', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel()];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'direct ok' } }] })
        );

        const result = await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        expect(result.success).toBe(true);
        expect(h.mockSmartFetch).toHaveBeenCalled();

        // Direct mode: URL should be the proxy URL itself, NOT the original target
        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toBe('https://my-proxy.example.com');

        // Headers should contain X-Target-URL
        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers['X-Target-URL']).toBe(
            'https://api.openai.com/v1/chat/completions'
        );
    });

    it('Direct mode + proxyKey injects X-Proxy-Token header', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel({ proxyKey: 'my-secret-token-123' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'authed' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers['X-Proxy-Token']).toBe('my-secret-token-123');
        expect(fetchedOptions.headers['X-Target-URL']).toBe(
            'https://api.openai.com/v1/chat/completions'
        );
    });

    it('Direct mode without proxyKey does NOT send X-Proxy-Token', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel({ proxyKey: '' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no token' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers).not.toHaveProperty('X-Proxy-Token');
        expect(fetchedOptions.headers['X-Target-URL']).toBeDefined();
    });

    it('Rewrite mode + proxyKey injects X-Proxy-Token header', async () => {
        // proxyDirect: false → Rewrite mode (default)
        h.state.CUSTOM_MODELS_CACHE = [makeModel({
            proxyDirect: false,
            proxyKey: 'rewrite-secret-456',
        })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'rewrite authed' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        // Rewrite mode: URL should be rewritten (proxy domain + original path)
        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        expect(fetchedUrl).toContain('my-proxy.example.com');
        expect(fetchedUrl).toContain('/v1/chat/completions');

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers['X-Proxy-Token']).toBe('rewrite-secret-456');
        expect(fetchedOptions.headers['X-Target-URL']).toBe(
            'https://api.openai.com/v1/chat/completions'
        );
    });

    it('proxyKey with whitespace is trimmed', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel({ proxyKey: '  trimmed-token  ' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'trimmed' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers['X-Proxy-Token']).toBe('trimmed-token');
    });

    it('proxyKey survives normalizeCustomModel round-trip', async () => {
        const { normalizeCustomModel, parseCustomModelsValue } = await import('../src/lib/custom-model-serialization.js');

        const rawJson = JSON.stringify([{
            uniqueId: 'proxy-key-rt',
            name: '[Test] ProxyKey RT',
            model: 'gpt-4o',
            url: 'https://api.openai.com/v1/chat/completions',
            key: 'sk-test',
            proxyUrl: 'https://my-proxy.example.com',
            proxyDirect: true,
            proxyKey: 'roundtrip-secret',
            format: 'openai',
        }]);

        const parsed = parseCustomModelsValue(rawJson).map(m => normalizeCustomModel(m));
        expect(parsed[0].proxyKey).toBe('roundtrip-secret');
        expect(parsed[0].proxyDirect).toBe(true);

        // Serialize → deserialize
        const json2 = JSON.stringify(parsed);
        const restored = parseCustomModelsValue(json2).map(m => normalizeCustomModel(m));
        expect(restored[0].proxyKey).toBe('roundtrip-secret');
    });

    it('old data without proxyKey normalizes to empty string', async () => {
        const { normalizeCustomModel } = await import('../src/lib/custom-model-serialization.js');

        const old = normalizeCustomModel({
            uniqueId: 'old-no-key',
            name: '[Old] No ProxyKey',
            model: 'gpt-4o',
            url: 'https://api.openai.com/v1/chat/completions',
            key: 'sk-test',
            format: 'openai',
            // no proxyKey field
        });

        expect(old).toHaveProperty('proxyKey');
        expect(old.proxyKey).toBe('');
    });

    it('proxyKey only-whitespace treated as empty (no X-Proxy-Token sent)', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel({ proxyKey: '   ' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'ws only' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers).not.toHaveProperty('X-Proxy-Token');
    });

    it('proxyDirect false + proxyUrl sends API key in Authorization header (not leaked via X-Proxy-Token)', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeModel({
            proxyDirect: false,
            proxyKey: '',
        })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no leak' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers).not.toHaveProperty('X-Proxy-Token');
        // Authorization should contain the API key, not the proxyKey
        expect(fetchedOptions.headers['Authorization']).toContain('sk-test123');
    });

    it('proxyDirect + proxyUrl without proxyUrl gives no proxy at all', async () => {
        // If proxyUrl is empty, proxyDirect should have no effect
        h.state.CUSTOM_MODELS_CACHE = [makeModel({
            proxyUrl: '',
            proxyDirect: true,
            proxyKey: 'should-not-appear',
        })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no proxy' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Test] Proxy Direct', uniqueId: 'proxy-direct-test' },
            BASIC_ARGS,
        );

        const fetchedUrl = h.mockSmartFetch.mock.calls[0][0];
        // Should go to original URL since proxyUrl is empty
        expect(fetchedUrl).toBe('https://api.openai.com/v1/chat/completions');
        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        expect(fetchedOptions.headers).not.toHaveProperty('X-Proxy-Token');
        expect(fetchedOptions.headers).not.toHaveProperty('X-Target-URL');
    });
});

// ──────────────────────────────────────────────────────────
// Copilot Gemini reasoning_effort via custom model
// ──────────────────────────────────────────────────────────
describe('Copilot Gemini reasoning_effort injection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.mockGetArg.mockResolvedValue('');
        h.mockGetBoolArg.mockResolvedValue(false);
        h.state.CUSTOM_MODELS_CACHE = [];
        h.state.ALL_DEFINED_MODELS = [];
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
    });

    /** @param {Record<string,any>} overrides */
    function makeCopilotGeminiModel(overrides = {}) {
        return {
            uniqueId: 'copilot-gemini-test',
            name: '[Copilot] gemini-2.5-flash',
            model: 'gemini-2.5-flash',
            url: 'https://api.example.com/v1/chat/completions',
            key: 'test-key-123',
            format: 'openai',
            sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
            reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
            thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
            maxOutputLimit: 0, promptCacheRetention: 'none',
            decoupled: false, thought: false, streaming: false,
            customParams: '', effort: 'none', adaptiveThinking: false,
            ...overrides,
        };
    }

    it('Gemini model with reasoning="medium" injects reasoning_effort', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeCopilotGeminiModel({ reasoning: 'medium' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'gemini thinking' } }] })
        );

        const result = await fetchByProviderId(
            { provider: 'Custom', name: '[Copilot] gemini-2.5-flash', uniqueId: 'copilot-gemini-test' },
            BASIC_ARGS,
        );

        expect(result.success).toBe(true);

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        const body = JSON.parse(fetchedOptions.body);
        expect(body.reasoning_effort).toBe('medium');
    });

    it('Gemini model with reasoning="none" does NOT inject reasoning_effort', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeCopilotGeminiModel({ reasoning: 'none' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no reasoning' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Copilot] gemini-2.5-flash', uniqueId: 'copilot-gemini-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        const body = JSON.parse(fetchedOptions.body);
        expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('slot _cpmSlotThinkingConfig injects reasoning_effort for Gemini via slot override', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeCopilotGeminiModel({ reasoning: 'low' })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'slot override' } }] })
        );

        // Slot override: reasoning = 'high'
        const result = await fetchByProviderId(
            { provider: 'Custom', name: '[Copilot] gemini-2.5-flash', uniqueId: 'copilot-gemini-test' },
            { ...BASIC_ARGS, _cpmSlotThinkingConfig: { reasoning: 'high' } },
        );

        expect(result.success).toBe(true);
        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        const body = JSON.parse(fetchedOptions.body);
        expect(body.reasoning_effort).toBe('high');
    });

    it('Gemini 3 model injects reasoning_effort', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeCopilotGeminiModel({
            model: 'gemini-3-pro',
            name: '[Copilot] gemini-3-pro',
            reasoning: 'high',
        })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'gemini3 thinking' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Copilot] gemini-3-pro', uniqueId: 'copilot-gemini-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        const body = JSON.parse(fetchedOptions.body);
        expect(body.reasoning_effort).toBe('high');
    });

    it('non-Gemini non-o3 model does NOT get reasoning_effort even with reasoning set', async () => {
        h.state.CUSTOM_MODELS_CACHE = [makeCopilotGeminiModel({
            model: 'gpt-4o',
            name: '[Copilot] gpt-4o',
            reasoning: 'medium',
        })];

        h.mockSmartFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no reasoning for gpt4o' } }] })
        );

        await fetchByProviderId(
            { provider: 'Custom', name: '[Copilot] gpt-4o', uniqueId: 'copilot-gemini-test' },
            BASIC_ARGS,
        );

        const fetchedOptions = h.mockSmartFetch.mock.calls[0][1];
        const body = JSON.parse(fetchedOptions.body);
        expect(body).not.toHaveProperty('reasoning_effort');
    });
});
