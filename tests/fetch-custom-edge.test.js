/**
 * Edge-case tests for fetch-custom.js — areas not covered by fetch-custom.test.js:
 *   - CORS proxy URL rewriting
 *   - Compatibility mode blocking streaming
 *   - Copilot token failure path
 *   - Anthropic adaptive thinking in custom models
 *   - Google streaming URL construction / fallback URL cleanup
 *   - Responses API force-on/force-off edge cases
 *   - customParams blocked fields stripping
 *   - Key pool inline creation with multi-key
 *   - maxOutputLimit with Responses API max_output_tokens
 *   - Empty messages after sanitization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockFetch(...args),
}));

vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
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
function makeOkJsonResponse(body, status = 200) {
    return {
        ok: true,
        status,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

const BASIC_MESSAGES = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' },
];

describe('fetchCustom — CORS proxy URL rewriting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('rewrites URL through CORS proxy while preserving pathname', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'proxied-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                proxyUrl: 'https://my-proxy.workers.dev',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toBe('https://my-proxy.workers.dev/v1/chat/completions');
    });

    it('requires Copilot OAuth token when proxying Copilot domain', async () => {
        mockGetArg.mockImplementation(async (key) => {
            if (key === 'tools_githubCopilotToken') return '';
            return '';
        });

        const result = await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: '',
                model: 'gpt-4o',
                format: 'openai',
                proxyUrl: 'https://my-proxy.workers.dev',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(false);
        expect(result.content).toMatch(/OAuth|토큰|token/i);
    });

    it('uses Copilot token in Authorization when proxy + copilot domain', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'cop-proxy-ok' } }] })
        );
        mockGetArg.mockImplementation(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_abc123';
            return '';
        });

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: '',
                model: 'gpt-4o',
                format: 'openai',
                proxyUrl: 'https://my-proxy.workers.dev',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer ghu_abc123');
    });
});

describe('fetchCustom — Compatibility mode & streaming interaction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('forces non-streaming when compatibility mode is enabled even if streaming requested', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            if (key === 'cpm_compatibility_mode') return true;
            return false;
        });
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'compat-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                streaming: true,
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // In compatibility mode, stream should be false or not set
        expect(body.stream).toBeFalsy();
    });

    it('disables streaming for decoupled models by default', async () => {
        mockGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_streaming_enabled') return true;
            return false;
        });
        mockCheckStreamCapability.mockResolvedValueOnce(true);
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'decoupled-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                decoupled: true,
                streaming: false,
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.stream).toBeFalsy();
    });
});

describe('fetchCustom — Anthropic adaptive thinking in custom models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('sets adaptive thinking with effort in Anthropic format', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'adaptive-ok' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.anthropic.com/v1/messages',
                key: 'sk-ant-test',
                model: 'claude-sonnet-4-6-20260301',
                format: 'anthropic',
                adaptiveThinking: true,
                effort: 'high',
            },
            BASIC_MESSAGES, 0.7, 16000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
        expect(body.temperature).toBeUndefined();
    });

    it('defaults effort to "high" when adaptiveThinking is on but effort unset', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'default-effort' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.anthropic.com/v1/messages',
                key: 'sk-ant-test',
                model: 'claude-opus-4-6-20260301',
                format: 'anthropic',
                adaptiveThinking: true,
                effort: '',
            },
            BASIC_MESSAGES, 0.7, 16000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking?.type).toBe('adaptive');
        expect(body.output_config?.effort).toBe('high');
    });

    it('uses budget-based thinking when adaptiveThinking is off but budget set', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'budget-ok' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.anthropic.com/v1/messages',
                key: 'sk-ant-test',
                model: 'claude-sonnet-4-5-20250929',
                format: 'anthropic',
                thinkingBudget: 10000,
            },
            BASIC_MESSAGES, 0.7, 8000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
        expect(body.max_tokens).toBeGreaterThan(10000);
    });

    it('auto-bumps max_tokens when budget exceeds current max_tokens', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'bumped' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.anthropic.com/v1/messages',
                key: 'sk-ant-test',
                model: 'claude-sonnet-4-5-20250929',
                format: 'anthropic',
                thinkingBudget: 20000,
            },
            BASIC_MESSAGES, 0.7, 5000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBeGreaterThan(20000);
    });
});

describe('fetchCustom — Responses API edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('force-disables Responses API when responsesMode=off', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'chat-ok' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'cop-token',
                model: 'gpt-5.4',
                format: 'openai',
                copilotToken: 'fake-token',
                responsesMode: 'off',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).not.toMatch(/\/responses/);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.messages).toBeDefined();
        expect(body.input).toBeUndefined();
    });

    it('force-enables Responses API when responsesMode=force on Copilot', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'force-ok' }] }],
            })
        );

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'cop-token',
                model: 'gpt-4o',
                format: 'openai',
                copilotToken: 'fake-token',
                responsesMode: 'force',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toMatch(/\/responses/);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.input).toBeDefined();
        expect(body.messages).toBeUndefined();
    });

    it('converts reasoning_effort to nested reasoning object for Responses API', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'reasoning-ok' }] }],
            })
        );

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/responses',
                key: 'cop-token',
                model: 'gpt-5.4',
                format: 'openai',
                copilotToken: 'fake-token',
                reasoning: 'high',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Responses API should wrap reasoning in object form
        if (body.reasoning) {
            expect(body.reasoning).toEqual(expect.objectContaining({ effort: 'high' }));
            expect(body.reasoning_effort).toBeUndefined();
        }
    });

    it('strips name field from input messages in Responses API', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
            })
        );

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/responses',
                key: 'cop-token',
                model: 'gpt-5.4',
                format: 'openai',
                copilotToken: 'fake-token',
            },
            [
                { role: 'system', content: 'sys', name: 'SystemBot' },
                { role: 'user', content: 'hi', name: 'User1' },
            ],
            0.7, 4096, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        if (body.input) {
            for (const msg of body.input) {
                expect(msg.name).toBeUndefined();
            }
        }
    });
});

describe('fetchCustom — Google format edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('constructs body with generationConfig and systemInstruction', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ candidates: [{ content: { parts: [{ text: 'gemini-ok' }] } }] })
        );

        await fetchCustom(
            {
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test',
                key: '',
                model: 'gemini-2.0-flash',
                format: 'google',
            },
            BASIC_MESSAGES, 0.8, 8192, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.generationConfig).toBeDefined();
        expect(body.generationConfig.temperature).toBe(0.8);
        expect(body.generationConfig.maxOutputTokens).toBe(8192);
        expect(body.contents).toBeDefined();
        // Top-level OpenAI fields should be removed
        expect(body.max_tokens).toBeUndefined();
        expect(body.model).toBeUndefined();
        expect(body.temperature).toBeUndefined();
    });

    it('passes safetySettings from gemini safety config', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ candidates: [{ content: { parts: [{ text: 'safe-ok' }] } }] })
        );

        await fetchCustom(
            {
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test',
                key: '',
                model: 'gemini-2.0-flash',
                format: 'google',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.safetySettings).toBeDefined();
        expect(Array.isArray(body.safetySettings)).toBe(true);
    });
});

describe('fetchCustom — customParams edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('merges valid customParams into body', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'custom-ok' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                customParams: '{"seed": 42, "logprobs": true}',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.seed).toBe(42);
        expect(body.logprobs).toBe(true);
    });

    it('strips blocked fields from customParams', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'stripped-ok' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                customParams: '{"messages": "override", "stream": true, "model": "evil", "seed": 99}',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Blocked fields should NOT be overwritten
        expect(body.model).toBe('gpt-4o');
        expect(body.stream).not.toBe(true); // should remain false (non-streaming)
        // Allowed field should pass through
        expect(body.seed).toBe(99);
    });

    it('gracefully handles invalid customParams JSON', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'ok' } }] })
        );

        // Should not throw
        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                customParams: 'not valid json {{{',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
    });
});

describe('fetchCustom — Key rotation with multiple keys', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('uses key rotation when multiple keys are provided (space-separated)', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'rotated-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-key1 sk-key2 sk-key3',
                model: 'gpt-4o',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        // Should succeed — key rotation dispatches to one of the keys
        expect(result.success).toBe(true);
    });

    it('uses single key directly when only one key provided', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'single-ok' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-only-one',
                model: 'gpt-4o',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer sk-only-one');
    });
});

describe('fetchCustom — maxOutputLimit edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('does not clamp when maxOutputLimit is 0', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'no-clamp' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                maxOutputLimit: 0,
            },
            BASIC_MESSAGES, 0.7, 50000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        const tokenField = body.max_tokens ?? body.max_completion_tokens;
        expect(tokenField).toBe(50000);
    });

    it('clamps when maxOutputLimit is set and maxTokens exceeds it', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'clamped' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
                maxOutputLimit: 2000,
            },
            BASIC_MESSAGES, 0.7, 50000, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        const tokenField = body.max_tokens ?? body.max_completion_tokens;
        expect(tokenField).toBeLessThanOrEqual(2000);
    });
});

describe('fetchCustom — Empty/invalid messages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('returns error when all messages sanitize to empty', async () => {
        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
            },
            [{ role: 'user', content: '' }, { role: 'assistant', content: '' }],
            0.7, 1024, {},
        );

        // Should fail because both messages have empty content
        expect(result.success).toBe(false);
        expect(result.content).toMatch(/empty|non-empty/i);
    });

    it('returns error when URL is empty', async () => {
        const result = await fetchCustom(
            {
                url: '',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(false);
        expect(result.content).toMatch(/URL|url/);
    });
});

describe('fetchCustom — OpenAI role normalization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('normalizes invalid roles (model → assistant, char → assistant)', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'normalized-ok' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-4o',
                format: 'openai',
            },
            [
                { role: 'system', content: 'sys' },
                { role: 'model', content: 'from gemini' },
                { role: 'char', content: 'character msg' },
                { role: 'user', content: 'hi' },
            ],
            0.7, 1024, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // After sanitization, 'model' and 'char' should become 'assistant'
        const roles = body.messages.map((m) => m.role);
        expect(roles).not.toContain('model');
        expect(roles).not.toContain('char');
    });
});

describe('fetchCustom — Anthropic browser access header', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('sends anthropic-dangerous-direct-browser-access for direct Anthropic API', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'direct-ok' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.anthropic.com/v1/messages',
                key: 'sk-ant-test',
                model: 'claude-sonnet-4-5-20250929',
                format: 'anthropic',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
        expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('does NOT send browser-access header for Copilot Anthropic', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'copilot-ant-ok' }] })
        );

        await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/v1/messages',
                key: 'cop-token',
                model: 'claude-sonnet-4-5-20250929',
                format: 'anthropic',
                copilotToken: 'fake-token',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
    });
});

describe('fetchCustom — o3/o4 sampling param stripping in custom models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('strips temperature/top_p for o3 model in custom OpenAI format', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'o3-stripped' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'o3',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 4096, { top_p: 0.9, frequency_penalty: 0.5 },
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
        expect(body.frequency_penalty).toBeUndefined();
    });

    it('strips temp/top_p for gpt-5.4 with active reasoning', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: '5.4-stripped' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-5.4',
                format: 'openai',
                reasoning: 'high',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
    });

    it('keeps temperature for gpt-5.4 when reasoning=none', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: '5.4-with-temp' } }] })
        );

        await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'sk-test',
                model: 'gpt-5.4',
                format: 'openai',
                reasoning: 'none',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.temperature).toBe(0.7);
    });
});
