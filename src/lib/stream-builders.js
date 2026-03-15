// @ts-check
/**
 * stream-builders.js — SSE stream constructors for all providers.
 * Creates ReadableStream<string> from fetch Response objects.
 * Uses dependency injection for _updateApiRequest to avoid tight coupling.
 */
import { _normalizeTokenUsage, _setTokenUsage } from './token-usage.js';
import { ThoughtSignatureCache } from './format-gemini.js';

/** Module-level reference to the API request logger. Set via setApiRequestLogger().
 * @type {Function|null} */
let _logFn = null;

/**
 * Inject the API request update function.
 * @param {function} fn - (requestId, updates) => void
 */
export function setApiRequestLogger(fn) {
    _logFn = typeof fn === 'function' ? fn : null;
}

/** @param {string|undefined} requestId @param {any} updates */
function _log(requestId, updates) {
    if (_logFn && requestId) _logFn(requestId, updates);
}

// ─── Base SSE Stream ───

/**
 * Parse SSE lines from a ReadableStream<Uint8Array> into a ReadableStream<string>.
 * @param {Response} response - fetch Response with streaming body
 * @param {function} lineParser - (line: string) => string|null
 * @param {AbortSignal} [abortSignal]
 * @param {function} [onComplete] - Called when stream ends, may return final chunk
 * @param {string} [_logRequestId]
 * @returns {ReadableStream<string>}
 */
export function createSSEStream(response, lineParser, abortSignal, onComplete, _logRequestId) {
    const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let _accumulatedContent = '';

    return new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        reader.cancel();
                        if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch (_) { /* */ }
                        _log(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.trim()) {
                            const delta = lineParser(buffer.trim());
                            if (delta) { controller.enqueue(delta); _accumulatedContent += delta; }
                        }
                        if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch (_) { /* */ }
                        _log(_logRequestId, { response: _accumulatedContent || '(empty stream)' });
                        if (_accumulatedContent) console.log('[CupcakePM] 📥 Streamed Response Body:', _accumulatedContent);
                        controller.close();
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith(':')) continue;
                        const delta = lineParser(trimmed);
                        if (delta) { controller.enqueue(delta); _accumulatedContent += delta; }
                    }
                }
            } catch (e) {
                if (/** @type {any} */ (e).name !== 'AbortError') {
                    if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch (_) { /* */ }
                    _log(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${/** @type {any} */ (e).message}]` });
                    controller.error(e);
                } else {
                    if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch (_) { /* */ }
                    _log(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                    controller.close();
                }
            }
        },
        cancel() {
            _log(_logRequestId, { response: _accumulatedContent || '(cancelled)' });
            reader.cancel();
        },
    });
}

// ─── OpenAI SSE Stream (with reasoning_content support) ───

/**
 * OpenAI-compatible SSE stream with reasoning support.
 * Handles reasoning deltas from o-series, DeepSeek, OpenRouter.
 * @param {Response} response
 * @param {AbortSignal} [abortSignal]
 * @param {string} [_logRequestId]
 * @returns {ReadableStream<string>}
 */
export function createOpenAISSEStream(response, abortSignal, _logRequestId) {
    let inReasoning = false;
    /** @type {any} */
    let _streamUsage = null;

    /** @param {string} line */
    function parser(line) {
        if (!line.startsWith('data:')) return null;
        const jsonStr = line.slice(5).trim();
        if (jsonStr === '[DONE]') return null;
        try {
            const obj = JSON.parse(jsonStr);
            if (obj.usage) _streamUsage = _normalizeTokenUsage(obj.usage, 'openai');
            const delta = obj.choices?.[0]?.delta;
            if (!delta) return null;
            let out = '';
            const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
            if (reasoningDelta) {
                if (!inReasoning) { inReasoning = true; out += '<Thoughts>\n'; }
                out += String(reasoningDelta);
            }
            if (delta.content) {
                if (inReasoning) { inReasoning = false; out += '\n</Thoughts>\n'; }
                out += delta.content;
            }
            return out || null;
        } catch (_) { return null; }
    }

    function onComplete() {
        if (_streamUsage) _setTokenUsage(/** @type {string} */ (_logRequestId), _streamUsage, true);
        if (inReasoning) { inReasoning = false; return '\n</Thoughts>\n'; }
        return null;
    }

    return createSSEStream(response, parser, abortSignal, onComplete, _logRequestId);
}

// ─── OpenAI Responses API SSE Stream (GPT-5.4+) ───

/**
 * Responses API SSE stream parser.
 * Handles response.output_text.delta and response.reasoning_summary_text.delta.
 * @param {Response} response
 * @param {AbortSignal} [abortSignal]
 * @param {string} [_logRequestId]
 * @returns {ReadableStream<string>}
 */
export function createResponsesAPISSEStream(response, abortSignal, _logRequestId) {
    let inReasoning = false;
    /** @type {any} */
    let _streamUsage = null;

    /** @param {string} line */
    function parser(line) {
        if (!line.startsWith('data:')) return null;
        const jsonStr = line.slice(5).trim();
        if (jsonStr === '[DONE]') return null;
        try {
            const obj = JSON.parse(jsonStr);
            if (obj.type === 'response.completed' && obj.response?.usage) {
                _streamUsage = _normalizeTokenUsage(obj.response.usage, 'openai');
            }
            if (obj.type === 'response.reasoning_summary_text.delta') {
                let out = '';
                if (!inReasoning) { inReasoning = true; out += '<Thoughts>\n'; }
                out += obj.delta || '';
                return out || null;
            }
            if (obj.type === 'response.output_text.delta') {
                let out = '';
                if (inReasoning) { inReasoning = false; out += '\n</Thoughts>\n'; }
                out += obj.delta || '';
                return out || null;
            }
            return null;
        } catch (_) { return null; }
    }

    function onComplete() {
        if (_streamUsage) _setTokenUsage(/** @type {string} */ (_logRequestId), _streamUsage, true);
        if (inReasoning) { inReasoning = false; return '\n</Thoughts>\n'; }
        return null;
    }

    return createSSEStream(response, parser, abortSignal, onComplete, _logRequestId);
}

// ─── Anthropic SSE Stream ───

/**
 * Anthropic SSE parser with thinking/redacted_thinking support.
 * Uses event: + data: paired format.
 * @param {Response} response
 * @param {AbortSignal} [abortSignal]
 * @param {string} [_logRequestId]
 * @param {{showThinking?: boolean}} [opts]
 * @returns {ReadableStream<string>}
 */
export function createAnthropicSSEStream(response, abortSignal, _logRequestId, opts) {
    const _showThinking = opts?.showThinking !== false; // default: true (show thinking)
    const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let thinking = false;
    let hasThinking = false;
    let _visibleText = '';
    let _accumulatedContent = '';
    const _streamUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

    return new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        if (thinking && _showThinking) {
                            const closeTag = '</Thoughts>\n\n';
                            try { controller.enqueue(closeTag); _accumulatedContent += closeTag; } catch (_) { /* */ }
                        }
                        thinking = false;
                        if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                            _setTokenUsage(/** @type {string} */ (_logRequestId), /** @type {any} */ (_normalizeTokenUsage(_streamUsage, 'anthropic', {
                                anthropicHasThinking: hasThinking,
                                anthropicVisibleText: _visibleText,
                            })), true);
                        }
                        reader.cancel();
                        _log(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        if (thinking && _showThinking) {
                            const closeTag = '</Thoughts>\n\n';
                            controller.enqueue(closeTag);
                            _accumulatedContent += closeTag;
                        }
                        thinking = false;
                        if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                            _setTokenUsage(/** @type {string} */ (_logRequestId), /** @type {any} */ (_normalizeTokenUsage(_streamUsage, 'anthropic', {
                                anthropicHasThinking: hasThinking,
                                anthropicVisibleText: _visibleText,
                            })), true);
                        }
                        _log(_logRequestId, { response: _accumulatedContent || '(empty stream)' });
                        if (_accumulatedContent) console.log('[CupcakePM] 📥 Streamed Response Body (Anthropic):', _accumulatedContent);
                        controller.close();
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) { currentEvent = ''; continue; }
                        if (trimmed.startsWith('event:')) {
                            currentEvent = trimmed.slice(6).trim();
                            continue;
                        }
                        if (trimmed.startsWith('data:')) {
                            const jsonStr = trimmed.slice(5).trim();
                            try {
                                const obj = JSON.parse(jsonStr);
                                if (currentEvent === 'content_block_delta') {
                                    let deltaText = '';
                                    if (obj.delta?.type === 'thinking' || obj.delta?.type === 'thinking_delta') {
                                        if (obj.delta.thinking) {
                                            hasThinking = true;
                                            if (_showThinking) {
                                                if (!thinking) { thinking = true; deltaText += '<Thoughts>\n'; }
                                                deltaText += obj.delta.thinking;
                                            } else {
                                                thinking = true; // track state even when hidden
                                            }
                                        }
                                    } else if (obj.delta?.type === 'redacted_thinking') {
                                        hasThinking = true;
                                        if (_showThinking) {
                                            if (!thinking) { thinking = true; deltaText += '<Thoughts>\n'; }
                                            deltaText += '\n{{redacted_thinking}}\n';
                                        } else {
                                            thinking = true;
                                        }
                                    } else if (obj.delta?.type === 'text_delta' || obj.delta?.type === 'text') {
                                        if (obj.delta.text) {
                                            if (thinking) { thinking = false; if (_showThinking) deltaText += '</Thoughts>\n\n'; }
                                            _visibleText += obj.delta.text;
                                            deltaText += obj.delta.text;
                                        }
                                    }
                                    if (deltaText) { controller.enqueue(deltaText); _accumulatedContent += deltaText; }
                                } else if (currentEvent === 'content_block_start') {
                                    if (obj.content_block?.type === 'redacted_thinking') {
                                        hasThinking = true;
                                        if (_showThinking) {
                                            let rt = '';
                                            if (!thinking) { thinking = true; rt += '<Thoughts>\n'; }
                                            rt += '\n{{redacted_thinking}}\n';
                                            controller.enqueue(rt);
                                            _accumulatedContent += rt;
                                        } else {
                                            thinking = true;
                                        }
                                    }
                                } else if (currentEvent === 'error' || obj.type === 'error') {
                                    const errMsg = obj.error?.message || obj.message || 'Unknown stream error';
                                    const errText = `\n[Stream Error: ${errMsg}]\n`;
                                    controller.enqueue(errText);
                                    _accumulatedContent += errText;
                                }
                                if (currentEvent === 'message_start' && obj.message?.usage) {
                                    _streamUsage.input_tokens = obj.message.usage.input_tokens || 0;
                                    _streamUsage.cache_read_input_tokens = obj.message.usage.cache_read_input_tokens || 0;
                                    _streamUsage.cache_creation_input_tokens = obj.message.usage.cache_creation_input_tokens || 0;
                                }
                                if (currentEvent === 'message_delta' && obj.usage) {
                                    _streamUsage.output_tokens = obj.usage.output_tokens || 0;
                                }
                            } catch (_) { /* */ }
                        }
                    }
                }
            } catch (e) {
                if (thinking && _showThinking) {
                    const closeTag = '</Thoughts>\n\n';
                    try { controller.enqueue(closeTag); _accumulatedContent += closeTag; } catch (_) { /* */ }
                }
                thinking = false;
                if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                    _setTokenUsage(/** @type {string} */ (_logRequestId), /** @type {any} */ (_normalizeTokenUsage(_streamUsage, 'anthropic', {
                        anthropicHasThinking: hasThinking,
                        anthropicVisibleText: _visibleText,
                    })), true);
                }
                if (/** @type {any} */ (e).name !== 'AbortError') {
                    _log(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${/** @type {any} */ (e).message}]` });
                    controller.error(e);
                } else {
                    _log(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                    controller.close();
                }
            }
        },
        cancel() {
            _log(_logRequestId, { response: _accumulatedContent || '(cancelled)' });
            if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                _setTokenUsage(/** @type {string} */ (_logRequestId), /** @type {any} */ (_normalizeTokenUsage(_streamUsage, 'anthropic', {
                    anthropicHasThinking: hasThinking,
                    anthropicVisibleText: _visibleText,
                })), true);
            }
            reader.cancel();
        },
    });
}

// ─── Gemini Thought Signature Helper ───

/**
 * onComplete callback for Gemini streams — saves thought_signature from config.
 * @param {Record<string, any>} config - Mutable config object populated during streaming
 * @param {string} [_requestId]
 * @returns {string|undefined} Final chunk to enqueue (e.g. closing </Thoughts>)
 */
export function saveThoughtSignatureFromStream(config, _requestId) {
    let finalChunk = '';
    if (config._inThoughtBlock) {
        config._inThoughtBlock = false;
        finalChunk += '\n\n</Thoughts>\n\n';
    }
    if (config._lastSignature && config._streamResponseText) {
        ThoughtSignatureCache.save(config._streamResponseText, config._lastSignature);
        console.log('[CupcakePM] Thought signature extracted from stream and saved to cache.');
    }
    if (config._streamUsageMetadata) {
        const _usageReqId = _requestId || config._tokenUsageReqId;
        _setTokenUsage(_usageReqId, /** @type {any} */ (_normalizeTokenUsage(config._streamUsageMetadata, 'gemini')), true);
    }
    return finalChunk || undefined;
}
