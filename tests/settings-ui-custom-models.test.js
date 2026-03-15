/**
 * @vitest-environment jsdom
 */
/**
 * settings-ui-custom-models.test.js — Tests for settings-ui-custom-models.js
 * focusing on branch coverage gaps: populateEditor, clearEditor,
 * readEditorValues, renderCustomModelEditor, and initCustomModelsManager
 * CRUD/import/export/cancel/save event handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──
const { mockState, mockRisu, mockSettingsBackup } = vi.hoisted(() => ({
    mockState: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
    },
    mockRisu: {
        setArgument: vi.fn(),
        getArgument: vi.fn(async () => ''),
        showContainer: vi.fn(),
        hideContainer: vi.fn(),
    },
    mockSettingsBackup: {
        updateKey: vi.fn(),
    },
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: mockRisu,
    state: mockState,
}));

vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: mockSettingsBackup,
}));

vi.mock('../src/lib/helpers.js', () => ({
    escHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}));

/**
 * Sets up the full DOM structure that initCustomModelsManager expects.
 * Returns references to key elements.
 */
function setupDom() {
    document.body.innerHTML = `
        <div id="tab-customs">
            <div id="cpm-cm-count">0</div>
            <div id="cpm-cm-list"></div>
            <button id="cpm-add-custom-btn">Add</button>
            <button id="cpm-import-model-btn">Import</button>
            <div id="cpm-cm-editor" class="hidden">
                <h4 id="cpm-cm-editor-title">Edit Custom Model</h4>
                <input type="hidden" id="cpm-cm-id" value="">
                <input type="text" id="cpm-cm-name" value="">
                <input type="text" id="cpm-cm-model" value="">
                <input type="text" id="cpm-cm-url" value="">
                <textarea id="cpm-cm-key"></textarea>
                <input type="text" id="cpm-cm-proxy-url" value="">
                <input type="checkbox" id="cpm-cm-proxy-direct">
                <select id="cpm-cm-format"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option></select>
                <select id="cpm-cm-tok"><option value="o200k_base">o200k_base</option><option value="llama3">llama3</option></select>
                <select id="cpm-cm-responses-mode"><option value="auto">Auto</option><option value="on">On</option></select>
                <select id="cpm-cm-thinking"><option value="none">None</option><option value="MEDIUM">Medium</option></select>
                <input type="number" id="cpm-cm-thinking-budget" value="0">
                <input type="number" id="cpm-cm-max-output" value="0">
                <select id="cpm-cm-prompt-cache-retention"><option value="none">None</option><option value="in_memory">In-Memory</option></select>
                <select id="cpm-cm-reasoning"><option value="none">None</option><option value="medium">Medium</option></select>
                <select id="cpm-cm-verbosity"><option value="none">None</option><option value="high">High</option></select>
                <select id="cpm-cm-effort"><option value="none">None</option><option value="high">High</option></select>
                <input type="checkbox" id="cpm-cm-sysfirst">
                <input type="checkbox" id="cpm-cm-mergesys">
                <input type="checkbox" id="cpm-cm-altrole">
                <input type="checkbox" id="cpm-cm-mustuser">
                <input type="checkbox" id="cpm-cm-maxout">
                <input type="checkbox" id="cpm-cm-streaming">
                <input type="checkbox" id="cpm-cm-thought">
                <input type="checkbox" id="cpm-cm-adaptive-thinking">
                <textarea id="cpm-cm-custom-params"></textarea>
                <button id="cpm-cm-cancel">Cancel</button>
                <button id="cpm-cm-save">Save</button>
            </div>
        </div>
    `;
    return {
        cmList: document.getElementById('cpm-cm-list'),
        cmEditor: document.getElementById('cpm-cm-editor'),
        cmCount: document.getElementById('cpm-cm-count'),
        addBtn: document.getElementById('cpm-add-custom-btn'),
        importBtn: document.getElementById('cpm-import-model-btn'),
        cancelBtn: document.getElementById('cpm-cm-cancel'),
        saveBtn: document.getElementById('cpm-cm-save'),
    };
}

describe('renderCustomModelEditor', () => {
    it('returns HTML string with select options', async () => {
        const { renderCustomModelEditor } = await import('../src/lib/settings-ui-custom-models.js');

        const html = renderCustomModelEditor(
            [{ value: 'none', text: 'None' }, { value: 'MEDIUM', text: 'Medium' }],
            [{ value: 'none', text: 'None' }],
            [{ value: 'none', text: 'None' }],
            [{ value: 'none', text: 'None' }],
        );

        expect(html).toContain('cpm-cm-editor');
        expect(html).toContain('cpm-cm-save');
        expect(html).toContain('cpm-cm-cancel');
    });
});

describe('populateEditor', () => {
    beforeEach(() => setupDom());
    afterEach(() => { document.body.innerHTML = ''; });

    it('fills all fields from model data', async () => {
        const { populateEditor } = await import('../src/lib/settings-ui-custom-models.js');

        populateEditor({
            uniqueId: 'test-1',
            name: 'Test Model',
            model: 'gpt-4o',
            url: 'http://test.com',
            key: 'sk-xxx',
            format: 'anthropic',
            tok: 'llama3',
            responsesMode: 'on',
            thinking: 'MEDIUM',
            thinkingBudget: 8192,
            maxOutputLimit: 4096,
            promptCacheRetention: 'in_memory',
            reasoning: 'medium',
            verbosity: 'high',
            effort: 'high',
            sysfirst: true,
            mergesys: true,
            altrole: false,
            mustuser: true,
            maxout: false,
            streaming: true,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"temp": 0.7}',
        });

        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-id')).value).toBe('test-1');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value).toBe('Test Model');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-model')).value).toBe('gpt-4o');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-url')).value).toBe('http://test.com');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-format')).value).toBe('anthropic');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-tok')).value).toBe('llama3');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-responses-mode')).value).toBe('on');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-thinking-budget')).value).toBe('8192');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-max-output')).value).toBe('4096');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-sysfirst')).checked).toBe(true);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-mergesys')).checked).toBe(true);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-altrole')).checked).toBe(false);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-mustuser')).checked).toBe(true);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-streaming')).checked).toBe(true);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-thought')).checked).toBe(true);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-adaptive-thinking')).checked).toBe(true);
        expect(/** @type {HTMLTextAreaElement} */ (document.getElementById('cpm-cm-custom-params')).value).toBe('{"temp": 0.7}');
    });

    it('handles missing/undefined model properties with defaults', async () => {
        const { populateEditor } = await import('../src/lib/settings-ui-custom-models.js');

        populateEditor({ uniqueId: 'empty-1' });

        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value).toBe('');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-format')).value).toBe('openai');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-tok')).value).toBe('o200k_base');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-thinking-budget')).value).toBe('0');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-sysfirst')).checked).toBe(false);
    });

    it('sets streaming checked when decoupled is true (and streaming is undefined)', async () => {
        const { populateEditor } = await import('../src/lib/settings-ui-custom-models.js');

        populateEditor({ uniqueId: 'x', decoupled: true, streaming: false });
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-streaming')).checked).toBe(false);

        populateEditor({ uniqueId: 'y', decoupled: false });
        // streaming !== false and !decoupled → true
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-streaming')).checked).toBe(true);
    });
});

describe('clearEditor', () => {
    beforeEach(() => setupDom());
    afterEach(() => { document.body.innerHTML = ''; });

    it('resets all fields to defaults', async () => {
        const { clearEditor, populateEditor } = await import('../src/lib/settings-ui-custom-models.js');

        // First fill, then clear
        populateEditor({
            uniqueId: 'fill', name: 'Fill', model: 'x', url: 'http://x', key: 'k',
            format: 'anthropic', tok: 'llama3', thinking: 'MEDIUM', thinkingBudget: 1000,
            sysfirst: true, streaming: true, customParams: '{}',
        });
        clearEditor();

        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value).toBe('');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-model')).value).toBe('');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-url')).value).toBe('');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-key')).value).toBe('');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-format')).value).toBe('openai');
        expect(/** @type {HTMLSelectElement} */ (document.getElementById('cpm-cm-tok')).value).toBe('o200k_base');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-thinking-budget')).value).toBe('0');
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-sysfirst')).checked).toBe(false);
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-streaming')).checked).toBe(false);
        expect(/** @type {HTMLTextAreaElement} */ (document.getElementById('cpm-cm-custom-params')).value).toBe('');
    });
});

describe('readEditorValues', () => {
    beforeEach(() => setupDom());
    afterEach(() => { document.body.innerHTML = ''; });

    it('reads all editor fields into a model object', async () => {
        const { readEditorValues, populateEditor } = await import('../src/lib/settings-ui-custom-models.js');

        populateEditor({
            uniqueId: 'r1', name: 'Read Test', model: 'gpt-4o', url: 'http://x',
            key: 'sk-a', format: 'openai', tok: 'o200k_base', thinking: 'none',
            thinkingBudget: 0, maxOutputLimit: 0, reasoning: 'none', verbosity: 'none',
            effort: 'none', sysfirst: false, mergesys: false, altrole: false,
            mustuser: false, maxout: false, streaming: true, thought: false,
            adaptiveThinking: false, customParams: '',
        });

        const result = readEditorValues('r1');

        expect(result.uniqueId).toBe('r1');
        expect(result.name).toBe('Read Test');
        expect(result.model).toBe('gpt-4o');
        expect(result.streaming).toBe(true);
        expect(result.decoupled).toBe(false);
        expect(result.thinkingBudget).toBe(0);
    });

    it('returns decoupled=true when streaming unchecked', async () => {
        const { readEditorValues, clearEditor } = await import('../src/lib/settings-ui-custom-models.js');

        clearEditor();
        const result = readEditorValues('uid-1');
        expect(result.streaming).toBe(false);
        expect(result.decoupled).toBe(true);
    });

    it('parses numeric fields correctly with invalid input', async () => {
        const { readEditorValues } = await import('../src/lib/settings-ui-custom-models.js');

        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-thinking-budget')).value = 'abc';
        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-max-output')).value = '';

        const result = readEditorValues('num-test');
        expect(result.thinkingBudget).toBe(0);
        expect(result.maxOutputLimit).toBe(0);
    });
});

describe('initCustomModelsManager', () => {
    beforeEach(() => {
        setupDom();
        mockState.CUSTOM_MODELS_CACHE = [];
        vi.clearAllMocks();
    });
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders empty list when no custom models', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        initCustomModelsManager(vi.fn(), vi.fn());

        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(0);
        expect(document.getElementById('cpm-cm-list').innerHTML).toContain('No custom models');
    });

    it('renders model cards with key rotation badge', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'c1', name: 'Multi Key', model: 'gpt-4', url: 'http://x', key: 'key1 key2', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        // Note: cmCount.innerText setter doesn't work in JSDOM — verify list content instead
        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(1);
        expect(document.getElementById('cpm-cm-list').innerHTML).toContain('키회전');
        expect(document.getElementById('cpm-cm-list').innerHTML).toContain('Multi Key');
    });

    it('renders model cards without key rotation badge for single key', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'c1', name: 'Single Key', model: 'gpt-4', url: 'http://x', key: 'key1', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        expect(document.getElementById('cpm-cm-list').innerHTML).not.toContain('키회전');
    });

    it('add button opens editor with cleared fields', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        initCustomModelsManager(vi.fn(), vi.fn());

        document.getElementById('cpm-add-custom-btn').click();

        expect(document.getElementById('cpm-cm-editor').classList.contains('hidden')).toBe(false);
        // Note: source sets title via innerText which JSDOM does not fully implement as setter.
        // Verify other handler side effects instead.
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-id')).value).toMatch(/^custom_/);
        // Editor was prepended into cmList
        expect(document.getElementById('cpm-cm-list').contains(document.getElementById('cpm-cm-editor'))).toBe(true);
    });

    it('cancel button hides editor and moves it back to tab-customs', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        initCustomModelsManager(vi.fn(), vi.fn());

        // Open then cancel
        document.getElementById('cpm-add-custom-btn').click();
        expect(document.getElementById('cpm-cm-editor').classList.contains('hidden')).toBe(false);

        document.getElementById('cpm-cm-cancel').click();
        expect(document.getElementById('cpm-cm-editor').classList.contains('hidden')).toBe(true);
    });

    it('save button adds new model to cache and persists', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        initCustomModelsManager(vi.fn(), vi.fn());

        // Open add editor
        document.getElementById('cpm-add-custom-btn').click();

        // Fill required fields
        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value = 'New Model';
        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-model')).value = 'gpt-4o';
        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-url')).value = 'http://api.test.com';

        // Save
        document.getElementById('cpm-cm-save').click();

        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0].name).toBe('New Model');
        expect(mockRisu.setArgument).toHaveBeenCalledWith(
            'cpm_custom_models',
            expect.stringContaining('New Model')
        );
        expect(mockSettingsBackup.updateKey).toHaveBeenCalled();
        expect(document.getElementById('cpm-cm-editor').classList.contains('hidden')).toBe(true);
    });

    it('save button updates existing model by uniqueId', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'exist-1', name: 'Old Name', model: 'gpt-3.5', url: 'http://old', key: '', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        // Click edit
        const editBtn = document.querySelector('.cpm-cm-edit-btn');
        editBtn.click();

        // Modify name
        /** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value = 'Updated Name';

        // Save
        document.getElementById('cpm-cm-save').click();

        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0].name).toBe('Updated Name');
    });

    it('edit button populates editor and shows it', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'e1', name: 'Edit Me', model: 'claude-3', url: 'http://a', key: 'k', format: 'anthropic' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        document.querySelector('.cpm-cm-edit-btn').click();

        expect(document.getElementById('cpm-cm-editor').classList.contains('hidden')).toBe(false);
        // innerText setter in JSDOM is not implemented; verify via field population instead
        expect(/** @type {HTMLInputElement} */ (document.getElementById('cpm-cm-name')).value).toBe('Edit Me');
    });

    it('delete button removes model after confirm', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'd1', name: 'Delete Me', model: 'x', url: 'http://x', key: '', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        // Mock confirm to return true
        vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

        document.querySelector('.cpm-cm-del-btn').click();

        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(0);
        expect(mockRisu.setArgument).toHaveBeenCalledWith('cpm_custom_models', '[]');
        expect(document.getElementById('cpm-cm-list').innerHTML).toContain('No custom models');
    });

    it('delete button does nothing when confirm returns false', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'd2', name: 'Keep Me', model: 'x', url: 'http://x', key: '', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

        document.querySelector('.cpm-cm-del-btn').click();

        expect(mockState.CUSTOM_MODELS_CACHE.length).toBe(1);
    });

    it('export button creates download link without key', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            {
                uniqueId: 'exp1',
                name: 'Export Me',
                model: 'gpt-4',
                url: 'http://x',
                key: 'secret-key',
                proxyUrl: 'https://proxy.example.com',
                format: 'openai',
                tok: 'o200k_base',
                responsesMode: 'on',
                thinking: 'MEDIUM',
                thinkingBudget: 2048,
                maxOutputLimit: 4096,
                promptCacheRetention: 'in_memory',
                reasoning: 'medium',
                verbosity: 'high',
                effort: 'high',
                sysfirst: true,
                mergesys: true,
                altrole: true,
                mustuser: true,
                maxout: true,
                streaming: true,
                decoupled: false,
                thought: true,
                adaptiveThinking: true,
                customParams: '{"temperature":0.7}',
            },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        // Track the anchor created during export
        const origCreate = document.createElement.bind(document);
        let capturedAnchor = null;
        vi.spyOn(document, 'createElement').mockImplementation((tag, opts) => {
            const el = origCreate(tag, opts);
            if (tag === 'a') capturedAnchor = el;
            return el;
        });

        document.querySelector('.cpm-cm-export-btn').click();

        expect(capturedAnchor).not.toBeNull();
        const exported = JSON.parse(decodeURIComponent(capturedAnchor.href.split(',')[1]));
        expect(exported).toMatchObject({
            name: 'Export Me',
            model: 'gpt-4',
            url: 'http://x',
            proxyUrl: 'https://proxy.example.com',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'MEDIUM',
            thinkingBudget: 2048,
            maxOutputLimit: 4096,
            promptCacheRetention: 'in_memory',
            reasoning: 'medium',
            verbosity: 'high',
            effort: 'high',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            decoupled: false,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"temperature":0.7}',
            _cpmModelExport: true,
        });
        expect(exported.key).toBeUndefined();
        expect(capturedAnchor.download).toContain('.cpm-model.json');
    });

    it('import restores url and advanced options while keeping api key empty', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

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

        initCustomModelsManager(vi.fn(), vi.fn());
        document.getElementById('cpm-import-model-btn').click();
        Object.defineProperty(createdInput, 'files', {
            configurable: true,
            value: [{
                text: async () => JSON.stringify({
                    _cpmModelExport: true,
                    name: 'Imported Model',
                    model: 'gpt-4.1',
                    url: 'https://api.example.com/v1',
                    proxyUrl: 'https://proxy.example.com',
                    format: 'anthropic',
                    tok: 'llama3',
                    responsesMode: 'on',
                    thinking: 'MEDIUM',
                    thinkingBudget: 8192,
                    maxOutputLimit: 16384,
                    promptCacheRetention: 'in_memory',
                    reasoning: 'medium',
                    verbosity: 'high',
                    effort: 'high',
                    sysfirst: true,
                    mergesys: true,
                    altrole: true,
                    mustuser: true,
                    maxout: true,
                    streaming: true,
                    thought: true,
                    adaptiveThinking: true,
                    customParams: '{"top_p":0.9}',
                }),
            }],
        });

        await createdInput.onchange({ target: createdInput });

        expect(mockState.CUSTOM_MODELS_CACHE).toHaveLength(1);
        expect(mockState.CUSTOM_MODELS_CACHE[0]).toMatchObject({
            name: 'Imported Model',
            model: 'gpt-4.1',
            url: 'https://api.example.com/v1',
            proxyUrl: 'https://proxy.example.com',
            format: 'anthropic',
            tok: 'llama3',
            responsesMode: 'on',
            thinking: 'MEDIUM',
            thinkingBudget: 8192,
            maxOutputLimit: 16384,
            promptCacheRetention: 'in_memory',
            reasoning: 'medium',
            verbosity: 'high',
            effort: 'high',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            decoupled: false,
            thought: true,
            adaptiveThinking: true,
            customParams: '{"top_p":0.9}',
            key: '',
        });

        Object.defineProperty(document, 'createElement', { configurable: true, value: originalCreateElement });
    });

    it('export button skips when index is out of range', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'x', name: 'X', model: 'x', url: 'http://x', key: '', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        // Manipulate the data-idx to be invalid
        const btn = document.querySelector('.cpm-cm-export-btn');
        btn.setAttribute('data-idx', '99');
        btn.click();

        // Should not throw - graceful return
    });

    it('renders unnamed model and no-URL fallbacks', async () => {
        const { initCustomModelsManager } = await import('../src/lib/settings-ui-custom-models.js');

        mockState.CUSTOM_MODELS_CACHE = [
            { uniqueId: 'u1', name: '', model: '', url: '', key: '', format: 'openai' },
        ];
        initCustomModelsManager(vi.fn(), vi.fn());

        const listHtml = document.getElementById('cpm-cm-list').innerHTML;
        expect(listHtml).toContain('Unnamed Model');
        expect(listHtml).toContain('No model ID');
        expect(listHtml).toContain('No URL');
    });
});
