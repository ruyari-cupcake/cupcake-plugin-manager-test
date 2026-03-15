// @ts-check
/**
 * format-gemini.js — Format messages for Google Gemini API.
 * Includes safety settings, thinking config, parameter validation,
 * and thought signature caching.
 */
import { sanitizeMessages, extractNormalizedMessagePayload, stripThoughtDisplayContent, stripInternalTags } from './sanitize.js';
import { parseBase64DataUri } from './helpers.js';

// ─── Gemini Safety Settings ───

/**
 * Get Gemini safety settings with model-aware threshold.
 * @param {string} [modelId] - Model ID for model-aware threshold selection
 */
export function getGeminiSafetySettings(modelId) {
    const m = (modelId || '').toLowerCase();
    const noCivic = /gemini-2\.0-flash-lite-preview|gemini-2\.0-pro-exp/.test(m);

    const categories = [
        'HATE_SPEECH',
        'DANGEROUS_CONTENT',
        'HARASSMENT',
        'SEXUALLY_EXPLICIT',
    ];
    if (!noCivic) categories.push('CIVIC_INTEGRITY');

    return categories.map(c => ({
        category: `HARM_CATEGORY_${c}`,
        threshold: 'OFF',
    }));
}

// ─── Parameter Validation ───

/**
 * Validate and clamp Gemini API parameters to valid ranges.
 * Mutates the generationConfig object in place.
 * @param {Record<string, any>} generationConfig
 */
export function validateGeminiParams(generationConfig) {
    if (!generationConfig || typeof generationConfig !== 'object') return;
    const rules = [
        { key: 'temperature', min: 0, max: 2, fallback: 1, exclusiveMax: false },
        { key: 'topP', min: 0, max: 1, fallback: undefined, exclusiveMax: false },
        // Gemini 2.x+ supports topK up to 64
        { key: 'topK', min: 1, max: 64, fallback: undefined, exclusiveMax: false },
        // Boundary value 2.0 is valid (inclusive)
        { key: 'frequencyPenalty', min: -2, max: 2, fallback: undefined, exclusiveMax: false },
        { key: 'presencePenalty', min: -2, max: 2, fallback: undefined, exclusiveMax: false },
    ];
    for (const { key, min, max, fallback, exclusiveMax } of rules) {
        if (generationConfig[key] == null) continue;
        const val = generationConfig[key];
        const exceedsMax = exclusiveMax ? val >= max : val > max;
        const isBad = val < min || exceedsMax || (key === 'topK' && !Number.isInteger(val));
        if (isBad) {
            if (fallback !== undefined) generationConfig[key] = fallback;
            else delete generationConfig[key];
        }
    }
}

/**
 * Check if a model is an experimental Gemini model.
 * @param {string} modelId
 */
export function isExperimentalGeminiModel(modelId) {
    return modelId && (modelId.includes('exp') || modelId.includes('experimental'));
}

/**
 * Check if a Gemini model supports penalty parameters.
 * @param {string} modelId
 */
export function geminiSupportsPenalty(modelId) {
    if (!modelId) return false;
    const id = modelId.toLowerCase();
    if (id.includes('exp') || id.includes('experimental')) return false;
    if (id.includes('flash-lite') || id.includes('nano')) return false;
    if (id.includes('embedding') || id.includes('embed')) return false;
    if (id.includes('aqa')) return false;
    return true;
}

/**
 * Strip frequencyPenalty/presencePenalty from generationConfig if model doesn't
 * support them, or if values are 0.
 * @param {Record<string, any>} generationConfig
 * @param {string} modelId
 */
export function cleanExperimentalModelParams(generationConfig, modelId) {
    const supported = geminiSupportsPenalty(modelId);
    if (!supported) {
        delete generationConfig.frequencyPenalty;
        delete generationConfig.presencePenalty;
    } else {
        if (generationConfig.frequencyPenalty === 0) delete generationConfig.frequencyPenalty;
        if (generationConfig.presencePenalty === 0) delete generationConfig.presencePenalty;
    }
}

// ─── Thinking Config ───

/**
 * Build Gemini thinkingConfig based on model version.
 * - Gemini 3+: uses thinkMode (level string)
 * - Gemini 2.5: uses thinkingBudget (numeric token count)
 * @param {string} model - Model ID
 * @param {string} level - Thinking level (off/none/MINIMAL/LOW/MEDIUM/HIGH)
 * @param {number|string} [budget] - Explicit token budget
 * @param {boolean} [isVertexAI] - Whether this is for Vertex AI
 * @returns {object|null}
 */
export function buildGeminiThinkingConfig(model, level, budget, isVertexAI) {
    const isGemini3 = /gemini-3/i.test(model || '');
    const budgetNum = parseInt(String(budget ?? '0'), 10) || 0;

    if (isGemini3) {
        if (level && level !== 'off' && level !== 'none') {
            if (isVertexAI) {
                return { includeThoughts: true, thinking_level: level };
            } else {
                return { includeThoughts: true, thinkingLevel: String(level).toLowerCase() };
            }
        }
        return null;
    }

    // Gemini 2.5 and others: thinking budget
    if (budgetNum > 0) {
        return { includeThoughts: true, thinkingBudget: budgetNum };
    }
    if (level && level !== 'off' && level !== 'none') {
        const budgets = /** @type {Record<string, number>} */ ({ 'MINIMAL': 1024, 'LOW': 4096, 'MEDIUM': 10240, 'HIGH': 24576 });
        const mapped = budgets[level] || parseInt(level) || 10240;
        return { includeThoughts: true, thinkingBudget: mapped };
    }
    return null;
}

// ─── Thought Signature Cache ───

/**
 * In-memory cache for Gemini thought_signature values.
 * Maps response text (truncated) → signature for injection into subsequent requests.
 */
export const ThoughtSignatureCache = {
    _cache: new Map(),
    _maxSize: 50,
    /** @param {any} responseText */
    _keyOf(responseText) {
        const normalized = stripThoughtDisplayContent(stripInternalTags(String(responseText || '')) || '');
        return normalized.substring(0, 500);
    },
    /**
     * @param {any} responseText
     * @param {any} signature
     */
    save(responseText, signature) {
        if (!responseText || !signature) return;
        const key = this._keyOf(responseText);
        this._cache.set(key, signature);
        if (this._cache.size > this._maxSize) {
            const firstKey = this._cache.keys().next().value;
            this._cache.delete(firstKey);
        }
    },
    /** @param {any} responseText */
    get(responseText) {
        if (!responseText) return null;
        const key = this._keyOf(responseText);
        return this._cache.get(key) || null;
    },
    clear() { this._cache.clear(); }
};

// ─── Gemini Formatter ───

/**
 * Convert a normalized multimodal object to a Gemini content part.
 * @param {Record<string, any>} modal - Normalized modal { type, base64?, url?, mimeType? }
 * @returns {any} Gemini part (inlineData or fileData)
 */
function _modalToGeminiPart(modal) {
    if (modal.url && modal.type === 'image') {
        return { fileData: { mimeType: modal.mimeType || 'image/*', fileUri: modal.url } };
    }
    const { mimeType: parsedMime, data } = parseBase64DataUri(modal.base64);
    return { inlineData: { mimeType: parsedMime || modal.mimeType || 'application/octet-stream', data } };
}

/**
 * Format messages for Gemini generateContent / streamGenerateContent API.
 * @param {Array<any>} messagesRaw - Raw message array
 * @param {Object} config - Formatting options
 * @param {boolean} [config.preserveSystem] - Keep system instructions in dedicated field
 * @param {boolean} [config.useThoughtSignature] - Inject cached thought signatures
 * @returns {{ contents: Array<any>, systemInstruction: string[] }}
 */
export function formatToGemini(messagesRaw, config = {}) {
    const messages = /** @type {any[]} */ (sanitizeMessages(messagesRaw));
    const systemInstruction = [];
    const contents = [];

    let systemPhase = true;

    for (const m of messages) {
        if (m.role === 'system' && systemPhase) {
            systemInstruction.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            continue;
        }
        if (m.role !== 'system') systemPhase = false;

        const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
        const payload = extractNormalizedMessagePayload(m);
        const normalizedMultimodals = payload.multimodals;
        let text = payload.text;
        if (!text && !Array.isArray(m.content) && typeof m.content !== 'string') {
            text = JSON.stringify(m.content);
        }

        let trimmed = text.trim();

        // Strip thought display content from historical model messages
        if (role === 'model') {
            trimmed = stripThoughtDisplayContent(trimmed);
        }

        // System messages after leading block → merge into user content
        if (m.role === 'system') {
            const sysText = `system: ${trimmed}`;
            if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
                contents[contents.length - 1].parts.push({ text: sysText });
            } else {
                contents.push({ role: 'user', parts: [{ text: sysText }] });
            }
            continue;
        }

        if (trimmed === '' && normalizedMultimodals.length === 0) continue;

        // Multimodal handling
        if (normalizedMultimodals.length > 0) {
            const lastMessage = /** @type {any} */ (contents.length > 0 ? contents[contents.length - 1] : null);

            if (lastMessage && lastMessage.role === role) {
                if (trimmed) {
                    const _lastPart = lastMessage.parts[lastMessage.parts.length - 1];
                    if (_lastPart?.inlineData || _lastPart?.fileData || _lastPart?.text === undefined) {
                        lastMessage.parts.push({ text: trimmed });
                    } else {
                        _lastPart.text += '\n\n' + trimmed;
                    }
                }
                for (const modal of normalizedMultimodals) {
                    if (modal.type === 'image' || modal.type === 'audio' || modal.type === 'video') {
                        lastMessage.parts.push(_modalToGeminiPart(modal));
                    }
                }
            } else {
                const newParts = [];
                if (trimmed) newParts.push({ text: trimmed });
                for (const modal of normalizedMultimodals) {
                    if (modal.type === 'image' || modal.type === 'audio' || modal.type === 'video') {
                        newParts.push(_modalToGeminiPart(modal));
                    }
                }
                if (newParts.length > 0) contents.push({ role, parts: newParts });
            }
            continue;
        }

        // Text-only message
        /** @type {Record<string, any>} */
        const part = { text: trimmed || text };
        if (config.useThoughtSignature && role === 'model') {
            const cachedSig = ThoughtSignatureCache.get(trimmed || text);
            if (cachedSig) part.thoughtSignature = cachedSig;
        }

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts.push(part);
        } else {
            contents.push({ role, parts: [part] });
        }
    }

    if (!config.preserveSystem && systemInstruction.length > 0) {
        const sysText = `system: ${systemInstruction.join('\n\n')}`;
        if (contents.length > 0 && contents[0].role === 'user') {
            contents[0].parts.unshift({ text: sysText });
        } else {
            contents.unshift({ role: 'user', parts: [{ text: sysText }] });
        }
        systemInstruction.length = 0;
    }

    if (config.preserveSystem && contents.length === 0 && systemInstruction.length > 0) {
        contents.push({ role: 'user', parts: [{ text: 'Start' }] });
    }

    return { contents, systemInstruction };
}
