/**
 * End-to-end integration tests for the full fetch pipeline.
 *
 * Unlike fetch-custom.test.js (which tests body construction and basic responses),
 * these tests verify the COMPLETE path:
 *   - Streaming: fetchCustom → mock SSE → stream-builders → SSE parsing → collectStream → final text
 *   - Non-streaming with complex responses: thinking blocks, multi-part, safety blocks
 *   - Token usage tracking through the entire chain
 *   - Key rotation exhaustion (all keys fail)
 *   - Anthropic streaming with thinking + text deltas
 *   - Gemini streaming with thought parts
 *   - Responses API streaming with reasoning summary
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock smartNativeFetch ──
const mockFetch = vi.fn();
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockFetch(...args),
}));

// ── Mock copilot-token ──
vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
}));

// ── Mock shared-state ──
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
    storeApiRequest: vi.fn(() => 'req-e2e'),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

// ── Mock stream-utils: bridge capable by default (streaming allowed) ──
const mockCheckStreamCapability = vi.fn().mockResolvedValue(true);
vi.mock('../src/lib/stream-utils.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        checkStreamCapability: (...args) => mockCheckStreamCapability(...args),
    };
});

import { fetchCustom } from '../src/lib/fetch-custom.js';
import { collectStream } from '../src/lib/stream-utils.js';
import { _takeTokenUsage, _tokenUsageStore } from '../src/lib/token-usage.js';
import { KeyPool } from '../src/lib/key-pool.js';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ── Helpers ──
function makeOkJsonResponse(body) {
    return {
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

function makeSSEResponse(...sseLines) {
    const encoder = new TextEncoder();
    const payload = sseLines.join('\n') + '\n';
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(payload));
            controller.close();
        },
    });
    return { ok: true, status: 200, body: stream, headers: { get: () => 'text/event-stream' } };
}

function makeAnthropicSSEResponse(events) {
    const encoder = new TextEncoder();
    const lines = events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`).join('\n');
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(lines));
            controller.close();
        },
    });
    return { ok: true, status: 200, body: stream, headers: { get: () => 'text/event-stream' } };
}

const MSGS = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
];

const BASE_OPENAI = { url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o', format: 'openai' };
const BASE_ANTHROPIC = { url: 'https://api.anthropic.com/v1/messages', key: 'sk-ant-test', model: 'claude-sonnet-4-20250514', format: 'anthropic' };
const BASE_GOOGLE = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', key: 'goog-key', model: 'gemini-2.0-flash', format: 'google' };

describe('fetch-custom E2E — Non-streaming complex responses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetBoolArg.mockResolvedValue(false);
        _tokenUsageStore.clear();
    });

    it('OpenAI with reasoning_content (o-series) → extracts thinking + answer', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ reasoning_content: 'Let me think step by step...', message: { content: 'The answer is 42.' } }],
            usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35, completion_tokens_details: { reasoning_tokens: 10 } },
        }));

        const config = { ...BASE_OPENAI, model: 'o3' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-e2e-1');

        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Let me think step by step...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('The answer is 42.');

        // Verify token usage was tracked
        const usage = _takeTokenUsage('req-e2e-1', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(20);
        expect(usage.output).toBe(15);
        expect(usage.reasoning).toBe(10);
    });

    it('OpenAI with DeepSeek <think> blocks → extracts properly', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: '<think>Consider the options carefully...</think>Option B is best.' } }],
        }));

        const result = await fetchCustom(BASE_OPENAI, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Consider the options carefully...');
        expect(result.content).toContain('Option B is best.');
    });

    it('Claude with thinking + redacted_thinking blocks', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [
                { type: 'thinking', thinking: 'Analyzing user query...' },
                { type: 'redacted_thinking' },
                { type: 'text', text: 'Here is my response.' },
            ],
            usage: { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
        }));

        const result = await fetchCustom(BASE_ANTHROPIC, MSGS, 0.7, 4096, {}, undefined, 'req-e2e-2');

        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Analyzing user query...');
        expect(result.content).toContain('{{redacted_thinking}}');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('Here is my response.');

        const usage = _takeTokenUsage('req-e2e-2', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(50);
        expect(usage.output).toBe(30);
        expect(usage.cached).toBe(15); // 10 read + 5 creation
    });

    it('Claude error response → returns structured error', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            type: 'error',
            error: { type: 'overloaded_error', message: 'Overloaded' },
        }));

        const result = await fetchCustom(BASE_ANTHROPIC, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('Claude Error');
        expect(result.content).toContain('Overloaded');
    });

    it('Gemini with thought parts → wraps in Thoughts tags', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Let me reason about this...' },
                        { text: 'The final answer is 7.' },
                    ],
                },
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 20, totalTokenCount: 150 },
        }));

        const result = await fetchCustom(BASE_GOOGLE, MSGS, 0.9, 4096, {}, undefined, 'req-e2e-3');

        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Let me reason about this...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('The final answer is 7.');

        const usage = _takeTokenUsage('req-e2e-3', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(100);
        expect(usage.output).toBe(50);
        expect(usage.reasoning).toBe(20);
    });

    it('Gemini safety block → returns a structured error', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            promptFeedback: { blockReason: 'SAFETY', safetyRatings: [{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'HIGH' }] },
        }));

        const result = await fetchCustom(BASE_GOOGLE, MSGS, 0.7, 4096, {});
        expect(result.success).toBe(false);
        expect(result.content).toContain('Gemini Safety Block');
        expect(result.content).toContain('SAFETY');
    });

    it('Responses API with reasoning summary → extracts thoughts + text', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            output: [
                { type: 'reasoning', summary: [{ type: 'summary_text', text: 'I should respond helpfully.' }] },
                { type: 'message', content: [{ type: 'output_text', text: 'Hello! How can I help?' }] },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        }));

        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
            model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto', reasoning: 'high',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-e2e-4');

        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('I should respond helpfully.');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('Hello! How can I help?');
    });

    it('Responses API fallback → falls back to OpenAI parser when output is choices-based', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'legacy response' } }],
        }));

        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
            model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto',
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        expect(result.content).toBe('legacy response');
    });
});

describe('fetch-custom E2E — Streaming full pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _tokenUsageStore.clear();
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_streaming_show_thinking') return true;
            return false;
        });
    });

    it('OpenAI streaming → SSE parse → collectStream → full content', async () => {
        mockFetch.mockResolvedValue(makeSSEResponse(
            'data: {"choices":[{"delta":{"content":"Hello"}}]}',
            'data: {"choices":[{"delta":{"content":" World"}}]}',
            'data: {"choices":[{"delta":{"content":"!"}}]}',
            'data: [DONE]',
        ));

        const config = { ...BASE_OPENAI, streaming: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        expect(result.content).toBeInstanceOf(ReadableStream);

        const text = await collectStream(result.content);
        expect(text).toBe('Hello World!');
    });

    it('OpenAI streaming with reasoning_content deltas → wraps in Thoughts tags', async () => {
        mockFetch.mockResolvedValue(makeSSEResponse(
            'data: {"choices":[{"delta":{"reasoning_content":"Think"}}]}',
            'data: {"choices":[{"delta":{"reasoning_content":"ing..."}}]}',
            'data: {"choices":[{"delta":{"content":"Answer"}}]}',
            'data: [DONE]',
        ));

        const config = { ...BASE_OPENAI, model: 'o3', streaming: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});
        const text = await collectStream(result.content);

        expect(text).toContain('<Thoughts>');
        expect(text).toContain('Thinking...');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('Answer');
    });

    it('OpenAI streaming with usage → token usage tracked', async () => {
        mockFetch.mockResolvedValue(makeSSEResponse(
            'data: {"choices":[{"delta":{"content":"Hi"}}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
            'data: [DONE]',
        ));

        const config = { ...BASE_OPENAI, streaming: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-stream-1');
        await collectStream(result.content);

        const usage = _takeTokenUsage('req-stream-1', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(10);
        expect(usage.output).toBe(5);
    });

    it('Anthropic streaming → thinking + text deltas → full content', async () => {
        mockFetch.mockResolvedValue(makeAnthropicSSEResponse([
            { event: 'message_start', data: { message: { usage: { input_tokens: 50 } } } },
            { event: 'content_block_delta', data: { delta: { type: 'thinking_delta', thinking: 'analyzing...' } } },
            { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'Here is the answer.' } } },
            { event: 'message_delta', data: { usage: { output_tokens: 20 } } },
        ]));

        const config = { ...BASE_ANTHROPIC, streaming: true, effort: 'high' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-stream-2');
        expect(result.success).toBe(true);

        const text = await collectStream(result.content);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('analyzing...');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('Here is the answer.');

        const usage = _takeTokenUsage('req-stream-2', true);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(50);
        expect(usage.output).toBe(20);
        expect(usage.reasoning).toBe(15);
        expect(usage.reasoningEstimated).toBe(true);
    });

    it('Anthropic streaming with redacted_thinking block', async () => {
        mockFetch.mockResolvedValue(makeAnthropicSSEResponse([
            { event: 'message_start', data: { message: { usage: { input_tokens: 30 } } } },
            { event: 'content_block_start', data: { content_block: { type: 'redacted_thinking' } } },
            { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'Visible answer.' } } },
            { event: 'message_delta', data: { usage: { output_tokens: 10 } } },
        ]));

        const config = { ...BASE_ANTHROPIC, streaming: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        const text = await collectStream(result.content);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('{{redacted_thinking}}');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('Visible answer.');
    });

    it('Gemini streaming → thought parts + text → correct extraction', async () => {
        mockFetch.mockResolvedValue(makeSSEResponse(
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"reasoning..."}]}}]}',
            'data: {"candidates":[{"content":{"parts":[{"text":"final output"}]}}]}',
            'data: {"usageMetadata":{"promptTokenCount":40,"candidatesTokenCount":20,"totalTokenCount":60}}',
        ));

        const config = { ...BASE_GOOGLE, streaming: true };
        const result = await fetchCustom(config, MSGS, 0.9, 4096, {});
        expect(result.success).toBe(true);

        const text = await collectStream(result.content);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('reasoning...');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('final output');
    });

    it('Responses API streaming → reasoning + output_text deltas', async () => {
        mockFetch.mockResolvedValue(makeSSEResponse(
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Thinking step 1."}',
            'data: {"type":"response.reasoning_summary_text.delta","delta":" Step 2."}',
            'data: {"type":"response.output_text.delta","delta":"Final answer."}',
            'data: {"type":"response.completed","response":{"usage":{"prompt_tokens":15,"completion_tokens":10,"total_tokens":25}}}',
            'data: [DONE]',
        ));

        const config = {
            url: 'https://api.githubcopilot.com/chat/completions', key: 'ghu_test',
            model: 'gpt-5.4', format: 'openai', copilotToken: 'cpt-123', responsesMode: 'auto',
            reasoning: 'high', streaming: true,
        };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {}, undefined, 'req-stream-3');
        expect(result.success).toBe(true);

        const text = await collectStream(result.content);
        expect(text).toContain('<Thoughts>');
        expect(text).toContain('Thinking step 1.');
        expect(text).toContain('Step 2.');
        expect(text).toContain('</Thoughts>');
        expect(text).toContain('Final answer.');
    });

    it('Streaming HTTP error → returns error with status', async () => {
        mockFetch.mockResolvedValue({
            ok: false, status: 529,
            headers: { get: () => 'text/plain' },
            text: async () => 'Service overloaded',
        });

        const config = { ...BASE_OPENAI, streaming: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(false);
        expect(result.content).toContain('529');
        expect(result.content).toContain('Service overloaded');
        expect(result._status).toBe(529);
    });
});

describe('fetch-custom E2E — Key rotation edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        KeyPool._pools = {};
        mockGetBoolArg.mockResolvedValue(false);
        _tokenUsageStore.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('all keys exhausted → returns final error', async () => {
        vi.useFakeTimers();
        for (let i = 0; i < 9; i++) {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => 'text/plain' }, text: async () => `rate limited (${i + 1})` });
        }

        const config = { ...BASE_OPENAI, key: 'sk-k1 sk-k2 sk-k3' };
        const promise = fetchCustom(config, MSGS, 0.7, 4096, {});
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.content).toContain('API 키');
    });

    it('key rotation succeeds on third key', async () => {
        vi.useFakeTimers();
        for (let i = 0; i < 6; i++) {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => 'text/plain' }, text: async () => 'rate limited' });
        }
        mockFetch.mockResolvedValueOnce(makeOkJsonResponse({
            choices: [{ message: { content: 'success on key3!' } }],
        }));

        const config = { ...BASE_OPENAI, key: 'sk-k1 sk-k2 sk-k3' };
        const promise = fetchCustom(config, MSGS, 0.7, 4096, {});
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.success).toBe(true);
        expect(result.content).toBe('success on key3!');
        expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('5xx error does NOT trigger key rotation (returns immediately)', async () => {
        vi.useFakeTimers();
        mockFetch.mockResolvedValue({
            ok: false, status: 500,
            headers: { get: () => 'application/json' },
            text: async () => '{"error":"internal server error"}',
        });

        const config = { ...BASE_OPENAI, key: 'sk-k1 sk-k2' };
        const promise = fetchCustom(config, MSGS, 0.7, 4096, {});
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.content).toContain('500');
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });
});

describe('fetch-custom E2E — Anthropic adaptive + budget thinking non-streaming', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        KeyPool._pools = {};
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('effort=high WITHOUT adaptiveThinking toggle → output_config only, no thinking block', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [
                { type: 'text', text: 'Here is my answer without adaptive thinking.' },
            ],
            usage: { input_tokens: 100, output_tokens: 80 },
        }));

        const config = { ...BASE_ANTHROPIC, effort: 'high' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        expect(result.content).toContain('Here is my answer without adaptive thinking.');

        // Verify body: effort only via output_config, no thinking block
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toEqual({ effort: 'high' });
        // temperature should NOT be stripped when adaptive is off
        expect(body.temperature).toBeDefined();
    });

    it('adaptiveThinking=true + effort=high → body has thinking adaptive + output_config', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [
                { type: 'thinking', thinking: 'Deep analysis...' },
                { type: 'text', text: 'Here is my well-reasoned answer.' },
            ],
            usage: { input_tokens: 100, output_tokens: 80 },
        }));

        const config = { ...BASE_ANTHROPIC, effort: 'high', adaptiveThinking: true };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        expect(result.content).toContain('Deep analysis...');
        expect(result.content).toContain('Here is my well-reasoned answer.');

        // Verify body: adaptive thinking set, temperature stripped
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
        expect(body.temperature).toBeUndefined();
    });

    it('budget thinking with explicit budget → correct max_tokens and thinking config', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [{ type: 'text', text: 'Budget response.' }],
        }));

        const config = { ...BASE_ANTHROPIC, thinkingBudget: 16384 };
        const result = await fetchCustom(config, MSGS, 0.7, 2048, {});

        expect(result.success).toBe(true);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 16384 });
        // max_tokens should be at least budget + requested output
        expect(body.max_tokens).toBeGreaterThanOrEqual(16384 + 2048);
    });

    it('interleaved thinking blocks (thinking→text→thinking→text) parsed correctly', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [
                { type: 'thinking', thinking: 'First thought step...' },
                { type: 'text', text: 'Let me use a tool.' },
                { type: 'thinking', thinking: 'Second thought after tool result...' },
                { type: 'text', text: 'Final answer based on analysis.' },
            ],
            usage: { input_tokens: 100, output_tokens: 200 },
        }));

        const config = { ...BASE_ANTHROPIC, adaptiveThinking: true, effort: 'high' };
        const result = await fetchCustom(config, MSGS, 0.7, 16000, {});

        expect(result.success).toBe(true);
        // Both thinking blocks wrapped
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('First thought step...');
        expect(result.content).toContain('Second thought after tool result...');
        // Both text blocks present
        expect(result.content).toContain('Let me use a tool.');
        expect(result.content).toContain('Final answer based on analysis.');
        // Thinking blocks properly closed before text
        expect(result.content).toContain('</Thoughts>');
    });

    it('effort=unspecified is rejected as invalid → no output_config', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [{ type: 'text', text: 'plain result' }],
        }));

        const config = { ...BASE_ANTHROPIC, effort: 'unspecified' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toBeUndefined();
        expect(body.temperature).toBeDefined();
    });

    it('adaptive thinking with low effort → may skip thinking in response', async () => {
        // At low effort, Claude may not return thinking blocks
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [
                { type: 'text', text: 'Quick answer without deep thinking.' },
            ],
            usage: { input_tokens: 30, output_tokens: 10 },
        }));

        const config = { ...BASE_ANTHROPIC, adaptiveThinking: true, effort: 'low' };
        const result = await fetchCustom(config, MSGS, 0.7, 4096, {});

        expect(result.success).toBe(true);
        expect(result.content).toBe('Quick answer without deep thinking.');

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'low' });
    });
});
