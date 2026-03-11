/**
 * Tests for shared-state.js — central mutable state + arg helpers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    CPM_VERSION, state,
    safeGetArg, safeGetBoolArg, isDynamicFetchEnabled,
    customFetchers, registeredProviderTabs, pendingDynamicFetchers,
    _pluginRegistrations, _pluginCleanupHooks,
} from '../src/lib/shared-state.js';

describe('shared-state constants', () => {
    it('CPM_VERSION is a valid semver string', () => {
        expect(CPM_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe('state object', () => {
    beforeEach(() => {
        state.ALL_DEFINED_MODELS = [];
        state.CUSTOM_MODELS_CACHE = [];
        state.vertexTokenCache = { token: null, expiry: 0 };
        state._currentExecutingPluginId = null;
    });

    it('ALL_DEFINED_MODELS is mutable', () => {
        state.ALL_DEFINED_MODELS.push({ id: 'test', name: 'Test' });
        expect(state.ALL_DEFINED_MODELS).toHaveLength(1);
    });

    it('CUSTOM_MODELS_CACHE is mutable', () => {
        state.CUSTOM_MODELS_CACHE = [{ uniqueId: 'c1' }];
        expect(state.CUSTOM_MODELS_CACHE).toHaveLength(1);
    });

    it('vertexTokenCache can be replaced', () => {
        state.vertexTokenCache = { token: 'abc', expiry: 9999 };
        expect(state.vertexTokenCache.token).toBe('abc');
    });

    it('_currentExecutingPluginId tracks current plugin', () => {
        state._currentExecutingPluginId = 'plugin-1';
        expect(state._currentExecutingPluginId).toBe('plugin-1');
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
    it('returns default on missing Risu global', async () => {
        const result = await safeGetArg('nonexistent_key', 'fallback');
        expect(result).toBe('fallback');
    });

    it('returns empty string default when no default specified', async () => {
        const result = await safeGetArg('missing');
        expect(result).toBe('');
    });
});

describe('safeGetBoolArg', () => {
    it('returns false by default on missing Risu global', async () => {
        const result = await safeGetBoolArg('missing_bool');
        expect(result).toBe(false);
    });

    it('returns specified default on error', async () => {
        const result = await safeGetBoolArg('missing_bool', true);
        expect(result).toBe(true);
    });
});

describe('isDynamicFetchEnabled', () => {
    it('returns false on missing Risu global', async () => {
        const result = await isDynamicFetchEnabled('TestProvider');
        expect(result).toBe(false);
    });
});
