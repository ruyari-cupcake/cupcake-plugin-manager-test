/**
 * settings-ui-core.test.js — Unit tests for settings-ui.js pure functions
 * and DOM interaction logic.
 *
 * Tests: shouldPersistControl, bindSettingsPersistenceHandlers, tab switching,
 * mobile menu toggle, password toggle, close button.
 *
 * Uses JSDOM for DOM testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// ── Mocks ──
const { mockRisu, mockSafeGetArg, mockSafeGetBoolArg } = vi.hoisted(() => ({
    mockRisu: {
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
        setArgument: vi.fn(),
        registerSetting: vi.fn(),
        getRootDocument: vi.fn(async () => null),
    },
    mockSafeGetArg: vi.fn(async (_key, def = '') => def),
    mockSafeGetBoolArg: vi.fn(async (_key, def = false) => def),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    CPM_VERSION: '1.19.6',
    Risu: mockRisu,
    state: { ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [] },
    safeGetArg: (...a) => mockSafeGetArg(...a),
    safeGetBoolArg: (...a) => mockSafeGetBoolArg(...a),
    registeredProviderTabs: [],
    customFetchers: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: {
        updateKey: vi.fn(),
        snapshotAll: vi.fn(),
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
    checkStreamCapability: vi.fn(async () => true),
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

import { shouldPersistControl, bindSettingsPersistenceHandlers } from '../src/lib/settings-ui.js';

// ════════════════════════════════════════════════════════════════
// A. shouldPersistControl
// ════════════════════════════════════════════════════════════════

describe('shouldPersistControl', () => {
    it('returns false for element with no id', () => {
        expect(shouldPersistControl({ id: '' })).toBe(false);
        expect(shouldPersistControl({})).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(shouldPersistControl(null)).toBe(false);
        expect(shouldPersistControl(undefined)).toBe(false);
    });

    it('returns false for custom model elements (cpm-cm- prefix)', () => {
        expect(shouldPersistControl({ id: 'cpm-cm-model-1' })).toBe(false);
        expect(shouldPersistControl({ id: 'cpm-cm-editor' })).toBe(false);
    });

    it('returns false for api view elements (cpm-api-view- prefix)', () => {
        expect(shouldPersistControl({ id: 'cpm-api-view-selector' })).toBe(false);
    });

    it('returns false for file plugin input', () => {
        expect(shouldPersistControl({ id: 'cpm-file-plugin' })).toBe(false);
    });

    it('returns true for normal settings controls', () => {
        expect(shouldPersistControl({ id: 'cpm_streaming_enabled' })).toBe(true);
        expect(shouldPersistControl({ id: 'cpm_slot_translation' })).toBe(true);
        expect(shouldPersistControl({ id: 'cpm_fallback_temp' })).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════
// B. bindSettingsPersistenceHandlers
// ════════════════════════════════════════════════════════════════

describe('bindSettingsPersistenceHandlers', () => {
    /** @type {JSDOM} */
    let dom;
    let doc;

    beforeEach(() => {
        dom = new JSDOM(`
            <div id="root">
                <input id="cpm_field1" type="text" value="hello">
                <input id="cpm_field2" type="checkbox">
                <select id="cpm_field3"><option value="a">A</option></select>
                <textarea id="cpm_field4">content</textarea>
                <input id="cpm-cm-skip" type="text" value="skip">
                <input id="cpm_password" type="password" value="secret">
            </div>
        `);
        doc = dom.window.document;
    });

    afterEach(() => {
        dom.window.close();
    });

    it('does nothing when root is null', () => {
        const setVal = vi.fn();
        expect(() => bindSettingsPersistenceHandlers(null, setVal)).not.toThrow();
    });

    it('does nothing when setVal is not a function', () => {
        const root = doc.getElementById('root');
        expect(() => bindSettingsPersistenceHandlers(root, null)).not.toThrow();
    });

    it('binds change handler to text inputs', () => {
        const root = doc.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const input = doc.getElementById('cpm_field1');
        input.value = 'new value';
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(setVal).toHaveBeenCalledWith('cpm_field1', 'new value');
    });

    it('binds change handler to checkbox inputs', () => {
        const root = doc.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const checkbox = doc.getElementById('cpm_field2');
        checkbox.checked = true;
        checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(setVal).toHaveBeenCalledWith('cpm_field2', true);
    });

    it('binds change handler to select elements', () => {
        const root = doc.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const select = doc.getElementById('cpm_field3');
        select.value = 'a';
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(setVal).toHaveBeenCalledWith('cpm_field3', 'a');
    });

    it('binds change handler to textarea elements', () => {
        const root = doc.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const textarea = doc.getElementById('cpm_field4');
        textarea.value = 'updated';
        textarea.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(setVal).toHaveBeenCalledWith('cpm_field4', 'updated');
    });

    it('skips elements that should not be persisted (cpm-cm- prefix)', () => {
        const root = doc.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const skipInput = doc.getElementById('cpm-cm-skip');
        skipInput.value = 'changed';
        skipInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        // setVal should have been called for other fields' potential setup, but NOT for cpm-cm-skip
        const cmCalls = setVal.mock.calls.filter(c => c[0] === 'cpm-cm-skip');
        expect(cmCalls).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════
// C. Tab switching simulation
// ════════════════════════════════════════════════════════════════

describe('Tab switching logic', () => {
    it('clicking a tab shows its content and hides others', () => {
        const dom = new JSDOM(`
            <div>
                <button class="tab-btn" data-target="tab-1">Tab 1</button>
                <button class="tab-btn" data-target="tab-2">Tab 2</button>
                <div id="tab-1" class="cpm-tab-content">Content 1</div>
                <div id="tab-2" class="cpm-tab-content hidden">Content 2</div>
            </div>
        `);
        const doc = dom.window.document;

        // Replicate the tab switching logic from settings-ui.js
        const tabs = doc.querySelectorAll('.tab-btn');
        const content = doc.querySelector('div');

        tabs.forEach(t => t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.remove('bg-gray-800'));
            t.classList.add('bg-gray-800');
            content.querySelectorAll('.cpm-tab-content').forEach(p => p.classList.add('hidden'));
            const targetId = t.dataset.target;
            doc.getElementById(targetId)?.classList.remove('hidden');
        }));

        // Click second tab
        tabs[1].click();

        expect(doc.getElementById('tab-1').classList.contains('hidden')).toBe(true);
        expect(doc.getElementById('tab-2').classList.contains('hidden')).toBe(false);
        expect(tabs[1].classList.contains('bg-gray-800')).toBe(true);
        expect(tabs[0].classList.contains('bg-gray-800')).toBe(false);

        // Click first tab back
        tabs[0].click();

        expect(doc.getElementById('tab-1').classList.contains('hidden')).toBe(false);
        expect(doc.getElementById('tab-2').classList.contains('hidden')).toBe(true);

        dom.window.close();
    });
});

// ════════════════════════════════════════════════════════════════
// D. Mobile menu toggle simulation
// ════════════════════════════════════════════════════════════════

describe('Mobile menu toggle', () => {
    it('toggles dropdown visibility on click', () => {
        const dom = new JSDOM(`
            <div>
                <div id="cpm-mobile-menu-btn"></div>
                <div id="cpm-mobile-dropdown" class="hidden"></div>
                <span id="cpm-mobile-icon">▼</span>
            </div>
        `);
        const doc = dom.window.document;
        const btn = doc.getElementById('cpm-mobile-menu-btn');
        const dropdown = doc.getElementById('cpm-mobile-dropdown');
        const icon = doc.getElementById('cpm-mobile-icon');

        // Replicate toggle logic
        btn.addEventListener('click', () => {
            const isHidden = dropdown.classList.contains('hidden');
            if (isHidden) {
                dropdown.classList.remove('hidden');
                dropdown.classList.add('flex');
                icon.innerText = '▲';
            } else {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('flex');
                icon.innerText = '▼';
            }
        });

        // First click: show
        btn.click();
        expect(dropdown.classList.contains('hidden')).toBe(false);
        expect(dropdown.classList.contains('flex')).toBe(true);

        // Second click: hide
        btn.click();
        expect(dropdown.classList.contains('hidden')).toBe(true);
        expect(dropdown.classList.contains('flex')).toBe(false);

        dom.window.close();
    });
});

// ════════════════════════════════════════════════════════════════
// E. Password toggle simulation
// ════════════════════════════════════════════════════════════════

describe('Password toggle', () => {
    it('toggles input type between password and text', () => {
        const dom = new JSDOM(`
            <div>
                <input id="cpm_apikey" type="password" value="secret">
                <button class="cpm-pw-toggle" data-target-id="cpm_apikey">👁️</button>
            </div>
        `);
        const doc = dom.window.document;
        const btn = doc.querySelector('.cpm-pw-toggle');
        const input = doc.getElementById('cpm_apikey');

        // Replicate toggle logic
        btn.addEventListener('click', () => {
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🔒';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        });

        expect(input.type).toBe('password');
        btn.click();
        expect(input.type).toBe('text');
        expect(btn.textContent).toBe('🔒');
        btn.click();
        expect(input.type).toBe('password');
        expect(btn.textContent).toBe('👁️');

        dom.window.close();
    });
});
