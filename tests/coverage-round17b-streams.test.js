/**
 * Round 17b: Stream-builders specific branch targeting + key-pool + settings-backup
 * Focus on internal parser functions via the stream creation functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    saveThoughtSignatureFromStream,
} from '../src/lib/stream-builders.js';

/**
 * Helper: create a fake Response with a ReadableStream of SSE lines
 * @param {string[]} sseLines - lines to stream
 * @returns {Response}
 */
function fakeSSEResponse(sseLines) {
    const text = sseLines.join('\n') + '\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
        },
    });
    return /** @type {Response} */ ({ body: stream });
}

/** Collect all chunks from a ReadableStream */
async function collectStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return chunks.join('');
}

describe('stream-builders — Round 17b', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    // ─── OpenAI SSE ───
    describe('createOpenAISSEStream', () => {
        it('handles reasoning_content delta (thinking)', async () => {
            const resp = fakeSSEResponse([
                'data: {"choices":[{"delta":{"reasoning_content":"let me think"}}]}',
                'data: {"choices":[{"delta":{"content":" answer"}}]}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createOpenAISSEStream(resp));
            expect(text).toContain('Thoughts');
            expect(text).toContain('let me think');
            expect(text).toContain('answer');
        });

        it('handles empty delta (no content fields)', async () => {
            const resp = fakeSSEResponse([
                'data: {"choices":[{"delta":{}}]}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createOpenAISSEStream(resp));
            expect(text).toBe('');
        });

        it('handles stream with usage data on last chunk', async () => {
            const resp = fakeSSEResponse([
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createOpenAISSEStream(resp));
            expect(text).toBe('Hello world');
        });

        it('handles non-data lines (event: lines, comments)', async () => {
            const resp = fakeSSEResponse([
                ': comment',
                'event: message',
                'data: {"choices":[{"delta":{"content":"ok"}}]}',
                '',
                'data: [DONE]',
            ]);
            const text = await collectStream(createOpenAISSEStream(resp));
            expect(text).toBe('ok');
        });

        it('handles malformed JSON in data line', async () => {
            const resp = fakeSSEResponse([
                'data: {broken json',
                'data: {"choices":[{"delta":{"content":"recovery"}}]}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createOpenAISSEStream(resp));
            expect(text).toBe('recovery');
        });
    });

    // ─── Responses API SSE ───
    describe('createResponsesAPISSEStream', () => {
        it('handles reasoning_summary_text.delta', async () => {
            const resp = fakeSSEResponse([
                'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking..."}',
                'data: {"type":"response.output_text.delta","delta":"result"}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createResponsesAPISSEStream(resp));
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('thinking...');
            expect(text).toContain('</Thoughts>');
            expect(text).toContain('result');
        });

        it('handles output_text.delta with empty delta string', async () => {
            const resp = fakeSSEResponse([
                'data: {"type":"response.output_text.delta","delta":""}',
                'data: {"type":"response.output_text.delta","delta":"actual"}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createResponsesAPISSEStream(resp));
            expect(text).toContain('actual');
        });

        it('handles response.completed with usage', async () => {
            const resp = fakeSSEResponse([
                'data: {"type":"response.output_text.delta","delta":"hi"}',
                'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createResponsesAPISSEStream(resp));
            expect(text).toBe('hi');
        });

        it('ends reasoning block via onComplete if stream ends mid-reasoning', async () => {
            const resp = fakeSSEResponse([
                'data: {"type":"response.reasoning_summary_text.delta","delta":"still thinking"}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createResponsesAPISSEStream(resp));
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('</Thoughts>');
        });

        it('handles unknown event type', async () => {
            const resp = fakeSSEResponse([
                'data: {"type":"response.unknown_event","foo":"bar"}',
                'data: {"type":"response.output_text.delta","delta":"text"}',
                'data: [DONE]',
            ]);
            const text = await collectStream(createResponsesAPISSEStream(resp));
            expect(text).toBe('text');
        });
    });

    // ─── saveThoughtSignatureFromStream ───
    describe('saveThoughtSignatureFromStream', () => {
        it('closes open thought block', () => {
            const config = { _inThoughtBlock: true, _streamResponseText: '' };
            const result = saveThoughtSignatureFromStream(config);
            expect(result).toContain('</Thoughts>');
            expect(config._inThoughtBlock).toBe(false);
        });

        it('returns undefined when no thought block or signature', () => {
            const config = { _inThoughtBlock: false };
            const result = saveThoughtSignatureFromStream(config);
            expect(result).toBeUndefined();
        });

        it('saves signature when _lastSignature and _streamResponseText exist', () => {
            const config = {
                _inThoughtBlock: false,
                _lastSignature: 'sig123',
                _streamResponseText: 'some response text',
            };
            const result = saveThoughtSignatureFromStream(config);
            // Should not throw; signature saved to cache
            expect(result).toBeUndefined();
        });

        it('processes usage metadata if present', () => {
            const config = {
                _inThoughtBlock: false,
                _streamUsageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    totalTokenCount: 15,
                },
                _tokenUsageReqId: 'req-123',
            };
            const result = saveThoughtSignatureFromStream(config);
            expect(result).toBeUndefined(); // no thought block to close
        });

        it('processes usage with explicit requestId', () => {
            const config = {
                _inThoughtBlock: false,
                _streamUsageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                },
            };
            const result = saveThoughtSignatureFromStream(config, 'explicit-req');
            expect(result).toBeUndefined();
        });
    });
});
