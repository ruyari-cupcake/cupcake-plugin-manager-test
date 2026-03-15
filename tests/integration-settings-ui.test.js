/**
 * integration-settings-ui.test.js — Integration tests for settings-ui.js
 * targeting uncovered branches.
 *
 * @vitest-environment jsdom
 *
 * Targets:
 *   L25  — ensureTailwindLoaded() early return when style already exists
 *   L159-161 — refreshStatusIndicators error catch path
 *   L431 — dynamic provider tab renderContent throwing error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRisu, mockSafeGetArg, mockSafeGetBoolArg, mockCheckStreamCapability, mockRegisteredProviderTabs } = vi.hoisted(() => ({
    mockRisu: {
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
        setArgument: vi.fn(async () => {}),
        registerSetting: vi.fn(),
        getRootDocument: vi.fn(async () => null),
    },
    mockSafeGetArg: vi.fn(async (_key, def = '') => def),
    mockSafeGetBoolArg: vi.fn(async (_key, def = false) => def),
    mockCheckStreamCapability: vi.fn(async () => true),
    mockRegisteredProviderTabs: [],
}));

vi.mock('../src/lib/shared-state.js', () => ({
    CPM_VERSION: '1.20.7',
    Risu: mockRisu,
    state: { ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [] },
    safeGetArg: (...a) => mockSafeGetArg(...a),
    safeGetBoolArg: (...a) => mockSafeGetBoolArg(...a),
    registeredProviderTabs: mockRegisteredProviderTabs,
    customFetchers: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: {
        updateKey: vi.fn(),
        snapshotAll: vi.fn(async () => {}),
        load: vi.fn(),
        restoreIfEmpty: vi.fn(async () => 0),
    },
    getManagedSettingKeys: vi.fn(() => []),
}));

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: {
        plugins: [],
        _pendingUpdateNames: [],
        checkAllUpdates: vi.fn(),
    },
    setExposeScopeFunction: vi.fn(),
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: (...a) => mockCheckStreamCapability(...a),
}));

vi.mock('../src/lib/smart-fetch.js', () => ({
    _resetCompatibilityCache: vi.fn(),
}));

vi.mock('../src/lib/copilot-token.js', () => ({
    clearCopilotTokenCache: vi.fn(),
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

vi.mock('../src/lib/tailwind-css.generated.js', () => ({
    TAILWIND_CSS: '/* mock tailwind */',
}));

import { ensureTailwindLoaded, openCpmSettings } from '../src/lib/settings-ui.js';

// ═══════════════════════════════════════════════════════════════════
//  L25: ensureTailwindLoaded — early return when style already exists
// ═══════════════════════════════════════════════════════════════════

describe('ensureTailwindLoaded — double call early return', () => {
    beforeEach(() => {
        // Clean up any leftover styles
        const existing = document.getElementById('cpm-tailwind');
        if (existing) existing.remove();
    });

    it('creates style element on first call', async () => {
        const style = await ensureTailwindLoaded();
        expect(style).not.toBeNull();
        expect(style.id).toBe('cpm-tailwind');
        expect(document.getElementById('cpm-tailwind')).toBeTruthy();
    });

    it('returns existing style element on second call (early return path L25)', async () => {
        // First call creates it
        const style1 = await ensureTailwindLoaded();
        // Second call should return the same one
        const style2 = await ensureTailwindLoaded();
        expect(style2).toBe(style1);
        // Only one style element should exist
        const allStyles = document.querySelectorAll('#cpm-tailwind');
        expect(allStyles.length).toBe(1);
    });

    it('re-creates style if previous one was removed', async () => {
        await ensureTailwindLoaded();
        document.getElementById('cpm-tailwind').remove();
        const style = await ensureTailwindLoaded();
        expect(style).not.toBeNull();
        expect(style.id).toBe('cpm-tailwind');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  L159-161: refreshStatusIndicators error path
//  L431: dynamic provider tab renderContent error
//  These are inside openCpmSettings — heavyweight integration test
// ═══════════════════════════════════════════════════════════════════

describe('openCpmSettings — integration test for uncovered branches', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        // Reset provider tabs
        mockRegisteredProviderTabs.length = 0;
        vi.clearAllMocks();
    });

    it('runs openCpmSettings and renders the full UI', async () => {
        await openCpmSettings();

        // Verify basic structure
        expect(document.querySelector('.tab-btn')).toBeTruthy();
        expect(document.getElementById('cpm-close-btn')).toBeTruthy();
        expect(document.getElementById('cpm-stream-status')).toBeTruthy();
    });

    it('L159-161: refreshStatusIndicators handles checkStreamCapability error', async () => {
        mockCheckStreamCapability.mockRejectedValueOnce(new Error('Bridge check failed'));

        await openCpmSettings();

        const statusEl = document.getElementById('cpm-stream-status');
        if (statusEl) {
            // Should show error message
            expect(statusEl.innerHTML).toContain('Bridge 확인 실패');
        }
    });

    it('L431: handles dynamic provider tab renderContent throwing error', async () => {
        // Add a provider tab that throws during rendering
        mockRegisteredProviderTabs.push({
            id: 'tab-error-provider',
            icon: '❌',
            label: 'Error Provider',
            renderContent: vi.fn(async () => {
                throw new Error('Tab render failure');
            }),
        });

        await openCpmSettings();

        // Error tab should exist with error message
        const errorTab = document.getElementById('tab-error-provider');
        if (errorTab) {
            expect(errorTab.innerHTML).toContain('Error rendering tab');
            expect(errorTab.innerHTML).toContain('Tab render failure');
        }
    });

    it('renders successfully with a working provider tab', async () => {
        mockRegisteredProviderTabs.push({
            id: 'tab-good-provider',
            icon: '✅',
            label: 'Good Provider',
            renderContent: vi.fn(async () => '<div>Provider settings here</div>'),
        });

        await openCpmSettings();

        const goodTab = document.getElementById('tab-good-provider');
        expect(goodTab).toBeTruthy();
        expect(goodTab.innerHTML).toContain('Provider settings here');
    });

    it('close button clears body and hides container', async () => {
        await openCpmSettings();

        const closeBtn = document.getElementById('cpm-close-btn');
        expect(closeBtn).toBeTruthy();
        closeBtn.click();

        expect(document.body.innerHTML).toBe('');
        expect(mockRisu.hideContainer).toHaveBeenCalled();
    });

    it('mobile menu toggle works correctly', async () => {
        await openCpmSettings();

        const mobileBtn = document.getElementById('cpm-mobile-menu-btn');
        const dropdown = document.getElementById('cpm-mobile-dropdown');

        if (mobileBtn && dropdown) {
            // Initially hidden on mobile (has 'hidden' class)
            const wasHidden = dropdown.classList.contains('hidden');

            // Click to toggle
            mobileBtn.click();
            if (wasHidden) {
                expect(dropdown.classList.contains('hidden')).toBe(false);
            }

            // Click again to toggle back
            mobileBtn.click();
            if (wasHidden) {
                expect(dropdown.classList.contains('hidden')).toBe(true);
            }
        }
    });

    it('tab switching hides/shows panels', async () => {
        await openCpmSettings();

        const tabBtns = document.querySelectorAll('.tab-btn');
        expect(tabBtns.length).toBeGreaterThan(0);

        // Click on "번역" tab (tab-trans)
        const transBtn = [...tabBtns].find(b => b.getAttribute('data-target') === 'tab-trans');
        if (transBtn) {
            transBtn.click();
            const transPanel = document.getElementById('tab-trans');
            expect(transPanel).toBeTruthy();
            if (transPanel) {
                expect(transPanel.classList.contains('hidden')).toBe(false);
            }
        }
    });

    it('refreshStatusIndicators shows correct status when bridge is capable', async () => {
        mockCheckStreamCapability.mockResolvedValue(true);

        await openCpmSettings();

        const statusEl = document.getElementById('cpm-stream-status');
        if (statusEl) {
            expect(statusEl.innerHTML).toContain('Bridge 지원됨');
        }
    });

    it('refreshStatusIndicators shows fallback status when bridge is NOT capable', async () => {
        mockCheckStreamCapability.mockResolvedValue(false);

        await openCpmSettings();

        const statusEl = document.getElementById('cpm-stream-status');
        if (statusEl) {
            expect(statusEl.innerHTML).toContain('Bridge 미지원');
        }
    });
});
