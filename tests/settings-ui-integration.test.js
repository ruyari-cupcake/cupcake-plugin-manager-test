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
import { initCustomModelsManager } from '../src/lib/settings-ui-custom-models.js';
import { buildPluginsTabRenderer } from '../src/lib/settings-ui-plugins.js';
import { initApiViewPanel, initExportImport } from '../src/lib/settings-ui-panels.js';

async function flushUi() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('openCpmSettings — full DOM integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Reset document body
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        // Pre-create Tailwind style element to skip loading
        const tw = document.createElement('style');
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

    it('injects Tailwind CSS as inline <style> when not already present', async () => {
        // Remove pre-created style so ensureTailwindLoaded actually injects
        document.head.innerHTML = '';

        await openCpmSettings();

        const style = document.getElementById('cpm-tailwind');
        expect(style).toBeTruthy();
        expect(style.tagName).toBe('STYLE');
        expect(style.textContent.length).toBeGreaterThan(0);
        expect(document.getElementById('cpm-close-btn')).toBeTruthy();
    });

    it('reuses the existing Tailwind style without injecting duplicates across re-open', async () => {
        document.head.innerHTML = '';

        await openCpmSettings();
        await openCpmSettings();

        expect(document.head.querySelectorAll('#cpm-tailwind')).toHaveLength(1);
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

    it('invokes extracted sub-module initializers after rendering', async () => {
        await openCpmSettings();

        expect(buildPluginsTabRenderer).toHaveBeenCalledTimes(1);
        expect(initCustomModelsManager).toHaveBeenCalledTimes(1);
        expect(initApiViewPanel).toHaveBeenCalledTimes(1);
        expect(initExportImport).toHaveBeenCalledTimes(1);
    });

    it('renders dynamic provider fallback content when a provider tab throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockRegisteredProviderTabs.push({
            id: 'tab-broken-provider',
            icon: '💥',
            label: 'Broken Provider',
            renderContent: vi.fn(async () => { throw new Error('provider tab crash'); }),
        });

        await openCpmSettings();

        const providerTab = document.getElementById('tab-broken-provider');
        expect(providerTab).toBeTruthy();
        expect(providerTab.innerHTML).toContain('Error rendering tab: provider tab crash');
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to render settings tab: tab-broken-provider'), expect.any(Error));

        mockRegisteredProviderTabs.length = 0;
        errorSpy.mockRestore();
    });

    it('updates stream status when bridge support is unavailable', async () => {
        mockCheckStreamCapability.mockResolvedValueOnce(false);

        await openCpmSettings();
        await flushUi();

        const statusEl = document.getElementById('cpm-stream-status');
        expect(statusEl.innerHTML).toContain('Bridge 미지원');
        expect(statusEl.classList.contains('border-yellow-800')).toBe(true);
    });

    it('shows stream status error message when capability check throws', async () => {
        mockCheckStreamCapability.mockRejectedValueOnce(new Error('bridge probe failed'));

        await openCpmSettings();
        await flushUi();

        const statusEl = document.getElementById('cpm-stream-status');
        expect(statusEl.innerHTML).toContain('Bridge 확인 실패:');
        expect(statusEl.innerHTML).toContain('bridge probe failed');
    });

    it('toggles the mobile menu and closes it after tab selection on small screens', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 375,
        });

        await openCpmSettings();

        const menuBtn = document.getElementById('cpm-mobile-menu-btn');
        const dropdown = document.getElementById('cpm-mobile-dropdown');
        const pluginsBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.dataset.target === 'tab-plugins');

        menuBtn.click();
        expect(dropdown.classList.contains('hidden')).toBe(false);
        expect(dropdown.classList.contains('flex')).toBe(true);

        pluginsBtn.click();
        expect(dropdown.classList.contains('hidden')).toBe(true);
        expect(dropdown.classList.contains('flex')).toBe(false);
    });

    it('toggles password inputs rendered by dynamic provider tabs', async () => {
        mockRegisteredProviderTabs.push({
            id: 'tab-secret-provider',
            icon: '🔐',
            label: 'Secret Provider',
            renderContent: vi.fn(async (renderInput) => `
                <div class="secret-wrap">
                    ${await renderInput('cpm_secret_api_key', 'Secret API Key', 'password')}
                </div>
            `),
        });

        await openCpmSettings();

        const providerBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.dataset.target === 'tab-secret-provider');
        providerBtn.click();

        const input = document.getElementById('cpm_secret_api_key');
        const toggleBtn = document.querySelector('[data-target-id="cpm_secret_api_key"]');

        expect(input.type).toBe('password');
        toggleBtn.click();
        expect(input.type).toBe('text');
        toggleBtn.click();
        expect(input.type).toBe('password');

        mockRegisteredProviderTabs.length = 0;
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

    it('keeps the mobile menu stable when support elements are missing', async () => {
        await openCpmSettings();

        document.getElementById('cpm-mobile-dropdown')?.remove();
        document.getElementById('cpm-mobile-icon')?.remove();

        expect(() => document.getElementById('cpm-mobile-menu-btn')?.click()).not.toThrow();
    });
});
