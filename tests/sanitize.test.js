import { describe, it, expect } from 'vitest';
import {
    isInlaySceneWrapperText,
    stripInternalTags,
    stripStaleAutoCaption,
    extractNormalizedMessagePayload,
    sanitizeMessages,
    sanitizeBodyJSON,
    stripThoughtDisplayContent,
} from '../src/lib/sanitize.js';

describe('isInlaySceneWrapperText', () => {
    it('returns false for non-string', () => {
        expect(isInlaySceneWrapperText(null)).toBe(false);
        expect(isInlaySceneWrapperText(123)).toBe(false);
    });

    it('returns false for regular text', () => {
        expect(isInlaySceneWrapperText('Hello world')).toBe(false);
    });

    it('returns true for inlay scene wrapper pattern', () => {
        expect(isInlaySceneWrapperText('<lb-xnai scene="test">{{inlay::image1}}</lb-xnai>')).toBe(true);
        expect(isInlaySceneWrapperText('<lb-xnai scene="s1">{{inlayed::data}}</lb-xnai>')).toBe(true);
        expect(isInlaySceneWrapperText('<lb-xnai scene="bg">{{inlayeddata::x}}</lb-xnai>')).toBe(true);
    });
});

describe('stripInternalTags', () => {
    it('returns non-string values as-is', () => {
        expect(stripInternalTags(null)).toBe(null);
        expect(stripInternalTags(123)).toBe(123);
    });

    it('strips <qak> tags', () => {
        expect(stripInternalTags('Hello <qak>world</qak>')).toBe('Hello world');
    });

    it('trims whitespace', () => {
        expect(stripInternalTags('  hello  ')).toBe('hello');
    });

    it('preserves inlay scene wrappers', () => {
        const inlay = '<lb-xnai scene="test">{{inlay::img}}</lb-xnai>';
        expect(stripInternalTags(inlay)).toBe(inlay.trim());
    });
});

describe('stripStaleAutoCaption', () => {
    it('returns non-string as-is', () => {
        expect(stripStaleAutoCaption(null, {})).toBe(null);
    });

    it('does not strip when no image intent keywords', () => {
        const text = 'Hello world [some caption here]';
        expect(stripStaleAutoCaption(text, {})).toBe(text);
    });

    it('strips trailing auto-caption when image keywords present', () => {
        const text = 'Check this image [a beautiful sunset over mountains]';
        expect(stripStaleAutoCaption(text, {})).toBe('Check this image');
    });

    it('preserves text with multimodals attached', () => {
        const text = 'Check this image [a sunset]';
        const msg = { multimodals: [{ type: 'image' }] };
        expect(stripStaleAutoCaption(text, msg)).toBe(text);
    });

    it('preserves inlay tokens', () => {
        const text = '{{inlay::test}} image [caption text here]';
        expect(stripStaleAutoCaption(text, {})).toBe(text);
    });
});

describe('extractNormalizedMessagePayload', () => {
    it('handles string content', () => {
        const result = extractNormalizedMessagePayload({ content: 'Hello' });
        expect(result.text).toBe('Hello');
        expect(result.multimodals).toEqual([]);
    });

    it('handles RisuAI multimodals array', () => {
        const result = extractNormalizedMessagePayload({
            content: 'With image',
            multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }]
        });
        expect(result.text).toBe('With image');
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('image');
    });

    it('handles OpenAI image_url content parts', () => {
        const result = extractNormalizedMessagePayload({
            content: [
                { type: 'text', text: 'Describe this' },
                { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
            ]
        });
        expect(result.text).toBe('Describe this');
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('image');
        expect(result.multimodals[0].url).toBe('https://example.com/img.png');
    });

    it('handles Gemini inlineData content parts', () => {
        const result = extractNormalizedMessagePayload({
            content: [
                { text: 'Audio message' },
                { inlineData: { mimeType: 'audio/mp3', data: 'base64data' } }
            ]
        });
        expect(result.text).toBe('Audio message');
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].type).toBe('audio');
    });

    it('handles Anthropic image blocks', () => {
        const result = extractNormalizedMessagePayload({
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'jpgdata' } }
            ]
        });
        expect(result.multimodals).toHaveLength(1);
        expect(result.multimodals[0].mimeType).toBe('image/jpeg');
    });

    it('handles null content', () => {
        const result = extractNormalizedMessagePayload({ content: null });
        expect(result.text).toBe('');
        expect(result.multimodals).toEqual([]);
    });

    it('handles object content with text property', () => {
        const result = extractNormalizedMessagePayload({ content: { text: 'obj text' } });
        expect(result.text).toBe('obj text');
    });

    // P1-B: Object content without .text should be JSON.stringify'd, not String() which gives '[object Object]'
    it('JSON.stringifys object content without .text property', () => {
        const result = extractNormalizedMessagePayload({ content: { custom: 'data', nested: { a: 1 } } });
        expect(result.text).toBe('{"custom":"data","nested":{"a":1}}');
    });

    it('still uses String() for numeric content', () => {
        const result = extractNormalizedMessagePayload({ content: 42 });
        expect(result.text).toBe('42');
    });

    it('still uses String() for boolean content', () => {
        const result = extractNormalizedMessagePayload({ content: true });
        expect(result.text).toBe('true');
    });

    it('JSON.stringifys empty object content', () => {
        const result = extractNormalizedMessagePayload({ content: {} });
        expect(result.text).toBe('{}');
    });
});

describe('sanitizeMessages', () => {
    it('returns empty array for non-array input', () => {
        expect(sanitizeMessages(null)).toEqual([]);
        expect(sanitizeMessages('not array')).toEqual([]);
    });

    it('filters null and undefined entries', () => {
        const result = sanitizeMessages([
            { role: 'user', content: 'Hello' },
            null,
            undefined,
            { role: 'assistant', content: 'World' },
        ]);
        expect(result).toHaveLength(2);
    });

    it('filters messages without role', () => {
        const result = sanitizeMessages([
            { content: 'no role' },
            { role: '', content: 'empty role' },
            { role: 'user', content: 'valid' },
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('valid');
    });

    it('filters messages with null/undefined content', () => {
        const result = sanitizeMessages([
            { role: 'user', content: null },
            { role: 'user', content: undefined },
            { role: 'user', content: 'valid' },
        ]);
        expect(result).toHaveLength(1);
    });

    it('filters messages with empty content after stripping', () => {
        const result = sanitizeMessages([
            { role: 'user', content: '' },
            { role: 'user', content: '   ' },
            { role: 'user', content: 'actual content' },
        ]);
        expect(result).toHaveLength(1);
    });

    it('strips internal tags from content', () => {
        const result = sanitizeMessages([
            { role: 'user', content: 'Hello <qak>world</qak>' },
        ]);
        expect(result[0].content).toBe('Hello world');
    });

    it('never mutates original input', () => {
        const original = [{ role: 'user', content: '<qak>test</qak>' }];
        const originalContent = original[0].content;
        sanitizeMessages(original);
        expect(original[0].content).toBe(originalContent);
    });

    it('removes toJSON property if present', () => {
        const msg = { role: 'user', content: 'test', toJSON: () => 'bad' };
        const result = sanitizeMessages([msg]);
        expect(result[0].toJSON).toBeUndefined();
    });

    it('preserves multimodal messages with empty text', () => {
        const result = sanitizeMessages([
            { role: 'user', content: '', multimodals: [{ type: 'image' }] },
        ]);
        expect(result).toHaveLength(1);
    });
});

describe('sanitizeBodyJSON', () => {
    it('filters null messages from JSON body', () => {
        const body = JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'user', content: 'Hello' },
                null,
                { role: 'assistant', content: 'Hi' },
            ]
        });
        const result = JSON.parse(sanitizeBodyJSON(body));
        expect(result.messages).toHaveLength(2);
    });

    it('filters null contents from Gemini-style body', () => {
        const body = JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: 'Hi' }] },
                null,
            ]
        });
        const result = JSON.parse(sanitizeBodyJSON(body));
        expect(result.contents).toHaveLength(1);
    });

    it('returns non-JSON strings as-is', () => {
        const formData = 'grant_type=authorization_code&code=abc123';
        expect(sanitizeBodyJSON(formData)).toBe(formData);
    });

    it('returns original on stringify failure', () => {
        const body = '{"invalid": }';
        expect(sanitizeBodyJSON(body)).toBe(body);
    });
});

describe('stripThoughtDisplayContent', () => {
    it('returns empty text as-is', () => {
        expect(stripThoughtDisplayContent('')).toBe('');
        expect(stripThoughtDisplayContent(null)).toBe(null);
    });

    it('strips <Thoughts> tags', () => {
        const text = '<Thoughts>I am thinking about this...</Thoughts>\nActual response here.';
        expect(stripThoughtDisplayContent(text)).toBe('Actual response here.');
    });

    it('strips multiple thought blocks', () => {
        const text = '<Thoughts>think1</Thoughts>\nMiddle text\n<Thoughts>think2</Thoughts>\nFinal text.';
        expect(stripThoughtDisplayContent(text)).toBe('Middle text\nFinal text.');
    });

    it('returns original text when no thought markers', () => {
        const text = 'Just normal text without any thoughts.';
        expect(stripThoughtDisplayContent(text)).toBe(text);
    });

    it('strips old-style > [Thought Process] blocks', () => {
        // Old-style: everything before the triple-newline gap is stripped.
        // The literal \\n\\n are also cleaned up by the artifact removal step.
        const text = '> [Thought Process]\n> Title\n\n\n\nActual content here';
        const result = stripThoughtDisplayContent(text);
        expect(result).toBe('Actual content here');
    });

    it('cleans up \\n\\n artifacts', () => {
        const text = 'Some text\\n\\nmore text';
        expect(stripThoughtDisplayContent(text)).toBe('Some textmore text');
    });
});
