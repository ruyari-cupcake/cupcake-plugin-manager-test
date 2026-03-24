//@name CPM Component - Chat Limiter
//@display-name 🧁 Cupcake Chat Limiter
//@version 0.2.1
//@description 최신 N개 채팅만 표시하여 렉 제거 (실시간 슬라이더, 메시지 카운트, Navigation 연동)
//@icon 📋
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager-test2/main/cpm-chat-limiter.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Limiter v0.2.0 ========
 *
 * Limits visible chat messages to the most recent N, reducing
 * rendering lag on long conversations. Uses CSS nth-child to hide
 * older messages without DOM removal.
 *
 * v0.2.0 changes:
 *  - Real-time range slider for keepCount
 *  - Message count indicator (N / total shown)
 *  - MutationObserver for auto-update on new messages
 *  - Inter-plugin API (window._cpmLimiterState) for Navigation compat
 *  - Auto-scroll to latest when toggled on
 *  - keepCount persistence
 *
 * Core technique extracted from chat-view-fold-v3_2.0.5.
 */
(async () => {
    // ── Hot-reload cleanup ──
    if (typeof window._cpmLimiterCleanup === 'function') {
        try { await window._cpmLimiterCleanup(); } catch (_) { /* */ }
    }

    if (!window.Risuai && !window.risuai) {
        console.warn('[CPM Limiter] RisuAI API not found. Halting.');
        return;
    }
    const risuai = window.risuai || window.Risuai;

    // ── State ──
    const STYLE_ATTR = 'x-cpm-limiter-style';
    const STORAGE_KEY = 'cpm_chat_limiter_active';
    const STORAGE_KEY_COUNT = 'cpm_chat_limiter_count';
    const CSS_SELECTORS = [
        '.flex-col-reverse > .chat-message-container',
        '.chat-message-list > .chat-message-container',
        '[class*="chat"] > [class*="message"]',
        '.message-container'
    ];

    let enabled = true;
    let keepCount = 6;
    let totalMessageCount = 0;
    let detectedSelector = null;
    let rootDoc = null;
    let observer = null;

    // ── Inter-plugin API ──
    // Other plugins (e.g. Navigation) can read this to know the visible range
    function updatePublicState() {
        window._cpmLimiterState = {
            enabled,
            keepCount,
            totalMessageCount,
            detectedSelector,
            /** Returns whether a 1-based message index is currently visible */
            isVisible: (index) => !enabled || index <= keepCount,
            /** Returns the visible count (clamped to totalMessageCount) */
            getVisibleCount: () => enabled ? Math.min(keepCount, totalMessageCount) : totalMessageCount,
        };
    }
    updatePublicState();

    // ── CSS Selector Detection ──
    async function detectSelector() {
        if (!rootDoc) return CSS_SELECTORS[0];
        for (const sel of CSS_SELECTORS) {
            try {
                const el = await rootDoc.querySelector(sel);
                if (el) return sel;
            } catch (_) { /* */ }
        }
        return CSS_SELECTORS[0];
    }

    // ── Total message count ──
    async function countMessages() {
        if (!rootDoc || !detectedSelector) return 0;
        try {
            // Extract parent selector from "parent > child" pattern
            const parts = detectedSelector.split('>').map(s => s.trim());
            const parentSel = parts.length > 1 ? parts[0] : null;
            if (parentSel) {
                const parent = await rootDoc.querySelector(parentSel);
                if (parent) {
                    const children = await parent.querySelectorAll(detectedSelector);
                    return children ? children.length : 0;
                }
            }
            const all = await rootDoc.querySelectorAll(detectedSelector);
            return all ? all.length : 0;
        } catch (_) { return 0; }
    }

    // ── CSS Generation & Injection ──
    function generateCSS(selector, count) {
        if (!selector || count < 1) return '';
        return `${selector}:nth-child(n+${count + 1}) { display: none !important; }`;
    }

    async function updateStyles() {
        if (!rootDoc) {
            try { rootDoc = await risuai.getRootDocument(); } catch (_) { return; }
        }
        if (!detectedSelector) detectedSelector = await detectSelector();

        let styleEl = await rootDoc.querySelector(`[${STYLE_ATTR}]`);
        if (!styleEl) {
            styleEl = await rootDoc.createElement('style');
            await styleEl.setAttribute(STYLE_ATTR, '');
            const head = await rootDoc.querySelector('head');
            if (head) await head.appendChild(styleEl);
        }
        const css = enabled ? generateCSS(detectedSelector, keepCount) : '';
        await styleEl.setInnerHTML(css);

        // Update message count + public state
        totalMessageCount = await countMessages();
        updatePublicState();
    }

    // ── Auto-scroll ──
    async function scrollToLatest() {
        if (!rootDoc || !detectedSelector) return;
        try {
            const parts = detectedSelector.split('>').map(s => s.trim());
            const parentSel = parts.length > 1 ? parts[0] : null;
            if (parentSel) {
                const parent = await rootDoc.querySelector(parentSel);
                if (parent && parent.scrollTo) {
                    await parent.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        } catch (_) { /* */ }
    }

    // ── MutationObserver ──
    async function startObserver() {
        if (observer || !rootDoc || !detectedSelector) return;
        try {
            const parts = detectedSelector.split('>').map(s => s.trim());
            const parentSel = parts.length > 1 ? parts[0] : null;
            if (!parentSel) return;
            const parent = await rootDoc.querySelector(parentSel);
            if (!parent || !parent.observe) return;
            observer = await parent.observe({ childList: true }, async () => {
                totalMessageCount = await countMessages();
                updatePublicState();
            });
        } catch (_) { /* MutationObserver may not be available in SafeElement API */ }
    }

    function stopObserver() {
        if (observer && observer.disconnect) {
            try { observer.disconnect(); } catch (_) { /* */ }
        }
        observer = null;
    }

    // ── Persistence ──
    async function loadState() {
        try {
            const saved = await risuai.safeLocalStorage.getItem(STORAGE_KEY);
            if (saved !== null) enabled = JSON.parse(saved);
        } catch (_) { /* */ }
        try {
            const savedCount = await risuai.safeLocalStorage.getItem(STORAGE_KEY_COUNT);
            if (savedCount !== null) {
                const parsed = parseInt(JSON.parse(savedCount), 10);
                if (parsed > 0) keepCount = parsed;
            }
        } catch (_) { /* */ }
    }

    async function saveState() {
        try {
            await risuai.safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
            await risuai.safeLocalStorage.setItem(STORAGE_KEY_COUNT, JSON.stringify(keepCount));
        } catch (_) { /* */ }
    }

    // ── CPM Settings Panel Integration ──
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-chat-limiter');
    window.CupcakePM_SubPlugins.push({
        id: 'cpm-chat-limiter',
        name: 'Chat Limiter',
        description: '최신 N개 채팅만 표시하여 렉을 제거합니다.',
        version: '0.2.0',
        icon: '📋',
        uiHtml: `
            <div class="mb-2">
                <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                    <input id="cpm_chat_limiter_enable" type="checkbox" class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                    <span>Chat Limiter 활성화 (Enable)</span>
                </label>
            </div>
            <div class="mb-2">
                <label class="block text-sm font-medium text-gray-300 mb-1">표시할 메시지 수 (Visible message count)</label>
                <div class="flex items-center space-x-2">
                    <input id="cpm_chat_limiter_slider" type="range" min="1" max="100" value="6"
                        class="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-blue-500">
                    <input id="cpm_chat_limiter_count" type="number" min="1" max="200" value="6"
                        class="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-gray-200 text-sm focus:ring-blue-500 focus:border-blue-500">
                </div>
            </div>
            <div id="cpm_chat_limiter_status" class="text-xs text-gray-400 mt-1"></div>
        `,
        onRender: async (container, getArg, setVal) => {
            const checkbox = container.querySelector('#cpm_chat_limiter_enable');
            const countInput = container.querySelector('#cpm_chat_limiter_count');
            const slider = container.querySelector('#cpm_chat_limiter_slider');
            const statusEl = container.querySelector('#cpm_chat_limiter_status');

            // Read persisted values
            const savedEnable = await getArg('cpm_chat_limiter_enable');
            const savedCount = await getArg('cpm_chat_limiter_count');

            // Apply saved state
            if (savedEnable !== null && savedEnable !== undefined) {
                enabled = savedEnable !== 'false' && savedEnable !== false;
            }
            if (savedCount !== null && savedCount !== undefined) {
                const parsed = parseInt(savedCount, 10);
                if (parsed > 0) keepCount = parsed;
            }

            checkbox.checked = enabled;
            countInput.value = String(keepCount);
            slider.value = String(Math.min(keepCount, 100));

            // Status update helper
            function refreshStatus() {
                const state = window._cpmLimiterState;
                if (statusEl && state) {
                    const vis = state.getVisibleCount();
                    const total = state.totalMessageCount;
                    statusEl.textContent = enabled
                        ? `📋 ${vis} / ${total || '?'} 메시지 표시 중`
                        : '⏸️ 비활성화됨';
                }
            }
            refreshStatus();

            // ── Event listener management (clean up old listeners on re-render) ──
            const onCheckboxChange = async (ev) => {
                enabled = ev.target.checked;
                setVal('cpm_chat_limiter_enable', enabled);
                await saveState();
                await updateStyles();
                if (enabled) await scrollToLatest();
                refreshStatus();
            };

            async function applyCount(val) {
                if (val > 0) {
                    keepCount = val;
                    setVal('cpm_chat_limiter_count', val);
                    await saveState();
                    await updateStyles();
                    refreshStatus();
                }
            }

            const onSliderInput = (ev) => {
                const val = parseInt(ev.target.value, 10);
                countInput.value = String(val);
                applyCount(val);
            };

            const onCountChange = (ev) => {
                const val = parseInt(ev.target.value, 10);
                if (val > 0) {
                    slider.value = String(Math.min(val, 100));
                    applyCount(val);
                }
            };

            // Remove old listeners before attaching (guards against re-render accumulation)
            if (window._cpmLimiterUICleanup) window._cpmLimiterUICleanup();
            checkbox.addEventListener('change', onCheckboxChange);
            slider.addEventListener('input', onSliderInput);
            countInput.addEventListener('change', onCountChange);
            window._cpmLimiterUICleanup = () => {
                checkbox.removeEventListener('change', onCheckboxChange);
                slider.removeEventListener('input', onSliderInput);
                countInput.removeEventListener('change', onCountChange);
            };
        }
    });

    // ── Initialize ──
    async function init() {
        await loadState();
        try {
            rootDoc = await risuai.getRootDocument();
            detectedSelector = await detectSelector();
            await updateStyles();
            await startObserver();
            console.log(`[CPM Limiter] ✓ v0.2.0 — showing last ${keepCount} of ${totalMessageCount} messages (${enabled ? 'ON' : 'OFF'})`);
        } catch (e) {
            console.warn('[CPM Limiter] DOM init deferred, will apply on first style update.');
        }
    }

    // ── Cleanup ──
    window._cpmLimiterCleanup = async () => {
        stopObserver();
        try {
            if (rootDoc) {
                const styleEl = await rootDoc.querySelector(`[${STYLE_ATTR}]`);
                if (styleEl) await styleEl.setInnerHTML('');
            }
        } catch (_) { /* */ }
        delete window._cpmLimiterState;
        window.CupcakePM_SubPlugins = (window.CupcakePM_SubPlugins || []).filter(p => p.id !== 'cpm-chat-limiter');
    };
    risuai.onUnload(window._cpmLimiterCleanup);

    await init();
})();
