//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.20.12
//@update-url https://cupcake-plugin-manager-test.vercel.app/api/main-plugin

// ==========================================
// ARGUMENT SCHEMAS (Saved Natively by RisuAI)
// ==========================================

// --- Slot Assignments ---
//@arg cpm_slot_translation string 번역 보조 모델
//@arg cpm_slot_emotion string 감정 보조 모델
//@arg cpm_slot_memory string 메모리 보조 모델
//@arg cpm_slot_other string 기타(유틸) 보조 모델

// --- Global Provider Configs ---
// OpenAI
//@arg cpm_openai_url string OpenAI Base URL
//@arg cpm_openai_key string OpenAI API Key
//@arg cpm_openai_model string OpenAI Model
//@arg cpm_openai_reasoning string OpenAI Reasoning Effort (none, low, medium, high, xhigh)
//@arg cpm_openai_verbosity string OpenAI Verbosity (none, low, medium, high)
//@arg cpm_dynamic_openai string Dynamic OpenAI Model Fetch (true/false)
// Anthropic
//@arg cpm_anthropic_url string Anthropic Base URL
//@arg cpm_anthropic_key string Anthropic API Key
//@arg cpm_anthropic_model string Anthropic Model
//@arg cpm_anthropic_thinking_budget int Anthropic Thinking Budget
//@arg cpm_anthropic_thinking_effort string Anthropic Thinking Effort (none/low/medium/high)
//@arg cpm_anthropic_cache_ttl string Anthropic Cache TTL (default/1h)
//@arg cpm_dynamic_anthropic string Dynamic Anthropic Model Fetch (true/false)
// Gemini
//@arg cpm_gemini_key string Gemini API Key
//@arg cpm_gemini_model string Gemini Model
//@arg cpm_gemini_thinking_level string Gemini Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
//@arg cpm_gemini_thinking_budget int Gemini Thinking Budget
//@arg cpm_dynamic_googleai string Dynamic Gemini Model Fetch (true/false)
// Vertex
//@arg cpm_vertex_key_json string Vertex Service Account JSON
//@arg cpm_vertex_location string Vertex Location (e.g. us-central1, global)
//@arg cpm_vertex_model string Vertex Model
//@arg cpm_vertex_thinking_level string Vertex Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
//@arg cpm_vertex_thinking_budget int Vertex Gemini Thinking Budget
//@arg cpm_vertex_claude_thinking_budget int Vertex Claude Thinking Budget
//@arg cpm_vertex_claude_effort string Vertex Claude Adaptive Thinking Effort (low/medium/high/max)
//@arg chat_vertex_preserveSystem string Vertex Preserve System Prompt (true/false)
//@arg chat_vertex_showThoughtsToken string Vertex Show Thoughts Token (true/false)
//@arg chat_vertex_useThoughtSignature string Vertex Use Thought Signature (true/false)
//@arg cpm_dynamic_vertexai string Dynamic Vertex Model Fetch (true/false)
// AWS Bedrock
//@arg cpm_aws_key string AWS Access Key
//@arg cpm_aws_secret string AWS Secret Access Key
//@arg cpm_aws_region string AWS Region
//@arg cpm_aws_thinking_budget int AWS Thinking Budget
//@arg cpm_aws_thinking_effort string AWS Thinking Effort (none/low/medium/high)
//@arg cpm_dynamic_aws string Dynamic AWS Model Fetch (true/false)
// DeepSeek
//@arg cpm_deepseek_url string DeepSeek Base URL
//@arg cpm_deepseek_key string DeepSeek API Key
//@arg cpm_deepseek_model string DeepSeek Model
//@arg cpm_dynamic_deepseek string Dynamic DeepSeek Model Fetch (true/false)
// OpenRouter
//@arg cpm_openrouter_url string OpenRouter Base URL
//@arg cpm_openrouter_key string OpenRouter API Key
//@arg cpm_openrouter_model string OpenRouter Model
//@arg cpm_openrouter_reasoning string OpenRouter Reasoning Effort (none, low, medium, high, xhigh)
//@arg cpm_openrouter_provider string OpenRouter Provider String (e.g., Hyperbolic)
//@arg cpm_dynamic_openrouter string Dynamic OpenRouter Model Fetch (true/false)

// --- Dynamic Custom Models JSON Storage ---
//@arg cpm_custom_models string Custom Models JSON Array (DO NOT EDIT MANUALLY)

// --- Global Tool Configs ---
//@arg tools_githubCopilotToken string GitHub Copilot Token

// --- Global Chat Configs ---
//@arg chat_claude_caching string Claude Caching (true/false)
//@arg chat_claude_cachingBreakpoints string Claude Caching Breakpoints (e.g., 1000,2000)
//@arg chat_claude_cachingMaxExtension string Claude Caching Max Extension (e.g., 500)
//@arg chat_gemini_preserveSystem string Gemini Preserve System Prompt (true/false)
//@arg chat_gemini_showThoughtsToken string Gemini Show Thoughts Token (true/false)
//@arg chat_gemini_useThoughtSignature string Gemini Use Thought Signature (true/false)
//@arg chat_gemini_usePlainFetch string Gemini Use Plain Fetch (true/false)
//@arg common_openai_servicetier string OpenAI Service Tier (Auto, Flex, Default)

// --- Streaming Settings ---
//@arg cpm_streaming_enabled string Enable Streaming Pass-Through (true/false)
//@arg cpm_streaming_show_thinking string Show Anthropic Thinking Tokens in Stream (true/false)

// --- Compatibility ---
//@arg cpm_compatibility_mode string Compatibility Mode — skip nativeFetch, use risuFetch only. Enable if requests hang or fail on iPhone/Safari. (true/false)
//@arg cpm_copilot_nodeless_mode string Copilot Node-less Experimental Mode (off, nodeless-1, nodeless-2)
var CupcakeProviderManager = (function (exports) {
    'use strict';

    // @ts-check
    /**
     * cpm-url.config.js — Single source of truth for the CPM deployment URL.
     *
     * Both `src/lib/endpoints.js` (runtime) and `rollup.config.mjs` (build-time
     * banner injection into plugin-header.js) read from this file.
     *
     * URL is determined by the `CPM_ENV` environment variable:
     *   - CPM_ENV=production  → https://cupcake-plugin-manager.vercel.app
     *   - CPM_ENV=test (or unset) → https://cupcake-plugin-manager-test.vercel.app
     *
     * Build usage:
     *   CPM_ENV=production npm run build   (production)
     *   npm run build                      (test — default)
     *   npm run build:production           (shorthand for production)
     */

    const _URLS = {
        production: 'https://cupcake-plugin-manager.vercel.app',
        test: 'https://cupcake-plugin-manager-test.vercel.app',
    };

    const _env = 'test';

    /** @type {string} */
    const CPM_BASE_URL = _URLS[_env];

    // @ts-check
    /**
     * endpoints.js — Centralized endpoint URL constants.
     *
     * All remote URLs used by CPM live here.
     * The base URL is imported from `src/cpm-url.config.js` — the single
     * source of truth shared with the Rollup build (which injects it into
     * the plugin-header.js banner at build time).
     *
     * To switch between test / production, set the `CPM_ENV` environment
     * variable at build time (e.g., `CPM_ENV=production npm run build` or
     * `npm run build:production`). See rollup.config.mjs for details.
     */


    /** Version manifest endpoint (GET → JSON). */
    const VERSIONS_URL = `${CPM_BASE_URL}/api/versions`;

    /** Main plugin JS download endpoint (GET → text/javascript). */
    const MAIN_UPDATE_URL = `${CPM_BASE_URL}/api/main-plugin`;

    /** Single-bundle update endpoint (GET → JSON with code + hashes). */
    const UPDATE_BUNDLE_URL = `${CPM_BASE_URL}/api/update-bundle`;

    // @ts-check
    /**
     * shared-state.js — Central shared mutable state for Cupcake Provider Manager.
     *
     * Uses a state object pattern so other modules can mutate values
     * without running into ES module import-binding re-assignment restrictions.
     *
     * Also exports safeGetArg / safeGetBoolArg / isDynamicFetchEnabled which
     * depend on the Risu global.
     */

    /**
     * @typedef {Object} VertexTokenCache
     * @property {string|null} token
     * @property {number} expiry
     */

    /**
     * @typedef {Object} CpmState
     * @property {Array<Object>} ALL_DEFINED_MODELS
     * @property {Array<Object>} CUSTOM_MODELS_CACHE
     * @property {VertexTokenCache} vertexTokenCache
     * @property {string|null} _currentExecutingPluginId
     */

    /**
     * @typedef {Object} PluginRegistration
     * @property {string[]} providerNames
     * @property {Object[]} tabObjects
     * @property {Array<{name: string, fetchDynamicModels: Function}>} fetcherEntries
     */

    /** @typedef {Window & typeof globalThis & { risuai?: any, Risuai?: any }} RisuWindow */

    // ─── Constants ───
    const CPM_VERSION = '1.20.12';

    // ─── RisuAI Global Reference ───
    const risuWindow = typeof window !== 'undefined'
        ? /** @type {RisuWindow} */ (window)
        : undefined;

    const Risu = (typeof window !== 'undefined')
        ? (risuWindow?.risuai || risuWindow?.Risuai)
        : undefined;

    // ─── Mutable State Container ───
    // All mutable singletons live here. Other modules import `state` and
    // read/write properties directly (e.g. state.ALL_DEFINED_MODELS = [...]).
    /** @type {CpmState} */
    const state = {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    };

    // ─── Registries (object/array refs – mutated in place) ───
    /** @type {Record<string, Function>} */
    const customFetchers = {};
    /** @type {Array<Object>} */
    const registeredProviderTabs = [];
    /** @type {Array<Object>} */
    const pendingDynamicFetchers = [];
    /** @type {Record<string, PluginRegistration>} */
    const _pluginRegistrations = {}; // pluginId -> { providerNames: [], tabObjects: [], fetcherEntries: [] }
    /** @type {Record<string, Function[]>} */
    const _pluginCleanupHooks = {}; // pluginId -> function[]

    // ─── Safe argument helpers (depend on Risu global) ───

    /**
     * Safely read a RisuAI argument value. Returns defaultValue on error or empty.
     * @param {string} key
     * @param {string} [defaultValue='']
     * @returns {Promise<string>}
     */
    async function safeGetArg(key, defaultValue = '') {
        try {
            const val = await Risu.getArgument(key);
            return val !== undefined && val !== null && val !== '' ? val : defaultValue;
        } catch {
            return defaultValue;
        }
    }

    /**
     * Safely read a boolean argument value.
     * @param {string} key
     * @param {boolean} [defaultValue=false]
     * @returns {Promise<boolean>}
     */
    async function safeGetBoolArg(key, defaultValue = false) {
        try {
            const val = await Risu.getArgument(key);
            if (val === 'true' || val === true) return true;
            if (val === 'false' || val === false || val === '') return false;
            return defaultValue;
        } catch {
            return defaultValue;
        }
    }

    /**
     * Check if dynamic model fetching is enabled for a given provider.
     * Setting key: cpm_dynamic_<providerName_lowercase> = 'true'.
     * @param {string} providerName
     */
    async function isDynamicFetchEnabled(providerName) {
        const key = `cpm_dynamic_${providerName.toLowerCase()}`;
        try {
            const val = await safeGetArg(key);
            return val === 'true';
        } catch {
            return false;
        }
    }

    // @ts-check
    /**
     * helpers.js — Pure utility functions for Cupcake Provider Manager.
     * Zero external dependencies. Safe for all environments.
     */

    /**
     * Safe UUID generator: uses crypto.randomUUID() when available (secure contexts),
     * falls back to a random string for HTTP/Docker/insecure environments where
     * crypto.randomUUID is undefined and would crash the app.
     * @returns {string}
     */
    function safeUUID() {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
        } catch (_) { /* ignore */ }
        // Fallback: generate a v4-like UUID from Math.random
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /**
     * Safe JSON.stringify: replacer removes null/undefined from all arrays during serialization.
     * Catches nulls from toJSON(), undefined→null conversion, etc.
     * @param {any} obj
     */
    function safeStringify(obj) {
        return JSON.stringify(obj, function (_key, value) {
            if (Array.isArray(value)) {
                return value.filter(function (item) { return item != null; });
            }
            return value;
        });
    }

    /**
     * Check if message content is non-empty (string, array, or object).
     * @param {any} content
     */
    function hasNonEmptyMessageContent(content) {
        if (content === null || content === undefined) return false;
        if (typeof content === 'string') return content.trim() !== '';
        if (Array.isArray(content)) return content.length > 0;
        if (typeof content === 'object') return true;
        return String(content).trim() !== '';
    }

    /**
     * Check if a message has attached multimodal content (images, audio, etc.).
     * @param {any} message
     */
    function hasAttachedMultimodals(message) {
        return !!(message && Array.isArray(message.multimodals) && message.multimodals.length > 0);
    }

    /**
     * Escape HTML special characters to prevent XSS when interpolating into innerHTML.
     * Shared across all settings-ui modules.
     * @param {any} s
     */
    function escHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Parse a base64 data URI into its MIME type and raw data components.
     * e.g. "data:image/png;base64,abc123" → { mimeType: "image/png", data: "abc123" }
     * For raw base64 without a data URI prefix, returns { mimeType: null, data: input }.
     * @param {string} dataUri
     * @returns {{ mimeType: string|null, data: string }}
     */
    function parseBase64DataUri(dataUri) {
        if (!dataUri || typeof dataUri !== 'string') return { mimeType: null, data: '' };
        const commaIdx = dataUri.indexOf(',');
        if (commaIdx === -1) return { mimeType: null, data: dataUri };
        const prefix = dataUri.substring(0, commaIdx);
        const mimeType = prefix.split(';')[0]?.split(':')[1] || null;
        const data = dataUri.substring(commaIdx + 1);
        return { mimeType, data };
    }

    /**
     * Extract image URL from an OpenAI-format content part (image_url or input_image).
     * Handles both string and object forms of image_url.
     * @param {Record<string, any>} part - Content part with image_url field
     * @returns {string} URL or empty string
     */
    function extractImageUrlFromPart(part) {
        if (!part) return '';
        const raw = part.image_url;
        if (typeof raw === 'string') return raw;
        if (raw && typeof raw.url === 'string') return raw.url;
        return '';
    }

    /**
     * Get the file accept attribute for sub-plugin file inputs.
     * Mobile/iOS devices need broader accept types.
     */
    function getSubPluginFileAccept() {
        try {
            const ua = (navigator.userAgent || '').toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
            if (isIOS || isMobile) {
                return '.js,.mjs,.txt,text/javascript,application/javascript,*/*';
            }
        } catch (_) {}
        return '.js,.mjs,text/javascript,application/javascript';
    }

    // @ts-check
    /**
     * sanitize.js — Message sanitization and content normalization.
     * Strips internal RisuAI tags, filters null entries, normalizes multimodal payloads.
     */

    /**
     * @typedef {{ type: string, base64?: string, url?: string, mimeType?: string }} NormalizedMultimodal
     * @typedef {{ text: string, multimodals: NormalizedMultimodal[] }} NormalizedPayload
     */

    /**
     * Check if text is an inlay scene wrapper (should be preserved intact).
     * @param {string} text
     * @returns {boolean}
     */
    function isInlaySceneWrapperText(text) {
        if (typeof text !== 'string') return false;
        return /<lb-xnai\s+scene="[^"]*">\{\{(?:inlay|inlayed|inlayeddata)::[^}]*\}\}<\/lb-xnai>/i.test(text);
    }

    /**
     * Strip RisuAI-internal tags from message content.
     * Keep inlay tokens intact to avoid breaking translation/aux slot image flows.
     * @param {string} text
     * @returns {string}
     */
    function stripInternalTags(text) {
        if (typeof text !== 'string') return text;
        if (isInlaySceneWrapperText(text)) {
            return text.trim();
        }
        return text
            .replace(/<qak>|<\/qak>/g, '')
            .trim();
    }

    /**
     * Remove stale auto-generated image captions from message text.
     * Only strips when: no inlay tokens, no attached multimodals, text contains image-related keywords.
     * @param {string} text
     * @param {Object} message
     * @returns {string}
     */
    function stripStaleAutoCaption(text, message) {
        if (typeof text !== 'string') return text;
        if (isInlaySceneWrapperText(text) || /\{\{(?:inlay|inlayed|inlayeddata)::[^}]*\}\}/i.test(text)) return text;
        if (hasAttachedMultimodals(message)) return text;

        const lower = text.toLowerCase();
        const imageIntent = lower.includes('image') || lower.includes('photo') || lower.includes('picture') || lower.includes('첨부') || lower.includes('사진');
        if (!imageIntent) return text;

        return text.replace(/\s*\[[a-z0-9][a-z0-9 ,.'"-]{6,}\]\s*$/i, (match) => {
            // Only strip if the bracket content looks like an auto-generated image caption.
            // Captions are typically multi-word descriptions (≥3 alphabetic words).
            // This avoids stripping structured references like [Chapter 12, Part 2].
            const inner = match.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
            const wordCount = (inner.match(/[a-z]{2,}/gi) || []).length;
            if (wordCount >= 3) return '';
            return match;   // Too few words to be an image caption — leave it alone
        }).trim();
    }

    /**
     * Extract and normalize message payload into { text, multimodals }.
     * Handles RisuAI multimodals array, OpenAI content parts (image_url, input_audio, input_image),
     * Anthropic image blocks, and Gemini inlineData.
     * @param {Record<string, any>} message
     * @returns {NormalizedPayload}
     */
    function extractNormalizedMessagePayload(message) {
        const normalizedMultimodals = [];
        const textParts = [];

        if (Array.isArray(message?.multimodals)) {
            for (const modal of message.multimodals) {
                if (modal && typeof modal === 'object') normalizedMultimodals.push(modal);
            }
        }

        const content = message?.content;
        if (typeof content === 'string') {
            textParts.push(content);
        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (!part || typeof part !== 'object') continue;

                if (typeof part.text === 'string' && part.text.trim() !== '') {
                    textParts.push(part.text);
                }

                if (part.inlineData && part.inlineData.data) {
                    const mimeType = part.inlineData.mimeType || 'application/octet-stream';
                    const dataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
                    if (mimeType.startsWith('image/')) normalizedMultimodals.push({ type: 'image', base64: dataUrl, mimeType });
                    else if (mimeType.startsWith('audio/')) normalizedMultimodals.push({ type: 'audio', base64: dataUrl, mimeType });
                    else if (mimeType.startsWith('video/')) normalizedMultimodals.push({ type: 'video', base64: dataUrl, mimeType });
                }

                if (part.type === 'image_url') {
                    const imageUrl = typeof part.image_url === 'string'
                        ? part.image_url
                        : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                    if (imageUrl.startsWith('data:image/')) {
                        const mimeType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                        normalizedMultimodals.push({ type: 'image', base64: imageUrl, mimeType });
                    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        normalizedMultimodals.push({ type: 'image', url: imageUrl, mimeType: 'image/*' });
                    }
                }

                if (part.type === 'input_image') {
                    const imageUrl = typeof part.image_url === 'string'
                        ? part.image_url
                        : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                    if (imageUrl.startsWith('data:image/')) {
                        const mimeType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                        normalizedMultimodals.push({ type: 'image', base64: imageUrl, mimeType });
                    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        normalizedMultimodals.push({ type: 'image', url: imageUrl, mimeType: 'image/*' });
                    }
                }

                if (part.type === 'input_audio' && part.input_audio && part.input_audio.data) {
                    const format = part.input_audio.format || 'mp3';
                    const mimeType = `audio/${format}`;
                    normalizedMultimodals.push({ type: 'audio', base64: `data:${mimeType};base64,${part.input_audio.data}`, mimeType });
                }

                if (part.type === 'image' && part.source && part.source.type === 'base64' && part.source.data) {
                    const mimeType = part.source.media_type || 'image/png';
                    normalizedMultimodals.push({ type: 'image', base64: `data:${mimeType};base64,${part.source.data}`, mimeType });
                }
            }
        } else if (content !== null && content !== undefined) {
            if (typeof content === 'object' && typeof content.text === 'string') textParts.push(content.text);
            else if (typeof content === 'object') {
                // Structured objects (e.g. multimodal parts missing .text) must be
                // JSON-serialized to preserve data. String(obj) produces the useless
                // "[object Object]" which corrupts downstream API payloads.
                try { textParts.push(JSON.stringify(content)); } catch (_) { textParts.push(String(content)); }
            }
            else textParts.push(String(content));
        }

        return {
            text: textParts.join('\n\n'),
            multimodals: normalizedMultimodals,
        };
    }

    /**
     * Deep-sanitize messages array: remove null/undefined entries,
     * strip internal RisuAI tags, filter messages with empty content.
     * Returns a NEW array — never mutates the input.
     * @param {Array<Record<string, any>>} messages
     * @returns {Array<Record<string, any>>}
     */
    function sanitizeMessages(messages) {
        if (!Array.isArray(messages)) return [];
        const result = [];
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (m == null || typeof m !== 'object') continue;
            if (typeof m.role !== 'string' || !m.role) continue;
            if (m.content === null || m.content === undefined) continue;
            const cleaned = { ...m };
            if (typeof cleaned.toJSON === 'function') delete cleaned.toJSON;
            if (typeof cleaned.content === 'string') {
                cleaned.content = stripInternalTags(cleaned.content);
                cleaned.content = stripStaleAutoCaption(cleaned.content, cleaned);
            }
            if (!hasNonEmptyMessageContent(cleaned.content) && !hasAttachedMultimodals(cleaned)) continue;
            result.push(cleaned);
        }
        return result;
    }

    /**
     * Last-line-of-defense: parse JSON body, filter null entries from messages/contents,
     * re-stringify via safeStringify to catch any remaining nulls.
     * @param {string} jsonStr
     * @returns {string}
     */
    function sanitizeBodyJSON(jsonStr) {
        try {
            const obj = JSON.parse(jsonStr);
            if (Array.isArray(obj.messages)) {
                const before = obj.messages.length;
                obj.messages = obj.messages.filter((/** @type {any} */ m) => {
                    if (m == null || typeof m !== 'object') return false;
                    if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
                    if (typeof m.role !== 'string' || !m.role) return false;
                    if (typeof m.toJSON === 'function') delete m.toJSON;
                    return true;
                });
                if (obj.messages.length < before) {
                    console.warn(`[Cupcake PM] sanitizeBodyJSON: removed ${before - obj.messages.length} invalid entries from messages`);
                }
            }
            if (Array.isArray(obj.contents)) {
                const before = obj.contents.length;
                obj.contents = obj.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
                if (obj.contents.length < before) {
                    console.warn(`[Cupcake PM] sanitizeBodyJSON: removed ${before - obj.contents.length} null entries from contents`);
                }
            }
            const result = safeStringify(obj);
            try {
                JSON.parse(result);
            } catch {
                console.error('[Cupcake PM] sanitizeBodyJSON: output validation failed — returning original');
                return jsonStr;
            }
            return result;
        } catch (e) {
            if (typeof jsonStr === 'string' && !jsonStr.trimStart().startsWith('{') && !jsonStr.trimStart().startsWith('[')) {
                return jsonStr;
            }
            console.error('[Cupcake PM] sanitizeBodyJSON: JSON parse/stringify failed:', /** @type {Error} */ (e).message);
            return jsonStr;
        }
    }

    /**
     * Strip embedded thought display content from historical model messages.
     * During streaming, thought/reasoning content is injected into the stream text
     * for display (e.g <Thoughts>...</Thoughts> or > [Thought Process] blocks).
     * When that text is saved to chat history and sent back in subsequent requests,
     * it pollutes the API context and wastes tokens. This strips those markers.
     * @param {string} text
     * @returns {string}
     */
    function stripThoughtDisplayContent(text) {
        if (!text) return text;
        let cleaned = text;
        // New format (v1.16.0+): <Thoughts>...</Thoughts>
        cleaned = cleaned.replace(/<Thoughts>[\s\S]*?<\/Thoughts>\s*/g, '');
        // Old format (pre-v1.16.0): > [Thought Process] blockquote sections
        if (cleaned.includes('> [Thought Process]')) {
            const lastMarkerIdx = cleaned.lastIndexOf('> [Thought Process]');
            const afterLastMarker = cleaned.substring(lastMarkerIdx);
            const contentMatch = afterLastMarker.match(/\n{3,}\s*(?=[^\s>\\])/);
            if (contentMatch) {
                cleaned = afterLastMarker.substring(contentMatch.index ?? 0).trim();
            } else {
                cleaned = '';
            }
        }
        cleaned = cleaned.replace(/\\n\\n/g, '');
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    // @ts-check
    /**
     * token-usage.js — Token usage normalization and tracking.
     * Normalizes OpenAI, Anthropic, and Gemini usage formats into a unified shape.
     */

    /**
     * @typedef {{ input: number, output: number, reasoning: number, cached: number, total: number, reasoningEstimated?: boolean }} TokenUsage
     */

    /**
     * @param {unknown} value
     * @returns {number}
     */
    function _toFiniteTokenInt(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }

    /**
     * Try known explicit Anthropic/proxy reasoning token fields first.
     * Future-proofed for proxy adapters that may expose separate reasoning counts.
     * @param {Record<string, any>} raw
     * @returns {number}
     */
    function _extractAnthropicReasoningTokens(raw) {
        return (
            _toFiniteTokenInt(raw.reasoning_tokens) ||
            _toFiniteTokenInt(raw.thinking_tokens) ||
            _toFiniteTokenInt(raw.output_tokens_details?.reasoning_tokens) ||
            _toFiniteTokenInt(raw.output_tokens_details?.thinking_tokens) ||
            _toFiniteTokenInt(raw.output_token_details?.reasoning_tokens) ||
            _toFiniteTokenInt(raw.output_token_details?.thinking_tokens) ||
            _toFiniteTokenInt(raw.completion_tokens_details?.reasoning_tokens)
        );
    }

    /**
     * Best-effort local token estimate for visible Claude text when no tokenizer is available.
     * English-ish text uses a char-based heuristic; CJK-heavy text biases higher to avoid undercounting.
     * @param {string} text
     * @returns {number}
     */
    function _estimateVisibleTextTokens(text) {
        if (!text || typeof text !== 'string') return 0;
        const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
        if (!normalized) return 0;
        const compact = normalized.replace(/\s/g, '');
        const cjkCount = (compact.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) || []).length;
        if (cjkCount > 0 && cjkCount / Math.max(compact.length, 1) >= 0.3) {
            return Math.max(1, cjkCount + Math.ceil((compact.length - cjkCount) / 2));
        }
        return Math.max(1, Math.ceil(normalized.length / 4));
    }

    /** @type {Map<string, TokenUsage>} In-memory token usage store, keyed by request ID */
    const _tokenUsageStore = new Map();
    const _TOKEN_USAGE_LEGACY_NONSTREAM = '_latest';
    const _TOKEN_USAGE_LEGACY_STREAM = '_stream_latest';
    const _TOKEN_USAGE_STORE_MAX = 100;

    /**
     * @param {string} requestId
     * @param {boolean} [isStream]
     * @returns {string}
     */
    function _tokenUsageKey(requestId, isStream = false) {
        if (!requestId || typeof requestId !== 'string') {
            return isStream ? _TOKEN_USAGE_LEGACY_STREAM : _TOKEN_USAGE_LEGACY_NONSTREAM;
        }
        return `${isStream ? '_stream_' : '_nonstream_'}${requestId}`;
    }

    /**
     * @param {string} requestId
     * @param {TokenUsage} usage
     * @param {boolean} [isStream]
     */
    function _setTokenUsage(requestId, usage, isStream = false) {
        if (!usage || typeof usage !== 'object') return;
        _tokenUsageStore.set(_tokenUsageKey(requestId, isStream), usage);
        // Evict oldest entries when store exceeds max size to prevent memory leak
        if (_tokenUsageStore.size > _TOKEN_USAGE_STORE_MAX) {
            const it = _tokenUsageStore.keys();
            _tokenUsageStore.delete(/** @type {string} */ (it.next().value));
        }
    }

    /**
     * @param {string} requestId
     * @param {boolean} [isStream]
     * @returns {TokenUsage|null}
     */
    function _takeTokenUsage(requestId, isStream = false) {
        const key = _tokenUsageKey(requestId, isStream);
        const scoped = _tokenUsageStore.get(key);
        if (scoped) {
            _tokenUsageStore.delete(key);
            return scoped;
        }
        const legacyKey = isStream ? _TOKEN_USAGE_LEGACY_STREAM : _TOKEN_USAGE_LEGACY_NONSTREAM;
        const legacy = _tokenUsageStore.get(legacyKey);
        if (legacy) {
            _tokenUsageStore.delete(legacyKey);
            return legacy;
        }
        return null;
    }

    /**
     * Normalize token usage from different API formats into a unified shape.
     * @param {Record<string, any>} raw - Raw usage object from API response
     * @param {'openai'|'anthropic'|'gemini'} format
     * @param {{ anthropicHasThinking?: boolean, anthropicVisibleText?: string }} [meta]
     * @returns {TokenUsage | null}
     */
    function _normalizeTokenUsage(raw, format, meta = {}) {
        if (!raw || typeof raw !== 'object') return null;
        if (format === 'openai') {
            const input = raw.prompt_tokens || 0;
            const output = raw.completion_tokens || 0;
            const reasoning = raw.completion_tokens_details?.reasoning_tokens || 0;
            const cached = raw.prompt_tokens_details?.cached_tokens || raw.prompt_cache_hit_tokens || 0;
            return { input, output, reasoning, cached, total: raw.total_tokens || (input + output) };
        } else if (format === 'anthropic') {
            const input = raw.input_tokens || 0;
            const output = raw.output_tokens || 0;
            const cached = (raw.cache_read_input_tokens || 0) + (raw.cache_creation_input_tokens || 0);
            const explicitReasoning = _extractAnthropicReasoningTokens(raw);
            if (explicitReasoning > 0) {
                return { input, output, reasoning: explicitReasoning, cached, total: input + output };
            }

            if (meta?.anthropicHasThinking && output > 0) {
                const visibleAnswerTokens = _estimateVisibleTextTokens(meta.anthropicVisibleText || '');
                const estimatedReasoning = Math.max(0, output - visibleAnswerTokens);
                if (estimatedReasoning > 0) {
                    return {
                        input,
                        output,
                        reasoning: estimatedReasoning,
                        cached,
                        total: input + output,
                        reasoningEstimated: true,
                    };
                }
            }

            return { input, output, reasoning: 0, cached, total: input + output };
        } else if (format === 'gemini') {
            const input = raw.promptTokenCount || 0;
            const output = raw.candidatesTokenCount || 0;
            const reasoning = raw.thoughtsTokenCount || 0;
            const cached = raw.cachedContentTokenCount || 0;
            return { input, output, reasoning, cached, total: raw.totalTokenCount || (input + output) };
        }
        return null;
    }

    // @ts-check
    /**
     * token-toast.js — Lightweight toast notification for token usage display.
     * Shows input/output/reasoning/cached token counts at top-right corner.
     */

    /**
     * Show a lightweight toast notification with token usage information.
     * Displayed at the top-right corner, auto-dismisses after 6 seconds.
     * @param {string} modelName - Display name of the model
     * @param {{ input: number, output: number, reasoning: number, cached: number, total: number, reasoningEstimated?: boolean }} usage
     * @param {number} durationMs - Request duration in milliseconds
     */
    async function showTokenUsageToast(modelName, usage, durationMs) {
        if (!usage) return;
        try {
            const doc = await Risu.getRootDocument();
            if (!doc) return;

            // Remove previous token usage toast
            const existing = await doc.querySelector('[x-cpm-token-toast]');
            if (existing) { try { await existing.remove(); } catch (_) { } }

            // Format numbers with commas
            const fmt = (/** @type {number} */ n) => n != null ? n.toLocaleString() : '0';
            const durationStr = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '';

            // Build detail parts
            const parts = [];
            parts.push(`📥 ${fmt(usage.input)}`);
            parts.push(`📤 ${fmt(usage.output)}`);
            if (usage.reasoning > 0) parts.push(`${usage.reasoningEstimated ? '🗯≈' : '🗯'} ${fmt(usage.reasoning)}`);
            if (usage.cached > 0) parts.push(`💾 ${fmt(usage.cached)}`);
            if (durationStr) parts.push(`⏱️ ${durationStr}`);

            // Truncate model name for display
            const shortModel = modelName.length > 40 ? modelName.substring(0, 37) + '...' : modelName;

            const toast = await doc.createElement('div');
            await toast.setAttribute('x-cpm-token-toast', '1');
            await toast.setStyle('position', 'fixed');
            await toast.setStyle('top', '12px');
            await toast.setStyle('right', '12px');
            await toast.setStyle('zIndex', '99997');
            await toast.setStyle('background', 'rgba(17, 24, 39, 0.92)');
            await toast.setStyle('border', '1px solid #374151');
            await toast.setStyle('borderLeft', '3px solid #8b5cf6');
            await toast.setStyle('borderRadius', '8px');
            await toast.setStyle('padding', '8px 12px');
            await toast.setStyle('maxWidth', '420px');
            await toast.setStyle('minWidth', '200px');
            await toast.setStyle('boxShadow', '0 4px 16px rgba(0,0,0,0.4)');
            await toast.setStyle('fontFamily', "-apple-system, BlinkMacSystemFont, 'Segoe UI', monospace");
            await toast.setStyle('pointerEvents', 'auto');
            await toast.setStyle('opacity', '0');
            await toast.setStyle('transform', 'translateY(-8px)');
            await toast.setStyle('transition', 'opacity 0.25s ease, transform 0.25s ease');
            await toast.setStyle('cursor', 'pointer');

            await toast.setInnerHTML(`
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:11px;color:#a78bfa;font-weight:600;white-space:nowrap">📊 ${shortModel}</span>
                <span style="font-size:11px;color:#6b7280">|</span>
                <span style="font-size:11px;color:#d1d5db;font-family:monospace;letter-spacing:0.5px">${parts.join(' <span style="color:#4b5563">·</span> ')}</span>
            </div>
        `);

            const body = await doc.querySelector('body');
            if (!body) return;
            await body.appendChild(toast);

            // Animate in
            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '1');
                    await toast.setStyle('transform', 'translateY(0)');
                } catch (_) { }
            }, 30);

            // Click to dismiss
            try {
                await toast.addEventListener('click', async () => {
                    try {
                        await toast.setStyle('opacity', '0');
                        await toast.setStyle('transform', 'translateY(-8px)');
                        setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 300);
                    } catch (_) { }
                });
            } catch (_) { }

            // Auto-dismiss after 6 seconds
            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '0');
                    await toast.setStyle('transform', 'translateY(-8px)');
                    setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 300);
                } catch (_) { }
            }, 6000);

        } catch (e) {
            console.debug('[CPM TokenToast] Failed:', /** @type {Error} */ (e).message);
        }
    }

    // @ts-check
    /**
     * format-openai.js — Format messages for OpenAI-compatible APIs.
     * Handles multimodal content, role normalization, developer role conversion.
     */

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
    function formatToOpenAI(messages, config = {}) {
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

    // @ts-check
    /**
     * format-anthropic.js — Format messages for Anthropic Claude API.
     * Handles system prompt extraction, consecutive message merging, multimodal content,
     * and cache_control breakpoints.
     */

    /**
     * Merge content parts into the previous message if same role, otherwise push a new entry.
     * Eliminates the repeated consecutive-merge pattern throughout formatToAnthropic.
     * @param {Array<any>} formattedMsgs - The formatted message array (mutated in place)
     * @param {string} role - 'user' | 'assistant'
     * @param {Array<any>} contentParts - Array of Anthropic content blocks to merge/push
     */
    function _mergeOrPush(formattedMsgs, role, contentParts) {
        if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
            const prev = formattedMsgs[formattedMsgs.length - 1];
            if (typeof prev.content === 'string') {
                prev.content = [{ type: 'text', text: prev.content }, ...contentParts];
            } else if (Array.isArray(prev.content)) {
                prev.content.push(...contentParts);
            }
        } else {
            formattedMsgs.push({ role, content: contentParts });
        }
    }

    /**
     * Format messages for Anthropic Messages API.
     * @param {Array<any>} messages - Raw message array
     * @param {Object} config - Formatting options
     * @param {boolean} [config.caching] - Enable cache_control breakpoints
     * @param {boolean} [config.claude1HourCaching] - Use 1h TTL for cache_control
     * @returns {{ messages: Array<any>, system: string }}
     */
    function formatToAnthropic(messages, config = {}) {
        /** @type {any[]} */
        const validMsgs = sanitizeMessages(messages);

        // Extract leading system messages
        const leadingSystem = [];
        let splitIdx = 0;
        for (let i = 0; i < validMsgs.length; i++) {
            if (validMsgs[i].role === 'system') {
                leadingSystem.push(typeof validMsgs[i].content === 'string' ? validMsgs[i].content : JSON.stringify(validMsgs[i].content));
                splitIdx = i + 1;
            } else {
                break;
            }
        }
        const systemPrompt = leadingSystem.join('\n\n');
        const remainingMsgs = validMsgs.slice(splitIdx);

        // Non-leading system messages → user role with "system: " prefix
        /** @type {any[]} */
        const chatMsgs = remainingMsgs.map(m => {
            if (m.role === 'system') {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                return { ...m, role: 'user', content: `system: ${content}` };
            }
            return m;
        });

        /** @type {any[]} */
        const formattedMsgs = [];
        /** @type {number[]} — maps each chatMsgs[i] to its formattedMsgs index, or -1 if skipped */
        const srcToFmtMap = new Array(chatMsgs.length).fill(-1);
        for (let ci = 0; ci < chatMsgs.length; ci++) {
            const m = chatMsgs[ci];
            const role = m.role === 'assistant' ? 'assistant' : 'user';
            const payload = extractNormalizedMessagePayload(m);

            // Multimodal handling (images) → Anthropic vision format
            if (payload.multimodals.length > 0) {
                const imageParts = [];
                const textParts = [];
                const textContent = payload.text.trim();
                if (textContent) textParts.push({ type: 'text', text: textContent });
                for (const modal of payload.multimodals) {
                    if (!modal || typeof modal !== 'object') continue;
                    if (modal.type === 'image') {
                        if (typeof modal.url === 'string' && (modal.url.startsWith('http://') || modal.url.startsWith('https://'))) {
                            imageParts.push({
                                type: 'image',
                                source: { type: 'url', url: modal.url }
                            });
                            continue;
                        }
                        const { mimeType: mediaType_raw, data } = parseBase64DataUri(/** @type {string} */ (modal.base64));
                        const mediaType = mediaType_raw || 'image/png';
                        imageParts.push({
                            type: 'image',
                            source: { type: 'base64', media_type: mediaType, data: data }
                        });
                    }
                }
                const contentParts = [...imageParts, ...textParts];
                if (contentParts.length > 0) {
                    _mergeOrPush(formattedMsgs, role, contentParts);
                    srcToFmtMap[ci] = formattedMsgs.length - 1;
                } else {
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                    if (!hasNonEmptyMessageContent(content)) continue;
                    _mergeOrPush(formattedMsgs, role, [{ type: 'text', text: content }]);
                    srcToFmtMap[ci] = formattedMsgs.length - 1;
                }
                continue;
            }

            // Array content (pass-through with cross-format conversion)
            if (Array.isArray(m.content)) {
                const contentParts = [];
                for (const part of m.content) {
                    if (!part || typeof part !== 'object') continue;
                    if (typeof part.text === 'string' && part.text.trim() !== '') {
                        contentParts.push({ type: 'text', text: part.text });
                        continue;
                    }
                    if (part.type === 'image' && part.source?.type === 'base64' && part.source.data) {
                        contentParts.push(part);
                        continue;
                    }
                    if (part.inlineData?.data) {
                        const _mt = part.inlineData.mimeType || 'application/octet-stream';
                        if (_mt.startsWith('image/')) {
                            contentParts.push({ type: 'image', source: { type: 'base64', media_type: _mt, data: part.inlineData.data } });
                        }
                        continue;
                    }
                    if (part.type === 'image_url' || part.type === 'input_image') {
                        const imageUrl = extractImageUrlFromPart(part);
                        if (imageUrl.startsWith('data:image/')) {
                            const { mimeType: _mt, data: _d } = parseBase64DataUri(imageUrl);
                            if (_d) contentParts.push({ type: 'image', source: { type: 'base64', media_type: _mt || 'image/png', data: _d } });
                        } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                            contentParts.push({ type: 'image', source: { type: 'url', url: imageUrl } });
                        }
                    }
                }

                if (contentParts.length > 0) {
                    _mergeOrPush(formattedMsgs, role, contentParts);
                    srcToFmtMap[ci] = formattedMsgs.length - 1;
                    continue;
                }
            }

            // Text-only message
            const content = payload.text || (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            if (!hasNonEmptyMessageContent(content)) continue;
            _mergeOrPush(formattedMsgs, role, [{ type: 'text', text: content }]);
            srcToFmtMap[ci] = formattedMsgs.length - 1;
        }

        // Ensure first message is user role
        if (formattedMsgs.length === 0 || formattedMsgs[0].role !== 'user') {
            formattedMsgs.unshift({ role: 'user', content: [{ type: 'text', text: 'Start' }] });
            // Adjust mapping indices after unshift
            for (let i = 0; i < srcToFmtMap.length; i++) {
                if (srcToFmtMap[i] >= 0) srcToFmtMap[i]++;
            }
        }

        // Apply cache_control breakpoints
        // NOTE: Anthropic cache_control only supports { type: 'ephemeral' } (5-min default TTL).
        // Custom TTL strings are NOT supported by the API and would be silently ignored or rejected.
        if (config.caching) {
            const _cacheCtrl = { type: 'ephemeral' };
            for (let ci = 0; ci < chatMsgs.length; ci++) {
                if (!chatMsgs[ci].cachePoint) continue;
                const fmtIdx = srcToFmtMap[ci];
                if (fmtIdx < 0 || fmtIdx >= formattedMsgs.length) continue;
                const fMsg = formattedMsgs[fmtIdx];
                if (Array.isArray(fMsg.content) && fMsg.content.length > 0) {
                    fMsg.content[fMsg.content.length - 1].cache_control = _cacheCtrl;
                } else if (typeof fMsg.content === 'string') {
                    fMsg.content = [{ type: 'text', text: fMsg.content, cache_control: _cacheCtrl }];
                }
            }
        }

        return { messages: formattedMsgs, system: systemPrompt };
    }

    // @ts-check
    /**
     * format-gemini.js — Format messages for Google Gemini API.
     * Includes safety settings, thinking config, parameter validation,
     * and thought signature caching.
     */

    // ─── Gemini Safety Settings ───

    /**
     * Get Gemini safety settings with model-aware threshold.
     * @param {string} [modelId] - Model ID for model-aware threshold selection
     */
    function getGeminiSafetySettings(modelId) {
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
    function validateGeminiParams(generationConfig) {
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
    function isExperimentalGeminiModel(modelId) {
        return modelId && (modelId.includes('exp') || modelId.includes('experimental'));
    }

    /**
     * Check if a Gemini model supports penalty parameters.
     * @param {string} modelId
     */
    function geminiSupportsPenalty(modelId) {
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
    function cleanExperimentalModelParams(generationConfig, modelId) {
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
    function buildGeminiThinkingConfig(model, level, budget, isVertexAI) {
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
    const ThoughtSignatureCache = {
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
    function formatToGemini(messagesRaw, config = {}) {
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
    function parseOpenAISSELine(line) {
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
    function normalizeOpenAIMessageContent(content) {
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
    const GEMINI_BLOCK_REASONS = ['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'];

    /**
     * Gemini SSE line parser: extracts text parts from streamed JSON chunks.
     * Handles thinking blocks, thought signatures, safety blocks, and usageMetadata.
     * @param {string} line - SSE data line
     * @param {Record<string, any>} config - Mutable config for tracking state across chunks
     * @returns {string|null} Delta text content or null
     */
    function parseGeminiSSELine(line, config = {}) {
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

    // @ts-check
    /**
     * key-pool.js — API Key rotation engine.
     * Supports whitespace-separated key pools and JSON credential rotation (Vertex AI).
     * Dependency-injected via setGetArgFn() for testability.
     */

    /**
     * KeyPool: key rotation. Keys are whitespace-separated in //@arg fields.
     * Random pick per request; on 429/529/503, drain failed key and retry.
     */
    const KeyPool = {
        /** @type {Record<string, any>} */
        _pools: {},
        /** Injected safeGetArg function. Set via setGetArgFn(). @type {((key: string, defaultValue?: string) => Promise<string>) | null} */
        _getArgFn: null,

        /**
         * Set the argument retrieval function (dependency injection).
         * @param {(key: string, defaultValue?: string) => Promise<string>} fn
         */
        setGetArgFn(fn) {
            this._getArgFn = fn;
        },

        /**
         * Parse keys from the setting string (whitespace-separated), cache them,
         * and return a random key from the pool.
         * @param {string} argName
         */
        async pick(argName) {
            const pool = this._pools[argName];
            if (pool && pool._inline && pool.keys.length > 0) {
                return pool.keys[Math.floor(Math.random() * pool.keys.length)];
            }
            const getArg = this._getArgFn;
            if (!getArg) return '';  // No getArgFn → cannot re-parse keys after reset()
            const raw = await getArg(argName);
            if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
                this._pools[argName] = {
                    lastRaw: raw,
                    keys: (raw || '').trim().split(/\s+/).filter(k => k.length > 0)
                };
            }
            const keys = this._pools[argName].keys;
            if (keys.length === 0) return '';
            return keys[Math.floor(Math.random() * keys.length)];
        },

        /**
         * Remove a failed key from the pool. Returns remaining count.
         * @param {string} argName
         * @param {string} failedKey
         */
        drain(argName, failedKey) {
            const pool = this._pools[argName];
            if (!pool) return 0;
            const idx = pool.keys.indexOf(failedKey);
            if (idx > -1) pool.keys.splice(idx, 1);
            return pool.keys.length;
        },

        /**
         * Get the number of remaining keys in the pool.
         * @param {string} argName
         */
        remaining(argName) {
            return this._pools[argName]?.keys?.length || 0;
        },

        /**
         * Force re-parse keys from settings on next pick.
         * @param {string} argName
         */
        reset(argName) {
            delete this._pools[argName];
        },

        /**
         * Pick key → fetchFn(key) → on retryable error, drain and retry.
         * @param {string} argName
         * @param {(key: string) => Promise<any>} fetchFn
         * @param {{maxRetries?: number, isRetryable?: (result: any) => boolean}} [opts]
         */
        async withRotation(argName, fetchFn, opts = {}) {
            const maxRetries = opts.maxRetries || 30;
            const isRetryable = opts.isRetryable || ((/** @type {any} */ result) => {
                if (!result._status) return false;
                return result._status === 429 || result._status === 529 || result._status === 503;
            });

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const key = await this.pick(argName);
                if (!key) {
                    return { success: false, content: `[KeyPool] ${argName}에 사용 가능한 API 키가 없습니다. 설정에서 키를 확인하세요.` };
                }

                const result = await fetchFn(key);
                if (result.success || !isRetryable(result)) return result;

                const remaining = this.drain(argName, key);
                console.warn(`[KeyPool] 🔄 키 교체: ${argName} (HTTP ${result._status}, 남은 키: ${remaining}개, 시도: ${attempt + 1})`);

                if (remaining === 0) {
                    console.warn(`[KeyPool] ⚠️ ${argName}의 모든 키가 소진되었습니다. 키를 재파싱합니다.`);
                    this.reset(argName);
                    // Don't return — reset() clears lastRaw so next pick() re-parses from settings.
                    // The loop continues and pick() will return a fresh key set.
                }
            }
            return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
        },

        // ── JSON Credential Rotation (Vertex AI 등 JSON 크레덴셜용) ──

        /** @param {string} raw */
        _looksLikeWindowsPath(raw) {
            const trimmed = (raw || '').trim();
            return /^[A-Za-z]:\\/.test(trimmed) || /^\\\\[^\\]/.test(trimmed);
        },

        /**
         * @param {string} raw
         * @param {any} [error]
         */
        _buildJsonCredentialError(raw, error) {
            if (this._looksLikeWindowsPath(raw)) {
                return new Error('JSON 인증 정보 대신 Windows 파일 경로가 입력되었습니다. 파일 경로가 아니라 Service Account JSON 본문 전체를 붙여넣어야 합니다.');
            }

            const message = error?.message || '알 수 없는 JSON 파싱 오류';
            if (/Bad Unicode escape/i.test(message)) {
                return new Error('JSON 파싱 오류: 역슬래시(\\)가 이스케이프되지 않았습니다. Windows 경로를 넣었다면 \\\\ 로 이스케이프하거나 파일 경로 대신 JSON 본문을 붙여넣으세요.');
            }

            return new Error(`JSON 인증 정보 파싱 오류: ${message}`);
        },

        /**
         * Extract individual JSON objects from raw textarea input.
         * Supports: single, comma-separated, JSON array, or newline-separated.
         * @param {string} raw
         */
        _parseJsonCredentials(raw) {
            const trimmed = (raw || '').trim();
            if (!trimmed) return [];
            if (this._looksLikeWindowsPath(trimmed)) {
                throw this._buildJsonCredentialError(trimmed);
            }

            let lastError = null;
            try {
                const arr = JSON.parse(trimmed);
                if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
            } catch (error) { lastError = error; }
            if (trimmed.startsWith('{')) {
                try {
                    const arr = JSON.parse('[' + trimmed + ']');
                    if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
                } catch (error) { lastError = error; }
            }
            try {
                const obj = JSON.parse(trimmed);
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) return [trimmed];
            } catch (error) { lastError = error; }
            if (lastError && /Bad Unicode escape/i.test(/** @type {Error} */ (lastError).message || '')) {
                throw this._buildJsonCredentialError(trimmed, lastError);
            }
            return [];
        },

        /**
         * Parse JSON credentials from a textarea field, cache them,
         * and return a random one from the pool.
         * @param {string} argName
         */
        async pickJson(argName) {
            const getArg = this._getArgFn;
            if (!getArg) return '';  // No getArgFn → cannot re-parse keys after reset()
            const raw = await getArg(argName);
            const pool = this._pools[argName];
            if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
                try {
                    const jsons = this._parseJsonCredentials(raw);
                    this._pools[argName] = { lastRaw: raw, keys: jsons, error: '' };
                } catch (error) {
                    this._pools[argName] = { lastRaw: raw, keys: [], error: /** @type {Error} */ (error).message };
                }
            }
            const keys = this._pools[argName].keys;
            if (keys.length === 0) return '';
            return keys[Math.floor(Math.random() * keys.length)];
        },

        /**
         * Like withRotation but uses pickJson for JSON credential parsing.
         * @param {string} argName
         * @param {(key: string) => Promise<any>} fetchFn
         * @param {{maxRetries?: number, isRetryable?: (result: any) => boolean}} [opts]
         */
        async withJsonRotation(argName, fetchFn, opts = {}) {
            const maxRetries = opts.maxRetries || 30;
            const isRetryable = opts.isRetryable || ((/** @type {any} */ result) => {
                if (!result._status) return false;
                return result._status === 429 || result._status === 529 || result._status === 503;
            });

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const credJson = await this.pickJson(argName);
                if (!credJson) {
                    const errorMessage = this._pools[argName]?.error;
                    return {
                        success: false,
                        content: errorMessage
                            ? `[KeyPool] ${errorMessage}`
                            : `[KeyPool] ${argName}에 사용 가능한 JSON 인증 정보가 없습니다. 설정에서 확인하세요.`
                    };
                }

                const result = await fetchFn(credJson);
                if (result.success || !isRetryable(result)) return result;

                const remaining = this.drain(argName, credJson);
                console.warn(`[KeyPool] 🔄 JSON 인증 교체: ${argName} (HTTP ${result._status}, 남은 인증: ${remaining}개, 시도: ${attempt + 1})`);

                if (remaining === 0) {
                    console.warn(`[KeyPool] ⚠️ ${argName}의 모든 JSON 인증이 소진되었습니다. 키를 재파싱합니다.`);
                    this.reset(argName);
                    // Don't return — reset() clears lastRaw so next pickJson() re-parses from settings.
                }
            }
            return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
        }
    };

    // @ts-check
    /**
     * slot-inference.js — Infer which auxiliary slot a request is targeting.
     * Uses model assignment matching + prompt content heuristics for disambiguation.
     */

    const CPM_SLOT_LIST = ['translation', 'emotion', 'memory', 'other'];

    /**
     * Heuristic patterns for each slot type, used when the same model is assigned
     * to multiple slots and uniqueId alone can't disambiguate.
     */
    const SLOT_HEURISTICS = {
        translation: {
            patterns: [
                /translat(?:e|ion|ing)/i,
                /번역/,
                /翻[译訳]/,
                /source\s*(?:language|lang|text)/i,
                /target\s*(?:language|lang)/i,
                /\b(?:en|ko|ja|zh|de|fr|es|ru)\s*(?:→|->|to|에서|으로)\s*(?:en|ko|ja|zh|de|fr|es|ru)\b/i,
                /\[(?:SL|TL|Source|Target)\]/i,
                /output\s*(?:only\s*)?(?:the\s+)?translat/i,
            ],
            weight: 2
        },
        emotion: {
            patterns: [
                /emotion|감정|표정|expression|mood|sentiment/i,
                /\bemote\b/i,
                /facial\s*express/i,
                /character.*(?:emotion|feeling|mood)/i,
                /(?:detect|classify|analyze).*(?:emotion|sentiment)/i,
            ],
            weight: 2
        },
        memory: {
            patterns: [
                /summar(?:y|ize|izing|isation)/i,
                /요약/,
                /\bmemory\b/i,
                /메모리/,
                /\brecap\b/i,
                /condense.*(?:context|conversation|chat)|compress.*(?:context|conversation|chat)/i,
                /key\s*(?:points|events|details)/i,
                /\bhypa(?:memory|v[23])\b/i,
                /\bsupa(?:memory)?\b/i,
            ],
            weight: 2
        },
        other: {
            patterns: [
                /\blua\b/i,
                /\bscript/i,
                /\btrigger\b/i,
                /트리거/,
                /\bfunction\s*call/i,
                /\btool\s*(?:use|call)/i,
                /\bexecute\b/i,
                /\butility\b/i,
                /\bhelper\b/i,
            ],
            weight: 1
        }
    };

    /**
     * Score prompt content against slot heuristic patterns.
     * @param {string} promptText - Combined prompt text to analyze
     * @param {string} slotName - Slot name to score against
     * @returns {number} Score (higher = more confident match)
     */
    function scoreSlotHeuristic(promptText, slotName) {
        const heuristic = SLOT_HEURISTICS[/** @type {keyof typeof SLOT_HEURISTICS} */ (slotName)];
        if (!heuristic || !promptText) return 0;
        let score = 0;
        for (const pattern of heuristic.patterns) {
            if (pattern.test(promptText)) {
                score += heuristic.weight;
            }
        }
        return score;
    }

    /**
     * Infer the request slot from model definition and prompt content.
     *
     * SAFETY POLICY (v1.19.6): Even when a model matches exactly ONE aux slot,
     * we ALWAYS run heuristic confirmation. This protects against the common case
     * where the same model is assigned to both main chat (in Risu UI) and an aux
     * slot (in CPM settings). Without heuristic gating, every main-chat request
     * would incorrectly receive aux-slot parameter overrides (e.g., translation
     * temp=0.2 bleeding into main chat temp=1.0).
     *
     * Behavior:
     *   - 0 slot matches → 'chat' (no override)
     *   - 1 slot match  → heuristic must confirm (score > 0) → slot / 'chat'
     *   - 2+ slot match → heuristic must disambiguate clearly → slot / 'chat'
     *
     * When heuristics fail, Risu's native parameter values are used as-is.
     *
     * @param {Record<string, any>} activeModelDef - Model definition with uniqueId
     * @param {Record<string, any>} args - Request arguments (contains prompt_chat)
     * @returns {Promise<{slot: string, heuristicConfirmed: boolean}>}
     *          slot = 'chat' | 'translation' | 'emotion' | 'memory' | 'other'
     *          heuristicConfirmed = true when the slot was confirmed via content analysis
     */
    async function inferSlot(activeModelDef, args) {
        const matchingSlots = [];
        for (const slot of CPM_SLOT_LIST) {
            const configuredId = await safeGetArg(`cpm_slot_${slot}`, '');
            if (configuredId && configuredId === activeModelDef.uniqueId) {
                matchingSlots.push(slot);
            }
        }

        // No match → main chat, no overrides
        if (matchingSlots.length === 0) return { slot: 'chat', heuristicConfirmed: false };

        const isMultiCollision = matchingSlots.length > 1;
        if (isMultiCollision) {
            console.warn(`[Cupcake PM] ⚠️ inferSlot: Model '${activeModelDef.uniqueId}' is assigned to ${matchingSlots.length} slots: [${matchingSlots.join(', ')}]. Using prompt heuristics to disambiguate.`);
        } else {
            console.log(`[Cupcake PM] inferSlot: Model '${activeModelDef.uniqueId}' matches slot '${matchingSlots[0]}'. Running heuristic confirmation (same-model safety).`);
        }

        // Extract prompt text for heuristic analysis
        let promptText = '';
        if (args && args.prompt_chat && Array.isArray(args.prompt_chat)) {
            const msgs = args.prompt_chat;
            for (let i = 0; i < msgs.length; i++) {
                const m = msgs[i];
                if (!m) continue;
                const content = typeof m.content === 'string' ? m.content : '';
                if (m.role === 'system' || i < 3 || i >= msgs.length - 2) {
                    promptText += content + '\n';
                }
            }
            promptText = promptText.substring(0, 3000);
        }

        if (!promptText.trim()) {
            // No prompt content → can't confirm slot. Use Risu values (safe default).
            console.warn(`[Cupcake PM] ⚠️ inferSlot: No prompt content for heuristic analysis. Falling back to 'chat' (Risu params will be used).`);
            return { slot: 'chat', heuristicConfirmed: false };
        }

        // Score each matching slot
        let bestSlot = null;
        let bestScore = 0;
        let secondBestScore = 0;
        for (const slot of matchingSlots) {
            const score = scoreSlotHeuristic(promptText, slot);
            if (score > bestScore) {
                secondBestScore = bestScore;
                bestScore = score;
                bestSlot = slot;
            } else if (score > secondBestScore) {
                secondBestScore = score;
            }
        }

        // For single match: require score > 0 (content confirms this is an aux request)
        // For multi match: require score > 0 AND beat second-best (clear winner)
        if (bestSlot && bestScore > 0) {
            if (!isMultiCollision || bestScore > secondBestScore) {
                console.log(`[Cupcake PM] inferSlot: Heuristic confirmed → '${bestSlot}' (score: ${bestScore}${isMultiCollision ? ` vs next: ${secondBestScore}` : ''}).`);
                return { slot: bestSlot, heuristicConfirmed: true };
            }
        }

        // Heuristic inconclusive → DON'T guess. Pass through Risu's native params.
        console.warn(`[Cupcake PM] ⚠️ inferSlot: Heuristic ${isMultiCollision ? 'inconclusive' : 'unconfirmed'} for '${matchingSlots.join(', ')}' (best score: ${bestScore}). Using Risu params (no CPM slot override).`);
        return { slot: 'chat', heuristicConfirmed: false };
    }

    // @ts-check
    /**
     * aws-signer.js — AWS Signature Version 4 signer.
     * Self-contained implementation using Web Crypto API (available in iframe sandbox).
     * Ported from provider-manager.js §1.5 — no external dependencies.
     */

    const encoder = new TextEncoder();

    const HOST_SERVICES = {
        appstream2: 'appstream', cloudhsmv2: 'cloudhsm', email: 'ses',
        marketplace: 'aws-marketplace', mobile: 'AWSMobileHubService',
        pinpoint: 'mobiletargeting', queue: 'sqs', 'git-codecommit': 'codecommit',
        'mturk-requester-sandbox': 'mturk-requester', 'personalize-runtime': 'personalize',
    };

    const UNSIGNABLE_HEADERS = new Set([
        'authorization', 'content-type', 'content-length', 'user-agent',
        'presigned-expires', 'expect', 'x-amzn-trace-id', 'range', 'connection',
    ]);

    const HEX_CHARS = '0123456789abcdef'.split('');

    /**
     * @param {ArrayBuffer} arrayBuffer
     * @returns {string}
     */
    function buf2hex(arrayBuffer) {
        const buffer = new Uint8Array(arrayBuffer);
        let out = '';
        for (let idx = 0; idx < buffer.length; idx++) {
            const n = buffer[idx];
            out += HEX_CHARS[(n >>> 4) & 15];
            out += HEX_CHARS[n & 15];
        }
        return out;
    }

    /**
     * @param {string} urlEncodedStr
     * @returns {string}
     */
    function encodeRfc3986(urlEncodedStr) {
        return urlEncodedStr.replace(/[!'()*]/g, (/** @type {string} */ c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    }

    /**
     * @param {string|ArrayBuffer} key
     * @param {string} string
     * @returns {Promise<ArrayBuffer>}
     */
    async function hmac(key, string) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            typeof key === 'string' ? encoder.encode(key) : key,
            { name: 'HMAC', hash: { name: 'SHA-256' } },
            false,
            ['sign'],
        );
        return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(string));
    }

    /**
     * @param {string|ArrayBuffer} content
     * @returns {Promise<ArrayBuffer>}
     */
    async function hash(content) {
        return crypto.subtle.digest(
            'SHA-256',
            typeof content === 'string' ? encoder.encode(content) : content,
        );
    }

    /**
     * @param {URL} url
     * @param {Headers} headers
     * @returns {[string, string]}
     */
    function guessServiceRegion(url, headers) {
        const { hostname, pathname } = url;

        if (hostname.endsWith('.on.aws')) {
            const match = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/);
            return match != null ? ['lambda', match[1] || ''] : ['', ''];
        }
        if (hostname.endsWith('.r2.cloudflarestorage.com')) return ['s3', 'auto'];
        if (hostname.endsWith('.backblazeb2.com')) {
            const match = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/);
            return match != null ? ['s3', match[1] || ''] : ['', ''];
        }

        const match = hostname.replace('dualstack.', '').match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/);
        let service = (match && match[1]) || '';
        let region = match && match[2];

        if (region === 'us-gov') {
            region = 'us-gov-west-1';
        } else if (region === 's3' || region === 's3-accelerate') {
            region = 'us-east-1'; service = 's3';
        } else if (service === 'iot') {
            if (hostname.startsWith('iot.')) service = 'execute-api';
            else if (hostname.startsWith('data.jobs.iot.')) service = 'iot-jobs-data';
            else service = pathname === '/mqtt' ? 'iotdevicegateway' : 'iotdata';
        } else if (service === 'autoscaling') {
            const targetPrefix = (headers.get('X-Amz-Target') || '').split('.')[0];
            if (targetPrefix === 'AnyScaleFrontendService') service = 'application-autoscaling';
            else if (targetPrefix === 'AnyScaleScalingPlannerFrontendService') service = 'autoscaling-plans';
        } else if (region == null && service.startsWith('s3-')) {
            region = service.slice(3).replace(/^fips-|^external-1/, '');
            service = 's3';
        } else if (service.endsWith('-fips')) {
            service = service.slice(0, -5);
        } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) {
            [service, region] = [region, service];
        }

        return [/** @type {Record<string, string>} */ (HOST_SERVICES)[service] || service, region || ''];
    }

    /**
     * AWS Signature Version 4 signer.
     * Signs HTTP requests for AWS services (Bedrock, STS, etc.) using Web Crypto API.
     */
    class AwsV4Signer {
        /**
         * @param {object} options
         * @param {string} [options.method]
         * @param {string|URL} options.url
         * @param {HeadersInit} [options.headers]
         * @param {string|ArrayBuffer|null} [options.body]
         * @param {string} options.accessKeyId
         * @param {string} options.secretAccessKey
         * @param {string} [options.sessionToken]
         * @param {string} [options.service]
         * @param {string} [options.region]
         * @param {Map<string, ArrayBuffer>} [options.cache]
         * @param {string} [options.datetime]
         * @param {boolean} [options.signQuery]
         * @param {boolean} [options.appendSessionToken]
         * @param {boolean} [options.allHeaders]
         * @param {boolean} [options.singleEncode]
         */
        constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) {
            if (url == null) throw new TypeError('url is a required option');
            if (accessKeyId == null) throw new TypeError('accessKeyId is a required option');
            if (secretAccessKey == null) throw new TypeError('secretAccessKey is a required option');

            this.method = method || (body ? 'POST' : 'GET');
            this.url = new URL(url);
            this.headers = new Headers(headers || {});
            this.body = body;
            this.accessKeyId = accessKeyId;
            this.secretAccessKey = secretAccessKey;
            this.sessionToken = sessionToken;

            let guessedService, guessedRegion;
            if (!service || !region) {
                [guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers);
            }
            this.service = service || guessedService || '';
            this.region = region || guessedRegion || 'us-east-1';
            this.cache = cache || new Map();
            this.datetime = datetime || new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
            this.signQuery = signQuery;
            this.appendSessionToken = appendSessionToken || this.service === 'iotdevicegateway';

            this.headers.delete('Host');
            if (this.service === 's3' && !this.signQuery && !this.headers.has('X-Amz-Content-Sha256')) {
                this.headers.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
            }

            const params = this.signQuery ? this.url.searchParams : this.headers;
            params.set('X-Amz-Date', this.datetime);
            if (this.sessionToken && !this.appendSessionToken) {
                params.set('X-Amz-Security-Token', this.sessionToken);
            }

            this.signableHeaders = ['host', ...this.headers.keys()]
                .filter((header) => allHeaders || !UNSIGNABLE_HEADERS.has(header))
                .sort();
            this.signedHeaders = this.signableHeaders.join(';');
            this.canonicalHeaders = this.signableHeaders
                .map((header) => header + ':' + (header === 'host' ? this.url.host : (this.headers.get(header) || '').replace(/\s+/g, ' ')))
                .join('\n');
            this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, 'aws4_request'].join('/');

            if (this.signQuery) {
                if (this.service === 's3' && !params.has('X-Amz-Expires')) params.set('X-Amz-Expires', '86400');
                params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
                params.set('X-Amz-Credential', this.accessKeyId + '/' + this.credentialString);
                params.set('X-Amz-SignedHeaders', this.signedHeaders);
            }

            if (this.service === 's3') {
                try { this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, ' ')); }
                catch (_) { this.encodedPath = this.url.pathname; }
            } else {
                this.encodedPath = this.url.pathname.replace(/\/+/g, '/');
            }
            if (!singleEncode) {
                this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, '/');
            }
            this.encodedPath = encodeRfc3986(this.encodedPath);

            const seenKeys = new Set();
            this.encodedSearch = [...this.url.searchParams]
                .filter(([k]) => {
                    if (!k) return false;
                    if (this.service === 's3') { if (seenKeys.has(k)) return false; seenKeys.add(k); }
                    return true;
                })
                .map((pair) => pair.map((p) => encodeRfc3986(encodeURIComponent(p))))
                .sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0)
                .map((pair) => pair.join('='))
                .join('&');
        }

        async sign() {
            if (this.signQuery) {
                this.url.searchParams.set('X-Amz-Signature', await this.signature());
                if (this.sessionToken && this.appendSessionToken) {
                    this.url.searchParams.set('X-Amz-Security-Token', this.sessionToken);
                }
            } else {
                this.headers.set('Authorization', await this.authHeader());
            }
            return { method: this.method, url: this.url, headers: this.headers, body: this.body };
        }

        async authHeader() {
            return [
                'AWS4-HMAC-SHA256 Credential=' + this.accessKeyId + '/' + this.credentialString,
                'SignedHeaders=' + this.signedHeaders,
                'Signature=' + (await this.signature()),
            ].join(', ');
        }

        async signature() {
            const date = this.datetime.slice(0, 8);
            const cacheKey = [this.secretAccessKey, date, this.region, this.service].join();
            let kCredentials = this.cache.get(cacheKey);
            if (!kCredentials) {
                const kDate = await hmac('AWS4' + this.secretAccessKey, date);
                const kRegion = await hmac(kDate, this.region);
                const kService = await hmac(kRegion, this.service);
                kCredentials = await hmac(kService, 'aws4_request');
                this.cache.set(cacheKey, kCredentials);
            }
            return buf2hex(await hmac(kCredentials, await this.stringToSign()));
        }

        async stringToSign() {
            return [
                'AWS4-HMAC-SHA256',
                this.datetime,
                this.credentialString,
                buf2hex(await hash(await this.canonicalString())),
            ].join('\n');
        }

        async canonicalString() {
            return [
                this.method.toUpperCase(),
                this.encodedPath,
                this.encodedSearch,
                this.canonicalHeaders + '\n',
                this.signedHeaders,
                await this.hexBodyHash(),
            ].join('\n');
        }

        async hexBodyHash() {
            let hashHeader = this.headers.get('X-Amz-Content-Sha256') ||
                (this.service === 's3' && this.signQuery ? 'UNSIGNED-PAYLOAD' : null);
            if (hashHeader == null) {
                if (this.body && typeof this.body !== 'string' && !('byteLength' in this.body)) {
                    throw new Error('body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header');
                }
                hashHeader = buf2hex(await hash(this.body || ''));
            }
            return hashHeader;
        }
    }

    // @ts-check
    /**
     * api-request-log.js — API Request History (ring buffer for API View feature).
     * Tracks HTTP requests/responses for debugging UI. Max 20 entries.
     */

    const _apiRequestHistory = new Map();
    const _API_REQUEST_HISTORY_MAX = 20;
    /** @type {string | null} */
    let _apiRequestLatestId = null;

    /**
     * Store a new API request entry and return its unique ID.
     * @param {Object} entry - Initial request metadata
     * @returns {string} Generated requestId
     */
    function storeApiRequest(entry) {
        const requestId = safeUUID();
        _apiRequestHistory.set(requestId, entry);
        _apiRequestLatestId = requestId;
        if (_apiRequestHistory.size > _API_REQUEST_HISTORY_MAX) {
            const firstKey = _apiRequestHistory.keys().next().value;
            _apiRequestHistory.delete(firstKey);
        }
        return requestId;
    }

    /**
     * Update an existing API request entry by requestId.
     * @param {string} requestId
     * @param {Object} updates - Fields to merge into the existing entry
     */
    function updateApiRequest(requestId, updates) {
        const entry = _apiRequestHistory.get(requestId);
        if (entry) Object.assign(entry, updates);
    }

    /**
     * Get the latest API request entry (for API View display).
     * @returns {Object|null}
     */
    function getLatestApiRequest() {
        if (_apiRequestLatestId) return _apiRequestHistory.get(_apiRequestLatestId);
        return null;
    }

    /**
     * Get all API request entries as an array, newest first.
     * @returns {any[]}
     */
    function getAllApiRequests() {
        const entries = [];
        for (const [id, entry] of _apiRequestHistory) {
            entries.push({ id, ...entry });
        }
        return entries.reverse();
    }

    /**
     * Get a specific API request by its ID.
     * @param {string} requestId
     * @returns {Object|null}
     */
    function getApiRequestById(requestId) {
        return _apiRequestHistory.get(requestId) || null;
    }

    /**
     * Clear all stored requests (for testing or reset).
     */
    function clearApiRequests() {
        _apiRequestHistory.clear();
        _apiRequestLatestId = null;
    }

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
    function supportsOpenAIReasoningEffort(modelName) {
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
    function needsCopilotResponsesAPI(modelName) {
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
    function shouldStripOpenAISamplingParams(modelName) {
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
    function shouldStripGPT54SamplingForReasoning(modelName, reasoningEffort) {
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
    function needsMaxCompletionTokens(modelName) {
        if (!modelName) return false;
        return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(modelName);
    }

    // @ts-check
    /**
     * response-parsers.js — Non-streaming response parsers for all providers.
     * Pure functions that extract text content from API JSON responses.
     */

    /**
     * Parse OpenAI Chat Completions non-streaming response.
     * Handles reasoning_content (o-series), reasoning (OpenRouter), DeepSeek <think> blocks.
     * @param {Record<string, any>} data - Parsed JSON response
     * @param {string} [_requestId] - Optional API View request ID
     * @returns {{ success: boolean, content: string }}
     */
    function parseOpenAINonStreamingResponse(data, _requestId) {
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
    function parseResponsesAPINonStreamingResponse(data, _requestId) {
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
    function parseGeminiNonStreamingResponse(data, config = {}, _requestId) {
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
    function parseClaudeNonStreamingResponse(data, _config = {}, _requestId) {
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

    // @ts-check
    /**
     * stream-builders.js — SSE stream constructors for all providers.
     * Creates ReadableStream<string> from fetch Response objects.
     * Uses dependency injection for _updateApiRequest to avoid tight coupling.
     */

    /** Module-level reference to the API request logger. Set via setApiRequestLogger().
     * @type {Function|null} */
    let _logFn = null;

    /**
     * Inject the API request update function.
     * @param {function} fn - (requestId, updates) => void
     */
    function setApiRequestLogger(fn) {
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
    function createSSEStream(response, lineParser, abortSignal, onComplete, _logRequestId) {
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
    function createOpenAISSEStream(response, abortSignal, _logRequestId) {
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
    function createResponsesAPISSEStream(response, abortSignal, _logRequestId) {
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
    function createAnthropicSSEStream(response, abortSignal, _logRequestId, opts) {
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
    function saveThoughtSignatureFromStream(config, _requestId) {
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

    // @ts-check
    /**
     * stream-utils.js — Stream utility functions.
     * Provides stream collection and bridge capability detection.
     */

    /**
     * Collect a ReadableStream<string> into a single string.
     * Used for decoupled streaming mode and fallback when bridge doesn't support stream transfer.
     * @param {ReadableStream} stream
     * @returns {Promise<string>}
     */
    async function collectStream(stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let result = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value == null) continue;
            if (typeof value === 'string') { result += value; continue; }
            if (value instanceof Uint8Array) { result += decoder.decode(value, { stream: true }); continue; }
            if (value instanceof ArrayBuffer) { result += decoder.decode(new Uint8Array(value), { stream: true }); continue; }
            result += String(value);
        }
        result += decoder.decode();
        return result;
    }

    /** Cached result of stream bridge capability detection. */
    /** @type {boolean | null} */
    let _streamBridgeCapable = null;

    /**
     * Detect if V3 iframe bridge can transfer ReadableStream.
     * Tests structured-clone and transfer-list approaches.
     * Cached after first probe.
     * @returns {Promise<boolean>}
     */
    async function checkStreamCapability() {
        if (_streamBridgeCapable !== null) return _streamBridgeCapable;

        // Phase 1: structured-clone (no transfer list)
        try {
            const s1 = new ReadableStream({ start(c) { c.close(); } });
            const mc1 = new MessageChannel();
            const cloneable = await new Promise(resolve => {
                const timer = setTimeout(() => { resolve(false); try { mc1.port1.close(); mc1.port2.close(); } catch (_) { /* */ } }, 500);
                mc1.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc1.port1.close(); mc1.port2.close(); };
                mc1.port2.onmessageerror = () => { clearTimeout(timer); resolve(false); mc1.port1.close(); mc1.port2.close(); };
                try { mc1.port1.postMessage({ s: s1 }); }
                catch (_) { clearTimeout(timer); resolve(false); }
            });
            if (cloneable) {
                _streamBridgeCapable = true;
                console.log('[CupcakePM] ReadableStream is structured-cloneable — streaming enabled.');
                return true;
            }
        } catch (_) { /* continue to Phase 2 */ }

        // Phase 2: Guest bridge transferable check
        try {
            const scriptContent = document.querySelector('script')?.textContent || '';
            const ctFnMatch = scriptContent.match(/function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/);
            if (ctFnMatch && ctFnMatch[0].includes('ReadableStream')) {
                const s2 = new ReadableStream({ start(c) { c.close(); } });
                const mc2 = new MessageChannel();
                const transferable = await new Promise(resolve => {
                    const timer = setTimeout(() => { resolve(false); try { mc2.port1.close(); mc2.port2.close(); } catch (_) { /* */ } }, 500);
                    mc2.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc2.port1.close(); mc2.port2.close(); };
                    try { mc2.port1.postMessage({ s: s2 }, [s2]); }
                    catch (_) { clearTimeout(timer); resolve(false); }
                });
                if (transferable) {
                    _streamBridgeCapable = true;
                    console.log('[CupcakePM] Guest bridge patched + browser supports transfer — streaming enabled.');
                    return true;
                }
            }
        } catch (_) { /* fallback */ }

        _streamBridgeCapable = false;
        console.log('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
        return false;
    }

    /**
     * Reset the cached stream capability result (for testing).
     */
    function resetStreamCapability() {
        _streamBridgeCapable = null;
    }

    // @ts-check
    /**
     * copilot-headers.js — Copilot API emulation header constants.
     *
     * Extracted from fetch-custom.js so that version bumps (e.g. when GitHub
     * updates the Copilot Chat extension) can be done in a single place
     * without touching the core fetch logic.
     */

    /** Copilot Chat extension version emulated by CPM. */
    const COPILOT_CHAT_VERSION = '0.37.4';

    /** VS Code editor version emulated by CPM. */
    const VSCODE_VERSION = '1.109.2';

    /** GitHub API version header value. */
    const GITHUB_API_VERSION = '2025-10-01';

    /** Token exchange API version header value. */
    const GITHUB_TOKEN_API_VERSION = '2024-12-15';

    /** Browser-like User-Agent used for token exchange. */
    const COPILOT_TOKEN_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/${VSCODE_VERSION} Chrome/142.0.7444.265 Electron/39.3.0 Safari/537.36`;

    /** @typedef {'off' | 'nodeless-1' | 'nodeless-2'} CopilotNodelessMode */

    /**
     * Normalize the persisted node-less compatibility mode.
     *
     * @param {string | null | undefined} value
     * @returns {CopilotNodelessMode}
     */
    function normalizeCopilotNodelessMode(value) {
        if (value === 'nodeless-1' || value === 'nodeless-2') return value;
        return 'off';
    }

    /**
     * @param {string | null | undefined} mode
     * @returns {boolean}
     */
    function shouldUseNodelessTokenHeaders(mode) {
        const normalized = normalizeCopilotNodelessMode(mode);
        return normalized === 'nodeless-1' || normalized === 'nodeless-2';
    }

    /**
     * @param {string | null | undefined} mode
     * @returns {boolean}
     */
    function shouldUseLegacyCopilotRequestHeaders(mode) {
        return normalizeCopilotNodelessMode(mode) === 'nodeless-2';
    }

    /**
     * Build headers for GitHub OAuth → Copilot token exchange.
     * `nodeless-1` and `nodeless-2` intentionally keep this minimal so users can
     * test browser-direct node-less environments with fewer CORS-preflight issues.
     *
     * @param {string} oauthToken
     * @param {string | null | undefined} [mode='off']
     * @returns {Record<string, string>}
     */
    function buildCopilotTokenExchangeHeaders(oauthToken, mode = 'off') {
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${oauthToken}`,
            'User-Agent': COPILOT_TOKEN_USER_AGENT,
        };
        if (shouldUseNodelessTokenHeaders(mode)) return headers;
        return {
            ...headers,
            'Editor-Version': `vscode/${VSCODE_VERSION}`,
            'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
            'X-GitHub-Api-Version': GITHUB_TOKEN_API_VERSION,
        };
    }

    /**
     * Build the static Copilot emulation headers.
     * Dynamic per-request headers (machine-id, session-id, interaction-id, etc.)
     * are NOT included here — they are set by the caller.
     *
     * `nodeless-2` uses the old minimal request-header profile so users can test
     * restrictive node-less hosts without changing the global/default behavior.
     *
     * @param {string | null | undefined} [mode='off']
     * @returns {Record<string, string>}
     */
    function getCopilotStaticHeaders(mode = 'off') {
        if (shouldUseLegacyCopilotRequestHeaders(mode)) {
            return {
                'Copilot-Integration-Id': 'vscode-chat',
            };
        }
        return {
            'Copilot-Integration-Id': 'vscode-chat',
            'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
            'Editor-Version': `vscode/${VSCODE_VERSION}`,
            'User-Agent': `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
            'X-Github-Api-Version': GITHUB_API_VERSION,
            'X-Initiator': 'user',
            'X-Interaction-Type': 'conversation-panel',
            'X-Vscode-User-Agent-Library-Version': 'electron-fetch',
        };
    }

    // @ts-check
    /**
     * copilot-token.js — GitHub Copilot API token management.
     * Handles OAuth → API token exchange with caching and single-flight dedup.
     * Uses dependency injection for safeGetArg and fetch to enable testing.
     */

    /** Negative cache duration (ms) — prevents rapid-fire retries after failure */
    const _NEGATIVE_CACHE_MS = 60000;

    let _copilotTokenCache = { token: '', expiry: 0 };
    let _copilotTokenPromise = /** @type {Promise<string> | null} */ (null);

    /** Injected dependencies */
    let _getArgFn = /** @type {Function | null} */ (null);
    let _fetchFn = /** @type {Function | null} */ (null);

    /**
     * Set the safeGetArg dependency for reading stored arguments.
     * @param {function} fn - async (key) => string
     */
    function setCopilotGetArgFn(fn) {
        _getArgFn = typeof fn === 'function' ? fn : null;
    }

    /**
     * Set the fetch dependency for HTTP requests.
     * @param {function} fn - (url, options) => Promise<Response>
     */
    function setCopilotFetchFn(fn) {
        _fetchFn = typeof fn === 'function' ? fn : null;
    }

    /**
     * Ensure a valid Copilot API token is available.
     * Returns cached token if still valid, otherwise exchanges GitHub OAuth token.
     * Single-flight: prevents parallel duplicate token exchange requests.
     * @returns {Promise<string>} API token or empty string on failure
     */
    async function ensureCopilotApiToken() {
        // Negative cache: if a recent exchange failed, don't retry until expiry
        if (!_copilotTokenCache.token && _copilotTokenCache.expiry > 0 && Date.now() < _copilotTokenCache.expiry) {
            return '';
        }

        // Return cached token if still valid (with 60s safety margin)
        if (_copilotTokenCache.token && Date.now() < _copilotTokenCache.expiry - 60000) {
            return _copilotTokenCache.token;
        }

        // Single-flight dedup
        if (_copilotTokenPromise) {
            try { return await _copilotTokenPromise; }
            catch (_) { return ''; }
        }

        if (!_getArgFn) {
            console.warn('[Cupcake PM] Copilot: No getArg function configured.');
            return '';
        }
        const fetchFn = _fetchFn || globalThis.fetch;

        _copilotTokenPromise = (async () => {
            const githubToken = await _getArgFn('tools_githubCopilotToken');
            const nodelessMode = normalizeCopilotNodelessMode(await _getArgFn('cpm_copilot_nodeless_mode'));
            if (!githubToken) {
                console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
                return '';
            }

            const cleanToken = githubToken.replace(/[^\x20-\x7E]/g, '').trim();
            if (!cleanToken) return '';

            console.log('[Cupcake PM] Copilot: Exchanging OAuth token for API token...');
            const res = await fetchFn('https://api.github.com/copilot_internal/v2/token', {
                method: 'GET',
                headers: buildCopilotTokenExchangeHeaders(cleanToken, nodelessMode),
            });

            if (!res.ok) {
                console.error(`[Cupcake PM] Copilot token exchange failed (${res.status}): ${await res.text()}`);
                // Negative cache: avoid retrying the same failed exchange for 60s
                _copilotTokenCache = { token: '', expiry: Date.now() + _NEGATIVE_CACHE_MS };
                return '';
            }

            const data = await res.json();
            if (data.token) {
                // Standard flow: received TID token
                const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
                _copilotTokenCache = { token: data.token, expiry: expiryMs };

                if (typeof window !== 'undefined') {
                    /** @type {any} */ (window)._cpmCopilotApiToken = data.token;
                    // Preserve dynamic API base URL from endpoints.api if present
                    if (data.endpoints?.api) {
                        /** @type {any} */ (window)._cpmCopilotApiBase = data.endpoints.api.replace(/\/$/, '');
                        console.log('[Cupcake PM] Copilot: dynamic API base:', /** @type {any} */ (window)._cpmCopilotApiBase);
                    }
                }
                console.log('[Cupcake PM] Copilot: API token obtained, expires in', Math.round((expiryMs - Date.now()) / 60000), 'min');
                return data.token;
            }

            // New API format: token response is a model list (data.data array) → use OAuth token directly
            if (Array.isArray(data.data)) {
                console.log(`[Cupcake PM] Copilot: Token response is model list (${data.data.length} models) — using OAuth token directly`);
                const expiryMs = Date.now() + 1800000; // 30 min TTL
                _copilotTokenCache = { token: cleanToken, expiry: expiryMs };
                if (typeof window !== 'undefined') /** @type {any} */ (window)._cpmCopilotApiToken = cleanToken;
                return cleanToken;
            }

            console.error('[Cupcake PM] Copilot token exchange returned no token');
            // Negative cache: avoid retrying the same failed exchange for 60s
            _copilotTokenCache = { token: '', expiry: Date.now() + _NEGATIVE_CACHE_MS };
            return '';
        })();

        try {
            return await _copilotTokenPromise;
        } catch (e) {
            console.error('[Cupcake PM] Copilot token exchange error:', /** @type {Error} */ (e).message);
            return '';
        } finally {
            _copilotTokenPromise = null;
        }
    }

    /**
     * Clear the cached token (for testing or logout).
     */
    function clearCopilotTokenCache() {
        _copilotTokenCache = { token: '', expiry: 0 };
        _copilotTokenPromise = null;
    }

    // @ts-check
    /**
     * smart-fetch.js — 3-strategy fetch wrapper for V3 iframe sandbox.
     *
     * Strategy 1: Direct fetch()
     * Strategy 2: risuFetch (host window, plainFetchForce)
     * Strategy 3: nativeFetch (proxy fallback)
     *
     * Dependency: sanitizeBodyJSON from sanitize.js, Risu from shared-state.js
     */
    // checkStreamCapability removed — compat mode is manual-toggle only now

    /**
     * Smart native fetch: 3-strategy fallback for V3 iframe sandbox.
     * @param {string} url
     * @param {RequestInit} options
     * @returns {Promise<Response>}
     */

    /**
     * Race a fetch-like promise against an AbortSignal.
     * When the V3 bridge cannot serialize AbortSignal (DataCloneError), we strip
     * the signal from the outgoing request but still need the caller to see
     * AbortError when the user cancels. This helper monitors the original signal
     * and rejects with AbortError if it fires before the fetch resolves.
     *
     * Limitation: the underlying HTTP request on the host side continues
     * (V3 bridge cannot relay abort in the guest→host direction).
     *
     * @template T
     * @param {Promise<T>} fetchPromise - The in-flight fetch (already started without signal)
     * @param {AbortSignal} signal - The original signal to monitor
     * @returns {Promise<T>}
     */
    function _raceWithAbortSignal(fetchPromise, signal) {
        if (!signal) return fetchPromise;
        if (signal.aborted) {
            return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const onAbort = () => {
                if (!settled) {
                    settled = true;
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                }
            };
            signal.addEventListener('abort', onAbort, { once: true });
            fetchPromise.then(
                (result) => {
                    if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); resolve(result); }
                },
                (error) => {
                    if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); reject(error); }
                }
            );
        });
    }

    /**
     * Check if an error is an AbortError (user cancellation).
     * AbortErrors must propagate through all strategy catch blocks.
     * @param {*} e
     * @returns {boolean}
     */
    function _isAbortError(e) {
        if (!e) return false;
        if (e.name === 'AbortError') return true;
        if (e instanceof DOMException && e.code === 20) return true;
        return false;
    }

    /** Cached compatibility mode flag — null = not yet read, boolean = cached value */
    /** @type {boolean | null} */
    let _compatibilityModeCache = null;

    /**
     * Reset cached compatibility mode state (for testing).
     */
    function _resetCompatibilityCache() {
        _compatibilityModeCache = null;
    }

    /**
     * Check if compatibility mode is active (manual user toggle only).
     * Result is cached for the lifetime of the plugin.
     * @returns {Promise<boolean>}
     */
    async function _isCompatibilityMode() {
        if (_compatibilityModeCache === null) {
            _compatibilityModeCache = await safeGetBoolArg('cpm_compatibility_mode', false);
        }
        return _compatibilityModeCache;
    }

    /**
     * @param {string} url
     * @param {RequestInit & Record<string, any>} [options]
     * @returns {Promise<Response>}
     */
    async function smartNativeFetch(url, options = {}) {
        // Early abort check — avoid unnecessary work if already cancelled
        if (options.signal && options.signal.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }

        // Final body sanitization before any network call
        if (options.method === 'POST' && typeof options.body === 'string') {
            try {
                options = { ...options, body: sanitizeBodyJSON(options.body) };
            } catch (e) {
                console.error('[CupcakePM] smartNativeFetch: body re-sanitization failed:', /** @type {Error} */ (e).message);
            }
        }

        const _isCopilotUrl = url.includes('githubcopilot.com') || url.includes('copilot_internal');
        const _isGoogleApiUrl = url.includes('generativelanguage.googleapis.com') || url.includes('aiplatform.googleapis.com') || url.includes('oauth2.googleapis.com');
        // Copilot URLs always skip direct browser fetch (CSP blocks it in iframe sandbox).
        // Google URLs skip only for non-GET (POST/SSE) where nativeFetch is more stable.
        const _preferNativeFirst = (_isGoogleApiUrl && (options.method || 'POST') !== 'GET') || _isCopilotUrl;

        // ─── Compatibility Mode: skip nativeFetch entirely ───
        const _compatMode = await _isCompatibilityMode();
        if (_compatMode) {
            console.log(`[CupcakePM] Compatibility mode active — skipping nativeFetch for ${url.substring(0, 60)}`);
        }

        // Best-effort AbortSignal propagation across V3 bridge.
        // V3 factory.ts only handles AbortSignal in the host→guest direction
        // (ABORT_SIGNAL_REF). The guest→host direction (plugin calling nativeFetch)
        // cannot serialize AbortSignal via postMessage. When this DataCloneError
        // occurs, we strip the signal but race the request against the original
        // signal so callers still see AbortError on cancellation.
        const callNativeFetchWithAbortFallback = async (/** @type {string} */ _url, /** @type {any} */ _options) => {
            if (_options?.signal?.aborted) {
                throw new DOMException('The operation was aborted.', 'AbortError');
            }
            try {
                return await Risu.nativeFetch(_url, _options);
            } catch (_err) {
                const _msg = String(/** @type {any} */ (_err)?.message || _err || '');
                const _hasSignal = !!(_options && _options.signal);
                const _cloneIssue = /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_msg);
                if (_hasSignal && _cloneIssue) {
                    const _signal = _options.signal;
                    const _retry = { ..._options };
                    delete _retry.signal;
                    console.warn('[CupcakePM] nativeFetch signal bridge failed; retrying without signal (abort monitored locally):', _msg);
                    return await _raceWithAbortSignal(Risu.nativeFetch(_url, _retry), _signal);
                }
                throw _err;
            }
        };

        // Strategy 1: Direct browser fetch from iframe
        // For Google/Vertex and Copilot POST/SSE requests, skip direct fetch and try native/proxy first.
        if (!_preferNativeFirst) {
            try {
                const res = await fetch(url, options);
                return res;
            } catch (e) {
                if (_isAbortError(e)) throw e;
                console.log(`[CupcakePM] Direct fetch failed for ${url.substring(0, 60)}...: ${/** @type {Error} */ (e).message}`);
            }
        }

        // ─── Google / Vertex: nativeFetch first for POST/SSE stability ───
        // Skipped in compatibility mode — nativeFetch returns Response(ReadableStream) which
        // fails to transfer across the V3 iframe bridge on Safari < 16.4.
        if (!_compatMode && _isGoogleApiUrl && (options.method || 'POST') !== 'GET' && Risu && typeof Risu.nativeFetch === 'function') {
            try {
                const nfOptions = { ...options };
                if (typeof nfOptions.body === 'string') {
                    nfOptions.body = new TextEncoder().encode(nfOptions.body);
                }
                const nfRes = await callNativeFetchWithAbortFallback(url, nfOptions);
                if (nfRes && (nfRes.ok || (nfRes.status && nfRes.status !== 0))) {
                    console.log(`[CupcakePM] Google/Vertex nativeFetch succeeded: status=${nfRes.status} for ${url.substring(0, 60)}`);
                    return nfRes;
                }
                console.log(`[CupcakePM] Google/Vertex nativeFetch returned unusable response, trying fallbacks: status=${nfRes?.status || 'unknown'}`);
            } catch (e) {
                if (_isAbortError(e)) throw e;
                console.log(`[CupcakePM] Google/Vertex nativeFetch error: ${/** @type {Error} */ (e).message}`);
            }
        }

        // ─── Copilot-specific: nativeFetch first (GET token exchange + POST/SSE chat) ───
        // Unlike Google, Copilot MUST NOT skip nativeFetch in compatibility mode.
        // Copilot API does not support CORS, and the /proxy2 endpoint requires
        // RisuAI JWT auth that plugins don't have. nativeFetch (host-side fetch)
        // is the ONLY viable path for Copilot. If ReadableStream transfer fails
        // in compat mode, the response will be caught by error handling below.
        if (_isCopilotUrl && Risu && typeof Risu.nativeFetch === 'function') {
            try {
                const nfOptions = { ...options };
                if (typeof nfOptions.body === 'string') {
                    nfOptions.body = new TextEncoder().encode(nfOptions.body);
                }
                const nfRes = await callNativeFetchWithAbortFallback(url, nfOptions);
                if (nfRes && nfRes.ok) {
                    console.log(`[CupcakePM] Copilot nativeFetch succeeded: status=${nfRes.status} for ${url.substring(0, 60)}`);
                    return nfRes;
                }
                if (nfRes && nfRes.status && nfRes.status !== 0) {
                    if ((options.method || 'POST') !== 'GET') {
                        console.warn(`[CupcakePM] Copilot nativeFetch returned HTTP ${nfRes.status}; returning as-is to avoid duplicate replay.`);
                        return nfRes;
                    }
                    if (nfRes.status >= 400 && nfRes.status < 500) {
                        console.warn(`[CupcakePM] Copilot nativeFetch returned client error ${nfRes.status}; returning as-is.`);
                        return nfRes;
                    }
                    console.warn(`[CupcakePM] Copilot nativeFetch returned server error ${nfRes.status}; trying fallback route.`);
                } else {
                    console.log(`[CupcakePM] Copilot nativeFetch returned unusable response, trying proxy fallback: status=${nfRes?.status || 'unknown'}`);
                }
            } catch (e) {
                if (_isAbortError(e)) throw e;
                console.log(`[CupcakePM] Copilot nativeFetch error: ${/** @type {Error} */ (e).message}`);
            }
        }

        // ─── Copilot risuFetch (plainFetchDeforce) ───
        if (_isCopilotUrl && Risu && typeof Risu.risuFetch === 'function') {
            const copilotResult = await _tryCopilotRisuFetch(url, options, 'plainFetchDeforce');
            if (copilotResult) return copilotResult;

            // Last resort: plainFetchForce for Copilot
            const copilotForceResult = await _tryCopilotRisuFetch(url, options, 'plainFetchForce');
            if (copilotForceResult) return copilotForceResult;
        }

        // ─── Strategy 2: risuFetch with plainFetchForce (non-Copilot) ───
        const _contentType = (options.headers && (
            /** @type {any} */ (options.headers)['Content-Type'] || /** @type {any} */ (options.headers)['content-type'] ||
            (typeof /** @type {any} */ (options.headers).get === 'function' ? /** @type {any} */ (options.headers).get('content-type') : '')
        )) || '';
        const _isJsonBody = !_contentType || _contentType.includes('application/json');

        if (!_isCopilotUrl && _isJsonBody && Risu && typeof Risu.risuFetch === 'function') {
            try {
                let bodyObj = _parseBodyForRisuFetch(options.body);
                if (bodyObj === undefined && options.body) {
                    throw new Error('Body JSON parse failed — cannot safely pass to risuFetch');
                }

                // Deep-sanitize body object before it crosses the postMessage bridge
                if (bodyObj && typeof bodyObj === 'object') {
                    bodyObj = _deepSanitizeBody(bodyObj);
                }

                // Final IPC safety: ensure bodyObj is serializable
                if (bodyObj && typeof bodyObj === 'object') {
                    try {
                        bodyObj = JSON.parse(JSON.stringify(bodyObj));
                    } catch (serErr) {
                        console.warn('[CupcakePM] bodyObj JSON round-trip failed, stripping non-serializable keys:', /** @type {Error} */ (serErr).message);
                        try { bodyObj = _stripNonSerializable(bodyObj, 0); } catch (_) { }
                    }
                }

                let result;
                try {
                    result = await Risu.risuFetch(url, {
                        method: options.method || 'POST',
                        headers: options.headers || {},
                        body: bodyObj,
                        rawResponse: true,
                        plainFetchForce: true,
                        abortSignal: options.signal,
                    });
                } catch (_rfErr) {
                    const _rfMsg = String(/** @type {any} */ (_rfErr)?.message || _rfErr || '');
                    if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                        console.warn('[CupcakePM] risuFetch signal clone failed; retrying without signal (abort monitored locally):', _rfMsg);
                        result = await _raceWithAbortSignal(
                            Risu.risuFetch(url, {
                                method: options.method || 'POST',
                                headers: options.headers || {},
                                body: bodyObj,
                                rawResponse: true,
                                plainFetchForce: true,
                            }),
                            options.signal
                        );
                    } else {
                        throw _rfErr;
                    }
                }

                const responseBody = _extractResponseBody(result);
                if (responseBody) {
                    console.log(`[CupcakePM] risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                    return new Response(/** @type {any} */ (responseBody), {
                        status: result.status || 200,
                        headers: new Headers(result.headers || {}),
                    });
                }
                const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
                console.log(`[CupcakePM] risuFetch not a real response: ${errPreview}`);
            } catch (e) {
                if (_isAbortError(e)) throw e;
                console.log(`[CupcakePM] risuFetch error: ${/** @type {Error} */ (e).message}`);
            }
        }

        // ─── Strategy 3 (fallback): nativeFetch — proxy-based fetch ───
        // In compatibility mode, skip this too — risuFetch should have already succeeded.
        // nativeFetch returns Response(ReadableStream) which may fail on Safari < 16.4.
        if (!_compatMode) {
            try {
                console.log(`[CupcakePM] Falling back to nativeFetch (proxy) for ${url.substring(0, 60)}...`);
                const nfOptions = { ...options };
                if (typeof nfOptions.body === 'string') {
                    nfOptions.body = new TextEncoder().encode(nfOptions.body);
                }
                const res = await callNativeFetchWithAbortFallback(url, nfOptions);
                return res;
            } catch (e) {
                if (_isAbortError(e)) throw e;
                console.error(`[CupcakePM] nativeFetch also failed: ${/** @type {Error} */ (e).message}`);
            }
        }

        throw new Error(`[CupcakePM] All fetch strategies failed for ${url.substring(0, 60)}`);
    }

    // ─── Internal helpers ───

    /**
     * @param {any} body
     * @returns {any}
     */
    function _parseBodyForRisuFetch(body) {
        if (!body) return undefined;
        if (typeof body === 'string') {
            try { return JSON.parse(body); } catch {
                console.error('[CupcakePM] risuFetch: body JSON.parse failed, skipping risuFetch path');
                return undefined;
            }
        }
        return body;
    }

    /**
     * @param {any} bodyObj
     * @returns {any}
     */
    function _deepSanitizeBody(bodyObj) {
        if (Array.isArray(bodyObj.messages)) {
            try {
                const rawMsgs = JSON.parse(JSON.stringify(bodyObj.messages));
                bodyObj.messages = [];
                for (let _ri = 0; _ri < rawMsgs.length; _ri++) {
                    const _rm = rawMsgs[_ri];
                    if (_rm == null || typeof _rm !== 'object') continue;
                    if (typeof _rm.role !== 'string' || !_rm.role) continue;
                    if (_rm.content === null || _rm.content === undefined) continue;
                    /** @type {Record<string, any>} */
                    const safeMsg = { role: _rm.role, content: _rm.content };
                    if (_rm.name && typeof _rm.name === 'string') safeMsg.name = _rm.name;
                    // Preserve tool-calling properties required by OpenAI/Anthropic tool-use flows
                    if (_rm.tool_calls) safeMsg.tool_calls = _rm.tool_calls;
                    if (_rm.tool_call_id) safeMsg.tool_call_id = _rm.tool_call_id;
                    if (_rm.function_call) safeMsg.function_call = _rm.function_call;
                    if (_rm.refusal) safeMsg.refusal = _rm.refusal;
                    bodyObj.messages.push(safeMsg);
                }
            } catch (_e) {
                console.error('[CupcakePM] Deep reconstruct of messages failed:', /** @type {Error} */ (_e).message);
                bodyObj.messages = bodyObj.messages.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
            }
        }
        if (Array.isArray(bodyObj.contents)) {
            try { bodyObj.contents = JSON.parse(JSON.stringify(bodyObj.contents)); } catch (_) { }
            bodyObj.contents = bodyObj.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
        }
        return bodyObj;
    }

    /**
     * @param {any} obj
     * @param {number} depth
     * @returns {any}
     */
    function _stripNonSerializable(obj, depth) {
        if (depth > 15) return undefined;
        if (obj === null || obj === undefined) return obj;
        const t = typeof obj;
        if (t === 'string' || t === 'number' || t === 'boolean') return obj;
        if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
        if (Array.isArray(obj)) return obj.map(v => _stripNonSerializable(v, depth + 1)).filter(v => v !== undefined);
        if (t === 'object') {
            /** @type {Record<string, any>} */
            const out = {};
            for (const k of Object.keys(obj)) {
                try { const v = _stripNonSerializable(obj[k], depth + 1); if (v !== undefined) out[k] = v; } catch (_) { }
            }
            return out;
        }
        return undefined;
    }

    /**
     * @param {any} result
     * @returns {Uint8Array | null}
     */
    function _extractResponseBody(result) {
        if (!result || result.data == null) return null;
        if (result.data instanceof Uint8Array) return result.data;
        if (ArrayBuffer.isView(result.data) || result.data instanceof ArrayBuffer) {
            return new Uint8Array(result.data instanceof ArrayBuffer ? result.data : result.data.buffer);
        }
        if (Array.isArray(result.data)) return new Uint8Array(result.data);
        if (typeof result.data === 'object' && !(result.data instanceof Blob)) {
            const _len = typeof result.data.length === 'number'
                ? result.data.length
                : typeof result.data.byteLength === 'number'
                    ? result.data.byteLength
                    : (() => { const keys = Object.keys(result.data).filter(k => /^\d+$/.test(k)); return keys.length > 0 ? Math.max(...keys.map(Number)) + 1 : 0; })();
            if (_len > 0) {
                try {
                    const arr = new Uint8Array(_len);
                    for (let i = 0; i < _len; i++) arr[i] = result.data[i] || 0;
                    return arr;
                } catch (_) { return null; }
            }
        }
        if (typeof result.data === 'string' && result.status && result.status !== 0) {
            return new TextEncoder().encode(result.data);
        }
        return null;
    }

    /**
     * @param {string} url
     * @param {RequestInit & Record<string, any>} options
     * @param {string} mode
     * @returns {Promise<Response | null>}
     */
    async function _tryCopilotRisuFetch(url, options, mode) {
        try {
            const bodyObj = _parseBodyForRisuFetch(options.body);
            if (bodyObj === undefined && options.body) {
                throw new Error('Body JSON parse failed — cannot safely pass to risuFetch');
            }

            /** @type {Record<string, any>} */
            const fetchOpts = {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: bodyObj,
                rawResponse: true,
                abortSignal: options.signal,
            };
            if (mode === 'plainFetchDeforce') fetchOpts.plainFetchDeforce = true;
            else fetchOpts.plainFetchForce = true;

            let result;
            try {
                result = await Risu.risuFetch(url, fetchOpts);
            } catch (_rfErr) {
                const _rfMsg = String(/** @type {any} */ (_rfErr)?.message || _rfErr || '');
                if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                    console.warn(`[CupcakePM] Copilot risuFetch(${mode}) signal clone failed; retrying without signal (abort monitored locally)`);
                    const _signal = options.signal;
                    delete fetchOpts.abortSignal;
                    result = await _raceWithAbortSignal(Risu.risuFetch(url, fetchOpts), _signal);
                } else {
                    throw _rfErr;
                }
            }

            const responseBody = _extractResponseBody(result);
            if (responseBody) {
                if (result.status === 524) {
                    // In compatibility mode, block the retry to prevent duplicate requests on iPhone/Safari
                    const _compatActive = await _isCompatibilityMode();
                    if (_compatActive) {
                        console.warn(`[CupcakePM] Copilot ${mode} risuFetch returned 524 — compatibility mode blocks retry to prevent duplicate requests.`);
                        return new Response(
                            JSON.stringify({ error: { message: 'Copilot proxy returned 524 — retry blocked by compatibility mode to prevent duplicate requests', type: 'compat_524_blocked' } }),
                            { status: 524, headers: new Headers({ 'Content-Type': 'application/json' }) }
                        );
                    }
                    console.warn(`[CupcakePM] Copilot ${mode} risuFetch returned 524 for ${url.substring(0, 60)}; falling back.`);
                    return null;
                }
                // ─── Detect Node server proxy auth errors ───
                // On Node-hosted RisuAI, the /proxy2 endpoint requires JWT auth
                // (risu-auth header). When plainFetchDeforce routes through
                // fetchWithProxy but the auth is missing/invalid, the proxy returns
                // its own 400 error — NOT from the target API. Detect this and fall
                // through to plainFetchForce (direct fetch) instead.
                if (result.status === 400 && mode === 'plainFetchDeforce') {
                    try {
                        const _proxyErrText = new TextDecoder().decode(responseBody);
                        const _proxyErrObj = JSON.parse(_proxyErrText);
                        const _knownProxyErrors = ['No auth header', 'Password Incorrect', 'Token Expired', 'Unknown Public Key', 'Invalid Signature'];
                        if (_proxyErrObj?.error && _knownProxyErrors.some(e => String(_proxyErrObj.error).includes(e))) {
                            console.warn(`[CupcakePM] Copilot ${mode} risuFetch got proxy auth error: "${_proxyErrObj.error}" — falling through to plainFetchForce`);
                            return null;
                        }
                    } catch (_) { /* not a proxy error JSON — continue normally */ }
                }
                console.log(`[CupcakePM] Copilot ${mode} risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                return new Response(/** @type {any} */ (responseBody), {
                    status: result.status || 200,
                    headers: new Headers(result.headers || {}),
                });
            }

            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] Copilot ${mode} risuFetch not a real response: ${errPreview}`);
        } catch (e) {
            if (_isAbortError(e)) throw e;
            console.log(`[CupcakePM] Copilot ${mode} risuFetch error: ${/** @type {Error} */ (e).message}`);
        }
        return null;
    }

    // @ts-check
    /**
     * csp-exec.js — CSP-safe code execution (replaces eval() in V3 iframe sandbox).
     * Uses <script> tag injection with nonce for sub-plugin execution.
     */

    /**
     * Extract CSP nonce from existing scripts or meta tag.
     */
    function _extractNonce() {
        for (const s of document.querySelectorAll('script')) {
            if (s.nonce) return s.nonce;
        }
        const meta = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
        if (meta) {
            const m = meta.content.match(/'nonce-([^']+)'/);
            if (m) return m[1];
        }
        return '';
    }

    /**
     * Execute JavaScript code via a <script> tag with CSP nonce.
     * @param {string} code - The JavaScript source to execute.
     * @param {string} pluginName - Human-readable name for logging.
     * @returns {Promise<void>}
     */
    function _executeViaScriptTag(code, pluginName) {
        return new Promise((resolve, reject) => {
            const nonce = _extractNonce();
            if (!nonce) {
                console.error('[CPM CSP] No nonce found — script execution will likely be blocked');
            }

            const cbId = '_cpm_cb_' + (typeof safeUUID === 'function'
                ? safeUUID().replace(/-/g, '')
                : Math.random().toString(36).slice(2));
            const safeName = JSON.stringify(pluginName || 'unknown');
            let scriptEl = /** @type {HTMLScriptElement | null} */ (null);

            const timeout = setTimeout(() => {
                if (/** @type {any} */ (window)[cbId]) {
                    delete /** @type {any} */ (window)[cbId];
                    try { if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl); } catch (_) {}
                    reject(new Error(`Plugin ${pluginName} script timed out (CSP block?)`));
                }
            }, 10000);

            /** @type {any} */ (window)[cbId] = (/** @type {any} */ err) => {
                clearTimeout(timeout);
                delete /** @type {any} */ (window)[cbId];
                try { if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl); } catch (_) {}
                if (err) reject(err);
                else resolve();
            };

            const wrapped = `(async () => {\ntry {\n${code}\nwindow['${cbId}']();\n} catch(err) {\nconsole.error('[CPM Loader] Error executing plugin ' + ${safeName} + ':', err);\nwindow['${cbId}'](err);\n}\n})();`;
            scriptEl = document.createElement('script');
            if (nonce) scriptEl.nonce = nonce;
            scriptEl.dataset.cpmPlugin = pluginName || 'unknown';
            scriptEl.textContent = wrapped;
            document.head.appendChild(scriptEl);
        });
    }

    // @ts-check
    /**
     * schema.js — Lightweight structural schema validation for parsed JSON.
     *
     * No external dependencies. Validates shapes of objects/arrays coming
     * from pluginStorage, remote update bundles, and backup restore paths.
     *
     * Usage:
     *   import { validateSchema, schemas } from './schema.js';
     *   const result = validateSchema(data, schemas.subPluginRegistry);
     *   if (!result.ok) { console.error(result.error); data = result.fallback; }
     */

    /**
     * @typedef {{ ok: true, data: any, error?: undefined, fallback?: undefined }} ValidationSuccess
     */

    /**
     * @typedef {{ ok: false, error: string, fallback: any, data?: undefined }} ValidationFailure
     */

    /**
     * @typedef {ValidationSuccess | ValidationFailure} ValidationResult
     */

    /**
     * @typedef {Object} SchemaRule
     * @property {'array'|'object'|'string'|'number'|'boolean'} type
     * @property {any} [fallback]          - value to use on validation failure
     * @property {Object<string, SchemaRule>} [properties] - for object type
     * @property {SchemaRule} [items]      - for array items
     * @property {string[]} [required]     - required keys for object type
     * @property {number} [maxItems]       - max array length (soft truncate)
     * @property {number} [maxLength]      - max string length
     */

    /**
     * Validate `data` against a schema rule. Returns { ok, data/error, fallback }.
     * @param {any} data
     * @param {SchemaRule} schema
     * @returns {ValidationResult}
     */
    function validateSchema(data, schema) {
        if (data === null || data === undefined) {
            return { ok: false, error: 'Data is null/undefined', fallback: schema.fallback };
        }

        // Type check
        if (schema.type === 'array') {
            if (!Array.isArray(data)) {
                return { ok: false, error: `Expected array, got ${typeof data}`, fallback: schema.fallback ?? [] };
            }
            // maxItems soft truncation
            if (schema.maxItems && data.length > schema.maxItems) {
                data = data.slice(0, schema.maxItems);
            }
            // Validate each item if items schema exists
            if (schema.items) {
                const validItems = [];
                for (let i = 0; i < data.length; i++) {
                    const itemResult = validateSchema(data[i], schema.items);
                    if (itemResult.ok) {
                        validItems.push(itemResult.data);
                    }
                    // Skip invalid items silently (filter instead of fail)
                }
                return { ok: true, data: validItems };
            }
            return { ok: true, data };
        }

        if (schema.type === 'object') {
            if (typeof data !== 'object' || Array.isArray(data)) {
                return { ok: false, error: `Expected object, got ${Array.isArray(data) ? 'array' : typeof data}`, fallback: schema.fallback ?? {} };
            }
            // Required keys
            if (schema.required) {
                for (const key of schema.required) {
                    if (!(key in data) || data[key] === undefined) {
                        return { ok: false, error: `Missing required key: ${key}`, fallback: schema.fallback ?? {} };
                    }
                }
            }
            // Validate known properties
            if (schema.properties) {
                const out = { ...data };
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    if (key in out) {
                        const propResult = validateSchema(out[key], propSchema);
                        if (!propResult.ok) {
                            // Use property-level fallback
                            out[key] = propResult.fallback;
                        } else {
                            out[key] = propResult.data;
                        }
                    }
                }
                return { ok: true, data: out };
            }
            return { ok: true, data };
        }

        if (schema.type === 'string') {
            if (typeof data !== 'string') {
                return { ok: false, error: `Expected string, got ${typeof data}`, fallback: schema.fallback ?? '' };
            }
            if (schema.maxLength && data.length > schema.maxLength) {
                data = data.substring(0, schema.maxLength);
            }
            return { ok: true, data };
        }

        if (schema.type === 'number') {
            if (typeof data !== 'number' || !isFinite(data)) {
                return { ok: false, error: `Expected finite number, got ${data}`, fallback: schema.fallback ?? 0 };
            }
            return { ok: true, data };
        }

        if (schema.type === 'boolean') {
            if (typeof data !== 'boolean') {
                return { ok: false, error: `Expected boolean, got ${typeof data}`, fallback: schema.fallback ?? false };
            }
            return { ok: true, data };
        }

        return { ok: true, data };
    }

    /**
     * Convenience: parse JSON string + validate in one step.
     * @param {string} jsonString
     * @param {SchemaRule} schema
     * @returns {ValidationResult}
     */
    function parseAndValidate(jsonString, schema) {
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            return { ok: false, error: `JSON parse failed: ${/** @type {Error} */ (e).message}`, fallback: schema.fallback };
        }
        return validateSchema(parsed, schema);
    }


    // ════════════════════════════════════════════════════════════════
    // Pre-defined schemas for CPM data structures
    // ════════════════════════════════════════════════════════════════

    /** @type {SchemaRule} Sub-plugin registry entry */
    const subPluginEntry = {
        type: 'object',
        required: ['id', 'code'],
        properties: {
            id:          { type: 'string', fallback: '' },
            name:        { type: 'string', fallback: 'Unnamed Sub-Plugin' },
            version:     { type: 'string', fallback: '' },
            description: { type: 'string', fallback: '' },
            icon:        { type: 'string', fallback: '📦' },
            code:        { type: 'string', fallback: '' },
            enabled:     { type: 'boolean', fallback: true },
            updateUrl:   { type: 'string', fallback: '' },
        },
        fallback: null,
    };

    const schemas = {
        /** Array of installed sub-plugins (pluginStorage) */
        subPluginRegistry: {
            type: /** @type {const} */ ('array'),
            items: subPluginEntry,
            maxItems: 100,
            fallback: [],
        },

        /** update-bundle versions manifest (from remote) */
        updateBundleVersions: {
            type: /** @type {const} */ ('object'),
            fallback: {},
        },

        /** update-bundle top-level structure */
        updateBundle: {
            type: /** @type {const} */ ('object'),
            required: ['versions'],
            properties: {
                versions: { type: /** @type {const} */ ('object'), fallback: {} },
                code:     { type: /** @type {const} */ ('object'), fallback: {} },
            },
            fallback: { versions: {}, code: {} },
        },

        /** Settings backup (key-value map) */
        settingsBackup: {
            type: /** @type {const} */ ('object'),
            fallback: {},
        },

        /** boot-status diagnostic (pluginStorage) */
        bootStatus: {
            type: /** @type {const} */ ('object'),
            properties: {
                ts:      { type: 'number', fallback: 0 },
                version: { type: 'string', fallback: '' },
            },
            fallback: {},
        },
    };

    // @ts-check
    /**
     * settings-backup.js — Persistent settings backup/restore via pluginStorage.
     * Survives plugin deletion — settings can be auto-restored on reinstall.
     */

    const AUX_SETTING_SLOTS = ['translation', 'emotion', 'memory', 'other'];

    function getAuxSettingKeys() {
        return AUX_SETTING_SLOTS.flatMap(s => [
            `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
            `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
            `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
        ]);
    }

    const NON_PREFIX_MANAGED_SETTING_KEYS = [
        'common_openai_servicetier',
        'tools_githubCopilotToken',
        'chat_claude_caching',
        'chat_claude_cachingBreakpoints',
        'chat_claude_cachingMaxExtension',
        'chat_gemini_preserveSystem',
        'chat_gemini_showThoughtsToken',
        'chat_gemini_useThoughtSignature',
        'chat_gemini_usePlainFetch',
        'chat_vertex_preserveSystem',
        'chat_vertex_showThoughtsToken',
        'chat_vertex_useThoughtSignature',
    ];

    const BASE_SETTING_KEYS = [
        'cpm_enable_chat_resizer',
        'cpm_custom_models',
        'cpm_fallback_temp', 'cpm_fallback_max_tokens', 'cpm_fallback_top_p', 'cpm_fallback_freq_pen', 'cpm_fallback_pres_pen',
        'cpm_openai_key', 'cpm_openai_url', 'cpm_openai_model', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier', 'cpm_openai_prompt_cache_retention', 'cpm_dynamic_openai',
        'cpm_anthropic_key', 'cpm_anthropic_url', 'cpm_anthropic_model', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching', 'chat_claude_cachingBreakpoints', 'chat_claude_cachingMaxExtension', 'cpm_anthropic_cache_ttl', 'cpm_dynamic_anthropic',
        'cpm_gemini_key', 'cpm_gemini_model', 'cpm_gemini_thinking_level', 'cpm_gemini_thinking_budget',
        'chat_gemini_preserveSystem', 'chat_gemini_showThoughtsToken', 'chat_gemini_useThoughtSignature', 'chat_gemini_usePlainFetch', 'cpm_dynamic_googleai',
        'cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_model', 'cpm_vertex_thinking_level', 'cpm_vertex_thinking_budget', 'cpm_vertex_claude_thinking_budget', 'cpm_vertex_claude_effort',
        'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature', 'cpm_dynamic_vertexai',
        'cpm_aws_key', 'cpm_aws_secret', 'cpm_aws_region', 'cpm_aws_thinking_budget', 'cpm_aws_thinking_effort', 'cpm_dynamic_aws',
        'cpm_openrouter_key', 'cpm_openrouter_url', 'cpm_openrouter_model', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning', 'cpm_dynamic_openrouter',
        'cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_deepseek_model', 'cpm_dynamic_deepseek',
        'tools_githubCopilotToken',
        'cpm_transcache_display_enabled',
        'cpm_show_token_usage',
        'cpm_streaming_enabled', 'cpm_streaming_show_thinking',
        'cpm_compatibility_mode',
        'cpm_copilot_nodeless_mode',
    ];

    /**
     * @param {any} key
     * @returns {boolean}
     */
    function isManagedSettingKey(key) {
        return typeof key === 'string' && key.length > 0 && (
            key.startsWith('cpm_')
            || key.startsWith('cpm-')
            || NON_PREFIX_MANAGED_SETTING_KEYS.includes(key)
        );
    }

    function getManagedSettingKeys(providerTabs = registeredProviderTabs) {
        const dynamicKeys = Array.isArray(providerTabs)
            ? providerTabs.flatMap(tab => (/** @type {Record<string, any>} */ (tab))?.exportKeys || []).filter(isManagedSettingKey)
            : [];
        return [...new Set([...getAuxSettingKeys(), ...BASE_SETTING_KEYS, ...dynamicKeys])];
    }

    const SettingsBackup = {
        STORAGE_KEY: 'cpm_settings_backup',
        _cache: /** @type {Record<string, any> | null} */ (null),

        getAllKeys() {
            return getManagedSettingKeys();
        },

        async load() {
            try {
                const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
                if (!data) { this._cache = {}; return this._cache; }
                const result = parseAndValidate(data, schemas.settingsBackup);
                if (!result.ok) {
                    console.warn('[CPM Backup] Backup schema validation failed:', result.error);
                    this._cache = result.fallback;
                } else {
                    this._cache = result.data;
                }
            } catch (e) {
                console.error('[CPM Backup] Failed to load backup', e);
                this._cache = {};
            }
            return this._cache;
        },

        async save() {
            try {
                await Risu.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache || {}));
            } catch (e) {
                console.error('[CPM Backup] Failed to save backup', e);
            }
        },

        async updateKey(/** @type {string} */ key, /** @type {any} */ value) {
            if (!this._cache) await this.load();
            if (this._cache) this._cache[key] = value;
            await this.save();
        },

        async snapshotAll() {
            if (!this._cache) this._cache = {};
            const cache = this._cache;
            for (const key of this.getAllKeys()) {
                const val = await safeGetArg(key);
                if (val !== undefined && val !== '') {
                    cache[key] = val;
                }
            }
            await this.save();
            console.log(`[CPM Backup] Snapshot saved (${Object.keys(cache).length} keys)`);
        },

        async restoreIfEmpty() {
            if (!this._cache) await this.load();
            const cache = this._cache;
            if (!cache || Object.keys(cache).length === 0) {
                console.log('[CPM Backup] No backup found, skipping restore.');
                return 0;
            }
            let restoredCount = 0;
            for (const [key, value] of Object.entries(cache)) {
                const current = await safeGetArg(key);
                if ((current === undefined || current === null || current === '') && value !== undefined && value !== '') {
                    Risu.setArgument(key, String(value));
                    restoredCount++;
                }
            }
            if (restoredCount > 0) {
                console.log(`[CPM Backup] Restored ${restoredCount} settings from backup.`);
            }
            return restoredCount;
        }
    };

    // @ts-check
    /**
     * auto-updater.js — Main plugin auto-update logic.
     *
     * Extracted from sub-plugin-manager.js for maintainability.
     * All methods are designed to be spread into SubPluginManager and called
     * with `this` referencing SubPluginManager.
     *
     * Responsibilities:
     *   - Pending update marker persistence (read/write/clear/remember)
     *   - Retriable error classification
     *   - Version check (manifest + JS fallback)
     *   - Download with bundle-first strategy + Content-Length integrity
     *   - Validate & install to RisuAI DB (header parsing, settings preservation)
     *   - Boot retry lifecycle
     *   - Single-bundle sub-plugin update check & apply
     *   - Concurrent dedup via _mainUpdateInFlight
     */

    // ────────────────────────────────────────────────────────────────
    // SHA-256 utility (module-level, not a method)
    // ────────────────────────────────────────────────────────────────

    /**
     * Compute SHA-256 hex digest of a string using Web Crypto API.
     * Falls back gracefully if crypto.subtle is unavailable.
     * @param {string} text
     * @returns {Promise<string>} lowercase hex string, or empty string on failure
     */
    async function _computeSHA256(text) {
        try {
            const data = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) {
            return '';
        }
    }

    /**
     * Race a promise against a timeout and clear the timer once settled.
     * Prevents dangling timer handles during tests and retries.
     * @template T
     * @param {Promise<T>} promise
     * @param {number} ms
     * @param {string} message
     * @returns {Promise<T>}
     */
    function _withTimeout(promise, ms, message) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(message)), ms);
            Promise.resolve(promise).then(
                value => {
                    clearTimeout(timer);
                    resolve(value);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }

    // ────────────────────────────────────────────────────────────────
    // Auto-updater method collection
    // ────────────────────────────────────────────────────────────────

    /**
     * @typedef {Object} SubPluginLike
     * @property {string} id
     * @property {string} name
     * @property {string} [version]
     * @property {string} [code]
     * @property {string} [description]
     * @property {string} [icon]
     * @property {string} [updateUrl]
     * @property {boolean} [enabled]
     */

    /**
     * Represents the full SubPluginManager object after all spreads are merged.
     * Used as `@this` context for auto-updater methods.
     * @typedef {Object} SubPluginManagerCtx
     * @property {SubPluginLike[]} plugins
     * @property {(a: string, b: string) => number} compareVersions
     * @property {(code: string) => {name: string, version: string, description?: string, icon?: string, updateUrl?: string}} extractMetadata
     * @property {() => Promise<void>} saveRegistry
     * @property {(updates: any[]) => Promise<void>} showUpdateToast
     * @property {(local: string, remote: string, changes: string, success: boolean, error?: string) => Promise<void>} _showMainAutoUpdateResult
     * @property {() => Promise<void>} _waitForMainPluginPersistence
     * @property {(remoteVersion: string, changes?: string) => Promise<{ok: boolean, error?: string}>} safeMainPluginUpdate
     * @property {(remoteVersion: string, changes: string) => Promise<void>} _rememberPendingMainUpdate
     * @property {() => Promise<void>} _clearPendingMainUpdate
     * @property {(error: string) => boolean} _isRetriableMainUpdateError
     * @property {() => Promise<string>} _getInstalledMainPluginVersion
     * @property {(data: any) => Promise<void>} _writePendingMainUpdate
     * @property {() => Promise<any>} _readPendingMainUpdate
     * @property {(expectedVersion?: string) => Promise<{ok: boolean, code?: string, error?: string}>} _downloadMainPluginCode
     * @property {(code: string, remoteVersion: string, changes?: string) => Promise<{ok: boolean, error?: string}>} _validateAndInstallMainPlugin
     * @property {string} VERSIONS_URL
     * @property {string} MAIN_UPDATE_URL
     * @property {string} UPDATE_BUNDLE_URL
     * @property {number} _VERSION_CHECK_COOLDOWN
     * @property {string} _VERSION_CHECK_STORAGE_KEY
     * @property {string} _MAIN_VERSION_CHECK_STORAGE_KEY
     * @property {string} _MAIN_UPDATE_RETRY_STORAGE_KEY
     * @property {number} _MAIN_UPDATE_RETRY_COOLDOWN
     * @property {number} _MAIN_UPDATE_RETRY_MAX_ATTEMPTS
     * @property {Promise<{ok: boolean, error?: string}>|null} _mainUpdateInFlight
     * @property {string[]} _pendingUpdateNames
     */

    /**
     * Methods to be spread into SubPluginManager.
     * Every method uses `this` which will reference SubPluginManager at call-time.
     * @type {{[K: string]: any}}
     */
    const autoUpdaterMethods = {
        // ── Constants & State ──
        VERSIONS_URL: VERSIONS_URL,
        MAIN_UPDATE_URL: MAIN_UPDATE_URL,
        _VERSION_CHECK_COOLDOWN: 600000,
        _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
        _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
        _MAIN_UPDATE_RETRY_STORAGE_KEY: 'cpm_pending_main_update',
        _MAIN_UPDATE_RETRY_COOLDOWN: 300000,
        _MAIN_UPDATE_RETRY_MAX_ATTEMPTS: 2,
        _mainUpdateInFlight: null,
        _pendingUpdateNames: [],

        // ── Pending update marker persistence ──

        async _readPendingMainUpdate() {
            try {
                const raw = await Risu.pluginStorage.getItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY);
                if (!raw) return null;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (!parsed || typeof parsed !== 'object') {
                    await this._clearPendingMainUpdate();
                    return null;
                }
                const version = String(parsed.version || '').trim();
                if (!version) {
                    await this._clearPendingMainUpdate();
                    return null;
                }
                return {
                    version,
                    changes: typeof parsed.changes === 'string' ? parsed.changes : '',
                    createdAt: Number(parsed.createdAt) || 0,
                    attempts: Number(parsed.attempts) || 0,
                    lastAttemptTs: Number(parsed.lastAttemptTs) || 0,
                    lastError: typeof parsed.lastError === 'string' ? parsed.lastError : '',
                };
            } catch (/** @type {any} */ e) {
                console.warn('[CPM Retry] Failed to read pending main update marker:', e.message || e);
                try { await this._clearPendingMainUpdate(); } catch (_) { }
                return null;
            }
        },

        /** @param {any} data */
        async _writePendingMainUpdate(data) {
            try {
                await Risu.pluginStorage.setItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY, JSON.stringify(data));
            } catch (/** @type {any} */ e) {
                console.warn('[CPM Retry] Failed to write pending main update marker:', e.message || e);
            }
        },

        async _clearPendingMainUpdate() {
            try {
                if (typeof Risu.pluginStorage.removeItem === 'function') {
                    await Risu.pluginStorage.removeItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY);
                } else {
                    await Risu.pluginStorage.setItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY, '');
                }
            } catch (/** @type {any} */ e) {
                console.warn('[CPM Retry] Failed to clear pending main update marker:', e.message || e);
            }
        },

        /**
         * @param {string} remoteVersion
         * @param {string} [changes]
         */
        async _rememberPendingMainUpdate(remoteVersion, changes) {
            const version = String(remoteVersion || '').trim();
            if (!version) return;
            const existing = await this._readPendingMainUpdate();
            const sameVersion = existing && existing.version === version;
            await this._writePendingMainUpdate({
                version,
                changes: typeof changes === 'string' ? changes : (existing?.changes || ''),
                createdAt: sameVersion ? (existing.createdAt || Date.now()) : Date.now(),
                attempts: sameVersion ? (existing.attempts || 0) : 0,
                lastAttemptTs: sameVersion ? (existing.lastAttemptTs || 0) : 0,
                lastError: sameVersion ? (existing.lastError || '') : '',
            });
        },

        // ── Error classification ──

        /** @param {string|Error} error */
        _isRetriableMainUpdateError(error) {
            const msg = String(error || '').toLowerCase();
            if (!msg) return true;
            const nonRetriablePatterns = [
                '이름 불일치',
                '버전 불일치',
                'api 버전이 3.0이 아닙니다',
                '다운그레이드 차단',
                '이미 같은 버전입니다',
                '플러그인을 db에서 찾을 수 없습니다',
                '플러그인 목록을 찾을 수 없습니다',
            ];
            return !nonRetriablePatterns.some(pattern => msg.includes(pattern.toLowerCase()));
        },

        // ── Installed version helper ──

        async _getInstalledMainPluginVersion() {
            try {
                const db = await Risu.getDatabase();
                const plugin = db?.plugins?.find?.((/** @type {any} */ p) => p?.name === 'Cupcake_Provider_Manager');
                return String(plugin?.versionOfPlugin || CPM_VERSION || '').trim();
            } catch (_) {
                return String(CPM_VERSION).trim();
            }
        },

        // ── Boot retry lifecycle ──

        async retryPendingMainPluginUpdateOnBoot() {
            try {
                const pending = await this._readPendingMainUpdate();
                if (!pending) return false;

                const installedVersion = await this._getInstalledMainPluginVersion();
                if (installedVersion && this.compareVersions(installedVersion, pending.version) <= 0) {
                    console.log(`[CPM Retry] Pending main update already satisfied (${installedVersion} >= ${pending.version}). Clearing marker.`);
                    await this._clearPendingMainUpdate();
                    return true;
                }

                if (pending.attempts >= this._MAIN_UPDATE_RETRY_MAX_ATTEMPTS) {
                    console.warn(`[CPM Retry] Pending main update exceeded max attempts (${pending.attempts}/${this._MAIN_UPDATE_RETRY_MAX_ATTEMPTS}). Clearing marker.`);
                    await this._clearPendingMainUpdate();
                    return false;
                }

                const elapsed = Date.now() - (pending.lastAttemptTs || 0);
                if (pending.lastAttemptTs && elapsed < this._MAIN_UPDATE_RETRY_COOLDOWN) {
                    console.log(`[CPM Retry] Pending main update cooldown active (${Math.ceil((this._MAIN_UPDATE_RETRY_COOLDOWN - elapsed) / 1000)}s left).`);
                    return false;
                }

                await this._writePendingMainUpdate({
                    ...pending,
                    attempts: (pending.attempts || 0) + 1,
                    lastAttemptTs: Date.now(),
                    lastError: '',
                });

                console.log(`[CPM Retry] Retrying pending main update on boot: ${installedVersion || 'unknown'} → ${pending.version}`);
                const result = await this.safeMainPluginUpdate(pending.version, pending.changes || '');
                if (!result.ok) {
                    const latest = await this._readPendingMainUpdate();
                    if (latest) {
                        await this._writePendingMainUpdate({
                            ...latest,
                            lastError: String(result.error || ''),
                        });
                    }
                }
                return true;
            } catch (/** @type {any} */ e) {
                console.warn('[CPM Retry] Pending main update retry failed:', e.message || e);
                return false;
            }
        },

        // ── Manifest-based version check ──

        async checkVersionsQuiet() {
            try {
                if (/** @type {any} */ (window)._cpmVersionChecked) return;
                /** @type {any} */ (window)._cpmVersionChecked = true;

                try {
                    const lastCheck = await Risu.pluginStorage.getItem(this._VERSION_CHECK_STORAGE_KEY);
                    if (lastCheck) {
                        const elapsed = Date.now() - parseInt(lastCheck, 10);
                        if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                            console.log(`[CPM AutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago (cooldown: ${this._VERSION_CHECK_COOLDOWN / 60000}min)`);
                            return;
                        }
                    }
                } catch (_) { /* pluginStorage not available */ }

                const cacheBuster = this.VERSIONS_URL + '?_t=' + Date.now();
                console.log(`[CPM AutoCheck] Fetching version manifest...`);

                const fetchPromise = Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Version manifest fetch timed out (15s)')), 15000));
                const result = await Promise.race([fetchPromise, timeoutPromise]);

                if (!result.data || (result.status && result.status >= 400)) {
                    console.warn(`[CPM AutoCheck] Fetch failed (status=${result.status}), silently skipped.`);
                    return;
                }

                const manifest = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
                const manifestResult = validateSchema(manifest, schemas.updateBundleVersions);
                if (!manifestResult.ok) {
                    console.warn(`[CPM AutoCheck] Invalid manifest structure: ${manifestResult.error}`);
                    return;
                }
                if (!manifest || typeof manifest !== 'object') return;

                const updatesAvailable = [];
                for (const p of this.plugins) {
                    if (!p.updateUrl || !p.name) continue;
                    const remote = manifest[p.name];
                    if (!remote || !remote.version) continue;
                    const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                    if (cmp > 0) {
                        updatesAvailable.push({
                            name: p.name, icon: p.icon || '🧩',
                            localVersion: p.version || '0.0.0', remoteVersion: remote.version,
                            changes: remote.changes || '',
                        });
                    }
                }

                let mainUpdateInfo = null;
                const mainRemote = manifest['Cupcake Provider Manager'];
                if (mainRemote && mainRemote.version) {
                    /** @type {any} */ (window)._cpmMainVersionFromManifest = true;
                    const mainCmp = this.compareVersions(CPM_VERSION, mainRemote.version);
                    if (mainCmp > 0) {
                        mainUpdateInfo = {
                            localVersion: CPM_VERSION, remoteVersion: mainRemote.version,
                            changes: mainRemote.changes || '',
                        };
                        console.log(`[CPM AutoCheck] Main plugin update available: ${CPM_VERSION}→${mainRemote.version}`);
                    } else {
                        console.log(`[CPM AutoCheck] Main plugin is up to date (${CPM_VERSION}).`);
                    }
                }

                try {
                    await Risu.pluginStorage.setItem(this._VERSION_CHECK_STORAGE_KEY, String(Date.now()));
                } catch (_) { /* ignore */ }

                if (updatesAvailable.length > 0) {
                    this._pendingUpdateNames = updatesAvailable.map(u => u.name);
                    console.log(`[CPM AutoCheck] ${updatesAvailable.length} update(s) available:`, updatesAvailable.map(u => `${u.name} ${u.localVersion}→${u.remoteVersion}`).join(', '));
                    await this.showUpdateToast(updatesAvailable);
                } else {
                    console.log(`[CPM AutoCheck] All sub-plugins up to date.`);
                }

                if (mainUpdateInfo) {
                    const delay = updatesAvailable.length > 0 ? 1500 : 0;
                    setTimeout(async () => {
                            try { await this._rememberPendingMainUpdate(mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (e) { console.warn('[CPM AutoCheck] _rememberPendingMainUpdate failed:', e); }
                        try { await this.safeMainPluginUpdate(mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (e) { console.warn('[CPM AutoCheck] safeMainPluginUpdate failed:', e); }
                    }, delay);
                }
            } catch (/** @type {any} */ e) {
                console.debug(`[CPM AutoCheck] Silent error:`, e.message || e);
            }
        },

        // ── JS fallback version check ──

        async checkMainPluginVersionQuiet() {
            try {
                if (/** @type {any} */ (window)._cpmMainVersionFromManifest) {
                    console.log('[CPM MainAutoCheck] Already checked via manifest, skipping JS fallback.');
                    return;
                }
                if (/** @type {any} */ (window)._cpmMainVersionChecked) return;
                /** @type {any} */ (window)._cpmMainVersionChecked = true;

                try {
                    const lastCheck = await Risu.pluginStorage.getItem(this._MAIN_VERSION_CHECK_STORAGE_KEY);
                    if (lastCheck) {
                        const elapsed = Date.now() - parseInt(lastCheck, 10);
                        if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                            console.log(`[CPM MainAutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago`);
                            return;
                        }
                    }
                } catch (_) { /* ignore */ }

                const cacheBuster = this.MAIN_UPDATE_URL + '?_t=' + Date.now();
                console.log('[CPM MainAutoCheck] Fallback: fetching remote main plugin script...');

                let code;
                try {
                    const response = await Promise.race([
                        Risu.nativeFetch(cacheBuster, { method: 'GET' }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('nativeFetch timed out (20s)')), 20000)),
                    ]);
                    if (!response.ok || response.status < 200 || response.status >= 300) {
                        console.warn(`[CPM MainAutoCheck] nativeFetch failed (HTTP ${response.status}), skipped.`);
                        return;
                    }
                    code = await Promise.race([
                        response.text(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('nativeFetch body read timed out (20s)')), 20000)),
                    ]);
                    console.log(`[CPM MainAutoCheck] nativeFetch OK (${(code.length / 1024).toFixed(1)}KB)`);
                } catch (/** @type {any} */ nativeErr) {
                    console.warn(`[CPM MainAutoCheck] nativeFetch failed: ${nativeErr.message || nativeErr}, trying risuFetch...`);
                    try {
                        const result = await Promise.race([
                            Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('risuFetch timed out (20s)')), 20000)),
                        ]);
                        if (!result.data || (result.status && result.status >= 400)) {
                            console.warn(`[CPM MainAutoCheck] risuFetch also failed (status=${result.status}), skipped.`);
                            return;
                        }
                        code = typeof result.data === 'string' ? result.data : String(result.data || '');
                        console.log(`[CPM MainAutoCheck] risuFetch OK (${(code.length / 1024).toFixed(1)}KB)`);
                    } catch (/** @type {any} */ risuErr) {
                        console.warn(`[CPM MainAutoCheck] Both fetch methods failed: ${risuErr.message || risuErr}`);
                        return;
                    }
                }
                const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
                if (!verMatch) { console.warn('[CPM MainAutoCheck] Remote version tag not found in fetched code, skipped.'); return; }
                const changesMatch = code.match(/\/\/\s*@changes\s+(.+)/i);
                const changes = changesMatch ? changesMatch[1].trim() : '';

                const remoteVersion = (verMatch[1] || '').trim();
                const localVersion = CPM_VERSION;
                const cmp = this.compareVersions(localVersion, remoteVersion);

                try { await Risu.pluginStorage.setItem(this._MAIN_VERSION_CHECK_STORAGE_KEY, String(Date.now())); } catch (_) { /* ignore */ }

                if (cmp > 0) {
                    console.log(`[CPM MainAutoCheck] Main update available: ${localVersion}→${remoteVersion}`);
                    try { await this._rememberPendingMainUpdate(remoteVersion, changes); } catch (_) { }
                    const installResult = await this._validateAndInstallMainPlugin(code, remoteVersion, changes);
                    if (!installResult.ok) {
                        console.warn(`[CPM MainAutoCheck] Direct install failed (${installResult.error}), trying fresh verified download...`);
                        await this.safeMainPluginUpdate(remoteVersion, changes);
                    }
                } else {
                    console.log('[CPM MainAutoCheck] Main plugin is up to date.');
                }
            } catch (/** @type {any} */ e) { console.debug('[CPM MainAutoCheck] Silent error:', e.message || e); }
        },

        // ── Download with integrity verification ──

        /**
         * Download main plugin code with verification (retry + Content-Length check).
         * @param {string} [expectedVersion] - Version announced by manifest/API.
         * @returns {Promise<{ok: boolean, code?: string, error?: string}>}
         */
        async _downloadMainPluginCode(expectedVersion) {
            const LOG = '[CPM Download]';
            const MAX_RETRIES = 3;
            const url = this.MAIN_UPDATE_URL;

            // Prefer the update bundle (same source of truth as api/versions).
            try {
                const bundleUrl = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 6);
                console.log(`${LOG} Trying update bundle first: ${bundleUrl}`);
                const bundleResult = await Promise.race([
                    Risu.risuFetch(bundleUrl, { method: 'GET', plainFetchForce: true }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('update bundle fetch timed out (20s)')), 20000)),
                ]);

                if (bundleResult?.data && (!bundleResult.status || bundleResult.status < 400)) {
                    const rawBundle = typeof bundleResult.data === 'string' ? JSON.parse(bundleResult.data) : bundleResult.data;
                    const parsedBundle = validateSchema(rawBundle, schemas.updateBundle);
                    if (!parsedBundle.ok) {
                        throw new Error(`update bundle schema invalid: ${parsedBundle.error}`);
                    }

                    const bundle = parsedBundle.data;
                    const mainEntry = bundle.versions?.['Cupcake Provider Manager'];
                    const fileName = mainEntry?.file || 'provider-manager.js';
                    const bundledCode = bundle.code?.[fileName];

                    if (!mainEntry?.version) {
                        throw new Error('main plugin version missing in update bundle');
                    }
                    if (expectedVersion && mainEntry.version !== expectedVersion) {
                        throw new Error(`bundle version mismatch: expected ${expectedVersion}, got ${mainEntry.version}`);
                    }
                    if (!bundledCode || typeof bundledCode !== 'string') {
                        throw new Error(`main plugin code missing in update bundle (${fileName})`);
                    }
                    if (!mainEntry.sha256) {
                        throw new Error('main plugin bundle entry has no sha256 hash — refusing untrusted update');
                    }
                    const actualHash = await _computeSHA256(bundledCode);
                    if (!actualHash) {
                        throw new Error('SHA-256 computation failed for bundled main plugin code');
                    }
                    if (actualHash !== mainEntry.sha256) {
                        throw new Error(`bundle sha256 mismatch: expected ${mainEntry.sha256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…`);
                    }
                    console.log(`${LOG} Bundle integrity OK [sha256:${mainEntry.sha256.substring(0, 12)}…]`);

                    console.log(`${LOG} Bundle download OK: ${fileName} v${mainEntry.version} (${(bundledCode.length / 1024).toFixed(1)}KB)`);
                    return { ok: true, code: bundledCode };
                }
                throw new Error(`update bundle fetch failed with status ${bundleResult?.status}`);
            } catch (/** @type {any} */ bundleErr) {
                console.warn(`${LOG} Update bundle path failed, falling back to direct JS:`, bundleErr.message || bundleErr);
            }

            // Best-effort: fetch expected SHA-256 from versions manifest for fallback integrity check
            let _fallbackExpectedSha256 = null;
            try {
                const vUrl = this.VERSIONS_URL + '?_t=' + Date.now();
                const vRes = await _withTimeout(
                    Risu.risuFetch(vUrl, { method: 'GET', plainFetchForce: true }),
                    10000,
                    'versions manifest timed out (10s)'
                );
                if (vRes?.data) {
                    const vData = typeof vRes.data === 'string' ? JSON.parse(vRes.data) : vRes.data;
                    _fallbackExpectedSha256 = vData?.['Cupcake Provider Manager']?.sha256 || null;
                    if (_fallbackExpectedSha256) {
                        console.log(`${LOG} Fallback integrity: got expected SHA from versions manifest [${_fallbackExpectedSha256.substring(0, 12)}…]`);
                    }
                }
            } catch (_) {
                console.warn(`${LOG} Could not fetch versions manifest for fallback integrity check — proceeding without SHA verification`);
            }

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`${LOG} Attempt ${attempt}/${MAX_RETRIES}: ${url}`);
                    const cacheBuster = url + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 6);

                    let response;
                    try {
                        response = await _withTimeout(
                            Risu.nativeFetch(cacheBuster, { method: 'GET' }),
                            20000,
                            'nativeFetch timed out (20s)'
                        );
                    } catch (nativeErr) {
                        console.warn(`${LOG} nativeFetch failed, falling back to risuFetch:`, /** @type {any} */ (nativeErr).message || nativeErr);
                        const risuResult = await _withTimeout(
                            Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true }),
                            20000,
                            'risuFetch fallback timed out (20s)'
                        );
                        if (!risuResult.data || (risuResult.status && risuResult.status >= 400)) {
                            throw new Error(`risuFetch failed with status ${risuResult.status}`);
                        }
                        const code = typeof risuResult.data === 'string' ? risuResult.data : String(risuResult.data || '');
                        // Verify SHA-256 if available
                        if (_fallbackExpectedSha256) {
                            const actualHash = await _computeSHA256(code);
                            if (actualHash && actualHash !== _fallbackExpectedSha256) {
                                throw new Error(`direct download sha256 mismatch: expected ${_fallbackExpectedSha256.substring(0, 12)}…, got ${(actualHash || '?').substring(0, 12)}…`);
                            }
                            if (actualHash) console.log(`${LOG} Fallback integrity OK [sha256:${actualHash.substring(0, 12)}…]`);
                        } else {
                            console.warn(`${LOG} ⚠️ Direct download completed WITHOUT SHA-256 verification (versions manifest unavailable)`);
                        }
                        return { ok: true, code };
                    }

                    if (!response.ok || response.status < 200 || response.status >= 300) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const text = await _withTimeout(
                        response.text(),
                        20000,
                        'response body read timed out (20s)'
                    );

                    const contentLength = parseInt(response.headers?.get?.('content-length') || '0', 10);
                    if (contentLength > 0) {
                        const actualBytes = new TextEncoder().encode(text).byteLength;
                        if (actualBytes < contentLength) {
                            console.warn(`${LOG} Incomplete download (${attempt}/${MAX_RETRIES}): expected ${contentLength}B, got ${actualBytes}B`);
                            if (attempt < MAX_RETRIES) {
                                await new Promise(r => setTimeout(r, 1000 * attempt));
                                continue;
                            }
                            return { ok: false, error: `다운로드 불완전: ${contentLength}B 중 ${actualBytes}B만 수신됨` };
                        }
                        console.log(`${LOG} Content-Length OK: ${actualBytes}B / ${contentLength}B`);
                    }

                    // Verify SHA-256 if available
                    if (_fallbackExpectedSha256) {
                        const actualHash = await _computeSHA256(text);
                        if (actualHash && actualHash !== _fallbackExpectedSha256) {
                            throw new Error(`direct download sha256 mismatch: expected ${_fallbackExpectedSha256.substring(0, 12)}…, got ${(actualHash || '?').substring(0, 12)}…`);
                        }
                        if (actualHash) console.log(`${LOG} Fallback integrity OK [sha256:${actualHash.substring(0, 12)}…]`);
                    } else {
                        console.warn(`${LOG} ⚠️ Direct download completed WITHOUT SHA-256 verification (versions manifest unavailable)`);
                    }

                    return { ok: true, code: text };
                } catch (/** @type {any} */ e) {
                    console.warn(`${LOG} Error (${attempt}/${MAX_RETRIES}):`, e.message || e);
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000 * attempt));
                    } else {
                        return { ok: false, error: `다운로드 실패 (${MAX_RETRIES}회 시도): ${e.message || e}` };
                    }
                }
            }
            return { ok: false, error: '다운로드 실패 (알 수 없는 오류)' };
        },

        // ── Validate & install to RisuAI DB ──

        /**
         * Validate already-downloaded code and install to RisuAI DB.
         * @param {string} code - Downloaded plugin code
         * @param {string} remoteVersion - Expected remote version
         * @param {string} [changes] - Change notes
         * @returns {Promise<{ok: boolean, error?: string}>}
         */
        async _validateAndInstallMainPlugin(code, remoteVersion, changes) {
            const LOG = '[CPM SafeUpdate]';
            const PLUGIN_NAME = 'Cupcake_Provider_Manager';

            if (!code || code.length < 100) {
                return { ok: false, error: '다운로드된 코드가 비어있거나 너무 짧습니다' };
            }

            const lines = code.split('\n');
            let parsedName = '', parsedDisplayName = '', parsedVersion = '', parsedUpdateURL = '', parsedApiVersion = '2.0';
            /** @type {Record<string, 'int'|'string'>} */
            const parsedArgs = {};
            /** @type {Record<string, string|number>} */
            const defaultRealArg = {};
            /** @type {Record<string, Record<string, string>>} */
            const parsedArgMeta = {};
            /** @type {Array<{link: string, hoverText?: string}>} */
            const parsedCustomLink = [];

            for (const line of lines) {
                const nameMatch = line.match(/^\/\/@name\s+(.+)/);
                if (nameMatch) parsedName = nameMatch[1].trim();
                const displayMatch = line.match(/^\/\/@display-name\s+(.+)/);
                if (displayMatch) parsedDisplayName = displayMatch[1].trim();
                const verMatch = line.match(/^\/\/@version\s+(.+)/);
                if (verMatch) parsedVersion = verMatch[1].trim();
                const urlMatch = line.match(/^\/\/@update-url\s+(\S+)/);
                if (urlMatch) parsedUpdateURL = urlMatch[1];
                if (/^\/\/@api\s/.test(line)) {
                    const vers = line.replace(/^\/\/@api\s+/, '').trim().split(' ');
                    for (const v of vers) { if (['2.0', '2.1', '3.0'].includes(v)) { parsedApiVersion = v; break; } }
                }
                if (/^\/\/@(?:arg|risu-arg)\s/.test(line)) {
                    const parts = line.trim().split(' ');
                    if (parts.length >= 3) {
                        const key = parts[1];
                        const type = parts[2];
                        if (type === 'int' || type === 'string') {
                            parsedArgs[key] = type;
                            defaultRealArg[key] = type === 'int' ? 0 : '';
                        }
                        if (parts.length > 3) {
                            /** @type {Record<string, string>} */
                            const meta = {};
                            parts.slice(3).join(' ').replace(/\{\{(.+?)(::?(.+?))?\}\}/g, (/** @type {any} */ _, /** @type {string} */ g1, /** @type {any} */ _g2, /** @type {string} */ g3) => {
                                meta[g1] = g3 || '1';
                                return '';
                            });
                            if (Object.keys(meta).length > 0) parsedArgMeta[key] = meta;
                        }
                    }
                }
                if (/^\/\/@link\s/.test(line)) {
                    const link = line.split(' ')[1];
                    if (link && link.startsWith('https')) {
                        const hoverText = line.split(' ').slice(2).join(' ').trim();
                        parsedCustomLink.push({ link, hoverText: hoverText || undefined });
                    }
                }
            }

            if (!parsedName) {
                return { ok: false, error: '다운로드된 코드에서 플러그인 이름(@name)을 찾을 수 없습니다' };
            }
            if (parsedName !== PLUGIN_NAME) {
                return { ok: false, error: `이름 불일치: "${parsedName}" ≠ "${PLUGIN_NAME}"` };
            }
            if (!parsedVersion) {
                return { ok: false, error: '다운로드된 코드에서 버전 정보(@version)를 찾을 수 없습니다' };
            }
            if (parsedApiVersion !== '3.0') {
                return { ok: false, error: `API 버전이 3.0이 아닙니다: ${parsedApiVersion}` };
            }

            console.log(`${LOG} Parsed: name=${parsedName} ver=${parsedVersion} api=${parsedApiVersion} args=${Object.keys(parsedArgs).length}`);

            if (remoteVersion && parsedVersion !== remoteVersion) {
                return { ok: false, error: `버전 불일치: 기대 ${remoteVersion}, 실제 ${parsedVersion}` };
            }

            try {
                const db = await Risu.getDatabase();
                if (!db) {
                    return { ok: false, error: 'RisuAI 데이터베이스 접근 실패 (권한 거부)' };
                }
                if (!db.plugins || !Array.isArray(db.plugins)) {
                    return { ok: false, error: 'RisuAI 플러그인 목록을 찾을 수 없습니다' };
                }

                const existingIdx = db.plugins.findIndex((/** @type {any} */ p) => p.name === PLUGIN_NAME);
                if (existingIdx === -1) {
                    return { ok: false, error: `기존 "${PLUGIN_NAME}" 플러그인을 DB에서 찾을 수 없습니다` };
                }

                const existing = db.plugins[existingIdx];
                const currentInstalledVersion = existing.versionOfPlugin || CPM_VERSION;
                const installDirection = this.compareVersions(currentInstalledVersion, parsedVersion);
                if (installDirection === 0) {
                    return { ok: false, error: `이미 같은 버전입니다: ${parsedVersion}` };
                }
                if (installDirection < 0) {
                    return { ok: false, error: `다운그레이드 차단: 현재 ${currentInstalledVersion} > 다운로드 ${parsedVersion}` };
                }

                const existingScriptBytes = new TextEncoder().encode(String(existing.script || '')).byteLength;
                const nextScriptBytes = new TextEncoder().encode(String(code || '')).byteLength;
                if (existingScriptBytes >= (300 * 1024) && nextScriptBytes < existingScriptBytes * 0.95) {
                    return { ok: false, error: `불완전한 다운로드 의심: 새 코드(${(nextScriptBytes / 1024).toFixed(1)}KB)가 기존(${(existingScriptBytes / 1024).toFixed(1)}KB)의 95% 미만입니다` };
                }

                const oldRealArg = existing.realArg || {};
                /** @type {Record<string, any>} */
                const mergedRealArg = {};
                for (const [key, type] of Object.entries(parsedArgs)) {
                    if (key in oldRealArg && existing.arguments && existing.arguments[key] === type) {
                        mergedRealArg[key] = oldRealArg[key];
                    } else {
                        mergedRealArg[key] = defaultRealArg[key];
                    }
                }

                /** @type {any} */
                const updatedPlugin = {
                    name: parsedName,
                    displayName: parsedDisplayName || parsedName,
                    script: code,
                    arguments: parsedArgs,
                    realArg: mergedRealArg,
                    argMeta: parsedArgMeta,
                    version: '3.0',
                    customLink: parsedCustomLink,
                    versionOfPlugin: parsedVersion,
                    updateURL: parsedUpdateURL || existing.updateURL || '',
                    enabled: existing.enabled !== false,
                };

                const nextPlugins = db.plugins.slice();
                nextPlugins[existingIdx] = updatedPlugin;
                await Risu.setDatabaseLite({ plugins: nextPlugins });

                try {
                    const verifyDb = await Risu.getDatabase();
                    const verifyPlugin = verifyDb?.plugins?.find?.((/** @type {any} */ p) => p.name === PLUGIN_NAME);
                    console.log(`${LOG} In-memory verify: version=${verifyPlugin?.versionOfPlugin || 'missing'} script=${verifyPlugin?.script ? 'present' : 'missing'}`);
                } catch (/** @type {any} */ verifyErr) {
                    console.warn(`${LOG} In-memory verify failed:`, verifyErr.message || verifyErr);
                }

                try {
                    await Risu.pluginStorage.setItem('cpm_last_main_update_flush', JSON.stringify({
                        ts: Date.now(),
                        from: currentInstalledVersion,
                        to: parsedVersion,
                    }));
                    console.log(`${LOG} Autosave flush marker written to pluginStorage.`);
                } catch (/** @type {any} */ flushErr) {
                    console.warn(`${LOG} Autosave flush marker write failed:`, flushErr.message || flushErr);
                }

                console.log(`${LOG} Waiting for RisuAI autosave flush before showing success...`);
                await this._waitForMainPluginPersistence();

                console.log(`${LOG} ✓ Successfully applied main plugin update: ${currentInstalledVersion} → ${parsedVersion}`);
                console.log(`${LOG}   Settings preserved: ${Object.keys(mergedRealArg).length} args (${Object.keys(oldRealArg).length} existed, ${Object.keys(parsedArgs).length} in new version)`);

                try { /** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot = true; } catch (_) { }

                await this._clearPendingMainUpdate();
                await this._showMainAutoUpdateResult(currentInstalledVersion, parsedVersion, changes || '', true);

                return { ok: true };
            } catch (/** @type {any} */ e) {
                return { ok: false, error: `DB 저장 실패: ${e.message || e}` };
            }
        },

        /**
         * Wait for RisuAI autosave flush.
         * @returns {Promise<void>}
         */
        async _waitForMainPluginPersistence() {
            await new Promise(resolve => setTimeout(resolve, 3500));
        },

        // ── Safe update orchestrator (dedup) ──

        /**
         * Safely update the main CPM plugin: download → validate → install.
         * @param {string} remoteVersion
         * @param {string} [changes]
         * @returns {Promise<{ok: boolean, error?: string}>}
         */
        async safeMainPluginUpdate(remoteVersion, changes) {
            if (/** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot) {
                console.log('[CPM SafeUpdate] Main update already completed this session — skipping.');
                try { await this._clearPendingMainUpdate(); } catch (_) { }
                return { ok: true };
            }

            if (this._mainUpdateInFlight) {
                console.log('[CPM SafeUpdate] Main update already in flight — joining existing run.');
                return await this._mainUpdateInFlight;
            }

            this._mainUpdateInFlight = (async () => {
                try {
                    await this._rememberPendingMainUpdate(remoteVersion, changes);

                    const dl = await this._downloadMainPluginCode(remoteVersion);
                    if (!dl.ok) {
                        console.error(`[CPM SafeUpdate] Download failed: ${dl.error}`);
                        if (!this._isRetriableMainUpdateError(dl.error)) {
                            await this._clearPendingMainUpdate();
                        }
                        await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, dl.error);
                        return { ok: false, error: dl.error };
                    }
                    const result = await this._validateAndInstallMainPlugin(dl.code, remoteVersion, changes);
                    if (!result.ok) {
                        console.error(`[CPM SafeUpdate] Install failed: ${result.error}`);
                        if (!this._isRetriableMainUpdateError(result.error)) {
                            await this._clearPendingMainUpdate();
                        }
                        const isSameVersionNoop = result.error && result.error.includes('이미 같은 버전');
                        if (!isSameVersionNoop) {
                            await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, result.error);
                        }
                    }
                    return result;
                } catch (/** @type {any} */ unexpectedErr) {
                    console.error(`[CPM SafeUpdate] Unexpected error:`, unexpectedErr);
                    return { ok: false, error: `예기치 않은 오류: ${unexpectedErr.message || unexpectedErr}` };
                }
            })();

            try {
                return await this._mainUpdateInFlight;
            } finally {
                this._mainUpdateInFlight = null;
            }
        },

        // ── Single-Bundle Update System ──
        UPDATE_BUNDLE_URL: UPDATE_BUNDLE_URL,

        async checkAllUpdates() {
            try {
                const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 8);
                console.log(`[CPM Update] Fetching update bundle via risuFetch(plainFetchForce): ${cacheBuster}`);

                const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

                if (!result.data || (result.status && result.status >= 400)) {
                    console.error(`[CPM Update] Failed to fetch update bundle: ${result.status}`);
                    return [];
                }

                const raw = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
                const bundleResult = validateSchema(raw, schemas.updateBundle);
                if (!bundleResult.ok) {
                    console.error(`[CPM Update] Bundle schema validation failed: ${bundleResult.error}`);
                    return [];
                }
                const bundle = bundleResult.data;
                const manifest = bundle.versions || {};
                const codeBundle = bundle.code || {};
                console.log(`[CPM Update] Bundle loaded: ${Object.keys(manifest).length} versions, ${Object.keys(codeBundle).length} code files`);

                const results = [];
                for (const p of this.plugins) {
                    if (!p.updateUrl || !p.name) continue;
                    const remote = manifest[p.name];
                    if (!remote || !remote.version) {
                        console.warn(`[CPM Update] ${p.name} not found in manifest, skipping.`);
                        continue;
                    }
                    const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                    console.log(`[CPM Update] ${p.name}: local=${p.version} remote=${remote.version} cmp=${cmp}`);
                    if (cmp > 0) {
                        const code = (remote.file && codeBundle[remote.file]) ? codeBundle[remote.file] : null;
                        if (code) {
                            console.log(`[CPM Update] Code ready for ${p.name} (${(code.length / 1024).toFixed(1)}KB)`);
                            if (!remote.sha256) {
                                console.error(`[CPM Update] ⚠️ REJECTED ${p.name}: bundle entry has no sha256 hash — refusing untrusted update`);
                                continue;
                            }
                            const actualHash = await _computeSHA256(code);
                            if (!actualHash) {
                                console.error(`[CPM Update] ⚠️ REJECTED ${p.name}: SHA-256 computation failed (Web Crypto unavailable) — cannot verify integrity`);
                                continue;
                            }
                            if (actualHash !== remote.sha256) {
                                console.error(`[CPM Update] ⚠️ INTEGRITY MISMATCH for ${p.name}: expected ${remote.sha256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}… — skipping`);
                                continue;
                            }
                            console.log(`[CPM Update] ✓ Integrity OK for ${p.name} [sha256:${actualHash.substring(0, 12)}…]`);
                        }
                        else console.warn(`[CPM Update] ${p.name} (${remote.file}) code not found in bundle`);
                        results.push({ plugin: p, remoteVersion: remote.version, localVersion: p.version || '0.0.0', remoteFile: remote.file, code, expectedSHA256: remote.sha256 });
                    }
                }
                return results;
            } catch (e) {
                console.error(`[CPM Update] Failed to check updates:`, e);
                return [];
            }
        },

        /**
         * @param {string} pluginId
         * @param {string} prefetchedCode
         * @param {string} expectedSHA256
         */
        async applyUpdate(pluginId, prefetchedCode, expectedSHA256) {
            const p = /** @type {any[]} */ (this.plugins).find((/** @type {any} */ x) => x.id === pluginId);
            if (!p) return false;
            if (!prefetchedCode) {
                console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
                return false;
            }
            try {
                if (!expectedSHA256) {
                    console.error(`[CPM Update] BLOCKED: No SHA-256 hash provided for ${p.name}. Refusing to apply unverified code.`);
                    return false;
                }
                const actualHash = await _computeSHA256(prefetchedCode);
                if (!actualHash) {
                    console.error(`[CPM Update] BLOCKED: SHA-256 computation failed for ${p.name} (Web Crypto unavailable).`);
                    return false;
                }
                if (actualHash !== expectedSHA256) {
                    console.error(`[CPM Update] BLOCKED: Integrity mismatch for ${p.name}. Expected sha256:${expectedSHA256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…`);
                    return false;
                }
                console.log(`[CPM Update] ✓ Apply-time integrity OK for ${p.name}`);
                console.log(`[CPM Update] Applying update for ${p.name} (${(prefetchedCode.length / 1024).toFixed(1)}KB)`);
                const meta = this.extractMetadata(prefetchedCode);
                if (meta.name && p.name && meta.name !== p.name) {
                    console.error(`[CPM Update] BLOCKED: Tried to apply "${meta.name}" code to plugin "${p.name}". Names don't match.`);
                    return false;
                }
                p.code = prefetchedCode;
                p.name = meta.name || p.name;
                p.version = meta.version;
                p.description = meta.description;
                p.icon = meta.icon;
                p.updateUrl = meta.updateUrl || p.updateUrl;
                await this.saveRegistry();
                console.log(`[CPM Update] Successfully applied update for ${p.name} → v${meta.version}`);
                return true;
            } catch (e) {
                console.error(`[CPM Update] Failed to apply update for ${p.name}:`, e);
                return false;
            }
        },
    };

    // @ts-check
    /**
     * update-toast.js — Toast notification UI for auto-update system.
     *
     * Extracted from sub-plugin-manager.js for maintainability.
     * Methods are spread into SubPluginManager.
     */

    /**
     * Toast methods to be spread into SubPluginManager.
     * @type {{[K: string]: any}}
     */
    const updateToastMethods = {
        /** @param {any[]} updates */
        async showUpdateToast(updates) {
            try {
                const doc = await Risu.getRootDocument();
                if (!doc) { console.debug('[CPM Toast] getRootDocument returned null'); return; }

                const existing = await doc.querySelector('[x-cpm-toast]');
                if (existing) { try { await existing.remove(); } catch (_) { } }

                const count = updates.length;
                let detailLines = '';
                const showMax = Math.min(count, 3);
                for (let i = 0; i < showMax; i++) {
                    const u = updates[i];
                    const changeText = u.changes ? ` — ${escHtml(u.changes)}` : '';
                    detailLines += `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${escHtml(u.icon)} ${escHtml(u.name)} <span style="color:#6ee7b7">${escHtml(u.localVersion)} → ${escHtml(u.remoteVersion)}</span>${changeText}</div>`;
                }
                if (count > showMax) {
                    detailLines += `<div style="font-size:11px;color:#6b7280;margin-top:2px">...외 ${count - showMax}개</div>`;
                }

                const toast = await doc.createElement('div');
                await toast.setAttribute('x-cpm-toast', '1');
                const styles = {
                    position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
                    background: '#1f2937', border: '1px solid #374151', borderLeft: '3px solid #3b82f6',
                    borderRadius: '10px', padding: '12px 14px', maxWidth: '380px', minWidth: '280px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    pointerEvents: 'auto', opacity: '0', transform: 'translateY(12px)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                };
                for (const [k, v] of Object.entries(styles)) await toast.setStyle(k, v);

                await toast.setInnerHTML(`
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:#e5e7eb">서브 플러그인 업데이트 ${count}개 있음</div>
                        ${detailLines}
                        <div style="font-size:11px;color:#6b7280;margin-top:4px">설정 → 서브 플러그인 탭에서 업데이트하세요</div>
                    </div>
                </div>
            `);

                const body = await doc.querySelector('body');
                if (body) { await body.appendChild(toast); console.log('[CPM Toast] Toast appended to root body'); }
                else { console.debug('[CPM Toast] body not found'); return; }

                setTimeout(async () => { try { await toast.setStyle('opacity', '1'); await toast.setStyle('transform', 'translateY(0)'); } catch (_) { } }, 50);
                setTimeout(async () => {
                    try { await toast.setStyle('opacity', '0'); await toast.setStyle('transform', 'translateY(12px)');
                        setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 350);
                    } catch (_) { }
                }, 8000);
            } catch (/** @type {any} */ e) { console.debug('[CPM Toast] Failed to show toast:', e.message); }
        },

        /**
         * Show main plugin auto-update result toast.
         * @param {string} localVersion
         * @param {string} remoteVersion
         * @param {string} changes
         * @param {boolean} success
         * @param {string} [error]
         */
        async _showMainAutoUpdateResult(localVersion, remoteVersion, changes, success, error) {
            try {
                const doc = await Risu.getRootDocument();
                if (!doc) { console.debug('[CPM MainToast] getRootDocument returned null'); return; }

                const existing = await doc.querySelector('[x-cpm-main-toast]');
                if (existing) { try { await existing.remove(); } catch (_) { } }

                const subToastEl = await doc.querySelector('[x-cpm-toast]');
                const bottomPos = subToastEl ? '110px' : '20px';

                const toast = await doc.createElement('div');
                await toast.setAttribute('x-cpm-main-toast', '1');
                const borderColor = success ? '#6ee7b7' : '#f87171';
                const styles = {
                    position: 'fixed', bottom: bottomPos, right: '20px', zIndex: '99999',
                    background: '#1f2937', border: '1px solid #374151', borderLeft: `3px solid ${borderColor}`,
                    borderRadius: '10px', padding: '12px 14px', maxWidth: '380px', minWidth: '280px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    pointerEvents: 'auto', opacity: '0', transform: 'translateY(12px)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                };
                for (const [k, v] of Object.entries(styles)) await toast.setStyle(k, v);

                const changesHtml = changes ? ` — ${escHtml(changes)}` : '';
                let html;
                if (success) {
                    html = `
                    <div style="display:flex;align-items:flex-start;gap:10px">
                        <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:600;color:#6ee7b7">✓ 메인 플러그인 자동 업데이트 완료</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Cupcake PM <span style="color:#6ee7b7">${escHtml(localVersion)} → ${escHtml(remoteVersion)}</span>${changesHtml}</div>
                            <div style="font-size:11px;color:#fcd34d;margin-top:4px;font-weight:500">⚡ 3~4초 정도 기다린 뒤 새로고침하면 적용됩니다</div>
                        </div>
                    </div>`;
                } else {
                    html = `
                    <div style="display:flex;align-items:flex-start;gap:10px">
                        <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:600;color:#f87171">⚠️ 자동 업데이트 실패</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Cupcake PM ${escHtml(localVersion)} → ${escHtml(remoteVersion)}</div>
                            <div style="font-size:10px;color:#f87171;margin-top:2px">${escHtml(error || '알 수 없는 오류')}</div>
                            <div style="font-size:10px;color:#6b7280;margin-top:4px">리스 설정 → 플러그인 탭 → + 버튼으로 수동 업데이트하세요</div>
                        </div>
                    </div>`;
                }
                await toast.setInnerHTML(html);

                const body = await doc.querySelector('body');
                if (!body) { console.debug('[CPM MainToast] body not found'); return; }
                await body.appendChild(toast);

                setTimeout(async () => { try { await toast.setStyle('opacity', '1'); await toast.setStyle('transform', 'translateY(0)'); } catch (_) { } }, 50);
                const dismissDelay = success ? 10000 : 15000;
                setTimeout(async () => {
                    try { await toast.setStyle('opacity', '0'); await toast.setStyle('transform', 'translateY(12px)');
                        setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 350);
                    } catch (_) { }
                }, dismissDelay);
            } catch (e) { console.debug('[CPM MainToast] Failed to show toast:', /** @type {Error} */ (e).message || e); }
        },
    };

    // @ts-check
    /**
     * sub-plugin-manager.js — Dynamic sub-plugin lifecycle management.
     * Handles install, remove, toggle, execute, hot-reload, and auto-update.
     *
     * Auto-update logic is defined in auto-updater.js and update-toast.js,
     * then spread into SubPluginManager to keep this file focused on core CRUD
     * and hot-reload infrastructure.
     */

    // DI: _exposeScopeToWindow is injected by init.js to avoid circular dependency.
    let _exposeScopeToWindow$1 = () => {};
    /** @param {() => void} fn */
    function setExposeScopeFunction(fn) { _exposeScopeToWindow$1 = fn; }

    const SubPluginManager = {
        STORAGE_KEY: 'cpm_installed_subplugins',
        /** @type {any[]} */
        plugins: [],

        async loadRegistry() {
            try {
                const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
                if (!data) { this.plugins = []; return; }
                const result = parseAndValidate(data, schemas.subPluginRegistry);
                if (!result.ok) {
                    console.warn('[CPM Loader] Registry schema validation failed:', result.error);
                    this.plugins = result.fallback;
                } else {
                    this.plugins = result.data;
                }
            } catch (e) {
                console.error('[CPM Loader] Failed to load registry', e);
                this.plugins = [];
            }
        },

        async saveRegistry() {
            await Risu.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.plugins));
        },

        /** @param {string} code */
        extractMetadata(code) {
            const meta = { name: 'Unnamed Sub-Plugin', version: '', description: '', icon: '📦', updateUrl: '' };
            const lines = code.split(/\r?\n/);
            let parsedName = '';
            let parsedDisplayName = '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (!trimmed.startsWith('//')) break;

                const nameMatch = trimmed.match(/^\/\/\s*@name\s+(.+)$/i);
                if (nameMatch && !parsedName) {
                    parsedName = nameMatch[1].trim();
                    continue;
                }

                const displayNameMatch = trimmed.match(/^\/\/\s*@display-name\s+(.+)$/i);
                if (displayNameMatch && !parsedDisplayName) {
                    parsedDisplayName = displayNameMatch[1].trim();
                    continue;
                }

                const verMatch = trimmed.match(/^\/\/\s*@version\s+(.+)$/i);
                if (verMatch && !meta.version) {
                    meta.version = verMatch[1].trim();
                    continue;
                }

                const descMatch = trimmed.match(/^\/\/\s*@description\s+(.+)$/i);
                if (descMatch && !meta.description) {
                    meta.description = descMatch[1].trim();
                    continue;
                }

                const iconMatch = trimmed.match(/^\/\/\s*@icon\s+(.+)$/i);
                if (iconMatch && meta.icon === '📦') {
                    meta.icon = iconMatch[1].trim();
                    continue;
                }

                const updateMatch = trimmed.match(/^\/\/\s*@update-url\s+(.+)$/i);
                if (updateMatch && !meta.updateUrl) {
                    meta.updateUrl = updateMatch[1].trim();
                }
            }

            meta.name = parsedName || parsedDisplayName || meta.name;
            return meta;
        },

        /** Names that must never be installed as a sub-plugin (main plugin identifiers). */
        BLOCKED_NAMES: ['Cupcake_Provider_Manager', 'Cupcake Provider Manager'],
        MAX_INSTALL_BYTES: 300 * 1024,

        /** @param {string} code */
        getCodeSizeBytes(code) {
            try {
                if (typeof TextEncoder !== 'undefined') {
                    return new TextEncoder().encode(code || '').length;
                }
            } catch (_) {}
            return String(code || '').length;
        },

        /** @param {string} code */
        async install(code) {
            const meta = this.extractMetadata(code);
            const codeSizeBytes = this.getCodeSizeBytes(code);

            if (codeSizeBytes > this.MAX_INSTALL_BYTES) {
                throw new Error(
                    `서브 플러그인 용량이 너무 큽니다. ` +
                    `최대 ${(this.MAX_INSTALL_BYTES / 1024).toFixed(0)}KB까지만 설치할 수 있습니다.`
                );
            }

            // Block installing the main provider-manager plugin as a sub-plugin
            if (this.BLOCKED_NAMES.some(n => n.toLowerCase() === meta.name.toLowerCase())) {
                throw new Error(
                    `'${meta.name}'은(는) 메인 프로바이더 매니저 플러그인입니다. ` +
                    `서브 플러그인으로 설치할 수 없습니다.`
                );
            }

            const existing = this.plugins.find(p => p.name === meta.name);
            if (existing) {
                existing.code = code;
                existing.version = meta.version;
                existing.description = meta.description;
                existing.icon = meta.icon;
                existing.updateUrl = meta.updateUrl;
                await this.saveRegistry();
                return meta.name;
            }
            const id = 'subplugin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            this.plugins.push({ id, code, enabled: true, ...meta });
            await this.saveRegistry();
            return meta.name;
        },

        /** @param {string} id */
        async remove(id) {
            this.plugins = this.plugins.filter(p => p.id !== id);
            await this.saveRegistry();
        },

        /**
         * @param {string} id
         * @param {boolean} enabled
         */
        async toggle(id, enabled) {
            const p = this.plugins.find(p => p.id === id);
            if (p) {
                p.enabled = enabled;
                await this.saveRegistry();
            }
        },

        async executeEnabled() {
            _exposeScopeToWindow$1();
            /** @type {any} */ (window).CupcakePM_SubPlugins = /** @type {any} */ (window).CupcakePM_SubPlugins || [];
            for (const p of this.plugins) {
                if (p.enabled) {
                    try {
                        state._currentExecutingPluginId = p.id;
                        if (!_pluginRegistrations[p.id]) _pluginRegistrations[p.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                        await _executeViaScriptTag(p.code, p.name);
                        console.log(`[CPM Loader] Loaded Sub-Plugin: ${p.name}`);
                    } catch (e) {
                        console.error(`[CPM Loader] Failed to load ${p.name}`, e);
                    } finally {
                        state._currentExecutingPluginId = null;
                    }
                }
            }
        },

        /**
         * @param {string} a
         * @param {string} b
         */
        compareVersions(a, b) {
            const sa = (a || '0.0.0').replace(/[^0-9.]/g, '') || '0.0.0';
            const sb = (b || '0.0.0').replace(/[^0-9.]/g, '') || '0.0.0';
            const pa = sa.split('.').map(Number);
            const pb = sb.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0, nb = pb[i] || 0;
                if (nb > na) return 1;
                if (na > nb) return -1;
            }
            return 0;
        },

        // ── Auto-update system (from auto-updater.js) ──
        ...autoUpdaterMethods,

        // ── Toast UI (from update-toast.js) ──
        ...updateToastMethods,

        // ── Hot-Reload Infrastructure ──

        /** @param {string} pluginId */
        unloadPlugin(pluginId) {
            const reg = _pluginRegistrations[pluginId];
            if (!reg) return;

            const hooks = _pluginCleanupHooks[pluginId];
            if (hooks && Array.isArray(hooks)) {
                for (const hook of hooks) {
                    try {
                        const result = hook();
                        if (result && typeof result.then === 'function') {
                            result.catch((/** @type {any} */ e) => console.warn(`[CPM Loader] Async cleanup hook error for ${pluginId}:`, e.message));
                        }
                    } catch (/** @type {any} */ e) { console.warn(`[CPM Loader] Cleanup hook error for ${pluginId}:`, e.message); }
                }
                delete _pluginCleanupHooks[pluginId];
            }

            for (const key of Object.keys(window)) {
                if (key.startsWith('_cpm') && key.endsWith('Cleanup') && typeof /** @type {any} */ (window)[key] === 'function') {
                    const providerNames = reg.providerNames.map(n => n.toLowerCase());
                    const keyLower = key.toLowerCase();
                    const isRelated = providerNames.some(name => keyLower.includes(name.replace(/\s+/g, '').toLowerCase()));
                    if (isRelated) {
                        try {
                            console.log(`[CPM Loader] Calling window.${key}() for plugin ${pluginId}`);
                            const result = /** @type {any} */ (window)[key]();
                            if (result && typeof result.then === 'function') {
                                result.catch((/** @type {any} */ e) => console.warn(`[CPM Loader] window.${key}() error:`, e.message));
                            }
                        } catch (/** @type {any} */ e) { console.warn(`[CPM Loader] window.${key}() error:`, e.message); }
                    }
                }
            }

            for (const name of reg.providerNames) {
                delete customFetchers[name];
                state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
            }
            for (const tab of reg.tabObjects) {
                const idx = registeredProviderTabs.indexOf(tab);
                if (idx !== -1) registeredProviderTabs.splice(idx, 1);
            }
            for (const entry of reg.fetcherEntries) {
                const idx = pendingDynamicFetchers.findIndex((/** @type {any} */ f) => f.name === entry.name);
                if (idx !== -1) pendingDynamicFetchers.splice(idx, 1);
            }
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            console.log(`[CPM Loader] Unloaded registrations for plugin ${pluginId}`);
        },

        /** @param {any} plugin */
        async executeOne(plugin) {
            if (!plugin || !plugin.enabled) return;
            _exposeScopeToWindow$1();
            try {
                state._currentExecutingPluginId = plugin.id;
                if (!_pluginRegistrations[plugin.id]) _pluginRegistrations[plugin.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                await _executeViaScriptTag(plugin.code, plugin.name);
                console.log(`[CPM Loader] Hot-loaded Sub-Plugin: ${plugin.name}`);
            } catch (e) {
                console.error(`[CPM Loader] Failed to hot-load ${plugin.name}`, e);
            } finally {
                state._currentExecutingPluginId = null;
            }
        },

        /** @param {string} pluginId */
        async hotReload(pluginId) {
            const plugin = this.plugins.find(p => p.id === pluginId);
            if (!plugin) return false;

            this.unloadPlugin(pluginId);

            if (plugin.enabled) {
                await this.executeOne(plugin);

                const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
                for (const _entry of [...pendingDynamicFetchers]) {
                    /** @type {any} */
                    const { name, fetchDynamicModels } = _entry;
                    if (newProviderNames.includes(name)) {
                        try {
                            const enabled = await isDynamicFetchEnabled(name);
                            if (!enabled) { console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                            console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                            const dynamicModels = await fetchDynamicModels();
                            if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                                state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
                                for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                                console.log(`[CupcakePM] \u2713 Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                            }
                        } catch (/** @type {any} */ e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
                    }
                }
            }
            console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
            return true;
        },

        async hotReloadAll() {
            for (const p of this.plugins) this.unloadPlugin(p.id);
            await this.executeEnabled();
            for (const _entry of [...pendingDynamicFetchers]) {
                /** @type {any} */
                const { name, fetchDynamicModels } = _entry;
                try {
                    const enabled = await isDynamicFetchEnabled(name);
                    if (!enabled) continue;
                    const dynamicModels = await fetchDynamicModels();
                    if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                        state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
                        for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                } catch (/** @type {any} */ e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
            }
            console.log('[CPM Loader] Hot-reload all complete.');
        },

        // ── Purge All CPM Data ──
        // Storage keys used by CPM in pluginStorage
        _PLUGIN_STORAGE_KEYS: [
            'cpm_installed_subplugins',
            'cpm_settings_backup',
            'cpm_last_version_check',
            'cpm_last_main_version_check',
            'cpm_pending_main_update',
            'cpm_last_boot_status',
        ],

        /**
         * Completely purge ALL data stored by Cupcake Provider Manager.
         * This includes: pluginStorage items, all @arg setting keys,
         * sub-plugin registry, settings backup, and version check timestamps.
         *
         * WARNING: This is irreversible. Caller must confirm with the user first.
         * @returns {Promise<{pluginStorageCleared: number, argsCleared: number}>}
         */
        async purgeAllCpmData() {
            let pluginStorageCleared = 0;
            let argsCleared = 0;

            // 1. Clear all known pluginStorage keys
            for (const key of this._PLUGIN_STORAGE_KEYS) {
                try {
                    await Risu.pluginStorage.removeItem(key);
                    pluginStorageCleared++;
                } catch (/** @type {any} */ e) {
                    console.warn(`[CPM Purge] Failed to remove pluginStorage key '${key}':`, e.message || e);
                }
            }

            // 2. Also try to find and remove any sub-plugin specific pluginStorage keys
            try {
                const allKeys = await Risu.pluginStorage.keys();
                for (const key of allKeys) {
                    if (key.startsWith('cpm_') || key.startsWith('cpm-')) {
                        try {
                            await Risu.pluginStorage.removeItem(key);
                            pluginStorageCleared++;
                        } catch (_) { /* ignore */ }
                    }
                }
            } catch (_) {
                // pluginStorage.keys() may not be available in all environments
            }

            // 3. Clear all managed @arg setting keys
            const managedKeys = getManagedSettingKeys();
            for (const key of managedKeys) {
                try {
                    Risu.setArgument(key, '');
                    argsCleared++;
                } catch (/** @type {any} */ e) {
                    console.warn(`[CPM Purge] Failed to clear arg '${key}':`, e.message || e);
                }
            }

            // 4. Clear legacy custom model keys (cpm_c1..cpm_c10)
            const legacyFields = ['url', 'model', 'key', 'name', 'format', 'sysfirst', 'altrole', 'mustuser', 'maxout', 'mergesys', 'decoupled', 'thought', 'reasoning', 'verbosity', 'thinking', 'tok'];
            for (let i = 1; i <= 10; i++) {
                for (const field of legacyFields) {
                    try {
                        Risu.setArgument(`cpm_c${i}_${field}`, '');
                        argsCleared++;
                    } catch (_) { /* ignore */ }
                }
            }

            // 5. Clear in-memory state
            this.plugins = [];
            state.ALL_DEFINED_MODELS = [];
            state.CUSTOM_MODELS_CACHE = [];
            state.vertexTokenCache = { token: null, expiry: 0 };

            // 6. Clear sensitive window globals (in-memory tokens / session IDs)
            if (typeof window !== 'undefined') {
                const cpmGlobalKeys = Object.keys(window).filter(k => k.startsWith('_cpm') || k === 'CupcakePM' || k === 'CPM_VERSION' || k === 'cpmShortcutRegistered');
                for (const k of cpmGlobalKeys) {
                    try { delete /** @type {any} */ (window)[k]; } catch (_) { /* ignore */ }
                }
            }

            console.log(`[CPM Purge] Complete. pluginStorage: ${pluginStorageCleared} keys, args: ${argsCleared} keys cleared.`);
            return { pluginStorageCleared, argsCleared };
        }
    };

    // @ts-check
    /**
     * fetch-custom.js — Custom model API fetcher.
     * Handles all three formats (OpenAI, Anthropic, Google) with
     * streaming/non-streaming, Copilot integration, key rotation,
     * and Responses API support.
     */

    /** @param {number} ms */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /** @param {any} headers */
    function _parseRetryAfterMs(headers) {
        const raw = headers?.get?.('retry-after');
        if (!raw) return 0;
        const seconds = Number(raw);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.max(0, Math.floor(seconds * 1000));
        }
        const retryAt = Date.parse(raw);
        if (Number.isNaN(retryAt)) return 0;
        return Math.max(0, retryAt - Date.now());
    }

    /** @param {number} status */
    function _isRetriableHttpStatus(status) {
        // 524 = Cloudflare timeout — retrying immediately won't help, skip it
        return status === 408 || status === 429 || (status >= 500 && status !== 524);
    }

    /**
     * @param {Record<string, any>} config
     * @param {any[]} messagesRaw
     * @param {number} temp
     * @param {number} maxTokens
     * @param {Record<string, any>} [args]
     * @param {AbortSignal} [abortSignal]
     * @param {string} [_reqId]
     */
    async function fetchCustom(config, messagesRaw, temp, maxTokens, args = {}, abortSignal, _reqId) {
        if (!config.url || !config.url.trim()) {
            return { success: false, content: '[Cupcake PM] Base URL is required. Configure it in PM settings.' };
        }
        const messages = sanitizeMessages(messagesRaw);
        const format = config.format || 'openai';
        let formattedMessages;
        let systemPrompt = '';

        if (format === 'anthropic') {
            const { messages: anthropicMsgs, system: anthropicSys } = formatToAnthropic(messages, config);
            formattedMessages = anthropicMsgs;
            systemPrompt = anthropicSys;
        } else if (format === 'google') {
            const { contents: geminiContents, systemInstruction: geminiSys } = formatToGemini(messages, {
                preserveSystem: config.preserveSystem !== false,
                ...config,
            });
            formattedMessages = geminiContents;
            systemPrompt = geminiSys.length > 0 ? geminiSys.join('\n\n') : '';
        } else {
            const modelId = String(config.model || '');
            config.developerRole = /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelId);
            formattedMessages = formatToOpenAI(messages, config);
        }

        const _rawKeys = (config.key || '').trim();
        const _allKeys = _rawKeys.split(/\s+/).filter((/** @type {string} */ k) => k.length > 0);
        const _useKeyRotation = _allKeys.length > 1;
        const _keyPool = [..._allKeys];

        if (format === 'openai' && Array.isArray(formattedMessages)) {
            const _validOpenAIRoles = new Set(['system', 'user', 'assistant', 'tool', 'function', 'developer']);
            for (let _ri = 0; _ri < formattedMessages.length; _ri++) {
                const _fm = formattedMessages[_ri];
                if (_fm && typeof _fm.role === 'string' && !_validOpenAIRoles.has(_fm.role)) {
                    const _oldRole = _fm.role;
                    _fm.role = (_oldRole === 'model' || _oldRole === 'char') ? 'assistant' : 'user';
                    console.warn(`[Cupcake PM] fetchCustom: normalized invalid OpenAI role '${_oldRole}' → '${_fm.role}' at index ${_ri}`);
                }
            }
        }

        // Safety: clamp maxTokens if custom model has maxOutputLimit set
        if (config.maxOutputLimit && config.maxOutputLimit > 0 && typeof maxTokens === 'number' && maxTokens > config.maxOutputLimit) {
            console.warn(`[CPM-Custom] max_tokens ${maxTokens} → clamped to ${config.maxOutputLimit} for ${config.model} (user limit)`);
            maxTokens = config.maxOutputLimit;
        }

        /** @type {any} */
        const body = { model: config.model, temperature: temp };

        const _needsMCT = (/** @type {string} */ model) => { if (!model) return false; return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(model); };
        if (format === 'openai' && _needsMCT(config.model)) {
            body.max_completion_tokens = maxTokens;
        } else {
            body.max_tokens = maxTokens;
        }
        if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
        if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
        if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
        if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
        if (args.min_p !== undefined && args.min_p !== null) body.min_p = args.min_p;
        if (format === 'openai' && args.repetition_penalty !== undefined && args.repetition_penalty !== null) {
            body.repetition_penalty = args.repetition_penalty;
        }

        // ── Anthropic format ──
        if (format === 'anthropic') {
            delete body.frequency_penalty; delete body.presence_penalty; delete body.min_p; delete body.top_k;
            body.messages = formattedMessages;
            if (systemPrompt) body.system = systemPrompt;
            if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;

            const effortRaw = String(config.effort || '').trim().toLowerCase();
            const thinkingMode = String(config.thinking || config.thinking_level || '').trim().toLowerCase();
            const adaptiveToggle = !!config.adaptiveThinking;
            const VALID_EFFORTS = ['low', 'medium', 'high', 'max'];

            // Adaptive thinking: only when the explicit toggle is ON (or legacy thinkingMode === 'adaptive')
            const useAdaptiveThinking = adaptiveToggle || thinkingMode === 'adaptive';
            if (useAdaptiveThinking) {
                body.thinking = { type: 'adaptive' };
                const adaptiveEffort = VALID_EFFORTS.includes(effortRaw) ? effortRaw : 'high';
                body.output_config = { effort: adaptiveEffort };
                body.max_tokens = Math.max(body.max_tokens || 0, 16000);
                delete body.temperature; delete body.top_k; delete body.top_p;
            } else if (VALID_EFFORTS.includes(effortRaw)) {
                // Effort WITHOUT adaptive thinking — set output_config only (no thinking block)
                body.output_config = { effort: effortRaw };
            }

            // Budget-based thinking (type: 'enabled') — independent of adaptive/effort
            if (!useAdaptiveThinking) {
                const explicitBudget = config.thinkingBudget || 0;
                const legacyBudget = parseInt(config.thinking_level) || 0;
                const budget = explicitBudget > 0 ? explicitBudget : legacyBudget;
                if (budget > 0) {
                    body.thinking = { type: 'enabled', budget_tokens: budget };
                    if (!body.max_tokens || body.max_tokens <= budget) body.max_tokens = budget + 4096;
                    delete body.temperature; delete body.top_k; delete body.top_p;
                }
            }
        } else if (format === 'google') {
            // ── Google format ──
            body.contents = formattedMessages;
            if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
            body.generationConfig = { temperature: temp, maxOutputTokens: maxTokens };
            if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
            if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
            if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
            if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
            const _isVertexEndpoint = config.url && (config.url.includes('aiplatform.googleapis.com') || config.url.includes('vertex'));
            const _thinkBudgetForGemini = config.thinkingBudget || undefined;
            const _thinkCfg = buildGeminiThinkingConfig(config.model, config.thinking_level, _thinkBudgetForGemini, _isVertexEndpoint);
            if (_thinkCfg) body.generationConfig.thinkingConfig = _thinkCfg;
            body.safetySettings = getGeminiSafetySettings(config.model);
            validateGeminiParams(body.generationConfig);
            cleanExperimentalModelParams(body.generationConfig, config.model);
            delete body.temperature; delete body.max_tokens; delete body.top_p; delete body.top_k;
            delete body.frequency_penalty; delete body.presence_penalty; delete body.min_p;
            delete body.max_completion_tokens; delete body.model;
        } else {
            // ── OpenAI format ──
            body.messages = formattedMessages;
        }

        // ── Final safety: deep-clone + filter ──
        if (body.messages) {
            try { body.messages = JSON.parse(JSON.stringify(body.messages)); } catch (e) { console.error('[Cupcake PM] Deep-clone of messages failed:', /** @type {Error} */ (e).message); }
            const before = body.messages.length;
            body.messages = body.messages.filter((/** @type {any} */ m) => {
                if (m == null || typeof m !== 'object') return false;
                if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
                if (typeof m.role !== 'string' || !m.role) return false;
                return true;
            });
            if (body.messages.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array`);
            if (body.messages.length === 0) return { success: false, content: '[Cupcake PM] messages must be non-empty (all messages became empty after sanitization)' };
        }
        if (body.contents) {
            try { body.contents = JSON.parse(JSON.stringify(body.contents)); } catch (e) { console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', /** @type {Error} */ (e).message); }
            const before = body.contents.length;
            body.contents = body.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
            if (body.contents.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.contents.length} null/invalid entries from contents array`);
        }

        if (config.maxout) {
            if (format === 'openai') { body.max_output_tokens = maxTokens; delete body.max_tokens; delete body.max_completion_tokens; }
            else if (format === 'google') { body.generationConfig.maxOutputTokens = maxTokens; }
        }

        // o3/o4: strip sampling params
        if (format === 'openai') {
            const _modelStr = String(config.model || '').toLowerCase();
            if (shouldStripOpenAISamplingParams(_modelStr)) {
                delete body.temperature; delete body.top_p; delete body.frequency_penalty;
                delete body.presence_penalty; delete body.min_p; delete body.repetition_penalty;
            }
            if (shouldStripGPT54SamplingForReasoning(_modelStr, config.reasoning)) {
                delete body.temperature;
                delete body.top_p;
            }
        }

        if (config.reasoning && config.reasoning !== 'none') {
            if (format === 'openai' && supportsOpenAIReasoningEffort(config.model)) {
                body.reasoning_effort = config.reasoning;
            }
        }
        if (config.verbosity && config.verbosity !== 'none') {
            if (format === 'openai') body.verbosity = config.verbosity;
        }
        if (format === 'openai' && config.promptCacheRetention && config.promptCacheRetention !== 'none') {
            body.prompt_cache_retention = config.promptCacheRetention;
        }

        if (config.customParams && config.customParams.trim() !== '') {
            try {
                const extra = JSON.parse(config.customParams);
                if (typeof extra === 'object' && extra !== null && !Array.isArray(extra)) {
                    const safeExtra = { ...extra };

                    // ── Blocklist: structural/security-critical fields that must not be overridden via customParams ──
                    // These fields control conversation content, streaming behaviour, model identity, or tool definitions.
                    // Allowing them to be overridden could silently break the request or create security issues.
                    /** @type {string[]} */
                    const BLOCKED_FIELDS = [
                        // conversation content — replacing these would discard the user's actual chat
                        'messages', 'contents', 'input', 'prompt',
                        // streaming control — CPM sets this based on caller intent; override would break the SSE parser
                        'stream', 'stream_options',
                        // model identity — the model is chosen in the provider tab UI; overriding here is almost always a mistake
                        'model',
                        // tool / function injection — could execute arbitrary tool definitions the user didn't intend
                        'tools', 'functions', 'function_call', 'tool_choice', 'tool_config',
                        // system-level overrides (both snake_case and camelCase variants)
                        'system', 'system_instruction', 'systemInstruction',
                    ];
                    /** @type {string[]} */
                    const stripped = [];
                    for (const key of BLOCKED_FIELDS) {
                        if (key in safeExtra) {
                            stripped.push(key);
                            delete safeExtra[key];
                        }
                    }
                    if (stripped.length > 0) {
                        console.warn(`[Cupcake PM] customParams: blocked field(s) stripped: ${stripped.join(', ')}. Use the main UI settings instead.`);
                    }

                    // ── Type guard: only merge primitive values and plain objects/arrays ──
                    for (const [key, value] of Object.entries(safeExtra)) {
                        if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
                            // Reject thenables (Promise-like objects) — not valid JSON values
                            delete safeExtra[key];
                            console.warn(`[Cupcake PM] customParams: rejected non-serializable value for key "${key}"`);
                        }
                    }

                    Object.assign(body, safeExtra);
                }
            } catch (e) { console.error('[Cupcake PM] Failed to parse customParams JSON for Custom Model:', e); }
        }

        // ── Copilot + Anthropic: auto-switch URL ──
        let effectiveUrl = config.url;
        if (config.url && config.url.includes('githubcopilot.com') && format === 'anthropic') {
            effectiveUrl = 'https://api.githubcopilot.com/v1/messages';
            console.log('[Cupcake PM] Copilot + Anthropic format detected → URL auto-switched to /v1/messages');
        }

        // ── Copilot + Responses API detection ──
        const _responsesMode = String(config.responsesMode || 'auto').toLowerCase();
        const _responsesForceOn = _responsesMode === 'on' || _responsesMode === 'force' || _responsesMode === 'always';
        const _responsesForceOff = _responsesMode === 'off' || _responsesMode === 'disable' || _responsesMode === 'disabled';
        const _isManualResponsesEndpoint = !!(config.url && /\/responses(?:\?|$)/.test(config.url));
        const _isCopilotDomain = !!(config.url && config.url.includes('githubcopilot.com'));
        const _canUseResponsesByUrl = _isManualResponsesEndpoint || _isCopilotDomain;
        const _autoResponsesMatch = _isManualResponsesEndpoint || (_isCopilotDomain && needsCopilotResponsesAPI(config.model));
        const _useResponsesAPI = !!(format === 'openai' && !_responsesForceOff && _canUseResponsesByUrl && (_responsesForceOn || _autoResponsesMatch));

        if (_useResponsesAPI) {
            if (_isCopilotDomain && !_isManualResponsesEndpoint && (_responsesForceOn || needsCopilotResponsesAPI(config.model))) {
                const _copilotBase = (config.url.match(/https:\/\/[^/]+/) || ['https://api.githubcopilot.com'])[0];
                effectiveUrl = `${_copilotBase}/responses`;
            }
            if (body.messages) {
                // Response API does not accept 'name' field on input items (e.g. example_assistant, example_user).
                // Sending it causes 400: "Unknown parameter: 'input[N].name'"
                body.input = body.messages.map((/** @type {any} */ msg) => {
                    const { name: _name, ...rest } = msg;
                    return rest;
                });
                delete body.messages;
            }
            if (body.max_completion_tokens) { body.max_output_tokens = body.max_completion_tokens; delete body.max_completion_tokens; }
            else if (body.max_tokens) { body.max_output_tokens = body.max_tokens; delete body.max_tokens; }
            if (body.reasoning_effort) { body.reasoning = { effort: body.reasoning_effort, summary: 'auto' }; delete body.reasoning_effort; }
            delete body.stream_options; delete body.prompt_cache_retention;

            if (args.temperature === undefined || args.temperature === null) delete body.temperature;
            if (args.top_p === undefined || args.top_p === null) delete body.top_p;
            if (args.frequency_penalty === undefined || args.frequency_penalty === null) delete body.frequency_penalty;
            if (args.presence_penalty === undefined || args.presence_penalty === null) delete body.presence_penalty;
            delete body.min_p; delete body.repetition_penalty;

            console.log(`[Cupcake PM] Copilot + Responses API detected (model=${config.model}) → URL=${effectiveUrl}`);
        }
        const _isResponsesEndpoint = _useResponsesAPI || (effectiveUrl && /\/responses(?:\?|$)/.test(effectiveUrl));

        // ── CORS Proxy: proxyUrl이 설정되어 있으면 도메인을 프록시로 교체 ──
        // Responses API URL 재작성 후에 적용해야 올바른 경로를 프록시로 보냄
        // 모든 API URL에 적용됨 (Copilot, Google, NVIDIA, 기타 커스텀 API 모두)
        let _proxyUrl = (config.proxyUrl || '').trim().replace(/\/+$/, '');
        // Auto-prepend https:// if user entered bare domain (e.g. "my-server.kr/proxy")
        if (_proxyUrl && !/^https?:\/\//i.test(_proxyUrl)) {
            _proxyUrl = 'https://' + _proxyUrl;
            console.log(`[Cupcake PM] proxyUrl missing scheme — auto-prepended https:// → ${_proxyUrl}`);
        }
        const _isProxied = !!_proxyUrl;
        if (_proxyUrl && effectiveUrl) {
            try {
                const _origUrl = new URL(effectiveUrl);
                const _proxyBase = new URL(_proxyUrl);
                effectiveUrl = _proxyBase.origin + _proxyBase.pathname.replace(/\/+$/, '') + _origUrl.pathname + _origUrl.search;
                console.log(`[Cupcake PM] CORS Proxy active → ${effectiveUrl}`);
            } catch (_e) {
                console.error(`[Cupcake PM] ❌ Invalid proxyUrl "${_proxyUrl}" — proxy NOT applied. URL 형식을 확인하세요 (예: https://my-server.kr/proxy).`, _e);
            }
        } else if (!_proxyUrl && effectiveUrl) {
            console.log(`[Cupcake PM] No proxyUrl configured for ${effectiveUrl.substring(0, 60)} — direct request mode`);
        }

        // ── Core fetch logic (wrapped for key rotation) ──
        const _doCustomFetch = async (/** @type {string} */ _apiKey) => {
            const _parseNonStreamingData = (/** @type {any} */ data) => {
                if (format === 'anthropic') return parseClaudeNonStreamingResponse(data, {}, _reqId);
                if (format === 'google') return parseGeminiNonStreamingResponse(data, config, _reqId);
                if (_isResponsesEndpoint) return parseResponsesAPINonStreamingResponse(data, _reqId);
                return parseOpenAINonStreamingResponse(data, _reqId);
            };

            const _executeRequest = async (/** @type {() => Promise<any>} */ requestFactory, /** @type {string} */ label, maxAttempts = 3) => {
                let attempt = 0;
                let response;

                while (attempt < maxAttempts) {
                    response = await requestFactory();
                    if (response?.ok) return response;

                    const status = response?.status || 0;
                    if (!_isRetriableHttpStatus(status) || attempt >= maxAttempts - 1 || abortSignal?.aborted) {
                        return response;
                    }

                    response?.body?.cancel?.();
                    attempt++;
                    const retryAfterMs = _parseRetryAfterMs(response?.headers);
                    const exponentialDelay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
                    const retryDelay = retryAfterMs || exponentialDelay;
                    console.warn(`[Cupcake PM] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status} (delay: ${retryDelay}ms)`);
                    await sleep(retryDelay);
                }

                return response;
            };

            const _toNonStreamingUrl = (/** @type {string} */ urlValue) => {
                let nextUrl = String(urlValue || effectiveUrl || '');
                if (format === 'google') {
                    nextUrl = nextUrl.replace(':streamGenerateContent', ':generateContent');
                    nextUrl = nextUrl.replace(/([?&])alt=sse(&)?/i, (/** @type {string} */ _m, /** @type {string} */ sep, /** @type {string} */ tail) => (tail ? sep : ''));
                    nextUrl = nextUrl.replace(/\?&/, '?').replace(/[?&]$/, '');
                }
                return nextUrl;
            };

            const _initialApiKey = String(_apiKey || '').trim();
            /** @type {Record<string, string>} */
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_initialApiKey}` };
            /** @type {Window & typeof globalThis & { _cpmCopilotMachineId?: string, _cpmCopilotSessionId?: string }} */
            const _win = /** @type {any} */ (window);

            // Direct Anthropic API: x-api-key header
            if (format === 'anthropic' && effectiveUrl && effectiveUrl.includes('api.anthropic.com')) {
                delete headers['Authorization'];
                headers['x-api-key'] = _initialApiKey;
            }

            // Copilot via CORS proxy still needs the raw GitHub OAuth token so the worker can
            // exchange it for a Copilot API token server-side.
            if (_isProxied && _isCopilotDomain) {
                let proxiedCopilotToken = _initialApiKey;
                if (!proxiedCopilotToken) {
                    const _githubToken = await safeGetArg('tools_githubCopilotToken');
                    proxiedCopilotToken = String(_githubToken || '').replace(/[^\x20-\x7E]/g, '').trim();
                }

                if (!proxiedCopilotToken) {
                    return {
                        success: false,
                        content: '[Cupcake PM] CORS Proxy 사용 시 GitHub Copilot OAuth 토큰이 필요합니다. Copilot Manager 토큰 또는 커스텀 모델 API Key에 OAuth 토큰을 넣어 주세요.'
                    };
                }

                headers['Authorization'] = `Bearer ${proxiedCopilotToken}`;
            }

            // Copilot headers — skip when using CORS proxy (proxy handles token exchange + headers)
            if (!_isProxied && effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
                const copilotNodelessMode = normalizeCopilotNodelessMode(await safeGetArg('cpm_copilot_nodeless_mode'));
                const useLegacyHeaders = shouldUseLegacyCopilotRequestHeaders(copilotNodelessMode);
                let copilotApiToken = config.copilotToken || '';
                if (!copilotApiToken) copilotApiToken = await ensureCopilotApiToken();
                if (copilotApiToken) {
                    headers['Authorization'] = `Bearer ${copilotApiToken}`;
                } else {
                    // Do NOT proceed with the raw OAuth token — the Copilot completions
                    // API rejects it with "Authorization header is badly formatted".
                    console.error('[Cupcake PM] Copilot: Token exchange failed — cannot authenticate.');
                    return { success: false, content: '[Cupcake PM] Copilot API 토큰 교환 실패. GitHub Copilot OAuth 토큰이 유효한지 확인하세요. (Token exchange failed — check your Copilot OAuth token.)' };
                }

                if (!_win._cpmCopilotMachineId) {
                    _win._cpmCopilotMachineId = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                }
                if (!_win._cpmCopilotSessionId) _win._cpmCopilotSessionId = safeUUID() + Date.now().toString();

                Object.assign(headers, getCopilotStaticHeaders(copilotNodelessMode));
                if (!useLegacyHeaders) {
                    headers['Vscode-Machineid'] = _win._cpmCopilotMachineId;
                    headers['Vscode-Sessionid'] = _win._cpmCopilotSessionId;
                    headers['X-Interaction-Id'] = safeUUID();
                    headers['X-Request-Id'] = safeUUID();
                }

                if (format === 'anthropic') headers['anthropic-version'] = '2023-06-01';

                const _visionMsgArr = body.messages || body.input || [];
                const hasVisionContent = _visionMsgArr.some((/** @type {any} */ m) =>
                    Array.isArray(m?.content) && m.content.some((/** @type {any} */ p) => p.type === 'image_url' || p.type === 'image')
                );
                if (hasVisionContent) headers['Copilot-Vision-Request'] = 'true';
            }

            // Anthropic beta headers (non-Copilot)
            if (format === 'anthropic') {
                const _isCopilotAnthropic = _isCopilotDomain || _isProxied;
                if (_isCopilotAnthropic && _isProxied) {
                    // Copilot via CORS proxy — only anthropic-version needed (proxy handles the rest)
                    headers['anthropic-version'] = '2023-06-01';
                } else if (!_isCopilotAnthropic) {
                    const _anthropicBetas = [];
                    const _effectiveMaxTokens = body.max_tokens || maxTokens || 0;
                    if (_effectiveMaxTokens > 8192) _anthropicBetas.push('output-128k-2025-02-19');
                    if (_anthropicBetas.length > 0) headers['anthropic-beta'] = _anthropicBetas.join(',');
                    headers['anthropic-version'] = '2023-06-01';
                    headers['anthropic-dangerous-direct-browser-access'] = 'true';
                }
            }

            // ── Streaming ──
            const streamingEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);
            const perModelStreamingEnabled = (config.streaming === true) || (config.streaming !== false && !config.decoupled);
            const _compatActive = await safeGetBoolArg('cpm_compatibility_mode', false);
            // Copilot MUST stream — non-streaming causes guaranteed 524 (CF proxy timeout).
            // SSE parsing happens inside the plugin iframe; ReadableStream does NOT cross the bridge.
            const _isCopilotStreamUrl = !!(effectiveUrl && effectiveUrl.includes('githubcopilot.com'));
            const useStreaming = streamingEnabled && perModelStreamingEnabled && (!_compatActive || _isCopilotStreamUrl);
            if (streamingEnabled && _compatActive && !_isCopilotStreamUrl) {
                console.log(`[Cupcake PM] Compatibility mode active — forcing non-streaming (manual toggle).`);
            }
            if (!useStreaming && _isCopilotStreamUrl) {
                console.warn(`[Cupcake PM] Copilot request in non-stream mode. Long responses may return 524 via proxy.`);
            }

            if (useStreaming) {
                /** @type {any} */
                const streamBody = { ...body };
                let streamUrl = effectiveUrl;

                if (format === 'anthropic') {
                    streamBody.stream = true;
                } else if (format === 'google') {
                    streamUrl = effectiveUrl.replace(':generateContent', ':streamGenerateContent');
                    if (!streamUrl.includes('alt=')) streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'alt=sse';
                } else {
                    streamBody.stream = true;
                    if (!_isResponsesEndpoint) {
                        const _wantStreamUsage = await safeGetBoolArg('cpm_show_token_usage', false);
                        if (_wantStreamUsage) streamBody.stream_options = { include_usage: true };
                    }
                }

                const finalBody = sanitizeBodyJSON(safeStringify(streamBody));
                if (_reqId) updateApiRequest(_reqId, {
                    url: streamUrl,
                    requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
                    requestBody: (() => { try { return JSON.parse(finalBody); } catch { return finalBody; } })()
                });

                const res = await _executeRequest(
                    () => smartNativeFetch(streamUrl, { method: 'POST', headers, body: finalBody, signal: abortSignal }),
                    `${format} stream request`
                );
                if (_reqId) updateApiRequest(_reqId, { status: res.status });

                if (!res.ok) {
                    const errBody = await res.text();
                    if (_reqId) updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                    return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
                }

                const _hasReadableStreamBody = !!(res?.body && typeof res.body.getReader === 'function');
                if (!_hasReadableStreamBody) {
                    // Copilot: non-streaming fallback causes 524 — return error immediately
                    if (_isCopilotStreamUrl) {
                        console.error(`[Cupcake PM] Copilot streaming response body unavailable (no ReadableStream). Cannot fall back to non-streaming (would cause 524).`);
                        return { success: false, content: `[Cupcake PM] Copilot 스트리밍 응답 본문을 읽을 수 없습니다. ReadableStream이 지원되지 않는 환경입니다. 호환성 모드를 확인하거나 브라우저를 업데이트해 주세요.`, _status: 0 };
                    }
                    console.warn(`[Cupcake PM] Streaming response body unavailable for ${format}; retrying as non-streaming.`);
                    const fallbackUrl = _toNonStreamingUrl(streamUrl);
                    const fallbackBodyObj = { ...body };
                    delete fallbackBodyObj.stream_options;
                    if (format !== 'google') fallbackBodyObj.stream = false;
                    const fallbackBody = sanitizeBodyJSON(safeStringify(fallbackBodyObj));
                    const fallbackRes = await _executeRequest(
                        () => smartNativeFetch(fallbackUrl, { method: 'POST', headers, body: fallbackBody, signal: abortSignal }),
                        `${format} non-stream fallback`
                    );
                    if (_reqId) updateApiRequest(_reqId, { status: fallbackRes.status });
                    if (!fallbackRes.ok) {
                        const errBody = await fallbackRes.text();
                        if (_reqId) updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                        return { success: false, content: `[Custom API Error ${fallbackRes.status}] ${errBody}`, _status: fallbackRes.status };
                    }
                    const fallbackText = await fallbackRes.text();
                    let fallbackData;
                    try {
                        fallbackData = JSON.parse(fallbackText);
                    } catch (_jsonErr) {
                        const contentType = fallbackRes.headers?.get?.('content-type') || 'unknown';
                        if (_reqId) updateApiRequest(_reqId, { response: `[Parse Error: content-type=${contentType}]\n${fallbackText.substring(0, 4000)}` });
                        return { success: false, content: `[Custom API Error] Response is not JSON (${contentType}): ${fallbackText.substring(0, 1000)}`, _status: fallbackRes.status };
                    }
                    if (_reqId) updateApiRequest(_reqId, { response: fallbackData });
                    return _parseNonStreamingData(fallbackData);
                }

                if (_reqId) updateApiRequest(_reqId, { response: '(streaming…)' });

                if (format === 'anthropic') {
                    const _showThinkingInStream = await safeGetBoolArg('cpm_streaming_show_thinking', true);
                    return { success: true, content: createAnthropicSSEStream(res, abortSignal, _reqId, { showThinking: _showThinkingInStream }) };
                } else if (format === 'google') {
                    config._tokenUsageReqId = _reqId;
                    const _onComplete = () => saveThoughtSignatureFromStream(config, _reqId);
                    return { success: true, content: createSSEStream(res, (/** @type {string} */ line) => parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
                } else if (_isResponsesEndpoint) {
                    return { success: true, content: createResponsesAPISSEStream(res, abortSignal, _reqId) };
                } else {
                    return { success: true, content: createOpenAISSEStream(res, abortSignal, _reqId) };
                }
            }

            // ── Non-streaming fallback ──
            const _nonStreamBody = sanitizeBodyJSON(safeStringify(body));
            if (_reqId) updateApiRequest(_reqId, {
                url: effectiveUrl,
                requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
                requestBody: (() => { try { return JSON.parse(_nonStreamBody); } catch { return _nonStreamBody; } })()
            });

            const res = await _executeRequest(
                () => smartNativeFetch(effectiveUrl, { method: 'POST', headers, body: _nonStreamBody, signal: abortSignal }),
                `${format} request`
            );
            if (_reqId) updateApiRequest(_reqId, { status: res.status });

            if (!res.ok) {
                const errBody = await res.text();
                if (_reqId) updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
            }

            const _rawResponseText = await res.text();
            if (_reqId) updateApiRequest(_reqId, { response: _rawResponseText.substring(0, 4000) });

            let data;
            try {
                data = JSON.parse(_rawResponseText);
            } catch (_jsonErr) {
                const contentType = res.headers?.get?.('content-type') || 'unknown';
                if (_reqId) updateApiRequest(_reqId, { response: `[Parse Error: content-type=${contentType}]\n${_rawResponseText.substring(0, 4000)}` });
                return { success: false, content: `[Custom API Error] Response is not JSON (${contentType}): ${_rawResponseText.substring(0, 1000)}`, _status: res.status };
            }
            if (_reqId) updateApiRequest(_reqId, { response: data });

            return _parseNonStreamingData(data);
        };

        // ── Key Rotation dispatch ──
        if (_useKeyRotation) {
            const _rotationPoolName = `_cpm_custom_inline_${config.model || 'unknown'}`;
            /** @type {Record<string, any>} */ (KeyPool._pools)[_rotationPoolName] = { lastRaw: _rawKeys, keys: [..._keyPool], _inline: true };
            return KeyPool.withRotation(_rotationPoolName, _doCustomFetch);
        }
        return _doCustomFetch(_allKeys[0] || '');
    }

    // @ts-check
    /**
     * router.js — Main request router and provider dispatch.
     * handleRequest is the entry point called by RisuAI for every API request.
     * fetchByProviderId dispatches to the correct provider fetcher.
     */

    /**
     * @typedef {Object} ModelDef
     * @property {string} provider - Provider name (e.g. 'CustomOpenAI')
     * @property {string} name - Display name
     * @property {string} [uniqueId] - Unique identifier for custom models
     */

    /**
     * @typedef {Object} RequestResult
     * @property {boolean} success
     * @property {string|ReadableStream} content
     * @property {number} [_status]
     */

    // ── Helpers ──

    /**
     * Parse value to finite float or undefined.
     * @param {*} v
     * @returns {number|undefined}
     */
    function _toFiniteFloat(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : undefined;
    }

    /**
     * Parse value to finite integer or undefined.
     * @param {*} v
     * @returns {number|undefined}
     */
    function _toFiniteInt(v) {
        const n = parseInt(v);
        return Number.isFinite(n) ? n : undefined;
    }

    // ── Provider Dispatch ──

    /**
     * Dispatch request to the correct provider fetcher.
     * @param {ModelDef} modelDef
     * @param {Record<string, any>} args - Request arguments from RisuAI
     * @param {AbortSignal} [abortSignal]
     * @param {string} [_reqId] - Request ID for logging
     * @returns {Promise<RequestResult>}
     */
    async function fetchByProviderId(modelDef, args, abortSignal, _reqId) {
        const cpmFallbackTemp = await safeGetArg('cpm_fallback_temp');
        const cpmFallbackMaxTokens = await safeGetArg('cpm_fallback_max_tokens');
        const cpmFallbackTopP = await safeGetArg('cpm_fallback_top_p');
        const cpmFallbackFreqPen = await safeGetArg('cpm_fallback_freq_pen');
        const cpmFallbackPresPen = await safeGetArg('cpm_fallback_pres_pen');

        const fallbackTemp = cpmFallbackTemp !== '' ? _toFiniteFloat(cpmFallbackTemp) : undefined;
        const fallbackMaxTokens = cpmFallbackMaxTokens !== '' ? _toFiniteInt(cpmFallbackMaxTokens) : undefined;
        const temp = args.temperature ?? fallbackTemp;
        const maxTokens = args.max_tokens ?? fallbackMaxTokens;

        if (args.top_p === undefined && cpmFallbackTopP !== '') {
            const n = _toFiniteFloat(cpmFallbackTopP);
            if (n !== undefined) args.top_p = n;
        }
        if (args.frequency_penalty === undefined && cpmFallbackFreqPen !== '') {
            const n = _toFiniteFloat(cpmFallbackFreqPen);
            if (n !== undefined) args.frequency_penalty = n;
        }
        if (args.presence_penalty === undefined && cpmFallbackPresPen !== '') {
            const n = _toFiniteFloat(cpmFallbackPresPen);
            if (n !== undefined) args.presence_penalty = n;
        }

        const rawChat = args.prompt_chat;
        const messages = sanitizeMessages(rawChat);

        try {
            const fetcher = customFetchers[modelDef.provider];
            if (fetcher) return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal, _reqId);

            if (modelDef.provider.startsWith('Custom')) {
                const cDef = /** @type {Record<string, any>|undefined} */ (state.CUSTOM_MODELS_CACHE.find((/** @type {any} */ m) => m.uniqueId === modelDef.uniqueId));
                if (!cDef) return { success: false, content: `[Cupcake PM] Custom model config not found.` };

                return await fetchCustom({
                    url: cDef.url, key: cDef.key, model: cDef.model, proxyUrl: cDef.proxyUrl || '',
                    format: cDef.format || 'openai',
                    sysfirst: !!cDef.sysfirst, altrole: !!cDef.altrole,
                    mustuser: !!cDef.mustuser, maxout: !!cDef.maxout, mergesys: !!cDef.mergesys,
                    reasoning: cDef.reasoning || 'none', verbosity: cDef.verbosity || 'none',
                    responsesMode: cDef.responsesMode || 'auto',
                    thinking_level: cDef.thinking || 'none', tok: cDef.tok || 'o200k_base',
                    thinkingBudget: parseInt(cDef.thinkingBudget) || 0,
                    maxOutputLimit: parseInt(cDef.maxOutputLimit) || 0,
                    promptCacheRetention: cDef.promptCacheRetention || 'none',
                    decoupled: !!cDef.decoupled, thought: !!cDef.thought,
                    streaming: (cDef.streaming === true) || (cDef.streaming !== false && !cDef.decoupled),
                    showThoughtsToken: !!cDef.thought, useThoughtSignature: !!cDef.thought,
                    customParams: cDef.customParams || '', copilotToken: '',
                    effort: cDef.effort || 'none',
                    adaptiveThinking: !!cDef.adaptiveThinking
                }, messages, temp, maxTokens, args, abortSignal, _reqId);
            }
            return { success: false, content: `[Cupcake PM] Unknown provider selected: ${modelDef.provider}` };
        } catch (_e) {
            const e = /** @type {Error} */ (_e);
            return { success: false, content: `[Cupcake PM Crash] ${e.message}` };
        }
    }

    // ── Main Router ──

    /**
     * Main request router — entry point called by RisuAI for every API request.
     * Handles slot inference, parameter overrides, logging, and streaming.
     * @param {Record<string, any>} args - Request arguments from RisuAI
     * @param {ModelDef} activeModelDef - Currently selected model definition
     * @param {AbortSignal} [abortSignal]
     * @returns {Promise<RequestResult>}
     */
    async function handleRequest(args, activeModelDef, abortSignal) {
        args = (args && typeof args === 'object') ? args : {};
        if (!activeModelDef || typeof activeModelDef !== 'object' || !activeModelDef.provider) {
            return { success: false, content: '[Cupcake PM] Invalid model selection.' };
        }

        // V3 forces args.mode='v3', so we infer the slot from CPM's own slot config.
        // inferSlot now returns { slot, heuristicConfirmed } — always runs content
        // heuristics to guard against same-model-in-main-and-aux collision.
        const slotResult = await inferSlot(activeModelDef, args);
        const slot = slotResult.slot;
        const targetDef = activeModelDef;

        // Apply slot-specific generation param overrides (only when heuristically confirmed)
        if (slot !== 'chat') {
            if (!slotResult.heuristicConfirmed) {
                // This shouldn't normally happen (inferSlot returns 'chat' when unconfirmed),
                // but guard just in case.
                console.warn(`[Cupcake PM] ⚠️ Slot '${slot}' detected but NOT heuristically confirmed. Skipping CPM overrides — using Risu params.`);
            } else {
                const maxOut = await safeGetArg(`cpm_slot_${slot}_max_out`);
                const maxCtx = await safeGetArg(`cpm_slot_${slot}_max_context`);
                const slotTemp = await safeGetArg(`cpm_slot_${slot}_temp`);
                const topP = await safeGetArg(`cpm_slot_${slot}_top_p`);
                const topK = await safeGetArg(`cpm_slot_${slot}_top_k`);
                const repPen = await safeGetArg(`cpm_slot_${slot}_rep_pen`);
                const freqPen = await safeGetArg(`cpm_slot_${slot}_freq_pen`);
                const presPen = await safeGetArg(`cpm_slot_${slot}_pres_pen`);

                if (maxOut !== '') { const n = _toFiniteInt(maxOut); if (n !== undefined) args.max_tokens = n; }
                if (maxCtx !== '') { const n = _toFiniteInt(maxCtx); if (n !== undefined) args.max_context_tokens = n; }
                if (slotTemp !== '') { const n = _toFiniteFloat(slotTemp); if (n !== undefined) args.temperature = n; }
                if (topP !== '') { const n = _toFiniteFloat(topP); if (n !== undefined) args.top_p = n; }
                if (topK !== '') { const n = _toFiniteInt(topK); if (n !== undefined) args.top_k = n; }
                if (repPen !== '') { const n = _toFiniteFloat(repPen); if (n !== undefined) args.repetition_penalty = n; }
                if (freqPen !== '') { const n = _toFiniteFloat(freqPen); if (n !== undefined) args.frequency_penalty = n; }
                if (presPen !== '') { const n = _toFiniteFloat(presPen); if (n !== undefined) args.presence_penalty = n; }
            }
        }

        // Centralized API Request Logging
        const _displayName = `[${targetDef.provider}] ${targetDef.name}`;
        const _reqId = storeApiRequest({
            timestamp: new Date().toISOString(),
            modelName: _displayName,
            url: '', method: 'POST', headers: {},
            body: { slot, temperature: args.temperature, max_tokens: args.max_tokens, messageCount: args.prompt_chat?.length || 0 },
            response: null, status: null, duration: null
        });
        const _startTime = Date.now();

        let result;
        try {
            result = await fetchByProviderId(targetDef, args, abortSignal, _reqId);
        } catch (_e) {
            const e = /** @type {Error} */ (_e);
            updateApiRequest(_reqId, { duration: Date.now() - _startTime, status: 'crash', response: `[CRASH] ${e.message}` });
            console.error(`[CupcakePM] 💥 Request crashed (${_displayName}):`, e);
            try { Risu.log(`💥 CRASH (${_displayName}): ${e.message}`); } catch {}
            throw e;
        }

        // Normalize malformed provider returns
        if (!result || typeof result !== 'object') {
            result = { success: false, content: `[Cupcake PM Error] Invalid provider result type: ${typeof result}` };
        }
        if (typeof result.success !== 'boolean') result.success = !!result.success;
        if (result.content == null) result.content = '';

        updateApiRequest(_reqId, {
            duration: Date.now() - _startTime,
            status: result.success ? (result._status || 200) : (result._status || 'error')
        });

        const _nonStreamTokenUsage = _takeTokenUsage(_reqId, false);
        const _showTokens = await safeGetBoolArg('cpm_show_token_usage', false);
        const _logResponse = (/** @type {any} */ contentStr, prefix = '📥 Response') => {
            const safeContent = typeof contentStr === 'string' ? contentStr : (contentStr == null ? '' : String(contentStr));
            updateApiRequest(_reqId, { response: safeContent.substring(0, 4000) });
            console.log(`[CupcakePM] ${prefix} (${_displayName}):`, safeContent.substring(0, 2000));
            try { Risu.log(`${prefix} (${_displayName}): ${safeContent.substring(0, 500)}`); } catch {}
        };

        // Streaming pass-through
        if (result && result.success && result.content instanceof ReadableStream) {
            const streamEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);

            if (streamEnabled) {
                const bridgeCapable = await checkStreamCapability();
                if (bridgeCapable) {
                    /** @type {any[]} */
                    const _chunks = [];
                    let _chunksTotalBytes = 0;
                    let _chunksOverflow = false;
                    const _STREAM_LOG_MAX_BYTES = 512 * 1024; // 512 KB cap for logging buffer
                    const _streamDecoder = new TextDecoder();
                    const _streamStartTime = _startTime;
                    const _streamModelName = _displayName;
                    const _streamShowTokens = _showTokens;
                    result.content = result.content.pipeThrough(new TransformStream({
                        transform(chunk, controller) {
                            controller.enqueue(chunk);
                            if (!_chunksOverflow) {
                                const _sz = chunk.byteLength || chunk.length || 0;
                                if (_chunksTotalBytes + _sz <= _STREAM_LOG_MAX_BYTES) {
                                    _chunks.push(chunk);
                                    _chunksTotalBytes += _sz;
                                } else {
                                    _chunksOverflow = true;
                                }
                            }
                        },
                        flush() {
                            const full = _chunks.map((c) => {
                                if (typeof c === 'string') return c;
                                if (c instanceof Uint8Array) return _streamDecoder.decode(c, { stream: true });
                                if (c instanceof ArrayBuffer) return _streamDecoder.decode(new Uint8Array(c), { stream: true });
                                return String(c ?? '');
                            }).join('') + _streamDecoder.decode();
                            _logResponse(_chunksOverflow ? full + '\n[...truncated for logging]' : full, '📥 Streamed Response');
                            const streamUsage = _takeTokenUsage(_reqId, true);
                            if (_streamShowTokens && streamUsage) showTokenUsageToast(_streamModelName, streamUsage, Date.now() - _streamStartTime);
                        }
                    }));
                    console.log('[Cupcake PM] ✓ Streaming: returning ReadableStream to RisuAI');
                } else {
                    console.warn('[Cupcake PM] ⚠ Streaming enabled but V3 bridge cannot transfer ReadableStream. Falling back to collected string.');
                    result.content = await collectStream(result.content);
                    _logResponse(result.content);
                    const _collectedUsage = _takeTokenUsage(_reqId, true);
                    if (_showTokens && _collectedUsage) showTokenUsageToast(_displayName, _collectedUsage, Date.now() - _startTime);
                }
            } else {
                result.content = await collectStream(result.content);
                _logResponse(result.content);
                const _collectedUsage2 = _takeTokenUsage(_reqId, true);
                if (_showTokens && _collectedUsage2) showTokenUsageToast(_displayName, _collectedUsage2, Date.now() - _startTime);
            }
        } else if (result) {
            const contentStr = typeof result.content === 'string'
                ? result.content
                : (() => { try { const s = JSON.stringify(result.content); return s == null ? String(result.content) : s; } catch { return String(result.content); } })();
            _logResponse(contentStr);
            if (_showTokens && _nonStreamTokenUsage) showTokenUsageToast(_displayName, _nonStreamTokenUsage, Date.now() - _startTime);
        }

        return result;
    }

    // @ts-check
    /**
     * cupcake-api.js — window.CupcakePM global API surface.
     * Public API that sub-plugins use to register providers and access CPM internals.
     */

    /** @typedef {Window & typeof globalThis & { CupcakePM?: any }} CupcakeWindow */

    /**
     * Initialize the window.CupcakePM global object.
     * Must be called after all modules are loaded.
     */
    function setupCupcakeAPI() {
        /** @type {CupcakeWindow} */
        const cupcakeWindow = window;
        cupcakeWindow.CupcakePM = {
            customFetchers,
            registeredProviderTabs,
            /** @param {{ name: string, models: any[], fetcher: any, settingsTab: any, fetchDynamicModels: any }} _opts */
            registerProvider({ name, models, fetcher, settingsTab, fetchDynamicModels }) {
                // ── Duplicate guard: remove previous registration for same provider name ──
                // customFetchers[name] is object-keyed so natural overwrite is fine.
                // Models, tabs, and dynamic fetchers are arrays — deduplicate.
                state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(
                    (/** @type {any} */ m) => m.provider !== name
                );
                const existingTabIdx = registeredProviderTabs.findIndex(
                    (/** @type {any} */ t) => t && t.providerName === name
                );
                if (existingTabIdx !== -1) registeredProviderTabs.splice(existingTabIdx, 1);
                const existingFetcherIdx = pendingDynamicFetchers.findIndex(
                    (/** @type {any} */ f) => f.name === name
                );
                if (existingFetcherIdx !== -1) pendingDynamicFetchers.splice(existingFetcherIdx, 1);

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
            setArg: (/** @type {string} */ k, /** @type {any} */ v) => Risu.setArgument(k, String(v)),
            // Key Rotation API
            pickKey: (/** @type {string} */ argName) => KeyPool.pick(argName),
            drainKey: (/** @type {string} */ argName, /** @type {string} */ failedKey) => KeyPool.drain(argName, failedKey),
            keyPoolRemaining: (/** @type {string} */ argName) => KeyPool.remaining(argName),
            resetKeyPool: (/** @type {string} */ argName) => KeyPool.reset(argName),
            withKeyRotation: (/** @type {string} */ argName, /** @type {(key: string) => Promise<any>} */ fetchFn, /** @type {any} */ opts) => KeyPool.withRotation(argName, fetchFn, opts),
            // JSON Credential Rotation API
            pickJsonKey: (/** @type {string} */ argName) => KeyPool.pickJson(argName),
            withJsonKeyRotation: (/** @type {string} */ argName, /** @type {(key: string) => Promise<any>} */ fetchFn, /** @type {any} */ opts) => KeyPool.withJsonRotation(argName, fetchFn, opts),
            get vertexTokenCache() { return state.vertexTokenCache; },
            set vertexTokenCache(v) { state.vertexTokenCache = v; },
            AwsV4Signer,
            checkStreamCapability,
            hotReload: (/** @type {string} */ pluginId) => SubPluginManager.hotReload(pluginId),
            hotReloadAll: () => SubPluginManager.hotReloadAll(),
            registerCleanup(/** @type {Function} */ cleanupFn) {
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
            addCustomModel(/** @type {Record<string, any>} */ modelDef, tag = '') {
                try {
                    let existingIdx = -1;
                    if (tag) existingIdx = state.CUSTOM_MODELS_CACHE.findIndex(m => /** @type {Record<string, any>} */ (m)._tag === tag);
                    if (existingIdx !== -1) {
                        state.CUSTOM_MODELS_CACHE[existingIdx] = { ...state.CUSTOM_MODELS_CACHE[existingIdx], ...modelDef, _tag: tag };
                        Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                        return { success: true, created: false, uniqueId: /** @type {Record<string, any>} */ (state.CUSTOM_MODELS_CACHE[existingIdx]).uniqueId };
                    } else {
                        const uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                        /** @type {Record<string, any>} */
                        const entry = { ...modelDef, uniqueId, _tag: tag || undefined };
                        state.CUSTOM_MODELS_CACHE.push(entry);
                        state.ALL_DEFINED_MODELS.push({ uniqueId, id: entry.model, name: entry.name || uniqueId, provider: 'Custom' });
                        Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                        return { success: true, created: true, uniqueId };
                    }
                } catch (e) {
                    return { success: false, created: false, uniqueId: '', error: /** @type {Error} */ (e).message };
                }
            },
            smartFetch: async (/** @type {string} */ url, /** @type {Record<string, any>} */ options = {}) => smartNativeFetch(url, options),
            smartNativeFetch: async (/** @type {string} */ url, /** @type {Record<string, any>} */ options = {}) => smartNativeFetch(url, options),
            ensureCopilotApiToken: () => ensureCopilotApiToken(),
            _normalizeTokenUsage,
        };
    }

    // @ts-check

    const CUSTOM_MODEL_DEFAULTS = {
        streaming: false,
    };

    /** @param {any} value */
    function toText(value) {
        return value == null ? '' : String(value);
    }

    /** @param {any} value */
    function toInteger(value) {
        const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /** @param {any} value */
    function toBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
        }
        return false;
    }

    /**
     * @param {any} value
     * @returns {Array<Record<string, any>>}
     */
    function parseCustomModelsValue(value) {
        if (Array.isArray(value)) return value.filter(entry => entry && typeof entry === 'object');
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object') : [];
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * @param {Record<string, any>} raw
     * @param {{ includeKey?: boolean, includeUniqueId?: boolean, includeTag?: boolean, includeExportMarker?: boolean }} [options]
     */
    function normalizeCustomModel(raw, options = {}) {
        const {
            includeKey = true,
            includeUniqueId = true,
            includeTag = true,
            includeExportMarker = false,
        } = options;

        const hasStreaming = raw && Object.prototype.hasOwnProperty.call(raw, 'streaming');
        const hasDecoupled = raw && Object.prototype.hasOwnProperty.call(raw, 'decoupled');
        const streaming = hasStreaming ? toBool(raw.streaming) : (hasDecoupled ? !toBool(raw.decoupled) : CUSTOM_MODEL_DEFAULTS.streaming);
        const decoupled = hasDecoupled ? toBool(raw.decoupled) : !streaming;

        /** @type {Record<string, any>} */
        const normalized = {
            name: toText(raw?.name),
            model: toText(raw?.model),
            url: toText(raw?.url),
            proxyUrl: (() => {
                let _pUrl = toText(raw?.proxyUrl).trim();
                // Auto-prepend https:// for bare domains on save
                if (_pUrl && !/^https?:\/\//i.test(_pUrl)) _pUrl = 'https://' + _pUrl;
                return _pUrl;
            })(),
            format: toText(raw?.format || 'openai') || 'openai',
            tok: toText(raw?.tok || 'o200k_base') || 'o200k_base',
            responsesMode: toText(raw?.responsesMode || 'auto') || 'auto',
            thinking: toText(raw?.thinking || 'none') || 'none',
            thinkingBudget: toInteger(raw?.thinkingBudget),
            maxOutputLimit: toInteger(raw?.maxOutputLimit),
            promptCacheRetention: toText(raw?.promptCacheRetention || 'none') || 'none',
            reasoning: toText(raw?.reasoning || 'none') || 'none',
            verbosity: toText(raw?.verbosity || 'none') || 'none',
            effort: toText(raw?.effort || 'none') || 'none',
            sysfirst: toBool(raw?.sysfirst),
            mergesys: toBool(raw?.mergesys),
            altrole: toBool(raw?.altrole),
            mustuser: toBool(raw?.mustuser),
            maxout: toBool(raw?.maxout),
            streaming,
            decoupled,
            thought: toBool(raw?.thought),
            adaptiveThinking: toBool(raw?.adaptiveThinking),
            customParams: toText(raw?.customParams),
        };

        if (includeKey) normalized.key = toText(raw?.key);
        if (includeUniqueId && raw?.uniqueId) normalized.uniqueId = toText(raw.uniqueId);
        if (includeTag && raw?._tag) normalized._tag = raw._tag;
        if (includeExportMarker) normalized._cpmModelExport = true;

        return normalized;
    }

    /** @param {Record<string, any>} raw */
    function serializeCustomModelExport(raw) {
        return normalizeCustomModel(raw, {
            includeKey: false,
            includeUniqueId: false,
            includeTag: false,
            includeExportMarker: true,
        });
    }

    /**
     * @param {any} value
     * @param {{ includeKey?: boolean }} [options]
     */
    function serializeCustomModelsSetting(value, options = {}) {
        const { includeKey = false } = options;
        return JSON.stringify(parseCustomModelsValue(value).map(model => normalizeCustomModel(model, { includeKey })));
    }

    // @ts-check
    /**
     * settings-ui-custom-models.js — Custom Models Manager UI.
     * Extracted from settings-ui.js for modularity.
     * Handles the custom model editor form, CRUD, import/export of model definitions.
     */

    /** @typedef {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} FormField */

    /** @param {string} id */
    function getElement$1(id) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`[CPM] Missing element: ${id}`);
        return el;
    }

    /** @param {string} id */
    function getField(id) {
        return /** @type {FormField} */ (getElement$1(id));
    }

    /** @param {string} id */
    function getCheckbox(id) {
        return /** @type {HTMLInputElement} */ (getElement$1(id));
    }

    /** @param {string} id */
    function getContainer(id) {
        return /** @type {HTMLElement} */ (getElement$1(id));
    }

    /** @param {string} id */
    function getButton(id) {
        return /** @type {HTMLButtonElement} */ (getElement$1(id));
    }

    /** @param {EventTarget|null} eventTarget */
    function getFileInputFiles(eventTarget) {
        return Array.from((/** @type {HTMLInputElement} */ (eventTarget)).files || []);
    }

    /** @param {EventTarget|null} eventTarget */
    function getDatasetIndex(eventTarget) {
        const idx = (/** @type {HTMLElement} */ (eventTarget)).dataset.idx;
        return typeof idx === 'string' ? parseInt(idx, 10) : -1;
    }

    // ── Helper: Custom model editor HTML ──
    /**
     * @param {Array<{value: string, text: string}>} thinkingList
     * @param {Array<{value: string, text: string}>} reasoningList
     * @param {Array<{value: string, text: string}>} verbosityList
     * @param {Array<{value: string, text: string}>} effortList
     */
    function renderCustomModelEditor(thinkingList, reasoningList, verbosityList, effortList) {
        return `
        <div id="cpm-cm-editor" class="hidden mt-6 bg-gray-900 border border-gray-700 rounded-lg p-6 relative">
            <h4 class="text-xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2" id="cpm-cm-editor-title">Edit Custom Model</h4>
            <input type="hidden" id="cpm-cm-id" value="">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2 text-xs text-blue-300 mb-2 border-l-4 border-blue-500 pl-3">고급 옵션이 필요 없는 경우, 필수 항목만 입력하고 저장하세요.</div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Display Name</label><input type="text" id="cpm-cm-name" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Model Name</label><input type="text" id="cpm-cm-model" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">Base URL</label><input type="text" id="cpm-cm-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">API Key (여러 개 → 공백/줄바꿈 구분 → 자동 키회전)</label><textarea id="cpm-cm-key" rows="2" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm" spellcheck="false" placeholder="sk-xxxx"></textarea></div>
                <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-400 mb-1">CORS Proxy URL <span class="text-xs text-yellow-400">(선택사항 — 모든 API에 적용 가능. 도메인을 프록시로 교체합니다)</span></label><input type="text" id="cpm-cm-proxy-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm" placeholder="https://my-proxy.example.com/proxy (비워두면 직접 요청)"></div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4"><h5 class="text-sm font-bold text-gray-300 mb-3">Model Parameters</h5></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">API Format</label><select id="cpm-cm-format" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="google">Google Gemini</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Tokenizer</label><select id="cpm-cm-tok" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="o200k_base">o200k_base</option><option value="llama3">llama3</option><option value="claude">Claude</option><option value="gemma">Gemma</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Responses API Mode</label><select id="cpm-cm-responses-mode" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Level</label><select id="cpm-cm-thinking" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${thinkingList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Budget Tokens (0=끄기)</label><input type="number" id="cpm-cm-thinking-budget" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Max Output Tokens (0=제한없음)</label><input type="number" id="cpm-cm-max-output" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0"></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Prompt Cache Retention</label><select id="cpm-cm-prompt-cache-retention" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="none">None</option><option value="in_memory">In-Memory</option><option value="24h">24h Extended</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Reasoning Effort</label><select id="cpm-cm-reasoning" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${reasoningList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Response Verbosity</label><select id="cpm-cm-verbosity" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${verbosityList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Anthropic Effort</label><select id="cpm-cm-effort" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${effortList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                    <h5 class="text-sm font-bold text-gray-300 mb-3">Formatter Flags</h5>
                    <div class="space-y-2">
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-sysfirst" class="form-checkbox bg-gray-800"> <span>hasFirstSystemPrompt</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mergesys" class="form-checkbox bg-gray-800"> <span>mergeSystemPrompt</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-altrole" class="form-checkbox bg-gray-800"> <span>requiresAlternateRole</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mustuser" class="form-checkbox bg-gray-800"> <span>mustStartWithUserInput</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-maxout" class="form-checkbox bg-gray-800"> <span>useMaxOutputTokensInstead</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-streaming" class="form-checkbox bg-gray-800"> <span>Use Streaming</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-thought" class="form-checkbox bg-gray-800"> <span>useThoughtSignature</span></label>
                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-adaptive-thinking" class="form-checkbox bg-gray-800"> <span>useAdaptiveThinking (적응형 사고)</span></label>
                    </div>
                </div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Parameters JSON (파일 경로 아님)</h5>
                    <textarea id="cpm-cm-custom-params" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white h-24 font-mono text-sm" spellcheck="false" placeholder="{}"></textarea>
                </div>
            </div>
            <div class="mt-4 flex justify-end space-x-3 border-t border-gray-800 pt-4">
                <button id="cpm-cm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Cancel</button>
                <button id="cpm-cm-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-bold shadow">Save Definition</button>
            </div>
        </div>
    `;
    }

    // ── Populate editor from model data ──
    /** @param {Record<string, any>} m */
    function populateEditor(m) {
        getField('cpm-cm-id').value = m.uniqueId;
        getField('cpm-cm-name').value = m.name || '';
        getField('cpm-cm-model').value = m.model || '';
        getField('cpm-cm-url').value = m.url || '';
        getField('cpm-cm-key').value = m.key || '';
        getField('cpm-cm-proxy-url').value = m.proxyUrl || '';
        getField('cpm-cm-format').value = m.format || 'openai';
        getField('cpm-cm-tok').value = m.tok || 'o200k_base';
        getField('cpm-cm-responses-mode').value = m.responsesMode || 'auto';
        getField('cpm-cm-thinking').value = m.thinking || 'none';
        getField('cpm-cm-thinking-budget').value = String(m.thinkingBudget || 0);
        getField('cpm-cm-max-output').value = String(m.maxOutputLimit || 0);
        getField('cpm-cm-prompt-cache-retention').value = m.promptCacheRetention || 'none';
        getField('cpm-cm-reasoning').value = m.reasoning || 'none';
        getField('cpm-cm-verbosity').value = m.verbosity || 'none';
        getField('cpm-cm-effort').value = m.effort || 'none';
        getCheckbox('cpm-cm-sysfirst').checked = !!m.sysfirst;
        getCheckbox('cpm-cm-mergesys').checked = !!m.mergesys;
        getCheckbox('cpm-cm-altrole').checked = !!m.altrole;
        getCheckbox('cpm-cm-mustuser').checked = !!m.mustuser;
        getCheckbox('cpm-cm-maxout').checked = !!m.maxout;
        getCheckbox('cpm-cm-streaming').checked = (m.streaming === true) || (m.streaming !== false && !m.decoupled);
        getCheckbox('cpm-cm-thought').checked = !!m.thought;
        getCheckbox('cpm-cm-adaptive-thinking').checked = !!m.adaptiveThinking;
        getField('cpm-cm-custom-params').value = m.customParams || '';
    }

    // ── Clear all editor fields ──
    function clearEditor() {
        ['name', 'model', 'url', 'key', 'proxy-url'].forEach(f => { getField(`cpm-cm-${f}`).value = ''; });
        getField('cpm-cm-format').value = 'openai';
        getField('cpm-cm-tok').value = 'o200k_base';
        getField('cpm-cm-responses-mode').value = 'auto';
        getField('cpm-cm-thinking').value = 'none';
        getField('cpm-cm-thinking-budget').value = '0';
        getField('cpm-cm-max-output').value = '0';
        getField('cpm-cm-prompt-cache-retention').value = 'none';
        getField('cpm-cm-reasoning').value = 'none';
        getField('cpm-cm-verbosity').value = 'none';
        getField('cpm-cm-effort').value = 'none';
        ['sysfirst', 'mergesys', 'altrole', 'mustuser', 'maxout', 'thought', 'streaming', 'adaptive-thinking'].forEach(id => { getCheckbox(`cpm-cm-${id}`).checked = false; });
        getField('cpm-cm-custom-params').value = '';
    }

    // ── Read all editor values into a model object ──
    /** @param {string} uid */
    function readEditorValues(uid) {
        return normalizeCustomModel({
            uniqueId: uid,
            name: getField('cpm-cm-name').value,
            model: getField('cpm-cm-model').value,
            url: getField('cpm-cm-url').value,
            key: getField('cpm-cm-key').value,
            proxyUrl: getField('cpm-cm-proxy-url').value.trim(),
            format: getField('cpm-cm-format').value,
            tok: getField('cpm-cm-tok').value,
            responsesMode: getField('cpm-cm-responses-mode').value || 'auto',
            thinking: getField('cpm-cm-thinking').value,
            thinkingBudget: parseInt(getField('cpm-cm-thinking-budget').value, 10) || 0,
            maxOutputLimit: parseInt(getField('cpm-cm-max-output').value, 10) || 0,
            promptCacheRetention: getField('cpm-cm-prompt-cache-retention').value || 'none',
            reasoning: getField('cpm-cm-reasoning').value,
            verbosity: getField('cpm-cm-verbosity').value,
            effort: getField('cpm-cm-effort').value,
            sysfirst: getCheckbox('cpm-cm-sysfirst').checked,
            mergesys: getCheckbox('cpm-cm-mergesys').checked,
            altrole: getCheckbox('cpm-cm-altrole').checked,
            mustuser: getCheckbox('cpm-cm-mustuser').checked,
            maxout: getCheckbox('cpm-cm-maxout').checked,
            streaming: getCheckbox('cpm-cm-streaming').checked,
            decoupled: !getCheckbox('cpm-cm-streaming').checked,
            thought: getCheckbox('cpm-cm-thought').checked,
            adaptiveThinking: getCheckbox('cpm-cm-adaptive-thinking').checked,
            customParams: getField('cpm-cm-custom-params').value,
        });
    }

    // ── Custom Models Manager logic ──
    /**
     * @param {any} _setVal
     * @param {any} _openCpmSettings
     */
    function initCustomModelsManager(_setVal, _openCpmSettings) {
        const cmList = getContainer('cpm-cm-list');
        const cmEditor = getContainer('cpm-cm-editor');
        const cmCount = getContainer('cpm-cm-count');

        const refreshCmList = () => {
            if (cmList.contains(cmEditor)) { getContainer('tab-customs').appendChild(cmEditor); cmEditor.classList.add('hidden'); }
            cmCount.innerText = String(state.CUSTOM_MODELS_CACHE.length);
            if (state.CUSTOM_MODELS_CACHE.length === 0) {
                cmList.innerHTML = '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded">No custom models defined.</div>';
                return;
            }
            cmList.innerHTML = state.CUSTOM_MODELS_CACHE.map((/** @type {Record<string, any>} */ m, i) => `
            <div class="bg-gray-800 border border-gray-700 rounded p-4 flex justify-between items-center group hover:border-gray-500 transition-colors">
                <div>
                    <div class="font-bold text-white text-lg">${escHtml(m.name) || 'Unnamed Model'}${((m.key || '').trim().split(/\s+/).filter((/** @type {string} */ k) => k.length > 0).length > 1) ? ' <span class="text-xs text-blue-400 font-normal ml-2">🔄 키회전</span>' : ''}</div>
                    <div class="text-xs text-gray-400 font-mono mt-1">${escHtml(m.model) || 'No model ID'} | ${escHtml(m.url) || 'No URL'}</div>
                </div>
                <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="bg-green-900/50 hover:bg-green-600 text-white px-3 py-1 rounded text-sm cpm-cm-export-btn" data-idx="${i}">📤 Export</button>
                    <button class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm cpm-cm-edit-btn" data-idx="${i}">✏️ Edit</button>
                    <button class="bg-red-900/50 hover:bg-red-600 text-white px-3 py-1 rounded text-sm cpm-cm-del-btn" data-idx="${i}">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

            // Export
            cmList.querySelectorAll('.cpm-cm-export-btn').forEach(btn => btn.addEventListener('click', (e) => {
                const idx = getDatasetIndex(e.target);
                const m = /** @type {Record<string, any>} */ (state.CUSTOM_MODELS_CACHE[idx]);
                if (!m) return;
                const exportModel = serializeCustomModelExport(m);
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModel, null, 2));
                const a = document.createElement('a'); a.href = dataStr;
                a.download = `${(m.name || 'custom_model').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.cpm-model.json`;
                document.body.appendChild(a); a.click(); a.remove();
            }));

            // Delete
            cmList.querySelectorAll('.cpm-cm-del-btn').forEach(btn => btn.addEventListener('click', (e) => {
                if (confirm('Delete this model?')) {
                    state.CUSTOM_MODELS_CACHE.splice(getDatasetIndex(e.target), 1);
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    refreshCmList();
                }
            }));

            // Edit
            cmList.querySelectorAll('.cpm-cm-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
                const m = state.CUSTOM_MODELS_CACHE[getDatasetIndex(e.target)];
                populateEditor(m);
                getContainer('cpm-cm-editor-title').innerText = 'Edit Custom Model';
                const itemDiv = /** @type {HTMLElement} */ (e.target).closest('.group');
                if (itemDiv) itemDiv.after(cmEditor);
                cmEditor.classList.remove('hidden');
            }));
        };

        // Import model
        getButton('cpm-import-model-btn').addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.multiple = true;
            input.onchange = async (e) => {
                const files = getFileInputFiles(e.target);
                let importedCount = 0, errorCount = 0;
                for (const file of files) {
                    try {
                        const data = JSON.parse(await file.text());
                        if (!data._cpmModelExport || !data.name) { errorCount++; continue; }
                        const normalized = normalizeCustomModel(data, { includeKey: true, includeUniqueId: false, includeTag: false });
                        normalized.uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                        state.CUSTOM_MODELS_CACHE.push(normalized); importedCount++;
                    } catch { errorCount++; }
                }
                if (importedCount > 0) {
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    refreshCmList();
                }
                alert(`${importedCount}개 모델 가져오기 완료` + (errorCount > 0 ? ` (${errorCount}개 실패)` : ''));
            };
            input.click();
        });

        // Add new model
        getButton('cpm-add-custom-btn').addEventListener('click', () => {
            clearEditor();
            getField('cpm-cm-id').value = 'custom_' + Date.now();
            getContainer('cpm-cm-editor-title').innerText = 'Add New Model';
            cmList.prepend(cmEditor);
            cmEditor.classList.remove('hidden');
        });

        getButton('cpm-cm-cancel').addEventListener('click', () => {
            getContainer('tab-customs').appendChild(cmEditor);
            cmEditor.classList.add('hidden');
        });

        getButton('cpm-cm-save').addEventListener('click', () => {
            const uid = getField('cpm-cm-id').value;
            const newModel = readEditorValues(uid);
            const existingIdx = state.CUSTOM_MODELS_CACHE.findIndex((/** @type {Record<string, any>} */ x) => x.uniqueId === uid);
            if (existingIdx !== -1) state.CUSTOM_MODELS_CACHE[existingIdx] = { ...state.CUSTOM_MODELS_CACHE[existingIdx], ...newModel };
            else state.CUSTOM_MODELS_CACHE.push(newModel);
            Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
            SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
            refreshCmList();
            cmEditor.classList.add('hidden');
        });

        refreshCmList();
    }

    // @ts-check
    /**
     * settings-ui-plugins.js — Sub-Plugins tab UI.
     * Extracted from settings-ui.js for modularity.
     * Handles plugin listing, upload, toggle, delete, and update checking.
     */

    /** @typedef {Window & typeof globalThis & { CupcakePM_SubPlugins?: Array<any> }} CupcakePluginWindow */

    /** @param {string} id @returns {HTMLElement} */
    function getElement(id) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`[CPM] Missing element: ${id}`);
        return el;
    }

    /** @param {any} el @returns {HTMLButtonElement} */
    function asButton(el) {
        return /** @type {HTMLButtonElement} */ (el);
    }

    /** @param {any} el @returns {HTMLInputElement} */
    function asInput(el) {
        return /** @type {HTMLInputElement} */ (el);
    }

    /** @param {any} el @returns {HTMLElement} */
    function asContainer(el) {
        return /** @type {HTMLElement} */ (el);
    }

    // ── Helper: Sub-Plugins tab renderer ──
    function buildPluginsTabRenderer(/** @type {any} */ setVal) {
        const renderPluginsTab = () => {
            const listContainer = document.getElementById('cpm-plugins-list');
            if (!listContainer) return;

            let html = `
            <div class="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:bg-gray-700 transition-colors cursor-pointer mb-6" id="cpm-btn-upload-plugin">
                <div class="text-4xl mb-2">📥</div>
                <h4 class="text-lg font-bold text-gray-200">설치할 서브 플러그인 선택 (.js/.mjs)</h4>
                <input type="file" id="cpm-file-plugin" accept="${getSubPluginFileAccept()}" class="hidden">
            </div>
        `;

            if (SubPluginManager.plugins.length === 0) {
                html += '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded">설치된 서브 플러그인이 없습니다.</div>';
            } else {
                html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
                for (const p of SubPluginManager.plugins) {
                    html += `
                    <div class="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-500 transition-colors relative">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1 pr-4">
                                <h4 class="text-xl font-bold text-white flex items-center space-x-2">
                                    <span>${escHtml(p.icon) || '🧩'}</span><span>${escHtml(p.name)}</span>
                                    ${p.version ? `<span class="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded-full ml-2">v${escHtml(p.version)}</span>` : ''}
                                </h4>
                                <p class="text-sm text-gray-400 mt-1">${escHtml(p.description) || 'No description.'}</p>
                            </div>
                            <div class="flex flex-col items-end space-y-2">
                                <label class="flex items-center cursor-pointer"><div class="relative">
                                    <input type="checkbox" class="sr-only cpm-plugin-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                    <div class="block bg-gray-600 w-10 h-6 rounded-full custom-toggle-bg transition-colors"></div>
                                    <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform"></div>
                                </div></label>
                                <button class="cpm-plugin-delete text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 bg-gray-700 rounded" data-id="${p.id}">🗑️ 삭제</button>
                            </div>
                        </div>
                        <div class="border-t border-gray-700 pt-3 mt-3 plugin-ui-container" id="plugin-ui-${p.id}"></div>
                    </div>
                `;
                }
                html += '</div><style>.cpm-plugin-toggle:checked ~ .custom-toggle-bg{background-color:#3b82f6;} .cpm-plugin-toggle:checked ~ .dot{transform:translateX(100%);}</style>';
            }

            // ── Purge All CPM Data Section ──
            html += `
            <div class="mt-8 pt-6 border-t border-gray-700">
                <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-5">
                    <h4 class="text-lg font-bold text-red-400 mb-2">⚠️ CPM 데이터 전체 삭제 (Danger Zone)</h4>
                    <p class="text-xs text-gray-400 mb-1">
                        Cupcake Provider Manager 플러그인이 리스AI 저장소에 저장한 <strong class="text-red-300">모든 데이터</strong>를 삭제합니다.
                    </p>
                    <ul class="text-xs text-gray-500 mb-3 list-disc list-inside space-y-0.5">
                        <li>서브 플러그인 목록 및 코드</li>
                        <li>모든 프로바이더 API 키 (OpenAI, Anthropic, Gemini, Vertex, AWS, OpenRouter, DeepSeek 등)</li>
                        <li>슬롯 설정 (번역, 감정, 하이파, 트리거)</li>
                        <li>커스텀 모델 설정</li>
                        <li>글로벌 기본값, 스트리밍 설정, 설정 백업 등</li>
                    </ul>
                    <p class="text-xs text-yellow-400 font-semibold mb-3">
                        💡 플러그인을 삭제/재설치해도 데이터는 남아있습니다. 이 버튼을 눌러야만 완전히 제거됩니다.
                    </p>
                    <button id="cpm-purge-all-btn" class="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-6 rounded transition-colors text-sm shadow-lg shadow-red-900/50">
                        🗑️ CPM 저장 데이터 모두 지우기
                    </button>
                </div>
            </div>
        `;

            listContainer.innerHTML = html;

            // Upload handler
            const btnUpload = document.getElementById('cpm-btn-upload-plugin');
            const pFileInput = document.getElementById('cpm-file-plugin');
            if (btnUpload && pFileInput) {
                btnUpload.addEventListener('click', () => pFileInput.click());
                pFileInput.addEventListener('change', async (e) => {
                    const file = asInput(e.target).files?.[0];
                    if (!file) return;
                    if (file.size > SubPluginManager.MAX_INSTALL_BYTES) {
                        alert(
                            `⚠️ 설치 실패: 파일 용량이 너무 큽니다. ` +
                            `최대 ${(SubPluginManager.MAX_INSTALL_BYTES / 1024).toFixed(0)}KB까지만 설치할 수 있습니다.`
                        );
                        renderPluginsTab();
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const code = /** @type {string} */ ((/** @type {FileReader} */ (ev.target)).result);
                        try {
                            const name = await SubPluginManager.install(code);
                            const installed = SubPluginManager.plugins.find(p => p.name === name);
                            if (installed) await SubPluginManager.hotReload(installed.id);
                            alert(`서브 플러그인 '${name}' 설치 완료!`);
                        } catch (installErr) {
                            const message = installErr instanceof Error ? installErr.message : String(installErr || '알 수 없는 오류');
                            alert(`⚠️ 설치 실패: ${message}`);
                        }
                        renderPluginsTab();
                    };
                    reader.readAsText(file);
                });
            }

            // Toggle/delete handlers
            listContainer.querySelectorAll('.cpm-plugin-toggle').forEach(t => {
                t.addEventListener('change', async (e) => {
                    const toggle = asInput(e.target);
                    const pluginId = toggle.getAttribute('data-id') || '';
                    await SubPluginManager.toggle(pluginId, toggle.checked);
                    await SubPluginManager.hotReload(pluginId);
                });
            });
            listContainer.querySelectorAll('.cpm-plugin-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = asButton(e.target).getAttribute('data-id') || '';
                    if (confirm('정말로 이 플러그인을 삭제하시겠습니까?')) {
                        SubPluginManager.unloadPlugin(/** @type {string} */ (id));
                        await SubPluginManager.remove(/** @type {string} */ (id));
                        renderPluginsTab();
                    }
                });
            });

            // Update check button
            initUpdateCheckButton();

            // ── Purge All CPM Data handler (double confirmation) ──
            const purgeBtn = document.getElementById('cpm-purge-all-btn');
            if (purgeBtn) {
                purgeBtn.addEventListener('click', async () => {
                    const purgeButton = asButton(purgeBtn);
                    // 1st confirmation
                    const first = confirm(
                        '⚠️ 정말로 Cupcake Provider Manager의 모든 저장 데이터를 삭제하시겠습니까?\n\n' +
                        '삭제 대상:\n' +
                        '• 서브 플러그인 목록 및 코드\n' +
                        '• 모든 API 키 (OpenAI, Anthropic, Gemini 등)\n' +
                        '• 슬롯/커스텀 모델/글로벌 설정\n' +
                        '• 설정 백업 데이터\n\n' +
                        '이 작업은 되돌릴 수 없습니다!'
                    );
                    if (!first) return;

                    // 2nd confirmation
                    const second = confirm(
                        '🚨 최종 확인: 정말 삭제하시겠습니까?\n\n' +
                        'CPM의 모든 API 키, 서브 플러그인, 설정이 영구 삭제됩니다.\n' +
                        '확인을 누르면 즉시 삭제가 실행됩니다.'
                    );
                    if (!second) return;

                    purgeButton.disabled = true;
                    purgeButton.textContent = '⏳ 삭제 중...';

                    try {
                        const result = await SubPluginManager.purgeAllCpmData();
                        alert(
                            `✅ CPM 데이터가 모두 삭제되었습니다.\n\n` +
                            `• pluginStorage: ${result.pluginStorageCleared}개 항목 삭제\n` +
                            `• 설정 키: ${result.argsCleared}개 항목 초기화\n\n` +
                            `변경사항을 완전히 적용하려면 페이지를 새로고침(F5)하세요.`
                        );
                        renderPluginsTab();
                    } catch (err) {
                        console.error('[CPM Purge] Error:', err);
                        alert('❌ 삭제 중 오류가 발생했습니다: ' + (/** @type {Error} */ (err).message || err));
                        purgeButton.disabled = false;
                        purgeButton.textContent = '🗑️ CPM 저장 데이터 모두 지우기';
                    }
                });
            }

            // Render sub-plugin dynamic UIs
            /** @type {CupcakePluginWindow} */
            const cupcakeWindow = window;
            cupcakeWindow.CupcakePM_SubPlugins = cupcakeWindow.CupcakePM_SubPlugins || [];
            for (const p of cupcakeWindow.CupcakePM_SubPlugins) {
                const uiContainer = document.getElementById(`plugin-ui-${p.id}`);
                if (uiContainer) {
                    try {
                        if (p.uiHtml) uiContainer.innerHTML = p.uiHtml;
                        if (typeof p.onRender === 'function') p.onRender(uiContainer, safeGetArg, setVal);
                    } catch (err) { console.error(`UI Error for ${p.id}:`, err); }
                }
            }
        };
        return renderPluginsTab;
    }

    function initUpdateCheckButton(/** @type {any} */ _renderPluginsTab, /** @type {Record<string, any>} */ deps = {}) {
        const subPluginManager = deps.subPluginManager || SubPluginManager;
        const updateBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('cpm-check-updates-btn'));
        if (!updateBtn || updateBtn.dataset.cpmBound === 'true') return;
        updateBtn.dataset.cpmBound = 'true';
        updateBtn.addEventListener('click', async () => {
            const statusDiv = asContainer(getElement('cpm-update-status'));
            updateBtn.disabled = true; updateBtn.textContent = '⏳ 확인 중...';
            statusDiv.classList.remove('hidden');
            statusDiv.innerHTML = '<p class="text-gray-400 text-sm">업데이트를 확인하고 있습니다...</p>';
            try {
                const updates = await subPluginManager.checkAllUpdates();
                if (updates.length === 0) {
                    statusDiv.innerHTML = '<p class="text-green-400 text-sm font-semibold bg-green-900/30 rounded p-3">✅ 모든 서브 플러그인이 최신 버전입니다.</p>';
                } else {
                    const pendingUpdates = new Map();
                    let html = `<div class="bg-indigo-900/30 rounded p-3 space-y-3"><p class="text-indigo-300 text-sm font-semibold">🔔 ${updates.length}개의 업데이트가 있습니다.</p>`;
                    for (const u of updates) {
                        pendingUpdates.set(u.plugin.id, { code: u.code, name: u.plugin.name, expectedSHA256: u.expectedSHA256 || '' });
                        html += `<div class="flex items-center justify-between bg-gray-800 rounded p-2"><div><span class="text-white font-semibold">${escHtml(u.plugin.icon || '🧩')} ${escHtml(u.plugin.name)}</span><span class="text-gray-400 text-xs ml-2">v${escHtml(u.localVersion)} → <span class="text-green-400">v${escHtml(u.remoteVersion)}</span></span></div>`;
                        html += u.code
                            ? `<button class="cpm-apply-update bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded" data-id="${escHtml(u.plugin.id)}">⬆️ 업데이트</button>`
                            : `<span class="text-red-400 text-xs">⚠️ 코드 다운로드 실패</span>`;
                        html += `</div>`;
                    }
                    html += `</div>`;
                    statusDiv.innerHTML = html;
                    statusDiv.querySelectorAll('.cpm-apply-update').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const applyBtn = asButton(e.target);
                            const id = applyBtn.getAttribute('data-id') || '';
                            const updateData = pendingUpdates.get(id);
                            if (!updateData || !updateData.code) { applyBtn.textContent = '❌ 코드 없음'; return; }
                            applyBtn.disabled = true; applyBtn.textContent = '⏳ 적용 중...';
                            const ok = await subPluginManager.applyUpdate(id, updateData.code, updateData.expectedSHA256);
                            if (ok) { await subPluginManager.hotReload(id); applyBtn.textContent = '✅ 완료'; pendingUpdates.delete(id); }
                            else applyBtn.textContent = '❌ 실패';
                        });
                    });
                }
            } catch (err) {
                console.error('[CPM Update Check]', err);
                statusDiv.innerHTML = '<p class="text-red-400 text-sm font-semibold bg-red-900/30 rounded p-3">❌ 업데이트 확인 중 오류가 발생했습니다.</p>';
            }
            updateBtn.disabled = false; updateBtn.textContent = '🔄 업데이트 확인';
        });
    }

    // @ts-check
    /**
     * settings-ui-panels.js — API View panel + Export/Import.
     * Extracted from settings-ui.js for modularity.
     */

    const CPM_EXPORT_VERSION = 2;
    const CPM_PLUGIN_STORAGE_KEY_PATTERN = /^cpm[_-]/;
    const KNOWN_CPM_PLUGIN_STORAGE_KEYS = [
        'cpm_installed_subplugins',
        'cpm_settings_backup',
        'cpm_last_version_check',
        'cpm_last_main_version_check',
        'cpm_pending_main_update',
        'cpm_last_boot_status',
        'cpm_last_main_update_flush',
    ];

    /**
     * @param {string} key
     * @param {any} value
     */
    function normalizeManagedSettingValue(key, value) {
        return key === 'cpm_custom_models'
            ? serializeCustomModelsSetting(value, { includeKey: true })
            : (value ?? '');
    }

    async function getCpmPluginStorageKeys() {
        const keySet = new Set(KNOWN_CPM_PLUGIN_STORAGE_KEYS);
        try {
            if (typeof Risu?.pluginStorage?.keys === 'function') {
                const dynamicKeys = await Risu.pluginStorage.keys();
                for (const key of dynamicKeys || []) {
                    if (CPM_PLUGIN_STORAGE_KEY_PATTERN.test(String(key))) keySet.add(String(key));
                }
            }
        } catch (_) { /* ignore */ }
        return [...keySet];
    }

    async function exportPluginStorageSnapshot() {
        const snapshot = /** @type {Record<string, any>} */ ({});
        for (const key of await getCpmPluginStorageKeys()) {
            try {
                const value = await Risu.pluginStorage.getItem(key);
                if (value !== undefined && value !== null) snapshot[key] = value;
            } catch (_) { /* ignore */ }
        }
        return snapshot;
    }

    /** @param {Record<string, any>} snapshot */
    async function importPluginStorageSnapshot(snapshot) {
        const existingKeys = await getCpmPluginStorageKeys();
        for (const key of existingKeys) {
            if (Object.prototype.hasOwnProperty.call(snapshot, key)) continue;
            try {
                if (typeof Risu.pluginStorage.removeItem === 'function') await Risu.pluginStorage.removeItem(key);
                else await Risu.pluginStorage.setItem(key, '');
            } catch (_) { /* ignore */ }
        }

        for (const [key, value] of Object.entries(snapshot)) {
            if (!CPM_PLUGIN_STORAGE_KEY_PATTERN.test(key)) continue;
            await Risu.pluginStorage.setItem(key, String(value ?? ''));
        }
    }

    /** @param {any} importedData */
    function normalizeImportEnvelope(importedData) {
        if (!importedData || typeof importedData !== 'object' || Array.isArray(importedData)) {
            throw new Error('설정 파일 형식이 올바르지 않습니다.');
        }
        if ('settings' in importedData || 'pluginStorage' in importedData || '_cpmExportVersion' in importedData) {
            return {
                settings: importedData.settings && typeof importedData.settings === 'object' ? importedData.settings : {},
                pluginStorage: importedData.pluginStorage && typeof importedData.pluginStorage === 'object' ? importedData.pluginStorage : {},
            };
        }
        return { settings: importedData, pluginStorage: {} };
    }

    // ── API View Panel ──
    function initApiViewPanel() {
        const _renderApiViewEntry = (/** @type {any} */ r) => {
            if (!r) return '<div class="text-gray-500 text-center py-8">선택한 요청 데이터가 없습니다.</div>';
            const redactKey = (/** @type {any} */ v) => { if (!v || typeof v !== 'string') return v; if (v.length <= 8) return '***'; return v.slice(0, 4) + '...' + v.slice(-4); };
            const redactHeaders = (/** @type {any} */ headers) => { const h = { ...headers }; for (const k of Object.keys(h)) { if (/auth|key|token|secret|bearer/i.test(k)) h[k] = redactKey(h[k]); } return h; };
            const formatJson = (/** @type {any} */ obj) => { try { return JSON.stringify(obj, null, 2); } catch { return String(obj); } };
            const statusColor = r.status >= 200 && r.status < 300 ? 'text-green-400' : (typeof r.status === 'number' ? 'text-red-400' : 'text-yellow-400');
            const hasHttpDetails = !!r.url;
            return `<div class="space-y-3">
            <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
                <span class="text-gray-400">⏱️ ${escHtml(new Date(r.timestamp).toLocaleString())}</span>
                <span class="${statusColor} font-bold">Status: ${escHtml(r.status || 'N/A')}</span>
                <span class="text-gray-400">${r.duration ? escHtml(r.duration) + 'ms' : ''}</span>
                ${hasHttpDetails ? `<span class="text-purple-300 font-mono text-xs break-all">${escHtml(r.method || 'POST')} ${escHtml(r.url)}</span>` : ''}
            </div>
            ${hasHttpDetails ? `<details class="bg-gray-800 rounded p-3"><summary class="cursor-pointer text-gray-300 font-semibold text-sm">📤 Request Headers</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap">${escHtml(formatJson(redactHeaders(r.requestHeaders || {})))}</pre></details>` : ''}
            <details class="bg-gray-800 rounded p-3"><summary class="cursor-pointer text-gray-300 font-semibold text-sm">${hasHttpDetails ? '📤 Request Body' : '📊 Request Params'}</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-60 whitespace-pre-wrap">${escHtml(formatJson(hasHttpDetails ? (r.requestBody || {}) : (r.body || {})))}</pre></details>
            <details class="bg-gray-800 rounded p-3" open><summary class="cursor-pointer text-gray-300 font-semibold text-sm">📥 Response Body</summary><pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-96 whitespace-pre-wrap">${typeof r.response === 'string' ? escHtml(r.response) : escHtml(formatJson(r.response || 'No response captured'))}</pre></details>
        </div>`;
        };

        const _refreshApiViewPanel = () => {
            /** @type {HTMLDivElement | null} */
            const contentEl = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-content'));
            /** @type {HTMLSelectElement | null} */
            const selector = /** @type {HTMLSelectElement | null} */ (document.getElementById('cpm-api-view-selector'));
            if (!contentEl || !selector) return;
            const allReqs = getAllApiRequests();
            if (allReqs.length === 0) {
                selector.innerHTML = '';
                contentEl.innerHTML = '<div class="text-gray-500 text-center py-8">아직 API 요청 기록이 없습니다.</div>';
                return;
            }
            const currentVal = selector.value;
            selector.innerHTML = allReqs.map((req, i) => {
                const time = new Date(req.timestamp).toLocaleTimeString();
                return `<option value="${escHtml(req.id)}"${i === 0 ? ' selected' : ''}>#${i + 1} [${escHtml(req.status || '...')}] ${escHtml(req.modelName || '(unknown)')} — ${escHtml(time)}</option>`;
            }).join('');
            if (currentVal && allReqs.find(r => r.id === currentVal)) selector.value = currentVal;
            contentEl.innerHTML = _renderApiViewEntry(getApiRequestById(selector.value));
        };

        document.getElementById('cpm-api-view-btn')?.addEventListener('click', () => {
            /** @type {HTMLDivElement | null} */
            const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
            if (!panel) return;
            if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
            _refreshApiViewPanel(); panel.classList.remove('hidden');
        });
        document.getElementById('cpm-api-view-selector')?.addEventListener('change', (e) => {
            /** @type {HTMLSelectElement | null} */
            const selector = /** @type {HTMLSelectElement | null} */ (e.target);
            /** @type {HTMLDivElement | null} */
            const contentEl = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-content'));
            if (!selector || !contentEl) return;
            contentEl.innerHTML = _renderApiViewEntry(getApiRequestById(selector.value));
        });
        document.getElementById('cpm-api-view-close')?.addEventListener('click', () => {
            /** @type {HTMLDivElement | null} */
            const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
            if (panel) panel.classList.add('hidden');
        });
    }

    // ── Export/Import ──
    function initExportImport(/** @type {any} */ setVal, /** @type {any} */ openCpmSettings) {
        document.getElementById('cpm-export-btn')?.addEventListener('click', async () => {
            const exportSettings = /** @type {Record<string, any>} */ ({});
            for (const key of getManagedSettingKeys()) {
                const val = await safeGetArg(key);
                exportSettings[key] = normalizeManagedSettingValue(key, val);
            }
            const exportData = {
                _cpmExportVersion: CPM_EXPORT_VERSION,
                exportedAt: new Date().toISOString(),
                settings: exportSettings,
                pluginStorage: await exportPluginStorageSnapshot(),
            };
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
            const a = document.createElement('a'); a.href = dataStr; a.download = 'cupcake_pm_settings.json';
            document.body.appendChild(a); a.click(); a.remove();
        });

        document.getElementById('cpm-import-btn')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
            input.onchange = e => {
                /** @type {HTMLInputElement | null} */
                const fileInput = /** @type {HTMLInputElement | null} */ (e.target);
                const file = fileInput?.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const rawText = event.target?.result;
                        if (typeof rawText !== 'string') throw new Error('설정 파일 형식이 올바르지 않습니다.');
                        const importedData = JSON.parse(rawText);
                        const envelope = normalizeImportEnvelope(importedData);
                        for (const [key, value] of Object.entries(envelope.settings)) {
                            const normalizedValue = normalizeManagedSettingValue(key, value);
                            await setVal(key, normalizedValue);
                            /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */
                            const el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(key));
                            if (el) {
                                if ('type' in el && el.type === 'checkbox') /** @type {HTMLInputElement} */ (el).checked = (normalizedValue === true || String(normalizedValue).toLowerCase() === 'true');
                                else el.value = String(normalizedValue ?? '');
                            }
                        }
                        const prevPluginIds = Array.isArray(SubPluginManager.plugins) ? SubPluginManager.plugins.map(p => p.id) : [];
                        await importPluginStorageSnapshot(envelope.pluginStorage || {});
                        for (const pluginId of prevPluginIds) {
                            try { SubPluginManager.unloadPlugin(pluginId); } catch (_) { /* ignore */ }
                        }
                        if (Object.prototype.hasOwnProperty.call(envelope.pluginStorage || {}, 'cpm_installed_subplugins')) {
                            try {
                                await SubPluginManager.loadRegistry();
                                if (typeof SubPluginManager.executeEnabled === 'function') await SubPluginManager.executeEnabled();
                            } catch (_) { /* ignore */ }
                        }
                        alert('설정을 성공적으로 불러왔습니다!');
                        openCpmSettings();
                    } catch (err) { alert('설정 파일 읽기 오류: ' + /** @type {Error} */ (err).message); }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    // @generated — Do not edit manually.
    // Built by scripts/build-tailwind.cjs from styles/tailwind-input.css
    // Size: 39.6 KB (minified)
    const TAILWIND_CSS = `/*! tailwindcss v4.2.1 | MIT License | https://tailwindcss.com */
@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-translate-x:0;--tw-translate-y:0;--tw-translate-z:0;--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-space-y-reverse:0;--tw-space-x-reverse:0;--tw-border-style:solid;--tw-gradient-position:initial;--tw-gradient-from:#0000;--tw-gradient-via:#0000;--tw-gradient-to:#0000;--tw-gradient-stops:initial;--tw-gradient-via-stops:initial;--tw-gradient-from-position:0%;--tw-gradient-via-position:50%;--tw-gradient-to-position:100%;--tw-leading:initial;--tw-font-weight:initial;--tw-tracking:initial;--tw-shadow:0 0 #0000;--tw-shadow-color:initial;--tw-shadow-alpha:100%;--tw-inset-shadow:0 0 #0000;--tw-inset-shadow-color:initial;--tw-inset-shadow-alpha:100%;--tw-ring-color:initial;--tw-ring-shadow:0 0 #0000;--tw-inset-ring-color:initial;--tw-inset-ring-shadow:0 0 #0000;--tw-ring-inset:initial;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-offset-shadow:0 0 #0000;--tw-blur:initial;--tw-brightness:initial;--tw-contrast:initial;--tw-grayscale:initial;--tw-hue-rotate:initial;--tw-invert:initial;--tw-opacity:initial;--tw-saturate:initial;--tw-sepia:initial;--tw-drop-shadow:initial;--tw-drop-shadow-color:initial;--tw-drop-shadow-alpha:100%;--tw-drop-shadow-size:initial;--tw-backdrop-blur:initial;--tw-backdrop-brightness:initial;--tw-backdrop-contrast:initial;--tw-backdrop-grayscale:initial;--tw-backdrop-hue-rotate:initial;--tw-backdrop-invert:initial;--tw-backdrop-opacity:initial;--tw-backdrop-saturate:initial;--tw-backdrop-sepia:initial;--tw-ease:initial}}}@layer theme{:root,:host{--font-sans:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";--font-mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;--color-red-300:oklch(80.8% .114 19.571);--color-red-400:oklch(70.4% .191 22.216);--color-red-500:oklch(63.7% .237 25.331);--color-red-600:oklch(57.7% .245 27.325);--color-red-700:oklch(50.5% .213 27.518);--color-red-800:oklch(44.4% .177 26.899);--color-red-900:oklch(39.6% .141 25.723);--color-red-950:oklch(25.8% .092 26.042);--color-orange-200:oklch(90.1% .076 70.697);--color-orange-300:oklch(83.7% .128 66.29);--color-orange-400:oklch(75% .183 55.934);--color-orange-500:oklch(70.5% .213 47.604);--color-orange-600:oklch(64.6% .222 41.116);--color-orange-900:oklch(40.8% .123 38.172);--color-amber-200:oklch(92.4% .12 95.746);--color-amber-300:oklch(87.9% .169 91.605);--color-amber-400:oklch(82.8% .189 84.429);--color-amber-600:oklch(66.6% .179 58.318);--color-amber-700:oklch(55.5% .163 48.998);--color-amber-900:oklch(41.4% .112 45.904);--color-yellow-200:oklch(94.5% .129 101.54);--color-yellow-300:oklch(90.5% .182 98.111);--color-yellow-400:oklch(85.2% .199 91.936);--color-yellow-500:oklch(79.5% .184 86.047);--color-yellow-600:oklch(68.1% .162 75.834);--color-yellow-700:oklch(55.4% .135 66.442);--color-yellow-800:oklch(47.6% .114 61.907);--color-yellow-900:oklch(42.1% .095 57.708);--color-yellow-950:oklch(28.6% .066 53.813);--color-green-300:oklch(87.1% .15 154.449);--color-green-400:oklch(79.2% .209 151.711);--color-green-500:oklch(72.3% .219 149.579);--color-green-600:oklch(62.7% .194 149.214);--color-green-700:oklch(52.7% .154 150.069);--color-green-800:oklch(44.8% .119 151.328);--color-green-900:oklch(39.3% .095 152.535);--color-green-950:oklch(26.6% .065 152.934);--color-emerald-300:oklch(84.5% .143 164.978);--color-emerald-400:oklch(76.5% .177 163.223);--color-emerald-700:oklch(50.8% .118 165.612);--color-emerald-900:oklch(37.8% .077 168.94);--color-teal-400:oklch(77.7% .152 181.912);--color-cyan-300:oklch(86.5% .127 207.078);--color-cyan-400:oklch(78.9% .154 211.53);--color-cyan-500:oklch(71.5% .143 215.221);--color-cyan-600:oklch(60.9% .126 221.723);--color-blue-300:oklch(80.9% .105 251.813);--color-blue-400:oklch(70.7% .165 254.624);--color-blue-500:oklch(62.3% .214 259.815);--color-blue-600:oklch(54.6% .245 262.881);--color-blue-900:oklch(37.9% .146 265.522);--color-indigo-300:oklch(78.5% .115 274.713);--color-indigo-400:oklch(67.3% .182 276.935);--color-indigo-500:oklch(58.5% .233 277.117);--color-indigo-600:oklch(51.1% .262 276.966);--color-indigo-700:oklch(45.7% .24 277.023);--color-indigo-900:oklch(35.9% .144 278.697);--color-purple-300:oklch(82.7% .119 306.383);--color-purple-400:oklch(71.4% .203 305.504);--color-purple-500:oklch(62.7% .265 303.9);--color-purple-600:oklch(55.8% .288 302.321);--color-purple-700:oklch(49.6% .265 301.924);--color-purple-900:oklch(38.1% .176 304.987);--color-pink-300:oklch(82.3% .12 346.018);--color-pink-500:oklch(65.6% .241 354.308);--color-gray-200:oklch(92.8% .006 264.531);--color-gray-300:oklch(87.2% .01 258.338);--color-gray-400:oklch(70.7% .022 261.325);--color-gray-500:oklch(55.1% .027 264.364);--color-gray-600:oklch(44.6% .03 256.802);--color-gray-700:oklch(37.3% .034 259.733);--color-gray-800:oklch(27.8% .033 256.848);--color-gray-900:oklch(21% .034 264.665);--color-white:#fff;--spacing:.25rem;--container-xs:20rem;--container-md:28rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--text-xl:1.25rem;--text-xl--line-height:calc(1.75 / 1.25);--text-2xl:1.5rem;--text-2xl--line-height:calc(2 / 1.5);--text-3xl:1.875rem;--text-3xl--line-height:calc(2.25 / 1.875);--text-4xl:2.25rem;--text-4xl--line-height:calc(2.5 / 2.25);--font-weight-normal:400;--font-weight-medium:500;--font-weight-semibold:600;--font-weight-bold:700;--font-weight-extrabold:800;--tracking-wider:.05em;--tracking-widest:.1em;--leading-relaxed:1.625;--radius-md:.375rem;--radius-lg:.5rem;--radius-xl:.75rem;--ease-out:cubic-bezier(0, 0, .2, 1);--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1);--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring{outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab, red, red)){::placeholder{color:color-mix(in oklab, currentcolor 50%, transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}}@layer components;@layer utilities{.invisible{visibility:hidden}.visible{visibility:visible}.sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}.absolute{position:absolute}.fixed{position:fixed}.relative{position:relative}.static{position:static}.inset-0{inset:calc(var(--spacing) * 0)}.start{inset-inline-start:var(--spacing)}.end{inset-inline-end:var(--spacing)}.top-0{top:calc(var(--spacing) * 0)}.top-1{top:calc(var(--spacing) * 1)}.top-1\\/2{top:50%}.top-full{top:100%}.right-2{right:calc(var(--spacing) * 2)}.left-0{left:calc(var(--spacing) * 0)}.left-1{left:calc(var(--spacing) * 1)}.z-10{z-index:10}.z-50{z-index:50}.z-\\[100\\]{z-index:100}.container{width:100%}@media (min-width:40rem){.container{max-width:40rem}}@media (min-width:48rem){.container{max-width:48rem}}@media (min-width:64rem){.container{max-width:64rem}}@media (min-width:80rem){.container{max-width:80rem}}@media (min-width:96rem){.container{max-width:96rem}}.my-4{margin-block:calc(var(--spacing) * 4)}.mt-1{margin-top:calc(var(--spacing) * 1)}.mt-2{margin-top:calc(var(--spacing) * 2)}.mt-3{margin-top:calc(var(--spacing) * 3)}.mt-4{margin-top:calc(var(--spacing) * 4)}.mt-5{margin-top:calc(var(--spacing) * 5)}.mt-6{margin-top:calc(var(--spacing) * 6)}.mt-8{margin-top:calc(var(--spacing) * 8)}.mt-10{margin-top:calc(var(--spacing) * 10)}.mr-1{margin-right:calc(var(--spacing) * 1)}.mr-2{margin-right:calc(var(--spacing) * 2)}.mr-3{margin-right:calc(var(--spacing) * 3)}.mb-1{margin-bottom:calc(var(--spacing) * 1)}.mb-2{margin-bottom:calc(var(--spacing) * 2)}.mb-3{margin-bottom:calc(var(--spacing) * 3)}.mb-4{margin-bottom:calc(var(--spacing) * 4)}.mb-6{margin-bottom:calc(var(--spacing) * 6)}.ml-2{margin-left:calc(var(--spacing) * 2)}.ml-auto{margin-left:auto}.block{display:block}.contents{display:contents}.flex{display:flex}.grid{display:grid}.hidden{display:none}.inline{display:inline}.table{display:table}.h-1{height:calc(var(--spacing) * 1)}.h-1\\.5{height:calc(var(--spacing) * 1.5)}.h-2{height:calc(var(--spacing) * 2)}.h-3{height:calc(var(--spacing) * 3)}.h-4{height:calc(var(--spacing) * 4)}.h-5{height:calc(var(--spacing) * 5)}.h-6{height:calc(var(--spacing) * 6)}.h-14{height:calc(var(--spacing) * 14)}.h-24{height:calc(var(--spacing) * 24)}.h-auto{height:auto}.h-full{height:100%}.max-h-24{max-height:calc(var(--spacing) * 24)}.max-h-40{max-height:calc(var(--spacing) * 40)}.max-h-48{max-height:calc(var(--spacing) * 48)}.max-h-60{max-height:calc(var(--spacing) * 60)}.max-h-72{max-height:calc(var(--spacing) * 72)}.max-h-96{max-height:calc(var(--spacing) * 96)}.max-h-\\[70vh\\]{max-height:70vh}.w-4{width:calc(var(--spacing) * 4)}.w-5{width:calc(var(--spacing) * 5)}.w-6{width:calc(var(--spacing) * 6)}.w-10{width:calc(var(--spacing) * 10)}.w-28{width:calc(var(--spacing) * 28)}.w-full{width:100%}.max-w-md{max-width:var(--container-md)}.max-w-xs{max-width:var(--container-xs)}.min-w-0{min-width:calc(var(--spacing) * 0)}.flex-1{flex:1}.flex-shrink{flex-shrink:1}.shrink-0{flex-shrink:0}.-translate-y-1{--tw-translate-y:calc(var(--spacing) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.-translate-y-1\\/2{--tw-translate-y:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.transform{transform:var(--tw-rotate-x,) var(--tw-rotate-y,) var(--tw-rotate-z,) var(--tw-skew-x,) var(--tw-skew-y,)}.cursor-pointer{cursor:pointer}.resize{resize:both}.resize-y{resize:vertical}.list-inside{list-style-position:inside}.list-decimal{list-style-type:decimal}.list-disc{list-style-type:disc}.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-col{flex-direction:column}.flex-col-reverse{flex-direction:column-reverse}.flex-row{flex-direction:row}.flex-wrap{flex-wrap:wrap}.items-baseline{align-items:baseline}.items-center{align-items:center}.items-end{align-items:flex-end}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.justify-end{justify-content:flex-end}.gap-1{gap:calc(var(--spacing) * 1)}.gap-2{gap:calc(var(--spacing) * 2)}.gap-3{gap:calc(var(--spacing) * 3)}.gap-4{gap:calc(var(--spacing) * 4)}:where(.space-y-0>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 0) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 0) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-0\\.5>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * .5) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * .5) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-1>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 1) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 1) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-1\\.5>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 1.5) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 1.5) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-2>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 2) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 2) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-3>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 3) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 3) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-4>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 4) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 4) * calc(1 - var(--tw-space-y-reverse)))}.gap-x-4{column-gap:calc(var(--spacing) * 4)}:where(.space-x-2>:not(:last-child)){--tw-space-x-reverse:0;margin-inline-start:calc(calc(var(--spacing) * 2) * var(--tw-space-x-reverse));margin-inline-end:calc(calc(var(--spacing) * 2) * calc(1 - var(--tw-space-x-reverse)))}:where(.space-x-3>:not(:last-child)){--tw-space-x-reverse:0;margin-inline-start:calc(calc(var(--spacing) * 3) * var(--tw-space-x-reverse));margin-inline-end:calc(calc(var(--spacing) * 3) * calc(1 - var(--tw-space-x-reverse)))}.gap-y-0{row-gap:calc(var(--spacing) * 0)}.gap-y-0\\.5{row-gap:calc(var(--spacing) * .5)}.gap-y-1{row-gap:calc(var(--spacing) * 1)}.truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.rounded{border-radius:.25rem}.rounded-full{border-radius:3.40282e38px}.rounded-lg{border-radius:var(--radius-lg)}.rounded-md{border-radius:var(--radius-md)}.rounded-xl{border-radius:var(--radius-xl)}.border{border-style:var(--tw-border-style);border-width:1px}.border-2{border-style:var(--tw-border-style);border-width:2px}.border-t{border-top-style:var(--tw-border-style);border-top-width:1px}.border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}.border-l-2{border-left-style:var(--tw-border-style);border-left-width:2px}.border-l-4{border-left-style:var(--tw-border-style);border-left-width:4px}.border-dashed{--tw-border-style:dashed;border-style:dashed}.border-amber-600{border-color:var(--color-amber-600)}.border-amber-600\\/50{border-color:#dd740080}@supports (color:color-mix(in lab, red, red)){.border-amber-600\\/50{border-color:color-mix(in oklab, var(--color-amber-600) 50%, transparent)}}.border-amber-700{border-color:var(--color-amber-700)}.border-amber-900{border-color:var(--color-amber-900)}.border-amber-900\\/50{border-color:#7b330680}@supports (color:color-mix(in lab, red, red)){.border-amber-900\\/50{border-color:color-mix(in oklab, var(--color-amber-900) 50%, transparent)}}.border-blue-500{border-color:var(--color-blue-500)}.border-cyan-500{border-color:var(--color-cyan-500)}.border-emerald-700{border-color:var(--color-emerald-700)}.border-emerald-900{border-color:var(--color-emerald-900)}.border-emerald-900\\/50{border-color:#004e3b80}@supports (color:color-mix(in lab, red, red)){.border-emerald-900\\/50{border-color:color-mix(in oklab, var(--color-emerald-900) 50%, transparent)}}.border-gray-600{border-color:var(--color-gray-600)}.border-gray-700{border-color:var(--color-gray-700)}.border-gray-700\\/50{border-color:#36415380}@supports (color:color-mix(in lab, red, red)){.border-gray-700\\/50{border-color:color-mix(in oklab, var(--color-gray-700) 50%, transparent)}}.border-gray-800{border-color:var(--color-gray-800)}.border-green-500{border-color:var(--color-green-500)}.border-green-600{border-color:var(--color-green-600)}.border-green-800{border-color:var(--color-green-800)}.border-indigo-700{border-color:var(--color-indigo-700)}.border-orange-900{border-color:var(--color-orange-900)}.border-orange-900\\/50{border-color:#7e2a0c80}@supports (color:color-mix(in lab, red, red)){.border-orange-900\\/50{border-color:color-mix(in oklab, var(--color-orange-900) 50%, transparent)}}.border-pink-500{border-color:var(--color-pink-500)}.border-purple-700{border-color:var(--color-purple-700)}.border-purple-700\\/50{border-color:#8200da80}@supports (color:color-mix(in lab, red, red)){.border-purple-700\\/50{border-color:color-mix(in oklab, var(--color-purple-700) 50%, transparent)}}.border-purple-900{border-color:var(--color-purple-900)}.border-purple-900\\/50{border-color:#59168b80}@supports (color:color-mix(in lab, red, red)){.border-purple-900\\/50{border-color:color-mix(in oklab, var(--color-purple-900) 50%, transparent)}}.border-red-500{border-color:var(--color-red-500)}.border-red-700{border-color:var(--color-red-700)}.border-red-700\\/50{border-color:#bf000f80}@supports (color:color-mix(in lab, red, red)){.border-red-700\\/50{border-color:color-mix(in oklab, var(--color-red-700) 50%, transparent)}}.border-red-800{border-color:var(--color-red-800)}.border-yellow-500{border-color:var(--color-yellow-500)}.border-yellow-600{border-color:var(--color-yellow-600)}.border-yellow-600\\/50{border-color:#cd890080}@supports (color:color-mix(in lab, red, red)){.border-yellow-600\\/50{border-color:color-mix(in oklab, var(--color-yellow-600) 50%, transparent)}}.border-yellow-700{border-color:var(--color-yellow-700)}.border-yellow-700\\/50{border-color:#a3610080}@supports (color:color-mix(in lab, red, red)){.border-yellow-700\\/50{border-color:color-mix(in oklab, var(--color-yellow-700) 50%, transparent)}}.border-yellow-800{border-color:var(--color-yellow-800)}.bg-\\[\\#121214\\]{background-color:#121214}.bg-amber-900{background-color:var(--color-amber-900)}.bg-amber-900\\/30{background-color:#7b33064d}@supports (color:color-mix(in lab, red, red)){.bg-amber-900\\/30{background-color:color-mix(in oklab, var(--color-amber-900) 30%, transparent)}}.bg-blue-600{background-color:var(--color-blue-600)}.bg-blue-600\\/90{background-color:#155dfce6}@supports (color:color-mix(in lab, red, red)){.bg-blue-600\\/90{background-color:color-mix(in oklab, var(--color-blue-600) 90%, transparent)}}.bg-blue-900{background-color:var(--color-blue-900)}.bg-blue-900\\/10{background-color:#1c398e1a}@supports (color:color-mix(in lab, red, red)){.bg-blue-900\\/10{background-color:color-mix(in oklab, var(--color-blue-900) 10%, transparent)}}.bg-cyan-600{background-color:var(--color-cyan-600)}.bg-gray-600{background-color:var(--color-gray-600)}.bg-gray-700{background-color:var(--color-gray-700)}.bg-gray-800{background-color:var(--color-gray-800)}.bg-gray-800\\/70{background-color:#1e2939b3}@supports (color:color-mix(in lab, red, red)){.bg-gray-800\\/70{background-color:color-mix(in oklab, var(--color-gray-800) 70%, transparent)}}.bg-gray-900{background-color:var(--color-gray-900)}.bg-gray-900\\/50{background-color:#10182880}@supports (color:color-mix(in lab, red, red)){.bg-gray-900\\/50{background-color:color-mix(in oklab, var(--color-gray-900) 50%, transparent)}}.bg-green-600{background-color:var(--color-green-600)}.bg-green-700{background-color:var(--color-green-700)}.bg-green-900{background-color:var(--color-green-900)}.bg-green-900\\/30{background-color:#0d542b4d}@supports (color:color-mix(in lab, red, red)){.bg-green-900\\/30{background-color:color-mix(in oklab, var(--color-green-900) 30%, transparent)}}.bg-green-900\\/50{background-color:#0d542b80}@supports (color:color-mix(in lab, red, red)){.bg-green-900\\/50{background-color:color-mix(in oklab, var(--color-green-900) 50%, transparent)}}.bg-green-950{background-color:var(--color-green-950)}.bg-indigo-600{background-color:var(--color-indigo-600)}.bg-indigo-900{background-color:var(--color-indigo-900)}.bg-indigo-900\\/30{background-color:#312c854d}@supports (color:color-mix(in lab, red, red)){.bg-indigo-900\\/30{background-color:color-mix(in oklab, var(--color-indigo-900) 30%, transparent)}}.bg-indigo-900\\/40{background-color:#312c8566}@supports (color:color-mix(in lab, red, red)){.bg-indigo-900\\/40{background-color:color-mix(in oklab, var(--color-indigo-900) 40%, transparent)}}.bg-orange-600{background-color:var(--color-orange-600)}.bg-purple-600{background-color:var(--color-purple-600)}.bg-purple-700{background-color:var(--color-purple-700)}.bg-red-600{background-color:var(--color-red-600)}.bg-red-600\\/90{background-color:#e40014e6}@supports (color:color-mix(in lab, red, red)){.bg-red-600\\/90{background-color:color-mix(in oklab, var(--color-red-600) 90%, transparent)}}.bg-red-700{background-color:var(--color-red-700)}.bg-red-900{background-color:var(--color-red-900)}.bg-red-900\\/20{background-color:#82181a33}@supports (color:color-mix(in lab, red, red)){.bg-red-900\\/20{background-color:color-mix(in oklab, var(--color-red-900) 20%, transparent)}}.bg-red-900\\/30{background-color:#82181a4d}@supports (color:color-mix(in lab, red, red)){.bg-red-900\\/30{background-color:color-mix(in oklab, var(--color-red-900) 30%, transparent)}}.bg-red-900\\/50{background-color:#82181a80}@supports (color:color-mix(in lab, red, red)){.bg-red-900\\/50{background-color:color-mix(in oklab, var(--color-red-900) 50%, transparent)}}.bg-red-950{background-color:var(--color-red-950)}.bg-white{background-color:var(--color-white)}.bg-yellow-600{background-color:var(--color-yellow-600)}.bg-yellow-600\\/30{background-color:#cd89004d}@supports (color:color-mix(in lab, red, red)){.bg-yellow-600\\/30{background-color:color-mix(in oklab, var(--color-yellow-600) 30%, transparent)}}.bg-yellow-900{background-color:var(--color-yellow-900)}.bg-yellow-900\\/10{background-color:#733e0a1a}@supports (color:color-mix(in lab, red, red)){.bg-yellow-900\\/10{background-color:color-mix(in oklab, var(--color-yellow-900) 10%, transparent)}}.bg-yellow-900\\/20{background-color:#733e0a33}@supports (color:color-mix(in lab, red, red)){.bg-yellow-900\\/20{background-color:color-mix(in oklab, var(--color-yellow-900) 20%, transparent)}}.bg-yellow-950{background-color:var(--color-yellow-950)}.bg-gradient-to-r{--tw-gradient-position:to right in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}.from-blue-400{--tw-gradient-from:var(--color-blue-400);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.to-purple-500{--tw-gradient-to:var(--color-purple-500);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.bg-clip-text{-webkit-background-clip:text;background-clip:text}.p-2{padding:calc(var(--spacing) * 2)}.p-3{padding:calc(var(--spacing) * 3)}.p-4{padding:calc(var(--spacing) * 4)}.p-5{padding:calc(var(--spacing) * 5)}.p-6{padding:calc(var(--spacing) * 6)}.px-1{padding-inline:calc(var(--spacing) * 1)}.px-2{padding-inline:calc(var(--spacing) * 2)}.px-3{padding-inline:calc(var(--spacing) * 3)}.px-4{padding-inline:calc(var(--spacing) * 4)}.px-5{padding-inline:calc(var(--spacing) * 5)}.px-6{padding-inline:calc(var(--spacing) * 6)}.py-0{padding-block:calc(var(--spacing) * 0)}.py-0\\.5{padding-block:calc(var(--spacing) * .5)}.py-1{padding-block:calc(var(--spacing) * 1)}.py-1\\.5{padding-block:calc(var(--spacing) * 1.5)}.py-2{padding-block:calc(var(--spacing) * 2)}.py-4{padding-block:calc(var(--spacing) * 4)}.py-6{padding-block:calc(var(--spacing) * 6)}.py-8{padding-block:calc(var(--spacing) * 8)}.pt-1{padding-top:calc(var(--spacing) * 1)}.pt-2{padding-top:calc(var(--spacing) * 2)}.pt-3{padding-top:calc(var(--spacing) * 3)}.pt-4{padding-top:calc(var(--spacing) * 4)}.pt-6{padding-top:calc(var(--spacing) * 6)}.pr-2{padding-right:calc(var(--spacing) * 2)}.pr-4{padding-right:calc(var(--spacing) * 4)}.pr-10{padding-right:calc(var(--spacing) * 10)}.pb-2{padding-bottom:calc(var(--spacing) * 2)}.pb-3{padding-bottom:calc(var(--spacing) * 3)}.pb-4{padding-bottom:calc(var(--spacing) * 4)}.pl-2{padding-left:calc(var(--spacing) * 2)}.pl-3{padding-left:calc(var(--spacing) * 3)}.pl-4{padding-left:calc(var(--spacing) * 4)}.text-center{text-align:center}.text-left{text-align:left}.font-mono{font-family:var(--font-mono)}.text-2xl{font-size:var(--text-2xl);line-height:var(--tw-leading,var(--text-2xl--line-height))}.text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}.text-4xl{font-size:var(--text-4xl);line-height:var(--tw-leading,var(--text-4xl--line-height))}.text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}.text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}.text-xl{font-size:var(--text-xl);line-height:var(--tw-leading,var(--text-xl--line-height))}.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.leading-relaxed{--tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}.font-bold{--tw-font-weight:var(--font-weight-bold);font-weight:var(--font-weight-bold)}.font-extrabold{--tw-font-weight:var(--font-weight-extrabold);font-weight:var(--font-weight-extrabold)}.font-medium{--tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}.font-normal{--tw-font-weight:var(--font-weight-normal);font-weight:var(--font-weight-normal)}.font-semibold{--tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}.tracking-wider{--tw-tracking:var(--tracking-wider);letter-spacing:var(--tracking-wider)}.tracking-widest{--tw-tracking:var(--tracking-widest);letter-spacing:var(--tracking-widest)}.break-words{overflow-wrap:break-word}.break-all{word-break:break-all}.whitespace-pre-wrap{white-space:pre-wrap}.text-amber-200{color:var(--color-amber-200)}.text-amber-200\\/80{color:#fee685cc}@supports (color:color-mix(in lab, red, red)){.text-amber-200\\/80{color:color-mix(in oklab, var(--color-amber-200) 80%, transparent)}}.text-amber-300{color:var(--color-amber-300)}.text-amber-400{color:var(--color-amber-400)}.text-blue-300{color:var(--color-blue-300)}.text-blue-400{color:var(--color-blue-400)}.text-blue-500{color:var(--color-blue-500)}.text-cyan-300{color:var(--color-cyan-300)}.text-cyan-400{color:var(--color-cyan-400)}.text-cyan-400\\/90{color:#00d2efe6}@supports (color:color-mix(in lab, red, red)){.text-cyan-400\\/90{color:color-mix(in oklab, var(--color-cyan-400) 90%, transparent)}}.text-emerald-300{color:var(--color-emerald-300)}.text-emerald-400{color:var(--color-emerald-400)}.text-gray-200{color:var(--color-gray-200)}.text-gray-300{color:var(--color-gray-300)}.text-gray-400{color:var(--color-gray-400)}.text-gray-500{color:var(--color-gray-500)}.text-gray-600{color:var(--color-gray-600)}.text-green-300{color:var(--color-green-300)}.text-green-400{color:var(--color-green-400)}.text-indigo-300{color:var(--color-indigo-300)}.text-indigo-400{color:var(--color-indigo-400)}.text-orange-200{color:var(--color-orange-200)}.text-orange-300{color:var(--color-orange-300)}.text-orange-400{color:var(--color-orange-400)}.text-pink-300{color:var(--color-pink-300)}.text-purple-300{color:var(--color-purple-300)}.text-purple-400{color:var(--color-purple-400)}.text-red-300{color:var(--color-red-300)}.text-red-400{color:var(--color-red-400)}.text-red-500{color:var(--color-red-500)}.text-teal-400{color:var(--color-teal-400)}.text-transparent{color:#0000}.text-white{color:var(--color-white)}.text-yellow-200{color:var(--color-yellow-200)}.text-yellow-300{color:var(--color-yellow-300)}.text-yellow-400{color:var(--color-yellow-400)}.text-yellow-500{color:var(--color-yellow-500)}.capitalize{text-transform:capitalize}.lowercase{text-transform:lowercase}.uppercase{text-transform:uppercase}.underline{text-decoration-line:underline}.opacity-0{opacity:0}.shadow{--tw-shadow:0 1px 3px 0 var(--tw-shadow-color,#0000001a), 0 1px 2px -1px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-\\[0_0_10px_rgba\\(239\\,68\\,68\\,0\\.5\\)\\]{--tw-shadow:0 0 10px var(--tw-shadow-color,#ef444480);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-lg{--tw-shadow:0 10px 15px -3px var(--tw-shadow-color,#0000001a), 0 4px 6px -4px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-xl{--tw-shadow:0 20px 25px -5px var(--tw-shadow-color,#0000001a), 0 8px 10px -6px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-red-900{--tw-shadow-color:oklch(39.6% .141 25.723)}@supports (color:color-mix(in lab, red, red)){.shadow-red-900{--tw-shadow-color:color-mix(in oklab, var(--color-red-900) var(--tw-shadow-alpha), transparent)}}.shadow-red-900\\/50{--tw-shadow-color:#82181a80}@supports (color:color-mix(in lab, red, red)){.shadow-red-900\\/50{--tw-shadow-color:color-mix(in oklab, color-mix(in oklab, var(--color-red-900) 50%, transparent) var(--tw-shadow-alpha), transparent)}}.filter{filter:var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)}.backdrop-filter{-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-opacity{transition-property:opacity;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ease-out{--tw-ease:var(--ease-out);transition-timing-function:var(--ease-out)}.select-all{-webkit-user-select:all;user-select:all}.select-none{-webkit-user-select:none;user-select:none}@media (hover:hover){.group-hover\\:opacity-100:is(:where(.group):hover *){opacity:1}}.last\\:border-0:last-child{border-style:var(--tw-border-style);border-width:0}@media (hover:hover){.hover\\:border-blue-500:hover{border-color:var(--color-blue-500)}.hover\\:border-gray-500:hover{border-color:var(--color-gray-500)}.hover\\:bg-blue-500:hover{background-color:var(--color-blue-500)}.hover\\:bg-blue-600:hover{background-color:var(--color-blue-600)}.hover\\:bg-gray-500:hover{background-color:var(--color-gray-500)}.hover\\:bg-gray-600:hover{background-color:var(--color-gray-600)}.hover\\:bg-gray-700:hover{background-color:var(--color-gray-700)}.hover\\:bg-gray-800:hover{background-color:var(--color-gray-800)}.hover\\:bg-green-500:hover{background-color:var(--color-green-500)}.hover\\:bg-green-600:hover{background-color:var(--color-green-600)}.hover\\:bg-indigo-500:hover{background-color:var(--color-indigo-500)}.hover\\:bg-orange-500:hover{background-color:var(--color-orange-500)}.hover\\:bg-orange-600:hover{background-color:var(--color-orange-600)}.hover\\:bg-purple-600:hover{background-color:var(--color-purple-600)}.hover\\:bg-red-500:hover{background-color:var(--color-red-500)}.hover\\:bg-red-600:hover{background-color:var(--color-red-600)}.hover\\:bg-yellow-500:hover{background-color:var(--color-yellow-500)}.hover\\:bg-yellow-600:hover{background-color:var(--color-yellow-600)}.hover\\:text-red-400:hover{color:var(--color-red-400)}.hover\\:text-white:hover{color:var(--color-white)}}.focus\\:border-blue-500:focus{border-color:var(--color-blue-500)}.focus\\:border-green-400:focus{border-color:var(--color-green-400)}.focus\\:border-yellow-400:focus{border-color:var(--color-yellow-400)}.focus\\:ring-blue-500:focus{--tw-ring-color:var(--color-blue-500)}.focus\\:outline-none:focus{--tw-outline-style:none;outline-style:none}@media (min-width:40rem){.sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:48rem){.md\\:static{position:static}.md\\:col-span-2{grid-column:span 2/span 2}.md\\:flex{display:flex}.md\\:hidden{display:none}.md\\:h-full{height:100%}.md\\:max-h-none{max-height:none}.md\\:w-64{width:calc(var(--spacing) * 64)}.md\\:w-auto{width:auto}.md\\:cursor-default{cursor:default}.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.md\\:flex-row{flex-direction:row}.md\\:border-r{border-right-style:var(--tw-border-style);border-right-width:1px}.md\\:border-b-0{border-bottom-style:var(--tw-border-style);border-bottom-width:0}.md\\:border-none{--tw-border-style:none;border-style:none}.md\\:p-10{padding:calc(var(--spacing) * 10)}.md\\:shadow-none{--tw-shadow:0 0 #0000;box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}}}@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-y{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-z{syntax:"*";inherits:false;initial-value:0}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --tw-space-x-reverse{syntax:"*";inherits:false;initial-value:0}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-gradient-position{syntax:"*";inherits:false}@property --tw-gradient-from{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-via{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-to{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-stops{syntax:"*";inherits:false}@property --tw-gradient-via-stops{syntax:"*";inherits:false}@property --tw-gradient-from-position{syntax:"<length-percentage>";inherits:false;initial-value:0%}@property --tw-gradient-via-position{syntax:"<length-percentage>";inherits:false;initial-value:50%}@property --tw-gradient-to-position{syntax:"<length-percentage>";inherits:false;initial-value:100%}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-tracking{syntax:"*";inherits:false}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-shadow-color{syntax:"*";inherits:false}@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-shadow-color{syntax:"*";inherits:false}@property --tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-ring-color{syntax:"*";inherits:false}@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-ring-color{syntax:"*";inherits:false}@property --tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-ring-inset{syntax:"*";inherits:false}@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-blur{syntax:"*";inherits:false}@property --tw-brightness{syntax:"*";inherits:false}@property --tw-contrast{syntax:"*";inherits:false}@property --tw-grayscale{syntax:"*";inherits:false}@property --tw-hue-rotate{syntax:"*";inherits:false}@property --tw-invert{syntax:"*";inherits:false}@property --tw-opacity{syntax:"*";inherits:false}@property --tw-saturate{syntax:"*";inherits:false}@property --tw-sepia{syntax:"*";inherits:false}@property --tw-drop-shadow{syntax:"*";inherits:false}@property --tw-drop-shadow-color{syntax:"*";inherits:false}@property --tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-drop-shadow-size{syntax:"*";inherits:false}@property --tw-backdrop-blur{syntax:"*";inherits:false}@property --tw-backdrop-brightness{syntax:"*";inherits:false}@property --tw-backdrop-contrast{syntax:"*";inherits:false}@property --tw-backdrop-grayscale{syntax:"*";inherits:false}@property --tw-backdrop-hue-rotate{syntax:"*";inherits:false}@property --tw-backdrop-invert{syntax:"*";inherits:false}@property --tw-backdrop-opacity{syntax:"*";inherits:false}@property --tw-backdrop-saturate{syntax:"*";inherits:false}@property --tw-backdrop-sepia{syntax:"*";inherits:false}@property --tw-ease{syntax:"*";inherits:false}`;

    // @ts-check
    /**
     * settings-ui.js — Cupcake PM settings panel (core orchestrator).
     * Renders the full-screen settings interface with Tailwind CSS.
     *
     * Sub-modules (extracted for modularity):
     *   settings-ui-custom-models.js — Custom model editor + CRUD
     *   settings-ui-plugins.js       — Sub-plugins tab renderer + update check
     *   settings-ui-panels.js        — API View panel + Export/Import
     */

    /**
     * Injects the pre-built Tailwind CSS into the document as a <style> tag.
     * Replaces the previous CDN-based approach for offline reliability.
     * @returns {Promise<HTMLStyleElement | null>}
     */
    function ensureTailwindLoaded() {
        const existing = /** @type {HTMLStyleElement | null} */ (document.getElementById('cpm-tailwind'));
        if (existing) return Promise.resolve(existing);

        const style = document.createElement('style');
        style.id = 'cpm-tailwind';
        style.textContent = TAILWIND_CSS;
        document.head.appendChild(style);
        return Promise.resolve(style);
    }

    function shouldPersistControl(/** @type {any} */ el) {
        const id = el?.id || '';
        if (!id) return false;
        if (id.startsWith('cpm-cm-')) return false;
        if (id.startsWith('cpm-api-view-')) return false;
        if (id === 'cpm-file-plugin') return false;
        return true;
    }

    function bindSettingsPersistenceHandlers(/** @type {any} */ root, /** @type {any} */ setVal) {
        if (!root || typeof root.querySelectorAll !== 'function' || typeof setVal !== 'function') return;

        root.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach((/** @type {any} */ el) => {
            if (!shouldPersistControl(el)) return;
            el.addEventListener('change', (/** @type {any} */ e) => {
                Promise.resolve(setVal(e.target.id, e.target.value)).catch(err => {
                    console.error('[CupcakePM] Failed to persist setting:', e.target?.id, err);
                });
            });
        });

        root.querySelectorAll('input[type="checkbox"]').forEach((/** @type {any} */ el) => {
            if (!shouldPersistControl(el)) return;
            el.addEventListener('change', (/** @type {any} */ e) => {
                Promise.resolve(setVal(e.target.id, e.target.checked)).catch(err => {
                    console.error('[CupcakePM] Failed to persist checkbox setting:', e.target?.id, err);
                });
            });
        });
    }

    async function openCpmSettings() {
        Risu.showContainer('fullscreen');

        // Tailwind CSS (build-time inlined)
        ensureTailwindLoaded();

        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0; background:#1e1e24; color:#d1d5db; font-family:-apple-system, sans-serif; height:100vh; overflow:hidden;';

        const _spmAny = /** @type {any} */ (SubPluginManager);

        const getVal = async (/** @type {string} */ k) => await safeGetArg(k);
        const getBoolVal = async (/** @type {string} */ k) => await safeGetBoolArg(k);
        const setVal = async (/** @type {string} */ k, /** @type {any} */ v) => {
            await Risu.setArgument(k, String(v));
            SettingsBackup.updateKey(k, String(v));
            // Invalidate smart-fetch compatibility cache when relevant settings change
            if (k === 'cpm_compatibility_mode' || k === 'cpm_streaming_enabled' || k === 'cpm_copilot_nodeless_mode') {
                _resetCompatibilityCache();
                if (k === 'cpm_copilot_nodeless_mode') clearCopilotTokenCache();
                queueMicrotask(() => {
                    Promise.resolve(refreshStatusIndicators()).catch(err => {
                        console.error('[CupcakePM] Failed to refresh status indicators:', err);
                    });
                });
            }
        };

        async function refreshStatusIndicators() {
            const statusEl = document.getElementById('cpm-stream-status');
            const compatStatusEl = document.getElementById('cpm-compat-status');

            try {
                const capable = await checkStreamCapability();
                if (statusEl) {
                    statusEl.innerHTML = capable
                        ? '<span class="text-emerald-400">✓ Bridge 지원됨</span> — ReadableStream 전송 가능.'
                        : '<span class="text-yellow-400">✗ Bridge 미지원</span> — 자동으로 문자열 수집 모드로 폴백됩니다.';
                    statusEl.classList.remove('border-gray-600', 'border-emerald-700', 'border-yellow-800');
                    statusEl.classList.add(capable ? 'border-emerald-700' : 'border-yellow-800');
                }

                if (compatStatusEl) {
                    const manualEnabled = await safeGetBoolArg('cpm_compatibility_mode', false);
                    const nodelessMode = await safeGetArg('cpm_copilot_nodeless_mode', 'off');
                    compatStatusEl.classList.remove('border-gray-600', 'border-emerald-700', 'border-amber-700');
                    if (manualEnabled) {
                        compatStatusEl.innerHTML = `<span class="text-amber-400">⚡ 수동 활성화됨</span> — nativeFetch 건너뛰기 + 스트리밍 자동 비활성화.${nodelessMode !== 'off' ? ` <span class="text-cyan-300">Node-less 실험 모드: ${escHtml(nodelessMode)}</span>` : ''}`;
                        compatStatusEl.classList.add('border-amber-700');
                    } else if (!capable) {
                        compatStatusEl.innerHTML = `<span class="text-yellow-400">⚠ Bridge 미지원</span> — ReadableStream 전달이 불가능한 환경입니다. 문제가 있으면 호환성 모드를 수동으로 켜주세요.${nodelessMode !== 'off' ? ` <span class="text-cyan-300">Node-less 실험 모드: ${escHtml(nodelessMode)}</span>` : ''}`;
                        compatStatusEl.classList.add('border-amber-700');
                    } else {
                        compatStatusEl.innerHTML = nodelessMode === 'off'
                            ? '<span class="text-emerald-400">✓ 비활성</span> — Bridge 정상. 호환성 모드가 필요하지 않습니다.'
                            : `<span class="text-cyan-300">🧪 Node-less 실험 모드</span> — iPhone용 호환성은 꺼져 있지만 Copilot 헤더 전략은 ${escHtml(nodelessMode)} 로 동작합니다.`;
                        compatStatusEl.classList.add('border-emerald-700');
                    }
                }
            } catch (e) {
                if (statusEl) statusEl.innerHTML = `<span class="text-red-400">Bridge 확인 실패:</span> ${escHtml(/** @type {Error} */ (e).message)}`;
                if (compatStatusEl) compatStatusEl.innerHTML = `<span class="text-red-400">확인 실패:</span> ${escHtml(/** @type {Error} */ (e).message)}`;
            }
        }

        const escAttr = (/** @type {any} */ s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const renderInput = async (/** @type {string} */ id, /** @type {string} */ label, type = 'text', /** @type {any[]} */ opts = []) => {
            let html = `<div class="mb-4">`;
            if (type === 'checkbox') {
                const val = await getBoolVal(id);
                html += `<label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                           <input id="${id}" type="checkbox" ${val ? 'checked' : ''} class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                           <span>${label}</span>
                         </label></div>`;
            } else if (type === 'select') {
                const val = await getVal(id);
                html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                html += `<select id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">`;
                opts.forEach(o => html += `<option value="${escAttr(o.value)}" ${val === o.value ? 'selected' : ''}>${escAttr(o.text)}</option>`);
                html += `</select></div>`;
            } else if (type === 'textarea') {
                const val = await getVal(id);
                html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                html += `<textarea id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 h-24" spellcheck="false">${escAttr(val)}</textarea></div>`;
            } else if (type === 'password') {
                const val = await getVal(id);
                html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                html += `<div class="relative">`;
                html += `<input id="${id}" type="password" value="${escAttr(val)}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 pr-10 text-white focus:outline-none focus:border-blue-500">`;
                html += `<button type="button" class="cpm-pw-toggle absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none text-lg px-1" data-target-id="${id}" title="비밀번호 보기/숨기기">👁️</button>`;
                html += `</div></div>`;
            } else {
                const val = await getVal(id);
                html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                html += `<input id="${id}" type="${type}" value="${escAttr(val)}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"></div>`;
            }
            return html;
        };

        const container = document.createElement('div');
        container.className = 'flex flex-col md:flex-row h-full';

        const sidebar = document.createElement('div');
        sidebar.className = 'w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col pt-2 shrink-0 z-50 relative';
        sidebar.innerHTML = `
        <div class="h-14 flex items-center justify-between px-6 border-b border-gray-700 md:border-none cursor-pointer md:cursor-default" id="cpm-mobile-menu-btn">
            <h2 class="text-lg font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">🧁 Cupcake PM v${CPM_VERSION}</h2>
            <span class="md:hidden text-gray-400 text-xl" id="cpm-mobile-icon">▼</span>
        </div>
        <div class="hidden md:flex items-center gap-3 px-5 py-1.5 border-b border-gray-700/50">
            <span class="text-[10px] text-gray-500">⌨️ <kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Shift</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">Alt</kbd>+<kbd class="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-400">P</kbd></span>
            <span class="text-[10px] text-gray-600">|</span>
            <span class="text-[10px] text-gray-500">📱 4손가락 터치</span>
        </div>
        <div id="cpm-mobile-dropdown" class="hidden md:flex flex-col absolute md:static top-full left-0 w-full md:w-auto bg-gray-900 border-b border-gray-700 md:border-none shadow-xl md:shadow-none z-[100] h-auto max-h-[70vh] md:max-h-none md:h-full overflow-hidden flex-1">
            <div class="flex-1 overflow-y-auto py-2 pr-2" id="cpm-tab-list">
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-2">Common</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-cyan-300 font-semibold" data-target="tab-global">🎛️ 글로벌 기본값</button>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Aux Slots (Map Mode)</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-trans">🌐 번역 (Trans)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-emo">😊 감정 판독 (Emotion)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-mem">🧠 하이파 (Mem)</button>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-other">⚙️ 트리거/루아 (Other)</button>
            <div id="cpm-provider-tabs-section"></div>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Custom Providers</div>
            <button class="w-full text-left px-5 py-2 text-sm flex items-center justify-between hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-customs">
                <span>🛠️ Custom Models Manager</span>
                <span class="bg-blue-600 text-xs px-2 py-0.5 rounded-full" id="cpm-cm-count">0</span>
            </button>
            <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Extensions</div>
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-yellow-300 font-bold bg-yellow-900/10" data-target="tab-plugins">🧩 Sub-Plugins${_spmAny._pendingUpdateNames.length > 0 ? ` <span style="background:#4f46e5;color:#e0e7ff;font-size:10px;padding:1px 6px;border-radius:9px;margin-left:4px;font-weight:bold;">${_spmAny._pendingUpdateNames.length}</span>` : ''}</button>
            </div>
            <div class="p-4 border-t border-gray-800 space-y-2 shrink-0 bg-gray-900 z-10 relative" id="cpm-tab-footer">
                <button id="cpm-export-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬇️ 설정 내보내기</button>
                <button id="cpm-import-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬆️ 설정 불러오기</button>
                <button id="cpm-close-btn" class="w-full bg-red-600/90 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow-[0_0_10px_rgba(239,68,68,0.5)]">✕ Close Settings</button>
            </div>
        </div>
    `;

        const content = document.createElement('div');
        content.className = 'flex-1 bg-[#121214] overflow-y-auto p-5 md:p-10';

        const providersList = [{ value: '', text: '🚫 미지정 (Main UI의 모델이 처리)' }];
        for (const m of /** @type {any[]} */ (state.ALL_DEFINED_MODELS)) providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });

        const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'xhigh', text: 'XHigh (매우 높음)' }];
        const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
        const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];
        const effortList = [{ value: 'none', text: '사용 안함 (Off)' }, { value: 'unspecified', text: '미지정 (Unspecified)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'max', text: 'Max (최대)' }];

        const renderAuxParams = async (/** @type {string} */ slot) => `
        <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
            <h4 class="text-xl font-bold text-gray-300 mb-2">Generation Parameters (생성 설정)</h4>
            <p class="text-xs text-blue-400 font-semibold mb-4 border-l-2 border-blue-500 pl-2">
                여기 값을 입력하면 리스AI 설정(파라미터 분리 포함) 대신 이 값이 우선 적용됩니다.<br/>
                비워두면 CPM은 그 항목을 건드리지 않고, 리스AI가 보낸 값을 그대로 사용합니다.<br/>
                <span class="text-gray-500">(CPM slot override &gt; RisuAI separate params &gt; RisuAI main params)</span>
            </p>
            ${await renderInput(`cpm_slot_${slot}_max_context`, 'Max Context Tokens (최대 컨텍스트)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_max_out`, 'Max Output Tokens (최대 응답 크기)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_temp`, 'Temperature (온도)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_top_p`, 'Top P (오답 컷팅)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_top_k`, 'Top K (오답 컷팅)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_rep_pen`, 'Repetition Penalty (반복 페널티)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_freq_pen`, 'Frequency Penalty (빈도 페널티)', 'number')}
            ${await renderInput(`cpm_slot_${slot}_pres_pen`, 'Presence Penalty (존재 페널티)', 'number')}
        </div>
    `;

        const slotCollisionWarning = `
        <div class="bg-amber-900/30 border border-amber-600/50 rounded-lg p-3 mt-3 mb-4">
            <p class="text-xs text-amber-300 font-semibold mb-1">⚠️ 동일 모델 할당 시 주의사항</p>
            <p class="text-xs text-amber-200/80">
                이 슬롯에 할당한 모델이 <strong>메인 채팅 모델과 동일한 경우</strong>, CPM은 요청 내용(프롬프트)을 분석하여 보조 태스크인지 판별합니다.<br/>
                <span class="text-amber-400">→ 구분이 명확하면</span>: 아래 설정한 파라미터가 적용됩니다.<br/>
                <span class="text-amber-400">→ 구분이 불확실하면</span>: <strong>리스AI에서 보내는 값이 그대로 사용</strong>됩니다 (CPM 오버라이드 비적용).<br/>
                <span class="text-gray-500 text-[10px]">💡 다른 모델을 할당하면 이 제한 없이 항상 CPM 파라미터가 적용됩니다.</span>
            </p>
        </div>
    `;

        // ── Build tab content HTML ──
        content.innerHTML = `
        <div id="tab-trans" class="cpm-tab-content">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">번역 백그라운드 설정 (Translation)</h3>
            <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">메인 UI에서 선택한 [메인 챗] 프로바이더와 다르게, 번역 태스크만 자동으로 납치하여 전담할 프로바이더를 선택합니다.</p>
            ${await renderInput('cpm_slot_translation', '번역 전담 모델 선택 (Translation Model)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('translation')}
        </div>
        <div id="tab-emo" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">감정 판독 백그라운드 설정 (Emotion)</h3>
            <p class="text-pink-300 font-semibold mb-6 border-l-4 border-pink-500 pl-4 py-1">캐릭터 리액션/표정 태스크를 낚아채서 처리할 작고 빠른 모델을 지정하세요.</p>
            ${await renderInput('cpm_slot_emotion', '감정 판독 전담 모델 (Emotion/Hypa)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('emotion')}
        </div>
        <div id="tab-mem" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">하이파 백그라운드 설정 (Memory)</h3>
            <p class="text-yellow-300 font-semibold mb-6 border-l-4 border-yellow-500 pl-4 py-1">채팅 메모리 요약 등 긴 텍스트 축약 역할을 전담할 모델을 지정하세요.</p>
            ${await renderInput('cpm_slot_memory', '하이파 전담 모델 (Memory/Summarize)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('memory')}

            <div class="mt-8 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-orange-400 mb-4">🔗 HypaV3 임베딩 프록시</h4>
                <div class="bg-gray-800/70 border border-orange-900/50 rounded-lg p-4 mb-4">
                    <p class="text-xs text-orange-300 mb-3 font-semibold">⚡ Nodeless 환경에서 HypaV3 임베딩 사용하기</p>
                    <p class="text-xs text-gray-400 mb-3">Nodeless(도커/셀프호스트) 환경에서는 HypaV3의 custom 임베딩이 CORS/프록시 인증 문제로 실패합니다. 아래 두 방법 중 하나를 쓰면 해결됩니다.</p>

                    <div class="bg-gray-900 rounded p-3 mb-3">
                        <p class="text-xs font-bold text-green-400 mb-2">🖥️ 방법 1: 로컬 프록시 (copilot-proxy.exe)</p>
                        <ol class="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
                            <li>copilot-proxy.exe 실행</li>
                            <li>하이파V3:
                                <div class="mt-1 space-y-0.5">
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">모델:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">custom</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Custom Server URL:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">http://localhost:18976/v1</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">API Key:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인의 임베딩 API 키)</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Model:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인이 쓰는 모델명)</code></div>
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div class="bg-gray-900 rounded p-3 mb-3">
                        <p class="text-xs font-bold text-blue-400 mb-2">☁️ 방법 2: Cloudflare Worker (인터넷 배포)</p>
                        <p class="text-[10px] text-gray-400 mb-2">로컬 exe 없이 인터넷에서 돌리고 싶으면 클플 워커로 배포 가능. 클플_프록시.md 참고.</p>
                        <ol class="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
                            <li>Cloudflare Workers에 코드 복붙 → Deploy</li>
                            <li>하이파V3:
                                <div class="mt-1 space-y-0.5">
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">모델:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">custom</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Custom Server URL:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">https://내워커.workers.dev/v1</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">API Key:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인의 임베딩 API 키)</code></div>
                                    <div class="flex items-center text-[11px]"><span class="text-gray-500 w-28 shrink-0">Model:</span><code class="bg-gray-700 px-1 rounded text-cyan-300">(본인이 쓰는 모델명)</code></div>
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div class="bg-gray-900/50 rounded p-2 mb-2">
                        <p class="text-[10px] text-gray-500 mb-1">두 방법 모두 모델명 자동 감지 지원:</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                            <div><code class="text-cyan-400">voyage-*</code> <span class="text-gray-600">→ Voyage AI</span></div>
                            <div><code class="text-cyan-400">text-embedding-*</code> <span class="text-gray-600">→ OpenAI</span></div>
                            <div><code class="text-cyan-400">embed-*</code> <span class="text-gray-600">→ Cohere</span></div>
                            <div><code class="text-cyan-400">jina-*</code> <span class="text-gray-600">→ Jina</span></div>
                            <div><code class="text-cyan-400">mistral-*</code> <span class="text-gray-600">→ Mistral</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div id="tab-global" class="cpm-tab-content">
            <h3 class="text-3xl font-bold text-cyan-400 mb-6 pb-3 border-b border-gray-700">🎛️ 글로벌 기본값 (Global Fallback Parameters)</h3>
            <p class="text-cyan-300 font-semibold mb-4 border-l-4 border-cyan-500 pl-4 py-1">리스AI가 특정 파라미터를 보내지 않았을 때만, 여기 입력한 값이 보조 기본값으로 사용됩니다.</p>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
                <h4 class="text-sm font-bold text-gray-300 mb-3">📋 파라미터 우선순위 (높은 순서)</h4>
                <div class="text-xs text-gray-400 space-y-1">
                    <div class="flex items-center"><span class="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">1</span> CPM 슬롯 오버라이드</div>
                    <div class="flex items-center"><span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">2</span> 리스AI 파라미터 분리 값</div>
                    <div class="flex items-center"><span class="bg-green-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">3</span> 리스AI 메인 모델 파라미터</div>
                    <div class="flex items-center"><span class="bg-cyan-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">4</span> <strong class="text-cyan-300">⭐ 여기: CPM 글로벌 기본값</strong></div>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-6">💡 <strong>중요:</strong> 여기를 비워두면 CPM은 그 항목을 추가하지 않습니다. 즉, 값이 없으면 없는 그대로 전송됩니다.</p>
            <div class="space-y-2">
                ${await renderInput('cpm_fallback_temp', 'Default Temperature (기본 온도, 비워두면 미전송)', 'number')}
                ${await renderInput('cpm_fallback_max_tokens', 'Default Max Output Tokens (비워두면 미전송)', 'number')}
                ${await renderInput('cpm_fallback_top_p', 'Default Top P (기본 Top P, 비워두면 API 기본값)', 'number')}
                ${await renderInput('cpm_fallback_freq_pen', 'Default Frequency Penalty (기본 빈도 페널티, 비워두면 API 기본값)', 'number')}
                ${await renderInput('cpm_fallback_pres_pen', 'Default Presence Penalty (기본 존재 페널티, 비워두면 API 기본값)', 'number')}
            </div>
            <div class="mt-10 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-emerald-400 mb-4">🔄 스트리밍 설정 (Streaming)</h4>
                <div class="bg-gray-800/70 border border-emerald-900/50 rounded-lg p-4 mb-6">
                    <p class="text-xs text-emerald-300 mb-2 font-semibold">📡 실시간 스트리밍 지원</p>
                    <p class="text-xs text-gray-400 mb-2">활성화하면 API 응답을 ReadableStream으로 RisuAI에 직접 전달하여, RisuAI가 실시간으로 텍스트를 표시할 수 있습니다.</p>
                    <p class="text-xs text-yellow-500">⚠️ 최신 RisuAI-main은 ReadableStream transferables를 지원하지만, 구버전 호스트에서는 자동으로 비활성화될 수 있습니다.</p>
                    <div id="cpm-stream-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">Bridge 상태: 확인 중...</div>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_streaming_enabled', '스트리밍 패스스루 활성화 (Enable Streaming Pass-Through)', 'checkbox')}
                    ${await renderInput('cpm_streaming_show_thinking', 'Anthropic Thinking 토큰 표시 (Show Thinking in Stream)', 'checkbox')}
                </div>
                <div class="mt-6 pt-4 border-t border-gray-700/50">
                    <h5 class="text-sm font-bold text-amber-400 mb-3">📱 iPhone/Safari 호환성 모드 (Compatibility Mode)</h5>
                    <div class="bg-gray-800/70 border border-amber-900/50 rounded-lg p-4 mb-4">
                        <p class="text-xs text-amber-300 mb-2 font-semibold">🔧 호환성 모드란?</p>
                        <p class="text-xs text-gray-400 mb-2">iPhone/Safari 등 ReadableStream 전달이 불안정한 환경에서 nativeFetch를 건너뛰고 risuFetch만 사용합니다.</p>
                        <p class="text-xs text-gray-400 mb-2">또한 <strong class="text-amber-200">스트리밍을 자동으로 비활성화</strong>하여, 응답 본문을 못 받아 요청이 2회 발생하는 문제를 방지합니다.</p>
                        <p class="text-xs text-yellow-500">⚠️ 호환성 모드는 수동으로만 활성화됩니다. iPhone/Safari 등에서 스트리밍이 안 되거나 요청이 중복 발생하면 수동으로 켜주세요.</p>
                        <div id="cpm-compat-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">호환성 상태: 확인 중...</div>
                    </div>
                    <div class="space-y-3">
                        ${await renderInput('cpm_compatibility_mode', '호환성 모드 활성화 (Compatibility Mode)', 'checkbox')}
                        ${await renderInput('cpm_copilot_nodeless_mode', 'Node-less용 Copilot 실험 모드', 'select', [
                            { value: 'off', text: '끄기 (기본 헤더 유지)' },
                            { value: 'nodeless-1', text: '실험 1 — 토큰 교환 헤더만 축소' },
                            { value: 'nodeless-2', text: '실험 2 — 토큰 + 실제 요청 헤더 축소' },
                        ])}
                    </div>
                    <p class="text-xs text-cyan-400/90 mt-3">💡 Node-less 실험 모드는 Copilot 전용입니다. 사용자가 1번/2번을 바꿔가며 어떤 조합이 통하는지 직접 테스트할 수 있습니다.</p>
                </div>
            </div>
            <div class="mt-10 pt-6 border-t border-gray-700">
                <h4 class="text-xl font-bold text-purple-400 mb-4">📊 토큰 사용량 표시 (Token Usage Display)</h4>
                <div class="bg-gray-800/70 border border-purple-900/50 rounded-lg p-4 mb-6">
                    <p class="text-xs text-purple-300 mb-2 font-semibold">📊 실시간 토큰 사용량 알림</p>
                    <p class="text-xs text-gray-400 mb-2">활성화하면 API 응답이 올 때마다 화면 우측 상단에 토큰 사용량을 표시합니다.</p>
                    <p class="text-xs text-gray-500">💡 OpenAI, Anthropic, Gemini, Vertex, AWS 등 모든 프로바이더에서 동작합니다.</p>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_show_token_usage', '토큰 사용량 표시 (Show Token Usage Toast)', 'checkbox')}
                </div>
            </div>
        </div>
        <div id="tab-other" class="cpm-tab-content hidden">
            <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">트리거/루아 백그라운드 설정 (Other)</h3>
            ${await renderInput('cpm_slot_other', 'Lua 스크립트 등 무거운 유틸 전담 모델 (Other/Trigger)', 'select', providersList)}
            ${slotCollisionWarning}
            ${await renderAuxParams('other')}
        </div>
        <div id="cpm-dynamic-provider-content"></div>
        <div id="tab-customs" class="cpm-tab-content hidden">
            <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                <h3 class="text-3xl font-bold text-gray-400">Custom Models Manager</h3>
                <div class="flex space-x-2">
                    <button id="cpm-api-view-btn" class="bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📡 API 보기</button>
                    <button id="cpm-import-model-btn" class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📥 Import Model</button>
                    <button id="cpm-add-custom-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">➕ Add Model</button>
                </div>
            </div>
            <div id="cpm-api-view-panel" class="hidden mb-6 bg-gray-900 border border-purple-700/50 rounded-lg p-5">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-lg font-bold text-purple-400">📡 API 요청 로그</h4>
                    <div class="flex items-center gap-3">
                        <select id="cpm-api-view-selector" class="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 max-w-xs"></select>
                        <button id="cpm-api-view-close" class="text-gray-400 hover:text-white text-lg px-2">✕</button>
                    </div>
                </div>
                <div id="cpm-api-view-content" class="text-sm text-gray-300">
                    <div class="text-center text-gray-500 py-4">아직 API 요청을 보낸 적이 없습니다.</div>
                </div>
            </div>
            <div id="cpm-cm-list" class="space-y-3"></div>
            ${renderCustomModelEditor(thinkingList, reasoningList, verbosityList, effortList)}
            <p class="text-xs font-bold text-gray-500 mt-4">* Additions/deletions require refreshing RisuAI (F5) to appear in the native dropdown menu.</p>
        </div>
        <div id="tab-plugins" class="cpm-tab-content hidden">
            <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                <h3 class="text-3xl font-bold text-gray-400">Sub-Plugins Manager</h3>
                <button id="cpm-check-updates-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">🔄 서브 플러그인 업데이트 확인</button>
            </div>
            ${_spmAny._pendingUpdateNames.length > 0
                ? `<div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-3 mb-4 flex items-center gap-2"><span class="text-indigo-300 text-sm font-semibold">🔔 ${_spmAny._pendingUpdateNames.length}개의 서브 플러그인 업데이트가 감지되었습니다.</span></div>`
                : ''}
            <p class="text-yellow-300 font-semibold mb-4 border-l-4 border-yellow-500 pl-4 py-1">Cupcake PM에 연동된 외부 확장 기능(Sub-Plugins)들을 통합 관리합니다.</p>
            <div id="cpm-update-status" class="hidden mb-4"></div>
            <div id="cpm-plugins-list" class="space-y-4"></div>
        </div>
    `;

        // ── Sub-plugins UI renderer ──
        const renderPluginsTab = buildPluginsTabRenderer(setVal);

        container.appendChild(sidebar);
        container.appendChild(content);
        document.body.appendChild(container);

        // ── Dynamic provider tabs ──
        const providerTabsSection = document.getElementById('cpm-provider-tabs-section');
        const dynamicContentContainer = document.getElementById('cpm-dynamic-provider-content');
        if (registeredProviderTabs.length > 0 && providerTabsSection) {
            let sidebarBtnsHtml = `<div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Providers</div>`;
            let contentHtml = '';
            for (const tab of /** @type {any[]} */ (registeredProviderTabs)) {
                sidebarBtnsHtml += `<button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="${tab.id}">${tab.icon} ${tab.label}</button>`;
                try {
                    const tabContent = await tab.renderContent(renderInput, { reasoningList, verbosityList, thinkingList });
                    contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden">${tabContent}</div>`;
                } catch (err) {
                    console.error(`[CupcakePM] Failed to render settings tab: ${tab.id}`, err);
                    contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden"><p class="text-red-400">Error rendering tab: ${/** @type {Error} */ (err).message}</p></div>`;
                }
            }
            providerTabsSection.innerHTML = sidebarBtnsHtml;
            if (dynamicContentContainer) dynamicContentContainer.innerHTML = contentHtml;
        }

        renderPluginsTab();

        // ── Mobile menu toggle ──
        const mobileMenuBtn = document.getElementById('cpm-mobile-menu-btn');
        const mobileDropdown = document.getElementById('cpm-mobile-dropdown');
        const mobileIcon = document.getElementById('cpm-mobile-icon');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                if (!mobileDropdown || !mobileIcon) return;
                const isHidden = mobileDropdown.classList.contains('hidden');
                if (isHidden) { mobileDropdown.classList.remove('hidden'); mobileDropdown.classList.add('flex'); mobileIcon.innerText = '▲'; }
                else { mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); mobileIcon.innerText = '▼'; }
            });
        }

        // ── Bind all input change events ──
        bindSettingsPersistenceHandlers(content, setVal);
        content.querySelectorAll('.cpm-pw-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!(btn instanceof HTMLButtonElement)) return;
                const targetId = btn.dataset.targetId;
                if (!targetId) return;
                /** @type {HTMLInputElement | null} */
                const input = /** @type {HTMLInputElement | null} */ (document.getElementById(targetId));
                if (!input) return;
                if (input.type === 'password') { input.type = 'text'; btn.textContent = '🔒'; }
                else { input.type = 'password'; btn.textContent = '👁️'; }
            });
        });

        // ── Tab switching ──
        const tabs = sidebar.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.addEventListener('click', () => {
            if (!(t instanceof HTMLElement)) return;
            tabs.forEach(x => { x.classList.remove('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400'); });
            t.classList.add('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400');
            content.querySelectorAll('.cpm-tab-content').forEach(p => p.classList.add('hidden'));
            const targetId = t.dataset.target;
            if (!targetId) return;
            document.getElementById(targetId)?.classList.remove('hidden');
            if (targetId === 'tab-plugins') renderPluginsTab();
            if (window.innerWidth < 768 && mobileDropdown && !mobileDropdown.classList.contains('hidden')) {
                mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); if (mobileIcon) mobileIcon.innerText = '▼';
            }
        }));
        if (tabs[0] instanceof HTMLElement) tabs[0].click();

        // ── Stream / compatibility status check ──
        await refreshStatusIndicators();

        // ── Custom Models Manager ──
        initCustomModelsManager();

        // ── API View ──
        initApiViewPanel();

        // ── Snapshot settings ──
        await SettingsBackup.snapshotAll();

        // ── Export/Import ──
        initExportImport(setVal, openCpmSettings);

        // ── Close button ──
        document.getElementById('cpm-close-btn')?.addEventListener('click', () => {
            document.body.innerHTML = '';
            Risu.hideContainer();
        });
    }

    // @ts-check
    /**
     * init.js — Boot sequence for Cupcake Provider Manager.
     *
     * Defines _exposeScopeToWindow (window scope bridge for sub-plugins)
     * and runs the full initialization IIFE: sub-plugin loading, settings
     * restore, stream check, dynamic models, model registration, keyboard
     * shortcut, and touch gesture.
     */

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
            _normalizeTokenUsage, _showTokenUsageToast: showTokenUsageToast, _needsCopilotResponsesAPI: needsCopilotResponsesAPI,
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

    exports.AwsV4Signer = AwsV4Signer;
    exports.CPM_BASE_URL = CPM_BASE_URL;
    exports.CPM_SLOT_LIST = CPM_SLOT_LIST;
    exports.CPM_VERSION = CPM_VERSION;
    exports.GEMINI_BLOCK_REASONS = GEMINI_BLOCK_REASONS;
    exports.KeyPool = KeyPool;
    exports.MAIN_UPDATE_URL = MAIN_UPDATE_URL;
    exports.Risu = Risu;
    exports.SLOT_HEURISTICS = SLOT_HEURISTICS;
    exports.SettingsBackup = SettingsBackup;
    exports.SubPluginManager = SubPluginManager;
    exports.ThoughtSignatureCache = ThoughtSignatureCache;
    exports.UPDATE_BUNDLE_URL = UPDATE_BUNDLE_URL;
    exports.VERSIONS_URL = VERSIONS_URL;
    exports._computeSHA256 = _computeSHA256;
    exports._executeViaScriptTag = _executeViaScriptTag;
    exports._extractNonce = _extractNonce;
    exports._normalizeTokenUsage = _normalizeTokenUsage;
    exports._pluginCleanupHooks = _pluginCleanupHooks;
    exports._pluginRegistrations = _pluginRegistrations;
    exports._setTokenUsage = _setTokenUsage;
    exports._showTokenUsageToast = showTokenUsageToast;
    exports._takeTokenUsage = _takeTokenUsage;
    exports._tokenUsageKey = _tokenUsageKey;
    exports._tokenUsageStore = _tokenUsageStore;
    exports.autoUpdaterMethods = autoUpdaterMethods;
    exports.buf2hex = buf2hex;
    exports.buildGeminiThinkingConfig = buildGeminiThinkingConfig;
    exports.checkStreamCapability = checkStreamCapability;
    exports.cleanExperimentalModelParams = cleanExperimentalModelParams;
    exports.clearApiRequests = clearApiRequests;
    exports.clearCopilotTokenCache = clearCopilotTokenCache;
    exports.collectStream = collectStream;
    exports.createAnthropicSSEStream = createAnthropicSSEStream;
    exports.createOpenAISSEStream = createOpenAISSEStream;
    exports.createResponsesAPISSEStream = createResponsesAPISSEStream;
    exports.createSSEStream = createSSEStream;
    exports.customFetchers = customFetchers;
    exports.encodeRfc3986 = encodeRfc3986;
    exports.ensureCopilotApiToken = ensureCopilotApiToken;
    exports.extractNormalizedMessagePayload = extractNormalizedMessagePayload;
    exports.fetchByProviderId = fetchByProviderId;
    exports.fetchCustom = fetchCustom;
    exports.formatToAnthropic = formatToAnthropic;
    exports.formatToGemini = formatToGemini;
    exports.formatToOpenAI = formatToOpenAI;
    exports.geminiSupportsPenalty = geminiSupportsPenalty;
    exports.getAllApiRequests = getAllApiRequests;
    exports.getApiRequestById = getApiRequestById;
    exports.getGeminiSafetySettings = getGeminiSafetySettings;
    exports.getLatestApiRequest = getLatestApiRequest;
    exports.getSubPluginFileAccept = getSubPluginFileAccept;
    exports.guessServiceRegion = guessServiceRegion;
    exports.handleRequest = handleRequest;
    exports.hasAttachedMultimodals = hasAttachedMultimodals;
    exports.hasNonEmptyMessageContent = hasNonEmptyMessageContent;
    exports.hash = hash;
    exports.hmac = hmac;
    exports.inferSlot = inferSlot;
    exports.isDynamicFetchEnabled = isDynamicFetchEnabled;
    exports.isExperimentalGeminiModel = isExperimentalGeminiModel;
    exports.isInlaySceneWrapperText = isInlaySceneWrapperText;
    exports.needsCopilotResponsesAPI = needsCopilotResponsesAPI;
    exports.needsMaxCompletionTokens = needsMaxCompletionTokens;
    exports.normalizeOpenAIMessageContent = normalizeOpenAIMessageContent;
    exports.openCpmSettings = openCpmSettings;
    exports.parseClaudeNonStreamingResponse = parseClaudeNonStreamingResponse;
    exports.parseGeminiNonStreamingResponse = parseGeminiNonStreamingResponse;
    exports.parseGeminiSSELine = parseGeminiSSELine;
    exports.parseOpenAINonStreamingResponse = parseOpenAINonStreamingResponse;
    exports.parseOpenAISSELine = parseOpenAISSELine;
    exports.parseResponsesAPINonStreamingResponse = parseResponsesAPINonStreamingResponse;
    exports.pendingDynamicFetchers = pendingDynamicFetchers;
    exports.registeredProviderTabs = registeredProviderTabs;
    exports.resetStreamCapability = resetStreamCapability;
    exports.safeGetArg = safeGetArg;
    exports.safeGetBoolArg = safeGetBoolArg;
    exports.safeStringify = safeStringify;
    exports.safeUUID = safeUUID;
    exports.sanitizeBodyJSON = sanitizeBodyJSON;
    exports.sanitizeMessages = sanitizeMessages;
    exports.saveThoughtSignatureFromStream = saveThoughtSignatureFromStream;
    exports.scoreSlotHeuristic = scoreSlotHeuristic;
    exports.setApiRequestLogger = setApiRequestLogger;
    exports.setCopilotFetchFn = setCopilotFetchFn;
    exports.setCopilotGetArgFn = setCopilotGetArgFn;
    exports.setExposeScopeFunction = setExposeScopeFunction;
    exports.setupCupcakeAPI = setupCupcakeAPI;
    exports.shouldStripOpenAISamplingParams = shouldStripOpenAISamplingParams;
    exports.smartNativeFetch = smartNativeFetch;
    exports.state = state;
    exports.storeApiRequest = storeApiRequest;
    exports.stripInternalTags = stripInternalTags;
    exports.stripStaleAutoCaption = stripStaleAutoCaption;
    exports.stripThoughtDisplayContent = stripThoughtDisplayContent;
    exports.supportsOpenAIReasoningEffort = supportsOpenAIReasoningEffort;
    exports.updateApiRequest = updateApiRequest;
    exports.updateToastMethods = updateToastMethods;
    exports.validateGeminiParams = validateGeminiParams;

    return exports;

})({});
