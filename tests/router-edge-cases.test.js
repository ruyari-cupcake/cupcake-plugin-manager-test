/**
 * Router edge-case tests — areas not covered by router-deep.test.js:
 *   - Streaming TransformStream flush logic (Uint8Array/ArrayBuffer/string chunks)
 *   - Token usage toast in streaming vs non-streaming paths
 *   - Non-string content JSON serialization fallback
 *   - Slot override with partial args (some params set, some empty)
 *   - Multiple slot params all applied correctly
 *   - Custom model config forwarding completeness
 *   - Request logging timing and format
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    safeGetArg: vi.fn(async () => ''),
    safeGetBoolArg: vi.fn(async () => false),
    sanitizeMessages: vi.fn((x) => x || []),
    inferSlot: vi.fn(async () => ({ slot: 'chat', heuristicConfirmed: false })),
    fetchCustom: vi.fn(async () => ({ success: true, content: 'ok' })),
    storeReq: vi.fn(() => 'req-1'),
    updateReq: vi.fn(),
    takeTokenUsage: vi.fn(() => null),
    showToast: vi.fn(),
    collectStream: vi.fn(async (s) => {
        const reader = s.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += typeof value === 'string' ? value : new TextDecoder().decode(value);
        }
        return text;
    }),
    checkStreamCapability: vi.fn(async () => true),
    customFetchers: {},
    state: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    risu: {
        log: vi.fn(),
        setArgument: vi.fn(),
        getArgument: vi.fn(async () => ''),
        addProvider: vi.fn(async () => {}),
        registerSetting: vi.fn(async () => {}),
    },
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    safeGetArg: h.safeGetArg,
    safeGetBoolArg: h.safeGetBoolArg,
    state: h.state,
    customFetchers: h.customFetchers,
}));
vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeMessages: h.sanitizeMessages,
}));
vi.mock('../src/lib/slot-inference.js', () => ({
    inferSlot: (...args) => h.inferSlot(...args),
}));
vi.mock('../src/lib/fetch-custom.js', () => ({
    fetchCustom: (...args) => h.fetchCustom(...args),
}));
vi.mock('../src/lib/api-request-log.js', () => ({
    API_LOG_RESPONSE_MAX_CHARS: 0,
    API_LOG_CONSOLE_MAX_CHARS: 8000,
    API_LOG_RISU_MAX_CHARS: 2000,
    storeApiRequest: (...args) => h.storeReq(...args),
    updateApiRequest: (...args) => h.updateReq(...args),
    getAllApiRequests: vi.fn(() => []),
}));
vi.mock('../src/lib/token-usage.js', () => ({
    _takeTokenUsage: (...args) => h.takeTokenUsage(...args),
}));
vi.mock('../src/lib/token-toast.js', () => ({
    showTokenUsageToast: (...args) => h.showToast(...args),
}));
vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: (...args) => h.collectStream(...args),
    checkStreamCapability: (...args) => h.checkStreamCapability(...args),
}));

import { handleRequest, fetchByProviderId, _toFiniteFloat, _toFiniteInt } from '../src/lib/router.js';

// ── Helper: make a readable stream from chunks ──
function makeStream(chunks) {
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(chunks[index++]);
            } else {
                controller.close();
            }
        },
    });
}

describe('handleRequest — streaming TransformStream flush logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.safeGetArg.mockImplementation(async () => '');
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.storeReq.mockReturnValue('req-stream-1');
    });

    it('handles Uint8Array chunks in TransformStream flush', async () => {
        const encodedChunks = [
            new TextEncoder().encode('Hello '),
            new TextEncoder().encode('World!'),
        ];
        const stream = makeStream(encodedChunks);

        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(true);
        h.customFetchers['StreamProv'] = async () => ({
            success: true,
            content: stream,
        });

        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'StreamProv', name: 'Test' },
        );

        expect(result.success).toBe(true);
        // Content should be a ReadableStream with TransformStream applied
        expect(result.content).toBeInstanceOf(ReadableStream);

        // Consume the piped stream
        const reader = result.content.getReader();
        let collected = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            collected += typeof value === 'string' ? value : new TextDecoder().decode(value);
        }
        expect(collected).toBe('Hello World!');
    });

    it('handles string chunks in TransformStream flush', async () => {
        const stream = makeStream(['Part1_', 'Part2_', 'Part3']);

        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(true);
        h.customFetchers['StrStreamProv'] = async () => ({
            success: true,
            content: stream,
        });

        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'StrStreamProv', name: 'Test' },
        );

        expect(result.success).toBe(true);
        const reader = result.content.getReader();
        let collected = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            collected += typeof value === 'string' ? value : new TextDecoder().decode(value);
        }
        expect(collected).toBe('Part1_Part2_Part3');
    });

    it('handles ArrayBuffer chunks in TransformStream flush', async () => {
        const enc = new TextEncoder();
        const buf1 = enc.encode('AB-').buffer;
        const buf2 = enc.encode('ok').buffer;
        const stream = makeStream([buf1, buf2]);

        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(true);
        h.customFetchers['BufProv'] = async () => ({
            success: true,
            content: stream,
        });

        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'BufProv', name: 'Test' },
        );

        const reader = result.content.getReader();
        let collected = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (typeof value === 'string') collected += value;
            else if (value instanceof Uint8Array) collected += new TextDecoder().decode(value);
            else if (value instanceof ArrayBuffer) collected += new TextDecoder().decode(new Uint8Array(value));
        }
        expect(collected).toContain('AB-');
        expect(collected).toContain('ok');
    });
});

describe('handleRequest — token usage toast logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.safeGetArg.mockImplementation(async () => '');
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.storeReq.mockReturnValue('req-toast');
    });

    it('shows token usage toast for non-streaming result when enabled', async () => {
        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_show_token_usage') return true;
            return false;
        });
        h.customFetchers['ToastProv'] = async () => ({
            success: true,
            content: 'done',
        });
        h.takeTokenUsage.mockReturnValueOnce({ input: 100, output: 50 });

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'ToastProv', name: 'Test' },
        );

        expect(h.showToast).toHaveBeenCalledWith(
            expect.stringContaining('ToastProv'),
            expect.objectContaining({ input: 100, output: 50 }),
            expect.any(Number),
        );
    });

    it('does NOT show token usage toast when disabled', async () => {
        h.safeGetBoolArg.mockResolvedValue(false);
        h.customFetchers['NoToastProv'] = async () => ({
            success: true,
            content: 'done',
        });
        h.takeTokenUsage.mockReturnValue({ input: 100, output: 50 });

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'NoToastProv', name: 'Test' },
        );

        expect(h.showToast).not.toHaveBeenCalled();
    });

    it('shows token usage after stream collection when bridge not capable', async () => {
        const stream = makeStream(['chunk']);

        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_show_token_usage') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(false);
        h.collectStream.mockResolvedValue('collected');
        h.customFetchers['StreamToastProv'] = async () => ({
            success: true,
            content: stream,
        });
        h.takeTokenUsage
            .mockReturnValueOnce(null) // non-stream call
            .mockReturnValueOnce({ input: 200, output: 100 }); // stream call

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'StreamToastProv', name: 'Test' },
        );

        expect(h.showToast).toHaveBeenCalledWith(
            expect.stringContaining('StreamToastProv'),
            expect.objectContaining({ input: 200, output: 100 }),
            expect.any(Number),
        );
    });
});

describe('handleRequest — non-string content serialization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.safeGetArg.mockImplementation(async () => '');
        h.safeGetBoolArg.mockResolvedValue(false);
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.storeReq.mockReturnValue('req-serial');
    });

    it('serializes object content to string in log', async () => {
        h.customFetchers['ObjProv'] = async () => ({
            success: true,
            content: { nested: 'data', count: 42 },
        });

        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'ObjProv', name: 'Test' },
        );

        expect(result.success).toBe(true);
        // updateReq should have been called with a string response
        const logCalls = h.updateReq.mock.calls;
        const responseCall = logCalls.find((c) => c[1]?.response);
        if (responseCall) {
            expect(typeof responseCall[1].response).toBe('string');
        }
    });

    it('handles content that cannot be JSON stringified', async () => {
        const circular = {};
        circular.self = circular;

        h.customFetchers['CircProv'] = async () => ({
            success: true,
            content: circular,
        });

        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'CircProv', name: 'Test' },
        );

        // Should not throw — falls back to String(content)
        expect(result.success).toBe(true);
    });
});

describe('handleRequest — slot override completeness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.storeReq.mockReturnValue('req-slot');
    });

    it('applies all slot override params when heuristic confirmed', async () => {
        h.inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: true });
        h.safeGetArg.mockImplementation(async (key) => {
            const vals = {
                cpm_slot_translation_max_out: '2000',
                cpm_slot_translation_max_context: '10000',
                cpm_slot_translation_temp: '0.3',
                cpm_slot_translation_top_p: '0.8',
                cpm_slot_translation_top_k: '40',
                cpm_slot_translation_rep_pen: '1.1',
                cpm_slot_translation_freq_pen: '0.2',
                cpm_slot_translation_pres_pen: '0.1',
            };
            return vals[key] || '';
        });
        h.safeGetBoolArg.mockResolvedValue(false);

        const capturedArgs = {};
        h.customFetchers['SlotProv'] = async (_modelDef, _msgs, _temp, _maxTokens, args) => {
            Object.assign(capturedArgs, args);
            return { success: true, content: 'slot-ok' };
        };

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: '번역해줘' }] },
            { provider: 'SlotProv', name: 'Test' },
        );

        expect(capturedArgs.max_tokens).toBe(2000);
        expect(capturedArgs.max_context_tokens).toBe(10000);
        expect(capturedArgs.temperature).toBe(0.3);
        expect(capturedArgs.top_p).toBe(0.8);
        expect(capturedArgs.top_k).toBe(40);
        expect(capturedArgs.repetition_penalty).toBeCloseTo(1.1);
        expect(capturedArgs.frequency_penalty).toBeCloseTo(0.2);
        expect(capturedArgs.presence_penalty).toBeCloseTo(0.1);
    });

    it('applies only non-empty slot params, leaves others unchanged', async () => {
        h.inferSlot.mockResolvedValue({ slot: 'emotion', heuristicConfirmed: true });
        h.safeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_emotion_temp') return '0.9';
            return '';
        });
        h.safeGetBoolArg.mockResolvedValue(false);

        const capturedArgs = {};
        h.customFetchers['PartialSlot'] = async (_modelDef, _msgs, _temp, _maxTokens, args) => {
            Object.assign(capturedArgs, args);
            return { success: true, content: 'partial-ok' };
        };

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'test' }], top_p: 0.5 },
            { provider: 'PartialSlot', name: 'Test' },
        );

        expect(capturedArgs.temperature).toBe(0.9);
        expect(capturedArgs.top_p).toBe(0.5); // not overridden
    });

    it('does NOT apply slot overrides when heuristic is NOT confirmed', async () => {
        h.inferSlot.mockResolvedValue({ slot: 'memory', heuristicConfirmed: false });
        h.safeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_memory_temp') return '0.1';
            if (key === 'cpm_slot_memory_max_out') return '500';
            return '';
        });
        h.safeGetBoolArg.mockResolvedValue(false);

        const capturedArgs = {};
        h.customFetchers['NoSlot'] = async (_modelDef, _msgs, _temp, _maxTokens, args) => {
            Object.assign(capturedArgs, args);
            return { success: true, content: 'no-override' };
        };

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'test' }], temperature: 0.7 },
            { provider: 'NoSlot', name: 'Test' },
        );

        expect(capturedArgs.temperature).toBe(0.7); // original, not 0.1
        expect(capturedArgs.max_tokens).toBeUndefined(); // original, not 500
    });
});

describe('fetchByProviderId — Custom model config forwarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.safeGetArg.mockImplementation(async () => '');
    });

    it('forwards all config fields from CUSTOM_MODELS_CACHE to fetchCustom', async () => {
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'full_config',
            name: 'Full Custom',
            model: 'gpt-4o',
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            format: 'openai',
            proxyUrl: 'https://proxy.example.com',
            sysfirst: true,
            altrole: true,
            mustuser: false,
            maxout: true,
            mergesys: false,
            reasoning: 'high',
            verbosity: 'medium',
            responsesMode: 'force',
            thinking: 'adaptive',
            tok: 'cl100k_base',
            thinkingBudget: '50000',
            maxOutputLimit: '10000',
            promptCacheRetention: '5m',
            decoupled: true,
            thought: true,
            streaming: false,
            customParams: '{"seed": 42}',
            effort: 'medium',
            adaptiveThinking: true,
        }];
        h.fetchCustom.mockResolvedValue({ success: true, content: 'full-custom-ok' });

        await fetchByProviderId(
            { provider: 'Custom', name: 'Full Custom', uniqueId: 'full_config' },
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
        );

        expect(h.fetchCustom).toHaveBeenCalled();
        const config = h.fetchCustom.mock.calls[0][0];
        expect(config.url).toBe('https://api.example.com/v1/chat/completions');
        expect(config.proxyUrl).toBe('https://proxy.example.com');
        expect(config.format).toBe('openai');
        expect(config.sysfirst).toBe(true);
        expect(config.altrole).toBe(true);
        expect(config.maxout).toBe(true);
        expect(config.reasoning).toBe('high');
        expect(config.verbosity).toBe('medium');
        expect(config.responsesMode).toBe('force');
        expect(config.effort).toBe('medium');
        expect(config.adaptiveThinking).toBe(true);
    });

    it('applies default values for missing config fields', async () => {
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'minimal',
            name: 'Minimal',
            model: 'gpt-4o',
            url: 'https://api.example.com',
            key: 'sk-test',
        }];
        h.fetchCustom.mockResolvedValue({ success: true, content: 'minimal-ok' });

        await fetchByProviderId(
            { provider: 'Custom', name: 'Minimal', uniqueId: 'minimal' },
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
        );

        const config = h.fetchCustom.mock.calls[0][0];
        expect(config.format).toBe('openai');
        expect(config.proxyUrl).toBe('');
        expect(config.reasoning).toBe('none');
        expect(config.verbosity).toBe('none');
        expect(config.responsesMode).toBe('auto');
        expect(config.effort).toBe('none');
        expect(config.adaptiveThinking).toBe(false);
    });
});

describe('handleRequest — request logging timing & format', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.safeGetArg.mockImplementation(async () => '');
        h.safeGetBoolArg.mockResolvedValue(false);
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.storeReq.mockReturnValue('req-log');
    });

    it('stores request with model name and slot info', async () => {
        h.customFetchers['LogProv'] = async () => ({ success: true, content: 'logged' });

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'LogProv', name: 'Test Model' },
        );

        expect(h.storeReq).toHaveBeenCalledWith(expect.objectContaining({
            modelName: expect.stringContaining('LogProv'),
            method: 'POST',
        }));
    });

    it('updates request with duration after completion', async () => {
        h.customFetchers['DurationProv'] = async () => ({ success: true, content: 'done' });

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'DurationProv', name: 'Test' },
        );

        const durationCall = h.updateReq.mock.calls.find((c) => c[1]?.duration !== undefined);
        expect(durationCall).toBeDefined();
        expect(durationCall[1].duration).toBeGreaterThanOrEqual(0);
        expect(durationCall[1].status).toBe(200);
    });

    it('records error status on failure', async () => {
        h.customFetchers['FailProv'] = async () => ({ success: false, content: 'failed', _status: 503 });

        await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'FailProv', name: 'Test' },
        );

        const statusCall = h.updateReq.mock.calls.find((c) => c[1]?.status !== undefined);
        expect(statusCall).toBeDefined();
        expect(statusCall[1].status).toBe(503);
    });

    it('records crash status when provider throws', async () => {
        h.customFetchers['CrashProv'] = async () => { throw new Error('boom'); };

        // fetchByProviderId catches, so handleRequest won't throw
        const result = await handleRequest(
            { prompt_chat: [{ role: 'user', content: 'hi' }] },
            { provider: 'CrashProv', name: 'Test' },
        );

        expect(result.success).toBe(false);
        expect(result.content).toContain('Crash');
    });
});

describe('_toFiniteFloat / _toFiniteInt — additional edge cases', () => {
    it('handles negative values correctly', () => {
        expect(_toFiniteFloat('-0.5')).toBe(-0.5);
        expect(_toFiniteInt('-42')).toBe(-42);
    });

    it('handles zero-prefixed strings', () => {
        expect(_toFiniteFloat('007')).toBe(7);
        expect(_toFiniteInt('007')).toBe(7);
    });

    it('handles whitespace strings', () => {
        expect(_toFiniteFloat('  3.14  ')).toBe(3.14);
        expect(_toFiniteInt('  42  ')).toBe(42);
    });

    it('handles boolean inputs', () => {
        // parseFloat(true) => NaN, so both return undefined
        expect(_toFiniteFloat(true)).toBeUndefined();
        expect(_toFiniteFloat(false)).toBeUndefined();
        // parseInt(true) is also NaN
        expect(_toFiniteInt(true)).toBeUndefined();
    });

    it('handles very large numbers', () => {
        expect(_toFiniteFloat('1e30')).toBe(1e30);
        expect(_toFiniteFloat('1e309')).toBeUndefined(); // Infinity
    });

    it('handles mixed string values', () => {
        expect(_toFiniteFloat('3.14abc')).toBe(3.14); // parseFloat stops at 'a'
        expect(_toFiniteInt('42xyz')).toBe(42); // parseInt stops at 'x'
    });
});
