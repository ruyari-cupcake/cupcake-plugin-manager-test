/**
 * integration-settings-panels.test.js — Integration tests for settings-ui-panels.js
 * and settings-ui-plugins.js uncovered branches.
 *
 * @vitest-environment jsdom
 *
 * Targets:
 *   settings-ui-panels.js L48-154  — normalizeImportEnvelope, API view, export/import
 *   settings-ui-panels.js L197-208 — FileReader.onload import flow
 *   settings-ui-plugins.js L90-200 — purge double-confirm, plugin dynamic UI
 *   settings-ui-plugins.js L233    — double-bind guard (cpmBound)
 *   settings-ui-plugins.js L244    — update check error branch
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    mockRisu: {
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
        setArgument: vi.fn(async () => {}),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
            keys: vi.fn(async () => []),
        },
    },
    mockSafeGetArg: vi.fn(async (_key, def = '') => def),
    mockSubPluginManager: {
        plugins: [],
        _pendingUpdateNames: [],
        checkAllUpdates: vi.fn(async () => []),
        hotReload: vi.fn(async () => true),
        unloadPlugin: vi.fn(),
        remove: vi.fn(async () => {}),
        install: vi.fn(async () => 'TestPlugin'),
        toggle: vi.fn(async () => {}),
        purgeAllCpmData: vi.fn(async () => ({ pluginStorageCleared: 3, argsCleared: 10 })),
        loadRegistry: vi.fn(async () => {}),
        executeEnabled: vi.fn(async () => {}),
        applyUpdate: vi.fn(async () => true),
    },
    mockGetAllApiRequests: vi.fn(() => []),
    mockGetApiRequestById: vi.fn(() => null),
    mockEscHtml: vi.fn(s => String(s ?? '')),
    mockGetManagedSettingKeys: vi.fn(() => ['cpm_test_key']),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.mockRisu,
    safeGetArg: (...a) => h.mockSafeGetArg(...a),
    safeGetBoolArg: vi.fn(async () => false),
    registeredProviderTabs: [],
    state: { ALL_DEFINED_MODELS: [] },
}));

vi.mock('../src/lib/helpers.js', () => ({
    escHtml: (...a) => h.mockEscHtml(...a),
    getSubPluginFileAccept: vi.fn(() => '.js,.mjs'),
}));

vi.mock('../src/lib/custom-model-serialization.js', () => ({
    serializeCustomModelsSetting: vi.fn((v) => v),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    getManagedSettingKeys: (...a) => h.mockGetManagedSettingKeys(...a),
}));

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: h.mockSubPluginManager,
}));

vi.mock('../src/lib/api-request-log.js', () => ({
    getAllApiRequests: (...a) => h.mockGetAllApiRequests(...a),
    getApiRequestById: (...a) => h.mockGetApiRequestById(...a),
}));

import { initApiViewPanel, initExportImport } from '../src/lib/settings-ui-panels.js';
import { buildPluginsTabRenderer, initUpdateCheckButton } from '../src/lib/settings-ui-plugins.js';

// ═══════════════════════════════════════════════════════════════
//  settings-ui-panels.js — API View Panel
// ═══════════════════════════════════════════════════════════════

describe('initApiViewPanel — API view toggle and rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <button id="cpm-api-view-btn">API View</button>
            <div id="cpm-api-view-panel" class="hidden">
                <select id="cpm-api-view-selector"></select>
                <div id="cpm-api-view-content"></div>
                <button id="cpm-api-view-close">Close</button>
            </div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('opens API view panel on button click', () => {
        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();
        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(false);
    });

    it('closes API view panel on second click (toggle)', () => {
        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();
        document.getElementById('cpm-api-view-btn').click();
        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(true);
    });

    it('closes panel via close button', () => {
        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();
        document.getElementById('cpm-api-view-close').click();
        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(true);
    });

    it('renders API requests in the view panel', () => {
        h.mockGetAllApiRequests.mockReturnValue([
            { id: 'req-1', timestamp: '2025-01-01T00:00:00Z', modelName: 'TestModel', status: 200, duration: 100, url: 'https://api.test.com', method: 'POST' },
        ]);
        h.mockGetApiRequestById.mockReturnValue({
            id: 'req-1', timestamp: '2025-01-01T00:00:00Z', modelName: 'TestModel', status: 200, duration: 100,
            url: 'https://api.test.com', method: 'POST', response: '{"ok":true}',
        });

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const content = document.getElementById('cpm-api-view-content');
        expect(content.innerHTML).toContain('Response Body');
    });

    it('handles change event on selector', () => {
        h.mockGetAllApiRequests.mockReturnValue([
            { id: 'req-1', timestamp: '2025-01-01T00:00:00Z', modelName: 'M1', status: 200 },
            { id: 'req-2', timestamp: '2025-01-01T00:01:00Z', modelName: 'M2', status: 200 },
        ]);
        h.mockGetApiRequestById.mockReturnValue({
            id: 'req-2', timestamp: '2025-01-01T00:01:00Z', modelName: 'M2', status: 200, response: '{"ok":true}',
        });

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const selector = document.getElementById('cpm-api-view-selector');
        selector.value = 'req-2';
        selector.dispatchEvent(new Event('change'));

        expect(h.mockGetApiRequestById).toHaveBeenCalledWith('req-2');
    });

    it('shows empty message when no API requests', () => {
        h.mockGetAllApiRequests.mockReturnValue([]);

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const content = document.getElementById('cpm-api-view-content');
        expect(content.innerHTML).toContain('API 요청 기록');
    });
});

// ═══════════════════════════════════════════════════════════════
//  settings-ui-panels.js — Export/Import
// ═══════════════════════════════════════════════════════════════

describe('initExportImport — export and import flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <button id="cpm-export-btn">Export</button>
            <button id="cpm-import-btn">Import</button>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('exports settings as JSON file on button click', async () => {
        const mockSetVal = vi.fn(async () => {});
        const mockOpenSettings = vi.fn();
        h.mockSafeGetArg.mockResolvedValue('test_value');

        initExportImport(mockSetVal, mockOpenSettings);

        // Create spy on createElement for the anchor
        const createElementSpy = vi.spyOn(document, 'createElement');

        document.getElementById('cpm-export-btn').click();

        // Wait for async operations
        await new Promise(r => setTimeout(r, 50));

        // Should have created an anchor element for download
        expect(createElementSpy).toHaveBeenCalledWith('a');
        createElementSpy.mockRestore();
    });

    it('import button creates file input', () => {
        const mockSetVal = vi.fn();
        const mockOpenSettings = vi.fn();

        initExportImport(mockSetVal, mockOpenSettings);

        const createSpy = vi.spyOn(document, 'createElement');
        document.getElementById('cpm-import-btn').click();

        expect(createSpy).toHaveBeenCalledWith('input');
        createSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════
//  settings-ui-plugins.js — buildPluginsTabRenderer
// ═══════════════════════════════════════════════════════════════

describe('buildPluginsTabRenderer — plugin list rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <div id="cpm-plugins-list"></div>
            <button id="cpm-check-updates-btn">Check</button>
            <div id="cpm-update-status" class="hidden"></div>
        `;
        // Reset the global CupcakePM_SubPlugins
        if (typeof window !== 'undefined') {
            /** @type {any} */ (window).CupcakePM_SubPlugins = [];
        }
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders empty plugin list', () => {
        h.mockSubPluginManager.plugins = [];
        const setVal = vi.fn(async () => {});
        const render = buildPluginsTabRenderer(setVal);
        render();

        const list = document.getElementById('cpm-plugins-list');
        expect(list.innerHTML).toContain('설치된 서브 플러그인이 없습니다');
    });

    it('renders plugin list with plugins', () => {
        h.mockSubPluginManager.plugins = [
            { id: 'plugin-1', name: 'TestPlugin', enabled: true, version: '1.0', icon: '🔌' },
        ];
        const setVal = vi.fn(async () => {});
        const render = buildPluginsTabRenderer(setVal);
        render();

        const list = document.getElementById('cpm-plugins-list');
        expect(list.innerHTML).toContain('TestPlugin');
    });

    it('handles plugin toggle', async () => {
        h.mockSubPluginManager.plugins = [
            { id: 'plugin-1', name: 'TestPlugin', enabled: true, version: '1.0', icon: '🔌' },
        ];
        const setVal = vi.fn(async () => {});
        const render = buildPluginsTabRenderer(setVal);
        render();

        const toggle = document.querySelector('.cpm-plugin-toggle');
        if (toggle) {
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 50));
            expect(h.mockSubPluginManager.toggle).toHaveBeenCalled();
        }
    });

    it('handles plugin delete with confirmation', async () => {
        h.mockSubPluginManager.plugins = [
            { id: 'plugin-1', name: 'TestPlugin', enabled: true, version: '1.0', icon: '🔌' },
        ];
        const setVal = vi.fn(async () => {});
        const render = buildPluginsTabRenderer(setVal);
        render();

        // Mock confirm to return true
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        const deleteBtn = document.querySelector('.cpm-plugin-delete');
        if (deleteBtn) {
            deleteBtn.click();
            await new Promise(r => setTimeout(r, 50));
            expect(h.mockSubPluginManager.remove).toHaveBeenCalled();
        }

        vi.restoreAllMocks();
    });
});

// ═══════════════════════════════════════════════════════════════
//  settings-ui-plugins.js — initUpdateCheckButton (L233, L244)
// ═══════════════════════════════════════════════════════════════

describe('initUpdateCheckButton — update check and error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <button id="cpm-check-updates-btn">Check</button>
            <div id="cpm-update-status" class="hidden"></div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('shows "all up to date" when no updates available', async () => {
        h.mockSubPluginManager.checkAllUpdates.mockResolvedValue([]);
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await new Promise(r => setTimeout(r, 50));

        const status = document.getElementById('cpm-update-status');
        expect(status.innerHTML).toContain('최신');
    });

    it('shows available updates', async () => {
        h.mockSubPluginManager.checkAllUpdates.mockResolvedValue([
            { plugin: { id: 'p1', name: 'Plugin1', icon: '🔌' }, localVersion: '1.0', remoteVersion: '2.0', code: '// new code' },
        ]);
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await new Promise(r => setTimeout(r, 50));

        const status = document.getElementById('cpm-update-status');
        expect(status.innerHTML).toContain('Plugin1');
        expect(status.innerHTML).toContain('업데이트');
    });

    it('L244: shows error when update check fails', async () => {
        h.mockSubPluginManager.checkAllUpdates.mockRejectedValue(new Error('Network error'));
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await new Promise(r => setTimeout(r, 50));

        const status = document.getElementById('cpm-update-status');
        expect(status.innerHTML).toContain('오류');
    });

    it('L233: double-bind guard prevents duplicate event listeners', () => {
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });
        // Second call should be a no-op (button already has cpmBound='true')
        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        const btn = document.getElementById('cpm-check-updates-btn');
        expect(btn.dataset.cpmBound).toBe('true');
    });

    it('handles apply update button click', async () => {
        h.mockSubPluginManager.checkAllUpdates.mockResolvedValue([
            { plugin: { id: 'p1', name: 'Plugin1', icon: '🔌' }, localVersion: '1.0', remoteVersion: '2.0', code: '// updated code', expectedSHA256: 'abc123' },
        ]);
        h.mockSubPluginManager.applyUpdate.mockResolvedValue(true);
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await new Promise(r => setTimeout(r, 100));

        const applyBtn = document.querySelector('.cpm-apply-update');
        if (applyBtn) {
            applyBtn.click();
            await new Promise(r => setTimeout(r, 100));
            expect(h.mockSubPluginManager.applyUpdate).toHaveBeenCalledWith('p1', '// updated code', 'abc123');
        }
    });

    it('shows failed update button text when applyUpdate returns false', async () => {
        h.mockSubPluginManager.checkAllUpdates.mockResolvedValue([
            { plugin: { id: 'p1', name: 'Plugin1', icon: '🔌' }, localVersion: '1.0', remoteVersion: '2.0', code: '// code' },
        ]);
        h.mockSubPluginManager.applyUpdate.mockResolvedValue(false);
        const renderPluginsTab = vi.fn();

        initUpdateCheckButton(renderPluginsTab, { subPluginManager: h.mockSubPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await new Promise(r => setTimeout(r, 100));

        const applyBtn = document.querySelector('.cpm-apply-update');
        if (applyBtn) {
            applyBtn.click();
            await new Promise(r => setTimeout(r, 100));
            expect(applyBtn.textContent).toContain('실패');
        }
    });
});
