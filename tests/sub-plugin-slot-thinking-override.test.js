/**
 * sub-plugin-slot-thinking-override.test.js
 * Verifies that sub-plugin fetchers respect args._cpmSlotThinkingConfig
 * (slot-specific thinking/reasoning overrides from handleRequest).
 *
 * Covers: Vertex, Gemini, OpenAI, Anthropic, AWS, OpenRouter
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const readProvider = (name) => readFileSync(resolve(ROOT, name), 'utf-8');

function makeJsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => 'application/json' },
        json: vi.fn(async () => body),
        text: vi.fn(async () => JSON.stringify(body)),
        body: null,
    };
}

function installProvider(providerFile, {
    safeArgs = {},
    safeBools = {},
    fetchImpl = vi.fn(),
    nativeFetchImpl = vi.fn(),
    keyRotationValue = 'test-key',
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
        formatToAnthropic: vi.fn(() => ({
            messages: [{ role: 'user', content: 'hello' }],
            system: 'sys',
        })),
        formatToGemini: vi.fn((msgs) => ({
            contents: msgs.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'model' : m.role,
                parts: [{ text: m.content }],
            })),
            systemInstruction: msgs.filter(m => m.role === 'system').map(m => m.content),
        })),
        parseOpenAINonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.choices?.[0]?.message?.content || 'ok',
        })),
        parseResponsesAPINonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.output?.[0]?.content?.[0]?.text || 'ok',
        })),
        parseClaudeNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.content?.map((p) => p.text || '').join('') || 'ok',
        })),
        parseGeminiNonStreamingResponse: vi.fn((data) => ({
            success: true,
            content: data?.candidates?.[0]?.content?.parts?.[0]?.text || 'ok',
        })),
        buildGeminiThinkingConfig: vi.fn((model, thinking, _budget) => {
            if (thinking && thinking !== 'off' && thinking !== 'none') {
                return { thinkingLevel: String(thinking).toUpperCase(), includeThoughts: true };
            }
            return null;
        }),
        getGeminiSafetySettings: vi.fn(() => []),
        validateGeminiParams: vi.fn(),
        cleanExperimentalModelParams: vi.fn(),
        createOpenAISSEStream: vi.fn(() => 'STREAM'),
        createResponsesAPISSEStream: vi.fn(() => 'STREAM'),
        createAnthropicSSEStream: vi.fn(() => 'STREAM'),
        createSSEStream: vi.fn(() => 'STREAM'),
        safeUUID: vi.fn(() => 'uuid-1'),
        _needsCopilotResponsesAPI: vi.fn(() => false),
        AwsV4Signer: class {
            constructor(config) { this.config = config; }
            async sign() {
                return { url: this.config.url, method: this.config.method, headers: this.config.headers || {}, body: this.config.body };
            }
        },
    };

    const windowObj = {
        CupcakePM,
        Risuai: { nativeFetch: nativeFetchImpl, risuFetch: vi.fn() },
        risuai: { nativeFetch: nativeFetchImpl, risuFetch: vi.fn() },
    };

    const source = readProvider(providerFile);
    const runner = new Function('window', source);
    runner(windowObj);

    if (!registeredProvider) throw new Error(`Provider ${providerFile} did not register`);
    return { provider: registeredProvider, CupcakePM, windowObj };
}

const messages = [{ role: 'user', content: 'Translate this to Korean' }];

// ═══════════════════════════════════════════════════════
//  Vertex AI — structural verification (auth too complex for unit test)
// ═══════════════════════════════════════════════════════
describe('Vertex AI — slot thinking override (structural)', () => {
    it('reads _cpmSlotThinkingConfig for thinking_level', () => {
        const source = readProvider('cpm-provider-vertex.js');
        expect(source).toMatch(/_cpmSlotThinkingConfig/);
        expect(source).toMatch(/_so\.thinking_level/);
    });

    it('reads _cpmSlotThinkingConfig for thinkingBudget', () => {
        const source = readProvider('cpm-provider-vertex.js');
        expect(source).toMatch(/_so\.thinkingBudget/);
    });

    it('reads _cpmSlotThinkingConfig for effort (Claude path)', () => {
        const source = readProvider('cpm-provider-vertex.js');
        expect(source).toMatch(/_so\.effort/);
    });
});

// ═══════════════════════════════════════════════════════
//  Gemini Studio — slot thinking_level override
// ═══════════════════════════════════════════════════════
describe('Gemini Studio — slot thinking override', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('slot thinking_level=HIGH overrides global LOW', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
        );
        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeArgs: { cpm_gemini_thinking_level: 'LOW', cpm_gemini_thinking_budget: '4096' },
            fetchImpl,
            nativeFetchImpl: fetchImpl,
            keyRotationValue: 'test-gemini-key',
        });

        await provider.fetcher(
            { id: 'gemini-2.5-flash' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { thinking_level: 'HIGH' } },
            undefined, 'req-1',
        );

        expect(CupcakePM.buildGeminiThinkingConfig).toHaveBeenCalled();
        const [, thinkingArg] = CupcakePM.buildGeminiThinkingConfig.mock.calls[0];
        expect(thinkingArg).toBe('HIGH');
    });

    it('no slot override → uses global LOW', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
        );
        const { provider, CupcakePM } = installProvider('cpm-provider-gemini.js', {
            safeArgs: { cpm_gemini_thinking_level: 'LOW' },
            fetchImpl,
            nativeFetchImpl: fetchImpl,
            keyRotationValue: 'test-gemini-key',
        });

        await provider.fetcher(
            { id: 'gemini-2.5-flash' }, messages, 0.7, 1024,
            {},
            undefined, 'req-1',
        );

        const [, thinkingArg] = CupcakePM.buildGeminiThinkingConfig.mock.calls[0];
        expect(thinkingArg).toBe('LOW');
    });
});

// ═══════════════════════════════════════════════════════
//  OpenAI — slot reasoning override
// ═══════════════════════════════════════════════════════
describe('OpenAI — slot reasoning override', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('slot reasoning=high overrides global low', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_reasoning: 'low' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'o3' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { reasoning: 'high' } },
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning_effort).toBe('high');
    });

    it('no slot override → uses global low', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_reasoning: 'low' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'o3' }, messages, 0.7, 1024,
            {},
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning_effort).toBe('low');
    });

    it('slot verbosity=high overrides global low (gpt-5 model)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello' } }] })
        );
        const { provider } = installProvider('cpm-provider-openai.js', {
            safeArgs: { cpm_openai_verbosity: 'low' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'gpt-5' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { verbosity: 'high' } },
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.verbosity).toBe('high');
    });
});

// ═══════════════════════════════════════════════════════
//  Anthropic — slot effort override
// ═══════════════════════════════════════════════════════
describe('Anthropic — slot effort override', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('slot effort=max overrides global medium (adaptive model)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ text: 'hello' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_thinking_effort: 'medium' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-6-20250514' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { effort: 'max' } },
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.thinking?.type).toBe('adaptive');
        expect(body.output_config?.effort).toBe('max');
    });

    it('no slot override → uses global medium (adaptive model)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ text: 'hello' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_thinking_effort: 'medium' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-sonnet-4-6-20250514' }, messages, 0.7, 1024,
            {},
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.thinking?.type).toBe('adaptive');
        expect(body.output_config?.effort).toBe('medium');
    });

    it('slot thinkingBudget=16000 overrides global 4096 (non-adaptive)', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ content: [{ text: 'hello' }] })
        );
        const { provider } = installProvider('cpm-provider-anthropic.js', {
            safeArgs: { cpm_anthropic_thinking_budget: '4096' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'claude-3-5-sonnet-20241022' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { thinkingBudget: 16000 } },
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.thinking?.type).toBe('enabled');
        expect(body.thinking?.budget_tokens).toBe(16000);
    });
});

// ═══════════════════════════════════════════════════════
//  AWS Bedrock — structural verification (auth too complex for unit test)
// ═══════════════════════════════════════════════════════
describe('AWS Bedrock — slot effort override (structural)', () => {
    it('reads _cpmSlotThinkingConfig for effort and thinkingBudget', () => {
        const source = readProvider('cpm-provider-aws.js');
        expect(source).toMatch(/_cpmSlotThinkingConfig/);
        expect(source).toMatch(/_so\.effort/);
        expect(source).toMatch(/_so\.thinkingBudget/);
    });
});

// ═══════════════════════════════════════════════════════
//  OpenRouter — slot reasoning override
// ═══════════════════════════════════════════════════════
describe('OpenRouter — slot reasoning override', () => {
    let originalWindow;
    beforeEach(() => { vi.restoreAllMocks(); originalWindow = globalThis.window; });
    afterEach(() => { globalThis.window = originalWindow; });

    it('slot reasoning=high overrides global low', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello' } }] })
        );
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: { cpm_openrouter_reasoning: 'low', cpm_openrouter_model: 'anthropic/claude-sonnet-4' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'openrouter-dynamic' }, messages, 0.7, 1024,
            { _cpmSlotThinkingConfig: { reasoning: 'high' } },
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning?.effort).toBe('high');
    });

    it('no slot override → uses global low', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(
            makeJsonResponse({ choices: [{ message: { content: 'hello' } }] })
        );
        const { provider } = installProvider('cpm-provider-openrouter.js', {
            safeArgs: { cpm_openrouter_reasoning: 'low', cpm_openrouter_model: 'anthropic/claude-sonnet-4' },
            fetchImpl,
        });

        await provider.fetcher(
            { id: 'openrouter-dynamic' }, messages, 0.7, 1024,
            {},
            undefined, 'req-1',
        );

        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.reasoning?.effort).toBe('low');
    });
});
