// @ts-check
/**
 * csp-exec.js — CSP-safe code execution (replaces eval() in V3 iframe sandbox).
 * Uses <script> tag injection with nonce for sub-plugin execution.
 */
import { safeUUID } from './helpers.js';

/**
 * Extract CSP nonce from existing scripts or meta tag.
 */
export function _extractNonce() {
    for (const s of document.querySelectorAll('script')) {
        if (s.nonce) return s.nonce;
    }
    const meta = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    if (meta) {
        const m = meta.content.match(/'nonce-([^']+)'/);
        if (m) return m[1];
    }
    return '';
}

/**
 * Execute JavaScript code via a <script> tag with CSP nonce.
 * @param {string} code - The JavaScript source to execute.
 * @param {string} pluginName - Human-readable name for logging.
 * @returns {Promise<void>}
 */
export function _executeViaScriptTag(code, pluginName) {
    return new Promise((resolve, reject) => {
        const nonce = _extractNonce();
        if (!nonce) {
            console.error('[CPM CSP] No nonce found — script execution will likely be blocked');
        }

        const cbId = '_cpm_cb_' + (typeof safeUUID === 'function'
            ? safeUUID().replace(/-/g, '')
            : Math.random().toString(36).slice(2));
        const safeName = JSON.stringify(pluginName || 'unknown');
        let scriptEl = /** @type {HTMLScriptElement | null} */ (null);

        const timeout = setTimeout(() => {
            if (/** @type {any} */ (window)[cbId]) {
                delete /** @type {any} */ (window)[cbId];
                try { if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl); } catch (_) {}
                reject(new Error(`Plugin ${pluginName} script timed out (CSP block?)`));
            }
        }, 10000);

        /** @type {any} */ (window)[cbId] = (/** @type {any} */ err) => {
            clearTimeout(timeout);
            delete /** @type {any} */ (window)[cbId];
            try { if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl); } catch (_) {}
            if (err) reject(err);
            else resolve();
        };

        const wrapped = `(async () => {\ntry {\n${code}\nwindow['${cbId}']();\n} catch(err) {\nconsole.error('[CPM Loader] Error executing plugin ' + ${safeName} + ':', err);\nwindow['${cbId}'](err);\n}\n})();`;
        scriptEl = document.createElement('script');
        if (nonce) scriptEl.nonce = nonce;
        scriptEl.dataset.cpmPlugin = pluginName || 'unknown';
        scriptEl.textContent = wrapped;
        document.head.appendChild(scriptEl);
    });
}
