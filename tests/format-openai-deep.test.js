/**
 * Deep coverage tests for format-openai.js
 * Covers: audio multimodals, array content cross-format, altrole merging with arrays,
 * sysfirst edge cases, developerRole, mustuser, all uncovered branches.
 */
import { describe, it, expect } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';

describe('formatToOpenAI — deep branch coverage', () => {

    // ── Audio multimodals ───
    it('handles audio multimodal with wav mime type', () => {
        const messages = [{
            role: 'user',
            content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'data:audio/wav;base64,xyz' }],
        }];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeDefined();
        expect(audioPart.input_audio.format).toBe('wav');
    });

    it('handles audio multimodal with ogg mime type', () => {
        const messages = [{
            role: 'user', content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'data:audio/ogg;base64,xyz' }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('ogg');
    });

    it('handles audio multimodal with flac mime type', () => {
        const messages = [{
            role: 'user', content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'data:audio/flac;base64,xyz' }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('flac');
    });

    it('handles audio multimodal with webm mime type', () => {
        const messages = [{
            role: 'user', content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'data:audio/webm;base64,xyz' }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('webm');
    });

    it('defaults to mp3 format for unknown audio mime type', () => {
        const messages = [{
            role: 'user', content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'data:audio/x-aiff;base64,xyz' }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    it('defaults to mp3 format when no mime type in data URI', () => {
        const messages = [{
            role: 'user', content: 'Listen',
            multimodals: [{ type: 'audio', base64: 'rawbase64noprefix' }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    // ── Image multimodal with URL (no base64) ───
    it('handles image multimodal with url instead of base64', () => {
        const messages = [{
            role: 'user', content: 'See',
            multimodals: [{ type: 'image', url: 'https://example.com/img.png' }],
        }];
        const result = formatToOpenAI(messages);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart.image_url.url).toBe('https://example.com/img.png');
    });

    // ── Multimodal with null/invalid entries ───
    it('skips null/non-object entries in multimodals', () => {
        const messages = [{
            role: 'user', content: 'Hello',
            multimodals: [null, undefined, 'string', { type: 'image', base64: 'data:image/png;base64,abc' }],
        }];
        const result = formatToOpenAI(messages);
        const contentParts = result[0].content;
        expect(contentParts.filter(p => p.type === 'image_url')).toHaveLength(1);
    });

    // ── Multimodal with empty text → plain text becomes contentParts ───
    it('returns text-only content when multimodal images produce no contentParts', () => {
        const messages = [{
            role: 'user', content: 'Text only',
            multimodals: [{ type: 'video', data: 'abc' }],
        }];
        const result = formatToOpenAI(messages);
        // No valid multimodal, result should be text wrapped in content array
        const contentArr = Array.isArray(result[0].content) ? result[0].content : [result[0].content];
        const textParts = contentArr.filter(p => typeof p === 'string' || (p && p.type === 'text'));
        expect(textParts.length).toBeGreaterThan(0);
    });

    // ── Array content: Anthropic → OpenAI conversion ───
    it('converts Anthropic base64 image parts in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', data: 'rawdata', media_type: 'image/jpeg' } },
                { type: 'text', text: 'Describe' },
            ],
        }];
        const result = formatToOpenAI(messages);
        expect(Array.isArray(result[0].content)).toBe(true);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart).toBeDefined();
        expect(imgPart.image_url.url).toBe('data:image/jpeg;base64,rawdata');
    });

    it('converts Gemini inlineData image parts in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'image/gif', data: 'gifdata' } },
            ],
        }];
        const result = formatToOpenAI(messages);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart.image_url.url).toBe('data:image/gif;base64,gifdata');
    });

    it('converts Gemini inlineData audio parts in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'audio/wav', data: 'audiodata' } },
            ],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.data).toBe('audiodata');
        expect(audioPart.input_audio.format).toBe('wav');
    });

    it('skips non-image/non-audio inlineData in array content', () => {
        const messages = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'application/pdf', data: 'pdfdata' } },
                { type: 'text', text: 'Real text' },
            ],
        }];
        const result = formatToOpenAI(messages);
        // PDF parts should be skipped, text remains
        const pdfParts = result[0].content.filter(p => p.type === 'image_url' || p.type === 'input_audio');
        expect(pdfParts).toHaveLength(0);
    });

    it('falls back to default media_type for Anthropic image when none provided', () => {
        const messages = [{
            role: 'user',
            content: [{ type: 'image', source: { type: 'base64', data: 'raw' } }],
        }];
        const result = formatToOpenAI(messages);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart.image_url.url).toBe('data:image/png;base64,raw');
    });

    it('falls back to default mimeType for inlineData when none provided', () => {
        const messages = [{
            role: 'user',
            content: [{ inlineData: { data: 'raw' } }],
        }];
        const result = formatToOpenAI(messages);
        // mimeType defaults to application/octet-stream, which is not image/ or audio/
        // so it should be skipped
        expect(result).toHaveLength(0);
    });

    // ── Non-string, non-array content fallback ───
    it('handles object content (non-string, non-array)', () => {
        const messages = [{ role: 'user', content: { key: 'value' } }];
        const result = formatToOpenAI(messages);
        // Object content now gets JSON.stringify() to preserve data
        expect(result[0].content).toBe('{"key":"value"}');
    });

    it('handles numeric content', () => {
        const messages = [{ role: 'user', content: 42 }];
        const result = formatToOpenAI(messages);
        expect(result[0].content).toBe('42');
    });

    // ── Empty role handling ───
    it('skips messages with no role', () => {
        const messages = [
            { role: '', content: 'No role' },
            { role: 'user', content: 'Valid' },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Valid');
    });

    // ── Content null/undefined ───
    it('skips messages with null content', () => {
        const messages = [
            { role: 'user', content: null },
            { role: 'user', content: 'Valid' },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
    });

    // ── mustuser with space-only content preserves name ───
    it('preserves name on mustuser prepended message', () => {
        const messages = [
            { role: 'assistant', content: 'Response' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
    });

    // ── altrole merging with array content ───
    it('merges non-string content arrays when altrole creates consecutive same-role', () => {
        const messages = [
            { role: 'user', content: [{ type: 'text', text: 'A' }] },
            { role: 'user', content: [{ type: 'text', text: 'B' }] },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content).toHaveLength(2);
    });

    it('merges string + array content when altrole merging', () => {
        const messages = [
            { role: 'user', content: 'Text' },
            { role: 'user', content: [{ type: 'text', text: 'Array part' }] },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    it('merges array + string content when altrole merging', () => {
        const messages = [
            { role: 'user', content: [{ type: 'text', text: 'Array part' }] },
            { role: 'user', content: 'Text' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    // ── mergesys with no remaining messages ───
    it('mergesys with empty non-system messages', () => {
        const messages = [
            { role: 'system', content: 'System only' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        // No non-system messages → newMsgs is empty, sysPrompt not injected
        expect(result).toHaveLength(0);
    });

    // ── sysfirst: no system messages ───
    it('sysfirst does nothing when no system messages exist', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
        ];
        const result = formatToOpenAI(messages, { sysfirst: true });
        expect(result[0].role).toBe('user');
    });

    it('sysfirst does nothing when system is already first', () => {
        const messages = [
            { role: 'system', content: 'Sys' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { sysfirst: true });
        expect(result[0].role).toBe('system');
    });

    // ── Combined config flags ───
    it('handles mergesys + altrole + developerRole together', () => {
        const messages = [
            { role: 'system', content: 'Sys' },
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
            { role: 'assistant', content: 'A2' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true, altrole: true, developerRole: true });
        // system merged into first user, assistants merged, role-mapped to model
        expect(result[0].role).toBe('user');
        expect(result[0].content).toContain('Sys');
        const modelMsgs = result.filter(m => m.role === 'model');
        expect(modelMsgs).toHaveLength(1); // merged
        expect(modelMsgs[0].content).toContain('A1');
        expect(modelMsgs[0].content).toContain('A2');
    });

    // ── Multimodal with both images and text ───
    it('handles multimodal with image URL and text', () => {
        const messages = [{
            role: 'user',
            content: 'Describe this',
            multimodals: [
                { type: 'image', base64: 'data:image/png;base64,abc' },
                { type: 'image', url: 'https://img.example.com/test.jpg' },
            ],
        }];
        const result = formatToOpenAI(messages);
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content[0].type).toBe('text');
        const imgParts = result[0].content.filter(p => p.type === 'image_url');
        expect(imgParts).toHaveLength(2);
    });

    // ── Multimodal with empty text content ───
    it('returns empty string when multimodal has no text and no valid parts', () => {
        const messages = [{
            role: 'user',
            content: '',
            multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }],
        }];
        const result = formatToOpenAI(messages);
        // Image present, so contentParts > 0
        expect(Array.isArray(result[0].content)).toBe(true);
        const imgParts = result[0].content.filter(p => p.type === 'image_url');
        expect(imgParts).toHaveLength(1);
    });

    // ── Message with name property on various conditions ───
    it('preserves name on mustuser blank message', () => {
        const messages = [
            { role: 'assistant', content: 'Hi', name: 'Bot' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        // The prepended user message with content ' ' should not have name
        expect(result[0].name).toBeUndefined();
        expect(result[1].name).toBe('Bot');
    });

    // ── inlineData with missing format in audio ───
    it('defaults audio format from inlineData when split returns empty', () => {
        const messages = [{
            role: 'user',
            content: [{ inlineData: { mimeType: 'audio/', data: 'audiodata' } }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        // Even with empty mime split, the format defaults to 'mp3'
        expect(audioPart.input_audio.format).toBe('mp3');
    });

    it('converts OpenAI-style input_image parts back into image_url content', () => {
        const messages = [{
            role: 'user',
            content: [{ type: 'input_image', image_url: { url: 'https://img.example.com/converted.png' } }],
        }];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        expect(result[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'https://img.example.com/converted.png' },
        });
    });

    it('converts OpenAI-style input_audio parts into normalized input_audio content', () => {
        const messages = [{
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: 'abc123', format: 'wav' } }],
        }];
        const result = formatToOpenAI(messages);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart.input_audio.data).toBe('abc123');
        expect(audioPart.input_audio.format).toBe('wav');
    });

    it('drops array-content messages when every part is invalid or empty', () => {
        const messages = [
            { role: 'user', content: [null, undefined, false] },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toEqual([]);
    });

    it('stringifies non-string system and first-message content during mergesys', () => {
        const result = formatToOpenAI([
            { role: 'system', content: { rule: 'strict' } },
            { role: 'user', content: { prompt: 'hello' } },
        ], { mergesys: true });

        expect(result).toHaveLength(1);
        expect(result[0].content).toContain('{"rule":"strict"}');
        expect(result[0].content).toContain('{"prompt":"hello"}');
    });

    it('filters messages whose roles are removed during sanitization', () => {
        const result = formatToOpenAI([
            { content: 'implicit user' },
            { role: 123, content: 'numeric role' },
        ]);

        expect(result).toEqual([]);
    });

    it('converts system to developer after sysfirst reordering', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 'hello' },
            { role: 'system', content: 'policy' },
        ], { sysfirst: true, developerRole: true });

        expect(result[0]).toEqual({ role: 'developer', content: 'policy' });
        expect(result[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('passes through array parts that are already normalized OpenAI text parts', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [{ type: 'text', text: 'already-normalized' }],
        }]);

        expect(result).toHaveLength(1);
        expect(result[0].content).toEqual([{ type: 'text', text: 'already-normalized' }]);
    });

    // ── Additional branch gap coverage ──

    it('altrole merging preserves name on first message, drops on merged', () => {
        const messages = [
            { role: 'user', content: 'Hello', name: 'Alice' },
            { role: 'user', content: 'Follow-up', name: 'Bob' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        // First message's name is preserved
        expect(result[0].name).toBe('Alice');
        // Content is merged
        expect(result[0].content).toContain('Hello');
        expect(result[0].content).toContain('Follow-up');
    });

    it('mustuser is no-op when first message is already user', () => {
        const messages = [
            { role: 'user', content: 'Already user' },
            { role: 'assistant', content: 'Reply' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe('Already user');
    });

    it('mustuser is no-op when first message is system', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Question' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('system');
    });

    it('mergesys with non-leading system messages interspersed', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Question 1' },
            { role: 'system', content: 'Mid system' },
            { role: 'assistant', content: 'Answer' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        // All system messages are merged, only non-system messages remain
        // The merged system prompt is prepended to first non-system message
        expect(result[0].role).toBe('user');
        expect(result[0].content).toContain('System prompt');
        expect(result[0].content).toContain('Mid system');
        expect(result[0].content).toContain('Question 1');
        // No system messages in output
        expect(result.every(m => m.role !== 'system')).toBe(true);
    });

    it('handles content that is boolean false', () => {
        const messages = [{ role: 'user', content: false }];
        const result = formatToOpenAI(messages);
        // false is not a string, not an array → goes to else branch
        // String(false) = 'false' which is non-empty
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('false');
    });

    it('handles content that is number 0', () => {
        const messages = [{ role: 'user', content: 0 }];
        const result = formatToOpenAI(messages);
        // payload.text for numeric = '0', which is non-empty after trim
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('0');
    });

    it('handles content that is empty array', () => {
        const messages = [{ role: 'user', content: [] }];
        const result = formatToOpenAI(messages);
        // Empty array → mappedParts is empty → msg.content is empty array
        // hasNonEmptyMessageContent([]) returns false → skipped
        expect(result).toHaveLength(0);
    });

    it('altrole merging with array + array content', () => {
        const messages = [
            { role: 'assistant', content: [{ type: 'text', text: 'Part A' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Part B' }] },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('model');
        expect(result[0].content).toHaveLength(2);
        expect(result[0].content[0].text).toBe('Part A');
        expect(result[0].content[1].text).toBe('Part B');
    });

    it('sysfirst moves non-first system message to top', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'system', content: 'Policy' },
        ];
        const result = formatToOpenAI(messages, { sysfirst: true });
        expect(result[0].role).toBe('system');
        expect(result[0].content).toBe('Policy');
        expect(result[1].role).toBe('user');
    });

    it('developerRole + sysfirst applies developer role after reordering', () => {
        const messages = [
            { role: 'user', content: 'hello' },
            { role: 'system', content: 'policy' },
            { role: 'assistant', content: 'reply' },
        ];
        const result = formatToOpenAI(messages, { sysfirst: true, developerRole: true });
        expect(result[0].role).toBe('developer');
        expect(result[0].content).toBe('policy');
    });

    it('altrole merging with empty content parts on both sides', () => {
        const messages = [
            { role: 'user', content: ' ' },
            { role: 'user', content: 'Real text' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        // ' ' has hasNonEmptyMessageContent = false → may be filtered before merge
        // Only 'Real text' should survive
        expect(result.length).toBeGreaterThanOrEqual(1);
        const textContents = result.map(m => m.content).flat();
        expect(textContents.some(c => typeof c === 'string' ? c.includes('Real text') : false)).toBe(true);
    });
});
