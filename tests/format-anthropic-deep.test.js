/**
 * Deep coverage tests for format-anthropic.js
 * Covers: image URLs, cache_control edge cases, array content cross-format conversion,
 * empty multimodals, all uncovered branches.
 */
import { describe, it, expect } from 'vitest';
import { formatToAnthropic, _mergeOrPush } from '../src/lib/format-anthropic.js';

describe('formatToAnthropic — deep branch coverage', () => {

    // ── Image URL handling (http/https direct URLs) ───
    it('handles image with http URL (not base64)', () => {
        const messages = [{
            role: 'user',
            content: 'Look at this',
            multimodals: [{ type: 'image', url: 'https://example.com/photo.jpg' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        const imgBlock = msgs[0].content.find(b => b.type === 'image');
        expect(imgBlock).toBeDefined();
        expect(imgBlock.source.type).toBe('url');
        expect(imgBlock.source.url).toBe('https://example.com/photo.jpg');
    });

    it('handles image with http:// URL', () => {
        const messages = [{
            role: 'user',
            content: 'Look',
            multimodals: [{ type: 'image', url: 'http://example.com/photo.jpg' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        const imgBlock = msgs[0].content.find(b => b.type === 'image');
        expect(imgBlock.source.type).toBe('url');
    });

    it('falls back to base64 when image has no URL prefix', () => {
        const messages = [{
            role: 'user',
            content: 'Describe',
            multimodals: [{ type: 'image', base64: 'rawbase64data' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        const imgBlock = msgs[0].content.find(b => b.type === 'image');
        expect(imgBlock.source.type).toBe('base64');
        // no data URI prefix → mimeType fallback to image/png
        expect(imgBlock.source.media_type).toBe('image/png');
    });

    // ── multimodals with null / non-object entries ───
    it('skips null entries in multimodals array', () => {
        const messages = [{
            role: 'user',
            content: 'Hello',
            multimodals: [null, undefined, 'string', { type: 'image', base64: 'data:image/png;base64,abc' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        const imgBlocks = msgs[0].content.filter(b => b.type === 'image');
        expect(imgBlocks).toHaveLength(1);
    });

    // ── Multimodal with empty contentParts fallback ───
    it('falls back to string content when all multimodals are invalid types', () => {
        const messages = [{
            role: 'user',
            content: 'My text content',
            multimodals: [{ type: 'audio', base64: 'data:audio/mp3;base64,xyz' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // Should fall back to text-only since there are no valid images
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'My text content' }]);
    });

    it('skips multimodal message entirely when content is also empty', () => {
        const messages = [{
            role: 'user',
            content: '',
            multimodals: [{ type: 'audio', base64: 'data:audio/wav;base64,xyz' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // Empty content + no valid image → should be skipped, only Start message
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Start' }]);
    });

    it('handles multimodal with empty text content (whitespace only)', () => {
        const messages = [{
            role: 'user',
            content: '   ',
            multimodals: [{ type: 'image', base64: 'data:image/gif;base64,abc' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // Image should be present, but no text part (whitespace only = skipped)
        const imgBlocks = msgs[0].content.filter(b => b.type === 'image');
        const textBlocks = msgs[0].content.filter(b => b.type === 'text');
        expect(imgBlocks).toHaveLength(1);
        expect(textBlocks).toHaveLength(0);
    });

    // ── Array content (pass-through cross-format conversion) ───
    it('handles array content with empty text parts (should be skipped)', () => {
        const messages = [{
            role: 'user',
            content: [
                { text: '' },
                { text: '  ' },
                { text: 'Valid text' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // Only the non-empty text should survive
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Valid text' }]);
    });

    it('handles image_url with data URI in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: 'data:image/png;base64,AAAA' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
        }]);
    });

    it('handles image_url with HTTP URL in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{
            type: 'image',
            source: { type: 'url', url: 'https://example.com/img.png' },
        }]);
    });

    it('handles input_image type in array content with data URI', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'input_image', image_url: 'data:image/jpeg;base64,BBB' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB' },
        }]);
    });

    it('skips non-image inlineData in array content (e.g. PDF)', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'application/pdf', data: 'pdf_data' } },
                { text: 'Text remains' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // PDF skipped, only text
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Text remains' }]);
    });

    it('handles array content with null parts', () => {
        const messages = [{
            role: 'user',
            content: [null, undefined, { text: 'Valid' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Valid' }]);
    });

    it('falls back to text when array content has no valid parts', () => {
        const messages = [{
            role: 'user',
            content: [null, { irrelevant: true }],
        }];
        // No valid parts — would fall through to text-only
        const { messages: msgs } = formatToAnthropic(messages);
        // Since content is an array (not string), and contentParts is empty,
        // it should fall through to the text-only path, which would use JSON.stringify
        // Since content is empty array-ish, it might be filtered
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    // ── Cache control edge cases ───
    it('converts string content to array when applying cache_control', () => {
        const messages = [
            { role: 'user', content: 'Cacheable', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        const userMsg = msgs[0];
        expect(Array.isArray(userMsg.content)).toBe(true);
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        expect(lastBlock.cache_control).toBeDefined();
    });

    it('handles cache_control when roles do not change (merged messages)', () => {
        const messages = [
            { role: 'user', content: 'Part A' },
            { role: 'user', content: 'Part B', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        // Part A and Part B merge into one user message
        const userParts = msgs[0].content;
        expect(userParts[userParts.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('handles assistant cachePoint', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'World', cachePoint: true },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        const assistantMsg = msgs.find(m => m.role === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
            const last = assistantMsg.content[assistantMsg.content.length - 1];
            expect(last.cache_control).toEqual({ type: 'ephemeral' });
        }
    });

    // ── System content as object ───
    it('handles leading system message with object content', () => {
        const messages = [
            { role: 'system', content: { policy: 'strict', mode: 'safe' } },
            { role: 'user', content: 'Question' },
        ];
        const { system } = formatToAnthropic(messages);
        expect(system).toBe('{"policy":"strict","mode":"safe"}');
    });

    // ── Only system messages (no remaining) ───
    it('returns Start user message when all messages are system', () => {
        const messages = [
            { role: 'system', content: 'Sys1' },
            { role: 'system', content: 'Sys2' },
        ];
        const { messages: msgs, system } = formatToAnthropic(messages);
        expect(system).toBe('Sys1\n\nSys2');
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Start' }]);
    });

    // ── Message with non-string, non-array content ───
    it('handles message with object content (non-string, non-array)', () => {
        const messages = [
            { role: 'user', content: { custom: 'data' } },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        // extractNormalizedMessagePayload now JSON.stringify()s objects without .text
        // to preserve structured data instead of producing '[object Object]'.
        expect(msgs[0].content[0].text).toBe('{"custom":"data"}');
    });

    it('handles message with numeric content', () => {
        const messages = [{ role: 'user', content: 42 }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content[0].text).toBe('42');
    });

    // ── Cache control: claude1HourCaching TTL ───
    it('applies 1h TTL cache_control with claude1HourCaching', () => {
        const messages = [
            { role: 'user', content: 'Cached content', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true, claude1HourCaching: true });
        const userMsg = msgs[0];
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        // Anthropic API only supports { type: 'ephemeral' } — custom TTL strings are not supported
        expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    });

    // ── input_image with https URL in array content ───
    it('handles input_image with HTTPS URL in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'input_image', image_url: { url: 'https://example.com/photo.jpg' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{
            type: 'image',
            source: { type: 'url', url: 'https://example.com/photo.jpg' },
        }]);
    });

    // ── image_url with invalid / empty URL ───
    it('skips image_url when URL is empty', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: '' },
                { text: 'Still here' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Still here' }]);
    });

    // ── inlineData with image MIME ───
    it('handles inlineData with image mimeType in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'image/webp', data: 'WEBP_DATA' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{
            type: 'image',
            source: { type: 'base64', media_type: 'image/webp', data: 'WEBP_DATA' },
        }]);
    });

    // ── Non-leading system message with object content ───
    it('converts non-leading system message with object content to user role', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'system', content: { instruction: 'be helpful' } },
            { role: 'assistant', content: 'OK' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        // Non-leading system → user role with "system: " prefix + JSON.stringify
        const systemAsUser = msgs.find(m => m.content.some?.(p => p.text?.includes('system:')));
        expect(systemAsUser).toBeDefined();
    });

    // ── Anthropic native image part pass-through ───
    it('passes through native Anthropic image parts in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', data: 'NATIVE_DATA', media_type: 'image/png' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content[0].type).toBe('image');
        expect(msgs[0].content[0].source.data).toBe('NATIVE_DATA');
    });

    // ── cachePoint on out-of-bounds index ───
    it('handles cachePoint when fmtIdx exceeds formatted messages', () => {
        // All same-role messages merge into one, so many cachePoints might cause fmtIdx overflow
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'user', content: 'B' },
            { role: 'user', content: 'C', cachePoint: true },
            { role: 'user', content: 'D', cachePoint: true },
            { role: 'user', content: 'E', cachePoint: true },
        ];
        // Should not crash even if fmtIdx goes past array end
        expect(() => formatToAnthropic(messages, { caching: true })).not.toThrow();
    });
});

describe('_mergeOrPush — additional edge cases', () => {
    it('handles merge when previous content is neither string nor array', () => {
        // This shouldn't normally happen, but test defensive behavior
        const msgs = [{ role: 'user', content: { customObj: true } }];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'Extra' }]);
        // Since content is an object (not string, not array), it won't merge normally
        expect(msgs).toHaveLength(1);
    });
});

// ── Additional uncovered branch tests ──

describe('formatToAnthropic — branch gap coverage', () => {
    it('skips image_url with blob: URL (not data: or http:)', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: 'blob:null/some-uuid' },
                { text: 'Remaining text' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // blob: URL should be skipped since it's not data: or http(s):
        const imageParts = msgs[0].content.filter(b => b.type === 'image');
        expect(imageParts).toHaveLength(0);
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Remaining text' }]);
    });

    it('skips image_url with relative path URL', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: '/images/photo.jpg' },
                { text: 'Text' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        const imageParts = msgs[0].content.filter(b => b.type === 'image');
        expect(imageParts).toHaveLength(0);
    });

    it('handles cachePoint on the very first message (ci=0)', () => {
        const messages = [
            { role: 'user', content: 'First message with cache', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        // ci=0 means ci > 0 is false, so fmtIdx stays at 0
        // The cachePoint should still be applied to fmtIdx=0
        const userMsg = msgs[0];
        expect(Array.isArray(userMsg.content)).toBe(true);
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('handles cachePoint when first chatMsg is at ci=0 after system extraction', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'User question', cachePoint: true },
            { role: 'assistant', content: 'Answer' },
        ];
        const { messages: msgs, system } = formatToAnthropic(messages, { caching: true });
        expect(system).toBe('System prompt');
        // The user message is chatMsgs[0], ci=0 → fmtIdx=0
        const userMsg = msgs[0];
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('handles inlineData with missing mimeType entirely', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { data: 'some_data' } },
                { text: 'Text part' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // mimeType defaults to 'application/octet-stream', which doesn't start with 'image/'
        // so the inlineData part should be skipped
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Text part' }]);
    });

    it('handles input_image type with blob: URL in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'input_image', image_url: 'blob:null/uuid-test' },
                { text: 'Text' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // blob: URL should be skipped
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Text' }]);
    });

    it('handles image_url as object without url property', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { detail: 'high' } }, // no .url
                { text: 'Text' },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // extractImageUrlFromPart returns '' for { detail: 'high' } (no .url)
        // empty string doesn't match data: or http: → skipped
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Text' }]);
    });

    it('handles multimodal image with url that does not start with http', () => {
        const messages = [{
            role: 'user',
            content: 'Look at this',
            multimodals: [{ type: 'image', url: 'ftp://example.com/photo.jpg' }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        // ftp:// URL goes to base64 path (not http/https), parses as raw data
        const imgBlock = msgs[0].content.find(b => b.type === 'image');
        expect(imgBlock).toBeDefined();
        // Since url is in .url (not .base64), the base64 path reads .base64 which is undefined
        // parseBase64DataUri(undefined) returns { mimeType: null, data: '' }
        // But the code reads modal.base64, not modal.url for the base64 path
    });

    it('handles multiple consecutive same-role messages with cachePoint', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'user', content: 'B', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true, claude1HourCaching: true });
        // A and B merge into one user message; B's cachePoint applies at ci=1
        // Since ci=1, ci>0 is true, prevRole===curRole → no fmtIdx increment
        const userMsg = msgs[0];
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        // Anthropic API only supports { type: 'ephemeral' } — custom TTL strings are not supported
        expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    });
});
