/**
 * Deep coverage tests for copilot-token.js
 * Covers: model list response format (data.data array), 
 * endpoints.api preservation, window globals, all uncovered branches.
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    ensureCopilotApiToken,
    setCopilotGetArgFn,
    setCopilotFetchFn,
    clearCopilotTokenCache,
} from '../src/lib/copilot-token.js';

describe('Copilot Token — deep branch coverage', () => {
    beforeEach(() => {
        clearCopilotTokenCache();
        setCopilotGetArgFn(null);
        setCopilotFetchFn(null);
    });

    it('handles model list response (data.data array) — uses OAuth token directly', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_valid_oauth_token';
            return '';
        });
        setCopilotFetchFn(async (_url, _opts) => ({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'gpt-4o', object: 'model' },
                    { id: 'claude-3', object: 'model' },
                ],
            }),
            text: async () => 'model list',
        }));

        const token = await ensureCopilotApiToken();
        // When response is model list (no .token field), should use OAuth token directly
        expect(token).toBe('ghu_valid_oauth_token');
    });

    it('preserves endpoints.api in window._cpmCopilotApiBase', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_test';
            return '';
        });
        setCopilotFetchFn(async () => ({
            ok: true,
            json: async () => ({
                token: 'tid_api_token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                endpoints: { api: 'https://custom.copilot.api.com/' },
            }),
            text: async () => '',
        }));

        const token = await ensureCopilotApiToken();
        expect(token).toBe('tid_api_token');
        // Check window globals
        expect(window._cpmCopilotApiToken).toBe('tid_api_token');
        expect(window._cpmCopilotApiBase).toBe('https://custom.copilot.api.com');
    });

    it('handles response without expires_at (defaults to 30 min)', async () => {
        const _now = Date.now();
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_test';
            return '';
        });
        setCopilotFetchFn(async () => ({
            ok: true,
            json: async () => ({ token: 'tid_no_expiry' }),
            text: async () => '',
        }));

        const token = await ensureCopilotApiToken();
        expect(token).toBe('tid_no_expiry');
        // On next call, should still be cached (within 30 min window)
        const token2 = await ensureCopilotApiToken();
        expect(token2).toBe('tid_no_expiry');
    });

    it('strips non-ASCII characters from GitHub token before use', async () => {
        let capturedAuth = '';
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_test\u200B\u00FF_token';
            return '';
        });
        setCopilotFetchFn(async (url, opts) => {
            capturedAuth = opts.headers.Authorization;
            return {
                ok: true,
                json: async () => ({ token: 'tid_clean' }),
                text: async () => '',
            };
        });

        await ensureCopilotApiToken();
        // Non-ASCII should be stripped
        expect(capturedAuth).toBe('Bearer ghu_test_token');
    });

    it('returns empty string when cleaned token is empty (only non-ASCII chars)', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return '\u200B\u00FF\u2028';
            return '';
        });

        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });

    it('handles concurrent token exchange (single-flight)', async () => {
        let resolveExchange;
        const exchangeReady = new Promise(r => { resolveExchange = r; });
        let callCount = 0;
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_concurrent';
            return '';
        });
        setCopilotFetchFn(async () => {
            callCount++;
            await exchangeReady;
            return {
                ok: true,
                json: async () => ({ token: 'tid_concurrent' }),
                text: async () => '',
            };
        });

        const p1 = ensureCopilotApiToken();
        const p2 = ensureCopilotApiToken();
        resolveExchange();
        const [t1, t2] = await Promise.all([p1, p2]);
        expect(t1).toBe('tid_concurrent');
        expect(t2).toBe('tid_concurrent');
        expect(callCount).toBe(1); // Only one exchange should happen
    });

    it('returns empty string when single-flight promise rejects', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_fail';
            return '';
        });
        setCopilotFetchFn(async () => {
            throw new Error('network error');
        });

        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });
});
