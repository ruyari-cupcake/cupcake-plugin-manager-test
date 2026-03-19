//@name CPM Component - Auto Translate Last Char Alpha
//@display-name Auto Translate Last Char Alpha
//@version 0.1.0
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager-test/main/cpm-auto-translate-last-char-poc.js

(function (window) {
    const risuai = window.risuai || window.Risuai;
    const CPM = window.CupcakePM;
    if (!risuai || !CPM) return;

    let enabled = false;
    let lastMessageKey = '';
    let lastFocusedIndex = -1;
    let pendingRetryCount = 0;
    let status = '대기 중';

    function setStatus(next) {
        status = next;
        const el = window.document?.getElementById('cpm-auto-trans-last-char-status');
        if (el) el.textContent = next;
    }

    async function getLatestMessage() {
        const char = await risuai.getChar();
        const chat = char?.chats?.[char?.chatPage || 0];
        const messages = Array.isArray(chat?.message) ? chat.message : [];
        return {
            latest: messages[messages.length - 1] || null,
            count: messages.length,
        };
    }

    async function pickTargetTranslateButton() {
        const rootDoc = await risuai.getRootDocument();
        const buttons = await rootDoc.querySelectorAll('button.button-icon-translate');
        const count = Array.isArray(buttons) ? buttons.length : 0;
        if (!count) return { button: null, index: -1, count: 0 };

        for (let index = count - 1; index >= 0; index--) {
            const button = buttons[index];
            const isTranslated = await button.hasClass('text-blue-400');
            if (!isTranslated) {
                return { button, index, count };
            }
        }

        return { button: null, index: count - 1, count };
    }

    async function inspectLatestMessage() {
        const latestInfo = await getLatestMessage();
        const latest = latestInfo.latest;
        if (!latest || latest.role !== 'char') return;

        const messageKey = [latest.chatId || '', latest.role || '', latest.data || '', String(latestInfo.count)].join('::');
        const target = await pickTargetTranslateButton();

        if (target.count > 0 && !target.button) {
            lastFocusedIndex = target.index;
            pendingRetryCount = 0;
            lastMessageKey = messageKey;
            setStatus('이미 번역 상태');
            return;
        }

        if (!target.count || !target.button) {
            pendingRetryCount += 1;
            lastMessageKey = messageKey;
            setStatus(`번역 버튼 대기 중 (${pendingRetryCount}회)`);
            return;
        }

        lastFocusedIndex = target.index;

        if (lastMessageKey === messageKey && pendingRetryCount === 0) {
            return;
        }

        const isTranslated = await target.button.hasClass('text-blue-400');
        if (isTranslated) {
            pendingRetryCount = 0;
            lastMessageKey = messageKey;
            setStatus('이미 번역 상태');
            return;
        }

        if (!enabled) return;

        await target.button.focus();
        pendingRetryCount = 0;
        lastMessageKey = messageKey;
        setStatus(`포커스 완료 (#${target.index + 1})`);
    }

    function cleanup() {
        setStatus('정리됨');
    }

    const api = {
        __test: {
            pickTargetTranslateButton,
            inspectLatestMessage,
            setEnabledForTest(value) { enabled = !!value; },
            getLastFocusedIndex() { return lastFocusedIndex; },
            getPendingRetryCount() { return pendingRetryCount; },
            getStatus() { return status; },
        }
    };

    window._cpmAutoTranslateLastCharAlpha = api;
    window._cpmAutoTranslateLastCharPoc = api;
    window._cpmAutoTranslateLastCharPocCleanup = cleanup;

    CPM.registerProvider({
        name: 'AutoTranslateLastCharAlpha',
        settingsTab: {
            id: 'tab-auto-translate-last-char-alpha',
            icon: '🈯',
            label: 'Auto Translate',
            exportKeys: ['cpm_auto_translate_last_char_enabled'],
            renderContent: async () => '<div id="cpm-auto-trans-last-char-status">대기 중</div>'
        }
    });
})(window);