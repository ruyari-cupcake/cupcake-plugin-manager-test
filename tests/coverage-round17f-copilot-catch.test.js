/**
 * Round 17f: Target copilot-token L53 — single-flight catch branch.
 * When two concurrent calls are made and the underlying fetch rejects,
 * the second caller hits the catch in the dedup path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ensureCopilotApiToken,
    setCopilotGetArgFn,
    setCopilotFetchFn,
    clearCopilotTokenCache,
} from '../src/lib/copilot-token.js';

describe('copilot-token L53 — concurrent rejection catch', () => {
    beforeEach(() => {
        clearCopilotTokenCache();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('second concurrent call returns empty string when first call rejects', async () => {
        // Set up getArg to return a token
        setCopilotGetArgFn(async (key) => {
            if (key === 'tools_githubCopilotToken') return 'ghu_testtoken';
            return '';
        });

        // Set up fetch to delay and then reject
        let resolveGate;
        const gate = new Promise(r => { resolveGate = r; });

        setCopilotFetchFn(async () => {
            await gate; // wait for gate to open
            throw new Error('network failure');
        });

        // Fire two concurrent requests
        const p1 = ensureCopilotApiToken();
        // Small delay to ensure p1 has set _copilotTokenPromise
        await new Promise(r => setTimeout(r, 5));
        const p2 = ensureCopilotApiToken();

        // Open the gate — both calls will now resolve/reject
        resolveGate();

        const [t1, t2] = await Promise.all([p1, p2]);

        // First call: goes through normal error path → returns ''
        expect(t1).toBe('');
        // Second call: hits the dedup catch at L53 → returns ''
        expect(t2).toBe('');
    });
});
