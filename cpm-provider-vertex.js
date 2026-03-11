//@name CPM Provider - Vertex AI
//@version 1.6.4
//@description Google Vertex AI (Service Account) provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🔷
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-vertex.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-Vertex] CupcakePM API not found!'); return; }

    // Shared Gemini model IDs available on Vertex
    const GEMINI_MODELS = [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];
    const VERTEX_ONLY_MODELS = [
        { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
    ];
    const CLAUDE_ON_VERTEX = [
        { baseId: "claude-haiku-4-5", date: "20251001", name: "Claude 4.5 Haiku", displayDate: "2025/10/01" },
        { baseId: "claude-sonnet-4", date: "20250514", name: "Claude 4 Sonnet", displayDate: "2025/05/14" },
        { baseId: "claude-sonnet-4-5", date: "20250929", name: "Claude 4.5 Sonnet", displayDate: "2025/09/29" },
        // BUG-A4 FIX: Add Claude 4.6 models (adaptive thinking support)
        { baseId: "claude-sonnet-4-6", date: "20260301", name: "Claude 4.6 Sonnet", displayDate: "2026/03/01" },
        { baseId: "claude-opus-4-1", date: "20250805", name: "Claude 4.1 Opus", displayDate: "2025/08/05" },
        { baseId: "claude-opus-4-5", date: "20251101", name: "Claude 4.5 Opus", displayDate: "2025/11/01" },
        // BUG-A4 FIX: Add Claude 4.6 Opus
        { baseId: "claude-opus-4-6", date: "20260301", name: "Claude 4.6 Opus", displayDate: "2026/03/01" },
    ];

    const models = [];
    GEMINI_MODELS.forEach(m => models.push({ uniqueId: `vertex-${m.id}`, id: m.id, name: m.name }));
    VERTEX_ONLY_MODELS.forEach(m => models.push({ uniqueId: `vertex-${m.id}`, id: m.id, name: m.name }));
    CLAUDE_ON_VERTEX.forEach(m => models.push({
        uniqueId: `vertex-${m.baseId}`,
        id: `${m.baseId}@${m.date}`,
        name: `${m.name} (${m.displayDate})`
    }));

    // Vertex OAuth token helper (uses Service Account JSON key)
    // Per-credential token cache (keyed by client_email) for multi-key rotation
    const _tokenCaches = {};

    function looksLikeWindowsPath(raw) {
        const trimmed = (raw || '').trim();
        return /^[A-Za-z]:\\/.test(trimmed) || /^\\\\[^\\]/.test(trimmed);
    }

    function parseVertexKeyJson(keyJson) {
        const trimmed = (keyJson || '').trim();
        if (!trimmed) throw new Error('Vertex Service Account JSON 키가 비어 있습니다.');
        if (looksLikeWindowsPath(trimmed)) {
            throw new Error('Vertex Service Account JSON 키 입력란에는 파일 경로가 아니라 JSON 본문 전체를 붙여넣어야 합니다.');
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('JSON 객체 형식이어야 합니다.');
            }
            return parsed;
        } catch (error) {
            if (/Bad Unicode escape/i.test(error.message || '')) {
                throw new Error('Vertex Service Account JSON 파싱 오류: Windows 경로를 넣었거나 역슬래시(\\)가 이스케이프되지 않았습니다. 파일 경로가 아니라 JSON 본문을 붙여넣으세요.');
            }
            throw new Error(`Vertex Service Account JSON 파싱 오류: ${error.message}`);
        }
    }

    async function getVertexAccessToken(keyJson) {
        const key = parseVertexKeyJson(keyJson);
        const cacheKey = key.client_email || 'default';
        const cache = _tokenCaches[cacheKey] || { token: null, expiry: 0 };
        const now = Math.floor(Date.now() / 1000);
        if (cache.token && cache.expiry > now + 60) return cache.token;
        const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
        const claims = btoa(JSON.stringify({
            iss: key.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now, exp: now + 3600
        })).replace(/=+$/, '');
        const unsignedToken = `${header}.${claims}`;
        const binaryKey = atob(key.private_key.replace(/-----BEGIN .*?-----/g, '').replace(/-----END .*?-----/g, '').replace(/\s/g, ''));
        const bytes = new Uint8Array(binaryKey.length);
        for (let i = 0; i < binaryKey.length; i++) bytes[i] = binaryKey.charCodeAt(i);
        // Use .slice(0) to create an owned ArrayBuffer copy.
        // WebKit (iOS/Safari) can fail with shared ArrayBuffer references in importKey.
        const keyBuffer = bytes.buffer.slice(0);
        const privateKey = await crypto.subtle.importKey('pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));
        const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const jwt = `${unsignedToken}.${sigB64}`;

        // Vertex OAuth token exchange stability:
        // 1) Prefer nativeFetch with Uint8Array body (most reliable in V3 bridge)
        // 2) Fall back to smartNativeFetch only when nativeFetch throws
        const tokenBody = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
        const encodedTokenBody = new TextEncoder().encode(tokenBody);
        const Risu = (window.Risuai || window.risuai);
        let res;
        try {
            res = await Risu.nativeFetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: encodedTokenBody
            });
        } catch (_nativeErr) {
            const _fetchFn = typeof CPM.smartNativeFetch === 'function'
                ? CPM.smartNativeFetch
                : Risu.nativeFetch;
            res = await _fetchFn('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: encodedTokenBody
            });
        }
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        _tokenCaches[cacheKey] = { token: data.access_token, expiry: now + data.expires_in };
        return data.access_token;
    }

    function invalidateTokenCache(keyJson) {
        try {
            const key = parseVertexKeyJson(keyJson);
            const cacheKey = key.client_email || 'default';
            delete _tokenCaches[cacheKey];
        } catch (_) {}
    }

    const Risu = (window.Risuai || window.risuai);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function encodeRequestBody(body) {
        return typeof body === 'string' ? new TextEncoder().encode(body) : body;
    }

    async function vertexFetch(url, options = {}) {
        const nativeFetch = Risu?.nativeFetch;
        const smartFetch = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : nativeFetch;

        if (typeof nativeFetch === 'function') {
            try {
                const nativeOptions = { ...options };
                if (nativeOptions.body !== undefined) nativeOptions.body = encodeRequestBody(nativeOptions.body);
                const nativeRes = await nativeFetch(url, nativeOptions);
                if (nativeRes && (nativeRes.ok || (nativeRes.status && nativeRes.status !== 0))) {
                    return nativeRes;
                }
                console.warn(`[CPM-Vertex] nativeFetch returned unusable response (${nativeRes?.status || 'unknown'}), falling back.`);
            } catch (e) {
                console.warn(`[CPM-Vertex] nativeFetch failed, falling back: ${e.message}`);
            }
        }

        if (typeof smartFetch === 'function') {
            return await smartFetch(url, options);
        }
        return await fetch(url, options);
    }

    CPM.registerProvider({
        name: 'VertexAI',
        models,
        fetchDynamicModels: async () => {
            try {
                // Use pickJsonKey for key rotation support
                let keyJson;
                if (typeof CPM.pickJsonKey === 'function') {
                    keyJson = await CPM.pickJsonKey('cpm_vertex_key_json');
                }
                if (!keyJson) keyJson = await CPM.safeGetArg('cpm_vertex_key_json');
                if (!keyJson) return null;
                const loc = await CPM.safeGetArg('cpm_vertex_location') || 'global';
                const accessToken = await getVertexAccessToken(keyJson);
                const key = parseVertexKeyJson(keyJson);
                const project = key.project_id;
                const baseUrl = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;

                // Fetch Gemini models from Vertex
                let allModels = [];
                let pageToken = null;
                let _pageCount = 0;
                const MAX_PAGES = 50;
                while (_pageCount < MAX_PAGES) {
                    _pageCount++;
                    let url = `${baseUrl}/v1/publishers/google/models?pageSize=100`;
                    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
                    const res = await CPM.smartFetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (!res.ok) break;
                    const data = await res.json();
                    if (data.models) allModels = allModels.concat(data.models);
                    if (!data.nextPageToken) break;
                    pageToken = data.nextPageToken;
                }

                const result = [];
                // Process Gemini models
                for (const m of allModels) {
                    const id = (m.name || '').split('/').pop();
                    if (!id) continue;
                    // Only include gemini models that support generateContent
                    if (!id.startsWith('gemini-')) continue;
                    if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue;
                    result.push({
                        uniqueId: `vertex-${id}`,
                        id: id,
                        name: m.displayName || id
                    });
                }

                // Also list Claude models available via Vertex (Model Garden)
                // These use a different endpoint pattern
                try {
                    const claudeUrl = `${baseUrl}/v1/projects/${project}/locations/${loc}/publishers/anthropic/models`;
                    const claudeRes = await CPM.smartFetch(claudeUrl, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (claudeRes.ok) {
                        const claudeData = await claudeRes.json();
                        if (claudeData.models) {
                            for (const m of claudeData.models) {
                                const id = (m.name || '').split('/').pop();
                                if (!id || !id.startsWith('claude-')) continue;
                                let name = m.displayName || id;
                                const dateMatch = id.match(/(\d{4})(\d{2})(\d{2})/);
                                if (dateMatch && !name.includes('/')) name += ` (${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]})`;
                                result.push({
                                    uniqueId: `vertex-${id}`,
                                    id: id,
                                    name: name
                                });
                            }
                        }
                    }
                } catch (ce) {
                    console.warn('[CPM-Vertex] Claude model listing not available:', ce.message);
                }

                return result.length > 0 ? result : null;
            } catch (e) {
                console.warn('[CPM-Vertex] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);
            const config = {
                location: await CPM.safeGetArg('cpm_vertex_location'),
                model: await CPM.safeGetArg('cpm_vertex_model') || modelDef.id,
                thinking: await CPM.safeGetArg('cpm_vertex_thinking_level'),
                thinkingBudget: await CPM.safeGetArg('cpm_vertex_thinking_budget'),
                claudeThinkingBudget: await CPM.safeGetArg('cpm_vertex_claude_thinking_budget'),
                preserveSystem: await CPM.safeGetBoolArg('chat_vertex_preserveSystem', true),
                showThoughtsToken: await CPM.safeGetBoolArg('chat_vertex_showThoughtsToken'),
                useThoughtSignature: await CPM.safeGetBoolArg('chat_vertex_useThoughtSignature'),
            };

            // Key Rotation: wrap all fetch logic in doFetch(keyJson) for automatic credential rotation
            const doFetch = async (keyJson) => {
                // Reset fallback flag per doFetch call so key rotation retries get fresh attempts
                config._triedFallback = false;
                if (!keyJson) return { success: false, content: '[Vertex] No Service Account JSON key provided.' };
                let project;
                try { project = parseVertexKeyJson(keyJson).project_id; } catch (e) { return { success: false, content: `[Vertex] JSON 파싱 오류: ${e.message}` }; }
                const loc = config.location || 'global';
                const model = config.model || 'gemini-2.5-flash';
                let accessToken;
                try { accessToken = await getVertexAccessToken(keyJson); } catch (e) { return { success: false, content: `[Vertex] 토큰 발급 오류: ${e.message}`, _status: 401 }; }
                const baseUrl = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
                const isClaude = model.startsWith('claude-');

                const executeRequest = async (requestUrl, requestOptions, { retryAuth = false, label = 'Vertex', maxAttempts = 3 } = {}) => {
                    let attempt = 0;
                    let response;

                    while (attempt < maxAttempts) {
                        response = await vertexFetch(requestUrl, requestOptions);
                        if (response.ok) return response;

                        const status = response.status || 0;
                        if (retryAuth && (status === 401 || status === 403) && attempt < maxAttempts - 1) {
                            response.body?.cancel?.();
                            invalidateTokenCache(keyJson);
                            try {
                                accessToken = await getVertexAccessToken(keyJson);
                                requestOptions = {
                                    ...requestOptions,
                                    headers: { ...(requestOptions.headers || {}), 'Authorization': `Bearer ${accessToken}` }
                                };
                                console.warn(`[CPM-Vertex] ${label} auth retry ${attempt + 1}/${maxAttempts - 1}`);
                                attempt++;
                                continue;
                            } catch (refreshErr) {
                                console.warn(`[CPM-Vertex] ${label} auth refresh failed: ${refreshErr.message}`);
                                return response;
                            }
                        }

                        const retriable = status === 408 || status === 429 || status >= 500;
                        if (!retriable || attempt >= maxAttempts - 1) {
                            return response;
                        }

                        response.body?.cancel?.();
                        attempt++;
                        console.warn(`[CPM-Vertex] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status}`);
                        await sleep(700 * attempt);
                    }

                    return response;
                };

                // Safety: clamp maxTokens based on model type
                if (isClaude) {
                    const _VTX_CLAUDE_MAX = 128000;
                    if (typeof maxTokens === 'number' && maxTokens > _VTX_CLAUDE_MAX) {
                        console.warn(`[CPM-Vertex] max_tokens ${maxTokens} → clamped to ${_VTX_CLAUDE_MAX} for Claude (API limit)`);
                        maxTokens = _VTX_CLAUDE_MAX;
                    }
                } else {
                    const _vtxGemMax = /gemini-(?:[3-9]|2\.[5-9])/.test(model) ? 65536 : 8192;
                    if (typeof maxTokens === 'number' && maxTokens > _vtxGemMax) {
                        console.warn(`[CPM-Vertex] maxOutputTokens ${maxTokens} → clamped to ${_vtxGemMax} for ${model} (API limit)`);
                        maxTokens = _vtxGemMax;
                    }
                }

                if (isClaude) {
                    // ── Claude on Vertex (Model Garden) ──
                    const claudeEndpoint = streamingEnabled ? 'streamRawPredict' : 'rawPredict';
                    const url = `${baseUrl}/v1/projects/${project}/locations/${loc}/publishers/anthropic/models/${model}:${claudeEndpoint}`;
                    const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages, config);
                    const body = {
                        anthropic_version: 'vertex-2023-10-16',
                        model: model,
                        max_tokens: maxTokens,
                        temperature: temp,
                        messages: formattedMsgs,
                        stream: streamingEnabled,
                    };
                    if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                    if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
                    if (systemPrompt) body.system = systemPrompt;

                    // BUG-C2 FIX: Add adaptive thinking support for Claude 4.6 on Vertex
                    // Claude 4.6 models use adaptive thinking (type: 'adaptive') + output_config.effort
                    // Older models use budget-based thinking (type: 'enabled') with budget_tokens
                    const VERTEX_ADAPTIVE_PATTERNS = ['claude-opus-4-6', 'claude-sonnet-4-6'];
                    const VERTEX_EFFORT_OPTIONS = ['low', 'medium', 'high', 'max'];
                    const vertexClaudeEffort = await CPM.safeGetArg('cpm_vertex_claude_effort');
                    const isVertexAdaptive = VERTEX_ADAPTIVE_PATTERNS.some(p => model.includes(p));

                    // BUG-3 FIX: Only enter adaptive path when effort is explicitly set.
                    // Budget-only on 4.6 models should use budget-based path (type: 'enabled').
                    if (isVertexAdaptive && vertexClaudeEffort) {
                        // Claude 4.6: adaptive thinking
                        body.thinking = { type: 'adaptive' };
                        const effort = VERTEX_EFFORT_OPTIONS.includes(vertexClaudeEffort)
                            ? vertexClaudeEffort : 'high';
                        body.output_config = { effort };
                        delete body.temperature;
                        delete body.top_k;
                        delete body.top_p;
                    } else {
                        // Legacy models: budget-based thinking
                        const budget = parseInt(config.claudeThinkingBudget) || 0;
                        if (budget > 0) {
                            body.thinking = { type: 'enabled', budget_tokens: budget };
                            if (body.max_tokens <= budget) body.max_tokens = budget + 4096;
                            delete body.temperature;
                            delete body.top_k;
                            delete body.top_p;
                        }
                    }

                    // Add beta headers for Vertex Claude when needed
                    const claudeHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
                    const claudeBetas = [];
                    if (body.max_tokens > 8192) claudeBetas.push('output-128k-2025-02-19');
                    if (claudeBetas.length > 0) claudeHeaders['anthropic-beta'] = claudeBetas.join(',');

                    const requestBody = JSON.stringify(body);
                    console.log(`[CPM-Vertex] Request path: provider=claude, streaming=${streamingEnabled}, url=${url}`);
                    let res = await executeRequest(url, {
                        method: 'POST',
                        headers: claudeHeaders,
                        body: requestBody,
                        signal: abortSignal
                    }, { retryAuth: true, label: 'Vertex Claude' });
                    if (!res.ok) {
                        if (res.status === 401 || res.status === 403) invalidateTokenCache(keyJson);
                        return { success: false, content: `[Vertex Claude Error ${res.status}] ${await res.text()}`, _status: res.status };
                    }

                    if (streamingEnabled) {
                        if (!res.body || typeof res.body.getReader !== 'function') {
                            console.warn('[CPM-Vertex] Claude streaming response has no readable body; retrying as non-streaming.');
                            const nonStreamUrl = `${baseUrl}/v1/projects/${project}/locations/${loc}/publishers/anthropic/models/${model}:rawPredict`;
                            console.log(`[CPM-Vertex] Claude stream fallback path: ${nonStreamUrl}`);
                            res = await executeRequest(nonStreamUrl, {
                                method: 'POST',
                                headers: { ...claudeHeaders, 'Authorization': `Bearer ${accessToken}` },
                                body: requestBody,
                                signal: abortSignal
                            }, { retryAuth: true, label: 'Vertex Claude fallback' });
                            if (!res.ok) {
                                if (res.status === 401 || res.status === 403) invalidateTokenCache(keyJson);
                                return { success: false, content: `[Vertex Claude Error ${res.status}] ${await res.text()}`, _status: res.status };
                            }

                            const data = await res.json();
                            if (typeof CPM.parseClaudeNonStreamingResponse === 'function') {
                                return CPM.parseClaudeNonStreamingResponse(data, {}, _reqId);
                            }
                            let fallbackOut = '';
                            let fbThinking = false;
                            if (Array.isArray(data.content)) {
                                for (const block of data.content) {
                                    if (block.type === 'thinking' && block.thinking) {
                                        if (!fbThinking) { fbThinking = true; fallbackOut += '<Thoughts>\n'; }
                                        fallbackOut += block.thinking;
                                    } else if (block.type === 'redacted_thinking') {
                                        if (!fbThinking) { fbThinking = true; fallbackOut += '<Thoughts>\n'; }
                                        fallbackOut += '\n{{redacted_thinking}}\n';
                                    } else if (block.type === 'text') {
                                        if (fbThinking) { fbThinking = false; fallbackOut += '</Thoughts>\n\n'; }
                                        fallbackOut += block.text;
                                    }
                                }
                            }
                            if (fbThinking) fallbackOut += '</Thoughts>\n\n';
                            return { success: !!fallbackOut, content: fallbackOut || '[Vertex Claude] Empty response' };
                        }

                        return { success: true, content: CPM.createAnthropicSSEStream(res, abortSignal, _reqId) };
                    } else {
                        // Non-streaming: parse JSON response
                        const data = await res.json();
                        if (typeof CPM.parseClaudeNonStreamingResponse === 'function') {
                            return CPM.parseClaudeNonStreamingResponse(data, {}, _reqId);
                        }
                        // Fallback: extract text + thinking directly (state-tracked)
                        let fallbackOut = '';
                        let fbThinking = false;
                        if (Array.isArray(data.content)) {
                            for (const block of data.content) {
                                if (block.type === 'thinking' && block.thinking) {
                                    if (!fbThinking) { fbThinking = true; fallbackOut += '<Thoughts>\n'; }
                                    fallbackOut += block.thinking;
                                } else if (block.type === 'redacted_thinking') {
                                    if (!fbThinking) { fbThinking = true; fallbackOut += '<Thoughts>\n'; }
                                    fallbackOut += '\n{{redacted_thinking}}\n';
                                } else if (block.type === 'text') {
                                    if (fbThinking) { fbThinking = false; fallbackOut += '</Thoughts>\n\n'; }
                                    fallbackOut += block.text;
                                }
                            }
                        }
                        if (fbThinking) fallbackOut += '</Thoughts>\n\n';
                        return { success: !!fallbackOut, content: fallbackOut || '[Vertex Claude] Empty response' };
                    }
                }

                // ── Gemini models ──
                const streamUrl = `${baseUrl}/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
                const nonStreamUrl = `${baseUrl}/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:generateContent`;
                const url = streamingEnabled ? streamUrl : nonStreamUrl;

                const { contents, systemInstruction: sys } = CPM.formatToGemini(messages, config);
                const body = { contents, generationConfig: { temperature: temp, maxOutputTokens: maxTokens } };
                if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
                if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
                if (sys.length > 0) body.systemInstruction = { parts: sys.map(text => ({ text })) };
                if (typeof CPM.buildGeminiThinkingConfig === 'function') {
                    const _tc = CPM.buildGeminiThinkingConfig(model, config.thinking, config.thinkingBudget, true);
                    if (_tc) body.generationConfig.thinkingConfig = _tc;
                } else if (config.thinking && config.thinking !== 'off' && config.thinking !== 'none') {
                    body.generationConfig.thinkingConfig = { includeThoughts: true, thinkingLevel: String(config.thinking).toUpperCase() };
                }

                // Safety settings: model-aware OFF vs BLOCK_NONE (aligned with RisuAI-main)
                if (typeof CPM.getGeminiSafetySettings === 'function') {
                    body.safetySettings = CPM.getGeminiSafetySettings(model);
                }
                // Validate and clamp parameters
                if (typeof CPM.validateGeminiParams === 'function') {
                    CPM.validateGeminiParams(body.generationConfig);
                }
                // Strip unsupported params for experimental models
                if (typeof CPM.cleanExperimentalModelParams === 'function') {
                    CPM.cleanExperimentalModelParams(body.generationConfig, model);
                }
                // Vertex AI: strip thought:true from historical parts for thinking models
                // Vertex may reject requests with thought:true in historical message parts.
                // Aligned with LBI pre36 (L10308-10316)
                const isThinkingModel = model && (model.includes('gemini-2.5') || model.includes('gemini-3'));
                if (isThinkingModel && body.contents) {
                    body.contents = body.contents.map(content => ({
                        ...content,
                        parts: content.parts.map(part => {
                            const { thought, ...rest } = part;
                            return rest;
                        }),
                    }));
                }

                const requestBody = JSON.stringify(body);
                console.log(`[CPM-Vertex] Request path: provider=gemini, streaming=${streamingEnabled}, url=${url}`);
                let res = await executeRequest(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                    body: requestBody,
                    signal: abortSignal
                }, { retryAuth: true, label: 'Vertex Gemini' });
                if (!res.ok) {
                    const errText = await res.text();
                    if (res.status === 401 || res.status === 403) invalidateTokenCache(keyJson);

                    // Location fallback: try alternate locations on 404/region errors
                    const FALLBACK_LOCATIONS = ['us-central1', 'us-east4', 'europe-west1', 'asia-northeast1'];
                    if ((res.status === 404 || res.status === 400) && !config._triedFallback) {
                        config._triedFallback = true;
                        for (const fallbackLoc of FALLBACK_LOCATIONS) {
                            if (fallbackLoc === loc) continue;
                            const fbBaseUrl = `https://${fallbackLoc}-aiplatform.googleapis.com`;
                            const fbUrl = `${fbBaseUrl}/v1/projects/${project}/locations/${fallbackLoc}/publishers/google/models/${model}:${streamingEnabled ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
                            try {
                                const fbRes = await executeRequest(fbUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                                    body: requestBody,
                                    signal: abortSignal
                                }, { retryAuth: true, label: `Vertex Gemini ${fallbackLoc}` });
                                if (fbRes.ok) {
                                    console.log(`[CPM-Vertex] Fallback to ${fallbackLoc} succeeded`);
                                    if (streamingEnabled) {
                                        if (!fbRes.body || typeof fbRes.body.getReader !== 'function') {
                                            const fbNonStreamUrl = `${fbBaseUrl}/v1/projects/${project}/locations/${fallbackLoc}/publishers/google/models/${model}:generateContent`;
                                            const fbNonStreamRes = await executeRequest(fbNonStreamUrl, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                                                body: requestBody,
                                                signal: abortSignal
                                            }, { retryAuth: true, label: `Vertex Gemini ${fallbackLoc} fallback` });
                                            if (!fbNonStreamRes.ok) {
                                                return { success: false, content: `[Vertex Error ${fbNonStreamRes.status}] ${await fbNonStreamRes.text()}`, _status: fbNonStreamRes.status };
                                            }
                                            const fbData = await fbNonStreamRes.json();
                                            return CPM.parseGeminiNonStreamingResponse(fbData, config, _reqId);
                                        }

                                        // BUG-D2 FIX: onComplete for fallback path too
                                        const _fbOnComplete = typeof CPM.saveThoughtSignatureFromStream === 'function'
                                            ? () => CPM.saveThoughtSignatureFromStream(config, _reqId) : undefined;
                                        return { success: true, content: CPM.createSSEStream(fbRes, (line) => CPM.parseGeminiSSELine(line, config), abortSignal, _fbOnComplete, _reqId) };
                                    } else {
                                        const fbData = await fbRes.json();
                                        return CPM.parseGeminiNonStreamingResponse(fbData, config, _reqId);
                                    }
                                }
                            } catch (fbErr) {
                                console.warn(`[CPM-Vertex] Fallback ${fallbackLoc} failed:`, fbErr.message);
                            }
                        }
                    }

                    return { success: false, content: `[Vertex Error ${res.status}] ${errText}`, _status: res.status };
                }

                if (streamingEnabled) {
                    if (!res.body || typeof res.body.getReader !== 'function') {
                        console.warn('[CPM-Vertex] Gemini streaming response has no readable body; retrying as non-streaming.');
                        console.log(`[CPM-Vertex] Gemini stream fallback path: ${nonStreamUrl}`);
                        const fallbackRes = await executeRequest(nonStreamUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                            body: requestBody,
                            signal: abortSignal
                        }, { retryAuth: true, label: 'Vertex Gemini fallback' });
                        if (!fallbackRes.ok) {
                            return { success: false, content: `[Vertex Error ${fallbackRes.status}] ${await fallbackRes.text()}`, _status: fallbackRes.status };
                        }
                        const data = await fallbackRes.json();
                        return CPM.parseGeminiNonStreamingResponse(data, config, _reqId);
                    }

                    // BUG-D2 FIX: Pass onComplete for thought signature + token usage capture
                    const _onComplete = typeof CPM.saveThoughtSignatureFromStream === 'function'
                        ? () => CPM.saveThoughtSignatureFromStream(config, _reqId) : undefined;
                    return { success: true, content: CPM.createSSEStream(res, (line) => CPM.parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
                } else {
                    const data = await res.json();
                    return CPM.parseGeminiNonStreamingResponse(data, config, _reqId);
                }
            };

            // Use JSON key rotation if available, otherwise fall back to single key
            if (typeof CPM.withJsonKeyRotation === 'function') {
                return CPM.withJsonKeyRotation('cpm_vertex_key_json', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_vertex_key_json');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-vertex',
            icon: '🔷',
            label: 'Vertex AI',
            exportKeys: ['cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_thinking_level', 'cpm_vertex_thinking_budget', 'cpm_vertex_claude_thinking_budget', 'cpm_vertex_claude_effort', 'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature', 'cpm_dynamic_vertexai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">Vertex AI Configuration (설정)</h3>
                    ${await renderInput('cpm_vertex_key_json', 'Service Account JSON Key (JSON 키 본문, 파일 경로 아님 - 여러 개 입력 시 쉼표로 구분, 자동 키회전)', 'textarea')}
                    ${await renderInput('cpm_vertex_location', 'Location Endpoint (리전 엔드포인트 ex: global, us-central1)')}
                    ${await renderInput('cpm_dynamic_vertexai', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_vertex_thinking_level', 'Thinking Level (생각 수준 - Gemini 3용)', 'select', lists.thinkingList)}
                    ${await renderInput('cpm_vertex_thinking_budget', 'Thinking Budget Tokens (생각 토큰 예산 - Gemini 2.5용, 0은 끄기)', 'number')}
                    <hr class="my-4 border-gray-700">
                    <h4 class="text-xl font-semibold text-orange-400 mb-3">Claude on Vertex (Model Garden)</h4>
                    ${await renderInput('cpm_vertex_claude_thinking_budget', 'Claude Thinking Budget Tokens (4.5 이하 모델용, 0은 끄기)', 'number')}
                    ${await renderInput('cpm_vertex_claude_effort', 'Adaptive Thinking Effort (4.6 모델용: low/medium/high/max)')}
                    <hr class="my-4 border-gray-700">
                    ${await renderInput('chat_vertex_preserveSystem', 'Preserve System (시스템 프롬프트 보존)', 'checkbox')}
                    ${await renderInput('chat_vertex_showThoughtsToken', 'Show Thoughts Token Info (생각 토큰 알림 표시)', 'checkbox')}
                    ${await renderInput('chat_vertex_useThoughtSignature', 'Use Thought Signature (생각 서명 추출 사용)', 'checkbox')}
                `;
            }
        }
    });
})();
