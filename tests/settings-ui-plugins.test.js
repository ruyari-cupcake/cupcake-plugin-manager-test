/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSafeGetArg,
    mockHelpers,
    mockSubPluginManager,
} = vi.hoisted(() => ({
    mockSafeGetArg: vi.fn(async () => ''),
    mockHelpers: {
        getSubPluginFileAccept: vi.fn(() => '.js,.mjs'),
        escHtml: vi.fn((s) => String(s ?? '')),
    },
    mockSubPluginManager: {
        plugins: [],
        install: vi.fn(async () => 'InstalledPlugin'),
        hotReload: vi.fn(async () => true),
        toggle: vi.fn(async () => true),
        unloadPlugin: vi.fn(),
        remove: vi.fn(async () => true),
        purgeAllCpmData: vi.fn(async () => ({ pluginStorageCleared: 3, argsCleared: 4 })),
        checkAllUpdates: vi.fn(async () => []),
        applyUpdate: vi.fn(async () => true),
    },
}));

vi.mock('../src/lib/shared-state.js', () => ({ safeGetArg: (...a) => mockSafeGetArg(...a) }));
vi.mock('../src/lib/helpers.js', () => ({
    getSubPluginFileAccept: (...a) => mockHelpers.getSubPluginFileAccept(...a),
    escHtml: (...a) => mockHelpers.escHtml(...a),
}));
vi.mock('../src/lib/sub-plugin-manager.js', () => ({ SubPluginManager: mockSubPluginManager }));

import { buildPluginsTabRenderer, initUpdateCheckButton } from '../src/lib/settings-ui-plugins.js';

describe('buildPluginsTabRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        window.CupcakePM_SubPlugins = [];
        globalThis.alert = vi.fn();
        globalThis.confirm = vi.fn(() => true);
    });

    it('returns safely when plugin list container is missing', () => {
        const render = buildPluginsTabRenderer(vi.fn());
        expect(() => render()).not.toThrow();
    });

    it('renders empty state when no plugins are installed', () => {
        mockSubPluginManager.plugins = [];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';

        buildPluginsTabRenderer(vi.fn())();

        expect(document.getElementById('cpm-plugins-list').innerHTML).toContain('설치된 서브 플러그인이 없습니다.');
        expect(mockHelpers.getSubPluginFileAccept).toHaveBeenCalled();
    });

    it('renders plugin cards and dynamic plugin UI', () => {
        mockSubPluginManager.plugins = [{
            id: 'sp1', name: 'Alpha', icon: '🧩', version: '1.0.0', description: 'Desc', enabled: true,
        }];
        const onRender = vi.fn();
        window.CupcakePM_SubPlugins = [{ id: 'sp1', uiHtml: '<button>UI</button>', onRender }];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div><button id="cpm-check-updates-btn"></button><div id="cpm-update-status" class="hidden"></div>';

        buildPluginsTabRenderer(vi.fn())();

        expect(document.getElementById('cpm-plugins-list').innerHTML).toContain('Alpha');
        expect(document.getElementById('plugin-ui-sp1').innerHTML).toContain('UI');
        expect(onRender).toHaveBeenCalled();
    });

    it('upload button triggers hidden file input click', () => {
        mockSubPluginManager.plugins = [];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        const input = document.getElementById('cpm-file-plugin');
        const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
        document.getElementById('cpm-btn-upload-plugin').click();

        expect(clickSpy).toHaveBeenCalled();
    });

    it('upload change installs and hot reloads plugin', async () => {
        mockSubPluginManager.plugins = [{ id: 'sp1', name: 'InstalledPlugin', enabled: true }];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        const setVal = vi.fn();
        const render = buildPluginsTabRenderer(setVal);
        render();

        class MockFileReader {
            readAsText(_file) {
                this.onload({ target: { result: '// @name InstalledPlugin' } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        const input = document.getElementById('cpm-file-plugin');
        Object.defineProperty(input, 'files', { value: [{ name: 'plugin.js' }], configurable: true });
        input.dispatchEvent(new Event('change'));
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSubPluginManager.install).toHaveBeenCalledWith('// @name InstalledPlugin');
        expect(mockSubPluginManager.hotReload).toHaveBeenCalledWith('sp1');
        expect(globalThis.alert).toHaveBeenCalled();
    });

    it('toggle handler updates enabled state and hot reloads', async () => {
        mockSubPluginManager.plugins = [{ id: 'sp1', name: 'Alpha', enabled: true }];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        const toggle = document.querySelector('.cpm-plugin-toggle');
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        await Promise.resolve();

        expect(mockSubPluginManager.toggle).toHaveBeenCalledWith('sp1', false);
        expect(mockSubPluginManager.hotReload).toHaveBeenCalledWith('sp1');
    });

    it('delete handler unloads and removes plugin after confirmation', async () => {
        mockSubPluginManager.plugins = [{ id: 'sp1', name: 'Alpha', enabled: true }];
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        document.querySelector('.cpm-plugin-delete').click();
        await Promise.resolve();

        expect(globalThis.confirm).toHaveBeenCalled();
        expect(mockSubPluginManager.unloadPlugin).toHaveBeenCalledWith('sp1');
        expect(mockSubPluginManager.remove).toHaveBeenCalledWith('sp1');
    });

    it('purge button aborts when first confirmation is cancelled', () => {
        mockSubPluginManager.plugins = [];
        globalThis.confirm = vi.fn(() => false);
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        document.getElementById('cpm-purge-all-btn').click();

        expect(mockSubPluginManager.purgeAllCpmData).not.toHaveBeenCalled();
    });

    it('purge button purges data after double confirmation', async () => {
        mockSubPluginManager.plugins = [];
        globalThis.confirm = vi.fn(() => true);
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        document.getElementById('cpm-purge-all-btn').click();
        await Promise.resolve();

        expect(mockSubPluginManager.purgeAllCpmData).toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('CPM 데이터가 모두 삭제되었습니다'));
    });

    it('purge button restores UI on failure', async () => {
        mockSubPluginManager.plugins = [];
        mockSubPluginManager.purgeAllCpmData.mockRejectedValueOnce(new Error('boom'));
        document.body.innerHTML = '<div id="cpm-plugins-list"></div>';
        buildPluginsTabRenderer(vi.fn())();

        const btn = document.getElementById('cpm-purge-all-btn');
        btn.click();
        await Promise.resolve();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('삭제 중 오류가 발생했습니다'));
        expect(btn.disabled).toBe(false);
    });
});

describe('initUpdateCheckButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('returns when button is missing', () => {
        expect(() => initUpdateCheckButton(vi.fn())).not.toThrow();
    });

    it('does not double-bind an already bound button', () => {
        document.body.innerHTML = '<button id="cpm-check-updates-btn" data-cpm-bound="true"></button><div id="cpm-update-status"></div>';
        initUpdateCheckButton(vi.fn());
        expect(document.getElementById('cpm-check-updates-btn').dataset.cpmBound).toBe('true');
    });

    it('shows up-to-date message when no updates are found', async () => {
        document.body.innerHTML = '<button id="cpm-check-updates-btn"></button><div id="cpm-update-status" class="hidden"></div>';
        initUpdateCheckButton(vi.fn());

        document.getElementById('cpm-check-updates-btn').click();
        await Promise.resolve();

        expect(document.getElementById('cpm-update-status').innerHTML).toContain('최신 버전입니다');
    });

    it('renders update buttons and applies a selected update', async () => {
        mockSubPluginManager.checkAllUpdates.mockResolvedValueOnce([
            {
                plugin: { id: 'sp1', name: 'Alpha', icon: '🧩' },
                localVersion: '1.0.0',
                remoteVersion: '1.1.0',
                code: '// @name Alpha\n// @version 1.1.0',
                expectedSHA256: 'hash',
            },
        ]);
        document.body.innerHTML = '<button id="cpm-check-updates-btn"></button><div id="cpm-update-status" class="hidden"></div>';
        initUpdateCheckButton(vi.fn());

        document.getElementById('cpm-check-updates-btn').click();
        await Promise.resolve();
        const btn = document.querySelector('.cpm-apply-update');
        btn.click();
        await Promise.resolve();

        expect(mockSubPluginManager.applyUpdate).toHaveBeenCalledWith('sp1', expect.stringContaining('Alpha'), 'hash');
        expect(mockSubPluginManager.hotReload).toHaveBeenCalledWith('sp1');
    });

    it('shows error message when update check fails', async () => {
        mockSubPluginManager.checkAllUpdates.mockRejectedValueOnce(new Error('network'));
        document.body.innerHTML = '<button id="cpm-check-updates-btn"></button><div id="cpm-update-status" class="hidden"></div>';
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        initUpdateCheckButton(vi.fn());

        document.getElementById('cpm-check-updates-btn').click();
        await Promise.resolve();

        expect(document.getElementById('cpm-update-status').innerHTML).toContain('업데이트 확인 중 오류가 발생했습니다');
        expect(errorSpy).toHaveBeenCalled();
    });
});
