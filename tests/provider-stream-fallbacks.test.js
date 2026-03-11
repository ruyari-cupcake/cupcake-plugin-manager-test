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

function makeErrorResponse(status, text = 'error', extra = {}) {
    const normalized = Object.fromEntries(Object.entries(extra.headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
    return {
        ok: false,
        status,
        headers: { get: (name) => normalized[String(name).toLowerCase()] || extra.contentType || 'text/plain' },
        json: vi.fn(async () => ({ error: text })),
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
    formatToAnthropicResult = { messages: [{ role: 'user', content: 'hello' }], system: 'sys' },
} = {}) {
    let registeredProvider = null;

    const CupcakePM = {
        registerProvider: vi.fn((provider) => { registeredProvider = provider; }),
        safeGetArg: vi.fn(async (key) => safeArgs[key] ?? ''),
        safeGetBoolArg: vi.fn(async (key) => safeBools[key] ?? false),
        withKeyRotation: vi.fn(async (_key, cb) => cb(keyRotationValue)),
        smartNativeFetch: vi.fn((...args) => fetchImpl(...args)),
        smartFetch: vi.fn((...args) => fetchImpl(...args)),
        formatToOpenAI: vi.fn((messages) => messages.map((m) => ({ role: m.role, content: m.content }))),
        formatToAnthropic: vi.fn(() => formatToAnthropicResult),
        parseOpenAINonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.choices?.[0]?.message?.content || '',
        })),
        parseResponsesAPINonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.output?.[0]?.content?.[0]?.text || 'responses-ok',
        })),
        parseClaudeNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.content?.map(p => p.text || '').join('') || '',
        })),
        createOpenAISSEStream: vi.fn(() => 'OPENAI_STREAM'),
        createResponsesAPISSEStream: vi.fn(() => 'RESPONSES_STREAM'),
        createAnthropicSSEStream: vi.fn(() => 'ANTHROPIC_STREAM'),
        createSSEStream: vi.fn(() => 'SSE_STREAM'),
        parseOpenAISSELine: vi.fn(() => null),
        safeUUID: vi.fn(() => 'uuid-1'),
        _needsCopilotResponsesAPI: vi.fn((model) => /gpt-5\.4/i.test(String(model || ''))),
        AwsV4Signer: class {
            constructor(config) { this.config = config; }
            async sign() {
                return {
                    url: this.config.url,
                    method: this.config.method,
                    headers: this.config.headers || {},
                    body: this.config.body,
                };
            }
        },
    };

    const windowObj = {
        CupcakePM,
        Risuai: { nativeFetch: nativeFetchImpl, risuFetch: risuFetchImpl },
        risuai: { nativeFetch: nativeFetchImpl, risuFetch: risuFetchImpl },
    };

    const source = readProvider(providerFile);
    const runner = new Function('window', source);
    runner(windowObj);

    if (!registeredProvider) throw new Error(`Provider ${providerFile} did not register`);
    return { provider: registeredProvider, CupcakePM };
}

describe('Standalone provider stream fallbacks', () => {
    let originalWindow;

    beforeEach(() => {
        vi.restoreAllMocks();
        originalWindow = globalThis.window;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    it('falls back to non-streaming for OpenAI provider when body is unavailable', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ stream: true }, 200, { body: null, contentType: 'text/event-stream' }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'openai-fallback-ok' } }] }));

        const { provider, CupcakePM } = installProvider('cpm-provider-openai.js', {
            safeBools: { cpm_streaming_enabled: true },
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher({ id: 'gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-o1');

        expect(result).toEqual({ success: true, content: 'openai-fallback-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(true);
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).stream).toBe(false);
        expect(CupcakePM.createOpenAISSEStream).not.toHaveBeenCalled();
    });

    it('falls back to non-streaming for Anthropic provider when body is unavailable', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ stream: true }, 200, { body: null, contentType: 'text/event-stream' }))
            .mockResolvedValueOnce(makeJsonResponse({ content: [{ type: 'text', text: 'anthropic-fallback-ok' }] }));

        const { provider, CupcakePM } = installProvider('cpm-provider-anthropic.js', {
            safeBools: { cpm_streaming_enabled: true },
            safeArgs: { cpm_anthropic_url: 'https://api.anthropic.com/v1/messages' },
            fetchImpl,
        });

        const result = await provider.fetcher({ id: 'claude-sonnet-4-5-20250929' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-a1');

        expect(result).toEqual({ success: true, content: 'anthropic-fallback-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).stream).toBe(false);
        expect(CupcakePM.createAnthropicSSEStream).not.toHaveBeenCalled();
    });

    it('falls back to non-streaming for OpenRouter provider when body is unavailable', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ stream: true }, 200, { body: null, contentType: 'text/event-stream' }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'openrouter-fallback-ok' } }] }));

        const { provider, CupcakePM } = installProvider('cpm-provider-openrouter.js', {
            safeBools: { cpm_streaming_enabled: true },
            safeArgs: { cpm_openrouter_model: 'openai/gpt-4o', cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher({ id: 'openai/gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-r1');

        expect(result).toEqual({ success: true, content: 'openrouter-fallback-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).stream).toBe(false);
        expect(CupcakePM.createOpenAISSEStream).not.toHaveBeenCalled();
    });

    it('falls back to non-streaming for DeepSeek provider when body is unavailable', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ stream: true }, 200, { body: null, contentType: 'text/event-stream' }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'deepseek-fallback-ok' } }] }));

        const { provider, CupcakePM } = installProvider('cpm-provider-deepseek.js', {
            safeBools: { cpm_streaming_enabled: true },
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher({ id: 'deepseek-chat' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-d1');

        expect(result).toEqual({ success: true, content: 'deepseek-fallback-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).stream).toBe(false);
        expect(CupcakePM.createOpenAISSEStream).not.toHaveBeenCalled();
    });
});

describe('Standalone provider retry policies', () => {
    let originalWindow;

    beforeEach(() => {
        vi.restoreAllMocks();
        originalWindow = globalThis.window;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        vi.useRealTimers();
    });

    it('retries OpenAI provider on 429 and honors Retry-After', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const timerSpy = vi.spyOn(globalThis, 'setTimeout');
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeErrorResponse(429, 'rate limit', { headers: { 'retry-after': '2' }, body: { cancel } }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'openai-retry-ok' } }] }));

        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const promise = provider.fetcher({ id: 'gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-o-retry');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'openai-retry-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledOnce();
        expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    });

    it('retries Anthropic provider on 503 and succeeds', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeErrorResponse(503, 'overloaded', { body: { cancel } }))
            .mockResolvedValueOnce(makeJsonResponse({ content: [{ type: 'text', text: 'anthropic-retry-ok' }] }));

        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_url: 'https://api.anthropic.com/v1/messages' },
            fetchImpl,
        });

        const promise = provider.fetcher({ id: 'claude-sonnet-4-5-20250929' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-a-retry');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'anthropic-retry-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('retries OpenRouter provider on 408 and succeeds', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeErrorResponse(408, 'timeout', { body: { cancel } }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'openrouter-retry-ok' } }] }));

        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: { cpm_openrouter_model: 'openai/gpt-4o', cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions' },
            fetchImpl,
        });

        const promise = provider.fetcher({ id: 'openai/gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-r-retry');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'openrouter-retry-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('retries DeepSeek provider on 500 and succeeds', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(makeErrorResponse(500, 'server error', { body: { cancel } }))
            .mockResolvedValueOnce(makeJsonResponse({ choices: [{ message: { content: 'deepseek-retry-ok' } }] }));

        const { provider } = installProvider('cpm-provider-deepseek.js', {
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        const promise = provider.fetcher({ id: 'deepseek-chat' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-d-retry');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'deepseek-retry-ok' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('does not retry OpenAI provider on 400', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(makeErrorResponse(400, 'bad request'));

        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher({ id: 'gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-o-bad');

        expect(result.success).toBe(false);
        expect(result.content).toContain('400');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('retries AWS provider on 503 and succeeds', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const risuFetchImpl = vi.fn()
            .mockResolvedValueOnce({ status: 503, headers: {}, data: 'overloaded' })
            .mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'application/json' },
                data: JSON.stringify({ content: [{ type: 'text', text: 'aws-retry-ok' }] }),
            });

        const { provider } = installProvider('cpm-provider-aws.js', {
            safeArgs: {
                cpm_aws_key: 'aws-key',
                cpm_aws_secret: 'aws-secret',
                cpm_aws_region: 'us-east-1',
            },
            risuFetchImpl,
            nativeFetchImpl: vi.fn().mockResolvedValue(makeErrorResponse(503, 'should-not-use-native', { body: { cancel } })),
        });

        const promise = provider.fetcher({ id: 'global.anthropic.claude-sonnet-4-6' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-aws-retry');
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ success: true, content: 'aws-retry-ok' });
        expect(risuFetchImpl).toHaveBeenCalledTimes(2);
    });
});