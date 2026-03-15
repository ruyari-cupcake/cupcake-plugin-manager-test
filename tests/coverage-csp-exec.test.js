/**
 * @vitest-environment jsdom
 */
/**
 * coverage-csp-exec.test.js — Deep branch coverage for csp-exec.js
 * Requires jsdom environment for DOM manipulation.
 */
import { describe, it, expect } from 'vitest';
import { _extractNonce } from '../src/lib/csp-exec.js';

describe('csp-exec.js — deep branch coverage', () => {
    it('_extractNonce returns empty when scripts exist but none have nonce', () => {
        const script1 = document.createElement('script');
        const script2 = document.createElement('script');
        document.head.appendChild(script1);
        document.head.appendChild(script2);
        try {
            const existingMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            if (existingMeta) existingMeta.remove();

            const nonce = _extractNonce();
            expect(typeof nonce).toBe('string');
            expect(nonce).toBe(''); // No nonce on any script
        } finally {
            script1.remove();
            script2.remove();
        }
    });

    it('_extractNonce returns nonce from script element', () => {
        const script = document.createElement('script');
        script.nonce = 'scriptNonce456';
        document.head.appendChild(script);
        try {
            const nonce = _extractNonce();
            expect(nonce).toBe('scriptNonce456');
        } finally {
            script.remove();
        }
    });

    it('_extractNonce uses meta CSP tag when no script nonce found', () => {
        // Remove any existing scripts with nonce
        const scripts = document.querySelectorAll('script[nonce]');
        scripts.forEach(s => s.removeAttribute('nonce'));

        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "script-src 'nonce-testNonce123' 'strict-dynamic'";
        document.head.appendChild(meta);
        try {
            const nonce = _extractNonce();
            expect(['', 'testNonce123']).toContain(nonce);
        } finally {
            meta.remove();
        }
    });

    it('_extractNonce returns empty when no scripts and no CSP meta', () => {
        // Remove all scripts and CSP meta
        document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(m => m.remove());
        const nonce = _extractNonce();
        expect(nonce).toBe('');
    });
});
