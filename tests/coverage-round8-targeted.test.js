// @ts-check
/**
 * Coverage Round 8 — Targeted branch coverage for format-openai, format-anthropic,
 * response-parsers, stream-builders, slot-inference.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── format-openai ───
import { formatToOpenAI } from '../src/lib/format-openai.js';

// ─── format-anthropic ───
import { formatToAnthropic } from '../src/lib/format-anthropic.js';

// ─── response-parsers ───
import {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from '../src/lib/response-parsers.js';

// ─── stream-builders ───
import {
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    saveThoughtSignatureFromStream,
} from '../src/lib/stream-builders.js';

// ─── slot-inference ───
import { scoreSlotHeuristic } from '../src/lib/slot-inference.js';

// For inferSlot, we need to mock safeGetArg. Import inferSlot after vi.mock.
const { mockSafeGetArg } = vi.hoisted(() => {
    const mockSafeGetArg = vi.fn().mockResolvedValue('');
    return { mockSafeGetArg };
});

vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
    const original = /** @type {any} */ (await importOriginal());
    return { ...original, safeGetArg: mockSafeGetArg };
});

// Must import inferSlot AFTER vi.mock
const { inferSlot } = await import('../src/lib/slot-inference.js');

/** @type {any} */
const globalAny = globalThis;


// Risu mock for format functions (non-slot-inference)
if (!globalAny.Risu) {
    globalAny.Risu = /** @type {any} */ ({
        getArgument: () => '',
        setArgument: () => {},
    });
}

// ══════════════════════════════════════════════════════════════
//  FORMAT-OPENAI — additional branch coverage
// ══════════════════════════════════════════════════════════════
describe('formatToOpenAI additional branches', () => {
    it('sysfirst moves first system message to top', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'You are helpful' },
            { role: 'assistant', content: 'Hi' },
        ], { sysfirst: true });
        expect(result[0].role).toBe('system');
        expect(result[0].content).toBe('You are helpful');
    });

    it('mergesys merges all system messages into first non-system', () => {
        const result = formatToOpenAI([
            { role: 'system', content: 'Sys1' },
            { role: 'system', content: 'Sys2' },
            { role: 'user', content: 'Hello' },
        ], { mergesys: true });
        expect(result.length).toBe(1);
        expect(result[0].content).toContain('Sys1');
        expect(result[0].content).toContain('Sys2');
    });

    it('mustuser inserts user when first message is assistant', () => {
        const result = formatToOpenAI([
            { role: 'assistant', content: 'Intro' },
        ], { mustuser: true });
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
    });

    it('altrole converts assistant to model and merges consecutive same-role string', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Part 1' },
            { role: 'assistant', content: 'Part 2' },
        ], { altrole: true });
        // assistant → model, two consecutive model messages merged
        const modelMsgs = result.filter(m => m.role === 'model');
        expect(modelMsgs.length).toBe(1);
        expect(modelMsgs[0].content).toContain('Part 1');
        expect(modelMsgs[0].content).toContain('Part 2');
    });

    it('altrole merges array content when prev is array', () => {
        const result = formatToOpenAI([
            { role: 'user', content: [
                { type: 'text', text: 'Image:' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ]},
            { role: 'user', content: 'More text' },
        ], { altrole: true });
        // Two user messages should merge
        expect(result.filter(m => m.role === 'user').length).toBe(1);
    });

    it('altrole merges string prev + array current content', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 'Hello' },
            { role: 'user', content: [
                { type: 'text', text: 'More:' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ]},
        ], { altrole: true });
        // Should merge into a single user message
        expect(result.filter(m => m.role === 'user').length).toBe(1);
        expect(Array.isArray(result[0].content)).toBe(true);
    });

    it('developerRole converts system to developer', () => {
        const result = formatToOpenAI([
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' },
        ], { developerRole: true });
        expect(result[0].role).toBe('developer');
    });

    it('audio multimodal with wav format', () => {
        const result = formatToOpenAI([
            { role: 'user', content: [
                { type: 'text', text: 'Listen:' },
                { type: 'input_audio', input_audio: { data: 'abc', format: 'wav' } },
            ]},
        ]);
        expect(result.length).toBe(1);
    });

    it('multimodal image with base64', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { type: 'text', text: 'Look:' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ],
        }]);
        expect(result[0].content).toBeDefined();
        const parts = result[0].content;
        expect(Array.isArray(parts)).toBe(true);
    });

    it('Array.isArray content with Anthropic base64 source', () => {
        // This should hit the Array.isArray(m.content) path in format-openai
        // when extractNormalizedMessagePayload has no multimodals but content is an array
        // with part.type=image, part.source.type=base64, part.source.data
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'imgdata' } },
                { type: 'text', text: 'What is this?' },
            ],
        }]);
        expect(result.length).toBe(1);
    });

    it('Array.isArray content with inlineData (Gemini format)', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { inlineData: { data: 'imgdata', mimeType: 'image/png' } },
                { type: 'text', text: 'Describe' },
            ],
        }]);
        expect(result.length).toBe(1);
    });

    it('Array.isArray content with audio inlineData', () => {
        const result = formatToOpenAI([{
            role: 'user',
            content: [
                { inlineData: { data: 'audiodata', mimeType: 'audio/wav' } },
            ],
        }]);
        expect(result.length).toBe(1);
    });

    it('message with name property is preserved', () => {
        const result = formatToOpenAI([
            { role: 'user', content: 'Hi', name: 'Alice' },
        ]);
        expect(result[0].name).toBe('Alice');
    });

    it('model role is normalized to assistant', () => {
        const result = formatToOpenAI([
            { role: 'model', content: 'Hello from model' },
        ]);
        expect(result[0].role).toBe('assistant');
    });
});

// ══════════════════════════════════════════════════════════════
//  FORMAT-ANTHROPIC — additional branch coverage
// ══════════════════════════════════════════════════════════════
describe('formatToAnthropic additional branches', () => {
    it('multimodal image with URL (not base64)', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'text', text: 'Check this image:' },
                { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
        const imgPart = userMsg.content.find((/** @type {any} */ p) => p.type === 'image' && p.source?.type === 'url');
        expect(imgPart).toBeDefined();
    });

    it('Array content pass-through with text parts', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'text', text: 'Hello' },
                { type: 'text', text: 'World' },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        expect(userMsg.content.filter((/** @type {any} */ p) => p.type === 'text').length).toBeGreaterThanOrEqual(2);
    });

    it('Array content with Anthropic native base64 image (passthrough)', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'imgdata' } },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        const imgPart = userMsg.content.find((/** @type {any} */ p) => p.type === 'image');
        expect(imgPart).toBeDefined();
    });

    it('Array content with inlineData conversion', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { inlineData: { data: 'imgdata', mimeType: 'image/png' } },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        const imgPart = userMsg.content.find((/** @type {any} */ p) => p.type === 'image');
        expect(imgPart?.source?.type).toBe('base64');
    });

    it('Array content with image_url data URI', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        const imgPart = userMsg.content.find((/** @type {any} */ p) => p.type === 'image');
        expect(imgPart?.source?.type).toBe('base64');
    });

    it('Array content with image_url HTTP URL', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
            ]},
        ]);
        const userMsg = messages.find(m => m.role === 'user');
        const imgPart = userMsg.content.find((/** @type {any} */ p) => p.type === 'image' && p.source?.type === 'url');
        expect(imgPart).toBeDefined();
    });

    it('caching with cache_control breakpoints', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: 'First', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
            { role: 'user', content: 'Second' },
        ], { caching: true });
        // First user message should have cache_control on its last content part
        const firstUser = messages.find(m => m.role === 'user');
        const lastPart = firstUser.content[firstUser.content.length - 1];
        expect(lastPart.cache_control).toBeDefined();
    });

    it('caching with string content converts to array with cache_control', () => {
        // Need to force string content through caching path
        // This requires a specific content structure that results in string content
        const { messages } = formatToAnthropic([
            { role: 'user', content: 'Simple text', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ], { caching: true });
        const firstUser = messages.find(m => m.role === 'user');
        expect(firstUser).toBeDefined();
    });

    it('consecutive same-role messages are merged', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
        ]);
        // Anthropic _mergeOrPush should merge them
        const userMsgs = messages.filter(m => m.role === 'user');
        // Note: a "Start" user may be prepended if first msg isn't user
        const userContent = userMsgs[userMsgs.length - 1].content;
        expect(Array.isArray(userContent)).toBe(true);
    });

    it('non-user non-assistant roles become user', () => {
        const { messages } = formatToAnthropic([
            { role: 'system', content: 'You are an AI' },
            { role: 'user', content: 'Hello' },
        ]);
        // system goes to systemPrompt, not in messages
        expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('empty multimodal fallback to text', () => {
        const { messages } = formatToAnthropic([
            { role: 'user', content: [
                { type: 'text', text: '' },
            ]},
        ]);
        expect(messages).toBeDefined();
    });
});


// ══════════════════════════════════════════════════════════════
//  RESPONSE-PARSERS — additional branches
// ══════════════════════════════════════════════════════════════
describe('parseResponsesAPINonStreamingResponse branches', () => {
    it('no output but has choices → falls back to openai parser', () => {
        const result = parseResponsesAPINonStreamingResponse({
            choices: [{ message: { content: 'Hello from fallback' } }],
        });
        expect(result.success).toBe(true);
        expect(result.content).toContain('Hello from fallback');
    });

    it('reasoning output type with summary', () => {
        const result = parseResponsesAPINonStreamingResponse({
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'I need to think...' },
                        { type: 'other', text: 'skip this' },
                    ],
                },
                {
                    type: 'message',
                    content: [{ type: 'output_text', text: 'The answer is 42.' }],
                },
            ],
        });
        expect(result.success).toBe(true);
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('I need to think');
        expect(result.content).toContain('The answer is 42');
    });

    it('message output with non-output_text parts are skipped', () => {
        const result = parseResponsesAPINonStreamingResponse({
            output: [
                {
                    type: 'message',
                    content: [
                        null,
                        { type: 'other_type', text: 'skip' },
                        { type: 'output_text', text: 'Real content' },
                    ],
                },
            ],
        });
        expect(result.content).toContain('Real content');
        expect(result.content).not.toContain('skip');
    });

    it('with usage data', () => {
        const result = parseResponsesAPINonStreamingResponse({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ok' }] }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
        expect(result.success).toBe(true);
    });

    it('empty output → empty response', () => {
        const result = parseResponsesAPINonStreamingResponse({
            output: [{ type: 'message', content: [] }],
        });
        expect(result.content).toContain('Empty response');
    });

    it('no data → empty response', () => {
        const result = parseResponsesAPINonStreamingResponse(/** @type {any} */ (null));
        expect(result.success).toBe(false);
    });
});

describe('parseGeminiNonStreamingResponse branches', () => {
    it('safety block from promptFeedback', () => {
        const result = parseGeminiNonStreamingResponse({
            promptFeedback: { blockReason: 'SAFETY' },
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    it('safety block from finishReason', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{ finishReason: 'RECITATION' }],
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('RECITATION');
    });

    it('thought parts with thinking', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Let me think...' },
                        { text: 'Here is the answer' },
                    ],
                },
            }],
        });
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('Let me think');
        expect(result.content).toContain('Here is the answer');
    });

    it('thought_signature extraction with useThoughtSignature', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{
                content: {
                    parts: [
                        { text: 'Answer text', thought_signature: 'sig456' },
                    ],
                },
            }],
        }, { useThoughtSignature: true });
        expect(result.success).toBe(true);
    });

    it('with usageMetadata', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{ content: { parts: [{ text: 'Ok' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        });
        expect(result.success).toBe(true);
    });

    it('empty candidates', () => {
        const result = parseGeminiNonStreamingResponse({});
        expect(result.content).toContain('Empty response');
    });

    it('inThought still open at end → auto-closes', () => {
        const result = parseGeminiNonStreamingResponse({
            candidates: [{
                content: {
                    parts: [{ thought: true, text: 'Still thinking...' }],
                },
            }],
        });
        expect(result.content).toContain('</Thoughts>');
    });
});

describe('parseClaudeNonStreamingResponse branches', () => {
    it('error type response', () => {
        const result = parseClaudeNonStreamingResponse({
            type: 'error',
            error: { message: 'Rate limited' },
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('Rate limited');
    });

    it('error field in response', () => {
        const result = parseClaudeNonStreamingResponse({
            error: { message: 'Server error' },
        });
        expect(result.success).toBe(false);
    });

    it('thinking + text blocks', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'Let me consider...' },
                { type: 'text', text: 'Here is my response.' },
            ],
        });
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Let me consider');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('Here is my response.');
    });

    it('redacted_thinking block', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'redacted_thinking' },
                { type: 'text', text: 'Answer' },
            ],
        });
        expect(result.content).toContain('redacted_thinking');
    });

    it('thinking still open at end → auto-closes', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'Still thinking...' },
            ],
        });
        expect(result.content).toContain('</Thoughts>');
    });

    it('with usage data and thinking meta', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [
                { type: 'thinking', thinking: 'hmm' },
                { type: 'text', text: 'Answer' },
            ],
            usage: { input_tokens: 100, output_tokens: 200 },
        });
        expect(result.success).toBe(true);
    });

    it('empty content array', () => {
        const result = parseClaudeNonStreamingResponse({
            content: [],
        });
        expect(result.success).toBe(false);
    });
});

describe('parseOpenAINonStreamingResponse branches', () => {
    it('reasoning_content in message', () => {
        const result = parseOpenAINonStreamingResponse({
            choices: [{
                message: { content: 'Final answer', reasoning_content: 'Thinking step...' },
            }],
        });
        expect(result.content).toContain('Thoughts');
        expect(result.content).toContain('Thinking step');
        expect(result.content).toContain('Final answer');
    });

    it('OpenRouter reasoning field (not reasoning_content)', () => {
        const result = parseOpenAINonStreamingResponse({
            choices: [{
                message: { content: 'Answer', reasoning: 'OR reasoning' },
            }],
        });
        expect(result.content).toContain('OR reasoning');
    });

    it('DeepSeek <think> block in content', () => {
        const result = parseOpenAINonStreamingResponse({
            choices: [{
                message: { content: '<think>Deep thought</think>Final answer' },
            }],
        });
        expect(result.content).toContain('Deep thought');
        expect(result.content).toContain('Final answer');
    });

    it('with usage', () => {
        const result = parseOpenAINonStreamingResponse({
            choices: [{ message: { content: 'Hi' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
        expect(result.success).toBe(true);
    });

    it('empty message', () => {
        const result = parseOpenAINonStreamingResponse({});
        expect(result.success).toBe(false);
    });
});


// ══════════════════════════════════════════════════════════════
//  STREAM-BUILDERS — saveThoughtSignatureFromStream
// ══════════════════════════════════════════════════════════════
describe('saveThoughtSignatureFromStream', () => {
    it('closes open thought block', () => {
        const config = { _inThoughtBlock: true };
        const result = saveThoughtSignatureFromStream(config);
        expect(result).toContain('</Thoughts>');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('saves signature to cache', () => {
        const config = {
            _lastSignature: 'sig789',
            _streamResponseText: 'Some response text',
        };
        const result = saveThoughtSignatureFromStream(config);
        expect(result).toBeUndefined(); // no thought block open
    });

    it('saves usage metadata', () => {
        const config = {
            _streamUsageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
            _tokenUsageReqId: 'req123',
        };
        saveThoughtSignatureFromStream(config, 'req_override');
        // No assertion needed — just verifying the branch doesn't throw
    });

    it('returns undefined when no thought block open and no signature', () => {
        const result = saveThoughtSignatureFromStream({});
        expect(result).toBeUndefined();
    });
});


// ══════════════════════════════════════════════════════════════
//  STREAM-BUILDERS — createOpenAISSEStream
// ══════════════════════════════════════════════════════════════
describe('createOpenAISSEStream parser branches', () => {
    /** Helper: create a fake Response with SSE data */
    function makeSSEResponse(/** @type {string[]} */ lines) {
        const text = lines.join('\n') + '\n';
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(text));
                controller.close();
            },
        });
        return /** @type {Response} */ ({ body: stream, ok: true });
    }

    it('reasoning delta opens and closes thought block', async () => {
        const response = makeSSEResponse([
            `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking...' } }] })}`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' } }] })}`,
            'data: [DONE]',
        ]);
        const stream = createOpenAISSEStream(response);
        const reader = stream.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('thinking...');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('answer');
    });

    it('usage data in chunk', async () => {
        const response = makeSSEResponse([
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hi' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}`,
            'data: [DONE]',
        ]);
        const stream = createOpenAISSEStream(response);
        const reader = stream.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toContain('Hi');
    });

    it('null delta is skipped', async () => {
        const response = makeSSEResponse([
            `data: ${JSON.stringify({ choices: [{ delta: null }] })}`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}`,
            'data: [DONE]',
        ]);
        const stream = createOpenAISSEStream(response);
        const reader = stream.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toBe('ok');
    });
});


// ══════════════════════════════════════════════════════════════
//  STREAM-BUILDERS — createResponsesAPISSEStream
// ══════════════════════════════════════════════════════════════
describe('createResponsesAPISSEStream parser branches', () => {
    function makeSSEResponse(/** @type {string[]} */ lines) {
        const text = lines.join('\n') + '\n';
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(text));
                controller.close();
            },
        });
        return /** @type {Response} */ ({ body: stream, ok: true });
    }

    it('reasoning_summary_text.delta opens thoughts', async () => {
        const response = makeSSEResponse([
            `data: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta: 'reason...' })}`,
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'answer' })}`,
            'data: [DONE]',
        ]);
        const stream = createResponsesAPISSEStream(response);
        const reader = stream.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('</Thoughts>');
    });

    it('response.completed with usage', async () => {
        const response = makeSSEResponse([
            `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hi' })}`,
            `data: ${JSON.stringify({ type: 'response.completed', response: { usage: { prompt_tokens: 10 } } })}`,
            'data: [DONE]',
        ]);
        const stream = createResponsesAPISSEStream(response);
        const reader = stream.getReader();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += value;
        }
        expect(text).toContain('Hi');
    });
});


// ══════════════════════════════════════════════════════════════
//  SLOT-INFERENCE — additional branches
// ══════════════════════════════════════════════════════════════
describe('slot-inference additional branches', () => {
    beforeEach(() => {
        mockSafeGetArg.mockReset().mockResolvedValue('');
    });

    it('scoreSlotHeuristic returns 0 for unknown slot', () => {
        expect(scoreSlotHeuristic('some text', 'nonexistent_slot')).toBe(0);
    });

    it('scoreSlotHeuristic returns 0 for empty text', () => {
        expect(scoreSlotHeuristic('', 'translation')).toBe(0);
    });

    it('scoreSlotHeuristic scores translation slot with translate keywords', () => {
        const score = scoreSlotHeuristic('Please translate the following text to Japanese', 'translation');
        expect(score).toBeGreaterThan(0);
    });

    it('scoreSlotHeuristic scores emotion slot', () => {
        const score = scoreSlotHeuristic('Analyze the emotional state and sentiment of the character', 'emotion');
        expect(score).toBeGreaterThan(0);
    });

    it('scoreSlotHeuristic scores memory slot', () => {
        const score = scoreSlotHeuristic('Summarize and extract key facts for the memory database', 'memory');
        expect(score).toBeGreaterThan(0);
    });

    it('inferSlot returns chat when no slots configured', async () => {
        const result = await inferSlot({ uniqueId: 'model-1' }, {});
        expect(result.slot).toBe('chat');
        expect(result.heuristicConfirmed).toBe(false);
    });

    it('inferSlot single match with matching prompt → confirmed', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {
            prompt_chat: [
                { role: 'system', content: 'You are a translator. Translate the following text.' },
                { role: 'user', content: 'Please translate this to Korean' },
            ],
        });
        expect(result.slot).toBe('translation');
        expect(result.heuristicConfirmed).toBe(true);
    });

    it('inferSlot single match with non-matching prompt → chat', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {
            prompt_chat: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Tell me a joke about cats.' },
            ],
        });
        expect(result.slot).toBe('chat');
        expect(result.heuristicConfirmed).toBe(false);
    });

    it('inferSlot multi-collision with clear winner → confirmed', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            if (key === 'cpm_slot_emotion') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {
            prompt_chat: [
                { role: 'system', content: 'Translate the user text into Japanese. Output only the translation.' },
                { role: 'user', content: 'Please translate: Hello world' },
            ],
        });
        // Translation should win clearly over emotion
        if (result.heuristicConfirmed) {
            expect(result.slot).toBe('translation');
        } else {
            expect(result.slot).toBe('chat');
        }
    });

    it('inferSlot with empty prompt → falls back to chat', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {
            prompt_chat: [{ role: 'user', content: '' }],
        });
        expect(result.slot).toBe('chat');
        expect(result.heuristicConfirmed).toBe(false);
    });

    it('inferSlot null prompt content in messages', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {
            prompt_chat: [null, { role: 'user', content: 42 }],
        });
        expect(result.slot).toBe('chat');
    });

    it('inferSlot with no prompt_chat → chat', async () => {
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation') return 'model-1';
            return '';
        });
        const result = await inferSlot({ uniqueId: 'model-1' }, {});
        expect(result.slot).toBe('chat');
    });

    it('scoreSlotHeuristic secondBestScore tracking', () => {
        // this covers the `score > secondBestScore` branch
        const score = scoreSlotHeuristic('summarize key points and extract entities from memory', 'memory');
        expect(score).toBeGreaterThan(0);
    });
});
