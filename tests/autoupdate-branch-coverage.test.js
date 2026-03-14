/**
 * autoupdate-branch-coverage.test.js — Targeted branch coverage tests for auto-updater.js
 *
 * Covers uncovered branches identified in coverage analysis:
 *   1. In-memory verify catch branch (~line 759)
 *   2. Flush marker write catch branch (~line 770)
 *   3. safeMainPluginUpdate — already-completed-this-boot guard (~line 795)
 *   4. safeMainPluginUpdate — same-version noop suppresses toast (~line 826)
 *   5. checkAllUpdates — SHA-256 computation failure (Web Crypto unavailable)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_UPDATE_URL } from '../src/lib/endpoints.js';

const { mockPluginStorage, mockRisuFetch, mockGetRootDocument, mockNativeFetch, mockGetDatabase, mockSetDatabaseLite } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), keys: vi.fn() },
    mockRisuFetch: vi.fn(),
    mockGetRootDocument: vi.fn(async () => null),
    mockNativeFetch: vi.fn(),
    mockGetDatabase: vi.fn(),
    mockSetDatabaseLite: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        risuFetch: (...a) => mockRisuFetch(...a),
        getRootDocument: (...a) => mockGetRootDocument(...a),
        nativeFetch: (...a) => mockNativeFetch(...a),
        getDatabase: (...a) => mockGetDatabase(...a),
        setDatabaseLite: (...a) => mockSetDatabaseLite(...a),
        setArgument: vi.fn(),
    },
    CPM_VERSION: '1.19.6',
    state: { _currentExecutingPluginId: null, ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: { token: null, expiry: 0 } },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
    isDynamicFetchEnabled: vi.fn(),
}));

vi.mock('../src/lib/csp-exec.js', () => ({ _executeViaScriptTag: vi.fn() }));
vi.mock('../src/lib/settings-backup.js', () => ({
    getManagedSettingKeys: vi.fn(() => []),
    SettingsBackup: { updateKey: vi.fn() },
}));

import { SubPluginManager, _computeSHA256 } from '../src/lib/sub-plugin-manager.js';

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Shared fixtures ──

const VALID_PLUGIN_CODE = [
    '//@name Cupcake_Provider_Manager',
    '//@display-name Cupcake Provider Manager',
    '//@api 3.0',
    '//@version 1.20.0',
    `//@update-url ${MAIN_UPDATE_URL}`,
    '//@arg cpm_openai_key string OpenAI API Key',
    '//@arg cpm_openai_model string OpenAI Model',
    '//@arg debug int {{name:디버그 모드}} {{checkbox:활성화}}',
    '',
    '// rest of plugin code here...',
    'console.log("Cupcake PM loaded");',
    ...Array(20).fill('// padding to make code > 100 chars'),
].join('\n');

function makeExistingPlugin(overrides = {}) {
    return {
        name: 'Cupcake_Provider_Manager',
        displayName: 'Cupcake Provider Manager',
        script: 'old code',
        arguments: { cpm_openai_key: 'string', cpm_openai_model: 'string', debug: 'int' },
        realArg: { cpm_openai_key: 'sk-test-123', cpm_openai_model: 'gpt-4', debug: '1' },
        argMeta: {},
        version: '3.0',
        customLink: [],
        versionOfPlugin: '1.19.6',
        updateURL: MAIN_UPDATE_URL,
        enabled: true,
        ...overrides,
    };
}

async function makeValidBundle(code = VALID_PLUGIN_CODE, version = '1.20.0') {
    const hash = await _computeSHA256(code);
    return {
        versions: {
            'Cupcake Provider Manager': {
                version,
                file: 'provider-manager.js',
                sha256: hash,
            },
        },
        code: {
            'provider-manager.js': code,
        },
    };
}

function setupDefaultMocks() {
    const existingPlugin = makeExistingPlugin();
    mockGetDatabase.mockResolvedValue({ plugins: [existingPlugin] });
    mockSetDatabaseLite.mockResolvedValue(undefined);
    mockPluginStorage.getItem.mockResolvedValue(null);
    mockPluginStorage.setItem.mockResolvedValue(undefined);
    mockPluginStorage.removeItem.mockResolvedValue(undefined);
}

// ════════════════════════════════════════════════════════════════
// 1. In-memory verify catch branch (~line 759)
// ════════════════════════════════════════════════════════════════

describe('_validateAndInstallMainPlugin — in-memory verify catch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        setupDefaultMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('succeeds even when post-install getDatabase verify throws', async () => {
        // First getDatabase call → normal DB (for reading existing plugin)
        // Second getDatabase call (in-memory verify) → throws
        const existingPlugin = makeExistingPlugin();
        mockGetDatabase
            .mockResolvedValueOnce({ plugins: [existingPlugin] }) // initial read
            .mockRejectedValueOnce(new Error('verify boom'));     // in-memory verify fails

        const resultPromise = SubPluginManager._validateAndInstallMainPlugin(VALID_PLUGIN_CODE, '1.20.0');
        await vi.advanceTimersByTimeAsync(4000); // _waitForMainPluginPersistence
        const result = await resultPromise;

        expect(result.ok).toBe(true);
        // setDatabaseLite was called (install happened)
        expect(mockSetDatabaseLite).toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 2. Flush marker write catch branch (~line 770)
// ════════════════════════════════════════════════════════════════

describe('_validateAndInstallMainPlugin — flush marker write failure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        setupDefaultMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('succeeds even when pluginStorage.setItem for flush marker throws', async () => {
        // Make setItem reject for the flush marker key
        mockPluginStorage.setItem.mockImplementation(async (key) => {
            if (key === 'cpm_last_main_update_flush') {
                throw new Error('storage full');
            }
            return undefined;
        });

        const resultPromise = SubPluginManager._validateAndInstallMainPlugin(VALID_PLUGIN_CODE, '1.20.0');
        await vi.advanceTimersByTimeAsync(4000);
        const result = await resultPromise;

        expect(result.ok).toBe(true);
        expect(mockSetDatabaseLite).toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 3. safeMainPluginUpdate — _cpmMainUpdateCompletedThisBoot guard
// ════════════════════════════════════════════════════════════════

describe('safeMainPluginUpdate — boot flag guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        SubPluginManager._mainUpdateInFlight = null;
        setupDefaultMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        delete window._cpmMainUpdateCompletedThisBoot;
    });

    it('returns ok:true immediately when _cpmMainUpdateCompletedThisBoot is set', async () => {
        /** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot = true;

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0', 'some changes');

        expect(result.ok).toBe(true);
        // Should NOT have attempted any download
        expect(mockRisuFetch).not.toHaveBeenCalled();
        expect(mockNativeFetch).not.toHaveBeenCalled();
    });

    it('clears pending update marker even when boot flag is set', async () => {
        /** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot = true;
        mockPluginStorage.removeItem.mockResolvedValue(undefined);

        await SubPluginManager.safeMainPluginUpdate('1.20.0');

        // _clearPendingMainUpdate should have been called
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(
            expect.stringContaining('cpm_pending_main_update')
        );
    });
});

// ════════════════════════════════════════════════════════════════
// 4. safeMainPluginUpdate — same-version noop suppresses toast
// ════════════════════════════════════════════════════════════════

describe('safeMainPluginUpdate — same-version noop toast suppression', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        setupDefaultMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does NOT call _showMainAutoUpdateResult for same-version noop', async () => {
        // Mock download success, but installed version equals remote version → same-version error
        const sameVersionCode = VALID_PLUGIN_CODE.replace('//@version 1.20.0', '//@version 1.19.6');
        const bundle = await makeValidBundle(sameVersionCode, '1.19.6');

        mockRisuFetch.mockResolvedValueOnce({
            status: 200,
            data: JSON.stringify(bundle),
        });

        // Set up DB with the same version already installed
        const existingPlugin = makeExistingPlugin({ versionOfPlugin: '1.19.6' });
        mockGetDatabase.mockResolvedValue({ plugins: [existingPlugin] });

        const showResultSpy = vi.spyOn(SubPluginManager, '_showMainAutoUpdateResult');

        const resultPromise = SubPluginManager.safeMainPluginUpdate('1.19.6', 'changes');
        await vi.advanceTimersByTimeAsync(5000);
        const result = await resultPromise;

        expect(result.ok).toBe(false);
        expect(result.error).toContain('이미 같은 버전');
        // The toast should NOT be shown for same-version noop
        expect(showResultSpy).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 5. checkAllUpdates — SHA-256 computation failure
// ════════════════════════════════════════════════════════════════

describe('checkAllUpdates — SHA-256 computation failure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        SubPluginManager.plugins = [
            { id: 'test-sub', name: 'TestSubPlugin', version: '1.0.0', updateUrl: 'https://example.com/update', enabled: true },
        ];
        mockPluginStorage.getItem.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
        SubPluginManager.plugins = [];
    });

    it('rejects update when _computeSHA256 returns empty string (Web Crypto unavailable)', async () => {
        const code = '// test plugin code with lots of content\n'.repeat(10);
        const realHash = await _computeSHA256(code);

        // Make bundle with valid SHA-256
        mockRisuFetch.mockResolvedValueOnce({
            status: 200,
            data: JSON.stringify({
                versions: {
                    TestSubPlugin: { version: '2.0.0', file: 'test-sub.js', sha256: realHash },
                },
                code: { 'test-sub.js': code },
            }),
        });

        // Stub crypto.subtle.digest to throw → _computeSHA256 returns ''
        const originalDigest = globalThis.crypto?.subtle?.digest;
        if (globalThis.crypto?.subtle) {
            vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('Web Crypto unavailable'));
        }

        const results = await SubPluginManager.checkAllUpdates();

        // The plugin should be REJECTED (not in results with code)
        // It may still appear in results but without code (since hash verification failed)
        const testResult = results.find(r => r.plugin.name === 'TestSubPlugin');
        // When SHA-256 fails, the entry is `continue`d — it should NOT appear in results
        expect(testResult).toBeUndefined();

        // Restore
        if (originalDigest && globalThis.crypto?.subtle) {
            vi.restoreAllMocks();
        }
    });
});
