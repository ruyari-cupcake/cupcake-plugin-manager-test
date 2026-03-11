/**
 * Integration tests for fetch-custom.js — fetchCustom.
 * Tests the full request pipeline with mocked smartNativeFetch:
 *   - OpenAI / Anthropic / Google format body construction
 *   - Streaming and non-streaming paths
 *   - Copilot detection & Responses API switching
 *   - Key rotation dispatch
 *   - Error handling (HTTP errors, JSON parse failures, empty messages)
 *   - Custom params injection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock smartNativeFetch ──
const mockFetch = vi.fn();
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockFetch(...args),
}));

// ── Mock copilot-token (return empty by default) ──
vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
}));

// ── Mock shared-state safeGetBoolArg ──
const mockGetBoolArg = vi.fn().mockResolvedValue(false);
vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        safeGetBoolArg: (...args) => mockGetBoolArg(...args),
    };
});

// ── Mock api-request-log ──
vi.mock('../src/lib/api-request-log.js', () => ({
    updateApiRequest: vi.fn(),
    storeApiRequest: vi.fn(() => 'req-1'),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

import { fetchCustom } from '../src/lib/fetch-custom.js';

// ── Ensure `window` is available in Node test environment ──
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ── Helpers ──
function makeOkJsonResponse(body, status = 200) {
    return {
        ok: true,
        status,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

function makeErrorResponse(status, body = 'error') {
    return {
        ok: false,
        status,
        headers: { get: () => 'text/plain' },
        text: async () => body,
    };
}

function makeRetriableErrorResponse(status, body = 'error', headers = {}, extra = {}) {
    const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
    return {
        ok: false,
        status,
        headers: { get: (name) => normalized[String(name).toLowerCase()] || null },
        text: async () => body,
        body: extra.body,
    };
}

const BASIC_MESSAGES = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
];

describe('fetchCustom — Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetBoolArg.mockResolvedValue(false); // streaming disabled by default
    });

    // ─── OpenAI Format ───
    describe('OpenAI format', () => {
        it('sends correct body for non-streaming OpenAI request', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'Hi there!' } }],
            }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(true);
            expect(result.content).toBe('Hi there!');
            expect(mockFetch).toHaveBeenCalledOnce();

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toBe('https://api.openai.com/v1/chat/completions');
            const body = JSON.parse(opts.body);
            expect(body.model).toBe('gpt-4o');
            expect(body.temperature).toBe(0.7);
            expect(body.max_tokens).toBe(4096);
            expect(Array.isArray(body.messages)).toBe(true);
            expect(body.messages.length).toBeGreaterThanOrEqual(1);
        });

        it('uses max_completion_tokens for o-series / gpt-5 models', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'o3', format: 'openai' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 8192, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.max_completion_tokens).toBe(8192);
            expect(body.max_tokens).toBeUndefined();
        });

        it('strips sampling params for o3/o4 models', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'o3-mini', format: 'openai' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, { top_p: 0.9, frequency_penalty: 0.5 });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.temperature).toBeUndefined();
            expect(body.top_p).toBeUndefined();
            expect(body.frequency_penalty).toBeUndefined();
        });

        it('includes reasoning_effort when configured', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'o3', format: 'openai', reasoning: 'high' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.reasoning_effort).toBe('high');
        });

        it('injects customParams into body', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = {
                url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai',
                customParams: JSON.stringify({ seed: 42, logprobs: true }),
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.seed).toBe(42);
            expect(body.logprobs).toBe(true);
        });

        it('customParams cannot override messages or stream', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = {
                url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai',
                customParams: JSON.stringify({ messages: [{ role: 'user', content: 'hacked' }], stream: true }),
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            // Messages should be the original, not overridden
            expect(body.messages).not.toEqual([{ role: 'user', content: 'hacked' }]);
            expect(body.stream).toBeUndefined(); // non-streaming mode
        });
    });

    // ─── Anthropic Format ───
    describe('Anthropic format', () => {
        it('sends anthropic-style body with system prompt extracted', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'Hello from Claude!' }],
                usage: { input_tokens: 10, output_tokens: 5 },
            }));

            const config = { url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test', model: 'claude-sonnet-4-20250514', format: 'anthropic' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.8, 2048, {});

            expect(result.success).toBe(true);
            expect(result.content).toBe('Hello from Claude!');

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toBe('https://api.anthropic.com/v1/messages');
            expect(opts.headers['x-api-key']).toBe('sk-ant-test');
            expect(opts.headers['Authorization']).toBeUndefined();

            const body = JSON.parse(opts.body);
            expect(body.model).toBe('claude-sonnet-4-20250514');
            expect(body.system).toBeTruthy(); // system prompt extracted
            expect(body.messages.every(m => m.role !== 'system')).toBe(true);
        });

        it('effort=high without adaptiveThinking toggle → output_config only, no thinking block', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'effort only result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic', effort: 'high',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toBeUndefined();
            expect(body.output_config).toEqual({ effort: 'high' });
            expect(body.temperature).toBeDefined(); // NOT stripped when adaptive is off
        });

        it('adaptiveThinking=true + effort=high → adaptive thinking with effort', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'thought result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic', effort: 'high',
                adaptiveThinking: true,
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'high' });
            expect(body.temperature).toBeUndefined(); // stripped for thinking
        });

        it('configures budget thinking for Anthropic', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'budget result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic', thinkingBudget: 8192,
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
            expect(body.max_tokens).toBeGreaterThanOrEqual(8192 + 4096);
        });

        it('adaptiveThinking=true with no effort set → defaults effort to high', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'adaptive default result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-opus-4-6', format: 'anthropic',
                adaptiveThinking: true,
                // effort not set
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'high' });
            expect(body.temperature).toBeUndefined();
            expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
        });

        it('adaptiveThinking=true with effort=none → defaults effort to high', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-opus-4-6', format: 'anthropic',
                adaptiveThinking: true, effort: 'none',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'high' });
        });

        it('effort=unspecified → treated as no effort (no output_config sent)', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic',
                effort: 'unspecified',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toBeUndefined();
            expect(body.output_config).toBeUndefined();
        });

        it('adaptiveThinking=true + thinkingBudget set → adaptive wins, budget ignored', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'adaptive wins' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-opus-4-6', format: 'anthropic',
                adaptiveThinking: true, effort: 'medium', thinkingBudget: 10000,
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'medium' });
            // budget_tokens should NOT appear when adaptive is used
            expect(body.thinking.budget_tokens).toBeUndefined();
        });

        it('legacy thinking=adaptive (dropdown) works same as adaptiveThinking toggle', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'legacy adaptive' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-6', format: 'anthropic',
                thinking: 'adaptive', effort: 'low',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'low' });
            expect(body.temperature).toBeUndefined();
        });

        it('adaptiveThinking=true + effort=max → sends max effort', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'max effort result' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-opus-4-6', format: 'anthropic',
                adaptiveThinking: true, effort: 'max',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toEqual({ type: 'adaptive' });
            expect(body.output_config).toEqual({ effort: 'max' });
        });

        it('no adaptiveThinking + no effort + no budget → no thinking params at all', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'plain response' }],
            }));

            const config = {
                url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.thinking).toBeUndefined();
            expect(body.output_config).toBeUndefined();
            expect(body.temperature).toBe(0.7);
        });
    });

    describe('Google format', () => {
        it('preserves leading system prompt as systemInstruction by default', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                candidates: [{ content: { parts: [{ text: 'Hello!' }] } }],
            }));

            const config = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', key: 'g-test', model: 'gemini-2.5-flash', format: 'google' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a helpful assistant.' }] });
            expect(body.contents[0].role).toBe('user');
            expect(body.contents[0].parts[0].text).toBe('Hello!');
        });
    });

    // ─── Google Format ───
    describe('Google format', () => {
        it('sends google-style body with contents and generationConfig', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
            }));

            const config = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', key: 'goog-key', model: 'gemini-2.0-flash', format: 'google' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.9, 4096, {});

            expect(result.success).toBe(true);
            expect(result.content).toBe('Hello from Gemini!');

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(Array.isArray(body.contents)).toBe(true);
            expect(body.generationConfig).toBeDefined();
            expect(body.generationConfig.temperature).toBe(0.9);
            expect(body.generationConfig.maxOutputTokens).toBe(4096);
            // Google format removes top-level OpenAI-style keys
            expect(body.model).toBeUndefined();
            expect(body.max_tokens).toBeUndefined();
            expect(body.temperature).toBeUndefined();
        });
    });

    // ─── Copilot + Responses API ───
    describe('Copilot / Responses API', () => {
        it('auto-switches to Responses API for copilot domain + gpt-5.4', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'copilot response' }] }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_testtoken',
                model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const [url] = mockFetch.mock.calls[0];
            expect(url).toContain('/responses');

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.input).toBeDefined(); // messages → input
            expect(body.messages).toBeUndefined();
        });

        it('forces Responses API when responsesMode=on', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'forced' }] }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'gpt-4o', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'on',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const [url] = mockFetch.mock.calls[0];
            expect(url).toContain('/responses');
        });

        it('converts GPT-5.4 reasoning_effort to Responses API reasoning object and strips temperature/top_p when reasoning is enabled', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto', reasoning: 'high',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, { temperature: 0.7 });

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/responses');

            const body = JSON.parse(opts.body);
            expect(body.input).toBeDefined();
            expect(body.messages).toBeUndefined();
            expect(body.max_output_tokens).toBe(4096);
            expect(body.max_tokens).toBeUndefined();
            expect(body.max_completion_tokens).toBeUndefined();
            expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
            expect(body.reasoning_effort).toBeUndefined();
            expect(body.temperature).toBeUndefined();
            expect(body.top_p).toBeUndefined();
        });

        it('drops GPT-5.4 Responses API temperature when Risu did not explicitly send temperature', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto', reasoning: 'medium',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
            expect(body.temperature).toBeUndefined();
        });

        it('keeps GPT-5.4 Responses API temperature/top_p when reasoning is none', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto', reasoning: 'none',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, { temperature: 0.7, top_p: 0.9 });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.temperature).toBe(0.7);
            expect(body.top_p).toBe(0.9);
            expect(body.reasoning).toBeUndefined();
        });

        it('does NOT use Responses API when responsesMode=off', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'normal copilot' } }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'o3-mini', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'off',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const [url] = mockFetch.mock.calls[0];
            expect(url).not.toContain('/responses');
        });

        it('auto-switches URL for copilot + anthropic format', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                content: [{ type: 'text', text: 'copilot claude' }],
            }));

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'claude-sonnet-4-20250514', format: 'anthropic', copilotToken: 'cpt-123',
            };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            const [url] = mockFetch.mock.calls[0];
            expect(url).toBe('https://api.githubcopilot.com/v1/messages');
        });

        it('strips name field from input items for Responses API (fixes 400 invalid_request_body)', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
            }));

            // Messages with name field (e.g. from exampleMessages with example_assistant/example_user)
            const messagesWithName = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Example user message', name: 'example_user' },
                { role: 'assistant', content: 'Example assistant reply', name: 'example_assistant' },
                { role: 'user', content: 'Hello!' },
            ];

            const config = {
                url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
                model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto',
            };
            await fetchCustom(config, messagesWithName, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.input).toBeDefined();
            expect(body.messages).toBeUndefined();
            // Verify NO input item has a 'name' property
            for (const item of body.input) {
                expect(item).not.toHaveProperty('name');
            }
            // Verify content is still intact
            expect(body.input.some(m => m.content === 'Example user message')).toBe(true);
            expect(body.input.some(m => m.content === 'Example assistant reply')).toBe(true);
        });
    });

    // ─── Key Rotation ───
    describe('Key rotation', () => {
        it('rotates keys on 429 error', async () => {
            // First call → 429, second call → success
            mockFetch
                .mockResolvedValueOnce(makeErrorResponse(429, 'rate limited'))
                .mockResolvedValueOnce(makeOkJsonResponse({
                    choices: [{ message: { content: 'ok with key2' } }],
                }));

            const config = {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-key1 sk-key2', // two keys, space-separated
                model: 'gpt-4o', format: 'openai',
            };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(true);
            expect(result.content).toBe('ok with key2');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    // ─── Streaming ───
    describe('Streaming', () => {
        it('returns ReadableStream when streaming enabled + OpenAI format', async () => {
            mockGetBoolArg.mockImplementation(async (key) => {
                if (key === 'cpm_streaming_enabled') return true;
                return false;
            });

            const encoder = new TextEncoder();
            const sseData = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n';
            const mockStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData));
                    controller.close();
                },
            });

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                body: mockStream,
                headers: { get: () => 'text/event-stream' },
            });

            const config = {
                url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test',
                model: 'gpt-4o', format: 'openai', streaming: true,
            };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(true);
            expect(result.content).toBeInstanceOf(ReadableStream);

            // Verify stream=true was sent in body
            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.stream).toBe(true);
        });

        it('falls back to non-streaming OpenAI when streaming body is unavailable', async () => {
            mockGetBoolArg.mockImplementation(async (key) => {
                if (key === 'cpm_streaming_enabled') return true;
                return false;
            });

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    body: null,
                    headers: { get: () => 'text/event-stream' },
                })
                .mockResolvedValueOnce(makeOkJsonResponse({
                    choices: [{ message: { content: 'fallback-openai-ok' } }],
                }));

            const config = {
                url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test',
                model: 'gpt-4o', format: 'openai', streaming: true,
            };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result).toEqual({ success: true, content: 'fallback-openai-ok' });
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(JSON.parse(mockFetch.mock.calls[0][1].body).stream).toBe(true);
            expect(JSON.parse(mockFetch.mock.calls[1][1].body).stream).toBe(false);
        });

        it('falls back to non-streaming Google when streaming body is unavailable', async () => {
            mockGetBoolArg.mockImplementation(async (key) => {
                if (key === 'cpm_streaming_enabled') return true;
                return false;
            });

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    body: null,
                    headers: { get: () => 'text/event-stream' },
                })
                .mockResolvedValueOnce(makeOkJsonResponse({
                    candidates: [{ content: { parts: [{ text: 'fallback-google-ok' }] } }],
                }));

            const config = {
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                key: 'goog-key',
                model: 'gemini-2.0-flash',
                format: 'google',
                streaming: true,
            };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result).toEqual({ success: true, content: 'fallback-google-ok' });
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[0][0]).toContain(':streamGenerateContent');
            expect(mockFetch.mock.calls[1][0]).toContain(':generateContent');
        });
    });

    describe('Retry policy', () => {
        it('retries retriable OpenAI errors and respects Retry-After header', async () => {
            vi.useFakeTimers();
            const cancel = vi.fn();
            const timerSpy = vi.spyOn(globalThis, 'setTimeout');

            mockFetch
                .mockResolvedValueOnce(makeRetriableErrorResponse(429, 'rate limit', { 'retry-after': '2' }, { body: { cancel } }))
                .mockResolvedValueOnce(makeOkJsonResponse({
                    choices: [{ message: { content: 'retry-success' } }],
                }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            const promise = fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});
            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result).toEqual({ success: true, content: 'retry-success' });
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(cancel).toHaveBeenCalledOnce();
            expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
        });

        it('does not retry non-retriable OpenAI 400 responses', async () => {
            mockFetch.mockResolvedValue(makeRetriableErrorResponse(400, 'bad request'));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(false);
            expect(result.content).toContain('400');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Error handling ───
    describe('Error handling', () => {
        it('returns error for empty URL', async () => {
            const config = { url: '', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(false);
            expect(result.content).toContain('Base URL is required');
        });

        it('returns error for HTTP error response', async () => {
            mockFetch.mockResolvedValue(makeErrorResponse(401, 'Unauthorized'));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'bad-key', model: 'gpt-4o', format: 'openai' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(false);
            expect(result.content).toContain('401');
            expect(result.content).toContain('Unauthorized');
        });

        it('returns error for non-JSON response', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => 'text/html' },
                text: async () => '<html>Not JSON</html>',
            });

            const config = { url: 'https://api.example.com/v1/chat', key: 'sk-test', model: 'test', format: 'openai' };
            const result = await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

            expect(result.success).toBe(false);
            expect(result.content).toContain('not JSON');
        });

        it('returns error when all messages become empty after sanitization', async () => {
            const emptyMessages = [
                { role: 'user', content: '' },
                { role: 'assistant', content: null },
            ];

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            const result = await fetchCustom(config, emptyMessages, 0.7, 4096, {});

            expect(result.success).toBe(false);
            expect(result.content).toContain('non-empty');
        });
    });

    // ─── Optional params ───
    describe('Optional args pass-through', () => {
        it('passes top_p, frequency_penalty, presence_penalty in OpenAI body', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {
                top_p: 0.9, frequency_penalty: 0.5, presence_penalty: 0.3,
            });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.top_p).toBe(0.9);
            expect(body.frequency_penalty).toBe(0.5);
            expect(body.presence_penalty).toBe(0.3);
        });

        it('passes top_p and top_k in Google generationConfig', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                candidates: [{ content: { parts: [{ text: 'ok' }] } }],
            }));

            const config = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', key: 'goog-key', model: 'gemini-2.0-flash', format: 'google' };
            await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, { top_p: 0.8, top_k: 40 });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.generationConfig.topP).toBe(0.8);
            expect(body.generationConfig.topK).toBe(40);
        });
    });

    // ─── Role normalization ───
    describe('Role normalization', () => {
        it('normalizes invalid OpenAI roles (model → assistant)', async () => {
            mockFetch.mockResolvedValue(makeOkJsonResponse({
                choices: [{ message: { content: 'ok' } }],
            }));

            const messages = [
                { role: 'user', content: 'hi' },
                { role: 'model', content: 'hello' }, // invalid for OpenAI
            ];

            const config = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
            await fetchCustom(config, messages, 0.7, 4096, {});

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            const modelMsg = body.messages.find(m => m.role === 'model');
            expect(modelMsg).toBeUndefined(); // should have been normalized to assistant
        });
    });
});
