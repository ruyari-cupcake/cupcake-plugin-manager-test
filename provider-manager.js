//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.19.3
//@update-url https://cupcake-plugin-manager.vercel.app/provider-manager.js

const CPM_VERSION = '1.19.3';

// ==========================================
// 0. GLOBAL API REFERENCE (Risuai/risuai 대소문자 통일)
// ==========================================
const Risu = window.risuai || window.Risuai;

// ==========================================
// 1. ARGUMENT SCHEMAS (Saved Natively by RisuAI)
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
//@arg cpm_openai_reasoning string OpenAI Reasoning Effort (none, low, medium, high)
//@arg cpm_openai_verbosity string OpenAI Verbosity (none, low, medium, high)
//@arg cpm_dynamic_openai string Dynamic OpenAI Model Fetch (true/false)
// Anthropic
//@arg cpm_anthropic_url string Anthropic Base URL
//@arg cpm_anthropic_key string Anthropic API Key
//@arg cpm_anthropic_model string Anthropic Model
//@arg cpm_anthropic_thinking_budget int Anthropic Thinking Budget
//@arg cpm_anthropic_thinking_effort string Anthropic Thinking Effort (none/low/medium/high)
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
//@arg cpm_openrouter_reasoning string OpenRouter Reasoning Effort (none, low, medium, high)
//@arg cpm_openrouter_provider string OpenRouter Provider String (e.g., Hyperbolic)

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

// ==========================================
// 1.5 AWS V4 SIGNER
// ==========================================
const encoder = new TextEncoder(); const HOST_SERVICES = { appstream2: "appstream", cloudhsmv2: "cloudhsm", email: "ses", marketplace: "aws-marketplace", mobile: "AWSMobileHubService", pinpoint: "mobiletargeting", queue: "sqs", "git-codecommit": "codecommit", "mturk-requester-sandbox": "mturk-requester", "personalize-runtime": "personalize" }; const UNSIGNABLE_HEADERS = new Set(["authorization", "content-type", "content-length", "user-agent", "presigned-expires", "expect", "x-amzn-trace-id", "range", "connection"]); class AwsV4Signer { constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) { if (url == null) throw new TypeError("url is a required option"); if (accessKeyId == null) throw new TypeError("accessKeyId is a required option"); if (secretAccessKey == null) throw new TypeError("secretAccessKey is a required option"); this.method = method || (body ? "POST" : "GET"); this.url = new URL(url); this.headers = new Headers(headers || {}); this.body = body; this.accessKeyId = accessKeyId; this.secretAccessKey = secretAccessKey; this.sessionToken = sessionToken; let guessedService, guessedRegion; if (!service || !region) { [guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers); } this.service = service || guessedService || ""; this.region = region || guessedRegion || "us-east-1"; this.cache = cache || new Map(); this.datetime = datetime || new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); this.signQuery = signQuery; this.appendSessionToken = appendSessionToken || this.service === "iotdevicegateway"; this.headers.delete("Host"); if (this.service === "s3" && !this.signQuery && !this.headers.has("X-Amz-Content-Sha256")) { this.headers.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"); } const params = this.signQuery ? this.url.searchParams : this.headers; params.set("X-Amz-Date", this.datetime); if (this.sessionToken && !this.appendSessionToken) { params.set("X-Amz-Security-Token", this.sessionToken); } this.signableHeaders = ["host", ...this.headers.keys()].filter((header) => allHeaders || !UNSIGNABLE_HEADERS.has(header)).sort(); this.signedHeaders = this.signableHeaders.join(";"); this.canonicalHeaders = this.signableHeaders.map((header) => header + ":" + (header === "host" ? this.url.host : (this.headers.get(header) || "").replace(/\s+/g, " "))).join("\n"); this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, "aws4_request"].join("/"); if (this.signQuery) { if (this.service === "s3" && !params.has("X-Amz-Expires")) { params.set("X-Amz-Expires", "86400"); } params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256"); params.set("X-Amz-Credential", this.accessKeyId + "/" + this.credentialString); params.set("X-Amz-SignedHeaders", this.signedHeaders); } if (this.service === "s3") { try { this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, " ")); } catch (e) { this.encodedPath = this.url.pathname; } } else { this.encodedPath = this.url.pathname.replace(/\/+/g, "/"); } if (!singleEncode) { this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, "/"); } this.encodedPath = encodeRfc3986(this.encodedPath); const seenKeys = new Set(); this.encodedSearch = [...this.url.searchParams].filter(([k]) => { if (!k) return false; if (this.service === "s3") { if (seenKeys.has(k)) return false; seenKeys.add(k); } return true }).map((pair) => pair.map((p2) => encodeRfc3986(encodeURIComponent(p2)))).sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0).map((pair) => pair.join("=")).join("&"); } async sign() { if (this.signQuery) { this.url.searchParams.set("X-Amz-Signature", await this.signature()); if (this.sessionToken && this.appendSessionToken) { this.url.searchParams.set("X-Amz-Security-Token", this.sessionToken); } } else { this.headers.set("Authorization", await this.authHeader()); } return { method: this.method, url: this.url, headers: this.headers, body: this.body } } async authHeader() { return ["AWS4-HMAC-SHA256 Credential=" + this.accessKeyId + "/" + this.credentialString, "SignedHeaders=" + this.signedHeaders, "Signature=" + (await this.signature())].join(", ") } async signature() { const date = this.datetime.slice(0, 8); const cacheKey = [this.secretAccessKey, date, this.region, this.service].join(); let kCredentials = this.cache.get(cacheKey); if (!kCredentials) { const kDate = await hmac("AWS4" + this.secretAccessKey, date); const kRegion = await hmac(kDate, this.region); const kService = await hmac(kRegion, this.service); kCredentials = await hmac(kService, "aws4_request"); this.cache.set(cacheKey, kCredentials); } return buf2hex(await hmac(kCredentials, await this.stringToSign())) } async stringToSign() { return ["AWS4-HMAC-SHA256", this.datetime, this.credentialString, buf2hex(await hash(await this.canonicalString()))].join("\n") } async canonicalString() { return [this.method.toUpperCase(), this.encodedPath, this.encodedSearch, this.canonicalHeaders + "\n", this.signedHeaders, await this.hexBodyHash()].join("\n") } async hexBodyHash() { let hashHeader = this.headers.get("X-Amz-Content-Sha256") || (this.service === "s3" && this.signQuery ? "UNSIGNED-PAYLOAD" : null); if (hashHeader == null) { if (this.body && typeof this.body !== "string" && !("byteLength" in this.body)) { throw new Error("body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header") } hashHeader = buf2hex(await hash(this.body || "")); } return hashHeader } } async function hmac(key, string) { const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? encoder.encode(key) : key, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]); return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(string)) } async function hash(content) { return crypto.subtle.digest("SHA-256", typeof content === "string" ? encoder.encode(content) : content) } const HEX_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]; function buf2hex(arrayBuffer) { const buffer = new Uint8Array(arrayBuffer); let out = ""; for (let idx = 0; idx < buffer.length; idx++) { const n = buffer[idx]; out += HEX_CHARS[(n >>> 4) & 15]; out += HEX_CHARS[n & 15]; } return out } function encodeRfc3986(urlEncodedStr) { return urlEncodedStr.replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) } function guessServiceRegion(url, headers) { const { hostname, pathname } = url; if (hostname.endsWith(".on.aws")) { const match2 = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/); return match2 != null ? ["lambda", match2[1] || ""] : ["", ""] } if (hostname.endsWith(".r2.cloudflarestorage.com")) { return ["s3", "auto"] } if (hostname.endsWith(".backblazeb2.com")) { const match2 = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/); return match2 != null ? ["s3", match2[1] || ""] : ["", ""] } const match = hostname.replace("dualstack.", "").match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/); let service = (match && match[1]) || ""; let region = match && match[2]; if (region === "us-gov") { region = "us-gov-west-1"; } else if (region === "s3" || region === "s3-accelerate") { region = "us-east-1"; service = "s3"; } else if (service === "iot") { if (hostname.startsWith("iot.")) { service = "execute-api"; } else if (hostname.startsWith("data.jobs.iot.")) { service = "iot-jobs-data"; } else { service = pathname === "/mqtt" ? "iotdevicegateway" : "iotdata"; } } else if (service === "autoscaling") { const targetPrefix = (headers.get("X-Amz-Target") || "").split(".")[0]; if (targetPrefix === "AnyScaleFrontendService") { service = "application-autoscaling"; } else if (targetPrefix === "AnyScaleScalingPlannerFrontendService") { service = "autoscaling-plans"; } } else if (region == null && service.startsWith("s3-")) { region = service.slice(3).replace(/^fips-|^external-1/, ""); service = "s3"; } else if (service.endsWith("-fips")) { service = service.slice(0, -5); } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) { [service, region] = [region, service]; } return [HOST_SERVICES[service] || service, region || ""] }

// ==========================================
// 1.6 SAFE UUID GENERATOR (HTTP/insecure context fallback)
// ==========================================
/**
 * Safe UUID generator: uses crypto.randomUUID() when available (secure contexts),
 * falls back to a random string for HTTP/Docker/insecure environments where
 * crypto.randomUUID is undefined and would crash the app.
 */
function safeUUID() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_) { /* ignore */ }
    // Fallback: generate a v4-like UUID from Math.random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

async function safeGetArg(key, defaultValue = '') {
    try {
        const val = await Risu.getArgument(key);
        return val !== undefined && val !== null && val !== "" ? val : defaultValue;
    } catch {
        return defaultValue;
    }
}

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

// ==========================================
// 3. DYNAMIC MODEL & PROVIDER REGISTRY
// ==========================================
let ALL_DEFINED_MODELS = [];
let CUSTOM_MODELS_CACHE = [];
const customFetchers = {};
const registeredProviderTabs = [];
let vertexTokenCache = { token: null, expiry: 0 };
const pendingDynamicFetchers = [];
let _currentExecutingPluginId = null;
const _pluginRegistrations = {}; // pluginId -> { providerNames: [], tabObjects: [], fetcherEntries: [] }

// API Request History (for API View feature) — ring buffer to prevent race conditions.
// Previous design used a single global variable (_lastCustomApiRequest) that could be
// overwritten when concurrent requests (main chat + translation) execute simultaneously.
// Now uses a Map keyed by requestId with a maximum size limit.
const _apiRequestHistory = new Map(); // requestId -> { timestamp, modelName, url, method, headers, body, response, status, duration }
const _API_REQUEST_HISTORY_MAX = 20;
let _apiRequestLatestId = null; // Track the most recently added request ID

/**
 * Store an API request entry. Returns the requestId for later updates.
 */
function _storeApiRequest(entry) {
    const requestId = safeUUID();
    _apiRequestHistory.set(requestId, entry);
    _apiRequestLatestId = requestId;
    // Evict oldest entries if over limit
    if (_apiRequestHistory.size > _API_REQUEST_HISTORY_MAX) {
        const firstKey = _apiRequestHistory.keys().next().value;
        _apiRequestHistory.delete(firstKey);
    }
    return requestId;
}

/**
 * Update an existing API request entry by requestId.
 */
function _updateApiRequest(requestId, updates) {
    const entry = _apiRequestHistory.get(requestId);
    if (entry) Object.assign(entry, updates);
}

/**
 * Get the latest API request entry (for API View display).
 */
function _getLatestApiRequest() {
    if (_apiRequestLatestId) return _apiRequestHistory.get(_apiRequestLatestId);
    return null;
}

/**
 * Get all API request entries as an array, newest first.
 */
function _getAllApiRequests() {
    const entries = [];
    for (const [id, entry] of _apiRequestHistory) {
        entries.push({ id, ...entry });
    }
    return entries.reverse(); // newest first
}

/**
 * Get a specific API request by its ID.
 */
function _getApiRequestById(requestId) {
    return _apiRequestHistory.get(requestId) || null;
}

// Sub-plugin cleanup hooks registry (for hot-reload)
// Sub-plugins can register cleanup functions that will be called during unloadPlugin()
const _pluginCleanupHooks = {}; // pluginId -> function[]

// Helper: Check if dynamic model fetching is enabled for a given provider
// Setting key: cpm_dynamic_<providerName_lowercase> = 'true' means fetch from server
// Default: false — only fetch when user explicitly checks the checkbox
async function isDynamicFetchEnabled(providerName) {
    const key = `cpm_dynamic_${providerName.toLowerCase()}`;
    try {
        const val = await safeGetArg(key);
        // Only treat explicitly 'true' as enabled
        return (val === 'true' || val === true);
    } catch {
        return false;
    }
}

/**
 * Strip RisuAI-internal tags from message content.
 * Keep inlay tokens intact to avoid breaking translation/aux slot image flows.
 */
function stripInternalTags(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/<qak>|<\/qak>/g, '')
        .trim();
}

function stripStaleAutoCaption(text, message) {
    if (typeof text !== 'string') return text;
    if (hasAttachedMultimodals(message)) return text;

    const lower = text.toLowerCase();
    const imageIntent = lower.includes('image') || lower.includes('photo') || lower.includes('picture') || lower.includes('첨부') || lower.includes('사진');
    if (!imageIntent) return text;

    return text.replace(/\s*\[[a-z0-9][a-z0-9 ,.'"-]{6,}\]\s*$/i, '').trim();
}

function hasAttachedMultimodals(message) {
    return !!(message && Array.isArray(message.multimodals) && message.multimodals.length > 0);
}

function hasNonEmptyMessageContent(content) {
    if (content === null || content === undefined) return false;
    if (typeof content === 'string') return content.trim() !== '';
    if (Array.isArray(content)) return content.length > 0;
    if (typeof content === 'object') return true;
    return String(content).trim() !== '';
}

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
 * Deep-sanitize messages array: remove null/undefined entries,
 * strip internal RisuAI tags, filter messages with empty content.
 * Returns a NEW array — never mutates the input.
 */
function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const result = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        // Skip null, undefined, non-objects
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
        return safeStringify(obj);
    } catch (e) {
        // Non-JSON bodies (e.g., URL-encoded form data like "grant_type=...") are expected
        // for certain endpoints (OAuth token exchange). Log at debug level, not error.
        if (typeof jsonStr === 'string' && !jsonStr.trimStart().startsWith('{') && !jsonStr.trimStart().startsWith('[')) {
            // Not JSON at all (form-encoded, plain text, etc.) — return as-is silently
            return jsonStr;
        }
        console.error('[Cupcake PM] sanitizeBodyJSON: JSON parse/stringify failed:', e.message);
        return jsonStr;
    }
}

/**
 * Smart native fetch: 3-strategy fallback for V3 iframe sandbox.
 * Strategy 1: Direct fetch() → Strategy 2: risuFetch (host window) → Strategy 3: nativeFetch (proxy).
 *
 * risuFetch is preferred over nativeFetch because nativeFetch returns a streaming
 * Response whose ReadableStream body cannot be reliably consumed inside the V3
 * iframe sandbox (postMessage bridge serialization issues). risuFetch collects
 * the full response on the host side and returns it as a complete Uint8Array,
 * which is safe for structured-clone across the bridge.
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
        // Expected in V3 iframe sandbox (connect-src 'none')
        console.log(`[CupcakePM] Direct fetch failed for ${url.substring(0, 60)}...: ${e.message}`);
    }

    // Copilot/web safety: prefer nativeFetch for POST/SSE, then fallback to proxy route.
    // Why: proxy2 can return 524 on long-thinking requests (e.g., Claude Opus) when
    // first bytes are delayed. nativeFetch keeps a real Response stream path.
    // For token exchange GET, proxy route remains the primary path.
    const _isCopilotUrl = url.includes('githubcopilot.com') || url.includes('copilot_internal');
    if (_isCopilotUrl && (options.method || 'POST') !== 'GET' && typeof Risu.nativeFetch === 'function') {
        try {
            const nfOptions = { ...options };
            const nfRes = await Risu.nativeFetch(url, nfOptions);
            if (nfRes && nfRes.ok) {
                console.log(`[CupcakePM] Copilot nativeFetch succeeded: status=${nfRes.status} for ${url.substring(0, 60)}`);
                return nfRes;
            }
            if (nfRes && nfRes.status && nfRes.status !== 0) {
                // 4xx usually means request/auth issue; return immediately so caller can see exact error.
                if (nfRes.status >= 400 && nfRes.status < 500) {
                    console.warn(`[CupcakePM] Copilot nativeFetch returned client error ${nfRes.status}; returning as-is.`);
                    return nfRes;
                }
                // 5xx (including 524) -> try other routes before giving up.
                console.warn(`[CupcakePM] Copilot nativeFetch returned server error ${nfRes.status}; trying fallback route.`);
            } else {
                console.log(`[CupcakePM] Copilot nativeFetch returned unusable response, trying proxy fallback: status=${nfRes?.status || 'unknown'}`);
            }
        } catch (e) {
            console.log(`[CupcakePM] Copilot nativeFetch error: ${e.message}`);
        }
    }

    if (_isCopilotUrl && typeof Risu.risuFetch === 'function') {
        try {
            let bodyObj = undefined;
            if (options.body && typeof options.body === 'string') {
                try { bodyObj = JSON.parse(options.body); } catch { bodyObj = options.body; }
            } else if (options.body) {
                bodyObj = options.body;
            }

            const result = await Risu.risuFetch(url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: bodyObj,
                rawResponse: true,
                plainFetchDeforce: true,
            });

            if (result && result.data != null) {
                let responseBody = null;
                if (result.data instanceof Uint8Array) {
                    responseBody = result.data;
                } else if (ArrayBuffer.isView(result.data) || result.data instanceof ArrayBuffer) {
                    responseBody = new Uint8Array(result.data instanceof ArrayBuffer ? result.data : result.data.buffer);
                } else if (Array.isArray(result.data)) {
                    responseBody = new Uint8Array(result.data);
                } else if (typeof result.data === 'object' && !(result.data instanceof Blob) && typeof result.data.length === 'number') {
                    try { responseBody = new Uint8Array(Array.from(result.data)); } catch (_) { }
                } else if (typeof result.data === 'string') {
                    if (result.status && result.status !== 0) {
                        responseBody = new TextEncoder().encode(result.data);
                    }
                }

                if (responseBody) {
                    if (result.status === 524) {
                        console.warn(`[CupcakePM] Copilot proxy-forced risuFetch returned 524 for ${url.substring(0, 60)}; falling back to nativeFetch.`);
                    } else {
                    console.log(`[CupcakePM] Copilot proxy-forced risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                    return new Response(responseBody, {
                        status: result.status || 200,
                        headers: new Headers(result.headers || {})
                    });
                    }
                }
            }

            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] Copilot proxy-forced risuFetch not a real response: ${errPreview}`);
        } catch (e) {
            console.log(`[CupcakePM] Copilot proxy-forced risuFetch error: ${e.message}`);
        }

        // Last resort for Copilot API endpoints: try host plainFetch route.
        // This can work in desktop/local setups where host-side fetch policy differs.
        try {
            let bodyObj = undefined;
            if (options.body && typeof options.body === 'string') {
                try { bodyObj = JSON.parse(options.body); } catch { bodyObj = options.body; }
            } else if (options.body) {
                bodyObj = options.body;
            }

            const directResult = await Risu.risuFetch(url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: bodyObj,
                rawResponse: true,
                plainFetchForce: true,
            });

            if (directResult && directResult.data != null) {
                let responseBody = null;
                if (directResult.data instanceof Uint8Array) {
                    responseBody = directResult.data;
                } else if (ArrayBuffer.isView(directResult.data) || directResult.data instanceof ArrayBuffer) {
                    responseBody = new Uint8Array(directResult.data instanceof ArrayBuffer ? directResult.data : directResult.data.buffer);
                } else if (Array.isArray(directResult.data)) {
                    responseBody = new Uint8Array(directResult.data);
                } else if (typeof directResult.data === 'string' && directResult.status && directResult.status !== 0) {
                    responseBody = new TextEncoder().encode(directResult.data);
                }

                if (responseBody) {
                    console.log(`[CupcakePM] Copilot plainFetchForce risuFetch result: status=${directResult.status} for ${url.substring(0, 60)}`);
                    return new Response(responseBody, {
                        status: directResult.status || 200,
                        headers: new Headers(directResult.headers || {})
                    });
                }
            }
        } catch (e) {
            console.log(`[CupcakePM] Copilot plainFetchForce risuFetch error: ${e.message}`);
        }
    }

    // Strategy 2: risuFetch with plainFetchForce — direct fetch from HOST window.
    // Preferred over nativeFetch because risuFetch collects the full response on
    // the host side and returns complete data, avoiding the ReadableStream
    // serialization issues that nativeFetch has across the iframe bridge.
    //
    // SKIP conditions:
    //  - githubcopilot.com: Copilot API does NOT support CORS at all.
    //  - Non-JSON Content-Type (e.g. application/x-www-form-urlencoded):
    //    risuFetch → globalFetch → fetchWithPlainFetch always does JSON.stringify(body),
    //    which corrupts non-JSON bodies (wraps strings in quotes). For these requests
    //    nativeFetch (Strategy 3) passes the raw body bytes correctly.
    const _contentType = (options.headers && (
        options.headers['Content-Type'] || options.headers['content-type'] ||
        (typeof options.headers.get === 'function' ? options.headers.get('content-type') : '')
    )) || '';
    const _isJsonBody = !_contentType || _contentType.includes('application/json');
    if (!_isCopilotUrl && _isJsonBody && typeof Risu.risuFetch === 'function') {
        try {
            let bodyObj = undefined;
            if (options.body && typeof options.body === 'string') {
                try { bodyObj = JSON.parse(options.body); } catch { bodyObj = options.body; }
            } else if (options.body) {
                bodyObj = options.body;
            }

            // Deep-sanitize body object before it crosses the postMessage bridge
            if (bodyObj && typeof bodyObj === 'object') {
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
            }

            // Final IPC safety: ensure entire bodyObj is serializable for postMessage bridge.
            if (bodyObj && typeof bodyObj === 'object') {
                try {
                    bodyObj = JSON.parse(JSON.stringify(bodyObj));
                } catch (serErr) {
                    console.warn('[CupcakePM] bodyObj JSON round-trip failed, stripping non-serializable keys:', serErr.message);
                    const _sanitize = (obj, depth) => {
                        if (depth > 15) return undefined;
                        if (obj === null || obj === undefined) return obj;
                        const t = typeof obj;
                        if (t === 'string' || t === 'number' || t === 'boolean') return obj;
                        if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
                        if (Array.isArray(obj)) return obj.map(v => _sanitize(v, depth + 1)).filter(v => v !== undefined);
                        if (t === 'object') {
                            const out = {};
                            for (const k of Object.keys(obj)) {
                                try { const v = _sanitize(obj[k], depth + 1); if (v !== undefined) out[k] = v; } catch (_) {}
                            }
                            return out;
                        }
                        return undefined;
                    };
                    try { bodyObj = _sanitize(bodyObj, 0); } catch (_) {}
                }
            }

            const result = await Risu.risuFetch(url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: bodyObj,
                rawResponse: true,
                plainFetchForce: true,
            });

            if (result && result.data != null) {
                let responseBody = null;
                if (result.data instanceof Uint8Array) {
                    responseBody = result.data;
                } else if (ArrayBuffer.isView(result.data) || result.data instanceof ArrayBuffer) {
                    responseBody = new Uint8Array(result.data instanceof ArrayBuffer ? result.data : result.data.buffer);
                } else if (Array.isArray(result.data)) {
                    responseBody = new Uint8Array(result.data);
                } else if (typeof result.data === 'object' && !(result.data instanceof Blob) && typeof result.data.length === 'number') {
                    try { responseBody = new Uint8Array(Array.from(result.data)); } catch (_) { }
                } else if (typeof result.data === 'string') {
                    if (result.status && result.status !== 0) {
                        responseBody = new TextEncoder().encode(result.data);
                    }
                }

                if (responseBody) {
                    console.log(`[CupcakePM] risuFetch succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                    return new Response(responseBody, {
                        status: result.status || 200,
                        headers: new Headers(result.headers || {})
                    });
                }
            }
            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] risuFetch not a real response: ${errPreview}`);
        } catch (e) {
            console.log(`[CupcakePM] risuFetch error: ${e.message}`);
        }
    }

    // Strategy 3 (fallback): nativeFetch — proxy-based fetch.
    // May return a streaming Response that the iframe can't fully consume,
    // but serves as last resort when risuFetch is unavailable or fails.
    try {
        console.log(`[CupcakePM] Falling back to nativeFetch (proxy) for ${url.substring(0, 60)}...`);
        const nfOptions = { ...options };
        const res = await Risu.nativeFetch(url, nfOptions);
        return res;
    } catch (e) {
        console.error(`[CupcakePM] nativeFetch also failed: ${e.message}`);
    }

    throw new Error(`[CupcakePM] All fetch strategies failed for ${url.substring(0, 60)}`);
}

// ==========================================
// 3.1 PERSISTENT SETTINGS BACKUP (survives plugin deletion)
// ==========================================
const SettingsBackup = {
    STORAGE_KEY: 'cpm_settings_backup',
    _cache: null,

    // All known setting keys that should be backed up
    getAllKeys() {
        const auxKeys = ['translation', 'emotion', 'memory', 'other'].flatMap(s => [
            `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
            `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
            `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
        ]);
        return [
            ...auxKeys,
            'cpm_enable_chat_resizer',
            'cpm_custom_models',
            // Global Fallback Parameters
            'cpm_fallback_temp', 'cpm_fallback_max_tokens', 'cpm_fallback_top_p', 'cpm_fallback_freq_pen', 'cpm_fallback_pres_pen',
            // OpenAI
            'cpm_openai_key', 'cpm_openai_url', 'cpm_openai_model', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier',
            // Anthropic
            'cpm_anthropic_key', 'cpm_anthropic_url', 'cpm_anthropic_model', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching',
            // Gemini
            'cpm_gemini_key', 'cpm_gemini_model', 'cpm_gemini_thinking_level', 'cpm_gemini_thinking_budget',
            'chat_gemini_preserveSystem', 'chat_gemini_showThoughtsToken', 'chat_gemini_useThoughtSignature', 'chat_gemini_usePlainFetch',
            // Vertex
            'cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_model', 'cpm_vertex_thinking_level', 'cpm_vertex_thinking_budget', 'cpm_vertex_claude_thinking_budget',
            'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature',
            // AWS
            'cpm_aws_key', 'cpm_aws_secret', 'cpm_aws_region', 'cpm_aws_thinking_budget', 'cpm_aws_thinking_effort',
            // OpenRouter
            'cpm_openrouter_key', 'cpm_openrouter_url', 'cpm_openrouter_model', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning',
            // DeepSeek
            'cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_deepseek_model',
        ];
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

    // Update a single key in the backup
    async updateKey(key, value) {
        if (!this._cache) await this.load();
        this._cache[key] = value;
        await this.save();
    },

    // Snapshot all current @arg settings into backup
    async snapshotAll() {
        if (!this._cache) this._cache = {};
        const keys = this.getAllKeys();
        // Also include dynamic provider export keys
        for (const tab of registeredProviderTabs) {
            if (tab.exportKeys) keys.push(...tab.exportKeys);
        }
        const uniqueKeys = [...new Set(keys)];
        for (const key of uniqueKeys) {
            const val = await safeGetArg(key);
            if (val !== undefined && val !== '') {
                this._cache[key] = val;
            }
        }
        await this.save();
        console.log(`[CPM Backup] Snapshot saved (${Object.keys(this._cache).length} keys)`);
    },

    // Restore from backup — only fills in keys that are currently empty
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

// ==========================================
// DYNAMIC SUB-PLUGIN LOADER
// ==========================================
const SubPluginManager = {
    STORAGE_KEY: 'cpm_installed_subplugins',
    plugins: [], // Array of { id, name, version, description, code, enabled }

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
        // If same name exists, update it instead of duplicating
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
        this.plugins.push({
            id,
            code,
            enabled: true,
            ...meta
        });
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
        _exposeScopeToWindow();
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
        for (const p of this.plugins) {
            if (p.enabled) {
                try {
                    _currentExecutingPluginId = p.id;
                    if (!_pluginRegistrations[p.id]) _pluginRegistrations[p.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                    await _executeViaScriptTag(p.code, p.name);
                    console.log(`[CPM Loader] Loaded Sub-Plugin: ${p.name}`);
                } catch (e) {
                    console.error(`[CPM Loader] Failed to load ${p.name}`, e);
                } finally {
                    _currentExecutingPluginId = null;
                }
            }
        }
    },

    // Compare semver-like version strings: returns 1 if b > a, 0 if equal, -1 if a > b
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

    // ── Lightweight Silent Version Check (업데이트 자동 알림) ──
    // Fetches only version manifest (~0.5KB) on startup to notify users of available updates.
    // No code is downloaded — just version numbers compared. Runs once per session with cooldown.

    VERSIONS_URL: 'https://cupcake-plugin-manager.vercel.app/api/versions',
    MAIN_UPDATE_URL: 'https://cupcake-plugin-manager.vercel.app/provider-manager.js',
    _VERSION_CHECK_COOLDOWN: 600000, // 10분 (ms)
    _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
    _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
    _pendingUpdateNames: [], // Store names for settings UI badge

    /**
     * Silent version check — fetches lightweight versions.json, compares with local,
     * and shows a non-intrusive toast if updates are available.
     * Designed to be fire-and-forget: all errors silently caught.
     */
    async checkVersionsQuiet() {
        try {
            // Session guard: only once per page load
            if (window._cpmVersionChecked) return;
            window._cpmVersionChecked = true;

            // Cooldown guard: at most once per hour (persisted in pluginStorage)
            try {
                const lastCheck = await Risu.pluginStorage.getItem(this._VERSION_CHECK_STORAGE_KEY);
                if (lastCheck) {
                    const elapsed = Date.now() - parseInt(lastCheck, 10);
                    if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                        console.log(`[CPM AutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago (cooldown: ${this._VERSION_CHECK_COOLDOWN / 60000}min)`);
                        return;
                    }
                }
            } catch (_) { /* pluginStorage not available, proceed anyway */ }

            // Fetch lightweight versions manifest (~0.5KB)
            const cacheBuster = this.VERSIONS_URL + '?_t=' + Date.now();
            console.log(`[CPM AutoCheck] Fetching version manifest...`);

            const result = await Risu.risuFetch(cacheBuster, {
                method: 'GET',
                plainFetchForce: true,
            });

            if (!result.data || (result.status && result.status >= 400)) {
                console.debug(`[CPM AutoCheck] Fetch failed (${result.status}), silently skipped.`);
                return;
            }

            const manifest = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
            if (!manifest || typeof manifest !== 'object') return;

            // Compare versions
            const updatesAvailable = [];
            for (const p of this.plugins) {
                if (!p.updateUrl || !p.name) continue;
                const remote = manifest[p.name];
                if (!remote || !remote.version) continue;
                const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                if (cmp > 0) {
                    updatesAvailable.push({
                        name: p.name,
                        icon: p.icon || '🧩',
                        localVersion: p.version || '0.0.0',
                        remoteVersion: remote.version,
                        changes: remote.changes || '',
                    });
                }
            }

            // ── Main Plugin Check (from same manifest — no extra fetch) ──
            let mainUpdateInfo = null;
            const mainRemote = manifest['Cupcake Provider Manager'];
            if (mainRemote && mainRemote.version) {
                const mainCmp = this.compareVersions(CPM_VERSION, mainRemote.version);
                if (mainCmp > 0) {
                    mainUpdateInfo = {
                        localVersion: CPM_VERSION,
                        remoteVersion: mainRemote.version,
                        changes: mainRemote.changes || '',
                    };
                    window._cpmMainVersionFromManifest = true; // prevent fallback JS fetch
                    console.log(`[CPM AutoCheck] Main plugin update available: ${CPM_VERSION}→${mainRemote.version}`);
                }
            }

            // Save check timestamp
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

            // Show main plugin update toast (delayed if sub-plugin toast was also shown to avoid overlap)
            if (mainUpdateInfo) {
                const delay = updatesAvailable.length > 0 ? 1500 : 0;
                setTimeout(async () => {
                    try {
                        await this.showMainUpdateToast(mainUpdateInfo.localVersion, mainUpdateInfo.remoteVersion, mainUpdateInfo.changes);
                    } catch (_) { }
                }, delay);
            }
        } catch (e) {
            // Silently fail — this is a background convenience feature
            console.debug(`[CPM AutoCheck] Silent error:`, e.message || e);
        }
    },

    /**
     * Show a lightweight, non-intrusive toast notification about available updates.
     * Auto-dismisses after 8 seconds. Minimal DOM footprint.
     */
    async showUpdateToast(updates) {
        try {
            // getRootDocument returns SafeElement proxies — must use async SafeElement API
            // Pattern follows LBI PluginToastUI: individual setStyle() calls, not setStyleAttribute()
            const doc = await Risu.getRootDocument();
            if (!doc) {
                console.debug('[CPM Toast] getRootDocument returned null');
                return;
            }

            // Remove previous toast if exists
            const existing = await doc.querySelector('[x-cpm-toast]');
            if (existing) {
                try { await existing.remove(); } catch (_) { }
            }

            const count = updates.length;
            // Build change summary HTML (max 3 items)
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

            // Create toast via SafeElement — use individual setStyle() like LBI
            const toast = await doc.createElement('div');
            await toast.setAttribute('x-cpm-toast', '1');
            await toast.setStyle('position', 'fixed');
            await toast.setStyle('bottom', '20px');
            await toast.setStyle('right', '20px');
            await toast.setStyle('zIndex', '99998');
            await toast.setStyle('background', '#1f2937');
            await toast.setStyle('border', '1px solid #374151');
            await toast.setStyle('borderLeft', '3px solid #3b82f6');
            await toast.setStyle('borderRadius', '10px');
            await toast.setStyle('padding', '12px 14px');
            await toast.setStyle('maxWidth', '380px');
            await toast.setStyle('minWidth', '280px');
            await toast.setStyle('boxShadow', '0 8px 24px rgba(0,0,0,0.4)');
            await toast.setStyle('fontFamily', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
            await toast.setStyle('pointerEvents', 'auto');
            await toast.setStyle('opacity', '0');
            await toast.setStyle('transform', 'translateY(12px)');
            await toast.setStyle('transition', 'opacity 0.3s ease, transform 0.3s ease');

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
            if (body) {
                await body.appendChild(toast);
                console.log('[CPM Toast] Toast appended to root body');
            } else {
                console.debug('[CPM Toast] body not found');
                return;
            }

            // Animate in
            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '1');
                    await toast.setStyle('transform', 'translateY(0)');
                } catch (_) { }
            }, 50);

            // Auto-dismiss after 8 seconds
            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '0');
                    await toast.setStyle('transform', 'translateY(12px)');
                    setTimeout(async () => {
                        try { await toast.remove(); } catch (_) { }
                    }, 350);
                } catch (_) { }
            }, 8000);
        } catch (e) {
            console.debug('[CPM Toast] Failed to show toast:', e.message);
        }
    },

    /**
     * Fallback main plugin version check — only runs if manifest didn't include main plugin.
     * Fetches remote provider-manager.js and extracts @version + @changes.
     */
    async checkMainPluginVersionQuiet() {
        try {
            // Skip if already resolved via lightweight manifest in checkVersionsQuiet()
            if (window._cpmMainVersionFromManifest) {
                console.log('[CPM MainAutoCheck] Already checked via manifest, skipping JS fallback.');
                return;
            }

            // Session guard: only once per page load
            if (window._cpmMainVersionChecked) return;
            window._cpmMainVersionChecked = true;

            // Cooldown guard
            try {
                const lastCheck = await Risu.pluginStorage.getItem(this._MAIN_VERSION_CHECK_STORAGE_KEY);
                if (lastCheck) {
                    const elapsed = Date.now() - parseInt(lastCheck, 10);
                    if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                        console.log(`[CPM MainAutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago (cooldown: ${this._VERSION_CHECK_COOLDOWN / 60000}min)`);
                        return;
                    }
                }
            } catch (_) { /* pluginStorage not available, proceed anyway */ }

            const cacheBuster = this.MAIN_UPDATE_URL + '?_t=' + Date.now();
            console.log('[CPM MainAutoCheck] Fallback: fetching remote provider-manager.js...');

            const result = await Risu.risuFetch(cacheBuster, {
                method: 'GET',
                plainFetchForce: true,
            });

            if (!result.data || (result.status && result.status >= 400)) {
                console.debug(`[CPM MainAutoCheck] Fetch failed (${result.status}), silently skipped.`);
                return;
            }

            const code = typeof result.data === 'string' ? result.data : String(result.data || '');
            // Extract version
            const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
            if (!verMatch) {
                console.debug('[CPM MainAutoCheck] Remote version tag not found, skipped.');
                return;
            }
            // Extract changes (optional @changes tag in JS header)
            const changesMatch = code.match(/\/\/\s*@changes\s+(.+)/i);
            const changes = changesMatch ? changesMatch[1].trim() : '';

            const remoteVersion = (verMatch[1] || '').trim();
            const localVersion = CPM_VERSION;
            const cmp = this.compareVersions(localVersion, remoteVersion);

            try {
                await Risu.pluginStorage.setItem(this._MAIN_VERSION_CHECK_STORAGE_KEY, String(Date.now()));
            } catch (_) { /* ignore */ }

            if (cmp > 0) {
                console.log(`[CPM MainAutoCheck] Main update available: ${localVersion}→${remoteVersion}`);
                await this.showMainUpdateToast(localVersion, remoteVersion, changes);
            } else {
                console.log('[CPM MainAutoCheck] Main plugin is up to date.');
            }
        } catch (e) {
            console.debug('[CPM MainAutoCheck] Silent error:', e.message || e);
        }
    },

    /**
     * Show a lightweight toast notification for main plugin update availability.
     * Matches sub-plugin toast style but with amber accent + clear "메인 플러그인" label.
     * Dynamically offsets if sub-plugin toast is also visible.
     */
    async showMainUpdateToast(localVersion, remoteVersion, changes) {
        try {
            const doc = await Risu.getRootDocument();
            if (!doc) {
                console.debug('[CPM MainToast] getRootDocument returned null');
                return;
            }

            const existing = await doc.querySelector('[x-cpm-main-toast]');
            if (existing) {
                try { await existing.remove(); } catch (_) { }
            }

            // Avoid overlapping with sub-plugin toast
            const subToastEl = await doc.querySelector('[x-cpm-toast]');
            const bottomPos = subToastEl ? '110px' : '20px';

            const toast = await doc.createElement('div');
            await toast.setAttribute('x-cpm-main-toast', '1');
            await toast.setStyle('position', 'fixed');
            await toast.setStyle('bottom', bottomPos);
            await toast.setStyle('right', '20px');
            await toast.setStyle('zIndex', '99999');
            await toast.setStyle('background', '#1f2937');
            await toast.setStyle('border', '1px solid #374151');
            await toast.setStyle('borderLeft', '3px solid #f59e0b');
            await toast.setStyle('borderRadius', '10px');
            await toast.setStyle('padding', '12px 14px');
            await toast.setStyle('maxWidth', '380px');
            await toast.setStyle('minWidth', '280px');
            await toast.setStyle('boxShadow', '0 8px 24px rgba(0,0,0,0.4)');
            await toast.setStyle('fontFamily', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
            await toast.setStyle('pointerEvents', 'auto');
            await toast.setStyle('opacity', '0');
            await toast.setStyle('transform', 'translateY(12px)');
            await toast.setStyle('transition', 'opacity 0.3s ease, transform 0.3s ease');

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
            if (!body) {
                console.debug('[CPM MainToast] body not found');
                return;
            }

            await body.appendChild(toast);
            console.log('[CPM MainToast] Main update toast appended to root body');

            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '1');
                    await toast.setStyle('transform', 'translateY(0)');
                } catch (_) { }
            }, 50);

            // Auto-dismiss after 10 seconds (slightly longer than sub-plugin toast)
            setTimeout(async () => {
                try {
                    await toast.setStyle('opacity', '0');
                    await toast.setStyle('transform', 'translateY(12px)');
                    setTimeout(async () => {
                        try { await toast.remove(); } catch (_) { }
                    }, 350);
                } catch (_) { }
            }, 10000);
        } catch (e) {
            console.debug('[CPM MainToast] Failed to show toast:', e.message || e);
        }
    },

    // ── Single-Bundle Update System ──
    // Uses Vercel API route (/api/update-bundle) via risuFetch(plainFetchForce) to bypass iframe CSP + proxy2 cache issues.

    UPDATE_BUNDLE_URL: 'https://cupcake-plugin-manager.vercel.app/api/update-bundle',

    // Check all plugins for updates. Fetches ONE combined bundle (versions + code).
    // Returns array of { plugin, remoteVersion, localVersion, code }.
    async checkAllUpdates() {
        try {
            const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '_r=' + Math.random().toString(36).substr(2, 8);
            console.log(`[CPM Update] Fetching update bundle via risuFetch(plainFetchForce): ${cacheBuster}`);

            // risuFetch(plainFetchForce): HOST-window fetch, bypasses proxy2 + CSP
            const result = await Risu.risuFetch(cacheBuster, {
                method: 'GET',
                plainFetchForce: true,
            });

            if (!result.data || (result.status && result.status >= 400)) {
                console.error(`[CPM Update] Failed to fetch update bundle: ${result.status}`);
                return [];
            }

            // risuFetch auto-parses JSON, so result.data is already an object
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
                    } else {
                        console.warn(`[CPM Update] ${p.name} (${remote.file}) code not found in bundle`);
                    }
                    results.push({
                        plugin: p,
                        remoteVersion: remote.version,
                        localVersion: p.version || '0.0.0',
                        remoteFile: remote.file,
                        code,
                    });
                }
            }
            return results;
        } catch (e) {
            console.error(`[CPM Update] Failed to check updates:`, e);
            return [];
        }
    },

    // Apply update using pre-fetched code from the bundle (no additional fetch needed).
    // Code is pre-fetched during checkAllUpdates to avoid proxy2 per-domain cache issues.
    async applyUpdate(pluginId, prefetchedCode) {
        const p = this.plugins.find(x => x.id === pluginId);
        if (!p) return false;
        if (!prefetchedCode) {
            console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
            return false;
        }
        try {
            console.log(`[CPM Update] Applying update for ${p.name} (${(prefetchedCode.length / 1024).toFixed(1)}KB)`);
            const meta = this.extractMetadata(prefetchedCode);
            // Safety check: verify the remote code's name matches the plugin being updated
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

    // Unload all providers/tabs/fetchers registered by a specific sub-plugin
    // Also calls any cleanup hooks registered via CupcakePM.registerCleanup()
    unloadPlugin(pluginId) {
        const reg = _pluginRegistrations[pluginId];
        if (!reg) return;

        // Call registered cleanup hooks FIRST (timers, intervals, observers, listeners)
        const hooks = _pluginCleanupHooks[pluginId];
        if (hooks && Array.isArray(hooks)) {
            for (const hook of hooks) {
                try {
                    const result = hook();
                    // Support async cleanup hooks
                    if (result && typeof result.then === 'function') {
                        result.catch(e => console.warn(`[CPM Loader] Async cleanup hook error for ${pluginId}:`, e.message));
                    }
                } catch (e) {
                    console.warn(`[CPM Loader] Cleanup hook error for ${pluginId}:`, e.message);
                }
            }
            delete _pluginCleanupHooks[pluginId];
        }

        // Also try the conventional window._cpm*Cleanup pattern for backward compat
        // Sub-plugins typically register cleanup as window._cpmXxxCleanup
        for (const key of Object.keys(window)) {
            if (key.startsWith('_cpm') && key.endsWith('Cleanup') && typeof window[key] === 'function') {
                // Only call cleanup for sub-plugins that match this pluginId's registered provider names
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
                    } catch (e) {
                        console.warn(`[CPM Loader] window.${key}() error:`, e.message);
                    }
                }
            }
        }

        for (const name of reg.providerNames) {
            delete customFetchers[name];
            ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
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

    // Execute a single plugin (sets tracking context)
    async executeOne(plugin) {
        if (!plugin || !plugin.enabled) return;
        _exposeScopeToWindow();
        try {
            _currentExecutingPluginId = plugin.id;
            if (!_pluginRegistrations[plugin.id]) _pluginRegistrations[plugin.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            await _executeViaScriptTag(plugin.code, plugin.name);
            console.log(`[CPM Loader] Hot-loaded Sub-Plugin: ${plugin.name}`);
        } catch (e) {
            console.error(`[CPM Loader] Failed to hot-load ${plugin.name}`, e);
        } finally {
            _currentExecutingPluginId = null;
        }
    },

    // Hot-reload a single sub-plugin: unload old registrations, re-execute, re-fetch dynamic models
    async hotReload(pluginId) {
        const plugin = this.plugins.find(p => p.id === pluginId);
        if (!plugin) return false;

        // 1. Unload old registrations
        this.unloadPlugin(pluginId);

        // 2. Re-execute if enabled
        if (plugin.enabled) {
            await this.executeOne(plugin);

            // 3. Run dynamic model fetching for newly registered providers
            const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
            for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
                if (newProviderNames.includes(name)) {
                    try {
                        const enabled = await isDynamicFetchEnabled(name);
                        if (!enabled) {
                            console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`);
                            continue;
                        }
                        console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                        const dynamicModels = await fetchDynamicModels();
                        if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                            ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                            for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                            console.log(`[CupcakePM] ✓ Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                        }
                    } catch (e) {
                        console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e);
                    }
                }
            }
        }
        console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
        return true;
    },

    // Hot-reload all enabled sub-plugins
    async hotReloadAll() {
        for (const p of this.plugins) this.unloadPlugin(p.id);
        await this.executeEnabled();
        for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) continue;
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (e) {
                console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e);
            }
        }
        console.log('[CPM Loader] Hot-reload all complete.');
    }
};

// ==========================================
// KEY ROTATION (키 회전)
// ==========================================
/**
 * KeyPool: key rotation. Keys are whitespace-separated in //@arg fields.
 * Random pick per request; on 429/529/503, drain failed key and retry.
 */
const KeyPool = {
    _pools: {}, // argName -> { lastRaw: string, keys: string[] }

    /**
     * Parse keys from the setting string (whitespace-separated), cache them,
     * and return a random key from the pool.
     * For inline pools (seeded manually via _pools), skip safeGetArg to avoid
     * overwriting the seeded pool with an empty string.
     */
    async pick(argName) {
        const pool = this._pools[argName];
        // If pool was manually seeded (inline custom models) and still has keys,
        // skip safeGetArg — the argName doesn't exist in @arg settings.
        if (pool && pool._inline && pool.keys.length > 0) {
            return pool.keys[Math.floor(Math.random() * pool.keys.length)];
        }
        const raw = await safeGetArg(argName);
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

    /** Pick key → fetchFn(key) → on retryable error, drain and retry. */

    async withRotation(argName, fetchFn, opts = {}) {
        const maxRetries = opts.maxRetries || 30;
        const isRetryable = opts.isRetryable || ((result) => {
            if (!result._status) return false;
            // 429 = rate limit, 529 = overloaded (DeepSeek), 503 = service unavailable
            return result._status === 429 || result._status === 529 || result._status === 503;
        });

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const key = await this.pick(argName);
            if (!key) {
                return { success: false, content: `[KeyPool] ${argName}에 사용 가능한 API 키가 없습니다. 설정에서 키를 확인하세요.` };
            }

            const result = await fetchFn(key);

            // Success or non-retryable error → return immediately
            if (result.success || !isRetryable(result)) return result;

            // Retryable error → drain the failed key and try another
            const remaining = this.drain(argName, key);
            console.warn(`[KeyPool] \u{1F504} 키 교체: ${argName} (HTTP ${result._status}, 남은 키: ${remaining}개, 시도: ${attempt + 1})`);

            if (remaining === 0) {
                // All keys exhausted → force re-parse from settings in case user changed them
                console.warn(`[KeyPool] \u{26A0}\u{FE0F} ${argName}의 모든 키가 소진되었습니다.`);
                this.reset(argName);
                return result;
            }
        }
        return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
    },

    // ── JSON Credential Rotation (Vertex AI 등 JSON 크레덴셜용) ──

    /** Extract individual JSON objects from raw textarea (single, comma-separated, array, or newline-separated). */
    _parseJsonCredentials(raw) {
        const trimmed = (raw || '').trim();
        if (!trimmed) return [];
        // 1. Try as JSON array: [{...}, {...}]
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
        } catch (_) { }
        // 2. Try wrapping in brackets: {...},{...} → [{...},{...}]
        if (trimmed.startsWith('{')) {
            try {
                const arr = JSON.parse('[' + trimmed + ']');
                if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
            } catch (_) { }
        }
        // 3. Try as single JSON object
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
        const raw = await safeGetArg(argName);
        const pool = this._pools[argName];
        if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
            const jsons = this._parseJsonCredentials(raw);
            this._pools[argName] = { lastRaw: raw, keys: jsons };
        }
        const keys = this._pools[argName].keys;
        if (keys.length === 0) return '';
        return keys[Math.floor(Math.random() * keys.length)];
    },

    /** Like withRotation but uses pickJson for JSON credential parsing. */
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
            console.warn(`[KeyPool] \u{1F504} JSON 인증 교체: ${argName} (HTTP ${result._status}, 남은 인증: ${remaining}개, 시도: ${attempt + 1})`);

            if (remaining === 0) {
                console.warn(`[KeyPool] \u{26A0}\u{FE0F} ${argName}의 모든 JSON 인증이 소진되었습니다.`);
                this.reset(argName);
                return result;
            }
        }
        return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
    }
};
console.log('[CupcakePM] KeyPool (key rotation) initialized.');

// ==========================================
// CUPCAKE PM GLOBAL API
// ==========================================
window.CupcakePM = {
    customFetchers,
    registeredProviderTabs,
    registerProvider({ name, models, fetcher, settingsTab, fetchDynamicModels }) {
        // Track which sub-plugin registered this provider (for hot-reload cleanup)
        if (_currentExecutingPluginId) {
            if (!_pluginRegistrations[_currentExecutingPluginId]) {
                _pluginRegistrations[_currentExecutingPluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            }
            const reg = _pluginRegistrations[_currentExecutingPluginId];
            if (!reg.providerNames.includes(name)) reg.providerNames.push(name);
            if (settingsTab) reg.tabObjects.push(settingsTab);
            if (typeof fetchDynamicModels === 'function') reg.fetcherEntries.push({ name, fetchDynamicModels });
        }
        if (fetcher) customFetchers[name] = fetcher;
        if (models && Array.isArray(models)) {
            for (const m of models) ALL_DEFINED_MODELS.push({ ...m, provider: name });
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
    // ThoughtSignatureCache is a const declared later — use getter to avoid TDZ
    get ThoughtSignatureCache() { return ThoughtSignatureCache; },
    /** Check if the V3 iframe bridge can transfer ReadableStream. */
    isStreamingAvailable: async () => {
        const enabled = await safeGetBoolArg('cpm_streaming_enabled', false);
        const capable = await checkStreamCapability();
        return { enabled, bridgeCapable: capable, active: enabled && capable };
    },
    safeGetArg,
    safeGetBoolArg,
    setArg: (k, v) => Risu.setArgument(k, String(v)),
    // Key Rotation API (키 회전)
    pickKey: (argName) => KeyPool.pick(argName),
    drainKey: (argName, failedKey) => KeyPool.drain(argName, failedKey),
    keyPoolRemaining: (argName) => KeyPool.remaining(argName),
    resetKeyPool: (argName) => KeyPool.reset(argName),
    withKeyRotation: (argName, fetchFn, opts) => KeyPool.withRotation(argName, fetchFn, opts),
    // JSON Credential Rotation API (Vertex 등 JSON 크레덴셜 키회전)
    pickJsonKey: (argName) => KeyPool.pickJson(argName),
    withJsonKeyRotation: (argName, fetchFn, opts) => KeyPool.withJsonRotation(argName, fetchFn, opts),
    get vertexTokenCache() { return vertexTokenCache; },
    set vertexTokenCache(v) { vertexTokenCache = v; },
    AwsV4Signer,
    checkStreamCapability,
    hotReload: (pluginId) => SubPluginManager.hotReload(pluginId),
    hotReloadAll: () => SubPluginManager.hotReloadAll(),
    /**
     * registerCleanup: Register a cleanup function for the currently executing sub-plugin.
     * Called during hot-reload/unload to clean up timers, intervals, observers, listeners, etc.
     * @param {Function} cleanupFn - Cleanup function (can be async). Called during unloadPlugin().
     */
    registerCleanup(cleanupFn) {
        if (typeof cleanupFn !== 'function') return;
        const pluginId = _currentExecutingPluginId;
        if (!pluginId) {
            console.warn('[CupcakePM] registerCleanup called outside sub-plugin execution context. Cleanup will not be tracked.');
            return;
        }
        if (!_pluginCleanupHooks[pluginId]) _pluginCleanupHooks[pluginId] = [];
        _pluginCleanupHooks[pluginId].push(cleanupFn);
        console.log(`[CupcakePM] Cleanup hook registered for plugin ${pluginId}`);
    },
    /**
     * addCustomModel: Programmatically add or update a Custom Model.
     * @param {Object} modelDef - Model definition (name, model, url, key, format, etc.)
     * @param {string} [tag] - Optional tag to identify models created by a specific source (for upsert).
     * @returns {{ success: boolean, created: boolean, uniqueId: string, error?: string }}
     */
    addCustomModel(modelDef, tag = '') {
        try {
            let existingIdx = -1;
            if (tag) {
                existingIdx = CUSTOM_MODELS_CACHE.findIndex(m => m._tag === tag);
            }
            if (existingIdx !== -1) {
                // Update existing
                CUSTOM_MODELS_CACHE[existingIdx] = { ...CUSTOM_MODELS_CACHE[existingIdx], ...modelDef, _tag: tag };
                Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                return { success: true, created: false, uniqueId: CUSTOM_MODELS_CACHE[existingIdx].uniqueId };
            } else {
                // Create new
                const uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                const entry = { ...modelDef, uniqueId, _tag: tag || undefined };
                CUSTOM_MODELS_CACHE.push(entry);
                ALL_DEFINED_MODELS.push({ uniqueId, id: entry.model, name: entry.name || uniqueId, provider: 'Custom' });
                Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                return { success: true, created: true, uniqueId };
            }
        } catch (e) {
            return { success: false, created: false, uniqueId: '', error: e.message };
        }
    },
    /**
     * smartFetch: Try direct browser fetch first (avoids proxy issues),
     * fall back to Risuai.nativeFetch if CORS or network error occurs.
     */
    smartFetch: async (url, options = {}) => smartNativeFetch(url, options),
    /**
     * smartNativeFetch: Same as smartFetch but explicitly named for streaming use.
     * Tries direct fetch() → falls back to nativeFetch (proxy).
     * Returns native Response object, compatible with ReadableStream/SSE.
     */
    smartNativeFetch: async (url, options = {}) => smartNativeFetch(url, options),
    /** Exchange stored GitHub OAuth token for short-lived Copilot API token (cached). */
    ensureCopilotApiToken: () => ensureCopilotApiToken(),
};
console.log('[CupcakePM] API exposed on window.CupcakePM');

// Infer request slot using CPM's own slot configuration.
// V3 overrides args.mode to 'v3', so we can't rely on mode for routing.
//
// How it works: user assigns a SPECIFIC model to each aux slot in CPM settings.
// If the invoked model's uniqueId matches a slot config, apply that slot's params.
// Otherwise it's treated as main chat.
//
// COLLISION HANDLING (v1.18.1): When the SAME model uniqueId is assigned to
// multiple slots (e.g., translation + other both use gemini-2.5-flash), we can't
// determine the slot from uniqueId alone. In that case, we analyze prompt content
// to disambiguate. If heuristics are inconclusive, we return 'chat' (no slot
// overrides) to avoid applying wrong parameters — safer than guessing wrong.
//
// NOTE: DB-based detection (reading seperateModels) was intentionally removed.
// It causes false positives when the same model handles both main chat AND aux
// tasks, since the plugin API can't read which model is the main chat model.
const CPM_SLOT_LIST = ['translation', 'emotion', 'memory', 'other'];

/**
 * Heuristic patterns for each slot type, used when the same model is assigned
 * to multiple slots and uniqueId alone can't disambiguate.
 * Each entry: { patterns: RegExp[], weight: number }
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

async function inferSlot(activeModelDef, args) {
    // Step 1: Collect all slots that match this model's uniqueId
    const matchingSlots = [];
    for (const slot of CPM_SLOT_LIST) {
        const configuredId = await safeGetArg(`cpm_slot_${slot}`, '');
        if (configuredId && configuredId === activeModelDef.uniqueId) {
            matchingSlots.push(slot);
        }
    }

    // No match → main chat
    if (matchingSlots.length === 0) return 'chat';

    // Single match → no ambiguity, return directly
    if (matchingSlots.length === 1) return matchingSlots[0];

    // COLLISION: same model assigned to multiple slots.
    // Use prompt content heuristics to disambiguate.
    console.warn(`[Cupcake PM] ⚠️ inferSlot: Model '${activeModelDef.uniqueId}' is assigned to ${matchingSlots.length} slots: [${matchingSlots.join(', ')}]. Using prompt heuristics to disambiguate.`);

    // Extract prompt text for analysis
    let promptText = '';
    if (args && args.prompt_chat && Array.isArray(args.prompt_chat)) {
        // Combine all message content (focus on system + first/last user messages for efficiency)
        const msgs = args.prompt_chat;
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m) continue;
            const content = typeof m.content === 'string' ? m.content : '';
            // For efficiency, only analyze system messages + first 2 + last 2 user/assistant messages
            if (m.role === 'system' || i < 3 || i >= msgs.length - 2) {
                promptText += content + '\n';
            }
        }
        // Limit analysis to first 3000 chars to avoid performance issues
        promptText = promptText.substring(0, 3000);
    }

    if (!promptText.trim()) {
        // No prompt content available — can't disambiguate.
        // Return 'chat' to avoid applying wrong slot params.
        console.warn(`[Cupcake PM] ⚠️ inferSlot: No prompt content available for heuristic analysis. Falling back to 'chat' (no slot overrides).`);
        return 'chat';
    }

    // Score each colliding slot
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

    // Require minimum confidence: best must score > 0 AND beat second-best
    if (bestSlot && bestScore > 0 && bestScore > secondBestScore) {
        console.log(`[Cupcake PM] inferSlot: Heuristic resolved collision → '${bestSlot}' (score: ${bestScore} vs next: ${secondBestScore})`);
        return bestSlot;
    }

    // Heuristic inconclusive — DON'T guess. Return 'chat' to avoid applying wrong params.
    // This is safer than picking the first match and potentially applying translation
    // params to a trigger/utility request or vice versa.
    console.warn(`[Cupcake PM] ⚠️ inferSlot: Heuristic inconclusive (best score: ${bestScore}). Falling back to 'chat' to avoid param bleeding.`);
    return 'chat';
}

/**
 * Get Gemini safety settings with all categories set to OFF.
 * Aligned with LBI pre36 — prevents default safety filtering.
 */
function getGeminiSafetySettings() {
    return [
        'HATE_SPEECH',
        'DANGEROUS_CONTENT',
        'HARASSMENT',
        'SEXUALLY_EXPLICIT',
        'CIVIC_INTEGRITY',
    ].map(c => ({
        category: `HARM_CATEGORY_${c}`,
        threshold: 'OFF',
    }));
}

/**
 * Validate and clamp Gemini API parameters to valid ranges.
 * Aligned with LBI pre36 GoogleAIProvider.validateApiParameters().
 * Mutates the generationConfig object in place.
 */
function validateGeminiParams(generationConfig) {
    if (!generationConfig || typeof generationConfig !== 'object') return;
    const rules = [
        ['temperature', 0, 2, 1, false],    // [key, min, max, fallback, exclusiveMax]
        ['topP', 0, 1, undefined, false],
        ['topK', 1, 40, undefined, false],   // also must be integer
        ['frequencyPenalty', -2, 2, undefined, true],
        ['presencePenalty', -2, 2, undefined, true],
    ];
    for (const [key, min, max, fallback, exclusiveMax] of rules) {
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
 * Experimental models don't support frequencyPenalty/presencePenalty.
 */
function isExperimentalGeminiModel(modelId) {
    return modelId && (modelId.includes('exp') || modelId.includes('experimental'));
}

/**
 * Check if a Gemini model supports penalty parameters.
 * Some Gemini models (experimental, flash-lite, embedding, early versions)
 * do not support frequencyPenalty/presencePenalty and will return errors.
 */
function geminiSupportsPenalty(modelId) {
    if (!modelId) return false;
    const id = modelId.toLowerCase();
    // Experimental models never support penalties
    if (id.includes('exp') || id.includes('experimental')) return false;
    // Flash-lite and nano models don't support penalties
    if (id.includes('flash-lite') || id.includes('nano')) return false;
    // Embedding models don't support penalties
    if (id.includes('embedding') || id.includes('embed')) return false;
    // AQA and attribution models
    if (id.includes('aqa')) return false;
    // Default: assume supported for pro and flash models
    return true;
}

/**
 * Strip frequencyPenalty/presencePenalty from generationConfig if model doesn't
 * support them, or if values are 0 (default, unnecessary to send).
 * Aligned with LBI pre36 behavior.
 */
function cleanExperimentalModelParams(generationConfig, modelId) {
    const supported = geminiSupportsPenalty(modelId);
    if (!supported) {
        delete generationConfig.frequencyPenalty;
        delete generationConfig.presencePenalty;
    } else {
        // Strip zero-valued penalties (default value, unnecessary and can cause issues)
        if (generationConfig.frequencyPenalty === 0) delete generationConfig.frequencyPenalty;
        if (generationConfig.presencePenalty === 0) delete generationConfig.presencePenalty;
    }
}

/**
 * Build Gemini thinkingConfig based on model version.
 * - Gemini 3+: uses thinkMode (level string: MINIMAL/LOW/MEDIUM/HIGH)
 * - Gemini 2.5: uses thinkingBudget (numeric token count)
 *
 * @param {string} model - Model ID (e.g. 'gemini-3-pro-preview', 'gemini-2.5-flash')
 * @param {string} level - Thinking level from dropdown (off/none/MINIMAL/LOW/MEDIUM/HIGH)
 * @param {number|string} [budget] - Explicit token budget (for 2.5 models)
 * @param {boolean} [isVertexAI] - Whether this is for Vertex AI (affects field casing)
 * @returns {object|null} thinkingConfig object or null if disabled
 */
function buildGeminiThinkingConfig(model, level, budget, isVertexAI) {
    const isGemini3 = /gemini-3/i.test(model || '');
    const budgetNum = parseInt(budget) || 0;

    if (isGemini3) {
        // Gemini 3+: thinking level
        // Vertex AI uses snake_case: thinking_level, Gemini Studio uses camelCase: thinkingLevel (lowercase value)
        if (level && level !== 'off' && level !== 'none') {
            if (isVertexAI) {
                return { includeThoughts: true, thinking_level: level };
            } else {
                return { includeThoughts: true, thinkingLevel: String(level).toLowerCase() };
            }
        }
        return null;
    }

    // Gemini 2.5 and others: thinking budget (thinkingBudget)
    // Must include includeThoughts: true for thought content to be returned
    if (budgetNum > 0) {
        return { includeThoughts: true, thinkingBudget: budgetNum };
    }
    // Fallback: if level is set but no explicit budget, map level to budget
    if (level && level !== 'off' && level !== 'none') {
        const budgets = { 'MINIMAL': 1024, 'LOW': 4096, 'MEDIUM': 10240, 'HIGH': 24576 };
        const mapped = budgets[level] || parseInt(level) || 10240;
        return { includeThoughts: true, thinkingBudget: mapped };
    }
    return null;
}

function formatToOpenAI(messages, config = {}) {
    // Step 1: Deep sanitize — remove nulls, strip internal RisuAI tags
    let msgs = sanitizeMessages(messages);

    if (config.mergesys) {
        let sysPrompt = "";
        let newMsgs = [];
        for (let m of msgs) {
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
            msgs.unshift({ role: 'user', content: '(Continue)' });
        }
    }

    let arr = [];
    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (!m || typeof m !== 'object') continue;
        // Validate role exists and is a string
        let role = typeof m.role === 'string' ? m.role : 'user';
        if (!role) continue;
        // Normalize non-OpenAI roles to standard OpenAI roles FIRST
        // 'model' is Gemini-specific, 'char' is RisuAI-internal → both map to 'assistant'
        if (role === 'model' || role === 'char') role = 'assistant';
        const msg = { role, content: '' };
        // altrole: convert assistant→model for Gemini-style APIs (only when explicitly requested)
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
                    contentParts.push({ type: 'input_audio', input_audio: { data: (modal.base64 || '').split(',')[1] || modal.base64, format: (modal.base64 || '').includes('wav') ? 'wav' : 'mp3' } });
                }
            }
            msg.content = contentParts.length > 0 ? contentParts : (textContent || '');
        } else if (typeof m.content === 'string') {
            msg.content = m.content;
        } else if (Array.isArray(m.content)) {
            const mappedParts = [];
            for (const part of m.content) {
                if (!part || typeof part !== 'object') continue;
                if (part.type === 'image' && part.source && part.source.type === 'base64' && part.source.data) {
                    const mimeType = part.source.media_type || 'image/png';
                    mappedParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${part.source.data}` } });
                    continue;
                }
                if (part.inlineData && part.inlineData.data) {
                    const mimeType = part.inlineData.mimeType || 'application/octet-stream';
                    if (mimeType.startsWith('image/')) {
                        mappedParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${part.inlineData.data}` } });
                    } else if (mimeType.startsWith('audio/')) {
                        mappedParts.push({ type: 'input_audio', input_audio: { data: part.inlineData.data, format: mimeType.split('/')[1] || 'mp3' } });
                    }
                    continue;
                }
                mappedParts.push(part);
            }
            msg.content = mappedParts;
        } else {
            msg.content = payload.text || String(m.content ?? '');
        }
        // Final validation: ensure msg.content is valid (not null/undefined)
        if (msg.content === null || msg.content === undefined) {
            console.warn(`[Cupcake PM] formatToOpenAI: skipped message with null content after formatting (index=${i}, role=${role})`);
            continue;
        }
        if (!hasNonEmptyMessageContent(msg.content)) {
            console.warn(`[Cupcake PM] formatToOpenAI: skipped empty-content message (index=${i}, role=${role})`);
            continue;
        }
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

    return arr;
}

function formatToAnthropic(messages, config = {}) {
    const validMsgs = sanitizeMessages(messages);
    const systemMsgs = validMsgs.filter(m => m.role === 'system');
    const chatMsgs = validMsgs.filter(m => m.role !== 'system');
    const systemPrompt = systemMsgs.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');

    const formattedMsgs = [];
    for (const m of chatMsgs) {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        const payload = extractNormalizedMessagePayload(m);

        // Multimodal handling (images) → Anthropic vision format
        // Aligned with Anthropic Messages API: content becomes array of content blocks
        if (payload.multimodals.length > 0) {
            const contentParts = [];
            const textContent = payload.text.trim();
            if (textContent) contentParts.push({ type: 'text', text: textContent });
            for (const modal of payload.multimodals) {
                if (!modal || typeof modal !== 'object') continue;
                if (modal.type === 'image') {
                    const base64Str = modal.base64 || '';
                    const commaIdx = base64Str.indexOf(',');
                    // Extract media_type from data URI (e.g., "data:image/png;base64,...")
                    const mediaType = (commaIdx > -1 ? base64Str.split(';')[0]?.split(':')[1] : null) || 'image/png';
                    const data = commaIdx > -1 ? base64Str.substring(commaIdx + 1) : base64Str;
                    contentParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: data }
                    });
                }
            }
            // Merge or push new message
            if (contentParts.length > 0) {
                if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
                    // Append to existing message's content array
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
                // No valid multimodal parts, fall through to text-only
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                if (!hasNonEmptyMessageContent(content)) continue;
                if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
                    const prev = formattedMsgs[formattedMsgs.length - 1];
                    if (typeof prev.content === 'string') prev.content += '\n\n' + content;
                    else if (Array.isArray(prev.content)) prev.content.push({ type: 'text', text: content });
                } else {
                    formattedMsgs.push({ role, content });
                }
            }
            continue;
        }

        if (Array.isArray(m.content)) {
            const contentParts = [];
            for (const part of m.content) {
                if (!part || typeof part !== 'object') continue;
                if (typeof part.text === 'string' && part.text.trim() !== '') {
                    contentParts.push({ type: 'text', text: part.text });
                    continue;
                }
                if (part.type === 'image' && part.source && part.source.type === 'base64' && part.source.data) {
                    contentParts.push(part);
                    continue;
                }
                if (part.inlineData && part.inlineData.data) {
                    const mimeType = part.inlineData.mimeType || 'application/octet-stream';
                    if (mimeType.startsWith('image/')) {
                        contentParts.push({
                            type: 'image',
                            source: { type: 'base64', media_type: mimeType, data: part.inlineData.data }
                        });
                    }
                    continue;
                }
                if (part.type === 'image_url') {
                    const imageUrl = typeof part.image_url === 'string'
                        ? part.image_url
                        : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                    if (imageUrl.startsWith('data:image/')) {
                        const mediaType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                        const data = imageUrl.split(',')[1] || '';
                        if (data) {
                            contentParts.push({
                                type: 'image',
                                source: { type: 'base64', media_type: mediaType, data }
                            });
                        }
                    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        contentParts.push({
                            type: 'image',
                            source: { type: 'url', url: imageUrl }
                        });
                    }
                }

                if (part.type === 'input_image') {
                    const imageUrl = typeof part.image_url === 'string'
                        ? part.image_url
                        : (part.image_url && typeof part.image_url.url === 'string' ? part.image_url.url : '');
                    if (imageUrl.startsWith('data:image/')) {
                        const mediaType = imageUrl.split(';')[0]?.split(':')[1] || 'image/png';
                        const data = imageUrl.split(',')[1] || '';
                        if (data) {
                            contentParts.push({
                                type: 'image',
                                source: { type: 'base64', media_type: mediaType, data }
                            });
                        }
                    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                        contentParts.push({
                            type: 'image',
                            source: { type: 'url', url: imageUrl }
                        });
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

        const content = payload.text || (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
        if (!hasNonEmptyMessageContent(content)) continue;
        if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
            const prev = formattedMsgs[formattedMsgs.length - 1];
            if (typeof prev.content === 'string') {
                prev.content += '\n\n' + content;
            } else if (Array.isArray(prev.content)) {
                prev.content.push({ type: 'text', text: content });
            }
        } else {
            formattedMsgs.push({ role, content });
        }
    }
    if (formattedMsgs.length === 0 || formattedMsgs[0].role !== 'user') {
        formattedMsgs.unshift({ role: 'user', content: '(Continue)' });
    }
    return { messages: formattedMsgs, system: systemPrompt };
}

/**
 * Strip embedded thought display content from historical model messages.
 * During streaming, thought/reasoning content is injected into the stream text
 * for display (e.g. <Thoughts>...</Thoughts> or > [Thought Process] blocks).
 * When that text is saved to chat history and sent back in subsequent requests,
 * it pollutes the API context and wastes tokens. This strips those markers.
 */
function stripThoughtDisplayContent(text) {
    if (!text) return text;
    let cleaned = text;
    // New format (v1.16.0+): <Thoughts>...</Thoughts>
    cleaned = cleaned.replace(/<Thoughts>[\s\S]*?<\/Thoughts>\s*/g, '');
    // Old format (pre-v1.16.0): > [Thought Process] blockquote sections
    // Each block: "> [Thought Process]\n> title\n\n\\n\\n\n\nBody text\n\n\n\n"
    if (cleaned.includes('> [Thought Process]')) {
        const lastMarkerIdx = cleaned.lastIndexOf('> [Thought Process]');
        const afterLastMarker = cleaned.substring(lastMarkerIdx);
        // Find where actual content starts after the last thought block
        // Actual content follows after 3+ consecutive newlines then non-whitespace/non-blockquote text
        const contentMatch = afterLastMarker.match(/\n{3,}\s*(?=[^\s>\\])/);
        if (contentMatch) {
            cleaned = afterLastMarker.substring(contentMatch.index).trim();
        } else {
            // All content is thought text — strip everything
            cleaned = '';
        }
    }
    // Clean up literal \\n\\n artifacts from old format
    cleaned = cleaned.replace(/\\n\\n/g, '');
    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function formatToGemini(messagesRaw, config = {}) {
    const messages = sanitizeMessages(messagesRaw);
    const systemInstruction = [];
    const contents = [];

    // Collect system messages: only leading system messages (before any user/assistant)
    // Aligned with LBI pre36 behavior — system messages scattered in conversation body
    // are merged into regular user content, not the dedicated systemInstruction field.
    let systemPhase = true; // still collecting leading system messages

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
        // to prevent thought text (shown during streaming) from polluting subsequent API requests
        if (role === 'model') {
            trimmed = stripThoughtDisplayContent(trimmed);
        }

        // Handle system messages found after the leading block — merge into user content
        if (m.role === 'system') {
            const sysText = `[System]\n${trimmed}\n[/System]`;
            if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
                contents[contents.length - 1].parts.push({ text: sysText });
            } else {
                contents.push({ role: 'user', parts: [{ text: sysText }] });
            }
            continue;
        }

        // Skip empty messages (LBI pre36 skips trimedContent === '')
        if (trimmed === '' && normalizedMultimodals.length === 0) continue;

        // Multimodal handling (images/audio/video → inlineData)
        // Aligned with LBI pre36 multimodal → inlineData conversion
        if (normalizedMultimodals.length > 0) {
            const lastMessage = contents.length > 0 ? contents[contents.length - 1] : null;

            // If same role as last message (consecutive), append to it
            if (lastMessage && lastMessage.role === role) {
                if (trimmed) {
                    // If last part is inlineData, push new text part; otherwise append
                    if (lastMessage.parts[lastMessage.parts.length - 1]?.inlineData) {
                        lastMessage.parts.push({ text: trimmed });
                    } else {
                        lastMessage.parts[lastMessage.parts.length - 1].text += '\n\n' + trimmed;
                    }
                }
                for (const modal of normalizedMultimodals) {
                    if (modal.type === 'image' || modal.type === 'audio' || modal.type === 'video') {
                        if (modal.url && modal.type === 'image') {
                            lastMessage.parts.push({ fileData: { mimeType: modal.mimeType || 'image/*', fileUri: modal.url } });
                            continue;
                        }
                        const base64 = modal.base64 || '';
                        const commaIdx = base64.indexOf(',');
                        const mimeType = (commaIdx > -1 ? base64.split(';')[0]?.split(':')[1] : null) || modal.mimeType || 'application/octet-stream';
                        const data = commaIdx > -1 ? base64.substring(commaIdx + 1) : base64;
                        lastMessage.parts.push({ inlineData: { mimeType, data } });
                    }
                }
            } else {
                // New message with multimodal content
                const newParts = [];
                if (trimmed) newParts.push({ text: trimmed });
                for (const modal of normalizedMultimodals) {
                    if (modal.type === 'image' || modal.type === 'audio' || modal.type === 'video') {
                        if (modal.url && modal.type === 'image') {
                            newParts.push({ fileData: { mimeType: modal.mimeType || 'image/*', fileUri: modal.url } });
                            continue;
                        }
                        const base64 = modal.base64 || '';
                        const commaIdx = base64.indexOf(',');
                        const mimeType = (commaIdx > -1 ? base64.split(';')[0]?.split(':')[1] : null) || modal.mimeType || 'application/octet-stream';
                        const data = commaIdx > -1 ? base64.substring(commaIdx + 1) : base64;
                        newParts.push({ inlineData: { mimeType, data } });
                    }
                }
                if (newParts.length > 0) contents.push({ role, parts: newParts });
            }
            continue;
        }

        // Text-only message
        const part = { text: trimmed || text };
        // Inject thought_signature if enabled and available (for context caching)
        if (config.useThoughtSignature && role === 'model') {
            const cachedSig = ThoughtSignatureCache.get(trimmed || text);
            if (cachedSig) part.thought_signature = cachedSig;
        }

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts.push(part);
        } else {
            contents.push({ role, parts: [part] });
        }
    }

    if (contents.length > 0 && contents[0].role === 'model') contents.unshift({ role: 'user', parts: [{ text: '(Continue)' }] });

    if (!config.preserveSystem && systemInstruction.length > 0) {
        const sysText = systemInstruction.join('\n\n');
        if (contents.length > 0 && contents[0].role === 'user') {
            contents[0].parts.unshift({ text: `[System Content]\n${sysText}\n[/System Content]\n\n` });
        } else {
            contents.unshift({ role: 'user', parts: [{ text: `[System Content]\n${sysText}\n[/System Content]\n\n` }] });
        }
        systemInstruction.length = 0; // Clear system instructions to signal it's merged
    }

    return { contents, systemInstruction };
}

// ==========================================
// 3. SSE STREAMING HELPERS
// ==========================================

/**
 * Parse SSE (Server-Sent Events) lines from a ReadableStream<Uint8Array>.
 * Returns a ReadableStream<string> where each chunk is the delta text.
 * @param {Response} response - fetch Response with streaming body
 * @param {function} lineParser - (line: string) => string|null — extracts delta text from an SSE data line
 * @param {AbortSignal} [abortSignal] - optional abort signal
 * @returns {ReadableStream<string>}
 */
function createSSEStream(response, lineParser, abortSignal, onComplete, _logRequestId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let _accumulatedContent = ''; // Accumulate parsed content for API View log

    return new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        reader.cancel();
                        if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch { }
                        if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        // Process remaining buffer
                        if (buffer.trim()) {
                            const delta = lineParser(buffer.trim());
                            if (delta) { controller.enqueue(delta); _accumulatedContent += delta; }
                        }
                        if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch { }
                        if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(empty stream)' });
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
                    if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch { }
                    if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${e.message}]` });
                    controller.error(e);
                } else {
                    if (typeof onComplete === 'function') try { const _f = onComplete(); if (_f) controller.enqueue(_f); } catch { }
                    if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                    controller.close();
                }
            }
        },
        cancel() {
            if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(cancelled)' });
            reader.cancel();
        }
    });
}

/**
 * OpenAI-compatible SSE parser: extracts delta.content from "data: {...}" lines.
 * Works for OpenAI, DeepSeek, OpenRouter, and other OpenAI-compatible APIs.
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
 * Anthropic SSE parser: extracts delta.text from content_block_delta events.
 * Anthropic SSE format uses "event: ..." + "data: ..." pairs.
 * Enhanced with thinking/redacted_thinking support (LBI pre-36 reference).
 * @param {Response} response - fetch Response with streaming body
 * @param {AbortSignal} [abortSignal] - optional abort signal
 * @param {Object} [config] - { showThinking: boolean }
 */
function createAnthropicSSEStream(response, abortSignal, config = {}, _logRequestId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let thinking = false;
    let showThinkingResolved = false; // lazy-init flag
    let _accumulatedContent = ''; // Accumulate parsed content for API View log

    return new ReadableStream({
        async pull(controller) {
            try {
                // Lazy-detect showThinking from global setting if caller didn't pass it
                // (backward compat for sub-plugins calling CPM.createAnthropicSSEStream(res, signal))
                if (!showThinkingResolved) {
                    showThinkingResolved = true;
                    if (config.showThinking === undefined) {
                        try { config.showThinking = await safeGetBoolArg('cpm_streaming_show_thinking', false); }
                        catch { config.showThinking = false; }
                    }
                }
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        reader.cancel();
                        if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        // Close any open thinking tag
                        if (thinking) {
                            const closeTag = '\n</Thoughts>\n\n';
                            controller.enqueue(closeTag);
                            _accumulatedContent += closeTag;
                            thinking = false;
                        }
                        if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(empty stream)' });
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
                                // Handle content_block_delta events
                                if (currentEvent === 'content_block_delta') {
                                    let deltaText = '';
                                    // Thinking delta (Anthropic extended thinking)
                                    if (obj.delta?.type === 'thinking' || obj.delta?.type === 'thinking_delta') {
                                        if (config.showThinking && obj.delta.thinking) {
                                            if (!thinking) {
                                                thinking = true;
                                                deltaText += '<Thoughts>\n\n';
                                            }
                                            deltaText += obj.delta.thinking;
                                        }
                                    }
                                    // Redacted thinking
                                    else if (obj.delta?.type === 'redacted_thinking') {
                                        if (config.showThinking) {
                                            if (!thinking) {
                                                thinking = true;
                                                deltaText += '<Thoughts>\n';
                                            }
                                            deltaText += '\n[REDACTED]\n';
                                        }
                                    }
                                    // Regular text delta
                                    else if (obj.delta?.type === 'text_delta' || obj.delta?.type === 'text') {
                                        if (obj.delta.text) {
                                            if (thinking) {
                                                thinking = false;
                                                deltaText += '\n</Thoughts>\n\n';
                                            }
                                            deltaText += obj.delta.text;
                                        }
                                    }
                                    if (deltaText) { controller.enqueue(deltaText); _accumulatedContent += deltaText; }
                                }
                                // Handle errors
                                else if (currentEvent === 'error' || obj.type === 'error') {
                                    const errMsg = obj.error?.message || obj.message || 'Unknown stream error';
                                    const errText = `\n[Stream Error: ${errMsg}]\n`;
                                    controller.enqueue(errText);
                                    _accumulatedContent += errText;
                                }
                            } catch { }
                        }
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent + `\n[Stream Error: ${e.message}]` });
                    controller.error(e);
                } else {
                    if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(aborted)' });
                    controller.close();
                }
            }
        },
        cancel() {
            if (_logRequestId) _updateApiRequest(_logRequestId, { response: _accumulatedContent || '(cancelled)' });
            reader.cancel();
        }
    });
}

/**
 * Gemini SSE parser: extracts text parts from streamed JSON chunks.
 * Gemini streamGenerateContent with alt=sse returns "data: {...}" lines.
 */
/**
 * Simple in-memory cache for Gemini thought_signature values.
 * Maps response text (truncated) → signature for injection into subsequent requests.
 */
const ThoughtSignatureCache = {
    _cache: new Map(),
    _maxSize: 50,
    save(responseText, signature) {
        if (!responseText || !signature) return;
        // Use first 200 chars as key (sufficient for uniqueness)
        const key = String(responseText).substring(0, 200);
        this._cache.set(key, signature);
        // Evict oldest entries if cache grows too large
        if (this._cache.size > this._maxSize) {
            const firstKey = this._cache.keys().next().value;
            this._cache.delete(firstKey);
        }
    },
    get(responseText) {
        if (!responseText) return null;
        const key = String(responseText).substring(0, 200);
        return this._cache.get(key) || null;
    },
    clear() { this._cache.clear(); }
};

/**
 * onComplete callback for streaming Gemini responses — saves extracted thought_signature.
 * Called after stream ends. The config._lastSignature is set during parseGeminiSSELine.
 */
function saveThoughtSignatureFromStream(config) {
    let finalChunk = '';
    // Close unclosed thought block (edge case: stream ends during thought phase)
    if (config._inThoughtBlock) {
        config._inThoughtBlock = false;
        finalChunk += '\n</Thoughts>\n\n';
    }
    // The signature was collected during streaming via config._lastSignature
    // The response text was accumulated by parseGeminiSSELine into config._streamResponseText
    if (config._lastSignature && config._streamResponseText) {
        ThoughtSignatureCache.save(config._streamResponseText, config._lastSignature);
        console.log('[CupcakePM] Thought signature extracted from stream and saved to cache.');
    }
    return finalChunk || undefined;
}

function parseGeminiSSELine(line, config = {}) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    try {
        const obj = JSON.parse(jsonStr);

        // Check for block reasons / finishReason (safety filtering)
        // Aligned with LBI pre36 GoogleAIProvider.parseContent()
        const promptBlockReason = obj?.promptFeedback?.blockReason;
        const finishReason = obj?.candidates?.[0]?.finishReason;
        const effectiveBlockReason = promptBlockReason ?? finishReason;
        const BLOCK_REASONS = ['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'];
        if (effectiveBlockReason && BLOCK_REASONS.includes(effectiveBlockReason)) {
            // Close unclosed thought block before returning error
            let blockMsg = '';
            if (config._inThoughtBlock) { config._inThoughtBlock = false; blockMsg += '\n</Thoughts>\n\n'; }
            return blockMsg + `\n\n[⚠️ Gemini Safety Block: ${effectiveBlockReason}] ${JSON.stringify(obj.promptFeedback || obj.candidates?.[0]?.safetyRatings || '').substring(0, 300)}`;
        }

        let text = '';
        if (obj.candidates?.[0]?.content?.parts) {
            for (const part of obj.candidates[0].content.parts) {
                if (part.thought) {
                    // thought is a boolean flag — the actual thinking text is in part.text
                    // Use <Thoughts> wrapping aligned with LBI pre36 format
                    if (config.showThoughtsToken && part.text) {
                        if (!config._inThoughtBlock) {
                            config._inThoughtBlock = true;
                            text += '<Thoughts>\n\n';
                        }
                        text += part.text;
                    }
                } else if (part.text !== undefined) {
                    // Close thought block when transitioning from thought → content
                    if (config._inThoughtBlock) {
                        config._inThoughtBlock = false;
                        text += '\n</Thoughts>\n\n';
                    }
                    text += part.text;
                    // Accumulate non-thought response text for ThoughtSignatureCache key
                    if (config.useThoughtSignature) {
                        config._streamResponseText = (config._streamResponseText || '') + part.text;
                    }
                }
                // thought_signature / thoughtSignature: extract and cache for subsequent requests
                if (config.useThoughtSignature && (part.thought_signature || part.thoughtSignature)) {
                    // Store signature temporarily for onComplete callback
                    if (!config._lastSignature) config._lastSignature = part.thought_signature || part.thoughtSignature;
                }
            }
        }

        // Safety net: close thought block on finishReason (stream end)
        if (config._inThoughtBlock && finishReason) {
            config._inThoughtBlock = false;
            text += '\n</Thoughts>\n\n';
        }

        return text || null;
    } catch { return null; }
}

/**
 * Parse a non-streaming Gemini generateContent JSON response.
 * Used when cpm_streaming_enabled is false — sub-plugins call generateContent instead of streamGenerateContent.
 * Extracts text parts, handles safety blocks, wraps thoughts in <Thoughts>, caches thought_signature.
 * @param {Object} data - Parsed JSON response from generateContent endpoint
 * @param {Object} config - { useThoughtSignature, showThoughtsToken }
 * @returns {{ success: boolean, content: string }}
 */
function parseGeminiNonStreamingResponse(data, config = {}) {
    const blockReason = data?.promptFeedback?.blockReason
        ?? data?.candidates?.[0]?.finishReason;
    const BLOCK_REASONS = ['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'];
    if (blockReason && BLOCK_REASONS.includes(blockReason)) {
        return { success: false, content: `[⚠️ Gemini Safety Block: ${blockReason}] ${JSON.stringify(data.promptFeedback || data.candidates?.[0]?.safetyRatings || '').substring(0, 500)}` };
    }

    let result = '';
    let extractedSignature = null;
    let inThought = false;

    if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
            if (part.thought) {
                // thought is a boolean flag — actual text is in part.text
                if (config.showThoughtsToken && part.text) {
                    if (!inThought) { inThought = true; result += '<Thoughts>\n\n'; }
                    result += part.text;
                }
                // Skip thought text from main content when showThoughtsToken is off
            } else if (part.text !== undefined) {
                if (inThought) { inThought = false; result += '\n</Thoughts>\n\n'; }
                result += part.text;
            }
            // Extract thought signature (snake_case + camelCase)
            if (config.useThoughtSignature && (part.thought_signature || part.thoughtSignature)) {
                extractedSignature = part.thought_signature || part.thoughtSignature;
            }
        }
    }

    // Close unclosed thought block
    if (inThought) result += '\n</Thoughts>\n\n';

    // Save extracted signature to cache if present
    if (extractedSignature && result) {
        ThoughtSignatureCache.save(result, extractedSignature);
    }

    return { success: true, content: result };
}

/**
 * Parse a non-streaming Claude (Anthropic) JSON response.
 * Used when cpm_streaming_enabled is false — Vertex Claude uses rawPredict instead of streamRawPredict.
 * Handles thinking blocks with <Thoughts> wrapping.
 * @param {Object} data - Parsed JSON response from rawPredict endpoint
 * @param {Object} config - { showThinking }
 * @returns {{ success: boolean, content: string }}
 */
function parseClaudeNonStreamingResponse(data, config = {}) {
    // Check for API-level error
    if (data.type === 'error' || data.error) {
        const errMsg = data.error?.message || data.message || JSON.stringify(data.error || data).substring(0, 500);
        return { success: false, content: `[Claude Error] ${errMsg}` };
    }

    let result = '';
    let inThinking = false;

    if (Array.isArray(data.content)) {
        for (const block of data.content) {
            if (block.type === 'thinking') {
                if (config.showThinking && block.thinking) {
                    if (!inThinking) { inThinking = true; result += '<Thoughts>\n\n'; }
                    result += block.thinking;
                }
            } else if (block.type === 'redacted_thinking') {
                if (config.showThinking) {
                    if (!inThinking) { inThinking = true; result += '<Thoughts>\n\n'; }
                    result += '\n[REDACTED]\n';
                }
            } else if (block.type === 'text') {
                if (inThinking) { inThinking = false; result += '\n</Thoughts>\n\n'; }
                result += block.text || '';
            }
        }
    }

    // Close unclosed thinking block
    if (inThinking) result += '\n</Thoughts>\n\n';

    return { success: true, content: result };
}

/**
 * Collect a ReadableStream<string> into a single string.
 * Used for decoupled streaming mode and as fallback when bridge doesn't support stream transfer.
 */
async function collectStream(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) result += value;
    }
    return result;
}

// ==========================================
// 3.6 STREAM BRIDGE CAPABILITY DETECTION
// ==========================================
/** Detect if V3 iframe bridge can transfer ReadableStream. Cached after first probe. */

let _streamBridgeCapable = null;
async function checkStreamCapability() {
    if (_streamBridgeCapable !== null) return _streamBridgeCapable;

    // Phase 1: Can the browser structured-clone a ReadableStream? (no transfer list)
    // This would mean the stream survives postMessage even if the bridge doesn't list it as transferable.
    try {
        const s1 = new ReadableStream({ start(c) { c.close(); } });
        const mc1 = new MessageChannel();
        const cloneable = await new Promise(resolve => {
            const timer = setTimeout(() => { resolve(false); try { mc1.port1.close(); mc1.port2.close(); } catch { } }, 500);
            mc1.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc1.port1.close(); mc1.port2.close(); };
            mc1.port2.onmessageerror = () => { clearTimeout(timer); resolve(false); mc1.port1.close(); mc1.port2.close(); };
            try { mc1.port1.postMessage({ s: s1 }); } // NO transfer list
            catch { clearTimeout(timer); resolve(false); }
        });
        if (cloneable) {
            _streamBridgeCapable = true;
            console.log('[CupcakePM] ReadableStream is structured-cloneable — streaming enabled.');
            return true;
        }
    } catch { /* continue to Phase 2 */ }

    // Phase 2: Check if the Guest bridge's collectTransferables includes ReadableStream.
    // The bridge script is embedded in this iframe's <script> tag.
    try {
        const scriptContent = document.querySelector('script')?.textContent || '';
        const ctFnMatch = scriptContent.match(/function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/);
        if (ctFnMatch && ctFnMatch[0].includes('ReadableStream')) {
            // Bridge is patched. Verify the browser can actually transfer ReadableStream.
            const s2 = new ReadableStream({ start(c) { c.close(); } });
            const mc2 = new MessageChannel();
            const transferable = await new Promise(resolve => {
                const timer = setTimeout(() => { resolve(false); try { mc2.port1.close(); mc2.port2.close(); } catch { } }, 500);
                mc2.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc2.port1.close(); mc2.port2.close(); };
                try { mc2.port1.postMessage({ s: s2 }, [s2]); } // WITH transfer list
                catch { clearTimeout(timer); resolve(false); }
            });
            if (transferable) {
                _streamBridgeCapable = true;
                console.log('[CupcakePM] Guest bridge patched + browser supports transfer — streaming enabled.');
                return true;
            }
        }
    } catch { /* continue to fallback */ }

    _streamBridgeCapable = false;
    console.log('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
    return false;
}

// ==========================================
// 3.7 COPILOT TOKEN AUTO-FETCH (for githubcopilot.com URLs)
// ==========================================
let _copilotTokenCache = { token: '', expiry: 0 };

async function ensureCopilotApiToken() {
    // Return cached token if still valid (with 60s safety margin)
    if (_copilotTokenCache.token && Date.now() < _copilotTokenCache.expiry - 60000) {
        return _copilotTokenCache.token;
    }
    // Read GitHub OAuth token from stored arg
    const githubToken = await safeGetArg('tools_githubCopilotToken');
    if (!githubToken) {
        console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
        return '';
    }
    // Sanitize token (strip non-ASCII)
    const cleanToken = githubToken.replace(/[^\x20-\x7E]/g, '').trim();
    if (!cleanToken) return '';
    try {
        console.log('[Cupcake PM] Copilot: Exchanging OAuth token for API token...');
        const res = await smartNativeFetch('https://api.github.com/copilot_internal/v2/token', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${cleanToken}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.109.2 Chrome/142.0.7444.265 Electron/39.3.0 Safari/537.36',
                'Editor-Version': 'vscode/1.109.2',
                'Editor-Plugin-Version': 'copilot-chat/0.37.4',
                'X-GitHub-Api-Version': '2024-12-15',
            }
        });
        if (!res.ok) {
            console.error(`[Cupcake PM] Copilot token exchange failed (${res.status}): ${await res.text()}`);
            return '';
        }
        const data = await res.json();
        if (!data.token) {
            console.error('[Cupcake PM] Copilot token exchange returned no token');
            return '';
        }
        // Cache with expiry (expires_at is Unix timestamp in seconds)
        const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
        _copilotTokenCache = { token: data.token, expiry: expiryMs };
        window._cpmCopilotApiToken = data.token;
        console.log('[Cupcake PM] Copilot: API token obtained, expires in', Math.round((expiryMs - Date.now()) / 60000), 'min');
        return data.token;
    } catch (e) {
        console.error('[Cupcake PM] Copilot token exchange error:', e.message);
        return '';
    }
}

// ==========================================
// 3.8 PROVIDER FETCHERS (Custom only - built-in providers are sub-plugins)
// ==========================================

async function fetchCustom(config, messagesRaw, temp, maxTokens, args = {}, abortSignal, _reqId) {
    // Defensive: deep-sanitize messages (null filter + tag strip + role validation)
    const messages = sanitizeMessages(messagesRaw);
    const format = config.format || 'openai';
    let formattedMessages;
    let systemPrompt = '';

    if (format === 'anthropic') {
        const { messages: anthropicMsgs, system: anthropicSys } = formatToAnthropic(messages, config);
        formattedMessages = anthropicMsgs;
        systemPrompt = anthropicSys;
    } else if (format === 'google') {
        const { contents: geminiContents, systemInstruction: geminiSys } = formatToGemini(messages, config);
        formattedMessages = geminiContents;
        systemPrompt = geminiSys.length > 0 ? geminiSys.join('\n\n') : '';
    } else { // Default to OpenAI
        formattedMessages = formatToOpenAI(messages, config);
    }

    // --- Key Rotation support for Custom Models ---
    // Parse multiple keys from config.key (whitespace-separated)
    const _rawKeys = (config.key || '').trim();
    const _allKeys = _rawKeys.split(/\s+/).filter(k => k.length > 0);
    const _useKeyRotation = _allKeys.length > 1;
    let _keyPool = [..._allKeys]; // mutable copy for rotation draining

    // Final role normalization for OpenAI-compatible APIs
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

    const body = {
        model: config.model,
        temperature: temp,
    };

    // max_tokens vs max_completion_tokens: newer OpenAI models require max_completion_tokens
    const _needsMCT = (model) => { if (!model) return false; return /^(gpt-5|o[1-9])/i.test(model); };
    if (format === 'openai' && _needsMCT(config.model)) {
        body.max_completion_tokens = maxTokens;
    } else {
        body.max_tokens = maxTokens;
    }
    if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
    if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
    if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
    if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
    // repetition_penalty: Only include for OpenAI-compatible APIs.
    // Anthropic and Google APIs do not support this parameter — it causes 400 errors
    // (especially on Copilot /v1/messages which rejects "Extra inputs").
    if (format === 'openai' && args.repetition_penalty !== undefined && args.repetition_penalty !== null) {
        body.repetition_penalty = args.repetition_penalty;
    }

    if (format === 'anthropic') {
        body.messages = formattedMessages;
        if (systemPrompt) body.system = systemPrompt;

        // Anthropic Adaptive Thinking Effort (effort 드롭다운)
        const effortVal = config.effort && config.effort !== 'none' ? config.effort : null;
        if (effortVal) {
            if (effortVal === 'unspecified') {
                // 미지정: adaptive thinking 활성화, effort 지정 안함
                body.thinking = { type: 'adaptive' };
            } else {
                // low / medium / high / max
                body.thinking = { type: 'adaptive' };
                body.output_config = { effort: effortVal };
            }
            delete body.temperature;
        } else {
            // Check explicit thinkingBudget first (new numeric field), then fall back to thinking_level
            const explicitBudget = config.thinkingBudget || 0;
            const legacyBudget = parseInt(config.thinking_level) || 0;
            const budget = explicitBudget > 0 ? explicitBudget : legacyBudget;
            if (budget > 0) {
                body.thinking = { type: 'enabled', budget_tokens: budget };
                if (!body.max_tokens || body.max_tokens <= budget) body.max_tokens = budget + 4096;
                delete body.temperature;
            }
        }
    } else if (format === 'google') {
        body.contents = formattedMessages;
        if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
        body.generationConfig = { temperature: temp, maxOutputTokens: maxTokens };
        if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
        if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
        if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
        if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
        // Detect if this is a Vertex AI endpoint (for correct field casing)
        const _isVertexEndpoint = config.url && (config.url.includes('aiplatform.googleapis.com') || config.url.includes('vertex'));
        const _thinkBudgetForGemini = config.thinkingBudget || undefined;
        const _thinkCfg = buildGeminiThinkingConfig(config.model, config.thinking_level, _thinkBudgetForGemini, _isVertexEndpoint);
        if (_thinkCfg) body.generationConfig.thinkingConfig = _thinkCfg;
        // Add safety settings (all categories OFF, aligned with LBI pre36)
        body.safetySettings = getGeminiSafetySettings();
        // Validate and clamp parameters
        validateGeminiParams(body.generationConfig);
        // Strip unsupported params for experimental models
        cleanExperimentalModelParams(body.generationConfig, config.model);
        delete body.temperature;
        delete body.max_tokens;
        delete body.top_p;
        delete body.top_k;
        delete body.frequency_penalty;
        delete body.presence_penalty;
    } else { // OpenAI compatible
        body.messages = formattedMessages;
    }

    // Final safety: deep-clone + filter messages/contents arrays
    if (body.messages) {
        try {
            body.messages = JSON.parse(JSON.stringify(body.messages));
        } catch (e) {
            console.error('[Cupcake PM] Deep-clone of messages failed:', e.message);
        }
        const before = body.messages.length;
        body.messages = body.messages.filter(m => {
            if (m == null || typeof m !== 'object') return false;
            if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
            if (typeof m.role !== 'string' || !m.role) return false;
            return true;
        });
        if (body.messages.length < before) {
            console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array (was ${before}, now ${body.messages.length})`);
        }
        if (body.messages.length === 0) {
            console.warn('[Cupcake PM] Empty messages after sanitization. Blocking request to prevent provider 400 errors.');
            return {
                success: false,
                content: '[Cupcake PM] messages must be non-empty (all messages became empty after sanitization)'
            };
        }
    }
    if (body.contents) {
        try {
            body.contents = JSON.parse(JSON.stringify(body.contents));
        } catch (e) {
            console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', e.message);
        }
        const before = body.contents.length;
        body.contents = body.contents.filter(m => m != null && typeof m === 'object');
        if (body.contents.length < before) {
            console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.contents.length} null/invalid entries from contents array`);
        }
    }

    if (config.maxout) {
        if (format === 'openai') {
            body.max_output_tokens = maxTokens;
            delete body.max_tokens;
            delete body.max_completion_tokens;
        } else if (format === 'google') {
            body.generationConfig.maxOutputTokens = maxTokens;
        }
    }

    if (config.reasoning && config.reasoning !== 'none') {
        if (format === 'openai') {
            body.reasoning_effort = config.reasoning;
            delete body.temperature;
        }
        // Anthropic and Google have their own thinking/budget params, not directly mapped here
    }
    if (config.verbosity && config.verbosity !== 'none') {
        if (format === 'openai') {
            body.verbosity = config.verbosity;
        }
    }

    // OpenAI Prompt Cache Retention: extended 24h caching for supported models
    // Only applies to OpenAI-compatible format (prompt_cache_retention is OpenAI-specific)
    if (format === 'openai' && config.promptCacheRetention && config.promptCacheRetention !== 'none') {
        body.prompt_cache_retention = config.promptCacheRetention;
    }

    if (config.customParams && config.customParams.trim() !== '') {
        try {
            const extra = JSON.parse(config.customParams);
            if (typeof extra === 'object' && extra !== null) {
                // Protect: do NOT allow customParams to overwrite critical fields
                // messages/contents: already sanitized above — overwriting would bypass null filters
                // stream: controlled by cpm_streaming_enabled — must not be overridden by user params
                const safeExtra = { ...extra };
                delete safeExtra.messages;
                delete safeExtra.contents;
                delete safeExtra.stream;
                Object.assign(body, safeExtra);
            }
        } catch (e) {
            console.error('[Cupcake PM] Failed to parse customParams JSON for Custom Model:', e);
        }
    }

    // Copilot + Anthropic: auto-switch to /v1/messages endpoint
    // Copilot /chat/completions is OpenAI-compatible only.
    // Anthropic body format MUST go to /v1/messages regardless of Effort setting.
    // (LBI pre36 reference: user sets URL to /v1/messages directly for claude format)
    let effectiveUrl = config.url;
    if (config.url && config.url.includes('githubcopilot.com') && format === 'anthropic') {
        effectiveUrl = 'https://api.githubcopilot.com/v1/messages';
        console.log('[Cupcake PM] Copilot + Anthropic format detected → URL auto-switched to /v1/messages');
    }

    // --- Wrap core fetch logic to support key rotation ---
    const _doCustomFetch = async (_apiKey) => {

        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` };
        // Copilot auto-detection: if URL is githubcopilot.com, auto-fetch API token + attach Copilot headers
        // Header set aligned with LBI pre36 Utils.applyGithubCopilotHeaders()
        if (effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
            // Auto-fetch Copilot API token (exchanges stored GitHub OAuth token for short-lived API token)
            let copilotApiToken = config.copilotToken || '';
            if (!copilotApiToken) {
                copilotApiToken = await ensureCopilotApiToken();
            }
            if (copilotApiToken) {
                headers['Authorization'] = `Bearer ${copilotApiToken}`;
            } else {
                console.warn('[Cupcake PM] Copilot: No API token available. Request may fail auth. Set token via Copilot Manager (🔑 탭).');
            }

            // --- Persistent Copilot session IDs (generated once per plugin lifecycle) ---
            if (!window._cpmCopilotMachineId) {
                window._cpmCopilotMachineId = Array.from({ length: 64 }, () =>
                    Math.floor(Math.random() * 16).toString(16)
                ).join('');
            }
            if (!window._cpmCopilotSessionId) {
                window._cpmCopilotSessionId = safeUUID() + Date.now().toString();
            }

            // Required Copilot headers (aligned with LBI pre36 & VS Code Copilot extension)
            headers['Copilot-Integration-Id'] = 'vscode-chat';
            headers['Editor-Plugin-Version'] = 'copilot-chat/0.37.4';
            headers['Editor-Version'] = 'vscode/1.109.2';
            headers['User-Agent'] = 'GitHubCopilotChat/0.37.4';
            headers['Vscode-Machineid'] = window._cpmCopilotMachineId;
            headers['Vscode-Sessionid'] = window._cpmCopilotSessionId;
            headers['X-Github-Api-Version'] = '2025-10-01';
            headers['X-Initiator'] = 'user';
            headers['X-Interaction-Id'] = safeUUID();
            headers['X-Interaction-Type'] = 'conversation-panel';
            headers['X-Request-Id'] = safeUUID();
            headers['X-Vscode-User-Agent-Library-Version'] = 'electron-fetch';

            // Anthropic format: add anthropic-version header for /v1/messages endpoint
            if (format === 'anthropic') {
                headers['anthropic-version'] = '2023-06-01';
            }

            // Copilot-Vision-Request header: detect vision content in messages
            // OpenAI format uses 'image_url', Anthropic format uses 'image'
            const hasVisionContent = body.messages && body.messages.some(m =>
                Array.isArray(m?.content) && m.content.some(p => p.type === 'image_url' || p.type === 'image')
            );
            if (hasVisionContent) {
                headers['Copilot-Vision-Request'] = 'true';
            }
        }

        // --- Streaming support ---
        // decoupled: per-model flag to force non-streaming
        // cpm_streaming_enabled: global streaming toggle from user settings
        // Only send stream:true to API when BOTH allow it
        const streamingEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);
        // per-model streaming gate:
        // - new field: config.streaming (explicit)
        // - legacy fallback: !config.decoupled
        const perModelStreamingEnabled = (config.streaming === true)
            || (config.streaming !== false && !config.decoupled);
        const useStreaming = streamingEnabled && perModelStreamingEnabled;
        if (!useStreaming && effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
            console.warn(`[Cupcake PM] Copilot request in non-stream mode (global=${streamingEnabled}, model=${perModelStreamingEnabled}). Long responses may return 524 via proxy.`);
        }

        if (useStreaming) {
            // Build streaming request
            const streamBody = { ...body };
            let streamUrl = effectiveUrl;

            if (format === 'anthropic') {
                streamBody.stream = true;
            } else if (format === 'google') {
                // Switch endpoint to streamGenerateContent
                streamUrl = effectiveUrl.replace(':generateContent', ':streamGenerateContent');
                if (!streamUrl.includes('alt=')) streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'alt=sse';
            } else {
                // OpenAI-compatible
                streamBody.stream = true;
            }

            // Use safeStringify → sanitizeBodyJSON for final safety
            const finalBody = sanitizeBodyJSON(safeStringify(streamBody));

            // Enrich the API request entry (created by handleRequest) with HTTP-level details
            if (_reqId) _updateApiRequest(_reqId, {
                url: streamUrl,
                requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
                requestBody: (() => { try { return JSON.parse(finalBody); } catch { return finalBody; } })()
            });

            const res = await smartNativeFetch(streamUrl, {
                method: 'POST',
                headers,
                body: finalBody
                // NOTE: signal: abortSignal removed — AbortSignal can't cross V3 iframe bridge (postMessage structured clone)
            });

            if (_reqId) _updateApiRequest(_reqId, { status: res.status });

            if (!res.ok) {
                const errBody = await res.text();
                if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
            }

            if (_reqId) _updateApiRequest(_reqId, { response: '(streaming…)' });

            if (format === 'anthropic') {
                const showThinking = await safeGetBoolArg('cpm_streaming_show_thinking', false);
                return { success: true, content: createAnthropicSSEStream(res, abortSignal, { showThinking }, _reqId) };
            } else if (format === 'google') {
                const _onComplete = () => saveThoughtSignatureFromStream(config);
                return { success: true, content: createSSEStream(res, (line) => parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
            } else {
                return { success: true, content: createSSEStream(res, parseOpenAISSELine, abortSignal, null, _reqId) };
            }
        }

        // --- Non-streaming (decoupled) fallback ---
        const _nonStreamBody = sanitizeBodyJSON(safeStringify(body));

        // Enrich the API request entry (created by handleRequest) with HTTP-level details
        if (_reqId) _updateApiRequest(_reqId, {
            url: effectiveUrl,
            requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
            requestBody: (() => { try { return JSON.parse(_nonStreamBody); } catch { return _nonStreamBody; } })()
        });

        const res = await smartNativeFetch(effectiveUrl, {
            method: 'POST',
            headers,
            body: _nonStreamBody
            // NOTE: signal: abortSignal removed — AbortSignal can't cross V3 iframe bridge (postMessage structured clone)
        });

        if (_reqId) _updateApiRequest(_reqId, { status: res.status });

        if (!res.ok) {
            const errBody = await res.text();
            if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
            return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
        }

        // Read raw text first to always capture response body in API View log.
        const _rawResponseText = await res.text();
        if (_reqId) _updateApiRequest(_reqId, { response: _rawResponseText.substring(0, 4000) });

        let data;
        try {
            data = JSON.parse(_rawResponseText);
        } catch (_jsonErr) {
            const contentType = res.headers?.get?.('content-type') || 'unknown';
            if (_reqId) _updateApiRequest(_reqId, { response: `[Parse Error: content-type=${contentType}]\n${_rawResponseText.substring(0, 4000)}` });
            return { success: false, content: `[Custom API Error] Response is not JSON (${contentType}): ${_rawResponseText.substring(0, 1000)}`, _status: res.status };
        }
        if (_reqId) _updateApiRequest(_reqId, { response: data });

        if (format === 'anthropic') {
            // Use unified non-streaming Claude parser (thinking/redacted_thinking support)
            let showThinking = false;
            try { showThinking = await safeGetBoolArg('cpm_streaming_show_thinking', false); } catch { }
            return parseClaudeNonStreamingResponse(data, { showThinking });
        } else if (format === 'google') {
            // Use unified non-streaming Gemini parser (safety block, <Thoughts>, thought_signature)
            return parseGeminiNonStreamingResponse(data, config);
        } else { // OpenAI compatible
            return { success: true, content: data.choices?.[0]?.message?.content || '' };
        }
    }; // end _doCustomFetch

    // --- Key Rotation dispatch ---
    if (_useKeyRotation) {
        // Create a temporary KeyPool argName for this custom model's keys
        const _rotationPoolName = `_cpm_custom_inline_${config.model || 'unknown'}`;
        // Seed the pool manually (custom models store keys inline, not in @arg fields)
        KeyPool._pools[_rotationPoolName] = {
            lastRaw: _rawKeys,
            keys: [..._keyPool],
            _inline: true  // Flag: skip safeGetArg in pick() — this argName doesn't exist in settings
        };
        return KeyPool.withRotation(_rotationPoolName, _doCustomFetch);
    }
    // Single key — call directly
    return _doCustomFetch(_allKeys[0] || '');
}


// ==========================================
// 4. MAIN ROUTER
// ==========================================

async function fetchByProviderId(modelDef, args, abortSignal, _reqId) {
    // Use ?? (nullish coalescing) not || for numeric fallbacks to preserve 0 values
    const cpmFallbackTemp = await safeGetArg('cpm_fallback_temp');
    const cpmFallbackMaxTokens = await safeGetArg('cpm_fallback_max_tokens');
    const cpmFallbackTopP = await safeGetArg('cpm_fallback_top_p');
    const cpmFallbackFreqPen = await safeGetArg('cpm_fallback_freq_pen');
    const cpmFallbackPresPen = await safeGetArg('cpm_fallback_pres_pen');

    const temp = args.temperature ?? (cpmFallbackTemp !== '' ? parseFloat(cpmFallbackTemp) : 0.7);
    const maxTokens = args.max_tokens ?? (cpmFallbackMaxTokens !== '' ? parseInt(cpmFallbackMaxTokens) : undefined);

    // Apply CPM global fallbacks for optional params (only when RisuAI didn't provide them)
    if (args.top_p === undefined && cpmFallbackTopP !== '') args.top_p = parseFloat(cpmFallbackTopP);
    if (args.frequency_penalty === undefined && cpmFallbackFreqPen !== '') args.frequency_penalty = parseFloat(cpmFallbackFreqPen);
    if (args.presence_penalty === undefined && cpmFallbackPresPen !== '') args.presence_penalty = parseFloat(cpmFallbackPresPen);

    const rawChat = args.prompt_chat;
    const messages = sanitizeMessages(rawChat);

    try {
        // Dynamic provider lookup from registered sub-plugins
        const fetcher = customFetchers[modelDef.provider];
        if (fetcher) {
            return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal);
        }

        // Custom Models Manager (built-in)
        if (modelDef.provider.startsWith('Custom')) {
            const cDef = CUSTOM_MODELS_CACHE.find(m => m.uniqueId === modelDef.uniqueId);
            if (!cDef) return { success: false, content: `[Cupcake PM] Custom model config not found.` };

            return await fetchCustom({
                url: cDef.url, key: cDef.key, model: cDef.model,
                format: cDef.format || 'openai',
                sysfirst: !!cDef.sysfirst, altrole: !!cDef.altrole,
                mustuser: !!cDef.mustuser, maxout: !!cDef.maxout, mergesys: !!cDef.mergesys,
                reasoning: cDef.reasoning || 'none', verbosity: cDef.verbosity || 'none',
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

async function handleRequest(args, activeModelDef, abortSignal) {
    // V3 forces args.mode='v3', so we infer the slot from CPM's own slot config.
    // Pass args so inferSlot can use prompt content heuristics when models collide.
    const slot = await inferSlot(activeModelDef, args);

    // Route to the provider that the UI / RisuAI selected
    let targetDef = activeModelDef;

    // If this model is assigned to an aux slot, apply generation param overrides
    if (slot !== 'chat') {
        // Override generation params if provided for this slot.
        // Empty string = don't override. Use !== '' to allow explicit 0 values.
        const maxOut = await safeGetArg(`cpm_slot_${slot}_max_out`);
        const maxCtx = await safeGetArg(`cpm_slot_${slot}_max_context`);
        const slotTemp = await safeGetArg(`cpm_slot_${slot}_temp`);
        const topP = await safeGetArg(`cpm_slot_${slot}_top_p`);
        const topK = await safeGetArg(`cpm_slot_${slot}_top_k`);
        const repPen = await safeGetArg(`cpm_slot_${slot}_rep_pen`);
        const freqPen = await safeGetArg(`cpm_slot_${slot}_freq_pen`);
        const presPen = await safeGetArg(`cpm_slot_${slot}_pres_pen`);

        if (maxOut !== '') args.max_tokens = parseInt(maxOut);
        if (maxCtx !== '') args.max_context_tokens = parseInt(maxCtx);
        if (slotTemp !== '') args.temperature = parseFloat(slotTemp);
        if (topP !== '') args.top_p = parseFloat(topP);
        if (topK !== '') args.top_k = parseInt(topK);
        if (repPen !== '') args.repetition_penalty = parseFloat(repPen);
        if (freqPen !== '') args.frequency_penalty = parseFloat(freqPen);
        if (presPen !== '') args.presence_penalty = parseFloat(presPen);
    }

    // === Centralized API Request Logging (covers ALL providers, not just Custom Models) ===
    const _displayName = `[${targetDef.provider}] ${targetDef.name}`;
    const _reqId = _storeApiRequest({
        timestamp: new Date().toISOString(),
        modelName: _displayName,
        url: '',
        method: 'POST',
        headers: {},
        body: { slot, temperature: args.temperature, max_tokens: args.max_tokens, messageCount: args.prompt_chat?.length || 0 },
        response: null, status: null, duration: null
    });
    const _startTime = Date.now();

    let result;
    try {
        result = await fetchByProviderId(targetDef, args, abortSignal, _reqId);
    } catch (e) {
        _updateApiRequest(_reqId, { duration: Date.now() - _startTime, status: 'crash', response: `[CRASH] ${e.message}` });
        console.error(`[CupcakePM] 💥 Request crashed (${_displayName}):`, e);
        try { Risu.log(`💥 CRASH (${_displayName}): ${e.message}`); } catch {}
        throw e;
    }

    _updateApiRequest(_reqId, {
        duration: Date.now() - _startTime,
        status: result.success ? (result._status || 200) : (result._status || 'error')
    });

    // === Response logging: console.log (iframe) + Risu.log (HOST console — always visible) ===
    const _logResponse = (contentStr, prefix = '📥 Response') => {
        // Don't overwrite response if _doCustomFetch already enriched it with raw HTTP response
        const _existing = _apiRequestHistory.get(_reqId);
        if (!_existing?.response || _existing.response === null || _existing.response === '(streaming…)') {
            _updateApiRequest(_reqId, { response: contentStr.substring(0, 4000) });
        }
        console.log(`[CupcakePM] ${prefix} (${_displayName}):`, contentStr.substring(0, 2000));
        try { Risu.log(`${prefix} (${_displayName}): ${contentStr.substring(0, 500)}`); } catch {}
    };

    // Streaming pass-through: conditionally return ReadableStream to RisuAI
    if (result && result.success && result.content instanceof ReadableStream) {
        const streamEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);

        if (streamEnabled) {
            const bridgeCapable = await checkStreamCapability();
            if (bridgeCapable) {
                // Wrap stream with logging TransformStream before returning to RisuAI
                const _chunks = [];
                result.content = result.content.pipeThrough(new TransformStream({
                    transform(chunk, controller) {
                        _chunks.push(chunk);
                        controller.enqueue(chunk);
                    },
                    flush() {
                        const full = _chunks.join('');
                        _logResponse(full, '📥 Streamed Response');
                    }
                }));
                console.log('[Cupcake PM] ✓ Streaming: returning ReadableStream to RisuAI');
            } else {
                console.warn('[Cupcake PM] ⚠ Streaming enabled but V3 bridge cannot transfer ReadableStream. Falling back to collected string.');
                result.content = await collectStream(result.content);
                _logResponse(result.content);
            }
        } else {
            // Streaming disabled — always collect to string (original behavior)
            result.content = await collectStream(result.content);
            _logResponse(result.content);
        }
    } else if (result) {
        // Non-streaming result
        const contentStr = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        _logResponse(contentStr);
    }

    return result;
}

// ==========================================
// CSP-SAFE CODE EXECUTION (eval() replacement)
// ==========================================

function _extractNonce() {
    for (const s of document.querySelectorAll('script')) {
        if (s.nonce) return s.nonce;
    }
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (meta) {
        const m = meta.content.match(/'nonce-([^']+)'/);
        if (m) return m[1];
    }
    return '';
}

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

function _exposeScopeToWindow() {
    const fns = {
        fetchCustom, fetchByProviderId, handleRequest,
        safeGetArg, safeGetBoolArg, smartNativeFetch,
        sanitizeMessages, stripInternalTags, safeStringify, sanitizeBodyJSON,
        isDynamicFetchEnabled, inferSlot, buildGeminiThinkingConfig,
        formatToOpenAI, formatToAnthropic, formatToGemini,
        createSSEStream, parseOpenAISSELine, createAnthropicSSEStream, parseGeminiSSELine,
        collectStream, checkStreamCapability, ensureCopilotApiToken,
        getGeminiSafetySettings, validateGeminiParams, isExperimentalGeminiModel,
        cleanExperimentalModelParams, stripThoughtDisplayContent,
        saveThoughtSignatureFromStream, parseGeminiNonStreamingResponse, parseClaudeNonStreamingResponse,
    };
    for (const [k, v] of Object.entries(fns)) {
        window[k] = v;
    }

    const objs = {
        customFetchers, registeredProviderTabs, pendingDynamicFetchers,
        _pluginRegistrations, SubPluginManager, SettingsBackup, KeyPool,
        CPM_SLOT_LIST, AwsV4Signer, ThoughtSignatureCache,
    };
    for (const [k, v] of Object.entries(objs)) {
        window[k] = v;
    }

    const lets = {
        ALL_DEFINED_MODELS: [() => ALL_DEFINED_MODELS, v => { ALL_DEFINED_MODELS = v; }],
        CUSTOM_MODELS_CACHE: [() => CUSTOM_MODELS_CACHE, v => { CUSTOM_MODELS_CACHE = v; }],
        _currentExecutingPluginId: [() => _currentExecutingPluginId, v => { _currentExecutingPluginId = v; }],
        vertexTokenCache: [() => vertexTokenCache, v => { vertexTokenCache = v; }],
        _streamBridgeCapable: [() => _streamBridgeCapable, v => { _streamBridgeCapable = v; }],
        _copilotTokenCache: [() => _copilotTokenCache, v => { _copilotTokenCache = v; }],
    };
    for (const [k, [g, s]] of Object.entries(lets)) {
        Object.defineProperty(window, k, { get: g, set: s, configurable: true });
    }

    window.CPM_VERSION = CPM_VERSION;
}

// ==========================================
// 5. REGISTRATION / INIT
// ==========================================

(async () => {
    try {
        // --- 0. V3 Event Bridge ---
        // NOTE: Previous monkey-patching of SafeElement/SafeWindow prototypes
        // (__cpmV3Patched) was removed. Modifying shared prototypes is unsafe in
        // V3 iframe sandbox — it can break other plugins' event handling and
        // conflicts with the SafeElement proxy bridge. The SafeElement API already
        // correctly proxies addEventListener calls to the real host DOM elements.

        // Load & Execute Sub-Plugins FIRST (they register providers via CupcakePM.registerProvider)
        await SubPluginManager.loadRegistry();
        await SubPluginManager.executeEnabled();

        // Restore settings from pluginStorage backup if @arg values were wiped (plugin reinstall)
        await SettingsBackup.load();
        const restoredCount = await SettingsBackup.restoreIfEmpty();
        if (restoredCount > 0) {
            console.log(`[CPM] Auto-restored ${restoredCount} settings from persistent backup.`);
        }

        // ===== Streaming Bridge Capability Check (초기화 시 한 번 실행) =====
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

        // ===== Dynamic Model Fetching (공식 API에서 모델 목록 자동 갱신) =====
        for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) {
                    console.log(`[CupcakePM] Dynamic fetch disabled for ${name}, using fallback.`);
                    continue;
                }
                console.log(`[CupcakePM] Fetching dynamic models for ${name}...`);
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    for (const m of dynamicModels) {
                        ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                    console.log(`[CupcakePM] ✓ Dynamic models for ${name}: ${dynamicModels.length} models`);
                } else {
                    console.log(`[CupcakePM] No dynamic models for ${name}, using fallback.`);
                }
            } catch (e) {
                console.warn(`[CupcakePM] Dynamic fetch failed for ${name}:`, e.message || e);
            }
        }

        // Custom models migration
        const customModelsJson = await safeGetArg('cpm_custom_models', '[]');
        try {
            CUSTOM_MODELS_CACHE = JSON.parse(customModelsJson);
            if (!Array.isArray(CUSTOM_MODELS_CACHE)) CUSTOM_MODELS_CACHE = [];
        } catch (e) {
            CUSTOM_MODELS_CACHE = [];
        }

        // --- Backward Compatibility: Auto-Migrate from C1-C9 to JSON ---
        if (CUSTOM_MODELS_CACHE.length === 0) {
            let migrated = false;
            for (let i = 1; i <= 9; i++) {
                const legacyUrl = await safeGetArg(`cpm_c${i}_url`);
                const legacyModel = await safeGetArg(`cpm_c${i}_model`);
                const legacyKey = await safeGetArg(`cpm_c${i}_key`);
                // Only migrate if there's at least a URL or model configured
                if (!legacyUrl && !legacyModel && !legacyKey) continue;
                CUSTOM_MODELS_CACHE.push({
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
                    tok: await safeGetArg(`cpm_c${i}_tok`) || 'o200k_base',
                    customParams: ''
                });
                migrated = true;
            }
            if (migrated) {
                Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
            }
        }

        CUSTOM_MODELS_CACHE.forEach(m => {
            ALL_DEFINED_MODELS.push({
                uniqueId: m.uniqueId,
                id: m.model,
                name: m.name || m.uniqueId,
                provider: `Custom` // Used for grouping
            });
        });

        // Sort ALL_DEFINED_MODELS alphabetically by provider, then by name
        ALL_DEFINED_MODELS.sort((a, b) => {
            const providerCompare = a.provider.localeCompare(b.provider);
            if (providerCompare !== 0) return providerCompare;
            return a.name.localeCompare(b.name);
        });

        // Format: `🧁 [GoogleAI] Gemini 2.5 Flash`
        for (const modelDef of ALL_DEFINED_MODELS) {
            let pLabel = modelDef.provider;
            let mLabel = modelDef.name;

            // ── Model capability flags ──
            // LLMFlags enum values (from RisuAI types.ts):
            //   0 = hasImageInput, 9 = hasFullSystemPrompt, 10 = hasStreaming
            // hasImageInput is CRITICAL — without it RisuAI converts images to
            // text captions via runImageEmbedding() and never sends image data.
            const modelFlags = [
                0,   // hasImageInput
                9,   // hasFullSystemPrompt
                10,  // hasStreaming
            ];

            await Risu.addProvider(`🧁 [${pLabel}] ${mLabel}`, async (args, abortSignal) => {
                try {
                    return await handleRequest(args, modelDef, abortSignal);
                } catch (err) {
                    return { success: false, content: `[Cupcake SDK Fallback Crash] ${err.message}` };
                }
            }, {
                model: {
                    flags: modelFlags,
                }
            });
        }

        // ── Silent Update Check (지연 자동 체크) ──
        // Fire-and-forget: 5초 후 경량 버전 체크, 실패해도 무시
        setTimeout(() => {
            SubPluginManager.checkVersionsQuiet().catch(() => { });
            SubPluginManager.checkMainPluginVersionQuiet().catch(() => { });
        }, 5000);

        // Setup the Native Sidebar UI settings
        const openCpmSettings = async () => {
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
                // Also persist to pluginStorage backup
                SettingsBackup.updateKey(k, String(v));
            };

            // HTML-escape helper for attribute values
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

            // Removed renderCustomTab helper

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

            const providersList = [
                { value: '', text: '🚫 미지정 (Main UI의 모델이 처리)' }
            ];
            for (const m of ALL_DEFINED_MODELS) {
                providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });
            }

            const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
            const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
            const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];
            const effortList = [{ value: 'none', text: '사용 안함 (Off)' }, { value: 'unspecified', text: '미지정 (Unspecified)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }, { value: 'max', text: 'Max (최대)' }];

            const renderAuxParams = async (slot) => `
                    <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
                        <h4 class="text-xl font-bold text-gray-300 mb-2">Generation Parameters (생성 설정)</h4>
                        <p class="text-xs text-blue-400 font-semibold mb-4 border-l-2 border-blue-500 pl-2">
                            여기 값을 입력하면 리스AI 설정(파라미터 분리 포함) 대신 이 값이 우선 적용됩니다.<br/>
                            비워두면 리스AI의 '파라미터 분리' 설정값이 사용되고, 파라미터 분리도 미설정이면 메인 모델 설정값이 사용됩니다.<br/>
                            <span class="text-gray-500">(CPM slot override &gt; RisuAI separate params &gt; RisuAI main params &gt; default 0.7)</span>
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

            content.innerHTML = `
                    <div id="tab-trans" class="cpm-tab-content">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">번역 백그라운드 설정 (Translation)</h3>
                        <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                            메인 UI에서 선택한 [메인 챗] 프로바이더와 다르게, 번역 태스크만 자동으로 납치하여 전담할 프로바이더를 선택합니다.
                        </p>
                        ${await renderInput('cpm_slot_translation', '번역 전담 모델 선택 (Translation Model)', 'select', providersList)}
                        ${await renderAuxParams('translation')}
                    </div>
                    <div id="tab-emo" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">감정 판독 백그라운드 설정 (Emotion)</h3>
                        <p class="text-pink-300 font-semibold mb-6 border-l-4 border-pink-500 pl-4 py-1">
                            캐릭터 리액션/표정 태스크를 낚아채서 처리할 작고 빠른 모델을 지정하세요.
                        </p>
                        ${await renderInput('cpm_slot_emotion', '감정 판독 전담 모델 (Emotion/Hypa)', 'select', providersList)}
                        ${await renderAuxParams('emotion')}
                    </div>
                    <div id="tab-mem" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">하이파 백그라운드 설정 (Memory)</h3>
                        <p class="text-yellow-300 font-semibold mb-6 border-l-4 border-yellow-500 pl-4 py-1">
                            채팅 메모리 요약 등 긴 텍스트 축약 역할을 전담할 모델을 지정하세요.
                        </p>
                        ${await renderInput('cpm_slot_memory', '하이파 전담 모델 (Memory/Summarize)', 'select', providersList)}
                        ${await renderAuxParams('memory')}
                    </div>
                    <div id="tab-global" class="cpm-tab-content">
                        <h3 class="text-3xl font-bold text-cyan-400 mb-6 pb-3 border-b border-gray-700">🎛️ 글로벌 기본값 (Global Fallback Parameters)</h3>
                        <p class="text-cyan-300 font-semibold mb-4 border-l-4 border-cyan-500 pl-4 py-1">
                            리스AI가 파라미터를 보내지 않을 때 (파라미터 분리 ON + 미설정 등) 여기 값이 사용됩니다.
                        </p>
                        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
                            <h4 class="text-sm font-bold text-gray-300 mb-3">📋 파라미터 우선순위 (높은 순서)</h4>
                            <div class="text-xs text-gray-400 space-y-1">
                                <div class="flex items-center"><span class="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">1</span> CPM 슬롯 오버라이드 (번역/감정/하이파/기타 탭에서 모델 지정 + 파라미터 설정)</div>
                                <div class="flex items-center"><span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">2</span> 리스AI 파라미터 분리 값 (리스AI 설정에서 보조모델별 파라미터 설정)</div>
                                <div class="flex items-center"><span class="bg-green-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">3</span> 리스AI 메인 모델 파라미터 (파라미터 분리 꺼짐일 때)</div>
                                <div class="flex items-center"><span class="bg-cyan-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">4</span> <strong class="text-cyan-300">⭐ 여기: CPM 글로벌 기본값</strong></div>
                                <div class="flex items-center"><span class="bg-gray-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">5</span> 하드코딩 기본값 (Temperature 0.7 / Max Tokens 4096)</div>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500 mb-6">
                            💡 <strong>사용 예시:</strong> 리스AI에서 파라미터 분리를 켜고 보조모델 파라미터를 설정하지 않았을 때,<br/>
                            여기 글로벌 기본값이 하드코딩 0.7 대신 사용됩니다. 비워두면 기존처럼 0.7/4096이 적용됩니다.
                        </p>
                        <div class="space-y-2">
                            ${await renderInput('cpm_fallback_temp', 'Default Temperature (기본 온도, 비워두면 0.7)', 'number')}
                            ${await renderInput('cpm_fallback_max_tokens', 'Default Max Output Tokens (비워두면 메인모델 최대응답 설정 따름)', 'number')}
                            ${await renderInput('cpm_fallback_top_p', 'Default Top P (기본 Top P, 비워두면 API 기본값)', 'number')}
                            ${await renderInput('cpm_fallback_freq_pen', 'Default Frequency Penalty (기본 빈도 페널티, 비워두면 API 기본값)', 'number')}
                            ${await renderInput('cpm_fallback_pres_pen', 'Default Presence Penalty (기본 존재 페널티, 비워두면 API 기본값)', 'number')}
                        </div>

                        <div class="mt-10 pt-6 border-t border-gray-700">
                            <h4 class="text-xl font-bold text-emerald-400 mb-4">🔄 스트리밍 설정 (Streaming)</h4>
                            <div class="bg-gray-800/70 border border-emerald-900/50 rounded-lg p-4 mb-6">
                                <p class="text-xs text-emerald-300 mb-2 font-semibold">📡 실시간 스트리밍 지원</p>
                                <p class="text-xs text-gray-400 mb-2">
                                    활성화하면 API 응답을 ReadableStream으로 RisuAI에 직접 전달하여, RisuAI가 실시간으로 텍스트를 표시할 수 있습니다.<br/>
                                    현재 V3 플러그인 iframe bridge가 ReadableStream 전송을 지원해야 동작합니다.
                                </p>
                                <p class="text-xs text-yellow-500">
                                    ⚠️ RisuAI factory.ts의 guest bridge에서 ReadableStream이 collectTransferables에 포함되어야 합니다.<br/>
                                    지원되지 않으면 자동으로 문자열 수집 모드로 폴백됩니다. (LBI pre-36 참조)
                                </p>
                                <div id="cpm-stream-status" class="mt-3 text-xs font-mono px-3 py-2 rounded bg-gray-900 border border-gray-600">
                                    Bridge 상태: 확인 중...
                                </div>
                            </div>
                            <div class="space-y-3">
                                ${await renderInput('cpm_streaming_enabled', '스트리밍 패스스루 활성화 (Enable Streaming Pass-Through)', 'checkbox')}
                                ${await renderInput('cpm_streaming_show_thinking', 'Anthropic Thinking 토큰 표시 (Show Thinking in Stream)', 'checkbox')}
                            </div>
                        </div>
                    </div>

                    <div id="tab-other" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">트리거/루아 백그라운드 설정 (Other)</h3>
                        ${await renderInput('cpm_slot_other', 'Lua 스크립트 등 무거운 유틸 전담 모델 (Other/Trigger)', 'select', providersList)}
                        ${await renderAuxParams('other')}
                    </div>                    <div id="cpm-dynamic-provider-content"></div>

                    <div id="tab-customs" class="cpm-tab-content hidden">
                        <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                            <h3 class="text-3xl font-bold text-gray-400">Custom Models Manager</h3>
                            <div class="flex space-x-2">
                                <button id="cpm-api-view-btn" class="bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📡 API 보기</button>
                                <button id="cpm-import-model-btn" class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📥 Import Model</button>
                                <button id="cpm-add-custom-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">➕ Add Model</button>
                            </div>
                        </div>
                        
                        <!-- API View Panel -->
                        <div id="cpm-api-view-panel" class="hidden mb-6 bg-gray-900 border border-purple-700/50 rounded-lg p-5">
                            <div class="flex justify-between items-center mb-4">
                                <h4 class="text-lg font-bold text-purple-400">📡 API 요청 로그</h4>
                                <div class="flex items-center gap-3">
                                    <select id="cpm-api-view-selector" class="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 max-w-xs"></select>
                                    <button id="cpm-api-view-close" class="text-gray-400 hover:text-white text-lg px-2">✕</button>
                                </div>
                            </div>
                            <div id="cpm-api-view-content" class="text-sm text-gray-300">
                                <div class="text-center text-gray-500 py-4">아직 커스텀 모델로 API 요청을 보낸 적이 없습니다. 채팅을 시도한 후 다시 확인하세요.</div>
                            </div>
                        </div>
                        
                        <div id="cpm-cm-list" class="space-y-3">
                            <!-- JS will inject list items here -->
                        </div>

                        <div id="cpm-cm-editor" class="hidden mt-6 bg-gray-900 border border-gray-700 rounded-lg p-6 relative">
                            <h4 class="text-xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2" id="cpm-cm-editor-title">Edit Custom Model</h4>
                            <input type="hidden" id="cpm-cm-id" value="">
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="md:col-span-2 text-xs text-blue-300 mb-2 border-l-4 border-blue-500 pl-3">
                                    고급 옵션이 필요 없는 경우, 필수 항목만 입력하고 저장하세요. API 규격은 기본적으로 OpenAI와 호환됩니다.
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Display Name (UI 표시 이름)</label>
                                    <input type="text" id="cpm-cm-name" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Model Name (API 요청 모델명)</label>
                                    <input type="text" id="cpm-cm-model" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Base URL</label>
                                    <input type="text" id="cpm-cm-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-400 mb-1">API Key (여러 개 입력 시 공백/줄바꿈으로 구분 → 자동 키회전)</label>
                                    <textarea id="cpm-cm-key" rows="2" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500" spellcheck="false" placeholder="sk-xxxx 또는 여러 키를 공백/줄바꿈으로 구분 입력"></textarea>
                                    <p class="text-xs text-gray-500 mt-1">🔄 키를 2개 이상 입력하면 자동으로 키회전이 활성화됩니다. (429/529/503 에러 시 다음 키로 자동 전환)</p>
                                </div>
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Model Parameters (모델 매개변수)</h5>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">API Format / Spec (API 규격)</label>
                                    <select id="cpm-cm-format" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        <option value="openai">OpenAI (Default/기본값)</option>
                                        <option value="anthropic">Anthropic Claude</option>
                                        <option value="google">Google Gemini Studio</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Tokenizer Type (토크나이저 종류)</label>
                                    <select id="cpm-cm-tok" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        <option value="o200k_base">o200k_base (OpenAI)</option>
                                        <option value="llama3">llama3</option>
                                        <option value="claude">Claude</option>
                                        <option value="gemma">Gemma</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Thinking Level / Budget Tokens (생각 수준)</label>
                                    <select id="cpm-cm-thinking" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${thinkingList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Thinking Budget Tokens (생각 토큰 예산, 0=끄기)</label>
                                    <input type="number" id="cpm-cm-thinking-budget" min="0" step="1024" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" placeholder="0 (Anthropic/Gemini 2.5 budget_tokens용)">
                                    <p class="text-xs text-gray-500 mt-1">Anthropic: budget_tokens로 적용. Gemini 2.5: thinkingBudget으로 적용. 0이면 비활성화.</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Prompt Cache Retention (프롬프트 캐시 유지 - OpenAI)</label>
                                    <select id="cpm-cm-prompt-cache-retention" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        <option value="none">None (서버 기본값)</option>
                                        <option value="in_memory">In-Memory (5~10분, 최대 1시간)</option>
                                        <option value="24h">24h Extended (24시간 확장 캐시)</option>
                                    </select>
                                    <p class="text-xs text-gray-500 mt-1">OpenAI 전용. gpt-4.1, gpt-5 이상 모델에서 24h 캐시 지원. 비용 최대 90% 절감.</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Reasoning Effort (추론 수준)</label>
                                    <select id="cpm-cm-reasoning" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${reasoningList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Response Verbosity (응답 상세)</label>
                                    <select id="cpm-cm-verbosity" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${verbosityList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Anthropic Effort (앤트로픽 어댑티브 수준)</label>
                                    <select id="cpm-cm-effort" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${effortList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                    <p class="text-xs text-yellow-400 mt-1">⚡ Copilot URL인 경우, 활성화 시 자동으로 /v1/messages 엔드포인트로 전환됩니다.</p>
                                </div>
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Formatter Flags (커스텀 포맷터 설정)</h5>
                                    <div class="space-y-2">
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-sysfirst" class="form-checkbox bg-gray-800"> <span>hasFirstSystemPrompt (시스템 프롬프트를 맨 위로 강제 이동)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mergesys" class="form-checkbox bg-gray-800"> <span>mergeSystemPrompt (시스템 프롬프트를 첫 번째 사용자 메시지와 병합)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-altrole" class="form-checkbox bg-gray-800"> <span>requiresAlternateRole (Assistant 역할을 Model 역할로 변경)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mustuser" class="form-checkbox bg-gray-800"> <span>mustStartWithUserInput (첫 번째 메시지를 사용자 역할로 강제 시작)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-maxout" class="form-checkbox bg-gray-800"> <span>useMaxOutputTokensInstead (max_tokens 대신 max_output_tokens 사용)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-streaming" class="form-checkbox bg-gray-800"> <span>Use Streaming for this model (이 모델에서 스트리밍 사용)</span></label>
                                        <p class="text-xs text-amber-300 ml-6">※ 스트리밍이 실제로 동작하려면 글로벌 탭의 "스트리밍 패스스루 활성화"를 켠 상태에서, 이 체크박스도 함께 켜야 합니다.</p>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-thought" class="form-checkbox bg-gray-800"> <span>useThoughtSignature (생각 서명 추출 사용)</span></label>
                                    </div>
                                </div>
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Parameters (Additional JSON Payload)</h5>
                                    <p class="text-xs text-gray-500 mb-2">API Body 최상단에 직접 병합(Merge)할 JSON을 작성하세요. 예시: <code>{"top_p": 0.9, "presence_penalty": 0.1}</code></p>
                                    <textarea id="cpm-cm-custom-params" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white h-24 font-mono text-sm" spellcheck="false" placeholder="{}"></textarea>
                                </div>
                            </div>

                            <div class="mt-4 flex justify-end space-x-3 border-t border-gray-800 pt-4">
                                <button id="cpm-cm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Cancel</button>
                                <button id="cpm-cm-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-bold shadow">Save Definition</button>
                            </div>
                        </div>
                        <p class="text-xs font-bold text-gray-500 mt-4">* Additions/deletions require refreshing RisuAI (F5) to appear in the native dropdown menu.</p>
                    </div>

                    <div id="tab-plugins" class="cpm-tab-content hidden">
                        <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                            <h3 class="text-3xl font-bold text-gray-400">Sub-Plugins Manager</h3>
                            <button id="cpm-check-updates-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">🔄 서브 플러그인 업데이트 확인</button>
                        </div>
                        ${SubPluginManager._pendingUpdateNames.length > 0 ? `<div class="bg-indigo-900/40 border border-indigo-700 rounded-lg p-3 mb-4 flex items-center gap-2"><span class="text-indigo-300 text-sm font-semibold">🔔 ${SubPluginManager._pendingUpdateNames.length}개의 서브 플러그인 업데이트가 감지되었습니다.</span><span class="text-indigo-400 text-xs">아래 "🔄 업데이트 확인" 버튼을 클릭하여 적용하세요.</span></div>` : ''}
                        <p class="text-yellow-300 font-semibold mb-4 border-l-4 border-yellow-500 pl-4 py-1">
                            Cupcake PM에 연동된 외부 확장 기능(Sub-Plugins)들을 통합 관리합니다.
                        </p>
                        <div id="cpm-update-status" class="hidden mb-4"></div>
                        <div id="cpm-plugins-list" class="space-y-4">
                            <!-- JS will inject registered sub-plugins here -->
                        </div>
                    </div>
                `;

            // Sub-Plugins UI renderer
            const renderPluginsTab = () => {
                const listContainer = document.getElementById('cpm-plugins-list');
                if (!listContainer) return;

                let html = `
                    <div class="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:bg-gray-700 transition-colors cursor-pointer mb-6" id="cpm-btn-upload-plugin">
                        <div class="text-4xl mb-2">📥</div>
                        <h4 class="text-lg font-bold text-gray-200">설치할 서브 플러그인 선택 (.js/.mjs)</h4>
                        <p class="text-sm text-gray-400 mt-1">파일을 클릭하여 업로드하세요</p>
                        <input type="file" id="cpm-file-plugin" accept="${getSubPluginFileAccept()}" class="hidden">
                    </div>
                `;

                if (SubPluginManager.plugins.length === 0) {
                    html += '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded block">설치된 서브 플러그인이 없습니다.</div>';
                } else {
                    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
                    for (const p of SubPluginManager.plugins) {
                        html += `
                            <div class="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-500 transition-colors relative">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex-1 pr-4">
                                        <h4 class="text-xl font-bold text-white flex items-center space-x-2">
                                            <span>${p.icon || '🧩'}</span>
                                            <span>${p.name}</span>
                                            ${p.version ? `<span class="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded-full ml-2">v${p.version}</span>` : ''}
                                            ${p.updateUrl ? `<span class="bg-gray-800 text-gray-500 text-[10px] px-2 py-0.5 rounded-full ml-1" title="자동 업데이트 가능">🔗</span>` : ''}
                                        </h4>
                                        <p class="text-sm text-gray-400 mt-1">${p.description || 'No description provided.'}</p>
                                    </div>
                                    <div class="flex flex-col items-end space-y-2">
                                        <label class="flex items-center cursor-pointer">
                                            <div class="relative">
                                                <input type="checkbox" class="sr-only cpm-plugin-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                                <div class="block bg-gray-600 w-10 h-6 rounded-full custom-toggle-bg transition-colors"></div>
                                                <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform"></div>
                                            </div>
                                        </label>
                                        <button class="cpm-plugin-delete text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 bg-gray-700 rounded" data-id="${p.id}">🗑️ 삭제</button>
                                    </div>
                                </div>
                                <div class="border-t border-gray-700 pt-3 mt-3 plugin-ui-container" id="plugin-ui-${p.id}">
                                </div>
                            </div>
                        `;
                    }
                    html += '</div>';

                    html += '<style>.cpm-plugin-toggle:checked ~ .custom-toggle-bg{background-color:#3b82f6;} .cpm-plugin-toggle:checked ~ .dot{transform:translateX(100%);}</style>';
                }

                listContainer.innerHTML = html;

                // Events for upload
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
                            // Hot-reload: 즉시 적용 (새로고침 불필요)
                            const installed = SubPluginManager.plugins.find(p => p.name === name);
                            if (installed) await SubPluginManager.hotReload(installed.id);
                            alert(`서브 플러그인 '${name}' 설치 완료! 바로 적용되지만 새로고침을 권장합니다.`);
                            renderPluginsTab();
                        };
                        reader.readAsText(file);
                    });
                }

                // Events for toggles and deletes
                listContainer.querySelectorAll('.cpm-plugin-toggle').forEach(t => {
                    t.addEventListener('change', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        await SubPluginManager.toggle(id, e.target.checked);
                        // Hot-reload: 즉시 적용
                        await SubPluginManager.hotReload(id);
                        alert('설정이 저장되었습니다. 바로 적용되지만 새로고침을 권장합니다.');
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
                const updateBtn = document.getElementById('cpm-check-updates-btn');
                if (updateBtn) {
                    updateBtn.addEventListener('click', async () => {
                        const statusDiv = document.getElementById('cpm-update-status');
                        updateBtn.disabled = true;
                        updateBtn.textContent = '⏳ 확인 중...';
                        statusDiv.classList.remove('hidden');
                        statusDiv.innerHTML = '<p class="text-gray-400 text-sm">업데이트를 확인하고 있습니다...</p>';
                        try {
                            const updates = await SubPluginManager.checkAllUpdates();
                            if (updates.length === 0) {
                                statusDiv.innerHTML = '<p class="text-green-400 text-sm font-semibold bg-green-900/30 rounded p-3">✅ 모든 서브 플러그인이 최신 버전입니다.</p>';
                            } else {
                                // Store update data in a Map (not in HTML attributes) to avoid encoding issues
                                const pendingUpdates = new Map();
                                let html = `<div class="bg-indigo-900/30 rounded p-3 space-y-3">`;
                                html += `<p class="text-indigo-300 text-sm font-semibold">🔔 ${updates.length}개의 업데이트가 있습니다.</p>`;
                                for (const u of updates) {
                                    pendingUpdates.set(u.plugin.id, { code: u.code, name: u.plugin.name });
                                    const hasCode = !!u.code;
                                    html += `<div class="flex items-center justify-between bg-gray-800 rounded p-2">`;
                                    html += `<div><span class="text-white font-semibold">${u.plugin.icon || '🧩'} ${u.plugin.name}</span>`;
                                    html += `<span class="text-gray-400 text-xs ml-2">v${u.localVersion} → <span class="text-green-400">v${u.remoteVersion}</span></span></div>`;
                                    if (hasCode) {
                                        html += `<button class="cpm-apply-update bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded" data-id="${u.plugin.id}">⬆️ 업데이트</button>`;
                                    } else {
                                        html += `<span class="text-red-400 text-xs">⚠️ 코드 다운로드 실패</span>`;
                                    }
                                    html += `</div>`;
                                }
                                html += `</div>`;
                                statusDiv.innerHTML = html;
                                // Bind update apply buttons
                                statusDiv.querySelectorAll('.cpm-apply-update').forEach(btn => {
                                    btn.addEventListener('click', async (e) => {
                                        const id = e.target.getAttribute('data-id');
                                        const updateData = pendingUpdates.get(id);
                                        if (!updateData || !updateData.code) { e.target.textContent = '❌ 코드 없음'; return; }
                                        e.target.disabled = true;
                                        e.target.textContent = '⏳ 적용 중...';
                                        const ok = await SubPluginManager.applyUpdate(id, updateData.code);
                                        if (ok) {
                                            // Hot-reload: 즉시 적용 (새로고침 불필요)
                                            await SubPluginManager.hotReload(id);
                                            e.target.textContent = '✅ 완료';
                                            e.target.classList.replace('bg-green-600', 'bg-gray-600');
                                            pendingUpdates.delete(id);
                                            alert('업데이트 완료! 바로 적용되지만 새로고침을 권장합니다.');
                                        } else {
                                            e.target.textContent = '❌ 실패';
                                        }
                                    });
                                });
                            }
                        } catch (err) {
                            console.error('[CPM Update Check]', err);
                            statusDiv.innerHTML = '<p class="text-red-400 text-sm font-semibold bg-red-900/30 rounded p-3">❌ 업데이트 확인 중 오류가 발생했습니다.</p>';
                        }
                        updateBtn.disabled = false;
                        updateBtn.textContent = '🔄 업데이트 확인';
                    });
                }

                // Render dynamic UIs for enabled plugins if they registered to CupcakePM_SubPlugins
                window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
                for (const p of window.CupcakePM_SubPlugins) {
                    const uiContainer = document.getElementById(`plugin-ui-${p.id}`);
                    if (uiContainer) {
                        try {
                            if (p.uiHtml) uiContainer.innerHTML = p.uiHtml;
                            if (typeof p.onRender === 'function') p.onRender(uiContainer, safeGetArg, setVal);
                        } catch (err) {
                            console.error(`UI Error for ${p.id}:`, err);
                        }
                    }
                }
            };

            container.appendChild(sidebar);
            container.appendChild(content);
            document.body.appendChild(container);

            // Dynamically render provider tabs from registered sub-plugins
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

            // Render AFTER DOM is mounted so getElementById works
            renderPluginsTab();

            const mobileMenuBtn = document.getElementById('cpm-mobile-menu-btn');
            const mobileDropdown = document.getElementById('cpm-mobile-dropdown');
            const mobileIcon = document.getElementById('cpm-mobile-icon');

            if (mobileMenuBtn) {
                mobileMenuBtn.addEventListener('click', () => {
                    const isHidden = mobileDropdown.classList.contains('hidden');
                    if (isHidden) {
                        mobileDropdown.classList.remove('hidden');
                        mobileDropdown.classList.add('flex');
                        mobileIcon.innerText = '▲';
                    } else {
                        mobileDropdown.classList.add('hidden');
                        mobileDropdown.classList.remove('flex');
                        mobileIcon.innerText = '▼';
                    }
                });
            }

            const getActualId = (e) => e.target.id;

            content.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach(el => {
                el.addEventListener('change', (e) => setVal(getActualId(e), e.target.value));
            });

            content.querySelectorAll('input[type="checkbox"]').forEach(el => {
                el.addEventListener('change', (e) => setVal(getActualId(e), e.target.checked));
            });

            // Password visibility toggle (👁️ buttons)
            content.querySelectorAll('.cpm-pw-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const input = document.getElementById(btn.dataset.targetId);
                    if (!input) return;
                    if (input.type === 'password') {
                        input.type = 'text';
                        btn.textContent = '🔒';
                        btn.title = '비밀번호 숨기기';
                    } else {
                        input.type = 'password';
                        btn.textContent = '👁️';
                        btn.title = '비밀번호 보기';
                    }
                });
            });

            const tabs = sidebar.querySelectorAll('.tab-btn');

            tabs.forEach(t => t.addEventListener('click', () => {
                tabs.forEach(x => { x.classList.remove('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400'); });
                t.classList.add('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400');
                content.querySelectorAll('.cpm-tab-content').forEach(p => p.classList.add('hidden'));
                document.getElementById(t.dataset.target).classList.remove('hidden');

                // Re-render sub-plugins list whenever the tab is activated
                if (t.dataset.target === 'tab-plugins') {
                    renderPluginsTab();
                }

                // Auto collapse on mobile when a tab is newly selected
                if (window.innerWidth < 768 && mobileDropdown && !mobileDropdown.classList.contains('hidden')) {
                    mobileDropdown.classList.add('hidden');
                    mobileDropdown.classList.remove('flex');
                    mobileIcon.innerText = '▼';
                }
            }));

            tabs[0].click();

            // Streaming bridge capability check (async, update UI when done)
            (async () => {
                const statusEl = document.getElementById('cpm-stream-status');
                if (!statusEl) return;
                try {
                    const capable = await checkStreamCapability();
                    if (capable) {
                        statusEl.innerHTML = '<span class="text-emerald-400">✓ Bridge 지원됨</span> — ReadableStream 전송 가능. 스트리밍 활성화 시 실시간 표시가 동작합니다.';
                        statusEl.classList.remove('border-gray-600');
                        statusEl.classList.add('border-emerald-700');
                    } else {
                        statusEl.innerHTML = '<span class="text-yellow-400">✗ Bridge 미지원</span> — 현재 V3 bridge가 ReadableStream 전송을 지원하지 않습니다.<br/><span class="text-gray-500">스트리밍을 활성화해도 자동으로 문자열 수집 모드로 폴백됩니다. RisuAI factory.ts 업데이트 대기 중.</span>';
                        statusEl.classList.remove('border-gray-600');
                        statusEl.classList.add('border-yellow-800');
                    }
                } catch (e) {
                    statusEl.innerHTML = `<span class="text-red-400">Bridge 확인 실패:</span> ${e.message}`;
                }
            })();

            // Custom Models Manager Logic
            const cmList = document.getElementById('cpm-cm-list');
            const cmEditor = document.getElementById('cpm-cm-editor');
            const cmCount = document.getElementById('cpm-cm-count');

            const refreshCmList = () => {
                if (cmList.contains(cmEditor)) {
                    document.getElementById('tab-customs').appendChild(cmEditor);
                    cmEditor.classList.add('hidden');
                }
                cmCount.innerText = CUSTOM_MODELS_CACHE.length;
                if (CUSTOM_MODELS_CACHE.length === 0) {
                    cmList.innerHTML = '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded block">No custom models defined.</div>';
                    return;
                }
                cmList.innerHTML = CUSTOM_MODELS_CACHE.map((m, i) => `
                    <div class="bg-gray-800 border border-gray-700 rounded p-4 flex justify-between items-center group hover:border-gray-500 transition-colors">
                        <div>
                            <div class="font-bold text-white text-lg">${m.name || 'Unnamed Model'}${((m.key || '').trim().split(/\s+/).filter(k => k.length > 0).length > 1) ? ' <span class=\"text-xs text-blue-400 font-normal ml-2\">🔄 키회전</span>' : ''}</div>
                            <div class="text-xs text-gray-400 font-mono mt-1">${m.model || 'No model ID'} | ${m.url || 'No URL'}</div>
                        </div>
                        <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="bg-green-900/50 hover:bg-green-600 text-white px-3 py-1 rounded text-sm cpm-cm-export-btn" data-idx="${i}" title="Export this model (API key excluded)">📤 Export</button>
                            <button class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm cpm-cm-edit-btn" data-idx="${i}">✏️ Edit</button>
                            <button class="bg-red-900/50 hover:bg-red-600 text-white px-3 py-1 rounded text-sm cpm-cm-del-btn" data-idx="${i}">🗑️ Delete</button>
                        </div>
                    </div>
                `).join('');

                cmList.querySelectorAll('.cpm-cm-export-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const m = CUSTOM_MODELS_CACHE[idx];
                    if (!m) return;
                    // Strip API key for sharing safety
                    const exportModel = { ...m };
                    delete exportModel.key;
                    exportModel._cpmModelExport = true; // marker for import validation
                    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModel, null, 2));
                    const a = document.createElement('a');
                    a.href = dataStr;
                    a.download = `${(m.name || 'custom_model').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.cpm-model.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }));

                cmList.querySelectorAll('.cpm-cm-del-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    if (confirm('Delete this model?')) {
                        CUSTOM_MODELS_CACHE.splice(idx, 1);
                        Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        refreshCmList();
                    }
                }));

                cmList.querySelectorAll('.cpm-cm-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const m = CUSTOM_MODELS_CACHE[idx];
                    document.getElementById('cpm-cm-id').value = m.uniqueId;
                    document.getElementById('cpm-cm-name').value = m.name || '';
                    document.getElementById('cpm-cm-model').value = m.model || '';
                    document.getElementById('cpm-cm-url').value = m.url || '';
                    document.getElementById('cpm-cm-key').value = m.key || '';

                    document.getElementById('cpm-cm-format').value = m.format || 'openai';
                    document.getElementById('cpm-cm-tok').value = m.tok || 'o200k_base';
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

                    document.getElementById('cpm-cm-editor-title').innerText = 'Edit Custom Model';

                    const itemDiv = e.target.closest('.group');
                    if (itemDiv) itemDiv.after(cmEditor);

                    cmEditor.classList.remove('hidden');
                }));
            };

            // Import single model definition
            document.getElementById('cpm-import-model-btn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.multiple = true;
                input.onchange = async (e) => {
                    const files = Array.from(e.target.files);
                    if (files.length === 0) return;
                    let importedCount = 0;
                    let errorCount = 0;
                    for (const file of files) {
                        try {
                            const text = await file.text();
                            const data = JSON.parse(text);
                            if (!data._cpmModelExport || !data.name) {
                                errorCount++;
                                console.warn(`[CPM] Invalid model file: ${file.name}`);
                                continue;
                            }
                            // Assign a fresh uniqueId to avoid collision
                            data.uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                            delete data._cpmModelExport;
                            // Ensure no key is carried over
                            if (!data.key) data.key = '';
                            CUSTOM_MODELS_CACHE.push(data);
                            importedCount++;
                        } catch (err) {
                            errorCount++;
                            console.error(`[CPM] Failed to import ${file.name}:`, err);
                        }
                    }
                    if (importedCount > 0) {
                        Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        refreshCmList();
                    }
                    alert(`${importedCount}개 모델 가져오기 완료` + (errorCount > 0 ? ` (${errorCount}개 실패)` : '') + `\n\n불러온 모델의 API Key는 별도로 설정해주세요.`);
                };
                input.click();
            });

            document.getElementById('cpm-add-custom-btn').addEventListener('click', () => {
                document.getElementById('cpm-cm-id').value = 'custom_' + Date.now();
                document.getElementById('cpm-cm-name').value = '';
                document.getElementById('cpm-cm-model').value = '';
                document.getElementById('cpm-cm-url').value = '';
                document.getElementById('cpm-cm-key').value = '';

                document.getElementById('cpm-cm-format').value = 'openai';
                document.getElementById('cpm-cm-tok').value = 'o200k_base';
                document.getElementById('cpm-cm-thinking').value = 'none';
                document.getElementById('cpm-cm-thinking-budget').value = 0;
                document.getElementById('cpm-cm-prompt-cache-retention').value = 'none';
                document.getElementById('cpm-cm-reasoning').value = 'none';
                document.getElementById('cpm-cm-verbosity').value = 'none';
                document.getElementById('cpm-cm-effort').value = 'none';

                ['sysfirst', 'mergesys', 'altrole', 'mustuser', 'maxout', 'thought'].forEach(id => document.getElementById(`cpm-cm-${id}`).checked = false);
                document.getElementById('cpm-cm-streaming').checked = false;
                document.getElementById('cpm-cm-custom-params').value = '';

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
                const newModel = {
                    uniqueId: uid,
                    name: document.getElementById('cpm-cm-name').value,
                    model: document.getElementById('cpm-cm-model').value,
                    url: document.getElementById('cpm-cm-url').value,
                    key: document.getElementById('cpm-cm-key').value,
                    format: document.getElementById('cpm-cm-format').value,
                    tok: document.getElementById('cpm-cm-tok').value,
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

                const existingIdx = CUSTOM_MODELS_CACHE.findIndex(x => x.uniqueId === uid);
                if (existingIdx !== -1) {
                    CUSTOM_MODELS_CACHE[existingIdx] = { ...CUSTOM_MODELS_CACHE[existingIdx], ...newModel };
                } else {
                    CUSTOM_MODELS_CACHE.push(newModel);
                }

                Risu.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                refreshCmList();
                cmEditor.classList.add('hidden');
            });

            // API View button handler
            const _renderApiViewEntry = (r) => {
                if (!r) return '<div class="text-gray-500 text-center py-8">선택한 요청 데이터가 없습니다.</div>';
                const redactKey = (v) => {
                    if (!v || typeof v !== 'string') return v;
                    if (v.length <= 8) return '***';
                    return v.slice(0, 4) + '...' + v.slice(-4);
                };
                const redactHeaders = (headers) => {
                    const h = { ...headers };
                    for (const k of Object.keys(h)) {
                        if (/auth|key|token|secret|bearer/i.test(k)) h[k] = redactKey(h[k]);
                    }
                    return h;
                };
                const formatJson = (obj) => {
                    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
                };
                const statusColor = r.status >= 200 && r.status < 300 ? 'text-green-400' : (typeof r.status === 'number' ? 'text-red-400' : 'text-yellow-400');
                // Custom models have enriched HTTP details (url, requestHeaders, requestBody)
                // Sub-plugin providers only have basic info (body = {slot, temperature, ...})
                const hasHttpDetails = !!r.url;
                return `
                    <div class="space-y-3">
                        <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
                            <span class="text-gray-400">⏱️ ${new Date(r.timestamp).toLocaleString()}</span>
                            <span class="${statusColor} font-bold">Status: ${r.status || 'N/A'}</span>
                            <span class="text-gray-400">${r.duration ? r.duration + 'ms' : ''}</span>
                            ${hasHttpDetails ? `<span class="text-purple-300 font-mono text-xs break-all">${r.method || 'POST'} ${r.url}</span>` : ''}
                        </div>
                        ${hasHttpDetails ? `<details class="bg-gray-800 rounded p-3">
                            <summary class="cursor-pointer text-gray-300 font-semibold text-sm">📤 Request Headers</summary>
                            <pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap">${formatJson(redactHeaders(r.requestHeaders || {}))}</pre>
                        </details>` : ''}
                        <details class="bg-gray-800 rounded p-3">
                            <summary class="cursor-pointer text-gray-300 font-semibold text-sm">${hasHttpDetails ? '📤 Request Body' : '📊 Request Params'}</summary>
                            <pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-60 whitespace-pre-wrap">${formatJson(hasHttpDetails ? (r.requestBody || {}) : (r.body || {}))}</pre>
                        </details>
                        <details class="bg-gray-800 rounded p-3" open>
                            <summary class="cursor-pointer text-gray-300 font-semibold text-sm">📥 Response Body</summary>
                            <pre class="mt-2 text-xs text-gray-400 overflow-auto max-h-96 whitespace-pre-wrap">${typeof r.response === 'string' ? r.response : formatJson(r.response || 'No response captured')}</pre>
                        </details>
                    </div>
                `;
            };

            const _refreshApiViewPanel = () => {
                const content = document.getElementById('cpm-api-view-content');
                const selector = document.getElementById('cpm-api-view-selector');
                const allReqs = _getAllApiRequests();
                if (allReqs.length === 0) {
                    selector.innerHTML = '';
                    content.innerHTML = '<div class="text-gray-500 text-center py-8">아직 API 요청 기록이 없습니다.<br><span class="text-xs">채팅을 보내면 여기에 요청 정보가 표시됩니다. (모든 프로바이더 지원)</span></div>';
                    return;
                }
                // Populate selector dropdown
                const currentVal = selector.value;
                selector.innerHTML = allReqs.map((req, i) => {
                    const time = new Date(req.timestamp).toLocaleTimeString();
                    const model = req.modelName || '(unknown)';
                    const st = req.status || '...';
                    const label = `#${i + 1} [${st}] ${model} — ${time}`;
                    return `<option value="${req.id}"${i === 0 ? ' selected' : ''}>${label}</option>`;
                }).join('');
                // Restore selection if still valid, else show latest
                if (currentVal && allReqs.find(r => r.id === currentVal)) {
                    selector.value = currentVal;
                }
                const selectedId = selector.value;
                const selectedReq = _getApiRequestById(selectedId);
                content.innerHTML = _renderApiViewEntry(selectedReq);
            };

            document.getElementById('cpm-api-view-btn').addEventListener('click', () => {
                const panel = document.getElementById('cpm-api-view-panel');
                if (!panel.classList.contains('hidden')) {
                    panel.classList.add('hidden');
                    return;
                }
                _refreshApiViewPanel();
                panel.classList.remove('hidden');
            });

            document.getElementById('cpm-api-view-selector').addEventListener('change', (e) => {
                const selectedId = e.target.value;
                const selectedReq = _getApiRequestById(selectedId);
                const content = document.getElementById('cpm-api-view-content');
                content.innerHTML = _renderApiViewEntry(selectedReq);
            });

            document.getElementById('cpm-api-view-close').addEventListener('click', () => {
                document.getElementById('cpm-api-view-panel').classList.add('hidden');
            });

            // initialize list
            refreshCmList();

            // Take a full snapshot of current settings for backup
            await SettingsBackup.snapshotAll();

            // Export Functionality
            document.getElementById('cpm-export-btn').addEventListener('click', async () => {
                const auxKeys = ['translation', 'emotion', 'memory', 'other'].flatMap(s => [
                    `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
                    `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
                    `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
                ]);
                const settingKeys = [
                    ...auxKeys,
                    'cpm_enable_chat_resizer',
                    'cpm_custom_models',
                    // Global Fallback Parameters
                    'cpm_fallback_temp', 'cpm_fallback_max_tokens', 'cpm_fallback_top_p', 'cpm_fallback_freq_pen', 'cpm_fallback_pres_pen',
                    // Dynamically include provider export keys from registered tabs
                    ...registeredProviderTabs.flatMap(tab => tab.exportKeys || [])
                ];

                const exportData = {};
                for (const key of settingKeys) {
                    const val = await safeGetArg(key);
                    if (val !== undefined && val !== '') exportData[key] = val;
                }

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "cupcake_pm_settings.json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            });

            // Import Functionality
            document.getElementById('cpm-import-btn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const importedData = JSON.parse(event.target.result);
                            for (const [key, value] of Object.entries(importedData)) {
                                setVal(key, value);
                                const el = document.getElementById(key);
                                if (el) {
                                    if (el.type === 'checkbox') {
                                        el.checked = (value === true || String(value).toLowerCase() === 'true');
                                    } else {
                                        el.value = value;
                                    }
                                }
                            }
                            alert('설정을 성공적으로 불러왔습니다! UI를 갱신합니다.');
                            openCpmSettings(); // 설정 패널 재렌더링
                        } catch (err) {
                            alert('설정 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            document.getElementById('cpm-close-btn').addEventListener('click', () => {
                document.body.innerHTML = '';
                Risu.hideContainer();
            });
        };

        await Risu.registerSetting(
            `v${CPM_VERSION}`,
            openCpmSettings,
            '🧁',
            'html'
        );

        if (!window.cpmShortcutRegistered) {
            window.cpmShortcutRegistered = true;
            try {
                const rootDoc = await Risu.getRootDocument();
                // Keyboard shortcut is preserved
                await rootDoc.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
                        openCpmSettings();
                    }
                });

                // Simultaneous 4-finger touch gesture for mobile
                // RisuAI SafeElement strips e.pointerId, so we use a concurrent active down-count approach
                let activePointersCount = 0;
                let activePointersTimer = null;

                const addPointer = () => {
                    activePointersCount++;
                    if (activePointersCount >= 4) {
                        openCpmSettings();
                        activePointersCount = 0; // Reset immediately
                    }
                    // If a touch isn't lifted correctly, reset the counter after a short timeout
                    if (activePointersTimer) clearTimeout(activePointersTimer);
                    activePointersTimer = setTimeout(() => {
                        activePointersCount = 0;
                    }, 500);
                };

                const removePointer = () => {
                    activePointersCount = Math.max(0, activePointersCount - 1);
                };

                await rootDoc.addEventListener('pointerdown', addPointer);
                await rootDoc.addEventListener('pointerup', removePointer);
                await rootDoc.addEventListener('pointercancel', removePointer);

            } catch (err) {
                console.error('[CPM] Hotkey registration failed:', err);
            }
        }

        // Inline Resizer Sub-plugin removed. Handled cleanly by dynamic Sub-Plugins Loader.

    } catch (e) { console.error('[CPM] init fail', e); }
})();
