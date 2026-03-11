import { describe, it, expect, beforeEach } from 'vitest';
import {
    _normalizeTokenUsage,
    _tokenUsageKey,
    _setTokenUsage,
    _takeTokenUsage,
    _tokenUsageStore,
} from '../src/lib/token-usage.js';

describe('_normalizeTokenUsage', () => {
    it('returns null for null/undefined input', () => {
        expect(_normalizeTokenUsage(null, 'openai')).toBeNull();
        expect(_normalizeTokenUsage(undefined, 'openai')).toBeNull();
    });

    it('returns null for non-object input', () => {
        expect(_normalizeTokenUsage('string', 'openai')).toBeNull();
        expect(_normalizeTokenUsage(42, 'openai')).toBeNull();
    });

    describe('OpenAI format', () => {
        it('normalizes standard OpenAI usage', () => {
            const raw = {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            };
            const result = _normalizeTokenUsage(raw, 'openai');
            expect(result).toEqual({
                input: 100,
                output: 50,
                reasoning: 0,
                cached: 0,
                total: 150,
            });
        });

        it('extracts reasoning tokens from completion_tokens_details', () => {
            const raw = {
                prompt_tokens: 100,
                completion_tokens: 200,
                total_tokens: 300,
                completion_tokens_details: { reasoning_tokens: 150 },
            };
            const result = _normalizeTokenUsage(raw, 'openai');
            expect(result.reasoning).toBe(150);
        });

        it('extracts cached tokens from prompt_tokens_details', () => {
            const raw = {
                prompt_tokens: 100,
                completion_tokens: 50,
                prompt_tokens_details: { cached_tokens: 80 },
            };
            const result = _normalizeTokenUsage(raw, 'openai');
            expect(result.cached).toBe(80);
        });

        it('falls back to prompt_cache_hit_tokens', () => {
            const raw = {
                prompt_tokens: 100,
                completion_tokens: 50,
                prompt_cache_hit_tokens: 60,
            };
            const result = _normalizeTokenUsage(raw, 'openai');
            expect(result.cached).toBe(60);
        });

        it('calculates total when total_tokens is missing', () => {
            const raw = {
                prompt_tokens: 100,
                completion_tokens: 50,
            };
            const result = _normalizeTokenUsage(raw, 'openai');
            expect(result.total).toBe(150);
        });
    });

    describe('Anthropic format', () => {
        it('normalizes standard Anthropic usage', () => {
            const raw = {
                input_tokens: 200,
                output_tokens: 100,
            };
            const result = _normalizeTokenUsage(raw, 'anthropic');
            expect(result).toEqual({
                input: 200,
                output: 100,
                reasoning: 0,
                cached: 0,
                total: 300,
            });
        });

        it('sums cache read and creation tokens', () => {
            const raw = {
                input_tokens: 200,
                output_tokens: 100,
                cache_read_input_tokens: 50,
                cache_creation_input_tokens: 30,
            };
            const result = _normalizeTokenUsage(raw, 'anthropic');
            expect(result.cached).toBe(80);
        });

        it('uses explicit anthropic reasoning token fields when available', () => {
            const raw = {
                input_tokens: 200,
                output_tokens: 100,
                thinking_tokens: 64,
            };
            const result = _normalizeTokenUsage(raw, 'anthropic');
            expect(result.reasoning).toBe(64);
            expect(result.reasoningEstimated).toBeUndefined();
        });

        it('estimates anthropic reasoning from billed output minus visible answer text when thinking is present', () => {
            const raw = {
                input_tokens: 200,
                output_tokens: 20,
            };
            const result = _normalizeTokenUsage(raw, 'anthropic', {
                anthropicHasThinking: true,
                anthropicVisibleText: 'Here is the answer.',
            });
            expect(result.reasoning).toBe(15);
            expect(result.reasoningEstimated).toBe(true);
        });
    });

    describe('Gemini format', () => {
        it('normalizes standard Gemini usage', () => {
            const raw = {
                promptTokenCount: 150,
                candidatesTokenCount: 75,
                totalTokenCount: 225,
            };
            const result = _normalizeTokenUsage(raw, 'gemini');
            expect(result).toEqual({
                input: 150,
                output: 75,
                reasoning: 0,
                cached: 0,
                total: 225,
            });
        });

        it('extracts thoughts and cached tokens', () => {
            const raw = {
                promptTokenCount: 150,
                candidatesTokenCount: 75,
                thoughtsTokenCount: 500,
                cachedContentTokenCount: 100,
                totalTokenCount: 825,
            };
            const result = _normalizeTokenUsage(raw, 'gemini');
            expect(result.reasoning).toBe(500);
            expect(result.cached).toBe(100);
        });
    });

    it('returns null for unknown format', () => {
        expect(_normalizeTokenUsage({ tokens: 100 }, 'unknown')).toBeNull();
    });
});

describe('_tokenUsageKey', () => {
    it('returns legacy key for null/undefined requestId', () => {
        expect(_tokenUsageKey(null, false)).toBe('_latest');
        expect(_tokenUsageKey(null, true)).toBe('_stream_latest');
        expect(_tokenUsageKey(undefined, false)).toBe('_latest');
    });

    it('returns scoped key for valid requestId', () => {
        expect(_tokenUsageKey('req123', false)).toBe('_nonstream_req123');
        expect(_tokenUsageKey('req123', true)).toBe('_stream_req123');
    });
});

describe('_setTokenUsage / _takeTokenUsage', () => {
    beforeEach(() => {
        _tokenUsageStore.clear();
    });

    it('stores and retrieves usage by requestId', () => {
        const usage = { input: 100, output: 50, reasoning: 0, cached: 0, total: 150 };
        _setTokenUsage('req1', usage, false);
        const taken = _takeTokenUsage('req1', false);
        expect(taken).toEqual(usage);
    });

    it('removes usage after taking', () => {
        const usage = { input: 100, output: 50, reasoning: 0, cached: 0, total: 150 };
        _setTokenUsage('req1', usage, false);
        _takeTokenUsage('req1', false);
        expect(_takeTokenUsage('req1', false)).toBeNull();
    });

    it('falls back to legacy key', () => {
        const usage = { input: 100, output: 50, reasoning: 0, cached: 0, total: 150 };
        _setTokenUsage(null, usage, false);
        const taken = _takeTokenUsage('nonexistent', false);
        expect(taken).toEqual(usage);
    });

    it('ignores null/non-object usage', () => {
        _setTokenUsage('req1', null, false);
        expect(_takeTokenUsage('req1', false)).toBeNull();
    });

    it('separates stream and non-stream entries', () => {
        const streamUsage = { input: 100, output: 50, reasoning: 0, cached: 0, total: 150 };
        const nonStreamUsage = { input: 200, output: 100, reasoning: 0, cached: 0, total: 300 };
        _setTokenUsage('req1', streamUsage, true);
        _setTokenUsage('req1', nonStreamUsage, false);
        expect(_takeTokenUsage('req1', true)).toEqual(streamUsage);
        expect(_takeTokenUsage('req1', false)).toEqual(nonStreamUsage);
    });

    it('evicts oldest entry when store exceeds 100 entries', () => {
        const usage = { input: 1, output: 1, reasoning: 0, cached: 0, total: 2 };
        // Fill store to 100 entries
        for (let i = 0; i < 100; i++) {
            _setTokenUsage(`req_${i}`, usage, false);
        }
        expect(_tokenUsageStore.size).toBe(100);
        // Adding 101st should evict the first
        _setTokenUsage('req_overflow', usage, false);
        expect(_tokenUsageStore.size).toBe(100);
        // First entry should be evicted
        expect(_takeTokenUsage('req_0', false)).toBeNull();
        // Latest entry should still exist
        expect(_takeTokenUsage('req_overflow', false)).toEqual(usage);
    });
});
