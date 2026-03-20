// @ts-check
/**
 * copilot-token.js — GitHub Copilot API token management.
 * Handles OAuth → API token exchange with caching and single-flight dedup.
 * Uses dependency injection for safeGetArg and fetch to enable testing.
 */
import {
    buildCopilotTokenExchangeHeaders,
    normalizeCopilotNodelessMode,
} from './copilot-headers.js';

/** Negative cache duration (ms) — prevents rapid-fire retries after failure */
const _NEGATIVE_CACHE_MS = 60000;

let _copilotTokenCache = { token: '', expiry: 0, sourceOAuth: '' };
let _copilotTokenPromise = /** @type {Promise<string> | null} */ (null);

/** Injected dependencies */
let _getArgFn = /** @type {Function | null} */ (null);
let _fetchFn = /** @type {Function | null} */ (null);

/**
 * Set the safeGetArg dependency for reading stored arguments.
 * @param {function} fn - async (key) => string
 */
export function setCopilotGetArgFn(fn) {
    _getArgFn = typeof fn === 'function' ? fn : null;
}

/**
 * Set the fetch dependency for HTTP requests.
 * @param {function} fn - (url, options) => Promise<Response>
 */
export function setCopilotFetchFn(fn) {
    _fetchFn = typeof fn === 'function' ? fn : null;
}

/**
 * Ensure a valid Copilot API token is available.
 * Returns cached token if still valid, otherwise exchanges GitHub OAuth token.
 * Single-flight: prevents parallel duplicate token exchange requests.
 * @returns {Promise<string>} API token or empty string on failure
 */
export async function ensureCopilotApiToken() {
    // Negative cache: if a recent exchange failed, don't retry until expiry
    if (!_copilotTokenCache.token && _copilotTokenCache.expiry > 0 && Date.now() < _copilotTokenCache.expiry) {
        return '';
    }

    // Return cached token if still valid (with 60s safety margin)
    if (_copilotTokenCache.token && Date.now() < _copilotTokenCache.expiry - 60000) {
        return _copilotTokenCache.token;
    }

    // Single-flight dedup
    if (_copilotTokenPromise) {
        try { return await _copilotTokenPromise; }
        catch (_) { return ''; }
    }

    if (!_getArgFn) {
        console.warn('[Cupcake PM] Copilot: No getArg function configured.');
        return '';
    }
    const fetchFn = _fetchFn || globalThis.fetch;

    _copilotTokenPromise = (async () => {
        const rawTokenValue = await _getArgFn('tools_githubCopilotToken');
        const nodelessMode = normalizeCopilotNodelessMode(await _getArgFn('cpm_copilot_nodeless_mode'));
        if (!rawTokenValue) {
            console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
            return '';
        }

        // Parse multi-token (space-separated) — try each in order
        const allTokens = rawTokenValue.split(/\s+/).map((/** @type {string} */ t) => t.replace(/[^\x20-\x7E]/g, '').trim()).filter(Boolean);
        if (allTokens.length === 0) return '';

        // Invalidate cache if the active (first) OAuth token has changed (e.g. after key rotation)
        if (_copilotTokenCache.token && _copilotTokenCache.sourceOAuth && allTokens[0] !== _copilotTokenCache.sourceOAuth) {
            console.log('[Cupcake PM] Copilot: Active OAuth token changed (rotation detected) — clearing cached API token.');
            _copilotTokenCache = { token: '', expiry: 0, sourceOAuth: '' };
        }

        const maxAttempts = Math.min(allTokens.length, 5); // cap to avoid infinite loops
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const cleanToken = allTokens[attempt];
            if (!cleanToken) continue;

            console.log(`[Cupcake PM] Copilot: Exchanging token #${attempt + 1}/${allTokens.length} for API token...`);
            try {
                const res = await fetchFn('https://api.github.com/copilot_internal/v2/token', {
                    method: 'GET',
                    headers: buildCopilotTokenExchangeHeaders(cleanToken, nodelessMode),
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.warn(`[Cupcake PM] Copilot token #${attempt + 1} exchange failed (${res.status}): ${errText}`);
                    // Rotate failed token to end via copilot-manager bridge (if available)
                    if (typeof window !== 'undefined' && typeof /** @type {any} */ (window)._cpmCopilotRotateToken === 'function') {
                        await /** @type {any} */ (window)._cpmCopilotRotateToken(cleanToken);
                    }
                    continue; // try next token
                }

                const data = await res.json();
                if (data.token) {
                    const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
                    _copilotTokenCache = { token: data.token, expiry: expiryMs, sourceOAuth: cleanToken };

                    if (typeof window !== 'undefined') {
                        /** @type {any} */ (window)._cpmCopilotApiToken = data.token;
                        if (data.endpoints?.api) {
                            /** @type {any} */ (window)._cpmCopilotApiBase = data.endpoints.api.replace(/\/$/, '');
                            console.log('[Cupcake PM] Copilot: dynamic API base:', /** @type {any} */ (window)._cpmCopilotApiBase);
                        }
                    }
                    console.log(`[Cupcake PM] Copilot: API token obtained from token #${attempt + 1}, expires in`, Math.round((expiryMs - Date.now()) / 60000), 'min');
                    return data.token;
                }

                // New API format: token response is a model list
                if (Array.isArray(data.data)) {
                    console.log(`[Cupcake PM] Copilot: Token #${attempt + 1} response is model list (${data.data.length} models) — using OAuth token directly`);
                    const expiryMs = Date.now() + 1800000;
                    _copilotTokenCache = { token: cleanToken, expiry: expiryMs, sourceOAuth: cleanToken };
                    if (typeof window !== 'undefined') /** @type {any} */ (window)._cpmCopilotApiToken = cleanToken;
                    return cleanToken;
                }

                console.warn(`[Cupcake PM] Copilot token #${attempt + 1} exchange returned no token`);
                if (typeof window !== 'undefined' && typeof /** @type {any} */ (window)._cpmCopilotRotateToken === 'function') {
                    await /** @type {any} */ (window)._cpmCopilotRotateToken(cleanToken);
                }
            } catch (e) {
                console.warn(`[Cupcake PM] Copilot token #${attempt + 1} error:`, /** @type {Error} */ (e).message);
                if (typeof window !== 'undefined' && typeof /** @type {any} */ (window)._cpmCopilotRotateToken === 'function') {
                    await /** @type {any} */ (window)._cpmCopilotRotateToken(cleanToken);
                }
            }
        }

        // All tokens failed — negative cache
        console.error('[Cupcake PM] Copilot: All tokens exhausted — negative caching for', _NEGATIVE_CACHE_MS / 1000, 's');
        _copilotTokenCache = { token: '', expiry: Date.now() + _NEGATIVE_CACHE_MS, sourceOAuth: '' };
        return '';
    })();

    try {
        return await _copilotTokenPromise;
    } catch (e) {
        console.error('[Cupcake PM] Copilot token exchange error:', /** @type {Error} */ (e).message);
        return '';
    } finally {
        _copilotTokenPromise = null;
    }
}

/**
 * Clear the cached token (for testing or logout).
 */
export function clearCopilotTokenCache() {
    _copilotTokenCache = { token: '', expiry: 0, sourceOAuth: '' };
    _copilotTokenPromise = null;
}

// Expose clearCopilotTokenCache to window for cross-module bridge (e.g. cpm-copilot-manager.js)
if (typeof window !== 'undefined') {
    /** @type {any} */ (window)._cpmClearCopilotTokenCache = clearCopilotTokenCache;
}
