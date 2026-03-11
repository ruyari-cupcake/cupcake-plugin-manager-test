/**
 * cupcake-api.js — window.CupcakePM global API surface.
 * Public API that sub-plugins use to register providers and access CPM internals.
 */
import {
    Risu, state, safeGetArg, safeGetBoolArg,
    customFetchers, registeredProviderTabs,
    pendingDynamicFetchers, _pluginRegistrations,
    _pluginCleanupHooks,
} from './shared-state.js';
import { safeUUID } from './helpers.js';
import { formatToOpenAI } from './format-openai.js';
import { formatToAnthropic } from './format-anthropic.js';
import {
    formatToGemini, buildGeminiThinkingConfig, getGeminiSafetySettings,
    validateGeminiParams, isExperimentalGeminiModel, cleanExperimentalModelParams,
    ThoughtSignatureCache,
} from './format-gemini.js';
import {
    createSSEStream, createOpenAISSEStream, createResponsesAPISSEStream,
    createAnthropicSSEStream, saveThoughtSignatureFromStream,
} from './stream-builders.js';
import { parseOpenAISSELine, parseGeminiSSELine } from './sse-parsers.js';
import {
    parseClaudeNonStreamingResponse, parseGeminiNonStreamingResponse,
    parseOpenAINonStreamingResponse, parseResponsesAPINonStreamingResponse,
} from './response-parsers.js';
import { collectStream, checkStreamCapability } from './stream-utils.js';
import { _normalizeTokenUsage } from './token-usage.js';
import { needsCopilotResponsesAPI } from './model-helpers.js';
import { KeyPool } from './key-pool.js';
import { AwsV4Signer } from './aws-signer.js';
import { smartNativeFetch } from './smart-fetch.js';
import { ensureCopilotApiToken } from './copilot-token.js';
import { SubPluginManager } from './sub-plugin-manager.js';

/** @typedef {Window & typeof globalThis & { CupcakePM?: any }} CupcakeWindow */

/**
 * Initialize the window.CupcakePM global object.
 * Must be called after all modules are loaded.
 */
export function setupCupcakeAPI() {
    /** @type {CupcakeWindow} */
    const cupcakeWindow = window;
    cupcakeWindow.CupcakePM = {
        customFetchers,
        registeredProviderTabs,
        registerProvider({ name, models, fetcher, settingsTab, fetchDynamicModels }) {
            if (state._currentExecutingPluginId) {
                if (!_pluginRegistrations[state._currentExecutingPluginId]) {
                    _pluginRegistrations[state._currentExecutingPluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                }
                const reg = _pluginRegistrations[state._currentExecutingPluginId];
                if (!reg.providerNames.includes(name)) reg.providerNames.push(name);
                if (settingsTab) reg.tabObjects.push(settingsTab);
                if (typeof fetchDynamicModels === 'function') reg.fetcherEntries.push({ name, fetchDynamicModels });
            }
            if (fetcher) customFetchers[name] = fetcher;
            if (models && Array.isArray(models)) {
                for (const m of models) {
                    state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            }
            if (settingsTab) registeredProviderTabs.push(settingsTab);
            if (typeof fetchDynamicModels === 'function') {
                pendingDynamicFetchers.push({ name, fetchDynamicModels });
            }
            console.log(`[CupcakePM] Provider registered: ${name}`);
        },
        safeUUID,
        formatToOpenAI,
        formatToAnthropic,
        formatToGemini,
        createSSEStream,
        parseOpenAISSELine,
        createOpenAISSEStream,
        createResponsesAPISSEStream,
        createAnthropicSSEStream,
        parseGeminiSSELine,
        collectStream,
        buildGeminiThinkingConfig,
        getGeminiSafetySettings,
        validateGeminiParams,
        isExperimentalGeminiModel,
        cleanExperimentalModelParams,
        parseGeminiNonStreamingResponse,
        parseClaudeNonStreamingResponse,
        parseOpenAINonStreamingResponse,
        parseResponsesAPINonStreamingResponse,
        _needsCopilotResponsesAPI: needsCopilotResponsesAPI,
        saveThoughtSignatureFromStream,
        get ThoughtSignatureCache() { return ThoughtSignatureCache; },
        isStreamingAvailable: async () => {
            const enabled = await safeGetBoolArg('cpm_streaming_enabled', false);
            const capable = await checkStreamCapability();
            return { enabled, bridgeCapable: capable, active: enabled && capable };
        },
        safeGetArg,
        safeGetBoolArg,
        setArg: (k, v) => Risu.setArgument(k, String(v)),
        // Key Rotation API
        pickKey: (argName) => KeyPool.pick(argName),
        drainKey: (argName, failedKey) => KeyPool.drain(argName, failedKey),
        keyPoolRemaining: (argName) => KeyPool.remaining(argName),
        resetKeyPool: (argName) => KeyPool.reset(argName),
        withKeyRotation: (argName, fetchFn, opts) => KeyPool.withRotation(argName, fetchFn, opts),
        // JSON Credential Rotation API
        pickJsonKey: (argName) => KeyPool.pickJson(argName),
        withJsonKeyRotation: (argName, fetchFn, opts) => KeyPool.withJsonRotation(argName, fetchFn, opts),
        get vertexTokenCache() { return state.vertexTokenCache; },
        set vertexTokenCache(v) { state.vertexTokenCache = v; },
        AwsV4Signer,
        checkStreamCapability,
        hotReload: (pluginId) => SubPluginManager.hotReload(pluginId),
        hotReloadAll: () => SubPluginManager.hotReloadAll(),
        registerCleanup(cleanupFn) {
            if (typeof cleanupFn !== 'function') return;
            const pluginId = state._currentExecutingPluginId;
            if (!pluginId) {
                console.warn('[CupcakePM] registerCleanup called outside sub-plugin execution context.');
                return;
            }
            if (!_pluginCleanupHooks[pluginId]) _pluginCleanupHooks[pluginId] = [];
            _pluginCleanupHooks[pluginId].push(cleanupFn);
            console.log(`[CupcakePM] Cleanup hook registered for plugin ${pluginId}`);
        },
        addCustomModel(modelDef, tag = '') {
            try {
                let existingIdx = -1;
                if (tag) existingIdx = state.CUSTOM_MODELS_CACHE.findIndex(m => m._tag === tag);
                if (existingIdx !== -1) {
                    state.CUSTOM_MODELS_CACHE[existingIdx] = { ...state.CUSTOM_MODELS_CACHE[existingIdx], ...modelDef, _tag: tag };
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    return { success: true, created: false, uniqueId: state.CUSTOM_MODELS_CACHE[existingIdx].uniqueId };
                } else {
                    const uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    const entry = { ...modelDef, uniqueId, _tag: tag || undefined };
                    state.CUSTOM_MODELS_CACHE.push(entry);
                    state.ALL_DEFINED_MODELS.push({ uniqueId, id: entry.model, name: entry.name || uniqueId, provider: 'Custom' });
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    return { success: true, created: true, uniqueId };
                }
            } catch (e) {
                return { success: false, created: false, uniqueId: '', error: e.message };
            }
        },
        smartFetch: async (url, options = {}) => smartNativeFetch(url, options),
        smartNativeFetch: async (url, options = {}) => smartNativeFetch(url, options),
        ensureCopilotApiToken: () => ensureCopilotApiToken(),
        _normalizeTokenUsage,
    };
}
