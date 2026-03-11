//@name CPM Provider - OpenAI
//@version 1.5.7
//@description OpenAI provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🟢
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-openai.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-OpenAI] CupcakePM API not found!'); return; }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const parseRetryAfterMs = (headers) => {
        const raw = headers?.get?.('retry-after');
        if (!raw) return 0;
        const seconds = Number(raw);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.max(0, Math.floor(seconds * 1000));
        const retryAt = Date.parse(raw);
        if (Number.isNaN(retryAt)) return 0;
        return Math.max(0, retryAt - Date.now());
    };
    const isRetriableStatus = (status) => status === 408 || status === 429 || status >= 500;

    CPM.registerProvider({
        name: 'OpenAI',
        models: [
            { uniqueId: 'openai-gpt-4.1-2025-04-14', id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1 (2025/04/14)' },
            { uniqueId: 'openai-chatgpt-4o-latest', id: 'chatgpt-4o-latest', name: 'ChatGPT-4o (Latest)' },
            { uniqueId: 'openai-gpt-5-2025-08-07', id: 'gpt-5-2025-08-07', name: 'gpt-5 (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-mini-2025-08-07', id: 'gpt-5-mini-2025-08-07', name: 'gpt-5-mini (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-nano-2025-08-07', id: 'gpt-5-nano-2025-08-07', name: 'gpt-5-nano (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-chat-latest', id: 'gpt-5-chat-latest', name: 'gpt-5-chat (Latest)' },
            { uniqueId: 'openai-gpt-5.1-2025-11-13', id: 'gpt-5.1-2025-11-13', name: 'GPT-5.1 (2025/11/13)' },
            { uniqueId: 'openai-gpt-5.1-chat-latest', id: 'gpt-5.1-chat-latest', name: 'GPT-5.1 Chat (Latest)' },
            { uniqueId: 'openai-gpt-5.2-2025-12-11', id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2 (2025/12/11)' },
            { uniqueId: 'openai-gpt-5.2-chat-latest', id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Chat (Latest)' },
            { uniqueId: 'openai-gpt-5.3-chat-latest', id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Chat (Latest)' },
            { uniqueId: 'openai-gpt-5.4-2026-03-05', id: 'gpt-5.4-2026-03-05', name: 'GPT-5.4 (2026/03/05)' },
        ],
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_openai_key')
                    : await CPM.safeGetArg('cpm_openai_key');
                if (!key) return null;

                const res = await CPM.smartFetch('https://api.openai.com/v1/models', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!res.ok) return null;

                const data = await res.json();
                if (!data.data) return null;

                // Filter to chat-capable models only
                const INCLUDE_PREFIXES = ['gpt-4', 'gpt-5', 'chatgpt-', 'o1', 'o3', 'o4'];
                const EXCLUDE_KEYWORDS = ['audio', 'realtime', 'search', 'transcribe', 'instruct', 'embedding', 'tts', 'whisper', 'dall-e'];

                const chatModels = data.data.filter(m => {
                    const id = m.id;
                    const included = INCLUDE_PREFIXES.some(pfx => id.startsWith(pfx));
                    if (!included) return false;
                    const excluded = EXCLUDE_KEYWORDS.some(kw => id.toLowerCase().includes(kw));
                    return !excluded;
                });

                return chatModels.map(m => {
                    let name = m.id;
                    const dateMatch = m.id.match(/-(\d{4})-(\d{2})-(\d{2})$/);
                    if (dateMatch) {
                        name = m.id.replace(/-\d{4}-\d{2}-\d{2}$/, '') + ` (${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]})`;
                    } else if (m.id.endsWith('-latest')) {
                        name = m.id.replace(/-latest$/, '') + ' (Latest)';
                    }
                    name = name.replace(/^gpt-/i, 'GPT-').replace(/^chatgpt-/i, 'ChatGPT-');
                    return { uniqueId: `openai-${m.id}`, id: m.id, name };
                });
            } catch (e) {
                console.warn('[CPM-OpenAI] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const config = {
                url: await CPM.safeGetArg('cpm_openai_url'),
                model: await CPM.safeGetArg('cpm_openai_model') || modelDef.id,
                reasoning: await CPM.safeGetArg('cpm_openai_reasoning'),
                verbosity: await CPM.safeGetArg('cpm_openai_verbosity'),
                servicetier: await CPM.safeGetArg('common_openai_servicetier'),
                promptCacheRetention: await CPM.safeGetArg('cpm_openai_prompt_cache_retention'),
            };

            // Helper: detect models that require max_completion_tokens instead of max_tokens
            // Match only gpt-4.5, gpt-5 (all variants), and o-series (align with OAICompletionTokens)
            const needsMaxCompletionTokens = (model) => {
                if (!model) return false;
                const m = model.toLowerCase();
                return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/.test(m);
            };

            // Helper: validate service_tier value
            const validServiceTiers = new Set(['flex', 'default']);

            // RisuAI-main capability alignment:
            // - reasoning_effort: o3/o4 family + GPT-5 parameter models (non chat-latest variants)
            // - verbosity: GPT-5 parameter models only (non chat-latest variants)
            const supportsReasoningEffort = (model) => {
                if (!model) return false;
                const m = model.toLowerCase();
                if (/(?:^|\/)o(?:3|4)(?:[\w.-]*)$/i.test(m)) return true;
                return /(?:^|\/)gpt-5(?:\.\d+)?(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(m);
            };
            const supportsVerbosity = (model) => {
                if (!model) return false;
                return /(?:^|\/)gpt-5(?:\.\d+)?(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.toLowerCase());
            };

            // Models that should drop sampling params (reasoning-effort only family in RisuAI-main)
            // NOTE: o1/o1-pro/o1-preview/o1-mini are NOT in this set.
            const stripSamplingForModel = (model) => {
                if (!model) return false;
                const m = model.toLowerCase();
                return /(?:^|\/)o(?:3(?:-mini|-pro|-deep-research)?|4-mini(?:-deep-research)?)$/i.test(m);
            };

            const stripSamplingForGPT54Reasoning = (model, reasoning) => {
                if (!model) return false;
                const m = String(model).toLowerCase();
                const effort = String(reasoning || '').trim().toLowerCase();
                if (!effort || effort === 'none' || effort === 'off') return false;
                return /(?:^|\/)gpt-5\.4(?:-(?:mini|nano|pro))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(m);
            };

            const url = config.url || 'https://api.openai.com/v1/chat/completions';
            const modelName = config.model || 'gpt-4o';
            // BUG-A3 FIX: o-series models (o1, o3, o4) also require system → developer role conversion
            // Also handle slash-prefixed model IDs (e.g., openai/o3-mini)
            // BUG-5 FIX: Exclude o1-preview/o1-mini which lack DeveloperRole support
            const useDeveloperRole = /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelName);
            const formattedMessages = CPM.formatToOpenAI(messages, { ...config, developerRole: useDeveloperRole });

            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);

            // Detect Responses API requirement:
            // - Copilot + GPT-5.4+ auto-switch
            // - or manual /responses URL entered by user
            const _isCopilotUrl = url.includes('githubcopilot.com');
            const _isManualResponsesEndpoint = /\/responses(?:\?|$)/.test(url);
            const _needsResponsesAPI = _isManualResponsesEndpoint || (
                _isCopilotUrl
                && typeof CPM._needsCopilotResponsesAPI === 'function'
                && CPM._needsCopilotResponsesAPI(modelName)
            );

            // Determine effective URL (auto-switch for Copilot GPT-5.4+)
            let effectiveUrl = url;
            if (_isCopilotUrl && typeof CPM._needsCopilotResponsesAPI === 'function' && CPM._needsCopilotResponsesAPI(modelName)) {
                const _copilotBase = (url.match(/https:\/\/[^/]+/) || ['https://api.githubcopilot.com'])[0];
                effectiveUrl = `${_copilotBase}/responses`;
                console.log(`[CPM-OpenAI] Copilot Responses API detected (model=${modelName}) → URL=${effectiveUrl}`);
            }

            // Key Rotation: wrap fetch in withKeyRotation for automatic retry on 429/529
            const doFetch = async (apiKey) => {
                const executeRequest = async (requestFactory, label, maxAttempts = 3) => {
                    let attempt = 0;
                    let response;

                    while (attempt < maxAttempts) {
                        response = await requestFactory();
                        if (response?.ok) return response;

                        const status = response?.status || 0;
                        if (!isRetriableStatus(status) || attempt >= maxAttempts - 1 || abortSignal?.aborted) {
                            return response;
                        }

                        response?.body?.cancel?.();
                        attempt++;
                        const retryDelay = parseRetryAfterMs(response?.headers) || (700 * attempt);
                        console.warn(`[CPM-OpenAI] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status}`);
                        await sleep(retryDelay);
                    }

                    return response;
                };

                const body = {
                    model: modelName,
                    temperature: temp,
                    stream: streamingEnabled,
                };

                // Responses API uses 'input' array; Chat Completions uses 'messages'
                if (_needsResponsesAPI) {
                    // Response API does not accept 'name' field on input items (e.g. example_assistant, example_user).
                    // Sending it causes 400: "Unknown parameter: 'input[N].name'"
                    body.input = Array.isArray(formattedMessages)
                        ? formattedMessages.filter(m => m != null && typeof m === 'object').map(({ name, ...rest }) => rest)
                        : [];
                } else {
                    body.messages = Array.isArray(formattedMessages) ? formattedMessages.filter(m => m != null && typeof m === 'object') : [];
                }

                // BUG-D1 FIX: Only request usage data when token display is enabled.
                // Responses API doesn't use stream_options (usage comes in response.completed event).
                if (streamingEnabled && !_needsResponsesAPI) {
                    const _wantUsage = await CPM.safeGetBoolArg('cpm_show_token_usage', false);
                    if (_wantUsage) {
                        body.stream_options = { include_usage: true };
                    }
                }

                if (_needsResponsesAPI) {
                    // Responses API: max_output_tokens (not max_tokens / max_completion_tokens)
                    body.max_output_tokens = maxTokens;
                } else if (needsMaxCompletionTokens(modelName)) {
                    body.max_completion_tokens = maxTokens;
                } else {
                    body.max_tokens = maxTokens;
                }

                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;

                if (config.servicetier) {
                    const tier = config.servicetier.trim().toLowerCase();
                    if (tier && tier !== 'auto' && validServiceTiers.has(tier)) {
                        body.service_tier = tier;
                    }
                }

                // OpenAI Prompt Cache Retention: 'in_memory' (default, 5-10min) or '24h' (extended)
                // Supported on gpt-4.1, gpt-5, gpt-5.1, gpt-5.2 series
                if (config.promptCacheRetention && config.promptCacheRetention !== 'none') {
                    body.prompt_cache_retention = config.promptCacheRetention;
                }

                // Strip sampling params only for reasoning-effort-only o-series models.
                // RisuAI-main keeps OpenAIParameters for o1/o1-pro/o1-preview/o1-mini.
                if (stripSamplingForModel(modelName)) {
                    delete body.temperature;
                    delete body.top_p;
                    delete body.frequency_penalty;
                    delete body.presence_penalty;
                }
                if (stripSamplingForGPT54Reasoning(modelName, config.reasoning)) {
                    delete body.temperature;
                    delete body.top_p;
                }

                if (config.reasoning && config.reasoning !== 'none' && supportsReasoningEffort(modelName)) {
                    if (_needsResponsesAPI) {
                        // Responses API: reasoning.effort (nested object)
                        body.reasoning = { effort: config.reasoning, summary: 'auto' };
                    } else {
                        body.reasoning_effort = config.reasoning;
                    }
                }
                if (config.verbosity && config.verbosity !== 'none' && supportsVerbosity(modelName)) {
                    body.verbosity = config.verbosity;
                }

                const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                if (_isCopilotUrl) {
                    let copilotApiToken = '';
                    if (typeof window.CupcakePM?.ensureCopilotApiToken === 'function') {
                        copilotApiToken = await window.CupcakePM.ensureCopilotApiToken();
                    } else if (window._cpmCopilotApiToken) {
                        copilotApiToken = window._cpmCopilotApiToken;
                    }
                    if (copilotApiToken) {
                        headers['Authorization'] = `Bearer ${copilotApiToken}`;
                    }
                    // Persistent session IDs (shared across all Copilot requests)
                    if (!window._cpmCopilotMachineId) {
                        window._cpmCopilotMachineId = Array.from({ length: 64 }, () =>
                            Math.floor(Math.random() * 16).toString(16)
                        ).join('');
                    }
                    if (!window._cpmCopilotSessionId) {
                        window._cpmCopilotSessionId = ((typeof CPM.safeUUID === 'function') ? CPM.safeUUID() : Math.random().toString(36).slice(2)) + Date.now().toString();
                    }
                    // Full Copilot header set (aligned with fetchCustom + LBI pre36)
                    headers['Copilot-Integration-Id'] = 'vscode-chat';
                    headers['Editor-Plugin-Version'] = 'copilot-chat/0.37.4';
                    headers['Editor-Version'] = 'vscode/1.109.2';
                    headers['User-Agent'] = 'GitHubCopilotChat/0.37.4';
                    headers['Vscode-Machineid'] = window._cpmCopilotMachineId;
                    headers['Vscode-Sessionid'] = window._cpmCopilotSessionId;
                    headers['X-Github-Api-Version'] = '2025-10-01';
                    headers['X-Initiator'] = 'user';
                    headers['X-Interaction-Id'] = (typeof CPM.safeUUID === 'function') ? CPM.safeUUID() : Math.random().toString(36).slice(2);
                    headers['X-Interaction-Type'] = 'conversation-panel';
                    headers['X-Request-Id'] = (typeof CPM.safeUUID === 'function') ? CPM.safeUUID() : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
                    headers['X-Vscode-User-Agent-Library-Version'] = 'electron-fetch';
                    // Copilot Vision: detect image content (check both messages and input arrays)
                    const _msgArr = body.messages || body.input || [];
                    const hasVisionContent = _msgArr.some(m =>
                        Array.isArray(m?.content) && m.content.some(p => p.type === 'image_url')
                    );
                    if (hasVisionContent) headers['Copilot-Vision-Request'] = 'true';

                    // Responses API: remove prompt_cache_retention (not applicable for Copilot /responses)
                    if (_needsResponsesAPI) {
                        delete body.prompt_cache_retention;
                    }
                }

                const safeBody = JSON.stringify(body);

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : (window.Risuai || window.risuai).nativeFetch;
                const res = await executeRequest(
                    () => fetchFn(effectiveUrl, { method: 'POST', headers, body: safeBody, signal: abortSignal }),
                    'request'
                );
                if (!res.ok) return { success: false, content: `[OpenAI Error ${res.status}] ${await res.text()}`, _status: res.status };

                if (streamingEnabled) {
                    const hasReadableStreamBody = !!(res.body && typeof res.body.getReader === 'function');
                    if (!hasReadableStreamBody) {
                        console.warn('[CPM-OpenAI] Streaming response body unavailable; retrying as non-streaming.');
                        const fallbackBody = { ...body, stream: false };
                        delete fallbackBody.stream_options;
                        const fallbackRes = await executeRequest(
                            () => fetchFn(effectiveUrl, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(fallbackBody),
                                signal: abortSignal,
                            }),
                            'non-stream fallback'
                        );
                        if (!fallbackRes.ok) return { success: false, content: `[OpenAI Error ${fallbackRes.status}] ${await fallbackRes.text()}`, _status: fallbackRes.status };
                        const fallbackData = await fallbackRes.json();
                        if (_needsResponsesAPI && typeof CPM.parseResponsesAPINonStreamingResponse === 'function') {
                            return CPM.parseResponsesAPINonStreamingResponse(fallbackData, _reqId);
                        }
                        return typeof CPM.parseOpenAINonStreamingResponse === 'function'
                            ? CPM.parseOpenAINonStreamingResponse(fallbackData, _reqId)
                            : { success: true, content: fallbackData.choices?.[0]?.message?.content || '' };
                    }
                    if (_needsResponsesAPI && typeof CPM.createResponsesAPISSEStream === 'function') {
                        // Responses API streaming (GPT-5.4+ on Copilot)
                        return { success: true, content: CPM.createResponsesAPISSEStream(res, abortSignal, _reqId) };
                    }
                    // Standard OpenAI-compatible stream
                    return { success: true, content: typeof CPM.createOpenAISSEStream === 'function'
                        ? CPM.createOpenAISSEStream(res, abortSignal, _reqId)
                        : CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
                } else {
                    const data = await res.json();
                    if (_needsResponsesAPI && typeof CPM.parseResponsesAPINonStreamingResponse === 'function') {
                        // Responses API non-streaming (GPT-5.4+ on Copilot)
                        return CPM.parseResponsesAPINonStreamingResponse(data, _reqId);
                    }
                    return typeof CPM.parseOpenAINonStreamingResponse === 'function'
                        ? CPM.parseOpenAINonStreamingResponse(data, _reqId)
                        : { success: true, content: data.choices?.[0]?.message?.content || '' };
                }
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_openai_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_openai_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-openai',
            icon: '🟢',
            label: 'OpenAI',
            exportKeys: ['cpm_openai_key', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier', 'cpm_openai_prompt_cache_retention', 'cpm_openai_url', 'cpm_dynamic_openai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-green-400 mb-6 pb-3 border-b border-gray-700">OpenAI Configuration (설정)</h3>
                    ${await renderInput('cpm_openai_key', 'API Key (sk-... \uc5ec\ub7ec \uac1c \uc785\ub825 \uc2dc \uacf5\ubc31/\uc904\ubc14\uafbc\uc73c\ub85c \uad6c\ubd84, \uc790\ub3d9 \ud0a4\ud68c\uc804)', 'password')}
                    ${await renderInput('cpm_dynamic_openai', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_openai_reasoning', 'Reasoning Effort (추론 수준 - o3, o1 series)', 'select', lists.reasoningList)}
                    ${await renderInput('cpm_openai_verbosity', 'Response Verbosity (응답 상세)', 'select', lists.verbosityList)}
                    ${await renderInput('common_openai_servicetier', 'Service Tier (응답 속도)', 'select', [{ value: '', text: 'Auto (자동)' }, { value: 'flex', text: 'Flex' }, { value: 'default', text: 'Default' }])}
                    ${await renderInput('cpm_openai_prompt_cache_retention', 'Prompt Cache Retention (프롬프트 캐시 유지)', 'select', [{ value: 'none', text: 'None (기본, 서버 자동 5~10분)' }, { value: 'in_memory', text: 'In-Memory (5~10분, 최대 1시간)' }, { value: '24h', text: '24h Extended (24시간 확장 캐시)' }])}
                    ${await renderInput('cpm_openai_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
