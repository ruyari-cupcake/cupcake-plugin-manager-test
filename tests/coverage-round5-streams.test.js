/**
 * coverage-round5-streams.test.js — Precise branch coverage targeting
 * for createSSEStream, createOpenAISSEStream, createResponsesAPISSEStream.
 *
 * Uncovered lines: 50,59,62,63,79,83,113,161,172,173,178,179
 * Target: ~20 previously uncovered branches.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
} from '../src/lib/stream-builders.js';
import { _tokenUsageStore, _takeTokenUsage } from '../src/lib/token-usage.js';

// ─── Helpers ───

function makeReadableStream(chunks) {
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                const chunk = chunks[index++];
                controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
            } else {
                controller.close();
            }
        },
    });
}

function makeFetchResponse(chunks) {
    return { body: makeReadableStream(chunks), ok: true, status: 200, headers: new Headers() };
}

function makeErrorReadableStream(error) {
    return new ReadableStream({
        pull() { throw error; },
    });
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

// ═══════════════════════════════════════════════════════
// createSSEStream — uncovered: 50,59,62,63,79,83
// ═══════════════════════════════════════════════════════

describe('createSSEStream targeted branches', () => {

    // L50: abortSignal.aborted → close immediately
    it('closes immediately when signal already aborted (L50)', async () => {
        const ac = new AbortController();
        ac.abort();
        const response = makeFetchResponse(['data: {"text":"hi"}\n\n']);
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) return JSON.parse(line.slice(5)).text;
            return null;
        }, ac.signal);
        const result = await drainStream(stream);
        expect(result).toBe(''); // aborted before reading
    });

    // L59: buffer.trim() has remaining content on done
    it('flushes remaining buffer content on done (L59)', async () => {
        // Send data WITHOUT trailing newline so it stays in buffer
        const response = makeFetchResponse(['data: {"text":"hello"}']);
        const stream = createSSEStream(response, (line) => {
            if (line.startsWith('data:')) {
                try { return JSON.parse(line.slice(5).trim()).text; } catch { return null; }
            }
            return null;
        });
        const result = await drainStream(stream);
        expect(result).toBe('hello');
    });

    // L62-63: onComplete returns a value → enqueue final chunk
    it('enqueues onComplete return value (L62-L63)', async () => {
        const response = makeFetchResponse(['data: {"t":"chunk"}\n\n']);
        const stream = createSSEStream(
            response,
            (line) => {
                if (line.startsWith('data:')) {
                    try { return JSON.parse(line.slice(5).trim()).t; } catch { return null; }
                }
                return null;
            },
            undefined,
            () => '[END]' // onComplete returns value
        );
        const result = await drainStream(stream);
        expect(result).toContain('chunk');
        expect(result).toContain('[END]');
    });

    // L79: non-AbortError → controller.error
    it('propagates non-AbortError as stream error (L79)', async () => {
        const errorStream = makeErrorReadableStream(new Error('Connection lost'));
        const response = { body: errorStream, ok: true, status: 200, headers: new Headers() };
        const stream = createSSEStream(response, () => null);
        const reader = stream.getReader();
        await expect(reader.read()).rejects.toThrow('Connection lost');
    });

    // L83: AbortError → controller.close (graceful)
    it('closes gracefully on AbortError (L83)', async () => {
        const abortErr = new DOMException('Aborted', 'AbortError');
        const errorStream = makeErrorReadableStream(abortErr);
        const response = { body: errorStream, ok: true, status: 200, headers: new Headers() };
        const stream = createSSEStream(response, () => null);
        const result = await drainStream(stream);
        expect(result).toBe('');
    });

    // onComplete invoked on abort path too
    it('calls onComplete on abort (L50)', async () => {
        const ac = new AbortController();
        ac.abort();
        let completeCalled = false;
        const response = makeFetchResponse(['data: hi\n\n']);
        const stream = createSSEStream(response, () => null, ac.signal, () => {
            completeCalled = true;
            return 'FINAL';
        });
        await drainStream(stream);
        expect(completeCalled).toBe(true);
    });

    // onComplete on error path
    it('calls onComplete on non-AbortError (L79)', async () => {
        let completeCalled = false;
        const errorStream = makeErrorReadableStream(new Error('fail'));
        const response = { body: errorStream, ok: true, status: 200, headers: new Headers() };
        const stream = createSSEStream(response, () => null, undefined, () => { completeCalled = true; return null; });
        const reader = stream.getReader();
        try { await reader.read(); } catch (_) { /* expected */ }
        expect(completeCalled).toBe(true);
    });

    // cancel callback (L95-L97)
    it('fires cancel callback with log', async () => {
        let logCalled = false;
        setApiRequestLogger((_id, _u) => { logCalled = true; });
        let resolveWait;
        const waitPromise = new Promise(r => { resolveWait = r; });
        let ci = 0;
        const slowStream = new ReadableStream({
            async pull(controller) {
                if (ci === 0) { ci++; controller.enqueue(new TextEncoder().encode('data: {"t":"x"}\n\n')); }
                else await waitPromise;
            },
        });
        const stream = createSSEStream(
            { body: slowStream, ok: true, status: 200, headers: new Headers() },
            (line) => line.startsWith('data:') ? 'x' : null,
            undefined, undefined, 'log-req-123'
        );
        const reader = stream.getReader();
        await reader.read();
        await reader.cancel();
        resolveWait();
        expect(logCalled).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// createOpenAISSEStream — uncovered: 113
// ═══════════════════════════════════════════════════════

describe('createOpenAISSEStream targeted branches', () => {

    // L113: obj.usage in SSE chunk → _normalizeTokenUsage
    it('captures usage from SSE data chunk (L113)', async () => {
        const chunks = [
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
            'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        await drainStream(createOpenAISSEStream(response, undefined, 'oai-usage-req'));
        const usage = _takeTokenUsage('oai-usage-req', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(10);
        expect(usage.output).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════
// createResponsesAPISSEStream — uncovered: 161,172,173,178,179
// ═══════════════════════════════════════════════════════

describe('createResponsesAPISSEStream targeted branches', () => {

    // L161: response.reasoning_summary_text.delta
    // Already covered by round3 but this adds usage to ensure onComplete fires properly

    // L172-173: onComplete with _streamUsage set
    it('onComplete stores stream usage from response.completed (L172-L173)', async () => {
        const chunks = [
            'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
            'data: {"type":"response.completed","response":{"usage":{"prompt_tokens":25,"completion_tokens":10,"total_tokens":35}}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        await drainStream(createResponsesAPISSEStream(response, undefined, 'resp-stream-usage'));
        const usage = _takeTokenUsage('resp-stream-usage', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(25);
    });

    // onComplete with reasoning still open → close tag
    it('onComplete closes reasoning and stores usage (L172-L173)', async () => {
        const chunks = [
            'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking..."}\n\n',
            'data: {"type":"response.completed","response":{"usage":{"prompt_tokens":30,"completion_tokens":15}}}\n\n',
            'data: [DONE]\n\n',
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createResponsesAPISSEStream(response, undefined, 'resp-reason-close'));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('</Thoughts>');
        const usage = _takeTokenUsage('resp-reason-close', true);
        expect(usage).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// createAnthropicSSEStream — additional uncovered: 222,227
// L222-227: done path with thinking flag AND usage
// ═══════════════════════════════════════════════════════

describe('createAnthropicSSEStream — done with thinking+usage (L222-L227)', () => {

    it('done path closes thinking tag and stores usage', async () => {
        const chunks = [
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":100}}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"thinking","thinking":"Deep work"}}\n\n',
            // Stream ends while still in thinking mode
        ];
        const response = makeFetchResponse(chunks);
        const result = await drainStream(createAnthropicSSEStream(response, undefined, 'anth-done-think', { showThinking: true }));
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('Deep work');
        expect(result).toContain('</Thoughts>');
        // Usage should be set since input_tokens > 0
        const usage = _takeTokenUsage('anth-done-think', true);
        expect(usage).not.toBeNull();
    });
});
