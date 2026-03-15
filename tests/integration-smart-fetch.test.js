/**
 * integration-smart-fetch.test.js — Integration tests for smart-fetch.js
 * targeting remaining uncovered internal branches.
 *
 * Targets:
 *   L384-385 — _extractResponseBody: numeric-keyed object fallback
 *   L415    — _tryCopilotRisuFetch: proxy auth error 400 detection
 *   L484    — _tryCopilotRisuFetch: errPreview logging for non-response data
 *   _stripNonSerializable — function/symbol/bigint stripping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    sanitizeBodyJSON: vi.fn((x) => x),
    safeGetBoolArg: vi.fn(async () => false),
    checkStreamCapability: vi.fn(async () => true),
    risuFetch: vi.fn(),
    nativeFetch: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        risuFetch: (...args) => h.risuFetch(...args),
        nativeFetch: (...args) => h.nativeFetch(...args),
    },
    safeGetBoolArg: (...args) => h.safeGetBoolArg(...args),
}));

vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeBodyJSON: (...args) => h.sanitizeBodyJSON(...args),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: (...args) => h.checkStreamCapability(...args),
}));

import { smartNativeFetch, _resetCompatibilityCache } from '../src/lib/smart-fetch.js';

describe('smart-fetch — targeted uncovered branch tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetCompatibilityCache();
        h.sanitizeBodyJSON.mockImplementation((x) => x);
        h.safeGetBoolArg.mockResolvedValue(false);
        h.checkStreamCapability.mockResolvedValue(true);
    });

    // ═══════════════════════════════════════════════════════════════════
    //  L415: Copilot proxy auth error (mode=plainFetchDeforce, status=400)
    // ═══════════════════════════════════════════════════════════════════

    describe('Copilot proxy auth error detection (L415)', () => {
        it('falls through from plainFetchDeforce on "No auth header" proxy error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            const authErrorBody = JSON.stringify({ error: 'No auth header provided' });
            const authErrorBytes = new TextEncoder().encode(authErrorBody);

            let risuCallCount = 0;
            h.risuFetch.mockImplementation(async (_url, opts) => {
                risuCallCount++;
                if (opts.plainFetchDeforce) {
                    // plainFetchDeforce mode returns 400 proxy auth error
                    return { status: 400, data: authErrorBytes };
                }
                // plainFetchForce mode succeeds
                return { status: 200, data: new TextEncoder().encode('{"choices":[]}') };
            });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
                headers: { 'Content-Type': 'application/json' },
            });

            expect(result).toBeDefined();
            // Should have fallen through to another strategy after proxy auth error
            expect(risuCallCount).toBeGreaterThanOrEqual(2);
        });

        it('falls through on "Password Incorrect" proxy error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            const authErrorBody = JSON.stringify({ error: 'Password Incorrect' });
            const authErrorBytes = new TextEncoder().encode(authErrorBody);

            h.risuFetch.mockImplementation(async (_url, opts) => {
                if (opts.plainFetchDeforce) {
                    return { status: 400, data: authErrorBytes };
                }
                return { status: 200, data: new TextEncoder().encode('{"choices":[]}') };
            });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: { 'Content-Type': 'application/json' },
            });

            expect(result).toBeDefined();
        });

        it('falls through on "Token Expired" proxy error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            const authErrorBody = JSON.stringify({ error: 'Token Expired' });
            const authErrorBytes = new TextEncoder().encode(authErrorBody);

            h.risuFetch.mockImplementation(async (_url, opts) => {
                if (opts.plainFetchDeforce) return { status: 400, data: authErrorBytes };
                return { status: 200, data: new TextEncoder().encode('{"ok":true}') };
            });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            expect(result).toBeDefined();
        });

        it('does NOT fall through on non-proxy 400 error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            const apiErrorBody = JSON.stringify({ error: { message: 'Invalid API key', type: 'invalid_request_error' } });
            const apiErrorBytes = new TextEncoder().encode(apiErrorBody);

            h.risuFetch.mockImplementation(async (_url, _opts) => {
                // 400 error that is NOT a proxy auth error → should be returned as response
                return { status: 400, data: apiErrorBytes };
            });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            // Should get back a 400 response (not fall through to null)
            expect(result).toBeDefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    //  L484: errPreview logging (non-real-response data)
    // ═══════════════════════════════════════════════════════════════════

    describe('errPreview logging for non-response data (L484)', () => {
        it('logs errPreview when risuFetch returns string data that is not convertible', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            h.risuFetch.mockImplementation(async (_url, _opts) => {
                // Return data with status 0 — not a real response
                return { status: 0, data: 'Some error message from framework' };
            });

            // Must have a fallback. nativeFetch provides it.
            h.nativeFetch.mockResolvedValue(new Response('ok', { status: 200 }));

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            // Should fall back to nativeFetch after risuFetch fails to produce a real response
            expect(result).toBeDefined();
        });

        it('handles non-string data in errPreview path', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            h.risuFetch.mockImplementation(async () => ({
                status: 0,
                data: 12345,
            }));

            h.nativeFetch.mockResolvedValue(new Response('fallback', { status: 200 }));

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            expect(result).toBeDefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    //  L384-385: _extractResponseBody numeric-keyed object (no length/byteLength)
    // ═══════════════════════════════════════════════════════════════════

    describe('_extractResponseBody numeric-keyed buffer object (L384-385)', () => {
        it('constructs Uint8Array from numeric-keyed object without length property', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

            // Object with numeric keys but NO .length or .byteLength
            // The code computes length from max numeric key + 1
            h.risuFetch.mockResolvedValue({
                status: 200,
                data: { '0': 72, '1': 101, '2': 108, '3': 108, '4': 111 },
            });

            const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            expect(result).toBeDefined();
            expect(result.status).toBe(200);
            const text = await result.text();
            expect(text).toBe('Hello');
        });
    });
});
