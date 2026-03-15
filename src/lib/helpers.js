// @ts-check
/**
 * helpers.js — Pure utility functions for Cupcake Provider Manager.
 * Zero external dependencies. Safe for all environments.
 */

/**
 * Safe UUID generator: uses crypto.randomUUID() when available (secure contexts),
 * falls back to a random string for HTTP/Docker/insecure environments where
 * crypto.randomUUID is undefined and would crash the app.
 * @returns {string}
 */
export function safeUUID() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_) { /* ignore */ }
    // Fallback: generate a v4-like UUID from Math.random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * Safe JSON.stringify: replacer removes null/undefined from all arrays during serialization.
 * Catches nulls from toJSON(), undefined→null conversion, etc.
 * @param {any} obj
 */
export function safeStringify(obj) {
    return JSON.stringify(obj, function (_key, value) {
        if (Array.isArray(value)) {
            return value.filter(function (item) { return item != null; });
        }
        return value;
    });
}

/**
 * Check if message content is non-empty (string, array, or object).
 * @param {any} content
 */
export function hasNonEmptyMessageContent(content) {
    if (content === null || content === undefined) return false;
    if (typeof content === 'string') return content.trim() !== '';
    if (Array.isArray(content)) return content.length > 0;
    if (typeof content === 'object') return true;
    return String(content).trim() !== '';
}

/**
 * Check if a message has attached multimodal content (images, audio, etc.).
 * @param {any} message
 */
export function hasAttachedMultimodals(message) {
    return !!(message && Array.isArray(message.multimodals) && message.multimodals.length > 0);
}

/**
 * Escape HTML special characters to prevent XSS when interpolating into innerHTML.
 * Shared across all settings-ui modules.
 * @param {any} s
 */
export function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Parse a base64 data URI into its MIME type and raw data components.
 * e.g. "data:image/png;base64,abc123" → { mimeType: "image/png", data: "abc123" }
 * For raw base64 without a data URI prefix, returns { mimeType: null, data: input }.
 * @param {string} dataUri
 * @returns {{ mimeType: string|null, data: string }}
 */
export function parseBase64DataUri(dataUri) {
    if (!dataUri || typeof dataUri !== 'string') return { mimeType: null, data: '' };
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return { mimeType: null, data: dataUri };
    const prefix = dataUri.substring(0, commaIdx);
    const mimeType = prefix.split(';')[0]?.split(':')[1] || null;
    const data = dataUri.substring(commaIdx + 1);
    return { mimeType, data };
}

/**
 * Extract image URL from an OpenAI-format content part (image_url or input_image).
 * Handles both string and object forms of image_url.
 * @param {Record<string, any>} part - Content part with image_url field
 * @returns {string} URL or empty string
 */
export function extractImageUrlFromPart(part) {
    if (!part) return '';
    const raw = part.image_url;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw.url === 'string') return raw.url;
    return '';
}

/**
 * Get the file accept attribute for sub-plugin file inputs.
 * Mobile/iOS devices need broader accept types.
 */
export function getSubPluginFileAccept() {
    try {
        const ua = (navigator.userAgent || '').toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
        if (isIOS || isMobile) {
            return '.js,.mjs,.txt,text/javascript,application/javascript,*/*';
        }
    } catch (_) {}
    return '.js,.mjs,text/javascript,application/javascript';
}
