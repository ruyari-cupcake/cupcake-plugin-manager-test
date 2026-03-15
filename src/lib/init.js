// @ts-check
/**
 * init.js — Boot sequence for Cupcake Provider Manager.
 *
 * Defines _exposeScopeToWindow (window scope bridge for sub-plugins)
 * and runs the full initialization IIFE: sub-plugin loading, settings
 * restore, stream check, dynamic models, model registration, keyboard
 * shortcut, and touch gesture.
 */
import {
    Risu, CPM_VERSION, state, safeGetArg, safeGetBoolArg,
    customFetchers, registeredProviderTabs, pendingDynamicFetchers,
    _pluginRegistrations,
    isDynamicFetchEnabled,
} from './shared-state.js';
import { safeStringify } from './helpers.js';
import { sanitizeMessages, stripInternalTags, sanitizeBodyJSON, stripThoughtDisplayContent } from './sanitize.js';
import { _normalizeTokenUsage, _tokenUsageStore } from './token-usage.js';
import { showTokenUsageToast as _showTokenUsageToast } from './token-toast.js';
import { formatToOpenAI } from './format-openai.js';
import { formatToAnthropic } from './format-anthropic.js';
import {
    formatToGemini, getGeminiSafetySettings, validateGeminiParams,
    isExperimentalGeminiModel, cleanExperimentalModelParams,
    buildGeminiThinkingConfig, ThoughtSignatureCache,
} from './format-gemini.js';
import { KeyPool } from './key-pool.js';
import { parseOpenAISSELine, parseGeminiSSELine } from './sse-parsers.js';
import { CPM_SLOT_LIST, inferSlot } from './slot-inference.js';
import { AwsV4Signer } from './aws-signer.js';
import { smartNativeFetch } from './smart-fetch.js';
import { needsCopilotResponsesAPI as _needsCopilotResponsesAPI } from './model-helpers.js';
import {
    parseClaudeNonStreamingResponse, parseGeminiNonStreamingResponse,
    parseOpenAINonStreamingResponse, parseResponsesAPINonStreamingResponse,
} from './response-parsers.js';
import {
    createSSEStream, createOpenAISSEStream, createResponsesAPISSEStream,
    createAnthropicSSEStream, saveThoughtSignatureFromStream,
    setApiRequestLogger,
} from './stream-builders.js';
import { collectStream, checkStreamCapability } from './stream-utils.js';
import { ensureCopilotApiToken, setCopilotGetArgFn, setCopilotFetchFn } from './copilot-token.js';
import { SettingsBackup } from './settings-backup.js';
import { parseCustomModelsValue, normalizeCustomModel } from './custom-model-serialization.js';
import { SubPluginManager, setExposeScopeFunction } from './sub-plugin-manager.js';
import { fetchCustom } from './fetch-custom.js';
import { handleRequest, fetchByProviderId } from './router.js';
import { updateApiRequest } from './api-request-log.js';
import { setupCupcakeAPI } from './cupcake-api.js';
import { openCpmSettings } from './settings-ui.js';

/** @typedef {Window & typeof globalThis & { CPM_VERSION?: string, cpmShortcutRegistered?: boolean }} CpmWindow */

// ─── _exposeScopeToWindow — puts all CPM symbols on window for sub-plugins ───
function _exposeScopeToWindow() {
    const cpmWindow = /** @type {CpmWindow} */ (window);
    const fns = {
        fetchCustom, fetchByProviderId, handleRequest,
        safeGetArg, safeGetBoolArg, smartNativeFetch,
        sanitizeMessages, stripInternalTags, safeStringify, sanitizeBodyJSON,
        isDynamicFetchEnabled, inferSlot, buildGeminiThinkingConfig,
        formatToOpenAI, formatToAnthropic, formatToGemini,
        createSSEStream, parseOpenAISSELine, createOpenAISSEStream,
        createResponsesAPISSEStream, createAnthropicSSEStream, parseGeminiSSELine,
        collectStream, checkStreamCapability, ensureCopilotApiToken,
        getGeminiSafetySettings, validateGeminiParams, isExperimentalGeminiModel,
        cleanExperimentalModelParams, stripThoughtDisplayContent,
        saveThoughtSignatureFromStream, parseGeminiNonStreamingResponse,
        parseClaudeNonStreamingResponse, parseOpenAINonStreamingResponse,
        parseResponsesAPINonStreamingResponse,
        _normalizeTokenUsage, _showTokenUsageToast, _needsCopilotResponsesAPI,
    };
    for (const [k, v] of Object.entries(fns)) {
        /** @type {any} */ (window)[k] = v;
    }

    const objs = {
        customFetchers, registeredProviderTabs, pendingDynamicFetchers,
        _pluginRegistrations, SubPluginManager, SettingsBackup, KeyPool,
        CPM_SLOT_LIST, AwsV4Signer, ThoughtSignatureCache, _tokenUsageStore,
    };
    for (const [k, v] of Object.entries(objs)) {
        /** @type {any} */ (window)[k] = v;
    }

    // Mutable state — define getters/setters that proxy to the state object
    const lets = {
        ALL_DEFINED_MODELS: [() => state.ALL_DEFINED_MODELS, (/** @type {any} */ v) => { state.ALL_DEFINED_MODELS = v; }],
        CUSTOM_MODELS_CACHE: [() => state.CUSTOM_MODELS_CACHE, (/** @type {any} */ v) => { state.CUSTOM_MODELS_CACHE = v; }],
        _currentExecutingPluginId: [() => state._currentExecutingPluginId, (/** @type {any} */ v) => { state._currentExecutingPluginId = v; }],
        vertexTokenCache: [() => state.vertexTokenCache, (/** @type {any} */ v) => { state.vertexTokenCache = v; }],
    };
    for (const [k, [g, s]] of Object.entries(lets)) {
        Object.defineProperty(window, k, { get: /** @type {any} */ (g), set: /** @type {any} */ (s), configurable: true });
    }

    cpmWindow.CPM_VERSION = CPM_VERSION;
}

// ─── Dependency Injection ───
// KeyPool needs safeGetArg to read API keys from @arg settings
KeyPool.setGetArgFn(safeGetArg);
// Copilot token module needs safeGetArg + smartNativeFetch
setCopilotGetArgFn(safeGetArg);
setCopilotFetchFn(smartNativeFetch);

// Inject _exposeScopeToWindow into SubPluginManager via DI (avoids circular deps)
setExposeScopeFunction(_exposeScopeToWindow);

// Wire stream-builders request logger so streaming responses are recorded
setApiRequestLogger(updateApiRequest);

// ─── Setup window.CupcakePM public API ───
setupCupcakeAPI();

// ─── Main Init IIFE ───
(async () => {
    /** @type {string} Boot phase tracker for diagnostics */
    let _bootPhase = 'pre-init';
    /** @type {string[]} Completed phases log */
    const _completedPhases = [];
    /** @type {string[]} Failed phases log */
    const _failedPhases = [];

    const _phaseStart = (/** @type {string} */ phase) => { _bootPhase = phase; };
    const _phaseDone = (/** @type {string} */ phase) => { _completedPhases.push(phase); };
    const _phaseFail = (/** @type {string} */ phase, /** @type {any} */ err) => {
        _failedPhases.push(`${phase}: ${err?.message || err}`);
        console.error(`[CPM] Phase '${phase}' failed (continuing):`, err?.message || err);
    };

    // ══════════════════════════════════════════════════════════════════
    //  CRITICAL FIRST: Register settings panel IMMEDIATELY.
    //  This MUST happen before any SubPluginManager, SettingsBackup,
    //  streaming checks, model registration, or anything else.
    //  If later init steps fail, the "🧁" menu entry still exists
    //  and users can still open CPM settings to diagnose/reconfigure.
    // ══════════════════════════════════════════════════════════════════
    let _settingsRegistered = false;
    try {
        _phaseStart('register-settings');
        await Risu.registerSetting(
            `v${CPM_VERSION}`,
            openCpmSettings,
            '🧁',
            'html',
        );
        _settingsRegistered = true;
        _phaseDone('register-settings');
        console.log(`[CPM] ✓ Settings panel registered (v${CPM_VERSION})`);
    } catch (e) {
        _phaseFail('register-settings', e);
    }

    try {
        // ── Phase: Load Sub-Plugin Registry ──
        _phaseStart('subplugin-registry');
        try {
            await SubPluginManager.loadRegistry();
            _phaseDone('subplugin-registry');
        } catch (e) { _phaseFail('subplugin-registry', e); }

        // ── Phase: Execute Sub-Plugins ──
        _phaseStart('subplugin-execute');
        try {
            await SubPluginManager.executeEnabled();
            _phaseDone('subplugin-execute');
        } catch (e) { _phaseFail('subplugin-execute', e); }

        // ── Phase: Restore Settings Backup ──
        _phaseStart('settings-restore');
        try {
            await SettingsBackup.load();
            const restoredCount = await SettingsBackup.restoreIfEmpty();
            if (restoredCount > 0) {
                console.log(`[CPM] Auto-restored ${restoredCount} settings from persistent backup.`);
            }
            _phaseDone('settings-restore');
        } catch (e) { _phaseFail('settings-restore', e); }

        // ── Phase: Streaming Bridge Capability Check ──
        _phaseStart('streaming-check');
        try {
            const streamCapable = await checkStreamCapability();
            const streamEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);
            const compatMode = await safeGetBoolArg('cpm_compatibility_mode', false);

            if (compatMode) {
                console.log('[Cupcake PM] 🔧 Compatibility mode: ENABLED (nativeFetch will be skipped + streaming forced OFF).');
            } else if (!streamCapable) {
                console.log('[Cupcake PM] 🔧 Compatibility mode: AUTO-ACTIVE (bridge cannot transfer ReadableStream — nativeFetch skipped + streaming forced OFF).');
            }

            if (streamEnabled) {
                if (compatMode || !streamCapable) {
                    console.warn('[Cupcake PM] 🔄 Streaming: enabled in settings but OVERRIDDEN by compatibility mode — non-streaming will be used to prevent duplicate requests.');
                } else if (streamCapable) {
                    console.log('[Cupcake PM] 🔄 Streaming: enabled AND bridge capable — ReadableStream pass-through active.');
                }
            } else {
                console.log(`[Cupcake PM] 🔄 Streaming: disabled (bridge ${streamCapable ? 'capable' : 'not capable'}). Enable in settings to activate.`);
            }
            _phaseDone('streaming-check');
        } catch (e) { _phaseFail('streaming-check', e); }

        // ── Phase: Dynamic Model Fetching ──
        _phaseStart('dynamic-models');
        for (const { name, fetchDynamicModels } of /** @type {any[]} */ (pendingDynamicFetchers)) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) { console.log(`[CupcakePM] Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                console.log(`[CupcakePM] Fetching dynamic models for ${name}...`);
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
                    for (const m of dynamicModels) {
                        state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                    console.log(`[CupcakePM] ✓ Dynamic models for ${name}: ${dynamicModels.length} models`);
                } else {
                    console.log(`[CupcakePM] No dynamic models for ${name}, using fallback.`);
                }
            } catch (e) {
                console.warn(`[CupcakePM] Dynamic fetch failed for ${name}:`, /** @type {Error} */ (e).message || e);
            }
        }
        _phaseDone('dynamic-models');

        // ── Phase: Custom Models Migration ──
        _phaseStart('custom-models');
        try {
            const customModelsJson = await safeGetArg('cpm_custom_models', '[]');
            try {
                state.CUSTOM_MODELS_CACHE = parseCustomModelsValue(customModelsJson).map(model => normalizeCustomModel(model));
                if (!Array.isArray(state.CUSTOM_MODELS_CACHE)) state.CUSTOM_MODELS_CACHE = [];
            } catch (_e) {
                state.CUSTOM_MODELS_CACHE = [];
            }

            // Backward Compatibility: Auto-Migrate from C1-C9 to JSON
            if (state.CUSTOM_MODELS_CACHE.length === 0) {
                let migrated = false;
                for (let i = 1; i <= 9; i++) {
                    const legacyUrl = await safeGetArg(`cpm_c${i}_url`);
                    const legacyModel = await safeGetArg(`cpm_c${i}_model`);
                    const legacyKey = await safeGetArg(`cpm_c${i}_key`);
                    if (!legacyUrl && !legacyModel && !legacyKey) continue;
                    state.CUSTOM_MODELS_CACHE.push({
                        uniqueId: `custom${i}`,
                        name: await safeGetArg(`cpm_c${i}_name`) || `Custom ${i}`,
                        model: legacyModel || '',
                        url: legacyUrl || '',
                        key: legacyKey || '',
                        format: await safeGetArg(`cpm_c${i}_format`) || 'openai',
                        sysfirst: await safeGetBoolArg(`cpm_c${i}_sysfirst`),
                        altrole: await safeGetBoolArg(`cpm_c${i}_altrole`),
                        mustuser: await safeGetBoolArg(`cpm_c${i}_mustuser`),
                        maxout: await safeGetBoolArg(`cpm_c${i}_maxout`),
                        mergesys: await safeGetBoolArg(`cpm_c${i}_mergesys`),
                        decoupled: await safeGetBoolArg(`cpm_c${i}_decoupled`),
                        thought: await safeGetBoolArg(`cpm_c${i}_thought`),
                        reasoning: await safeGetArg(`cpm_c${i}_reasoning`) || 'none',
                        verbosity: await safeGetArg(`cpm_c${i}_verbosity`) || 'none',
                        thinking: await safeGetArg(`cpm_c${i}_thinking`) || 'none',
                        responsesMode: 'auto',
                        tok: await safeGetArg(`cpm_c${i}_tok`) || 'o200k_base',
                        customParams: '',
                    });
                    migrated = true;
                }
                if (migrated) {
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                }
            }

            // Register custom models into ALL_DEFINED_MODELS
            state.CUSTOM_MODELS_CACHE.forEach((/** @type {any} */ m) => {
                state.ALL_DEFINED_MODELS.push({
                    uniqueId: m.uniqueId,
                    id: m.model,
                    name: m.name || m.uniqueId,
                    provider: 'Custom',
                });
            });

            // Diagnostic: log proxyUrl state for all custom models at boot
            if (state.CUSTOM_MODELS_CACHE.length > 0) {
                const proxyInfo = state.CUSTOM_MODELS_CACHE.map((/** @type {any} */ m) =>
                    `${m.name||m.uniqueId}: proxyUrl=${m.proxyUrl ? `"${m.proxyUrl}"` : '(empty)'}`
                ).join(', ');
                console.log(`[CPM Init] Custom models loaded (${state.CUSTOM_MODELS_CACHE.length}): ${proxyInfo}`);
            }

            // Sort alphabetically by provider, then by name
            state.ALL_DEFINED_MODELS.sort((/** @type {any} */ a, /** @type {any} */ b) => {
                const providerCompare = a.provider.localeCompare(b.provider);
                if (providerCompare !== 0) return providerCompare;
                return a.name.localeCompare(b.name);
            });
            _phaseDone('custom-models');
        } catch (e) { _phaseFail('custom-models', e); }

        // ── Phase: Model Registration with RisuAI ──
        _phaseStart('model-registration');
        let _modelRegCount = 0;
        try {
            for (const modelDef of /** @type {any[]} */ (state.ALL_DEFINED_MODELS)) {
                const pLabel = modelDef.provider;
                const mLabel = modelDef.name;

                // LLMFlags: 0=hasImageInput, 6=hasFullSystemPrompt, 7=hasFirstSystemPrompt,
                //           8=hasStreaming, 9=requiresAlternateRole, 14=DeveloperRole
                const provider = modelDef.provider;
                const modelId = String(modelDef.id || '');
                const isClaudeFamily = provider === 'Anthropic' || provider === 'AWS' || (provider === 'VertexAI' && modelId.startsWith('claude-'));
                const isGeminiFamily = provider === 'GoogleAI' || (provider === 'VertexAI' && modelId.startsWith('gemini-'));
                const isOpenAIFamily = provider === 'OpenAI';

                const modelFlags = [0, 8]; // hasImageInput, hasStreaming
                if (isClaudeFamily) {
                    modelFlags.push(7);    // hasFirstSystemPrompt
                } else if (isGeminiFamily) {
                    modelFlags.push(7, 9); // hasFirstSystemPrompt + requiresAlternateRole
                } else {
                    modelFlags.push(6);    // hasFullSystemPrompt
                }
                if (isOpenAIFamily && /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelId)) {
                    modelFlags.push(14);   // DeveloperRole
                }

                await Risu.addProvider(`🧁 [${pLabel}] ${mLabel}`, async (/** @type {any} */ args, /** @type {any} */ abortSignal) => {
                    try {
                        return await handleRequest(args, modelDef, abortSignal);
                    } catch (err) {
                        return { success: false, content: `[Cupcake SDK Fallback Crash] ${/** @type {Error} */ (err).message}` };
                    }
                }, {
                    model: { flags: modelFlags },
                });
                _modelRegCount++;
            }
            _phaseDone('model-registration');
        } catch (regErr) {
            _phaseFail('model-registration', regErr);
            console.error(`[CPM] Model registration stopped at ${_modelRegCount}/${state.ALL_DEFINED_MODELS.length}`);
        }

        // ── Phase: Silent Update Check (deferred 5s) ──
        // First, do a one-shot retry only if the previous boot left a pending
        // main-plugin update marker. This avoids repeated polling / heavy work.
        // If no pending marker exists, run the normal manifest → JS fallback checks.
        setTimeout(async () => {
            let retryHandled = false;
            try {
                retryHandled = (typeof /** @type {any} */ (SubPluginManager).retryPendingMainPluginUpdateOnBoot === 'function')
                    ? !!(await /** @type {any} */ (SubPluginManager).retryPendingMainPluginUpdateOnBoot())
                    : false;
            } catch (_) { }
            // Sub-plugin version checks always run (checkVersionsQuiet has its own
            // 10-min cooldown).  Only the main-plugin JS-fallback is skipped when
            // the boot retry already handled the main update.
            try { await /** @type {any} */ (SubPluginManager).checkVersionsQuiet(); } catch (_) { }
            if (!retryHandled) {
                try { await /** @type {any} */ (SubPluginManager).checkMainPluginVersionQuiet(); } catch (_) { }
            }
        }, 5000);

        // ── Phase: Keyboard Shortcut + Touch Gesture ──
        _phaseStart('hotkey-registration');
        try {
            const cpmWindow = /** @type {CpmWindow} */ (window);
            if (!cpmWindow.cpmShortcutRegistered) {
                cpmWindow.cpmShortcutRegistered = true;
                const rootDoc = await Risu.getRootDocument();

                if (!rootDoc) {
                    console.log('[CPM] Hotkey registration skipped: main DOM permission not granted.');
                } else {
                    // ─ Remove previously registered handlers to prevent double-firing on re-init ─
                    if (/** @type {any} */ (cpmWindow)._cpmKeydownHandler) {
                        try { await rootDoc.removeEventListener('keydown', /** @type {any} */ (cpmWindow)._cpmKeydownHandler); } catch (_) {}
                    }
                    if (/** @type {any} */ (cpmWindow)._cpmAddPointerHandler) {
                        try { await rootDoc.removeEventListener('pointerdown', /** @type {any} */ (cpmWindow)._cpmAddPointerHandler); } catch (_) {}
                        try { await rootDoc.removeEventListener('pointerup', /** @type {any} */ (cpmWindow)._cpmRemovePointerHandler); } catch (_) {}
                        try { await rootDoc.removeEventListener('pointercancel', /** @type {any} */ (cpmWindow)._cpmRemovePointerHandler); } catch (_) {}
                    }

                    const _keydownHandler = (/** @type {any} */ e) => {
                        if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
                            openCpmSettings();
                        }
                    };
                    await rootDoc.addEventListener('keydown', _keydownHandler);

                    // 4-finger touch gesture for mobile
                    let activePointersCount = 0;
                    /** @type {ReturnType<typeof setTimeout> | null} */
                    let activePointersTimer = null;

                    const addPointer = () => {
                        activePointersCount++;
                        if (activePointersCount >= 4) {
                            openCpmSettings();
                            activePointersCount = 0;
                        }
                        if (activePointersTimer) clearTimeout(activePointersTimer);
                        activePointersTimer = setTimeout(() => { activePointersCount = 0; }, 500);
                    };
                    const removePointer = () => { activePointersCount = Math.max(0, activePointersCount - 1); };

                    await rootDoc.addEventListener('pointerdown', addPointer);
                    await rootDoc.addEventListener('pointerup', removePointer);
                    await rootDoc.addEventListener('pointercancel', removePointer);

                    // Store handler references for cleanup on re-init
                    /** @type {any} */ (cpmWindow)._cpmKeydownHandler = _keydownHandler;
                    /** @type {any} */ (cpmWindow)._cpmAddPointerHandler = addPointer;
                    /** @type {any} */ (cpmWindow)._cpmRemovePointerHandler = removePointer;
                }
            }
            _phaseDone('hotkey-registration');
        } catch (err) {
            _phaseFail('hotkey-registration', err);
        }

        // ── Boot Summary ──
        if (_failedPhases.length > 0) {
            console.warn(`[CPM] Boot completed with ${_failedPhases.length} warning(s):`, _failedPhases);
        }
        console.log(`[CPM] ✓ Boot complete — ${_completedPhases.length} phases OK, ${_failedPhases.length} failed, ${_modelRegCount} models registered.`);

        // Record boot health for diagnostics
        try {
            await Risu.pluginStorage.setItem('cpm_last_boot_status', JSON.stringify({
                ts: Date.now(), version: CPM_VERSION,
                ok: _completedPhases, fail: _failedPhases,
                models: _modelRegCount, settingsOk: _settingsRegistered,
            }));
        } catch (_) { /* pluginStorage may not be available */ }

    } catch (e) {
        const _errAny = /** @type {any} */ (e);
        console.error(`[CPM] Unexpected init fail at phase '${_bootPhase}':`, e);
        console.error(`[CPM] Completed phases before crash:`, _completedPhases);

        // FALLBACK: If settings weren't registered earlier (e.g. RPC bridge failure),
        // try one more time with an error diagnostic panel.
        if (!_settingsRegistered) {
            try {
                await Risu.registerSetting(
                    `⚠️ CPM v${CPM_VERSION} (Error)`,
                    async () => {
                        Risu.showContainer('fullscreen');
                        document.body.innerHTML = `<div style="background:#1a1a2e;color:#fff;padding:40px;font-family:sans-serif;min-height:100vh;">
                            <h1 style="color:#ff6b6b;">🧁 Cupcake PM — Initialization Error</h1>
                            <p style="color:#ccc;margin:20px 0;">The plugin failed to initialize properly.</p>
                            <p style="color:#aaa;">Failed at phase: <code>${_bootPhase}</code></p>
                            <p style="color:#aaa;">Completed: ${_completedPhases.join(', ') || 'none'}</p>
                            <pre style="background:#0d1117;color:#ff7b72;padding:16px;border-radius:8px;overflow:auto;max-height:300px;font-size:13px;">${String(_errAny && _errAny.stack ? _errAny.stack : _errAny).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                            <p style="color:#aaa;margin-top:20px;">Try: reload (Ctrl+Shift+R) or re-import the plugin.</p>
                            <button onclick="document.body.innerHTML='';try{(window.risuai||window.Risuai).hideContainer();}catch(_){}"
                                style="margin-top:20px;padding:10px 24px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Close</button>
                        </div>`;
                    },
                    '🧁',
                    'html',
                );
            } catch (_) { /* Last resort — settings were already registered above in most cases */ }
        }
    }
})();
