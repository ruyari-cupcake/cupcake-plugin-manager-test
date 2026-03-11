/**
 * Integration tests for router.js — handleRequest + fetchByProviderId.
 * Tests the full routing pipeline:
 *   - handleRequest validation and slot inference
 *   - fetchByProviderId dispatch to custom fetchers
 *   - Custom model resolution from cache
 *   - Fallback parameter application
 *   - Error normalization
 *   - Token usage toast integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted variables (accessible from vi.mock factories) ──
const { mockArgStore, mockState, mockCustomFetchers, mockFetchCustom, counter } = vi.hoisted(() => ({
    mockArgStore: {},
    mockState: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    mockCustomFetchers: {},
    mockFetchCustom: vi.fn(),
    counter: { reqId: 0 },
}));

// ── Mock shared-state ──
vi.mock('../src/lib/shared-state.js', () => ({
    Risu: { log: vi.fn() },
    state: mockState,
    customFetchers: mockCustomFetchers,
    safeGetArg: vi.fn(async (key, def = '') => mockArgStore[key] ?? def),
    safeGetBoolArg: vi.fn(async (key, def = false) => {
        const v = mockArgStore[key];
        if (v === undefined) return def;
        return v === true || v === 'true';
    }),
}));

// ── Mock slot-inference ──
vi.mock('../src/lib/slot-inference.js', () => ({
    inferSlot: vi.fn().mockResolvedValue('chat'),
    CPM_SLOT_LIST: ['translation', 'emotion', 'memory', 'other'],
}));

// ── Mock fetch-custom ──
vi.mock('../src/lib/fetch-custom.js', () => ({
    fetchCustom: (...args) => mockFetchCustom(...args),
}));

// ── Mock api-request-log ──
vi.mock('../src/lib/api-request-log.js', () => ({
    storeApiRequest: vi.fn(() => `req-${++counter.reqId}`),
    updateApiRequest: vi.fn(),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

// ── Mock token-usage ──
vi.mock('../src/lib/token-usage.js', () => ({
    _takeTokenUsage: vi.fn(() => null),
}));

// ── Mock token-toast ──
vi.mock('../src/lib/token-toast.js', () => ({
    showTokenUsageToast: vi.fn(),
}));

// ── Mock stream-utils ──
vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: vi.fn(async (stream) => {
        const reader = stream.getReader();
        const chunks = [];
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(typeof value === 'string' ? value : decoder.decode(value));
        }
        return chunks.join('');
    }),
    checkStreamCapability: vi.fn().mockResolvedValue(false),
}));

// ── Mock sanitize ──
vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeMessages: vi.fn((msgs) => msgs?.filter(m => m != null) ?? []),
}));

import { handleRequest, fetchByProviderId, _toFiniteFloat, _toFiniteInt } from '../src/lib/router.js';
import { inferSlot } from '../src/lib/slot-inference.js';

describe('handleRequest — Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        counter.reqId = 0;
        Object.keys(mockArgStore).forEach(k => delete mockArgStore[k]);
        Object.keys(mockCustomFetchers).forEach(k => delete mockCustomFetchers[k]);
        mockState.ALL_DEFINED_MODELS = [];
        mockState.CUSTOM_MODELS_CACHE = [];
        inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
    });

    it('returns error for null model definition', async () => {
        const result = await handleRequest({}, null, undefined);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Invalid model selection');
    });

    it('returns error for model def without provider', async () => {
        const result = await handleRequest({}, { name: 'test' }, undefined);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Invalid model selection');
    });

    it('handles non-object args gracefully', async () => {
        mockFetchCustom.mockResolvedValue({ success: true, content: 'ok' });
        mockState.CUSTOM_MODELS_CACHE = [{ uniqueId: 'custom1', url: 'http://x', model: 'm', format: 'openai' }];

        const modelDef = { provider: 'Custom', uniqueId: 'custom1', name: 'Test' };
        const result = await handleRequest(null, modelDef, undefined);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
    });

    it('normalizes undefined result.success to boolean', async () => {
        // Register a custom fetcher that returns malformed result
        mockCustomFetchers['TestProvider'] = vi.fn().mockResolvedValue({ content: 'partial' });

        const modelDef = { provider: 'TestProvider', name: 'TestModel' };
        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, modelDef, undefined);

        expect(typeof result.success).toBe('boolean');
        expect(result.success).toBe(false); // undefined coerced to false
    });

    it('normalizes null result.content to empty string', async () => {
        mockCustomFetchers['TestProvider'] = vi.fn().mockResolvedValue({ success: true, content: null });

        const modelDef = { provider: 'TestProvider', name: 'Test' };
        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, modelDef, undefined);

        expect(result.content).toBe('');
    });

    it('collects ReadableStream when streaming disabled', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('Hello '));
                controller.enqueue(encoder.encode('World'));
                controller.close();
            },
        });

        mockCustomFetchers['TestProvider'] = vi.fn().mockResolvedValue({ success: true, content: stream });

        const modelDef = { provider: 'TestProvider', name: 'Test' };
        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, modelDef, undefined);

        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello World');
    });
});

describe('fetchByProviderId — Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        counter.reqId = 0;
        Object.keys(mockArgStore).forEach(k => delete mockArgStore[k]);
        Object.keys(mockCustomFetchers).forEach(k => delete mockCustomFetchers[k]);
        mockState.ALL_DEFINED_MODELS = [];
        mockState.CUSTOM_MODELS_CACHE = [];
    });

    it('dispatches to custom fetcher when provider has registered fetcher', async () => {
        const customResult = { success: true, content: 'custom result' };
        mockCustomFetchers['OpenAI'] = vi.fn().mockResolvedValue(customResult);

        const modelDef = { provider: 'OpenAI', name: 'GPT-4o', uniqueId: 'openai-gpt4o' };
        const result = await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        expect(result).toEqual(customResult);
        expect(mockCustomFetchers['OpenAI']).toHaveBeenCalledOnce();
    });

    it('dispatches Custom provider to fetchCustom with correct config', async () => {
        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_123',
            url: 'https://api.example.com/v1/chat',
            key: 'sk-custom',
            model: 'my-model',
            format: 'openai',
            sysfirst: false,
            altrole: false,
            mustuser: false,
            maxout: false,
            mergesys: false,
            reasoning: 'none',
            verbosity: 'none',
            responsesMode: 'auto',
            thinking: 'none',
            tok: 'o200k_base',
            thinkingBudget: 0,
            promptCacheRetention: 'none',
            decoupled: false,
            thought: false,
            customParams: '',
            effort: 'none',
        }];

        mockFetchCustom.mockResolvedValue({ success: true, content: 'custom model result' });

        const modelDef = { provider: 'Custom', uniqueId: 'custom_123', name: 'MyModel' };
        const result = await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('custom model result');
        expect(mockFetchCustom).toHaveBeenCalledOnce();

        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.url).toBe('https://api.example.com/v1/chat');
        expect(config.model).toBe('my-model');
        expect(config.format).toBe('openai');
    });

    it('passes adaptiveThinking flag from CUSTOM_MODELS_CACHE to fetchCustom', async () => {
        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_adaptive',
            url: 'https://api.anthropic.com/v1/messages',
            key: 'sk-ant-test',
            model: 'claude-opus-4-6',
            format: 'anthropic',
            effort: 'high',
            adaptiveThinking: true,
            thinking: 'none',
            thinkingBudget: 0,
        }];

        mockFetchCustom.mockResolvedValue({ success: true, content: 'adaptive result' });

        const modelDef = { provider: 'Custom', uniqueId: 'custom_adaptive', name: 'Opus 4.6 Adaptive' };
        await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.adaptiveThinking).toBe(true);
        expect(config.effort).toBe('high');
    });

    it('adaptiveThinking defaults to false when not set in CUSTOM_MODELS_CACHE', async () => {
        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_no_adaptive',
            url: 'https://api.anthropic.com/v1/messages',
            key: 'sk-ant-test',
            model: 'claude-sonnet-4-20250514',
            format: 'anthropic',
            effort: 'high',
            // adaptiveThinking not set
        }];

        mockFetchCustom.mockResolvedValue({ success: true, content: 'no adaptive result' });

        const modelDef = { provider: 'Custom', uniqueId: 'custom_no_adaptive', name: 'Sonnet no adaptive' };
        await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.adaptiveThinking).toBe(false);
    });

    it('returns error for unknown Custom model uniqueId', async () => {
        mockState.CUSTOM_MODELS_CACHE = [];

        const modelDef = { provider: 'Custom', uniqueId: 'nonexistent', name: 'Ghost' };
        const result = await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        expect(result.success).toBe(false);
        expect(result.content).toContain('not found');
    });

    it('returns error for unknown provider', async () => {
        const modelDef = { provider: 'UnknownProvider', name: 'Test' };
        const result = await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        expect(result.success).toBe(false);
        expect(result.content).toContain('Unknown provider');
    });

    it('applies fallback temperature from global config', async () => {
        mockArgStore['cpm_fallback_temp'] = '0.5';
        mockFetchCustom.mockResolvedValue({ success: true, content: 'ok' });

        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_1', url: 'http://x', key: 'k', model: 'm', format: 'openai',
        }];

        const modelDef = { provider: 'Custom', uniqueId: 'custom_1', name: 'Test' };
        const args = { prompt_chat: [{ role: 'user', content: 'hi' }] }; // no temperature
        await fetchByProviderId(modelDef, args, undefined, 'req-1');

        // fetchCustom receives the fallback temp (0.5) since args.temperature is undefined
        const temp = mockFetchCustom.mock.calls[0][2];
        expect(temp).toBe(0.5);
    });

    it('leaves temperature undefined when no fallback configured', async () => {
        mockFetchCustom.mockResolvedValue({ success: true, content: 'ok' });

        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_1', url: 'http://x', key: 'k', model: 'm', format: 'openai',
        }];

        const modelDef = { provider: 'Custom', uniqueId: 'custom_1', name: 'Test' };
        const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };
        await fetchByProviderId(modelDef, args, undefined, 'req-1');

        const temp = mockFetchCustom.mock.calls[0][2];
        expect(temp).toBeUndefined();
    });

    it('applies fallback top_p and frequency_penalty from global config', async () => {
        mockArgStore['cpm_fallback_top_p'] = '0.9';
        mockArgStore['cpm_fallback_freq_pen'] = '0.3';
        mockFetchCustom.mockResolvedValue({ success: true, content: 'ok' });

        mockState.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_1', url: 'http://x', key: 'k', model: 'm', format: 'openai',
        }];

        const modelDef = { provider: 'Custom', uniqueId: 'custom_1', name: 'Test' };
        const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };
        await fetchByProviderId(modelDef, args, undefined, 'req-1');

        // Args should have been mutated with fallback values
        expect(args.top_p).toBe(0.9);
        expect(args.frequency_penalty).toBe(0.3);
    });

    it('catches provider crash and returns error', async () => {
        mockCustomFetchers['CrashProvider'] = vi.fn().mockRejectedValue(new Error('boom'));

        const modelDef = { provider: 'CrashProvider', name: 'Crashy' };
        const result = await fetchByProviderId(modelDef, { prompt_chat: [{ role: 'user', content: 'hi' }] }, undefined, 'req-1');

        expect(result.success).toBe(false);
        expect(result.content).toContain('Crash');
        expect(result.content).toContain('boom');
    });
});

describe('handleRequest — Slot override integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        counter.reqId = 0;
        Object.keys(mockArgStore).forEach(k => delete mockArgStore[k]);
        Object.keys(mockCustomFetchers).forEach(k => delete mockCustomFetchers[k]);
        mockState.ALL_DEFINED_MODELS = [];
        mockState.CUSTOM_MODELS_CACHE = [];
    });

    it('applies slot-specific param overrides for non-chat slots', async () => {
        inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: true });
        mockArgStore['cpm_slot_translation_temp'] = '0.3';
        mockArgStore['cpm_slot_translation_max_out'] = '2048';

        mockCustomFetchers['TestProvider'] = vi.fn().mockResolvedValue({ success: true, content: 'translated' });

        const modelDef = { provider: 'TestProvider', name: 'TransModel' };
        const args = { prompt_chat: [{ role: 'user', content: 'translate this' }] };
        await handleRequest(args, modelDef, undefined);

        // Slot overrides should have been applied to args before dispatch
        expect(args.temperature).toBe(0.3);
        expect(args.max_tokens).toBe(2048);
    });

    it('does NOT apply slot overrides for chat slot', async () => {
        inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        mockArgStore['cpm_slot_translation_temp'] = '0.3';

        mockCustomFetchers['TestProvider'] = vi.fn().mockResolvedValue({ success: true, content: 'chat response' });

        const modelDef = { provider: 'TestProvider', name: 'ChatModel' };
        const args = { prompt_chat: [{ role: 'user', content: 'hello' }] };
        await handleRequest(args, modelDef, undefined);

        expect(args.temperature).toBeUndefined();
    });
});
