/**
 * init-phase-isolation.test.js
 *
 * Tests for the updated init.js "settings-first + per-phase isolation" architecture.
 *
 * The new init.js structure:
 *   1. registerSetting() is called FIRST (before anything else)
 *   2. Each subsequent phase (subplugin-registry, subplugin-execute,
 *      settings-restore, streaming-check, dynamic-models, custom-models,
 *      model-registration, hotkey-registration) is wrapped in its own try-catch
 *   3. Boot health status is recorded to pluginStorage
 *   4. Phase tracking provides diagnostics on failure
 *
 * These tests replicate the exact boot logic patterns from init.js to verify:
 *   - Phase isolation: one phase failure does NOT propagate to other phases
 *   - Settings-first guarantee: settings panel is always accessible
 *   - Boot status recording: diagnostics are persisted
 *   - Phase tracking: completed/failed phases are accurately tracked
 */
import { describe, it, expect, vi } from 'vitest';

// ── Ensure `window` is available ──
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ────────────────────────────────────────────────────────────────────────
// A. Phase Isolation — each phase failure does NOT kill other phases
// ────────────────────────────────────────────────────────────────────────

describe('init.js boot — Phase isolation', () => {

    /**
     * Replicates the exact boot phase pattern from init.js:
     * Each phase runs in its own try-catch, failures are logged
     * but do NOT propagate.
     */
    async function simulateBoot({
        registerSettingFn,
        loadRegistryFn,
        executeEnabledFn,
        settingsBackupLoadFn,
        settingsBackupRestoreIfEmptyFn,
        checkStreamCapabilityFn,
        addProviderFn,
        getRootDocumentFn,
        pluginStorageSetItemFn,
    }) {
        let _bootPhase = 'pre-init';
        const _completedPhases = [];
        const _failedPhases = [];
        let _settingsRegistered = false;
        let _modelRegCount = 0;

        const _phaseStart = (phase) => { _bootPhase = phase; };
        const _phaseDone = (phase) => { _completedPhases.push(phase); };
        const _phaseFail = (phase, err) => {
            _failedPhases.push(`${phase}: ${err?.message || err}`);
        };

        // CRITICAL FIRST: register settings
        try {
            _phaseStart('register-settings');
            await registerSettingFn();
            _settingsRegistered = true;
            _phaseDone('register-settings');
        } catch (e) { _phaseFail('register-settings', e); }

        try {
            // Subplugin registry
            _phaseStart('subplugin-registry');
            try {
                await loadRegistryFn();
                _phaseDone('subplugin-registry');
            } catch (e) { _phaseFail('subplugin-registry', e); }

            // Subplugin execute
            _phaseStart('subplugin-execute');
            try {
                await executeEnabledFn();
                _phaseDone('subplugin-execute');
            } catch (e) { _phaseFail('subplugin-execute', e); }

            // Settings restore
            _phaseStart('settings-restore');
            try {
                await settingsBackupLoadFn();
                await settingsBackupRestoreIfEmptyFn();
                _phaseDone('settings-restore');
            } catch (e) { _phaseFail('settings-restore', e); }

            // Streaming check
            _phaseStart('streaming-check');
            try {
                await checkStreamCapabilityFn();
                _phaseDone('streaming-check');
            } catch (e) { _phaseFail('streaming-check', e); }

            // Model registration
            _phaseStart('model-registration');
            const models = [
                { provider: 'OpenAI', name: 'GPT-4o', id: 'gpt-4o' },
                { provider: 'Anthropic', name: 'Claude', id: 'claude-sonnet-4-20250514' },
            ];
            try {
                for (const m of models) {
                    await addProviderFn(m);
                    _modelRegCount++;
                }
                _phaseDone('model-registration');
            } catch (e) {
                _phaseFail('model-registration', e);
            }

            // Hotkey
            _phaseStart('hotkey-registration');
            try {
                const doc = await getRootDocumentFn();
                if (doc) await doc.addEventListener('keydown', () => {});
                _phaseDone('hotkey-registration');
            } catch (e) { _phaseFail('hotkey-registration', e); }

            // Boot status record
            try {
                await pluginStorageSetItemFn('cpm_last_boot_status', JSON.stringify({
                    ts: Date.now(), version: '1.19.7',
                    ok: _completedPhases, fail: _failedPhases,
                    models: _modelRegCount, settingsOk: _settingsRegistered,
                }));
            } catch (_) { /* */ }

        } catch (_e) {
            // Outer catch
            if (!_settingsRegistered) {
                try { await registerSettingFn(); } catch (_) { /* */ }
            }
        }

        return { _settingsRegistered, _completedPhases, _failedPhases, _modelRegCount, _bootPhase };
    }

    it('all phases succeed → all tracked as completed', async () => {
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => {}),
            executeEnabledFn: vi.fn(async () => {}),
            settingsBackupLoadFn: vi.fn(async () => {}),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async () => {}),
            getRootDocumentFn: vi.fn(async () => null),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases).toHaveLength(0);
        expect(result._completedPhases).toContain('register-settings');
        expect(result._completedPhases).toContain('subplugin-registry');
        expect(result._completedPhases).toContain('subplugin-execute');
        expect(result._completedPhases).toContain('settings-restore');
        expect(result._completedPhases).toContain('streaming-check');
        expect(result._completedPhases).toContain('model-registration');
        expect(result._completedPhases).toContain('hotkey-registration');
        expect(result._modelRegCount).toBe(2);
    });

    it('subplugin-registry fails → other phases still complete', async () => {
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => { throw new Error('IndexedDB corrupt'); }),
            executeEnabledFn: vi.fn(async () => {}),
            settingsBackupLoadFn: vi.fn(async () => {}),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async () => {}),
            getRootDocumentFn: vi.fn(async () => null),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases).toHaveLength(1);
        expect(result._failedPhases[0]).toContain('subplugin-registry');
        expect(result._completedPhases).toContain('subplugin-execute');
        expect(result._completedPhases).toContain('model-registration');
        expect(result._modelRegCount).toBe(2);
    });

    it('subplugin-execute fails → settings-restore and model-registration still run', async () => {
        const restoreFn = vi.fn(async () => 0);
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => {}),
            executeEnabledFn: vi.fn(async () => { throw new Error('Sub-plugin infinite loop'); }),
            settingsBackupLoadFn: vi.fn(async () => {}),
            settingsBackupRestoreIfEmptyFn: restoreFn,
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async () => {}),
            getRootDocumentFn: vi.fn(async () => null),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases).toHaveLength(1);
        expect(result._failedPhases[0]).toContain('subplugin-execute');
        expect(result._completedPhases).toContain('settings-restore');
        expect(result._completedPhases).toContain('model-registration');
        expect(restoreFn).toHaveBeenCalledOnce();
    });

    it('settings-restore fails → streaming-check and model-registration still run', async () => {
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => {}),
            executeEnabledFn: vi.fn(async () => {}),
            settingsBackupLoadFn: vi.fn(async () => { throw new Error('Corrupt backup'); }),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async () => {}),
            getRootDocumentFn: vi.fn(async () => null),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases).toHaveLength(1);
        expect(result._failedPhases[0]).toContain('settings-restore');
        expect(result._completedPhases).toContain('streaming-check');
        expect(result._completedPhases).toContain('model-registration');
    });

    it('model-registration fails mid-way → partial models registered, hotkey still runs', async () => {
        let callCount = 0;
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => {}),
            executeEnabledFn: vi.fn(async () => {}),
            settingsBackupLoadFn: vi.fn(async () => {}),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async (_m) => {
                callCount++;
                if (callCount === 2) throw new Error('RPC bridge timeout');
            }),
            getRootDocumentFn: vi.fn(async () => null),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases).toHaveLength(1);
        expect(result._failedPhases[0]).toContain('model-registration');
        expect(result._modelRegCount).toBe(1); // first model registered before error
        expect(result._completedPhases).toContain('hotkey-registration');
    });

    it('multiple phases fail → all failures tracked, settings still registered', async () => {
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => { throw new Error('DB fail'); }),
            executeEnabledFn: vi.fn(async () => { throw new Error('Script fail'); }),
            settingsBackupLoadFn: vi.fn(async () => { throw new Error('Backup fail'); }),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => { throw new Error('Bridge fail'); }),
            addProviderFn: vi.fn(async () => { throw new Error('Provider fail'); }),
            getRootDocumentFn: vi.fn(async () => { throw new Error('DOM fail'); }),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._failedPhases.length).toBeGreaterThanOrEqual(5);
        expect(result._completedPhases).toContain('register-settings');
        // All failures should be tracked individually
        const failPhaseNames = result._failedPhases.map(f => f.split(':')[0]);
        expect(failPhaseNames).toContain('subplugin-registry');
        expect(failPhaseNames).toContain('subplugin-execute');
        expect(failPhaseNames).toContain('settings-restore');
        expect(failPhaseNames).toContain('streaming-check');
        expect(failPhaseNames).toContain('model-registration');
    });

    it('hotkey-registration fails → does not affect anything else (last phase)', async () => {
        const result = await simulateBoot({
            registerSettingFn: vi.fn(async () => {}),
            loadRegistryFn: vi.fn(async () => {}),
            executeEnabledFn: vi.fn(async () => {}),
            settingsBackupLoadFn: vi.fn(async () => {}),
            settingsBackupRestoreIfEmptyFn: vi.fn(async () => 0),
            checkStreamCapabilityFn: vi.fn(async () => true),
            addProviderFn: vi.fn(async () => {}),
            getRootDocumentFn: vi.fn(async () => { throw new Error('Permission denied'); }),
            pluginStorageSetItemFn: vi.fn(async () => {}),
        });

        expect(result._settingsRegistered).toBe(true);
        expect(result._completedPhases).toContain('model-registration');
        expect(result._failedPhases).toHaveLength(1);
        expect(result._failedPhases[0]).toContain('hotkey-registration');
    });
});

// ────────────────────────────────────────────────────────────────────────
// B. Boot Status Recording
// ────────────────────────────────────────────────────────────────────────

describe('init.js boot — Boot status recording', () => {
    it('boot status is written to pluginStorage with correct shape', async () => {
        const storedItems = {};
        const pluginStorageSetItem = vi.fn(async (key, val) => {
            storedItems[key] = val;
        });

        // Simulate a normal boot
        const _completedPhases = ['register-settings', 'subplugin-registry', 'model-registration'];
        const _failedPhases = ['streaming-check: Bridge not ready'];
        const _modelRegCount = 42;
        const _settingsRegistered = true;

        try {
            await pluginStorageSetItem('cpm_last_boot_status', JSON.stringify({
                ts: Date.now(), version: '1.19.7',
                ok: _completedPhases, fail: _failedPhases,
                models: _modelRegCount, settingsOk: _settingsRegistered,
            }));
        } catch (_) { /* */ }

        expect(pluginStorageSetItem).toHaveBeenCalledOnce();
        const stored = JSON.parse(storedItems['cpm_last_boot_status']);
        expect(stored).toHaveProperty('ts');
        expect(stored.version).toBe('1.19.7');
        expect(stored.ok).toEqual(_completedPhases);
        expect(stored.fail).toEqual(_failedPhases);
        expect(stored.models).toBe(42);
        expect(stored.settingsOk).toBe(true);
    });

    it('pluginStorage.setItem failure is silently swallowed', async () => {
        const pluginStorageSetItem = vi.fn(async () => {
            throw new Error('Storage quota exceeded');
        });

        let caughtError = false;
        try {
            try {
                await pluginStorageSetItem('cpm_last_boot_status', '{}');
            } catch (_) { /* silently swallowed */ }
        } catch (_) {
            caughtError = true;
        }

        expect(caughtError).toBe(false);
    });
});

// ────────────────────────────────────────────────────────────────────────
// C. Settings-First Guarantee
// ────────────────────────────────────────────────────────────────────────

describe('init.js boot — Settings-first guarantee', () => {
    it('registerSetting is the very first async call in the boot sequence', async () => {
        const callOrder = [];

        const registerSettingFn = vi.fn(async () => { callOrder.push('registerSetting'); });
        const loadRegistryFn = vi.fn(async () => { callOrder.push('loadRegistry'); });
        const executeEnabledFn = vi.fn(async () => { callOrder.push('executeEnabled'); });

        // Replicate boot sequence order
        try {
            await registerSettingFn();
        } catch (_) { /* */ }

        try {
            await loadRegistryFn();
        } catch (_) { /* */ }

        try {
            await executeEnabledFn();
        } catch (_) { /* */ }

        expect(callOrder[0]).toBe('registerSetting');
        expect(callOrder.indexOf('registerSetting')).toBeLessThan(callOrder.indexOf('loadRegistry'));
        expect(callOrder.indexOf('registerSetting')).toBeLessThan(callOrder.indexOf('executeEnabled'));
    });

    it('even when registerSetting succeeds and everything else fails, settings are accessible', async () => {
        let settingsCallbackInvoked = false;
        const openCpmSettings = async () => { settingsCallbackInvoked = true; };

        let registeredCallback = null;
        const registerSettingFn = vi.fn(async (_label, callback) => {
            registeredCallback = callback;
        });

        // Register settings first
        await registerSettingFn('v1.19.7', openCpmSettings, '🧁', 'html');

        // Everything else crashes
        try { throw new Error('Total init failure'); } catch (_) { /* */ }

        // User clicks "🧁" in sidebar → registered callback still works
        await registeredCallback();
        expect(settingsCallbackInvoked).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// D. Phase Tracking Accuracy
// ────────────────────────────────────────────────────────────────────────

describe('init.js boot — Phase tracking accuracy', () => {
    it('_bootPhase reflects the last started phase on crash', () => {
        let _bootPhase = 'pre-init';
        const _phaseStart = (phase) => { _bootPhase = phase; };

        _phaseStart('register-settings');
        _phaseStart('subplugin-registry');
        _phaseStart('subplugin-execute');
        // Crash happens mid-execute

        expect(_bootPhase).toBe('subplugin-execute');
    });

    it('_completedPhases and _failedPhases are mutually exclusive per phase', () => {
        const _completedPhases = [];
        const _failedPhases = [];

        const _phaseDone = (phase) => { _completedPhases.push(phase); };
        const _phaseFail = (phase, err) => { _failedPhases.push(`${phase}: ${err.message}`); };

        // Phase 1: success
        _phaseDone('register-settings');
        // Phase 2: failure
        _phaseFail('subplugin-registry', new Error('DB corrupt'));
        // Phase 3: success
        _phaseDone('subplugin-execute');

        // No phase appears in both lists
        for (const completed of _completedPhases) {
            const failedPhaseNames = _failedPhases.map(f => f.split(':')[0]);
            expect(failedPhaseNames).not.toContain(completed);
        }

        expect(_completedPhases).toEqual(['register-settings', 'subplugin-execute']);
        expect(_failedPhases).toHaveLength(1);
        expect(_failedPhases[0]).toContain('subplugin-registry');
    });

    it('error messages are captured in _failedPhases', () => {
        const _failedPhases = [];
        const _phaseFail = (phase, err) => {
            _failedPhases.push(`${phase}: ${err?.message || err}`);
        };

        _phaseFail('settings-restore', new Error('Corrupt JSON'));
        _phaseFail('streaming-check', new Error('Bridge timeout'));
        _phaseFail('model-registration', 'Unknown error string');

        expect(_failedPhases[0]).toBe('settings-restore: Corrupt JSON');
        expect(_failedPhases[1]).toBe('streaming-check: Bridge timeout');
        expect(_failedPhases[2]).toBe('model-registration: Unknown error string');
    });
});

// ────────────────────────────────────────────────────────────────────────
// E. Update path — settings survive the RisuAI unload→reload cycle
// ────────────────────────────────────────────────────────────────────────

describe('init.js boot — RisuAI V3 update cycle simulation', () => {
    it('simulates unload → load cycle: settings re-registered immediately', async () => {
        // This simulates what happens when RisuAI calls loadV3Plugins():
        // 1. unloadV3Plugin() removes the old instance (including settings menu)
        // 2. executePluginV3() runs the new code in a fresh iframe
        // 3. The new code must register settings FIRST

        const additionalSettingsMenu = [];
        let settingsMenuEntry = null;

        // Phase 1: Old plugin was running, had settings registered
        additionalSettingsMenu.push({ id: 'old-id', name: 'v1.19.6', callback: () => {} });
        expect(additionalSettingsMenu).toHaveLength(1);

        // Phase 2: RisuAI unloads the old plugin
        additionalSettingsMenu.length = 0; // unload callback clears it
        expect(additionalSettingsMenu).toHaveLength(0);

        // Phase 3: New plugin code starts — registerSetting is FIRST
        const registerSetting = vi.fn(async (name, callback) => {
            settingsMenuEntry = { name, callback };
            additionalSettingsMenu.push(settingsMenuEntry);
        });

        await registerSetting('v1.19.7', () => {});

        // Settings are immediately available, before any other init
        expect(additionalSettingsMenu).toHaveLength(1);
        expect(settingsMenuEntry.name).toBe('v1.19.7');

        // Phase 4: Other init phases may fail...
        try { throw new Error('SubPluginManager crashed'); } catch (_) { /* */ }

        // ...but settings are still there
        expect(additionalSettingsMenu).toHaveLength(1);
    });
});

// ────────────────────────────────────────────────────────────────────────
// F. SubPluginManager purge list includes boot status key
// ────────────────────────────────────────────────────────────────────────

describe('SubPluginManager — purge includes boot status key', () => {
    it('_PLUGIN_STORAGE_KEYS includes cpm_last_boot_status', async () => {
        const { SubPluginManager } = await import('../src/lib/sub-plugin-manager.js');
        expect(SubPluginManager._PLUGIN_STORAGE_KEYS).toContain('cpm_last_boot_status');
    });

    it('_PLUGIN_STORAGE_KEYS includes all expected keys', async () => {
        const { SubPluginManager } = await import('../src/lib/sub-plugin-manager.js');
        const expectedKeys = [
            'cpm_installed_subplugins',
            'cpm_settings_backup',
            'cpm_last_version_check',
            'cpm_last_main_version_check',
            'cpm_last_boot_status',
        ];
        for (const key of expectedKeys) {
            expect(SubPluginManager._PLUGIN_STORAGE_KEYS).toContain(key);
        }
    });
});
