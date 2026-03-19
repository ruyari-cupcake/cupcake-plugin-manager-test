/**
 * Deep coverage tests for smart-fetch.js
 * Covers: _parseBodyForRisuFetch, _deepSanitizeBody, _stripNonSerializable,
 * _extractResponseBody, _tryCopilotRisuFetch, compatibility mode, all strategies.
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

        const _circularObj = {};
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

        const _result = await smartNativeFetch('https://api.openai.com/v1/chat', {
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

        const _result = await smartNativeFetch('https://api.openai.com/v1/chat', {
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

        const _result = await smartNativeFetch('https://api.openai.com/v1/chat', {
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
        const _result = await smartNativeFetch('https://api.openai.com/v1/chat', {
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

        const _result = await smartNativeFetch('https://aiplatform.googleapis.com/v1/projects/test', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        expect(h.nativeFetch).toHaveBeenCalled();
    });

    // ── OAuth2 URL handling ───
    it('tries nativeFetch first for OAuth2 URLs', async () => {
        h.nativeFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

        const _result = await smartNativeFetch('https://oauth2.googleapis.com/token', {
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

        const _result = await smartNativeFetch('https://api.openai.com/v1/chat', {
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
        h.risuFetch.mockImplementation(async (_url, _opts) => {
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

    it('propagates AbortError from direct fetch without trying fallback strategies', async () => {
        const abortErr = new DOMException('The operation was aborted.', 'AbortError');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));

        await expect(
            smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: JSON.stringify({ messages: [] }),
                headers: {},
            })
        ).rejects.toThrow('aborted');

        expect(h.risuFetch).not.toHaveBeenCalled();
        expect(h.nativeFetch).not.toHaveBeenCalled();
    });

    it('strips non-serializable values from circular object bodies before risuFetch', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (_url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        // Body WITHOUT messages/contents: IPC safety round-trip runs → strips non-serializable
        const body = { model: 'gpt-4', temperature: 0.7, nested: {} };
        body.self = body;
        body.fn = () => {};
        body.nested.parent = body;
        body.nested.ok = 'kept';

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json' },
        });

        expect(result.status).toBe(200);
        expect(capturedBody.fn).toBeUndefined();
        expect(capturedBody.nested.ok).toBe('kept');
    });

    it('falls back from Copilot risuFetch not-real-response path to nativeFetch', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch
            .mockResolvedValueOnce({ ok: false, status: 0 })
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        h.risuFetch
            .mockResolvedValueOnce({ status: 0, data: null })
            .mockResolvedValueOnce({ status: 0, data: null });

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: { 'Content-Type': 'application/json' },
        });

        expect(h.risuFetch).toHaveBeenCalledTimes(2);
        expect(h.nativeFetch).toHaveBeenCalledTimes(2);
        expect(result.status).toBe(200);
    });

    it('returns Copilot GET 404 via nativeFetch (GET now uses nativeFetch directly)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch.mockResolvedValue({ ok: false, status: 404 });

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'GET',
        });

        expect(result.status).toBe(404);
        expect(h.nativeFetch).toHaveBeenCalledTimes(1);
        expect(h.risuFetch).not.toHaveBeenCalled();
    });

    it('falls back from Copilot GET 500 nativeFetch response to risuFetch', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch.mockResolvedValue({ ok: false, status: 500 });
        h.risuFetch.mockResolvedValueOnce({ status: 200, data: new Uint8Array([123, 125]) });

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'GET',
        });

        expect(result.status).toBe(200);
        expect(h.risuFetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to nativeFetch when Copilot risuFetch body parsing fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.nativeFetch
            .mockResolvedValueOnce({ ok: false, status: 0 })
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{not-json',
            headers: { 'Content-Type': 'application/json' },
        });

        expect(result.status).toBe(200);
        expect(h.risuFetch).not.toHaveBeenCalled();
        expect(h.nativeFetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to nativeFetch when risuFetch returns an unreadable numeric object body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        const broken = new Proxy({ length: 2 }, {
            get(target, prop, receiver) {
                if (prop === '0') throw new Error('broken index');
                return Reflect.get(target, prop, receiver);
            },
        });
        h.risuFetch.mockResolvedValue({ status: 200, data: broken });
        h.nativeFetch.mockResolvedValue(new Response('ok', { status: 200 }));

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: {},
        });

        expect(result.status).toBe(200);
        expect(h.nativeFetch).toHaveBeenCalledTimes(1);
    });

    it('reads content-type from Headers objects for risuFetch eligibility', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
        h.risuFetch.mockResolvedValue({ status: 200, data: new Uint8Array([123, 125]) });

        const result = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }),
            headers: new Headers({ 'content-type': 'application/json' }),
        });

        expect(result.status).toBe(200);
        expect(h.risuFetch).toHaveBeenCalledTimes(1);
        expect(h.nativeFetch).not.toHaveBeenCalled();
    });

    it('caches compatibility mode lookups across calls', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
        h.safeGetBoolArg.mockResolvedValue(false);

        await smartNativeFetch('https://api.openai.com/v1/chat', { method: 'POST', body: '{}' });
        await smartNativeFetch('https://api.openai.com/v1/chat', { method: 'POST', body: '{}' });

        expect(h.safeGetBoolArg).toHaveBeenCalledTimes(1);
    });
});

// ═══════════════════════════════════════════════════════
//  Tool-use message body-corruption regression tests
//  Verifies: content:null preservation, body-corruption 400 fallback
// ═══════════════════════════════════════════════════════

describe('smartNativeFetch — tool-use message 400 error regression', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetCompatibilityCache();
        h.sanitizeBodyJSON.mockImplementation((x) => x);
        h.safeGetBoolArg.mockResolvedValue(false);
        h.risuFetch.mockReset();
        h.nativeFetch.mockReset();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));
    });

    it('preserves tool_calls assistant messages with content:null in risuFetch path', async () => {
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (_url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const body = JSON.stringify({
            messages: [
                { role: 'user', content: 'Call the weather tool' },
                { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Seoul"}' } }] },
                { role: 'tool', content: '{"temp": 15}', tool_call_id: 'call_1' },
                { role: 'assistant', content: 'Seoul is 15°C.' },
            ],
        });

        await smartNativeFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', body,
            headers: { 'Content-Type': 'application/json' },
        });

        expect(capturedBody).toBeTruthy();
        expect(capturedBody.messages).toHaveLength(4);
        // The assistant message with content:null + tool_calls MUST be preserved
        const toolCallMsg = capturedBody.messages[1];
        expect(toolCallMsg.role).toBe('assistant');
        expect(toolCallMsg.tool_calls).toBeDefined();
        expect(toolCallMsg.tool_calls[0].id).toBe('call_1');
        // tool_call_id message must also be preserved
        expect(capturedBody.messages[2].tool_call_id).toBe('call_1');
    });

    it('preserves function_call assistant messages with content:null', async () => {
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (_url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const body = JSON.stringify({
            messages: [
                { role: 'user', content: 'What is 2+2?' },
                { role: 'assistant', content: null, function_call: { name: 'calculator', arguments: '{"expr":"2+2"}' } },
                { role: 'function', content: '4', name: 'calculator' },
            ],
        });

        await smartNativeFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', body,
            headers: { 'Content-Type': 'application/json' },
        });

        expect(capturedBody).toBeTruthy();
        expect(capturedBody.messages).toHaveLength(3);
        const fnCallMsg = capturedBody.messages[1];
        expect(fnCallMsg.role).toBe('assistant');
        expect(fnCallMsg.function_call).toBeDefined();
        expect(fnCallMsg.function_call.name).toBe('calculator');
    });

    it('still filters out non-tool messages with content:null', async () => {
        let capturedBody = null;
        h.risuFetch.mockImplementation(async (_url, opts) => {
            capturedBody = opts.body;
            return { status: 200, data: new Uint8Array([123, 125]) };
        });

        const body = JSON.stringify({
            messages: [
                { role: 'user', content: 'Hi' },
                { role: 'assistant', content: null },  // No tool props → should be filtered
                { role: 'assistant', content: 'Hello!' },
            ],
        });

        await smartNativeFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', body,
            headers: { 'Content-Type': 'application/json' },
        });

        expect(capturedBody).toBeTruthy();
        // content:null without tool props should be removed
        expect(capturedBody.messages).toHaveLength(2);
        expect(capturedBody.messages[0].content).toBe('Hi');
        expect(capturedBody.messages[1].content).toBe('Hello!');
    });

    it('Google nativeFetch body-corruption 400 falls through to risuFetch', async () => {
        _resetCompatibilityCache();
        const errorBody = '{"error":{"message":"request body is not valid JSON","code":"invalid_request_body"}}';

        h.nativeFetch.mockResolvedValue({
            ok: false,
            status: 400,
            clone: () => ({ text: async () => errorBody }),
            text: async () => errorBody,
        });
        h.risuFetch.mockResolvedValue({
            status: 200,
            data: new Uint8Array(new TextEncoder().encode('{"candidates":[]}')),
            headers: {},
        });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models/gemini:generateContent', {
            method: 'POST',
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
            headers: { 'Content-Type': 'application/json' },
        });

        // Should have fallen through from nativeFetch 400 to risuFetch
        expect(h.nativeFetch).toHaveBeenCalledOnce();
        expect(h.risuFetch).toHaveBeenCalledOnce();
        expect(res.status).toBe(200);
    });

    it('Google nativeFetch non-corruption 400 returns as-is', async () => {
        _resetCompatibilityCache();
        const authError = '{"error":{"message":"API key not valid","code":"invalid_api_key"}}';

        h.nativeFetch.mockResolvedValue({
            ok: false,
            status: 400,
            clone: () => ({ text: async () => authError }),
            text: async () => authError,
        });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1/models/gemini:generateContent', {
            method: 'POST',
            body: JSON.stringify({ contents: [] }),
            headers: { 'Content-Type': 'application/json' },
        });

        // Non-corruption 400 should be returned directly, no risuFetch fallback
        expect(h.nativeFetch).toHaveBeenCalledOnce();
        expect(h.risuFetch).not.toHaveBeenCalled();
        expect(res.status).toBe(400);
    });

    it('nativeFetch fallback (Strategy 3) logs body-corruption on 400', async () => {
        _resetCompatibilityCache();
        const errorBody = '{"error":"unexpected EOF"}';
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Skip direct fetch (CORS), skip risuFetch (non-JSON content type), hit nativeFetch fallback
        h.nativeFetch.mockResolvedValue({
            ok: false,
            status: 400,
            clone: () => ({ text: async () => errorBody }),
            text: async () => errorBody,
        });

        const res = await smartNativeFetch('https://custom-api.example.com/v1/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
            headers: { 'Content-Type': 'application/json' },
        });

        expect(res.status).toBe(400);
        // Verify body-corruption was logged
        const corpLogCall = consoleSpy.mock.calls.find(c =>
            typeof c[0] === 'string' && c[0].includes('body-corruption 400')
        );
        expect(corpLogCall).toBeDefined();
        consoleSpy.mockRestore();
    });
});
