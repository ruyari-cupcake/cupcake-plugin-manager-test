// @ts-check
/**
 * format-openai.js — Format messages for OpenAI-compatible APIs.
 * Handles multimodal content, role normalization, developer role conversion.
 */
import { sanitizeMessages, extractNormalizedMessagePayload } from './sanitize.js';
import { hasNonEmptyMessageContent, parseBase64DataUri } from './helpers.js';

/**
 * Format messages for OpenAI Chat Completions API.
 * @param {Array<any>} messages - Raw message array from RisuAI
 * @param {object} config - Formatting options
 * @param {boolean} [config.mergesys] - Merge system messages into first user message
 * @param {boolean} [config.mustuser] - Ensure first message is user/system
 * @param {boolean} [config.altrole] - Convert assistant→model (for Gemini-style APIs)
 * @param {boolean} [config.sysfirst] - Move first system message to top
 * @param {boolean} [config.developerRole] - Convert system→developer (GPT-5 series)
 * @returns {Array<any>} Formatted messages array
 */
export function formatToOpenAI(messages, config = {}) {
    // Step 1: Deep sanitize — remove nulls, strip internal RisuAI tags
    /** @type {Record<string, any>[]} */
    let msgs = sanitizeMessages(messages);

    if (config.mergesys) {
        let sysPrompt = "";
        const newMsgs = [];
        for (const m of msgs) {
            if (m.role === 'system') sysPrompt += (sysPrompt ? '\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            else newMsgs.push(m);
        }
        if (sysPrompt && newMsgs.length > 0) {
            newMsgs[0].content = sysPrompt + "\n\n" + (typeof newMsgs[0].content === 'string' ? newMsgs[0].content : JSON.stringify(newMsgs[0].content));
        }
        msgs = newMsgs;
    }

    if (config.mustuser) {
        if (msgs.length > 0 && msgs[0].role !== 'user' && msgs[0].role !== 'system') {
            msgs.unshift({ role: 'user', content: ' ' });
        }
    }

    const arr = [];
    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (!m || typeof m !== 'object') continue;
        let role = typeof m.role === 'string' ? m.role : 'user';
        if (!role) continue;
        // Normalize non-OpenAI roles to standard OpenAI roles
        if (role === 'model' || role === 'char') role = 'assistant';
        /** @type {{ role: string, content: any, name?: string }} */
        const msg = { role, content: '' };
        if (config.altrole && msg.role === 'assistant') msg.role = 'model';

        const payload = extractNormalizedMessagePayload(m);

        // Handle multimodals (images/audio) → OpenAI vision format
        if (payload.multimodals.length > 0) {
            const contentParts = [];
            const textContent = payload.text.trim();
            if (textContent) contentParts.push({ type: 'text', text: textContent });
            for (const modal of payload.multimodals) {
                if (!modal || typeof modal !== 'object') continue;
                if (modal.type === 'image') {
                    if (modal.base64) contentParts.push({ type: 'image_url', image_url: { url: modal.base64 } });
                    else if (modal.url) contentParts.push({ type: 'image_url', image_url: { url: modal.url } });
                } else if (modal.type === 'audio') {
                    const { mimeType: _audioMime, data: _audioData } = parseBase64DataUri(modal.base64 ?? '');
                    let _audioFormat = 'mp3';
                    if (_audioMime) {
                        const _m = _audioMime.toLowerCase();
                        if (_m.includes('wav')) _audioFormat = 'wav';
                        else if (_m.includes('ogg')) _audioFormat = 'ogg';
                        else if (_m.includes('flac')) _audioFormat = 'flac';
                        else if (_m.includes('webm')) _audioFormat = 'webm';
                    }
                    contentParts.push({ type: 'input_audio', input_audio: { data: _audioData, format: _audioFormat } });
                }
            }
            msg.content = contentParts.length > 0 ? contentParts : (textContent || '');
        } else if (typeof m.content === 'string') {
            msg.content = m.content;
        } else if (Array.isArray(m.content)) {
            const mappedParts = [];
            for (const part of m.content) {
                if (!part || typeof part !== 'object') continue;
                if (part.type === 'image' && part.source?.type === 'base64' && part.source.data) {
                    mappedParts.push({ type: 'image_url', image_url: { url: `data:${part.source.media_type || 'image/png'};base64,${part.source.data}` } });
                    continue;
                }
                if (part.inlineData?.data) {
                    const _mt = part.inlineData.mimeType || 'application/octet-stream';
                    if (_mt.startsWith('image/')) mappedParts.push({ type: 'image_url', image_url: { url: `data:${_mt};base64,${part.inlineData.data}` } });
                    else if (_mt.startsWith('audio/')) mappedParts.push({ type: 'input_audio', input_audio: { data: part.inlineData.data, format: _mt.split('/')[1] || 'mp3' } });
                    continue;
                }
                mappedParts.push(part);
            }
            msg.content = mappedParts;
        } else {
            msg.content = payload.text || String(m.content ?? '');
        }

        if (msg.role === 'user' && msg.content === ' ') {
            if (m.name && typeof m.name === 'string') msg.name = m.name;
            arr.push(msg);
            continue;
        }

        if (msg.content === null || msg.content === undefined) continue;
        if (!hasNonEmptyMessageContent(msg.content)) continue;
        if (m.name && typeof m.name === 'string') msg.name = m.name;
        arr.push(msg);
    }

    if (config.sysfirst) {
        const firstIdx = arr.findIndex(m => m.role === 'system');
        if (firstIdx > 0) {
            const el = arr.splice(firstIdx, 1)[0];
            arr.unshift(el);
        }
    }

    // Native RisuAI requiresAlternateRole behavior:
    // after assistant→model remap, consecutive same-role messages are merged.
    if (config.altrole) {
        const merged = [];
        for (const msg of arr) {
            const prev = merged[merged.length - 1];
            if (!prev || prev.role !== msg.role) {
                merged.push(msg);
                continue;
            }

            if (typeof prev.content === 'string' && typeof msg.content === 'string') {
                prev.content += '\n' + msg.content;
                continue;
            }

            const prevParts = Array.isArray(prev.content)
                ? prev.content
                : (hasNonEmptyMessageContent(prev.content) ? [{ type: 'text', text: String(prev.content) }] : []);
            const msgParts = Array.isArray(msg.content)
                ? msg.content
                : (hasNonEmptyMessageContent(msg.content) ? [{ type: 'text', text: String(msg.content) }] : []);

            prev.content = [...prevParts, ...msgParts];
        }
        arr.length = 0;
        arr.push(...merged);
    }

    // GPT-5 series: system → developer role conversion
    if (config.developerRole) {
        for (const m of arr) {
            if (m.role === 'system') m.role = 'developer';
        }
    }

    return arr;
}
