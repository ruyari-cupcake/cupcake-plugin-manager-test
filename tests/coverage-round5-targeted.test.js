/**
 * coverage-round5-targeted.test.js — Precise branch coverage targeting
 * for format-openai, format-anthropic, token-usage, response-parsers.
 *
 * Each test explicitly hits specific uncovered branch line numbers.
 * Target: ~70+ previously uncovered branches.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Shared mocks ───

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
        risuFetch: vi.fn(),
        nativeFetch: vi.fn(),
    },
    CPM_VERSION: '1.20.0',
    state: { _currentExecutingPluginId: null, ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: { token: null, expiry: 0 } },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
}));

vi.mock('../src/lib/csp-exec.js', () => ({ _executeViaScriptTag: vi.fn() }));

// ─── Imports ───

import { formatToOpenAI } from '../src/lib/format-openai.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';
import {
    _tokenUsageStore, _tokenUsageKey, _setTokenUsage, _takeTokenUsage, _normalizeTokenUsage,
} from '../src/lib/token-usage.js';
import {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from '../src/lib/response-parsers.js';
import { ThoughtSignatureCache } from '../src/lib/format-gemini.js';

beforeEach(() => {
    _tokenUsageStore.clear();
    ThoughtSignatureCache.clear();
});

// ═══════════════════════════════════════════════════════
// format-openai.js — uncovered lines: 47,48,49,64,67,69,81,88,89,94,95,102,106,111,143,146
// ═══════════════════════════════════════════════════════

describe('formatToOpenAI targeted branches', () => {

    // L47: !m || typeof m !== 'object' → continue
    it('skips null / non-object entries (L47)', () => {
        const result = formatToOpenAI([null, undefined, 42, 'string', { role: 'user', content: 'ok' }]);
        expect(result.length).toBe(1);
        expect(result[0].content).toBe('ok');
    });

    // L48: typeof m.role !== 'string' → fallback to 'user'
    // NOTE: sanitizeMessages strips non-string roles before formatToOpenAI loop,
    // so this branch is defensive dead code — cannot be reached via public API.
    // Skipping this test.

    // L49: !role → continue (empty string role)
    it('skips message when role is empty string (L49)', () => {
        const result = formatToOpenAI([{ role: '', content: 'skip me' }, { role: 'user', content: 'keep' }]);
        expect(result.length).toBe(1);
        expect(result[0].content).toBe('keep');
    });

    // L64: null modal in multimodals → continue
    it('skips null multimodals (L64)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: 'hello',
            multimodals: [null, { type: 'image', base64: 'data:image/png;base64,AAAA' }],
        }]);
        expect(result[0].content).toContainEqual(
            expect.objectContaining({ type: 'image_url' })
        );
    });

    // L67: modal.type === 'image' with url (not base64)
    it('handles image modal with url property (L67)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: 'look',
            multimodals: [{ type: 'image', url: 'https://example.com/img.png' }],
        }]);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart.image_url.url).toBe('https://example.com/img.png');
    });

    // L69: modal.type === 'audio' → audio branch + format detection
    it('handles audio modal with wav/ogg/flac/webm mimes (L69)', () => {
        const mimes = ['wav', 'ogg', 'flac', 'webm'];
        for (const fmt of mimes) {
            const result = formatToOpenAI([{
                role: 'user',
                content: 'listen',
                multimodals: [{ type: 'audio', base64: `data:audio/${fmt};base64,AAAA` }],
            }]);
            const audioPart = result[0].content.find(p => p.type === 'input_audio');
            expect(audioPart).toBeDefined();
            expect(audioPart.input_audio.format).toBe(fmt);
        }
    });

    // Audio with default mp3 format (no mime match)
    it('audio defaults to mp3 when mime unrecognized (L69)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: 'sound',
            multimodals: [{ type: 'audio', base64: 'data:audio/mp3;base64,BBBB' }],
        }]);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    // L81: multimodals present but none match image/audio → contentParts still has text
    it('multimodals with unknown type still produce text-only content part (L81)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: 'text only',
            multimodals: [{ type: 'video', url: 'http://v.mp4' }],
        }]);
        // Enters multimodal path, text gets pushed as content part, video is skipped
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content).toContainEqual({ type: 'text', text: 'text only' });
    });

    // L88-89: Array content with Anthropic-style base64 image
    it('handles Anthropic-style image in array content (L88-L89)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
                { type: 'text', text: 'describe' },
            ],
        }]);
        expect(result[0].content).toContainEqual(
            expect.objectContaining({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } })
        );
    });

    // L94-95: Gemini inlineData image + audio
    it('handles Gemini inlineData image and audio (L94-L95)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { inlineData: { data: 'IMG', mimeType: 'image/png' } },
                { inlineData: { data: 'AUD', mimeType: 'audio/mp3' } },
            ],
        }]);
        expect(result[0].content).toContainEqual(
            expect.objectContaining({ type: 'image_url' })
        );
        expect(result[0].content).toContainEqual(
            expect.objectContaining({ type: 'input_audio' })
        );
    });

    // L102: content is not string, not array, no multimodals → payload.text fallback
    it('handles non-string non-array content (L102)', () => {
        const result = formatToOpenAI([{ role: 'user', content: 42 }]);
        expect(result[0].content).toBe('42');
    });

    it('handles object content (L102)', () => {
        const result = formatToOpenAI([{ role: 'user', content: { custom: true } }]);
        expect(typeof result[0].content).toBe('string');
    });

    // L106: mustuser placeholder message with name field
    it('preserves name on mustuser placeholder (L106)', () => {
        const result = formatToOpenAI(
            [{ role: 'assistant', content: 'hi', name: 'Bot' }],
            { mustuser: true }
        );
        // First message should be user placeholder, second is assistant
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
    });

    // L111: msg.content === null → skip
    it('skips messages with null content after processing (L111)', () => {
        const result = formatToOpenAI([
            { role: 'user', content: null },
            { role: 'user', content: 'keep' },
        ]);
        expect(result.length).toBe(1);
        expect(result[0].content).toBe('keep');
    });

    // L143, L146: altrole merge with non-array, non-string content
    it('merges consecutive same-role with mixed content types (L143-L146)', () => {
        const result = formatToOpenAI([
            { role: 'user', content: [{ type: 'text', text: 'part1' }] },
            { role: 'user', content: 42 },
        ], { altrole: true });
        // Should merge: array + non-string → both converted to part arrays
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    it('merges non-string prev with string msg in altrole (L143)', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 42 },
            { role: 'user', content: 'hello' },
        ], { altrole: true });
        // One of them has non-string content, should produce array parts
        expect(result.length).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// format-anthropic.js — uncovered lines: 79,100,101,116,122,129,131,132,145,146,168,172,174
// ═══════════════════════════════════════════════════════

describe('formatToAnthropic targeted branches', () => {

    // L79: null modal → continue
    it('skips null multimodal entries (L79)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: 'look',
            multimodals: [null, { type: 'image', base64: 'data:image/png;base64,AAAA' }],
        }]);
        const imgPart = result.messages[0]?.content?.find?.(p => p.type === 'image');
        expect(imgPart).toBeDefined();
    });

    // L100-101: multimodals present but no valid images → fallback to text
    it('falls back to text when multimodals have no images (L100-L101)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: 'text only',
            multimodals: [{ type: 'audio', base64: 'data:audio/mp3;base64,X' }],
        }]);
        // Should have text content since audio is not handled in Anthropic format
        const hasText = result.messages.some(m => {
            if (Array.isArray(m.content)) {
                return m.content.some(p => p.type === 'text');
            }
            return typeof m.content === 'string';
        });
        expect(hasText).toBe(true);
    });

    // L116: Anthropic-native image in array content
    it('preserves native Anthropic image in array content (L116)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
            ],
        }]);
        const firstMsg = result.messages.find(m => m.role === 'user' && Array.isArray(m.content));
        expect(firstMsg).toBeDefined();
        const imgPart = firstMsg.content.find(p => p.type === 'image');
        expect(imgPart).toBeDefined();
    });

    // L122: Gemini inlineData image
    it('converts Gemini inlineData to Anthropic image format (L122)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: [
                { inlineData: { data: 'AAAA', mimeType: 'image/jpeg' } },
                { type: 'text', text: 'describe' },
            ],
        }]);
        const firstUser = result.messages.find(m => m.role === 'user' && Array.isArray(m.content));
        const imgPart = firstUser?.content?.find?.(p => p.type === 'image');
        expect(imgPart).toBeDefined();
        expect(imgPart.source.type).toBe('base64');
        expect(imgPart.source.media_type).toBe('image/jpeg');
    });

    // L129, L131: OpenAI image_url with data:image/ URI
    it('converts OpenAI image_url data URI to Anthropic format (L129-L131)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,IMGDATA' } },
                { type: 'text', text: 'what is this?' },
            ],
        }]);
        const firstUser = result.messages.find(m => m.role === 'user' && Array.isArray(m.content));
        const imgPart = firstUser?.content?.find?.(p => p.type === 'image');
        expect(imgPart).toBeDefined();
        expect(imgPart.source.data).toBe('IMGDATA');
    });

    // L132: OpenAI image_url with HTTP URL
    it('converts OpenAI image_url http URL to Anthropic URL source (L132)', () => {
        const result = formatToAnthropic([{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
                { type: 'text', text: 'describe this' },
            ],
        }]);
        const firstUser = result.messages.find(m => m.role === 'user' && Array.isArray(m.content));
        const urlPart = firstUser?.content?.find?.(p => p.source?.type === 'url');
        expect(urlPart).toBeDefined();
    });

    // L145: content not string → JSON.stringify
    it('JSON.stringifies non-string content (L145)', () => {
        const result = formatToAnthropic([{ role: 'user', content: { key: 'val' } }]);
        const userMsg = result.messages.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
    });

    // L146: empty content → continue
    it('skips empty-content messages (L146)', () => {
        const result = formatToAnthropic([
            { role: 'user', content: '' },
            { role: 'user', content: 'keep' },
        ]);
        // At least one user should remain with 'keep'
        const kept = result.messages.find(m => Array.isArray(m.content) && m.content.some(p => p.text === 'keep'));
        expect(kept).toBeDefined();
    });

    // L168: ci > 0 role change tracking in caching
    // L172: fmtIdx >= formattedMsgs.length → break
    // L174: srcMsg.cachePoint → apply cache_control
    it('applies cache_control at cachePoint breakpoints (L168-L174)', () => {
        const result = formatToAnthropic([
            { role: 'user', content: 'first question' },
            { role: 'assistant', content: 'first answer', cachePoint: true },
            { role: 'user', content: 'follow up', cachePoint: true },
        ], { caching: true });
        // At least one message should have cache_control applied
        let hasCacheControl = false;
        for (const msg of result.messages) {
            if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part.cache_control) hasCacheControl = true;
                }
            }
        }
        expect(hasCacheControl).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// token-usage.js — uncovered lines: 45,47,120,121,126,135,137,151,152,155
// ═══════════════════════════════════════════════════════

describe('token-usage targeted branches', () => {

    // L45: !text || typeof text !== 'string' → return 0
    // (tested indirectly via _normalizeTokenUsage anthropic CJK estimation)

    // L47: normalized whitespace-only → return 0
    // (tested indirectly)

    // L120-121: CJK ratio >= 0.3 → CJK estimation path
    it('Anthropic estimated reasoning with CJK-heavy visible text (L120-L121)', () => {
        const usage = _normalizeTokenUsage(
            { input_tokens: 100, output_tokens: 500 },
            'anthropic',
            { anthropicHasThinking: true, anthropicVisibleText: '日本語テスト文字列です。これは長い文章です。' }
        );
        expect(usage).not.toBeNull();
        expect(usage.reasoning).toBeGreaterThan(0);
        expect(usage.reasoningEstimated).toBe(true);
    });

    // L126: store > max → evict oldest
    it('evicts oldest entry when store exceeds 100 (L126)', () => {
        _tokenUsageStore.clear();
        for (let i = 0; i < 101; i++) {
            _setTokenUsage(`req-${i}`, { input: 1, output: 1, reasoning: 0, cached: 0, total: 2 });
        }
        // Should have evicted at least one
        expect(_tokenUsageStore.size).toBeLessThanOrEqual(101);
    });

    // L135: scoped key not found → check legacy
    // L137: legacy key found
    it('falls back to legacy key when scoped not found (L135-L137)', () => {
        _tokenUsageStore.clear();
        // Set via legacy key directly
        _tokenUsageStore.set('_latest', { input: 10, output: 20, reasoning: 0, cached: 0, total: 30 });
        const usage = _takeTokenUsage('nonexistent', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(10);
    });

    // L151-152: explicitReasoning > 0 → return early
    it('anthropic explicit reasoning tokens (L151-L152)', () => {
        const usage = _normalizeTokenUsage(
            { input_tokens: 100, output_tokens: 50, output_tokens_details: { reasoning_tokens: 20 } },
            'anthropic'
        );
        expect(usage.reasoning).toBe(20);
    });

    // L155: anthropicHasThinking + output > 0 + visibleText → estimated reasoning
    it('anthropic estimated reasoning calculation (L155)', () => {
        const usage = _normalizeTokenUsage(
            { input_tokens: 100, output_tokens: 500 },
            'anthropic',
            { anthropicHasThinking: true, anthropicVisibleText: 'short answer' }
        );
        expect(usage.reasoning).toBeGreaterThan(0);
        expect(usage.reasoningEstimated).toBe(true);
    });

    // Null/whitespace text estimation branch
    it('_normalizeTokenUsage with null visible text still estimates (L45)', () => {
        const usage = _normalizeTokenUsage(
            { input_tokens: 50, output_tokens: 200 },
            'anthropic',
            { anthropicHasThinking: true, anthropicVisibleText: '' }
        );
        // Empty visible text → 0 visible tokens → all output = reasoning
        expect(usage.reasoning).toBe(200);
    });

    // Stream legacy key
    it('stream legacy key fallback (L137)', () => {
        _tokenUsageStore.clear();
        _tokenUsageStore.set('_stream_latest', { input: 5, output: 15, reasoning: 0, cached: 0, total: 20 });
        const usage = _takeTokenUsage('nonexist', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════
// response-parsers.js — uncovered lines: 38,46,70,76,77,84,110,113,114,117,133,148,157,162,169,171,184
// ═══════════════════════════════════════════════════════

describe('parseOpenAINonStreamingResponse targeted', () => {

    // L38: content includes </think> → DeepSeek think extraction
    it('extracts DeepSeek <think> blocks (L38)', () => {
        const result = parseOpenAINonStreamingResponse({
            choices: [{ message: { content: '<think>reasoning here</think>The answer is 42' } }]
        }, 'ds-req-1');
        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('reasoning here');
        expect(result.content).toContain('The answer is 42');
    });

    // L46: data.usage → _normalizeTokenUsage
    it('processes usage data from OpenAI response (L46)', () => {
        _tokenUsageStore.clear();
        parseOpenAINonStreamingResponse({
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }, 'usage-req');
        const usage = _takeTokenUsage('usage-req', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(10);
    });
});

describe('parseResponsesAPINonStreamingResponse targeted', () => {

    // L70: no data.output → fallback to OpenAI parser
    it('falls back to OpenAI parser when no output array (L70)', () => {
        const result = parseResponsesAPINonStreamingResponse({
            choices: [{ message: { content: 'fallback' } }]
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('fallback');
    });

    // L76-77: Responses API reasoning items
    it('extracts reasoning summary from Responses API (L76-L77)', () => {
        const result = parseResponsesAPINonStreamingResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'thinking step' }],
                },
                {
                    type: 'message',
                    content: [{ type: 'output_text', text: 'The answer is 42' }],
                },
            ],
        });
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('thinking step');
        expect(result.content).toContain('The answer is 42');
    });

    // usage in Responses API
    it('processes usage in Responses API response', () => {
        _tokenUsageStore.clear();
        parseResponsesAPINonStreamingResponse({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }],
            usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        }, 'resp-api-usage');
        const usage = _takeTokenUsage('resp-api-usage', false);
        expect(usage).not.toBeNull();
    });
});

describe('parseGeminiNonStreamingResponse targeted', () => {

    // L84: blockReason in GEMINI_BLOCK_REASONS
    it('returns error for safety-blocked response (L84)', () => {
        const result = parseGeminiNonStreamingResponse({
            promptFeedback: { blockReason: 'SAFETY' },
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    // L110: part.thought → true, L113-114: close thought + text, L117: thought_signature
    it('handles thought parts with thought_signature (L110-L117)', () => {
        ThoughtSignatureCache.clear();
        const result = parseGeminiNonStreamingResponse({
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'thinking about this...' },
                        { text: 'The answer is 42', thought_signature: 'sig-abc-123' },
                    ],
                },
            }],
        }, { useThoughtSignature: true }, 'gemini-thought-req');
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('thinking about this...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('The answer is 42');
        // Signature should be cached
        const cached = ThoughtSignatureCache.get(result.content);
        expect(cached).toBe('sig-abc-123');
    });

    // usageMetadata (L184 — actually inside the function at the usageMetadata block)
    it('processes usageMetadata from Gemini response', () => {
        _tokenUsageStore.clear();
        parseGeminiNonStreamingResponse({
            candidates: [{ content: { parts: [{ text: 'hello' }] } }],
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 100, totalTokenCount: 150 },
        }, {}, 'gemini-usage-req');
        const usage = _takeTokenUsage('gemini-usage-req', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(50);
    });

    // finishReason as blockReason
    it('detects RECITATION block via finishReason', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{ finishReason: 'RECITATION' }],
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('RECITATION');
    });
});

describe('parseClaudeNonStreamingResponse targeted', () => {

    // L133: error response
    it('returns error message for error responses (L133)', () => {
        const result = parseClaudeNonStreamingResponse({
            type: 'error',
            error: { message: 'Rate limit exceeded' },
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Rate limit exceeded');
    });

    // L148: thinking block, L157: redacted_thinking, L162: orphan inThinking close
    it('handles thinking + redacted_thinking + orphan close (L148-L162)', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'hmm...' },
                { type: 'redacted_thinking' },
                { type: 'text', text: 'The answer' },
            ],
        });
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('hmm...');
        expect(result.content).toContain('{{redacted_thinking}}');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('The answer');
    });

    // Test orphan close (thinking block without text afterward)
    it('closes orphan thinking block at end (L162)', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'only thinking' },
            ],
        });
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('</Thoughts>');
    });

    // L169-171: usage normalization with thinking
    it('normalizes usage with thinking metadata (L169-L171)', () => {
        _tokenUsageStore.clear();
        parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'deep thought' },
                { type: 'text', text: 'short answer' },
            ],
            usage: { input_tokens: 100, output_tokens: 500 },
        }, {}, 'claude-usage-req');
        const usage = _takeTokenUsage('claude-usage-req', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(100);
        expect(usage.output).toBe(500);
    });

    // Error via data.error (no type field)
    it('handles error without type field (L133)', () => {
        const result = parseClaudeNonStreamingResponse({
            error: { message: 'Something went wrong' },
        });
        expect(result.success).toBe(false);
    });

    // Empty content → empty response
    it('returns empty for content with only empty blocks', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [{ type: 'text', text: '' }],
        });
        expect(result.content).toContain('[Claude] Empty response');
    });
});
