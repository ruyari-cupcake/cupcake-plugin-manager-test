// @ts-check
/**
 * settings-ui-plugins.js — Sub-Plugins tab UI.
 * Extracted from settings-ui.js for modularity.
 * Handles plugin listing, upload, toggle, delete, and update checking.
 */
import { safeGetArg } from './shared-state.js';
import { getSubPluginFileAccept, escHtml } from './helpers.js';
import { SubPluginManager } from './sub-plugin-manager.js';

/** @typedef {Window & typeof globalThis & { CupcakePM_SubPlugins?: Array<any> }} CupcakePluginWindow */

/** @param {string} id @returns {HTMLElement} */
function getElement(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`[CPM] Missing element: ${id}`);
    return el;
}

/** @param {any} el @returns {HTMLButtonElement} */
function asButton(el) {
    return /** @type {HTMLButtonElement} */ (el);
}

/** @param {any} el @returns {HTMLInputElement} */
function asInput(el) {
    return /** @type {HTMLInputElement} */ (el);
}

/** @param {any} el @returns {HTMLElement} */
function asContainer(el) {
    return /** @type {HTMLElement} */ (el);
}

/**
 * Show a delete modal with 2 options: registry-only or full data deletion.
 * @param {string} pluginName
 * @param {string} pluginId
 * @param {() => void} renderPluginsTab
 */
function _showDeleteModal(pluginName, pluginId, renderPluginsTab) {
    // Remove any existing modal
    const existing = document.getElementById('cpm-delete-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpm-delete-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
    overlay.innerHTML = `
        <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
            <h3 style="color:#f87171;font-size:16px;font-weight:700;margin:0 0 8px;">🗑️ 서브 플러그인 삭제</h3>
            <p style="color:#d1d5db;font-size:13px;margin:0 0 16px;">
                <strong style="color:#fff;">${escHtml(pluginName)}</strong> 플러그인을 삭제합니다.<br>
                삭제 방식을 선택하세요.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="cpm-del-registry-only" style="background:#4b5563;color:#fff;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left;transition:background 0.15s;">
                    🗑️ 플러그인만 삭제
                    <span style="display:block;color:#9ca3af;font-size:11px;font-weight:400;margin-top:2px;">레지스트리에서만 제거합니다. 저장된 데이터(캐시, 설정 등)는 남아있습니다.</span>
                </button>
                <button id="cpm-del-with-data" style="background:#991b1b;color:#fff;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left;transition:background 0.15s;">
                    💀 데이터 포함 전부 삭제
                    <span style="display:block;color:#fca5a5;font-size:11px;font-weight:400;margin-top:2px;">플러그인 + 해당 플러그인이 저장한 모든 데이터를 삭제합니다. 되돌릴 수 없습니다.</span>
                </button>
                <button id="cpm-del-cancel" style="background:transparent;color:#9ca3af;border:1px solid #374151;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;transition:background 0.15s;">
                    취소
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    /** @type {HTMLButtonElement} */ (document.getElementById('cpm-del-cancel')).addEventListener('click', () => overlay.remove());

    /** @type {HTMLButtonElement} */ (document.getElementById('cpm-del-registry-only')).addEventListener('click', async () => {
        overlay.remove();
        SubPluginManager.unloadPlugin(pluginId);
        await SubPluginManager.remove(pluginId);
        renderPluginsTab();
    });

    /** @type {HTMLButtonElement} */ (document.getElementById('cpm-del-with-data')).addEventListener('click', async () => {
        const confirmed = confirm(
            `⚠️ "${pluginName}"의 모든 저장 데이터도 함께 삭제됩니다.\n\n` +
            `이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`
        );
        if (!confirmed) return;
        overlay.remove();
        SubPluginManager.unloadPlugin(pluginId);
        const result = await SubPluginManager.removeWithData(pluginId);
        const keyCount = result.removedKeys.length;
        if (keyCount > 0) {
            alert(`✅ "${pluginName}" 삭제 완료!\n\n삭제된 데이터 키: ${keyCount}개\n${result.removedKeys.join('\n')}`);
        } else {
            alert(`✅ "${pluginName}" 삭제 완료!\n\n(해당 플러그인의 저장 데이터가 발견되지 않았습니다.)`);
        }
        renderPluginsTab();
    });
}

// ── Helper: Sub-Plugins tab renderer ──
export function buildPluginsTabRenderer(/** @type {any} */ setVal) {
    const renderPluginsTab = () => {
        const listContainer = document.getElementById('cpm-plugins-list');
        if (!listContainer) return;

        let html = `
            <div class="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:bg-gray-700 transition-colors cursor-pointer mb-6" id="cpm-btn-upload-plugin">
                <div class="text-4xl mb-2">📥</div>
                <h4 class="text-lg font-bold text-gray-200">설치할 서브 플러그인 선택 (.js/.mjs)</h4>
                <input type="file" id="cpm-file-plugin" accept="${getSubPluginFileAccept()}" class="hidden">
            </div>
        `;

        if (SubPluginManager.plugins.length === 0) {
            html += '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded">설치된 서브 플러그인이 없습니다.</div>';
        } else {
            html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
            for (const p of SubPluginManager.plugins) {
                html += `
                    <div class="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-500 transition-colors relative">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1 pr-4">
                                <h4 class="text-xl font-bold text-white flex items-center space-x-2">
                                    <span>${escHtml(p.icon) || '🧩'}</span><span>${escHtml(p.name)}</span>
                                    ${p.version ? `<span class="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded-full ml-2">v${escHtml(p.version)}</span>` : ''}
                                </h4>
                                <p class="text-sm text-gray-400 mt-1">${escHtml(p.description) || 'No description.'}</p>
                            </div>
                            <div class="flex flex-col items-end space-y-2">
                                <label class="flex items-center cursor-pointer"><div class="relative">
                                    <input type="checkbox" class="sr-only cpm-plugin-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                    <div class="block bg-gray-600 w-10 h-6 rounded-full custom-toggle-bg transition-colors"></div>
                                    <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform"></div>
                                </div></label>
                                <button class="cpm-plugin-delete text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 bg-gray-700 rounded" data-id="${p.id}">🗑️ 삭제</button>
                            </div>
                        </div>
                        <div class="border-t border-gray-700 pt-3 mt-3 plugin-ui-container" id="plugin-ui-${p.id}"></div>
                    </div>
                `;
            }
            html += '</div><style>.cpm-plugin-toggle:checked ~ .custom-toggle-bg{background-color:#3b82f6;} .cpm-plugin-toggle:checked ~ .dot{transform:translateX(100%);}</style>';
        }

        // ── Residual (Orphaned) Data Cleanup Section ──
        html += `
            <div class="mt-8 pt-6 border-t border-gray-700">
                <div class="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-5">
                    <h4 class="text-lg font-bold text-yellow-400 mb-2">🧹 잔류 데이터 정리</h4>
                    <p class="text-xs text-gray-400 mb-3">
                        삭제된 서브 플러그인이 남긴 데이터를 찾아 정리합니다. 현재 설치되지 않은 플러그인의 데이터만 표시됩니다.
                    </p>
                    <button id="cpm-scan-orphans-btn" class="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-5 rounded transition-colors text-sm">
                        🔍 잔류 데이터 검색
                    </button>
                    <div id="cpm-orphan-results" class="mt-3 hidden"></div>
                </div>
            </div>
        `;

        // ── Purge All CPM Data Section ──
        html += `
            <div class="mt-8 pt-6 border-t border-gray-700">
                <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-5">
                    <h4 class="text-lg font-bold text-red-400 mb-2">⚠️ CPM 데이터 전체 삭제 (Danger Zone)</h4>
                    <p class="text-xs text-gray-400 mb-1">
                        Cupcake Provider Manager 플러그인이 리스AI 저장소에 저장한 <strong class="text-red-300">모든 데이터</strong>를 삭제합니다.
                    </p>
                    <ul class="text-xs text-gray-500 mb-3 list-disc list-inside space-y-0.5">
                        <li>서브 플러그인 목록 및 코드</li>
                        <li>모든 프로바이더 API 키 (OpenAI, Anthropic, Gemini, Vertex, AWS, OpenRouter, DeepSeek 등)</li>
                        <li>슬롯 설정 (번역, 감정, 하이파, 트리거)</li>
                        <li>커스텀 모델 설정</li>
                        <li>글로벌 기본값, 스트리밍 설정, 설정 백업 등</li>
                    </ul>
                    <p class="text-xs text-yellow-400 font-semibold mb-3">
                        💡 플러그인을 삭제/재설치해도 데이터는 남아있습니다. 이 버튼을 눌러야만 완전히 제거됩니다.
                    </p>
                    <button id="cpm-purge-all-btn" class="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-6 rounded transition-colors text-sm shadow-lg shadow-red-900/50">
                        🗑️ CPM 저장 데이터 모두 지우기
                    </button>
                </div>
            </div>
        `;

        listContainer.innerHTML = html;

        // Upload handler
        const btnUpload = document.getElementById('cpm-btn-upload-plugin');
        const pFileInput = document.getElementById('cpm-file-plugin');
        if (btnUpload && pFileInput) {
            btnUpload.addEventListener('click', () => pFileInput.click());
            pFileInput.addEventListener('change', async (e) => {
                const file = asInput(e.target).files?.[0];
                if (!file) return;
                if (file.size > SubPluginManager.MAX_INSTALL_BYTES) {
                    alert(
                        `⚠️ 설치 실패: 파일 용량이 너무 큽니다. ` +
                        `최대 ${(SubPluginManager.MAX_INSTALL_BYTES / 1024).toFixed(0)}KB까지만 설치할 수 있습니다.`
                    );
                    renderPluginsTab();
                    return;
                }
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const code = /** @type {string} */ ((/** @type {FileReader} */ (ev.target)).result);
                    try {
                        const name = await SubPluginManager.install(code);
                        const installed = SubPluginManager.plugins.find(p => p.name === name);
                        if (installed) await SubPluginManager.hotReload(installed.id);
                        alert(`서브 플러그인 '${name}' 설치 완료!`);
                    } catch (installErr) {
                        const message = installErr instanceof Error ? installErr.message : String(installErr || '알 수 없는 오류');
                        alert(`⚠️ 설치 실패: ${message}`);
                    }
                    renderPluginsTab();
                };
                reader.readAsText(file);
            });
        }

        // Toggle/delete handlers
        listContainer.querySelectorAll('.cpm-plugin-toggle').forEach(t => {
            t.addEventListener('change', async (e) => {
                const toggle = asInput(e.target);
                const pluginId = toggle.getAttribute('data-id') || '';
                await SubPluginManager.toggle(pluginId, toggle.checked);
                await SubPluginManager.hotReload(pluginId);
            });
        });
        listContainer.querySelectorAll('.cpm-plugin-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = asButton(e.target).getAttribute('data-id') || '';
                const plugin = SubPluginManager.plugins.find(p => p.id === id);
                const pluginName = plugin ? plugin.name : id;
                _showDeleteModal(pluginName, id, renderPluginsTab);
            });
        });

        // Update check button
        initUpdateCheckButton(renderPluginsTab);

        // ── Orphan Data Scan handler ──
        const scanOrphansBtn = document.getElementById('cpm-scan-orphans-btn');
        if (scanOrphansBtn) {
            scanOrphansBtn.addEventListener('click', async () => {
                const resultsDiv = document.getElementById('cpm-orphan-results');
                if (!resultsDiv) return;
                const scanButton = asButton(scanOrphansBtn);
                scanButton.disabled = true;
                scanButton.textContent = '⏳ 검색 중...';
                resultsDiv.classList.remove('hidden');
                resultsDiv.innerHTML = '<p class="text-gray-400 text-sm">잔류 데이터를 스캔하고 있습니다...</p>';

                try {
                    const orphans = await SubPluginManager.findOrphanedPluginData();
                    if (orphans.length === 0) {
                        resultsDiv.innerHTML = '<p class="text-green-400 text-sm font-semibold bg-green-900/30 rounded p-3">✅ 잔류 데이터가 없습니다. 깨끗한 상태입니다.</p>';
                    } else {
                        let rhtml = '<div class="space-y-2">';
                        rhtml += `<p class="text-yellow-300 text-sm font-semibold">${orphans.length}개 플러그인의 잔류 데이터가 발견되었습니다.</p>`;
                        for (const o of orphans) {
                            rhtml += `
                                <div class="flex items-center justify-between bg-gray-800 rounded p-3">
                                    <div>
                                        <span class="text-white font-semibold text-sm">${escHtml(o.pluginName)}</span>
                                        <span class="text-gray-500 text-xs ml-2">(${o.keys.length}개 키)</span>
                                    </div>
                                    <button class="cpm-purge-orphan bg-red-700 hover:bg-red-600 text-white text-xs font-bold px-3 py-1 rounded" data-name="${escHtml(o.pluginName)}">
                                        🗑️ 삭제
                                    </button>
                                </div>
                            `;
                        }
                        rhtml += '</div>';
                        resultsDiv.innerHTML = rhtml;

                        // Bind individual orphan purge buttons
                        resultsDiv.querySelectorAll('.cpm-purge-orphan').forEach(btn => {
                            btn.addEventListener('click', async (ev) => {
                                const purgeOrphanBtn = asButton(ev.target);
                                const name = purgeOrphanBtn.getAttribute('data-name') || '';
                                if (!confirm(`"${name}"의 잔류 데이터를 삭제하시겠습니까?`)) return;
                                purgeOrphanBtn.disabled = true;
                                purgeOrphanBtn.textContent = '⏳ 삭제 중...';
                                const count = await SubPluginManager.purgeOrphanedPluginData(name);
                                purgeOrphanBtn.textContent = `✅ ${count}개 삭제됨`;
                            });
                        });
                    }
                } catch (err) {
                    console.error('[CPM Orphan Scan]', err);
                    resultsDiv.innerHTML = '<p class="text-red-400 text-sm font-semibold bg-red-900/30 rounded p-3">❌ 스캔 중 오류가 발생했습니다.</p>';
                }
                scanButton.disabled = false;
                scanButton.textContent = '🔍 잔류 데이터 검색';
            });
        }

        // ── Purge All CPM Data handler (double confirmation) ──
        const purgeBtn = document.getElementById('cpm-purge-all-btn');
        if (purgeBtn) {
            purgeBtn.addEventListener('click', async () => {
                const purgeButton = asButton(purgeBtn);
                // 1st confirmation
                const first = confirm(
                    '⚠️ 정말로 Cupcake Provider Manager의 모든 저장 데이터를 삭제하시겠습니까?\n\n' +
                    '삭제 대상:\n' +
                    '• 서브 플러그인 목록 및 코드\n' +
                    '• 모든 API 키 (OpenAI, Anthropic, Gemini 등)\n' +
                    '• 슬롯/커스텀 모델/글로벌 설정\n' +
                    '• 설정 백업 데이터\n\n' +
                    '이 작업은 되돌릴 수 없습니다!'
                );
                if (!first) return;

                // 2nd confirmation
                const second = confirm(
                    '🚨 최종 확인: 정말 삭제하시겠습니까?\n\n' +
                    'CPM의 모든 API 키, 서브 플러그인, 설정이 영구 삭제됩니다.\n' +
                    '확인을 누르면 즉시 삭제가 실행됩니다.'
                );
                if (!second) return;

                purgeButton.disabled = true;
                purgeButton.textContent = '⏳ 삭제 중...';

                try {
                    const result = await SubPluginManager.purgeAllCpmData();
                    alert(
                        `✅ CPM 데이터가 모두 삭제되었습니다.\n\n` +
                        `• pluginStorage: ${result.pluginStorageCleared}개 항목 삭제\n` +
                        `• 설정 키: ${result.argsCleared}개 항목 초기화\n\n` +
                        `변경사항을 완전히 적용하려면 페이지를 새로고침(F5)하세요.`
                    );
                    renderPluginsTab();
                } catch (err) {
                    console.error('[CPM Purge] Error:', err);
                    alert('❌ 삭제 중 오류가 발생했습니다: ' + (/** @type {Error} */ (err).message || err));
                    purgeButton.disabled = false;
                    purgeButton.textContent = '🗑️ CPM 저장 데이터 모두 지우기';
                }
            });
        }

        // Render sub-plugin dynamic UIs
        /** @type {CupcakePluginWindow} */
        const cupcakeWindow = window;
        cupcakeWindow.CupcakePM_SubPlugins = cupcakeWindow.CupcakePM_SubPlugins || [];
        for (const p of cupcakeWindow.CupcakePM_SubPlugins) {
            // Try direct id match first
            let uiContainer = document.getElementById(`plugin-ui-${p.id}`);
            // Fallback: match by name (SubPluginManager uses @name header, CupcakePM_SubPlugins uses display name)
            if (!uiContainer && p.name) {
                const pNameLower = p.name.toLowerCase();
                const match = SubPluginManager.plugins.find(
                    (/** @type {any} */ sp) => {
                        const spNameLower = (sp.name || '').toLowerCase();
                        return spNameLower === pNameLower
                            || spNameLower.includes(pNameLower)
                            || pNameLower.includes(spNameLower);
                    }
                );
                if (match) uiContainer = document.getElementById(`plugin-ui-${match.id}`);
            }
            if (uiContainer) {
                try {
                    if (p.uiHtml) uiContainer.innerHTML = p.uiHtml;
                    if (typeof p.onRender === 'function') p.onRender(uiContainer, safeGetArg, setVal);
                } catch (err) { console.error(`UI Error for ${p.id}:`, err); }
            }
        }
    };
    return renderPluginsTab;
}

export function initUpdateCheckButton(/** @type {any} */ _renderPluginsTab, /** @type {Record<string, any>} */ deps = {}) {
    const subPluginManager = deps.subPluginManager || SubPluginManager;
    const updateBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('cpm-check-updates-btn'));
    if (!updateBtn || updateBtn.dataset.cpmBound === 'true') return;
    updateBtn.dataset.cpmBound = 'true';
    updateBtn.addEventListener('click', async () => {
        const statusDiv = asContainer(getElement('cpm-update-status'));
        updateBtn.disabled = true; updateBtn.textContent = '⏳ 확인 중...';
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = '<p class="text-gray-400 text-sm">업데이트를 확인하고 있습니다...</p>';
        try {
            const updates = await subPluginManager.checkAllUpdates();
            if (updates.length === 0) {
                statusDiv.innerHTML = '<p class="text-green-400 text-sm font-semibold bg-green-900/30 rounded p-3">✅ 모든 서브 플러그인이 최신 버전입니다.</p>';
            } else {
                const pendingUpdates = new Map();
                let html = `<div class="bg-indigo-900/30 rounded p-3 space-y-3"><p class="text-indigo-300 text-sm font-semibold">🔔 ${updates.length}개의 업데이트가 있습니다.</p>`;
                for (const u of updates) {
                    pendingUpdates.set(u.plugin.id, { code: u.code, name: u.plugin.name, expectedSHA256: u.expectedSHA256 || '' });
                    html += `<div class="flex items-center justify-between bg-gray-800 rounded p-2"><div><span class="text-white font-semibold">${escHtml(u.plugin.icon || '🧩')} ${escHtml(u.plugin.name)}</span><span class="text-gray-400 text-xs ml-2">v${escHtml(u.localVersion)} → <span class="text-green-400">v${escHtml(u.remoteVersion)}</span></span></div>`;
                    html += u.code
                        ? `<button class="cpm-apply-update bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded" data-id="${escHtml(u.plugin.id)}">⬆️ 업데이트</button>`
                        : `<span class="text-red-400 text-xs">⚠️ 코드 다운로드 실패</span>`;
                    html += `</div>`;
                }
                html += `</div>`;
                statusDiv.innerHTML = html;
                statusDiv.querySelectorAll('.cpm-apply-update').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const applyBtn = asButton(e.target);
                        const id = applyBtn.getAttribute('data-id') || '';
                        const updateData = pendingUpdates.get(id);
                        if (!updateData || !updateData.code) { applyBtn.textContent = '❌ 코드 없음'; return; }
                        applyBtn.disabled = true; applyBtn.textContent = '⏳ 적용 중...';
                        const ok = await subPluginManager.applyUpdate(id, updateData.code, updateData.expectedSHA256);
                        if (ok) { await subPluginManager.hotReload(id); applyBtn.textContent = '✅ 완료'; pendingUpdates.delete(id); }
                        else applyBtn.textContent = '❌ 실패';
                    });
                });
            }
        } catch (err) {
            console.error('[CPM Update Check]', err);
            statusDiv.innerHTML = '<p class="text-red-400 text-sm font-semibold bg-red-900/30 rounded p-3">❌ 업데이트 확인 중 오류가 발생했습니다.</p>';
        }
        updateBtn.disabled = false; updateBtn.textContent = '🔄 업데이트 확인';
    });
}
