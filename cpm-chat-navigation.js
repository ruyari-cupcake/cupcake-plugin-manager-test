//@name CPM Component - Chat Navigation
//@display-name 🧁 Cupcake Navigation
//@version 2.1.6
//@description 채팅 메시지 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환, Chat Limiter 연동)
//@icon 🧭
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager-test2/main/cpm-chat-navigation.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Navigation v2.1.6 ========
 *
 * chat 버튼을 누를 때마다 모드가 순환:
 *   1번 → 4버튼 위젯 (⏫🔼🔽⏬, 드래그 가능)
 *   2번 → 2버튼 위젯 (🔼🔽, 드래그 가능)
 *   3번 → 키보드 모드 (↑↓←→ 방향키)
 *   4번 → OFF
 */
(async () => {
    const LOG_PREFIX = '[CPM Navi]';
    const WIDGET_ATTR_KEY = 'x-cpmnavi-widget';
    const WIDGET_ATTR_VAL = 'container';
    // 모드: 'four' → 'two' → 'keyboard' → 'off' → 'four' ...
    const MODES = ['four', 'two', 'keyboard', 'off'];
    const MODE_LABELS = { four: '4버튼', two: '2버튼', keyboard: '⌨️키보드', off: 'OFF' };

    if (!window.Risuai && !window.risuai) {
        console.warn(`${LOG_PREFIX} RisuAI API not found. Halting.`);
        return;
    }
    const risuai = window.risuai || window.Risuai;

    // ── Hot-reload cleanup: tear down ALL previous resources ──
    if (typeof window._cpmNaviCleanup === 'function') {
        try { await window._cpmNaviCleanup(); } catch (e) { console.warn(`${LOG_PREFIX} Previous cleanup error:`, e); }
    }

    // ── State ──
    let rootDoc = null;
    let containerSelector = null;
    let currentIndex = 1;
    let isReady = false;
    let widgetElement = null;
    let containerPollTimer = null;
    let currentModeIndex = -1; // starts at -1 so first press → 0 (four)

    // Drag state
    let isDragging = false;
    let dragShiftX = 0;
    let dragShiftY = 0;
    let globalPointerMoveId = null;
    let globalPointerUpId = null;
    let widgetBodyRef = null; // FIX-B: createWidget에서 사용한 body 참조 보존

    // Button refs for hit-test
    let upBtnRef = null;
    let downBtnRef = null;
    let topBtnRef = null;
    let bottomBtnRef = null;
    let handleRef = null;

    // Keyboard listener
    let keyListenerId = null;
    let keyListenerBody = null; // FIX-A: body 참조 보존 (SafeElement 인스턴스 동일성 보장)

    // Chat screen observer
    let domObserver = null;
    let observerTimer = null;
    let lastChatScreenState = null;

    // ── Settings UI Registration ──
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-navigation');
    window.CupcakePM_SubPlugins.push({
        id: 'cpm-navigation',
        name: 'Chat Navigation',
        description: '채팅 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환)',
        version: '2.1.2',
        icon: '🧭'
    });

    // ── Root Document 획득 ──
    const initRootDoc = async () => {
        for (let retry = 0; retry < 5; retry++) {
            try {
                rootDoc = await risuai.getRootDocument();
                if (rootDoc) {
                    console.log(`${LOG_PREFIX} rootDoc 획득 성공`);
                    return true;
                }
            } catch (e) {
                console.log(`${LOG_PREFIX} rootDoc 획득 실패 (${retry + 1}/5)`);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        console.error(`${LOG_PREFIX} rootDoc 획득 포기`);
        return false;
    };

    // ── 채팅 컨테이너 탐색 ──
    const findChatContainer = async () => {
        const selectors = [
            '.flex-col-reverse:nth-of-type(2)',
            '.flex-col-reverse:nth-of-type(1)',
            'main .flex-col-reverse',
            '.flex-col-reverse'
        ];
        for (const sel of selectors) {
            try {
                const container = await rootDoc.querySelector(sel);
                if (container) {
                    const children = await container.getChildren();
                    if (children && children.length >= 2) {
                        // FIX-2: INNER 컨테이너인지 검증 (.chat-message-container 자식 확인)
                        const msgChild = await rootDoc.querySelector(`${sel} > .chat-message-container`);
                        if (msgChild) {
                            containerSelector = sel;
                            return true;
                        }
                        // .chat-message-container 없으면 OUTER일 수 있음 → 다음 셀렉터 시도
                    }
                }
            } catch (_) {}
        }
        return false;
    };

    // ── 메시지 수 (Chat Limiter 연동) ──
    const getMessageCount = async () => {
        try {
            if (!containerSelector) return 0;
            const container = await rootDoc.querySelector(containerSelector);
            if (!container) return 0;
            const children = await container.getChildren();
            const total = children ? children.length : 0;
            // Chat Limiter가 활성화되어 있으면 visible count로 클램핑
            const limiter = window._cpmLimiterState;
            if (limiter && limiter.enabled) {
                return Math.min(total, limiter.keepCount);
            }
            return total;
        } catch (_) {
            return 0;
        }
    };

    // ── 스크롤 함수들 ──
    const goToTop = async () => {
        if (!isReady) return;
        try {
            const count = await getMessageCount();
            if (count === 0) return;
            const sel = `${containerSelector} > *:nth-child(${count})`;
            const el = await rootDoc.querySelector(sel);
            if (el) {
                await el.scrollIntoView(true);
                currentIndex = count;
            }
        } catch (e) { console.error(`${LOG_PREFIX} goToTop:`, e); }
    };

    const goToBottom = async () => {
        if (!isReady) return;
        try {
            const sel = `${containerSelector} > *:nth-child(1)`;
            const el = await rootDoc.querySelector(sel);
            if (el) {
                await el.scrollIntoView(true);
                currentIndex = 1;
            }
        } catch (e) { console.error(`${LOG_PREFIX} goToBottom:`, e); }
    };

    const scrollUp = async () => {
        if (!isReady) return;
        try {
            const count = await getMessageCount();
            if (count === 0) return;
            // FIX-1: keepCount 변경 시 currentIndex를 가시 범위로 클램핑
            if (currentIndex > count) currentIndex = count;
            if (currentIndex < count) currentIndex++;
            const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
            const el = await rootDoc.querySelector(sel);
            if (el) await el.scrollIntoView(true);
        } catch (e) { console.error(`${LOG_PREFIX} scrollUp:`, e); }
    };

    const scrollDown = async () => {
        if (!isReady) return;
        try {
            const count = await getMessageCount();
            if (count === 0) return;
            // FIX-1: keepCount 변경 시 currentIndex를 가시 범위로 클램핑
            if (currentIndex > count) currentIndex = count;
            if (currentIndex > 1) currentIndex--;
            const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
            const el = await rootDoc.querySelector(sel);
            if (el) await el.scrollIntoView(true);
        } catch (e) { console.error(`${LOG_PREFIX} scrollDown:`, e); }
    };

    // ── 모바일 터치 Fix ──
    const applyMobileFix = async () => {
        try {
            if (!widgetElement) return;
            const divs = await widgetElement.querySelectorAll('div');
            for (const div of divs) {
                await div.setStyle('touch-action', 'none');
            }
        } catch (_) {}
    };

    // ── 위젯 제거 ──
    const destroyWidget = async () => {
        try {
            const existing = await rootDoc.querySelector(`[${WIDGET_ATTR_KEY}="${WIDGET_ATTR_VAL}"]`);
            if (existing) await existing.remove();
            widgetElement = null;
            // FIX-B: 동일 SafeElement 인스턴스로 removeEventListener 호출
            if (widgetBodyRef) {
                if (globalPointerMoveId) { await widgetBodyRef.removeEventListener('pointermove', globalPointerMoveId); globalPointerMoveId = null; }
                if (globalPointerUpId) { await widgetBodyRef.removeEventListener('pointerup', globalPointerUpId); globalPointerUpId = null; }
            }
            widgetBodyRef = null;
            topBtnRef = upBtnRef = downBtnRef = bottomBtnRef = handleRef = null;
        } catch (_) {}
    };

    // ── 키보드 리스너 등록/해제 ──
    const enableKeyboard = async () => {
        if (keyListenerId) return; // 이미 등록됨
        try {
            const body = await rootDoc.querySelector('body');
            if (!body) return;
            keyListenerBody = body; // FIX-A: 참조 보존
            keyListenerId = await body.addEventListener('keydown', async (e) => {
                try {
                    // V3 SafeElement proxy: use async nodeName() instead of sync tagName
                    let tag = '';
                    if (e && e.target) {
                        try { tag = (typeof e.target.nodeName === 'function') ? String(await e.target.nodeName()).toLowerCase() : (e.target.tagName ? String(e.target.tagName).toLowerCase() : ''); } catch (_) {}
                    }
                    if (tag === 'input' || tag === 'textarea') return;
                    // isContentEditable is not exposed on V3 SafeElement — skip check gracefully
                    try { if (e.target && e.target.isContentEditable) return; } catch (_) {}
                } catch (_) {}

                switch (e.key) {
                    case 'ArrowUp':    await scrollUp();     break;
                    case 'ArrowDown':  await scrollDown();   break;
                    case 'ArrowLeft':  await goToTop();      break;
                    case 'ArrowRight': await goToBottom();   break;
                }
            });
            console.log(`${LOG_PREFIX} 키보드 리스너 등록`);
        } catch (e) {
            console.error(`${LOG_PREFIX} 키보드 등록 실패:`, e);
        }
    };

    const disableKeyboard = async () => {
        if (!keyListenerId) return;
        try {
            // FIX-A: 동일 SafeElement 인스턴스로 removeEventListener 호출
            if (keyListenerBody) {
                await keyListenerBody.removeEventListener('keydown', keyListenerId);
            }
        } catch (_) {}
        keyListenerId = null;
        keyListenerBody = null;
        console.log(`${LOG_PREFIX} 키보드 리스너 해제`);
    };

    // ── 플로팅 위젯 생성 ──
    // mode: 'four' = ⏫🔼🔽⏬,  'two' = 🔼🔽
    const createWidget = async (mode) => {
        try {
            const body = await rootDoc.querySelector('body');
            widgetBodyRef = body; // FIX-B: 참조 보존

            const theme = {
                handle: 'rgba(255, 255, 255, 0.3)',
                handleActive: 'rgba(255, 255, 255, 0.8)',
                btnBg: 'rgba(255, 255, 255, 0.05)',
                btnBorder: 'rgba(255, 255, 255, 0.2)',
                btnColor: 'rgba(255, 255, 255, 0.9)'
            };

            const container = await rootDoc.createElement('div');
            await container.setAttribute(WIDGET_ATTR_KEY, WIDGET_ATTR_VAL);
            await container.setStyleAttribute(`
                position: fixed;
                bottom: 100px;
                right: 20px;
                width: 60px !important;
                height: auto !important;
                display: flex;
                flex-direction: column;
                gap: 8px;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                padding: 8px;
                padding-top: 6px;
                border-radius: 12px;
                background-color: rgba(0, 0, 0, 0);
                user-select: none;
                -webkit-user-select: none;
                cursor: default;
                touch-action: none;
            `);

            // Drag Handle
            const dragHandle = await rootDoc.createElement('div');
            await dragHandle.setStyleAttribute(`
                width: 32px;
                height: 8px;
                background-color: ${theme.handle};
                border-radius: 4px;
                cursor: move;
                margin-bottom: 2px;
                flex-shrink: 0;
                pointer-events: none;
                transition: background-color 0.2s;
            `);

            const btnStyle = `
                width: 40px !important;
                height: 40px !important;
                border-radius: 50%;
                border: 1px solid ${theme.btnBorder};
                background: ${theme.btnBg};
                color: ${theme.btnColor};
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                pointer-events: none;
                transition: background 0.2s;
            `;
            const iconStyle = 'pointer-events: none; width: 24px; height: 24px;';

            // 공통 버튼: 🔼 🔽
            const upBtn = await rootDoc.createElement('div');
            await upBtn.setStyleAttribute(btnStyle);
            await upBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`);

            const downBtn = await rootDoc.createElement('div');
            await downBtn.setStyleAttribute(btnStyle);
            await downBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`);

            handleRef = dragHandle;
            upBtnRef = upBtn;
            downBtnRef = downBtn;
            topBtnRef = null;
            bottomBtnRef = null;

            // Assemble
            await container.appendChild(dragHandle);

            if (mode === 'four') {
                const topBtn = await rootDoc.createElement('div');
                await topBtn.setStyleAttribute(btnStyle);
                await topBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 11-6-6-6 6"/><path d="m18 17-6-6-6 6"/></svg>`);
                topBtnRef = topBtn;
                await container.appendChild(topBtn);
            }

            await container.appendChild(upBtn);
            await container.appendChild(downBtn);

            if (mode === 'four') {
                const bottomBtn = await rootDoc.createElement('div');
                await bottomBtn.setStyleAttribute(btnStyle);
                await bottomBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 7 6 6 6-6"/><path d="m6 13 6 6 6-6"/></svg>`);
                bottomBtnRef = bottomBtn;
                await container.appendChild(bottomBtn);
            }

            await body.appendChild(container);
            widgetElement = container;
            await applyMobileFix();

            // ── Click Handler (hit-test) ──
            await container.addEventListener('click', async (e) => {
                if (isDragging) return;
                const cx = e.clientX;
                const cy = e.clientY;
                if (cx === undefined || cy === undefined) return;

                const hitTest = async (ref, action) => {
                    if (!ref) return false;
                    const rect = await ref.getBoundingClientRect();
                    if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                        await action();
                        return true;
                    }
                    return false;
                };

                if (topBtnRef && await hitTest(topBtnRef, goToTop)) return;
                if (await hitTest(upBtnRef, scrollUp)) return;
                if (await hitTest(downBtnRef, scrollDown)) return;
                if (bottomBtnRef && await hitTest(bottomBtnRef, goToBottom)) return;
            });

            // ── Drag Handler (pointer + touch fallback for mobile) ──
            // Helper: extract coordinates from pointer, touch, or mouse events
            const getEventXY = (e) => {
                if (e.clientX !== undefined && e.clientY !== undefined) return { x: e.clientX, y: e.clientY };
                const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
                if (t) return { x: t.clientX, y: t.clientY };
                return { x: undefined, y: undefined };
            };

            try {
                const onDragStart = async (e) => {
                    // pointer events have button, touch events don't
                    if (e.button !== undefined && e.button !== 0 && e.button !== -1) return;
                    const { x: cx, y: cy } = getEventXY(e);
                    if (cx === undefined || cy === undefined || !handleRef) return;

                    const handleRect = await handleRef.getBoundingClientRect();
                    const isInsideHandle =
                        cx >= handleRect.left && cx <= handleRect.right &&
                        cy >= handleRect.top && cy <= handleRect.bottom;
                    if (!isInsideHandle) return;

                    isDragging = true;
                    const rect = await container.getBoundingClientRect();
                    dragShiftX = cx - rect.left;
                    dragShiftY = cy - rect.top;

                    await dragHandle.setStyle('backgroundColor', theme.handleActive);

                    // Clean up previous listeners
                    if (globalPointerMoveId) await body.removeEventListener('pointermove', globalPointerMoveId);
                    if (globalPointerUpId) await body.removeEventListener('pointerup', globalPointerUpId);

                    const onDragMove = async (ev) => {
                        if (!isDragging || !widgetElement) return;
                        if (ev.preventDefault) ev.preventDefault();
                        const { x: mx, y: my } = getEventXY(ev);
                        if (mx === undefined || my === undefined) return;
                        const newX = mx - dragShiftX;
                        const newY = my - dragShiftY;
                        await widgetElement.setStyle('bottom', 'auto');
                        await widgetElement.setStyle('right', 'auto');
                        await widgetElement.setStyle('left', `${newX}px`);
                        await widgetElement.setStyle('top', `${newY}px`);
                    };

                    const onDragEnd = async () => {
                        if (isDragging) {
                            isDragging = false;
                            if (handleRef) await handleRef.setStyle('backgroundColor', theme.handle);
                        }
                        if (globalPointerMoveId) await body.removeEventListener('pointermove', globalPointerMoveId);
                        if (globalPointerUpId) await body.removeEventListener('pointerup', globalPointerUpId);
                        globalPointerMoveId = globalPointerUpId = null;
                    };

                    globalPointerMoveId = await body.addEventListener('pointermove', onDragMove);
                    globalPointerUpId = await body.addEventListener('pointerup', onDragEnd);
                };

                await container.addEventListener('pointerdown', onDragStart);
            } catch (dragErr) {
                console.error(`${LOG_PREFIX} Drag setup error:`, dragErr);
            }

        } catch (e) {
            console.error(`${LOG_PREFIX} createWidget error:`, e);
        }
    };

    // ── 모드 순환 ──
    const cycleMode = async () => {
        currentModeIndex = (currentModeIndex + 1) % MODES.length;
        const mode = MODES[currentModeIndex];
        console.log(`${LOG_PREFIX} 모드 전환: ${MODE_LABELS[mode]}`);

        // 이전 상태 모두 정리
        await destroyWidget();
        await disableKeyboard();

        switch (mode) {
            case 'four':
                await createWidget('four');
                break;
            case 'two':
                await createWidget('two');
                break;
            case 'keyboard':
                await enableKeyboard();
                break;
            case 'off':
                // 모든 것 비활성화 (이미 위에서 정리됨)
                break;
        }
    };

    // ── Chat screen observer (위젯 자동 숨김/표시) ──
    const checkChatScreen = async () => {
        try {
            const chatContainer = await rootDoc.querySelector('.flex-col-reverse');
            const isOnChat = !!chatContainer;
            if (isOnChat === lastChatScreenState) return;
            lastChatScreenState = isOnChat;
            if (isOnChat) {
                if (widgetElement) await widgetElement.setStyle('display', 'flex');
            } else {
                if (widgetElement) await widgetElement.setStyle('display', 'none');
            }
        } catch (_) {}
    };

    const startChatObserver = async () => {
        if (domObserver) return;
        try {
            const body = await rootDoc.querySelector('body');
            domObserver = await risuai.createMutationObserver(async () => {
                if (observerTimer) clearTimeout(observerTimer);
                observerTimer = setTimeout(checkChatScreen, 300);
            });
            await domObserver.observe(body, { childList: true, subtree: true });
        } catch (_) {}
    };

    // ── 초기화 ──
    if (!await initRootDoc()) {
        console.error(`${LOG_PREFIX} 초기화 실패: rootDoc 없음`);
        return;
    }

    // ── Chat 버튼 (모드 순환) ──
    try {
        await risuai.registerButton({
            name: '🧭 네비게이션',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`,
            iconType: 'html',
            location: 'chat'
        }, async () => {
            await cycleMode();
        });
        console.log(`${LOG_PREFIX} chat 버튼 등록 완료 (모드 순환)`);
    } catch (e) {
        console.error(`${LOG_PREFIX} chat 버튼 등록 실패:`, e);
    }

    // ── Chat observer + Container 탐색 ──
    await startChatObserver();
    await checkChatScreen();

    const tryFindContainer = async () => {
        for (let i = 0; i < 10; i++) {
            if (await findChatContainer()) {
                isReady = true;
                console.log(`${LOG_PREFIX} ✅ 네비게이션 준비 완료!`);
                return;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        console.warn(`${LOG_PREFIX} 채팅 컨테이너 못 찾음 - 채팅 화면에서 다시 시도됩니다.`);
    };

    tryFindContainer();

    // FIX-3: Limiter keepCount 변경 시 currentIndex 즉시 클램핑
    const onLimiterChange = (e) => {
        try {
            const { enabled: limEnabled, keepCount: limKeep } = e.detail;
            if (limEnabled && currentIndex > limKeep) {
                currentIndex = Math.max(1, limKeep);
            }
        } catch (_) {}
    };
    window.addEventListener('cpm-limiter-change', onLimiterChange);

    containerPollTimer = setInterval(async () => {
        if (!isReady || !containerSelector) {
            const found = await findChatContainer();
            if (found) isReady = true;
        }
    }, 3000);

    // ── Hot-reload cleanup function ──
    // Registered on window so the NEXT execution can call it to tear down
    // all listeners, timers, observers, and DOM elements from THIS instance.
    window._cpmNaviCleanup = async () => {
        console.log(`${LOG_PREFIX} Cleanup: tearing down previous instance...`);
        // 1. Clear setInterval
        if (containerPollTimer) { clearInterval(containerPollTimer); containerPollTimer = null; }
        if (observerTimer) { clearTimeout(observerTimer); observerTimer = null; }
        // 2. Disconnect MutationObserver
        if (domObserver) { try { await domObserver.disconnect(); } catch (_) {} domObserver = null; }
        // 3. Remove keyboard listener
        await disableKeyboard();
        // 4. Destroy floating widget + its event listeners
        await destroyWidget();
        // 5. Reset state
        isReady = false;
        lastChatScreenState = null;
        currentModeIndex = -1;
        // 6. FIX-3: Remove limiter listener
        window.removeEventListener('cpm-limiter-change', onLimiterChange);
    };

    risuai.onUnload(window._cpmNaviCleanup);

    console.log(`${LOG_PREFIX} 초기화 완료 (v2.1.6 모드 순환)`);
})();
