//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.19.6
//@update-url https://cupcake-plugin-manager.vercel.app/provider-manager.js

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
var CupcakeProviderManager = (function (exports) {
    'use strict';

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
    const CPM_VERSION = '1.19.6';

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
     */
    function hasAttachedMultimodals(message) {
        return !!(message && Array.isArray(message.multimodals) && message.multimodals.length > 0);
    }

    /**
     * Escape HTML special characters to prevent XSS when interpolating into innerHTML.
     * Shared across all settings-ui modules.
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
     * @param {Object} part - Content part with image_url field
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

        return text.replace(/\s*\[[a-z0-9][a-z0-9 ,.'"-]{6,}\]\s*$/i, '').trim();
    }

    /**
     * Extract and normalize message payload into { text, multimodals }.
     * Handles RisuAI multimodals array, OpenAI content parts (image_url, input_audio, input_image),
     * Anthropic image blocks, and Gemini inlineData.
     * @param {Object} message
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
                    const imageUrl = part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '';
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
     * @param {Array<Object>} messages
     * @returns {Array<Object>}
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
                obj.messages = obj.messages.filter(m => {
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
                obj.contents = obj.contents.filter(m => m != null && typeof m === 'object');
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
            console.error('[Cupcake PM] sanitizeBodyJSON: JSON parse/stringify failed:', e.message);
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
                cleaned = afterLastMarker.substring(contentMatch.index).trim();
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
     * @param {Object} raw
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
            _tokenUsageStore.delete(it.next().value);
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
     * @param {Object} raw - Raw usage object from API response
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
            const fmt = (n) => n != null ? n.toLocaleString() : '0';
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
            console.debug('[CPM TokenToast] Failed:', e.message);
        }
    }

    /**
     * format-openai.js — Format messages for OpenAI-compatible APIs.
     * Handles multimodal content, role normalization, developer role conversion.
     */

    /**
     * Format messages for OpenAI Chat Completions API.
     * @param {Array} messages - Raw message array from RisuAI
     * @param {Object} config - Formatting options
     * @param {boolean} [config.mergesys] - Merge system messages into first user message
     * @param {boolean} [config.mustuser] - Ensure first message is user/system
     * @param {boolean} [config.altrole] - Convert assistant→model (for Gemini-style APIs)
     * @param {boolean} [config.sysfirst] - Move first system message to top
     * @param {boolean} [config.developerRole] - Convert system→developer (GPT-5 series)
     * @returns {Array} Formatted messages array
     */
    function formatToOpenAI(messages, config = {}) {
        // Step 1: Deep sanitize — remove nulls, strip internal RisuAI tags
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
                        const { mimeType: _audioMime, data: _audioData } = parseBase64DataUri(modal.base64);
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

    /**
     * format-anthropic.js — Format messages for Anthropic Claude API.
     * Handles system prompt extraction, consecutive message merging, multimodal content,
     * and cache_control breakpoints.
     */

    /**
     * Format messages for Anthropic Messages API.
     * @param {Array} messages - Raw message array
     * @param {Object} config - Formatting options
     * @param {boolean} [config.caching] - Enable cache_control breakpoints
     * @param {boolean} [config.claude1HourCaching] - Use 1h TTL for cache_control
     * @returns {{ messages: Array, system: string }}
     */
    function formatToAnthropic(messages, config = {}) {
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
        const chatMsgs = remainingMsgs.map(m => {
            if (m.role === 'system') {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                return { ...m, role: 'user', content: `system: ${content}` };
            }
            return m;
        });

        const formattedMsgs = [];
        for (const m of chatMsgs) {
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
                        const { mimeType: mediaType_raw, data } = parseBase64DataUri(modal.base64);
                        const mediaType = mediaType_raw || 'image/png';
                        imageParts.push({
                            type: 'image',
                            source: { type: 'base64', media_type: mediaType, data: data }
                        });
                    }
                }
                const contentParts = [...imageParts, ...textParts];
                if (contentParts.length > 0) {
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
                } else {
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                    if (!hasNonEmptyMessageContent(content)) continue;
                    if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
                        const prev = formattedMsgs[formattedMsgs.length - 1];
                        if (typeof prev.content === 'string') prev.content = [{ type: 'text', text: prev.content }, { type: 'text', text: content }];
                        else if (Array.isArray(prev.content)) prev.content.push({ type: 'text', text: content });
                    } else {
                        formattedMsgs.push({ role, content: [{ type: 'text', text: content }] });
                    }
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
                    if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
                        const prev = formattedMsgs[formattedMsgs.length - 1];
                        if (typeof prev.content === 'string') prev.content = [{ type: 'text', text: prev.content }, ...contentParts];
                        else if (Array.isArray(prev.content)) prev.content.push(...contentParts);
                    } else {
                        formattedMsgs.push({ role, content: contentParts });
                    }
                    continue;
                }
            }

            // Text-only message
            const content = payload.text || (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            if (!hasNonEmptyMessageContent(content)) continue;
            if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
                const prev = formattedMsgs[formattedMsgs.length - 1];
                if (typeof prev.content === 'string') {
                    prev.content = [{ type: 'text', text: prev.content }, { type: 'text', text: content }];
                } else if (Array.isArray(prev.content)) {
                    prev.content.push({ type: 'text', text: content });
                }
            } else {
                formattedMsgs.push({ role, content: [{ type: 'text', text: content }] });
            }
        }

        // Ensure first message is user role
        if (formattedMsgs.length === 0 || formattedMsgs[0].role !== 'user') {
            formattedMsgs.unshift({ role: 'user', content: [{ type: 'text', text: 'Start' }] });
        }

        // Apply cache_control breakpoints
        if (config.caching) {
            const _cacheCtrl = config.claude1HourCaching
                ? { type: 'ephemeral', ttl: '1h' }
                : { type: 'ephemeral' };
            let fmtIdx = 0;
            for (let ci = 0; ci < chatMsgs.length && fmtIdx < formattedMsgs.length; ci++) {
                const srcMsg = chatMsgs[ci];
                if (ci > 0) {
                    const prevRole = chatMsgs[ci - 1].role === 'assistant' ? 'assistant' : 'user';
                    const curRole = srcMsg.role === 'assistant' ? 'assistant' : 'user';
                    if (curRole !== prevRole) fmtIdx++;
                }
                if (fmtIdx >= formattedMsgs.length) break;

                if (srcMsg.cachePoint) {
                    const fMsg = formattedMsgs[fmtIdx];
                    if (Array.isArray(fMsg.content) && fMsg.content.length > 0) {
                        fMsg.content[fMsg.content.length - 1].cache_control = _cacheCtrl;
                    } else if (typeof fMsg.content === 'string') {
                        fMsg.content = [{ type: 'text', text: fMsg.content, cache_control: _cacheCtrl }];
                    }
                }
            }
        }

        return { messages: formattedMsgs, system: systemPrompt };
    }

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
     */
    function validateGeminiParams(generationConfig) {
        if (!generationConfig || typeof generationConfig !== 'object') return;
        const rules = [
            { key: 'temperature', min: 0, max: 2, fallback: 1, exclusiveMax: false },
            { key: 'topP', min: 0, max: 1, fallback: undefined, exclusiveMax: false },
            { key: 'topK', min: 1, max: 40, fallback: undefined, exclusiveMax: false },
            { key: 'frequencyPenalty', min: -2, max: 2, fallback: undefined, exclusiveMax: true },
            { key: 'presencePenalty', min: -2, max: 2, fallback: undefined, exclusiveMax: true },
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
     */
    function isExperimentalGeminiModel(modelId) {
        return modelId && (modelId.includes('exp') || modelId.includes('experimental'));
    }

    /**
     * Check if a Gemini model supports penalty parameters.
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
            const budgets = { 'MINIMAL': 1024, 'LOW': 4096, 'MEDIUM': 10240, 'HIGH': 24576 };
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
        _keyOf(responseText) {
            const normalized = stripThoughtDisplayContent(stripInternalTags(String(responseText || '')) || '');
            return normalized.substring(0, 500);
        },
        save(responseText, signature) {
            if (!responseText || !signature) return;
            const key = this._keyOf(responseText);
            this._cache.set(key, signature);
            if (this._cache.size > this._maxSize) {
                const firstKey = this._cache.keys().next().value;
                this._cache.delete(firstKey);
            }
        },
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
     * @param {Object} modal - Normalized modal { type, base64?, url?, mimeType? }
     * @returns {Object} Gemini part (inlineData or fileData)
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
     * @param {Array} messagesRaw - Raw message array
     * @param {Object} config - Formatting options
     * @param {boolean} [config.preserveSystem] - Keep system instructions in dedicated field
     * @param {boolean} [config.useThoughtSignature] - Inject cached thought signatures
     * @returns {{ contents: Array, systemInstruction: string[] }}
     */
    function formatToGemini(messagesRaw, config = {}) {
        const messages = sanitizeMessages(messagesRaw);
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
                const lastMessage = contents.length > 0 ? contents[contents.length - 1] : null;

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
     * @param {Object} config - Mutable config for tracking state across chunks
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
        _pools: {},
        /** Injected safeGetArg function. Set via setGetArgFn(). */
        _getArgFn: null,

        /**
         * Set the argument retrieval function (dependency injection).
         * @param {function} fn - async (key, defaultValue) => string
         */
        setGetArgFn(fn) {
            this._getArgFn = fn;
        },

        /**
         * Parse keys from the setting string (whitespace-separated), cache them,
         * and return a random key from the pool.
         */
        async pick(argName) {
            const pool = this._pools[argName];
            if (pool && pool._inline && pool.keys.length > 0) {
                return pool.keys[Math.floor(Math.random() * pool.keys.length)];
            }
            const getArg = this._getArgFn;
            if (!getArg) throw new Error('KeyPool._getArgFn not set. Call setGetArgFn() first.');
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
         */
        remaining(argName) {
            return this._pools[argName]?.keys?.length || 0;
        },

        /**
         * Force re-parse keys from settings on next pick.
         */
        reset(argName) {
            delete this._pools[argName];
        },

        /**
         * Pick key → fetchFn(key) → on retryable error, drain and retry.
         */
        async withRotation(argName, fetchFn, opts = {}) {
            const maxRetries = opts.maxRetries || 30;
            const isRetryable = opts.isRetryable || ((result) => {
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
                    console.warn(`[KeyPool] ⚠️ ${argName}의 모든 키가 소진되었습니다.`);
                    this.reset(argName);
                    return result;
                }
            }
            return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
        },

        // ── JSON Credential Rotation (Vertex AI 등 JSON 크레덴셜용) ──

        /**
         * Extract individual JSON objects from raw textarea input.
         * Supports: single, comma-separated, JSON array, or newline-separated.
         */
        _parseJsonCredentials(raw) {
            const trimmed = (raw || '').trim();
            if (!trimmed) return [];
            try {
                const arr = JSON.parse(trimmed);
                if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
            } catch (_) { }
            if (trimmed.startsWith('{')) {
                try {
                    const arr = JSON.parse('[' + trimmed + ']');
                    if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
                } catch (_) { }
            }
            try {
                const obj = JSON.parse(trimmed);
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) return [trimmed];
            } catch (_) { }
            return [];
        },

        /**
         * Parse JSON credentials from a textarea field, cache them,
         * and return a random one from the pool.
         */
        async pickJson(argName) {
            const getArg = this._getArgFn;
            if (!getArg) throw new Error('KeyPool._getArgFn not set. Call setGetArgFn() first.');
            const raw = await getArg(argName);
            const pool = this._pools[argName];
            if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
                const jsons = this._parseJsonCredentials(raw);
                this._pools[argName] = { lastRaw: raw, keys: jsons };
            }
            const keys = this._pools[argName].keys;
            if (keys.length === 0) return '';
            return keys[Math.floor(Math.random() * keys.length)];
        },

        /**
         * Like withRotation but uses pickJson for JSON credential parsing.
         */
        async withJsonRotation(argName, fetchFn, opts = {}) {
            const maxRetries = opts.maxRetries || 30;
            const isRetryable = opts.isRetryable || ((result) => {
                if (!result._status) return false;
                return result._status === 429 || result._status === 529 || result._status === 503;
            });

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const credJson = await this.pickJson(argName);
                if (!credJson) {
                    return { success: false, content: `[KeyPool] ${argName}에 사용 가능한 JSON 인증 정보가 없습니다. 설정에서 확인하세요.` };
                }

                const result = await fetchFn(credJson);
                if (result.success || !isRetryable(result)) return result;

                const remaining = this.drain(argName, credJson);
                console.warn(`[KeyPool] 🔄 JSON 인증 교체: ${argName} (HTTP ${result._status}, 남은 인증: ${remaining}개, 시도: ${attempt + 1})`);

                if (remaining === 0) {
                    console.warn(`[KeyPool] ⚠️ ${argName}의 모든 JSON 인증이 소진되었습니다.`);
                    this.reset(argName);
                    return result;
                }
            }
            return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
        }
    };

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
        const heuristic = SLOT_HEURISTICS[slotName];
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
     * @param {Object} activeModelDef - Model definition with uniqueId
     * @param {Object} args - Request arguments (contains prompt_chat)
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

    function encodeRfc3986(urlEncodedStr) {
        return urlEncodedStr.replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    }

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

    async function hash(content) {
        return crypto.subtle.digest(
            'SHA-256',
            typeof content === 'string' ? encoder.encode(content) : content,
        );
    }

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

        return [HOST_SERVICES[service] || service, region || ''];
    }

    /**
     * AWS Signature Version 4 signer.
     * Signs HTTP requests for AWS services (Bedrock, STS, etc.) using Web Crypto API.
     */
    class AwsV4Signer {
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

    /**
     * api-request-log.js — API Request History (ring buffer for API View feature).
     * Tracks HTTP requests/responses for debugging UI. Max 20 entries.
     */

    const _apiRequestHistory = new Map();
    const _API_REQUEST_HISTORY_MAX = 20;
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
     * @returns {Array}
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
        if (/(?:^|\/)o(?:3(?:-mini|-pro|-deep-research)?|4-mini(?:-deep-research)?)$/i.test(m)) return true;
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
        return /(?:^|\/)o(?:3(?:-mini|-pro|-deep-research)?|4-mini(?:-deep-research)?)$/i.test(
            String(modelName).toLowerCase(),
        );
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

    /**
     * response-parsers.js — Non-streaming response parsers for all providers.
     * Pure functions that extract text content from API JSON responses.
     */

    /**
     * Parse OpenAI Chat Completions non-streaming response.
     * Handles reasoning_content (o-series), reasoning (OpenRouter), DeepSeek <think> blocks.
     * @param {Object} data - Parsed JSON response
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
            _setTokenUsage(_requestId, _normalizeTokenUsage(data.usage, 'openai'), false);
        }
        return { success: !!out, content: out || '[OpenAI] Empty response' };
    }

    /**
     * Parse OpenAI Responses API non-streaming response (GPT-5.4+).
     * Extracts text from output[].content[].text and reasoning from output[].summary[].
     * @param {Object} data - Parsed JSON response
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
                    .filter(s => s && s.type === 'summary_text')
                    .map(s => s.text || '')
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
            _setTokenUsage(_requestId, _normalizeTokenUsage(data.usage, 'openai'), false);
        }
        return { success: !!out, content: out || '[Responses API] Empty response' };
    }

    /**
     * Parse Gemini generateContent non-streaming response.
     * Handles safety blocks, thoughts, thought_signature caching.
     * @param {Object} data - Parsed JSON response
     * @param {Object} [config] - { useThoughtSignature }
     * @param {string} [_requestId] - Optional API View request ID
     * @returns {{ success: boolean, content: string }}
     */
    function parseGeminiNonStreamingResponse(data, config = {}, _requestId) {
        const blockReason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason;
        const BLOCK_REASONS = ['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'];
        if (blockReason && BLOCK_REASONS.includes(blockReason)) {
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
            _setTokenUsage(_requestId, _normalizeTokenUsage(data.usageMetadata, 'gemini'), false);
        }
        return { success: !!result, content: result || '[Gemini] Empty response' };
    }

    /**
     * Parse Claude (Anthropic) non-streaming response.
     * Handles thinking/redacted_thinking blocks.
     * @param {Object} data - Parsed JSON response
     * @param {Object} [_config] - Unused, reserved for future options
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
            _setTokenUsage(_requestId, _normalizeTokenUsage(data.usage, 'anthropic', {
                anthropicHasThinking: hasThinking,
                anthropicVisibleText: visibleText,
            }), false);
        }
        return { success: !!result, content: result || '[Claude] Empty response' };
    }

    // @ts-check
    /**
     * stream-builders.js — SSE stream constructors for all providers.
     * Creates ReadableStream<string> from fetch Response objects.
     * Uses dependency injection for _updateApiRequest to avoid tight coupling.
     */

    /** Module-level reference to the API request logger. Set via setApiRequestLogger(). */
    let _logFn = null;

    /**
     * Inject the API request update function.
     * @param {function} fn - (requestId, updates) => void
     */
    function setApiRequestLogger(fn) {
        _logFn = typeof fn === 'function' ? fn : null;
    }

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
        const reader = response.body.getReader();
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
                    if (e.name !== 'AbortError') {
                        if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch (_) { /* */ }
                        _log(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${e.message}]` });
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
        let _streamUsage = null;

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
            if (_streamUsage) _setTokenUsage(_logRequestId, _streamUsage, true);
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
        let _streamUsage = null;

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
            if (_streamUsage) _setTokenUsage(_logRequestId, _streamUsage, true);
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
     * @returns {ReadableStream<string>}
     */
    function createAnthropicSSEStream(response, abortSignal, _logRequestId) {
        const reader = response.body.getReader();
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
                            if (thinking) {
                                const closeTag = '</Thoughts>\n\n';
                                try { controller.enqueue(closeTag); _accumulatedContent += closeTag; } catch (_) { /* */ }
                                thinking = false;
                            }
                            if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                                _setTokenUsage(_logRequestId, _normalizeTokenUsage(_streamUsage, 'anthropic', {
                                    anthropicHasThinking: hasThinking,
                                    anthropicVisibleText: _visibleText,
                                }), true);
                            }
                            reader.cancel();
                            _log(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                            controller.close();
                            return;
                        }
                        const { done, value } = await reader.read();
                        if (done) {
                            if (thinking) {
                                const closeTag = '</Thoughts>\n\n';
                                controller.enqueue(closeTag);
                                _accumulatedContent += closeTag;
                                thinking = false;
                            }
                            if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                                _setTokenUsage(_logRequestId, _normalizeTokenUsage(_streamUsage, 'anthropic', {
                                    anthropicHasThinking: hasThinking,
                                    anthropicVisibleText: _visibleText,
                                }), true);
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
                                                if (!thinking) { thinking = true; deltaText += '<Thoughts>\n'; }
                                                deltaText += obj.delta.thinking;
                                            }
                                        } else if (obj.delta?.type === 'redacted_thinking') {
                                            hasThinking = true;
                                            if (!thinking) { thinking = true; deltaText += '<Thoughts>\n'; }
                                            deltaText += '\n{{redacted_thinking}}\n';
                                        } else if (obj.delta?.type === 'text_delta' || obj.delta?.type === 'text') {
                                            if (obj.delta.text) {
                                                if (thinking) { thinking = false; deltaText += '</Thoughts>\n\n'; }
                                                _visibleText += obj.delta.text;
                                                deltaText += obj.delta.text;
                                            }
                                        }
                                        if (deltaText) { controller.enqueue(deltaText); _accumulatedContent += deltaText; }
                                    } else if (currentEvent === 'content_block_start') {
                                        if (obj.content_block?.type === 'redacted_thinking') {
                                            hasThinking = true;
                                            let rt = '';
                                            if (!thinking) { thinking = true; rt += '<Thoughts>\n'; }
                                            rt += '\n{{redacted_thinking}}\n';
                                            controller.enqueue(rt);
                                            _accumulatedContent += rt;
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
                    if (thinking) {
                        const closeTag = '</Thoughts>\n\n';
                        try { controller.enqueue(closeTag); _accumulatedContent += closeTag; } catch (_) { /* */ }
                        thinking = false;
                    }
                    if (_streamUsage.input_tokens > 0 || _streamUsage.output_tokens > 0) {
                        _setTokenUsage(_logRequestId, _normalizeTokenUsage(_streamUsage, 'anthropic', {
                            anthropicHasThinking: hasThinking,
                            anthropicVisibleText: _visibleText,
                        }), true);
                    }
                    if (e.name !== 'AbortError') {
                        _log(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${e.message}]` });
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
                    _setTokenUsage(_logRequestId, _normalizeTokenUsage(_streamUsage, 'anthropic', {
                        anthropicHasThinking: hasThinking,
                        anthropicVisibleText: _visibleText,
                    }), true);
                }
                reader.cancel();
            },
        });
    }

    // ─── Gemini Thought Signature Helper ───

    /**
     * onComplete callback for Gemini streams — saves thought_signature from config.
     * @param {Object} config - Mutable config object populated during streaming
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
            _setTokenUsage(_usageReqId, _normalizeTokenUsage(config._streamUsageMetadata, 'gemini'), true);
        }
        return finalChunk || undefined;
    }

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

    /**
     * copilot-token.js — GitHub Copilot API token management.
     * Handles OAuth → API token exchange with caching and single-flight dedup.
     * Uses dependency injection for safeGetArg and fetch to enable testing.
     */

    let _copilotTokenCache = { token: '', expiry: 0 };
    let _copilotTokenPromise = null;

    /** Injected dependencies */
    let _getArgFn = null;
    let _fetchFn = null;

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
            if (!githubToken) {
                console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
                return '';
            }

            const cleanToken = githubToken.replace(/[^\x20-\x7E]/g, '').trim();
            if (!cleanToken) return '';

            console.log('[Cupcake PM] Copilot: Exchanging OAuth token for API token...');
            const res = await fetchFn('https://api.github.com/copilot_internal/v2/token', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${cleanToken}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.109.2 Chrome/142.0.7444.265 Electron/39.3.0 Safari/537.36',
                    'Editor-Version': 'vscode/1.109.2',
                    'Editor-Plugin-Version': 'copilot-chat/0.37.4',
                    'X-GitHub-Api-Version': '2024-12-15',
                },
            });

            if (!res.ok) {
                console.error(`[Cupcake PM] Copilot token exchange failed (${res.status}): ${await res.text()}`);
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
            return '';
        })();

        try {
            return await _copilotTokenPromise;
        } catch (e) {
            console.error('[Cupcake PM] Copilot token exchange error:', e.message);
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

    /**
     * smart-fetch.js — 3-strategy fetch wrapper for V3 iframe sandbox.
     *
     * Strategy 1: Direct fetch()
     * Strategy 2: risuFetch (host window, plainFetchForce)
     * Strategy 3: nativeFetch (proxy fallback)
     *
     * Dependency: sanitizeBodyJSON from sanitize.js, Risu from shared-state.js
     */

    /**
     * Smart native fetch: 3-strategy fallback for V3 iframe sandbox.
     * @param {string} url
     * @param {RequestInit} options
     * @returns {Promise<Response>}
     */
    async function smartNativeFetch(url, options = {}) {
        // Final body sanitization before any network call
        if (options.method === 'POST' && typeof options.body === 'string') {
            try {
                options = { ...options, body: sanitizeBodyJSON(options.body) };
            } catch (e) {
                console.error('[CupcakePM] smartNativeFetch: body re-sanitization failed:', e.message);
            }
        }

        // Strategy 1: Direct browser fetch from iframe
        try {
            const res = await fetch(url, options);
            return res;
        } catch (e) {
            console.log(`[CupcakePM] Direct fetch failed for ${url.substring(0, 60)}...: ${e.message}`);
        }

        const _isCopilotUrl = url.includes('githubcopilot.com') || url.includes('copilot_internal');

        // Best-effort AbortSignal propagation across V3 bridge.
        const callNativeFetchWithAbortFallback = async (_url, _options) => {
            try {
                return await Risu.nativeFetch(_url, _options);
            } catch (_err) {
                const _msg = String(_err?.message || _err || '');
                const _hasSignal = !!(_options && _options.signal);
                const _cloneIssue = /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_msg);
                if (_hasSignal && _cloneIssue) {
                    const _retry = { ..._options };
                    delete _retry.signal;
                    console.warn('[CupcakePM] nativeFetch signal bridge failed; retrying without signal:', _msg);
                    return await Risu.nativeFetch(_url, _retry);
                }
                throw _err;
            }
        };

        // ─── Copilot-specific: nativeFetch first for POST/SSE ───
        if (_isCopilotUrl && (options.method || 'POST') !== 'GET' && typeof Risu.nativeFetch === 'function') {
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
                console.log(`[CupcakePM] Copilot nativeFetch error: ${e.message}`);
            }
        }

        // ─── Copilot risuFetch (plainFetchDeforce) ───
        if (_isCopilotUrl && typeof Risu.risuFetch === 'function') {
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

        if (!_isCopilotUrl && _isJsonBody && typeof Risu.risuFetch === 'function') {
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
                        console.warn('[CupcakePM] bodyObj JSON round-trip failed, stripping non-serializable keys:', serErr.message);
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
                    const _rfMsg = String(_rfErr?.message || _rfErr || '');
                    if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                        console.warn('[CupcakePM] risuFetch signal clone failed; retrying without signal:', _rfMsg);
                        result = await Risu.risuFetch(url, {
                            method: options.method || 'POST',
                            headers: options.headers || {},
                            body: bodyObj,
                            rawResponse: true,
                            plainFetchForce: true,
                        });
                    } else {
                        throw _rfErr;
                    }
                }

                const responseBody = _extractResponseBody(result);
                if (responseBody) {
                    console.log(`[CupcakePM] risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                    return new Response(responseBody, {
                        status: result.status || 200,
                        headers: new Headers(result.headers || {}),
                    });
                }
                const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
                console.log(`[CupcakePM] risuFetch not a real response: ${errPreview}`);
            } catch (e) {
                console.log(`[CupcakePM] risuFetch error: ${e.message}`);
            }
        }

        // ─── Strategy 3 (fallback): nativeFetch — proxy-based fetch ───
        try {
            console.log(`[CupcakePM] Falling back to nativeFetch (proxy) for ${url.substring(0, 60)}...`);
            const nfOptions = { ...options };
            if (typeof nfOptions.body === 'string') {
                nfOptions.body = new TextEncoder().encode(nfOptions.body);
            }
            const res = await callNativeFetchWithAbortFallback(url, nfOptions);
            return res;
        } catch (e) {
            console.error(`[CupcakePM] nativeFetch also failed: ${e.message}`);
        }

        throw new Error(`[CupcakePM] All fetch strategies failed for ${url.substring(0, 60)}`);
    }

    // ─── Internal helpers ───

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
                    const safeMsg = { role: _rm.role, content: _rm.content };
                    if (_rm.name && typeof _rm.name === 'string') safeMsg.name = _rm.name;
                    bodyObj.messages.push(safeMsg);
                }
            } catch (_e) {
                console.error('[CupcakePM] Deep reconstruct of messages failed:', _e.message);
                bodyObj.messages = bodyObj.messages.filter(m => m != null && typeof m === 'object');
            }
        }
        if (Array.isArray(bodyObj.contents)) {
            try { bodyObj.contents = JSON.parse(JSON.stringify(bodyObj.contents)); } catch (_) { }
            bodyObj.contents = bodyObj.contents.filter(m => m != null && typeof m === 'object');
        }
        return bodyObj;
    }

    function _stripNonSerializable(obj, depth) {
        if (depth > 15) return undefined;
        if (obj === null || obj === undefined) return obj;
        const t = typeof obj;
        if (t === 'string' || t === 'number' || t === 'boolean') return obj;
        if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
        if (Array.isArray(obj)) return obj.map(v => _stripNonSerializable(v, depth + 1)).filter(v => v !== undefined);
        if (t === 'object') {
            const out = {};
            for (const k of Object.keys(obj)) {
                try { const v = _stripNonSerializable(obj[k], depth + 1); if (v !== undefined) out[k] = v; } catch (_) { }
            }
            return out;
        }
        return undefined;
    }

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

    async function _tryCopilotRisuFetch(url, options, mode) {
        try {
            const bodyObj = _parseBodyForRisuFetch(options.body);
            if (bodyObj === undefined && options.body) {
                throw new Error('Body JSON parse failed — cannot safely pass to risuFetch');
            }

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
                const _rfMsg = String(_rfErr?.message || _rfErr || '');
                if (options.signal && /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_rfMsg)) {
                    console.warn(`[CupcakePM] Copilot risuFetch(${mode}) signal clone failed; retrying without signal`);
                    delete fetchOpts.abortSignal;
                    result = await Risu.risuFetch(url, fetchOpts);
                } else {
                    throw _rfErr;
                }
            }

            const responseBody = _extractResponseBody(result);
            if (responseBody) {
                if (result.status === 524) {
                    console.warn(`[CupcakePM] Copilot ${mode} risuFetch returned 524 for ${url.substring(0, 60)}; falling back.`);
                    return null;
                }
                console.log(`[CupcakePM] Copilot ${mode} risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                return new Response(responseBody, {
                    status: result.status || 200,
                    headers: new Headers(result.headers || {}),
                });
            }

            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] Copilot ${mode} risuFetch not a real response: ${errPreview}`);
        } catch (e) {
            console.log(`[CupcakePM] Copilot ${mode} risuFetch error: ${e.message}`);
        }
        return null;
    }

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
            let scriptEl = null;

            const timeout = setTimeout(() => {
                if (window[cbId]) {
                    delete window[cbId];
                    try { if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl); } catch (_) {}
                    reject(new Error(`Plugin ${pluginName} script timed out (CSP block?)`));
                }
            }, 10000);

            window[cbId] = (err) => {
                clearTimeout(timeout);
                delete window[cbId];
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

    const BASE_SETTING_KEYS = [
        'cpm_enable_chat_resizer',
        'cpm_custom_models',
        'cpm_fallback_temp', 'cpm_fallback_max_tokens', 'cpm_fallback_top_p', 'cpm_fallback_freq_pen', 'cpm_fallback_pres_pen',
        'cpm_openai_key', 'cpm_openai_url', 'cpm_openai_model', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier',
        'cpm_anthropic_key', 'cpm_anthropic_url', 'cpm_anthropic_model', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching', 'cpm_anthropic_cache_ttl',
        'cpm_gemini_key', 'cpm_gemini_model', 'cpm_gemini_thinking_level', 'cpm_gemini_thinking_budget',
        'chat_gemini_preserveSystem', 'chat_gemini_showThoughtsToken', 'chat_gemini_useThoughtSignature', 'chat_gemini_usePlainFetch',
        'cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_model', 'cpm_vertex_thinking_level', 'cpm_vertex_thinking_budget', 'cpm_vertex_claude_thinking_budget',
        'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature',
        'cpm_aws_key', 'cpm_aws_secret', 'cpm_aws_region', 'cpm_aws_thinking_budget', 'cpm_aws_thinking_effort',
        'cpm_openrouter_key', 'cpm_openrouter_url', 'cpm_openrouter_model', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning',
        'cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_deepseek_model',
        'cpm_show_token_usage',
        'cpm_streaming_enabled', 'cpm_streaming_show_thinking',
    ];

    function getManagedSettingKeys(providerTabs = registeredProviderTabs) {
        const dynamicKeys = Array.isArray(providerTabs)
            ? providerTabs.flatMap(tab => tab?.exportKeys || [])
            : [];
        return [...new Set([...getAuxSettingKeys(), ...BASE_SETTING_KEYS, ...dynamicKeys])];
    }

    const SettingsBackup = {
        STORAGE_KEY: 'cpm_settings_backup',
        _cache: null,

        getAllKeys() {
            return getManagedSettingKeys();
        },

        async load() {
            try {
                const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
                this._cache = data ? JSON.parse(data) : {};
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

        async updateKey(key, value) {
            if (!this._cache) await this.load();
            this._cache[key] = value;
            await this.save();
        },

        async snapshotAll() {
            if (!this._cache) this._cache = {};
            for (const key of this.getAllKeys()) {
                const val = await safeGetArg(key);
                if (val !== undefined && val !== '') {
                    this._cache[key] = val;
                }
            }
            await this.save();
            console.log(`[CPM Backup] Snapshot saved (${Object.keys(this._cache).length} keys)`);
        },

        async restoreIfEmpty() {
            if (!this._cache) await this.load();
            if (!this._cache || Object.keys(this._cache).length === 0) {
                console.log('[CPM Backup] No backup found, skipping restore.');
                return 0;
            }
            let restoredCount = 0;
            for (const [key, value] of Object.entries(this._cache)) {
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
     * sub-plugin-manager.js — Dynamic sub-plugin lifecycle management.
     * Handles install, remove, toggle, execute, hot-reload, and auto-update.
     */

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

    // DI: _exposeScopeToWindow is injected by init.js to avoid circular dependency.
    let _exposeScopeToWindow$1 = () => {};
    function setExposeScopeFunction(fn) { _exposeScopeToWindow$1 = fn; }

    const SubPluginManager = {
        STORAGE_KEY: 'cpm_installed_subplugins',
        plugins: [],

        async loadRegistry() {
            try {
                const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
                this.plugins = data ? JSON.parse(data) : [];
            } catch (e) {
                console.error('[CPM Loader] Failed to load registry', e);
                this.plugins = [];
            }
        },

        async saveRegistry() {
            await Risu.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.plugins));
        },

        extractMetadata(code) {
            const meta = { name: 'Unnamed Sub-Plugin', version: '', description: '', icon: '📦', updateUrl: '' };
            const nameMatch = code.match(/\/\/\s*@(?:name|display-name)\s+(.+)/i);
            if (nameMatch) meta.name = nameMatch[1].trim();
            const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
            if (verMatch) meta.version = verMatch[1].trim();
            const descMatch = code.match(/\/\/\s*@description\s+(.+)/i);
            if (descMatch) meta.description = descMatch[1].trim();
            const iconMatch = code.match(/\/\/\s*@icon\s+(.+)/i);
            if (iconMatch) meta.icon = iconMatch[1].trim();
            const updateMatch = code.match(/\/\/\s*@update-url\s+(.+)/i);
            if (updateMatch) meta.updateUrl = updateMatch[1].trim();
            return meta;
        },

        async install(code) {
            const meta = this.extractMetadata(code);
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

        async remove(id) {
            this.plugins = this.plugins.filter(p => p.id !== id);
            await this.saveRegistry();
        },

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

        compareVersions(a, b) {
            if (!a || !b) return 0;
            const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number);
            const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0, nb = pb[i] || 0;
                if (nb > na) return 1;
                if (na > nb) return -1;
            }
            return 0;
        },

        // ── Lightweight Silent Version Check ──
        VERSIONS_URL: 'https://cupcake-plugin-manager.vercel.app/api/versions',
        MAIN_UPDATE_URL: 'https://cupcake-plugin-manager.vercel.app/provider-manager.js',
        _VERSION_CHECK_COOLDOWN: 600000,
        _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
        _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
        _pendingUpdateNames: [],

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

                const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

                if (!result.data || (result.status && result.status >= 400)) {
                    console.debug(`[CPM AutoCheck] Fetch failed (${result.status}), silently skipped.`);
                    return;
                }

                const manifest = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
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
                    const mainCmp = this.compareVersions(CPM_VERSION, mainRemote.version);
                    if (mainCmp > 0) {
                        mainUpdateInfo = {
                            localVersion: CPM_VERSION, remoteVersion: mainRemote.version,
                            changes: mainRemote.changes || '',
                        };
                        /** @type {any} */ (window)._cpmMainVersionFromManifest = true;
                        console.log(`[CPM AutoCheck] Main plugin update available: ${CPM_VERSION}→${mainRemote.version}`);
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
                        try { await this.showMainUpdateToast(mainUpdateInfo.localVersion, mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (_) { }
                    }, delay);
                }
            } catch (e) {
                console.debug(`[CPM AutoCheck] Silent error:`, e.message || e);
            }
        },

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
                    const changeText = u.changes ? ` — ${u.changes}` : '';
                    detailLines += `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${u.icon} ${u.name} <span style="color:#6ee7b7">${u.localVersion} → ${u.remoteVersion}</span>${changeText}</div>`;
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
            } catch (e) { console.debug('[CPM Toast] Failed to show toast:', e.message); }
        },

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
                console.log('[CPM MainAutoCheck] Fallback: fetching remote provider-manager.js...');

                const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

                if (!result.data || (result.status && result.status >= 400)) {
                    console.debug(`[CPM MainAutoCheck] Fetch failed (${result.status}), silently skipped.`);
                    return;
                }

                const code = typeof result.data === 'string' ? result.data : String(result.data || '');
                const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
                if (!verMatch) { console.debug('[CPM MainAutoCheck] Remote version tag not found, skipped.'); return; }
                const changesMatch = code.match(/\/\/\s*@changes\s+(.+)/i);
                const changes = changesMatch ? changesMatch[1].trim() : '';

                const remoteVersion = (verMatch[1] || '').trim();
                const localVersion = CPM_VERSION;
                const cmp = this.compareVersions(localVersion, remoteVersion);

                try { await Risu.pluginStorage.setItem(this._MAIN_VERSION_CHECK_STORAGE_KEY, String(Date.now())); } catch (_) { /* ignore */ }

                if (cmp > 0) {
                    console.log(`[CPM MainAutoCheck] Main update available: ${localVersion}→${remoteVersion}`);
                    await this.showMainUpdateToast(localVersion, remoteVersion, changes);
                } else {
                    console.log('[CPM MainAutoCheck] Main plugin is up to date.');
                }
            } catch (e) { console.debug('[CPM MainAutoCheck] Silent error:', e.message || e); }
        },

        async showMainUpdateToast(localVersion, remoteVersion, changes) {
            try {
                const doc = await Risu.getRootDocument();
                if (!doc) { console.debug('[CPM MainToast] getRootDocument returned null'); return; }

                const existing = await doc.querySelector('[x-cpm-main-toast]');
                if (existing) { try { await existing.remove(); } catch (_) { } }

                const subToastEl = await doc.querySelector('[x-cpm-toast]');
                const bottomPos = subToastEl ? '110px' : '20px';

                const toast = await doc.createElement('div');
                await toast.setAttribute('x-cpm-main-toast', '1');
                const styles = {
                    position: 'fixed', bottom: bottomPos, right: '20px', zIndex: '99999',
                    background: '#1f2937', border: '1px solid #374151', borderLeft: '3px solid #f59e0b',
                    borderRadius: '10px', padding: '12px 14px', maxWidth: '380px', minWidth: '280px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    pointerEvents: 'auto', opacity: '0', transform: 'translateY(12px)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                };
                for (const [k, v] of Object.entries(styles)) await toast.setStyle(k, v);

                const changesHtml = changes ? ` — ${changes}` : '';
                await toast.setInnerHTML(`
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:#fef3c7">⭐ 메인 플러그인 업데이트 있음</div>
                        <div style="font-size:11px;color:#9ca3af;margin-top:2px">🧁 Cupcake PM <span style="color:#fcd34d">${localVersion} → ${remoteVersion}</span>${changesHtml}</div>
                        <div style="font-size:11px;color:#6b7280;margin-top:4px">리스 설정 → 플러그인 탭 → + 버튼으로 업데이트</div>
                    </div>
                </div>
            `);

                const body = await doc.querySelector('body');
                if (!body) { console.debug('[CPM MainToast] body not found'); return; }
                await body.appendChild(toast);
                console.log('[CPM MainToast] Main update toast appended to root body');

                setTimeout(async () => { try { await toast.setStyle('opacity', '1'); await toast.setStyle('transform', 'translateY(0)'); } catch (_) { } }, 50);
                setTimeout(async () => {
                    try { await toast.setStyle('opacity', '0'); await toast.setStyle('transform', 'translateY(12px)');
                        setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 350);
                    } catch (_) { }
                }, 10000);
            } catch (e) { console.debug('[CPM MainToast] Failed to show toast:', e.message || e); }
        },

        // ── Single-Bundle Update System ──
        UPDATE_BUNDLE_URL: 'https://cupcake-plugin-manager.vercel.app/api/update-bundle',

        async checkAllUpdates() {
            try {
                const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '_r=' + Math.random().toString(36).substr(2, 8);
                console.log(`[CPM Update] Fetching update bundle via risuFetch(plainFetchForce): ${cacheBuster}`);

                const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

                if (!result.data || (result.status && result.status >= 400)) {
                    console.error(`[CPM Update] Failed to fetch update bundle: ${result.status}`);
                    return [];
                }

                const bundle = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
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
                            // Integrity check: verify SHA-256 if manifest provides it
                            if (remote.sha256) {
                                const actualHash = await _computeSHA256(code);
                                if (actualHash && actualHash !== remote.sha256) {
                                    console.error(`[CPM Update] ⚠️ INTEGRITY MISMATCH for ${p.name}: expected ${remote.sha256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}… — skipping`);
                                    continue;
                                }
                                if (actualHash) console.log(`[CPM Update] ✓ Integrity OK for ${p.name} [sha256:${actualHash.substring(0, 12)}…]`);
                            }
                        }
                        else console.warn(`[CPM Update] ${p.name} (${remote.file}) code not found in bundle`);
                        results.push({ plugin: p, remoteVersion: remote.version, localVersion: p.version || '0.0.0', remoteFile: remote.file, code, expectedSHA256: remote.sha256 || '' });
                    }
                }
                return results;
            } catch (e) {
                console.error(`[CPM Update] Failed to check updates:`, e);
                return [];
            }
        },

        async applyUpdate(pluginId, prefetchedCode, expectedSHA256) {
            const p = this.plugins.find(x => x.id === pluginId);
            if (!p) return false;
            if (!prefetchedCode) {
                console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
                return false;
            }
            try {
                // Integrity verification at apply-time (defense-in-depth)
                if (expectedSHA256) {
                    const actualHash = await _computeSHA256(prefetchedCode);
                    if (actualHash && actualHash !== expectedSHA256) {
                        console.error(`[CPM Update] BLOCKED: Integrity mismatch for ${p.name}. Expected sha256:${expectedSHA256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…`);
                        return false;
                    }
                    if (actualHash) console.log(`[CPM Update] ✓ Apply-time integrity OK for ${p.name}`);
                }
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

        // ── Hot-Reload Infrastructure ──

        unloadPlugin(pluginId) {
            const reg = _pluginRegistrations[pluginId];
            if (!reg) return;

            const hooks = _pluginCleanupHooks[pluginId];
            if (hooks && Array.isArray(hooks)) {
                for (const hook of hooks) {
                    try {
                        const result = hook();
                        if (result && typeof result.then === 'function') {
                            result.catch(e => console.warn(`[CPM Loader] Async cleanup hook error for ${pluginId}:`, e.message));
                        }
                    } catch (e) { console.warn(`[CPM Loader] Cleanup hook error for ${pluginId}:`, e.message); }
                }
                delete _pluginCleanupHooks[pluginId];
            }

            for (const key of Object.keys(window)) {
                if (key.startsWith('_cpm') && key.endsWith('Cleanup') && typeof window[key] === 'function') {
                    const providerNames = reg.providerNames.map(n => n.toLowerCase());
                    const keyLower = key.toLowerCase();
                    const isRelated = providerNames.some(name => keyLower.includes(name.replace(/\s+/g, '').toLowerCase()));
                    if (isRelated) {
                        try {
                            console.log(`[CPM Loader] Calling window.${key}() for plugin ${pluginId}`);
                            const result = window[key]();
                            if (result && typeof result.then === 'function') {
                                result.catch(e => console.warn(`[CPM Loader] window.${key}() error:`, e.message));
                            }
                        } catch (e) { console.warn(`[CPM Loader] window.${key}() error:`, e.message); }
                    }
                }
            }

            for (const name of reg.providerNames) {
                delete customFetchers[name];
                state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
            }
            for (const tab of reg.tabObjects) {
                const idx = registeredProviderTabs.indexOf(tab);
                if (idx !== -1) registeredProviderTabs.splice(idx, 1);
            }
            for (const entry of reg.fetcherEntries) {
                const idx = pendingDynamicFetchers.findIndex(f => f.name === entry.name);
                if (idx !== -1) pendingDynamicFetchers.splice(idx, 1);
            }
            _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            console.log(`[CPM Loader] Unloaded registrations for plugin ${pluginId}`);
        },

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

        async hotReload(pluginId) {
            const plugin = this.plugins.find(p => p.id === pluginId);
            if (!plugin) return false;

            this.unloadPlugin(pluginId);

            if (plugin.enabled) {
                await this.executeOne(plugin);

                const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
                for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
                    if (newProviderNames.includes(name)) {
                        try {
                            const enabled = await isDynamicFetchEnabled(name);
                            if (!enabled) { console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                            console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                            const dynamicModels = await fetchDynamicModels();
                            if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                                state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                                for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                                console.log(`[CupcakePM] ✓ Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                            }
                        } catch (e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
                    }
                }
            }
            console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
            return true;
        },

        async hotReloadAll() {
            for (const p of this.plugins) this.unloadPlugin(p.id);
            await this.executeEnabled();
            for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
                try {
                    const enabled = await isDynamicFetchEnabled(name);
                    if (!enabled) continue;
                    const dynamicModels = await fetchDynamicModels();
                    if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                        state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                        for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                } catch (e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
            }
            console.log('[CPM Loader] Hot-reload all complete.');
        }
    };

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

    /**
     * Build the static Copilot emulation headers.
     * Dynamic per-request headers (machine-id, session-id, interaction-id, etc.)
     * are NOT included here — they are set by the caller.
     *
     * @returns {Record<string, string>}
     */
    function getCopilotStaticHeaders() {
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
     * fetch-custom.js — Custom model API fetcher.
     * Handles all three formats (OpenAI, Anthropic, Google) with
     * streaming/non-streaming, Copilot integration, key rotation,
     * and Responses API support.
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
        const _allKeys = _rawKeys.split(/\s+/).filter(k => k.length > 0);
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

        const body = { model: config.model, temperature: temp };

        const _needsMCT = (model) => { if (!model) return false; return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(model); };
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
            const useAdaptiveThinking = (effortRaw && effortRaw !== 'none') || thinkingMode === 'adaptive';
            if (useAdaptiveThinking) {
                body.thinking = { type: 'adaptive' };
                let adaptiveEffort = '';
                if (['low', 'medium', 'high', 'max'].includes(effortRaw)) adaptiveEffort = effortRaw;
                else if (thinkingMode === 'adaptive') adaptiveEffort = 'high';
                if (adaptiveEffort) body.output_config = { effort: adaptiveEffort };
                body.max_tokens = Math.max(body.max_tokens || 0, 16000);
                delete body.temperature; delete body.top_k; delete body.top_p;
            } else {
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
            try { body.messages = JSON.parse(JSON.stringify(body.messages)); } catch (e) { console.error('[Cupcake PM] Deep-clone of messages failed:', e.message); }
            const before = body.messages.length;
            body.messages = body.messages.filter(m => {
                if (m == null || typeof m !== 'object') return false;
                if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
                if (typeof m.role !== 'string' || !m.role) return false;
                return true;
            });
            if (body.messages.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array`);
            if (body.messages.length === 0) return { success: false, content: '[Cupcake PM] messages must be non-empty (all messages became empty after sanitization)' };
        }
        if (body.contents) {
            try { body.contents = JSON.parse(JSON.stringify(body.contents)); } catch (e) { console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', e.message); }
            const before = body.contents.length;
            body.contents = body.contents.filter(m => m != null && typeof m === 'object');
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
                if (typeof extra === 'object' && extra !== null) {
                    const safeExtra = { ...extra };
                    delete safeExtra.messages; delete safeExtra.contents; delete safeExtra.stream;
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
                body.input = body.messages.map(({ name: _name, ...rest }) => rest);
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

        // ── Core fetch logic (wrapped for key rotation) ──
        const _doCustomFetch = async (_apiKey) => {
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` };
            /** @type {Window & typeof globalThis & { _cpmCopilotMachineId?: string, _cpmCopilotSessionId?: string }} */
            const _win = /** @type {any} */ (window);

            // Direct Anthropic API: x-api-key header
            if (format === 'anthropic' && effectiveUrl && effectiveUrl.includes('api.anthropic.com')) {
                delete headers['Authorization'];
                headers['x-api-key'] = _apiKey;
            }

            // Copilot headers
            if (effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
                let copilotApiToken = config.copilotToken || '';
                if (!copilotApiToken) copilotApiToken = await ensureCopilotApiToken();
                if (copilotApiToken) headers['Authorization'] = `Bearer ${copilotApiToken}`;
                else console.warn('[Cupcake PM] Copilot: No API token available.');

                if (!_win._cpmCopilotMachineId) {
                    _win._cpmCopilotMachineId = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                }
                if (!_win._cpmCopilotSessionId) _win._cpmCopilotSessionId = safeUUID() + Date.now().toString();

                Object.assign(headers, getCopilotStaticHeaders());
                headers['Vscode-Machineid'] = _win._cpmCopilotMachineId;
                headers['Vscode-Sessionid'] = _win._cpmCopilotSessionId;
                headers['X-Interaction-Id'] = safeUUID();
                headers['X-Request-Id'] = safeUUID();

                if (format === 'anthropic') headers['anthropic-version'] = '2023-06-01';

                const _visionMsgArr = body.messages || body.input || [];
                const hasVisionContent = _visionMsgArr.some(m =>
                    Array.isArray(m?.content) && m.content.some(p => p.type === 'image_url' || p.type === 'image')
                );
                if (hasVisionContent) headers['Copilot-Vision-Request'] = 'true';
            }

            // Anthropic beta headers (non-Copilot)
            if (format === 'anthropic') {
                const _isCopilotAnthropic = !!(effectiveUrl && effectiveUrl.includes('githubcopilot.com'));
                if (!_isCopilotAnthropic) {
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
            const useStreaming = streamingEnabled && perModelStreamingEnabled;
            if (!useStreaming && effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
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

                const res = await smartNativeFetch(streamUrl, { method: 'POST', headers, body: finalBody, signal: abortSignal });
                if (_reqId) updateApiRequest(_reqId, { status: res.status });

                if (!res.ok) {
                    const errBody = await res.text();
                    if (_reqId) updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                    return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
                }

                if (_reqId) updateApiRequest(_reqId, { response: '(streaming…)' });

                if (format === 'anthropic') {
                    return { success: true, content: createAnthropicSSEStream(res, abortSignal, _reqId) };
                } else if (format === 'google') {
                    config._tokenUsageReqId = _reqId;
                    const _onComplete = () => saveThoughtSignatureFromStream(config, _reqId);
                    return { success: true, content: createSSEStream(res, (line) => parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
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

            const res = await smartNativeFetch(effectiveUrl, { method: 'POST', headers, body: _nonStreamBody, signal: abortSignal });
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

            if (format === 'anthropic') return parseClaudeNonStreamingResponse(data, {}, _reqId);
            else if (format === 'google') return parseGeminiNonStreamingResponse(data, config, _reqId);
            else if (_isResponsesEndpoint) return parseResponsesAPINonStreamingResponse(data, _reqId);
            else return parseOpenAINonStreamingResponse(data, _reqId);
        };

        // ── Key Rotation dispatch ──
        if (_useKeyRotation) {
            const _rotationPoolName = `_cpm_custom_inline_${config.model || 'unknown'}`;
            KeyPool._pools[_rotationPoolName] = { lastRaw: _rawKeys, keys: [..._keyPool], _inline: true };
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
     * @param {Object} args - Request arguments from RisuAI
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
                const cDef = state.CUSTOM_MODELS_CACHE.find(m => m.uniqueId === modelDef.uniqueId);
                if (!cDef) return { success: false, content: `[Cupcake PM] Custom model config not found.` };

                return await fetchCustom({
                    url: cDef.url, key: cDef.key, model: cDef.model,
                    format: cDef.format || 'openai',
                    sysfirst: !!cDef.sysfirst, altrole: !!cDef.altrole,
                    mustuser: !!cDef.mustuser, maxout: !!cDef.maxout, mergesys: !!cDef.mergesys,
                    reasoning: cDef.reasoning || 'none', verbosity: cDef.verbosity || 'none',
                    responsesMode: cDef.responsesMode || 'auto',
                    thinking_level: cDef.thinking || 'none', tok: cDef.tok || 'o200k_base',
                    thinkingBudget: parseInt(cDef.thinkingBudget) || 0,
                    promptCacheRetention: cDef.promptCacheRetention || 'none',
                    decoupled: !!cDef.decoupled, thought: !!cDef.thought,
                    streaming: (cDef.streaming === true) || (cDef.streaming !== false && !cDef.decoupled),
                    showThoughtsToken: !!cDef.thought, useThoughtSignature: !!cDef.thought,
                    customParams: cDef.customParams || '', copilotToken: '',
                    effort: cDef.effort || 'none'
                }, messages, temp, maxTokens, args, abortSignal, _reqId);
            }
            return { success: false, content: `[Cupcake PM] Unknown provider selected: ${modelDef.provider}` };
        } catch (e) {
            return { success: false, content: `[Cupcake PM Crash] ${e.message}` };
        }
    }

    // ── Main Router ──

    /**
     * Main request router — entry point called by RisuAI for every API request.
     * Handles slot inference, parameter overrides, logging, and streaming.
     * @param {Object} args - Request arguments from RisuAI
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
        } catch (e) {
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
        const _logResponse = (contentStr, prefix = '📥 Response') => {
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
                    const _chunks = [];
                    const _streamDecoder = new TextDecoder();
                    const _streamStartTime = _startTime;
                    const _streamModelName = _displayName;
                    const _streamShowTokens = _showTokens;
                    result.content = result.content.pipeThrough(new TransformStream({
                        transform(chunk, controller) { _chunks.push(chunk); controller.enqueue(chunk); },
                        flush() {
                            const full = _chunks.map((c) => {
                                if (typeof c === 'string') return c;
                                if (c instanceof Uint8Array) return _streamDecoder.decode(c, { stream: true });
                                if (c instanceof ArrayBuffer) return _streamDecoder.decode(new Uint8Array(c), { stream: true });
                                return String(c ?? '');
                            }).join('') + _streamDecoder.decode();
                            _logResponse(full, '📥 Streamed Response');
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

    /**
     * cupcake-api.js — window.CupcakePM global API surface.
     * Public API that sub-plugins use to register providers and access CPM internals.
     */

    /**
     * Initialize the window.CupcakePM global object.
     * Must be called after all modules are loaded.
     */
    function setupCupcakeAPI() {
        window.CupcakePM = {
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
                    for (const m of models) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
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

    /**
     * settings-ui-custom-models.js — Custom Models Manager UI.
     * Extracted from settings-ui.js for modularity.
     * Handles the custom model editor form, CRUD, import/export of model definitions.
     */

    // ── Helper: Custom model editor HTML ──
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
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4"><h5 class="text-sm font-bold text-gray-300 mb-3">Model Parameters</h5></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">API Format</label><select id="cpm-cm-format" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="google">Google Gemini</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Tokenizer</label><select id="cpm-cm-tok" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="o200k_base">o200k_base</option><option value="llama3">llama3</option><option value="claude">Claude</option><option value="gemma">Gemma</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Responses API Mode</label><select id="cpm-cm-responses-mode" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Level</label><select id="cpm-cm-thinking" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">${thinkingList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-400 mb-1">Thinking Budget Tokens (0=끄기)</label><input type="number" id="cpm-cm-thinking-budget" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0"></div>
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
                    </div>
                </div>
                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Parameters JSON</h5>
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
    function populateEditor(m) {
        document.getElementById('cpm-cm-id').value = m.uniqueId;
        document.getElementById('cpm-cm-name').value = m.name || '';
        document.getElementById('cpm-cm-model').value = m.model || '';
        document.getElementById('cpm-cm-url').value = m.url || '';
        document.getElementById('cpm-cm-key').value = m.key || '';
        document.getElementById('cpm-cm-format').value = m.format || 'openai';
        document.getElementById('cpm-cm-tok').value = m.tok || 'o200k_base';
        document.getElementById('cpm-cm-responses-mode').value = m.responsesMode || 'auto';
        document.getElementById('cpm-cm-thinking').value = m.thinking || 'none';
        document.getElementById('cpm-cm-thinking-budget').value = m.thinkingBudget || 0;
        document.getElementById('cpm-cm-prompt-cache-retention').value = m.promptCacheRetention || 'none';
        document.getElementById('cpm-cm-reasoning').value = m.reasoning || 'none';
        document.getElementById('cpm-cm-verbosity').value = m.verbosity || 'none';
        document.getElementById('cpm-cm-effort').value = m.effort || 'none';
        document.getElementById('cpm-cm-sysfirst').checked = !!m.sysfirst;
        document.getElementById('cpm-cm-mergesys').checked = !!m.mergesys;
        document.getElementById('cpm-cm-altrole').checked = !!m.altrole;
        document.getElementById('cpm-cm-mustuser').checked = !!m.mustuser;
        document.getElementById('cpm-cm-maxout').checked = !!m.maxout;
        document.getElementById('cpm-cm-streaming').checked = (m.streaming === true) || (m.streaming !== false && !m.decoupled);
        document.getElementById('cpm-cm-thought').checked = !!m.thought;
        document.getElementById('cpm-cm-custom-params').value = m.customParams || '';
    }

    // ── Clear all editor fields ──
    function clearEditor() {
        ['name', 'model', 'url', 'key'].forEach(f => document.getElementById(`cpm-cm-${f}`).value = '');
        document.getElementById('cpm-cm-format').value = 'openai';
        document.getElementById('cpm-cm-tok').value = 'o200k_base';
        document.getElementById('cpm-cm-responses-mode').value = 'auto';
        document.getElementById('cpm-cm-thinking').value = 'none';
        document.getElementById('cpm-cm-thinking-budget').value = 0;
        document.getElementById('cpm-cm-prompt-cache-retention').value = 'none';
        document.getElementById('cpm-cm-reasoning').value = 'none';
        document.getElementById('cpm-cm-verbosity').value = 'none';
        document.getElementById('cpm-cm-effort').value = 'none';
        ['sysfirst', 'mergesys', 'altrole', 'mustuser', 'maxout', 'thought', 'streaming'].forEach(id => document.getElementById(`cpm-cm-${id}`).checked = false);
        document.getElementById('cpm-cm-custom-params').value = '';
    }

    // ── Read all editor values into a model object ──
    function readEditorValues(uid) {
        return {
            uniqueId: uid,
            name: document.getElementById('cpm-cm-name').value,
            model: document.getElementById('cpm-cm-model').value,
            url: document.getElementById('cpm-cm-url').value,
            key: document.getElementById('cpm-cm-key').value,
            format: document.getElementById('cpm-cm-format').value,
            tok: document.getElementById('cpm-cm-tok').value,
            responsesMode: document.getElementById('cpm-cm-responses-mode').value || 'auto',
            thinking: document.getElementById('cpm-cm-thinking').value,
            thinkingBudget: parseInt(document.getElementById('cpm-cm-thinking-budget').value) || 0,
            promptCacheRetention: document.getElementById('cpm-cm-prompt-cache-retention').value || 'none',
            reasoning: document.getElementById('cpm-cm-reasoning').value,
            verbosity: document.getElementById('cpm-cm-verbosity').value,
            effort: document.getElementById('cpm-cm-effort').value,
            sysfirst: document.getElementById('cpm-cm-sysfirst').checked,
            mergesys: document.getElementById('cpm-cm-mergesys').checked,
            altrole: document.getElementById('cpm-cm-altrole').checked,
            mustuser: document.getElementById('cpm-cm-mustuser').checked,
            maxout: document.getElementById('cpm-cm-maxout').checked,
            streaming: document.getElementById('cpm-cm-streaming').checked,
            decoupled: !document.getElementById('cpm-cm-streaming').checked,
            thought: document.getElementById('cpm-cm-thought').checked,
            customParams: document.getElementById('cpm-cm-custom-params').value,
        };
    }

    // ── Custom Models Manager logic ──
    function initCustomModelsManager(_setVal, _openCpmSettings) {
        const cmList = document.getElementById('cpm-cm-list');
        const cmEditor = document.getElementById('cpm-cm-editor');
        const cmCount = document.getElementById('cpm-cm-count');

        const refreshCmList = () => {
            if (cmList.contains(cmEditor)) { document.getElementById('tab-customs').appendChild(cmEditor); cmEditor.classList.add('hidden'); }
            cmCount.innerText = state.CUSTOM_MODELS_CACHE.length;
            if (state.CUSTOM_MODELS_CACHE.length === 0) {
                cmList.innerHTML = '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded">No custom models defined.</div>';
                return;
            }
            cmList.innerHTML = state.CUSTOM_MODELS_CACHE.map((m, i) => `
            <div class="bg-gray-800 border border-gray-700 rounded p-4 flex justify-between items-center group hover:border-gray-500 transition-colors">
                <div>
                    <div class="font-bold text-white text-lg">${escHtml(m.name) || 'Unnamed Model'}${((m.key || '').trim().split(/\s+/).filter(k => k.length > 0).length > 1) ? ' <span class="text-xs text-blue-400 font-normal ml-2">🔄 키회전</span>' : ''}</div>
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
                const m = state.CUSTOM_MODELS_CACHE[parseInt(e.target.dataset.idx)];
                if (!m) return;
                const exportModel = { ...m }; delete exportModel.key; exportModel._cpmModelExport = true;
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModel, null, 2));
                const a = document.createElement('a'); a.href = dataStr;
                a.download = `${(m.name || 'custom_model').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.cpm-model.json`;
                document.body.appendChild(a); a.click(); a.remove();
            }));

            // Delete
            cmList.querySelectorAll('.cpm-cm-del-btn').forEach(btn => btn.addEventListener('click', (e) => {
                if (confirm('Delete this model?')) {
                    state.CUSTOM_MODELS_CACHE.splice(parseInt(e.target.dataset.idx), 1);
                    Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
                    refreshCmList();
                }
            }));

            // Edit
            cmList.querySelectorAll('.cpm-cm-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
                const m = state.CUSTOM_MODELS_CACHE[parseInt(e.target.dataset.idx)];
                populateEditor(m);
                document.getElementById('cpm-cm-editor-title').innerText = 'Edit Custom Model';
                const itemDiv = e.target.closest('.group');
                if (itemDiv) itemDiv.after(cmEditor);
                cmEditor.classList.remove('hidden');
            }));
        };

        // Import model
        document.getElementById('cpm-import-model-btn').addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.multiple = true;
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                let importedCount = 0, errorCount = 0;
                for (const file of files) {
                    try {
                        const data = JSON.parse(await file.text());
                        if (!data._cpmModelExport || !data.name) { errorCount++; continue; }
                        data.uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                        delete data._cpmModelExport; if (!data.key) data.key = '';
                        state.CUSTOM_MODELS_CACHE.push(data); importedCount++;
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
        document.getElementById('cpm-add-custom-btn').addEventListener('click', () => {
            clearEditor();
            document.getElementById('cpm-cm-id').value = 'custom_' + Date.now();
            document.getElementById('cpm-cm-editor-title').innerText = 'Add New Model';
            cmList.prepend(cmEditor);
            cmEditor.classList.remove('hidden');
        });

        document.getElementById('cpm-cm-cancel').addEventListener('click', () => {
            document.getElementById('tab-customs').appendChild(cmEditor);
            cmEditor.classList.add('hidden');
        });

        document.getElementById('cpm-cm-save').addEventListener('click', () => {
            const uid = document.getElementById('cpm-cm-id').value;
            const newModel = readEditorValues(uid);
            const existingIdx = state.CUSTOM_MODELS_CACHE.findIndex(x => x.uniqueId === uid);
            if (existingIdx !== -1) state.CUSTOM_MODELS_CACHE[existingIdx] = { ...state.CUSTOM_MODELS_CACHE[existingIdx], ...newModel };
            else state.CUSTOM_MODELS_CACHE.push(newModel);
            Risu.setArgument('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
            SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(state.CUSTOM_MODELS_CACHE));
            refreshCmList();
            cmEditor.classList.add('hidden');
        });

        refreshCmList();
    }

    /**
     * settings-ui-plugins.js — Sub-Plugins tab UI.
     * Extracted from settings-ui.js for modularity.
     * Handles plugin listing, upload, toggle, delete, and update checking.
     */

    // ── Helper: Sub-Plugins tab renderer ──
    function buildPluginsTabRenderer(setVal) {
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
            listContainer.innerHTML = html;

            // Upload handler
            const btnUpload = document.getElementById('cpm-btn-upload-plugin');
            const pFileInput = document.getElementById('cpm-file-plugin');
            if (btnUpload && pFileInput) {
                btnUpload.addEventListener('click', () => pFileInput.click());
                pFileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const code = ev.target.result;
                        const name = await SubPluginManager.install(code);
                        const installed = SubPluginManager.plugins.find(p => p.name === name);
                        if (installed) await SubPluginManager.hotReload(installed.id);
                        alert(`서브 플러그인 '${name}' 설치 완료!`);
                        renderPluginsTab();
                    };
                    reader.readAsText(file);
                });
            }

            // Toggle/delete handlers
            listContainer.querySelectorAll('.cpm-plugin-toggle').forEach(t => {
                t.addEventListener('change', async (e) => {
                    await SubPluginManager.toggle(e.target.getAttribute('data-id'), e.target.checked);
                    await SubPluginManager.hotReload(e.target.getAttribute('data-id'));
                });
            });
            listContainer.querySelectorAll('.cpm-plugin-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    if (confirm('정말로 이 플러그인을 삭제하시겠습니까?')) {
                        SubPluginManager.unloadPlugin(id);
                        await SubPluginManager.remove(id);
                        renderPluginsTab();
                    }
                });
            });

            // Update check button
            initUpdateCheckButton();

            // Render sub-plugin dynamic UIs
            window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
            for (const p of window.CupcakePM_SubPlugins) {
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

    function initUpdateCheckButton(_renderPluginsTab, deps = {}) {
        const subPluginManager = deps.subPluginManager || SubPluginManager;
        const updateBtn = document.getElementById('cpm-check-updates-btn');
        if (!updateBtn || updateBtn.dataset.cpmBound === 'true') return;
        updateBtn.dataset.cpmBound = 'true';
        updateBtn.addEventListener('click', async () => {
            const statusDiv = document.getElementById('cpm-update-status');
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
                            const id = e.target.getAttribute('data-id');
                            const updateData = pendingUpdates.get(id);
                            if (!updateData || !updateData.code) { e.target.textContent = '❌ 코드 없음'; return; }
                            e.target.disabled = true; e.target.textContent = '⏳ 적용 중...';
                            const ok = await subPluginManager.applyUpdate(id, updateData.code, updateData.expectedSHA256);
                            if (ok) { await subPluginManager.hotReload(id); e.target.textContent = '✅ 완료'; pendingUpdates.delete(id); }
                            else e.target.textContent = '❌ 실패';
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

    /**
     * settings-ui-panels.js — API View panel + Export/Import.
     * Extracted from settings-ui.js for modularity.
     */

    // ── API View Panel ──
    function initApiViewPanel() {
        const _renderApiViewEntry = (r) => {
            if (!r) return '<div class="text-gray-500 text-center py-8">선택한 요청 데이터가 없습니다.</div>';
            const redactKey = (v) => { if (!v || typeof v !== 'string') return v; if (v.length <= 8) return '***'; return v.slice(0, 4) + '...' + v.slice(-4); };
            const redactHeaders = (headers) => { const h = { ...headers }; for (const k of Object.keys(h)) { if (/auth|key|token|secret|bearer/i.test(k)) h[k] = redactKey(h[k]); } return h; };
            const formatJson = (obj) => { try { return JSON.stringify(obj, null, 2); } catch { return String(obj); } };
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

        document.getElementById('cpm-api-view-btn').addEventListener('click', () => {
            /** @type {HTMLDivElement | null} */
            const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
            if (!panel) return;
            if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
            _refreshApiViewPanel(); panel.classList.remove('hidden');
        });
        document.getElementById('cpm-api-view-selector').addEventListener('change', (e) => {
            /** @type {HTMLSelectElement | null} */
            const selector = /** @type {HTMLSelectElement | null} */ (e.target);
            /** @type {HTMLDivElement | null} */
            const contentEl = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-content'));
            if (!selector || !contentEl) return;
            contentEl.innerHTML = _renderApiViewEntry(getApiRequestById(selector.value));
        });
        document.getElementById('cpm-api-view-close').addEventListener('click', () => {
            /** @type {HTMLDivElement | null} */
            const panel = /** @type {HTMLDivElement | null} */ (document.getElementById('cpm-api-view-panel'));
            if (panel) panel.classList.add('hidden');
        });
    }

    // ── Export/Import ──
    function initExportImport(setVal, openCpmSettings) {
        document.getElementById('cpm-export-btn').addEventListener('click', async () => {
            const exportData = {};
            for (const key of getManagedSettingKeys()) {
                const val = await safeGetArg(key);
                if (val !== undefined && val !== '') exportData[key] = val;
            }
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
            const a = document.createElement('a'); a.href = dataStr; a.download = 'cupcake_pm_settings.json';
            document.body.appendChild(a); a.click(); a.remove();
        });

        document.getElementById('cpm-import-btn').addEventListener('click', () => {
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
                        for (const [key, value] of Object.entries(importedData)) {
                            setVal(key, value);
                            /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */
                            const el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(key));
                            if (el) {
                                if ('type' in el && el.type === 'checkbox') /** @type {HTMLInputElement} */ (el).checked = (value === true || String(value).toLowerCase() === 'true');
                                else el.value = String(value ?? '');
                            }
                        }
                        alert('설정을 성공적으로 불러왔습니다!');
                        openCpmSettings();
                    } catch (err) { alert('설정 파일 읽기 오류: ' + err.message); }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    /**
     * settings-ui.js — Cupcake PM settings panel (core orchestrator).
     * Renders the full-screen settings interface with Tailwind CSS.
     *
     * Sub-modules (extracted for modularity):
     *   settings-ui-custom-models.js — Custom model editor + CRUD
     *   settings-ui-plugins.js       — Sub-plugins tab renderer + update check
     *   settings-ui-panels.js        — API View panel + Export/Import
     */

    function shouldPersistControl(el) {
        const id = el?.id || '';
        if (!id) return false;
        if (id.startsWith('cpm-cm-')) return false;
        if (id.startsWith('cpm-api-view-')) return false;
        if (id === 'cpm-file-plugin') return false;
        return true;
    }

    function bindSettingsPersistenceHandlers(root, setVal) {
        if (!root || typeof root.querySelectorAll !== 'function' || typeof setVal !== 'function') return;

        root.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach(el => {
            if (!shouldPersistControl(el)) return;
            el.addEventListener('change', (e) => setVal(e.target.id, e.target.value));
        });

        root.querySelectorAll('input[type="checkbox"]').forEach(el => {
            if (!shouldPersistControl(el)) return;
            el.addEventListener('change', (e) => setVal(e.target.id, e.target.checked));
        });
    }

    async function openCpmSettings() {
        Risu.showContainer('fullscreen');

        // Tailwind CSS
        if (!document.getElementById('cpm-tailwind')) {
            const tw = document.createElement('script');
            tw.id = 'cpm-tailwind'; tw.src = 'https://cdn.tailwindcss.com';
            document.head.appendChild(tw);
            await new Promise(r => tw.onload = r);
        }

        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0; background:#1e1e24; color:#d1d5db; font-family:-apple-system, sans-serif; height:100vh; overflow:hidden;';

        const getVal = async (k) => await safeGetArg(k);
        const getBoolVal = async (k) => await safeGetBoolArg(k);
        const setVal = (k, v) => {
            Risu.setArgument(k, String(v));
            SettingsBackup.updateKey(k, String(v));
        };

        const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const renderInput = async (id, label, type = 'text', opts = []) => {
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
            <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-yellow-300 font-bold bg-yellow-900/10" data-target="tab-plugins">🧩 Sub-Plugins${SubPluginManager._pendingUpdateNames.length > 0 ? ` <span style="background:#4f46e5;color:#e0e7ff;font-size:10px;padding:1px 6px;border-radius:9px;margin-left:4px;font-weight:bold;">${SubPluginManager._pendingUpdateNames.length}</span>` : ''}</button>
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
        for (const m of state.ALL_DEFINED_MODELS) providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });

        const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'xhigh', text: 'XHigh (매우 높음)' }];
        const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
        const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];
        const effortList = [{ value: 'none', text: '사용 안함 (Off)' }, { value: 'unspecified', text: '미지정 (Unspecified)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'max', text: 'Max (최대)' }];

        const renderAuxParams = async (slot) => `
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
                    <p class="text-xs text-yellow-500">⚠️ RisuAI factory.ts의 guest bridge에서 ReadableStream이 collectTransferables에 포함되어야 합니다.</p>
                    <div id="cpm-stream-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">Bridge 상태: 확인 중...</div>
                </div>
                <div class="space-y-3">
                    ${await renderInput('cpm_streaming_enabled', '스트리밍 패스스루 활성화 (Enable Streaming Pass-Through)', 'checkbox')}
                    ${await renderInput('cpm_streaming_show_thinking', 'Anthropic Thinking 토큰 표시 (Show Thinking in Stream)', 'checkbox')}
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
            ${SubPluginManager._pendingUpdateNames.length > 0
                ? `<div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-3 mb-4 flex items-center gap-2"><span class="text-indigo-300 text-sm font-semibold">🔔 ${SubPluginManager._pendingUpdateNames.length}개의 서브 플러그인 업데이트가 감지되었습니다.</span></div>`
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
            for (const tab of registeredProviderTabs) {
                sidebarBtnsHtml += `<button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="${tab.id}">${tab.icon} ${tab.label}</button>`;
                try {
                    const tabContent = await tab.renderContent(renderInput, { reasoningList, verbosityList, thinkingList });
                    contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden">${tabContent}</div>`;
                } catch (err) {
                    console.error(`[CupcakePM] Failed to render settings tab: ${tab.id}`, err);
                    contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden"><p class="text-red-400">Error rendering tab: ${err.message}</p></div>`;
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
                mobileDropdown.classList.add('hidden'); mobileDropdown.classList.remove('flex'); mobileIcon.innerText = '▼';
            }
        }));
        if (tabs[0] instanceof HTMLElement) tabs[0].click();

        // ── Stream capability check ──
        (async () => {
            const statusEl = document.getElementById('cpm-stream-status');
            if (!statusEl) return;
            try {
                const capable = await checkStreamCapability();
                statusEl.innerHTML = capable
                    ? '<span class="text-emerald-400">✓ Bridge 지원됨</span> — ReadableStream 전송 가능.'
                    : '<span class="text-yellow-400">✗ Bridge 미지원</span> — 자동으로 문자열 수집 모드로 폴백됩니다.';
                statusEl.classList.replace('border-gray-600', capable ? 'border-emerald-700' : 'border-yellow-800');
            } catch (e) { statusEl.innerHTML = `<span class="text-red-400">Bridge 확인 실패:</span> ${escHtml(e.message)}`; }
        })();

        // ── Custom Models Manager ──
        initCustomModelsManager();

        // ── API View ──
        initApiViewPanel();

        // ── Snapshot settings ──
        await SettingsBackup.snapshotAll();

        // ── Export/Import ──
        initExportImport(setVal, openCpmSettings);

        // ── Close button ──
        document.getElementById('cpm-close-btn').addEventListener('click', () => {
            document.body.innerHTML = '';
            Risu.hideContainer();
        });
    }

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
            window[k] = v;
        }

        const objs = {
            customFetchers, registeredProviderTabs, pendingDynamicFetchers,
            _pluginRegistrations, SubPluginManager, SettingsBackup, KeyPool,
            CPM_SLOT_LIST, AwsV4Signer, ThoughtSignatureCache, _tokenUsageStore,
        };
        for (const [k, v] of Object.entries(objs)) {
            window[k] = v;
        }

        // Mutable state — define getters/setters that proxy to the state object
        const lets = {
            ALL_DEFINED_MODELS: [() => state.ALL_DEFINED_MODELS, v => { state.ALL_DEFINED_MODELS = v; }],
            CUSTOM_MODELS_CACHE: [() => state.CUSTOM_MODELS_CACHE, v => { state.CUSTOM_MODELS_CACHE = v; }],
            _currentExecutingPluginId: [() => state._currentExecutingPluginId, v => { state._currentExecutingPluginId = v; }],
            vertexTokenCache: [() => state.vertexTokenCache, v => { state.vertexTokenCache = v; }],
        };
        for (const [k, [g, s]] of Object.entries(lets)) {
            Object.defineProperty(window, k, { get: g, set: s, configurable: true });
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

    // ─── Setup window.CupcakePM public API ───
    setupCupcakeAPI();

    // ─── Main Init IIFE ───
    (async () => {
        try {
            // Load & Execute Sub-Plugins FIRST (they register providers via CupcakePM.registerProvider)
            await SubPluginManager.loadRegistry();
            await SubPluginManager.executeEnabled();

            // Restore settings from pluginStorage backup if @arg values were wiped
            await SettingsBackup.load();
            const restoredCount = await SettingsBackup.restoreIfEmpty();
            if (restoredCount > 0) {
                console.log(`[CPM] Auto-restored ${restoredCount} settings from persistent backup.`);
            }

            // ── Streaming Bridge Capability Check ──
            try {
                const streamCapable = await checkStreamCapability();
                const streamEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);
                if (streamEnabled) {
                    if (streamCapable) {
                        console.log('[Cupcake PM] 🔄 Streaming: enabled AND bridge capable — ReadableStream pass-through active.');
                    } else {
                        console.warn('[Cupcake PM] 🔄 Streaming: enabled but bridge NOT capable — will fall back to string collection.');
                    }
                } else {
                    console.log(`[Cupcake PM] 🔄 Streaming: disabled (bridge ${streamCapable ? 'capable' : 'not capable'}). Enable in settings to activate.`);
                }
            } catch (e) {
                console.warn('[Cupcake PM] Streaming capability check failed:', e.message);
            }

            // ── Dynamic Model Fetching ──
            for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
                try {
                    const enabled = await isDynamicFetchEnabled(name);
                    if (!enabled) { console.log(`[CupcakePM] Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                    console.log(`[CupcakePM] Fetching dynamic models for ${name}...`);
                    const dynamicModels = await fetchDynamicModels();
                    if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                        state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                        for (const m of dynamicModels) {
                            state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                        }
                        console.log(`[CupcakePM] ✓ Dynamic models for ${name}: ${dynamicModels.length} models`);
                    } else {
                        console.log(`[CupcakePM] No dynamic models for ${name}, using fallback.`);
                    }
                } catch (e) {
                    console.warn(`[CupcakePM] Dynamic fetch failed for ${name}:`, e.message || e);
                }
            }

            // ── Custom models migration ──
            const customModelsJson = await safeGetArg('cpm_custom_models', '[]');
            try {
                state.CUSTOM_MODELS_CACHE = JSON.parse(customModelsJson);
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
            state.CUSTOM_MODELS_CACHE.forEach(m => {
                state.ALL_DEFINED_MODELS.push({
                    uniqueId: m.uniqueId,
                    id: m.model,
                    name: m.name || m.uniqueId,
                    provider: 'Custom',
                });
            });

            // Sort alphabetically by provider, then by name
            state.ALL_DEFINED_MODELS.sort((a, b) => {
                const providerCompare = a.provider.localeCompare(b.provider);
                if (providerCompare !== 0) return providerCompare;
                return a.name.localeCompare(b.name);
            });

            // ── Model Registration with RisuAI ──
            let _modelRegCount = 0;
            try {
                for (const modelDef of state.ALL_DEFINED_MODELS) {
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

                    await Risu.addProvider(`🧁 [${pLabel}] ${mLabel}`, async (args, abortSignal) => {
                        try {
                            return await handleRequest(args, modelDef, abortSignal);
                        } catch (err) {
                            return { success: false, content: `[Cupcake SDK Fallback Crash] ${err.message}` };
                        }
                    }, {
                        model: { flags: modelFlags },
                    });
                    _modelRegCount++;
                }
            } catch (regErr) {
                console.error(`[CPM] Model registration error after ${_modelRegCount}/${state.ALL_DEFINED_MODELS.length} models (continuing to register settings):`, regErr);
            }

            // ── Silent Update Check (5s delay) ──
            setTimeout(() => {
                SubPluginManager.checkVersionsQuiet().catch(() => {});
                SubPluginManager.checkMainPluginVersionQuiet().catch(() => {});
            }, 5000);

            // ── Register Settings UI ──
            await Risu.registerSetting(
                `v${CPM_VERSION}`,
                openCpmSettings,
                '🧁',
                'html',
            );

            // ── Keyboard shortcut + Touch gesture ──
            const cpmWindow = /** @type {CpmWindow} */ (window);
            if (!cpmWindow.cpmShortcutRegistered) {
                cpmWindow.cpmShortcutRegistered = true;
                try {
                    const rootDoc = await Risu.getRootDocument();

                    if (!rootDoc) {
                        console.log('[CPM] Hotkey registration skipped: main DOM permission not granted.');
                        return;
                    }

                    await rootDoc.addEventListener('keydown', (e) => {
                        if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
                            openCpmSettings();
                        }
                    });

                    // 4-finger touch gesture for mobile
                    let activePointersCount = 0;
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

                } catch (err) {
                    console.error('[CPM] Hotkey registration failed:', err);
                }
            }

        } catch (e) {
            console.error('[CPM] init fail', e);
            // CRITICAL FALLBACK: Ensure settings panel is still accessible
            try {
                await Risu.registerSetting(
                    `⚠️ CPM v${CPM_VERSION} (Error)`,
                    async () => {
                        Risu.showContainer('fullscreen');
                        document.body.innerHTML = `<div style="background:#1a1a2e;color:#fff;padding:40px;font-family:sans-serif;min-height:100vh;">
                        <h1 style="color:#ff6b6b;">🧁 Cupcake PM — Initialization Error</h1>
                        <p style="color:#ccc;margin:20px 0;">The plugin failed to initialize properly.</p>
                        <pre style="background:#0d1117;color:#ff7b72;padding:16px;border-radius:8px;overflow:auto;max-height:300px;font-size:13px;">${String(e && e.stack ? e.stack : e).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                        <p style="color:#aaa;margin-top:20px;">Try: reload (Ctrl+Shift+R) or re-import the plugin.</p>
                        <button onclick="document.body.innerHTML='';Risu.hideContainer();"
                            style="margin-top:20px;padding:10px 24px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Close</button>
                    </div>`;
                    },
                    '🧁',
                    'html',
                );
            } catch (_) { /* Last resort */ }
        }
    })();

    exports.AwsV4Signer = AwsV4Signer;
    exports.CPM_SLOT_LIST = CPM_SLOT_LIST;
    exports.CPM_VERSION = CPM_VERSION;
    exports.GEMINI_BLOCK_REASONS = GEMINI_BLOCK_REASONS;
    exports.KeyPool = KeyPool;
    exports.Risu = Risu;
    exports.SLOT_HEURISTICS = SLOT_HEURISTICS;
    exports.SettingsBackup = SettingsBackup;
    exports.SubPluginManager = SubPluginManager;
    exports.ThoughtSignatureCache = ThoughtSignatureCache;
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
    exports.validateGeminiParams = validateGeminiParams;

    return exports;

})({});
