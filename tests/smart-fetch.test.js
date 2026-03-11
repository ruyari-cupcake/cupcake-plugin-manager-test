import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRisu, mockSafeGetBoolArg } = vi.hoisted(() => ({
    mockRisu: {
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
    },
    mockSafeGetBoolArg: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: mockRisu,
    safeGetBoolArg: mockSafeGetBoolArg,
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: vi.fn().mockResolvedValue(true),
}));

import { smartNativeFetch, _resetCompatibilityCache } from '../src/lib/smart-fetch.js';

describe('smartNativeFetch — Copilot duplicate replay guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetCompatibilityCache();
        mockSafeGetBoolArg.mockResolvedValue(false);
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS blocked'));
    });

    it('does not replay Copilot POST when nativeFetch returns a concrete HTTP error', async () => {
        mockRisu.nativeFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Server error',
        });
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: 'should-not-be-used',
            headers: { 'content-type': 'text/plain' },
        });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.4', messages: [{ role: 'user', content: 'hi' }] }),
        });

        expect(mockRisu.nativeFetch).toHaveBeenCalledOnce();
        expect(mockRisu.risuFetch).not.toHaveBeenCalled();
        expect(res.status).toBe(500);
    });

    it('falls back only when nativeFetch has no usable HTTP response', async () => {
        mockRisu.nativeFetch.mockResolvedValue({
            ok: false,
            status: 0,
        });
        mockRisu.risuFetch.mockResolvedValue({
            status: 200,
            data: JSON.stringify({ ok: true }),
            headers: { 'content-type': 'application/json' },
        });

        const res = await smartNativeFetch('https://api.githubcopilot.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.4', messages: [{ role: 'user', content: 'hi' }] }),
        });

        expect(mockRisu.nativeFetch).toHaveBeenCalledOnce();
        expect(mockRisu.risuFetch).toHaveBeenCalledOnce();
        expect(res.status).toBe(200);
    });
});
