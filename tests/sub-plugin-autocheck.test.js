import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPluginStorage, mockRisuFetch, mockGetRootDocument, mockNativeFetch, mockGetDatabase, mockSetDatabaseLite } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn() },
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

import { SubPluginManager } from '../src/lib/sub-plugin-manager.js';

describe('SubPluginManager auto update checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        globalThis.window = globalThis.window || {};
        delete window._cpmVersionChecked;
        delete window._cpmMainVersionChecked;
        delete window._cpmMainVersionFromManifest;
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
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(SubPluginManager._MAIN_VERSION_CHECK_STORAGE_KEY, expect.any(String));
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
    '//@update-url https://cupcake-plugin-manager.vercel.app/provider-manager.js',
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
        updateURL: 'https://cupcake-plugin-manager.vercel.app/provider-manager.js',
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
        // Suppress toast in tests
        vi.spyOn(SubPluginManager, '_showMainAutoUpdateResult').mockResolvedValue();
    });

    it('downloads, validates, and installs plugin preserving existing settings', async () => {
        const existingPlugin = makeExistingPlugin();
        mockNativeFetch.mockResolvedValue({
            ok: true, status: 200,
            text: async () => VALID_PLUGIN_CODE,
            headers: { get: (k) => k === 'content-length' ? String(new TextEncoder().encode(VALID_PLUGIN_CODE).byteLength) : null },
        });
        mockGetDatabase.mockResolvedValue({
            plugins: [existingPlugin],
        });
        mockSetDatabaseLite.mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(true);
        expect(mockSetDatabaseLite).toHaveBeenCalledTimes(1);

        const savedDb = mockSetDatabaseLite.mock.calls[0][0];
        const updated = savedDb.plugins[0];
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

    it('falls back to risuFetch if nativeFetch throws', async () => {
        mockNativeFetch.mockRejectedValue(new Error('nativeFetch not available'));
        mockRisuFetch.mockResolvedValue({ status: 200, data: VALID_PLUGIN_CODE });
        mockGetDatabase.mockResolvedValue({ plugins: [makeExistingPlugin()] });
        mockSetDatabaseLite.mockResolvedValue(undefined);

        const result = await SubPluginManager.safeMainPluginUpdate('1.20.0');

        expect(result.ok).toBe(true);
        expect(mockNativeFetch).toHaveBeenCalledTimes(1);
        expect(mockRisuFetch).toHaveBeenCalledTimes(1);
    });

    it('fails if getDatabase returns null (permission denied)', async () => {
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
});
