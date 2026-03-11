/**
 * settings-ui.js — Cupcake PM settings panel (core orchestrator).
 * Renders the full-screen settings interface with Tailwind CSS.
 *
 * Sub-modules (extracted for modularity):
 *   settings-ui-custom-models.js — Custom model editor + CRUD
 *   settings-ui-plugins.js       — Sub-plugins tab renderer + update check
 *   settings-ui-panels.js        — API View panel + Export/Import
 */
import {
    Risu, CPM_VERSION, state, safeGetArg, safeGetBoolArg,
    registeredProviderTabs,
} from './shared-state.js';
import { SettingsBackup } from './settings-backup.js';
import { SubPluginManager } from './sub-plugin-manager.js';
import { checkStreamCapability } from './stream-utils.js';
import { escHtml } from './helpers.js';
import { renderCustomModelEditor, initCustomModelsManager } from './settings-ui-custom-models.js';
import { buildPluginsTabRenderer } from './settings-ui-plugins.js';
import { initApiViewPanel, initExportImport } from './settings-ui-panels.js';

/** @type {Promise<HTMLScriptElement | null> | null} */
let _tailwindLoadPromise = null;

export function ensureTailwindLoaded(timeoutMs = 5000) {
    const existing = /** @type {HTMLScriptElement | null} */ (document.getElementById('cpm-tailwind'));
    if (existing) {
        return _tailwindLoadPromise || Promise.resolve(existing);
    }

    _tailwindLoadPromise = new Promise((resolve) => {
        const tw = document.createElement('script');
        let settled = false;
        let timeoutId = 0;

        const finish = (status) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            tw.dataset.cpmLoaded = status;
            tw.onload = null;
            tw.onerror = null;
            if (status !== 'loaded') {
                console.warn(`[CPM UI] Tailwind CDN load ${status}; continuing with base styles only.`);
            }
            _tailwindLoadPromise = Promise.resolve(tw);
            resolve(tw);
        };

        tw.id = 'cpm-tailwind';
        tw.src = 'https://cdn.tailwindcss.com';
        tw.async = true;
        tw.dataset.cpmLoaded = 'pending';
        tw.onload = () => finish('loaded');
        tw.onerror = () => finish('failed');
        document.head.appendChild(tw);
        timeoutId = window.setTimeout(() => finish('timed out'), timeoutMs);
    });

    return _tailwindLoadPromise;
}

export function shouldPersistControl(el) {
    const id = el?.id || '';
    if (!id) return false;
    if (id.startsWith('cpm-cm-')) return false;
    if (id.startsWith('cpm-api-view-')) return false;
    if (id === 'cpm-file-plugin') return false;
    return true;
}

export function bindSettingsPersistenceHandlers(root, setVal) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof setVal !== 'function') return;

    root.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach(el => {
        if (!shouldPersistControl(el)) return;
        el.addEventListener('change', (e) => setVal(e.target.id, e.target.value));
    });

    root.querySelectorAll('input[type="checkbox"]').forEach(el => {
        if (!shouldPersistControl(el)) return;
        el.addEventListener('change', (e) => setVal(e.target.id, e.target.checked));
    });
}

export async function openCpmSettings() {
    Risu.showContainer('fullscreen');

    // Tailwind CSS
    await ensureTailwindLoaded();

    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0; background:#1e1e24; color:#d1d5db; font-family:-apple-system, sans-serif; height:100vh; overflow:hidden;';

    const getVal = async (k) => await safeGetArg(k);
    const getBoolVal = async (k) => await safeGetBoolArg(k);
    const setVal = (k, v) => {
        Risu.setArgument(k, String(v));
        SettingsBackup.updateKey(k, String(v));
    };

    const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const renderInput = async (id, label, type = 'text', opts = []) => {
        let html = `<div class="mb-4">`;
        if (type === 'checkbox') {
            const val = await getBoolVal(id);
            html += `<label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                           <input id="${id}" type="checkbox" ${val ? 'checked' : ''} class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                           <span>${label}</span>
                         </label></div>`;
        } else if (type === 'select') {
            const val = await getVal(id);
            html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
            html += `<select id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">`;
            opts.forEach(o => html += `<option value="${escAttr(o.value)}" ${val === o.value ? 'selected' : ''}>${escAttr(o.text)}</option>`);
            html += `</select></div>`;
        } else if (type === 'textarea') {
            const val = await getVal(id);
            html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
            html += `<textarea id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 h-24" spellcheck="false">${escAttr(val)}</textarea></div>`;
        } else if (type === 'password') {
            const val = await getVal(id);
            html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
            html += `<div class="relative">`;
            html += `<input id="${id}" type="password" value="${escAttr(val)}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 pr-10 text-white focus:outline-none focus:border-blue-500">`;
            html += `<button type="button" class="cpm-pw-toggle absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none text-lg px-1" data-target-id="${id}" title="비밀번호 보기/숨기기">👁️</button>`;
            html += `</div></div>`;
        } else {
            const val = await getVal(id);
            html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
            html += `<input id="${id}" type="${type}" value="${escAttr(val)}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"></div>`;
        }
        return html;
    };

    const container = document.createElement('div');
    container.className = 'flex flex-col md:flex-row h-full';

    const sidebar = document.createElement('div');
    sidebar.className = 'w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col pt-2 shrink-0 z-50 relative';
    sidebar.innerHTML = `
        <div class="h-14 flex items-center justify-between px-6 border-b border-gray-700 md:border-none cursor-pointer md:cursor-default" id="cpm-mobile-menu-btn">
            <h2 class="text-lg font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">🧁 Cupcake PM v${CPM_VERSION}</h2>
            <span class="md:hidden text-gray-400 text-xl" id="cpm-mobile-icon">▼</span>
        </div>
        <div class="hidden md:flex items-center gap-3 px-5 py-1.5 border-b border-gray-700/50">
            <span class="text-[10px] text-gray-500">⌨️ <kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Shift</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Alt</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">P</kbd></span>
            <span class="text-[10px] text-gray-600">|</span>
            <span class="text-[10px] text-gray-500">📱 4손가락 터치</span>
        </div>
        <div id="cpm-mobile-dropdown" class="hidden md:flex flex-col absolute md:static top-full left-0 w-full md:w-auto bg-gray-900 border-b border-gray-700 md:border-none shadow-xl md:shadow-none z-[100] h-auto max-h-[70vh] md:max-h-none md:h-full overflow-hidden flex-1">
            <div class="flex-1 overflow-y-auto py-2 pr-2" id="cpm-tab-list">
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-2">Common</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-cyan-300 font-semibold" data-target="tab-global">🎛️ 글로벌 기본값</button>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Aux Slots (Map Mode)</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-trans">🌐 번역 (Trans)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-emo">😊 감정 판독 (Emotion)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-mem">🧠 하이파 (Mem)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-other">⚙️ 트리거/루아 (Other)</button>
            <div id="cpm-provider-tabs-section"></div>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Custom Providers</div>
            <button class="w-full text-left px-5 py-2 text-sm flex items-center justify-between hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-customs">
                <span>🛠️ Custom Models Manager</span>
                <span class="bg-blue-600 text-xs px-2 py-0.5 rounded-full" id="cpm-cm-count">0</span>
            </button>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Extensions</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-yellow-300 font-bold bg-yellow-900/10" data-target="tab-plugins">🧩 Sub-Plugins${SubPluginManager._pendingUpdateNames.length > 0 ? ` <span style="background:#4f46e5;color:#e0e7ff;font-size:10px;padding:1px 6px;border-radius:9px;margin-left:4px;font-weight:bold;">${SubPluginManager._pendingUpdateNames.length}</span>` : ''}</button>
            </div>
            <div class="p-4 border-t border-gray-800 space-y-2 shrink-0 bg-gray-900 z-10 relative" id="cpm-tab-footer">
                <button id="cpm-export-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬇️ 설정 내보내기</button>
                <button id="cpm-import-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬆️ 설정 불러오기</button>
                <button id="cpm-close-btn" class="w-full bg-red-600/90 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow-[0_0_10px_rgba(239,68,68,0.5)]">✕ Close Settings</button>
            </div>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'flex-1 bg-[#121214] overflow-y-auto p-5 md:p-10';

    const providersList = [{ value: '', text: '🚫 미지정 (Main UI의 모델이 처리)' }];
    for (const m of state.ALL_DEFINED_MODELS) providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });

    const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'xhigh', text: 'XHigh (매우 높음)' }];
    const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
    const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];
    const effortList = [{ value: 'none', text: '사용 안함 (Off)' }, { value: 'unspecified', text: '미지정 (Unspecified)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'max', text: 'Max (최대)' }];

    const renderAuxParams = async (slot) => `
        <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
            <h4 class="text-xl font-bold text-gray-300 mb-2">Generation Parameters (생성 설정)</h4>
            <p class="text-xs text-blue-400 font-semibold mb-4 border-l-2 border-blue-500 pl-2">
                여기 값을 입력하면 리스AI 설정(파라미터 분리 포함) 대신 이 값이 우선 적용됩니다.<br/>
                비워두면 CPM은 그 항목을 건드리지 않고, 리스AI가 보낸 값을 그대로 사용합니다.<br/>
                <span class="text-gray-500">(CPM slot override &gt; RisuAI separate params &gt; RisuAI main params)</span>
            </p>
            ${await renderInput(`cpm_slot_${slot}_max_context`, 'Max Context Tokens (최대 컨텍스트)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_max_out`, 'Max Output Tokens (최대 응답 크기)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_temp`, 'Temperature (온도)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_top_p`, 'Top P (오답 컷팅)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_top_k`, 'Top K (오답 컷팅)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_rep_pen`, 'Repetition Penalty (반복 페널티)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_freq_pen`, 'Frequency Penalty (빈도 페널티)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_pres_pen`, 'Presence Penalty (존재 페널티)', 'number')}
        </div>
    `;

    const slotCollisionWarning = `
        <div class="bg-amber-900/30 border border-amber-600/50 rounded-lg p-3 mt-3 mb-4">
            <p class="text-xs text-amber-300 font-semibold mb-1">⚠️ 동일 모델 할당 시 주의사항</p>
            <p class="text-xs text-amber-200/80">
                이 슬롯에 할당한 모델이 <strong>메인 채팅 모델과 동일한 경우</strong>, CPM은 요청 내용(프롬프트)을 분석하여 보조 태스크인지 판별합니다.<br/>
                <span class="text-amber-400">→ 구분이 명확하면</span>: 아래 설정한 파라미터가 적용됩니다.<br/>
                <span class="text-amber-400">→ 구분이 불확실하면</span>: <strong>리스AI에서 보내는 값이 그대로 사용</strong>됩니다 (CPM 오버라이드 비적용).<br/>
                <span class="text-gray-500 text-[10px]">💡 다른 모델을 할당하면 이 제한 없이 항상 CPM 파라미터가 적용됩니다.</span>
            </p>
        </div>
    `;

    // ── Build tab content HTML ──
    content.innerHTML = `
        <div id="tab-trans" class="cpm-tab-content">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">번역 백그라운드 설정 (Translation)</h3>
            <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">메인 UI에서 선택한 [메인 챗] 프로바이더와 다르게, 번역 태스크만 자동으로 납치하여 전담할 프로바이더를 선택합니다.</p>
            ${await renderInput('cpm_slot_translation', '번역 전담 모델 선택 (Translation Model)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('translation')}
        </div>
        <div id="tab-emo" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">감정 판독 백그라운드 설정 (Emotion)</h3>
            <p class="text-pink-300 font-semibold mb-6 border-l-4 border-pink-500 pl-4 py-1">캐릭터 리액션/표정 태스크를 낚아채서 처리할 작고 빠른 모델을 지정하세요.</p>
            ${await renderInput('cpm_slot_emotion', '감정 판독 전담 모델 (Emotion/Hypa)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('emotion')}
        </div>
        <div id="tab-mem" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">하이파 백그라운드 설정 (Memory)</h3>
            <p class="text-yellow-300 font-semibold mb-6 border-l-4 border-yellow-500 pl-4 py-1">채팅 메모리 요약 등 긴 텍스트 축약 역할을 전담할 모델을 지정하세요.</p>
            ${await renderInput('cpm_slot_memory', '하이파 전담 모델 (Memory/Summarize)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('memory')}
        </div>
        <div id="tab-global" class="cpm-tab-content">
            <h3 class="text-3xl font-bold text-cyan-400 mb-6 pb-3 border-b border-gray-700">🎛️ 글로벌 기본값 (Global Fallback Parameters)</h3>
            <p class="text-cyan-300 font-semibold mb-4 border-l-4 border-cyan-500 pl-4 py-1">리스AI가 특정 파라미터를 보내지 않았을 때만, 여기 입력한 값이 보조 기본값으로 사용됩니다.</p>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
                <h4 class="text-sm font-bold text-gray-300 mb-3">📋 파라미터 우선순위 (높은 순서)</h4>
                <div class="text-xs text-gray-400 space-y-1">
                    <div class="flex items-center"><span class="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">1</span> CPM 슬롯 오버라이드</div>
                    <div class="flex items-center"><span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">2</span> 리스AI 파라미터 분리 값</div>
                    <div class="flex items-center"><span class="bg-green-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">3</span> 리스AI 메인 모델 파라미터</div>
                    <div class="flex items-center"><span class="bg-cyan-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">4</span> <strong class="text-cyan-300">⭐ 여기: CPM 글로벌 기본값</strong></div>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-6">💡 <strong>중요:</strong> 여기를 비워두면 CPM은 그 항목을 추가하지 않습니다. 즉, 값이 없으면 없는 그대로 전송됩니다.</p>
            <div class="space-y-2">
                ${await renderInput('cpm_fallback_temp', 'Default Temperature (기본 온도, 비워두면 미전송)', 'number')}
                ${await renderInput('cpm_fallback_max_tokens', 'Default Max Output Tokens (비워두면 미전송)', 'number')}
                ${await renderInput('cpm_fallback_top_p', 'Default Top P (기본 Top P, 비워두면 API 기본값)', 'number')}
                ${await renderInput('cpm_fallback_freq_pen', 'Default Frequency Penalty (기본 빈도 페널티, 비워두면 API 기본값)', 'number')}
                ${await renderInput('cpm_fallback_pres_pen', 'Default Presence Penalty (기본 존재 페널티, 비워두면 API 기본값)', 'number')}
            </div>
            <div class="mt-10 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-emerald-400 mb-4">🔄 스트리밍 설정 (Streaming)</h4>
                <div class="bg-gray-800/70 border border-emerald-900/50 rounded-lg p-4 mb-6">
                    <p class="text-xs text-emerald-300 mb-2 font-semibold">📡 실시간 스트리밍 지원</p>
                    <p class="text-xs text-gray-400 mb-2">활성화하면 API 응답을 ReadableStream으로 RisuAI에 직접 전달하여, RisuAI가 실시간으로 텍스트를 표시할 수 있습니다.</p>
                    <p class="text-xs text-yellow-500">⚠️ 최신 RisuAI-main은 ReadableStream transferables를 지원하지만, 구버전 호스트에서는 자동으로 비활성화될 수 있습니다.</p>
                    <div id="cpm-stream-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">Bridge 상태: 확인 중...</div>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_streaming_enabled', '스트리밍 패스스루 활성화 (Enable Streaming Pass-Through)', 'checkbox')}
                    ${await renderInput('cpm_streaming_show_thinking', 'Anthropic Thinking 토큰 표시 (Show Thinking in Stream)', 'checkbox')}
                </div>
            </div>
            <div class="mt-10 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-purple-400 mb-4">📊 토큰 사용량 표시 (Token Usage Display)</h4>
                <div class="bg-gray-800/70 border border-purple-900/50 rounded-lg p-4 mb-6">
                    <p class="text-xs text-purple-300 mb-2 font-semibold">📊 실시간 토큰 사용량 알림</p>
                    <p class="text-xs text-gray-400 mb-2">활성화하면 API 응답이 올 때마다 화면 우측 상단에 토큰 사용량을 표시합니다.</p>
                    <p class="text-xs text-gray-500">💡 OpenAI, Anthropic, Gemini, Vertex, AWS 등 모든 프로바이더에서 동작합니다.</p>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_show_token_usage', '토큰 사용량 표시 (Show Token Usage Toast)', 'checkbox')}
                </div>
            </div>
        </div>
        <div id="tab-other" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">트리거/루아 백그라운드 설정 (Other)</h3>
            ${await renderInput('cpm_slot_other', 'Lua 스크립트 등 무거운 유틸 전담 모델 (Other/Trigger)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('other')}
        </div>
        <div id="cpm-dynamic-provider-content"></div>
        <div id="tab-customs" class="cpm-tab-content hidden">
            <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                <h3 class="text-3xl font-bold text-gray-400">Custom Models Manager</h3>
                <div class="flex space-x-2">
                    <button id="cpm-api-view-btn" class="bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📡 API 보기</button>
                    <button id="cpm-import-model-btn" class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📥 Import Model</button>
                    <button id="cpm-add-custom-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">➕ Add Model</button>
                </div>
            </div>
            <div id="cpm-api-view-panel" class="hidden mb-6 bg-gray-900 border border-purple-700/50 rounded-lg p-5">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-lg font-bold text-purple-400">📡 API 요청 로그</h4>
                    <div class="flex items-center gap-3">
                        <select id="cpm-api-view-selector" class="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 max-w-xs"></select>
                        <button id="cpm-api-view-close" class="text-gray-400 hover:text-white text-lg px-2">✕</button>
                    </div>
                </div>
                <div id="cpm-api-view-content" class="text-sm text-gray-300">
                    <div class="text-center text-gray-500 py-4">아직 API 요청을 보낸 적이 없습니다.</div>
                </div>
            </div>
            <div id="cpm-cm-list" class="space-y-3"></div>
            ${renderCustomModelEditor(thinkingList, reasoningList, verbosityList, effortList)}
            <p class="text-xs font-bold text-gray-500 mt-4">* Additions/deletions require refreshing RisuAI (F5) to appear in the native dropdown menu.</p>
        </div>
        <div id="tab-plugins" class="cpm-tab-content hidden">
            <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                <h3 class="text-3xl font-bold text-gray-400">Sub-Plugins Manager</h3>
                <button id="cpm-check-updates-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">🔄 서브 플러그인 업데이트 확인</button>
            </div>
            ${SubPluginManager._pendingUpdateNames.length > 0
                ? `<div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-3 mb-4 flex items-center gap-2"><span class="text-indigo-300 text-sm font-semibold">🔔 ${SubPluginManager._pendingUpdateNames.length}개의 서브 플러그인 업데이트가 감지되었습니다.</span></div>`
                : ''}
            <p class="text-yellow-300 font-semibold mb-4 border-l-4 border-yellow-500 pl-4 py-1">Cupcake PM에 연동된 외부 확장 기능(Sub-Plugins)들을 통합 관리합니다.</p>
            <div id="cpm-update-status" class="hidden mb-4"></div>
            <div id="cpm-plugins-list" class="space-y-4"></div>
        </div>
    `;

    // ── Sub-plugins UI renderer ──
    const renderPluginsTab = buildPluginsTabRenderer(setVal);

    container.appendChild(sidebar);
    container.appendChild(content);
    document.body.appendChild(container);

    // ── Dynamic provider tabs ──
    const providerTabsSection = document.getElementById('cpm-provider-tabs-section');
    const dynamicContentContainer = document.getElementById('cpm-dynamic-provider-content');
    if (registeredProviderTabs.length > 0 && providerTabsSection) {
        let sidebarBtnsHtml = `<div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Providers</div>`;
        let contentHtml = '';
        for (const tab of registeredProviderTabs) {
            sidebarBtnsHtml += `<button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="${tab.id}">${tab.icon} ${tab.label}</button>`;
            try {
                const tabContent = await tab.renderContent(renderInput, { reasoningList, verbosityList, thinkingList });
                contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden">${tabContent}</div>`;
            } catch (err) {
                console.error(`[CupcakePM] Failed to render settings tab: ${tab.id}`, err);
                contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden"><p class="text-red-400">Error rendering tab: ${err.message}</p></div>`;
            }
        }
        providerTabsSection.innerHTML = sidebarBtnsHtml;
        if (dynamicContentContainer) dynamicContentContainer.innerHTML = contentHtml;
    }

    renderPluginsTab();

    // ── Mobile menu toggle ──
    const mobileMenuBtn = document.getElementById('cpm-mobile-menu-btn');
    const mobileDropdown = document.getElementById('cpm-mobile-dropdown');
    const mobileIcon = document.getElementById('cpm-mobile-icon');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const isHidden = mobileDropdown.classList.contains('hidden');
            if (isHidden) { mobileDropdown.classList.remove('hidden'); mobileDropdown.classList.add('flex'); mobileIcon.innerText = '▲'; }
            else { mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); mobileIcon.innerText = '▼'; }
        });
    }

    // ── Bind all input change events ──
    bindSettingsPersistenceHandlers(content, setVal);
    content.querySelectorAll('.cpm-pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!(btn instanceof HTMLButtonElement)) return;
            const targetId = btn.dataset.targetId;
            if (!targetId) return;
            /** @type {HTMLInputElement | null} */
            const input = /** @type {HTMLInputElement | null} */ (document.getElementById(targetId));
            if (!input) return;
            if (input.type === 'password') { input.type = 'text'; btn.textContent = '🔒'; }
            else { input.type = 'password'; btn.textContent = '👁️'; }
        });
    });

    // ── Tab switching ──
    const tabs = sidebar.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.addEventListener('click', () => {
        if (!(t instanceof HTMLElement)) return;
        tabs.forEach(x => { x.classList.remove('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400'); });
        t.classList.add('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400');
        content.querySelectorAll('.cpm-tab-content').forEach(p => p.classList.add('hidden'));
        const targetId = t.dataset.target;
        if (!targetId) return;
        document.getElementById(targetId)?.classList.remove('hidden');
        if (targetId === 'tab-plugins') renderPluginsTab();
        if (window.innerWidth < 768 && mobileDropdown && !mobileDropdown.classList.contains('hidden')) {
            mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); mobileIcon.innerText = '▼';
        }
    }));
    if (tabs[0] instanceof HTMLElement) tabs[0].click();

    // ── Stream capability check ──
    (async () => {
        const statusEl = document.getElementById('cpm-stream-status');
        if (!statusEl) return;
        try {
            const capable = await checkStreamCapability();
            statusEl.innerHTML = capable
                ? '<span class="text-emerald-400">✓ Bridge 지원됨</span> — ReadableStream 전송 가능.'
                : '<span class="text-yellow-400">✗ Bridge 미지원</span> — 자동으로 문자열 수집 모드로 폴백됩니다.';
            statusEl.classList.replace('border-gray-600', capable ? 'border-emerald-700' : 'border-yellow-800');
        } catch (e) { statusEl.innerHTML = `<span class="text-red-400">Bridge 확인 실패:</span> ${escHtml(e.message)}`; }
    })();

    // ── Custom Models Manager ──
    initCustomModelsManager(setVal, openCpmSettings);

    // ── API View ──
    initApiViewPanel();

    // ── Snapshot settings ──
    await SettingsBackup.snapshotAll();

    // ── Export/Import ──
    initExportImport(setVal, openCpmSettings);

    // ── Close button ──
    document.getElementById('cpm-close-btn').addEventListener('click', () => {
        document.body.innerHTML = '';
        Risu.hideContainer();
    });
}
