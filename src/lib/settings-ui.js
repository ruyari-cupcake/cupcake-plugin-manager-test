// @ts-check
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
import { _resetCompatibilityCache } from './smart-fetch.js';
import { clearCopilotTokenCache } from './copilot-token.js';
import { COPILOT_CHAT_VERSION, VSCODE_VERSION, setCopilotVersionOverrides } from './copilot-headers.js';
import { escHtml } from './helpers.js';
import { renderCustomModelEditor, initCustomModelsManager } from './settings-ui-custom-models.js';
import { buildPluginsTabRenderer } from './settings-ui-plugins.js';
import { initApiViewPanel, initExportImport } from './settings-ui-panels.js';
import { TAILWIND_CSS } from './tailwind-css.generated.js';

/** @type {boolean} */
let _tailwindInjected = false;

/**
 * Injects the pre-built Tailwind CSS into the document as a <style> tag.
 * Replaces the previous CDN-based approach for offline reliability.
 * @returns {Promise<HTMLStyleElement | null>}
 */
export function ensureTailwindLoaded() {
    const existing = /** @type {HTMLStyleElement | null} */ (document.getElementById('cpm-tailwind'));
    if (existing) return Promise.resolve(existing);

    const style = document.createElement('style');
    style.id = 'cpm-tailwind';
    style.textContent = TAILWIND_CSS;
    document.head.appendChild(style);
    _tailwindInjected = true;
    return Promise.resolve(style);
}

export function shouldPersistControl(/** @type {any} */ el) {
    const id = el?.id || '';
    if (!id) return false;
    if (id.startsWith('cpm-cm-')) return false;
    if (id.startsWith('cpm-api-view-')) return false;
    if (id === 'cpm-file-plugin') return false;
    return true;
}

export function bindSettingsPersistenceHandlers(/** @type {any} */ root, /** @type {any} */ setVal) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof setVal !== 'function') return;

    root.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach((/** @type {any} */ el) => {
        if (!shouldPersistControl(el)) return;
        el.addEventListener('change', (/** @type {any} */ e) => {
            Promise.resolve(setVal(e.target.id, e.target.value)).catch(err => {
                console.error('[CupcakePM] Failed to persist setting:', e.target?.id, err);
            });
        });
    });

    root.querySelectorAll('input[type="checkbox"]').forEach((/** @type {any} */ el) => {
        if (!shouldPersistControl(el)) return;
        el.addEventListener('change', (/** @type {any} */ e) => {
            Promise.resolve(setVal(e.target.id, e.target.checked)).catch(err => {
                console.error('[CupcakePM] Failed to persist checkbox setting:', e.target?.id, err);
            });
        });
    });
}

export async function openCpmSettings() {
    Risu.showContainer('fullscreen');

    // Tailwind CSS (build-time inlined)
    ensureTailwindLoaded();

    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0; background:#1e1e24; color:#d1d5db; font-family:-apple-system, sans-serif; height:100vh; overflow:hidden;';

    const _spmAny = /** @type {any} */ (SubPluginManager);

    const getVal = async (/** @type {string} */ k) => await safeGetArg(k);
    const getBoolVal = async (/** @type {string} */ k) => await safeGetBoolArg(k);
    const setVal = async (/** @type {string} */ k, /** @type {any} */ v) => {
        await Risu.setArgument(k, String(v));
        SettingsBackup.updateKey(k, String(v));
        // Invalidate smart-fetch compatibility cache when relevant settings change
        if (k === 'cpm_compatibility_mode' || k === 'cpm_streaming_enabled' || k === 'cpm_copilot_nodeless_mode') {
            _resetCompatibilityCache();
            if (k === 'cpm_copilot_nodeless_mode') clearCopilotTokenCache();
            queueMicrotask(() => {
                Promise.resolve(refreshStatusIndicators()).catch(err => {
                    console.error('[CupcakePM] Failed to refresh status indicators:', err);
                });
            });
        }
        // Apply Copilot emulation version overrides live
        if (k === 'cpm_copilot_vscode_version' || k === 'cpm_copilot_chat_version') {
            const chatVer = await safeGetArg('cpm_copilot_chat_version', '');
            const codeVer = await safeGetArg('cpm_copilot_vscode_version', '');
            setCopilotVersionOverrides({ chatVersion: chatVer, vscodeVersion: codeVer });
            clearCopilotTokenCache();
        }
    };

    async function refreshStatusIndicators() {
        const statusEl = document.getElementById('cpm-stream-status');
        const compatStatusEl = document.getElementById('cpm-compat-status');

        try {
            const capable = await checkStreamCapability();
            if (statusEl) {
                statusEl.innerHTML = capable
                    ? '<span class="text-emerald-400">✓ Bridge 지원됨</span> — ReadableStream 전송 가능.'
                    : '<span class="text-yellow-400">✗ Bridge 미지원</span> — 자동으로 문자열 수집 모드로 폴백됩니다.';
                statusEl.classList.remove('border-gray-600', 'border-emerald-700', 'border-yellow-800');
                statusEl.classList.add(capable ? 'border-emerald-700' : 'border-yellow-800');
            }

            if (compatStatusEl) {
                const manualEnabled = await safeGetBoolArg('cpm_compatibility_mode', false);
                const nodelessMode = await safeGetArg('cpm_copilot_nodeless_mode', 'off');
                compatStatusEl.classList.remove('border-gray-600', 'border-emerald-700', 'border-amber-700');
                if (manualEnabled) {
                    compatStatusEl.innerHTML = `<span class="text-amber-400">⚡ 수동 활성화됨</span> — nativeFetch 건너뛰기 + 스트리밍 자동 비활성화.${nodelessMode !== 'off' ? ` <span class="text-cyan-300">Node-less 실험 모드: ${escHtml(nodelessMode)}</span>` : ''}`;
                    compatStatusEl.classList.add('border-amber-700');
                } else if (!capable) {
                    compatStatusEl.innerHTML = `<span class="text-yellow-400">⚠ Bridge 미지원</span> — ReadableStream 전달이 불가능한 환경입니다. 문제가 있으면 호환성 모드를 수동으로 켜주세요.${nodelessMode !== 'off' ? ` <span class="text-cyan-300">Node-less 실험 모드: ${escHtml(nodelessMode)}</span>` : ''}`;
                    compatStatusEl.classList.add('border-amber-700');
                } else {
                    compatStatusEl.innerHTML = nodelessMode === 'off'
                        ? '<span class="text-emerald-400">✓ 비활성</span> — Bridge 정상. 호환성 모드가 필요하지 않습니다.'
                        : `<span class="text-cyan-300">🧪 Node-less 실험 모드</span> — iPhone용 호환성은 꺼져 있지만 Copilot 헤더 전략은 ${escHtml(nodelessMode)} 로 동작합니다.`;
                    compatStatusEl.classList.add('border-emerald-700');
                }
            }
        } catch (e) {
            if (statusEl) statusEl.innerHTML = `<span class="text-red-400">Bridge 확인 실패:</span> ${escHtml(/** @type {Error} */ (e).message)}`;
            if (compatStatusEl) compatStatusEl.innerHTML = `<span class="text-red-400">확인 실패:</span> ${escHtml(/** @type {Error} */ (e).message)}`;
        }
    }

    const escAttr = (/** @type {any} */ s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const renderInput = async (/** @type {string} */ id, /** @type {string} */ label, type = 'text', /** @type {any[]} */ opts = []) => {
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
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-tools">🔧 도구 사용 (Tool Use)</button>
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
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-yellow-300 font-bold bg-yellow-900/10" data-target="tab-plugins">🧩 Sub-Plugins${_spmAny._pendingUpdateNames.length > 0 ? ` <span style="background:#4f46e5;color:#e0e7ff;font-size:10px;padding:1px 6px;border-radius:9px;margin-left:4px;font-weight:bold;">${_spmAny._pendingUpdateNames.length}</span>` : ''}</button>
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
    for (const m of /** @type {any[]} */ (state.ALL_DEFINED_MODELS)) providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });

    const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'xhigh', text: 'XHigh (매우 높음)' }];
    const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
    const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];
    const effortList = [{ value: 'none', text: '사용 안함 (Off)' }, { value: 'unspecified', text: '미지정 (Unspecified)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'max', text: 'Max (최대)' }];

    const renderAuxParams = async (/** @type {string} */ slot) => `
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
        <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
            <h4 class="text-xl font-bold text-gray-300 mb-2">Thinking / Reasoning Settings (생각·추론 설정)</h4>
            <p class="text-xs text-blue-400 font-semibold mb-4 border-l-2 border-blue-500 pl-2">
                프로바이더별 생각/추론 설정입니다. 비워두면(None/Off) CPM이 건드리지 않습니다.<br/>
                Gemini = Thinking Level/Budget, OpenAI = Reasoning/Verbosity, Anthropic = Effort/Adaptive<br/>
                <span class="text-gray-500">(CPM slot override &gt; Custom model default &gt; RisuAI params)</span>
            </p>
            ${await renderInput(`cpm_slot_${slot}_thinking`, 'Thinking Level (Gemini 생각 수준)', 'select', thinkingList)}
            ${await renderInput(`cpm_slot_${slot}_thinking_budget`, 'Thinking Budget Tokens (Gemini 2.5 생각 토큰, 0=끄기)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_reasoning`, 'Reasoning Effort (OpenAI o1/o3)', 'select', reasoningList)}
            ${await renderInput(`cpm_slot_${slot}_verbosity`, 'Response Verbosity (OpenAI)', 'select', verbosityList)}
            ${await renderInput(`cpm_slot_${slot}_effort`, 'Anthropic Effort (적응형 추론)', 'select', effortList)}
            ${await renderInput(`cpm_slot_${slot}_adaptive_thinking`, 'Adaptive Thinking (Anthropic 적응형 추론)', 'checkbox')}
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

            <div class="mt-8 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-orange-400 mb-4">🔗 HypaV3 임베딩 프록시</h4>
                <div class="bg-gray-800/70 border border-orange-900/50 rounded-lg p-4 mb-4">
                    <p class="text-xs text-orange-300 mb-3 font-semibold">⚡ Nodeless 환경에서 HypaV3 임베딩 사용하기</p>
                    <p class="text-xs text-gray-400 mb-3">Nodeless(도커/셀프호스트) 환경에서는 HypaV3의 custom 임베딩이 CORS/프록시 인증 문제로 실패합니다. 아래 두 방법 중 하나를 쓰면 해결됩니다.</p>

                    <div class="bg-gray-900 rounded p-3 mb-3">
                        <p class="text-xs font-bold text-green-400 mb-2">🖥️ 방법 1: 로컬 프록시 (copilot-proxy.exe)</p>
                        <ol class="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
                            <li>copilot-proxy.exe 실행</li>
                            <li>하이파V3:
                                <div class="mt-1 space-y-0.5">
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">모델:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">custom</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Custom Server URL:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">http://localhost:18976/v1</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">API Key:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인의 임베딩 API 키)</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Model:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인이 쓰는 모델명)</code></div>
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div class="bg-gray-900 rounded p-3 mb-3">
                        <p class="text-xs font-bold text-blue-400 mb-2">☁️ 방법 2: Cloudflare Worker (인터넷 배포)</p>
                        <p class="text-[10px] text-gray-400 mb-2">로컬 exe 없이 인터넷에서 돌리고 싶으면 클플 워커로 배포 가능. 클플_프록시.md 참고.</p>
                        <ol class="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
                            <li>Cloudflare Workers에 코드 복붙 → Deploy</li>
                            <li>하이파V3:
                                <div class="mt-1 space-y-0.5">
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">모델:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">custom</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Custom Server URL:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">https://내워커.workers.dev/v1</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">API Key:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인의 임베딩 API 키)</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Model:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인이 쓰는 모델명)</code></div>
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div class="bg-gray-900/50 rounded p-2 mb-2">
                        <p class="text-[10px] text-gray-500 mb-1">두 방법 모두 모델명 자동 감지 지원:</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                            <div><code class="text-cyan-400">voyage-*</code> <span class="text-gray-600">→ Voyage AI</span></div>
                            <div><code class="text-cyan-400">text-embedding-*</code> <span class="text-gray-600">→ OpenAI</span></div>
                            <div><code class="text-cyan-400">embed-*</code> <span class="text-gray-600">→ Cohere</span></div>
                            <div><code class="text-cyan-400">jina-*</code> <span class="text-gray-600">→ Jina</span></div>
                            <div><code class="text-cyan-400">mistral-*</code> <span class="text-gray-600">→ Mistral</span></div>
                        </div>
                    </div>
                </div>
            </div>
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
                <div class="mt-6 pt-4 border-t border-gray-700/50">
                    <h5 class="text-sm font-bold text-amber-400 mb-3">📱 iPhone/Safari 호환성 모드 (Compatibility Mode)</h5>
                    <div class="bg-gray-800/70 border border-amber-900/50 rounded-lg p-4 mb-4">
                        <p class="text-xs text-amber-300 mb-2 font-semibold">🔧 호환성 모드란?</p>
                        <p class="text-xs text-gray-400 mb-2">iPhone/Safari 등 ReadableStream 전달이 불안정한 환경에서 nativeFetch를 건너뛰고 risuFetch만 사용합니다.</p>
                        <p class="text-xs text-gray-400 mb-2">또한 <strong class="text-amber-200">스트리밍을 자동으로 비활성화</strong>하여, 응답 본문을 못 받아 요청이 2회 발생하는 문제를 방지합니다.</p>
                        <p class="text-xs text-yellow-500">⚠️ 호환성 모드는 수동으로만 활성화됩니다. iPhone/Safari 등에서 스트리밍이 안 되거나 요청이 중복 발생하면 수동으로 켜주세요.</p>
                        <div id="cpm-compat-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">호환성 상태: 확인 중...</div>
                    </div>
                    <div class="space-y-3">
                        ${await renderInput('cpm_compatibility_mode', '호환성 모드 활성화 (Compatibility Mode)', 'checkbox')}
                        ${await renderInput('cpm_copilot_nodeless_mode', 'Node-less용 Copilot 실험 모드', 'select', [
                            { value: 'off', text: '끄기 (기본 헤더 유지)' },
                            { value: 'nodeless-1', text: '실험 1 — 토큰 교환 헤더만 축소' },
                            { value: 'nodeless-2', text: '실험 2 — 토큰 + 실제 요청 헤더 축소' },
                        ])}
                    </div>
                    <p class="text-xs text-cyan-400/90 mt-3">💡 Node-less 실험 모드는 Copilot 전용입니다. 사용자가 1번/2번을 바꿔가며 어떤 조합이 통하는지 직접 테스트할 수 있습니다.</p>

                    <!-- Copilot Emulation Version Overrides -->
                    <details class="mt-6 pt-4 border-t border-amber-900/40 group">
                        <summary class="cursor-pointer text-lg font-bold text-amber-300 hover:text-amber-200 transition-colors select-none leading-7">
                            ⚙️ Copilot 에뮬레이션 버전 오버라이드 (고급)
                        </summary>
                        <div class="mt-4 bg-gray-900/60 border border-amber-900/40 rounded-lg p-5 space-y-3">
                            <p class="text-sm text-gray-300 mb-2 leading-6">비워두면 기본 내장값을 사용합니다. Copilot API에서 <code class="text-amber-300">model_not_supported</code> 오류가 날 때 최신 버전으로 직접 업데이트할 수 있습니다.</p>
                            ${await renderInput('cpm_copilot_vscode_version', 'VSCode 에뮬레이션 버전', 'text')}
                            <p class="text-sm text-gray-400 -mt-1">기본값: <code class="text-gray-300">${escHtml(VSCODE_VERSION)}</code></p>
                            ${await renderInput('cpm_copilot_chat_version', 'Copilot Chat 확장 버전', 'text')}
                            <p class="text-sm text-gray-400 -mt-1">기본값: <code class="text-gray-300">${escHtml(COPILOT_CHAT_VERSION)}</code></p>
                            <p class="text-sm text-amber-300/90 mt-2 font-medium">⚠️ 변경 후 Copilot 토큰 캐시가 자동으로 초기화됩니다.</p>
                        </div>
                    </details>
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
            <div class="mt-10 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-yellow-400 mb-4">🔄 자동 업데이트 제어 (Auto-Update Control)</h4>
                <div class="bg-gray-800/70 border border-yellow-900/50 rounded-lg p-4 mb-6">
                    <p class="text-xs text-yellow-300 mb-2 font-semibold">🔒 메인 플러그인 자동 업데이트를 비활성화합니다</p>
                    <p class="text-xs text-gray-400 mb-2">활성화하면 새 버전이 있어도 자동으로 설치하지 않고, 알림만 표시합니다.</p>
                    <p class="text-xs text-gray-500">💡 리스 설정의 수동 업데이트 (+ 버튼)는 항상 동작합니다. 서브 플러그인 알림에도 영향 없습니다.</p>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_disable_autoupdate', '메인 플러그인 자동 업데이트 비활성화', 'checkbox')}
                </div>
            </div>
        </div>
        <div id="tab-other" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">트리거/루아 백그라운드 설정 (Other)</h3>
            ${await renderInput('cpm_slot_other', 'Lua 스크립트 등 무거운 유틸 전담 모델 (Other/Trigger)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('other')}
        </div>
        <div id="tab-tools" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold text-orange-400 mb-6 pb-3 border-b border-gray-700">🔧 도구 사용 (Tool Use)</h3>
            <p class="text-orange-300 font-semibold mb-4 border-l-4 border-orange-500 pl-4 py-1">AI가 실시간으로 날짜 확인, 계산, 주사위 굴림, 웹 검색 등 도구를 호출할 수 있게 합니다.</p>
            <div class="bg-red-900/60 border-2 border-red-500 rounded-lg p-4 mb-6">
                <h4 class="text-lg font-bold text-red-300 mb-2">⚠️ 메인 모델 2회 이상 호출 주의</h4>
                <p class="text-sm text-red-200 mb-2">도구 사용을 켜면, AI가 도구를 호출할 때마다 <strong class="text-red-100 underline">메인 채팅 모델 API가 최소 2회 호출</strong>됩니다.</p>
                <div class="text-xs text-red-300/80 space-y-1 ml-2">
                    <div>• <strong>1회차:</strong> 모델이 "도구를 쓸지 말지" 판단 → 도구 호출 요청 생성</div>
                    <div>• <strong>검색 API:</strong> CPM이 외부 검색 API 실행 (메인 모델 호출 아님)</div>
                    <div>• <strong>2회차:</strong> 검색 결과를 포함해서 모델 재호출 → 최종 답변 생성</div>
                    <div>• <strong>최악의 경우:</strong> 도구를 여러 번 호출하면 max_depth + 1회까지 호출 가능</div>
                </div>
                <p class="text-xs text-red-400 mt-2 font-semibold">💡 이것은 CPM의 문제가 아니라 OpenAI/Anthropic/Google Function Calling 프로토콜의 구조적 특성입니다. 토큰 비용이 약 1.3~2배 증가할 수 있습니다.</p>
            </div>

            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
                <h4 class="text-sm font-bold text-gray-300 mb-3">📋 동작 방식</h4>
                <div class="text-xs text-gray-400 space-y-1">
                    <div class="flex items-start"><span class="bg-orange-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0 mt-0.5">1</span> <span>네이티브 프로바이더(OpenAI/Anthropic/Gemini) → RisuAI MCP 시스템에 도구 등록 (Layer 1)</span></div>
                    <div class="flex items-start"><span class="bg-orange-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0 mt-0.5">2</span> <span>CPM 커스텀 모델 → CPM 자체 도구 루프 실행 (Layer 2)</span></div>
                    <div class="flex items-start"><span class="bg-orange-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0 mt-0.5">3</span> <span>AI가 도구 호출 → CPM이 실행 후 결과 주입 → AI가 최종 응답 생성</span></div>
                </div>
            </div>

            <div class="space-y-3 mb-8">
                ${await renderInput('cpm_tool_use_enabled', '🔧 도구 사용 활성화 (Enable Tool Use)', 'checkbox')}
            </div>

            <div class="mt-6 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-gray-300 mb-4">개별 도구 설정 (Individual Tools)</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">🕐</span>
                            <span class="text-sm font-bold text-gray-300">현재 날짜/시간</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">AI가 현재 날짜, 시간, 요일 등을 확인할 수 있습니다.</p>
                        ${await renderInput('cpm_tool_datetime', '날짜/시간 도구 활성화', 'checkbox')}
                    </div>
                    <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">🧮</span>
                            <span class="text-sm font-bold text-gray-300">계산기</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">수학 계산을 정확하게 수행합니다. (사칙연산, 삼각함수 등)</p>
                        ${await renderInput('cpm_tool_calculator', '계산기 도구 활성화', 'checkbox')}
                    </div>
                    <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">🎲</span>
                            <span class="text-sm font-bold text-gray-300">주사위 굴림</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">TRPG 스타일 주사위 굴림 (예: 2d6+3, 1d20)</p>
                        ${await renderInput('cpm_tool_dice', '주사위 도구 활성화', 'checkbox')}
                    </div>
                    <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">🔍</span>
                            <span class="text-sm font-bold text-gray-300">웹 검색</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">외부 검색 API로 실시간 정보를 가져옵니다.</p>
                        ${await renderInput('cpm_tool_web_search', '웹 검색 도구 활성화', 'checkbox')}
                    </div>
                    <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">🌐</span>
                            <span class="text-sm font-bold text-gray-300">URL 가져오기</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-3">웹 페이지의 텍스트 내용을 가져옵니다. (최대 8KB)</p>
                        ${await renderInput('cpm_tool_fetch_url', 'URL 가져오기 도구 활성화', 'checkbox')}
                    </div>
                </div>
            </div>

            <div class="mt-8 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-blue-400 mb-4">🔍 웹 검색 설정 (Web Search Provider)</h4>
                <div class="bg-gray-800/70 border border-blue-900/50 rounded-lg p-4 mb-4">
                    <p class="text-xs text-blue-300 mb-2 font-semibold">커스텀 모델처럼 검색 프로바이더를 설정합니다</p>
                    <p class="text-xs text-gray-400">Brave Search, SerpAPI, Google CSE 등에서 API Key를 받아 입력하세요. Custom URL을 지정하면 어떤 검색 API든 사용 가능합니다.</p>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_tool_websearch_provider', '검색 프로바이더 (Search Provider)', 'select', [
                        { value: 'brave', text: 'Brave Search API' },
                        { value: 'serpapi', text: 'SerpAPI (Google Search)' },
                        { value: 'google_cse', text: 'Google Custom Search Engine' },
                        { value: 'custom', text: 'Custom URL (직접 입력)' },
                    ])}
                    ${await renderInput('cpm_tool_websearch_url', '검색 API URL (Custom용, 비워두면 프로바이더 기본값)', 'text')}
                    ${await renderInput('cpm_tool_websearch_key', '검색 API Key', 'password')}
                    ${await renderInput('cpm_tool_websearch_cx', 'Google CSE ID (cx, Google CSE 전용)', 'text')}
                </div>
            </div>

            <div class="mt-8 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-green-400 mb-4">🚀 프리페치 검색 (Prefetch Search) — 모델 1회 호출</h4>
                <div class="bg-green-900/40 border border-green-600/50 rounded-lg p-4 mb-4">
                    <p class="text-xs text-green-300 mb-2 font-semibold">✅ Function Calling 없이 모델 1회만 호출합니다</p>
                    <p class="text-xs text-gray-400 mb-2">사용자 메시지를 먼저 웹검색한 뒤, 검색 결과를 시스템 프롬프트에 주입하고 메인 모델을 1번만 호출합니다. 기존 도구사용(Tool Use)의 2회 호출 문제를 해결합니다.</p>
                    <p class="text-xs text-green-400 font-semibold">🔒 프리페치 검색이 켜지면 위의 "도구 사용(Tool Use)"는 자동으로 비활성화됩니다. 웹검색 중복 호출을 방지합니다.</p>
                </div>
                <div class="space-y-3 mb-4">
                    ${await renderInput('cpm_prefetch_search_enabled', '🚀 프리페치 검색 활성화 (Prefetch Search)', 'checkbox')}
                </div>
                <div class="space-y-3 mb-4">
                    ${await renderInput('cpm_prefetch_search_position', '검색 결과 삽입 위치 (Insert Position)', 'select', [
                        { value: 'after', text: '시스템 프롬프트 뒤 (기본, 권장)' },
                        { value: 'before', text: '시스템 프롬프트 앞' },
                    ])}
                </div>
                <div class="space-y-3 mb-4">
                    ${await renderInput('cpm_prefetch_search_max_results', '최대 검색 결과 수 (기본 5, 최대 10)', 'number')}
                </div>
                <div class="space-y-3 mb-4">
                    ${await renderInput('cpm_prefetch_search_snippet_only', '📝 Snippet 전용 모드 (토큰 절약 — 제목/URL 제외, 요약만 주입)', 'checkbox')}
                </div>
                <div class="space-y-3 mb-4">
                    ${await renderInput('cpm_prefetch_search_keywords', '🔑 트리거 키워드 (쉼표 구분, 비우면 모든 메시지에 검색)', 'text')}
                    <p class="text-xs text-gray-500 ml-1">예: <code class="text-gray-400">검색,최신,현재,오늘,뉴스,search,latest,today</code> — 이 키워드가 사용자 메시지에 포함될 때만 검색 실행</p>
                </div>
                <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mt-4">
                    <p class="text-xs text-gray-500">💡 검색 API 설정(프로바이더, API Key 등)은 위의 "웹 검색 설정" 섹션과 공유합니다.</p>
                </div>
            </div>

            <div class="mt-8 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-gray-400 mb-4">⚙️ 고급 설정 (Advanced)</h4>
                <div class="space-y-3">
                    ${await renderInput('cpm_tool_max_depth', '최대 도구 루프 깊이 (Max Depth, 기본 5, 최대 20)', 'number')}
                    ${await renderInput('cpm_tool_timeout', '도구 실행 타임아웃 ms (기본 10000, 최대 60000)', 'number')}
                </div>
            </div>
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
            ${_spmAny._pendingUpdateNames.length > 0
                ? `<div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-3 mb-4 flex items-center gap-2"><span class="text-indigo-300 text-sm font-semibold">🔔 ${_spmAny._pendingUpdateNames.length}개의 서브 플러그인 업데이트가 감지되었습니다.</span></div>`
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
        for (const tab of /** @type {any[]} */ (registeredProviderTabs)) {
            sidebarBtnsHtml += `<button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="${tab.id}">${tab.icon} ${tab.label}</button>`;
            try {
                const tabContent = await tab.renderContent(renderInput, { reasoningList, verbosityList, thinkingList });
                contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden">${tabContent}</div>`;
            } catch (err) {
                console.error(`[CupcakePM] Failed to render settings tab: ${tab.id}`, err);
                contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden"><p class="text-red-400">Error rendering tab: ${/** @type {Error} */ (err).message}</p></div>`;
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
            if (!mobileDropdown || !mobileIcon) return;
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
            mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); if (mobileIcon) mobileIcon.innerText = '▼';
        }
    }));
    if (tabs[0] instanceof HTMLElement) tabs[0].click();

    // ── Stream / compatibility status check ──
    await refreshStatusIndicators();

    // ── Custom Models Manager ──
    initCustomModelsManager(setVal, openCpmSettings);

    // ── API View ──
    initApiViewPanel();

    // ── Snapshot settings ──
    await SettingsBackup.snapshotAll();

    // ── Export/Import ──
    initExportImport(setVal, openCpmSettings);

    // ── Close button ──
    document.getElementById('cpm-close-btn')?.addEventListener('click', () => {
        document.body.innerHTML = '';
        Risu.hideContainer();
    });
}
