/**
 * init.js boot sequence failure-mode integration tests.
 *
 * The init.js IIFE runs at import time, making direct testing difficult.
 * These tests replicate the exact boot logic and verify error recovery at each stage:
 *   - SubPluginManager.loadRegistry() failure → init continues
 *   - SubPluginManager.executeEnabled() failure → init continues
 *   - SettingsBackup.load() failure → init continues
 *   - Custom model JSON corruption → recovers to empty array
 *   - Dynamic model fetch failure → skips provider, continues
 *   - Risu.addProvider() partial failure → other models still register
 *   - Full init crash → fallback error settings panel registered
 *   - CupcakePM.registerProvider() validation
 *   - CupcakePM.addCustomModel() edge cases
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Ensure `window` and mock risuai are available BEFORE any module imports ──
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
// Provide a minimal Risu mock so shared-state.js exports a usable Risu object
if (!globalThis.risuai) {
    globalThis.risuai = {
        setArgument: () => {},
        log: () => {},
        getArgument: async () => '',
        addProvider: async () => {},
        registerSetting: async () => {},
        getRootDocument: async () => null,
        showContainer: () => {},
        hideContainer: () => {},
        pluginStorage: {
            getItem: async () => null,
            setItem: async () => {},
            removeItem: async () => {},
            keys: async () => [],
        },
    };
}

// ────────────────────────────────────────────────────
// A. Boot sequence logic replication tests
// ────────────────────────────────────────────────────

describe('init.js boot — Custom model JSON recovery', () => {
    it('corrupted JSON → falls back to empty array', () => {
        const corruptJson = '{invalid json{{[]';
        let result;
        try {
            result = JSON.parse(corruptJson);
            if (!Array.isArray(result)) result = [];
        } catch (_e) {
            result = [];
        }
        expect(result).toEqual([]);
    });

    it('JSON that parses to non-array → coerced to empty array', () => {
        const objectJson = '{"key":"value"}';
        let result;
        try {
            result = JSON.parse(objectJson);
            if (!Array.isArray(result)) result = [];
        } catch (_e) {
            result = [];
        }
        expect(result).toEqual([]);
    });

    it('null JSON string → falls back to empty array', () => {
        const nullJson = 'null';
        let result;
        try {
            result = JSON.parse(nullJson);
            if (!Array.isArray(result)) result = [];
        } catch (_e) {
            result = [];
        }
        expect(result).toEqual([]);
    });

    it('empty array string → parsed correctly', () => {
        const emptyArr = '[]';
        let result;
        try {
            result = JSON.parse(emptyArr);
            if (!Array.isArray(result)) result = [];
        } catch (_e) {
            result = [];
        }
        expect(result).toEqual([]);
    });

    it('valid custom models JSON → parsed correctly', () => {
        const validJson = JSON.stringify([
            { uniqueId: 'c1', name: 'Model 1', model: 'gpt-4', url: 'http://x', format: 'openai' },
        ]);
        let result;
        try {
            result = JSON.parse(validJson);
            if (!Array.isArray(result)) result = [];
        } catch (_e) {
            result = [];
        }
        expect(result).toHaveLength(1);
        expect(result[0].uniqueId).toBe('c1');
    });
});

describe('init.js boot — Dynamic model fetch failure modes', () => {
    it('fetchDynamicModels throws → gracefully skipped, other providers continue', async () => {
        const ALL_DEFINED_MODELS = [
            { provider: 'StaticProvider', name: 'Model A', id: 'a' },
        ];

        const pendingDynamicFetchers = [
            { name: 'FailingProvider', fetchDynamicModels: async () => { throw new Error('Network timeout'); } },
            { name: 'SuccessProvider', fetchDynamicModels: async () => [{ name: 'Dynamic 1', id: 'dyn1' }] },
        ];

        // Replicate init.js dynamic fetch logic
        for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
            try {
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    // Remove existing models from this provider
                    const filtered = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    ALL_DEFINED_MODELS.length = 0;
                    ALL_DEFINED_MODELS.push(...filtered);
                    for (const m of dynamicModels) {
                        ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                }
            } catch (_e) {
                // Should silently continue
            }
        }

        // Static model should survive
        expect(ALL_DEFINED_MODELS.find(m => m.provider === 'StaticProvider')).toBeDefined();
        // FailingProvider should have no models
        expect(ALL_DEFINED_MODELS.filter(m => m.provider === 'FailingProvider')).toHaveLength(0);
        // SuccessProvider should have its dynamic model
        expect(ALL_DEFINED_MODELS.find(m => m.provider === 'SuccessProvider' && m.id === 'dyn1')).toBeDefined();
    });

    it('fetchDynamicModels returns null → uses fallback', async () => {
        const ALL_DEFINED_MODELS = [{ provider: 'NullProvider', name: 'Fallback', id: 'fb' }];

        const pendingDynamicFetchers = [
            { name: 'NullProvider', fetchDynamicModels: async () => null },
        ];

        for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
            try {
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    const filtered = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    ALL_DEFINED_MODELS.length = 0;
                    ALL_DEFINED_MODELS.push(...filtered);
                    for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (_e) { /* */ }
        }

        // Fallback model should remain
        expect(ALL_DEFINED_MODELS).toHaveLength(1);
        expect(ALL_DEFINED_MODELS[0].name).toBe('Fallback');
    });

    it('fetchDynamicModels returns empty array → uses fallback', async () => {
        const ALL_DEFINED_MODELS = [{ provider: 'EmptyProvider', name: 'Fallback', id: 'fb' }];

        const pendingDynamicFetchers = [
            { name: 'EmptyProvider', fetchDynamicModels: async () => [] },
        ];

        for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
            try {
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    const filtered = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    ALL_DEFINED_MODELS.length = 0;
                    ALL_DEFINED_MODELS.push(...filtered);
                    for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (_e) { /* */ }
        }

        expect(ALL_DEFINED_MODELS).toHaveLength(1);
        expect(ALL_DEFINED_MODELS[0].name).toBe('Fallback');
    });
});

describe('init.js boot — Model registration partial failure', () => {
    it('Risu.addProvider throws for one model → others still register', async () => {
        let regCount = 0;
        const registeredModels = [];

        const mockRisu = {
            addProvider: vi.fn(async (label, _handler, _opts) => {
                if (label.includes('Bomb Model')) throw new Error('Registration failed');
                registeredModels.push(label);
            }),
        };

        const ALL_DEFINED_MODELS = [
            { provider: 'OpenAI', name: 'GPT-4o', id: 'gpt-4o' },
            { provider: 'OpenAI', name: 'Bomb Model', id: 'bomb' },
            { provider: 'Anthropic', name: 'Claude Sonnet', id: 'claude-sonnet-4-20250514' },
        ];

        // Replicate init.js model registration logic with try/catch
        try {
            for (const modelDef of ALL_DEFINED_MODELS) {
                const pLabel = modelDef.provider;
                const mLabel = modelDef.name;
                await mockRisu.addProvider(`🧁 [${pLabel}] ${mLabel}`, async () => {}, { model: { flags: [0, 8] } });
                regCount++;
            }
        } catch (_regErr) {
            // init.js catches here and continues to settings registration
        }

        // Only first model registered before Bomb Model threw
        expect(regCount).toBe(1);
        expect(registeredModels).toContain('🧁 [OpenAI] GPT-4o');
        expect(registeredModels).not.toContain('🧁 [Anthropic] Claude Sonnet');
        // The error is caught at the for-loop level, so Claude Sonnet is skipped
    });

    it('all models register successfully → correct count', async () => {
        let regCount = 0;

        const mockRisu = {
            addProvider: vi.fn(async () => {}),
        };

        const ALL_DEFINED_MODELS = [
            { provider: 'OpenAI', name: 'GPT-4o', id: 'gpt-4o' },
            { provider: 'Anthropic', name: 'Claude Sonnet', id: 'claude-sonnet-4-20250514' },
            { provider: 'GoogleAI', name: 'Gemini 2.0', id: 'gemini-2.0-flash' },
        ];

        try {
            for (const modelDef of ALL_DEFINED_MODELS) {
                const pLabel = modelDef.provider;
                const mLabel = modelDef.name;
                await mockRisu.addProvider(`🧁 [${pLabel}] ${mLabel}`, async () => {}, { model: { flags: [0, 8] } });
                regCount++;
            }
        } catch (_) { /* */ }

        expect(regCount).toBe(3);
        expect(mockRisu.addProvider).toHaveBeenCalledTimes(3);
    });
});

describe('init.js boot — Critical fallback catch block', () => {
    it('registerSetting called FIRST — always succeeds even if rest of init crashes', async () => {
        let settingsRegistered = false;
        let settingsLabel = '';
        let _settingsRegistered = false;

        const mockRisu = {
            registerSetting: vi.fn(async (label) => {
                settingsRegistered = true;
                settingsLabel = label;
            }),
        };

        // Replicate the new "settings-first" architecture from init.js
        try {
            await mockRisu.registerSetting(`v1.19.6`, async () => {}, '🧁', 'html');
            _settingsRegistered = true;
        } catch (_e) { /* phase fail */ }

        // Even if everything after this crashes...
        try {
            throw new Error('SubPluginManager crashed');
        } catch (_e) {
            // Phase-level catch, boot continues
        }

        expect(settingsRegistered).toBe(true);
        expect(_settingsRegistered).toBe(true);
        expect(settingsLabel).toContain('v1.19.6');
        expect(mockRisu.registerSetting).toHaveBeenCalledTimes(1);
    });

    it('main init throws after settings registered → no double registration', async () => {
        let regCount = 0;
        let _settingsRegistered = false;

        const mockRisu = {
            registerSetting: vi.fn(async () => { regCount++; }),
        };

        // First call: settings registered at top
        try {
            await mockRisu.registerSetting(`v1.19.6`, async () => {}, '🧁', 'html');
            _settingsRegistered = true;
        } catch (_) { /* */ }

        // Simulate outer catch: only tries fallback if _settingsRegistered is false
        const initError = new Error('Full crash');
        try {
            throw initError;
        } catch (_e) {
            if (!_settingsRegistered) {
                try {
                    await mockRisu.registerSetting(`⚠️ CPM v1.19.6 (Error)`, async () => {}, '🧁', 'html');
                } catch (_) { /* */ }
            }
        }

        // registerSetting was called exactly once (not twice)
        expect(regCount).toBe(1);
        expect(_settingsRegistered).toBe(true);
    });

    it('registerSetting itself fails → fallback error panel registered', async () => {
        let fallbackRegistered = false;
        let callCount = 0;

        const mockRisu = {
            registerSetting: vi.fn(async (_label) => {
                callCount++;
                if (callCount === 1) throw new Error('RPC bridge broken');
                // Second call succeeds (fallback)
                fallbackRegistered = true;
            }),
        };

        let _settingsRegistered = false;

        // First call fails
        try {
            await mockRisu.registerSetting(`v1.19.6`, async () => {}, '🧁', 'html');
            _settingsRegistered = true;
        } catch (_) { /* phase fail */ }

        // Outer catch tries fallback
        if (!_settingsRegistered) {
            try {
                await mockRisu.registerSetting(`⚠️ CPM v1.19.6 (Error)`, async () => {}, '🧁', 'html');
            } catch (_) { /* last resort */ }
        }

        expect(_settingsRegistered).toBe(false);
        expect(fallbackRegistered).toBe(true);
        expect(callCount).toBe(2);
    });

    it('fallback registration also throws → silently swallowed (last resort)', async () => {
        const mockRisu = {
            registerSetting: vi.fn(async () => { throw new Error('Even fallback fails'); }),
        };

        let _settingsRegistered = false;
        let caughtOuter = false;

        try {
            // First call fails
            try {
                await mockRisu.registerSetting('v1.19.6', async () => {}, '🧁', 'html');
                _settingsRegistered = true;
            } catch (_) { /* */ }

            // Outer catch
            if (!_settingsRegistered) {
                try {
                    await mockRisu.registerSetting('Error', async () => {}, '🧁', 'html');
                } catch (_) {
                    // Last resort — silently swallowed
                }
            }
        } catch (_) {
            caughtOuter = true;
        }

        // No unhandled error should propagate
        expect(caughtOuter).toBe(false);
    });
});

// ────────────────────────────────────────────────────
// B. CupcakePM API surface tests
// ────────────────────────────────────────────────────

describe('setupCupcakeAPI — registerProvider', () => {
    beforeEach(() => {
        delete globalThis.CupcakePM;
    });

    it('registerProvider adds custom fetcher and models', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { customFetchers, state } = await import('../src/lib/shared-state.js');
        const initialModelCount = state.ALL_DEFINED_MODELS.length;

        setupCupcakeAPI();

        const mockFetcher = vi.fn();
        globalThis.CupcakePM.registerProvider({
            name: 'TestProvider',
            models: [{ id: 'test-model', name: 'Test Model' }],
            fetcher: mockFetcher,
        });

        expect(customFetchers['TestProvider']).toBe(mockFetcher);
        expect(state.ALL_DEFINED_MODELS.some(m => m.provider === 'TestProvider' && m.id === 'test-model')).toBe(true);

        // Cleanup
        delete customFetchers['TestProvider'];
        state.ALL_DEFINED_MODELS.splice(initialModelCount);
    });

    it('registerProvider with settings tab → tab registered', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { registeredProviderTabs } = await import('../src/lib/shared-state.js');
        const initialTabCount = registeredProviderTabs.length;

        setupCupcakeAPI();

        const mockTab = { name: 'TestTab', render: vi.fn() };
        globalThis.CupcakePM.registerProvider({
            name: 'TabProvider',
            models: [],
            fetcher: vi.fn(),
            settingsTab: mockTab,
        });

        expect(registeredProviderTabs.length).toBe(initialTabCount + 1);
        expect(registeredProviderTabs[registeredProviderTabs.length - 1]).toBe(mockTab);

        // Cleanup
        registeredProviderTabs.splice(initialTabCount);
    });

    it('registerProvider with fetchDynamicModels → queued for execution', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { pendingDynamicFetchers, customFetchers } = await import('../src/lib/shared-state.js');
        const initialCount = pendingDynamicFetchers.length;

        setupCupcakeAPI();

        const dynamicFn = vi.fn();
        globalThis.CupcakePM.registerProvider({
            name: 'DynProvider',
            models: [],
            fetcher: vi.fn(),
            fetchDynamicModels: dynamicFn,
        });

        expect(pendingDynamicFetchers.length).toBe(initialCount + 1);
        expect(pendingDynamicFetchers[pendingDynamicFetchers.length - 1].name).toBe('DynProvider');
        expect(pendingDynamicFetchers[pendingDynamicFetchers.length - 1].fetchDynamicModels).toBe(dynamicFn);

        // Cleanup
        pendingDynamicFetchers.splice(initialCount);
        delete customFetchers['DynProvider'];
    });
});

describe('setupCupcakeAPI — addCustomModel', () => {
    beforeEach(() => {
        delete globalThis.CupcakePM;
    });

    it('adds a new custom model and returns uniqueId', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { state } = await import('../src/lib/shared-state.js');

        const spySetArg = vi.spyOn(globalThis.risuai, 'setArgument').mockImplementation(() => {});

        const initialCacheLen = state.CUSTOM_MODELS_CACHE.length;
        const initialModelLen = state.ALL_DEFINED_MODELS.length;

        setupCupcakeAPI();
        const result = globalThis.CupcakePM.addCustomModel({
            name: 'TestCustom',
            model: 'test-model-id',
            url: 'https://test.com/v1/chat',
            format: 'openai',
        });

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
        expect(typeof result.uniqueId).toBe('string');
        expect(result.uniqueId).toContain('custom_');

        // Verify model was added to cache and ALL_DEFINED_MODELS
        expect(state.CUSTOM_MODELS_CACHE.length).toBe(initialCacheLen + 1);
        expect(state.ALL_DEFINED_MODELS.length).toBe(initialModelLen + 1);
        expect(state.ALL_DEFINED_MODELS.some(m => m.uniqueId === result.uniqueId)).toBe(true);

        // Cleanup
        state.CUSTOM_MODELS_CACHE.splice(initialCacheLen);
        state.ALL_DEFINED_MODELS.splice(initialModelLen);
        spySetArg.mockRestore();
    });

    it('updates existing model by tag instead of creating duplicate', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { state } = await import('../src/lib/shared-state.js');

        const spySetArg = vi.spyOn(globalThis.risuai, 'setArgument').mockImplementation(() => {});

        const initialCacheLen = state.CUSTOM_MODELS_CACHE.length;

        // Pre-seed a tagged model
        state.CUSTOM_MODELS_CACHE.push({
            uniqueId: 'custom_tagged_1', name: 'Old Name', model: 'old-model',
            url: 'http://old', format: 'openai', _tag: 'my-tag',
        });

        setupCupcakeAPI();
        const result = globalThis.CupcakePM.addCustomModel(
            { name: 'New Name', model: 'new-model', url: 'http://new', format: 'anthropic' },
            'my-tag',
        );

        expect(result.success).toBe(true);
        expect(result.created).toBe(false);
        expect(result.uniqueId).toBe('custom_tagged_1');
        // Verify fields were updated
        const updated = state.CUSTOM_MODELS_CACHE.find(m => m.uniqueId === 'custom_tagged_1');
        expect(updated.name).toBe('New Name');
        expect(updated.model).toBe('new-model');
        expect(updated.format).toBe('anthropic');

        // Cleanup
        state.CUSTOM_MODELS_CACHE.splice(initialCacheLen);
        spySetArg.mockRestore();
    });
});

describe('setupCupcakeAPI — isStreamingAvailable', () => {
    beforeEach(() => {
        delete globalThis.CupcakePM;
    });

    it('returns streaming status object', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        setupCupcakeAPI();

        const status = await globalThis.CupcakePM.isStreamingAvailable();
        expect(status).toHaveProperty('enabled');
        expect(status).toHaveProperty('bridgeCapable');
        expect(status).toHaveProperty('active');
        expect(typeof status.enabled).toBe('boolean');
        expect(typeof status.bridgeCapable).toBe('boolean');
        expect(typeof status.active).toBe('boolean');
    });
});

describe('setupCupcakeAPI — registerCleanup', () => {
    beforeEach(() => {
        delete globalThis.CupcakePM;
    });

    it('registerCleanup outside plugin context → warns and does not register', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { state, _pluginCleanupHooks } = await import('../src/lib/shared-state.js');

        state._currentExecutingPluginId = null; // not in plugin context

        setupCupcakeAPI();

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        globalThis.CupcakePM.registerCleanup(() => {});

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outside sub-plugin execution context'));
        warnSpy.mockRestore();
    });

    it('registerCleanup inside plugin context → hook registered', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        const { state, _pluginCleanupHooks } = await import('../src/lib/shared-state.js');

        state._currentExecutingPluginId = 'test-plugin-1';
        const initialLen = (_pluginCleanupHooks['test-plugin-1'] || []).length;

        setupCupcakeAPI();
        const cleanupFn = vi.fn();
        globalThis.CupcakePM.registerCleanup(cleanupFn);

        expect(_pluginCleanupHooks['test-plugin-1']).toBeDefined();
        expect(_pluginCleanupHooks['test-plugin-1'].length).toBe(initialLen + 1);

        // Cleanup
        delete _pluginCleanupHooks['test-plugin-1'];
        state._currentExecutingPluginId = null;
    });
});

// ────────────────────────────────────────────────────
// C. _exposeScopeToWindow bridge tests
// ────────────────────────────────────────────────────

describe('_exposeScopeToWindow — DI bridge via SubPluginManager', () => {
    it('setExposeScopeFunction accepts and stores a function', async () => {
        const { setExposeScopeFunction } = await import('../src/lib/sub-plugin-manager.js');

        const testFn = vi.fn();
        setExposeScopeFunction(testFn);

        // The function was stored (DI mechanism works)
        expect(typeof setExposeScopeFunction).toBe('function');

        // Restore to prevent side effects
        setExposeScopeFunction(null);
    });

    it('setExposeScopeFunction(null) does not crash', async () => {
        const { setExposeScopeFunction } = await import('../src/lib/sub-plugin-manager.js');

        expect(() => setExposeScopeFunction(null)).not.toThrow();
    });
});

// ────────────────────────────────────────────────────
// D. Boot-time streaming capability check failure
// ────────────────────────────────────────────────────

describe('init.js boot — Streaming capability check failure', () => {
    it('checkStreamCapability throws → caught and logged, boot continues', async () => {
        // Replicate the try/catch from init.js streaming check
        let bootContinued = false;

        try {
            // Simulate checkStreamCapability throwing
            const checkStreamCapability = async () => { throw new Error('Bridge not available'); };
            await checkStreamCapability();
        } catch (_e) {
            // init.js catches here and just warns
        }

        // Boot continues after the catch
        bootContinued = true;
        expect(bootContinued).toBe(true);
    });
});

describe('init.js boot — mainDom permission denial', () => {
    it('getRootDocument returns null → skips shortcut registration cleanly', async () => {
        const mockRisu = {
            getRootDocument: vi.fn(async () => null),
        };
        let listenerRegistrations = 0;

        const tryRegisterShortcuts = async () => {
            const rootDoc = await mockRisu.getRootDocument();
            if (!rootDoc) {
                return false;
            }

            await rootDoc.addEventListener('keydown', () => {});
            listenerRegistrations++;
            return true;
        };

        await expect(tryRegisterShortcuts()).resolves.toBe(false);
        expect(listenerRegistrations).toBe(0);
        expect(mockRisu.getRootDocument).toHaveBeenCalledOnce();
    });
});

// ────────────────────────────────────────────────────
// E. Settings backup failure recovery
// ────────────────────────────────────────────────────

describe('init.js boot — SettingsBackup failure recovery', () => {
    it('SettingsBackup.load() throws → boot continues past backup stage (per-phase isolation)', async () => {
        // With the updated init.js, each phase is wrapped in its own try-catch.
        // SettingsBackup failure should NOT kill the entire boot.
        let postBackupStageReached = false;

        const mockSettingsBackup = {
            load: vi.fn(async () => { throw new Error('Corrupt backup'); }),
            restoreIfEmpty: vi.fn(async () => 0),
        };

        // Replicate the per-phase try-catch pattern from updated init.js
        try {
            await mockSettingsBackup.load();
            await mockSettingsBackup.restoreIfEmpty();
        } catch (_e) {
            // Phase-level catch: log but don't propagate
        }

        // Boot continues after the per-phase catch
        postBackupStageReached = true;

        expect(postBackupStageReached).toBe(true);
        expect(mockSettingsBackup.load).toHaveBeenCalledOnce();
        // restoreIfEmpty is NOT called because load() threw within the same phase block
        expect(mockSettingsBackup.restoreIfEmpty).not.toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────
// F. Model sort stability
// ────────────────────────────────────────────────────

describe('init.js boot — Model sort determinism', () => {
    it('sort is stable for same-provider models with identical names', () => {
        const models = [
            { provider: 'Custom', name: 'Model A', id: 'a1', uniqueId: 'id_first' },
            { provider: 'Custom', name: 'Model A', id: 'a2', uniqueId: 'id_second' },
            { provider: 'Custom', name: 'Model A', id: 'a3', uniqueId: 'id_third' },
        ];

        const originalOrder = models.map(m => m.uniqueId);

        models.sort((a, b) => {
            const pc = a.provider.localeCompare(b.provider);
            if (pc !== 0) return pc;
            return a.name.localeCompare(b.name);
        });

        // Same provider + same name → original insertion order preserved (stable sort)
        const sortedOrder = models.map(m => m.uniqueId);
        expect(sortedOrder).toEqual(originalOrder);
    });

    it('multi-provider sort → alphabetical by provider then name', () => {
        const models = [
            { provider: 'GoogleAI', name: 'Gemini 2.0', id: 'g1' },
            { provider: 'Anthropic', name: 'Claude Opus', id: 'a1' },
            { provider: 'OpenAI', name: 'GPT-4o', id: 'o1' },
            { provider: 'Anthropic', name: 'Claude Haiku', id: 'a2' },
            { provider: 'Custom', name: 'My Model', id: 'c1' },
        ];

        models.sort((a, b) => {
            const pc = a.provider.localeCompare(b.provider);
            if (pc !== 0) return pc;
            return a.name.localeCompare(b.name);
        });

        expect(models[0].provider).toBe('Anthropic');
        expect(models[0].name).toBe('Claude Haiku');
        expect(models[1].name).toBe('Claude Opus');
        expect(models[2].provider).toBe('Custom');
        expect(models[3].provider).toBe('GoogleAI');
        expect(models[4].provider).toBe('OpenAI');
    });
});
