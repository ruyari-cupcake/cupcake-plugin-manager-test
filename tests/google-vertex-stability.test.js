import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const readProvider = (name) => readFileSync(resolve(ROOT, name), 'utf-8');

function makeJsonResponse(body, status = 200, extra = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => extra.contentType || 'application/json' },
        json: vi.fn(async () => body),
        text: vi.fn(async () => JSON.stringify(body)),
        body: extra.body,
    };
}

function makeTextResponse(text, status = 200, extra = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => extra.contentType || 'text/plain' },
        json: vi.fn(async () => ({ text })),
        text: vi.fn(async () => text),
        body: extra.body,
    };
}

function installProvider(providerFile, {
    safeArgs = {},
    safeBools = {},
    fetchImpl = vi.fn(),
    nativeFetchImpl = vi.fn(),
    risuFetchImpl = vi.fn(),
    keyRotationValue = 'test-key',
    jsonKeyRotationValue = JSON.stringify({
        project_id: 'proj-1',
        client_email: 'svc@test.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----',
    }),
    formatToGeminiResult = { contents: [{ role: 'user', parts: [{ text: 'hello' }] }], systemInstruction: ['sys'] },
    formatToAnthropicResult = { messages: [{ role: 'user', content: 'hello' }], system: 'sys' },
} = {}) {
    let registeredProvider = null;

    const CupcakePM = {
        registerProvider: vi.fn((provider) => { registeredProvider = provider; }),
        safeGetArg: vi.fn(async (key) => safeArgs[key] ?? ''),
        safeGetBoolArg: vi.fn(async (key) => safeBools[key] ?? false),
        withKeyRotation: vi.fn(async (_key, cb) => cb(keyRotationValue)),
        withJsonKeyRotation: vi.fn(async (_key, cb) => cb(jsonKeyRotationValue)),
        smartNativeFetch: vi.fn((...args) => fetchImpl(...args)),
        smartFetch: vi.fn((...args) => fetchImpl(...args)),
        formatToGemini: vi.fn(() => formatToGeminiResult),
        formatToAnthropic: vi.fn(() => formatToAnthropicResult),
        buildGeminiThinkingConfig: vi.fn(() => null),
        getGeminiSafetySettings: vi.fn(() => []),
        validateGeminiParams: vi.fn(),
        cleanExperimentalModelParams: vi.fn(),
        parseGeminiNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'parsed-gemini',
        })),
        parseClaudeNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.content?.map(p => p.text || '').join('') || 'parsed-claude',
        })),
        createSSEStream: vi.fn(() => 'SSE_STREAM'),
        createAnthropicSSEStream: vi.fn(() => 'ANTHROPIC_STREAM'),
        parseGeminiSSELine: vi.fn(() => null),
        saveThoughtSignatureFromStream: vi.fn(),
        pickKey: vi.fn(async () => keyRotationValue),
        pickJsonKey: vi.fn(async () => jsonKeyRotationValue),
    };

    const windowObj = {
        CupcakePM,
        Risuai: { nativeFetch: nativeFetchImpl, risuFetch: risuFetchImpl },
        risuai: { nativeFetch: nativeFetchImpl, risuFetch: risuFetchImpl },
    };

    const source = readProvider(providerFile);
    const runner = new Function('window', source);
    runner(windowObj);

    if (!registeredProvider) {
        throw new Error(`Provider ${providerFile} did not register`);
    }

    return { provider: registeredProvider, CupcakePM, windowObj };
}

describe('Gemini provider stability paths', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.restoreAllMocks();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it('prefers nativeFetch for Gemini requests and sends Uint8Array bodies', async () => {
        const nativeFetch = vi.fn(async (_url, _opts) => makeJsonResponse({
            candidates: [{ content: { parts: [{ text: 'native-ok' }] } }],
        }, 200, { body: null }));
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: false, chat_gemini_usePlainFetch: false },
            nativeFetchImpl: nativeFetch,
            fetchImpl: vi.fn(),
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-1');

        expect(result).toEqual({ success: true, content: 'native-ok' });
        expect(nativeFetch).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(CupcakePM.smartNativeFetch).not.toHaveBeenCalled();
        expect(nativeFetch.mock.calls[0][1].body).toBeInstanceOf(Uint8Array);
    });

    it('uses plain fetch when Gemini plain-fetch option is enabled', async () => {
        const nativeFetch = vi.fn();
        const fetchMock = vi.fn(async () => makeJsonResponse({
            candidates: [{ content: { parts: [{ text: 'plain-fetch-ok' }] } }],
        }));
        globalThis.fetch = fetchMock;

        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: false, chat_gemini_usePlainFetch: true },
            nativeFetchImpl: nativeFetch,
            fetchImpl: vi.fn(),
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-2');

        expect(result).toEqual({ success: true, content: 'plain-fetch-ok' });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(nativeFetch).not.toHaveBeenCalled();
        expect(CupcakePM.smartNativeFetch).not.toHaveBeenCalled();
    });

    it('retries Gemini requests on retriable HTTP status and succeeds on retry', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const nativeFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                body: { cancel },
                text: async () => 'rate limit',
            })
            .mockResolvedValueOnce(makeJsonResponse({
                candidates: [{ content: { parts: [{ text: 'retry-ok' }] } }],
            }));
        globalThis.fetch = vi.fn();

        const { provider } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
        });

        const promise = provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-3');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'retry-ok' });
        expect(nativeFetch).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('falls back from streaming to non-streaming when response body is unreadable', async () => {
        const nativeFetch = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ stream: true }, 200, { body: null }))
            .mockResolvedValueOnce(makeJsonResponse({
                candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }],
            }));
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: true },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-4');

        expect(result).toEqual({ success: true, content: 'fallback-ok' });
        expect(nativeFetch).toHaveBeenCalledTimes(2);
        expect(nativeFetch.mock.calls[0][0]).toContain(':streamGenerateContent');
        expect(nativeFetch.mock.calls[1][0]).toContain(':generateContent');
        expect(CupcakePM.createSSEStream).not.toHaveBeenCalled();
        expect(CupcakePM.parseGeminiNonStreamingResponse).toHaveBeenCalledOnce();
    });

    it('falls back to smartNativeFetch when nativeFetch returns unusable Gemini response', async () => {
        const nativeFetch = vi.fn().mockResolvedValue({ ok: false, status: 0, body: null, text: async () => '' });
        const smartFetch = vi.fn(async () => makeJsonResponse({
            candidates: [{ content: { parts: [{ text: 'smart-fetch-ok' }] } }],
        }));
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
            fetchImpl: smartFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-5');

        expect(result).toEqual({ success: true, content: 'smart-fetch-ok' });
        expect(nativeFetch).toHaveBeenCalledOnce();
        expect(CupcakePM.smartNativeFetch).toHaveBeenCalledOnce();
    });

    it('falls back to smartNativeFetch when Gemini plain fetch fails', async () => {
        const nativeFetch = vi.fn();
        const smartFetch = vi.fn(async () => makeJsonResponse({
            candidates: [{ content: { parts: [{ text: 'plain-fallback-ok' }] } }],
        }));
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('plain fetch blocked'));

        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeBools: { cpm_streaming_enabled: false, chat_gemini_usePlainFetch: true },
            nativeFetchImpl: nativeFetch,
            fetchImpl: smartFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-6');

        expect(result).toEqual({ success: true, content: 'plain-fallback-ok' });
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(nativeFetch).not.toHaveBeenCalled();
        expect(CupcakePM.smartNativeFetch).toHaveBeenCalledOnce();
    });
});

describe('Vertex provider stability paths', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.restoreAllMocks();
        vi.spyOn(globalThis.crypto.subtle, 'importKey').mockResolvedValue({ fake: 'key' });
        vi.spyOn(globalThis.crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it('prefers nativeFetch for Vertex Gemini requests and sends Uint8Array bodies', async () => {
        const nativeFetch = vi.fn(async (url, _opts) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                return makeJsonResponse({ access_token: 'token-1', expires_in: 3600 });
            }
            return makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'vertex-native-ok' }] } }] });
        });
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v1');

        expect(result).toEqual({ success: true, content: 'vertex-native-ok' });
        expect(nativeFetch).toHaveBeenCalledTimes(2);
        expect(nativeFetch.mock.calls[1][0]).toContain('/publishers/google/models/gemini-2.5-flash:generateContent');
        expect(nativeFetch.mock.calls[1][1].body).toBeInstanceOf(Uint8Array);
        expect(CupcakePM.parseGeminiNonStreamingResponse).toHaveBeenCalledOnce();
    });

    it('refreshes Vertex auth on 401 and retries with a new bearer token', async () => {
        const nativeFetch = vi.fn(async (url, opts) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                const tokenIndex = nativeFetch.mock.calls.filter(call => call[0].includes('oauth2.googleapis.com/token')).length;
                return makeJsonResponse({ access_token: `token-${tokenIndex}`, expires_in: 3600 });
            }
            const auth = opts?.headers?.Authorization;
            if (auth === 'Bearer token-1') {
                return makeTextResponse('unauthorized', 401);
            }
            return makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'auth-retry-ok' }] } }] });
        });
        globalThis.fetch = vi.fn();

        const { provider } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v2');

        expect(result).toEqual({ success: true, content: 'auth-retry-ok' });
        const apiCalls = nativeFetch.mock.calls.filter(call => call[0].includes('/publishers/google/models/'));
        expect(apiCalls).toHaveLength(2);
        expect(apiCalls[0][1].headers.Authorization).toBe('Bearer token-1');
        expect(apiCalls[1][1].headers.Authorization).toBe('Bearer token-2');
    });

    it('falls back from Vertex Gemini streaming to non-streaming when body is unreadable', async () => {
        const nativeFetch = vi.fn(async (url) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                return makeJsonResponse({ access_token: 'token-1', expires_in: 3600 });
            }
            if (url.includes(':streamGenerateContent')) {
                return makeJsonResponse({ streamed: true }, 200, { body: null });
            }
            return makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'vertex-fallback-ok' }] } }] });
        });
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: true },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v3');

        expect(result).toEqual({ success: true, content: 'vertex-fallback-ok' });
        const apiCalls = nativeFetch.mock.calls.filter(call => call[0].includes('/publishers/google/models/'));
        expect(apiCalls[0][0]).toContain(':streamGenerateContent');
        expect(apiCalls[1][0]).toContain(':generateContent');
        expect(CupcakePM.createSSEStream).not.toHaveBeenCalled();
        expect(CupcakePM.parseGeminiNonStreamingResponse).toHaveBeenCalledOnce();
    });

    it('falls back from Vertex Claude streaming to non-streaming when body is unreadable', async () => {
        const nativeFetch = vi.fn(async (url) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                return makeJsonResponse({ access_token: 'token-1', expires_in: 3600 });
            }
            if (url.includes(':streamRawPredict')) {
                return makeJsonResponse({ streamed: true }, 200, { body: null });
            }
            return makeJsonResponse({ content: [{ type: 'text', text: 'claude-fallback-ok' }] });
        });
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: true },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'claude-sonnet-4@20250514' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v4');

        expect(result).toEqual({ success: true, content: 'claude-fallback-ok' });
        const apiCalls = nativeFetch.mock.calls.filter(call => call[0].includes('/publishers/anthropic/models/'));
        expect(apiCalls[0][0]).toContain(':streamRawPredict');
        expect(apiCalls[1][0]).toContain(':rawPredict');
        expect(CupcakePM.createAnthropicSSEStream).not.toHaveBeenCalled();
        expect(CupcakePM.parseClaudeNonStreamingResponse).toHaveBeenCalledOnce();
    });

    it('retries Vertex requests on retriable server errors', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const nativeFetch = vi.fn(async (url) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                return makeJsonResponse({ access_token: 'token-1', expires_in: 3600 });
            }
            const apiCalls = nativeFetch.mock.calls.filter(call => call[0].includes('/publishers/google/models/')).length;
            if (apiCalls === 1) {
                return { ok: false, status: 429, body: { cancel }, text: async () => 'retry me' };
            }
            return makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'vertex-retry-ok' }] } }] });
        });
        globalThis.fetch = vi.fn();

        const { provider } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
        });

        const promise = provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v5');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'vertex-retry-ok' });
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('falls back to an alternate Vertex location on 404 region errors', async () => {
        const nativeFetch = vi.fn(async (url, _opts) => {
            if (url.includes('oauth2.googleapis.com/token')) {
                return makeJsonResponse({ access_token: 'token-1', expires_in: 3600 });
            }
            if (url.includes('locations/global') && url.includes(':generateContent')) {
                return makeTextResponse('not found', 404);
            }
            if (url.includes('locations/us-central1') && url.includes(':generateContent')) {
                return makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'location-fallback-ok' }] } }] });
            }
            return makeTextResponse('unexpected', 500);
        });
        globalThis.fetch = vi.fn();

        const { provider, CupcakePM } = installProvider('cpm-provider-vertex.js', {
            safeArgs: { cpm_vertex_location: 'global' },
            safeBools: { cpm_streaming_enabled: false },
            nativeFetchImpl: nativeFetch,
        });

        const result = await provider.fetcher({ id: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-v6');

        expect(result).toEqual({ success: true, content: 'location-fallback-ok' });
        const apiCalls = nativeFetch.mock.calls.filter(call => call[0].includes('/publishers/google/models/'));
        expect(apiCalls[0][0]).toContain('/locations/global/');
        expect(apiCalls[1][0]).toContain('/locations/us-central1/');
        expect(CupcakePM.parseGeminiNonStreamingResponse).toHaveBeenCalledOnce();
    });
});