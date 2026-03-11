/**
 * Tests for csp-exec.js — CSP-safe script execution utilities.
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _extractNonce, _executeViaScriptTag } from '../src/lib/csp-exec.js';

// ─── _extractNonce ───────────────────────────────────────────────────────────

describe('_extractNonce', () => {
    afterEach(() => {
        // Clean up any elements we added
        document.head.innerHTML = '';
        document.body.innerHTML = '';
    });

    it('returns empty string when no scripts or CSP meta exist', () => {
        expect(_extractNonce()).toBe('');
    });

    it('extracts nonce from an existing script tag', () => {
        const script = document.createElement('script');
        script.setAttribute('nonce', 'abc123nonce');
        document.head.appendChild(script);
        expect(_extractNonce()).toBe('abc123nonce');
    });

    it('extracts nonce from CSP meta tag when no script nonce exists', () => {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "script-src 'nonce-meta456nonce' 'strict-dynamic'";
        document.head.appendChild(meta);
        expect(_extractNonce()).toBe('meta456nonce');
    });

    it('prefers script nonce over meta tag nonce', () => {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "script-src 'nonce-fromMeta'";
        document.head.appendChild(meta);

        const script = document.createElement('script');
        script.setAttribute('nonce', 'fromScript');
        document.head.appendChild(script);

        expect(_extractNonce()).toBe('fromScript');
    });

    it('returns empty string if meta CSP has no nonce directive', () => {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "script-src 'self' 'unsafe-inline'";
        document.head.appendChild(meta);
        expect(_extractNonce()).toBe('');
    });

    it('handles multiple script tags — returns first nonce found', () => {
        const s1 = document.createElement('script');
        s1.textContent = 'console.log("no nonce")';
        document.head.appendChild(s1);

        const s2 = document.createElement('script');
        s2.setAttribute('nonce', 'second');
        document.head.appendChild(s2);

        expect(_extractNonce()).toBe('second');
    });
});

// ─── _executeViaScriptTag ────────────────────────────────────────────────────
// Note: jsdom executes <script> in a separate VM context where `window` differs
// from the test globals.  We mock appendChild to capture the script element
// without executing it, then manually invoke the global callback to test the
// promise/timeout/cleanup logic in isolation.

describe('_executeViaScriptTag', () => {
    let nonceScript;
    /** @type {HTMLScriptElement | null} */
    let capturedScript = null;
    let origAppend;

    beforeEach(() => {
        nonceScript = document.createElement('script');
        nonceScript.setAttribute('nonce', 'test-nonce');
        document.head.appendChild(nonceScript);

        // Intercept subsequent appendChild calls to prevent jsdom script execution
        origAppend = document.head.appendChild.bind(document.head);
        vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
            if (el.tagName === 'SCRIPT' && el.dataset && el.dataset.cpmPlugin) {
                capturedScript = el;
                // Don't actually append — prevents jsdom VM execution
                return el;
            }
            return origAppend(el);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        capturedScript = null;
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        for (const key of Object.keys(globalThis)) {
            if (key.startsWith('_cpm_cb_')) delete globalThis[key];
        }
    });

    /** Find the registered callback on globalThis */
    function findCallback() {
        for (const key of Object.keys(globalThis)) {
            if (key.startsWith('_cpm_cb_') && typeof globalThis[key] === 'function') {
                return { key, fn: globalThis[key] };
            }
        }
        return null;
    }

    it('registers a global callback before script injection', () => {
        _executeViaScriptTag('/* code */', 'TestPlugin');
        const cb = findCallback();
        expect(cb).not.toBeNull();
    });

    it('resolves when callback is invoked without error', async () => {
        const promise = _executeViaScriptTag('/* code */', 'TestPlugin');
        const cb = findCallback();
        expect(cb).not.toBeNull();
        cb.fn(); // simulate successful execution
        await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when callback is invoked with an error', async () => {
        const promise = _executeViaScriptTag('/* code */', 'ErrorPlugin');
        const cb = findCallback();
        cb.fn(new Error('boom'));
        await expect(promise).rejects.toThrow('boom');
    });

    it('sets nonce attribute on injected script element', () => {
        _executeViaScriptTag('/* code */', 'NoncePlugin');
        expect(capturedScript).not.toBeNull();
        expect(capturedScript.nonce).toBe('test-nonce');
    });

    it('sets data-cpm-plugin attribute with plugin name', () => {
        _executeViaScriptTag('/* code */', 'MyPlugin');
        expect(capturedScript).not.toBeNull();
        expect(capturedScript.dataset.cpmPlugin).toBe('MyPlugin');
    });

    it('uses "unknown" as default plugin name when none provided', () => {
        _executeViaScriptTag('/* code */', undefined);
        expect(capturedScript).not.toBeNull();
        expect(capturedScript.dataset.cpmPlugin).toBe('unknown');
    });

    it('wraps code in async IIFE with callback invocations', () => {
        _executeViaScriptTag('console.log("hi")', 'WrapTest');
        expect(capturedScript.textContent).toContain('(async () => {');
        expect(capturedScript.textContent).toContain('console.log("hi")');
        expect(capturedScript.textContent).toContain('catch(err)');
    });

    it('cleans up global callback after successful invocation', async () => {
        const promise = _executeViaScriptTag('/* code */', 'CleanupOK');
        const cb = findCallback();
        cb.fn();
        await promise;
        expect(findCallback()).toBeNull();
    });

    it('cleans up global callback after error invocation', async () => {
        const promise = _executeViaScriptTag('/* code */', 'CleanupErr');
        const cb = findCallback();
        cb.fn(new Error('fail'));
        try { await promise; } catch (_) { /* expected */ }
        expect(findCallback()).toBeNull();
    });

    it('rejects with timeout error when callback is never invoked', async () => {
        vi.useFakeTimers();
        const promise = _executeViaScriptTag('/* stalled */', 'TimeoutPlugin');
        // Callback exists but we won't call it — simulate timeout
        vi.advanceTimersByTime(11000);
        await expect(promise).rejects.toThrow('timed out');
        vi.useRealTimers();
    });

    it('cleans up global callback on timeout', async () => {
        vi.useFakeTimers();
        const promise = _executeViaScriptTag('/* stalled */', 'TimeoutCleanup');
        vi.advanceTimersByTime(11000);
        try { await promise; } catch (_) { /* expected */ }
        expect(findCallback()).toBeNull();
        vi.useRealTimers();
    });

    it('logs error when no nonce is found', async () => {
        // Remove the nonce script before calling
        document.head.innerHTML = '';
        // Re-apply the mock after clearing
        vi.spyOn(document.head, 'appendChild').mockImplementation((el) => {
            capturedScript = el;
            return el;
        });

        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const promise = _executeViaScriptTag('/* no nonce */', 'NoNoncePlugin');
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('No nonce found'));

        // Clean up promise
        const cb = findCallback();
        if (cb) cb.fn();
        await promise;
        spy.mockRestore();
    });

    it('includes plugin name in wrapped error logging code', () => {
        _executeViaScriptTag('/* code */', 'NameInError');
        expect(capturedScript.textContent).toContain('"NameInError"');
    });
});
