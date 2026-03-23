import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    normalizeTokenUsage: vi.fn((usage, provider) => ({ provider, usage })),
    setTokenUsage: vi.fn(),
    saveThoughtSignature: vi.fn(),
}));

vi.mock('../src/lib/token-usage.js', () => ({
    _normalizeTokenUsage: (...args) => h.normalizeTokenUsage(...args),
    _setTokenUsage: (...args) => h.setTokenUsage(...args),
}));

vi.mock('../src/lib/format-gemini.js', () => ({
    ThoughtSignatureCache: {
        save: (...args) => h.saveThoughtSignature(...args),
    },
}));

import {
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    createAnthropicSSEStream,
} from '../src/lib/stream-builders.js';

function makeResponseFromChunks(chunks) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    }));
}

async function readStream(stream) {
    const reader = stream.getReader();
    const parts = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
    }
    return parts.join('');
}

describe('stream-builders regression coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('createOpenAISSEStream closes reasoning blocks before content and records usage', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"reasoning_content":"plan first"}}],"usage":{"prompt_tokens":3,"completion_tokens":4}}\n\n',
            'data: {"choices":[{"delta":{"content":"final answer"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createOpenAISSEStream(response, undefined, 'req-openai');
        const text = await readStream(stream);

        expect(text).toBe('<Thoughts>\nplan first\n</Thoughts>\nfinal answer');
        expect(h.normalizeTokenUsage).toHaveBeenCalledWith(
            { prompt_tokens: 3, completion_tokens: 4 },
            'openai'
        );
        expect(h.setTokenUsage).toHaveBeenCalledWith(
            'req-openai',
            { provider: 'openai', usage: { prompt_tokens: 3, completion_tokens: 4 } },
            true
        );
    });

    it('createOpenAISSEStream handles Gemini thought-flagged delta content', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"content":"thinking step","thought":true},"thought":true}]}\n\n',
            'data: {"choices":[{"delta":{"content":"actual reply"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createOpenAISSEStream(response, undefined, 'req-gemini-thought', { model: 'gemini-2.5-pro' });
        const text = await readStream(stream);

        expect(text).toBe('<Thoughts>\nthinking step\n</Thoughts>\nactual reply');
    });

    it('createOpenAISSEStream handles reasoning_text field (Copilot Gemini)', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"reasoning_text":"deep thought"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createOpenAISSEStream(response, undefined, 'req-reasoning-text', { model: 'gemini-2.5-pro' });
        const text = await readStream(stream);

        expect(text).toBe('<Thoughts>\ndeep thought\n</Thoughts>\nanswer');
    });

    it('createResponsesAPISSEStream handles response.reasoning_text.delta', async () => {
        const response = makeResponseFromChunks([
            'data: {"type":"response.reasoning_text.delta","delta":"reasoning via text"}\n\n',
            'data: {"type":"response.output_text.delta","delta":"output"}\n\n',
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":10}}}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createResponsesAPISSEStream(response, undefined, 'req-rt-delta');
        const text = await readStream(stream);

        expect(text).toBe('<Thoughts>\nreasoning via text\n</Thoughts>\noutput');
    });

    it('createAnthropicSSEStream handles thinking + text blocks', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"deep thought"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"answer"}}\n\n',
            'event: message_delta\ndata: {"usage":{"output_tokens":15}}\n\n',
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":10}}}\n\n',
        ]);

        const stream = createAnthropicSSEStream(response, undefined, 'req-anthropic');
        const text = await readStream(stream);

        expect(text).toContain('<Thoughts>');
        expect(text).toContain('deep thought');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('answer');
    });

    it('createAnthropicSSEStream closes thinking block on abort', async () => {
        const ac = new AbortController();

        // Stream that yields thinking data, waits for abort, then yields more
        const encoder = new TextEncoder();
        let resolveSecondPull;
        let pullCount = 0;
        const slowBody = new ReadableStream({
            async pull(ctrl) {
                pullCount++;
                if (pullCount === 1) {
                    ctrl.enqueue(encoder.encode(
                        'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"in progress"}}\n\n',
                    ));
                    // Schedule abort after chunk is delivered
                    setTimeout(() => ac.abort(), 5);
                    return;
                }
                // Wait long enough for abort to fire
                await new Promise(r => { resolveSecondPull = r; setTimeout(r, 200); });
                ctrl.close();
            },
        });

        const response = new Response(slowBody);
        const stream = createAnthropicSSEStream(response, ac.signal, 'req-abort-think');
        const text = await readStream(stream);

        expect(text).toContain('<Thoughts>');
        expect(text).toContain('in progress');
        expect(text).toContain('</Thoughts>');
    });

    it('createAnthropicSSEStream hides thinking when showThinking=false', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"hidden"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"visible answer"}}\n\n',
        ]);

        const stream = createAnthropicSSEStream(response, undefined, 'req-no-think', { showThinking: false });
        const text = await readStream(stream);

        expect(text).not.toContain('hidden');
        expect(text).not.toContain('<Thoughts>');
        expect(text).toContain('visible answer');
    });

    it('createOpenAISSEStream passes through content normally when no thought flag', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"content":"normal content"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createOpenAISSEStream(response, undefined, 'req-no-thought', { model: 'gemini-2.5-flash' });
        const text = await readStream(stream);

        expect(text).toBe('normal content');
    });

    it('createResponsesAPISSEStream closes reasoning blocks and persists completed usage', async () => {
        const response = makeResponseFromChunks([
            'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking..."}\n\n',
            'data: {"type":"response.output_text.delta","delta":"done"}\n\n',
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":20}}}\n\n',
            'data: [DONE]\n\n',
        ]);

        const stream = createResponsesAPISSEStream(response, undefined, 'req-responses');
        const text = await readStream(stream);

        expect(text).toBe('<Thoughts>\nthinking...\n</Thoughts>\ndone');
        expect(h.normalizeTokenUsage).toHaveBeenCalledWith(
            { input_tokens: 10, output_tokens: 20 },
            'openai'
        );
        expect(h.setTokenUsage).toHaveBeenCalledWith(
            'req-responses',
            { provider: 'openai', usage: { input_tokens: 10, output_tokens: 20 } },
            true
        );
    });
});