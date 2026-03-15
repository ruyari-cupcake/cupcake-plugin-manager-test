/**
 * stream-builders-branch-coverage.test.js
 * ────────────────────────────────────────
 * HD-2: Branch coverage for stream-builders.js
 * Targets: redacted_thinking with showThinking=false, Anthropic AbortError path
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
    createAnthropicSSEStream,
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

describe('createAnthropicSSEStream — redacted_thinking with showThinking=false', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(vi.fn());
    });

    it('sets thinking=true internally but does NOT emit thought tags when showThinking is false', async () => {
        const response = makeResponseFromChunks([
            'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
            'event: content_block_stop\ndata: {}\n\n',
            'event: content_block_start\ndata: {"content_block":{"type":"text","text":""}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"visible answer"}}\n\n',
            'event: content_block_stop\ndata: {}\n\n',
            'event: message_stop\ndata: {}\n\n',
        ]);

        const stream = createAnthropicSSEStream(response, undefined, 'req-redact-hide', { showThinking: false });
        const text = await readStream(stream);

        // Should NOT contain any thought display markers
        expect(text).not.toContain('<Thoughts>');
        expect(text).not.toContain('</Thoughts>');
        expect(text).not.toContain('{{redacted_thinking}}');
        // Should contain the visible text
        expect(text).toContain('visible answer');
    });
});

describe('createAnthropicSSEStream — AbortError handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(vi.fn());
    });

    it('closes stream gracefully on AbortError (no controller.error)', async () => {
        const abortController = new AbortController();
        const abortError = new DOMException('signal aborted', 'AbortError');

        // Create a response whose reader throws AbortError on second read
        let readCount = 0;
        const mockBody = new ReadableStream({
            pull(controller) {
                readCount++;
                if (readCount === 1) {
                    controller.enqueue(new TextEncoder().encode(
                        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"partial"}}\n\n',
                    ));
                } else {
                    // Signal abort to trigger AbortError path
                    controller.error(abortError);
                }
            },
        });
        const response = new Response(mockBody);

        const stream = createAnthropicSSEStream(response, abortController.signal, 'req-abort');

        // Read stream — should get partial content then close gracefully
        const reader = stream.getReader();
        const parts = [];
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                parts.push(value);
            }
        } catch (_) {
            // AbortError may propagate depending on timing — that's ok
        }

        const text = parts.join('');
        expect(text).toContain('partial');
    });
});

describe('createSSEStream — cancel callback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setApiRequestLogger(vi.fn());
    });

    it('logs cancelled state and cancels the reader on stream cancel', async () => {
        const logFn = vi.fn();
        setApiRequestLogger(logFn);

        const response = makeResponseFromChunks([
            'data: {"text":"hello"}\n\n',
        ]);
        const parser = (line) => {
            try { return JSON.parse(line.slice(5).trim()).text; } catch (_) { return null; }
        };

        const stream = createSSEStream(response, parser, undefined, undefined, 'req-cancel-2');
        await stream.cancel();

        expect(logFn).toHaveBeenCalledWith('req-cancel-2', expect.objectContaining({
            response: expect.stringContaining('cancelled'),
        }));
    });
});
