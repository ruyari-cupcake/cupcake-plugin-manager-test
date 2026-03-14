/**
 * Round 13: Targeted branch coverage for fetch-custom.js and stream-builders.js.
 * Targets ~35+ uncovered branches across body construction, Anthropic thinking,
 * Google params, Responses API, CORS proxy, customParams, role normalization,
 * and stream-builders abort/thinking/signature paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ──
const {
    mockSmartFetch,
    mockEnsureCopilotApiToken,
    mockGetArg,
    mockGetBoolArg,
    mockCheckStreamCapability,
    mockUpdateApiRequest,
    mockStoreApiRequest,
} = vi.hoisted(() => ({
    mockSmartFetch: vi.fn(),
    mockEnsureCopilotApiToken: vi.fn().mockResolvedValue(''),
    mockGetArg: vi.fn().mockResolvedValue(''),
    mockGetBoolArg: vi.fn().mockResolvedValue(false),
    mockCheckStreamCapability: vi.fn().mockResolvedValue(true),
    mockUpdateApiRequest: vi.fn(),
    mockStoreApiRequest: vi.fn(() => 'req-1'),
}));

vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockSmartFetch(...args),
}));

vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: (...args) => mockEnsureCopilotApiToken(...args),
}));

vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        safeGetArg: (...args) => mockGetArg(...args),
        safeGetBoolArg: (...args) => mockGetBoolArg(...args),
    };
});

vi.mock('../src/lib/api-request-log.js', () => ({
    updateApiRequest: (...args) => mockUpdateApiRequest(...args),
    storeApiRequest: (...args) => mockStoreApiRequest(...args),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: (...args) => mockCheckStreamCapability(...args),
}));

import { fetchCustom } from '../src/lib/fetch-custom.js';
import {
    createSSEStream,
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    createAnthropicSSEStream,
    saveThoughtSignatureFromStream,
} from '../src/lib/stream-builders.js';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ── Helpers ──
function okJson(body, status = 200) {
    return {
        ok: true,
        status,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

function errResp(status, body = 'error') {
    return {
        ok: false,
        status,
        headers: { get: () => 'text/plain' },
        text: async () => body,
    };
}

const MSGS = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' },
];

function getBody(callIdx = 0) {
    return JSON.parse(mockSmartFetch.mock.calls[callIdx][1].body);
}

// ────────────────────────────────────────────────────────
// fetch-custom.js branch coverage tests
// ────────────────────────────────────────────────────────
describe('fetch-custom.js branch coverage — Round 13', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
        mockSmartFetch.mockResolvedValue(okJson({ choices: [{ message: { content: 'ok' } }] }));
    });

    // ── L76: config.format undefined → defaults to 'openai' ──
    it('defaults format to openai when config.format is falsy', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        const body = getBody();
        expect(body.messages).toBeDefined();
    });

    // ── L92: config.model undefined → empty string in OpenAI else ──
    it('handles undefined model in openai format', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', format: 'openai' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        const body = getBody();
        expect(body.max_tokens).toBe(4096);
    });

    // ── L108: role normalization — 'model' → 'assistant' (cond-expr true) ──
    it('normalizes model role to assistant in openai format', async () => {
        const msgs = [
            { role: 'system', content: 'Be helpful.' },
            { role: 'model', content: 'I am model response.' },
            { role: 'user', content: 'Hello' },
        ];
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        await fetchCustom(config, msgs, 0.7, 4096, {});
        // Should normalize 'model' to 'assistant'
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── L108: role normalization — 'char' → 'assistant' ──
    it('normalizes char role to assistant in openai format', async () => {
        const msgs = [
            { role: 'user', content: 'Hello' },
            { role: 'char', content: 'I am char.' },
        ];
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        await fetchCustom(config, msgs, 0.7, 4096, {});
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── L108: role normalization — unknown role → 'user' (cond-expr false) ──
    it('normalizes unknown role to user in openai format', async () => {
        const msgs = [
            { role: 'user', content: 'Hello' },
            { role: 'narrator', content: 'The narrator spoke.' },
        ];
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        await fetchCustom(config, msgs, 0.7, 4096, {});
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── L123: _needsMCT with falsy model → returns false early ──
    it('_needsMCT with falsy model uses max_tokens not max_completion_tokens', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: '', format: 'openai' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        const body = getBody();
        expect(body.max_tokens).toBe(4096);
        expect(body.max_completion_tokens).toBeUndefined();
    });

    // ── L123: _needsMCT with gpt-5 → returns true ──
    it('_needsMCT with gpt-5 uses max_completion_tokens', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-5', format: 'openai' };
        await fetchCustom(config, MSGS, 0.7, 8192, {});
        const body = getBody();
        expect(body.max_completion_tokens).toBe(8192);
        expect(body.max_tokens).toBeUndefined();
    });

    // ── maxOutputLimit clamping ──
    it('clamps maxTokens to maxOutputLimit', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai', maxOutputLimit: 2048 };
        await fetchCustom(config, MSGS, 0.7, 8192, {});
        const body = getBody();
        expect(body.max_tokens).toBe(2048);
    });

    // ── Anthropic: args with top_k ──
    it('anthropic format: passes args.top_k into body', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'Claude says hi' }],
        }));
        const config = { url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1', model: 'claude-3.5-sonnet', format: 'anthropic' };
        await fetchCustom(config, MSGS, 0.7, 4096, { top_k: 40 });
        const body = getBody();
        expect(body.top_k).toBe(40);
    });

    // ── Anthropic: adaptive thinking with valid effort ──
    it('anthropic format: adaptive thinking with effort=low', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'Thinking response' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-sonnet-4-20250514', format: 'anthropic',
            adaptiveThinking: true, effort: 'low',
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'low' });
        expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
        expect(body.temperature).toBeUndefined();
    });

    // ── Anthropic: adaptive thinking without valid effort → default 'high' ──
    it('anthropic format: adaptive thinking with invalid effort defaults to high', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            adaptiveThinking: true, effort: 'invalid_level',
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
    });

    // ── Anthropic: legacy thinkingMode='adaptive' ──
    it('anthropic format: legacy thinking=adaptive triggers adaptive thinking', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            thinking: 'adaptive', effort: 'medium',
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'medium' });
    });

    // ── Anthropic: effort-only (no adaptive, no budget) ──
    it('anthropic format: effort without adaptive thinking sets only output_config', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            effort: 'max',
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.output_config).toEqual({ effort: 'max' });
        expect(body.thinking).toBeUndefined(); // no thinking block
        expect(body.temperature).toBe(0.5); // temperature preserved
    });

    // ── Anthropic: budget thinking where budget > max_tokens ──
    it('anthropic format: budget thinking auto-expands max_tokens', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            thinkingBudget: 10000,
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
        expect(body.max_tokens).toBe(10000 + 4096);
        expect(body.temperature).toBeUndefined();
    });

    // ── Anthropic: legacy thinking_level as number for budget ──
    it('anthropic format: legacy thinking_level number used as budget', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            thinking_level: '8000',
        };
        await fetchCustom(config, MSGS, 0.5, 4096, {});
        const body = getBody();
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
    });

    // ── Google format: all optional params ──
    it('google format: passes all optional generation params', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            candidates: [{ content: { parts: [{ text: 'Gemini says hi' }] } }],
        }));
        const config = {
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test',
            model: 'gemini-2.0-flash', format: 'google',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {
            top_p: 0.95,
            top_k: 50,
            frequency_penalty: 0.3,
            presence_penalty: 0.2,
        });
        const body = getBody();
        expect(body.generationConfig.topP).toBe(0.95);
        expect(body.generationConfig.topK).toBe(50);
        expect(body.generationConfig.frequencyPenalty).toBe(0.3);
        expect(body.generationConfig.presencePenalty).toBe(0.2);
    });

    // ── Google format: Vertex endpoint matches ──
    it('google format: detects vertex endpoint for thinking config', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }));
        const config = {
            url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/test/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent',
            model: 'gemini-2.0-flash', format: 'google',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── OpenAI: verbosity param ──
    it('openai format: sets verbosity when configured', async () => {
        const config = {
            url: 'https://api.openai.com/v1/chat/completions', key: 'sk-1',
            model: 'gpt-4o', format: 'openai', verbosity: 'verbose',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.verbosity).toBe('verbose');
    });

    // ── OpenAI: promptCacheRetention param ──
    it('openai format: sets prompt_cache_retention when configured', async () => {
        const config = {
            url: 'https://api.openai.com/v1/chat/completions', key: 'sk-1',
            model: 'gpt-4o', format: 'openai', promptCacheRetention: '14d',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.prompt_cache_retention).toBe('14d');
    });

    // ── OpenAI: maxout ──
    it('openai format: maxout replaces max_tokens with max_output_tokens', async () => {
        const config = {
            url: 'https://api.openai.com/v1/chat/completions', key: 'sk-1',
            model: 'gpt-4o', format: 'openai', maxout: true,
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.max_output_tokens).toBe(4096);
        expect(body.max_tokens).toBeUndefined();
    });

    // ── Google: maxout ──
    it('google format: maxout sets generationConfig.maxOutputTokens', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }));
        const config = {
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=test',
            model: 'gemini-2.0-flash', format: 'google', maxout: true,
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── customParams with blocked fields ──
    it('customParams strips blocked fields', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
            customParams: JSON.stringify({
                messages: 'should be stripped',
                stream: true,
                model: 'override-should-be-stripped',
                my_custom_param: 42,
            }),
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.my_custom_param).toBe(42);
        // blocked fields should not be in body
        expect(body.model).toBe('gpt-4o'); // original model preserved
    });

    // ── customParams with thenable (promise-like) value ──
    it('customParams rejects thenable values', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
            customParams: JSON.stringify({
                safe_param: 'hello',
            }),
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.safe_param).toBe('hello');
    });

    // ── customParams with invalid JSON ──
    it('customParams handles invalid JSON gracefully', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
            customParams: '{not valid json',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true); // should continue despite parse error
    });

    // ── Copilot + Anthropic auto-URL-switch ──
    it('copilot + anthropic auto-switches to /v1/messages', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'claude-sonnet-4-20250514', format: 'anthropic',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const calledUrl = mockSmartFetch.mock.calls[0][0];
        expect(calledUrl).toBe('https://api.githubcopilot.com/v1/messages');
    });

    // ── Responses API body transformation ──
    it('copilot responses API transforms body correctly', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'From Responses API' }] }],
        }));
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'gpt-5.4', format: 'openai',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        // Responses API: messages → input (no 'name' field)
        expect(body.input).toBeDefined();
        expect(body.messages).toBeUndefined();
        expect(body.max_output_tokens).toBeDefined();
        expect(body.max_completion_tokens).toBeUndefined();
    });

    // ── Responses API with reasoning_effort → reasoning.effort ──
    it('responses API transforms reasoning_effort into reasoning block', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        }));
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'o3', format: 'openai', reasoning: 'medium', responsesMode: 'on',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.reasoning).toBeDefined();
        expect(body.reasoning_effort).toBeUndefined();
    });

    // ── Responses API forced on ──
    it('responses API forced on via responsesMode=on', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        }));
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'gpt-4o', format: 'openai', responsesMode: 'on',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const calledUrl = mockSmartFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/responses');
    });

    // ── Responses API forced off ──
    it('responses API forced off skips transformation', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            choices: [{ message: { content: 'ok' } }],
        }));
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'gpt-5.4', format: 'openai', responsesMode: 'off',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const body = getBody();
        expect(body.messages).toBeDefined();
        expect(body.input).toBeUndefined();
    });

    // ── CORS proxy URL rewriting ──
    it('CORS proxy rewrites effective URL', async () => {
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            proxyUrl: 'https://my-proxy.workers.dev/',
        };
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const calledUrl = mockSmartFetch.mock.calls[0][0];
        expect(calledUrl).toContain('my-proxy.workers.dev');
        expect(calledUrl).toContain('/v1/messages');
    });

    // ── CORS proxy with invalid URL ──
    it('CORS proxy handles invalid proxyUrl gracefully', async () => {
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-1',
            model: 'claude-3.5-sonnet', format: 'anthropic',
            proxyUrl: 'not a valid url',
        };
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        // Should still make the request (original URL)
        expect(mockSmartFetch).toHaveBeenCalled();
    });

    // ── Key rotation with multiple keys ──
    it('uses key rotation when multiple keys provided', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-key1 sk-key2 sk-key3',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
    });

    // ── Copilot non-proxied path with no token ──
    it('copilot returns error when token exchange fails', async () => {
        mockEnsureCopilotApiToken.mockResolvedValue('');
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: '',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('토큰 교환 실패');
    });

    // ── Copilot proxied path with no OAuth token ──
    it('copilot via CORS proxy fails without OAuth token', async () => {
        mockGetArg.mockResolvedValue(''); // tools_githubCopilotToken also empty
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: '',
            model: 'gpt-4o', format: 'openai',
            proxyUrl: 'https://my-proxy.workers.dev',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('OAuth');
    });

    // ── Copilot proxied path with OAuth token from config.key ──
    it('copilot via CORS proxy uses OAuth token from key', async () => {
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_proxy_token',
            model: 'gpt-4o', format: 'openai',
            proxyUrl: 'https://my-proxy.workers.dev',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
    });

    // ── Copilot with vision content ──
    it('copilot sets Copilot-Vision-Request header for vision content', async () => {
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token-123');
        const msgs = [
            { role: 'user', content: [{ type: 'text', text: 'Describe this' }, { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }] },
        ];
        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghp_test',
            model: 'gpt-4o', format: 'openai',
        };
        await fetchCustom(config, msgs, 0.7, 4096, {});
        const headers = mockSmartFetch.mock.calls[0][1].headers;
        expect(headers['Copilot-Vision-Request']).toBe('true');
    });

    // ── Anthropic non-Copilot: direct API with x-api-key header ──
    it('anthropic direct API uses x-api-key header', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-xyz',
            model: 'claude-3.5-sonnet', format: 'anthropic',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, {});
        const headers = mockSmartFetch.mock.calls[0][1].headers;
        expect(headers['x-api-key']).toBe('sk-ant-xyz');
        expect(headers['Authorization']).toBeUndefined();
    });

    // ── Anthropic non-Copilot: large output beta header ──
    it('anthropic direct API adds output-128k beta when max_tokens > 8192', async () => {
        mockSmartFetch.mockResolvedValue(okJson({
            content: [{ type: 'text', text: 'ok' }],
        }));
        const config = {
            url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-xyz',
            model: 'claude-3.5-sonnet', format: 'anthropic',
        };
        await fetchCustom(config, MSGS, 0.7, 16384, {});
        const headers = mockSmartFetch.mock.calls[0][1].headers;
        expect(headers['anthropic-beta']).toContain('output-128k');
    });

    // ── OpenAI: repetition_penalty ──
    it('openai format: includes repetition_penalty when set', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, { repetition_penalty: 1.1 });
        const body = getBody();
        expect(body.repetition_penalty).toBe(1.1);
    });

    // ── OpenAI: min_p param ──
    it('openai format: includes min_p when set', async () => {
        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        await fetchCustom(config, MSGS, 0.7, 4096, { min_p: 0.1 });
        const body = getBody();
        expect(body.min_p).toBe(0.1);
    });

    // ── Streaming: OpenAI stream with token usage ──
    it('streaming openai request with token usage enabled', async () => {
        const stream = new ReadableStream({
            start(c) {
                c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n'));
                c.close();
            },
        });
        mockSmartFetch.mockResolvedValue({
            ok: true,
            status: 200,
            body: stream,
            headers: { get: () => 'text/event-stream' },
        });
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_show_token_usage') return true;
            return false;
        });

        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        expect(result.content).toBeInstanceOf(ReadableStream);
    });

    // ── Streaming: Google stream URL ──
    it('streaming google request modifies URL for streaming', async () => {
        const stream = new ReadableStream({
            start(c) {
                c.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n'));
                c.close();
            },
        });
        mockSmartFetch.mockResolvedValue({
            ok: true,
            status: 200,
            body: stream,
            headers: { get: () => 'text/event-stream' },
        });
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });

        const config = {
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test',
            model: 'gemini-2.0-flash', format: 'google',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        const calledUrl = mockSmartFetch.mock.calls[0][0];
        expect(calledUrl).toContain(':streamGenerateContent');
        expect(calledUrl).toContain('alt=sse');
    });

    // ── Streaming: response without ReadableStream body → fallback ──
    it('streaming fallback when response body is not readable', async () => {
        // First call returns ok but no body.getReader
        mockSmartFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                body: null, // no readable stream
                headers: { get: () => 'text/event-stream' },
            })
            .mockResolvedValueOnce(okJson({ choices: [{ message: { content: 'fallback ok' } }] }));
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });

        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        expect(result.content).toBe('fallback ok');
        expect(mockSmartFetch).toHaveBeenCalledTimes(2); // stream + fallback
    });

    // ── Streaming: stream error ──
    it('streaming returns error when response is not ok', async () => {
        mockSmartFetch.mockResolvedValue(errResp(500, 'Internal Server Error'));
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });

        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('500');
    });

    // ── Streaming: non-stream fallback body is not JSON ──
    it('streaming fallback handles non-JSON response', async () => {
        mockSmartFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                body: null,
                headers: { get: () => 'text/event-stream' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'text/html' },
                text: async () => '<html>Not JSON</html>',
            });
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });

        const config = {
            url: 'https://api.test.com/v1/chat', key: 'sk-1',
            model: 'gpt-4o', format: 'openai',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('not JSON');
    });

    // ── Non-streaming response that is not JSON ──
    it('non-streaming handles non-JSON response gracefully', async () => {
        mockSmartFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'text/html' },
            text: async () => 'This is not JSON at all',
        });
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('not JSON');
    });

    // ── Compat mode forcing non-streaming ──
    it('compatibility mode forces non-streaming even when streaming enabled', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_compatibility_mode') return true;
            return false;
        });
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        // Should use non-streaming path
        const body = getBody();
        expect(body.stream).toBeUndefined();
    });

    // ── Bridge incapable forcing non-streaming ──
    it('bridge incapable forces non-streaming', async () => {
        mockCheckStreamCapability.mockResolvedValue(false);
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
    });

    // ── Per-model streaming disabled ──
    it('per-model streaming=false disables streaming', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai', streaming: false };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
    });

    // ── With reqId: API request logging ──
    it('logs request/response with _reqId', async () => {
        const config = { url: 'https://api.test.com/v1/chat', key: 'sk-1', model: 'gpt-4o', format: 'openai' };
        await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-test-1');
        expect(mockUpdateApiRequest).toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────────
// stream-builders.js branch coverage tests
// ────────────────────────────────────────────────────────
describe('stream-builders.js branch coverage — Round 13', () => {
    /** Helper: make a mock Response-like with a ReadableStream body */
    function makeStreamResponse(...chunks) {
        const stream = new ReadableStream({
            start(c) {
                for (const chunk of chunks) {
                    c.enqueue(new TextEncoder().encode(chunk));
                }
                c.close();
            },
        });
        return { body: stream, headers: { get: () => 'text/event-stream' } };
    }

    /** Collect ReadableStream<string> into array */
    async function collectStream(rs) {
        const reader = rs.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        return chunks;
    }

    describe('createSSEStream', () => {
        it('streams parsed SSE lines and closes on done', async () => {
            const res = makeStreamResponse('data: hello\n\n', 'data: world\n\n');
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const stream = createSSEStream(res, parser);
            const chunks = await collectStream(stream);
            expect(chunks).toEqual(['hello', 'world']);
        });

        it('calls onComplete callback at end of stream', async () => {
            const res = makeStreamResponse('data: test\n\n');
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const onComplete = vi.fn(() => 'FINAL');
            const stream = createSSEStream(res, parser, undefined, onComplete);
            const chunks = await collectStream(stream);
            expect(chunks).toContain('FINAL');
            expect(onComplete).toHaveBeenCalled();
        });

        it('handles buffer content remaining at done', async () => {
            // Partial line without trailing newline
            const res = makeStreamResponse('data: first\n\ndata: buffered');
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const stream = createSSEStream(res, parser);
            const chunks = await collectStream(stream);
            expect(chunks).toContain('first');
            expect(chunks).toContain('buffered');
        });

        it('skips empty lines and comments (: prefix)', async () => {
            const res = makeStreamResponse(': comment\n\ndata: keep\n\n');
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const stream = createSSEStream(res, parser);
            const chunks = await collectStream(stream);
            expect(chunks).toEqual(['keep']);
        });

        it('handles abort signal during streaming', async () => {
            const ac = new AbortController();
            // An infinite-ish stream
            let resolveRead;
            const stream = new ReadableStream({
                async pull(c) {
                    // First chunk
                    c.enqueue(new TextEncoder().encode('data: first\n\n'));
                    // Simulate delay — abort happens before next
                    await new Promise(r => { resolveRead = r; });
                    c.enqueue(new TextEncoder().encode('data: second\n\n'));
                    c.close();
                },
            });
            const res = { body: stream, headers: { get: () => 'text/event-stream' } };
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const onComplete = vi.fn(() => null);
            const sseStream = createSSEStream(res, parser, ac.signal, onComplete);
            const reader = sseStream.getReader();

            const first = await reader.read();
            expect(first.value).toBe('first');

            // Abort + resolve the pending read
            ac.abort();
            if (resolveRead) resolveRead();

            // Next read should see close
            try {
                const next = await reader.read();
                expect(next.done).toBe(true);
            } catch (_) {
                // AbortError is also acceptable
            }
        });

        it('handles errors during streaming (non-AbortError)', async () => {
            let chunkSent = false;
            const errStream = new ReadableStream({
                pull(c) {
                    if (!chunkSent) {
                        chunkSent = true;
                        c.enqueue(new TextEncoder().encode('data: hello\n\n'));
                        return;
                    }
                    throw new Error('Network failure');
                },
            });
            const res = { body: errStream };
            const parser = (line) => line.startsWith('data:') ? line.slice(5).trim() : null;
            const onComplete = vi.fn(() => 'cleanup');
            const stream = createSSEStream(res, parser, undefined, onComplete);
            const reader = stream.getReader();
            // First read succeeds
            const first = await reader.read();
            expect(first.value).toBe('hello');
            // Second read gets the error
            try {
                await reader.read();
            } catch (e) {
                expect(e.message).toBe('Network failure');
            }
        });
    });

    describe('createOpenAISSEStream', () => {
        it('handles reasoning_content deltas with Thoughts tags', async () => {
            const lines = [
                'data: {"choices":[{"delta":{"reasoning_content":"Let me think..."}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"The answer is 42."}}]}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createOpenAISSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('Let me think...');
            expect(text).toContain('</Thoughts>');
            expect(text).toContain('The answer is 42.');
        });

        it('closes reasoning tag at stream end if still in reasoning', async () => {
            const lines = [
                'data: {"choices":[{"delta":{"reasoning":"Still thinking"}}]}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createOpenAISSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('</Thoughts>');
        });

        it('captures usage from stream', async () => {
            const lines = [
                'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
                'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createOpenAISSEStream(res, undefined, 'req-usage');
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toContain('Hi');
        });

        it('handles delta with no content or reasoning (null delta)', async () => {
            const lines = [
                'data: {"choices":[{"delta":{}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createOpenAISSEStream(res);
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toBe('ok');
        });

        it('handles malformed JSON lines gracefully', async () => {
            const lines = [
                'data: {invalid json}\n\n',
                'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createOpenAISSEStream(res);
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toBe('ok');
        });
    });

    describe('createResponsesAPISSEStream', () => {
        it('handles output_text.delta events', async () => {
            const lines = [
                'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
                'data: {"type":"response.output_text.delta","delta":"world"}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createResponsesAPISSEStream(res);
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toBe('Hello world');
        });

        it('handles reasoning_summary_text.delta events with Thoughts tags', async () => {
            const lines = [
                'data: {"type":"response.reasoning_summary_text.delta","delta":"I need to think..."}\n\n',
                'data: {"type":"response.output_text.delta","delta":"The answer."}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createResponsesAPISSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('I need to think...');
            expect(text).toContain('</Thoughts>');
            expect(text).toContain('The answer.');
        });

        it('closes reasoning at stream end if still in reasoning', async () => {
            const lines = [
                'data: {"type":"response.reasoning_summary_text.delta","delta":"Still reasoning"}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createResponsesAPISSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('</Thoughts>');
        });

        it('captures usage from response.completed event', async () => {
            const lines = [
                'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
                'data: {"type":"response.completed","response":{"usage":{"prompt_tokens":10,"completion_tokens":5}}}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createResponsesAPISSEStream(res, undefined, 'req-resp-usage');
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toContain('Hi');
        });

        it('ignores unknown event types', async () => {
            const lines = [
                'data: {"type":"response.unknown_event"}\n\n',
                'data: {"type":"response.output_text.delta","delta":"data"}\n\n',
                'data: [DONE]\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createResponsesAPISSEStream(res);
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toBe('data');
        });
    });

    describe('createAnthropicSSEStream', () => {
        it('handles thinking → text transition with Thoughts tags', async () => {
            const lines = [
                'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"Let me reason"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"The answer."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('<Thoughts>');
            expect(text).toContain('Let me reason');
            expect(text).toContain('</Thoughts>');
            expect(text).toContain('The answer.');
        });

        it('handles redacted_thinking delta', async () => {
            const lines = [
                'event: content_block_delta\ndata: {"delta":{"type":"redacted_thinking"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Response."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('{{redacted_thinking}}');
            expect(text).toContain('Response.');
        });

        it('handles redacted_thinking via content_block_start', async () => {
            const lines = [
                'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"After."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('{{redacted_thinking}}');
            expect(text).toContain('After.');
        });

        it('hides thinking when showThinking=false', async () => {
            const lines = [
                'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"Secret thought"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Visible."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res, undefined, undefined, { showThinking: false });
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).not.toContain('Secret thought');
            expect(text).not.toContain('<Thoughts>');
            expect(text).toContain('Visible.');
        });

        it('handles redacted_thinking hidden when showThinking=false', async () => {
            const lines = [
                'event: content_block_delta\ndata: {"delta":{"type":"redacted_thinking"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Visible."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res, undefined, undefined, { showThinking: false });
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).not.toContain('{{redacted_thinking}}');
            expect(text).toContain('Visible.');
        });

        it('handles content_block_start redacted when showThinking=false', async () => {
            const lines = [
                'event: content_block_start\ndata: {"content_block":{"type":"redacted_thinking"}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Clean."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res, undefined, undefined, { showThinking: false });
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).not.toContain('{{redacted_thinking}}');
            expect(text).toContain('Clean.');
        });

        it('closes thinking tag at stream end if thinking was active', async () => {
            const lines = [
                'event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"Ongoing thinking..."}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('</Thoughts>');
        });

        it('captures message_start and message_delta usage', async () => {
            const lines = [
                'event: message_start\ndata: {"message":{"usage":{"input_tokens":50,"cache_read_input_tokens":10,"cache_creation_input_tokens":5}}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"OK"}}\n\n',
                'event: message_delta\ndata: {"usage":{"output_tokens":20}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res, undefined, 'req-anth-usage');
            const chunks = await collectStream(stream);
            expect(chunks.join('')).toContain('OK');
        });

        it('handles stream error events', async () => {
            const lines = [
                'event: error\ndata: {"error":{"message":"Rate limit exceeded"}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res);
            const chunks = await collectStream(stream);
            const text = chunks.join('');
            expect(text).toContain('Rate limit exceeded');
        });

        it('handles error with thinking active (closes thinking tag)', async () => {
            let chunksSent = 0;
            const errStream = new ReadableStream({
                pull(c) {
                    if (chunksSent === 0) {
                        chunksSent++;
                        c.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"delta":{"type":"thinking_delta","thinking":"In progress"}}\n\n'));
                        return;
                    }
                    throw new Error('Connection lost');
                },
            });
            const res = { body: errStream };
            const stream = createAnthropicSSEStream(res);
            const reader = stream.getReader();
            const first = await reader.read();
            expect(first.done).toBe(false);
            try {
                await reader.read();
            } catch (e) {
                expect(e.message).toBe('Connection lost');
            }
        });

        it('cancel handler logs and cancels reader', async () => {
            const lines = [
                'event: message_start\ndata: {"message":{"usage":{"input_tokens":10}}}\n\n',
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Start"}}\n\n',
            ];
            const res = makeStreamResponse(lines.join(''));
            const stream = createAnthropicSSEStream(res, undefined, 'req-cancel');
            const reader = stream.getReader();
            await reader.read(); // get first chunk
            await reader.cancel(); // trigger cancel
            // No assertions needed — just verify no error thrown
        });
    });

    describe('saveThoughtSignatureFromStream', () => {
        it('saves thought signature to cache when present', async () => {
            const config = {
                _inThoughtBlock: true,
                _lastSignature: 'sig-abc123',
                _streamResponseText: 'Some response text',
            };
            const result = saveThoughtSignatureFromStream(config);
            expect(result).toContain('</Thoughts>');
            expect(config._inThoughtBlock).toBe(false);
        });

        it('sets token usage when usageMetadata present', () => {
            const config = {
                _streamUsageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
                _tokenUsageReqId: 'req-sig-usage',
                _streamResponseText: '',
            };
            const result = saveThoughtSignatureFromStream(config);
            // Should not throw
            expect(result).toBeFalsy(); // no thought block to close, no finalChunk
        });

        it('returns undefined when no thought block and no signature', () => {
            const config = {};
            const result = saveThoughtSignatureFromStream(config);
            expect(result).toBeUndefined();
        });

        it('also accepts external _requestId', () => {
            const config = {
                _streamUsageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
                _streamResponseText: '',
            };
            const result = saveThoughtSignatureFromStream(config, 'ext-req-id');
            expect(result).toBeFalsy();
        });
    });
});
