// @ts-check
/**
 * model-helpers.js — Model detection helpers for OpenAI / Copilot / Gemini.
 * Pure functions, zero side effects.
 */

/**
 * Check if a model supports OpenAI reasoning_effort parameter.
 * Matches o3/o4 variants and GPT-5 family.
 * @param {string} modelName
 * @returns {boolean}
 */
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    // o3/o4 family (all variants: o3, o3-mini, o3-pro, o4-mini, etc.)
    if (/(?:^|\/)o(?:3|4)(?:[\w.-]*)$/i.test(m)) return true;
    return /(?:^|\/)gpt-5(?:\.\d+)?(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(m);
}

/**
 * Detect models that require the OpenAI Responses API on GitHub Copilot.
 * GPT-5.4+ models use /responses endpoint instead of /chat/completions.
 * @param {string} modelName
 * @returns {boolean}
 */
export function needsCopilotResponsesAPI(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    const match = m.match(/(?:^|\/)gpt-5\.(\d+)/);
    if (match && parseInt(match[1]) >= 4) return true;
    return false;
}

/**
 * Detect o3/o4 family models that only accept reasoning_effort (no sampling params).
 * @param {string} modelName
 * @returns {boolean}
 */
export function shouldStripOpenAISamplingParams(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    // o3/o4 family: strip all sampling params (temperature, top_p, etc.)
    return /(?:^|\/)o(?:3|4)(?:[\w.-]*)$/i.test(m);
}

/**
 * GPT-5.4 reasoning compatibility:
 * When reasoning effort is not 'none', GPT-5.4 rejects sampling params like
 * temperature and top_p. Strip them before dispatch.
 * @param {string} modelName
 * @param {string} reasoningEffort
 * @returns {boolean}
 */
export function shouldStripGPT54SamplingForReasoning(modelName, reasoningEffort) {
    if (!modelName) return false;
    const model = String(modelName).toLowerCase();
    const effort = String(reasoningEffort || '').trim().toLowerCase();
    if (!effort || effort === 'none' || effort === 'off') return false;
    return /(?:^|\/)gpt-5\.4(?:-(?:mini|nano|pro))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model);
}

/**
 * Detect if max_completion_tokens should be used instead of max_tokens.
 * Required by newer OpenAI models (GPT-4.5, GPT-5, o-series).
 * @param {string} modelName
 * @returns {boolean}
 */
export function needsMaxCompletionTokens(modelName) {
    if (!modelName) return false;
    return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(modelName);
}
