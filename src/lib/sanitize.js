// @ts-check
/**
 * sanitize.js — Message sanitization and content normalization.
 * Strips internal RisuAI tags, filters null entries, normalizes multimodal payloads.
 */
import { hasNonEmptyMessageContent, hasAttachedMultimodals, safeStringify } from './helpers.js';

/**
 * @typedef {{ type: string, base64?: string, url?: string, mimeType?: string }} NormalizedMultimodal
 * @typedef {{ text: string, multimodals: NormalizedMultimodal[] }} NormalizedPayload
 */

/**
 * Check if text is an inlay scene wrapper (should be preserved intact).
 * @param {string} text
 * @returns {boolean}
 */
export function isInlaySceneWrapperText(text) {
    if (typeof text !== 'string') return false;
    return /<lb-xnai\s+scene="[^"]*">\{\{(?:inlay|inlayed|inlayeddata)::[^}]*\}\}<\/lb-xnai>/i.test(text);
}

/**
 * Strip RisuAI-internal tags from message content.
 * Keep inlay tokens intact to avoid breaking translation/aux slot image flows.
 * @param {string} text
 * @returns {string}
 */
export function stripInternalTags(text) {
    if (typeof text !== 'string') return text;
    if (isInlaySceneWrapperText(text)) {
        return text.trim();
    }
    return text
        .replace(/<qak>|<\/qak>/g, '')
        .trim();
}

/**
 * Remove stale auto-generated image captions from message text.
 * Only strips when: no inlay tokens, no attached multimodals, text contains image-related keywords.
 * @param {string} text
 * @param {Object} message
 * @returns {string}
 */
export function stripStaleAutoCaption(text, message) {
    if (typeof text !== 'string') return text;
    if (isInlaySceneWrapperText(text) || /\{\{(?:inlay|inlayed|inlayeddata)::[^}]*\}\}/i.test(text)) return text;
    if (hasAttachedMultimodals(message)) return text;

    const lower = text.toLowerCase();
    const imageIntent = lower.includes('image') || lower.includes('photo') || lower.includes('picture') || lower.includes('첨부') || lower.includes('사진');
    if (!imageIntent) return text;

    return text.replace(/\s*\[[a-z0-9][a-z0-9 ,.'"-]{6,}\]\s*$/i, (match) => {
        // Only strip if the bracket content looks like an auto-generated image caption.
        // Captions are typically multi-word descriptions (≥3 alphabetic words).
        // This avoids stripping structured references like [Chapter 12, Part 2].
        const inner = match.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
        const wordCount = (inner.match(/[a-z]{2,}/gi) || []).length;
        if (wordCount >= 3) return '';
        return match;   // Too few words to be an image caption — leave it alone
    }).trim();
}

/**
 * Extract and normalize message payload into { text, multimodals }.
 * Handles RisuAI multimodals array, OpenAI content parts (image_url, input_audio, input_image),
 * Anthropic image blocks, and Gemini inlineData.
 * @param {Record<string, any>} message
 * @returns {NormalizedPayload}
 */
export function extractNormalizedMessagePayload(message) {
    const normalizedMultimodals = [];
    const textParts = [];

    if (Array.isArray(message?.multimodals)) {
        for (const modal of message.multimodals) {
            if (modal && typeof modal === 'object') normalizedMultimodals.push(modal);
        }
    }

    const content = message?.content;
    if (typeof content === 'string') {
        textParts.push(content);
    } else if (Array.isArray(content)) {
        for (const part of content) {
            if (!part || typeof part !== 'object') continue;

            if (typeof part.text === 'string' && part.text.trim() !== '') {
                textParts.push(part.text);
            }

            if (part.inlineData && part.inlineData.data) {
                const mimeType = part.inlineData.mimeType || 'application/octet-stream';
                const dataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
                if (mimeType.startsWith('image/')) normalizedMultimodals.push({ type: 'image', base64: dataUrl, mimeType });
                else if (mimeType.startsWith('audio/')) normalizedMultimodals.push({ type: 'audio', base64: dataUrl, mimeType });
                else if (mimeType.startsWith('video/')) normalizedMultimodals.push({ type: 'video', base64: dataUrl, mimeType });
            }

            if (part.type === 'image_url') {
                const imageUrl = typeof part.image_url === 'string'
                    ? part.image_url
                    : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                if (imageUrl.startsWith('data:image/')) {
                    const mimeType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                    normalizedMultimodals.push({ type: 'image', base64: imageUrl, mimeType });
                } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    normalizedMultimodals.push({ type: 'image', url: imageUrl, mimeType: 'image/*' });
                }
            }

            if (part.type === 'input_image') {
                const imageUrl = typeof part.image_url === 'string'
                    ? part.image_url
                    : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                if (imageUrl.startsWith('data:image/')) {
                    const mimeType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                    normalizedMultimodals.push({ type: 'image', base64: imageUrl, mimeType });
                } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    normalizedMultimodals.push({ type: 'image', url: imageUrl, mimeType: 'image/*' });
                }
            }

            if (part.type === 'input_audio' && part.input_audio && part.input_audio.data) {
                const format = part.input_audio.format || 'mp3';
                const mimeType = `audio/${format}`;
                normalizedMultimodals.push({ type: 'audio', base64: `data:${mimeType};base64,${part.input_audio.data}`, mimeType });
            }

            if (part.type === 'image' && part.source && part.source.type === 'base64' && part.source.data) {
                const mimeType = part.source.media_type || 'image/png';
                normalizedMultimodals.push({ type: 'image', base64: `data:${mimeType};base64,${part.source.data}`, mimeType });
            }
        }
    } else if (content !== null && content !== undefined) {
        if (typeof content === 'object' && typeof content.text === 'string') textParts.push(content.text);
        else if (typeof content === 'object') {
            // Structured objects (e.g. multimodal parts missing .text) must be
            // JSON-serialized to preserve data. String(obj) produces the useless
            // "[object Object]" which corrupts downstream API payloads.
            try { textParts.push(JSON.stringify(content)); } catch (_) { textParts.push(String(content)); }
        }
        else textParts.push(String(content));
    }

    return {
        text: textParts.join('\n\n'),
        multimodals: normalizedMultimodals,
    };
}

/**
 * Deep-sanitize messages array: remove null/undefined entries,
 * strip internal RisuAI tags, filter messages with empty content.
 * Returns a NEW array — never mutates the input.
 * @param {Array<Record<string, any>>} messages
 * @returns {Array<Record<string, any>>}
 */
export function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const result = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m == null || typeof m !== 'object') continue;
        if (typeof m.role !== 'string' || !m.role) continue;
        if (m.content === null || m.content === undefined) continue;
        const cleaned = { ...m };
        if (typeof cleaned.toJSON === 'function') delete cleaned.toJSON;
        if (typeof cleaned.content === 'string') {
            cleaned.content = stripInternalTags(cleaned.content);
            cleaned.content = stripStaleAutoCaption(cleaned.content, cleaned);
        }
        if (!hasNonEmptyMessageContent(cleaned.content) && !hasAttachedMultimodals(cleaned)) continue;
        result.push(cleaned);
    }
    return result;
}

/**
 * Last-line-of-defense: parse JSON body, filter null entries from messages/contents,
 * re-stringify via safeStringify to catch any remaining nulls.
 * @param {string} jsonStr
 * @returns {string}
 */
export function sanitizeBodyJSON(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        if (Array.isArray(obj.messages)) {
            const before = obj.messages.length;
            obj.messages = obj.messages.filter((/** @type {any} */ m) => {
                if (m == null || typeof m !== 'object') return false;
                if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
                if (typeof m.role !== 'string' || !m.role) return false;
                if (typeof m.toJSON === 'function') delete m.toJSON;
                return true;
            });
            if (obj.messages.length < before) {
                console.warn(`[Cupcake PM] sanitizeBodyJSON: removed ${before - obj.messages.length} invalid entries from messages`);
            }
        }
        if (Array.isArray(obj.contents)) {
            const before = obj.contents.length;
            obj.contents = obj.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
            if (obj.contents.length < before) {
                console.warn(`[Cupcake PM] sanitizeBodyJSON: removed ${before - obj.contents.length} null entries from contents`);
            }
        }
        const result = safeStringify(obj);
        try {
            JSON.parse(result);
        } catch {
            console.error('[Cupcake PM] sanitizeBodyJSON: output validation failed — returning original');
            return jsonStr;
        }
        return result;
    } catch (e) {
        if (typeof jsonStr === 'string' && !jsonStr.trimStart().startsWith('{') && !jsonStr.trimStart().startsWith('[')) {
            return jsonStr;
        }
        console.error('[Cupcake PM] sanitizeBodyJSON: JSON parse/stringify failed:', /** @type {Error} */ (e).message);
        return jsonStr;
    }
}

/**
 * Strip embedded thought display content from historical model messages.
 * During streaming, thought/reasoning content is injected into the stream text
 * for display (e.g <Thoughts>...</Thoughts> or > [Thought Process] blocks).
 * When that text is saved to chat history and sent back in subsequent requests,
 * it pollutes the API context and wastes tokens. This strips those markers.
 * @param {string} text
 * @returns {string}
 */
export function stripThoughtDisplayContent(text) {
    if (!text) return text;
    let cleaned = text;
    // New format (v1.16.0+): <Thoughts>...</Thoughts>
    cleaned = cleaned.replace(/<Thoughts>[\s\S]*?<\/Thoughts>\s*/g, '');
    // Old format (pre-v1.16.0): > [Thought Process] blockquote sections
    if (cleaned.includes('> [Thought Process]')) {
        const lastMarkerIdx = cleaned.lastIndexOf('> [Thought Process]');
        const afterLastMarker = cleaned.substring(lastMarkerIdx);
        const contentMatch = afterLastMarker.match(/\n{3,}\s*(?=[^\s>\\])/);
        if (contentMatch) {
            cleaned = afterLastMarker.substring(contentMatch.index ?? 0).trim();
        } else {
            cleaned = '';
        }
    }
    cleaned = cleaned.replace(/\\n\\n/g, '');
    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}
