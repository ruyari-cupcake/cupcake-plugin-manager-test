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
import { safeStringify } from '../src/lib/helpers.js';

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

describe('sanitizeBodyJSON (validate-only)', () => {
    it('returns valid JSON as-is without re-stringifying', () => {
        const body = JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'user', content: 'Hello' },
                null,
                { role: 'assistant', content: 'Hi' },
            ]
        });
        // validate-only: returns input string unchanged (null in array preserved)
        expect(sanitizeBodyJSON(body)).toBe(body);
    });

    it('returns valid Gemini-style JSON as-is', () => {
        const body = JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: 'Hi' }] },
                null,
            ]
        });
        expect(sanitizeBodyJSON(body)).toBe(body);
    });

    it('returns non-JSON strings as-is', () => {
        const formData = 'grant_type=authorization_code&code=abc123';
        expect(sanitizeBodyJSON(formData)).toBe(formData);
    });

    it('returns invalid JSON as-is (with error log)', () => {
        const body = '{"invalid": }';
        expect(sanitizeBodyJSON(body)).toBe(body);
    });

    it('returns non-string input as-is', () => {
        expect(sanitizeBodyJSON(null)).toBe(null);
        expect(sanitizeBodyJSON(undefined)).toBe(undefined);
        expect(sanitizeBodyJSON(123)).toBe(123);
    });
});

describe('sanitizeMessages — tool-use preservation', () => {
    it('preserves assistant message with tool_calls and content:null', () => {
        const msgs = [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"SF"}' } }] },
            { role: 'tool', tool_call_id: 'call_1', content: '{"temp":72}' },
            { role: 'assistant', content: 'It is 72°F in SF.' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(4);
        expect(result[1].content).toBeNull();
        expect(result[1].tool_calls).toBeDefined();
    });

    it('preserves assistant message with function_call and content:null', () => {
        const msgs = [
            { role: 'user', content: 'Search for cats' },
            { role: 'assistant', content: null, function_call: { name: 'search', arguments: '{"q":"cats"}' } },
            { role: 'function', name: 'search', content: '{"results":[]}' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(3);
        expect(result[1].content).toBeNull();
        expect(result[1].function_call).toBeDefined();
    });

    it('preserves tool role message with tool_call_id', () => {
        const msgs = [
            { role: 'tool', tool_call_id: 'call_1', content: '{"temp":72}' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(1);
        expect(result[0].tool_call_id).toBe('call_1');
    });

    it('still filters non-tool messages with content:null', () => {
        const msgs = [
            { role: 'user', content: null },
            { role: 'assistant', content: null },
            { role: 'user', content: 'valid' },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('valid');
    });

    it('preserves tool_calls message with content:undefined', () => {
        const msgs = [
            { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fn' } }] },
        ];
        const result = sanitizeMessages(msgs);
        expect(result).toHaveLength(1);
        expect(result[0].tool_calls).toBeDefined();
    });
});

describe('safeStringify — tool-use data integrity', () => {
    it('preserves content:null scalar in tool_calls assistant message', () => {
        const body = {
            messages: [
                { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"loc":"SF"}' } }] },
            ]
        };
        const result = JSON.parse(safeStringify(body));
        expect(result.messages[0].content).toBeNull();
        expect(result.messages[0].tool_calls).toHaveLength(1);
    });

    it('does not remove objects from tool_calls array', () => {
        const toolCalls = [
            { id: 'call_1', type: 'function', function: { name: 'fn1' } },
            { id: 'call_2', type: 'function', function: { name: 'fn2' } },
        ];
        const body = { messages: [{ role: 'assistant', content: null, tool_calls: toolCalls }] };
        const result = JSON.parse(safeStringify(body));
        expect(result.messages[0].tool_calls).toHaveLength(2);
    });

    it('filters null items from arrays but not null scalar properties', () => {
        const body = {
            messages: [
                { role: 'user', content: 'hi' },
                null,  // this null in array gets filtered
                { role: 'assistant', content: null },  // this null scalar survives
            ]
        };
        const result = JSON.parse(safeStringify(body));
        // null array element filtered → 2 items
        expect(result.messages).toHaveLength(2);
        // scalar null preserved
        expect(result.messages[1].content).toBeNull();
    });

    it('preserves Anthropic tool_use content blocks', () => {
        const body = {
            messages: [
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: 'Let me check' },
                        { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { location: 'SF' } },
                    ]
                },
            ]
        };
        const result = JSON.parse(safeStringify(body));
        expect(result.messages[0].content).toHaveLength(2);
        expect(result.messages[0].content[1].type).toBe('tool_use');
    });

    it('preserves Google functionCall parts', () => {
        const body = {
            contents: [
                {
                    role: 'model',
                    parts: [{ functionCall: { name: 'get_weather', args: { location: 'SF' } } }]
                },
                {
                    role: 'user',
                    parts: [{ functionResponse: { name: 'get_weather', response: { temp: 72 } } }]
                },
            ]
        };
        const result = JSON.parse(safeStringify(body));
        expect(result.contents).toHaveLength(2);
        expect(result.contents[0].parts[0].functionCall.name).toBe('get_weather');
        expect(result.contents[1].parts[0].functionResponse.response.temp).toBe(72);
    });

    it('filters null from nested arrays inside tool arguments', () => {
        const body = {
            messages: [{
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: {
                        name: 'process_list',
                        arguments: JSON.stringify({ items: ['a', null, 'b'] })
                    }
                }]
            }]
        };
        const result = JSON.parse(safeStringify(body));
        // arguments는 string이므로 내부 null은 safeStringify 영향 안 받음
        const args = JSON.parse(result.messages[0].tool_calls[0].function.arguments);
        // arguments 내부의 null은 safeStringify의 영향 범위 밖 (이미 string)
        expect(args.items).toEqual(['a', null, 'b']);
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
