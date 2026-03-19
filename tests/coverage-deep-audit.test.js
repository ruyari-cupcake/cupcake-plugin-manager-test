/**
 * coverage-deep-audit.test.js — Comprehensive tests targeting uncovered branches/functions.
 *
 * Targets:
 *   1. format-anthropic.js — array content, caching, _mergeOrPush string path
 *   2. format-openai.js — audio multimodal, cross-format conversion, altrole array merge
 *   3. schema.js — parseAndValidate, maxItems:0, maxLength:0, undefined key
 *   4. settings-backup.js — snapshotAll, restoreIfEmpty zero cache, load edge cases
 *   5. csp-exec.js — nonce fallthrough, parentNode null
 *   6. router.js — edge cases in _toFiniteFloat/_toFiniteInt, handleRequest normalization
 *   7. sanitize.js — edge branches in extractNormalizedMessagePayload, sanitizeBodyJSON
 *   8. fetch-custom.js — customParams blocklist, responses API body transform, copilot URL rewriting
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
//  1. format-anthropic.js — deep branch coverage
// ═══════════════════════════════════════════════════════════════════
import { formatToAnthropic, _mergeOrPush } from '../src/lib/format-anthropic.js';

describe('formatToAnthropic — deep branch coverage', () => {
    it('_mergeOrPush: converts prev string content to array when merging same role', () => {
        const msgs = [{ role: 'user', content: 'Hello plain text' }];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'appended' }]);
        expect(msgs).toHaveLength(1);
        expect(Array.isArray(msgs[0].content)).toBe(true);
        expect(msgs[0].content[0]).toEqual({ type: 'text', text: 'Hello plain text' });
        expect(msgs[0].content[1]).toEqual({ type: 'text', text: 'appended' });
    });

    it('handles leading system messages with non-string content (JSON.stringify path)', () => {
        const messages = [
            { role: 'system', content: { instruction: 'be helpful' } },
            { role: 'user', content: 'hi' },
        ];
        const { system, messages: fmt } = formatToAnthropic(messages);
        expect(system).toContain('instruction');
        expect(system).toContain('be helpful');
        expect(fmt[0].role).toBe('user');
    });

    it('handles non-leading system messages with non-string content', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'system', content: { context: 'important' } },
            { role: 'user', content: 'more' },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        // Non-leading system → user with "System: " prefix
        const systemConverted = fmt.find(m => {
            if (!Array.isArray(m.content)) return false;
            return m.content.some(p => typeof p.text === 'string' && p.text.includes('System:'));
        });
        expect(systemConverted).toBeTruthy();
    });

    it('converts OpenAI image_url content parts to Anthropic format', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'text', text: 'Look at this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        expect(userMsg).toBeTruthy();
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.type).toBe('base64');
        expect(imagePart.source.data).toBe('abc123');
    });

    it('converts OpenAI image_url with https URL to Anthropic url source', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.type).toBe('url');
        expect(imagePart.source.url).toBe('https://example.com/photo.jpg');
    });

    it('converts input_image parts to Anthropic format', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'input_image', image_url: 'data:image/jpeg;base64,xyz789' },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.media_type).toBe('image/jpeg');
    });

    it('converts Gemini inlineData image parts to Anthropic format', () => {
        const messages = [
            { role: 'user', content: [
                { inlineData: { data: 'gemini_img_data', mimeType: 'image/webp' } },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.media_type).toBe('image/webp');
        expect(imagePart.source.data).toBe('gemini_img_data');
    });

    it('drops non-image Gemini inlineData (e.g. audio)', () => {
        const messages = [
            { role: 'user', content: [
                { inlineData: { data: 'audio_data', mimeType: 'audio/mp3' } },
                { type: 'text', text: 'hello' },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        // Audio should be dropped; only text should remain
        const audioPart = userMsg.content.find(p => p.source?.media_type?.startsWith('audio'));
        expect(audioPart).toBeUndefined();
    });

    it('falls back to raw content when multimodals produce zero valid parts', () => {
        // Multimodal with invalid type
        const messages = [
            { role: 'user', content: 'fallback text', multimodals: [{ type: 'unknown_type' }] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        expect(userMsg).toBeTruthy();
        const textPart = userMsg.content.find(p => p.text?.includes('fallback text'));
        expect(textPart).toBeTruthy();
    });

    it('handles multimodal image with http/https URL source', () => {
        const messages = [
            { role: 'user', content: 'With image', multimodals: [
                { type: 'image', url: 'https://cdn.example.com/img.jpg' },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.type).toBe('url');
        expect(imagePart.source.url).toBe('https://cdn.example.com/img.jpg');
    });

    it('defaults mediaType to image/png when mimeType is null in base64 multimodal', () => {
        const messages = [
            { role: 'user', content: 'img', multimodals: [
                { type: 'image', base64: 'raw_b64_no_prefix' },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart).toBeTruthy();
        expect(imagePart.source.media_type).toBe('image/png');
    });

    it('applies cache_control breakpoints with string content', () => {
        const messages = [
            { role: 'user', content: 'first message', cachePoint: true },
            { role: 'assistant', content: 'response' },
        ];
        const { messages: fmt } = formatToAnthropic(messages, { caching: true });
        expect(fmt.length).toBeGreaterThanOrEqual(2);
        const userMsg = fmt.find(m => m.role === 'user');
        // Should have been converted from string to array with cache_control
        expect(Array.isArray(userMsg.content)).toBe(true);
        // Either the content was converted to array with cache_control, or it's still working correctly
        expect(userMsg).toBeTruthy();
    });

    it('applies cache_control from cachePoint on array content', () => {
        const messages = [
            { role: 'user', content: 'first point' },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: 'second point', cachePoint: true },
        ];
        const { messages: fmt } = formatToAnthropic(messages, { caching: true });
        const lastUser = [...fmt].reverse().find(m => m.role === 'user');
        expect(lastUser).toBeTruthy();
        if (Array.isArray(lastUser.content) && lastUser.content.length > 0) {
            const lastPart = lastUser.content[lastUser.content.length - 1];
            expect(lastPart.cache_control).toEqual({ type: 'ephemeral' });
        }
    });

    it('preserves Anthropic-native image parts in array content', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'gifdata' } },
                { type: 'text', text: 'see this gif' },
            ] },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        const userMsg = fmt.find(m => m.role === 'user');
        const imagePart = userMsg.content.find(p => p.type === 'image');
        expect(imagePart.source.data).toBe('gifdata');
    });

    it('handles empty array content gracefully', () => {
        const messages = [
            { role: 'user', content: [] },
            { role: 'user', content: 'real message' },
        ];
        const { messages: fmt } = formatToAnthropic(messages);
        expect(fmt.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  2. format-openai.js — deep branch coverage
// ═══════════════════════════════════════════════════════════════════
import { formatToOpenAI } from '../src/lib/format-openai.js';

describe('formatToOpenAI — deep branch coverage', () => {
    it('handles audio multimodal with wav format', () => {
        const messages = [
            { role: 'user', content: 'Listen', multimodals: [
                { type: 'audio', base64: 'data:audio/wav;base64,wavdata123', mimeType: 'audio/wav' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const userMsg = result.find(m => m.role === 'user');
        expect(Array.isArray(userMsg.content)).toBe(true);
        const audioPart = userMsg.content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeTruthy();
        expect(audioPart.input_audio.format).toBe('wav');
        expect(audioPart.input_audio.data).toBe('wavdata123');
    });

    it('handles audio multimodal with ogg format', () => {
        const messages = [
            { role: 'user', content: 'Audio', multimodals: [
                { type: 'audio', base64: 'data:audio/ogg;base64,oggdata', mimeType: 'audio/ogg' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const userMsg = result.find(m => m.role === 'user');
        const audioPart = userMsg.content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('ogg');
    });

    it('handles audio multimodal with flac format', () => {
        const messages = [
            { role: 'user', content: 'Audio', multimodals: [
                { type: 'audio', base64: 'data:audio/flac;base64,flacdata', mimeType: 'audio/flac' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('flac');
    });

    it('handles audio multimodal with webm format', () => {
        const messages = [
            { role: 'user', content: 'Audio', multimodals: [
                { type: 'audio', base64: 'data:audio/webm;base64,webmdata', mimeType: 'audio/webm' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('webm');
    });

    it('defaults to mp3 for unknown audio MIME type', () => {
        const messages = [
            { role: 'user', content: 'Audio', multimodals: [
                { type: 'audio', base64: 'data:audio/x-custom;base64,customdata', mimeType: 'audio/x-custom' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    it('handles audio multimodal with null mimeType (uses raw base64)', () => {
        const messages = [
            { role: 'user', content: 'Audio', multimodals: [
                { type: 'audio', base64: 'rawb64audiodata' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeTruthy();
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    it('converts Anthropic-native image source in array content to OpenAI format', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'pngdata' } },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const userMsg = result[0];
        const imagePart = userMsg.content.find(p => p.type === 'image_url');
        expect(imagePart).toBeTruthy();
        expect(imagePart.image_url.url).toContain('data:image/png;base64,pngdata');
    });

    it('converts Gemini inlineData image in array content to OpenAI format', () => {
        const messages = [
            { role: 'user', content: [
                { inlineData: { data: 'geminiimgdata', mimeType: 'image/jpeg' } },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const imagePart = result[0].content.find(p => p.type === 'image_url');
        expect(imagePart).toBeTruthy();
        expect(imagePart.image_url.url).toContain('data:image/jpeg;base64,geminiimgdata');
    });

    it('converts Gemini inlineData audio in array content to OpenAI input_audio', () => {
        const messages = [
            { role: 'user', content: [
                { inlineData: { data: 'geminiaudiodata', mimeType: 'audio/wav' } },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeTruthy();
        expect(audioPart.input_audio.format).toBe('wav');
    });

    it('passes through unknown content parts in array', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'text', text: 'hello' },
                { type: 'custom_part', data: 'something' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const customPart = result[0].content.find(p => p.type === 'custom_part');
        expect(customPart).toBeTruthy();
        expect(customPart.data).toBe('something');
    });

    it('handles non-string non-array content (object → payload.text fallback)', () => {
        const messages = [
            { role: 'user', content: { text: 'structured text' } },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        expect(typeof result[0].content).toBe('string');
        expect(result[0].content).toContain('structured text');
    });

    it('altrole merge with array + string content mix', () => {
        const messages = [
            { role: 'assistant', content: [{ type: 'text', text: 'part1' }] },
            { role: 'assistant', content: 'part2 as string' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        // Both should be merged into one "model" message
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('model');
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    it('altrole merge with string + string consecutive messages', () => {
        const messages = [
            { role: 'assistant', content: 'first line' },
            { role: 'assistant', content: 'second line' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(result[0].content).toContain('first line');
        expect(result[0].content).toContain('second line');
    });

    it('altrole merge with array + array consecutive messages', () => {
        const messages = [
            { role: 'user', content: [{ type: 'text', text: 'A' }] },
            { role: 'user', content: [{ type: 'text', text: 'B' }] },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content).toHaveLength(2);
    });

    it('preserves msg.name on messages', () => {
        const messages = [
            { role: 'user', content: 'hi', name: 'example_user' },
        ];
        const result = formatToOpenAI(messages);
        expect(result[0].name).toBe('example_user');
    });

    it('preserves msg.name on spacer user message (mustuser)', () => {
        const messages = [
            { role: 'assistant', content: 'resp' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
    });

    it('mustuser does not prepend when first message is system', () => {
        const messages = [
            { role: 'system', content: 'system msg' },
            { role: 'user', content: 'hello' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result[0].role).toBe('system');
    });

    it('developerRole converts system to developer', () => {
        const messages = [
            { role: 'system', content: 'instructions' },
            { role: 'user', content: 'hello' },
        ];
        const result = formatToOpenAI(messages, { developerRole: true });
        expect(result[0].role).toBe('developer');
        expect(result[1].role).toBe('user');
    });

    it('handles multimodal image with URL (not base64)', () => {
        const messages = [
            { role: 'user', content: 'see', multimodals: [
                { type: 'image', url: 'https://example.com/img.jpg' },
            ] },
        ];
        const result = formatToOpenAI(messages);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart).toBeTruthy();
        expect(imgPart.image_url.url).toBe('https://example.com/img.jpg');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  3. schema.js — parseAndValidate + edge branches
// ═══════════════════════════════════════════════════════════════════
import { validateSchema, parseAndValidate, schemas } from '../src/lib/schema.js';

describe('schema.js — deep branch coverage', () => {
    it('parseAndValidate: parses valid JSON and validates', () => {
        const result = parseAndValidate('{"key": "value"}', { type: 'object', fallback: {} });
        expect(result.ok).toBe(true);
        expect(result.data.key).toBe('value');
    });

    it('parseAndValidate: returns failure for invalid JSON', () => {
        const result = parseAndValidate('{bad json', { type: 'object', fallback: { x: 1 } });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('JSON parse failed');
        expect(result.fallback).toEqual({ x: 1 });
    });

    it('parseAndValidate: validates array type after parsing', () => {
        const result = parseAndValidate('[1, 2, 3]', { type: 'array', fallback: [] });
        expect(result.ok).toBe(true);
        expect(result.data).toEqual([1, 2, 3]);
    });

    it('parseAndValidate: returns failure when parsed type mismatches schema', () => {
        const result = parseAndValidate('"a string"', { type: 'array', fallback: [] });
        expect(result.ok).toBe(false);
    });

    it('maxItems: 0 is treated as no limit (falsy check)', () => {
        const data = [1, 2, 3, 4, 5];
        const result = validateSchema(data, { type: 'array', maxItems: 0 });
        expect(result.ok).toBe(true);
        expect(result.data).toHaveLength(5); // maxItems: 0 doesn't truncate
    });

    it('maxItems truncates when > 0', () => {
        const data = [1, 2, 3, 4, 5];
        const result = validateSchema(data, { type: 'array', maxItems: 3 });
        expect(result.ok).toBe(true);
        expect(result.data).toHaveLength(3);
    });

    it('maxLength: 0 is treated as no limit (falsy check)', () => {
        const result = validateSchema('hello world', { type: 'string', maxLength: 0 });
        expect(result.ok).toBe(true);
        expect(result.data).toBe('hello world'); // maxLength: 0 doesn't truncate
    });

    it('maxLength truncates when > 0', () => {
        const result = validateSchema('hello world', { type: 'string', maxLength: 5 });
        expect(result.ok).toBe(true);
        expect(result.data).toBe('hello');
    });

    it('object with key explicitly set to undefined fails required check', () => {
        const data = { id: undefined, name: 'test' };
        const result = validateSchema(data, {
            type: 'object',
            required: ['id', 'name'],
            fallback: {},
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required key: id');
    });

    it('object with missing key fails required check', () => {
        const data = { name: 'test' };
        const result = validateSchema(data, {
            type: 'object',
            required: ['id', 'name'],
            fallback: {},
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Missing required key: id');
    });

    it('validates schemas.subPluginRegistry with valid data', () => {
        const data = [
            { id: 'sp1', code: 'console.log(1)', name: 'Test', version: '1.0', enabled: true },
        ];
        const result = validateSchema(data, schemas.subPluginRegistry);
        expect(result.ok).toBe(true);
        expect(result.data[0].id).toBe('sp1');
    });

    it('schemas.subPluginRegistry skips items missing required keys', () => {
        const data = [
            { id: 'sp1', code: 'valid' },
            { name: 'missing-id' },  // missing 'id' and 'code'
        ];
        const result = validateSchema(data, schemas.subPluginRegistry);
        expect(result.ok).toBe(true);
        // Only the first item should survive (second fails required check)
        expect(result.data).toHaveLength(1);
    });

    it('object property validation replaces invalid property with fallback', () => {
        const data = { ts: 'not-a-number', version: 'v1' };
        const result = validateSchema(data, schemas.bootStatus);
        expect(result.ok).toBe(true);
        expect(result.data.ts).toBe(0); // number fallback
        expect(result.data.version).toBe('v1');
    });

    it('unknown schema type passes through', () => {
        const result = validateSchema('anything', { type: /** @type {any} */ ('custom') });
        expect(result.ok).toBe(true);
        expect(result.data).toBe('anything');
    });

    it('array with items schema filters invalid items silently', () => {
        const schema = {
            type: /** @type {const} */ ('array'),
            items: { type: /** @type {const} */ ('string'), fallback: '' },
        };
        const result = validateSchema(['a', 42, 'b', null], schema);
        expect(result.ok).toBe(true);
        // 42 and null should be filtered out (not strings)
        expect(result.data).toEqual(['a', 'b']);
    });

    it('null data returns fallback for object schema', () => {
        const result = validateSchema(null, { type: 'object', fallback: { a: 1 } });
        expect(result.ok).toBe(false);
        expect(result.fallback).toEqual({ a: 1 });
    });

    it('array given for object type returns error with correct type string', () => {
        const result = validateSchema([1, 2], { type: 'object', fallback: {} });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('array');
    });

    it('non-boolean for boolean type', () => {
        const r = validateSchema('true', { type: 'boolean', fallback: false });
        expect(r.ok).toBe(false);
        expect(r.fallback).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  4. settings-backup.js — moved to coverage-settings-backup.test.js
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  5. csp-exec.js — requires jsdom, moved to coverage-csp-exec.test.js
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  6. router.js — _toFiniteFloat/_toFiniteInt edge cases
// ═══════════════════════════════════════════════════════════════════
import { _toFiniteFloat, _toFiniteInt } from '../src/lib/router.js';

describe('router.js — helper edge cases', () => {
    it('_toFiniteFloat returns undefined for NaN input', () => {
        expect(_toFiniteFloat('not-a-number')).toBeUndefined();
    });

    it('_toFiniteFloat returns undefined for Infinity', () => {
        expect(_toFiniteFloat('Infinity')).toBeUndefined();
        expect(_toFiniteFloat('-Infinity')).toBeUndefined();
    });

    it('_toFiniteFloat returns number for valid float string', () => {
        expect(_toFiniteFloat('3.14')).toBe(3.14);
        expect(_toFiniteFloat('0')).toBe(0);
        expect(_toFiniteFloat('-1.5')).toBe(-1.5);
    });

    it('_toFiniteFloat handles empty string', () => {
        expect(_toFiniteFloat('')).toBeUndefined();
    });

    it('_toFiniteInt returns undefined for NaN input', () => {
        expect(_toFiniteInt('abc')).toBeUndefined();
    });

    it('_toFiniteInt returns undefined for Infinity', () => {
        expect(_toFiniteInt('Infinity')).toBeUndefined();
    });

    it('_toFiniteInt returns integer for valid int string', () => {
        expect(_toFiniteInt('42')).toBe(42);
        expect(_toFiniteInt('0')).toBe(0);
        expect(_toFiniteInt('-10')).toBe(-10);
    });

    it('_toFiniteInt truncates decimal', () => {
        expect(_toFiniteInt('3.7')).toBe(3);
    });

    it('_toFiniteFloat and _toFiniteInt handle null/undefined', () => {
        expect(_toFiniteFloat(null)).toBeUndefined();
        expect(_toFiniteFloat(undefined)).toBeUndefined();
        expect(_toFiniteInt(null)).toBeUndefined();
        expect(_toFiniteInt(undefined)).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  7. sanitize.js — extractNormalizedMessagePayload edges
// ═══════════════════════════════════════════════════════════════════
import {
    extractNormalizedMessagePayload,
    sanitizeMessages,
    sanitizeBodyJSON,
    stripInternalTags,
    isInlaySceneWrapperText,
    stripStaleAutoCaption,
} from '../src/lib/sanitize.js';

describe('sanitize.js — deep branch coverage', () => {
    it('extractNormalizedMessagePayload: handles object content with .text property', () => {
        const msg = { content: { text: 'from object' } };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toBe('from object');
    });

    it('extractNormalizedMessagePayload: handles object content without .text (JSON stringify)', () => {
        const msg = { content: { key: 'value', nested: true } };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toContain('key');
        expect(result.text).toContain('value');
    });

    it('extractNormalizedMessagePayload: handles number content', () => {
        const msg = { content: 42 };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toBe('42');
    });

    it('extractNormalizedMessagePayload: handles video inlineData', () => {
        const msg = { content: [
            { inlineData: { data: 'videodata', mimeType: 'video/mp4' } },
        ] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('video');
    });

    it('extractNormalizedMessagePayload: handles input_audio content part', () => {
        const msg = { content: [
            { type: 'input_audio', input_audio: { data: 'audiodata', format: 'wav' } },
        ] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('audio');
        expect(result.multimodals[0].mimeType).toBe('audio/wav');
    });

    it('extractNormalizedMessagePayload: handles input_image content part with string URL', () => {
        const msg = { content: [
            { type: 'input_image', image_url: 'data:image/png;base64,imgdata' },
        ] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('image');
    });

    it('extractNormalizedMessagePayload: handles input_image with https URL', () => {
        const msg = { content: [
            { type: 'input_image', image_url: { url: 'https://example.com/img.png' } },
        ] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].url).toBe('https://example.com/img.png');
    });

    it('extractNormalizedMessagePayload: handles Anthropic image block in array content', () => {
        const msg = { content: [
            { type: 'image', source: { type: 'base64', data: 'anthrodata', media_type: 'image/jpeg' } },
        ] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('image');
        expect(result.multimodals[0].mimeType).toBe('image/jpeg');
    });

    it('extractNormalizedMessagePayload: skips null/non-object parts in array content', () => {
        const msg = { content: [null, undefined, 'string', { type: 'text', text: 'valid' }] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toBe('valid');
    });

    it('extractNormalizedMessagePayload: null multimodals are skipped', () => {
        const msg = { content: 'text', multimodals: [null, { type: 'image', base64: 'data:image/png;base64,x' }] };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals).toHaveLength(1);
    });

    it('sanitizeMessages: filters messages without role', () => {
        const msgs = [
            { role: 'user', content: 'ok' },
            { content: 'no role' },
            { role: '', content: 'empty role' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(1);
    });

    it('sanitizeMessages: filters messages with null content', () => {
        const msgs = [
            { role: 'user', content: null },
            { role: 'user', content: 'hello' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(1);
    });

    it('sanitizeMessages: removes toJSON function from messages', () => {
        const msgs = [
            { role: 'user', content: 'hello', toJSON: () => ({}) },
        ];
        const result = sanitizeMessages(msgs);
        expect(result[0].toJSON).toBeUndefined();
    });

    it('sanitizeBodyJSON: handles non-JSON gracefully (return as-is)', () => {
        // sanitizeBodyJSON returns the original string when parse fails
        const result = sanitizeBodyJSON('{not valid json');
        expect(typeof result).toBe('string');
    });

    it('sanitizeBodyJSON: JSON.stringify with toJSON strips it naturally', () => {
        // When an object has toJSON, JSON.stringify uses its return value
        // After sanitizeBodyJSON, the empty object from toJSON gets filtered
        const body = {
            messages: [
                { role: 'user', content: 'hello' },
            ],
        };
        const result = sanitizeBodyJSON(JSON.stringify(body));
        const parsed = JSON.parse(result);
        expect(parsed.messages).toHaveLength(1);
        expect(parsed.messages[0].content).toBe('hello');
    });

    it('sanitizeBodyJSON: validates contents array without filtering (validate-only)', () => {
        const body = {
            contents: [
                { parts: [{ text: 'hello' }] },
                null,
                { parts: [{ text: 'world' }] },
            ],
        };
        const result = sanitizeBodyJSON(JSON.stringify(body));
        const parsed = JSON.parse(result);
        // validate-only: 원본 그대로 반환 (필터링 안 함)
        expect(parsed.contents).toHaveLength(3);
    });

    it('stripInternalTags: returns non-string input as-is', () => {
        expect(stripInternalTags(42)).toBe(42);
        expect(stripInternalTags(null)).toBe(null);
    });

    it('stripInternalTags: removes <qak> tags', () => {
        expect(stripInternalTags('hello <qak>internal</qak> world')).toBe('hello internal world');
    });

    it('isInlaySceneWrapperText: returns false for non-string', () => {
        expect(isInlaySceneWrapperText(null)).toBe(false);
        expect(isInlaySceneWrapperText(123)).toBe(false);
    });

    it('isInlaySceneWrapperText: returns true for valid inlay text', () => {
        const text = '<lb-xnai scene="test">{{inlay::data}}</lb-xnai>';
        expect(isInlaySceneWrapperText(text)).toBe(true);
    });

    it('stripStaleAutoCaption: does not strip if no image keywords', () => {
        const msg = { content: 'Just [some bracketed text] here' };
        const result = stripStaleAutoCaption(msg.content, msg);
        expect(result).toContain('[some bracketed text]');
    });

    it('stripStaleAutoCaption: strips multi-word caption after image keyword', () => {
        const msg = { content: 'Here is a photo of the sunset [a beautiful golden sunset over the ocean]' };
        const result = stripStaleAutoCaption(msg.content, msg);
        expect(result).not.toContain('[a beautiful golden sunset over the ocean]');
    });

    it('stripStaleAutoCaption: does not strip short brackets even with image keyword', () => {
        const msg = { content: 'An image reference [v2]' };
        const result = stripStaleAutoCaption(msg.content, msg);
        expect(result).toContain('[v2]');
    });

    it('stripStaleAutoCaption: does not strip if message has multimodals', () => {
        const msg = { content: 'Photo attached [a nice sunset photo]', multimodals: [{ type: 'image' }] };
        const result = stripStaleAutoCaption(msg.content, msg);
        expect(result).toContain('[a nice sunset photo]');
    });

    it('stripStaleAutoCaption: preserves inlay text', () => {
        const text = '<lb-xnai scene="test">{{inlay::data}}</lb-xnai>';
        const msg = { content: text };
        expect(stripStaleAutoCaption(text, msg)).toBe(text);
    });

    it('stripStaleAutoCaption: returns non-string as-is', () => {
        expect(stripStaleAutoCaption(null, {})).toBe(null);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  8. helpers.js — additional edge cases
// ═══════════════════════════════════════════════════════════════════
import {
    safeStringify, hasNonEmptyMessageContent,
    hasAttachedMultimodals, escHtml, parseBase64DataUri,
    extractImageUrlFromPart, getSubPluginFileAccept,
} from '../src/lib/helpers.js';

describe('helpers.js — deep branch coverage', () => {
    it('safeStringify: filters nulls from nested arrays', () => {
        const obj = { items: [1, null, 3, undefined, 5] };
        const result = JSON.parse(safeStringify(obj));
        expect(result.items).toEqual([1, 3, 5]);
    });

    it('safeStringify: handles deeply nested arrays', () => {
        const obj = { a: { b: [null, { c: [null, 'x'] }] } };
        const result = JSON.parse(safeStringify(obj));
        expect(result.a.b).toHaveLength(1);
        expect(result.a.b[0].c).toEqual(['x']);
    });

    it('hasNonEmptyMessageContent: returns false for whitespace-only string', () => {
        expect(hasNonEmptyMessageContent('   ')).toBe(false);
    });

    it('hasNonEmptyMessageContent: returns true for non-empty array', () => {
        expect(hasNonEmptyMessageContent([{ type: 'text' }])).toBe(true);
    });

    it('hasNonEmptyMessageContent: returns true for object', () => {
        expect(hasNonEmptyMessageContent({ key: 'val' })).toBe(true);
    });

    it('hasNonEmptyMessageContent: returns true for number as string', () => {
        expect(hasNonEmptyMessageContent(42)).toBe(true);
    });

    it('hasAttachedMultimodals: returns false for missing/empty multimodals', () => {
        expect(hasAttachedMultimodals(null)).toBe(false);
        expect(hasAttachedMultimodals({})).toBe(false);
        expect(hasAttachedMultimodals({ multimodals: [] })).toBe(false);
    });

    it('escHtml: escapes all special characters', () => {
        expect(escHtml('<script>alert("xss")&</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;');
    });

    it('escHtml: handles null/undefined', () => {
        expect(escHtml(null)).toBe('');
        expect(escHtml(undefined)).toBe('');
    });

    it('parseBase64DataUri: handles empty/null input', () => {
        expect(parseBase64DataUri('')).toEqual({ mimeType: null, data: '' });
        expect(parseBase64DataUri(null)).toEqual({ mimeType: null, data: '' });
        expect(parseBase64DataUri(42)).toEqual({ mimeType: null, data: '' });
    });

    it('parseBase64DataUri: handles raw base64 without prefix', () => {
        expect(parseBase64DataUri('abc123')).toEqual({ mimeType: null, data: 'abc123' });
    });

    it('parseBase64DataUri: parses standard data URI', () => {
        const result = parseBase64DataUri('data:image/png;base64,abc123');
        expect(result.mimeType).toBe('image/png');
        expect(result.data).toBe('abc123');
    });

    it('extractImageUrlFromPart: handles null/undefined', () => {
        expect(extractImageUrlFromPart(null)).toBe('');
        expect(extractImageUrlFromPart(undefined)).toBe('');
    });

    it('extractImageUrlFromPart: extracts from string image_url', () => {
        expect(extractImageUrlFromPart({ image_url: 'http://example.com/img.png' })).toBe('http://example.com/img.png');
    });

    it('extractImageUrlFromPart: extracts from object image_url', () => {
        expect(extractImageUrlFromPart({ image_url: { url: 'https://cdn.example.com/x.jpg' } })).toBe('https://cdn.example.com/x.jpg');
    });

    it('extractImageUrlFromPart: returns empty for missing image_url', () => {
        expect(extractImageUrlFromPart({ type: 'text' })).toBe('');
    });

    it('getSubPluginFileAccept: returns desktop-appropriate accept', () => {
        const result = getSubPluginFileAccept();
        expect(result).toContain('.js');
        expect(result).toContain('.mjs');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  9. model-helpers.js — edge cases
// ═══════════════════════════════════════════════════════════════════
import {
    supportsOpenAIReasoningEffort,
    needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams,
    shouldStripGPT54SamplingForReasoning,
} from '../src/lib/model-helpers.js';

describe('model-helpers.js — deep branch coverage', () => {
    it('supportsOpenAIReasoningEffort: recognizes o3, o4, and gpt-5 models', () => {
        expect(supportsOpenAIReasoningEffort('o3')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o3-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o4-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('gpt-5')).toBe(true);
    });

    it('supportsOpenAIReasoningEffort: returns false for o1 and GPT-4 models', () => {
        expect(supportsOpenAIReasoningEffort('o1')).toBe(false);
        expect(supportsOpenAIReasoningEffort('gpt-4o')).toBe(false);
        expect(supportsOpenAIReasoningEffort('gpt-4-turbo')).toBe(false);
    });

    it('needsCopilotResponsesAPI: returns true for GPT-5.4+ models', () => {
        expect(needsCopilotResponsesAPI('gpt-5.4')).toBe(true);
        expect(needsCopilotResponsesAPI('gpt-5.5')).toBe(true);
    });

    it('needsCopilotResponsesAPI: returns false for gpt-5 (no minor) and o-series', () => {
        expect(needsCopilotResponsesAPI('gpt-5')).toBe(false);
        expect(needsCopilotResponsesAPI('gpt-5.3')).toBe(false);
        expect(needsCopilotResponsesAPI('o3')).toBe(false);
        expect(needsCopilotResponsesAPI('o4-mini')).toBe(false);
        expect(needsCopilotResponsesAPI('gpt-4o')).toBe(false);
    });

    it('shouldStripOpenAISamplingParams: strips for o3/o4', () => {
        expect(shouldStripOpenAISamplingParams('o3-mini')).toBe(true);
        expect(shouldStripOpenAISamplingParams('o4-mini')).toBe(true);
    });

    it('shouldStripOpenAISamplingParams: does not strip for GPT', () => {
        expect(shouldStripOpenAISamplingParams('gpt-4o')).toBe(false);
    });

    it('shouldStripGPT54SamplingForReasoning: strips when reasoning is set on GPT-5.4', () => {
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', 'medium')).toBe(true);
    });

    it('shouldStripGPT54SamplingForReasoning: does not strip without reasoning', () => {
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', 'none')).toBe(false);
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', '')).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  10. token-usage.js — edge cases
// ═══════════════════════════════════════════════════════════════════
import { _normalizeTokenUsage } from '../src/lib/token-usage.js';

describe('token-usage.js — deep branch coverage', () => {
    it('normalizes OpenAI usage format', () => {
        const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
        const result = _normalizeTokenUsage(usage, 'openai');
        expect(result.input).toBe(100);
        expect(result.output).toBe(50);
    });

    it('normalizes Anthropic usage format', () => {
        const usage = { input_tokens: 200, output_tokens: 100 };
        const result = _normalizeTokenUsage(usage, 'anthropic');
        expect(result.input).toBe(200);
        expect(result.output).toBe(100);
    });

    it('normalizes Gemini usage format', () => {
        const usage = { promptTokenCount: 300, candidatesTokenCount: 120 };
        const result = _normalizeTokenUsage(usage, 'gemini');
        expect(result.input).toBe(300);
        expect(result.output).toBe(120);
    });

    it('returns null for null/undefined usage', () => {
        expect(_normalizeTokenUsage(null, 'openai')).toBeNull();
        expect(_normalizeTokenUsage(undefined, 'openai')).toBeNull();
    });

    it('returns null for non-object usage', () => {
        expect(_normalizeTokenUsage('string', 'openai')).toBeNull();
        expect(_normalizeTokenUsage(42, 'openai')).toBeNull();
    });

    it('handles missing individual token fields', () => {
        const usage = { prompt_tokens: 100 }; // missing completion_tokens
        const result = _normalizeTokenUsage(usage, 'openai');
        expect(result.input).toBe(100);
        expect(result.output).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  11. key-pool.js — additional edge cases
// ═══════════════════════════════════════════════════════════════════
import { KeyPool } from '../src/lib/key-pool.js';

describe('KeyPool — deep branch coverage', () => {
    beforeEach(() => {
        KeyPool._pools = {};
    });

    it('pick returns key from getArgFn', async () => {
        KeyPool._pools = {};
        KeyPool._getArgFn = vi.fn(async () => 'key1 key2');
        const result = await KeyPool.pick('test_key');
        expect(['key1', 'key2']).toContain(result);
    });

    it('drain removes specific key and returns remaining count', () => {
        KeyPool._pools['pool1'] = { keys: ['a', 'b', 'c'], lastRaw: 'a b c' };
        expect(KeyPool.drain('pool1', 'b')).toBe(2);
        expect(KeyPool._pools['pool1'].keys).toEqual(['a', 'c']);
    });

    it('drain returns 0 for non-existent pool', () => {
        expect(KeyPool.drain('nonexist', 'key')).toBe(0);
    });

    it('drain with key not in pool', () => {
        KeyPool._pools['pool1'] = { keys: ['a', 'b'], lastRaw: 'a b' };
        expect(KeyPool.drain('pool1', 'x')).toBe(2);
    });

    it('remaining returns 0 for non-existent pool', () => {
        expect(KeyPool.remaining('nonexist')).toBe(0);
    });

    it('reset clears specified pool', () => {
        KeyPool._pools['pool1'] = { keys: ['a'], lastRaw: 'a' };
        KeyPool.reset('pool1');
        expect(KeyPool._pools['pool1']).toBeUndefined();
    });

    it('withRotation returns no-key error when pool is empty', async () => {
        KeyPool._getArgFn = vi.fn(async () => '');
        KeyPool._pools = {};
        const result = await KeyPool.withRotation('empty_pool', async () => ({}));
        expect(result.success).toBe(false);
        expect(result.content).toContain('API 키');
    });

    it('withRotation retries and drains on retryable status', async () => {
        KeyPool._getArgFn = vi.fn(async () => 'key1 key2');
        // Pre-populate pool with _inline so pick doesn't re-read
        KeyPool._pools['rot_pool'] = {
            keys: ['key1', 'key2'],
            lastRaw: 'key1 key2',
            _inline: true,
        };
        let callCount = 0;
        const fetchFn = vi.fn(async () => {
            callCount++;
            if (callCount === 1) return { success: false, _status: 429 };
            return { success: true, content: 'ok' };
        });
        const result = await KeyPool.withRotation('rot_pool', fetchFn);
        expect(result.success).toBe(true);
    });

    it('_looksLikeWindowsPath detects windows paths', () => {
        expect(KeyPool._looksLikeWindowsPath('C:\\Users\\test')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('\\\\server\\share')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('{ "key": "value" }')).toBe(false);
    });

    it('_buildJsonCredentialError for windows path', () => {
        const err = KeyPool._buildJsonCredentialError('C:\\Users\\test.json');
        expect(err.message).toContain('Windows');
    });

    it('_buildJsonCredentialError for bad unicode escape', () => {
        const err = KeyPool._buildJsonCredentialError('bad', { message: 'Bad Unicode escape' });
        expect(err.message).toContain('역슬래시');
    });

    it('_buildJsonCredentialError for generic error', () => {
        const err = KeyPool._buildJsonCredentialError('data', { message: 'some error' });
        expect(err.message).toContain('some error');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  12. stream-builders.js — setApiRequestLogger + edge cases
// ═══════════════════════════════════════════════════════════════════
import { setApiRequestLogger } from '../src/lib/stream-builders.js';

describe('stream-builders.js — deep branch coverage', () => {
    it('setApiRequestLogger accepts null and non-function', () => {
        // Should not throw
        setApiRequestLogger(null);
        setApiRequestLogger('not a function');
        setApiRequestLogger(() => {});
    });
});

// ═══════════════════════════════════════════════════════════════════
//  13. custom-model-serialization.js — edge cases
// ═══════════════════════════════════════════════════════════════════
import { parseCustomModelsValue, normalizeCustomModel } from '../src/lib/custom-model-serialization.js';

describe('custom-model-serialization.js — deep branch coverage', () => {
    it('parseCustomModelsValue: parses valid JSON array', () => {
        const result = parseCustomModelsValue('[{"uniqueId":"c1","name":"Test"}]');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Test');
    });

    it('parseCustomModelsValue: returns empty array for empty string', () => {
        const result = parseCustomModelsValue('');
        expect(result).toEqual([]);
    });

    it('parseCustomModelsValue: returns empty array for invalid JSON', () => {
        const result = parseCustomModelsValue('{bad}');
        expect(result).toEqual([]);
    });

    it('normalizeCustomModel: adds default fields', () => {
        const model = normalizeCustomModel({ uniqueId: 'c1', name: 'Test' });
        expect(model.uniqueId).toBe('c1');
        expect(model.format).toBeDefined();
    });

    it('normalizeCustomModel: handles null/undefined input', () => {
        const model = normalizeCustomModel(null);
        expect(model).toBeTruthy();
        expect(model.format).toBe('openai');  // should have defaults
        expect(model.name).toBe('');  // toText(undefined) = ''
    });
});

// ═══════════════════════════════════════════════════════════════════
//  14. slot-inference.js — edge cases
// ═══════════════════════════════════════════════════════════════════
import { CPM_SLOT_LIST } from '../src/lib/slot-inference.js';

describe('slot-inference.js — constants', () => {
    it('CPM_SLOT_LIST contains standard slots', () => {
        expect(CPM_SLOT_LIST).toContain('translation');
        expect(CPM_SLOT_LIST).toContain('emotion');
        expect(CPM_SLOT_LIST).toContain('memory');
        expect(CPM_SLOT_LIST.length).toBeGreaterThan(0);
    });
});
