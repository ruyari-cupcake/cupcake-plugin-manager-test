// @ts-check
/**
 * settings-ui-custom-models.js — Custom Models Manager UI.
 * Extracted from settings-ui.js for modularity.
 * Handles the custom model editor form, CRUD, import/export of model definitions.
 */
import { Risu, state } from './shared-state.js';
import { SettingsBackup } from './settings-backup.js';
import { normalizeCustomModel, serializeCustomModelExport } from './custom-model-serialization.js';
import { escHtml } from './helpers.js';

/**
 * Persist custom models to RisuAI argument storage + backup.
 * Both setArgument and updateKey are invoked immediately (synchronous mock-friendly),
 * then awaited in parallel. Errors are logged, not thrown.
 * @param {string} json  Stringified CUSTOM_MODELS_CACHE
 * @param {Record<string, any>|undefined} [savedEntry]  The model entry that was saved (for verification)
 */
async function _persistCustomModels(json, savedEntry) {
    // Invoke both synchronously so mock recorders capture them immediately
    const p1 = Risu.setArgument('cpm_custom_models', json);
    const p2 = SettingsBackup.updateKey('cpm_custom_models', json);

    try { await p1; } catch (e) { console.error('[CPM Save] Risu.setArgument FAILED:', /** @type {Error} */ (e).message || e); }
    try { await p2; } catch (e) { console.error('[CPM Save] SettingsBackup.updateKey FAILED:', /** @type {Error} */ (e).message || e); }

    // Verification: read back and confirm proxyUrl survived round-trip
    if (savedEntry?.proxyUrl) {
        try {
            const verify = await Risu.getArgument('cpm_custom_models');
            if (typeof verify === 'string') {
                if (!verify.includes(savedEntry.proxyUrl)) {
                    console.error(`[CPM Save] ⚠️ VERIFICATION FAILED — proxyUrl "${savedEntry.proxyUrl}" not found in persisted data! ` +
                        `Saved length=${json.length}, readBack length=${verify.length}`);
                } else {
                    console.log(`[CPM Save] ✅ Verified: proxyUrl persisted correctly.`);
                }
            }
        } catch (_) { /* verification is best-effort */ }
    }
}

/** @typedef {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} FormField */

/** @param {string} id */
function getElement(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`[CPM] Missing element: ${id}`);
    return el;
}

/** @param {string} id */
function getField(id) {
    return /** @type {FormField} */ (getElement(id));
}

/** @param {string} id */
function getCheckbox(id) {
    return /** @type {HTMLInputElement} */ (getElement(id));
}

/** @param {string} id */
function getContainer(id) {
    return /** @type {HTMLElement} */ (getElement(id));
}

/** @param {string} id */
function getButton(id) {
    return /** @type {HTMLButtonElement} */ (getElement(id));
}

/** @param {EventTarget|null} eventTarget */
function getFileInputFiles(eventTarget) {
    return Array.from((/** @type {HTMLInputElement} */ (eventTarget)).files || []);
}

/** @param {EventTarget|null} eventTarget */
function getDatasetIndex(eventTarget) {
    const idx = (/** @type {HTMLElement} */ (eventTarget)).dataset.idx;
    return typeof idx === 'string' ? parseInt(idx, 10) : -1;
}

// ── Helper: Custom model editor HTML ──
/**
 * @param {Array<{value: string, text: string}>} thinkingList
 * @param {Array<{value: string, text: string}>} reasoningList
 * @param {Array<{value: string, text: string}>} verbosityList
 * @param {Array<{value: string, text: string}>} effortList
 */
export function renderCustomModelEditor(thinkingList, reasoningList, verbosityList, effortList) {
    return `
        <div id="cpm-cm-editor" class="hidden mt-6 bg-gray-900 border border-gray-700 rounded-lg p-6 relative">
            <h4 class="text-xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2" id="cpm-cm-editor-title">Edit Custom Model</h4>
            <input type="hidden" id="cpm-cm-id" value="">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2 text-xs text-blue-300 mb-2 border-l-4 border-blue-500 pl-3">고급 옵션이 필요 없는 경우, 필수 항목만 입력하고 저장하세요.</div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Display Name</label><input type="text" id="cpm-cm-name" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Model Name</label><input type="text" id="cpm-cm-model" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">Base URL</label><input type="text" id="cpm-cm-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">API Key (여러 개 → 공백/줄바꿈 구분 → 자동 키회전)</label><textarea id="cpm-cm-key" rows="2" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm" spellcheck="false" placeholder="sk-xxxx"></textarea></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">CORS Proxy URL <span class="text-xs text-yellow-400">(선택사항 — 모든 API에 적용 가능)</span></label><input type="text" id="cpm-cm-proxy-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm" placeholder="https://my-proxy.example.com/proxy (비워두면 직접 요청)"><label class="flex items-center space-x-2 text-xs text-gray-400 mt-2 cursor-pointer"><input type="checkbox" id="cpm-cm-proxy-direct" class="form-checkbox bg-gray-800"> <span>Direct 모드 <span class="text-yellow-400">(프록시 URL로 직접 요청, 원본 URL은 X-Target-URL 헤더로 전달. 기본값은 도메인 교체 방식)</span></span></label></div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4"><h5 class="text-sm font-bold text-gray-300 mb-3">Model Parameters</h5></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">API Format</label><select id="cpm-cm-format" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="google">Google Gemini</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Tokenizer</label><select id="cpm-cm-tok" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="o200k_base">o200k_base</option><option value="llama3">llama3</option><option value="claude">Claude</option><option value="gemma">Gemma</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Responses API Mode</label><select id="cpm-cm-responses-mode" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Level</label><select id="cpm-cm-thinking" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${thinkingList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Budget Tokens (0=끄기)</label><input type="number" id="cpm-cm-thinking-budget" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Max Output Tokens (0=제한없음)</label><input type="number" id="cpm-cm-max-output" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Prompt Cache Retention</label><select id="cpm-cm-prompt-cache-retention" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="none">None</option><option value="in_memory">In-Memory</option><option value="24h">24h Extended</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Reasoning Effort</label><select id="cpm-cm-reasoning" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${reasoningList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Response Verbosity</label><select id="cpm-cm-verbosity" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${verbosityList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Anthropic Effort</label><select id="cpm-cm-effort" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${effortList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select><p class="text-[11px] text-amber-400/80 mt-1">⚠️ Effort/적응형 사고 사용 시 응답이 길어질 수 있습니다. 스트리밍을 켜지 않으면 Cloudflare 524 타임아웃으로 응답 실패가 발생할 수 있습니다. 단, RisuAI 로컬리스(localhost) 환경에서는 스트리밍 관련 버그가 있을 수 있으므로 주의하세요.</p></div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                    <h5 class="text-sm font-bold text-gray-300 mb-3">Formatter Flags</h5>
                    <div class="space-y-2">
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-sysfirst" class="form-checkbox bg-gray-800"> <span>hasFirstSystemPrompt</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mergesys" class="form-checkbox bg-gray-800"> <span>mergeSystemPrompt</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-altrole" class="form-checkbox bg-gray-800"> <span>requiresAlternateRole</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mustuser" class="form-checkbox bg-gray-800"> <span>mustStartWithUserInput</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-maxout" class="form-checkbox bg-gray-800"> <span>useMaxOutputTokensInstead</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-streaming" class="form-checkbox bg-gray-800"> <span>Use Streaming</span></label>
                        <p class="text-[11px] text-cyan-400/70 ml-6 -mt-1">ℹ️ 이 옵션은 글로벌 설정의 <strong>스트리밍 패스스루</strong>도 함께 활성화해야 동작합니다. Copilot 등 프록시 경유 API는 스트리밍 필수 (미사용 시 524 타임아웃).</p>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-thought" class="form-checkbox bg-gray-800"> <span>useThoughtSignature</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-adaptive-thinking" class="form-checkbox bg-gray-800"> <span>useAdaptiveThinking (적응형 사고)</span></label>
                        <p class="text-[11px] text-amber-400/70 ml-6 -mt-1">⚠️ 적응형 사고 활성화 시 추론 시간이 길어집니다. 프록시 경유 환경에서는 반드시 스트리밍을 켜세요 (524 타임아웃 방지). 로컬리스(localhost)에서는 스트리밍 버그가 있을 수 있으니 주의.</p>
                    </div>
                </div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Parameters JSON (파일 경로 아님)</h5>
                    <textarea id="cpm-cm-custom-params" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white h-24 font-mono text-sm" spellcheck="false" placeholder="{}"></textarea>
                </div>
            </div>
            <div class="mt-4 flex justify-end space-x-3 border-t border-gray-800 pt-4">
                <button id="cpm-cm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Cancel</button>
                <button id="cpm-cm-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-bold shadow">Save Definition</button>
            </div>
        </div>
    `;
}

// ── Populate editor from model data ──
/** @param {Record<string, any>} m */
export function populateEditor(m) {
    getField('cpm-cm-id').value = m.uniqueId;
    getField('cpm-cm-name').value = m.name || '';
    getField('cpm-cm-model').value = m.model || '';
    getField('cpm-cm-url').value = m.url || '';
    getField('cpm-cm-key').value = m.key || '';
    getField('cpm-cm-proxy-url').value = m.proxyUrl || '';
    getCheckbox('cpm-cm-proxy-direct').checked = !!m.proxyDirect;
    getField('cpm-cm-format').value = m.format || 'openai';
    getField('cpm-cm-tok').value = m.tok || 'o200k_base';
    getField('cpm-cm-responses-mode').value = m.responsesMode || 'auto';
    getField('cpm-cm-thinking').value = m.thinking || 'none';
    getField('cpm-cm-thinking-budget').value = String(m.thinkingBudget || 0);
    getField('cpm-cm-max-output').value = String(m.maxOutputLimit || 0);
    getField('cpm-cm-prompt-cache-retention').value = m.promptCacheRetention || 'none';
    getField('cpm-cm-reasoning').value = m.reasoning || 'none';
    getField('cpm-cm-verbosity').value = m.verbosity || 'none';
    getField('cpm-cm-effort').value = m.effort || 'none';
    getCheckbox('cpm-cm-sysfirst').checked = !!m.sysfirst;
    getCheckbox('cpm-cm-mergesys').checked = !!m.mergesys;
    getCheckbox('cpm-cm-altrole').checked = !!m.altrole;
    getCheckbox('cpm-cm-mustuser').checked = !!m.mustuser;
    getCheckbox('cpm-cm-maxout').checked = !!m.maxout;
    getCheckbox('cpm-cm-streaming').checked = (m.streaming === true) || (m.streaming !== false && !m.decoupled);
    getCheckbox('cpm-cm-thought').checked = !!m.thought;
    getCheckbox('cpm-cm-adaptive-thinking').checked = !!m.adaptiveThinking;
    getField('cpm-cm-custom-params').value = m.customParams || '';
}

// ── Clear all editor fields ──
export function clearEditor() {
    ['name', 'model', 'url', 'key', 'proxy-url'].forEach(f => { getField(`cpm-cm-${f}`).value = ''; });
    getCheckbox('cpm-cm-proxy-direct').checked = false;
    getField('cpm-cm-format').value = 'openai';
    getField('cpm-cm-tok').value = 'o200k_base';
    getField('cpm-cm-responses-mode').value = 'auto';
    getField('cpm-cm-thinking').value = 'none';
    getField('cpm-cm-thinking-budget').value = '0';
    getField('cpm-cm-max-output').value = '0';
    getField('cpm-cm-prompt-cache-retention').value = 'none';
    getField('cpm-cm-reasoning').value = 'none';
    getField('cpm-cm-verbosity').value = 'none';
    getField('cpm-cm-effort').value = 'none';
    ['sysfirst', 'mergesys', 'altrole', 'mustuser', 'maxout', 'thought', 'streaming', 'adaptive-thinking'].forEach(id => { getCheckbox(`cpm-cm-${id}`).checked = false; });
    getField('cpm-cm-custom-params').value = '';
}

// ── Read all editor values into a model object ──
/** @param {string} uid */
export function readEditorValues(uid) {
    return normalizeCustomModel({
        uniqueId: uid,
        name: getField('cpm-cm-name').value,
        model: getField('cpm-cm-model').value,
        url: getField('cpm-cm-url').value,
        key: getField('cpm-cm-key').value,
        proxyUrl: getField('cpm-cm-proxy-url').value.trim(),
        proxyDirect: getCheckbox('cpm-cm-proxy-direct').checked,
        format: getField('cpm-cm-format').value,
        tok: getField('cpm-cm-tok').value,
        responsesMode: getField('cpm-cm-responses-mode').value || 'auto',
        thinking: getField('cpm-cm-thinking').value,
        thinkingBudget: parseInt(getField('cpm-cm-thinking-budget').value, 10) || 0,
        maxOutputLimit: parseInt(getField('cpm-cm-max-output').value, 10) || 0,
        promptCacheRetention: getField('cpm-cm-prompt-cache-retention').value || 'none',
        reasoning: getField('cpm-cm-reasoning').value,
        verbosity: getField('cpm-cm-verbosity').value,
        effort: getField('cpm-cm-effort').value,
        sysfirst: getCheckbox('cpm-cm-sysfirst').checked,
        mergesys: getCheckbox('cpm-cm-mergesys').checked,
        altrole: getCheckbox('cpm-cm-altrole').checked,
        mustuser: getCheckbox('cpm-cm-mustuser').checked,
        maxout: getCheckbox('cpm-cm-maxout').checked,
        streaming: getCheckbox('cpm-cm-streaming').checked,
        decoupled: !getCheckbox('cpm-cm-streaming').checked,
        thought: getCheckbox('cpm-cm-thought').checked,
        adaptiveThinking: getCheckbox('cpm-cm-adaptive-thinking').checked,
        customParams: getField('cpm-cm-custom-params').value,
    });
}

// ── Custom Models Manager logic ──
/**
 * @param {any} _setVal
 * @param {any} _openCpmSettings
 */
export function initCustomModelsManager(_setVal, _openCpmSettings) {
    const cmList = getContainer('cpm-cm-list');
    const cmEditor = getContainer('cpm-cm-editor');
    const cmCount = getContainer('cpm-cm-count');

    const refreshCmList = () => {
        if (cmList.contains(cmEditor)) { getContainer('tab-customs').appendChild(cmEditor); cmEditor.classList.add('hidden'); }
        cmCount.innerText = String(state.CUSTOM_MODELS_CACHE.length);
        if (state.CUSTOM_MODELS_CACHE.length === 0) {
            cmList.innerHTML = '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded">No custom models defined.</div>';
            return;
        }
        cmList.innerHTML = state.CUSTOM_MODELS_CACHE.map((/** @type {Record<string, any>} */ m, i) => `
            <div class="bg-gray-800 border border-gray-700 rounded p-4 flex justify-between items-center group hover:border-gray-500 transition-colors">
                <div>
                    <div class="font-bold text-white text-lg">${escHtml(m.name) || 'Unnamed Model'}${((m.key || '').trim().split(/\s+/).filter((/** @type {string} */ k) => k.length > 0).length > 1) ? ' <span class="text-xs text-blue-400 font-normal ml-2">🔄 키회전</span>' : ''}</div>
                    <div class="text-xs text-gray-400 font-mono mt-1">${escHtml(m.model) || 'No model ID'} | ${escHtml(m.url) || 'No URL'}</div>
                </div>
                <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="bg-green-900/50 hover:bg-green-600 text-white px-3 py-1 rounded text-sm cpm-cm-export-btn" data-idx="${i}">📤 Export</button>
                    <button class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm cpm-cm-edit-btn" data-idx="${i}">✏️ Edit</button>
                    <button class="bg-red-900/50 hover:bg-red-600 text-white px-3 py-1 rounded text-sm cpm-cm-del-btn" data-idx="${i}">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

        // Export
        cmList.querySelectorAll('.cpm-cm-export-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const idx = getDatasetIndex(e.target);
            const m = /** @type {Record<string, any>} */ (state.CUSTOM_MODELS_CACHE[idx]);
            if (!m) return;
            const exportModel = serializeCustomModelExport(m);
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModel, null, 2));
            const a = document.createElement('a'); a.href = dataStr;
            a.download = `${(m.name || 'custom_model').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.cpm-model.json`;
            document.body.appendChild(a); a.click(); a.remove();
        }));

        // Delete
        cmList.querySelectorAll('.cpm-cm-del-btn').forEach(btn => btn.addEventListener('click', (e) => {
            if (confirm('Delete this model?')) {
                state.CUSTOM_MODELS_CACHE.splice(getDatasetIndex(e.target), 1);
                _persistCustomModels(JSON.stringify(state.CUSTOM_MODELS_CACHE));
                refreshCmList();
            }
        }));

        // Edit
        cmList.querySelectorAll('.cpm-cm-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const m = state.CUSTOM_MODELS_CACHE[getDatasetIndex(e.target)];
            populateEditor(m);
            getContainer('cpm-cm-editor-title').innerText = 'Edit Custom Model';
            const itemDiv = /** @type {HTMLElement} */ (e.target).closest('.group');
            if (itemDiv) itemDiv.after(cmEditor);
            cmEditor.classList.remove('hidden');
        }));
    };

    // Import model
    getButton('cpm-import-model-btn').addEventListener('click', () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.multiple = true;
        input.onchange = async (e) => {
            const files = getFileInputFiles(e.target);
            let importedCount = 0, errorCount = 0;
            for (const file of files) {
                try {
                    const data = JSON.parse(await file.text());
                    if (!data._cpmModelExport || !data.name) { errorCount++; continue; }
                    const normalized = normalizeCustomModel(data, { includeKey: true, includeUniqueId: false, includeTag: false });
                    normalized.uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    state.CUSTOM_MODELS_CACHE.push(normalized); importedCount++;
                } catch { errorCount++; }
            }
            if (importedCount > 0) {
                _persistCustomModels(JSON.stringify(state.CUSTOM_MODELS_CACHE));
                refreshCmList();
            }
            alert(`${importedCount}개 모델 가져오기 완료` + (errorCount > 0 ? ` (${errorCount}개 실패)` : ''));
        };
        input.click();
    });

    // Add new model
    getButton('cpm-add-custom-btn').addEventListener('click', () => {
        clearEditor();
        getField('cpm-cm-id').value = 'custom_' + Date.now();
        getContainer('cpm-cm-editor-title').innerText = 'Add New Model';
        cmList.prepend(cmEditor);
        cmEditor.classList.remove('hidden');
    });

    getButton('cpm-cm-cancel').addEventListener('click', () => {
        getContainer('tab-customs').appendChild(cmEditor);
        cmEditor.classList.add('hidden');
    });

    getButton('cpm-cm-save').addEventListener('click', () => {
        const uid = getField('cpm-cm-id').value;
        const newModel = readEditorValues(uid);
        const existingIdx = state.CUSTOM_MODELS_CACHE.findIndex((/** @type {Record<string, any>} */ x) => x.uniqueId === uid);
        if (existingIdx !== -1) state.CUSTOM_MODELS_CACHE[existingIdx] = { ...state.CUSTOM_MODELS_CACHE[existingIdx], ...newModel };
        else state.CUSTOM_MODELS_CACHE.push(newModel);

        const json = JSON.stringify(state.CUSTOM_MODELS_CACHE);

        // Diagnostic: confirm what proxyUrl was saved
        const savedEntry = /** @type {Record<string, any>|undefined} */ (state.CUSTOM_MODELS_CACHE.find((/** @type {Record<string, any>} */ x) => x.uniqueId === uid));
        console.log(`[CPM Save] uid=${uid} proxyUrl="${savedEntry?.proxyUrl || ''}" cacheLen=${state.CUSTOM_MODELS_CACHE.length}`);

        // Persist — chained with verification, errors logged
        _persistCustomModels(json, savedEntry);

        refreshCmList();
        cmEditor.classList.add('hidden');
    });

    refreshCmList();
}
