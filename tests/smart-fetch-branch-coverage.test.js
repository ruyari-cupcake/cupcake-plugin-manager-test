/**
 * smart-fetch-branch-coverage.test.js — Targeted branch coverage tests for smart-fetch.js
 *
 * Covers uncovered branches identified in coverage analysis:
 *   6. _raceWithAbortSignal — signal already aborted at call time (~lines 42-44)
 *   7. _tryCopilotRisuFetch — risuFetch throws non-clone error (re-throw, ~line 484)
 *   8. Proxy auth error detection — status 400 with known proxy error (~lines 510-516)
 *   9. 524 status in compatibility mode — retry blocked (~lines 493-500)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks before imports
const h = vi.hoisted(() => ({
    sanitizeBodyJSON: vi.fn((x) => x),
    safeGetBoolArg: vi.fn(() => false),
    checkStreamCapability: vi.fn(() => true),
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

describe('smart-fetch branch coverage — uncovered branches', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetCompatibilityCache();
        h.sanitizeBodyJSON.mockImplementation((x) => x);
        h.safeGetBoolArg.mockResolvedValue(false);
        h.checkStreamCapability.mockResolvedValue(true);
        h.risuFetch.mockReset();
        h.nativeFetch.mockReset();
    });

    // ════════════════════════════════════════════════════════════════
    // 6. Pre-aborted signal → immediate AbortError
    // ════════════════════════════════════════════════════════════════

    describe('pre-aborted signal', () => {
        it('rejects immediately with AbortError when signal is already aborted', async () => {
            const ac = new AbortController();
            ac.abort(); // Pre-abort

            // No mocks needed — the function should never reach fetch
            await expect(
                smartNativeFetch('https://api.openai.com/v1/chat', {
                    method: 'POST',
                    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
                    headers: {},
                    signal: ac.signal,
                })
            ).rejects.toThrow();

            // Verify it's an AbortError
            try {
                await smartNativeFetch('https://api.openai.com/v1/chat', {
                    method: 'POST',
                    body: JSON.stringify({ messages: [] }),
                    headers: {},
                    signal: ac.signal,
                });
            } catch (e) {
                expect(e).toBeInstanceOf(DOMException);
                expect(/** @type {DOMException} */ (e).name).toBe('AbortError');
            }
        });
    });

    // ════════════════════════════════════════════════════════════════
    // 7. risuFetch throws non-clone error (re-throw path)
    // ════════════════════════════════════════════════════════════════

    describe('risuFetch non-clone error re-throw', () => {
        it('falls through to nativeFetch when risuFetch throws a non-DataCloneError', async () => {
            // Simulate: direct fetch fails (CORS), risuFetch throws non-clone error, nativeFetch succeeds
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));

            // risuFetch throws an error whose message does NOT match clone/structured/postmessage/AbortSignal/DataCloneError
            h.risuFetch.mockRejectedValue(new Error('network timeout'));

            // nativeFetch should be the fallback
            h.nativeFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

            const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
                headers: { 'Content-Type': 'application/json' },
            });

            expect(result).toBeDefined();
            expect(result.status).toBe(200);
            // nativeFetch was used as fallback
            expect(h.nativeFetch).toHaveBeenCalled();
        });
    });

    // ════════════════════════════════════════════════════════════════
    // 8. Proxy auth error detection — 400 with known proxy error
    // ════════════════════════════════════════════════════════════════

    describe('proxy auth error detection', () => {
        it('falls through from deforce to force mode when proxy auth error is detected', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));

            const proxyErrorJson = JSON.stringify({ error: 'No auth header' });
            const proxyErrorBody = new Uint8Array(new TextEncoder().encode(proxyErrorJson));

            // risuFetch calls:
            // 1st (plainFetchDeforce) → 400 with proxy auth error JSON
            // 2nd (plainFetchForce) → 200 success
            h.risuFetch
                .mockResolvedValueOnce({ status: 400, data: proxyErrorBody })
                .mockResolvedValueOnce({ status: 200, data: new Uint8Array(new TextEncoder().encode('{"choices":[]}')) });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
                headers: { Authorization: 'Bearer test-token' },
            });

            expect(result).toBeDefined();
            // The risuFetch should have been called twice (deforce → force fallthrough)
            expect(h.risuFetch).toHaveBeenCalledTimes(2);
        });

        it('detects Token Expired proxy error and falls through', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));

            const proxyErrorJson = JSON.stringify({ error: 'Token Expired' });
            const proxyErrorBody = new Uint8Array(new TextEncoder().encode(proxyErrorJson));

            h.risuFetch
                .mockResolvedValueOnce({ status: 400, data: proxyErrorBody })
                .mockResolvedValueOnce({ status: 200, data: new Uint8Array(new TextEncoder().encode('{"ok":true}')) });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            expect(result).toBeDefined();
            expect(h.risuFetch).toHaveBeenCalledTimes(2);
        });
    });

    // ════════════════════════════════════════════════════════════════
    // 9. 524 status in compatibility mode — retry blocked
    // ════════════════════════════════════════════════════════════════

    describe('524 status in compatibility mode', () => {
        it('returns synthetic 524 error response when compatibility mode is active', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));

            // Enable compatibility mode
            h.safeGetBoolArg.mockResolvedValue(true);
            _resetCompatibilityCache();

            // risuFetch returns 524 with some body
            const body524 = new Uint8Array(new TextEncoder().encode('upstream timeout'));
            h.risuFetch.mockResolvedValue({ status: 524, data: body524 });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
                headers: {},
            });

            expect(result).toBeDefined();
            expect(result.status).toBe(524);
            const text = await result.text();
            expect(text).toContain('compat_524_blocked');
        });

        it('falls through normally on 524 when compatibility mode is off', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));

            // Compatibility mode OFF
            h.safeGetBoolArg.mockResolvedValue(false);
            _resetCompatibilityCache();

            const body524 = new Uint8Array(new TextEncoder().encode('upstream timeout'));
            // 1st call (deforce): 524 → fallthrough (compat off)
            // 2nd call (force): 200 success
            h.risuFetch
                .mockResolvedValueOnce({ status: 524, data: body524 })
                .mockResolvedValueOnce({ status: 200, data: new Uint8Array(new TextEncoder().encode('{"ok":true}')) });

            const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            });

            expect(result).toBeDefined();
            // Should have fallen through to force mode
            expect(h.risuFetch).toHaveBeenCalledTimes(2);
        });
    });
});
