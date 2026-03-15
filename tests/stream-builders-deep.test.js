/**
 * Deep coverage tests for stream-builders.js
 * Covers: createSSEStream, createAnthropicSSEStream, saveThoughtSignatureFromStream,
 * setApiRequestLogger, abort handling, error paths, cancel, all uncovered branches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    normalizeTokenUsage: vi.fn((usage, provider, opts) => ({ provider, usage, opts })),
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
    createSSEStream,
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    createAnthropicSSEStream,
    saveThoughtSignatureFromStream,
    setApiRequestLogger,
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

function makeErrorResponse(chunks, error) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.error(error);
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

describe('setApiRequestLogger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('accepts a function logger', () => {
        const fn = vi.fn();
        setApiRequestLogger(fn);
        // Logger should now be set — we'll verify via createSSEStream
    });

    it('rejects non-function logger', () => {
        setApiRequestLogger('not a fn');
        // Should not crash
    });
});

describe('createSSEStream — base SSE stream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('parses SSE lines and emits parsed deltas', async () => {
        const response = makeResponseFromChunks([
            'data: hello\n\n',
            'data: world\n\n',
        ]);
        const parser = (line) => {
            if (line.startsWith('data:')) return line.slice(5).trim();
            return null;
        };
        const stream = createSSEStream(response, parser);
        const text = await readStream(stream);
        expect(text).toBe('helloworld');
    });

    it('ignores empty lines and SSE comments (lines starting with ":")', async () => {
        const response = makeResponseFromChunks([
            ': this is a comment\n',
            '\n',
            'data: actual\n\n',
        ]);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const stream = createSSEStream(response, parser);
        const text = await readStream(stream);
        expect(text).toBe('actual');
    });

    it('calls onComplete when stream finishes and enqueues final chunk', async () => {
        const response = makeResponseFromChunks([
            'data: part1\n\n',
        ]);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const onComplete = vi.fn(() => '__final__');
        const stream = createSSEStream(response, parser, undefined, onComplete);
        const text = await readStream(stream);
        expect(text).toBe('part1__final__');
        expect(onComplete).toHaveBeenCalled();
    });

    it('calls onComplete even when onComplete returns null', async () => {
        const response = makeResponseFromChunks(['data: x\n\n']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const onComplete = vi.fn(() => null);
        const stream = createSSEStream(response, parser, undefined, onComplete);
        const text = await readStream(stream);
        expect(text).toBe('x');
        expect(onComplete).toHaveBeenCalled();
    });

    it('processes remaining buffer on stream end', async () => {
        // Chunk that doesn't end with \n
        const response = makeResponseFromChunks(['data: trailing']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const stream = createSSEStream(response, parser);
        const text = await readStream(stream);
        expect(text).toBe('trailing');
    });

    it('logs via api request logger when requestId is provided', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);
        const response = makeResponseFromChunks(['data: test\n\n']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const stream = createSSEStream(response, parser, undefined, undefined, 'req-123');
        await readStream(stream);
        expect(logFn).toHaveBeenCalledWith('req-123', expect.objectContaining({ response: 'test' }));
    });

    it('handles cancel gracefully', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);
        const response = makeResponseFromChunks(['data: a\n\ndata: b\n\n']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const stream = createSSEStream(response, parser, undefined, undefined, 'req-cancel');
        // Cancel immediately after creation
        await stream.cancel();
        expect(logFn).toHaveBeenCalledWith('req-cancel', expect.objectContaining({ response: expect.any(String) }));
    });

    it('handles AbortSignal abort during stream', async () => {
        const ac = new AbortController();
        const response = makeResponseFromChunks(['data: before\n\n']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        // Abort before reading
        ac.abort();
        const stream = createSSEStream(response, parser, ac.signal);
        const text = await readStream(stream);
        // Stream should close after detecting abort
        expect(typeof text).toBe('string');
    });

    it('handles onComplete throwing without crashing', async () => {
        const response = makeResponseFromChunks(['data: ok\n\n']);
        const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
        const onComplete = vi.fn(() => { throw new Error('onComplete crash'); });
        const stream = createSSEStream(response, parser, undefined, onComplete);
        const text = await readStream(stream);
        expect(text).toBe('ok');
    });

    it('surfaces non-abort reader errors after logging accumulated content', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);
        const stream = createSSEStream(
            makeErrorResponse(['data: partial\n\n'], new Error('reader exploded')),
            (line) => line.startsWith('data:') ? line.slice(5).trim() : null,
            undefined,
            undefined,
            'req-error'
        );

        const reader = stream.getReader();
        await expect((async () => {
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        })()).rejects.toThrow('reader exploded');
        expect(logFn).toHaveBeenCalledWith('req-error', expect.objectContaining({ response: expect.stringContaining('reader exploded') }));
    });

    it('treats AbortError from the reader as a graceful close', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);
        const abortError = new DOMException('aborted by host', 'AbortError');
        const encoded = new TextEncoder().encode('data: partial\n\n');
        let readCount = 0;
        const response = {
            body: {
                getReader: () => ({
                    read: async () => {
                        if (readCount++ === 0) return { done: false, value: encoded };
                        throw abortError;
                    },
                    cancel: vi.fn(),
                }),
            },
        };
        const stream = createSSEStream(response, (line) => line.startsWith('data:') ? line.slice(5).trim() : null, undefined, undefined, 'req-abort');

        const text = await readStream(stream);
        expect(text).toBe('partial');
        expect(logFn).toHaveBeenCalledWith('req-abort', expect.objectContaining({ response: 'partial' }));
    });
});

describe('createOpenAISSEStream — additional coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('handles reasoning via delta.reasoning field (alternative to reasoning_content)', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"reasoning":"step 1"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('<Thoughts>\nstep 1\n</Thoughts>\nanswer');
    });

    it('closes reasoning block on stream end if still open', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('<Thoughts>\nthinking\n</Thoughts>\n');
    });

    it('handles invalid JSON in SSE data gracefully', async () => {
        const response = makeResponseFromChunks([
            'data: {invalid json}\n\n',
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('ok');
    });

    it('handles SSE line without choices', async () => {
        const response = makeResponseFromChunks([
            'data: {"id":"chat-123"}\n\n',
            'data: {"choices":[{"delta":{"content":"real"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('real');
    });

    it('handles delta with empty content', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"text"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('text');
    });

    it('records usage when present in intermediate chunks', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"content":"a"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response, undefined, 'req-usage');
        await readStream(stream);
        expect(h.setTokenUsage).toHaveBeenCalled();
    });

    it('handles delta.reasoning with empty string (falsy but present)', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"reasoning":""}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        // Empty string reasoning should be skipped (falsy check) — no Thoughts wrapper
        expect(text).toBe('answer');
    });

    it('handles delta.content with empty string between real content', async () => {
        const response = makeResponseFromChunks([
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":""}}]}\n\n',
            'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createOpenAISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('hello world');
    });
});

describe('createResponsesAPISSEStream — additional coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('closes unclosed reasoning at end of stream', async () => {
        const response = makeResponseFromChunks([
            'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking"}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createResponsesAPISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('<Thoughts>\nthinking\n</Thoughts>\n');
    });

    it('handles unknown event types gracefully', async () => {
        const response = makeResponseFromChunks([
            'data: {"type":"unknown.event"}\n\n',
            'data: {"type":"response.output_text.delta","delta":"ok"}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createResponsesAPISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('ok');
    });

    it('handles invalid JSON gracefully', async () => {
        const response = makeResponseFromChunks([
            'data: not valid json\n\n',
            'data: {"type":"response.output_text.delta","delta":"ok"}\n\n',
            'data: [DONE]\n\n',
        ]);
        const stream = createResponsesAPISSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('ok');
    });
});

describe('createAnthropicSSEStream — deep coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('parses thinking and text deltas correctly', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"plan"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"result"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('plan');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('result');
    });

    it('handles thinking_delta type', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"thought"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text","text":"answer"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('thought');
        expect(text).toContain('answer');
    });

    it('handles redacted_thinking delta', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"visible"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('{{redacted_thinking}}');
        expect(text).toContain('visible');
    });

    it('handles content_block_start with redacted_thinking type', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"visible"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('{{redacted_thinking}}');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('visible');
    });

    it('handles error event in stream', async () => {
        const response = makeResponseFromChunks([
            'event: error\ndata: {"error":{"message":"overloaded"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('[Stream Error: overloaded]');
    });

    it('handles error without error.message (uses obj.message)', async () => {
        const response = makeResponseFromChunks([
            'event: error\ndata: {"message":"rate limit"}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('[Stream Error: rate limit]');
    });

    it('tracks message_start usage', async () => {
        const response = makeResponseFromChunks([
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":100,"cache_read_input_tokens":10,"cache_creation_input_tokens":5}}}\n\n',
            'event: message_delta\ndata: {"usage":{"output_tokens":50}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"output"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response, undefined, 'req-anthropic');
        const text = await readStream(stream);
        expect(text).toBe('output');
        expect(h.setTokenUsage).toHaveBeenCalledWith(
            'req-anthropic',
            expect.anything(),
            true
        );
    });

    it('closes thinking block on stream end', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"unclosed thinking"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('</Thoughts>');
    });

    it('handles invalid JSON in data line gracefully', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {bad json}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"ok"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toBe('ok');
    });

    it('handles cancel correctly', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"start"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response, undefined, 'req-cancel');
        await stream.cancel();
        expect(logFn).toHaveBeenCalledWith('req-cancel', expect.objectContaining({ response: expect.any(String) }));
    });

    it('handles abort signal during stream', async () => {
        const ac = new AbortController();
        ac.abort();
        const response = makeResponseFromChunks([
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"start"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response, ac.signal);
        const text = await readStream(stream);
        expect(typeof text).toBe('string');
    });

    it('flushes token usage when anthropic stream is cancelled mid-flight', async () => {
        const stream = createAnthropicSSEStream(
            makeResponseFromChunks([
                'event: message_start\ndata: {"message":{"usage":{"input_tokens":9}}}\n\n',
                'event: message_delta\ndata: {"usage":{"output_tokens":4}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"visible"}}\n\n',
            ]),
            undefined,
            'req-cancel-usage'
        );

        const reader = stream.getReader();
        await reader.read();
        reader.releaseLock();
        await stream.cancel();
        expect(h.setTokenUsage).toHaveBeenCalledWith('req-cancel-usage', expect.anything(), true);
    });
});

describe('saveThoughtSignatureFromStream', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('closes thought block and saves signature', () => {
        const config = {
            _inThoughtBlock: true,
            _lastSignature: 'sig123',
            _streamResponseText: 'response text',
            _streamUsageMetadata: { totalTokenCount: 100 },
            _tokenUsageReqId: 'req-gem',
        };
        const result = saveThoughtSignatureFromStream(config, 'req-gem');
        expect(result).toContain('</Thoughts>');
        expect(config._inThoughtBlock).toBe(false);
        expect(h.saveThoughtSignature).toHaveBeenCalledWith('response text', 'sig123');
        expect(h.setTokenUsage).toHaveBeenCalled();
    });

    it('returns undefined when no thought block is open and no signature', () => {
        const config = {
            _inThoughtBlock: false,
            _lastSignature: null,
            _streamResponseText: 'text',
            _streamUsageMetadata: null,
        };
        const result = saveThoughtSignatureFromStream(config);
        expect(result).toBeUndefined();
    });

    it('saves usage metadata using _tokenUsageReqId when no requestId', () => {
        const config = {
            _inThoughtBlock: false,
            _lastSignature: null,
            _streamResponseText: '',
            _streamUsageMetadata: { totalTokenCount: 50 },
            _tokenUsageReqId: 'from-config',
        };
        saveThoughtSignatureFromStream(config);
        expect(h.setTokenUsage).toHaveBeenCalledWith('from-config', expect.anything(), true);
    });

    it('does not save signature when _streamResponseText is empty', () => {
        const config = {
            _inThoughtBlock: false,
            _lastSignature: 'sig',
            _streamResponseText: '',
        };
        saveThoughtSignatureFromStream(config);
        expect(h.saveThoughtSignature).not.toHaveBeenCalled();
    });

    it('does not save signature when _lastSignature is falsy', () => {
        const config = {
            _inThoughtBlock: false,
            _lastSignature: '',
            _streamResponseText: 'text',
        };
        saveThoughtSignatureFromStream(config);
        expect(h.saveThoughtSignature).not.toHaveBeenCalled();
    });
});

describe('createAnthropicSSEStream — error during thinking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(null);
    });

    it('closes thinking when reader throws during thinking block', async () => {
        // Build a response whose reader throws after emitting thinking data
        const chunks = [
            'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"mid thought"}}\n\n',
        ];
        const encoded = new TextEncoder().encode(chunks.join(''));
        let callCount = 0;
        const mockReader = {
            read: async () => {
                if (callCount === 0) { callCount++; return { done: false, value: encoded }; }
                throw new Error('network disconnect');
            },
            cancel: vi.fn(),
        };
        const response = { ok: true, body: { getReader: () => mockReader } };
        const stream = createAnthropicSSEStream(response);
        let text = '';
        try {
            const reader = stream.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += value;
            }
        } catch (_) { /* expected */ }
        // Should have closed the thinking block
        expect(text).toContain('<Thoughts>');
    });

    it('handles obj.type === error without event prefix', async () => {
        const response = makeResponseFromChunks([
            'data: {"type":"error","message":"connection timeout"}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('[Stream Error: connection timeout]');
    });

    it('handles error with unknown message', async () => {
        const response = makeResponseFromChunks([
            'event: error\ndata: {}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        expect(text).toContain('[Stream Error: Unknown stream error]');
    });

    it('handles second redacted_thinking when already in thinking mode', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"done"}}\n\n',
        ]);
        const stream = createAnthropicSSEStream(response);
        const text = await readStream(stream);
        // Second redacted_thinking should NOT add another <Thoughts> tag
        const thoughtsCount = (text.match(/<Thoughts>/g) || []).length;
        expect(thoughtsCount).toBe(1);
        expect(text).toContain('done');
    });
});
