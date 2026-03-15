// @ts-check
/**
 * smart-fetch.js — 3-strategy fetch wrapper for V3 iframe sandbox.
 *
 * Strategy 1: Direct fetch()
 * Strategy 2: risuFetch (host window, plainFetchForce)
 * Strategy 3: nativeFetch (proxy fallback)
 *
 * Dependency: sanitizeBodyJSON from sanitize.js, Risu from shared-state.js
 */
import { Risu, safeGetBoolArg } from './shared-state.js';
import { sanitizeBodyJSON } from './sanitize.js';
// checkStreamCapability removed — compat mode is manual-toggle only now

/**
 * Smart native fetch: 3-strategy fallback for V3 iframe sandbox.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */

/**
 * Race a fetch-like promise against an AbortSignal.
 * When the V3 bridge cannot serialize AbortSignal (DataCloneError), we strip
 * the signal from the outgoing request but still need the caller to see
 * AbortError when the user cancels. This helper monitors the original signal
 * and rejects with AbortError if it fires before the fetch resolves.
 *
 * Limitation: the underlying HTTP request on the host side continues
 * (V3 bridge cannot relay abort in the guest→host direction).
 *
 * @template T
 * @param {Promise<T>} fetchPromise - The in-flight fetch (already started without signal)
 * @param {AbortSignal} signal - The original signal to monitor
 * @returns {Promise<T>}
 */
function _raceWithAbortSignal(fetchPromise, signal) {
    if (!signal) return fetchPromise;
    if (signal.aborted) {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (!settled) {
                settled = true;
                reject(new DOMException('The operation was aborted.', 'AbortError'));
            }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        fetchPromise.then(
            (result) => {
                if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); resolve(result); }
            },
            (error) => {
                if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); reject(error); }
            }
        );
    });
}

/**
 * Check if an error is an AbortError (user cancellation).
 * AbortErrors must propagate through all strategy catch blocks.
 * @param {*} e
 * @returns {boolean}
 */
function _isAbortError(e) {
    if (!e) return false;
    if (e.name === 'AbortError') return true;
    if (e instanceof DOMException && e.code === 20) return true;
    return false;
}

/** Cached compatibility mode flag — null = not yet read, boolean = cached value */
/** @type {boolean | null} */
let _compatibilityModeCache = null;

/**
 * Reset cached compatibility mode state (for testing).
 */
export function _resetCompatibilityCache() {
    _compatibilityModeCache = null;
}

/**
 * Check if compatibility mode is active (manual user toggle only).
 * Result is cached for the lifetime of the plugin.
 * @returns {Promise<boolean>}
 */
async function _isCompatibilityMode() {
    if (_compatibilityModeCache === null) {
        _compatibilityModeCache = await safeGetBoolArg('cpm_compatibility_mode', false);
    }
    return _compatibilityModeCache;
}

/**
 * @param {string} url
 * @param {RequestInit & Record<string, any>} [options]
 * @returns {Promise<Response>}
 */
export async function smartNativeFetch(url, options = {}) {
    // Early abort check — avoid unnecessary work if already cancelled
    if (options.signal && options.signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // Body integrity logging — helps diagnose "unexpected EOF" errors
    // sanitizeBodyJSON is intentionally NOT called here; the caller (fetchCustom)
    // already sanitizes. Double-sanitization added unnecessary parse/stringify
    // overhead and could mask truncation bugs.
    if (options.method === 'POST' && typeof options.body === 'string') {
        const _bodyLen = options.body.length;
        if (_bodyLen > 5_000_000) {
            console.warn(`[CupcakePM] ⚠️ Large request body: ${(_bodyLen / 1_048_576).toFixed(2)} MB — V3 bridge transfer may truncate.`);
        }
        // Quick JSON validity check (catches corruption before network)
        if (options.body.charAt(0) === '{' || options.body.charAt(0) === '[') {
            try {
                JSON.parse(options.body);
            } catch (_validErr) {
                console.error(`[CupcakePM] ❌ Body JSON validation FAILED before fetch (len=${_bodyLen}):`, /** @type {Error} */ (_validErr).message);
            }
        }
    }

    const _isCopilotUrl = url.includes('githubcopilot.com') || url.includes('copilot_internal');
    const _isGoogleApiUrl = url.includes('generativelanguage.googleapis.com') || url.includes('aiplatform.googleapis.com') || url.includes('oauth2.googleapis.com');
    // Copilot URLs always skip direct browser fetch (CSP blocks it in iframe sandbox).
    // Google URLs skip only for non-GET (POST/SSE) where nativeFetch is more stable.
    const _preferNativeFirst = (_isGoogleApiUrl && (options.method || 'POST') !== 'GET') || _isCopilotUrl;

    // ─── Compatibility Mode: skip nativeFetch entirely ───
    const _compatMode = await _isCompatibilityMode();
    if (_compatMode) {
        console.log(`[CupcakePM] Compatibility mode active — skipping nativeFetch for ${url.substring(0, 60)}`);
    }

    // Best-effort AbortSignal propagation across V3 bridge.
    // V3 factory.ts only handles AbortSignal in the host→guest direction
    // (ABORT_SIGNAL_REF). The guest→host direction (plugin calling nativeFetch)
    // cannot serialize AbortSignal via postMessage. When this DataCloneError
    // occurs, we strip the signal but race the request against the original
    // signal so callers still see AbortError on cancellation.
    const callNativeFetchWithAbortFallback = async (/** @type {string} */ _url, /** @type {any} */ _options) => {
        if (_options?.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }
        try {
            return await Risu.nativeFetch(_url, _options);
        } catch (_err) {
            const _msg = String(/** @type {any} */ (_err)?.message || _err || '');
            const _hasSignal = !!(_options && _options.signal);
            const _cloneIssue = /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_msg);
            if (_hasSignal && _cloneIssue) {
                const _signal = _options.signal;
                const _retry = { ..._options };
                delete _retry.signal;
                console.warn('[CupcakePM] nativeFetch signal bridge failed; retrying without signal (abort monitored locally):', _msg);
                return await _raceWithAbortSignal(Risu.nativeFetch(_url, _retry), _signal);
            }
            throw _err;
        }
    };

    // Strategy 1: Direct browser fetch from iframe
    // For Google/Vertex and Copilot POST/SSE requests, skip direct fetch and try native/proxy first.
    if (!_preferNativeFirst) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.log(`[CupcakePM] Direct fetch failed for ${url.substring(0, 60)}...: ${/** @type {Error} */ (e).message}`);
        }
    }

    // ─── Google / Vertex: nativeFetch first for POST/SSE stability ───
    // Skipped in compatibility mode — nativeFetch returns Response(ReadableStream) which
    // fails to transfer across the V3 iframe bridge on Safari < 16.4.
    if (!_compatMode && _isGoogleApiUrl && (options.method || 'POST') !== 'GET' && Risu && typeof Risu.nativeFetch === 'function') {
        try {
            const nfOptions = { ...options };
            if (typeof nfOptions.body === 'string') {
                nfOptions.body = new TextEncoder().encode(nfOptions.body);
            }
            const nfRes = await callNativeFetchWithAbortFallback(url, nfOptions);
            if (nfRes && (nfRes.ok || (nfRes.status && nfRes.status !== 0))) {
                console.log(`[CupcakePM] Google/Vertex nativeFetch succeeded: status=${nfRes.status} for ${url.substring(0, 60)}`);
                return nfRes;
            }
            console.log(`[CupcakePM] Google/Vertex nativeFetch returned unusable response, trying fallbacks: status=${nfRes?.status || 'unknown'}`);
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.log(`[CupcakePM] Google/Vertex nativeFetch error: ${/** @type {Error} */ (e).message}`);
        }
    }

    // ─── Copilot-specific: nativeFetch first (GET token exchange + POST/SSE chat) ───
    // Unlike Google, Copilot MUST NOT skip nativeFetch in compatibility mode.
    // Copilot API does not support CORS, and the /proxy2 endpoint requires
    // RisuAI JWT auth that plugins don't have. nativeFetch (host-side fetch)
    // is the ONLY viable path for Copilot. If ReadableStream transfer fails
    // in compat mode, the response will be caught by error handling below.
    if (_isCopilotUrl && Risu && typeof Risu.nativeFetch === 'function') {
        try {
            const nfOptions = { ...options };
            if (typeof nfOptions.body === 'string') {
                nfOptions.body = new TextEncoder().encode(nfOptions.body);
            }
            const nfRes = await callNativeFetchWithAbortFallback(url, nfOptions);
            if (nfRes && nfRes.ok) {
                console.log(`[CupcakePM] Copilot nativeFetch succeeded: status=${nfRes.status} for ${url.substring(0, 60)}`);
                return nfRes;
            }
            if (nfRes && nfRes.status && nfRes.status !== 0) {
                if ((options.method || 'POST') !== 'GET') {
                    console.warn(`[CupcakePM] Copilot nativeFetch returned HTTP ${nfRes.status}; returning as-is to avoid duplicate replay.`);
                    return nfRes;
                }
                if (nfRes.status >= 400 && nfRes.status < 500) {
                    console.warn(`[CupcakePM] Copilot nativeFetch returned client error ${nfRes.status}; returning as-is.`);
                    return nfRes;
                }
                console.warn(`[CupcakePM] Copilot nativeFetch returned server error ${nfRes.status}; trying fallback route.`);
            } else {
                console.log(`[CupcakePM] Copilot nativeFetch returned unusable response, trying proxy fallback: status=${nfRes?.status || 'unknown'}`);
            }
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.log(`[CupcakePM] Copilot nativeFetch error: ${/** @type {Error} */ (e).message}`);
        }
    }

    // ─── Copilot risuFetch (plainFetchDeforce) ───
    if (_isCopilotUrl && Risu && typeof Risu.risuFetch === 'function') {
        const copilotResult = await _tryCopilotRisuFetch(url, options, 'plainFetchDeforce');
        if (copilotResult) return copilotResult;

        // Last resort: plainFetchForce for Copilot
        const copilotForceResult = await _tryCopilotRisuFetch(url, options, 'plainFetchForce');
        if (copilotForceResult) return copilotForceResult;
    }

    // ─── Strategy 2: risuFetch with plainFetchForce (non-Copilot) ───
    const _contentType = (options.headers && (
        /** @type {any} */ (options.headers)['Content-Type'] || /** @type {any} */ (options.headers)['content-type'] ||
        (typeof /** @type {any} */ (options.headers).get === 'function' ? /** @type {any} */ (options.headers).get('content-type') : '')
    )) || '';
    const _isJsonBody = !_contentType || _contentType.includes('application/json');

    if (!_isCopilotUrl && _isJsonBody && Risu && typeof Risu.risuFetch === 'function') {
        try {
            let bodyObj = _parseBodyForRisuFetch(options.body);
            if (bodyObj === undefined && options.body) {
                throw new Error('Body JSON parse failed — cannot safely pass to risuFetch');
            }

            // Deep-sanitize body object before it crosses the postMessage bridge
            if (bodyObj && typeof bodyObj === 'object') {
                bodyObj = _deepSanitizeBody(bodyObj);
            }

            // Final IPC safety: ensure bodyObj is serializable
            if (bodyObj && typeof bodyObj === 'object') {
                try {
                    bodyObj = JSON.parse(JSON.stringify(bodyObj));
                } catch (serErr) {
                    console.warn('[CupcakePM] bodyObj JSON round-trip failed, stripping non-serializable keys:', /** @type {Error} */ (serErr).message);
                    try { bodyObj = _stripNonSerializable(bodyObj, 0); } catch (_) { }
                }
            }

            let result;
            try {
                result = await Risu.risuFetch(url, {
                    method: options.method || 'POST',
                    headers: options.headers || {},
                    body: bodyObj,
                    rawResponse: true,
                    plainFetchForce: true,
                    abortSignal: options.signal,
                });
            } catch (_rfErr) {
                const _rfMsg = String(/** @type {any} */ (_rfErr)?.message || _rfErr || '');
                if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                    console.warn('[CupcakePM] risuFetch signal clone failed; retrying without signal (abort monitored locally):', _rfMsg);
                    result = await _raceWithAbortSignal(
                        Risu.risuFetch(url, {
                            method: options.method || 'POST',
                            headers: options.headers || {},
                            body: bodyObj,
                            rawResponse: true,
                            plainFetchForce: true,
                        }),
                        options.signal
                    );
                } else {
                    throw _rfErr;
                }
            }

            const responseBody = _extractResponseBody(result);
            if (responseBody) {
                console.log(`[CupcakePM] risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                return new Response(/** @type {any} */ (responseBody), {
                    status: result.status || 200,
                    headers: new Headers(result.headers || {}),
                });
            }
            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] risuFetch not a real response: ${errPreview}`);
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.log(`[CupcakePM] risuFetch error: ${/** @type {Error} */ (e).message}`);
        }
    }

    // ─── Strategy 3 (fallback): nativeFetch — proxy-based fetch ───
    // In compatibility mode, skip this too — risuFetch should have already succeeded.
    // nativeFetch returns Response(ReadableStream) which may fail on Safari < 16.4.
    if (!_compatMode) {
        try {
            console.log(`[CupcakePM] Falling back to nativeFetch (proxy) for ${url.substring(0, 60)}...`);
            const nfOptions = { ...options };
            if (typeof nfOptions.body === 'string') {
                nfOptions.body = new TextEncoder().encode(nfOptions.body);
            }
            const res = await callNativeFetchWithAbortFallback(url, nfOptions);
            return res;
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.error(`[CupcakePM] nativeFetch also failed: ${/** @type {Error} */ (e).message}`);
        }
    }

    throw new Error(`[CupcakePM] All fetch strategies failed for ${url.substring(0, 60)}`);
}

// ─── Internal helpers ───

/**
 * @param {any} body
 * @returns {any}
 */
function _parseBodyForRisuFetch(body) {
    if (!body) return undefined;
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch {
            console.error('[CupcakePM] risuFetch: body JSON.parse failed, skipping risuFetch path');
            return undefined;
        }
    }
    return body;
}

/**
 * @param {any} bodyObj
 * @returns {any}
 */
function _deepSanitizeBody(bodyObj) {
    if (Array.isArray(bodyObj.messages)) {
        try {
            const rawMsgs = JSON.parse(JSON.stringify(bodyObj.messages));
            bodyObj.messages = [];
            for (let _ri = 0; _ri < rawMsgs.length; _ri++) {
                const _rm = rawMsgs[_ri];
                if (_rm == null || typeof _rm !== 'object') continue;
                if (typeof _rm.role !== 'string' || !_rm.role) continue;
                if (_rm.content === null || _rm.content === undefined) continue;
                /** @type {Record<string, any>} */
                const safeMsg = { role: _rm.role, content: _rm.content };
                if (_rm.name && typeof _rm.name === 'string') safeMsg.name = _rm.name;
                // Preserve tool-calling properties required by OpenAI/Anthropic tool-use flows
                if (_rm.tool_calls) safeMsg.tool_calls = _rm.tool_calls;
                if (_rm.tool_call_id) safeMsg.tool_call_id = _rm.tool_call_id;
                if (_rm.function_call) safeMsg.function_call = _rm.function_call;
                if (_rm.refusal) safeMsg.refusal = _rm.refusal;
                bodyObj.messages.push(safeMsg);
            }
        } catch (_e) {
            console.error('[CupcakePM] Deep reconstruct of messages failed:', /** @type {Error} */ (_e).message);
            bodyObj.messages = bodyObj.messages.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
        }
    }
    if (Array.isArray(bodyObj.contents)) {
        try { bodyObj.contents = JSON.parse(JSON.stringify(bodyObj.contents)); } catch (_) { }
        bodyObj.contents = bodyObj.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
    }
    return bodyObj;
}

/**
 * @param {any} obj
 * @param {number} depth
 * @returns {any}
 */
function _stripNonSerializable(obj, depth) {
    if (depth > 15) return undefined;
    if (obj === null || obj === undefined) return obj;
    const t = typeof obj;
    if (t === 'string' || t === 'number' || t === 'boolean') return obj;
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
    if (Array.isArray(obj)) return obj.map(v => _stripNonSerializable(v, depth + 1)).filter(v => v !== undefined);
    if (t === 'object') {
        /** @type {Record<string, any>} */
        const out = {};
        for (const k of Object.keys(obj)) {
            try { const v = _stripNonSerializable(obj[k], depth + 1); if (v !== undefined) out[k] = v; } catch (_) { }
        }
        return out;
    }
    return undefined;
}

/**
 * @param {any} result
 * @returns {Uint8Array | null}
 */
function _extractResponseBody(result) {
    if (!result || result.data == null) return null;
    if (result.data instanceof Uint8Array) return result.data;
    if (ArrayBuffer.isView(result.data) || result.data instanceof ArrayBuffer) {
        return new Uint8Array(result.data instanceof ArrayBuffer ? result.data : result.data.buffer);
    }
    if (Array.isArray(result.data)) return new Uint8Array(result.data);
    if (typeof result.data === 'object' && !(result.data instanceof Blob)) {
        const _len = typeof result.data.length === 'number'
            ? result.data.length
            : typeof result.data.byteLength === 'number'
                ? result.data.byteLength
                : (() => { const keys = Object.keys(result.data).filter(k => /^\d+$/.test(k)); return keys.length > 0 ? Math.max(...keys.map(Number)) + 1 : 0; })();
        if (_len > 0) {
            try {
                const arr = new Uint8Array(_len);
                for (let i = 0; i < _len; i++) arr[i] = result.data[i] || 0;
                return arr;
            } catch (_) { return null; }
        }
    }
    if (typeof result.data === 'string' && result.status && result.status !== 0) {
        return new TextEncoder().encode(result.data);
    }
    return null;
}

/**
 * @param {string} url
 * @param {RequestInit & Record<string, any>} options
 * @param {string} mode
 * @returns {Promise<Response | null>}
 */
async function _tryCopilotRisuFetch(url, options, mode) {
    try {
        const bodyObj = _parseBodyForRisuFetch(options.body);
        if (bodyObj === undefined && options.body) {
            throw new Error('Body JSON parse failed — cannot safely pass to risuFetch');
        }

        /** @type {Record<string, any>} */
        const fetchOpts = {
            method: options.method || 'POST',
            headers: options.headers || {},
            body: bodyObj,
            rawResponse: true,
            abortSignal: options.signal,
        };
        if (mode === 'plainFetchDeforce') fetchOpts.plainFetchDeforce = true;
        else fetchOpts.plainFetchForce = true;

        let result;
        try {
            result = await Risu.risuFetch(url, fetchOpts);
        } catch (_rfErr) {
            const _rfMsg = String(/** @type {any} */ (_rfErr)?.message || _rfErr || '');
            if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                console.warn(`[CupcakePM] Copilot risuFetch(${mode}) signal clone failed; retrying without signal (abort monitored locally)`);
                const _signal = options.signal;
                delete fetchOpts.abortSignal;
                result = await _raceWithAbortSignal(Risu.risuFetch(url, fetchOpts), _signal);
            } else {
                throw _rfErr;
            }
        }

        const responseBody = _extractResponseBody(result);
        if (responseBody) {
            if (result.status === 524) {
                // In compatibility mode, block the retry to prevent duplicate requests on iPhone/Safari
                const _compatActive = await _isCompatibilityMode();
                if (_compatActive) {
                    console.warn(`[CupcakePM] Copilot ${mode} risuFetch returned 524 — compatibility mode blocks retry to prevent duplicate requests.`);
                    return new Response(
                        JSON.stringify({ error: { message: 'Copilot proxy returned 524 — retry blocked by compatibility mode to prevent duplicate requests', type: 'compat_524_blocked' } }),
                        { status: 524, headers: new Headers({ 'Content-Type': 'application/json' }) }
                    );
                }
                console.warn(`[CupcakePM] Copilot ${mode} risuFetch returned 524 for ${url.substring(0, 60)}; falling back.`);
                return null;
            }
            // ─── Detect Node server proxy auth errors ───
            // On Node-hosted RisuAI, the /proxy2 endpoint requires JWT auth
            // (risu-auth header). When plainFetchDeforce routes through
            // fetchWithProxy but the auth is missing/invalid, the proxy returns
            // its own 400 error — NOT from the target API. Detect this and fall
            // through to plainFetchForce (direct fetch) instead.
            if (result.status === 400 && mode === 'plainFetchDeforce') {
                try {
                    const _proxyErrText = new TextDecoder().decode(responseBody);
                    const _proxyErrObj = JSON.parse(_proxyErrText);
                    const _knownProxyErrors = ['No auth header', 'Password Incorrect', 'Token Expired', 'Unknown Public Key', 'Invalid Signature'];
                    if (_proxyErrObj?.error && _knownProxyErrors.some(e => String(_proxyErrObj.error).includes(e))) {
                        console.warn(`[CupcakePM] Copilot ${mode} risuFetch got proxy auth error: "${_proxyErrObj.error}" — falling through to plainFetchForce`);
                        return null;
                    }
                } catch (_) { /* not a proxy error JSON — continue normally */ }
            }
            console.log(`[CupcakePM] Copilot ${mode} risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
            return new Response(/** @type {any} */ (responseBody), {
                status: result.status || 200,
                headers: new Headers(result.headers || {}),
            });
        }

        const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
        console.log(`[CupcakePM] Copilot ${mode} risuFetch not a real response: ${errPreview}`);
    } catch (e) {
        if (_isAbortError(e)) throw e;
        console.log(`[CupcakePM] Copilot ${mode} risuFetch error: ${/** @type {Error} */ (e).message}`);
    }
    return null;
}
