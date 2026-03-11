/**
 * Deep coverage tests for shared-state.js
 * Covers: safeGetArg/safeGetBoolArg error paths, isDynamicFetchEnabled, state mutations.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const risu = {
        getArgument: vi.fn(async () => ''),
        setArgument: vi.fn(),
        log: vi.fn(),
    };
    // Hoist the global stub so it's set BEFORE shared-state.js is imported
    globalThis.risuai = risu;
    return { risu };
});

import { safeGetArg, safeGetBoolArg, isDynamicFetchEnabled, state, CPM_VERSION, customFetchers, registeredProviderTabs, pendingDynamicFetchers, _pluginRegistrations, _pluginCleanupHooks } from '../src/lib/shared-state.js';

describe('shared-state.js — deep coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.risu.getArgument.mockReset();
    });

    describe('CPM_VERSION', () => {
        it('is a semver string', () => {
            expect(CPM_VERSION).toMatch(/^\d+\.\d+\.\d+/);
        });
    });

    describe('state', () => {
        it('has expected default properties', () => {
            expect(state).toHaveProperty('ALL_DEFINED_MODELS');
            expect(state).toHaveProperty('CUSTOM_MODELS_CACHE');
            expect(state).toHaveProperty('vertexTokenCache');
            expect(state).toHaveProperty('_currentExecutingPluginId');
        });

        it('allows mutation of ALL_DEFINED_MODELS', () => {
            const original = state.ALL_DEFINED_MODELS;
            state.ALL_DEFINED_MODELS = [{ provider: 'test', name: 'Test' }];
            expect(state.ALL_DEFINED_MODELS).toHaveLength(1);
            state.ALL_DEFINED_MODELS = original; // restore
        });

        it('allows mutation of vertexTokenCache', () => {
            state.vertexTokenCache = { token: 'test-token', expiry: Date.now() + 60000 };
            expect(state.vertexTokenCache.token).toBe('test-token');
            state.vertexTokenCache = { token: null, expiry: 0 }; // restore
        });
    });

    describe('registries', () => {
        it('customFetchers is an object', () => {
            expect(typeof customFetchers).toBe('object');
        });
        it('registeredProviderTabs is an array', () => {
            expect(Array.isArray(registeredProviderTabs)).toBe(true);
        });
        it('pendingDynamicFetchers is an array', () => {
            expect(Array.isArray(pendingDynamicFetchers)).toBe(true);
        });
        it('_pluginRegistrations is an object', () => {
            expect(typeof _pluginRegistrations).toBe('object');
        });
        it('_pluginCleanupHooks is an object', () => {
            expect(typeof _pluginCleanupHooks).toBe('object');
        });
    });

    describe('safeGetArg', () => {
        it('returns value from Risu.getArgument when valid', async () => {
            h.risu.getArgument.mockResolvedValue('test-value');
            const result = await safeGetArg('some_key');
            expect(result).toBe('test-value');
        });

        it('returns default for undefined', async () => {
            h.risu.getArgument.mockResolvedValue(undefined);
            const result = await safeGetArg('some_key', 'default');
            expect(result).toBe('default');
        });

        it('returns default for null', async () => {
            h.risu.getArgument.mockResolvedValue(null);
            const result = await safeGetArg('key', 'def');
            expect(result).toBe('def');
        });

        it('returns default for empty string', async () => {
            h.risu.getArgument.mockResolvedValue('');
            const result = await safeGetArg('key', 'fallback');
            expect(result).toBe('fallback');
        });

        it('returns empty string as default when not specified', async () => {
            h.risu.getArgument.mockResolvedValue(undefined);
            const result = await safeGetArg('key');
            expect(result).toBe('');
        });

        it('returns default on exception', async () => {
            h.risu.getArgument.mockRejectedValue(new Error('fail'));
            const result = await safeGetArg('key', 'safe');
            expect(result).toBe('safe');
        });
    });

    describe('safeGetBoolArg', () => {
        it('returns true for "true" string', async () => {
            h.risu.getArgument.mockResolvedValue('true');
            expect(await safeGetBoolArg('key')).toBe(true);
        });

        it('returns true for boolean true', async () => {
            h.risu.getArgument.mockResolvedValue(true);
            expect(await safeGetBoolArg('key')).toBe(true);
        });

        it('returns false for "false" string', async () => {
            h.risu.getArgument.mockResolvedValue('false');
            expect(await safeGetBoolArg('key')).toBe(false);
        });

        it('returns false for boolean false', async () => {
            h.risu.getArgument.mockResolvedValue(false);
            expect(await safeGetBoolArg('key')).toBe(false);
        });

        it('returns false for empty string', async () => {
            h.risu.getArgument.mockResolvedValue('');
            expect(await safeGetBoolArg('key')).toBe(false);
        });

        it('returns default for non-boolean values', async () => {
            h.risu.getArgument.mockResolvedValue('maybe');
            expect(await safeGetBoolArg('key', false)).toBe(false);
            expect(await safeGetBoolArg('key', true)).toBe(true);
        });

        it('returns default on exception', async () => {
            h.risu.getArgument.mockRejectedValue(new Error('fail'));
            expect(await safeGetBoolArg('key', true)).toBe(true);
            expect(await safeGetBoolArg('key', false)).toBe(false);
        });

        it('defaults to false when no default specified', async () => {
            h.risu.getArgument.mockRejectedValue(new Error('fail'));
            expect(await safeGetBoolArg('key')).toBe(false);
        });
    });

    describe('isDynamicFetchEnabled', () => {
        it('returns true when arg is "true"', async () => {
            h.risu.getArgument.mockResolvedValue('true');
            expect(await isDynamicFetchEnabled('OpenAI')).toBe(true);
            expect(h.risu.getArgument).toHaveBeenCalledWith('cpm_dynamic_openai');
        });

        it('returns false when arg is empty', async () => {
            h.risu.getArgument.mockResolvedValue('');
            expect(await isDynamicFetchEnabled('Gemini')).toBe(false);
        });

        it('returns false when arg is "false"', async () => {
            h.risu.getArgument.mockResolvedValue('false');
            expect(await isDynamicFetchEnabled('Anthropic')).toBe(false);
        });

        it('lowercases provider name for key lookup', async () => {
            h.risu.getArgument.mockResolvedValue('true');
            await isDynamicFetchEnabled('MyCustomProvider');
            expect(h.risu.getArgument).toHaveBeenCalledWith('cpm_dynamic_mycustomprovider');
        });

        it('returns false on exception', async () => {
            h.risu.getArgument.mockRejectedValue(new Error('fail'));
            expect(await isDynamicFetchEnabled('Test')).toBe(false);
        });
    });
});
