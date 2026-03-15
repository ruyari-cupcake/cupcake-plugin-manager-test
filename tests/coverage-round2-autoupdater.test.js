/**
 * coverage-round2-autoupdater.test.js — Branch coverage boost for auto-updater.js,
 * key-pool.js, and cpm-url.config.js.
 *
 * Target: ~40+ uncovered branches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks (auto-updater) ───

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

import { SubPluginManager } from '../src/lib/sub-plugin-manager.js';

afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.window?._cpmVersionChecked;
    delete globalThis.window?._cpmMainUpdateCompletedThisBoot;
});

beforeEach(() => {
    mockPluginStorage.getItem.mockReset();
    mockPluginStorage.setItem.mockReset();
    mockPluginStorage.removeItem.mockReset();
    mockRisuFetch.mockReset();
    mockNativeFetch.mockReset();
    mockGetDatabase.mockReset();
    mockSetDatabaseLite.mockReset();
    SubPluginManager._mainUpdateInFlight = null;
    SubPluginManager._pendingUpdateNames = [];
});

// ─── _readPendingMainUpdate branches ───

describe('_readPendingMainUpdate edge cases', () => {
    it('returns null when raw is empty/null', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).toBeNull();
    });

    it('returns null when raw is empty string', async () => {
        mockPluginStorage.getItem.mockResolvedValue('');
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).toBeNull();
    });

    it('clears and returns null when parsed is not an object', async () => {
        mockPluginStorage.getItem.mockResolvedValue('"just a string"');
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).toBeNull();
        expect(mockPluginStorage.removeItem).toHaveBeenCalled();
    });

    it('clears and returns null when version is empty', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({ version: '', changes: 'test' }));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).toBeNull();
    });

    it('returns parsed data when valid', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: 'fix bugs', createdAt: 1000, attempts: 1,
            lastAttemptTs: 500, lastError: 'some error',
        }));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result.version).toBe('1.20.0');
        expect(result.changes).toBe('fix bugs');
        expect(result.attempts).toBe(1);
    });

    it('catch: clears and returns null when getItem throws', async () => {
        mockPluginStorage.getItem.mockRejectedValue(new Error('storage error'));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).toBeNull();
    });
});

// ─── _writePendingMainUpdate branches ───

describe('_writePendingMainUpdate', () => {
    it('writes data via setItem', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager._writePendingMainUpdate({ version: '1.20.0' });
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
    });

    it('catch: silently handles setItem failure', async () => {
        mockPluginStorage.setItem.mockRejectedValue(new Error('write error'));
        // Should not throw
        await SubPluginManager._writePendingMainUpdate({ version: '1.20.0' });
    });
});

// ─── _clearPendingMainUpdate branches ───

describe('_clearPendingMainUpdate', () => {
    it('uses removeItem when available', async () => {
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        await SubPluginManager._clearPendingMainUpdate();
        expect(mockPluginStorage.removeItem).toHaveBeenCalled();
    });

    it('falls back to setItem when removeItem is not a function', async () => {
        const originalRemoveItem = mockPluginStorage.removeItem;
        mockPluginStorage.removeItem = 'not-a-function';
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager._clearPendingMainUpdate();
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY,
            ''
        );
        mockPluginStorage.removeItem = originalRemoveItem;
    });
});

// ─── _rememberPendingMainUpdate branches ───

describe('_rememberPendingMainUpdate', () => {
    it('returns early for empty version', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('');
        expect(mockPluginStorage.setItem).not.toHaveBeenCalled();
    });

    it('new version: creates fresh entry', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('1.20.0', 'new changes');
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.version).toBe('1.20.0');
        expect(written.changes).toBe('new changes');
        expect(written.attempts).toBe(0);
    });

    it('same version: preserves existing createdAt', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: 'old changes', createdAt: 5000, attempts: 2,
            lastAttemptTs: 1000, lastError: 'err',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('1.20.0', 'new changes');
        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.createdAt).toBe(5000);
        expect(written.attempts).toBe(2);
    });
});

// ─── _isRetriableMainUpdateError ───

describe('_isRetriableMainUpdateError', () => {
    it('returns true for empty error', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('')).toBe(true);
    });

    it('returns true for network timeout', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('Network timeout')).toBe(true);
    });

    it('returns false for 이름 불일치', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('이름 불일치')).toBe(false);
    });

    it('returns false for 버전 불일치', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('버전 불일치')).toBe(false);
    });

    it('returns false for API 버전이 3.0이 아닙니다', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('API 버전이 3.0이 아닙니다')).toBe(false);
    });

    it('returns false for 다운그레이드 차단', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('다운그레이드 차단')).toBe(false);
    });

    it('returns false for 이미 같은 버전입니다', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('이미 같은 버전입니다')).toBe(false);
    });

    it('returns false for 플러그인을 db에서 찾을 수 없습니다', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('플러그인을 db에서 찾을 수 없습니다')).toBe(false);
    });

    it('returns false for 플러그인 목록을 찾을 수 없습니다', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('플러그인 목록을 찾을 수 없습니다')).toBe(false);
    });
});

// ─── retryPendingMainPluginUpdateOnBoot branches ───

describe('retryPendingMainPluginUpdateOnBoot', () => {
    it('returns false when no pending update', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(false);
    });

    it('clears and returns true when installed >= pending version', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.19.0', changes: '', createdAt: 0, attempts: 0, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        // Current CPM_VERSION is 1.19.6 which is >= 1.19.0
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }],
        });
        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(true);
    });

    it('returns false when max attempts exceeded', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.25.0', changes: '', createdAt: 0, attempts: 5, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({ plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }] });
        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(false);
    });

    it('returns false when cooldown active', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.25.0', changes: '', createdAt: 0,
            attempts: 1, lastAttemptTs: Date.now(), lastError: '',
        }));
        mockGetDatabase.mockResolvedValue({ plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }] });
        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(false);
    });
});

// ─── safeMainPluginUpdate guard branches ───

describe('safeMainPluginUpdate guards', () => {
    it('returns early when already completed this boot', async () => {
        globalThis.window = globalThis.window || {};
        globalThis.window._cpmMainUpdateCompletedThisBoot = true;
        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0', 'changes');
        // Source returns { ok: true } and clears pending — not an error
        expect(result.ok).toBe(true);
    });
});

// ─── checkVersionsQuiet branches ───

describe('checkVersionsQuiet', () => {
    it('skips when _cpmVersionChecked is true', async () => {
        globalThis.window = globalThis.window || {};
        globalThis.window._cpmVersionChecked = true;
        await SubPluginManager.checkVersionsQuiet();
        expect(mockRisuFetch).not.toHaveBeenCalled();
    });

    it('skips when cooldown not elapsed', async () => {
        globalThis.window = globalThis.window || {};
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(String(Date.now()));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager.checkVersionsQuiet();
        // Should not fetch because cooldown is active
        expect(mockRisuFetch).not.toHaveBeenCalled();
    });
});

// ─── key-pool.js branches ───

import { KeyPool } from '../src/lib/key-pool.js';

describe('KeyPool coverage branches', () => {
    beforeEach(() => {
        KeyPool._pools = {};
    });

    it('inline pool: picks from pre-cached _inline pool', async () => {
        KeyPool._pools['testKey'] = { keys: ['inlineKey1', 'inlineKey2'], _inline: true, lastRaw: '' };
        KeyPool.setGetArgFn(async () => '');
        const result = await KeyPool.pick('testKey');
        expect(['inlineKey1', 'inlineKey2']).toContain(result);
    });

    it('_looksLikeWindowsPath detects Windows paths', () => {
        expect(KeyPool._looksLikeWindowsPath('C:\\Users\\test')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('\\\\server\\share')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('{"key":"value"}')).toBe(false);
    });

    it('_buildJsonCredentialError returns Windows path error', () => {
        const err = KeyPool._buildJsonCredentialError('C:\\Users\\test.json');
        expect(err.message).toContain('Windows');
    });

    it('_buildJsonCredentialError returns Bad Unicode error', () => {
        const err = KeyPool._buildJsonCredentialError('not-a-path', new Error('Bad Unicode escape'));
        expect(err.message).toContain('역슬래시');
    });

    it('_buildJsonCredentialError returns generic error', () => {
        const err = KeyPool._buildJsonCredentialError('not-a-path', new Error('Unknown'));
        expect(err.message).toContain('Unknown');
    });

    it('_parseJsonCredentials throws for Windows path', () => {
        expect(() => KeyPool._parseJsonCredentials('C:\\Users\\service-account.json')).toThrow('Windows');
    });

    it('_parseJsonCredentials parses JSON array', () => {
        const result = KeyPool._parseJsonCredentials('[{"key":"a"},{"key":"b"}]');
        expect(result).toHaveLength(2);
    });

    it('_parseJsonCredentials parses single JSON object', () => {
        const result = KeyPool._parseJsonCredentials('{"client_id":"x","private_key":"y"}');
        expect(result).toHaveLength(1);
    });

    it('_parseJsonCredentials handles comma-separated objects', () => {
        const result = KeyPool._parseJsonCredentials('{"a":1},{"b":2}');
        expect(result).toHaveLength(2);
    });

    it('_parseJsonCredentials returns empty for empty input', () => {
        expect(KeyPool._parseJsonCredentials('')).toEqual([]);
    });

    it('pickJson caches parsed credentials', async () => {
        KeyPool.setGetArgFn(async () => '[{"key":"val"}]');
        KeyPool._pools = {};
        const result1 = await KeyPool.pickJson('jsonKey');
        expect(result1).toBeTruthy();
        // Second call should use cache
        const result2 = await KeyPool.pickJson('jsonKey');
        expect(result2).toBeTruthy();
    });

    it('pickJson handles parse error', async () => {
        KeyPool.setGetArgFn(async () => 'not-json-at-all');
        KeyPool._pools = {};
        const result = await KeyPool.pickJson('badKey');
        expect(result).toBe('');
    });

    it('drain removes a failed key', () => {
        KeyPool._pools['testKey'] = { keys: ['a', 'b', 'c'], lastRaw: 'a b c' };
        const remaining = KeyPool.drain('testKey', 'b');
        expect(remaining).toBe(2);
    });

    it('drain returns 0 for non-existent pool', () => {
        expect(KeyPool.drain('noPool', 'key')).toBe(0);
    });

    it('remaining returns 0 for non-existent pool', () => {
        expect(KeyPool.remaining('noPool')).toBe(0);
    });

    it('reset clears a pool', () => {
        KeyPool._pools['testKey'] = { keys: ['a', 'b'], lastRaw: 'a b' };
        KeyPool.reset('testKey');
        expect(KeyPool._pools['testKey']).toBeUndefined();
    });

    it('withRotation retries on retryable error and drains pool', async () => {
        let callCount = 0;
        KeyPool._pools = {};
        KeyPool.setGetArgFn(async () => 'key1 key2');
        const result = await KeyPool.withRotation(
            'rotKey',
            async () => {
                callCount++;
                if (callCount === 1) return { success: false, _status: 429 };
                return { success: true, content: 'ok' };
            },
            { maxRetries: 5 },
        );
        expect(result.success).toBe(true);
    });
});

// ─── cpm-url.config.js branches ───

describe('cpm-url.config.js', () => {
    it('exports CPM_BASE_URL as a string', async () => {
        const mod = await import('../src/cpm-url.config.js');
        expect(typeof mod.CPM_BASE_URL).toBe('string');
        expect(mod.CPM_BASE_URL.startsWith('https://')).toBe(true);
    });

    it('exports CPM_ENV as a string', async () => {
        const mod = await import('../src/cpm-url.config.js');
        expect(typeof mod.CPM_ENV).toBe('string');
        expect(['production', 'test']).toContain(mod.CPM_ENV);
    });
});
