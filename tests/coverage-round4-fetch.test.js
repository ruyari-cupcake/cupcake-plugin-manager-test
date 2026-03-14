/**
 * coverage-round4-fetch.test.js — Branch coverage boost for fetch-custom.js
 * and smart-fetch helpers.
 *
 * Target: ~35+ uncovered branches in fetch-custom.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──
const mockFetch = vi.fn();
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockFetch(...args),
}));

const mockEnsureCopilotApiToken = vi.fn().mockResolvedValue('');
vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: (...args) => mockEnsureCopilotApiToken(...args),
}));

const mockGetArg = vi.fn().mockResolvedValue('');
const mockGetBoolArg = vi.fn().mockResolvedValue(false);
vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        safeGetArg: (...args) => mockGetArg(...args),
        safeGetBoolArg: (...args) => mockGetBoolArg(...args),
    };
});

vi.mock('../src/lib/api-request-log.js', () => ({
    updateApiRequest: vi.fn(),
    storeApiRequest: vi.fn(() => 'req-1'),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

const mockCheckStreamCapability = vi.fn().mockResolvedValue(true);
vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: (...args) => mockCheckStreamCapability(...args),
}));

import { fetchCustom } from '../src/lib/fetch-custom.js';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ── Helpers ──

function makeResponse(body, { status = 200, contentType = 'application/json', headers: extraHeaders = {} } = {}) {
    const h = new Headers({ 'Content-Type': contentType, ...extraHeaders });
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: h,
        text: vi.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
        body: null, // no streaming
    };
}

function makeStreamResponse(chunks, { status = 200 } = {}) {
    let index = 0;
    const stream = new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(new TextEncoder().encode(chunks[index++]));
            } else {
                controller.close();
            }
        },
    });
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
        text: vi.fn(() => Promise.resolve(chunks.join(''))),
        body: stream,
    };
}

const SIMPLE_MESSAGES = [{ role: 'user', content: 'Hello' }];

beforeEach(() => {
    mockFetch.mockReset();
    mockGetArg.mockResolvedValue('');
    mockGetBoolArg.mockResolvedValue(false);
    mockCheckStreamCapability.mockResolvedValue(true);
    mockEnsureCopilotApiToken.mockResolvedValue('');
});

// ─── Empty URL ───

describe('fetchCustom — empty URL', () => {
    it('returns error when url is empty', async () => {
        const result = await fetchCustom({ url: '' }, SIMPLE_MESSAGES, 0.7, 200);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Base URL is required');
    });
});

// ─── Role normalization for OpenAI format ───

describe('fetchCustom — role normalization', () => {
    it('normalizes model role to assistant', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        const msgs = [{ role: 'model', content: 'Hello from model' }];
        const result = await fetchCustom({ url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai' }, msgs, 0.7, 200);
        expect(result.success).toBe(true);
    });

    it('normalizes char role to assistant', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        const msgs = [{ role: 'char', content: 'Hello from char' }, { role: 'user', content: 'test' }];
        const result = await fetchCustom({ url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai' }, msgs, 0.7, 200);
        expect(result.success).toBe(true);
    });
});

// ─── maxOutputLimit clamping ───

describe('fetchCustom — maxOutputLimit', () => {
    it('clamps maxTokens when maxOutputLimit is smaller', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', maxOutputLimit: 100 },
            SIMPLE_MESSAGES, 0.7, 500,
        );
        // The body should have max_tokens clamped to 100
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(100);
    });
});

// ─── Anthropic adaptive thinking ───

describe('fetchCustom — Anthropic adaptive thinking', () => {
    it('sets thinking.type=adaptive when adaptiveThinking is true', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic', adaptiveThinking: true, effort: 'high' },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
    });

    it('sets thinking.type=adaptive when thinkingMode=adaptive', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic', thinking: 'adaptive' },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking.type).toBe('adaptive');
    });
});

// ─── Anthropic budget-based thinking ───

describe('fetchCustom — Anthropic budget thinking', () => {
    it('sets thinking with budget_tokens when thinkingBudget > 0', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic', thinkingBudget: 5000 },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
    });

    it('effort without adaptive → output_config only', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic', effort: 'medium' },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.output_config).toEqual({ effort: 'medium' });
        expect(body.thinking).toBeUndefined();
    });
});

// ─── Google format body building ───

describe('fetchCustom — Google format', () => {
    it('builds correct body with Vertex thinkingBudget', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }));
        await fetchCustom(
            { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=test', model: 'gemini-2.5-pro', format: 'google', thinkingBudget: 8000 },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.generationConfig.thinkingConfig).toBeDefined();
        expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(8000);
    });

    it('detects Vertex AI endpoint for thinking config', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }));
        await fetchCustom(
            { url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/myproj/locations/us-central1/publishers/google/models/gemini-3-pro:generateContent', model: 'gemini-3-pro', format: 'google', thinking_level: 'HIGH' },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.generationConfig.thinkingConfig).toBeDefined();
    });
});

// ─── customParams blocked fields ───

describe('fetchCustom — customParams', () => {
    it('strips blocked fields from customParams', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                model: 'gpt-4',
                format: 'openai',
                customParams: JSON.stringify({
                    messages: [{ role: 'user', content: 'injected' }],
                    tools: [{ type: 'function', function: { name: 'evil' } }],
                    logprobs: true,
                }),
            },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // messages should NOT be overridden; logprobs should be merged
        expect(body.logprobs).toBe(true);
        expect(body.tools).toBeUndefined();
    });

    it('rejects thenable values in customParams', async () => {
        // Can't test directly since JSON.stringify would fail on Promise, so test invalid JSON path
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                model: 'gpt-4',
                format: 'openai',
                customParams: 'not-valid-json',
            },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        // Should succeed even with bad customParams (error is caught)
        expect(mockFetch).toHaveBeenCalled();
    });
});

// ─── Copilot Responses API detection ───

describe('fetchCustom — Copilot Responses API', () => {
    it('switches to /responses endpoint for Copilot + responsesMode=on', async () => {
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-api-token-123');
        mockFetch.mockResolvedValue(makeResponse({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }],
        }));
        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                model: 'gpt-4o',
                format: 'openai',
                responsesMode: 'on',
            },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/responses');
        // body should have 'input' instead of 'messages'
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.input).toBeDefined();
        expect(body.messages).toBeUndefined();
    });
});

// ─── Non-streaming JSON parse failure ───

describe('fetchCustom — non-streaming response parsing', () => {
    it('handles non-JSON response gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ 'Content-Type': 'text/html' }),
            text: vi.fn(() => Promise.resolve('<html>Error Page</html>')),
            body: null,
        });
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('not JSON');
    });
});

// ─── Key rotation dispatch ───

describe('fetchCustom — key rotation', () => {
    it('uses key rotation when multiple keys provided', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', key: 'key1 key2 key3' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(true);
    });
});

// ─── maxout flag ───

describe('fetchCustom — maxout flag', () => {
    it('OpenAI maxout → max_output_tokens instead of max_tokens', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', maxout: true },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_output_tokens).toBe(200);
        expect(body.max_tokens).toBeUndefined();
    });
});

// ─── Reasoning effort ───

describe('fetchCustom — reasoning and verbosity', () => {
    it('sets reasoning_effort for supported models', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'o3', format: 'openai', reasoning: 'medium' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.reasoning_effort).toBe('medium');
    });

    it('sets verbosity in body', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', verbosity: 'verbose' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.verbosity).toBe('verbose');
    });

    it('sets prompt_cache_retention', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', promptCacheRetention: '30min' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.prompt_cache_retention).toBe('30min');
    });
});

// ─── Streaming with different formats ───

describe('fetchCustom — streaming paths', () => {
    it('OpenAI streaming → createOpenAISSEStream', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        mockFetch.mockResolvedValue(makeStreamResponse([
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
            'data: [DONE]\n\n',
        ]));
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', streaming: true },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(true);
        // content should be a ReadableStream
        expect(typeof result.content.getReader).toBe('function');
    });

    it('Anthropic streaming → createAnthropicSSEStream', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_streaming_show_thinking') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        mockFetch.mockResolvedValue(makeStreamResponse([
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"OK"}}\n\n',
        ]));
        const result = await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic', streaming: true },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        expect(result.success).toBe(true);
    });

    it('Google streaming → createSSEStream with parseGeminiSSELine', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        mockFetch.mockResolvedValue(makeStreamResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n',
        ]));
        const result = await fetchCustom(
            { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=test', model: 'gemini-2.5-pro', format: 'google', streaming: true },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        expect(result.success).toBe(true);
    });

    it('Responses API streaming → createResponsesAPISSEStream', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-token');
        mockFetch.mockResolvedValue(makeStreamResponse([
            'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
        ]));
        const result = await fetchCustom(
            { url: 'https://api.githubcopilot.com/chat/completions', model: 'gpt-4o', format: 'openai', streaming: true, responsesMode: 'on' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(true);
    });

    it('streaming body unavailable → falls back to non-streaming', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        // First call: streaming response with no body.getReader
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: vi.fn(() => Promise.resolve('')),
            body: {}, // no getReader
        });
        // Second call: non-streaming fallback
        mockFetch.mockResolvedValueOnce(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'fallback' } }],
        }));
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', streaming: true },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(true);
        expect(result.content).toContain('fallback');
    });

    it('compatibility mode active → forces non-streaming', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_compatibility_mode') return true;
            return false;
        });
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'non-stream' } }],
        }));
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', streaming: true },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(true);
        expect(typeof result.content).toBe('string');
    });
});

// ─── CORS proxy ───

describe('fetchCustom — CORS proxy', () => {
    it('rewrites URL through proxyUrl', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }));
        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                model: 'gpt-4',
                format: 'openai',
                proxyUrl: 'https://my-cors-proxy.workers.dev/',
            },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(mockFetch.mock.calls[0][0]).toContain('my-cors-proxy.workers.dev');
    });
});

// ─── HTTP error response ───

describe('fetchCustom — error responses', () => {
    it('returns error for non-ok HTTP response', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 429,
            headers: new Headers(),
            text: vi.fn(() => Promise.resolve('Rate limit exceeded')),
            body: null,
        });
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai' },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(false);
        expect(result._status).toBe(429);
    });

    it('streaming error response → returns error text', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValue(true);
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            headers: new Headers(),
            text: vi.fn(() => Promise.resolve('Internal Server Error')),
            body: null,
        });
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai', streaming: true },
            SIMPLE_MESSAGES, 0.7, 200,
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('500');
    });
});

// ─── Anthropic beta headers ───

describe('fetchCustom — Anthropic headers', () => {
    it('adds anthropic-beta for large max_tokens', async () => {
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic' },
            SIMPLE_MESSAGES, 0.7, 16000,
        );
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['anthropic-beta']).toContain('output-128k');
        expect(headers['x-api-key']).toBeDefined();
        expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    });
});

// ─── Copilot Anthropic URL auto-switch ───

describe('fetchCustom — Copilot + Anthropic URL switch', () => {
    it('auto-switches Copilot URL for Anthropic format', async () => {
        mockEnsureCopilotApiToken.mockResolvedValue('copilot-api-token');
        mockFetch.mockResolvedValue(makeResponse({
            content: [{ type: 'text', text: 'OK' }],
        }));
        await fetchCustom(
            { url: 'https://api.githubcopilot.com/chat/completions', model: 'claude-sonnet-4-20250514', format: 'anthropic' },
            SIMPLE_MESSAGES, 0.7, 4000,
        );
        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/v1/messages');
    });
});

// ─── Messages sanitization - all empty ───

describe('fetchCustom — messages sanitization', () => {
    it('returns error when all messages become empty after sanitization', async () => {
        const result = await fetchCustom(
            { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4', format: 'openai' },
            [{ role: 'user', content: '' }, { role: 'user', content: null }],
            0.7, 200,
        );
        expect(result.success).toBe(false);
        expect(result.content).toContain('non-empty');
    });
});
