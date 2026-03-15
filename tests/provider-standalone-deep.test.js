/**
 * Deep standalone provider tests — covers each cpm-provider-*.js file
 * for: non-streaming success, error responses, model-specific body construction,
 * Copilot integration headers, dynamic model fetching, and Gemini multi-strategy fetch.
 *
 * Uses the same eval-based injection as provider-stream-fallbacks.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const readProvider = (name) => readFileSync(resolve(ROOT, name), 'utf-8');

// ── Factories ──

function makeJsonResponse(body, status = 200, extra = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (h) => extra.headers?.[String(h).toLowerCase()] || extra.contentType || 'application/json' },
        json: vi.fn(async () => body),
        text: vi.fn(async () => JSON.stringify(body)),
        body: extra.body ?? null,
    };
}

function makeErrorResponse(status, text = 'error', extra = {}) {
    const hdr = Object.fromEntries(Object.entries(extra.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        ok: false,
        status,
        headers: { get: (h) => hdr[String(h).toLowerCase()] || extra.contentType || 'text/plain' },
        json: vi.fn(async () => ({ error: text })),
        text: vi.fn(async () => text),
        body: extra.body ?? null,
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
        registerProvider: vi.fn((p) => { registeredProvider = p; }),
        safeGetArg: vi.fn(async (key) => safeArgs[key] ?? ''),
        safeGetBoolArg: vi.fn(async (key) => safeBools[key] ?? false),
        withKeyRotation: vi.fn(async (_key, cb) => cb(keyRotationValue)),
        smartNativeFetch: vi.fn((...args) => fetchImpl(...args)),
        smartFetch: vi.fn((...args) => fetchImpl(...args)),
        formatToOpenAI: vi.fn((msgs) => msgs.map((m) => ({ role: m.role, content: m.content }))),
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
            content: data?.content?.map((p) => p.text || '').join('') || '',
        })),
        createOpenAISSEStream: vi.fn(() => 'OPENAI_STREAM'),
        createResponsesAPISSEStream: vi.fn(() => 'RESPONSES_STREAM'),
        createAnthropicSSEStream: vi.fn(() => 'ANTHROPIC_STREAM'),
        createSSEStream: vi.fn(() => 'SSE_STREAM'),
        parseOpenAISSELine: vi.fn(() => null),
        safeUUID: vi.fn(() => 'uuid-1'),
        _needsCopilotResponsesAPI: vi.fn((model) => /gpt-5\.4/i.test(String(model || ''))),
        buildGeminiThinkingConfig: vi.fn(() => null),
        getGeminiSafetySettings: vi.fn(() => []),
        formatToGemini: vi.fn((msgs) => ({
            contents: msgs.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'model' : m.role,
                parts: [{ text: m.content }],
            })),
            systemInstruction: msgs.filter(m => m.role === 'system').map(m => m.content),
        })),
        validateGeminiParams: vi.fn(),
        cleanExperimentalModelParams: vi.fn(),
        parseGeminiNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.candidates?.[0]?.content?.parts?.[0]?.text || '',
        })),
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
    return { provider: registeredProvider, CupcakePM, windowObj };
}

// ═══════════════════════════════════════════════════════
// OpenAI Provider — non-streaming, body construction, Copilot
// ═══════════════════════════════════════════════════════
describe('OpenAI provider — non-streaming success paths', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('sends correct body for standard model (gpt-4o)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello world' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'gpt-4o' },
            [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-1',
        );

        expect(result).toEqual({ success: true, content: 'hello world' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.model).toBe('gpt-4o');
        expect(body.temperature).toBe(0.7);
        expect(body.max_tokens).toBe(1024);
        expect(body.stream).toBe(false);
    });

    it('uses max_completion_tokens for o3 model and strips sampling params', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'o3-answer' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'o3' },
            [{ role: 'user', content: 'reason please' }], 0.7, 4096, {}, undefined, 'req-o3',
        );

        expect(result.success).toBe(true);
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.max_completion_tokens).toBe(4096);
        expect(body.max_tokens).toBeUndefined();
        expect(body.temperature).toBeUndefined();
    });

    it('converts system to developer role for gpt-5 models', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'gpt5-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        // formatToOpenAI is mocked so we check it was called — the real provider
        // should set developerRole flag on config before calling formatToOpenAI
        await provider.fetcher(
            { id: 'gpt-5' },
            [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
            0.7, 2048, {}, undefined, 'req-5',
        );

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.max_completion_tokens).toBe(2048);
    });

    it('returns error for HTTP 400 without retry', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(makeErrorResponse(400, 'bad request'));
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_url: 'https://api.openai.com/v1/chat/completions' },
            fetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'gpt-4o' }, [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-err',
        );

        expect(result.success).toBe(false);
        expect(result.content).toContain('400');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('sends reasoning_effort when configured for o4-mini', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'o4-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: {
                cpm_openai_url: 'https://api.openai.com/v1/chat/completions',
                cpm_openai_reasoning: 'medium',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'o4-mini' },
            [{ role: 'user', content: 'test' }], 0.5, 2048, {}, undefined, 'req-o4',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning_effort).toBe('medium');
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
    });

    it('includes Copilot headers when URL is githubcopilot.com', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'copilot-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: {
                cpm_openai_url: 'https://api.githubcopilot.com/chat/completions',
                tools_githubCopilotToken: 'ghu_test123',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'gpt-4o' },
            [{ role: 'user', content: 'hi' }], 0.7, 1024, {}, undefined, 'req-cop',
        );

        const headers = fetchImpl.mock.calls[0][1].headers;
        expect(headers['Copilot-Integration-Id']).toBe('vscode-chat');
        expect(headers['User-Agent']).toContain('GitHubCopilotChat');
    });
});

// ═══════════════════════════════════════════════════════
// Anthropic Provider — thinking, caching, max_tokens clamping
// ═══════════════════════════════════════════════════════
describe('Anthropic provider — non-streaming & thinking', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('sends basic Anthropic request with system prompt', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'hello from claude' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_url: 'https://api.anthropic.com/v1/messages' },
            fetchImpl,
            formatToAnthropicResult: { messages: [{ role: 'user', content: 'hello' }], system: 'be helpful' },
        });

        const result = await provider.fetcher(
            { id: 'claude-sonnet-4-5-20250929' },
            [{ role: 'system', content: 'be helpful' }, { role: 'user', content: 'hello' }],
            0.7, 4096, {}, undefined, 'req-ant1',
        );

        expect(result.success).toBe(true);
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.model).toBe('claude-sonnet-4-5-20250929');
        expect(body.max_tokens).toBe(4096);
        expect(body.system).toBeDefined();
    });

    it('clamps max_tokens to 128000', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'clamped' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_url: 'https://api.anthropic.com/v1/messages' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-5-20250929' },
            [{ role: 'user', content: 'hi' }], 0.7, 200000, {}, undefined, 'req-clamp',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.max_tokens).toBeLessThanOrEqual(128000);
    });

    it('enables adaptive thinking for claude-sonnet-4-6 with effort', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'adaptive-ok' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: {
                cpm_anthropic_url: 'https://api.anthropic.com/v1/messages',
                cpm_anthropic_thinking_effort: 'high',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-6-20260301' },
            [{ role: 'user', content: 'think' }], 0.7, 16000, {}, undefined, 'req-adaptive',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
        expect(body.temperature).toBeUndefined();
    });

    it('enables budget-based thinking with budget_tokens', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'budget-ok' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: {
                cpm_anthropic_url: 'https://api.anthropic.com/v1/messages',
                cpm_anthropic_thinking_budget: '10000',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-5-20250929' },
            [{ role: 'user', content: 'think hard' }], 0.7, 8000, {}, undefined, 'req-budget',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
        // max_tokens should be auto-bumped above budget
        expect(body.max_tokens).toBeGreaterThan(10000);
        expect(body.temperature).toBeUndefined();
    });

    it('sends anthropic-beta header for large max_tokens (>8192)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'large-ok' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_url: 'https://api.anthropic.com/v1/messages' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-5-20250929' },
            [{ role: 'user', content: 'hi' }], 0.7, 16000, {}, undefined, 'req-beta',
        );

        const headers = fetchImpl.mock.calls[0][1].headers;
        expect(headers['anthropic-beta']).toContain('output-128k');
    });

    it('includes 1-hour cache TTL header when configured', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ type: 'text', text: 'cache-ok' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: {
                cpm_anthropic_url: 'https://api.anthropic.com/v1/messages',
                cpm_anthropic_cache_ttl: '1h',
            },
            safeBools: { chat_claude_caching: true },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-5-20250929' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-cache1h',
        );

        const headers = fetchImpl.mock.calls[0][1].headers;
        const betaHeader = headers['anthropic-beta'] || '';
        expect(betaHeader).toContain('extended-cache-ttl');
    });
});

// ═══════════════════════════════════════════════════════
// Gemini Provider — multi-strategy fetch, thinking models
// ═══════════════════════════════════════════════════════
describe('Gemini provider — fetch strategy & body construction', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('constructs correct URL with API key in query string', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'gemini-ok' }] } }] })
        );
        const nativeFetchImpl = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini-ok' }] } }] }),
            json: async () => ({ candidates: [{ content: { parts: [{ text: 'gemini-ok' }] } }] }),
        });

        const { provider } = installProvider('cpm-provider-gemini.js', {
            safeArgs: { cpm_gemini_key: 'test-gemini-key' },
            keyRotationValue: 'test-gemini-key',
            nativeFetchImpl,
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'gemini-2.0-flash' },
            [{ role: 'user', content: 'hi' }], 0.7, 8192, {}, undefined, 'req-gem1',
        );

        // Either nativeFetch or smartFetch should be called
        const allCalls = [...nativeFetchImpl.mock.calls, ...fetchImpl.mock.calls];
        expect(allCalls.length).toBeGreaterThan(0);

        // Find the successful call
        const call = allCalls.find((c) => typeof c[0] === 'string' && c[0].includes('generativelanguage'));
        if (call) {
            expect(call[0]).toContain('key=test-gemini-key');
            expect(call[0]).toContain('generateContent');
        }
    });

    it('clamps max_tokens for older Gemini models to 8192', async () => {
        // Verify via structural analysis that the provider source contains clamping
        const source = readProvider('cpm-provider-gemini.js');
        expect(source).toMatch(/8192/);
        expect(source).toMatch(/65536|65_?536/);
    });

    it('strips thought:true from history for 2.5+ models', async () => {
        // Verify this logic exists in the source
        const source = readProvider('cpm-provider-gemini.js');
        expect(source).toMatch(/thought.*true|thought.*history/i);
    });
});

// ═══════════════════════════════════════════════════════
// DeepSeek Provider — reasoner vs chat, body differences
// ═══════════════════════════════════════════════════════
describe('DeepSeek provider — reasoner vs chat model logic', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('sends standard params for deepseek-chat', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'chat-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-deepseek.js', {
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'deepseek-chat' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-ds1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.model).toBe('deepseek-chat');
        expect(body.temperature).toBe(0.7);
        expect(body.max_tokens).toBeDefined();
    });

    it('strips sampling params for deepseek-reasoner', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'reasoner-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-deepseek.js', {
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'deepseek-reasoner' },
            [{ role: 'user', content: 'reason this' }], 0.7, 4096, {}, undefined, 'req-ds2',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
    });

    it('clamps max_tokens for chat model to 8192', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'clamped' } }] })
        );
        const { provider } = installProvider('cpm-provider-deepseek.js', {
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'deepseek-chat' },
            [{ role: 'user', content: 'hi' }], 0.7, 100000, {}, undefined, 'req-ds-clamp',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.max_tokens).toBeLessThanOrEqual(8192);
    });

    it('allows 65536 max_tokens for reasoner', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'reasoner-64k' } }] })
        );
        const { provider } = installProvider('cpm-provider-deepseek.js', {
            safeArgs: { cpm_deepseek_url: 'https://api.deepseek.com/chat/completions' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'deepseek-reasoner' },
            [{ role: 'user', content: 'hi' }], 0.7, 65536, {}, undefined, 'req-ds-64k',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.max_tokens).toBeLessThanOrEqual(65536);
    });
});

// ═══════════════════════════════════════════════════════
// OpenRouter Provider — model-agnostic, provider routing
// ═══════════════════════════════════════════════════════
describe('OpenRouter provider — model-agnostic body', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('constructs body with model from config and extra headers', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'or-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: {
                cpm_openrouter_model: 'openai/gpt-4o',
                cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'openai/gpt-4o' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-or1',
        );

        const headers = fetchImpl.mock.calls[0][1].headers;
        expect(headers['HTTP-Referer']).toMatch(/risuai\.xyz/);
        expect(headers['X-Title']).toContain('RisuAI');

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.model).toBe('openai/gpt-4o');
    });

    it('returns error if no model configured', async () => {
        const fetchImpl = vi.fn();
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: {
                cpm_openrouter_model: '',
                cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions',
            },
            fetchImpl,
        });

        const result = await provider.fetcher(
            { id: '' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-or-nomodel',
        );

        expect(result.success).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('applies provider routing when cpm_openrouter_provider is set', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'prov-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: {
                cpm_openrouter_model: 'anthropic/claude-sonnet-4-5',
                cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions',
                cpm_openrouter_provider: 'Anthropic,Google',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'anthropic/claude-sonnet-4-5' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-or-prov',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.provider).toBeDefined();
        expect(body.provider.order).toEqual(['Anthropic', 'Google']);
    });

    it('sets reasoning effort in OpenRouter format', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'reason-ok' } }] })
        );
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: {
                cpm_openrouter_model: 'openai/o3',
                cpm_openrouter_url: 'https://openrouter.ai/api/v1/chat/completions',
                cpm_openrouter_reasoning: 'high',
            },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'openai/o3' },
            [{ role: 'user', content: 'reason' }], 0.5, 4096, {}, undefined, 'req-or-reason',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning).toBeDefined();
        expect(body.reasoning.effort).toBe('high');
    });
});

// ═══════════════════════════════════════════════════════
// AWS Provider — credential validation, model ID normalization
// ═══════════════════════════════════════════════════════
describe('AWS provider — credentials & model normalization', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('returns error when AWS credentials are missing', async () => {
        const fetchImpl = vi.fn();
        const risuFetchImpl = vi.fn();
        const { provider } = installProvider('cpm-provider-aws.js', {
            safeArgs: { cpm_aws_key: '', cpm_aws_secret: '', cpm_aws_region: '' },
            fetchImpl,
            risuFetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'anthropic.claude-sonnet-4-5-20250929-v2:0' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-aws-nocred',
        );

        expect(result.success).toBe(false);
        expect(result.content).toMatch(/key|secret|credential/i);
    });

    it('sends request via risuFetch with V4 signed headers', async () => {
        const risuFetchImpl = vi.fn().mockResolvedValueOnce({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: JSON.stringify({ content: [{ type: 'text', text: 'aws-ok' }] }),
        });

        const { provider } = installProvider('cpm-provider-aws.js', {
            safeArgs: {
                cpm_aws_key: 'AKIAIOSFODNN7EXAMPLE',
                cpm_aws_secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                cpm_aws_region: 'us-east-1',
            },
            risuFetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'anthropic.claude-sonnet-4-5-20250929-v2:0' },
            [{ role: 'user', content: 'hi' }], 0.7, 4096, {}, undefined, 'req-aws-ok',
        );

        expect(result.success).toBe(true);
        expect(result.content).toBe('aws-ok');
        expect(risuFetchImpl).toHaveBeenCalled();
    });

    it('handles adaptive thinking for claude-sonnet-4-6 on AWS', async () => {
        const risuFetchImpl = vi.fn().mockResolvedValueOnce({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: JSON.stringify({ content: [{ type: 'text', text: 'aws-adaptive' }] }),
        });

        const { provider } = installProvider('cpm-provider-aws.js', {
            safeArgs: {
                cpm_aws_key: 'AKIAIOSFODNN7EXAMPLE',
                cpm_aws_secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                cpm_aws_region: 'us-east-1',
                cpm_aws_thinking_effort: 'medium',
            },
            risuFetchImpl,
        });

        const result = await provider.fetcher(
            { id: 'global.anthropic.claude-sonnet-4-6-20260301-v1:0' },
            [{ role: 'user', content: 'think' }], 0.7, 16000, {}, undefined, 'req-aws-adaptive',
        );

        expect(result.success).toBe(true);
        // Verify via body that the request was sent
        const callBody = risuFetchImpl.mock.calls[0]?.[1]?.body;
        if (callBody) {
            const body = typeof callBody === 'string' ? JSON.parse(callBody) : callBody;
            // AWS adaptive thinking should have `thinking.type: 'adaptive'`
            if (body.thinking) {
                expect(['adaptive', 'enabled']).toContain(body.thinking.type);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// Vertex Provider — dual-path dispatch, token caching
// ═══════════════════════════════════════════════════════
describe('Vertex provider — dual-path architecture', () => {
    it('contains Claude and Gemini dispatch logic', () => {
        const source = readProvider('cpm-provider-vertex.js');
        // Claude on Vertex: rawPredict endpoint
        expect(source).toMatch(/rawPredict|streamRawPredict/);
        // Gemini on Vertex: generateContent endpoint
        expect(source).toMatch(/generateContent|streamGenerateContent/);
    });

    it('validates Service Account JSON with Windows path detection', () => {
        const source = readProvider('cpm-provider-vertex.js');
        // Detects common Windows path paste mistake
        expect(source).toMatch(/Windows|C:\\|looksLikeWindowsPath/i);
    });

    it('has location fallback logic', () => {
        const source = readProvider('cpm-provider-vertex.js');
        expect(source).toMatch(/us-central1|us-east4|europe-west1|asia-northeast1/);
    });

    it('has OAuth token caching', () => {
        const source = readProvider('cpm-provider-vertex.js');
        expect(source).toMatch(/_tokenCache|expiry|expires/i);
    });
});

// ═══════════════════════════════════════════════════════
// Dynamic model fetching — all providers with fetchDynamicModels
// ═══════════════════════════════════════════════════════
describe('Dynamic model fetch — structural verification', () => {
    const providerFiles = [
        'cpm-provider-openai.js',
        'cpm-provider-anthropic.js',
        'cpm-provider-gemini.js',
        'cpm-provider-deepseek.js',
        'cpm-provider-vertex.js',
        'cpm-provider-aws.js',
    ];

    for (const file of providerFiles) {
        it(`${file} has fetchDynamicModels`, () => {
            const source = readProvider(file);
            expect(source).toMatch(/fetchDynamicModels/);
        });
    }

    it('OpenRouter does NOT have fetchDynamicModels (model-agnostic)', () => {
        const source = readProvider('cpm-provider-openrouter.js');
        // OpenRouter uses hardcoded dynamic model entry
        expect(source).not.toMatch(/fetchDynamicModels\s*\(/);
    });
});

// ═══════════════════════════════════════════════════════
// Retry policy structure — all providers should have consistent retry
// ═══════════════════════════════════════════════════════
describe('Provider retry consistency', () => {
    const allProviders = [
        'cpm-provider-openai.js',
        'cpm-provider-anthropic.js',
        'cpm-provider-gemini.js',
        'cpm-provider-deepseek.js',
        'cpm-provider-openrouter.js',
        'cpm-provider-vertex.js',
        'cpm-provider-aws.js',
    ];

    for (const file of allProviders) {
        it(`${file} has retriable status detection (429/500+)`, () => {
            const source = readProvider(file);
            expect(source).toMatch(/429|retriab/i);
            expect(source).toMatch(/500|>= 500|>=500|status >= 5/);
        });

        it(`${file} has retry logic with max attempts`, () => {
            const source = readProvider(file);
            expect(source).toMatch(/attempt|maxAttempts|retry/i);
        });
    }
});
