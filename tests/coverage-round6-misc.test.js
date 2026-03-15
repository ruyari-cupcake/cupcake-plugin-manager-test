/**
 * coverage-round6-misc.test.js — Final targeted branch coverage for
 * sanitize.js, schema.js, slot-inference.js, and other smaller modules.
 *
 * Target: ~30+ previously uncovered branches in these modules.
 */
import { describe, expect, it, vi } from 'vitest';

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

import {
    stripInternalTags,
    stripStaleAutoCaption,
    extractNormalizedMessagePayload,
    sanitizeBodyJSON,
    stripThoughtDisplayContent,
    isInlaySceneWrapperText,
} from '../src/lib/sanitize.js';
import { validateSchema } from '../src/lib/schema.js';

// ═══════════════════════════════════════════════════════
// sanitize.js — uncovered: L60,L99,L107,L117,L119,L127,L194,L195,L196,L247,L248
// ═══════════════════════════════════════════════════════

describe('sanitize.js targeted branches', () => {

    // ─── stripStaleAutoCaption ───

    // L60: regex callback with wordCount < 3 (leave match alone)
    it('stripStaleAutoCaption preserves short bracket content (<3 words)', () => {
        const text = 'Look at this image [12, ab]';
        const result = stripStaleAutoCaption(text, {});
        expect(result).toContain('[12, ab]');
    });

    // L60: regex callback with wordCount >= 3 (strip caption)
    it('stripStaleAutoCaption strips long bracket caption (>=3 words)', () => {
        const text = 'Here is the image [a beautiful sunset over ocean waves]';
        const result = stripStaleAutoCaption(text, {});
        expect(result).not.toContain('[a beautiful sunset');
    });

    // stripStaleAutoCaption with no image intent → no op
    it('stripStaleAutoCaption skips non-image content', () => {
        const text = 'Hello world [some bracket content here]';
        const result = stripStaleAutoCaption(text, {});
        expect(result).toBe(text);
    });

    // stripStaleAutoCaption with inlay tokens → no op
    it('stripStaleAutoCaption skips inlay scene text', () => {
        const text = '<lb-xnai scene="test">{{inlay::test}}</lb-xnai> [caption here right now]';
        const result = stripStaleAutoCaption(text, {});
        expect(result).toBe(text);
    });

    // stripStaleAutoCaption with attached multimodals → no op
    it('stripStaleAutoCaption skips messages with multimodals', () => {
        const text = 'image [a really long caption description here]';
        const result = stripStaleAutoCaption(text, { multimodals: [{ type: 'image' }] });
        expect(result).toBe(text);
    });

    // ─── extractNormalizedMessagePayload ───

    // L99: video mimeType from inlineData
    it('extractNormalizedMessagePayload extracts video from inlineData', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ inlineData: { data: 'AAAA', mimeType: 'video/mp4' } }],
        });
        expect(result.multimodals[0]?.type).toBe('video');
    });

    // L107: image_url as string (not object)
    it('extractNormalizedMessagePayload handles image_url as bare string', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ type: 'image_url', image_url: 'data:image/png;base64,AAAA' }],
        });
        expect(result.multimodals[0]?.type).toBe('image');
    });

    // image_url as http URL
    it('extractNormalizedMessagePayload handles image_url http URL', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ type: 'image_url', image_url: { url: 'https://example.com/img.png' } }],
        });
        expect(result.multimodals[0]?.type).toBe('image');
        expect(result.multimodals[0]?.url).toBe('https://example.com/img.png');
    });

    // L117-119: input_image as data URI
    it('extractNormalizedMessagePayload handles input_image data URI', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,BBBB' }],
        });
        expect(result.multimodals[0]?.type).toBe('image');
    });

    // input_image as http URL
    it('extractNormalizedMessagePayload handles input_image http URL', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ type: 'input_image', image_url: { url: 'https://example.com/i.png' } }],
        });
        expect(result.multimodals[0]?.url).toBe('https://example.com/i.png');
    });

    // L127: input_audio
    it('extractNormalizedMessagePayload handles input_audio', () => {
        const result = extractNormalizedMessagePayload({
            content: [{ type: 'input_audio', input_audio: { data: 'AAAA', format: 'wav' } }],
        });
        expect(result.multimodals[0]?.type).toBe('audio');
        expect(result.multimodals[0]?.mimeType).toBe('audio/wav');
    });

    // Content as non-string, non-array object with .text property
    it('extractNormalizedMessagePayload handles object content with .text', () => {
        const result = extractNormalizedMessagePayload({
            content: { text: 'hello world' },
        });
        expect(result.text).toBe('hello world');
    });

    // Content as non-string, non-array object without .text → JSON.stringify
    it('extractNormalizedMessagePayload handles object content without .text', () => {
        const result = extractNormalizedMessagePayload({
            content: { key: 'value' },
        });
        expect(result.text).toContain('key');
    });

    // Content as number
    it('extractNormalizedMessagePayload handles number content', () => {
        const result = extractNormalizedMessagePayload({
            content: 42,
        });
        expect(result.text).toBe('42');
    });

    // ─── sanitizeBodyJSON ───

    // L194-196: contents array filtering (Gemini format)
    it('sanitizeBodyJSON filters null entries from contents array', () => {
        const input = JSON.stringify({
            contents: [null, { role: 'user', parts: [{ text: 'hi' }] }, undefined, { role: 'model', parts: [{ text: 'hello' }] }],
        });
        const result = JSON.parse(sanitizeBodyJSON(input));
        expect(result.contents.length).toBe(2);
        expect(result.contents[0].role).toBe('user');
    });

    // sanitizeBodyJSON with messages that have invalid entries
    it('sanitizeBodyJSON filters invalid messages', () => {
        const input = JSON.stringify({
            messages: [
                null,
                { role: 'user', content: 'hello' },
                { role: '', content: 'empty role' },
                { content: 'no role' },
                { role: 'assistant', content: 'ok' },
            ],
        });
        const result = JSON.parse(sanitizeBodyJSON(input));
        expect(result.messages.length).toBe(2); // only valid ones
    });

    // sanitizeBodyJSON with non-JSON string
    it('sanitizeBodyJSON returns original for non-JSON string', () => {
        const result = sanitizeBodyJSON('not json at all');
        expect(result).toBe('not json at all');
    });

    // ─── stripThoughtDisplayContent ───

    // L247-248: old format > [Thought Process] blockquote stripping
    it('stripThoughtDisplayContent strips old-format thought blocks', () => {
        const text = '> [Thought Process]\n> Some thinking\n> More thinking\n\n\n\nActual response here';
        const result = stripThoughtDisplayContent(text);
        expect(result).toContain('Actual response');
        expect(result).not.toContain('[Thought Process]');
    });

    // New format stripping
    it('stripThoughtDisplayContent strips new-format <Thoughts> blocks', () => {
        const text = '<Thoughts>\nSome reasoning\n</Thoughts>\nThe answer is 42';
        const result = stripThoughtDisplayContent(text);
        expect(result).toContain('The answer is 42');
        expect(result).not.toContain('Some reasoning');
    });

    // stripThoughtDisplayContent with old format no content after
    it('stripThoughtDisplayContent handles old-format with no follow-up', () => {
        const text = '> [Thought Process]\n> Only thinking here';
        const result = stripThoughtDisplayContent(text);
        expect(result).toBe('');
    });

    // isInlaySceneWrapperText
    it('isInlaySceneWrapperText detects inlay scene wrappers', () => {
        expect(isInlaySceneWrapperText('<lb-xnai scene="test">{{inlay::data}}</lb-xnai>')).toBe(true);
        expect(isInlaySceneWrapperText('normal text')).toBe(false);
        expect(isInlaySceneWrapperText(42)).toBe(false);
    });

    // stripInternalTags
    it('stripInternalTags removes qak tags', () => {
        expect(stripInternalTags('hello <qak>world</qak>')).toBe('hello world');
    });

    it('stripInternalTags preserves inlay scene wrappers', () => {
        const text = '<lb-xnai scene="test">{{inlay::data}}</lb-xnai>';
        expect(stripInternalTags(text)).toBe(text);
    });
});

// ═══════════════════════════════════════════════════════
// schema.js — uncovered: L44,L105,L115,L122
// ═══════════════════════════════════════════════════════

describe('validateSchema targeted branches', () => {

    // L44: array maxItems truncation
    it('truncates array to maxItems (L44)', () => {
        const result = validateSchema(
            [1, 2, 3, 4, 5],
            { type: 'array', maxItems: 3 }
        );
        expect(result.ok).toBe(true);
        expect(result.data.length).toBe(3);
    });

    // Array with items schema — validate each item
    it('validates array items with nested schema', () => {
        const result = validateSchema(
            ['good', 42, 'also good'],
            { type: 'array', items: { type: 'string', fallback: '' } }
        );
        expect(result.ok).toBe(true);
        expect(result.data).toEqual(['good', 'also good']); // 42 filtered out
    });

    // Array type mismatch
    it('rejects non-array when expecting array', () => {
        const result = validateSchema('not array', { type: 'array', fallback: [] });
        expect(result.ok).toBe(false);
    });

    // Object required key missing
    it('rejects object with missing required key', () => {
        const result = validateSchema({ a: 1 }, { type: 'object', required: ['b'], fallback: {} });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required key');
    });

    // Object with property validation
    it('validates object properties with schema', () => {
        const result = validateSchema(
            { name: 'test', count: 'not a number' },
            {
                type: 'object',
                properties: {
                    name: { type: 'string', fallback: '' },
                    count: { type: 'number', fallback: 0 },
                },
            }
        );
        expect(result.ok).toBe(true);
        expect(result.data.name).toBe('test');
        expect(result.data.count).toBe(0); // fallback applied
    });

    // L105: string maxLength truncation
    it('truncates string to maxLength (L105)', () => {
        const result = validateSchema('hello world', { type: 'string', maxLength: 5 });
        expect(result.ok).toBe(true);
        expect(result.data).toBe('hello');
    });

    // L115: number type with non-finite (NaN, Infinity)
    it('rejects NaN as number (L115)', () => {
        const result = validateSchema(NaN, { type: 'number', fallback: 0 });
        expect(result.ok).toBe(false);
    });

    it('rejects Infinity as number', () => {
        const result = validateSchema(Infinity, { type: 'number', fallback: 0 });
        expect(result.ok).toBe(false);
    });

    // L122: boolean type mismatch
    it('rejects non-boolean for boolean schema (L122)', () => {
        const result = validateSchema('true', { type: 'boolean', fallback: false });
        expect(result.ok).toBe(false);
    });

    // Null/undefined data
    it('rejects null data', () => {
        const result = validateSchema(null, { type: 'string', fallback: '' });
        expect(result.ok).toBe(false);
    });

    // Unknown type passes through
    it('passes through unknown schema types', () => {
        const result = validateSchema('anything', { type: 'custom' });
        expect(result.ok).toBe(true);
    });
});
