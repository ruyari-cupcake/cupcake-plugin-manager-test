//@name CPM Component - Chat Input Resizer
//@display-name Cupcake UI Resizer
//@version 0.3.7
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager-test2/main/cpm-chat-resizer.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Input Resizer ========
 * 
 * Provides a UI overlay button to expand the chat textareas to fullscreen
 * in RisuAI, resolving mobile input truncation. Hooks into Cupcake PM
 * for its settings tab, but can run entirely standalone.
 */
(async () => {
    // Note: We intentionally don't block the entire script execution here,
    // because RisuAI V3 hot-reloading needs to re-evaluate the event listeners.

    // ── Hot-reload cleanup: tear down previous instance ──
    if (typeof window._cpmResizerCleanup === 'function') {
        try { await window._cpmResizerCleanup(); } catch (_) {}
    }

    if (!window.Risuai && !window.risuai) {
        console.warn('[CPM Resizer] RisuAI API variable missing. Halting plugin.');
        return;
    }
    const risuai = window.risuai || window.Risuai;

    try {
        // ==========================================
        // 1. SETTINGS UI INJECTION (HOOK TO HOST)
        // ==========================================
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-resizer');
        window.CupcakePM_SubPlugins.push({
            id: 'cpm-resizer',
            name: 'Chat Input Resizer',
            description: '텍스트 입력창 모서리에 크기 조절/최대화 버튼을 표시합니다.',
            version: '0.3.5',
            icon: '↕️',
            uiHtml: `
                <div class="mb-2">
                    <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                        <input id="cpm_enable_chat_resizer" type="checkbox" class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                        <span>Enable Chat Input Resizer (입력창 ↕️ 팝업 크기 조절기 활성화)</span>
                    </label>
                </div>
            `,
            onRender: async (container, getArg, setVal) => {
                const checkbox = container.querySelector('#cpm_enable_chat_resizer');
                if (checkbox) {
                    const isEnabled = await getArg('cpm_enable_chat_resizer');
                    checkbox.checked = (isEnabled === 'false' || isEnabled === false) ? false : true;

                    checkbox.addEventListener('change', (ev) => {
                        setVal('cpm_enable_chat_resizer', ev.target.checked);
                        isResizerEnabled = ev.target.checked;
                    });
                }
            }
        });

        const handleSettingsRender = async (e) => {
            const { safeGetArg, registerPlugin } = e.detail;

            // Only inject if the host DOES NOT support the new plugin registry system
            if (typeof registerPlugin !== 'function') {
                // Fallback for older Cupcake PM versions
                const { sidebar, content } = e.detail;
                const tabBtnSrc = `
                    <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-blue-300 font-bold bg-blue-900/10" data-target="tab-cpm-resizer">
                        ↕️ UI Resizer
                    </button>
                `;
                const targetHeader = Array.from(sidebar.querySelectorAll('div')).find(div => div.textContent.includes('Native Providers'));
                if (targetHeader) {
                    targetHeader.insertAdjacentHTML('beforebegin', tabBtnSrc);
                } else {
                    sidebar.querySelector('#cpm-tab-list')?.insertAdjacentHTML('beforeend', tabBtnSrc);
                }

                // For fallback, we still need safeGetArg, but it's passed from the event
                const isEnabled = await safeGetArg('cpm_enable_chat_resizer');
                const isChecked = (isEnabled === 'false' || isEnabled === false) ? '' : 'checked';
                const panelSrc = `
                    <div id="tab-cpm-resizer" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">Chat Input Resizer</h3>
                        <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                            텍스트 입력창 모서리에 크기 조절/최대화 버튼을 표시합니다.
                        </p>
                        <div class="mb-4">
                            <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                                <input id="cpm_enable_chat_resizer" type="checkbox" ${isChecked} class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                                <span>Enable Chat Input Resizer (입력창 ↕️ 팝업 크기 조절기 활성화)</span>
                            </label>
                        </div>
                    </div>
                `;
                content.insertAdjacentHTML('beforeend', panelSrc);
            }
        };

        // Clean up previous listener to prevent duplicates on hot-reload
        if (window.__cpmResizerListener) {
            document.removeEventListener('cupcakepm:render_settings', window.__cpmResizerListener);
        }
        window.__cpmResizerListener = handleSettingsRender;
        document.addEventListener('cupcakepm:render_settings', handleSettingsRender);

        const rootDoc = await risuai.getRootDocument();

        // ==========================================
        // 1.4 CHATVAR PRE-INITIALIZATION (FOLD null fix)
        // ==========================================
        // FOLD module's {{getvar::fold_ui}} returns literal 'null' when
        // the variable hasn't been set yet (getChatVar returns 'null' for
        // undefined keys). Pre-initialise to '' so it renders invisibly.
        // Only runs once at startup; does NOT overwrite if FOLD already set it.
        const preinitChatVars = async () => {
            try {
                const char = await risuai.getCharacter();
                if (!char?.chats || char.chatPage === undefined) return;
                const chat = char.chats[char.chatPage];
                if (!chat) return;
                if (!chat.scriptstate) chat.scriptstate = {};

                let changed = false;
                // fold_ui: FOLD 2.0 module
                if (chat.scriptstate['$fold_ui'] === undefined ||
                    chat.scriptstate['$fold_ui'] === null) {
                    chat.scriptstate['$fold_ui'] = '';
                    changed = true;
                }

                if (changed) {
                    await risuai.setCharacter(char);
                    console.log('[CPM Resizer] Pre-initialized fold_ui chat variable to empty string.');
                }
            } catch (err) {
                console.warn('[CPM Resizer] preinitChatVars error:', err?.message || err);
            }
        };

        // ==========================================
        // 1.5 BACKGROUND NULL SCRUBBER (FOLD-safe)
        // ==========================================
        // RisuAI BackgroundDom container is unique:
        //   <div class="absolute top-0 left-0 w-full h-full">
        // We only scrub this container, so chat/description text is untouched.
        const scrubBackgroundNull = async () => {
            try {
                // NOTE: querySelectorAll is broken in V3 sandbox (SafeElement[] can't
                // be serialized via postMessage structured clone). Use querySelector.
                const overlay = await rootDoc.querySelector('.absolute.top-0.left-0.w-full.h-full');
                if (!overlay) return;

                const html = await overlay.getInnerHTML();
                if (!html || typeof html !== 'string') return;

                // Remove <p>null</p> (from ParseMarkdown wrapping the 'null' string),
                // bare "null" text nodes, and leftover empty <p> tags.
                const cleaned = html
                    .replace(/<p>\s*null\s*<\/p>/gi, '')
                    .replace(/>\s*null\s*</g, '><')
                    .replace(/<p>\s*<\/p>/g, '');

                if (cleaned !== html) {
                    await overlay.setInnerHTML(cleaned);
                    console.log('[CPM Resizer] Scrubbed background null text.');
                }
            } catch (err) {
                console.warn('[CPM Resizer] scrubBackgroundNull error:', err?.message || err);
            }
        };


        // Safe helper to get arguments silently
        const safeGetArg = async (key, defaultValue = '') => {
            try {
                const val = await risuai.getArgument(key);
                return val !== undefined && val !== null && val !== '' ? val : defaultValue;
            } catch {
                return defaultValue;
            }
        };


        // ==========================================
        // 2. CSS ATTRIBUTE INJECTION
        // ==========================================
        const styleId = 'cpm-maximizer-styles';
        if (!(await rootDoc.querySelector(`[x-id="${styleId}"]`))) {
            const styleEl = await rootDoc.createElement('style');
            await styleEl.setAttribute('x-id', styleId);
            // We use [x-cpm-maximized] to trigger the massive detached overlay
            await styleEl.setInnerHTML(`
                textarea[x-cpm-maximized="true"] {
                    position: fixed !important;
                    top: 10vh !important;
                    left: 10vw !important;
                    width: 80vw !important;
                    height: 80vh !important;
                    max-height: none !important;
                    z-index: 999999 !important;
                    background-color: var(--bgcolor, #1e1e2e) !important;
                    padding: 24px !important;
                    box-shadow: 0 0 50px rgba(0, 0, 0, 0.8), 0 0 0 9999px rgba(0, 0, 0, 0.6) !important;
                    border-radius: 12px !important;
                    border: 2px solid var(--borderc, #555) !important;
                    font-size: 1.1em !important;
                    resize: none !important;
                    transition: all 0.2s ease-out !important;
                }
                /* The button itself needs to float on top of the fullscreen textarea */
                button[x-cpm-maximized-btn="true"] {
                    position: fixed !important;
                    bottom: 12vh !important;
                    right: 12vw !important;
                    z-index: 9999999 !important;
                    padding: 12px !important;
                    font-size: 1.5em !important;
                    background: rgba(255, 255, 255, 0.1) !important;
                    backdrop-filter: blur(4px) !important;
                }
            `);
            const head = await rootDoc.querySelector('head');
            if (head) await head.appendChild(styleEl);
        }

        // ==========================================
        // 3. MUTATIONOBSERVER-BASED SPAWN LOGIC
        // ==========================================
        let isResizerEnabled = null;

        // Selectors for textareas that should NOT get a resize button
        // (same exclusion list as RisuTextAreaExpander)
        const EXCLUDE_SELECTORS = [
            '.text-input-area',
            '#messageInputTranslate',
            '.partial-edit-textarea',
        ];

        // Attach 🧁 button to a single SafeElement textarea
        const attachButtonToTextarea = async (ta) => {
            try {
                // Already processed — skip
                const marker = await ta.getAttribute('x-cpm-resizer');
                if (marker) return;

                // Check if this textarea should be excluded (chat input area, etc.)
                let isExcluded = false;
                for (const sel of EXCLUDE_SELECTORS) {
                    try {
                        if (await ta.matches(sel)) { isExcluded = true; break; }
                    } catch (_) {}
                }
                if (isExcluded) {
                    await ta.setAttribute('x-cpm-resizer', 'skip');
                    return;
                }

                await ta.setAttribute('x-cpm-resizer', '1');

                const parent = await ta.getParent();
                if (parent && !(await parent.querySelector('.cpm-resize-btn'))) {

                    const btn = await rootDoc.createElement('button');
                    const btnId = 'cpm-btn-' + Math.random().toString(36).substring(2, 9);
                    await btn.setAttribute('x-id', btnId);

                    await btn.setClassName('cpm-resize-btn');
                    await btn.setStyleAttribute(
                        'position:absolute; bottom:4px; right:4px; z-index:50; ' +
                        'width:24px; height:24px; padding:0; margin:0; ' +
                        'display:flex; align-items:center; justify-content:center; ' +
                        'background:rgba(39,39,42,0.8); color:#a1a1aa; ' +
                        'border:1px solid rgba(63,63,70,0.5); border-radius:4px; ' +
                        'cursor:pointer; font-size:13px; line-height:1; ' +
                        'opacity:0.4;'
                    );
                    await btn.setInnerHTML('🧁');
                    await btn.setAttribute('x-title', '창 최대화 / 크기 조절');

                    let isMaximized = false;

                    await btn.addEventListener('pointerup', async (e) => {
                        let cx = e.clientX ?? e.x ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
                        let cy = e.clientY ?? e.y ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);

                        if (typeof cx === 'number' && typeof cy === 'number') {
                            const rect = await btn.getBoundingClientRect();
                            if (rect) {
                                const rLeft = rect.left ?? rect.x;
                                const rTop = rect.top ?? rect.y;
                                const rRight = rect.right ?? (rLeft + rect.width);
                                const rBottom = rect.bottom ?? (rTop + rect.height);

                                if (cx < rLeft - 5 || cx > rRight + 5 || cy < rTop - 5 || cy > rBottom + 5) {
                                    return;
                                }
                            }
                        }

                        if (!isMaximized) {
                            isMaximized = true;
                            await btn.setInnerHTML('🧁');
                            await ta.setAttribute('x-cpm-maximized', 'true');
                            await btn.setAttribute('x-cpm-maximized-btn', 'true');
                        } else {
                            isMaximized = false;
                            await btn.setInnerHTML('🧁');
                            await ta.setAttribute('x-cpm-maximized', 'false');
                            await btn.setAttribute('x-cpm-maximized-btn', 'false');
                        }
                    });

                    await parent.appendChild(btn);
                }
            } catch (err) {
                console.warn('[CPM Resizer] Failed to attach button:', err);
            }
        };

        // ==========================================
        // 3. LAZY INITIALIZATION VIA EVENT DELEGATION
        // ==========================================
        // V3 SafeElement only allows specific event types (click, pointer*, mouse*,
        // scroll, key*). `focusin` is NOT allowed and throws an error.
        // We use `pointerdown` delegation + MutationObserver instead.
        // When a user taps/clicks any textarea, we lazily attach the button.

        const handlePointerDown = async (e) => {
            if (isResizerEnabled === false) return;
            try {
                // V3 SafeElement proxy: tagName is not a property, use async nodeName()
                let tagName = '';
                if (e && e.target) {
                    try { tagName = (typeof e.target.nodeName === 'function') ? await e.target.nodeName() : (e.target.tagName || ''); } catch (_) {}
                }
                if (!tagName || String(tagName).toLowerCase() !== 'textarea') return;

                const ta = e.target;
                if (!ta) return;

                // Try to read the marker attribute — if it's already set, skip
                let marker = null;
                try { marker = await ta.getAttribute('x-cpm-resizer'); } catch (_) { return; }
                if (marker) return; // Already processed

                await attachButtonToTextarea(ta);
            } catch (err) {
                // Silently ignore — pointerdown may fire on non-SafeElement targets
            }
        };

        // Single initial scan: process at most a small batch to avoid blocking.
        // Remaining textareas will be lazily initialized on click/tap or MutationObserver.
        const initialScan = async () => {
            // Process up to 5 textareas on initial load to cover visible ones
            for (let i = 0; i < 5; i++) {
                try {
                    const ta = await rootDoc.querySelector('textarea:not([x-cpm-resizer])');
                    if (!ta) break;
                    await attachButtonToTextarea(ta);
                } catch (_) { break; }
            }
        };

        // Initialize: check enabled, then start observing
        const initResizer = async () => {
            // Pre-initialise fold_ui so {{getvar::fold_ui}} renders '' not 'null'
            await preinitChatVars();

            // Always run null scrubber once at startup (independent of resizer toggle)
            await scrubBackgroundNull();

            if (isResizerEnabled === null) {
                const arg = await safeGetArg('cpm_enable_chat_resizer');
                isResizerEnabled = (arg === 'false' || arg === false) ? false : true;
            }
            if (isResizerEnabled === false) {
                console.log('[CPM Resizer] Resizer UI disabled by user setting (null scrubber remains active).');
            }

            const body = await rootDoc.querySelector('body');
            if (!body) {
                console.warn('[CPM Resizer] Could not find body element.');
                return;
            }

            // === MutationObserver (PRIMARY mechanism) ===
            // Scans for new unprocessed textareas whenever DOM changes.
            // Debounced to 400ms. Processes up to 3 textareas per trigger
            // to handle batch renders (e.g., opening a character editor).
            let scanPending = false;
            let nullScrubPending = false;
            const observer = await risuai.createMutationObserver(async () => {
                if (isResizerEnabled !== false) {
                    if (!scanPending) {
                        scanPending = true;
                        setTimeout(async () => {
                            scanPending = false;
                            try {
                                for (let i = 0; i < 3; i++) {
                                    const ta = await rootDoc.querySelector('textarea:not([x-cpm-resizer])');
                                    if (!ta) break;
                                    await attachButtonToTextarea(ta);
                                }
                            } catch (_) {}
                        }, 400);
                    }
                }

                if (!nullScrubPending) {
                    nullScrubPending = true;
                    setTimeout(async () => {
                        nullScrubPending = false;
                        await scrubBackgroundNull();
                    }, 250);
                }
            });
            await observer.observe(body, { childList: true, subtree: true });
            window._cpmResizerObserver = observer;
            console.log('[CPM Resizer] MutationObserver active (primary).');

            if (isResizerEnabled !== false) {
                // === pointerdown delegation (BACKUP for lazy init) ===
                // When user taps/clicks a textarea, attach button if not yet processed.
                // pointerdown IS in the SafeElement allowed event list (unlike focusin).
                if (window._cpmResizerPointerListenerId) {
                    try { await body.removeEventListener('pointerdown', window._cpmResizerPointerListenerId); } catch (_) {}
                }
                try {
                    window._cpmResizerPointerListenerId = await body.addEventListener('pointerdown', handlePointerDown);
                    console.log('[CPM Resizer] pointerdown delegation active (backup).');
                } catch (evtErr) {
                    console.warn('[CPM Resizer] pointerdown listener failed:', evtErr.message);
                }

                // Small initial scan for textareas already visible
                await initialScan();
            }
        };

        // Cleanup function for hot-reload
        window._cpmResizerCleanup = async () => {
            try {
                const body = await rootDoc.querySelector('body');
                if (body && window._cpmResizerPointerListenerId) {
                    await body.removeEventListener('pointerdown', window._cpmResizerPointerListenerId);
                }
            } catch (_) {}
            window._cpmResizerPointerListenerId = null;
            if (window._cpmResizerObserver) {
                try { await window._cpmResizerObserver.disconnect(); } catch (_) {}
                window._cpmResizerObserver = null;
            }
        };

        risuai.onUnload(window._cpmResizerCleanup);

        await initResizer();

        console.log('[CPM Resizer] Loaded and ready.');

    } catch (err) {
        console.error('[CPM Resizer] Initialization error:', err);
    }
})();
