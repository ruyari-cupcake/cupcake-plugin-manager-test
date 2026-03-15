// @ts-check
/**
 * stream-utils.js — Stream utility functions.
 * Provides stream collection and bridge capability detection.
 */

/**
 * Collect a ReadableStream<string> into a single string.
 * Used for decoupled streaming mode and fallback when bridge doesn't support stream transfer.
 * @param {ReadableStream} stream
 * @returns {Promise<string>}
 */
export async function collectStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value == null) continue;
        if (typeof value === 'string') { result += value; continue; }
        if (value instanceof Uint8Array) { result += decoder.decode(value, { stream: true }); continue; }
        if (value instanceof ArrayBuffer) { result += decoder.decode(new Uint8Array(value), { stream: true }); continue; }
        result += String(value);
    }
    result += decoder.decode();
    return result;
}

/** Cached result of stream bridge capability detection. */
/** @type {boolean | null} */
let _streamBridgeCapable = null;

/**
 * Detect if V3 iframe bridge can transfer ReadableStream.
 * Tests structured-clone and transfer-list approaches.
 * Cached after first probe.
 * @returns {Promise<boolean>}
 */
export async function checkStreamCapability() {
    if (_streamBridgeCapable !== null) return _streamBridgeCapable;

    // Phase 1: structured-clone (no transfer list)
    try {
        const s1 = new ReadableStream({ start(c) { c.close(); } });
        const mc1 = new MessageChannel();
        const cloneable = await new Promise(resolve => {
            const timer = setTimeout(() => { resolve(false); try { mc1.port1.close(); mc1.port2.close(); } catch (_) { /* */ } }, 500);
            mc1.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc1.port1.close(); mc1.port2.close(); };
            mc1.port2.onmessageerror = () => { clearTimeout(timer); resolve(false); mc1.port1.close(); mc1.port2.close(); };
            try { mc1.port1.postMessage({ s: s1 }); }
            catch (_) { clearTimeout(timer); resolve(false); }
        });
        if (cloneable) {
            _streamBridgeCapable = true;
            console.log('[CupcakePM] ReadableStream is structured-cloneable — streaming enabled.');
            return true;
        }
    } catch (_) { /* continue to Phase 2 */ }

    // Phase 2: Guest bridge transferable check
    try {
        const scriptContent = document.querySelector('script')?.textContent || '';
        const ctFnMatch = scriptContent.match(/function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/);
        if (ctFnMatch && ctFnMatch[0].includes('ReadableStream')) {
            const s2 = new ReadableStream({ start(c) { c.close(); } });
            const mc2 = new MessageChannel();
            const transferable = await new Promise(resolve => {
                const timer = setTimeout(() => { resolve(false); try { mc2.port1.close(); mc2.port2.close(); } catch (_) { /* */ } }, 500);
                mc2.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc2.port1.close(); mc2.port2.close(); };
                try { mc2.port1.postMessage({ s: s2 }, [s2]); }
                catch (_) { clearTimeout(timer); resolve(false); }
            });
            if (transferable) {
                _streamBridgeCapable = true;
                console.log('[CupcakePM] Guest bridge patched + browser supports transfer — streaming enabled.');
                return true;
            }
        }
    } catch (_) { /* fallback */ }

    _streamBridgeCapable = false;
    console.log('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
    return false;
}

/**
 * Reset the cached stream capability result (for testing).
 */
export function resetStreamCapability() {
    _streamBridgeCapable = null;
}
