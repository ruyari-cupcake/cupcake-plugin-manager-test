/**
 * settings-ui-panels.js — API View panel + Export/Import.
 * Extracted from settings-ui.js for modularity.
 */
import { safeGetArg } from './shared-state.js';
import { escHtml } from './helpers.js';
import { getManagedSettingKeys } from './settings-backup.js';
import {
    getAllApiRequests as _getAllApiRequests,
    getApiRequestById as _getApiRequestById,
} from './api-request-log.js';

// ── API View Panel ──
export function initApiViewPanel() {
    const _renderApiViewEntry = (r) => {
        if (!r) return '<div class="text-gray-500 text-center py-8">선택한 요청 데이터가 없습니다.</div>';
        const redactKey = (v) => { if (!v || typeof v !== 'string') return v; if (v.length <= 8) return '***'; return v.slice(0, 4) + '...' + v.slice(-4); };
        const redactHeaders = (headers) => { const h = { ...headers }; for (const k of Object.keys(h)) { if (/auth|key|token|secret|bearer/i.test(k)) h[k] = redactKey(h[k]); } return h; };
        const formatJson = (obj) => { try { return JSON.stringify(obj, null, 2); } catch { return String(obj); } };
        const statusColor = r.status >= 200 && r.status < 300 ? 'text-green-400' : (typeof r.status === 'number' ? 'text-red-400' : 'text-yellow-400');
        const hasHttpDetails = !!r.url;
        return `<div class="space-y-3">
            <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
                <span class="text-gray-400">⏱️ ${escHtml(new Date(r.timestamp).toLocaleString())}</span>
                <span class="${statusColor} font-bold">Status: ${escHtml(r.status || 'N/A')}</span>
                <span class="text-gray-400">${r.duration ? escHtml(r.duration) + 'ms' : ''}</span>
                ${hasHttpDetails ? `<span class="text-purple-300 font-mono text-xs break-all">${escHtml(r.method || 'POST')} ${escHtml(r.url)}</span>` : ''}
            </div>
            ${hasHttpDetails ? `<details class="bg-gray-800 rounded p-3"><summary class="cursor-pointer text-gray-300 font-semibold text-sm">📤 Request Headers</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap">${escHtml(formatJson(redactHeaders(r.requestHeaders || {})))}</pre></details>` : ''}
            <details class="bg-gray-800 rounded p-3"><summary class="cursor-pointer text-gray-300 font-semibold text-sm">${hasHttpDetails ? '📤 Request Body' : '📊 Request Params'}</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-60 whitespace-pre-wrap">${escHtml(formatJson(hasHttpDetails ? (r.requestBody || {}) : (r.body || {})))}</pre></details>
            <details class="bg-gray-800 rounded p-3" open><summary class="cursor-pointer text-gray-300 font-semibold text-sm">📥 Response Body</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-96 whitespace-pre-wrap">${typeof r.response === 'string' ? escHtml(r.response) : escHtml(formatJson(r.response || 'No response captured'))}</pre></details>
        </div>`;
    };

    const _refreshApiViewPanel = () => {
        /** @type {HTMLDivElement | null} */
        const contentEl = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-content'));
        /** @type {HTMLSelectElement | null} */
        const selector = /** @type {HTMLSelectElement | null} */ (document.getElementById('cpm-api-view-selector'));
        if (!contentEl || !selector) return;
        const allReqs = _getAllApiRequests();
        if (allReqs.length === 0) {
            selector.innerHTML = '';
            contentEl.innerHTML = '<div class="text-gray-500 text-center py-8">아직 API 요청 기록이 없습니다.</div>';
            return;
        }
        const currentVal = selector.value;
        selector.innerHTML = allReqs.map((req, i) => {
            const time = new Date(req.timestamp).toLocaleTimeString();
            return `<option value="${escHtml(req.id)}"${i === 0 ? ' selected' : ''}>#${i + 1} [${escHtml(req.status || '...')}] ${escHtml(req.modelName || '(unknown)')} — ${escHtml(time)}</option>`;
        }).join('');
        if (currentVal && allReqs.find(r => r.id === currentVal)) selector.value = currentVal;
        contentEl.innerHTML = _renderApiViewEntry(_getApiRequestById(selector.value));
    };

    document.getElementById('cpm-api-view-btn').addEventListener('click', () => {
        /** @type {HTMLDivElement | null} */
        const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
        if (!panel) return;
        if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
        _refreshApiViewPanel(); panel.classList.remove('hidden');
    });
    document.getElementById('cpm-api-view-selector').addEventListener('change', (e) => {
        /** @type {HTMLSelectElement | null} */
        const selector = /** @type {HTMLSelectElement | null} */ (e.target);
        /** @type {HTMLDivElement | null} */
        const contentEl = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-content'));
        if (!selector || !contentEl) return;
        contentEl.innerHTML = _renderApiViewEntry(_getApiRequestById(selector.value));
    });
    document.getElementById('cpm-api-view-close').addEventListener('click', () => {
        /** @type {HTMLDivElement | null} */
        const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
        if (panel) panel.classList.add('hidden');
    });
}

// ── Export/Import ──
export function initExportImport(setVal, openCpmSettings) {
    document.getElementById('cpm-export-btn').addEventListener('click', async () => {
        const exportData = {};
        for (const key of getManagedSettingKeys()) {
            const val = await safeGetArg(key);
            if (val !== undefined && val !== '') exportData[key] = val;
        }
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const a = document.createElement('a'); a.href = dataStr; a.download = 'cupcake_pm_settings.json';
        document.body.appendChild(a); a.click(); a.remove();
    });

    document.getElementById('cpm-import-btn').addEventListener('click', () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = e => {
            /** @type {HTMLInputElement | null} */
            const fileInput = /** @type {HTMLInputElement | null} */ (e.target);
            const file = fileInput?.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const rawText = event.target?.result;
                    if (typeof rawText !== 'string') throw new Error('설정 파일 형식이 올바르지 않습니다.');
                    const importedData = JSON.parse(rawText);
                    for (const [key, value] of Object.entries(importedData)) {
                        setVal(key, value);
                        /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */
                        const el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(key));
                        if (el) {
                            if ('type' in el && el.type === 'checkbox') /** @type {HTMLInputElement} */ (el).checked = (value === true || String(value).toLowerCase() === 'true');
                            else el.value = String(value ?? '');
                        }
                    }
                    alert('설정을 성공적으로 불러왔습니다!');
                    openCpmSettings();
                } catch (err) { alert('설정 파일 읽기 오류: ' + err.message); }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}
