import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_UPDATE_URL } from '../src/lib/endpoints.js';

const { mockPluginStorage, mockRisuFetch, mockGetRootDocument, mockNativeFetch, mockGetDatabase, mockSetDatabaseLite } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
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

import { SubPluginManager, _computeSHA256 } from '../src/lib/sub-plugin-manager.js';

describe('SubPluginManager auto update checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmVersionChecked;
        delete window._cpmMainVersionChecked;
        delete window._cpmMainVersionFromManifest;
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        SubPluginManager.plugins = [{
            id: 'sp1',
            name: 'Alpha',
            version: '1.0.0',
            enabled: true,
            code: 'old',
            updateUrl: 'https://example.com/a.js',
            icon: '🧩',
        }];
        SubPluginManager._pendingUpdateNames = [];
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('skips checkVersionsQuiet during cooldown without fetching', async () => {
        mockPluginStorage.getItem.mockResolvedValueOnce(String(Date.now()));

        await SubPluginManager.checkVersionsQuiet();

        expect(mockRisuFetch).not.toHaveBeenCalled();
    });

    it('collects plugin update names and shows toast when manifest has updates', async () => {
        mockRisuFetch.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                Alpha: { version: '1.1.0', changes: 'fixes' },
                'Cupcake Provider Manager': { version: '1.20.0', changes: 'main' },
            }),
        });
        const toastSpy = vi.spyOn(SubPluginManager, 'showUpdateToast').mockResolvedValue();
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });

        await SubPluginManager.checkVersionsQuiet();
        await vi.advanceTimersByTimeAsync(1500);

        expect(SubPluginManager._pendingUpdateNames).toEqual(['Alpha']);
        expect(toastSpy).toHaveBeenCalledWith([expect.objectContaining({ name: 'Alpha', remoteVersion: '1.1.0' })]);
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY,
            expect.stringContaining('"version":"1.20.0"')
        );
        expect(safeUpdateSpy).toHaveBeenCalledWith('1.20.0', 'main');
    });

    it('ignores invalid manifest structures', async () => {
        mockRisuFetch.mockResolvedValue({ status: 200, data: JSON.stringify(['bad']) });
        const toastSpy = vi.spyOn(SubPluginManager, 'showUpdateToast').mockResolvedValue();

        await SubPluginManager.checkVersionsQuiet();

        expect(toastSpy).not.toHaveBeenCalled();
        expect(SubPluginManager._pendingUpdateNames).toEqual([]);
    });

    it('sets _cpmMainVersionFromManifest flag even when main plugin is up to date (no update)', async () => {
        mockRisuFetch.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                'Cupcake Provider Manager': { version: '1.19.6', changes: '' },
            }),
        });

        expect(window._cpmMainVersionFromManifest).toBeUndefined();
        await SubPluginManager.checkVersionsQuiet();
        expect(window._cpmMainVersionFromManifest).toBe(true);
    });

    it('checkMainPluginVersionQuiet skips JS fallback when manifest already handled main version', async () => {
        window._cpmMainVersionFromManifest = true;

        await SubPluginManager.checkMainPluginVersionQuiet();

        expect(mockRisuFetch).not.toHaveBeenCalled();
    });

    it('checkMainPluginVersionQuiet parses remote version tag and auto-installs update', async () => {
        mockRisuFetch.mockResolvedValue({
            status: 200,
            data: '// @version 1.20.1\n// @changes better stability\nconsole.log("ok")',
        });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin').mockResolvedValue({ ok: true });

        await SubPluginManager.checkMainPluginVersionQuiet();

        // Should try direct install with already-downloaded code
        expect(installSpy).toHaveBeenCalledWith(
            expect.any(String), // the downloaded code
            '1.20.1',
            'better stability'
        );
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY,
            expect.stringContaining('"version":"1.20.1"')
        );
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(SubPluginManager._MAIN_VERSION_CHECK_STORAGE_KEY, expect.any(String));
    });

    it('retryPendingMainPluginUpdateOnBoot is a no-op when no marker exists', async () => {
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        expect(result).toBe(false);
        expect(safeUpdateSpy).not.toHaveBeenCalled();
    });

    it('retryPendingMainPluginUpdateOnBoot retries once when marker exists', async () => {
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
                return JSON.stringify({ version: '1.20.1', changes: 'retry me', attempts: 0, lastAttemptTs: 0 });
            }
            return null;
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: false, error: 'network' });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        expect(result).toBe(true);
        expect(safeUpdateSpy).toHaveBeenCalledWith('1.20.1', 'retry me');
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY,
            expect.stringContaining('"attempts":1')
        );
    });

    it('retryPendingMainPluginUpdateOnBoot clears marker when target is already installed', async () => {
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
                return JSON.stringify({ version: '1.19.6', changes: 'done', attempts: 1, lastAttemptTs: 0 });
            }
            return null;
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        expect(result).toBe(true);
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('checkMainPluginVersionQuiet falls back to safeMainPluginUpdate if direct install fails', async () => {
        mockRisuFetch.mockResolvedValue({
            status: 200,
            data: '// @version 1.20.1\n// @changes better stability\nconsole.log("ok")',
        });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin').mockResolvedValue({ ok: false, error: 'too short' });
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });

        await SubPluginManager.checkMainPluginVersionQuiet();

        expect(installSpy).toHaveBeenCalled();
        expect(safeUpdateSpy).toHaveBeenCalledWith('1.20.1', 'better stability');
    });

    it('checkMainPluginVersionQuiet skips when remote version tag is missing', async () => {
        mockRisuFetch.mockResolvedValue({ status: 200, data: 'console.log("no version")' });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin').mockResolvedValue({ ok: true });

        await SubPluginManager.checkMainPluginVersionQuiet();

        expect(installSpy).not.toHaveBeenCalled();
    });
});

// ── safeMainPluginUpdate tests ──

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

function makeExistingPlugin() {
    return {
        name: 'Cupcake_Provider_Manager',
        displayName: 'Cupcake Provider Manager',
        script: 'old code',
        arguments: { cpm_openai_key: 'string', cpm_openai_model: 'string', debug: 'int', cpm_removed_arg: 'string' },
        realArg: { cpm_openai_key: 'sk-test-123', cpm_openai_model: 'gpt-4', debug: '1', cpm_removed_arg: 'oldval' },
        argMeta: {},
        version: '3.0',
        customLink: [],
        versionOfPlugin: '1.19.6',
        updateURL: MAIN_UPDATE_URL,
        enabled: true,
    };
}

describe('safeMainPluginUpdate', () => {
    beforeEach(() => {
        vi.restoreAllMocks(); // Restore spies from previous describe blocks
        vi.clearAllMocks();
        mockNativeFetch.mockReset();
        mockGetDatabase.mockReset();
        mockSetDatabaseLite.mockReset();
        globalThis.window = globalThis.window || {};
        delete window._cpmMainUpdateCompletedThisBoot;
        SubPluginManager._mainUpdateInFlight = null;
        // Suppress toast in tests
        vi.spyOn(SubPluginManager, '_showMainAutoUpdateResult').mockResolvedValue();
        vi.spyOn(SubPluginManager, '_waitForMainPluginPersistence').mockResolvedValue();
    });

    it('downloads, validates, and installs plugin preserving existing settings', async () => {
        const existingPlugin = makeExistingPlugin();
        const existingDb = {
            plugins: [existingPlugin],
        };
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: (k) => k === 'content-length' ? String(new TextEncoder().encode(VALID_PLUGIN_CODE).byteLength) : null },
        });
        mockGetDatabase.mockResolvedValue(existingDb);
        mockSetDatabaseLite.mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(true);
        expect(mockSetDatabaseLite).toHaveBeenCalledTimes(1);
        expect(SubPluginManager._waitForMainPluginPersistence).toHaveBeenCalledTimes(1);
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            'cpm_last_main_update_flush',
            expect.any(String)
        );
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);

        const savedDb = mockSetDatabaseLite.mock.calls[0][0];
        const updated = savedDb.plugins[0];
        expect(savedDb).toEqual({ plugins: expect.any(Array) });
        expect(savedDb).not.toBe(existingDb);
        expect(savedDb.plugins).not.toBe(existingDb.plugins);
        expect(updated.name).toBe('Cupcake_Provider_Manager');
        expect(updated.versionOfPlugin).toBe('1.20.0');
        expect(updated.version).toBe('3.0');
        // Existing settings preserved for matching args
        expect(updated.realArg.cpm_openai_key).toBe('sk-test-123');
        expect(updated.realArg.cpm_openai_model).toBe('gpt-4');
        expect(updated.realArg.debug).toBe('1');
        // Removed arg should NOT be present
        expect(updated.realArg.cpm_removed_arg).toBeUndefined();
        expect(updated.enabled).toBe(true);
    });

    it('rejects code with wrong plugin name', async () => {
        const wrongNameCode = VALID_PLUGIN_CODE.replace('Cupcake_Provider_Manager', 'Some_Other_Plugin');
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => wrongNameCode,
            headers: { get: () => null },
        });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('이름 불일치');
        expect(mockGetDatabase).not.toHaveBeenCalled();
    });

    it('rejects code with missing version tag', async () => {
        const noVersionCode = VALID_PLUGIN_CODE.replace('//@version 1.20.0', '// no version');
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => noVersionCode,
            headers: { get: () => null },
        });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('버전 정보');
    });

    it('retries on incomplete download and fails after MAX_RETRIES', async () => {
        const fullLength = new TextEncoder().encode(VALID_PLUGIN_CODE).byteLength;
        // Return truncated text but correct Content-Length header
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE.slice(0, 10),
            headers: { get: (k) => k === 'content-length' ? String(fullLength) : null },
        });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('다운로드 불완전');
        // Should have been called 3 times (MAX_RETRIES)
        expect(mockNativeFetch).toHaveBeenCalledTimes(3);
    });

    it('prefers update bundle via risuFetch and skips static JS fallback when bundle is valid', async () => {
        const hash = await _computeSHA256(VALID_PLUGIN_CODE);
        mockRisuFetch.mockResolvedValueOnce({
            status: 200,
            data: JSON.stringify({
                versions: {
                    'Cupcake Provider Manager': {
                        version: '1.20.0',
                        file: 'provider-manager.js',
                        sha256: hash,
                    },
                },
                code: {
                    'provider-manager.js': VALID_PLUGIN_CODE,
                },
            }),
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        mockSetDatabaseLite.mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(true);
        expect(mockRisuFetch).toHaveBeenCalledTimes(1);
        expect(mockNativeFetch).not.toHaveBeenCalled();
    });

    it('fails if getDatabase returns null (permission denied)', async () => {
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue(null);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('데이터베이스 접근 실패');
    });

    it('fails if plugin not found in DB', async () => {
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue({ plugins: [{ name: 'Other_Plugin' }] });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('찾을 수 없습니다');
    });

    it('rejects expected-version mismatch before DB write', async () => {
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: () => null },
        });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.1');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('버전 불일치');
        expect(mockGetDatabase).not.toHaveBeenCalled();
    });

    it('rejects downgrade downloads before DB write', async () => {
        const downgradeCode = VALID_PLUGIN_CODE.replace('//@version 1.20.0', '//@version 1.19.5');
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => downgradeCode,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });

        const result = await SubPluginManager.safeMainPluginUpdate('1.19.5');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('다운그레이드 차단');
        expect(mockSetDatabaseLite).not.toHaveBeenCalled();
    });

    it('skips redundant download when _cpmMainUpdateCompletedThisBoot is set', async () => {
        window._cpmMainUpdateCompletedThisBoot = true;

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0', 'changes');

        expect(result.ok).toBe(true);
        expect(mockNativeFetch).not.toHaveBeenCalled();
        expect(mockRisuFetch).not.toHaveBeenCalled();
        // Should still clear any pending marker
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);

        delete window._cpmMainUpdateCompletedThisBoot;
    });

    it('suppresses failure toast for "이미 같은 버전" error', async () => {
        const sameVersionCode = VALID_PLUGIN_CODE.replace('//@version 1.20.0', '//@version 1.19.6');
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => sameVersionCode,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });

        const result = await SubPluginManager.safeMainPluginUpdate('1.19.6');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('이미 같은 버전');
        // Toast should NOT have been called — "same version" is a no-op, not a real error
        expect(SubPluginManager._showMainAutoUpdateResult).not.toHaveBeenCalled();
    });

    it('clears pending marker on non-retriable error', async () => {
        const wrongNameCode = VALID_PLUGIN_CODE.replace('Cupcake_Provider_Manager', 'Some_Other_Plugin');
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => wrongNameCode,
            headers: { get: () => null },
        });

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('이름 불일치');
        // Non-retriable error → marker should be cleared
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('preserves pending marker on retriable (network) error', async () => {
        // Both fetch paths fail → download error is retriable
        mockRisuFetch.mockResolvedValue({ status: 500, data: '' });
        mockNativeFetch.mockRejectedValue(new Error('network error'));

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(false);
        // Marker should NOT be cleared — network error is retriable
        expect(mockPluginStorage.removeItem).not.toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('deduplicates concurrent calls via _mainUpdateInFlight', async () => {
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        mockSetDatabaseLite.mockResolvedValue(undefined);

        // Fire two concurrent calls
        const [r1, r2] = await Promise.all([
            SubPluginManager.safeMainPluginUpdate('1.20.0'),
            SubPluginManager.safeMainPluginUpdate('1.20.0'),
        ]);

        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        // Only ONE download should have happened (second call joins the first)
        expect(mockNativeFetch).toHaveBeenCalledTimes(1);
    });
});

// ── Retry helpers unit tests ──

describe('retry helper functions', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        mockPluginStorage.removeItem.mockResolvedValue(undefined);
        globalThis.window = globalThis.window || {};
        delete window._cpmMainVersionChecked;
        delete window._cpmMainVersionFromManifest;
        delete window._cpmMainUpdateCompletedThisBoot;
    });

    // ── _isRetriableMainUpdateError ──

    it('classifies unknown / network errors as retriable', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('')).toBe(true);
        expect(SubPluginManager._isRetriableMainUpdateError(null)).toBe(true);
        expect(SubPluginManager._isRetriableMainUpdateError('network timeout')).toBe(true);
        expect(SubPluginManager._isRetriableMainUpdateError('다운로드 불완전: 50000B 중 1000B만 수신됨')).toBe(true);
        expect(SubPluginManager._isRetriableMainUpdateError('DB 저장 실패: unknown')).toBe(true);
    });

    it('classifies permanent errors as non-retriable', () => {
        expect(SubPluginManager._isRetriableMainUpdateError('이름 불일치: "X" ≠ "Y"')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('버전 불일치: 기대 1.20, 실제 1.19')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('API 버전이 3.0이 아닙니다: 2.0')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('다운그레이드 차단: 현재 1.20 > 다운로드 1.19')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('이미 같은 버전입니다: 1.20.0')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('플러그인을 DB에서 찾을 수 없습니다')).toBe(false);
        expect(SubPluginManager._isRetriableMainUpdateError('플러그인 목록을 찾을 수 없습니다')).toBe(false);
    });

    // ── _readPendingMainUpdate ──

    it('returns null when pluginStorage is empty', async () => {
        expect(await SubPluginManager._readPendingMainUpdate()).toBeNull();
    });

    it('returns null and clears marker for corrupt JSON', async () => {
        mockPluginStorage.getItem.mockResolvedValueOnce('{{not json}}');

        const result = await SubPluginManager._readPendingMainUpdate();

        expect(result).toBeNull();
        // Should have attempted to clear the corrupt marker
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('returns null and clears marker for object without version', async () => {
        mockPluginStorage.getItem.mockResolvedValueOnce(JSON.stringify({ changes: 'x' }));

        const result = await SubPluginManager._readPendingMainUpdate();

        expect(result).toBeNull();
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('parses valid marker correctly', async () => {
        const marker = { version: '1.21.0', changes: 'new stuff', createdAt: 1000, attempts: 2, lastAttemptTs: 2000, lastError: 'oops' };
        mockPluginStorage.getItem.mockResolvedValueOnce(JSON.stringify(marker));

        const result = await SubPluginManager._readPendingMainUpdate();

        expect(result).toEqual(marker);
    });

    // ── _clearPendingMainUpdate fallback ──

    it('falls back to setItem("") when removeItem is not available', async () => {
        // Temporarily make removeItem not a function
        const origRemoveItem = mockPluginStorage.removeItem;
        mockPluginStorage.removeItem = 'not-a-function';

        await SubPluginManager._clearPendingMainUpdate();

        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY, '');

        // Restore
        mockPluginStorage.removeItem = origRemoveItem;
    });

    // ── _rememberPendingMainUpdate ──

    it('does nothing when version is empty', async () => {
        await SubPluginManager._rememberPendingMainUpdate('', 'changes');
        await SubPluginManager._rememberPendingMainUpdate(null, 'changes');

        expect(mockPluginStorage.setItem).not.toHaveBeenCalled();
    });

    it('preserves existing attempts/timestamps for same version', async () => {
        const existing = { version: '1.21.0', changes: 'old', createdAt: 500, attempts: 3, lastAttemptTs: 900, lastError: 'err' };
        mockPluginStorage.getItem.mockResolvedValueOnce(JSON.stringify(existing));

        await SubPluginManager._rememberPendingMainUpdate('1.21.0', 'new changes');

        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.version).toBe('1.21.0');
        expect(written.changes).toBe('new changes');  // changes can be updated
        expect(written.createdAt).toBe(500);           // preserved
        expect(written.attempts).toBe(3);              // preserved
        expect(written.lastAttemptTs).toBe(900);       // preserved
        expect(written.lastError).toBe('err');         // preserved
    });

    it('resets counters for different version', async () => {
        const existing = { version: '1.20.0', changes: 'old', createdAt: 500, attempts: 3, lastAttemptTs: 900, lastError: 'err' };
        mockPluginStorage.getItem.mockResolvedValueOnce(JSON.stringify(existing));

        await SubPluginManager._rememberPendingMainUpdate('1.21.0', 'brand new');

        const written = JSON.parse(mockPluginStorage.setItem.mock.calls[0][1]);
        expect(written.version).toBe('1.21.0');
        expect(written.changes).toBe('brand new');
        expect(written.attempts).toBe(0);              // reset
        expect(written.lastAttemptTs).toBe(0);          // reset
        expect(written.lastError).toBe('');             // reset
    });

    // ── retryPendingMainPluginUpdateOnBoot — additional edge cases ──

    it('retryBoot clears marker and returns false when max attempts exceeded', async () => {
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
                return JSON.stringify({ version: '1.21.0', changes: 'x', attempts: 2, lastAttemptTs: 0 });
            }
            return null;
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        expect(result).toBe(false);
        expect(safeUpdateSpy).not.toHaveBeenCalled();
        expect(mockPluginStorage.removeItem).toHaveBeenCalledWith(SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY);
    });

    it('retryBoot returns false during cooldown without calling safeMainPluginUpdate', async () => {
        const recentTs = Date.now() - 60000; // 1 min ago (well within 5 min cooldown)
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) {
                return JSON.stringify({ version: '1.21.0', changes: 'x', attempts: 1, lastAttemptTs: recentTs });
            }
            return null;
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        const safeUpdateSpy = vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: true });

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        expect(result).toBe(false);
        expect(safeUpdateSpy).not.toHaveBeenCalled();
    });

    it('checkMainPluginVersionQuiet falls back when nativeFetch body read hangs', async () => {
        vi.useFakeTimers();
        mockNativeFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => new Promise(() => {}),
        });
        mockRisuFetch.mockResolvedValue({
            status: 200,
            data: '// @version 1.20.1\n// @changes body-timeout fallback\nconsole.log("ok")',
        });
        const installSpy = vi.spyOn(SubPluginManager, '_validateAndInstallMainPlugin').mockResolvedValue({ ok: true });

        const promise = SubPluginManager.checkMainPluginVersionQuiet();
        await vi.advanceTimersByTimeAsync(20100);
        await promise;

        expect(installSpy).toHaveBeenCalledWith(
            expect.any(String),
            '1.20.1',
            'body-timeout fallback'
        );

        vi.useRealTimers();
    });

    it('retryBoot records lastError after failed retry', async () => {
        // Need to track setItem calls carefully — getItem needs to return
        // updated values as the retry writes the marker multiple times.
        let storedMarker = JSON.stringify({ version: '1.21.0', changes: 'x', attempts: 0, lastAttemptTs: 0, lastError: '' });
        mockPluginStorage.getItem.mockImplementation(async (key) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) return storedMarker;
            return null;
        });
        mockPluginStorage.setItem.mockImplementation(async (key, value) => {
            if (key === SubPluginManager._MAIN_UPDATE_RETRY_STORAGE_KEY) storedMarker = value;
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        vi.spyOn(SubPluginManager, 'safeMainPluginUpdate').mockResolvedValue({ ok: false, error: 'timeout reached' });

        await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        const finalMarker = JSON.parse(storedMarker);
        expect(finalMarker.attempts).toBe(1);
        expect(finalMarker.lastError).toBe('timeout reached');
    });

    it('retryBoot handles pluginStorage.getItem throwing gracefully', async () => {
        mockPluginStorage.getItem.mockRejectedValue(new Error('storage unavailable'));

        const result = await SubPluginManager.retryPendingMainPluginUpdateOnBoot();

        // Should not crash, just return false
        expect(result).toBe(false);
    });

    it('sets _cpmMainUpdateCompletedThisBoot flag on successful install', async () => {
        delete window._cpmMainUpdateCompletedThisBoot;
        mockRisuFetch.mockResolvedValueOnce({ status: 500, data: '' });
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: () => null },
        });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        mockSetDatabaseLite.mockResolvedValue(undefined);
        vi.spyOn(SubPluginManager, '_showMainAutoUpdateResult').mockResolvedValue();
        vi.spyOn(SubPluginManager, '_waitForMainPluginPersistence').mockResolvedValue();

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(true);
        expect(window._cpmMainUpdateCompletedThisBoot).toBe(true);

        delete window._cpmMainUpdateCompletedThisBoot;
    });
});
