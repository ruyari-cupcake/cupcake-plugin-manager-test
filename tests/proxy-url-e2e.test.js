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
import { fetchCustom } from '../src/lib/fetch-custom.js';

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
