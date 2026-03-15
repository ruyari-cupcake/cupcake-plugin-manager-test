// @ts-check
/**
 * sse-parsers.js — SSE line parsers for different API formats.
 * Pure functions that extract delta text from SSE "data: {...}" lines.
 */

/**
 * OpenAI-compatible SSE parser: extracts delta.content from "data: {...}" lines.
 * Works for OpenAI, DeepSeek, OpenRouter, and other OpenAI-compatible APIs.
 * @param {string} line - SSE line (e.g. "data: {\"choices\":[...]}")
 * @returns {string|null} Delta text content or null
 */
export function parseOpenAISSELine(line) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    if (jsonStr === '[DONE]') return null;
    try {
        const obj = JSON.parse(jsonStr);
        return obj.choices?.[0]?.delta?.content || null;
    } catch { return null; }
}

/**
 * Normalize OpenAI message content (string, array of parts, null).
 * @param {*} content - Message content from API response
 * @returns {string}
 */
export function normalizeOpenAIMessageContent(content) {
    if (typeof content === 'string') return content;
    if (content == null) return '';
    if (Array.isArray(content)) {
        let out = '';
        for (const part of content) {
            if (typeof part === 'string') {
                out += part;
                continue;
            }
            if (!part || typeof part !== 'object') continue;
            if (typeof part.text === 'string') {
                out += part.text;
                continue;
            }
            if (part.type === 'text' && typeof part.content === 'string') {
                out += part.content;
            }
        }
        return out;
    }
    return String(content);
}

/**
 * Gemini block reasons that indicate safety filtering.
 */
export const GEMINI_BLOCK_REASONS = ['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'];

/**
 * Gemini SSE line parser: extracts text parts from streamed JSON chunks.
 * Handles thinking blocks, thought signatures, safety blocks, and usageMetadata.
 * @param {string} line - SSE data line
 * @param {Record<string, any>} config - Mutable config for tracking state across chunks
 * @returns {string|null} Delta text content or null
 */
export function parseGeminiSSELine(line, config = {}) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    try {
        const obj = JSON.parse(jsonStr);

        const promptBlockReason = obj?.promptFeedback?.blockReason;
        const finishReason = obj?.candidates?.[0]?.finishReason;
        const effectiveBlockReason = promptBlockReason ?? finishReason;
        if (effectiveBlockReason && GEMINI_BLOCK_REASONS.includes(effectiveBlockReason)) {
            let blockMsg = '';
            if (config._inThoughtBlock) { config._inThoughtBlock = false; blockMsg += '\n\n</Thoughts>\n\n'; }
            return blockMsg + `\n\n[⚠️ Gemini Safety Block: ${effectiveBlockReason}] ${JSON.stringify(obj.promptFeedback || obj.candidates?.[0]?.safetyRatings || '').substring(0, 300)}`;
        }

        let text = '';
        if (obj.candidates?.[0]?.content?.parts) {
            for (const part of obj.candidates[0].content.parts) {
                if (part.thought) {
                    if (part.text) {
                        if (!config._inThoughtBlock) {
                            config._inThoughtBlock = true;
                            text += '<Thoughts>\n\n';
                        }
                        text += part.text;
                    }
                } else if (part.text !== undefined) {
                    if (config._inThoughtBlock) {
                        config._inThoughtBlock = false;
                        text += '\n\n</Thoughts>\n\n';
                    }
                    text += part.text;
                    if (config.useThoughtSignature) {
                        config._streamResponseText = (config._streamResponseText || '') + part.text;
                    }
                }
                if (config.useThoughtSignature && (part.thought_signature || part.thoughtSignature)) {
                    config._lastSignature = part.thought_signature || part.thoughtSignature;
                }
            }
        }

        if (config._inThoughtBlock && finishReason) {
            config._inThoughtBlock = false;
            text += '\n\n</Thoughts>\n\n';
        }

        if (obj.usageMetadata) {
            config._streamUsageMetadata = obj.usageMetadata;
        }

        return text || null;
    } catch { return null; }
}
