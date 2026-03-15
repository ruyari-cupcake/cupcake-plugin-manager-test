import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ensureCopilotApiToken,
    clearCopilotTokenCache,
    setCopilotGetArgFn,
    setCopilotFetchFn,
} from '../src/lib/copilot-token.js';

describe('Copilot Token', () => {
    beforeEach(() => {
        clearCopilotTokenCache();
        setCopilotGetArgFn(null);
        setCopilotFetchFn(null);
    });

    it('returns empty string when no getArg function configured', async () => {
        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });

    it('returns empty string when no GitHub token stored', async () => {
        setCopilotGetArgFn(async () => '');
        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });

    it('exchanges OAuth token for API token', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'copilot-api-token-123',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        const token = await ensureCopilotApiToken();
        expect(token).toBe('copilot-api-token-123');
        expect(mockFetch).toHaveBeenCalledOnce();
        expect(mockFetch.mock.calls[0][0]).toContain('copilot_internal/v2/token');
    });

    it('returns cached token on second call', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'cached-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        await ensureCopilotApiToken();
        const token2 = await ensureCopilotApiToken();
        expect(token2).toBe('cached-token');
        expect(mockFetch).toHaveBeenCalledOnce(); // Only one fetch
    });

    it('deduplicates concurrent token exchange requests', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        let resolveFetch;
        const mockFetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
            resolveFetch = () => resolve({
                ok: true,
                json: async () => ({
                    token: 'single-flight-token',
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
            });
        }));
        setCopilotFetchFn(mockFetch);

        const p1 = ensureCopilotApiToken();
        const p2 = ensureCopilotApiToken();
        const p3 = ensureCopilotApiToken();

        await Promise.resolve();
        await Promise.resolve();
        expect(mockFetch).toHaveBeenCalledOnce();

        resolveFetch();
        const [t1, t2, t3] = await Promise.all([p1, p2, p3]);

        expect(t1).toBe('single-flight-token');
        expect(t2).toBe('single-flight-token');
        expect(t3).toBe('single-flight-token');
        expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('returns empty string on fetch failure', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
        }));

        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });

    it('returns empty string when response has no token field', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        setCopilotFetchFn(vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ /* no token */ }),
        }));

        const token = await ensureCopilotApiToken();
        expect(token).toBe('');
    });

    it('clearCopilotTokenCache forces re-fetch', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            return '';
        });

        let callCount = 0;
        setCopilotFetchFn(vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                ok: true,
                json: async () => ({
                    token: `token-${callCount}`,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
            };
        }));

        const t1 = await ensureCopilotApiToken();
        expect(t1).toBe('token-1');

        clearCopilotTokenCache();
        const t2 = await ensureCopilotApiToken();
        expect(t2).toBe('token-2');
    });

    it('sanitizes non-ASCII characters from token', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_test\u200Btoken'; // zero-width space
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'clean-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        const token = await ensureCopilotApiToken();
        expect(token).toBe('clean-token');
        // Verify the Authorization header was sent with cleaned token
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer ghp_testtoken');
    });

    it('reduces token exchange headers in nodeless-1 mode', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            if (key === 'cpm_copilot_nodeless_mode') return 'nodeless-1';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'nodeless-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        const token = await ensureCopilotApiToken();
        expect(token).toBe('nodeless-token');

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer ghp_testtoken');
        expect(headers['User-Agent']).toBeTruthy();
        expect(headers['Editor-Version']).toBeUndefined();
        expect(headers['Editor-Plugin-Version']).toBeUndefined();
        expect(headers['X-GitHub-Api-Version']).toBeUndefined();
    });

    it('reduces token exchange headers in nodeless-2 mode (same reduction as nodeless-1)', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            if (key === 'cpm_copilot_nodeless_mode') return 'nodeless-2';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'nodeless2-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        const token = await ensureCopilotApiToken();
        expect(token).toBe('nodeless2-token');

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer ghp_testtoken');
        expect(headers['User-Agent']).toBeTruthy();
        expect(headers['Editor-Version']).toBeUndefined();
        expect(headers['Editor-Plugin-Version']).toBeUndefined();
        expect(headers['X-GitHub-Api-Version']).toBeUndefined();
    });

    it('keeps full token exchange headers when mode is off', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            if (key === 'cpm_copilot_nodeless_mode') return 'off';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'full-headers-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        await ensureCopilotApiToken();

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Editor-Version']).toMatch(/^vscode\//); 
        expect(headers['Editor-Plugin-Version']).toMatch(/^copilot-chat\//); 
        expect(headers['X-GitHub-Api-Version']).toBeTruthy();
    });

    it('falls back to full headers for unknown/garbage mode value', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            if (key === 'cpm_copilot_nodeless_mode') return 'banana';
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'fallback-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        await ensureCopilotApiToken();

        const headers = mockFetch.mock.calls[0][1].headers;
        // Unknown value should normalize to 'off' → full headers
        expect(headers['Editor-Version']).toBeDefined();
        expect(headers['Editor-Plugin-Version']).toBeDefined();
        expect(headers['X-GitHub-Api-Version']).toBeDefined();
    });

    it('keeps full headers when nodeless mode returns empty/null from getArg', async () => {
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghp_testtoken';
            // cpm_copilot_nodeless_mode not set → returns ''
            return '';
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                token: 'default-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        });
        setCopilotFetchFn(mockFetch);

        await ensureCopilotApiToken();

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Editor-Version']).toBeDefined();
        expect(headers['Editor-Plugin-Version']).toBeDefined();
    });
});
