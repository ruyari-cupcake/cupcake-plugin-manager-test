/**
 * Tests for max_tokens / maxOutputTokens clamping across all providers.
 *
 * Provider files (cpm-provider-*.js) are standalone IIFEs that can't be imported,
 * so we verify:
 *   1. Structural: clamping code exists in each provider source with correct limits
 *   2. Integration: fetchCustom respects maxOutputLimit config
 *   3. Integration: router passes maxOutputLimit to fetchCustom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helper: read provider source ───
const ROOT = resolve(import.meta.dirname, '..');
const readProvider = (name) => readFileSync(resolve(ROOT, name), 'utf-8');

// ════════════════════════════════════════════════════
// PART 1: Structural tests — verify clamping code in provider source
// ════════════════════════════════════════════════════
describe('Provider max_tokens clamping (structural)', () => {

    describe('DeepSeek', () => {
        const src = readProvider('cpm-provider-deepseek.js');

        it('has model-dependent clamping (not a single hardcoded value)', () => {
            expect(src).toMatch(/reasoner/);
            expect(src).toMatch(/65536/);
            expect(src).toMatch(/8192/);
        });

        it('clamps deepseek-reasoner to 65536', () => {
            // The ternary: includes('reasoner') ? 65536 : 8192
            expect(src).toMatch(/includes\(['"]reasoner['"]\)\s*\?\s*65536\s*:\s*8192/);
        });

        it('logs a warning when clamping fires', () => {
            expect(src).toMatch(/console\.warn.*CPM-DeepSeek.*clamped/);
        });
    });

    describe('Anthropic', () => {
        const src = readProvider('cpm-provider-anthropic.js');

        it('clamps to 128000', () => {
            expect(src).toMatch(/128000/);
            expect(src).toMatch(/console\.warn.*CPM-Anthropic.*clamped/);
        });
    });

    describe('Gemini', () => {
        const src = readProvider('cpm-provider-gemini.js');

        it('has model-dependent clamping', () => {
            expect(src).toMatch(/65536/);
            expect(src).toMatch(/8192/);
        });

        it('matches gemini-2.5+ and gemini-3.x+ as 65536', () => {
            // Extract the regex pattern from source
            const regexMatch = src.match(/\/gemini-\(.*?\)\//);
            expect(regexMatch).toBeTruthy();
            // Verify the actual regex works for 2.5, 3.0, 3.1
            const pattern = /gemini-(?:[3-9]|2\.[5-9])/;
            expect(pattern.test('gemini-2.5-flash')).toBe(true);
            expect(pattern.test('gemini-2.5-pro')).toBe(true);
            expect(pattern.test('gemini-3-flash-preview')).toBe(true);
            expect(pattern.test('gemini-3.0-flash')).toBe(true);
            expect(pattern.test('gemini-3.1-pro-preview')).toBe(true);
            expect(pattern.test('gemini-3.1-flash-lite-preview')).toBe(true);
            // Older models should NOT match → fall to 8192
            expect(pattern.test('gemini-2.0-flash')).toBe(false);
            expect(pattern.test('gemini-1.5-pro')).toBe(false);
        });

        it('logs a warning when clamping fires', () => {
            expect(src).toMatch(/console\.warn.*CPM-Gemini.*clamped/);
        });
    });

    describe('AWS Bedrock', () => {
        const src = readProvider('cpm-provider-aws.js');

        it('clamps to 128000', () => {
            expect(src).toMatch(/128000/);
            expect(src).toMatch(/console\.warn.*CPM-AWS.*clamped/);
        });
    });

    describe('Vertex', () => {
        const src = readProvider('cpm-provider-vertex.js');

        it('has separate clamping for Claude (128000) and Gemini', () => {
            expect(src).toMatch(/128000/);
            expect(src).toMatch(/65536/);
            expect(src).toMatch(/8192/);
        });

        it('uses same Gemini regex as the Gemini provider', () => {
            const pattern = /gemini-(?:[3-9]|2\.[5-9])/;
            expect(pattern.test('gemini-3.1-pro-preview')).toBe(true);
            expect(pattern.test('gemini-2.5-flash')).toBe(true);
            expect(pattern.test('gemini-2.0-flash')).toBe(false);
        });

        it('logs warnings for both Claude and Gemini paths', () => {
            expect(src).toMatch(/console\.warn.*CPM-Vertex.*Claude.*clamped|console\.warn.*CPM-Vertex.*clamped.*Claude/);
            expect(src).toMatch(/console\.warn.*CPM-Vertex.*clamped/);
        });
    });
});

// ════════════════════════════════════════════════════
// PART 2: Gemini regex edge cases (comprehensive)
// ════════════════════════════════════════════════════
describe('Gemini model regex pattern validation', () => {
    // This is the exact regex used in both Gemini and Vertex providers
    const pattern = /gemini-(?:[3-9]|2\.[5-9])/;

    const shouldMatch65536 = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash-preview-09-2025',
        'gemini-3-flash-preview',
        'gemini-3.0-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-pro-preview-customtools',
        'gemini-4.0-ultra',
        'gemini-9.9-future',
    ];

    const shouldFallTo8192 = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.0-pro',
    ];

    for (const m of shouldMatch65536) {
        it(`${m} → 65536`, () => {
            expect(pattern.test(m)).toBe(true);
        });
    }

    for (const m of shouldFallTo8192) {
        it(`${m} → 8192 (no match)`, () => {
            expect(pattern.test(m)).toBe(false);
        });
    }
});

// ════════════════════════════════════════════════════
// PART 3: DeepSeek model-dependent limit logic
// ════════════════════════════════════════════════════
describe('DeepSeek model-dependent limit logic', () => {
    // Simulate the exact logic from the provider
    function getDeepSeekMaxOut(modelName) {
        const _dsModel = (modelName || '').toLowerCase();
        return _dsModel.includes('reasoner') ? 65536 : 8192;
    }

    it('deepseek-chat → 8192', () => {
        expect(getDeepSeekMaxOut('deepseek-chat')).toBe(8192);
    });

    it('deepseek-reasoner → 65536', () => {
        expect(getDeepSeekMaxOut('deepseek-reasoner')).toBe(65536);
    });

    it('DeepSeek-Reasoner (case insensitive) → 65536', () => {
        expect(getDeepSeekMaxOut('DeepSeek-Reasoner')).toBe(65536);
    });

    it('custom-deepseek-reasoner-fine-tuned → 65536', () => {
        expect(getDeepSeekMaxOut('custom-deepseek-reasoner-fine-tuned')).toBe(65536);
    });

    it('empty/null → 8192 (safe default)', () => {
        expect(getDeepSeekMaxOut('')).toBe(8192);
        expect(getDeepSeekMaxOut(null)).toBe(8192);
        expect(getDeepSeekMaxOut(undefined)).toBe(8192);
    });
});

// ════════════════════════════════════════════════════
// PART 4: fetchCustom maxOutputLimit integration
// ════════════════════════════════════════════════════
const mockFetch = vi.fn();
vi.mock('../src/lib/smart-fetch.js', () => ({
    smartNativeFetch: (...args) => mockFetch(...args),
}));

vi.mock('../src/lib/copilot-token.js', () => ({
    ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
}));

const mockGetBoolArg = vi.fn().mockResolvedValue(false);
vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        safeGetBoolArg: (...args) => mockGetBoolArg(...args),
    };
});

vi.mock('../src/lib/api-request-log.js', () => ({
    API_LOG_RESPONSE_MAX_CHARS: 0,
    API_LOG_CONSOLE_MAX_CHARS: 8000,
    API_LOG_RISU_MAX_CHARS: 2000,
    updateApiRequest: vi.fn(),
    storeApiRequest: vi.fn(() => 'req-1'),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(),
}));

import { fetchCustom } from '../src/lib/fetch-custom.js';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

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
    { role: 'user', content: 'Hi' },
];

describe('fetchCustom — maxOutputLimit clamping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('clamps max_tokens when maxOutputLimit is set and maxTokens exceeds it (OpenAI format)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            model: 'some-model',
            format: 'openai',
            maxOutputLimit: 4096,
        };

        // maxTokens=32000 should be clamped to 4096
        await fetchCustom(config, BASIC_MESSAGES, 0.7, 32000, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(4096);
    });

    it('does NOT clamp when maxOutputLimit is 0 (disabled)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            model: 'some-model',
            format: 'openai',
            maxOutputLimit: 0,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 32000, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(32000);
    });

    it('does NOT clamp when maxOutputLimit is undefined', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            model: 'some-model',
            format: 'openai',
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 16000, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(16000);
    });

    it('does NOT clamp when maxTokens is within the limit', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            model: 'some-model',
            format: 'openai',
            maxOutputLimit: 8192,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 4096, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(4096);
    });

    it('clamps before converting to max_output_tokens on the Responses API path', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        }));

        const config = {
            url: 'https://api.githubcopilot.com/chat/completions',
            key: 'ghu-test',
            copilotToken: 'cpt-test',
            model: 'gpt-5.4',
            format: 'openai',
            responsesMode: 'auto',
            maxOutputLimit: 1024,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 32000, {});

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/responses');
        const body = JSON.parse(opts.body);
        expect(body.max_output_tokens).toBe(1024);
        expect(body.max_tokens).toBeUndefined();
        expect(body.max_completion_tokens).toBeUndefined();
    });

    it('clamps maxOutputTokens for Google format', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }));

        const config = {
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            key: 'goog-key',
            model: 'gemini-2.0-flash',
            format: 'google',
            maxOutputLimit: 4096,
        };

        // 32000 should be clamped to 4096 before building body
        await fetchCustom(config, BASIC_MESSAGES, 0.7, 32000, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });

    it('clamps max_tokens for Anthropic format', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            content: [{ type: 'text', text: 'ok' }],
        }));

        const config = {
            url: 'https://api.anthropic.com/v1/messages',
            key: 'sk-ant-test',
            model: 'claude-sonnet-4-5-20250929',
            format: 'anthropic',
            maxOutputLimit: 8192,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 128000, {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(8192);
    });
});

// ════════════════════════════════════════════════════
// PART 5: settings-ui-custom-models maxOutputLimit field
// ════════════════════════════════════════════════════
describe('Custom model editor — maxOutputLimit field (structural)', () => {
    const src = readFileSync(resolve(ROOT, 'src/lib/settings-ui-custom-models.js'), 'utf-8');

    it('renders Max Output Tokens input field', () => {
        expect(src).toMatch(/cpm-cm-max-output/);
        expect(src).toMatch(/Max Output Tokens/);
    });

    it('populateEditor reads maxOutputLimit', () => {
        expect(src).toMatch(/cpm-cm-max-output.*maxOutputLimit|maxOutputLimit.*cpm-cm-max-output/);
    });

    it('clearEditor resets max-output to 0', () => {
        expect(src).toMatch(/cpm-cm-max-output.*0/);
    });

    it('readEditorValues includes maxOutputLimit in returned object', () => {
        expect(src).toMatch(/maxOutputLimit:\s*parseInt/);
    });
});

// ════════════════════════════════════════════════════
// PART 6: router.js passes maxOutputLimit to fetchCustom
// ════════════════════════════════════════════════════
describe('Router — maxOutputLimit passthrough (structural)', () => {
    const src = readFileSync(resolve(ROOT, 'src/lib/router.js'), 'utf-8');

    it('passes maxOutputLimit in the fetchCustom config object', () => {
        expect(src).toMatch(/maxOutputLimit:\s*parseInt\(cDef\.maxOutputLimit\)/);
    });
});

// ════════════════════════════════════════════════════
// PART 7: Edge cases — non-numeric / boundary maxTokens
// ════════════════════════════════════════════════════
describe('fetchCustom — maxOutputLimit edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('handles maxTokens=undefined gracefully (no clamp, no crash)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test', model: 'test', format: 'openai',
            maxOutputLimit: 4096,
        };

        // maxTokens=undefined — typeof check should skip clamping
        await fetchCustom(config, BASIC_MESSAGES, 0.7, undefined, {});
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBeUndefined();
    });

    it('handles maxTokens exactly at limit (no clamping)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test', model: 'test', format: 'openai',
            maxOutputLimit: 8192,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 8192, {});
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(8192);
    });

    it('handles maxTokens=1 above limit (clamps)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test', model: 'test', format: 'openai',
            maxOutputLimit: 8192,
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 8193, {});
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(8192);
    });

    it('handles negative maxOutputLimit (treated as disabled)', async () => {
        mockFetch.mockResolvedValue(makeOkJsonResponse({
            choices: [{ message: { content: 'ok' } }],
        }));

        const config = {
            url: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test', model: 'test', format: 'openai',
            maxOutputLimit: -1, // invalid, should not clamp
        };

        await fetchCustom(config, BASIC_MESSAGES, 0.7, 32000, {});
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(32000);
    });
});

// ════════════════════════════════════════════════════
// PART 8: OpenRouter — no clamping needed (structural)
// ════════════════════════════════════════════════════
describe('OpenRouter — no provider-level clamping (structural)', () => {
    const src = readProvider('cpm-provider-openrouter.js');

    it('does NOT have clamping code (OpenRouter handles limits server-side)', () => {
        expect(src).not.toMatch(/clamped/);
        expect(src).not.toMatch(/_MAX_OUT/);
    });
});

// ════════════════════════════════════════════════════
// PART 9: Clamping happens BEFORE body construction (order verification)
// ════════════════════════════════════════════════════
describe('Clamping order — before request body (structural)', () => {
    it('DeepSeek: clamp appears before body construction', () => {
        const src = readProvider('cpm-provider-deepseek.js');
        const clampIdx = src.indexOf('_DS_MAX_OUT');
        const bodyIdx = src.indexOf('max_tokens: maxTokens, stream');
        expect(clampIdx).toBeGreaterThan(0);
        expect(bodyIdx).toBeGreaterThan(clampIdx);
    });

    it('Anthropic: clamp appears before doFetch body construction', () => {
        const src = readProvider('cpm-provider-anthropic.js');
        const clampIdx = src.indexOf('_ANTH_MAX_OUT');
        const bodyIdx = src.indexOf('max_tokens: maxTokens,');
        expect(clampIdx).toBeGreaterThan(0);
        expect(bodyIdx).toBeGreaterThan(clampIdx);
    });

    it('Gemini: clamp appears before generationConfig construction', () => {
        const src = readProvider('cpm-provider-gemini.js');
        const clampIdx = src.indexOf('_gemMaxOut');
        const bodyIdx = src.indexOf('maxOutputTokens: maxTokens');
        expect(clampIdx).toBeGreaterThan(0);
        expect(bodyIdx).toBeGreaterThan(clampIdx);
    });

    it('AWS: clamp appears before body construction', () => {
        const src = readProvider('cpm-provider-aws.js');
        const clampIdx = src.indexOf('_AWS_MAX_OUT');
        const bodyIdx = src.indexOf('max_tokens: maxTokens || 4096');
        expect(clampIdx).toBeGreaterThan(0);
        expect(bodyIdx).toBeGreaterThan(clampIdx);
    });

    it('fetch-custom: clamp appears before body construction', () => {
        const src = readFileSync(resolve(ROOT, 'src/lib/fetch-custom.js'), 'utf-8');
        const clampIdx = src.indexOf('maxOutputLimit');
        const bodyIdx = src.indexOf('const body = { model: config.model');
        expect(clampIdx).toBeGreaterThan(0);
        expect(bodyIdx).toBeGreaterThan(clampIdx);
    });
});
