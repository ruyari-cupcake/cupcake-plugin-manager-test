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