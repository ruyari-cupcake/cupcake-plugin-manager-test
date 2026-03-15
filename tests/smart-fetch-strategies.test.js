/**
 * smart-fetch-strategies.test.js — Tests for all 3 smartNativeFetch strategies
 * and error-handling paths.
 *
 * Supplements existing smart-fetch.test.js (Copilot duplicate replay guard only)
 * with coverage for:
 *   - Strategy 1: direct fetch success
 *   - Strategy 2: risuFetch (plainFetchForce) for non-Copilot URLs
 *   - Strategy 3: nativeFetch fallback
 *   - AbortSignal clone recovery
 *   - Body sanitization before send
 *   - All-strategies-fail throws
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRisu, mockSafeGetBoolArg } = vi.hoisted(() => ({
    mockRisu: {
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
    },
    mockSafeGetBoolArg: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: mockRisu,
    safeGetBoolArg: mockSafeGetBoolArg,
}));

vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeBodyJSON: vi.fn((body) => body),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: vi.fn().mockResolvedValue(true),
}));

import { smartNativeFetch, _resetCompatibilityCache } from '../src/lib/smart-fetch.js';
import { checkStreamCapability } from '../src/lib/stream-utils.js';

// Reset compatibility mode cache before every test across all describe blocks
beforeEach(() => {
    _resetCompatibilityCache();
    mockSafeGetBoolArg.mockResolvedValue(false);
});

describe('smartNativeFetch — Strategy 1: direct fetch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns direct fetch result when it succeeds', async () => {
        const mockRes = new Response('ok', { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        // risuFetch & nativeFetch should NOT be called
        expect(mockRisu.risuFetch).not.toHaveBeenCalled();
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
    });

    it('still uses direct fetch first for Google GET requests', async () => {
        const mockRes = new Response('ok', { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models', {
            method: 'GET',
        });

        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
    });
});

describe('smartNativeFetch — Google/Vertex native-first handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('direct should not run', { status: 200 }));
    });

    it('skips direct fetch and uses nativeFetch first for Gemini POST requests', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(mockRisu.nativeFetch).toHaveBeenCalledOnce();
        expect(mockRisu.nativeFetch.mock.calls[0][1].body).toBeInstanceOf(Uint8Array);
    });

    it('retries Google nativeFetch without signal on clone errors', async () => {
        mockRisu.nativeFetch
            .mockRejectedValueOnce(new Error('DataCloneError: AbortSignal cannot be cloned'))
            .mockResolvedValueOnce({ ok: true, status: 200, body: null });

        const controller = new AbortController();
        const res = await smartNativeFetch('https://aiplatform.googleapis.com/v1/projects/x/locations/global/publishers/google/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).toHaveBeenCalledTimes(2);
        expect(mockRisu.nativeFetch.mock.calls[1][1].signal).toBeUndefined();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('falls through to risuFetch when Google nativeFetch returns unusable response', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: false, status: 0, body: null });
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(mockRisu.nativeFetch).toHaveBeenCalledOnce();
        expect(mockRisu.risuFetch).toHaveBeenCalledOnce();
        expect(mockRisu.risuFetch.mock.calls[0][1].plainFetchForce).toBe(true);
    });
});

describe('smartNativeFetch — Strategy 2: risuFetch for non-Copilot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Strategy 1 fails (CORS)
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS blocked'));
    });

    it('falls through to risuFetch when direct fetch fails', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"result":"ok"}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [] }),
        });

        expect(res.status).toBe(200);
        expect(mockRisu.risuFetch).toHaveBeenCalledOnce();
        // Check plainFetchForce was set
        const callArgs = mockRisu.risuFetch.mock.calls[0][1];
        expect(callArgs.plainFetchForce).toBe(true);
    });

    it('sanitizes message arrays before sending them through risuFetch', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"result":"ok"}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                messages: [
                    { role: 'user', content: 'hello', name: 'tester', extra: 'drop-me' },
                    null,
                    { role: '', content: 'missing role' },
                    { role: 'assistant', content: undefined },
                    { role: 'system', content: 'keep me', meta: { nested: true } },
                ],
            },
        });

        expect(res.status).toBe(200);
        expect(mockRisu.risuFetch).toHaveBeenCalledOnce();
        expect(mockRisu.risuFetch.mock.calls[0][1].body).toEqual({
            messages: [
                { role: 'user', content: 'hello', name: 'tester' },
                { role: 'system', content: 'keep me' },
            ],
        });
    });

    it('retries risuFetch without signal on DataCloneError', async () => {
        // First call throws clone error, second succeeds
        mockRisu.risuFetch
            .mockRejectedValueOnce(new Error('DataCloneError: AbortSignal cannot be cloned'))
            .mockResolvedValueOnce({
                status: 200,
                data: new TextEncoder().encode('ok'),
                headers: {},
            });

        const controller = new AbortController();
        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
            signal: controller.signal,
        });

        expect(res.status).toBe(200);
        expect(mockRisu.risuFetch).toHaveBeenCalledTimes(2);
    });

    it('skips risuFetch for non-JSON content types and falls back to nativeFetch', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 201, body: null });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data' },
            body: 'raw',
        });

        expect(mockRisu.risuFetch).not.toHaveBeenCalled();
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
        expect(res.status).toBe(201);
    });

    it('falls back to nativeFetch when JSON body cannot be parsed for risuFetch', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 202, body: null });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{broken-json',
        });

        expect(mockRisu.risuFetch).not.toHaveBeenCalled();
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
        expect(res.status).toBe(202);
    });

    it('converts numeric-key objects returned from risuFetch into Response bodies', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: { 0: 65, 1: 66, 2: 67, length: 3 },
            headers: { 'content-type': 'text/plain' },
        });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [] }),
        });

        await expect(res.text()).resolves.toBe('ABC');
    });
});

describe('smartNativeFetch — Strategy 3: nativeFetch proxy fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Strategy 1 fails
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
        // Strategy 2 fails  (risuFetch returns empty/unusable)
        mockRisu.risuFetch.mockResolvedValue({ status: 0, data: null });
    });

    it('falls through to nativeFetch as last resort', async () => {
        const mockNfRes = { ok: true, status: 200, body: null };
        mockRisu.nativeFetch.mockResolvedValue(mockNfRes);

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
    });

    it('nativeFetch converts string body to Uint8Array', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200 });

        await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: '{"test":true}',
        });

        const callArgs = mockRisu.nativeFetch.mock.calls[0][1];
        expect(callArgs.body).toBeInstanceOf(Uint8Array);
    });
});

describe('smartNativeFetch — all strategies fail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
        mockRisu.risuFetch.mockResolvedValue({ status: 0, data: null });
        mockRisu.nativeFetch.mockRejectedValue(new Error('proxy down'));
    });

    it('throws when all 3 strategies fail', async () => {
        await expect(
            smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                body: '{}',
            })
        ).rejects.toThrow('All fetch strategies failed');
    });
});

describe('smartNativeFetch — body sanitization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    });

    it('sanitizes POST body before sending', async () => {
        const { sanitizeBodyJSON } = await import('../src/lib/sanitize.js');
        await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: '{"messages":[{"role":"user","content":"hi"}]}',
        });
        expect(sanitizeBodyJSON).toHaveBeenCalled();
    });

    it('does not sanitize GET requests', async () => {
        const { sanitizeBodyJSON } = await import('../src/lib/sanitize.js');
        vi.mocked(sanitizeBodyJSON).mockClear();
        await smartNativeFetch('https://api.openai.com/v1/models', {
            method: 'GET',
        });
        expect(sanitizeBodyJSON).not.toHaveBeenCalled();
    });

    it('continues even if sanitizeBodyJSON throws', async () => {
        const { sanitizeBodyJSON } = await import('../src/lib/sanitize.js');
        vi.mocked(sanitizeBodyJSON).mockImplementationOnce(() => { throw new Error('sanitize failed'); });
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            body: '{}',
        });

        expect(res.status).toBe(200);
    });
});

describe('smartNativeFetch — Copilot URL special handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('Copilot POST: tries nativeFetch FIRST before risuFetch', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });
        mockRisu.risuFetch.mockResolvedValue({ status: 200, data: 'unused' });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
        });

        expect(mockRisu.nativeFetch).toHaveBeenCalled();
        expect(res.status).toBe(200);
    });

    it('nativeFetch AbortSignal clone error retries without signal', async () => {
        mockRisu.nativeFetch
            .mockRejectedValueOnce(new Error('DataCloneError: AbortSignal not cloneable'))
            .mockResolvedValueOnce({ ok: true, status: 200, body: null });

        const controller = new AbortController();
        const _res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
        });

        expect(mockRisu.nativeFetch).toHaveBeenCalledTimes(2);
        // Second call should NOT have signal
        const secondCallOpts = mockRisu.nativeFetch.mock.calls[1][1];
        expect(secondCallOpts.signal).toBeUndefined();
    });

    it('Copilot risuFetch falls back from plainFetchDeforce 524 to plainFetchForce', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: false, status: 0 });
        mockRisu.risuFetch
            .mockResolvedValueOnce({ status: 524, data: 'timeout', headers: {} })
            .mockResolvedValueOnce({ status: 200, data: 'ok', headers: { 'content-type': 'text/plain' } });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
        });

        expect(mockRisu.risuFetch).toHaveBeenCalledTimes(2);
        expect(mockRisu.risuFetch.mock.calls[0][1].plainFetchDeforce).toBe(true);
        expect(mockRisu.risuFetch.mock.calls[1][1].plainFetchForce).toBe(true);
        await expect(res.text()).resolves.toBe('ok');
    });

    it('Copilot risuFetch retries without abortSignal on clone error', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: false, status: 0 });
        mockRisu.risuFetch
            .mockRejectedValueOnce(new Error('DataCloneError: AbortSignal cannot be cloned'))
            .mockResolvedValueOnce({ status: 200, data: 'ok', headers: {} });

        const controller = new AbortController();
        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
        });

        expect(mockRisu.risuFetch).toHaveBeenCalledTimes(2);
        expect(mockRisu.risuFetch.mock.calls[1][1].abortSignal).toBeUndefined();
        expect(res.status).toBe(200);
    });
});

// ─── Compatibility Mode Tests ───

describe('smartNativeFetch — Compatibility mode (user toggle)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // User toggle ON
        mockSafeGetBoolArg.mockResolvedValue(true);
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('skips Google nativeFetch and uses risuFetch when compat mode is ON', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
        expect(mockRisu.risuFetch).toHaveBeenCalledOnce();
    });

    it('tries Copilot nativeFetch first even in compat mode, falls back to risuFetch', async () => {
        // nativeFetch returns undefined (no mock configured) → unusable → falls through
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        // Copilot ALWAYS tries nativeFetch (it's the only viable path)
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
        expect(mockRisu.risuFetch).toHaveBeenCalled();
    });

    it('skips Strategy 3 nativeFetch fallback and throws when risuFetch fails', async () => {
        mockRisu.risuFetch.mockResolvedValue({ status: 0, data: null });

        await expect(
            smartNativeFetch('https://api.openai.com/v1/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"messages":[]}',
            })
        ).rejects.toThrow('All fetch strategies failed');

        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
    });

    it('Copilot 524 does NOT trigger plainFetchForce retry when compat mode is ON', async () => {
        mockSafeGetBoolArg.mockResolvedValue(true);
        mockRisu.nativeFetch.mockResolvedValue({ ok: false, status: 0 });
        mockRisu.risuFetch.mockResolvedValue({ status: 524, data: 'timeout', headers: {} });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            body: '{}',
        });

        // Should return the 524 error response, NOT retry with plainFetchForce
        expect(res.status).toBe(524);
        const body = await res.json();
        expect(body.error.type).toBe('compat_524_blocked');
        // risuFetch called only ONCE (plainFetchDeforce), no second call
        expect(mockRisu.risuFetch).toHaveBeenCalledTimes(1);
        expect(mockRisu.risuFetch.mock.calls[0][1].plainFetchDeforce).toBe(true);
    });

    it('non-Google non-Copilot POST still works via risuFetch in compat mode', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"result":"ok"}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
    });
});

describe('smartNativeFetch — Copilot nativeFetch exemption (manual compat mode off)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // User toggle OFF → compat mode INACTIVE
        mockSafeGetBoolArg.mockResolvedValue(false);
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('tries Copilot nativeFetch first even without compat mode', async () => {
        // nativeFetch returns undefined (no mock configured) → unusable → falls through
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        // Copilot ALWAYS tries nativeFetch regardless of compat mode
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
        expect(mockRisu.risuFetch).toHaveBeenCalled();
    });
});

describe('smartNativeFetch — Compatibility mode: normal path unaffected', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // User toggle OFF, stream capability true → compat mode INACTIVE
        mockSafeGetBoolArg.mockResolvedValue(false);
        vi.mocked(checkStreamCapability).mockResolvedValue(true);
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('nativeFetch still used for Google when checkStreamCapability is true', async () => {
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).toHaveBeenCalledOnce();
    });

    it('Strategy 3 nativeFetch still available when compat mode is inactive', async () => {
        // Strategy 2 risuFetch fails
        mockRisu.risuFetch.mockResolvedValue({ status: 0, data: null });
        // Strategy 3 nativeFetch succeeds
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });

        const res = await smartNativeFetch('https://api.openai.com/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"messages":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).toHaveBeenCalled();
    });
});

describe('smartNativeFetch — Compatibility mode: user toggle overrides auto-detect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('user toggle true overrides checkStreamCapability true', async () => {
        // checkStreamCapability says stream WORKS, but user forced compat mode ON
        mockSafeGetBoolArg.mockResolvedValue(true);
        vi.mocked(checkStreamCapability).mockResolvedValue(true);

        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        // nativeFetch must NOT be called even though checkStreamCapability is true
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
        // checkStreamCapability should NOT even be called (user toggle takes priority)
        expect(checkStreamCapability).not.toHaveBeenCalled();
    });
});

describe('smartNativeFetch — Compatibility mode caching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('caches compatibility mode result across multiple calls', async () => {
        mockSafeGetBoolArg.mockResolvedValue(false);
        vi.mocked(checkStreamCapability).mockResolvedValue(true);
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });

        // First call
        await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST', body: '{}',
        });
        // Second call
        await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST', body: '{}',
        });

        // safeGetBoolArg should only be called once (cached after first call)
        expect(mockSafeGetBoolArg).toHaveBeenCalledTimes(1);
    });

    it('_resetCompatibilityCache clears cached values', async () => {
        mockSafeGetBoolArg.mockResolvedValue(false);
        vi.mocked(checkStreamCapability).mockResolvedValue(true);
        mockRisu.nativeFetch.mockResolvedValue({ ok: true, status: 200, body: null });

        // First call — caches
        await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST', body: '{}',
        });

        // Reset cache
        _resetCompatibilityCache();

        // Second call — should re-read
        await smartNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST', body: '{}',
        });

        // Both should be called twice now (once before reset, once after)
        expect(mockSafeGetBoolArg).toHaveBeenCalledTimes(2);
    });
});

describe('smartNativeFetch — Compatibility mode: Vertex URL coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSafeGetBoolArg.mockResolvedValue(true); // compat ON
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    });

    it('skips nativeFetch for Vertex (aiplatform.googleapis.com) POST in compat mode', async () => {
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: new TextEncoder().encode('{"ok":true}'),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"contents":[]}',
        });

        expect(res.status).toBe(200);
        expect(mockRisu.nativeFetch).not.toHaveBeenCalled();
    });
});
