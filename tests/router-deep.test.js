/**
 * Deep coverage tests for router.js
 * Covers: handleRequest slot overrides, streaming pass-through paths,
 * fetchByProviderId edge cases, malformed results normalization, _toFiniteFloat/_toFiniteInt.
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
            text += value;
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

describe('_toFiniteFloat / _toFiniteInt edge cases', () => {
    it('returns undefined for NaN input', () => {
        expect(_toFiniteFloat('not-a-number')).toBeUndefined();
        expect(_toFiniteInt('not-a-number')).toBeUndefined();
    });

    it('returns undefined for Infinity', () => {
        expect(_toFiniteFloat('Infinity')).toBeUndefined();
        expect(_toFiniteInt('Infinity')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(_toFiniteFloat('')).toBeUndefined();
        expect(_toFiniteInt('')).toBeUndefined();
    });

    it('parses valid numbers correctly', () => {
        expect(_toFiniteFloat('1.5')).toBe(1.5);
        expect(_toFiniteInt('42')).toBe(42);
        expect(_toFiniteFloat('0')).toBe(0);
        expect(_toFiniteInt('0')).toBe(0);
    });

    it('parses negative numbers', () => {
        expect(_toFiniteFloat('-0.5')).toBe(-0.5);
        expect(_toFiniteInt('-10')).toBe(-10);
    });
});

describe('fetchByProviderId — deep coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.safeGetArg.mockImplementation(async (key, def = '') => def);
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.state.CUSTOM_MODELS_CACHE = [];
    });

    it('returns error for unknown provider', async () => {
        const result = await fetchByProviderId(
            { provider: 'UnknownProvider', name: 'Test' },
            { prompt_chat: [] },
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('Unknown provider');
    });

    it('returns error for Custom provider without matching config', async () => {
        const result = await fetchByProviderId(
            { provider: 'Custom', name: 'Custom1', uniqueId: 'missing-id' },
            { prompt_chat: [] },
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('Custom model config not found');
    });

    it('uses custom fetcher when registered', async () => {
        const fetcher = vi.fn(async () => ({ success: true, content: 'custom result' }));
        h.customFetchers['MyProvider'] = fetcher;
        const result = await fetchByProviderId(
            { provider: 'MyProvider', name: 'Test' },
            { prompt_chat: [] },
        );
        expect(fetcher).toHaveBeenCalled();
        expect(result.content).toBe('custom result');
    });

    it('applies fallback params when specified', async () => {
        h.safeGetArg.mockImplementation(async (key, def = '') => {
            const vals = {
                cpm_fallback_temp: '0.7',
                cpm_fallback_max_tokens: '1000',
                cpm_fallback_top_p: '0.9',
                cpm_fallback_freq_pen: '0.1',
                cpm_fallback_pres_pen: '0.2',
            };
            return key in vals ? vals[key] : def;
        });
        const fetcher = vi.fn(async (modelDef, msgs, temp, maxTokens, args) => {
            return { success: true, content: `temp=${temp},max=${maxTokens},topP=${args.top_p}` };
        });
        h.customFetchers['Test'] = fetcher;

        const result = await fetchByProviderId(
            { provider: 'Test', name: 'FallbackTest' },
            { prompt_chat: [] },
        );
        expect(result.content).toContain('temp=0.7');
        expect(result.content).toContain('max=1000');
        expect(result.content).toContain('topP=0.9');
    });

    it('catches exceptions from fetcher and returns error', async () => {
        h.customFetchers['CrashProvider'] = async () => { throw new Error('fetcher crash'); };
        const result = await fetchByProviderId(
            { provider: 'CrashProvider', name: 'Test' },
            { prompt_chat: [] },
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('Crash');
    });

    it('calls fetchCustom for Custom-prefixed provider with matching config', async () => {
        h.state.CUSTOM_MODELS_CACHE = [{
            uniqueId: 'custom_1',
            name: 'My Custom',
            model: 'gpt-4',
            url: 'https://api.example.com',
            key: 'sk-test',
            format: 'openai',
        }];
        h.fetchCustom.mockResolvedValue({ success: true, content: 'custom ok' });

        const result = await fetchByProviderId(
            { provider: 'Custom', name: 'My Custom', uniqueId: 'custom_1' },
            { prompt_chat: [] },
        );
        expect(h.fetchCustom).toHaveBeenCalled();
        expect(result.content).toBe('custom ok');
    });
});

describe('handleRequest — deep coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.safeGetArg.mockImplementation(async (key, def = '') => def);
        h.safeGetBoolArg.mockResolvedValue(false);
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.storeReq.mockReturnValue('req-1');
        for (const key of Object.keys(h.customFetchers)) delete h.customFetchers[key];
        h.state.CUSTOM_MODELS_CACHE = [];
    });

    it('returns error for invalid modelDef', async () => {
        const result = await handleRequest({}, null);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Invalid model');
    });

    it('returns error for modelDef without provider', async () => {
        const result = await handleRequest({}, { name: 'Test' });
        expect(result.success).toBe(false);
    });

    it('normalizes non-object args to empty object', async () => {
        const fetcher = vi.fn(async () => ({ success: true, content: 'ok' }));
        h.customFetchers['TestProv'] = fetcher;
        const result = await handleRequest(null, { provider: 'TestProv', name: 'T' });
        expect(result.success).toBe(true);
    });

    it('normalizes malformed provider result', async () => {
        h.customFetchers['BadReturn'] = async () => 'not an object';
        const result = await handleRequest({}, { provider: 'BadReturn', name: 'T' });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Invalid provider result');
    });

    it('normalizes result with non-boolean success', async () => {
        h.customFetchers['WrongType'] = async () => ({ success: 'yes', content: 'ok' });
        const result = await handleRequest({}, { provider: 'WrongType', name: 'T' });
        expect(result.success).toBe(true);
    });

    it('normalizes result with null content', async () => {
        h.customFetchers['NullContent'] = async () => ({ success: true, content: null });
        const result = await handleRequest({}, { provider: 'NullContent', name: 'T' });
        expect(result.content).toBe('');
    });

    it('applies slot overrides when heuristically confirmed', async () => {
        h.inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: true });
        h.safeGetArg.mockImplementation(async (key, def = '') => {
            if (key === 'cpm_slot_translation_max_out') return '500';
            if (key === 'cpm_slot_translation_temp') return '0.3';
            if (key === 'cpm_slot_translation_top_p') return '0.95';
            if (key === 'cpm_slot_translation_top_k') return '40';
            if (key === 'cpm_slot_translation_rep_pen') return '1.1';
            if (key === 'cpm_slot_translation_freq_pen') return '0.05';
            if (key === 'cpm_slot_translation_pres_pen') return '0.1';
            if (key === 'cpm_slot_translation_max_context') return '2000';
            return def;
        });
        const fetcher = vi.fn(async (modelDef, msgs, temp, maxTokens, args) => ({
            success: true,
            content: `t=${args.temperature},m=${args.max_tokens}`,
        }));
        h.customFetchers['Trans'] = fetcher;

        const result = await handleRequest(
            { prompt_chat: [] },
            { provider: 'Trans', name: 'T' }
        );
        const callArgs = fetcher.mock.calls[0][4];
        expect(callArgs.temperature).toBe(0.3);
        expect(callArgs.max_tokens).toBe(500);
        expect(callArgs.top_p).toBe(0.95);
        expect(callArgs.top_k).toBe(40);
        expect(callArgs.frequency_penalty).toBe(0.05);
        expect(callArgs.presence_penalty).toBe(0.1);
        expect(callArgs.max_context_tokens).toBe(2000);
    });

    it('does NOT apply slot overrides when slot detected but NOT heuristically confirmed', async () => {
        h.inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: false });
        const fetcher = vi.fn(async (modelDef, msgs, temp, maxTokens, args) => ({
            success: true, content: 'ok',
        }));
        h.customFetchers['Trans'] = fetcher;

        await handleRequest(
            { prompt_chat: [], temperature: 1.0 },
            { provider: 'Trans', name: 'T' }
        );
        const callArgs = fetcher.mock.calls[0][4];
        expect(callArgs.temperature).toBe(1.0);
    });

    it('handles streaming pass-through when enabled and bridge capable', async () => {
        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(true);
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue('chunk1');
                controller.enqueue('chunk2');
                controller.close();
            },
        });
        h.customFetchers['Stream'] = async () => ({ success: true, content: readableStream });
        h.storeReq.mockReturnValue('req-stream');

        const result = await handleRequest({}, { provider: 'Stream', name: 'S' });
        expect(result.success).toBe(true);
        // Content should be a ReadableStream (piped through TransformStream)
        expect(result.content).toBeInstanceOf(ReadableStream);
        // Read it to completion  
        const reader = result.content.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toBe('chunk1chunk2');
    });

    it('collects stream when enabled but bridge not capable', async () => {
        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        h.checkStreamCapability.mockResolvedValue(false);
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue('chunk');
                controller.close();
            },
        });
        h.collectStream.mockResolvedValue('collected');
        h.customFetchers['StreamNoBridge'] = async () => ({ success: true, content: readableStream });

        const result = await handleRequest({}, { provider: 'StreamNoBridge', name: 'S' });
        expect(result.content).toBe('collected');
    });

    it('collects stream when streaming disabled', async () => {
        h.safeGetBoolArg.mockResolvedValue(false);
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue('chunk');
                controller.close();
            },
        });
        h.collectStream.mockResolvedValue('collected_disabled');
        h.customFetchers['StreamOff'] = async () => ({ success: true, content: readableStream });

        const result = await handleRequest({}, { provider: 'StreamOff', name: 'S' });
        expect(result.content).toBe('collected_disabled');
    });

    it('shows token usage toast when enabled', async () => {
        h.safeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_show_token_usage') return true;
            return false;
        });
        h.takeTokenUsage.mockReturnValueOnce({ prompt: 10, completion: 20 });
        h.customFetchers['Tok'] = async () => ({ success: true, content: 'ok' });

        await handleRequest({}, { provider: 'Tok', name: 'T' });
        expect(h.showToast).toHaveBeenCalled();
    });

    it('handles crash in fetchByProviderId gracefully', async () => {
        h.customFetchers['CRASH'] = async () => { throw new Error('boom'); };
        // fetchByProviderId catches the error and returns it as a failure
        const result = await handleRequest({}, { provider: 'CRASH', name: 'C' });
        expect(result.success).toBe(false);
        expect(result.content).toContain('boom');
    });

    it('serializes non-string content objects', async () => {
        h.customFetchers['ObjContent'] = async () => ({ success: true, content: { key: 'val' } });
        const result = await handleRequest({}, { provider: 'ObjContent', name: 'O' });
        // The result should still come back, content gets logged via JSON.stringify
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
    });
});
