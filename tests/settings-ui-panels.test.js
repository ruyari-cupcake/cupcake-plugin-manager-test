/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    safeGetArg: vi.fn(async (key) => ({
        cpm_key1: 'value-1',
        cpm_key2: '',
        cpm_key3: 'value-3',
    }[key] ?? '')),
    Risu: {
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
            keys: vi.fn(async () => []),
        },
    },
    SubPluginManager: {
        plugins: [],
        unloadPlugin: vi.fn(),
        loadRegistry: vi.fn(async () => {}),
        executeEnabled: vi.fn(async () => {}),
    },
    escHtml: vi.fn((s) => String(s ?? '')),
    getManagedSettingKeys: vi.fn(() => ['cpm_key1', 'cpm_key2', 'cpm_key3']),
    getAllApiRequests: vi.fn(() => []),
    getApiRequestById: vi.fn(() => null),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.Risu,
    safeGetArg: (...args) => h.safeGetArg(...args),
}));

vi.mock('../src/lib/helpers.js', () => ({
    escHtml: (...args) => h.escHtml(...args),
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    getManagedSettingKeys: (...args) => h.getManagedSettingKeys(...args),
}));

vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: h.SubPluginManager,
}));

vi.mock('../src/lib/api-request-log.js', () => ({
    getAllApiRequests: (...args) => h.getAllApiRequests(...args),
    getApiRequestById: (...args) => h.getApiRequestById(...args),
}));

import { initApiViewPanel, initExportImport } from '../src/lib/settings-ui-panels.js';

const flushAsyncUi = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
};

function mountApiViewDom() {
    document.body.innerHTML = `
        <button id="cpm-api-view-btn">open</button>
        <div id="cpm-api-view-panel" class="hidden">
            <select id="cpm-api-view-selector"></select>
            <button id="cpm-api-view-close">close</button>
            <div id="cpm-api-view-content"></div>
        </div>
    `;
}

describe('initApiViewPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        h.getAllApiRequests.mockReturnValue([]);
        h.getApiRequestById.mockReturnValue(null);
    });

    it('opens the panel and renders the empty-state message when there are no requests', () => {
        mountApiViewDom();
        initApiViewPanel();

        document.getElementById('cpm-api-view-btn').click();

        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('아직 API 요청 기록이 없습니다');
        expect(document.getElementById('cpm-api-view-selector').innerHTML).toBe('');
    });

    it('toggles the panel closed when the button is clicked again', () => {
        mountApiViewDom();
        initApiViewPanel();

        const btn = document.getElementById('cpm-api-view-btn');
        btn.click();
        btn.click();

        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(true);
    });

    it('renders request details, redacts sensitive headers, and updates on selector change', () => {
        const requests = [
            {
                id: 'req-1',
                timestamp: Date.now(),
                status: 200,
                duration: 123,
                method: 'POST',
                url: 'https://api.example.com/v1/chat',
                modelName: 'gpt-5.4',
                requestHeaders: { Authorization: 'Bearer secret-token-1234', 'x-api-key': 'abcdefgh12345678' },
                requestBody: { hello: 'world' },
                response: 'ok',
            },
            {
                id: 'req-2',
                timestamp: Date.now() + 1000,
                status: 503,
                duration: 45,
                modelName: 'fallback-model',
                body: { prompt: 'hi' },
                response: { error: true },
            },
        ];
        h.getAllApiRequests.mockReturnValue(requests);
        h.getApiRequestById.mockImplementation((id) => requests.find((r) => r.id === id) || null);
        mountApiViewDom();
        initApiViewPanel();

        document.getElementById('cpm-api-view-btn').click();

        const selector = document.getElementById('cpm-api-view-selector');
        expect(selector.innerHTML).toContain('gpt-5.4');
        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('Bear...1234');
        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('abcd...5678');
        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('Request Headers');

        selector.value = 'req-2';
        selector.dispatchEvent(new Event('change'));

        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('Request Params');
        expect(selector.innerHTML).toContain('fallback-model');
    });

    it('preserves the current selector value across refreshes when the same request still exists', () => {
        const requests = [
            { id: 'req-1', timestamp: Date.now(), status: 200, modelName: 'alpha', response: 'ok' },
            { id: 'req-2', timestamp: Date.now() + 1, status: 201, modelName: 'beta', response: 'ok-2' },
        ];
        h.getAllApiRequests.mockReturnValue(requests);
        h.getApiRequestById.mockImplementation((id) => requests.find((r) => r.id === id) || null);
        mountApiViewDom();
        initApiViewPanel();

        document.getElementById('cpm-api-view-btn').click();
        const selector = document.getElementById('cpm-api-view-selector');
        selector.value = 'req-2';
        document.getElementById('cpm-api-view-btn').click();
        document.getElementById('cpm-api-view-btn').click();

        expect(selector.value).toBe('req-2');
        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('ok-2');
    });

    it('redacts short secret-like header values as ***', () => {
        const requests = [{
            id: 'req-1',
            timestamp: Date.now(),
            status: 401,
            method: 'POST',
            url: 'https://api.example.com',
            modelName: 'tiny',
            requestHeaders: { 'x-api-key': 'short' },
            requestBody: {},
            response: 'denied',
        }];
        h.getAllApiRequests.mockReturnValue(requests);
        h.getApiRequestById.mockReturnValue(requests[0]);
        mountApiViewDom();
        initApiViewPanel();

        document.getElementById('cpm-api-view-btn').click();

        expect(document.getElementById('cpm-api-view-content').innerHTML).toContain('***');
    });

    it('hides the panel when the close button is clicked', () => {
        mountApiViewDom();
        initApiViewPanel();

        document.getElementById('cpm-api-view-btn').click();
        document.getElementById('cpm-api-view-close').click();

        expect(document.getElementById('cpm-api-view-panel').classList.contains('hidden')).toBe(true);
    });

    it('returns safely when expected DOM elements are missing', () => {
        document.body.innerHTML = '<button id="cpm-api-view-btn">open</button>';
        expect(() => initApiViewPanel()).not.toThrow();
        document.getElementById('cpm-api-view-btn').click();
    });
});

describe('initExportImport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        globalThis.alert = vi.fn();
        h.Risu.pluginStorage.getItem.mockResolvedValue(null);
        h.Risu.pluginStorage.setItem.mockResolvedValue(undefined);
        h.Risu.pluginStorage.removeItem.mockResolvedValue(undefined);
        h.Risu.pluginStorage.keys.mockResolvedValue([]);
        h.SubPluginManager.plugins = [];
    });

    it('exports all managed settings to a downloadable JSON file, including empty values', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const originalCreateElement = document.createElement.bind(document);
        let capturedAnchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'a') capturedAnchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        expect(h.getManagedSettingKeys).toHaveBeenCalled();
        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_key1');
        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_key2');
        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_key3');
        const exported = JSON.parse(decodeURIComponent(capturedAnchor.href.split(',')[1]));
        expect(exported.settings).toEqual({
            cpm_key1: 'value-1',
            cpm_key2: '',
            cpm_key3: 'value-3',
        });

        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('exports safely even when managed settings contain falsey non-empty values', async () => {
        h.getManagedSettingKeys.mockReturnValue(['cpm_zero', 'cpm_false', 'cpm_empty']);
        h.safeGetArg.mockImplementation(async (key) => ({
            cpm_zero: 0,
            cpm_false: false,
            cpm_empty: '',
        }[key]));

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';

        initExportImport(vi.fn(), vi.fn());
        expect(() => document.getElementById('cpm-export-btn').click()).not.toThrow();
        await flushAsyncUi();

        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_zero');
        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_false');
        expect(h.safeGetArg).toHaveBeenCalledWith('cpm_empty');
    });

    it('exports custom models with advanced fields and api keys preserved in full settings export', async () => {
        h.getManagedSettingKeys.mockReturnValue(['cpm_custom_models']);
        h.safeGetArg.mockResolvedValue(JSON.stringify([{
            uniqueId: 'custom_1',
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com/v1',
            key: 'drop-this-key',
            proxyUrl: 'https://proxy.example.com',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'high',
            thinkingBudget: 1024,
            maxOutputLimit: 2048,
            promptCacheRetention: '24h',
            reasoning: 'medium',
            verbosity: 'high',
            effort: 'low',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"temperature":0.2}',
        }]));
        h.Risu.pluginStorage.keys.mockResolvedValue(['cpm_installed_subplugins', 'cpm_settings_backup', 'other_key']);
        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => ({
            cpm_installed_subplugins: '[{"id":"sp1","name":"SubA","enabled":true}]',
            cpm_settings_backup: '{"cpm_openai_key":"sk-backup"}',
        }[key] ?? null));

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';

        const originalCreateElement = document.createElement.bind(document);
        let capturedAnchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'a') capturedAnchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        const exported = JSON.parse(decodeURIComponent(capturedAnchor.href.split(',')[1]));
        const exportedModels = JSON.parse(exported.settings.cpm_custom_models);
        expect(exportedModels[0]).toMatchObject({
            uniqueId: 'custom_1',
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com/v1',
            key: 'drop-this-key',
            proxyUrl: 'https://proxy.example.com',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'high',
            thinkingBudget: 1024,
            maxOutputLimit: 2048,
            promptCacheRetention: '24h',
            reasoning: 'medium',
            verbosity: 'high',
            effort: 'low',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            decoupled: false,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"temperature":0.2}',
        });
        expect(exported.pluginStorage).toEqual({
            cpm_installed_subplugins: '[{"id":"sp1","name":"SubA","enabled":true}]',
            cpm_settings_backup: '{"cpm_openai_key":"sk-backup"}',
        });

        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('does nothing when import is opened but no file is selected', () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        createdInput.onchange({ target: createdInput });

        expect(globalThis.alert).not.toHaveBeenCalled();
        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('imports JSON settings from the new export envelope, updates fields, and reopens settings', async () => {
        document.body.innerHTML = `
            <button id="cpm-export-btn">export</button>
            <button id="cpm-import-btn">import</button>
            <input id="cpm_flag" type="checkbox">
            <input id="cpm_text" type="text">
        `;
        const setVal = vi.fn();
        const reopen = vi.fn();
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: '{"_cpmExportVersion":2,"settings":{"cpm_flag":true,"cpm_text":"hello"},"pluginStorage":{}}' } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(setVal).toHaveBeenCalledWith('cpm_flag', true);
        expect(setVal).toHaveBeenCalledWith('cpm_text', 'hello');
        expect(document.getElementById('cpm_flag').checked).toBe(true);
        expect(document.getElementById('cpm_text').value).toBe('hello');
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        expect(reopen).toHaveBeenCalled();
        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('normalizes imported custom models so advanced settings and api keys survive', async () => {
        document.body.innerHTML = `
            <button id="cpm-export-btn">export</button>
            <button id="cpm-import-btn">import</button>
            <input id="cpm_custom_models" type="text">
        `;
        const setVal = vi.fn();
        const reopen = vi.fn();
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: JSON.stringify({
                    _cpmExportVersion: 2,
                    settings: {
                        cpm_custom_models: [{
                            name: 'Imported',
                            model: 'gpt-4.1-mini',
                            url: 'https://api.example.com/v1',
                            key: 'keep-me',
                            proxyUrl: 'https://proxy.example.com',
                            format: 'google',
                            tok: 'gemma',
                            responsesMode: 'off',
                            thinking: 'medium',
                            thinkingBudget: 3072,
                            maxOutputLimit: 6144,
                            promptCacheRetention: 'in_memory',
                            reasoning: 'high',
                            verbosity: 'low',
                            effort: 'medium',
                            sysfirst: true,
                            mergesys: true,
                            altrole: true,
                            mustuser: true,
                            maxout: true,
                            streaming: true,
                            thought: true,
                            adaptiveThinking: true,
                            customParams: '{"temperature":0.6}',
                        }],
                    },
                    pluginStorage: {},
                }) } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(setVal).toHaveBeenCalledTimes(1);
        const [, normalizedValue] = setVal.mock.calls[0];
        const importedModels = JSON.parse(normalizedValue);
        expect(importedModels[0]).toMatchObject({
            name: 'Imported',
            model: 'gpt-4.1-mini',
            url: 'https://api.example.com/v1',
            proxyUrl: 'https://proxy.example.com',
            format: 'google',
            tok: 'gemma',
            responsesMode: 'off',
            thinking: 'medium',
            thinkingBudget: 3072,
            maxOutputLimit: 6144,
            promptCacheRetention: 'in_memory',
            reasoning: 'high',
            verbosity: 'low',
            effort: 'medium',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            decoupled: false,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"temperature":0.6}',
        });
        expect(importedModels[0].key).toBe('keep-me');
        expect(document.getElementById('cpm_custom_models').value).toBe(normalizedValue);
        expect(reopen).toHaveBeenCalled();

        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('imports CPM pluginStorage snapshot including sub-plugin registry and executes imported plugins', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const setVal = vi.fn();
        const reopen = vi.fn();
        h.Risu.pluginStorage.keys.mockResolvedValue(['cpm_installed_subplugins', 'cpm_old_key']);
        h.SubPluginManager.plugins = [{ id: 'old-plugin' }];

        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: JSON.stringify({
                    _cpmExportVersion: 2,
                    settings: {},
                    pluginStorage: {
                        cpm_installed_subplugins: '[{"id":"sp1","name":"Imported Sub","enabled":true}]',
                        cpm_settings_backup: '{"cpm_openai_key":"sk-123"}',
                    },
                }) } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        const removedKeys = h.Risu.pluginStorage.removeItem.mock.calls.map(call => call[0]);
        expect(removedKeys).toContain('cpm_old_key');
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalledWith('cpm_installed_subplugins', '[{"id":"sp1","name":"Imported Sub","enabled":true}]');
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalledWith('cpm_settings_backup', '{"cpm_openai_key":"sk-123"}');
        expect(h.SubPluginManager.unloadPlugin).toHaveBeenCalledWith('old-plugin');
        expect(h.SubPluginManager.loadRegistry).toHaveBeenCalled();
        expect(h.SubPluginManager.executeEnabled).toHaveBeenCalled();
        expect(reopen).toHaveBeenCalled();

        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('treats string TRUE as a checked checkbox value during import', async () => {
        document.body.innerHTML = `
            <button id="cpm-export-btn">export</button>
            <button id="cpm-import-btn">import</button>
            <input id="cpm_flag" type="checkbox">
        `;
        const setVal = vi.fn();
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: '{"cpm_flag":"TRUE"}' } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await Promise.resolve();
        await Promise.resolve();

        expect(document.getElementById('cpm_flag').checked).toBe(true);
        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('alerts when FileReader returns a non-string payload', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: new Uint8Array([1, 2, 3]) } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await Promise.resolve();
        await Promise.resolve();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일 형식이 올바르지 않습니다'));
        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('alerts when the imported file is invalid JSON', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const originalCreateElement = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tagName, options) {
                const el = originalCreateElement(tagName, options);
                if (String(tagName).toLowerCase() === 'input') {
                    createdInput = el;
                    el.click = vi.fn();
                }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: '{broken json' } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await Promise.resolve();
        await Promise.resolve();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일 읽기 오류'));
        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });
});
