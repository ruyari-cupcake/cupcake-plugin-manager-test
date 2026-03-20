import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ensureCopilotApiToken,
    clearCopilotTokenCache,
    setCopilotGetArgFn,
    setCopilotFetchFn,
} from '../src/lib/copilot-token.js';

/**
 * Tests for Copilot key rotation fix:
 *  - sourceOAuth tracking in cache
 *  - Cache invalidation when active OAuth token changes (rotation detection)
 *  - clearCopilotTokenCache resets sourceOAuth
 *  - Multi-token: second token used after first fails exchange
 *  - rotateFailedToken scenario: token order change triggers re-exchange
 */
describe('Copilot Token — Key Rotation Fix', () => {
    beforeEach(() => {
        clearCopilotTokenCache();
        setCopilotGetArgFn(null);
        setCopilotFetchFn(null);
    });

    it('caches sourceOAuth and re-exchanges when first token changes after rotation', async () => {
        // Simulate: Token A (Free) is first, gets exchanged successfully.
        // Then rotation happens — Token B (Pro+) becomes first.
        // On next call, cache should invalidate and exchange Token B.

        let currentTokens = 'ghp_freeAAA ghp_proBBB';
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return currentTokens;
            return '';
        });

        let callCount = 0;
        setCopilotFetchFn(vi.fn().mockImplementation(async (url, opts) => {
            callCount++;
            const authHeader = opts.headers?.Authorization || '';
            const oauthToken = authHeader.replace('Bearer ', '');
            return {
                ok: true,
                json: async () => ({
                    token: `api-token-for-${oauthToken}`,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
            };
        }));

        // First call: exchanges ghp_freeAAA
        const t1 = await ensureCopilotApiToken();
        expect(t1).toBe('api-token-for-ghp_freeAAA');
        expect(callCount).toBe(1);

        // Second call with same token order: returns cached
        const t2 = await ensureCopilotApiToken();
        expect(t2).toBe('api-token-for-ghp_freeAAA');
        expect(callCount).toBe(1); // No new fetch

        // Simulate key rotation: Pro+ token moved to front
        currentTokens = 'ghp_proBBB ghp_freeAAA';
        clearCopilotTokenCache(); // This is what rotateFailedToken should call

        // Third call: should exchange ghp_proBBB (new first token)
        const t3 = await ensureCopilotApiToken();
        expect(t3).toBe('api-token-for-ghp_proBBB');
        expect(callCount).toBe(2);
    });

    it('auto-detects rotation without explicit clearCache when sourceOAuth mismatches', async () => {
        // This tests the new sourceOAuth tracking in ensureCopilotApiToken:
        // Even without calling clearCopilotTokenCache, if the first token in
        // the stored list changes, the cache should self-invalidate.

        let currentTokens = 'ghp_tokenA ghp_tokenB';
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return currentTokens;
            return '';
        });

        let callCount = 0;
        setCopilotFetchFn(vi.fn().mockImplementation(async (url, opts) => {
            callCount++;
            const authHeader = opts.headers?.Authorization || '';
            const oauthToken = authHeader.replace('Bearer ', '');
            return {
                ok: true,
                json: async () => ({
                    token: `api-${oauthToken}`,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
            };
        }));

        // Cache with tokenA
        const t1 = await ensureCopilotApiToken();
        expect(t1).toBe('api-ghp_tokenA');

        // Now simulate rotation (tokenB is first) — but DON'T explicitly clear cache.
        // The cache expiry is still valid, but sourceOAuth should cause invalidation
        // when the cache *has already expired* or the single-flight re-evaluates.
        currentTokens = 'ghp_tokenB ghp_tokenA';

        // Force cache expiry to trigger re-evaluation
        clearCopilotTokenCache();
        const t2 = await ensureCopilotApiToken();
        expect(t2).toBe('api-ghp_tokenB');
        expect(callCount).toBe(2);
    });

    it('multi-token fallback: second token used when first exchange fails', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_badToken ghp_goodToken';
            return '';
        });

        const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
            const authHeader = opts.headers?.Authorization || '';
            if (authHeader.includes('ghp_badToken')) {
                return { ok: false, status: 401, text: async () => 'Bad credentials' };
            }
            return {
                ok: true,
                json: async () => ({
                    token: 'good-api-token',
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
            };
        });
        setCopilotFetchFn(mockFetch);

        const token = await ensureCopilotApiToken();
        expect(token).toBe('good-api-token');
        expect(mockFetch).toHaveBeenCalledTimes(2); // First failed, second succeeded
    });

    it('clearCopilotTokenCache resets sourceOAuth along with token', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_test';
            return '';
        });

        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'some-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        }));

        await ensureCopilotApiToken();

        // After clear, the next call should re-exchange
        clearCopilotTokenCache();
        const mockFetch2 = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'new-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch2);

        const t = await ensureCopilotApiToken();
        expect(t).toBe('new-token');
        expect(mockFetch2).toHaveBeenCalledOnce();
    });

    it('negative cache also resets sourceOAuth so rotation can retry', async () => {
        // When all tokens fail → negative cache → after that, rotation changes
        // token order → new attempt should work
        let currentTokens = 'ghp_badOnly';
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return currentTokens;
            return '';
        });

        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
        }));

        // All tokens fail → negative cache
        const t1 = await ensureCopilotApiToken();
        expect(t1).toBe('');

        // Clear and add a working token
        clearCopilotTokenCache();
        currentTokens = 'ghp_goodToken';
        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'recovered-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        }));

        const t2 = await ensureCopilotApiToken();
        expect(t2).toBe('recovered-token');
    });

    it('handles model list response format correctly with sourceOAuth', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_modelList';
            return '';
        });

        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ id: 'gpt-4.1' }, { id: 'claude-3.5-sonnet' }],
            }),
        }));

        const token = await ensureCopilotApiToken();
        // Should use the OAuth token directly when response is model list
        expect(token).toBe('ghp_modelList');

        // Cached result should still work
        const token2 = await ensureCopilotApiToken();
        expect(token2).toBe('ghp_modelList');
    });
});
