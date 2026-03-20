/**
 * fetch-custom-branch-coverage.test.js
 * ─────────────────────────────────────
 * HD-2: Branch coverage improvement for fetch-custom.js
 * Targets uncovered branches at lines ~86, ~441-442, ~472, ~462-467
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (same pattern as fetch-custom-edge.test.js) ──
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

// ═══════════════════════════════════════════════════════════════════
// Scenario 10: developerRole regex — gpt-5 model sets config.developerRole=true
//   Target: line ~93 (the regex branch inside `else` for openai format)
// ═══════════════════════════════════════════════════════════════════
describe('fetchCustom — developerRole regex for gpt-5 models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('sets developerRole=true for models matching gpt-5 pattern', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'dev-role-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'test-key',
                model: 'gpt-5',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
        // Verify the body was sent — the developerRole flag transforms system
        // messages to "developer" role in formatToOpenAI
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        const devMsg = sentBody.messages?.find(m => m.role === 'developer');
        expect(devMsg).toBeDefined();
        expect(devMsg.content).toBe('You are helpful.');
    });

    it('sets developerRole=true for o2-mini model variant', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'o2-ok' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.openai.com/v1/chat/completions',
                key: 'test-key',
                model: 'o2-mini',
                format: 'openai',
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(true);
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        const devMsg = sentBody.messages?.find(m => m.role === 'developer');
        expect(devMsg).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 11: Copilot token exchange failure (lines ~441-442)
//   The `else` path when copilotApiToken is empty after ensureCopilotApiToken
// ═══════════════════════════════════════════════════════════════════
describe('fetchCustom — Copilot token exchange failure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('returns failure when copilotToken is empty and ensureCopilotApiToken returns empty', async () => {
        // No copilotToken in config, ensureCopilotApiToken mock returns ''
        mockEnsureCopilotApiToken.mockResolvedValueOnce('');

        const result = await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'ghu_oauth_raw',
                model: 'gpt-4o',
                format: 'openai',
                // no copilotToken — forces ensureCopilotApiToken call
            },
            BASIC_MESSAGES, 0.7, 1024, {},
        );

        expect(result.success).toBe(false);
        expect(result.content).toContain('토큰 교환 실패');
        // smartNativeFetch should NOT have been called — we bail early
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 12: Anthropic format via CORS proxy → only anthropic-version header
//   Target: line ~472 — `_isCopilotAnthropic && _isProxied` branch
// ═══════════════════════════════════════════════════════════════════
describe('fetchCustom — Anthropic via CORS proxy headers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('sets only anthropic-version header (no beta/direct-access) when proxied + copilot domain', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ content: [{ type: 'text', text: 'proxy-anthropic-ok' }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'ghu_token',
                model: 'claude-sonnet-4-20250514',
                format: 'anthropic',
                copilotToken: 'fake-copilot-token',
                proxyUrl: 'https://my-cors-proxy.example.com',
            },
            BASIC_MESSAGES, 0.7, 16000, {},
        );

        expect(result.success).toBe(true);
        const sentHeaders = mockFetch.mock.calls[0][1].headers;
        expect(sentHeaders['anthropic-version']).toBe('2023-06-01');
        // Should NOT have anthropic-beta since this goes through CORS proxy
        expect(sentHeaders['anthropic-beta']).toBeUndefined();
        // Should NOT have anthropic-dangerous-direct-browser-access
        expect(sentHeaders['anthropic-dangerous-direct-browser-access']).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 13: Copilot vision content detection (lines ~462-467)
//   Messages with image_url parts → Copilot-Vision-Request header
// ═══════════════════════════════════════════════════════════════════
describe('fetchCustom — Copilot vision content detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetArg.mockResolvedValue('');
        mockGetBoolArg.mockResolvedValue(false);
    });

    it('sends Copilot-Vision-Request header when messages contain image_url parts', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'vision-ok' } }] })
        );

        const visionMessages = [
            { role: 'system', content: 'Describe what you see.' },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this?' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
                ],
            },
        ];

        const result = await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'ghu_token',
                model: 'gpt-4o',
                format: 'openai',
                copilotToken: 'fake-copilot-token',
            },
            visionMessages, 0.7, 4096, {},
        );

        expect(result.success).toBe(true);
        const sentHeaders = mockFetch.mock.calls[0][1].headers;
        expect(sentHeaders['Copilot-Vision-Request']).toBe('true');
    });

    it('does NOT send Copilot-Vision-Request when messages have no image parts', async () => {
        mockFetch.mockResolvedValueOnce(
            makeOkJsonResponse({ choices: [{ message: { content: 'text-only' } }] })
        );

        const result = await fetchCustom(
            {
                url: 'https://api.githubcopilot.com/chat/completions',
                key: 'ghu_token',
                model: 'gpt-4o',
                format: 'openai',
                copilotToken: 'fake-copilot-token',
            },
            BASIC_MESSAGES, 0.7, 4096, {},
        );

        expect(result.success).toBe(true);
        const sentHeaders = mockFetch.mock.calls[0][1].headers;
        expect(sentHeaders['Copilot-Vision-Request']).toBeUndefined();
    });
});
