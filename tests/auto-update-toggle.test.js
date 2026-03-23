/**
 * auto-update-toggle.test.js — Tests for the auto-update disable toggle feature.
 *
 * Verifies that when `cpm_disable_autoupdate` is true:
 *   1. checkVersionsQuiet() shows notification toast instead of calling safeMainPluginUpdate()
 *   2. checkMainPluginVersionQuiet() shows notification toast instead of installing
 *   3. retryPendingMainPluginUpdateOnBoot() skips retry
 *   4. Sub-plugin update toast is NOT affected
 *   5. When toggle is off (default), normal auto-update still works
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    risu: {
        log: vi.fn(),
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
        getArgument: vi.fn(async () => ''),
        getRootDocument: vi.fn(async () => null),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        },
        setDatabaseLite: vi.fn(async () => {}),
    },
    cpmVersion: '1.20.0',
    _safeGetBoolArgMock: vi.fn(async (key, defaultValue = false) => defaultValue),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: h.cpmVersion,
    safeGetBoolArg: h._safeGetBoolArgMock,
}));
vi.mock('../src/lib/endpoints.js', () => ({
    VERSIONS_URL: 'https://test.example.com/versions.json',
    MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
    UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
    CPM_ENV: 'test',
}));
vi.mock('../src/lib/schema.js', () => ({
    validateSchema: vi.fn(() => ({ ok: true })),
    schemas: { updateBundleVersions: {} },
}));

import { autoUpdaterMethods } from '../src/lib/auto-updater.js';

// ── Helpers ──

/**
 * Simple semver comparison matching the real compareVersions logic:
 * returns >0 if a < b (update available), 0 if equal, <0 if a > b.
 */
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na < nb) return 1;
        if (na > nb) return -1;
    }
    return 0;
}

function makeManifest(mainVersion = '1.21.0', subPlugins = {}) {
    return {
        'Cupcake Provider Manager': { version: mainVersion, changes: 'test changes' },
        ...subPlugins,
    };
}

function makeUpdater(overrides = {}) {
    return {
        ...autoUpdaterMethods,
        VERSIONS_URL: 'https://test.example.com/versions.json',
        MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
        UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
        _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
        _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
        _VERSION_CHECK_COOLDOWN: 0,
        _MAIN_UPDATE_RETRY_MAX_ATTEMPTS: 3,
        _MAIN_UPDATE_RETRY_COOLDOWN: 0,
        compareVersions,
        plugins: [],
        safeMainPluginUpdate: vi.fn(async () => ({ ok: true })),
        _validateAndInstallMainPlugin: vi.fn(async () => ({ ok: true })),
        _rememberPendingMainUpdate: vi.fn(async () => {}),
        _showMainUpdateAvailableToast: vi.fn(async () => {}),
        _showMainAutoUpdateResult: vi.fn(async () => {}),
        showUpdateToast: vi.fn(async () => {}),
        _readPendingMainUpdate: vi.fn(async () => null),
        _writePendingMainUpdate: vi.fn(async () => {}),
        _clearPendingMainUpdate: vi.fn(async () => {}),
        _getInstalledMainPluginVersion: vi.fn(async () => null),
        ...overrides,
    };
}

function mockManifestFetch(manifest) {
    h.risu.risuFetch.mockResolvedValue({
        data: JSON.stringify(manifest),
        status: 200,
    });
}

describe('auto-update toggle (cpm_disable_autoupdate)', () => {
    let updater;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        globalThis.window = globalThis.window || {};
        delete /** @type {any} */ (window)._cpmVersionChecked;
        delete /** @type {any} */ (window)._cpmMainVersionChecked;
        delete /** @type {any} */ (window)._cpmMainVersionFromManifest;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ──────────────────────────────────────────────────
    // checkVersionsQuiet — toggle ON (auto-update disabled)
    // ──────────────────────────────────────────────────
    describe('checkVersionsQuiet — toggle ON', () => {
        it('shows notification toast instead of installing when toggle is on', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            mockManifestFetch(makeManifest('1.21.0'));
            updater = makeUpdater();

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater._showMainUpdateAvailableToast).toHaveBeenCalledWith('1.20.0', '1.21.0', 'test changes');
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
        });

        it('does NOT call _rememberPendingMainUpdate when toggle is on', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            mockManifestFetch(makeManifest('1.21.0'));
            updater = makeUpdater();

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater._rememberPendingMainUpdate).not.toHaveBeenCalled();
        });

        it('still shows sub-plugin toast even when toggle is on', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            const manifest = makeManifest('1.21.0', {
                'vertex': { version: '1.7.0', changes: 'fix' },
            });
            mockManifestFetch(manifest);

            updater = makeUpdater({
                plugins: [{ name: 'vertex', icon: '🔷', version: '1.6.0', updateUrl: 'https://example.com/vertex.js' }],
            });

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater.showUpdateToast).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // checkVersionsQuiet — toggle OFF (default, auto-update enabled)
    // ──────────────────────────────────────────────────
    describe('checkVersionsQuiet — toggle OFF (default)', () => {
        it('calls safeMainPluginUpdate when toggle is off', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => def);

            mockManifestFetch(makeManifest('1.21.0'));
            updater = makeUpdater();

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater.safeMainPluginUpdate).toHaveBeenCalledWith('1.21.0', 'test changes');
            expect(updater._showMainUpdateAvailableToast).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // checkMainPluginVersionQuiet — toggle ON
    // ──────────────────────────────────────────────────
    describe('checkMainPluginVersionQuiet — toggle ON', () => {
        it('skips heavy JS fallback entirely when auto-update disabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            const remoteCode = `// @version 1.21.0\n// @changes js fallback change\nconsole.log("hello");`;

            h.risu.nativeFetch.mockResolvedValue({
                ok: true, status: 200,
                headers: { get: () => null },
                text: async () => remoteCode,
            });

            updater = makeUpdater();

            await updater.checkMainPluginVersionQuiet();

            // Early exit — no fetch, no toast, no install
            expect(h.risu.nativeFetch).not.toHaveBeenCalled();
            expect(updater._showMainUpdateAvailableToast).not.toHaveBeenCalled();
            expect(updater._validateAndInstallMainPlugin).not.toHaveBeenCalled();
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
        });
    });

    describe('checkMainPluginVersionQuiet — toggle OFF', () => {
        it('calls _validateAndInstallMainPlugin when toggle is off', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => def);

            const remoteCode = `// @version 1.21.0\n// @changes some update\nconsole.log("hello");`;

            h.risu.nativeFetch.mockResolvedValue({
                ok: true, status: 200,
                headers: { get: () => null },
                text: async () => remoteCode,
            });

            updater = makeUpdater();

            await updater.checkMainPluginVersionQuiet();

            expect(updater._validateAndInstallMainPlugin).toHaveBeenCalled();
            expect(updater._showMainUpdateAvailableToast).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // retryPendingMainPluginUpdateOnBoot — toggle ON
    // ──────────────────────────────────────────────────
    describe('retryPendingMainPluginUpdateOnBoot — toggle ON', () => {
        it('skips retry when toggle is on', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            updater = makeUpdater({
                _readPendingMainUpdate: vi.fn(async () => ({
                    version: '1.21.0', changes: 'pending', attempts: 0, lastAttemptTs: 0,
                })),
                _getInstalledMainPluginVersion: vi.fn(async () => '1.20.0'),
            });

            const result = await updater.retryPendingMainPluginUpdateOnBoot();

            expect(result).toBe(false);
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
        });
    });

    describe('retryPendingMainPluginUpdateOnBoot — toggle OFF', () => {
        it('retries update when toggle is off', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => def);

            updater = makeUpdater({
                _readPendingMainUpdate: vi.fn(async () => ({
                    version: '1.21.0', changes: 'pending', attempts: 0, lastAttemptTs: 0,
                })),
                _getInstalledMainPluginVersion: vi.fn(async () => '1.20.0'),
            });

            const result = await updater.retryPendingMainPluginUpdateOnBoot();

            expect(result).toBe(true);
            expect(updater.safeMainPluginUpdate).toHaveBeenCalledWith('1.21.0', 'pending');
        });
    });

    // ──────────────────────────────────────────────────
    // Edge cases
    // ──────────────────────────────────────────────────
    describe('edge cases', () => {
        it('toggle does not affect sub-plugin-only updates (no main update)', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            const manifest = makeManifest('1.20.0', {
                'vertex': { version: '1.7.0', changes: 'fix' },
            });
            mockManifestFetch(manifest);

            updater = makeUpdater({
                plugins: [{ name: 'vertex', icon: '🔷', version: '1.6.0', updateUrl: 'https://example.com/vertex.js' }],
            });

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater.showUpdateToast).toHaveBeenCalled();
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
            expect(updater._showMainUpdateAvailableToast).not.toHaveBeenCalled();
        });

        it('notification toast failure does not throw in checkVersionsQuiet', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            mockManifestFetch(makeManifest('1.21.0'));
            updater = makeUpdater({
                _showMainUpdateAvailableToast: vi.fn(async () => { throw new Error('toast failed'); }),
            });

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            // Should not throw
            await expect(promise).resolves.toBeUndefined();
        });

        it('no main update available does not trigger toggle check', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            mockManifestFetch(makeManifest('1.20.0')); // same version = no update
            updater = makeUpdater();

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            expect(updater._showMainUpdateAvailableToast).not.toHaveBeenCalled();
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // autoBootstrapBundledPlugins — toggle tests
    // ──────────────────────────────────────────────────
    describe('autoBootstrapBundledPlugins — toggle ON (disabled)', () => {
        it('skips bundle fetch entirely when auto-update disabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            updater = makeUpdater({
                install: vi.fn(async () => {}),
                BLOCKED_NAMES: ['Cupcake Provider Manager'],
            });

            const result = await updater.autoBootstrapBundledPlugins();

            expect(result).toEqual([]);
            expect(h.risu.risuFetch).not.toHaveBeenCalled();
        });
    });

    describe('autoBootstrapBundledPlugins — toggle OFF (enabled)', () => {
        it('fetches bundle normally when auto-update enabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => def);

            h.risu.risuFetch.mockResolvedValue({
                data: JSON.stringify({ versions: {}, code: {} }),
                status: 200,
            });

            updater = makeUpdater({
                install: vi.fn(async () => {}),
                BLOCKED_NAMES: ['Cupcake Provider Manager'],
            });

            const result = await updater.autoBootstrapBundledPlugins();

            expect(result).toEqual([]);
            expect(h.risu.risuFetch).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // checkVersionsQuiet — OFF still fetches + shows toast
    // ──────────────────────────────────────────────────
    describe('checkVersionsQuiet — OFF still shows toast (plan AU-01/AU-02)', () => {
        it('AU-01: versions.json fetch runs even when auto-update disabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            const manifest = makeManifest('1.20.0', {
                'vertex': { version: '1.7.0', changes: 'fix' },
            });
            mockManifestFetch(manifest);

            updater = makeUpdater({
                plugins: [{ name: 'vertex', icon: '🔷', version: '1.6.0', updateUrl: 'https://example.com/vertex.js' }],
            });

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            // versions.json WAS fetched (risuFetch called)
            expect(h.risu.risuFetch).toHaveBeenCalled();
            // Sub-plugin toast WAS shown
            expect(updater.showUpdateToast).toHaveBeenCalled();
        });

        it('AU-02: main update toast shown, but safeMainPluginUpdate NOT called when disabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            mockManifestFetch(makeManifest('1.21.0'));
            updater = makeUpdater();

            const promise = updater.checkVersionsQuiet();
            await vi.advanceTimersByTimeAsync(5000);
            await promise;

            // Toast shown
            expect(updater._showMainUpdateAvailableToast).toHaveBeenCalledWith('1.20.0', '1.21.0', 'test changes');
            // Auto-install NOT triggered
            expect(updater.safeMainPluginUpdate).not.toHaveBeenCalled();
            expect(updater._rememberPendingMainUpdate).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────
    // checkMainPluginVersionQuiet — OFF skips nativeFetch
    // ──────────────────────────────────────────────────
    describe('checkMainPluginVersionQuiet — OFF skips nativeFetch (plan AU-03)', () => {
        it('AU-03: nativeFetch not called when auto-update disabled', async () => {
            h._safeGetBoolArgMock.mockImplementation(async (key, def) => {
                if (key === 'cpm_disable_autoupdate') return true;
                return def;
            });

            updater = makeUpdater();

            await updater.checkMainPluginVersionQuiet();

            expect(h.risu.nativeFetch).not.toHaveBeenCalled();
            expect(h.risu.risuFetch).not.toHaveBeenCalled();
        });
    });
});
