// @ts-check
/**
 * model-helpers.js — Centralized model detection registry.
 *
 * ALL model-name regex patterns live here.  Other modules (init.js,
 * fetch-custom.js, format-gemini.js, …) import these helpers instead
 * of maintaining their own inline regex.  When a new model family
 * ships, this is the SINGLE file to update.
 *
 * Pure functions, zero side effects.
 */

// ═══════════════════════════════════════════════════════
//  Base family detectors (building blocks for higher-level checks)
// ═══════════════════════════════════════════════════════

/**
 * Detect o3/o4 family models.
 * Matches all variants: o3, o3-mini, o3-pro, o4-mini, o4-mini-deep-research, etc.
 * @param {string} modelName
 * @returns {boolean}
 */
export function isO3O4Family(modelName) {
    if (!modelName) return false;
    return /(?:^|\/)o(?:3|4)(?:[\w.-]*)$/i.test(String(modelName));
}

/**
 * Detect GPT-5 family models (any sub-version, any variant).
 * Matches: gpt-5, gpt-5.4, gpt-5-mini, gpt-5.4-nano, gpt-5-2025-01-15, etc.
 * @param {string} modelName
 * @returns {boolean}
 */
export function isGPT5Family(modelName) {
    if (!modelName) return false;
    return /(?:^|\/)gpt-5(?:\.\d+)?(?:-(?:mini|nano|pro))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(String(modelName));
}

/**
 * Detect models that require the OpenAI "developer" role instead of "system".
 * GPT-5 family and o-series (o2+, o1 excluding o1-preview/o1-mini) use developer role.
 * Used by init.js (model registration flags) and fetch-custom.js (formatToOpenAI config).
 * @param {string} modelName
 * @returns {boolean}
 */
export function needsDeveloperRole(modelName) {
    if (!modelName) return false;
    return /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(String(modelName));
}

// ═══════════════════════════════════════════════════════
//  Gemini family detectors
// ═══════════════════════════════════════════════════════

/**
 * Detect Gemini 3.x models (version-based thinking config branching).
 * @param {string} modelId
 * @returns {boolean}
 */
export function isGemini3Model(modelId) {
    if (!modelId) return false;
    return /gemini-3/i.test(String(modelId));
}

/**
 * Detect Gemini models that do NOT support the CIVIC_INTEGRITY safety category.
 * Currently: gemini-2.0-flash-lite-preview and gemini-2.0-pro-exp.
 * @param {string} modelId
 * @returns {boolean}
 */
export function isGeminiNoCivicModel(modelId) {
    if (!modelId) return false;
    return /gemini-2\.0-flash-lite-preview|gemini-2\.0-pro-exp/.test(String(modelId).toLowerCase());
}

// ═══════════════════════════════════════════════════════
//  OpenAI / Copilot higher-level helpers
// ═══════════════════════════════════════════════════════

/**
 * Check if a model supports OpenAI reasoning_effort parameter.
 * Matches o3/o4 variants and GPT-5 family.
 * @param {string} modelName
 * @returns {boolean}
 */
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) || isGPT5Family(modelName);
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
    return isO3O4Family(modelName);
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
