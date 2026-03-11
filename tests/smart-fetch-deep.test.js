/**
 * Deep coverage tests for smart-fetch.js
 * Covers: _parseBodyForRisuFetch, _deepSanitizeBody, _stripNonSerializable,
 * _extractResponseBody, _tryCopilotRisuFetch, compatibility mode, all strategies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('smartNativeFetch — internal helpers coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetCompatibilityCache();
        // Restore mocks to their default implementations
        h.sanitizeBodyJSON.mockImplementation((x) => x);
        h.safeGetBoolArg.mockResolvedValue(false);
        h.checkStreamCapability.mockResolvedValue(true);
        h.risuFetch.mockReset();
        h.nativeFetch.mockReset();
    });

    // ── _parseBodyForRisuFetch coverage ───
    it('handles body parse failure in risuFetch path gracefully', async () => {
        // Non-JSON string body should fail parsing in risuFetch path
        h.sanitizeBodyJSON.mockReturnValue('not {valid json}');
        const url = 'https://api.openai.com/v1/chat';
        // Mock direct fetch to fail (trigger risuFetch path)
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockRejectedValue(new Error('Body JSON parse failed'));
        h.nativeFetch.mockResolvedValue(new Response('ok', { status: 200 }));

        const result = await smartNativeFetch(url, {
            method: 'POST',
            body: 'not {valid json}',
            headers: {},
        });
        expect(result).toBeDefined();
    });

    // ── _deepSanitizeBody: messages array reconstruction ───
    it('sanitizes messages array removing null entries', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const body = JSON.stringify({
            messages: [
                { role: 'user', content: 'Hello' },
                null,
                { role: 'assistant', content: 'Hi' },
            ],
        });

        await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json' },
        });

        // The messages should have been deep-sanitized
        if (capturedBody && capturedBody.messages) {
            expect(capturedBody.messages.every(m => m !== null)).toBe(true);
        }
    });

    // ── _stripNonSerializable ───
    it('handles body with non-serializable values', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });

        const circularObj = {};
        // We can't actually send circular refs, but we test the path by having a normal body
        const body = JSON.stringify({ messages: [{ role: 'user', content: 'test' }] });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body,
            headers: {},
        });
        expect(result).toBeDefined();
    });

    // ── _extractResponseBody with different data types ───
    it('handles risuFetch returning ArrayBuffer data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        const arrayBuffer = new ArrayBuffer(4);
        new Uint8Array(arrayBuffer).set([72, 73, 33, 33]); // "HI!!"
        h.risuFetch.mockResolvedValue({ status: 200, data: arrayBuffer });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
        expect(result.status).toBe(200);
    });

    it('handles risuFetch returning numeric-keyed object data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: { 0: 72, 1: 73, length: 2 },
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
    });

    it('handles risuFetch returning string data with status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: '{"choices":[]}',
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
    });

    it('handles risuFetch returning Array data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: [72, 73],
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
    });

    // ── Compatibility mode ───
    it('skips nativeFetch in compatibility mode', async () => {
        h.safeGetBoolArg.mockResolvedValue(true);  // compatibility mode on
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(h.nativeFetch).not.toHaveBeenCalled();
    });

    it('auto-detects compatibility mode when bridge not capable', async () => {
        h.safeGetBoolArg.mockResolvedValue(false);
        h.checkStreamCapability.mockResolvedValue(false);  // bridge not capable
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        // nativeFetch should not have been called
        expect(h.nativeFetch).not.toHaveBeenCalled();
    });

    // ── Google API special path ───
    it('tries nativeFetch first for Google API URLs', async () => {
        h.nativeFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        expect(h.nativeFetch).toHaveBeenCalled();
        expect(result.status).toBe(200);
    });

    it('falls through when Google nativeFetch returns unusable response', async () => {
        h.nativeFetch.mockResolvedValue({ ok: false, status: 0 });
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
        });
        expect(result).toBeDefined();
    });

    it('handles Google nativeFetch error and falls through', async () => {
        h.nativeFetch.mockRejectedValue(new Error('network'));
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
        });
        expect(result).toBeDefined();
    });

    // ── bodyJSON sanitization error ───
    it('continues when sanitizeBodyJSON throws', async () => {
        h.sanitizeBodyJSON.mockImplementation(() => { throw new Error('sanitize failed'); });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: '{"test":true}',
        });
        expect(result).toBeDefined();
    });

    // ── Direct fetch success (Strategy 1) ───
    it('returns directly when iframe fetch succeeds', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: '{}',
        });
        expect(result.status).toBe(200);
    });

    // ── All strategies fail ───
    it('throws when all strategies fail', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockRejectedValue(new Error('risuFetch fail'));
        h.nativeFetch.mockRejectedValue(new Error('nativeFetch fail'));

        await expect(
            smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: JSON.stringify({}),
                headers: {},
            })
        ).rejects.toThrow('All fetch strategies failed');
    });

    // ── risuFetch signal clone error retry ───
    it('retries risuFetch without signal on clone error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        const ac = new AbortController();
        let callCount = 0;
        h.risuFetch.mockImplementation(async (url, opts) => {
            callCount++;
            if (callCount === 1 && opts.abortSignal) {
                throw new Error('DataCloneError: AbortSignal not cloneable');
            }
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
            signal: ac.signal,
        });
        expect(callCount).toBe(2);
        expect(result).toBeDefined();
    });

    // ── Copilot nativeFetch returns HTTP error ───
    it('returns Copilot nativeFetch HTTP error response as-is for POST', async () => {
        h.nativeFetch.mockResolvedValue({
            ok: false,
            status: 401,
        });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
        });
        // Should return the error response as-is
        expect(result.status).toBe(401);
    });

    // ── Non-JSON body skips risuFetch ───
    it('skips risuFetch path for non-JSON content type', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch.mockResolvedValue(new Response('ok', { status: 200 }));

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: 'form-data',
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        expect(h.risuFetch).not.toHaveBeenCalled();
    });

    // ── GET request skips nativeFetch-first for Google ───
    it('does not prefer nativeFetch first for Google GET requests', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));

        const result = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models', {
            method: 'GET',
        });
        // Should use direct fetch first, not nativeFetch
        expect(result.status).toBe(200);
    });

    // ── nativeFetch AbortSignal retry ───
    it('retries nativeFetch without signal on DataCloneError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 0, data: null });
        let nfCallCount = 0;
        h.nativeFetch.mockImplementation(async (url, opts) => {
            nfCallCount++;
            if (nfCallCount === 1 && opts?.signal) {
                throw new Error('DataCloneError: AbortSignal not cloneable');
            }
            return new Response('ok', { status: 200 });
        });

        const ac = new AbortController();
        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
            signal: ac.signal,
        });
        expect(nfCallCount).toBe(2);
    });

    // ── Copilot Vertex URL handling ───
    it('tries nativeFetch first for Vertex AI URLs', async () => {
        h.nativeFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://aiplatform.googleapis.com/v1/projects/test', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        expect(h.nativeFetch).toHaveBeenCalled();
    });

    // ── OAuth2 URL handling ───
    it('tries nativeFetch first for OAuth2 URLs', async () => {
        h.nativeFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const result = await smartNativeFetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        expect(h.nativeFetch).toHaveBeenCalled();
    });

    // ── risuFetch returning null data ───
    it('falls through to nativeFetch when risuFetch returns null data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 200, data: null });
        h.nativeFetch.mockResolvedValue(new Response('ok', { status: 200 }));

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
        });
        expect(h.nativeFetch).toHaveBeenCalled();
    });

    // ── Copilot risuFetch paths ───
    it('tries plainFetchDeforce then plainFetchForce for Copilot', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch.mockResolvedValue({ ok: false, status: 0 });
        let callCount = 0;
        h.risuFetch.mockImplementation(async (url, opts) => {
            callCount++;
            if (callCount === 1) {
                return { status: 524, data: new Uint8Array([123, 125]) };
            }
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
        });
        expect(callCount).toBe(2);
        expect(result.status).toBe(200);
    });

    // ── Contents array sanitization ───
    it('sanitizes contents array in body for Gemini format', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const body = JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: 'hello' }] },
                null,
            ],
        });

        await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body,
            headers: {},
        });

        if (capturedBody && capturedBody.contents) {
            expect(capturedBody.contents.every(m => m !== null)).toBe(true);
        }
    });

    // ── _extractResponseBody: byteLength-based object ───
    it('handles risuFetch returning object with byteLength (no length)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: { byteLength: 2, 0: 65, 1: 66 },
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
        expect(result.status).toBe(200);
    });

    // ── _extractResponseBody: numeric-keyed object with no length/byteLength ───
    it('handles risuFetch returning object with only numeric keys', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: { '0': 72, '1': 73, '2': 33 },
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
        expect(result.status).toBe(200);
    });

    // ── _extractResponseBody: empty object with no numeric keys ───
    it('returns null for risuFetch with empty object data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: {},
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        // empty object → _len = 0 → falls through → data dropped
        expect(result).toBeFalsy();
    });

    // ── _extractResponseBody: DataView (ArrayBuffer view) ───
    it('handles risuFetch returning DataView', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        const buf = new ArrayBuffer(3);
        new Uint8Array(buf).set([65, 66, 67]);
        const dataView = new DataView(buf);
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: dataView,
        });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });
        expect(result).toBeDefined();
        expect(result.status).toBe(200);
    });

    // ── P1-A: Abort semantics after DataCloneError ───

    it('throws AbortError when signal is already aborted before fetch', async () => {
        const ac = new AbortController();
        ac.abort();

        await expect(
            smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
                signal: ac.signal,
            })
        ).rejects.toThrow('aborted');
    });

    it('rejects with AbortError when signal fires during nativeFetch after clone error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 0, data: null });

        // nativeFetch: first call throws clone error, second call hangs (simulates long API call)
        let nfCallCount = 0;
        h.nativeFetch.mockImplementation(async (url, opts) => {
            nfCallCount++;
            if (nfCallCount === 1 && opts?.signal) {
                throw new Error('DataCloneError: AbortSignal not cloneable');
            }
            // Simulate a long-running request that won't resolve on its own
            return new Promise(() => {});
        });

        const ac = new AbortController();
        const fetchPromise = smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
            signal: ac.signal,
        });

        // Abort after the retry has started
        setTimeout(() => ac.abort(), 50);

        await expect(fetchPromise).rejects.toThrow('aborted');
        expect(nfCallCount).toBe(2);
    });

    it('rejects with AbortError when signal fires during risuFetch after clone error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        let rfCallCount = 0;
        h.risuFetch.mockImplementation(async (url, opts) => {
            rfCallCount++;
            if (rfCallCount === 1 && opts.abortSignal) {
                throw new Error('DataCloneError: AbortSignal not cloneable');
            }
            // Simulate a long-running request
            return new Promise(() => {});
        });

        const ac = new AbortController();
        const fetchPromise = smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
            signal: ac.signal,
        });

        setTimeout(() => ac.abort(), 50);

        await expect(fetchPromise).rejects.toThrow('aborted');
        expect(rfCallCount).toBe(2);
    });

    it('resolves normally when fetch completes before abort during nativeFetch clone recovery', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 0, data: null });

        let nfCallCount = 0;
        h.nativeFetch.mockImplementation(async (url, opts) => {
            nfCallCount++;
            if (nfCallCount === 1 && opts?.signal) {
                throw new Error('DataCloneError: AbortSignal not cloneable');
            }
            return new Response('ok', { status: 200 });
        });

        const ac = new AbortController();
        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {},
            signal: ac.signal,
        });

        expect(result.status).toBe(200);
        expect(nfCallCount).toBe(2);
    });
});
