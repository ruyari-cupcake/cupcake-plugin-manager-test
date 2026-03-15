import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const {
    mockState,
    mockRegisteredProviderTabs,
    mockSafeGetArg,
    mockSafeGetBoolArg,
    mockRisu,
    mockSettingsBackupUpdateKey,
    mockSubPluginManager,
    mockApiState,
} = vi.hoisted(() => ({
    mockState: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    mockRegisteredProviderTabs: [],
    mockSafeGetArg: vi.fn(async (_key, def = '') => def),
    mockSafeGetBoolArg: vi.fn(async (_key, def = false) => def),
    mockRisu: {
        setArgument: vi.fn(),
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
        getRootDocument: vi.fn(async () => globalThis.document),
    },
    mockSettingsBackupUpdateKey: vi.fn(),
    mockSubPluginManager: {
        plugins: [],
        _pendingUpdateNames: [],
        checkAllUpdates: vi.fn(),
        applyUpdate: vi.fn(),
        hotReload: vi.fn(),
        install: vi.fn(),
        remove: vi.fn(),
        unloadPlugin: vi.fn(),
        toggle: vi.fn(),
    },
    mockApiState: {
        requests: [],
    },
}));

vi.mock('../src/lib/shared-state.js', () => ({
    CPM_VERSION: '1.19.6',
    Risu: mockRisu,
    state: mockState,
    safeGetArg: (...args) => mockSafeGetArg(...args),
    safeGetBoolArg: (...args) => mockSafeGetBoolArg(...args),
    registeredProviderTabs: mockRegisteredProviderTabs,
    customFetchers: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    isDynamicFetchEnabled: vi.fn(async () => false),
}));

vi.mock('../src/lib/settings-backup.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        SettingsBackup: {
            ...original.SettingsBackup,
            updateKey: (...args) => mockSettingsBackupUpdateKey(...args),
            snapshotAll: vi.fn(),
            load: vi.fn(),
            restoreIfEmpty: vi.fn(async () => 0),
        },
    };
});

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: mockSubPluginManager,
    setExposeScopeFunction: vi.fn(),
}));

vi.mock('../src/lib/api-request-log.js', () => ({
    getAllApiRequests: vi.fn(() => mockApiState.requests.slice()),
    getApiRequestById: vi.fn((id) => mockApiState.requests.find(r => r.id === id) || null),
    storeApiRequest: vi.fn(),
    updateApiRequest: vi.fn(),
    getLatestApiRequest: vi.fn(),
    clearApiRequests: vi.fn(() => { mockApiState.requests = []; }),
}));

import { shouldPersistControl, bindSettingsPersistenceHandlers } from '../src/lib/settings-ui.js';
import { initUpdateCheckButton } from '../src/lib/settings-ui-plugins.js';
import {
    renderCustomModelEditor,
    populateEditor,
    clearEditor,
    readEditorValues,
    initCustomModelsManager,
} from '../src/lib/settings-ui-custom-models.js';
import { initApiViewPanel, initExportImport } from '../src/lib/settings-ui-panels.js';

let dom;

function setupDom(html = '<!doctype html><html><body></body></html>') {
    dom = new JSDOM(html, { url: 'https://example.test/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: dom.window.navigator,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: dom.window.HTMLElement,
    });
    Object.defineProperty(globalThis, 'Event', {
        configurable: true,
        value: dom.window.Event,
    });
    Object.defineProperty(globalThis, 'MouseEvent', {
        configurable: true,
        value: dom.window.MouseEvent,
    });
    Object.defineProperty(globalThis, 'FileReader', {
        configurable: true,
        writable: true,
        value: dom.window.FileReader,
    });
    globalThis.alert = vi.fn();
    globalThis.confirm = vi.fn(() => true);
}

async function flushUi() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function resetUiMocks() {
    vi.clearAllMocks();
    mockState.ALL_DEFINED_MODELS = [];
    mockState.CUSTOM_MODELS_CACHE = [];
    mockRegisteredProviderTabs.length = 0;
    mockSafeGetArg.mockImplementation(async (_key, def = '') => def);
    mockSafeGetBoolArg.mockImplementation(async (_key, def = false) => def);
    mockSubPluginManager.plugins = [];
    mockSubPluginManager._pendingUpdateNames = [];
    mockApiState.requests = [];
}

describe('UI regression — settings persistence filter', () => {
    beforeEach(() => {
        setupDom();
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('filters out transient editor and viewer controls', () => {
        const cases = [
            { id: 'cpm-cm-name', expected: false },
            { id: 'cpm-api-view-selector', expected: false },
            { id: 'cpm-file-plugin', expected: false },
            { id: '', expected: false },
            { id: 'cpm_fallback_temp', expected: true },
            { id: 'cpm_show_token_usage', expected: true },
        ];

        for (const testCase of cases) {
            const el = document.createElement('input');
            el.id = testCase.id;
            expect(shouldPersistControl(el)).toBe(testCase.expected);
        }
    });

    it('binds change handlers only for persisted controls', () => {
        document.body.innerHTML = `
            <div id="root">
                <input id="cpm_fallback_temp" type="number" value="0.7">
                <input id="cpm-cm-name" type="text" value="draft model">
                <select id="cpm-api-view-selector"><option value="req-1">req-1</option></select>
                <input id="cpm_show_token_usage" type="checkbox">
                <input class="cpm-plugin-toggle" type="checkbox">
                <input id="cpm-file-plugin" type="file">
            </div>
        `;

        const root = document.getElementById('root');
        const setVal = vi.fn();
        bindSettingsPersistenceHandlers(root, setVal);

        const fallbackTemp = document.getElementById('cpm_fallback_temp');
        fallbackTemp.value = '0.5';
        fallbackTemp.dispatchEvent(new Event('change', { bubbles: true }));

        const customModelField = document.getElementById('cpm-cm-name');
        customModelField.value = 'new draft';
        customModelField.dispatchEvent(new Event('change', { bubbles: true }));

        const apiViewSelector = document.getElementById('cpm-api-view-selector');
        apiViewSelector.value = 'req-1';
        apiViewSelector.dispatchEvent(new Event('change', { bubbles: true }));

        const persistedCheckbox = document.getElementById('cpm_show_token_usage');
        persistedCheckbox.checked = true;
        persistedCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

        const transientCheckbox = document.querySelector('.cpm-plugin-toggle');
        transientCheckbox.checked = true;
        transientCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

        expect(setVal).toHaveBeenCalledTimes(2);
        expect(setVal).toHaveBeenNthCalledWith(1, 'cpm_fallback_temp', '0.5');
        expect(setVal).toHaveBeenNthCalledWith(2, 'cpm_show_token_usage', true);
    });
});

describe('UI regression — sub-plugin update button', () => {
    beforeEach(() => {
        setupDom(`
            <!doctype html>
            <html>
                <body>
                    <button id="cpm-check-updates-btn">🔄 서브 플러그인 업데이트 확인</button>
                    <div id="cpm-update-status" class="hidden"></div>
                </body>
            </html>
        `);
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('prevents duplicate click handler binding across repeated init calls', async () => {
        const subPluginManager = {
            checkAllUpdates: vi.fn().mockResolvedValue([]),
            applyUpdate: vi.fn(),
            hotReload: vi.fn(),
        };

        initUpdateCheckButton(() => {}, { subPluginManager });
        initUpdateCheckButton(() => {}, { subPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await flushUi();

        expect(subPluginManager.checkAllUpdates).toHaveBeenCalledTimes(1);
        expect(document.getElementById('cpm-update-status').textContent).toContain('최신 버전');
    });

    it('renders update actions and applies an update once', async () => {
        const subPluginManager = {
            checkAllUpdates: vi.fn().mockResolvedValue([
                {
                    plugin: { id: 'plugin-1', name: 'Plugin One', icon: '🧩' },
                    localVersion: '1.0.0',
                    remoteVersion: '1.1.0',
                    code: '// updated code',
                },
            ]),
            applyUpdate: vi.fn().mockResolvedValue(true),
            hotReload: vi.fn().mockResolvedValue(true),
        };

        initUpdateCheckButton(() => {}, { subPluginManager });

        document.getElementById('cpm-check-updates-btn').click();
        await flushUi();

        const applyBtn = document.querySelector('.cpm-apply-update');
        expect(applyBtn).toBeTruthy();

        applyBtn.click();
        await flushUi();

        expect(subPluginManager.applyUpdate).toHaveBeenCalledTimes(1);
        expect(subPluginManager.applyUpdate).toHaveBeenCalledWith('plugin-1', '// updated code', '');
        expect(subPluginManager.hotReload).toHaveBeenCalledTimes(1);
        expect(subPluginManager.hotReload).toHaveBeenCalledWith('plugin-1');
        expect(applyBtn.textContent).toContain('완료');
    });
});

describe('UI regression — custom model editor helpers', () => {
    beforeEach(() => {
        setupDom(`
            <!doctype html>
            <html>
                <body>
                    ${renderCustomModelEditor(
                        [{ value: 'none', text: 'None' }, { value: 'HIGH', text: 'High' }],
                        [{ value: 'none', text: 'None' }, { value: 'high', text: 'High' }],
                        [{ value: 'none', text: 'None' }, { value: 'medium', text: 'Medium' }],
                        [{ value: 'none', text: 'None' }, { value: 'high', text: 'High' }],
                    )}
                </body>
            </html>
        `);
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('populateEditor, readEditorValues and clearEditor round-trip correctly', () => {
        const model = {
            uniqueId: 'custom_1',
            name: 'My Model',
            model: 'gpt-4o',
            url: 'https://api.example.com',
            key: 'sk-test',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'HIGH',
            thinkingBudget: 8192,
            promptCacheRetention: '24h',
            reasoning: 'high',
            verbosity: 'medium',
            effort: 'high',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            thought: true,
            customParams: '{"seed":42}',
        };

        populateEditor(model);
        const values = readEditorValues('custom_1');

        expect(values.name).toBe('My Model');
        expect(values.model).toBe('gpt-4o');
        expect(values.url).toBe('https://api.example.com');
        expect(values.responsesMode).toBe('on');
        expect(values.thinkingBudget).toBe(8192);
        expect(values.sysfirst).toBe(true);
        expect(values.streaming).toBe(true);
        expect(values.decoupled).toBe(false);
        expect(values.customParams).toBe('{"seed":42}');

        clearEditor();
        expect(document.getElementById('cpm-cm-name').value).toBe('');
        expect(document.getElementById('cpm-cm-model').value).toBe('');
        expect(document.getElementById('cpm-cm-reasoning').value).toBe('none');
        expect(document.getElementById('cpm-cm-streaming').checked).toBe(false);
    });
});

describe('UI regression — custom models manager flow', () => {
    beforeEach(() => {
        setupDom(`
            <!doctype html>
            <html>
                <body>
                    <div id="tab-customs">
                        <div id="cpm-cm-count"></div>
                        <button id="cpm-import-model-btn">Import</button>
                        <button id="cpm-add-custom-btn">Add</button>
                        <div id="cpm-cm-list"></div>
                        ${renderCustomModelEditor(
                            [{ value: 'none', text: 'None' }],
                            [{ value: 'none', text: 'None' }],
                            [{ value: 'none', text: 'None' }],
                            [{ value: 'none', text: 'None' }],
                        )}
                    </div>
                </body>
            </html>
        `);
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('adds and saves a custom model through the editor UI', () => {
        initCustomModelsManager(() => {}, vi.fn());

        document.getElementById('cpm-add-custom-btn').click();
        document.getElementById('cpm-cm-name').value = 'Saved Model';
        document.getElementById('cpm-cm-model').value = 'model-x';
        document.getElementById('cpm-cm-url').value = 'https://example.test';
        document.getElementById('cpm-cm-key').value = 'sk-1';
        document.getElementById('cpm-cm-save').click();

        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0].name).toBe('Saved Model');
        expect(mockRisu.setArgument).toHaveBeenCalled();
        expect(mockSettingsBackupUpdateKey).toHaveBeenCalled();
        expect(String(document.getElementById('cpm-cm-count').innerText)).toBe('1');
    });

    it('deletes an existing custom model and refreshes the list', () => {
        mockState.CUSTOM_MODELS_CACHE = [{ uniqueId: 'custom_1', name: 'Delete Me', model: 'm', url: 'u', key: 'k' }];
        initCustomModelsManager(() => {}, vi.fn());

        document.querySelector('.cpm-cm-del-btn').click();

        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(0);
        expect(mockRisu.setArgument).toHaveBeenCalled();
        expect(document.getElementById('cpm-cm-list').textContent).toContain('No custom models defined');
    });

    it('exports model JSON without leaking API key', () => {
        mockState.CUSTOM_MODELS_CACHE = [{ uniqueId: 'custom_1', name: 'Export Me', model: 'm', url: 'u', key: 'secret-key' }];
        initCustomModelsManager(() => {}, vi.fn());

        const originalCreateElement = document.createElement.bind(document);
        let capturedAnchor = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'a') capturedAnchor = el;
            return el;
        });

        document.querySelector('.cpm-cm-export-btn').click();

        document.createElement = originalCreateElement;
        const exported = JSON.parse(decodeURIComponent(capturedAnchor.href.split(',')[1]));
        expect(exported.name).toBe('Export Me');
        expect(exported.key).toBeUndefined();
        expect(exported._cpmModelExport).toBe(true);
        expect(capturedAnchor.download).toContain('.cpm-model.json');
    });

    it('imports a valid exported custom model file', async () => {
        initCustomModelsManager(() => {}, vi.fn());

        const originalCreateElement = document.createElement.bind(document);
        let createdInput = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'input' && !createdInput) createdInput = el;
            return el;
        });

        document.getElementById('cpm-import-model-btn').click();
        await createdInput.onchange({
            target: {
                files: [
                    {
                        text: async () => JSON.stringify({
                            _cpmModelExport: true,
                            name: 'Imported Model',
                            model: 'imported-x',
                            url: 'https://imported.test',
                        }),
                    },
                ],
            },
        });
        await flushUi();

        document.createElement = originalCreateElement;
        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0].name).toBe('Imported Model');
        expect(globalThis.alert).toHaveBeenCalled();
    });
});

describe('UI regression — settings export/import', () => {
    beforeEach(() => {
        setupDom(`
            <!doctype html>
            <html>
                <body>
                    <button id="cpm-export-btn">Export</button>
                    <button id="cpm-import-btn">Import</button>
                    <input id="cpm_fallback_temp" type="number" value="0.7">
                    <input id="cpm_show_token_usage" type="checkbox">
                </body>
            </html>
        `);
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('exports current settings and provider export keys into a downloadable JSON blob', async () => {
        mockRegisteredProviderTabs.push({ exportKeys: ['cpm_custom_tab_key'] });
        mockSafeGetArg.mockImplementation(async (key, def = '') => ({
            cpm_fallback_temp: '0.55',
            cpm_custom_tab_key: 'enabled',
        }[key] ?? def));

        const originalCreateElement = document.createElement.bind(document);
        let capturedAnchor = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'a') capturedAnchor = el;
            return el;
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushUi();

        document.createElement = originalCreateElement;
        const exported = JSON.parse(decodeURIComponent(capturedAnchor.href.split(',')[1]));
        expect(exported._cpmExportVersion).toBe(2);
        expect(exported.settings.cpm_fallback_temp).toBe('0.55');
        expect(exported.settings.cpm_custom_tab_key).toBe('enabled');
        expect(capturedAnchor.download).toBe('cupcake_pm_settings.json');
    });

    it('imports JSON settings, updates DOM, and reopens settings view', async () => {
        const setVal = vi.fn();
        const reopen = vi.fn();

        class MockFileReader {
            readAsText(file) {
                this.onload({ target: { result: file.__text } });
            }
        }
        Object.defineProperty(globalThis, 'FileReader', {
            configurable: true,
            writable: true,
            value: MockFileReader,
        });

        const originalCreateElement = document.createElement.bind(document);
        let createdInput = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'input' && !createdInput) createdInput = el;
            return el;
        });

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        createdInput.onchange({
            target: {
                files: [{
                    __text: JSON.stringify({
                        _cpmExportVersion: 2,
                        settings: {
                            cpm_fallback_temp: '0.25',
                            cpm_show_token_usage: true,
                        },
                        pluginStorage: {},
                    }),
                }],
            },
        });
        await flushUi();

        document.createElement = originalCreateElement;
        expect(setVal).toHaveBeenCalledWith('cpm_fallback_temp', '0.25');
        expect(setVal).toHaveBeenCalledWith('cpm_show_token_usage', true);
        expect(document.getElementById('cpm_fallback_temp').value).toBe('0.25');
        expect(document.getElementById('cpm_show_token_usage').checked).toBe(true);
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        expect(reopen).toHaveBeenCalledTimes(1);
    });

    it('shows an alert and does not reopen when imported JSON is invalid', async () => {
        const setVal = vi.fn();
        const reopen = vi.fn();

        class MockFileReader {
            readAsText(file) {
                this.onload({ target: { result: file.__text } });
            }
        }
        Object.defineProperty(globalThis, 'FileReader', {
            configurable: true,
            writable: true,
            value: MockFileReader,
        });

        const originalCreateElement = document.createElement.bind(document);
        let createdInput = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'input' && !createdInput) createdInput = el;
            return el;
        });

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        createdInput.onchange({
            target: {
                files: [{ __text: '{invalid json' }],
            },
        });
        await flushUi();

        document.createElement = originalCreateElement;
        expect(setVal).not.toHaveBeenCalled();
        expect(reopen).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일 읽기 오류:'));
    });

    it('shows an alert when imported file data is not a string payload', async () => {
        const setVal = vi.fn();
        const reopen = vi.fn();

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: new ArrayBuffer(8) } });
            }
        }
        Object.defineProperty(globalThis, 'FileReader', {
            configurable: true,
            writable: true,
            value: MockFileReader,
        });

        const originalCreateElement = document.createElement.bind(document);
        let createdInput = null;
        document.createElement = ((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'input' && !createdInput) createdInput = el;
            return el;
        });

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        createdInput.onchange({ target: { files: [{}] } });
        await flushUi();

        document.createElement = originalCreateElement;
        expect(setVal).not.toHaveBeenCalled();
        expect(reopen).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일 형식이 올바르지 않습니다.'));
    });
});

describe('UI regression — API view panel', () => {
    beforeEach(() => {
        setupDom(`
            <!doctype html>
            <html>
                <body>
                    <button id="cpm-api-view-btn">Open API View</button>
                    <div id="cpm-api-view-panel" class="hidden">
                        <select id="cpm-api-view-selector"></select>
                        <button id="cpm-api-view-close">Close</button>
                        <div id="cpm-api-view-content"></div>
                    </div>
                </body>
            </html>
        `);
        resetUiMocks();
    });

    afterEach(() => {
        dom?.window?.close();
    });

    it('opens, renders, switches, and closes the API request viewer', async () => {
        mockApiState.requests = [
            {
                id: 'req-older',
                timestamp: '2026-03-07T10:00:00.000Z',
                modelName: '[OpenAI] Older',
                url: 'https://api.example.com/v1/chat',
                method: 'POST',
                requestHeaders: { Authorization: 'Bearer SECRET12345678' },
                requestBody: { prompt: 'older' },
                response: 'Older response',
                status: 200,
                duration: 111,
            },
            {
                id: 'req-newer',
                timestamp: '2026-03-07T11:00:00.000Z',
                modelName: '[OpenAI] Newer',
                url: 'https://api.example.com/v1/chat',
                method: 'POST',
                requestHeaders: { Authorization: 'Bearer SECRET99990000' },
                requestBody: { prompt: 'newer' },
                response: 'Newer response',
                status: 500,
                duration: 222,
            },
        ];

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const panel = document.getElementById('cpm-api-view-panel');
        const selector = document.getElementById('cpm-api-view-selector');
        const content = document.getElementById('cpm-api-view-content');

        expect(panel.classList.contains('hidden')).toBe(false);
        expect(selector.options).toHaveLength(2);
        expect(selector.value).toBe('req-older');
        expect(content.innerHTML).toContain('Bear...5678');
        expect(content.textContent).toContain('Older response');

        selector.value = 'req-newer';
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        expect(content.textContent).toContain('Newer response');
        expect(content.innerHTML).toContain('Bear...0000');

        document.getElementById('cpm-api-view-close').click();
        expect(panel.classList.contains('hidden')).toBe(true);
    });

    it('shows empty-state message when there are no API requests', () => {
        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();
        expect(document.getElementById('cpm-api-view-content').textContent).toContain('아직 API 요청 기록이 없습니다');
    });

    it('toggles the API panel closed when the open button is clicked twice', () => {
        mockApiState.requests = [{
            id: 'req-1',
            timestamp: '2026-03-07T10:00:00.000Z',
            modelName: 'Model',
            response: 'ok',
            status: 200,
        }];

        initApiViewPanel();
        const btn = document.getElementById('cpm-api-view-btn');
        const panel = document.getElementById('cpm-api-view-panel');

        btn.click();
        expect(panel.classList.contains('hidden')).toBe(false);
        btn.click();
        expect(panel.classList.contains('hidden')).toBe(true);
    });

    it('renders param-only entries without HTTP header details and handles missing selected request', () => {
        mockApiState.requests = [{
            id: 'req-params-only',
            timestamp: '2026-03-07T12:00:00.000Z',
            modelName: '[Custom] Params Only',
            body: { temperature: 0.7 },
            response: { ok: true },
            status: null,
        }];

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const selector = document.getElementById('cpm-api-view-selector');
        const content = document.getElementById('cpm-api-view-content');

        expect(content.innerHTML).toContain('📊 Request Params');
        expect(content.innerHTML).not.toContain('📤 Request Headers');
        expect(content.innerHTML).toContain('text-yellow-400');

        selector.value = 'missing-id';
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        expect(content.textContent).toContain('선택한 요청 데이터가 없습니다.');
    });

    it('redacts short auth-like header values and formats object responses safely', () => {
        mockApiState.requests = [{
            id: 'req-short-auth',
            timestamp: '2026-03-07T12:30:00.000Z',
            modelName: '[OpenAI] ShortAuth',
            url: 'https://api.example.com/v1/chat',
            method: 'POST',
            requestHeaders: { 'x-api-key': 'abc123' },
            requestBody: { prompt: 'hi' },
            response: { ok: true, nested: { value: 1 } },
            status: 204,
        }];

        initApiViewPanel();
        document.getElementById('cpm-api-view-btn').click();

        const content = document.getElementById('cpm-api-view-content');
        expect(content.innerHTML).toContain('***');
        expect(content.innerHTML).toContain('nested');
        expect(content.innerHTML).toContain('text-green-400');
    });

    it('returns early without crashing when required API view elements are missing', () => {
        document.body.innerHTML = '<button id="cpm-api-view-btn">Open API View</button>';

        expect(() => initApiViewPanel()).not.toThrow();
        document.getElementById('cpm-api-view-btn').click();
        expect(true).toBe(true);
    });
});
