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

let _copilotTokenCache = { token: '', expiry: 0 };
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
        const githubToken = await _getArgFn('tools_githubCopilotToken');
        const nodelessMode = normalizeCopilotNodelessMode(await _getArgFn('cpm_copilot_nodeless_mode'));
        if (!githubToken) {
            console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
            return '';
        }

        const cleanToken = githubToken.replace(/[^\x20-\x7E]/g, '').trim();
        if (!cleanToken) return '';

        console.log('[Cupcake PM] Copilot: Exchanging OAuth token for API token...');
        const res = await fetchFn('https://api.github.com/copilot_internal/v2/token', {
            method: 'GET',
            headers: buildCopilotTokenExchangeHeaders(cleanToken, nodelessMode),
        });

        if (!res.ok) {
            console.error(`[Cupcake PM] Copilot token exchange failed (${res.status}): ${await res.text()}`);
            // Negative cache: avoid retrying the same failed exchange for 60s
            _copilotTokenCache = { token: '', expiry: Date.now() + _NEGATIVE_CACHE_MS };
            return '';
        }

        const data = await res.json();
        if (data.token) {
            // Standard flow: received TID token
            const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
            _copilotTokenCache = { token: data.token, expiry: expiryMs };

            if (typeof window !== 'undefined') {
                /** @type {any} */ (window)._cpmCopilotApiToken = data.token;
                // Preserve dynamic API base URL from endpoints.api if present
                if (data.endpoints?.api) {
                    /** @type {any} */ (window)._cpmCopilotApiBase = data.endpoints.api.replace(/\/$/, '');
                    console.log('[Cupcake PM] Copilot: dynamic API base:', /** @type {any} */ (window)._cpmCopilotApiBase);
                }
            }
            console.log('[Cupcake PM] Copilot: API token obtained, expires in', Math.round((expiryMs - Date.now()) / 60000), 'min');
            return data.token;
        }

        // New API format: token response is a model list (data.data array) → use OAuth token directly
        if (Array.isArray(data.data)) {
            console.log(`[Cupcake PM] Copilot: Token response is model list (${data.data.length} models) — using OAuth token directly`);
            const expiryMs = Date.now() + 1800000; // 30 min TTL
            _copilotTokenCache = { token: cleanToken, expiry: expiryMs };
            if (typeof window !== 'undefined') /** @type {any} */ (window)._cpmCopilotApiToken = cleanToken;
            return cleanToken;
        }

        console.error('[Cupcake PM] Copilot token exchange returned no token');
        // Negative cache: avoid retrying the same failed exchange for 60s
        _copilotTokenCache = { token: '', expiry: Date.now() + _NEGATIVE_CACHE_MS };
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
    _copilotTokenCache = { token: '', expiry: 0 };
    _copilotTokenPromise = null;
}
