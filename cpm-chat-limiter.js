//@name CPM Component - Chat Limiter
//@display-name 🧁 Cupcake Chat Limiter
//@version 0.1.0
//@description 최신 N개 채팅만 표시하여 렉 제거
//@icon 📋
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager-test2/main/cpm-chat-limiter.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Limiter v0.1.0 ========
 *
 * Limits visible chat messages to the most recent N, reducing
 * rendering lag on long conversations. Uses CSS nth-child to hide
 * older messages without DOM removal.
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
    const CSS_SELECTORS = [
        '.flex-col-reverse > .chat-message-container',
        '.chat-message-list > .chat-message-container',
        '[class*="chat"] > [class*="message"]',
        '.message-container'
    ];

    let enabled = true;
    let keepCount = 6;
    let detectedSelector = null;
    let rootDoc = null;

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
    }

    // ── Persistence ──
    async function loadState() {
        try {
            const saved = await risuai.safeLocalStorage.getItem(STORAGE_KEY);
            if (saved !== null) enabled = JSON.parse(saved);
        } catch (_) { /* */ }
    }

    async function saveState() {
        try {
            await risuai.safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
        } catch (_) { /* */ }
    }

    // ── CPM Settings Panel Integration ──
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-chat-limiter');
    window.CupcakePM_SubPlugins.push({
        id: 'cpm-chat-limiter',
        name: 'Chat Limiter',
        description: '최신 N개 채팅만 표시하여 렉을 제거합니다.',
        version: '0.1.0',
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
                <input id="cpm_chat_limiter_count" type="number" min="1" max="200" value="6"
                    class="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-gray-200 text-sm focus:ring-blue-500 focus:border-blue-500">
            </div>
        `,
        onRender: async (container, getArg, setVal) => {
            const checkbox = container.querySelector('#cpm_chat_limiter_enable');
            const countInput = container.querySelector('#cpm_chat_limiter_count');

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

            checkbox.addEventListener('change', async (ev) => {
                enabled = ev.target.checked;
                setVal('cpm_chat_limiter_enable', enabled);
                await saveState();
                await updateStyles();
            });

            countInput.addEventListener('change', async (ev) => {
                const val = parseInt(ev.target.value, 10);
                if (val > 0) {
                    keepCount = val;
                    setVal('cpm_chat_limiter_count', val);
                    await updateStyles();
                }
            });
        }
    });

    // ── Initialize ──
    async function init() {
        await loadState();
        try {
            rootDoc = await risuai.getRootDocument();
            detectedSelector = await detectSelector();
            await updateStyles();
            console.log(`[CPM Limiter] ✓ Initialized — showing last ${keepCount} messages (${enabled ? 'ON' : 'OFF'})`);
        } catch (e) {
            console.warn('[CPM Limiter] DOM init deferred, will apply on first style update.');
        }
    }

    // ── Cleanup ──
    window._cpmLimiterCleanup = async () => {
        try {
            if (rootDoc) {
                const styleEl = await rootDoc.querySelector(`[${STYLE_ATTR}]`);
                if (styleEl) await styleEl.setInnerHTML('');
            }
        } catch (_) { /* */ }
        window.CupcakePM_SubPlugins = (window.CupcakePM_SubPlugins || []).filter(p => p.id !== 'cpm-chat-limiter');
    };
    risuai.onUnload(window._cpmLimiterCleanup);

    await init();
})();
