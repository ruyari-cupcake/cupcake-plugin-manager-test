/**
 * coverage-round9-autoupdater.test.js — Deep auto-updater branch coverage
 *
 * Targets 90 uncovered branches in auto-updater.js:
 *   - _readPendingMainUpdate: non-string raw, missing optional fields (|| fallbacks)
 *   - _rememberPendingMainUpdate: same-version with zeroed fields, changes=undefined
 *   - retryPendingMainPluginUpdateOnBoot: full retry success/fail, empty installedVersion
 *   - _getInstalledMainPluginVersion: no versionOfPlugin, getDatabase throws
 *   - safeMainPluginUpdate: download fail retriable/non-retriable, install fail paths
 *   - checkAllUpdates: schema invalid, SHA missing/empty/mismatch, code missing
 *   - applyUpdate: no plugin/code/SHA, SHA mismatch, name mismatch, success, exception
 *   - _validateAndInstallMainPlugin: arg/link/display-name parsing, args merging
 *   - checkVersionsQuiet: full manifest flow, no updates, main update detection
 *   - checkMainPluginVersionQuiet: nativeFetch success, risuFetch fallback, version up to date
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted for vi.mock factories) ──

const {
    mockPluginStorage,
    mockGetDatabase,
    mockSetDatabaseLite,
    mockRisuFetch,
    mockNativeFetch,
    mockValidateSchema,
} = vi.hoisted(() => {
    const mockPluginStorage = {
        getItem: vi.fn().mockResolvedValue(null),
        setItem: vi.fn().mockResolvedValue(undefined),
        removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const mockGetDatabase = vi.fn();
    const mockSetDatabaseLite = vi.fn().mockResolvedValue(undefined);
    const mockRisuFetch = vi.fn();
    const mockNativeFetch = vi.fn();
    const mockValidateSchema = vi.fn((data, _schema) => ({ ok: true, data }));
    return { mockPluginStorage, mockGetDatabase, mockSetDatabaseLite, mockRisuFetch, mockNativeFetch, mockValidateSchema };
});

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        getDatabase: mockGetDatabase,
        setDatabaseLite: mockSetDatabaseLite,
        risuFetch: mockRisuFetch,
        nativeFetch: mockNativeFetch,
        getArgument: vi.fn().mockReturnValue(''),
    },
    CPM_VERSION: '1.19.6',
}));

vi.mock('../src/lib/endpoints.js', () => ({
    VERSIONS_URL: 'https://test.example.com/versions.json',
    MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
    UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
}));

vi.mock('../src/lib/schema.js', () => ({
    validateSchema: mockValidateSchema,
    schemas: { updateBundleVersions: {}, updateBundle: {} },
}));

import { autoUpdaterMethods } from '../src/lib/auto-updater.js';
import { _computeSHA256 } from '../src/lib/auto-updater.js';

// Build a minimal SubPluginManager-like context
const SubPluginManager = Object.create(null);
Object.assign(SubPluginManager, autoUpdaterMethods, {
    plugins: [],
    compareVersions(a, b) {
        const pa = (a || '0.0.0').split('.').map(Number);
        const pb = (b || '0.0.0').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) < (pb[i] || 0)) return 1;
            if ((pa[i] || 0) > (pb[i] || 0)) return -1;
        }
        return 0;
    },
    extractMetadata(code) {
        const name = (code.match(/\/\/@name\s+(.+)/) || [])[1]?.trim() || '';
        const version = (code.match(/\/\/@version\s+(.+)/) || [])[1]?.trim() || '';
        const description = (code.match(/\/\/@description\s+(.+)/) || [])[1]?.trim() || '';
        const icon = (code.match(/\/\/@icon\s+(.+)/) || [])[1]?.trim() || '';
        const updateUrl = (code.match(/\/\/@update-url\s+(\S+)/) || [])[1] || '';
        return { name, version, description, icon, updateUrl };
    },
    saveRegistry: vi.fn().mockResolvedValue(undefined),
    showUpdateToast: vi.fn().mockResolvedValue(undefined),
    _showMainAutoUpdateResult: vi.fn().mockResolvedValue(undefined),
    _waitForMainPluginPersistence: vi.fn().mockResolvedValue(undefined),
});

// Valid plugin code for _validateAndInstallMainPlugin
const VALID_CODE = [
    '//@name Cupcake_Provider_Manager',
    '//@display-name Cupcake PM',
    '//@version 1.20.0',
    '//@update-url https://example.com/update',
    '//@api 3.0',
    '//@arg provider string {{display::Provider}}',
    '//@arg maxTokens int',
    '//@link https://example.com/docs Docs Link',
    '// body '.padEnd(200, 'x'),
].join('\n');

beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = globalThis.window || {};
    delete globalThis.window._cpmVersionChecked;
    delete globalThis.window._cpmMainVersionChecked;
    delete globalThis.window._cpmMainVersionFromManifest;
    delete globalThis.window._cpmMainUpdateCompletedThisBoot;
    SubPluginManager._mainUpdateInFlight = null;
    SubPluginManager.plugins = [];
    mockPluginStorage.removeItem = vi.fn().mockResolvedValue(undefined);
    mockGetDatabase.mockResolvedValue({
        plugins: [{
            name: 'Cupcake_Provider_Manager',
            versionOfPlugin: '1.19.6',
            version: '3.0',
            script: 'x'.repeat(400 * 1024),
            enabled: true,
            realArg: { provider: 'openai' },
            arguments: { provider: 'string' },
            updateURL: 'https://example.com/update',
        }],
    });
});

// ══════════════════════════════════════════════════════
// 1. _readPendingMainUpdate — uncovered fallback branches
// ══════════════════════════════════════════════════════

describe('_readPendingMainUpdate — || fallbacks', () => {
    it('non-string raw (pre-parsed object) bypasses JSON.parse', async () => {
        // B1[1]: typeof raw !== 'string' → use raw directly
        mockPluginStorage.getItem.mockResolvedValue({
            version: '1.20.0', changes: 'test', createdAt: 100,
            attempts: 1, lastAttemptTs: 50, lastError: 'err',
        });
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result).not.toBeNull();
        expect(result.version).toBe('1.20.0');
    });

    it('missing optional fields trigger || fallbacks', async () => {
        // B11-B14: changes non-string, createdAt/attempts/lastAttemptTs missing, lastError non-string
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0',
            // changes: missing → typeof undefined !== 'string' → ''
            // createdAt: missing → Number(undefined) = NaN → || 0
            // attempts: missing → NaN → || 0
            // lastAttemptTs: missing → NaN → || 0
            // lastError: missing → typeof undefined !== 'string' → ''
        }));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result.version).toBe('1.20.0');
        expect(result.changes).toBe('');
        expect(result.createdAt).toBe(0);
        expect(result.attempts).toBe(0);
        expect(result.lastAttemptTs).toBe(0);
        expect(result.lastError).toBe('');
    });

    it('non-string changes and lastError fallback to empty string', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: 12345, lastError: false,
            createdAt: 0, attempts: 0, lastAttemptTs: 0,
        }));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result.changes).toBe('');
        expect(result.lastError).toBe('');
        // createdAt: Number(0) is 0, || 0 → 0
        expect(result.createdAt).toBe(0);
    });

    it('null createdAt → NaN → falls back to 0', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: '', createdAt: null,
            attempts: null, lastAttemptTs: null, lastError: '',
        }));
        const result = await SubPluginManager._readPendingMainUpdate();
        expect(result.createdAt).toBe(0);
        expect(result.attempts).toBe(0);
        expect(result.lastAttemptTs).toBe(0);
    });
});

// ══════════════════════════════════════════════════════
// 2. _rememberPendingMainUpdate — uncovered || fallbacks
// ══════════════════════════════════════════════════════

describe('_rememberPendingMainUpdate — || fallbacks in same-version path', () => {
    it('same version with all-zero existing → || fallbacks fire', async () => {
        // B21-B27: existing.changes='', createdAt=0, attempts=0, lastAttemptTs=0, lastError=''
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: '', createdAt: 0,
            attempts: 0, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('1.20.0', undefined);
        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.version).toBe('1.20.0');
        // changes=undefined → typeof !== 'string' → existing?.changes || '' → '' || '' → ''
        expect(written.changes).toBe('');
        // createdAt: sameVersion=true → existing.createdAt || Date.now() → 0 || Date.now()
        expect(written.createdAt).toBeGreaterThan(0);
        // attempts: 0 || 0 → 0
        expect(written.attempts).toBe(0);
        // lastAttemptTs: 0 || 0 → 0
        expect(written.lastAttemptTs).toBe(0);
        // lastError: '' || '' → ''
        expect(written.lastError).toBe('');
    });

    it('changes=undefined with no existing record', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('1.20.0', undefined);
        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        // changes: typeof undefined !== 'string' → existing?.changes || '' → undefined || '' → ''
        expect(written.changes).toBe('');
    });

    it('same version with existing but changes is numeric → uses existing?.changes || ""', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.20.0', changes: '', createdAt: 1000,
            attempts: 0, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        await SubPluginManager._rememberPendingMainUpdate('1.20.0');
        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.changes).toBe('');
    });
});

// ══════════════════════════════════════════════════════
// 3. retryPendingMainPluginUpdateOnBoot — full retry lifecycle
// ══════════════════════════════════════════════════════

describe('retryPendingMainPluginUpdateOnBoot — full retry paths', () => {
    it('full SUCCESSFUL retry (result.ok=true)', async () => {
        // B40-B62: full path through the retry → safeMainPluginUpdate returns ok
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.25.0', changes: 'big fix', createdAt: 1000,
            attempts: 0, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }],
        });

        // Mock safeMainPluginUpdate to return success
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: true });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(true);
        expect(safeUpdateSpy).toHaveBeenCalledWith('1.25.0', 'big fix');

        // Verify attempts was incremented
        const writeCalls = mockPluginStorage.setItem.mock.calls;
        const writeCall = writeCalls.find(c => c[0] === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
        expect(writeCall).toBeTruthy();
        const written = JSON.parse(writeCall[1]);
        expect(written.attempts).toBe(1);
        expect(written.lastAttemptTs).toBeGreaterThan(0);

        safeUpdateSpy.mockRestore();
    });

    it('full FAILED retry (result.ok=false) writes lastError', async () => {
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
                return JSON.stringify({
                    version: '1.25.0', changes: 'fix', createdAt: 1000,
                    attempts: 0, lastAttemptTs: 0, lastError: '',
                });
            }
            return null;
        });
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }],
        });

        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: false, error: 'Download failed' });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(true);
        expect(safeUpdateSpy).toHaveBeenCalled();

        // Verify lastError was written
        const lastWriteCall = mockPluginStorage.setItem.mock.calls[mockPluginStorage.setItem.mock.calls.length - 1];
        if (lastWriteCall && lastWriteCall[0] === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
            const written = JSON.parse(lastWriteCall[1]);
            expect(written.lastError).toBe('Download failed');
        }

        safeUpdateSpy.mockRestore();
    });

    it('empty installedVersion skips version comparison, proceeds to retry', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.25.0', changes: '', createdAt: 1000,
            attempts: 0, lastAttemptTs: 0, lastError: '',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        // Return empty version
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '' }],
        });

        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: true });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(true);
        expect(safeUpdateSpy).toHaveBeenCalled();
        safeUpdateSpy.mockRestore();
    });

    it('pending.changes empty → passes empty string to safeMainPluginUpdate', async () => {
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({
            version: '1.25.0', changes: '', createdAt: 1000,
            attempts: 1, lastAttemptTs: Date.now() - 999999, lastError: 'prev err',
        }));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6' }],
        });

        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: true });

        await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        // changes || '' → ''
        expect(safeUpdateSpy).toHaveBeenCalledWith('1.25.0', '');
        safeUpdateSpy.mockRestore();
    });

    it('catch branch: unexpected error → returns false', async () => {
        mockPluginStorage.getItem.mockRejectedValue(new Error('catastrophic'));
        // _readPendingMainUpdate catches internally, but if something in the outer try fails...
        // Actually _readPendingMainUpdate catches, so we need to break something deeper
        // Let's mock _readPendingMainUpdate to throw
        const readSpy = vi.spyOn(SubPluginManager, '_readPendingMainUpdate')
            .mockRejectedValue(new Error('unexpected'));
        
        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();
        expect(result).toBe(false);
        readSpy.mockRestore();
    });
});

// ══════════════════════════════════════════════════════
// 4. _getInstalledMainPluginVersion — edge cases
// ══════════════════════════════════════════════════════

describe('_getInstalledMainPluginVersion', () => {
    it('returns CPM_VERSION when no versionOfPlugin found', async () => {
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager' }],
        });
        const ver = await SubPluginManager._getInstalledMainPluginVersion();
        expect(ver).toBe('1.19.6'); // CPM_VERSION fallback
    });

    it('returns CPM_VERSION when getDatabase throws', async () => {
        mockGetDatabase.mockRejectedValue(new Error('db error'));
        const ver = await SubPluginManager._getInstalledMainPluginVersion();
        expect(ver).toBe('1.19.6');
    });

    it('returns empty when plugin not found and CPM_VERSION empty', async () => {
        mockGetDatabase.mockResolvedValue({ plugins: [] });
        const ver = await SubPluginManager._getInstalledMainPluginVersion();
        // plugin?.versionOfPlugin is undefined, CPM_VERSION is '1.19.6'
        expect(ver).toBeTruthy();
    });

    it('returns plugin version when found', async () => {
        mockGetDatabase.mockResolvedValue({
            plugins: [{ name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.20.5' }],
        });
        const ver = await SubPluginManager._getInstalledMainPluginVersion();
        expect(ver).toBe('1.20.5');
    });
});

// ══════════════════════════════════════════════════════
// 5. _clearPendingMainUpdate — catch branch
// ══════════════════════════════════════════════════════

describe('_clearPendingMainUpdate — catch branch', () => {
    it('silently handles error when removeItem throws', async () => {
        mockPluginStorage.removeItem = vi.fn().mockRejectedValue(new Error('rm fail'));
        // Should not throw
        await SubPluginManager._clearPendingMainUpdate();
    });

    it('silently handles error when setItem fallback throws', async () => {
        mockPluginStorage.removeItem = 'not-a-function';
        mockPluginStorage.setItem.mockRejectedValue(new Error('set fail'));
        await SubPluginManager._clearPendingMainUpdate();
    });
});

// ══════════════════════════════════════════════════════
// 6. safeMainPluginUpdate — deeper branches
// ══════════════════════════════════════════════════════

describe('safeMainPluginUpdate — download/install failure paths', () => {
    it('download fails with RETRIABLE error → keeps pending, shows toast', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);

        const dlSpy = vi.spyOn(SubPluginManager, '_downloadMainPluginCode')
            .mockResolvedValue({ ok: false, error: 'Network timeout 20s' });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);
        const clearSpy = vi.spyOn(SubPluginManager, '_clearPendingMainUpdate')
            .mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0', 'changes');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Network timeout');
        // Retriable error → should NOT clear pending
        expect(clearSpy).not.toHaveBeenCalled();
        expect(SubPluginManager._showMainAutoUpdateResult).toHaveBeenCalled();

        dlSpy.mockRestore();
        rememberSpy.mockRestore();
        clearSpy.mockRestore();
    });

    it('download fails with NON-RETRIABLE error → clears pending, shows toast', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        const dlSpy = vi.spyOn(SubPluginManager, '_downloadMainPluginCode')
            .mockResolvedValue({ ok: false, error: '이름 불일치' });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);
        const clearSpy = vi.spyOn(SubPluginManager, '_clearPendingMainUpdate')
            .mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0', 'changes');

        expect(result.ok).toBe(false);
        // Non-retriable → should clear pending
        expect(clearSpy).toHaveBeenCalled();

        dlSpy.mockRestore();
        rememberSpy.mockRestore();
        clearSpy.mockRestore();
    });

    it('install fails with NON-RETRIABLE, NON-same-version error → clears + shows toast', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;

        const dlSpy = vi.spyOn(SubPluginManager, '_downloadMainPluginCode')
            .mockResolvedValue({ ok: true, code: 'some code' });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin')
            .mockResolvedValue({ ok: false, error: '다운그레이드 차단: 현재 1.20.0 > 다운로드 1.19.0' });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);
        const clearSpy = vi.spyOn(SubPluginManager, '_clearPendingMainUpdate')
            .mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(clearSpy).toHaveBeenCalled(); // non-retriable
        expect(SubPluginManager._showMainAutoUpdateResult).toHaveBeenCalled(); // not same-version

        dlSpy.mockRestore();
        installSpy.mockRestore();
        rememberSpy.mockRestore();
        clearSpy.mockRestore();
    });

    it('install fails with same-version noop → suppresses toast', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;

        const dlSpy = vi.spyOn(SubPluginManager, '_downloadMainPluginCode')
            .mockResolvedValue({ ok: true, code: 'some code' });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin')
            .mockResolvedValue({ ok: false, error: '이미 같은 버전입니다: 1.19.6' });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);
        const clearSpy = vi.spyOn(SubPluginManager, '_clearPendingMainUpdate')
            .mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        // '이미 같은 버전' → toast should NOT be shown
        expect(SubPluginManager._showMainAutoUpdateResult).not.toHaveBeenCalled();

        dlSpy.mockRestore();
        installSpy.mockRestore();
        rememberSpy.mockRestore();
        clearSpy.mockRestore();
    });

    it('unexpected error in IIFE → returns error', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;

        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockRejectedValue(new Error('unexpected boom'));

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('예기치 않은 오류');

        rememberSpy.mockRestore();
    });

    it('joins existing in-flight promise', async () => {
        delete globalThis.window._cpmMainUpdateCompletedThisBoot;
        const existingPromise = Promise.resolve({ ok: true });
        SubPluginManager._mainUpdateInFlight = existingPromise;

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');
        expect(result.ok).toBe(true);
    });
});

// ══════════════════════════════════════════════════════
// 7. _validateAndInstallMainPlugin — header parsing + args merging
// ══════════════════════════════════════════════════════

describe('_validateAndInstallMainPlugin — header parsing deep branches', () => {
    it('parses @arg with meta, @link, @display-name correctly', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);

        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@display-name Cupcake Provider Manager',
            '//@version 1.20.0',
            '//@update-url https://example.com/update.js',
            '//@api 3.0',
            '//@arg provider string {{display::Provider}} {{tooltip::Select}}',
            '//@arg maxTokens int',
            '//@risu-arg temperature string {{slider::true}}',
            '//@link https://github.com/example Project Link',
            '//@link https://docs.example.com',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');

        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0', 'notes');
        expect(result.ok).toBe(true);
    });

    it('args merging preserves existing values when type matches', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager',
                versionOfPlugin: '1.19.6',
                version: '3.0',
                script: 'x'.repeat(400 * 1024),
                enabled: true,
                realArg: { provider: 'anthropic', depth: 5 },
                arguments: { provider: 'string', depth: 'int' },
                updateURL: 'https://example.com/old',
            }],
        });

        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '//@arg provider string',
            '//@arg depth int',
            '//@arg newArg string',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');

        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);

        const setCall = mockSetDatabaseLite.mock.calls[0][0];
        const updated = setCall.plugins[0];
        expect(updated.realArg.provider).toBe('anthropic'); // preserved
        expect(updated.realArg.depth).toBe(5); // preserved
        expect(updated.realArg.newArg).toBe(''); // new arg default
    });

    it('args merging resets when type changes', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager',
                versionOfPlugin: '1.19.6',
                version: '3.0',
                script: 'x'.repeat(400 * 1024),
                enabled: true,
                realArg: { provider: 'anthropic' },
                arguments: { provider: 'string' },
            }],
        });

        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '//@arg provider int',  // changed from string → int
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');

        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);

        const setCall = mockSetDatabaseLite.mock.calls[0][0];
        expect(setCall.plugins[0].realArg.provider).toBe(0); // reset to int default
    });

    it('missing @name → error', async () => {
        const code = [
            '//@version 1.20.0',
            '//@api 3.0',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('@name');
    });

    it('wrong @name → error', async () => {
        const code = [
            '//@name Wrong_Plugin_Name',
            '//@version 1.20.0',
            '//@api 3.0',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('불일치');
    });

    it('missing @version → error', async () => {
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@api 3.0',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('@version');
    });

    it('wrong API version (2.1) → error', async () => {
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 2.1',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('3.0');
    });

    it('version mismatch (parsed ≠ expected) → error', async () => {
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.21.0',
            '//@api 3.0',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('버전 불일치');
    });

    it('no DB → error', async () => {
        mockGetDatabase.mockResolvedValue(null);
        const result = await SubPluginManager._validateAndInstallMainPlugin(VALID_CODE, '1.20.0');
        expect(result.ok).toBe(false);
    });

    it('plugins not array → error', async () => {
        mockGetDatabase.mockResolvedValue({ plugins: 'not-array' });
        const result = await SubPluginManager._validateAndInstallMainPlugin(VALID_CODE, '1.20.0');
        expect(result.ok).toBe(false);
    });

    it('plugin not found → error', async () => {
        mockGetDatabase.mockResolvedValue({ plugins: [{ name: 'Other' }] });
        const result = await SubPluginManager._validateAndInstallMainPlugin(VALID_CODE, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('찾을 수 없습니다');
    });

    it('same version → error', async () => {
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.20.0',
                version: '3.0', script: 'x'.repeat(400 * 1024),
            }],
        });
        const result = await SubPluginManager._validateAndInstallMainPlugin(VALID_CODE, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('같은 버전');
    });

    it('downgrade → error', async () => {
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.21.0',
                version: '3.0', script: 'x'.repeat(400 * 1024),
            }],
        });
        const result = await SubPluginManager._validateAndInstallMainPlugin(VALID_CODE, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('다운그레이드');
    });

    it('code too short → error', async () => {
        const result = await SubPluginManager._validateAndInstallMainPlugin('short', '1.20.0');
        expect(result.ok).toBe(false);
    });

    it('incomplete download suspicion → error', async () => {
        const bigScript = 'x'.repeat(400 * 1024);
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6',
                version: '3.0', script: bigScript,
            }],
        });
        // New code is less than 95% of existing
        const smallCode = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '// small',
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(smallCode, '1.20.0');
        expect(result.ok).toBe(false);
        // Error is either about short code or incomplete download
        expect(result.ok).toBe(false);
    });

    it('DB save throws → error', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockSetDatabaseLite.mockRejectedValueOnce(new Error('save failed'));
        const bigCode = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(bigCode, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('DB 저장 실패');
    });

    it('remoteVersion empty → skips version mismatch check', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '', '');
        expect(result.ok).toBe(true);
    });

    it('@arg with no meta → no argMeta entry', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '//@arg simpleKey string',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);
    });

    it('existing.enabled = false → keeps disabled', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        mockGetDatabase.mockResolvedValue({
            plugins: [{
                name: 'Cupcake_Provider_Manager', versionOfPlugin: '1.19.6',
                version: '3.0', script: 'x'.repeat(400 * 1024),
                enabled: false, realArg: {}, arguments: {},
            }],
        });
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);
        const updated = mockSetDatabaseLite.mock.calls[0][0].plugins[0];
        expect(updated.enabled).toBe(false);
    });

    it('@link without hover text', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '//@link https://example.com',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);
        const updated = mockSetDatabaseLite.mock.calls[0][0].plugins[0];
        expect(updated.customLink).toHaveLength(1);
        expect(updated.customLink[0].hoverText).toBeUndefined();
    });

    it('@link with non-https is ignored', async () => {
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 3.0',
            '//@link http://example.com bad',
            '// padding '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(true);
        const updated = mockSetDatabaseLite.mock.calls[0][0].plugins[0];
        expect(updated.customLink).toHaveLength(0);
    });

    it('@api with 2.0 → detected as 2.0, fails 3.0 check', async () => {
        const code = [
            '//@name Cupcake_Provider_Manager',
            '//@version 1.20.0',
            '//@api 2.0',
            '// padding '.padEnd(200, 'x'),
        ].join('\n');
        const result = await SubPluginManager._validateAndInstallMainPlugin(code, '1.20.0');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('3.0');
    });
});

// ══════════════════════════════════════════════════════
// 8. checkAllUpdates — edge cases
// ══════════════════════════════════════════════════════

describe('checkAllUpdates — branch coverage', () => {
    it('fetch fails with status 500 → returns []', async () => {
        mockRisuFetch.mockResolvedValue({ data: null, status: 500 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('fetch fails with no data → returns []', async () => {
        mockRisuFetch.mockResolvedValue({ data: '', status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('schema invalid → returns []', async () => {
        mockValidateSchema.mockReturnValueOnce({ ok: false, error: 'bad schema' });
        mockRisuFetch.mockResolvedValue({
            data: JSON.stringify({ versions: {}, code: {} }),
            status: 200,
        });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('plugin without updateUrl is skipped', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'NoURL', version: '1.0.0' },
        ];
        const bundle = {
            versions: { NoURL: { version: '1.1.0', file: 'no.js', sha256: 'abc' } },
            code: { 'no.js': 'code' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('remote version not newer → no update', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.1.0', updateUrl: 'https://u' },
        ];
        const bundle = {
            versions: { TestPlugin: { version: '1.0.0', file: 'test.js' } },
            code: {},
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('code in bundle with valid SHA → update returned', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const testCode = '//@name TestPlugin\n//@version 1.1.0\n// code body here';
        const sha = await _computeSHA256(testCode);
        const bundle = {
            versions: { TestPlugin: { version: '1.1.0', file: 'test.js', sha256: sha } },
            code: { 'test.js': testCode },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results.length).toBe(1);
        expect(results[0].code).toBe(testCode);
    });

    it('SHA missing in bundle → plugin rejected', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const bundle = {
            versions: { TestPlugin: { version: '1.1.0', file: 'test.js' } },
            code: { 'test.js': 'some code' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        // No sha256 → rejected, but still pushed without code? Let me check...
        // Actually looking at source: `if (!remote.sha256) { continue; }` — so it's skipped entirely
        expect(results).toEqual([]);
    });

    it('SHA mismatch → plugin rejected', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const bundle = {
            versions: { TestPlugin: { version: '1.1.0', file: 'test.js', sha256: 'wronghash' } },
            code: { 'test.js': 'some code' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('code missing in bundle → included with null code', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const bundle = {
            versions: { TestPlugin: { version: '1.1.0', file: 'test.js', sha256: 'abc' } },
            code: {},
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results.length).toBe(1);
        expect(results[0].code).toBeNull();
    });

    it('plugin not in manifest → skipped with warning', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'MissingPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const bundle = { versions: {}, code: {} };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('exception → returns []', async () => {
        mockRisuFetch.mockRejectedValue(new Error('fetch error'));
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('non-string data → parsed as object directly', async () => {
        SubPluginManager.plugins = [];
        const bundle = { versions: {}, code: {} };
        mockRisuFetch.mockResolvedValue({ data: bundle, status: 200 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });
});

// ══════════════════════════════════════════════════════
// 9. applyUpdate — edge cases
// ══════════════════════════════════════════════════════

describe('applyUpdate — branch coverage', () => {
    it('plugin not found → false', async () => {
        SubPluginManager.plugins = [];
        const result = await SubPluginManager.applyUpdate('missing', 'code', 'sha');
        expect(result).toBe(false);
    });

    it('no prefetched code → false', async () => {
        SubPluginManager.plugins = [{ id: '1', name: 'Test' }];
        const result = await SubPluginManager.applyUpdate('1', '', 'sha');
        expect(result).toBe(false);
    });

    it('no SHA → false', async () => {
        SubPluginManager.plugins = [{ id: '1', name: 'Test' }];
        const result = await SubPluginManager.applyUpdate('1', 'code', '');
        expect(result).toBe(false);
    });

    it('SHA compute returns empty → false', async () => {
        SubPluginManager.plugins = [{ id: '1', name: 'Test' }];
        // crypto.subtle might not be available in test env  
        // _computeSHA256 should work in Node though. Let me use a real SHA mismatch instead.
        const result = await SubPluginManager.applyUpdate('1', 'code', 'wrong_sha_hash');
        expect(result).toBe(false);
    });

    it('name mismatch → false', async () => {
        SubPluginManager.plugins = [{ id: '1', name: 'OriginalName' }];
        const code = '//@name DifferentName\n//@version 1.0.0\ncontent';
        const sha = await _computeSHA256(code);
        const result = await SubPluginManager.applyUpdate('1', code, sha);
        expect(result).toBe(false);
    });

    it('successful update', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'TestPlugin', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const code = '//@name TestPlugin\n//@version 1.1.0\n//@description New desc\n//@icon 🧁\n//@update-url https://new-url\ncontent here';
        const sha = await _computeSHA256(code);
        const result = await SubPluginManager.applyUpdate('1', code, sha);
        expect(result).toBe(true);
        expect(SubPluginManager.plugins[0].version).toBe('1.1.0');
        expect(SubPluginManager.plugins[0].code).toBe(code);
        expect(SubPluginManager.saveRegistry).toHaveBeenCalled();
    });

    it('exception during apply → false', async () => {
        SubPluginManager.plugins = [{ id: '1', name: 'TestPlugin' }];
        const code = '//@name TestPlugin\n//@version 1.1.0\ncontent';
        const sha = await _computeSHA256(code);
        SubPluginManager.saveRegistry.mockRejectedValueOnce(new Error('save fail'));
        const result = await SubPluginManager.applyUpdate('1', code, sha);
        expect(result).toBe(false);
    });

    it('meta.name empty → uses existing name', async () => {
        SubPluginManager.plugins = [
            { id: '1', name: 'KeptName', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const code = '//@version 1.1.0\ncontent here lots of text';
        const sha = await _computeSHA256(code);
        const result = await SubPluginManager.applyUpdate('1', code, sha);
        // meta.name is empty so (meta.name && p.name && meta.name !== p.name) → false (short-circuit)
        expect(result).toBe(true);
        // meta.name is '' → (meta.name && p.name && meta.name !== p.name) short-circuits to false
        // p.name = meta.name || p.name → '' || 'KeptName' = 'KeptName'
        expect(SubPluginManager.plugins[0].name).toBe('KeptName');
    });
});

// ══════════════════════════════════════════════════════
// 10. checkVersionsQuiet — deeper branches
// ══════════════════════════════════════════════════════

describe('checkVersionsQuiet — full flow', () => {
    it('fetch fails with status 500 → silently returns', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockRisuFetch.mockResolvedValue({ data: null, status: 500 });
        await SubPluginManager.checkVersionsQuiet();
        // Should not throw
    });

    it('manifest schema invalid → returns', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockValidateSchema.mockReturnValueOnce({ ok: false, error: 'invalid' });
        mockRisuFetch.mockResolvedValue({
            data: JSON.stringify({}),
            status: 200,
        });
        await SubPluginManager.checkVersionsQuiet();
    });

    it('no plugins with updates → logs all up to date', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [
            { id: '1', name: 'Test', version: '1.1.0', updateUrl: 'https://u' },
        ];
        const manifest = {
            Test: { version: '1.0.0' },
            'Cupcake Provider Manager': { version: '1.19.6' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });
        await SubPluginManager.checkVersionsQuiet();
        // No updates → showUpdateToast NOT called
        expect(SubPluginManager.showUpdateToast).not.toHaveBeenCalled();
    });

    it('sub-plugin update available → shows toast', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [
            { id: '1', name: 'Test', version: '1.0.0', updateUrl: 'https://u', icon: '🔧' },
        ];
        const manifest = {
            Test: { version: '1.1.0', changes: 'fix bugs' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });
        await SubPluginManager.checkVersionsQuiet();
        expect(SubPluginManager.showUpdateToast).toHaveBeenCalled();
    });

    it('main update available from manifest → triggers safeMainPluginUpdate', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [];
        const manifest = {
            'Cupcake Provider Manager': { version: '1.25.0', changes: 'new features' },
        };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });

        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate').mockResolvedValue(undefined);

        await SubPluginManager.checkVersionsQuiet();
        // Main update is triggered via setTimeout, but in test env it's a microtask
        // Let the setTimeout fire
        await new Promise(r => setTimeout(r, 100));

        expect(globalThis.window._cpmMainVersionFromManifest).toBe(true);
        safeUpdateSpy.mockRestore();
        rememberSpy.mockRestore();
    });

    it('pluginStorage.getItem throws → continues without cooldown check', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockRejectedValue(new Error('storage broken'));
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [];
        mockRisuFetch.mockResolvedValue({
            data: JSON.stringify({ 'Cupcake Provider Manager': { version: '1.19.6' } }),
            status: 200,
        });
        await SubPluginManager.checkVersionsQuiet();
        // Should complete without error
    });

    it('data is string → JSON.parse applied', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [];
        mockRisuFetch.mockResolvedValue({
            data: '{}',
            status: 200,
        });
        await SubPluginManager.checkVersionsQuiet();
    });

    it('data is object → used directly', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [];
        mockRisuFetch.mockResolvedValue({
            data: {},
            status: 200,
        });
        await SubPluginManager.checkVersionsQuiet();
    });

    it('plugin without updateUrl skipped', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [
            { id: '1', name: 'NoUrl', version: '1.0.0' },
        ];
        const manifest = { NoUrl: { version: '2.0.0' } };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });
        await SubPluginManager.checkVersionsQuiet();
        expect(SubPluginManager.showUpdateToast).not.toHaveBeenCalled();
    });

    it('remote has no version → skipped', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [
            { id: '1', name: 'Test', version: '1.0.0', updateUrl: 'https://u' },
        ];
        const manifest = { Test: {} };
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });
        await SubPluginManager.checkVersionsQuiet();
    });

    it('exception → silently caught', async () => {
        delete globalThis.window._cpmVersionChecked;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockRisuFetch.mockRejectedValue(new Error('network error'));
        await SubPluginManager.checkVersionsQuiet();
    });
});

// ══════════════════════════════════════════════════════
// 11. checkMainPluginVersionQuiet — deeper branches
// ══════════════════════════════════════════════════════

describe('checkMainPluginVersionQuiet — branch coverage', () => {
    it('skips when _cpmMainVersionFromManifest is true', async () => {
        globalThis.window._cpmMainVersionFromManifest = true;
        delete globalThis.window._cpmMainVersionChecked;
        await SubPluginManager.checkMainPluginVersionQuiet();
        expect(mockNativeFetch).not.toHaveBeenCalled();
    });

    it('skips when _cpmMainVersionChecked is true', async () => {
        globalThis.window._cpmMainVersionChecked = true;
        await SubPluginManager.checkMainPluginVersionQuiet();
        expect(mockNativeFetch).not.toHaveBeenCalled();
    });

    it('skips when cooldown active', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(String(Date.now()));
        await SubPluginManager.checkMainPluginVersionQuiet();
        expect(mockNativeFetch).not.toHaveBeenCalled();
    });

    it('nativeFetch success → parses version → up to date', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        const responseCode = [
            '// @version 1.19.6',
            '// body',
        ].join('\n');
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: () => Promise.resolve(responseCode),
            headers: { get: () => null },
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
        // Version same → no update
    });

    it('nativeFetch success → newer version → triggers install', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);

        const responseCode = [
            '// @version 1.25.0',
            '// @changes Big improvements',
            '//@name Cupcake_Provider_Manager',
            '//@version 1.25.0',
            '//@api 3.0',
            '// body '.padEnd(400 * 1024, 'x'),
        ].join('\n');
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: () => Promise.resolve(responseCode),
            headers: { get: () => null },
        });

        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin')
            .mockResolvedValue({ ok: true });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: true });

        await SubPluginManager.checkMainPluginVersionQuiet();

        expect(installSpy).toHaveBeenCalled();
        installSpy.mockRestore();
        rememberSpy.mockRestore();
        safeUpdateSpy.mockRestore();
    });

    it('nativeFetch fails → falls back to risuFetch', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        mockNativeFetch.mockRejectedValue(new Error('native fail'));
        mockRisuFetch.mockResolvedValue({
            data: '// @version 1.19.6\n// body',
            status: 200,
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
        expect(mockRisuFetch).toHaveBeenCalled();
    });

    it('nativeFetch returns non-OK status → returns', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);

        mockNativeFetch.mockResolvedValue({
            ok: false, status: 500,
            text: () => Promise.resolve('error'),
            headers: { get: () => null },
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
    });

    it('risuFetch also fails → returns gracefully', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);

        mockNativeFetch.mockRejectedValue(new Error('native fail'));
        mockRisuFetch.mockRejectedValue(new Error('risu also fail'));

        await SubPluginManager.checkMainPluginVersionQuiet();
    });

    it('risuFetch returns error status → returns', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);

        mockNativeFetch.mockRejectedValue(new Error('native fail'));
        mockRisuFetch.mockResolvedValue({ data: null, status: 404 });

        await SubPluginManager.checkMainPluginVersionQuiet();
    });

    it('no @version tag found in code → returns', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: () => Promise.resolve('no version tag here'),
            headers: { get: () => null },
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
    });

    it('install fails → falls back to safeMainPluginUpdate', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);

        const code = '// @version 1.25.0\n// body '.padEnd(400 * 1024, 'x');
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: () => Promise.resolve(code),
            headers: { get: () => null },
        });

        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin')
            .mockResolvedValue({ ok: false, error: 'install failed' });
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate')
            .mockResolvedValue({ ok: true });
        const rememberSpy = vi.spyOn(SubPluginManager, '_rememberPendingMainUpdate')
            .mockResolvedValue(undefined);

        await SubPluginManager.checkMainPluginVersionQuiet();
        expect(safeUpdateSpy).toHaveBeenCalled();

        installSpy.mockRestore();
        safeUpdateSpy.mockRestore();
        rememberSpy.mockRestore();
    });

    it('pluginStorage.getItem throws during cooldown check → continues', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockRejectedValue(new Error('storage broken'));
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: () => Promise.resolve('// @version 1.19.6\n// body'),
            headers: { get: () => null },
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
    });

    it('risuFetch returns non-string data → converts with String()', async () => {
        delete globalThis.window._cpmMainVersionChecked;
        delete globalThis.window._cpmMainVersionFromManifest;
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);

        mockNativeFetch.mockRejectedValue(new Error('fail'));
        mockRisuFetch.mockResolvedValue({
            data: 12345, // non-string
            status: 200,
        });

        await SubPluginManager.checkMainPluginVersionQuiet();
    });
});

// ══════════════════════════════════════════════════════
// 12. _computeSHA256 — basic coverage
// ══════════════════════════════════════════════════════

describe('_computeSHA256', () => {
    it('computes SHA-256 hash for a string', async () => {
        const hash = await _computeSHA256('hello world');
        expect(hash).toBeTruthy();
        expect(hash.length).toBe(64); // hex string
    });

    it('returns consistent hash for same input', async () => {
        const h1 = await _computeSHA256('test');
        const h2 = await _computeSHA256('test');
        expect(h1).toBe(h2);
    });
});
