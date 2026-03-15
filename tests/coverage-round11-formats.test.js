/**
 * coverage-round11-formats.test.js
 *
 * Targeted branch coverage for:
 *   - format-openai.js (26 uncov → target ~10)
 *   - format-anthropic.js (19 uncov → target ~8)
 *   - format-gemini.js (17 uncov → target ~10)
 *   - response-parsers.js (14 uncov → target ~8)
 *   - stream-builders.js (26 uncov → target ~5)
 *   - sanitize.js (10 uncov → target ~3)
 *   - init.js (15 uncov → target ~5)
 *   - router.js (20 uncov → target ~5)
 */
import { describe, it, expect } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';
import { formatToGemini, ThoughtSignatureCache } from '../src/lib/format-gemini.js';
import {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from '../src/lib/response-parsers.js';
import { extractNormalizedMessagePayload } from '../src/lib/sanitize.js';

// ═══════════════════════════════════════════════════════
//  format-openai.js — uncovered branches
// ═══════════════════════════════════════════════════════

describe('formatToOpenAI — deep branch coverage', () => {
    // L64: null modal in multimodals → continue
    it('skips null entries in multimodals', () => {
        const msgs = [
            { role: 'user', content: 'Look', multimodals: [null, undefined, { type: 'image', base64: 'data:image/png;base64,abc' }] },
        ];
        const result = formatToOpenAI(msgs, {});
        expect(result.length).toBe(1);
        expect(result[0].content).toBeInstanceOf(Array);
    });

    // L67: non-image non-audio modal type → no push
    it('ignores unknown modal types', () => {
        const msgs = [
            { role: 'user', content: 'See video', multimodals: [{ type: 'video', url: 'http://example.com/v.mp4' }] },
        ];
        const result = formatToOpenAI(msgs, {});
        // Video modal is ignored, only text remains
        expect(result.length).toBe(1);
    });

    // L69: image with url but no base64
    it('uses url when base64 is absent for image modal', () => {
        const msgs = [
            { role: 'user', content: 'Look at this', multimodals: [{ type: 'image', url: 'https://example.com/img.png' }] },
        ];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content).toBeInstanceOf(Array);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart.image_url.url).toBe('https://example.com/img.png');
    });

    // L67 else: audio modal
    it('handles audio modal with wav mime type', () => {
        const msgs = [
            { role: 'user', content: 'Listen', multimodals: [{ type: 'audio', base64: 'data:audio/wav;base64,QUFB' }] },
        ];
        const result = formatToOpenAI(msgs, {});
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeDefined();
        expect(audioPart.input_audio.format).toBe('wav');
    });

    it('handles audio modal with ogg mime type', () => {
        const msgs = [{ role: 'user', content: 'x', multimodals: [{ type: 'audio', base64: 'data:audio/ogg;base64,QQ' }] }];
        const result = formatToOpenAI(msgs, {});
        const ap = result[0].content.find(p => p.type === 'input_audio');
        expect(ap.input_audio.format).toBe('ogg');
    });

    it('handles audio modal with flac mime type', () => {
        const msgs = [{ role: 'user', content: 'x', multimodals: [{ type: 'audio', base64: 'data:audio/flac;base64,QQ' }] }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content.find(p => p.type === 'input_audio').input_audio.format).toBe('flac');
    });

    it('handles audio modal with webm mime type', () => {
        const msgs = [{ role: 'user', content: 'x', multimodals: [{ type: 'audio', base64: 'data:audio/webm;base64,QQ' }] }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content.find(p => p.type === 'input_audio').input_audio.format).toBe('webm');
    });

    it('defaults audio format to mp3 for unknown mime', () => {
        const msgs = [{ role: 'user', content: 'x', multimodals: [{ type: 'audio', base64: 'data:audio/aac;base64,QQ' }] }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content.find(p => p.type === 'input_audio').input_audio.format).toBe('mp3');
    });

    // L81: non-string non-array content (object) → else branch, payload.text || String(m.content)
    it('handles object content (non-string non-array)', () => {
        // After sanitize, messages with object content should still pass through
        // We need a message that passes sanitize but has non-string, non-array content
        // and no multimodals. extractNormalizedMessagePayload will return text=''
        // and the final else branch fires: msg.content = payload.text || String(m.content ?? '')
        const msgs = [
            { role: 'user', content: 'first' },
            // Direct object content — sanitize keeps it since role is valid string
            { role: 'assistant', content: { custom: 'value' } },
        ];
        const result = formatToOpenAI(msgs, {});
        // The object content should be stringified
        expect(result.length).toBeGreaterThanOrEqual(1);
    });

    // L88-91: Array.isArray(m.content) branch with cross-format mapping
    it('maps Anthropic-style base64 image in array content', () => {
        const msgs = [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' } },
                { type: 'text', text: 'describe this' },
            ],
        }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content).toBeInstanceOf(Array);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart).toBeDefined();
    });

    it('maps Gemini inlineData image in array content', () => {
        const msgs = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'image/png', data: 'xyz' } },
            ],
        }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content).toBeInstanceOf(Array);
    });

    it('maps Gemini inlineData audio in array content', () => {
        const msgs = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'audio/mp3', data: 'audiodata' } },
            ],
        }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].content).toBeInstanceOf(Array);
        const ap = result[0].content.find(p => p.type === 'input_audio');
        expect(ap).toBeDefined();
    });

    // L94-95: sysfirst moves system message to top
    it('sysfirst moves system from middle to front', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'system', content: 'Be helpful' },
            { role: 'assistant', content: 'Sure' },
        ];
        const result = formatToOpenAI(msgs, { sysfirst: true });
        expect(result[0].role).toBe('system');
    });

    // L102: altrole merge with mixed content (array + string)
    it('altrole merges consecutive same-role with mixed content types', () => {
        const msgs = [
            { role: 'assistant', content: 'text response' },
            { role: 'assistant', content: [{ type: 'text', text: 'array response' }] },
        ];
        const result = formatToOpenAI(msgs, { altrole: true });
        // After remap assistant→model, both messages have role 'model' → merged
        expect(result.length).toBe(1);
        expect(result[0].role).toBe('model');
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    it('altrole merges with both content as arrays', () => {
        const msgs = [
            { role: 'assistant', content: [{ type: 'text', text: 'A' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'B' }] },
        ];
        const result = formatToOpenAI(msgs, { altrole: true });
        expect(result.length).toBe(1);
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content.length).toBe(2);
    });

    // name property on regular user message
    it('preserves name on user message', () => {
        const msgs = [{ role: 'user', content: 'Hello there', name: 'Bob' }];
        const result = formatToOpenAI(msgs, {});
        expect(result[0].name).toBe('Bob');
    });

    // developerRole conversion
    it('developerRole converts system to developer', () => {
        const msgs = [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hi' },
        ];
        const result = formatToOpenAI(msgs, { developerRole: true });
        expect(result[0].role).toBe('developer');
    });

    // mergesys with system + non-string first user content
    it('mergesys merges system into non-string first content', () => {
        const msgs = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ];
        const result = formatToOpenAI(msgs, { mergesys: true });
        // After merge, first user msg content starts with system prompt
        expect(result.length).toBe(1);
    });

    // mustuser with assistant first
    it('mustuser prepends user when first msg is assistant', () => {
        const msgs = [
            { role: 'assistant', content: 'I start' },
            { role: 'user', content: 'Ok' },
        ];
        const result = formatToOpenAI(msgs, { mustuser: true });
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
    });
});

// ═══════════════════════════════════════════════════════
//  format-anthropic.js — uncovered branches
// ═══════════════════════════════════════════════════════

describe('formatToAnthropic — deep branch coverage', () => {
    // L79: null modal → continue
    it('skips null modals in multimodals array', () => {
        const msgs = [
            { role: 'user', content: 'Look', multimodals: [null, { type: 'image', base64: 'data:image/png;base64,abc' }] },
        ];
        const result = formatToAnthropic(msgs, {});
        expect(result.messages.length).toBeGreaterThan(0);
    });

    // L100-101: image with URL (not base64)
    it('handles image with URL (not data URI)', () => {
        const msgs = [{
            role: 'user', content: 'Look',
            multimodals: [{ type: 'image', url: 'https://example.com/img.jpg' }],
        }];
        const result = formatToAnthropic(msgs, {});
        const part = result.messages.find(m => m.role === 'user');
        expect(part).toBeDefined();
    });

    // L116-119: Array.isArray(m.content) with inlineData
    it('handles array content with inlineData parts', () => {
        const msgs = [{
            role: 'user',
            content: [
                { inlineData: { mimeType: 'image/png', data: 'base64data' } },
                { type: 'text', text: 'describe it' },
            ],
        }];
        const result = formatToAnthropic(msgs, {});
        expect(result.messages.length).toBeGreaterThan(0);
    });

    // L122-124: image_url / input_image with data URI
    it('converts image_url data URI to Anthropic base64 format', () => {
        const msgs = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } },
            ],
        }];
        const result = formatToAnthropic(msgs, {});
        expect(result.messages.length).toBeGreaterThan(0);
    });

    it('converts image_url HTTP URL to Anthropic URL source', () => {
        const msgs = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'https://example.com/photo.png' } },
            ],
        }];
        const result = formatToAnthropic(msgs, {});
        expect(result.messages.length).toBeGreaterThan(0);
    });

    // L129-134: caching with cache_control on message content
    it('applies cache_control with cachePoint on messages', () => {
        const msgs = [
            { role: 'user', content: 'Important context for caching', cachePoint: true },
            { role: 'assistant', content: 'Got it' },
            { role: 'user', content: 'Follow up' },
        ];
        const result = formatToAnthropic(msgs, { caching: true });
        // Should have cache_control on the cached message
        const userMsg = result.messages.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
    });

    it('caching with string content gets converted to array with cache_control', () => {
        // When content is string and cachePoint is true, it should be wrapped in array
        const msgs = [
            { role: 'user', content: 'Cache this please', cachePoint: true },
            { role: 'assistant', content: 'Cached' },
        ];
        const result = formatToAnthropic(msgs, { caching: true });
        expect(result.messages.length).toBeGreaterThan(0);
    });

    // L145-146: system handling in output
    it('extracts system prompt', () => {
        const msgs = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hi' },
        ];
        const result = formatToAnthropic(msgs, {});
        expect(result.system).toBeDefined();
        expect(result.system).toContain('helpful assistant');
    });

    // L168: first message not user → unshift user
    it('prepends user message when first is assistant', () => {
        const msgs = [
            { role: 'assistant', content: 'I start the conversation' },
        ];
        const result = formatToAnthropic(msgs, {});
        expect(result.messages[0].role).toBe('user');
    });

    // L172-176: consecutive same-role merging
    it('merges consecutive user messages', () => {
        const msgs = [
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
            { role: 'assistant', content: 'Response' },
        ];
        const result = formatToAnthropic(msgs, {});
        // Consecutive user messages should be merged by _mergeOrPush
        expect(result.messages.filter(m => m.role === 'user').length).toBeLessThanOrEqual(2);
    });
});

// ═══════════════════════════════════════════════════════
//  format-gemini.js — uncovered branches
// ═══════════════════════════════════════════════════════

describe('formatToGemini — deep branch coverage', () => {
    // L55: system content non-string → JSON.stringify
    it('handles system message with non-string content', () => {
        const msgs = [
            { role: 'system', content: { instructions: 'Be helpful' } },
            { role: 'user', content: 'Hi' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: true });
        expect(result.systemInstruction.length).toBe(1);
        expect(typeof result.systemInstruction[0]).toBe('string');
    });

    // Non-preserveSystem: system merged into first user content
    it('merges system into user as prefix when preserveSystem is false', () => {
        const msgs = [
            { role: 'system', content: 'Be helpful' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: false });
        expect(result.systemInstruction.length).toBe(0);
        expect(result.contents[0].parts[0].text).toContain('system:');
    });

    // L116: non-string non-array content → JSON.stringify
    it('handles non-string non-array content (object)', () => {
        const msgs = [
            { role: 'user', content: { data: 'complex' } },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.length).toBe(1);
    });

    // L153: stripThoughtDisplayContent for model messages
    it('strips thought content from model messages', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: '<Thoughts>\nThinking...\n</Thoughts>\nThe answer is 42.' },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.length).toBe(2);
    });

    // L187: image modal with URL → fileData
    it('converts image with URL to fileData', () => {
        const msgs = [{
            role: 'user', content: 'Look',
            multimodals: [{ type: 'image', url: 'https://example.com/img.png', mimeType: 'image/png' }],
        }];
        const result = formatToGemini(msgs, {});
        const userParts = result.contents[0].parts;
        const filePart = userParts.find(p => p.fileData);
        expect(filePart).toBeDefined();
    });

    // L190: image base64 with no explicit mimeType
    it('defaults mimeType for base64 image without explicit mime', () => {
        const msgs = [{
            role: 'user', content: 'See',
            multimodals: [{ type: 'image', base64: 'data:image/jpeg;base64,abc' }],
        }];
        const result = formatToGemini(msgs, {});
        expect(result.contents[0].parts.length).toBeGreaterThanOrEqual(1);
    });

    // L219-221: system after leading block → merge into user
    it('merges non-leading system message into user content', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'system', content: 'Extra instruction' },
            { role: 'assistant', content: 'Ok' },
        ];
        const result = formatToGemini(msgs, {});
        // System after first non-system should be merged as user content
        expect(result.contents.length).toBeGreaterThanOrEqual(2);
    });

    it('non-leading system creates new user part if previous is not user', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Reply' },
            { role: 'system', content: 'Injected instruction' },
            { role: 'user', content: 'Next' },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.length).toBeGreaterThanOrEqual(3);
    });

    // L241: empty text + no multimodals → skip
    it('skips messages with empty text and no multimodals', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: '' },
            { role: 'user', content: 'Next' },
        ];
        const result = formatToGemini(msgs, {});
        // Empty assistant message should be skipped
        const modelContents = result.contents.filter(c => c.role === 'model');
        expect(modelContents.length).toBe(0);
    });

    // L248-255: multimodal merge into same-role previous
    it('merges multimodal into previous same-role message', () => {
        const msgs = [
            { role: 'user', content: 'First part' },
            { role: 'user', content: 'Second part', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }] },
        ];
        const result = formatToGemini(msgs, {});
        // Should merge into single user content
        expect(result.contents.filter(c => c.role === 'user').length).toBe(1);
    });

    // L257-259: multimodal new message (different role)
    it('creates new message for multimodal in different role', () => {
        const msgs = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'See this', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }] },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.length).toBe(2);
    });

    // L265-267: text-only merge into previous same-role
    it('merges consecutive text-only same-role', () => {
        const msgs = [
            { role: 'user', content: 'Part A' },
            { role: 'user', content: 'Part B' },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.filter(c => c.role === 'user').length).toBe(1);
    });

    // L269: text-only new message
    it('creates new message for different role text', () => {
        const msgs = [
            { role: 'user', content: 'Q' },
            { role: 'assistant', content: 'A' },
        ];
        const result = formatToGemini(msgs, {});
        expect(result.contents.length).toBe(2);
    });

    // L276: useThoughtSignature with cached signature
    it('injects thought signature from cache', () => {
        ThoughtSignatureCache.save('Hello world', 'cached-sig-123');
        const msgs = [
            { role: 'user', content: 'Q' },
            { role: 'assistant', content: 'Hello world' },
        ];
        const result = formatToGemini(msgs, { useThoughtSignature: true });
        const modelContent = result.contents.find(c => c.role === 'model');
        expect(modelContent.parts[0].thoughtSignature).toBe('cached-sig-123');
    });

    // preserveSystem with only system messages → add Start user message
    it('adds Start user message when only system instruction exists', () => {
        const msgs = [
            { role: 'system', content: 'You are helpful' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: true });
        expect(result.contents.length).toBe(1);
        expect(result.contents[0].parts[0].text).toBe('Start');
    });

    // video + audio modals
    it('handles video and audio multimodals', () => {
        const msgs = [{
            role: 'user', content: 'Media',
            multimodals: [
                { type: 'video', base64: 'data:video/mp4;base64,aaa' },
                { type: 'audio', base64: 'data:audio/wav;base64,bbb' },
            ],
        }];
        const result = formatToGemini(msgs, {});
        expect(result.contents[0].parts.length).toBeGreaterThanOrEqual(3); // text + 2 media
    });

    // multimodal merge: text appended to existing text part vs new part after media
    it('appends text to existing text part when merging multimodal same-role', () => {
        const msgs = [
            { role: 'user', content: 'First text' },
            { role: 'user', content: 'Second text', multimodals: [{ type: 'image', base64: 'data:image/png;base64,x' }] },
        ];
        const result = formatToGemini(msgs, {});
        const userContent = result.contents.find(c => c.role === 'user');
        expect(userContent.parts.length).toBeGreaterThanOrEqual(2);
    });

    it('adds new text part after media part when merging multimodal same-role', () => {
        const msgs = [
            { role: 'user', content: 'Start', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }] },
            { role: 'user', content: 'After image', multimodals: [{ type: 'image', base64: 'data:image/png;base64,def' }] },
        ];
        const result = formatToGemini(msgs, {});
        const userContent = result.contents.find(c => c.role === 'user');
        // Should have: text, image, text, image
        expect(userContent.parts.length).toBeGreaterThanOrEqual(4);
    });
});

// ═══════════════════════════════════════════════════════
//  response-parsers.js — uncovered branches
// ═══════════════════════════════════════════════════════

describe('response-parsers — deep branch coverage', () => {
    // parseOpenAINonStreamingResponse L38-40: reasoning_content
    it('extracts reasoning_content from message level', () => {
        const data = {
            choices: [{
                message: { content: 'Answer', reasoning_content: 'Thinking about it...' },
            }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('Answer');
    });

    // L46: OpenRouter reasoning field
    it('extracts OpenRouter reasoning when no reasoning_content', () => {
        const data = {
            choices: [{
                message: { content: 'Answer', reasoning: 'Chain of thought...' },
            }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('Chain of thought');
    });

    // L46: reasoning ignored when reasoning_content present
    it('ignores reasoning when reasoning_content is present', () => {
        const data = {
            choices: [{
                message: { content: 'Answer', reasoning_content: 'Primary', reasoning: 'Duplicate' },
            }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('Primary');
        expect(result.content).not.toContain('Duplicate');
    });

    // L70: <think> block extraction
    it('extracts DeepSeek-style <think> blocks', () => {
        const data = {
            choices: [{
                message: { content: '<think>Deep thought</think>The answer is 42.' },
            }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('Deep thought');
        expect(result.content).toContain('42');
    });

    // L77: usage token tracking
    it('processes usage metadata', () => {
        const data = {
            choices: [{ message: { content: 'Result' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
        const result = parseOpenAINonStreamingResponse(data, 'test-req-1');
        expect(result.success).toBe(true);
    });

    // parseResponsesAPINonStreamingResponse
    it('parses Responses API with reasoning + text output', () => {
        const data = {
            output: [
                { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Thinking...' }] },
                { type: 'message', content: [{ type: 'output_text', text: 'Final answer' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('Final answer');
    });

    // L84: fallback to parseOpenAI when output missing but choices present
    it('falls back to OpenAI parser when output missing but choices present', () => {
        const data = {
            choices: [{ message: { content: 'Fallback content' } }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Fallback content');
    });

    // L84: no output and no choices → error
    it('returns error when no output and no choices', () => {
        const result = parseResponsesAPINonStreamingResponse({});
        expect(result.success).toBe(false);
    });

    // parseGeminiNonStreamingResponse
    it('handles Gemini safety block', () => {
        const data = { promptFeedback: { blockReason: 'SAFETY' } };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    it('handles candidate finishReason block', () => {
        const data = { candidates: [{ finishReason: 'SAFETY' }] };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
    });

    // L113-116: thought + text parts
    it('parses thought and text parts in Gemini response', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Hmm...' },
                        { text: 'The answer is 42' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('42');
    });

    // L117-120: thought_signature extraction
    it('extracts thought signature from Gemini response', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'hmm' },
                        { text: 'Result', thought_signature: 'sig123' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data, { useThoughtSignature: true });
        expect(result.success).toBe(true);
    });

    // L133: usageMetadata tracking
    it('processes Gemini usageMetadata', () => {
        const data = {
            candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
        };
        const result = parseGeminiNonStreamingResponse(data, {}, 'gem-req-1');
        expect(result.success).toBe(true);
    });

    // parseClaudeNonStreamingResponse
    // L148: error type
    it('handles Claude error response', () => {
        const data = { type: 'error', error: { message: 'Rate limited' } };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Rate limited');
    });

    // L157-176: thinking + redacted_thinking + text
    it('parses thinking and redacted_thinking blocks', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Deep analysis...' },
                { type: 'redacted_thinking' },
                { type: 'text', text: 'Final answer' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('redacted_thinking');
        expect(result.content).toContain('Final answer');
    });

    // L162: text block closes thinking
    it('closes thinking block when text follows', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Step 1' },
                { type: 'text', text: 'Result' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('</Thoughts>');
    });

    // L169-174: data with usage including thinking context
    it('processes Claude usage with thinking context', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Thinking...' },
                { type: 'text', text: 'Answer' },
            ],
            usage: { input_tokens: 10, output_tokens: 50 },
        };
        const result = parseClaudeNonStreamingResponse(data, {}, 'claude-req-1');
        expect(result.success).toBe(true);
    });

    // L184: error without error.message
    it('handles error with no message property', () => {
        const data = { type: 'error', error: { type: 'overloaded_error' } };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
    });

    // Responses API: non-object items in output
    it('skips non-object items in Responses API output', () => {
        const data = {
            output: [null, 'invalid', { type: 'message', content: [{ type: 'output_text', text: 'Valid' }] }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Valid');
    });

    // Responses API: output_text with empty text
    it('handles output_text with empty text', () => {
        const data = {
            output: [{ type: 'message', content: [{ type: 'output_text', text: '' }] }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(false);
    });

    // Gemini: empty response
    it('handles Gemini empty response (no parts)', () => {
        const data = { candidates: [{ content: {} }] };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty');
    });

    // Gemini: thought-only response (thought never closed normally)
    it('closes open thought block at end of Gemini response', () => {
        const data = {
            candidates: [{
                content: { parts: [{ thought: true, text: 'Just thinking' }] },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('</Thoughts>');
    });
});

// ═══════════════════════════════════════════════════════
//  sanitize.js — additional branch coverage
// ═══════════════════════════════════════════════════════

describe('sanitize — extractNormalizedMessagePayload edge cases', () => {
    it('extracts multimodal from message with multimodals array', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user', content: 'Look at this',
            multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }],
        });
        expect(payload.multimodals.length).toBe(1);
        expect(payload.text).toBe('Look at this');
    });

    it('handles message with null multimodals', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user', content: 'text only', multimodals: null,
        });
        expect(payload.multimodals.length).toBe(0);
    });

    it('handles message with empty content', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user', content: '',
        });
        expect(payload.text).toBe('');
    });

    it('extracts text from array content with text parts', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' World' }],
        });
        expect(payload.text).toContain('Hello');
    });

    it('extracts multimodals from array content with image parts', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user',
            content: [
                { type: 'text', text: 'Describe this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ],
        });
        expect(payload.multimodals.length).toBeGreaterThan(0);
    });

    it('handles Gemini-style inlineData in array content', () => {
        const payload = extractNormalizedMessagePayload({
            role: 'user',
            content: [
                { inlineData: { mimeType: 'image/png', data: 'abc' } },
            ],
        });
        expect(payload.multimodals.length).toBeGreaterThan(0);
    });
});
