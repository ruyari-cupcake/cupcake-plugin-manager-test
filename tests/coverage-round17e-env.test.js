/**
 * Round 17e: Target cpm-url.config.js branches (L33-41)
 * Need the 'production' env branch and the catch branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('cpm-url.config.js — environment branches', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('resolves to production URL when CPM_ENV=production', async () => {
        const origEnv = process.env.CPM_ENV;
        process.env.CPM_ENV = 'production';
        try {
            const mod = await import('../src/cpm-url.config.js');
            expect(mod.CPM_BASE_URL).toBe('https://cupcake-plugin-manager.vercel.app');
            expect(mod.CPM_ENV).toBe('production');
        } finally {
            if (origEnv === undefined) delete process.env.CPM_ENV;
            else process.env.CPM_ENV = origEnv;
        }
    });

    it('resolves to test2 URL when CPM_ENV is empty', async () => {
        const origEnv = process.env.CPM_ENV;
        delete process.env.CPM_ENV;
        try {
            const mod = await import('../src/cpm-url.config.js');
            expect(mod.CPM_BASE_URL).toBe('https://test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app');
            expect(mod.CPM_ENV).toBe('test2');
        } finally {
            if (origEnv !== undefined) process.env.CPM_ENV = origEnv;
        }
    });

    it('resolves to test2 URL when CPM_ENV is some unknown value', async () => {
        const origEnv = process.env.CPM_ENV;
        process.env.CPM_ENV = 'staging';
        try {
            const mod = await import('../src/cpm-url.config.js');
            expect(mod.CPM_BASE_URL).toBe('https://test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app');
            expect(mod.CPM_ENV).toBe('test2');
        } finally {
            if (origEnv === undefined) delete process.env.CPM_ENV;
            else process.env.CPM_ENV = origEnv;
        }
    });
});
