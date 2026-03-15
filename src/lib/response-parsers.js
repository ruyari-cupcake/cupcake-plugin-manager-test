// @ts-check
/**
 * response-parsers.js — Non-streaming response parsers for all providers.
 * Pure functions that extract text content from API JSON responses.
 */
import { normalizeOpenAIMessageContent, GEMINI_BLOCK_REASONS } from './sse-parsers.js';
import { _normalizeTokenUsage, _setTokenUsage } from './token-usage.js';
import { ThoughtSignatureCache } from './format-gemini.js';

/**
 * Parse OpenAI Chat Completions non-streaming response.
 * Handles reasoning_content (o-series), reasoning (OpenRouter), DeepSeek <think> blocks.
 * @param {Record<string, any>} data - Parsed JSON response
 * @param {string} [_requestId] - Optional API View request ID
 * @returns {{ success: boolean, content: string }}
 */
export function parseOpenAINonStreamingResponse(data, _requestId) {
    const msg = data.choices?.[0]?.message;
    if (!msg) return { success: false, content: '[OpenAI] Empty response (no message)' };

    let out = '';
    const reasoningContent = data.choices?.[0]?.reasoning_content ?? msg.reasoning_content;
    if (reasoningContent) {
        out += '<Thoughts>\n' + String(reasoningContent) + '\n</Thoughts>\n';
    }
    const openRouterReasoning = msg.reasoning ?? data.choices?.[0]?.reasoning;
    if (openRouterReasoning && !reasoningContent) {
        out += '<Thoughts>\n' + String(openRouterReasoning) + '\n</Thoughts>\n';
    }

    let content = normalizeOpenAIMessageContent(msg.content);
    if (content.includes('</think>')) {
        let dsThinking = '';
        content = content.replace(/<think>([\s\S]*?)<\/think>/gm, (_m, p1) => {
            dsThinking += p1;
            return '';
        });
        if (dsThinking) {
            out += '<Thoughts>\n' + dsThinking + '\n</Thoughts>\n';
        }
    }
    out += content;

    if (data.usage) {
        const _tu = _normalizeTokenUsage(data.usage, 'openai');
        if (_tu) _setTokenUsage(/** @type {string} */ (_requestId), _tu, false);
    }
    return { success: !!out, content: out || '[OpenAI] Empty response' };
}

/**
 * Parse OpenAI Responses API non-streaming response (GPT-5.4+).
 * Extracts text from output[].content[].text and reasoning from output[].summary[].
 * @param {Record<string, any>} data - Parsed JSON response
 * @param {string} [_requestId] - Optional API View request ID
 * @returns {{ success: boolean, content: string }}
 */
export function parseResponsesAPINonStreamingResponse(data, _requestId) {
    if (!data || !data.output || !Array.isArray(data.output)) {
        if (data?.choices?.[0]?.message) return parseOpenAINonStreamingResponse(data, _requestId);
        return { success: false, content: '[Responses API] Empty response (no output)' };
    }

    let out = '';
    for (const item of data.output) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'reasoning' && Array.isArray(item.summary)) {
            const reasoningText = item.summary
                .filter(/** @type {(s: any) => boolean} */ (s) => s && s.type === 'summary_text')
                .map(/** @type {(s: any) => string} */ (s) => s.text || '')
                .join('');
            if (reasoningText) out += '<Thoughts>\n' + reasoningText + '\n</Thoughts>\n';
        }
        if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
                if (!part || typeof part !== 'object') continue;
                if (part.type === 'output_text') out += part.text || '';
            }
        }
    }

    if (data.usage) {
        const _tu = _normalizeTokenUsage(data.usage, 'openai');
        if (_tu) _setTokenUsage(/** @type {string} */ (_requestId), _tu, false);
    }
    return { success: !!out, content: out || '[Responses API] Empty response' };
}

/**
 * Parse Gemini generateContent non-streaming response.
 * Handles safety blocks, thoughts, thought_signature caching.
 * @param {Record<string, any>} data - Parsed JSON response
 * @param {Record<string, any>} [config] - { useThoughtSignature }
 * @param {string} [_requestId] - Optional API View request ID
 * @returns {{ success: boolean, content: string }}
 */
export function parseGeminiNonStreamingResponse(data, config = {}, _requestId) {
    const blockReason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason;
    if (blockReason && GEMINI_BLOCK_REASONS.includes(blockReason)) {
        return {
            success: false,
            content: `[⚠️ Gemini Safety Block: ${blockReason}] ${JSON.stringify(data.promptFeedback || data.candidates?.[0]?.safetyRatings || '').substring(0, 500)}`,
        };
    }

    let result = '';
    let extractedSignature = null;
    let inThought = false;

    if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
            if (part.thought) {
                if (part.text) {
                    if (!inThought) { inThought = true; result += '<Thoughts>\n\n'; }
                    result += part.text;
                }
            } else if (part.text !== undefined) {
                if (inThought) { inThought = false; result += '\n\n</Thoughts>\n\n'; }
                result += part.text;
            }
            if (config.useThoughtSignature && (part.thought_signature || part.thoughtSignature)) {
                extractedSignature = part.thought_signature || part.thoughtSignature;
            }
        }
    }

    if (inThought) result += '\n\n</Thoughts>\n\n';
    if (extractedSignature && result) {
        ThoughtSignatureCache.save(result, extractedSignature);
    }
    if (data.usageMetadata) {
        const _tu = _normalizeTokenUsage(data.usageMetadata, 'gemini');
        if (_tu) _setTokenUsage(/** @type {string} */ (_requestId), _tu, false);
    }
    return { success: !!result, content: result || '[Gemini] Empty response' };
}

/**
 * Parse Claude (Anthropic) non-streaming response.
 * Handles thinking/redacted_thinking blocks.
 * @param {Record<string, any>} data - Parsed JSON response
 * @param {Record<string, any>} [_config] - Unused, reserved for future options
 * @param {string} [_requestId] - Optional API View request ID
 * @returns {{ success: boolean, content: string }}
 */
export function parseClaudeNonStreamingResponse(data, _config = {}, _requestId) {
    if (data.type === 'error' || data.error) {
        const errMsg = data.error?.message || data.message || JSON.stringify(data.error || data).substring(0, 500);
        return { success: false, content: `[Claude Error] ${errMsg}` };
    }

    let result = '';
    let inThinking = false;
    let hasThinking = false;
    let visibleText = '';

    if (Array.isArray(data.content)) {
        for (const block of data.content) {
            if (block.type === 'thinking') {
                if (block.thinking) {
                    hasThinking = true;
                    if (!inThinking) { inThinking = true; result += '<Thoughts>\n'; }
                    result += block.thinking;
                }
            } else if (block.type === 'redacted_thinking') {
                hasThinking = true;
                if (!inThinking) { inThinking = true; result += '<Thoughts>\n'; }
                result += '\n{{redacted_thinking}}\n';
            } else if (block.type === 'text') {
                if (inThinking) { inThinking = false; result += '</Thoughts>\n\n'; }
                const blockText = block.text || '';
                visibleText += blockText;
                result += blockText;
            }
        }
    }

    if (inThinking) result += '</Thoughts>\n\n';
    if (data.usage) {
        const _tu = _normalizeTokenUsage(data.usage, 'anthropic', {
            anthropicHasThinking: hasThinking,
            anthropicVisibleText: visibleText,
        });
        if (_tu) _setTokenUsage(/** @type {string} */ (_requestId), _tu, false);
    }
    return { success: !!result, content: result || '[Claude] Empty response' };
}
