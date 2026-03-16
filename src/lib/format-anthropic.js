// @ts-check
/**
 * format-anthropic.js — Format messages for Anthropic Claude API.
 * Handles system prompt extraction, consecutive message merging, multimodal content,
 * and cache_control breakpoints.
 */
import { sanitizeMessages, extractNormalizedMessagePayload } from './sanitize.js';
import { hasNonEmptyMessageContent, parseBase64DataUri, extractImageUrlFromPart } from './helpers.js';

/**
 * Merge content parts into the previous message if same role, otherwise push a new entry.
 * Eliminates the repeated consecutive-merge pattern throughout formatToAnthropic.
 * @param {Array<any>} formattedMsgs - The formatted message array (mutated in place)
 * @param {string} role - 'user' | 'assistant'
 * @param {Array<any>} contentParts - Array of Anthropic content blocks to merge/push
 */
export function _mergeOrPush(formattedMsgs, role, contentParts) {
    if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
        const prev = formattedMsgs[formattedMsgs.length - 1];
        if (typeof prev.content === 'string') {
            prev.content = [{ type: 'text', text: prev.content }, ...contentParts];
        } else if (Array.isArray(prev.content)) {
            prev.content.push(...contentParts);
        }
    } else {
        formattedMsgs.push({ role, content: contentParts });
    }
}

/**
 * Format messages for Anthropic Messages API.
 * @param {Array<any>} messages - Raw message array
 * @param {Object} config - Formatting options
 * @param {boolean} [config.caching] - Enable cache_control breakpoints
 * @param {boolean} [config.claude1HourCaching] - Use 1h TTL for cache_control
 * @returns {{ messages: Array<any>, system: string }}
 */
export function formatToAnthropic(messages, config = {}) {
    /** @type {any[]} */
    const validMsgs = sanitizeMessages(messages);

    // Extract leading system messages
    const leadingSystem = [];
    let splitIdx = 0;
    for (let i = 0; i < validMsgs.length; i++) {
        if (validMsgs[i].role === 'system') {
            leadingSystem.push(typeof validMsgs[i].content === 'string' ? validMsgs[i].content : JSON.stringify(validMsgs[i].content));
            splitIdx = i + 1;
        } else {
            break;
        }
    }
    const systemPrompt = leadingSystem.join('\n\n');
    const remainingMsgs = validMsgs.slice(splitIdx);

    // Non-leading system messages → user role with "System: " prefix
    /** @type {any[]} */
    const chatMsgs = remainingMsgs.map(m => {
        if (m.role === 'system') {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return { ...m, role: 'user', content: `System: ${content}` };
        }
        return m;
    });

    /** @type {any[]} */
    const formattedMsgs = [];
    /** @type {number[]} — maps each chatMsgs[i] to its formattedMsgs index, or -1 if skipped */
    const srcToFmtMap = new Array(chatMsgs.length).fill(-1);
    for (let ci = 0; ci < chatMsgs.length; ci++) {
        const m = chatMsgs[ci];
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        const payload = extractNormalizedMessagePayload(m);

        // Multimodal handling (images) → Anthropic vision format
        if (payload.multimodals.length > 0) {
            const imageParts = [];
            const textParts = [];
            const textContent = payload.text.trim();
            if (textContent) textParts.push({ type: 'text', text: textContent });
            for (const modal of payload.multimodals) {
                if (!modal || typeof modal !== 'object') continue;
                if (modal.type === 'image') {
                    if (typeof modal.url === 'string' && (modal.url.startsWith('http://') || modal.url.startsWith('https://'))) {
                        imageParts.push({
                            type: 'image',
                            source: { type: 'url', url: modal.url }
                        });
                        continue;
                    }
                    const { mimeType: mediaType_raw, data } = parseBase64DataUri(/** @type {string} */ (modal.base64));
                    const mediaType = mediaType_raw || 'image/png';
                    imageParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: data }
                    });
                }
            }
            const contentParts = [...imageParts, ...textParts];
            if (contentParts.length > 0) {
                _mergeOrPush(formattedMsgs, role, contentParts);
                srcToFmtMap[ci] = formattedMsgs.length - 1;
            } else {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                if (!hasNonEmptyMessageContent(content)) continue;
                _mergeOrPush(formattedMsgs, role, [{ type: 'text', text: content }]);
                srcToFmtMap[ci] = formattedMsgs.length - 1;
            }
            continue;
        }

        // Array content (pass-through with cross-format conversion)
        if (Array.isArray(m.content)) {
            const contentParts = [];
            for (const part of m.content) {
                if (!part || typeof part !== 'object') continue;
                if (typeof part.text === 'string' && part.text.trim() !== '') {
                    contentParts.push({ type: 'text', text: part.text });
                    continue;
                }
                if (part.type === 'image' && part.source?.type === 'base64' && part.source.data) {
                    contentParts.push(part);
                    continue;
                }
                if (part.inlineData?.data) {
                    const _mt = part.inlineData.mimeType || 'application/octet-stream';
                    if (_mt.startsWith('image/')) {
                        contentParts.push({ type: 'image', source: { type: 'base64', media_type: _mt, data: part.inlineData.data } });
                    }
                    continue;
                }
                if (part.type === 'image_url' || part.type === 'input_image') {
                    const imageUrl = extractImageUrlFromPart(part);
                    if (imageUrl.startsWith('data:image/')) {
                        const { mimeType: _mt, data: _d } = parseBase64DataUri(imageUrl);
                        if (_d) contentParts.push({ type: 'image', source: { type: 'base64', media_type: _mt || 'image/png', data: _d } });
                    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        contentParts.push({ type: 'image', source: { type: 'url', url: imageUrl } });
                    }
                }
            }

            if (contentParts.length > 0) {
                _mergeOrPush(formattedMsgs, role, contentParts);
                srcToFmtMap[ci] = formattedMsgs.length - 1;
                continue;
            }
        }

        // Text-only message
        const content = payload.text || (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
        if (!hasNonEmptyMessageContent(content)) continue;
        _mergeOrPush(formattedMsgs, role, [{ type: 'text', text: content }]);
        srcToFmtMap[ci] = formattedMsgs.length - 1;
    }

    // Ensure first message is user role
    if (formattedMsgs.length === 0 || formattedMsgs[0].role !== 'user') {
        formattedMsgs.unshift({ role: 'user', content: [{ type: 'text', text: 'Start' }] });
        // Adjust mapping indices after unshift
        for (let i = 0; i < srcToFmtMap.length; i++) {
            if (srcToFmtMap[i] >= 0) srcToFmtMap[i]++;
        }
    }

    // Apply cache_control breakpoints
    // Anthropic supports { type: 'ephemeral' } for 5-min default TTL.
    // With extended-cache-ttl-2025-04-11 beta header, { type: 'ephemeral', ttl: '1h' } is supported.
    if (config.caching) {
        // Use 1-hour TTL if claude1HourCaching is enabled, otherwise use default 5-min TTL
        const _cacheCtrl = config.claude1HourCaching
            ? { type: 'ephemeral', ttl: '1h' }
            : { type: 'ephemeral' };
        for (let ci = 0; ci < chatMsgs.length; ci++) {
            if (!chatMsgs[ci].cachePoint) continue;
            const fmtIdx = srcToFmtMap[ci];
            if (fmtIdx < 0 || fmtIdx >= formattedMsgs.length) continue;
            const fMsg = formattedMsgs[fmtIdx];
            if (Array.isArray(fMsg.content) && fMsg.content.length > 0) {
                fMsg.content[fMsg.content.length - 1].cache_control = _cacheCtrl;
            } else if (typeof fMsg.content === 'string') {
                fMsg.content = [{ type: 'text', text: fMsg.content, cache_control: _cacheCtrl }];
            }
        }
    }

    return { messages: formattedMsgs, system: systemPrompt };
}
