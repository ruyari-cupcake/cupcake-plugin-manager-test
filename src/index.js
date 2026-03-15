// @ts-check
/**
 * Cupcake Provider Manager — Main Entry Point
 *
 * This file serves as the Rollup entry point. It imports all modules
 * from src/lib/ and re-exports them as the unified CupcakeProviderManager
 * IIFE bundle for the RisuAI V3 iframe sandbox.
 *
 * Module Map (29 modules — 100% extraction from provider-manager.js):
 *
 * Pure Utilities:
 *   endpoints.js          → Centralized remote URL constants (base, versions, update)
 *   shared-state.js      → CPM_VERSION, Risu ref, mutable state, registries, arg helpers
 *   helpers.js            → safeUUID, safeStringify, content/multimodal checks
 *   sanitize.js           → Message sanitization and content normalization
 *   token-usage.js        → Token usage normalization and tracking store
 *   token-toast.js        → Token usage toast UI
 *
 * Formatters & Parsers:
 *   format-openai.js      → OpenAI message formatter
 *   format-anthropic.js   → Anthropic message formatter
 *   format-gemini.js      → Gemini formatter + safety/thinking config
 *   sse-parsers.js        → SSE line parsers (OpenAI, Gemini)
 *   response-parsers.js   → Non-streaming response parsers
 *
 * Infrastructure:
 *   key-pool.js           → API key rotation engine
 *   slot-inference.js     → Auxiliary slot inference via heuristics
 *   aws-signer.js         → AWS V4 Signature signer (Web Crypto)
 *   api-request-log.js    → API request history (ring buffer)
 *   model-helpers.js      → Model detection (reasoning, Responses API)
 *   copilot-token.js      → GitHub Copilot token management
 *   smart-fetch.js        → smartNativeFetch (CSP-safe fetch with @arg proxy)
 *   csp-exec.js           → CSP-safe script execution
 *
 * Streaming:
 *   stream-builders.js    → SSE stream constructors for all providers
 *   stream-utils.js       → Stream collection and bridge detection
 *
 * Core Logic:
 *   auto-updater.js       → Auto-update engine (version check, download, verify, install)
 *   update-toast.js       → Update notification toast UI (sub-plugin + main)
 *   settings-backup.js    → Persistent settings backup via pluginStorage
 *   sub-plugin-manager.js → Sub-plugin CRUD + hot-reload (spreads auto-updater/toast)
 *   fetch-custom.js       → fetchCustom (main API fetcher, all formats)
 *   router.js             → handleRequest / fetchByProviderId (routing)
 *   cupcake-api.js        → window.CupcakePM public API surface
 *   settings-ui.js        → Full settings panel (Tailwind CSS)
 *   init.js               → Boot IIFE, _exposeScopeToWindow, model reg
 */

// ─── Pure Utilities ───
export {
    CPM_BASE_URL,
    VERSIONS_URL,
    MAIN_UPDATE_URL,
    UPDATE_BUNDLE_URL,
} from './lib/endpoints.js';

export {
    CPM_VERSION, Risu, state,
    safeGetArg, safeGetBoolArg, isDynamicFetchEnabled,
    customFetchers, registeredProviderTabs, pendingDynamicFetchers,
    _pluginRegistrations, _pluginCleanupHooks,
} from './lib/shared-state.js';

export {
    safeUUID,
    safeStringify,
    hasNonEmptyMessageContent,
    hasAttachedMultimodals,
    getSubPluginFileAccept,
} from './lib/helpers.js';

export {
    isInlaySceneWrapperText,
    stripInternalTags,
    stripStaleAutoCaption,
    extractNormalizedMessagePayload,
    sanitizeMessages,
    sanitizeBodyJSON,
    stripThoughtDisplayContent,
} from './lib/sanitize.js';

export {
    _normalizeTokenUsage,
    _tokenUsageKey,
    _setTokenUsage,
    _takeTokenUsage,
    _tokenUsageStore,
} from './lib/token-usage.js';

export { showTokenUsageToast as _showTokenUsageToast } from './lib/token-toast.js';

// ─── Message Formatters ───
export { formatToOpenAI } from './lib/format-openai.js';
export { formatToAnthropic } from './lib/format-anthropic.js';
export {
    formatToGemini,
    getGeminiSafetySettings,
    validateGeminiParams,
    isExperimentalGeminiModel,
    geminiSupportsPenalty,
    cleanExperimentalModelParams,
    buildGeminiThinkingConfig,
    ThoughtSignatureCache,
} from './lib/format-gemini.js';

// ─── SSE Parsers ───
export {
    parseOpenAISSELine,
    normalizeOpenAIMessageContent,
    parseGeminiSSELine,
    GEMINI_BLOCK_REASONS,
} from './lib/sse-parsers.js';

// ─── Key Rotation ───
export { KeyPool } from './lib/key-pool.js';

// ─── Slot Inference ───
export {
    CPM_SLOT_LIST,
    SLOT_HEURISTICS,
    scoreSlotHeuristic,
    inferSlot,
} from './lib/slot-inference.js';

// ─── AWS V4 Signer ───
export {
    AwsV4Signer,
    hmac,
    hash,
    buf2hex,
    encodeRfc3986,
    guessServiceRegion,
} from './lib/aws-signer.js';

// ─── API Request Log ───
export {
    storeApiRequest,
    updateApiRequest,
    getLatestApiRequest,
    getAllApiRequests,
    getApiRequestById,
    clearApiRequests,
} from './lib/api-request-log.js';

// ─── Model Helpers ───
export {
    supportsOpenAIReasoningEffort,
    needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams,
    needsMaxCompletionTokens,
} from './lib/model-helpers.js';

// ─── Non-Streaming Response Parsers ───
export {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from './lib/response-parsers.js';

// ─── SSE Stream Builders ───
export {
    createSSEStream,
    createOpenAISSEStream,
    createResponsesAPISSEStream,
    createAnthropicSSEStream,
    saveThoughtSignatureFromStream,
    setApiRequestLogger,
} from './lib/stream-builders.js';

// ─── Stream Utilities ───
export {
    collectStream,
    checkStreamCapability,
    resetStreamCapability,
} from './lib/stream-utils.js';

// ─── Copilot Token ───
export {
    ensureCopilotApiToken,
    clearCopilotTokenCache,
    setCopilotGetArgFn,
    setCopilotFetchFn,
} from './lib/copilot-token.js';

// ─── Smart Fetch ───
export { smartNativeFetch } from './lib/smart-fetch.js';

// ─── CSP Execution ───
export { _extractNonce, _executeViaScriptTag } from './lib/csp-exec.js';

// ─── Settings Backup ───
export { SettingsBackup } from './lib/settings-backup.js';

// ─── Auto-Updater & Toast (extracted from sub-plugin-manager) ───
export { _computeSHA256, autoUpdaterMethods } from './lib/auto-updater.js';
export { updateToastMethods } from './lib/update-toast.js';

// ─── Sub-Plugin Manager ───
export { SubPluginManager, setExposeScopeFunction } from './lib/sub-plugin-manager.js';

// ─── Fetch Custom ───
export { fetchCustom } from './lib/fetch-custom.js';

// ─── Router ───
export { handleRequest, fetchByProviderId } from './lib/router.js';

// ─── Cupcake API ───
export { setupCupcakeAPI } from './lib/cupcake-api.js';

// ─── Settings UI ───
export { openCpmSettings } from './lib/settings-ui.js';

// ─── Init (boot sequence — MUST be imported last, triggers IIFE) ───
import './lib/init.js';
