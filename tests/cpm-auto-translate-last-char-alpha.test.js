/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const PLUGIN_SOURCE = readFileSync(resolve(ROOT, 'cpm-auto-translate-last-char-poc.js'), 'utf-8');

function flush() {
    return new Promise((resolveFlush) => setTimeout(resolveFlush, 0));
}

function createButton(isTranslated = false) {
    return {
        isTranslated,
        focus: vi.fn(async () => {}),
        hasClass: vi.fn(async (className) => className === 'text-blue-400' && isTranslated),
    };
}

function installPlugin({ messages, isStreaming = false, buttons = [] } = {}) {
    let registeredProvider = null;

    const rootDoc = {
        querySelectorAll: vi.fn(async (selector) => {
            if (selector === 'button.button-icon-translate') {
                return buttons;
            }
            return [];
        }),
        querySelector: vi.fn(async (selector) => {
            if (selector === 'body') {
                return { tagName: 'BODY' };
            }
            return null;
        }),
    };

    const risuai = {
        getChar: vi.fn(async () => ({
            chatPage: 0,
            chats: [
                {
                    isStreaming,
                    message: messages ?? [],
                },
            ],
        })),
        getRootDocument: vi.fn(async () => rootDoc),
        createMutationObserver: vi.fn(async (callback) => ({
            callback,
            observe: vi.fn(async () => {}),
            disconnect: vi.fn(async () => {}),
        })),
    };

    const CupcakePM = {
        registerProvider: vi.fn((provider) => {
            registeredProvider = provider;
        }),
        safeGetArg: vi.fn(async (key) => {
            if (key === 'cpm_auto_translate_last_char_enabled') return 'false';
            if (key === 'cpm_auto_translate_last_char_debug') return 'false';
            if (key === 'cpm_auto_translate_last_char_poll_ms') return '1200';
            return null;
        }),
        setArg: vi.fn(),
    };

    const windowObj = {
        risuai,
        Risuai: risuai,
        CupcakePM,
        document,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        console,
    };

    const runner = new Function('window', PLUGIN_SOURCE);
    runner(windowObj);

    return {
        api: windowObj._cpmAutoTranslateLastCharAlpha,
        cleanup: windowObj._cpmAutoTranslateLastCharPocCleanup,
        CupcakePM,
        registeredProvider,
        risuai,
        rootDoc,
    };
}

describe('cpm-auto-translate-last-char Alpha', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '<div id="cpm-auto-trans-last-char-status"></div>';
    });

    afterEach(async () => {
        if (window._cpmAutoTranslateLastCharPocCleanup) {
            await window._cpmAutoTranslateLastCharPocCleanup();
        }
        delete window._cpmAutoTranslateLastCharPocCleanup;
        delete window._cpmAutoTranslateLastCharPoc;
        delete window._cpmAutoTranslateLastCharAlpha;
        document.body.innerHTML = '';
    });

    it('picks the last untranslated translate button', async () => {
        const buttons = [createButton(true), createButton(false), createButton(true)];
        const env = installPlugin({
            messages: [{ chatId: 'char-1', role: 'char', data: 'hello' }],
            buttons,
        });

        await flush();

        const target = await env.api.__test.pickTargetTranslateButton();

        expect(target.index).toBe(1);
        expect(target.count).toBe(3);
        expect(target.button).toBe(buttons[1]);
    });

    it('focuses the last untranslated button for a new char message', async () => {
        const buttons = [createButton(true), createButton(false), createButton(true)];
        const env = installPlugin({
            messages: [{ chatId: 'char-2', role: 'char', data: 'hello' }],
            buttons,
        });

        await flush();
        env.api.__test.setEnabledForTest(true);
        await env.api.__test.inspectLatestMessage();

        expect(buttons[1].focus).toHaveBeenCalledTimes(1);
        expect(env.api.__test.getLastFocusedIndex()).toBe(1);
        expect(env.api.__test.getStatus()).toContain('포커스 완료');
    });

    it('does not focus when the newest translate button is already translated', async () => {
        const buttons = [createButton(true), createButton(true)];
        const env = installPlugin({
            messages: [{ chatId: 'char-3', role: 'char', data: 'hello' }],
            buttons,
        });

        await flush();
        env.api.__test.setEnabledForTest(true);
        await env.api.__test.inspectLatestMessage();

        expect(buttons[0].focus).not.toHaveBeenCalled();
        expect(buttons[1].focus).not.toHaveBeenCalled();
        expect(env.api.__test.getLastFocusedIndex()).toBe(1);
        expect(env.api.__test.getStatus()).toContain('이미 번역 상태');
    });

    it('retries the same char message when the translate button appears later', async () => {
        const buttons = [];
        const env = installPlugin({
            messages: [{ chatId: 'char-4', role: 'char', data: 'hello' }],
            buttons,
        });

        await flush();
        env.api.__test.setEnabledForTest(true);
        await env.api.__test.inspectLatestMessage();

        expect(env.api.__test.getStatus()).toContain('번역 버튼 대기 중');
        expect(env.api.__test.getPendingRetryCount()).toBe(1);

        const lateButton = createButton(false);
        buttons.push(lateButton);

        await env.api.__test.inspectLatestMessage();

        expect(lateButton.focus).toHaveBeenCalledTimes(1);
        expect(env.api.__test.getLastFocusedIndex()).toBe(0);
        expect(env.api.__test.getPendingRetryCount()).toBe(0);
        expect(env.api.__test.getStatus()).toContain('포커스 완료');
    });

    it('increments pending retry count while waiting for the translate button', async () => {
        const env = installPlugin({
            messages: [{ chatId: 'char-5', role: 'char', data: 'hello' }],
            buttons: [],
        });

        await flush();
        env.api.__test.setEnabledForTest(true);

        await env.api.__test.inspectLatestMessage();
        await env.api.__test.inspectLatestMessage();

        expect(env.api.__test.getPendingRetryCount()).toBe(2);
        expect(env.api.__test.getStatus()).toContain('2회');
    });

    it('distinguishes new messages even when chatId is missing', async () => {
        const messages = [{ role: 'char', data: 'same text' }];
        const button = createButton(false);
        const env = installPlugin({
            messages,
            buttons: [button],
        });

        await flush();
        env.api.__test.setEnabledForTest(true);

        await env.api.__test.inspectLatestMessage();
        expect(button.focus).toHaveBeenCalledTimes(1);

        messages.push({ role: 'char', data: 'same text' });

        await env.api.__test.inspectLatestMessage();
        expect(button.focus).toHaveBeenCalledTimes(2);
    });
});