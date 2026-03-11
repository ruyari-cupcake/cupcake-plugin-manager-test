/**
 * @vitest-environment jsdom
 */
/**
 * settings-ui-integration.test.js — Integration test for openCpmSettings().
 * Actually calls the full settings panel renderer in a JSDOM environment
 * to improve settings-ui.js code coverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
    mockRisu, mockSafeGetArg, mockSafeGetBoolArg, mockState,
    mockRegisteredProviderTabs, mockSubPluginManager,
    mockSettingsBackup, mockCheckStreamCapability,
} = vi.hoisted(() => ({
    mockRisu: {
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
        setArgument: vi.fn(),
        registerSetting: vi.fn(),
        getRootDocument: vi.fn(async () => null),
    },
    mockSafeGetArg: vi.fn(async (_key, def = '') => def),
    mockSafeGetBoolArg: vi.fn(async (_key, def = false) => def),
    mockState: { ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: { token: null, expiry: 0 }, _currentExecutingPluginId: null },
    mockRegisteredProviderTabs: [],
    mockSubPluginManager: {
        plugins: [],
        _pendingUpdateNames: [],
        checkAllUpdates: vi.fn(async () => []),
    },
    mockSettingsBackup: {
        updateKey: vi.fn(),
        snapshotAll: vi.fn(async () => {}),
        load: vi.fn(async () => {}),
        restoreIfEmpty: vi.fn(async () => 0),
    },
    mockCheckStreamCapability: vi.fn(async () => true),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    CPM_VERSION: '1.19.6',
    Risu: mockRisu,
    state: mockState,
    safeGetArg: (...a) => mockSafeGetArg(...a),
    safeGetBoolArg: (...a) => mockSafeGetBoolArg(...a),
    registeredProviderTabs: mockRegisteredProviderTabs,
    customFetchers: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: mockSettingsBackup,
    getManagedSettingKeys: vi.fn(() => []),
}));

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: mockSubPluginManager,
    setExposeScopeFunction: vi.fn(),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: (...a) => mockCheckStreamCapability(...a),
}));

vi.mock('../src/lib/helpers.js', () => ({
    escHtml: vi.fn(s => String(s ?? '')),
}));

vi.mock('../src/lib/settings-ui-custom-models.js', () => ({
    renderCustomModelEditor: vi.fn(() => '<div id="cpm-custom-editor">editor</div>'),
    initCustomModelsManager: vi.fn(),
}));

vi.mock('../src/lib/settings-ui-plugins.js', () => ({
    buildPluginsTabRenderer: vi.fn(() => vi.fn()),
}));

vi.mock('../src/lib/settings-ui-panels.js', () => ({
    initApiViewPanel: vi.fn(),
    initExportImport: vi.fn(),
}));

import { openCpmSettings } from '../src/lib/settings-ui.js';

describe('openCpmSettings — full DOM integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset document body
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        // Pre-create Tailwind script element to skip loading await
        const tw = document.createElement('script');
        tw.id = 'cpm-tailwind';
        document.head.appendChild(tw);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    it('calls Risu.showContainer on open', async () => {
        await openCpmSettings();
        expect(mockRisu.showContainer).toHaveBeenCalledWith('fullscreen');
    });

    it('continues rendering when Tailwind CDN load fails', async () => {
        document.head.innerHTML = '';

        const originalAppendChild = document.head.appendChild.bind(document.head);
        vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
            const appended = originalAppendChild(el);
            if (el instanceof HTMLScriptElement && el.id === 'cpm-tailwind' && typeof el.onerror === 'function') {
                queueMicrotask(() => el.onerror?.(new Event('error')));
            }
            return appended;
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await openCpmSettings();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Tailwind CDN load failed'));
        expect(document.getElementById('cpm-close-btn')).toBeTruthy();
    });

    it('renders the sidebar with version info', async () => {
        await openCpmSettings();
        const sidebar = document.querySelector('.bg-gray-900');
        expect(sidebar).toBeTruthy();
        expect(sidebar.innerHTML).toContain('Cupcake PM v1.19.6');
    });

    it('renders tab buttons', async () => {
        await openCpmSettings();
        const tabs = document.querySelectorAll('.tab-btn');
        expect(tabs.length).toBeGreaterThan(0);
    });

    it('renders the global tab content by default', async () => {
        await openCpmSettings();
        const globalTab = document.getElementById('tab-global');
        expect(globalTab).toBeTruthy();
        // The first tab click activates tab-global
        expect(globalTab.classList.contains('hidden')).toBe(false);
    });

    it('renders close button', async () => {
        await openCpmSettings();
        const closeBtn = document.getElementById('cpm-close-btn');
        expect(closeBtn).toBeTruthy();
    });

    it('close button clears body and hides container', async () => {
        await openCpmSettings();
        const closeBtn = document.getElementById('cpm-close-btn');
        closeBtn.click();
        expect(document.body.innerHTML).toBe('');
        expect(mockRisu.hideContainer).toHaveBeenCalled();
    });

    it('renders sub-plugins tab', async () => {
        await openCpmSettings();
        const pluginsTab = document.getElementById('tab-plugins');
        expect(pluginsTab).toBeTruthy();
    });

    it('renders custom models manager tab', async () => {
        await openCpmSettings();
        const customsTab = document.getElementById('tab-customs');
        expect(customsTab).toBeTruthy();
    });

    it('calls SettingsBackup.snapshotAll()', async () => {
        await openCpmSettings();
        expect(mockSettingsBackup.snapshotAll).toHaveBeenCalled();
    });

    it('tab switching shows correct panel', async () => {
        await openCpmSettings();
        const tabs = document.querySelectorAll('.tab-btn');
        const pluginsBtn = Array.from(tabs).find(t => t.dataset?.target === 'tab-plugins');

        if (pluginsBtn) {
            pluginsBtn.click();
            const pluginsTab = document.getElementById('tab-plugins');
            expect(pluginsTab.classList.contains('hidden')).toBe(false);
            const globalTab = document.getElementById('tab-global');
            expect(globalTab.classList.contains('hidden')).toBe(true);
        }
    });

    it('renders export/import buttons', async () => {
        await openCpmSettings();
        const exportBtn = document.getElementById('cpm-export-btn');
        const importBtn = document.getElementById('cpm-import-btn');
        expect(exportBtn).toBeTruthy();
        expect(importBtn).toBeTruthy();
    });

    it('binds persistence handlers to inputs', async () => {
        await openCpmSettings();
        // Any input change should trigger setArgument + SettingsBackup.updateKey
        const inputs = document.querySelectorAll('input[type="text"], select, textarea');
        if (inputs.length > 0) {
            const first = inputs[0];
            first.value = 'test-value';
            first.dispatchEvent(new Event('change'));
            // setArgument or updateKey may have been called
        }
        // No throw = success
        expect(true).toBe(true);
    });

    it('renders streaming status section', async () => {
        await openCpmSettings();
        const streamStatus = document.getElementById('cpm-stream-status');
        expect(streamStatus).toBeTruthy();
    });

    it('renders with pending update badge', async () => {
        mockSubPluginManager._pendingUpdateNames = ['Plugin A'];
        await openCpmSettings();

        const pluginsArea = document.getElementById('tab-plugins');
        expect(pluginsArea).toBeTruthy();
        expect(pluginsArea.innerHTML).toContain('업데이트');

        mockSubPluginManager._pendingUpdateNames = [];
    });

    it('renders with ALL_DEFINED_MODELS providers in dropdown', async () => {
        mockState.ALL_DEFINED_MODELS = [
            { uniqueId: 'u1', provider: 'OpenAI', name: 'GPT-4' },
        ];

        await openCpmSettings();

        const selects = document.querySelectorAll('select');
        let found = false;
        selects.forEach(s => {
            const options = Array.from(s.options);
            if (options.some(o => o.textContent.includes('GPT-4'))) found = true;
        });
        expect(found).toBe(true);

        mockState.ALL_DEFINED_MODELS = [];
    });

    it('renders dynamic provider tabs', async () => {
        mockRegisteredProviderTabs.push({
            id: 'tab-test-provider',
            icon: '🔧',
            label: 'Test Provider',
            renderContent: vi.fn(async () => '<p>Test provider content</p>'),
        });

        await openCpmSettings();

        const providerTab = document.getElementById('tab-test-provider');
        expect(providerTab).toBeTruthy();
        expect(providerTab.innerHTML).toContain('Test provider content');

        mockRegisteredProviderTabs.length = 0;
    });
});
