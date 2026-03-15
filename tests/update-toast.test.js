/**
 * @vitest-environment jsdom
 */
/**
 * update-toast.test.js — Tests for update-toast.js showUpdateToast
 * and _showMainAutoUpdateResult toast methods.
 *
 * These methods are spread into SubPluginManager and render notification
 * toasts via RisuAI's getRootDocument() bridge.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ── Mock RisuAI root document ──
function createMockDoc(options = {}) {
    const appended = [];
    const existingToast = options.existingToast || null;
    const existingMainToast = options.existingMainToast || null;
    const existingSubToast = options.existingSubToast || null;

    const toast = {
        attrs: {},
        styles: {},
        innerHTML: '',
        removed: false,
        async setAttribute(name, value) { this.attrs[name] = value; },
        async setStyle(name, value) { this.styles[name] = value; },
        async setInnerHTML(value) { this.innerHTML = value; },
        async remove() { this.removed = true; },
    };
    const body = options.hasBody === false
        ? null
        : {
            children: appended,
            async appendChild(node) { appended.push(node); },
        };

    return {
        appended,
        toast,
        body,
        async createElement() { return toast; },
        async querySelector(selector) {
            if (selector === '[x-cpm-toast]') return existingToast || existingSubToast;
            if (selector === '[x-cpm-main-toast]') return existingMainToast;
            if (selector === 'body') return body;
            return null;
        },
    };
}

async function loadModule(docOrFactory) {
    vi.resetModules();
    const getRootDocument = vi.fn();
    if (typeof docOrFactory === 'function') getRootDocument.mockImplementation(docOrFactory);
    else getRootDocument.mockResolvedValue(docOrFactory);
    window.risuai = { getRootDocument };
    delete window.Risuai;
    const mod = await import('../src/lib/update-toast.js');
    return { ...mod, getRootDocument };
}

describe('updateToastMethods.showUpdateToast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.resetModules();
        delete window.risuai;
        delete window.Risuai;
    });

    it('returns early when getRootDocument returns null', async () => {
        const { updateToastMethods, getRootDocument } = await loadModule(null);
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        await updateToastMethods.showUpdateToast([{ name: 'test', icon: '🧁', localVersion: '1.0', remoteVersion: '2.0' }]);
        expect(getRootDocument).toHaveBeenCalledTimes(1);
        expect(debugSpy).toHaveBeenCalledWith('[CPM Toast] getRootDocument returned null');
    });

    it('removes existing toast before showing new one', async () => {
        const existing = { remove: vi.fn().mockResolvedValue(undefined) };
        const doc = createMockDoc({ existingToast: existing });
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'Plugin A', icon: '📦', localVersion: '1.0', remoteVersion: '1.1' },
        ]);

        expect(existing.remove).toHaveBeenCalledTimes(1);
        expect(doc.appended).toHaveLength(1);
    });

    it('shows single update in toast with version info', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'Plugin A', icon: '📦', localVersion: '1.0.0', remoteVersion: '1.1.0', changes: 'Bug fix' },
        ]);

        expect(doc.appended).toHaveLength(1);
        expect(doc.toast.innerHTML).toContain('Plugin A');
        expect(doc.toast.innerHTML).toContain('1.0.0');
        expect(doc.toast.innerHTML).toContain('1.1.0');
        expect(doc.toast.innerHTML).toContain('Bug fix');
        expect(doc.toast.innerHTML).toContain('업데이트 1개 있음');
    });

    it('shows multiple updates and truncates beyond 3', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        const updates = [
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
            { name: 'B', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
            { name: 'C', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
            { name: 'D', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ];
        await updateToastMethods.showUpdateToast(updates);

        expect(doc.toast.innerHTML).toContain('업데이트 4개 있음');
        expect(doc.toast.innerHTML).toContain('...외 1개');
    });

    it('shows update without changes text when changes is empty', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'Plugin A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);

        // No " — " followed by empty string
        expect(doc.toast.innerHTML).not.toContain(' — </div>');
    });

    it('returns early when body is not found', async () => {
        const doc = createMockDoc({ hasBody: false });
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);

        expect(doc.appended).toHaveLength(0);
        expect(debugSpy).toHaveBeenCalledWith('[CPM Toast] body not found');
    });

    it('animates toast in after 50ms', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);

        expect(doc.toast.styles.opacity).toBe('0');
        expect(doc.toast.styles.transform).toBe('translateY(12px)');

        await vi.advanceTimersByTimeAsync(60);
        expect(doc.toast.styles.opacity).toBe('1');
        expect(doc.toast.styles.transform).toBe('translateY(0)');
    });

    it('auto-dismisses after 8 seconds and removes after 350ms', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods.showUpdateToast([
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);

        await vi.advanceTimersByTimeAsync(8050);
        expect(doc.toast.styles.opacity).toBe('0');

        await vi.advanceTimersByTimeAsync(400);
        expect(doc.toast.removed).toBe(true);
    });

    it('catches and logs debug on overall error', async () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const { updateToastMethods } = await loadModule(async () => {
            throw new Error('bridge failure');
        });

        await updateToastMethods.showUpdateToast([
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);

        expect(debugSpy).toHaveBeenCalledWith('[CPM Toast] Failed to show toast:', 'bridge failure');
    });

    it('handles existing toast remove throwing gracefully', async () => {
        const existing = { remove: vi.fn().mockRejectedValue(new Error('remove err')) };
        const doc = createMockDoc({ existingToast: existing });
        const { updateToastMethods } = await loadModule(doc);

        // Should not throw
        await updateToastMethods.showUpdateToast([
            { name: 'A', icon: '📦', localVersion: '1.0', remoteVersion: '2.0' },
        ]);
        expect(doc.appended).toHaveLength(1);
    });
});

describe('updateToastMethods._showMainAutoUpdateResult', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.resetModules();
        delete window.risuai;
        delete window.Risuai;
    });

    it('returns early when getRootDocument returns null', async () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const { updateToastMethods } = await loadModule(null);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(debugSpy).toHaveBeenCalledWith('[CPM MainToast] getRootDocument returned null');
    });

    it('removes existing main toast before showing new one', async () => {
        const existing = { remove: vi.fn().mockResolvedValue(undefined) };
        const doc = createMockDoc({ existingMainToast: existing });
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(existing.remove).toHaveBeenCalledTimes(1);
    });

    it('shows success toast with version and changes', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.18.0', '1.19.0', 'New features', true);

        expect(doc.appended).toHaveLength(1);
        expect(doc.toast.innerHTML).toContain('자동 업데이트 완료');
        expect(doc.toast.innerHTML).toContain('1.18.0');
        expect(doc.toast.innerHTML).toContain('1.19.0');
        expect(doc.toast.innerHTML).toContain('New features');
        expect(doc.toast.innerHTML).toContain('새로고침하면 적용됩니다');
    });

    it('shows success toast without changes when changes is empty', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.18.0', '1.19.0', '', true);

        expect(doc.toast.innerHTML).toContain('자동 업데이트 완료');
        // changesHtml should be empty
        expect(doc.toast.innerHTML).not.toContain(' — </');
    });

    it('shows failure toast with error message', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.18.0', '1.19.0', '', false, 'SHA mismatch');

        expect(doc.toast.innerHTML).toContain('자동 업데이트 실패');
        expect(doc.toast.innerHTML).toContain('SHA mismatch');
        expect(doc.toast.innerHTML).toContain('수동 업데이트');
    });

    it('shows failure toast with default error when error is undefined', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.18.0', '1.19.0', '', false);

        expect(doc.toast.innerHTML).toContain('알 수 없는 오류');
    });

    it('positions main toast higher when sub toast exists', async () => {
        const subToast = {}; // truthy value simulates existing sub toast
        const doc = createMockDoc({ existingSubToast: subToast });
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(doc.toast.styles.bottom).toBe('110px');
    });

    it('positions main toast at 20px when no sub toast exists', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(doc.toast.styles.bottom).toBe('20px');
    });

    it('returns early when body is not found', async () => {
        const doc = createMockDoc({ hasBody: false });
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(doc.appended).toHaveLength(0);
        expect(debugSpy).toHaveBeenCalledWith('[CPM MainToast] body not found');
    });

    it('animates main toast in after 50ms', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(doc.toast.styles.opacity).toBe('0');

        await vi.advanceTimersByTimeAsync(60);
        expect(doc.toast.styles.opacity).toBe('1');
        expect(doc.toast.styles.transform).toBe('translateY(0)');
    });

    it('success toast auto-dismisses after 10 seconds', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        await vi.advanceTimersByTimeAsync(10050);
        expect(doc.toast.styles.opacity).toBe('0');

        await vi.advanceTimersByTimeAsync(400);
        expect(doc.toast.removed).toBe(true);
    });

    it('failure toast auto-dismisses after 15 seconds', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', false, 'err');

        // Not yet dismissed at 10s
        await vi.advanceTimersByTimeAsync(10050);
        expect(doc.toast.removed).toBe(false);

        // Dismissed at 15s
        await vi.advanceTimersByTimeAsync(5100);
        expect(doc.toast.styles.opacity).toBe('0');

        await vi.advanceTimersByTimeAsync(400);
        expect(doc.toast.removed).toBe(true);
    });

    it('catches and logs debug on overall error', async () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const { updateToastMethods } = await loadModule(async () => {
            throw new Error('main toast bridge err');
        });

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);

        expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining('[CPM MainToast] Failed to show toast:'),
            expect.anything()
        );
    });

    it('uses green border for success and red border for failure', async () => {
        const doc = createMockDoc();
        const { updateToastMethods } = await loadModule(doc);

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', true);
        expect(doc.toast.styles.borderLeft).toBe('3px solid #6ee7b7');

        // Reset and test failure
        doc.toast.styles = {};
        doc.toast.removed = false;
        doc.appended.length = 0;

        await updateToastMethods._showMainAutoUpdateResult('1.0', '2.0', '', false, 'err');
        expect(doc.toast.styles.borderLeft).toBe('3px solid #f87171');
    });
});
