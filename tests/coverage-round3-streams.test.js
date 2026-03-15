/**
 * coverage-round3-streams.test.js — Branch coverage boost for stream-builders.js
 * and smart-fetch.js.
 *
 * Target: ~35+ uncovered branches.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock shared-state ───

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
        risuFetch: vi.fn(),
        nativeFetch: vi.fn(),
    },
    CPM_VERSION: '1.20.0',
    state: { _currentExecutingPluginId: null, ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: { token: null, expiry: 0 } },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
    isDynamicFetchEnabled: vi.fn(),
}));

vi.mock('../src/lib/csp-exec.js', () => ({ _executeViaScriptTag: vi.fn() }));

import {
    createSSEStream,
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    createAnthropicSSEStream,
    setApiRequestLogger,
    saveThoughtSignatureFromStream,
} from '../src/lib/stream-builders.js';
import { _tokenUsageStore, _takeTokenUsage } from '../src/lib/token-usage.js';
import { ThoughtSignatureCache } from '../src/lib/format-gemini.js';

// ─── Helpers ───

function makeReadableStream(chunks) {
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                const chunk = chunks[index++];
                if (typeof chunk === 'string') {
                    controller.enqueue(new TextEncoder().encode(chunk));
                } else {
                    controller.enqueue(chunk);
                }
            } else {
                controller.close();
            }
        },
    });
}

function makeFetchResponse(chunks, status = 200) {
    return {
        body: makeReadableStream(chunks),
        ok: true,
        status,
        headers: new Headers(),
    };
}

async function drainStream(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += value;
    }
    return result;
}

beforeEach(() => {
    _tokenUsageStore.clear();
    setApiRequestLogger(null);
});

// ─── createSSEStream: base branches ───

describe('createSSEStream branches', () => {
    it('abort signal already set → closes immediately', async () => {
        const ac = new AbortController();
        ac.abort();
        const response = makeFetchResponse(['data: {"text":"hello"}\n\n']);
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) return JSON.parse(line.slice(5)).text;
            return null;
        }, ac.signal);
        const result = await drainStream(stream);
        expect(result).toBe(''); // aborted before reading
    });

    it('done with remaining buffer → flushes last line', async () => {
        // Send data without trailing newline so it stays in buffer until done
        const response = makeFetchResponse(['data: hello']);
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) return line.slice(5).trim();
            return null;
        });
        const result = await drainStream(stream);
        expect(result).toBe('hello');
    });

    it('onComplete returns final chunk at stream end', async () => {
        const response = makeFetchResponse(['data: part1\n']);
        const onComplete = () => '\n[END]';
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) return line.slice(5).trim();
            return null;
        }, undefined, onComplete);
        const result = await drainStream(stream);
        expect(result).toContain('[END]');
    });

    it('onComplete is called on abort', async () => {
        let completeCalled = false;
        const ac = new AbortController();
        const response = makeFetchResponse([
            'data: part1\n\n',
            // This chunk will wait but abort fires first
        ]);
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) {
                // abort after first chunk
                setTimeout(() => ac.abort(), 5);
                return line.slice(5).trim();
            }
            return null;
        }, ac.signal, () => { completeCalled = true; return null; });
        await drainStream(stream);
        // onComplete should have been called (either on abort or on done)
        expect(completeCalled).toBe(true);
    });

    it('catch path for non-AbortError with onComplete', async () => {
        const errorStream = new ReadableStream({
            pull() {
                throw new Error('custom read error');
            },
        });
        const response = { body: errorStream, ok: true, status: 200, headers: new Headers() };
        let completeCalled = false;
        const stream = createSSEStream(response, () => null, undefined, () => {
            completeCalled = true;
            return '[ERROR-END]';
        });
        try {
            await drainStream(stream);
        } catch (_) { /* expected */ }
        expect(completeCalled).toBe(true);
    });

    it('cancel method logs and cancels reader', async () => {
        let logCalled = false;
        setApiRequestLogger((_, _updates) => { logCalled = true; });
        const response = makeFetchResponse(['data: hello\n']);
        const stream = createSSEStream(response, () => null, undefined, undefined, 'req-1');
        const reader = stream.getReader();
        await reader.cancel();
        // Re-trying to read should be done
        expect(logCalled).toBe(true);
    });

    it('AbortError on read → calls onComplete and closes', async () => {
        const errorStream = new ReadableStream({
            pull() {
                const err = new DOMException('aborted', 'AbortError');
                throw err;
            },
        });
        const response = { body: errorStream, ok: true, status: 200, headers: new Headers() };
        let completeCalled = false;
        const stream = createSSEStream(response, () => null, undefined, () => {
            completeCalled = true;
            return '[ABORT-END]';
        });
        const result = await drainStream(stream);
        expect(completeCalled).toBe(true);
        expect(result).toContain('[ABORT-END]');
    });
});

// ─── createOpenAISSEStream: reasoning branches ───

describe('createOpenAISSEStream branches', () => {
    it('reasoning_content delta → opening <Thoughts> tag', async () => {
        const chunks = [
            'data: {"choices":[{"delta":{"reasoning_content":"Let me think"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"The answer is 42"}}]}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createOpenAISSEStream(response));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('Let me think');
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('The answer is 42');
    });

    it('reasoning delta alias (delta.reasoning)', async () => {
        const chunks = [
            'data: {"choices":[{"delta":{"reasoning":"Thinking..."}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"42"}}]}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createOpenAISSEStream(response));
        expect(result).toContain('Thinking...');
    });

    it('usage in final chunk → sets token usage', async () => {
        const chunks = [
            'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        await drainStream(createOpenAISSEStream(response, undefined, 'oai-req-1'));
        const usage = _takeTokenUsage('oai-req-1', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(10);
    });

    it('reasoning still open at stream end → closes with onComplete', async () => {
        const chunks = [
            'data: {"choices":[{"delta":{"reasoning_content":"Still thinking..."}}]}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createOpenAISSEStream(response));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('</Thoughts>');
    });
});

// ─── createResponsesAPISSEStream branches ───

describe('createResponsesAPISSEStream branches', () => {
    it('reasoning_summary_text.delta → Thoughts tags', async () => {
        const chunks = [
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Reasoning..."}\n\n',
            'data: {"type":"response.output_text.delta","delta":"The answer."}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createResponsesAPISSEStream(response));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('Reasoning...');
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('The answer.');
    });

    it('usage in response.completed event', async () => {
        const chunks = [
            'data: {"type":"response.output_text.delta","delta":"hi"}\n\n',
            'data: {"type":"response.completed","response":{"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        await drainStream(createResponsesAPISSEStream(response, undefined, 'resp-req-1'));
        const usage = _takeTokenUsage('resp-req-1', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(20);
    });

    it('reasoning still open at end → closes via onComplete', async () => {
        const chunks = [
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Still reasoning..."}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createResponsesAPISSEStream(response));
        expect(result).toContain('</Thoughts>');
    });
});

// ─── createAnthropicSSEStream branches ───

describe('createAnthropicSSEStream branches', () => {
    it('thinking_delta type (alternative to thinking) with showThinking=true', async () => {
        const chunks = [
            'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"Deep thought"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"The answer."}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: true }));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('Deep thought');
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('The answer.');
    });

    it('thinking_delta with showThinking=false → hidden but tracked', async () => {
        const chunks = [
            'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"Hidden thought"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Visible."}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: false }));
        expect(result).not.toContain('Hidden thought');
        expect(result).toContain('Visible.');
    });

    it('redacted_thinking via content_block_start', async () => {
        const chunks = [
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"After."}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: true }));
        expect(result).toContain('{{redacted_thinking}}');
    });

    it('content_block_start redacted_thinking with showThinking=false', async () => {
        const chunks = [
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Visible."}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: false }));
        expect(result).not.toContain('{{redacted_thinking}}');
        expect(result).toContain('Visible.');
    });

    it('message_start + message_delta usage tracking', async () => {
        const chunks = [
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":100,"cache_read_input_tokens":20,"cache_creation_input_tokens":5}}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hello"}}\n\n',
            'event: message_delta\ndata: {"usage":{"output_tokens":50}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        await drainStream(createAnthropicSSEStream(response, undefined, 'anth-req-1', { showThinking: false }));
        const usage = _takeTokenUsage('anth-req-1', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(100);
        expect(usage.output).toBe(50);
    });

    it('error event → enqueues error text', async () => {
        const chunks = [
            'event: error\ndata: {"error":{"message":"Rate limited"}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: false }));
        expect(result).toContain('[Stream Error:');
        expect(result).toContain('Rate limited');
    });

    it('abort during thinking → closes Thoughts tag (showThinking=true)', async () => {
        const ac = new AbortController();
        let chunkIndex = 0;
        const slowStream = new ReadableStream({
            async pull(controller) {
                if (chunkIndex === 0) {
                    chunkIndex++;
                    controller.enqueue(new TextEncoder().encode(
                        'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"Deep"}}\n\n'
                    ));
                } else {
                    // Abort before finishing
                    ac.abort();
                    // Wait a bit then close
                    await new Promise(r => setTimeout(r, 10));
                    controller.close();
                }
            },
        });
        const response = { body: slowStream, ok: true, status: 200, headers: new Headers() };
        const result = await drainStream(createAnthropicSSEStream(response, ac.signal, undefined, { showThinking: true }));
        // Should contain closing tag because we aborted during thinking
        expect(result).toContain('</Thoughts>');
    });

    it('stream done during thinking → closes Thoughts tag', async () => {
        const chunks = [
            'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"Still thinking"}}\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, undefined, { showThinking: true }));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('</Thoughts>');
    });

    it('cancel callback logs and sets usage', async () => {
        let logCalled = false;
        setApiRequestLogger((_id, _updates) => { logCalled = true; });

        // Use a slow stream that stays open so cancel() actually fires
        let chunkIndex = 0;
        let resolveWait;
        const waitPromise = new Promise(r => { resolveWait = r; });
        const slowStream = new ReadableStream({
            async pull(controller) {
                if (chunkIndex === 0) {
                    chunkIndex++;
                    controller.enqueue(new TextEncoder().encode(
                        'event: message_start\ndata: {"message":{"usage":{"input_tokens":50}}}\n\n' +
                        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"partial"}}\n\n'
                    ));
                } else {
                    // Block to keep stream alive until test cancels
                    await waitPromise;
                    controller.close();
                }
            },
        });
        const response = { body: slowStream, ok: true, status: 200, headers: new Headers() };
        const stream = createAnthropicSSEStream(response, undefined, 'cancel-req', { showThinking: false });
        const reader = stream.getReader();
        await reader.read(); // Gets "partial"
        await reader.cancel(); // Triggers cancel()
        resolveWait(); // Clean up the blocked promise
        expect(logCalled).toBe(true);
    });
});

// ─── saveThoughtSignatureFromStream branches ───

describe('saveThoughtSignatureFromStream', () => {
    it('closes open thought block and returns finalChunk', () => {
        const config = {
            _inThoughtBlock: true,
            _lastSignature: null,
            _streamResponseText: '',
        };
        const result = saveThoughtSignatureFromStream(config);
        expect(result).toContain('</Thoughts>');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('saves thought signature to cache', () => {
        ThoughtSignatureCache.clear();
        const config = {
            _inThoughtBlock: false,
            _lastSignature: 'sig-final',
            _streamResponseText: 'The response text',
        };
        saveThoughtSignatureFromStream(config);
        // Use the same ESM-imported ThoughtSignatureCache instance
        const cached = ThoughtSignatureCache.get('The response text');
        expect(cached).toBe('sig-final');
    });

    it('processes usage metadata', () => {
        _tokenUsageStore.clear();
        const config = {
            _inThoughtBlock: false,
            _lastSignature: null,
            _streamResponseText: '',
            _streamUsageMetadata: {
                promptTokenCount: 50,
                candidatesTokenCount: 100,
                totalTokenCount: 150,
            },
            _tokenUsageReqId: 'gemini-stream-1',
        };
        saveThoughtSignatureFromStream(config);
        const usage = _takeTokenUsage('gemini-stream-1', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(50);
    });

    it('returns undefined when no thought block and no signature', () => {
        const config = {
            _inThoughtBlock: false,
            _lastSignature: null,
            _streamResponseText: '',
        };
        const result = saveThoughtSignatureFromStream(config);
        expect(result).toBeUndefined();
    });
});
