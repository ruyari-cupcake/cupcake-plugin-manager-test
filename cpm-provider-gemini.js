//@name CPM Provider - Gemini Studio
//@version 1.6.3
//@description Google Gemini Studio (API Key) provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🔵
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-gemini.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-Gemini] CupcakePM API not found!'); return; }

    const GEMINI_MODELS = [
        { uniqueId: 'google-gemini-3-pro-preview', id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
        { uniqueId: 'google-gemini-3.1-pro-preview', id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { uniqueId: 'google-gemini-3-flash-preview', id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { uniqueId: 'google-gemini-2.5-pro', id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { uniqueId: 'google-gemini-2.5-flash', id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];

    CPM.registerProvider({
        name: 'GoogleAI',
        models: GEMINI_MODELS,
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_gemini_key')
                    : await CPM.safeGetArg('cpm_gemini_key');
                if (!key) return null;

                let allModels = [];
                let pageToken = null;
                let _pageCount = 0;
                const MAX_PAGES = 50;

                // Paginate through all available models (max 50 pages safety guard)
                while (_pageCount < MAX_PAGES) {
                    _pageCount++;
                    let url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`;
                    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

                    const res = await CPM.smartFetch(url, { method: 'GET' });
                    if (!res.ok) return null;

                    const data = await res.json();
                    if (data.models) allModels = allModels.concat(data.models);
                    if (!data.nextPageToken) break;
                    pageToken = data.nextPageToken;
                }

                return allModels
                    .filter(m => {
                        // Only include models that support generateContent (chat/generation)
                        if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
                        // Only include gemini models
                        const id = (m.name || '').replace('models/', '');
                        return id.startsWith('gemini-');
                    })
                    .map(m => {
                        const id = m.name.replace('models/', '');
                        return {
                            uniqueId: `google-${id}`,
                            id: id,
                            name: m.displayName || id
                        };
                    });
            } catch (e) {
                console.warn('[CPM-Gemini] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);
            const config = {
                model: await CPM.safeGetArg('cpm_gemini_model') || modelDef.id,
                thinking: await CPM.safeGetArg('cpm_gemini_thinking_level'),
                thinkingBudget: await CPM.safeGetArg('cpm_gemini_thinking_budget'),
                preserveSystem: await CPM.safeGetBoolArg('chat_gemini_preserveSystem', true),
                showThoughtsToken: await CPM.safeGetBoolArg('chat_gemini_showThoughtsToken'),
                useThoughtSignature: await CPM.safeGetBoolArg('chat_gemini_useThoughtSignature'),
            };

            const model = config.model || 'gemini-2.5-flash';
            const { contents, systemInstruction } = CPM.formatToGemini(messages, config);

            // Key Rotation: wrap fetch in withKeyRotation for automatic retry on 429/529
            const doFetch = async (apiKey) => {
                // Use streaming or non-streaming endpoint based on cpm_streaming_enabled
                const endpoint = streamingEnabled ? 'streamGenerateContent' : 'generateContent';
                const urlSuffix = streamingEnabled ? '&alt=sse' : '';
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}${urlSuffix}`;

                const body = { contents, generationConfig: { temperature: temp, maxOutputTokens: maxTokens } };
                if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
                if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
                if (systemInstruction.length > 0) body.systemInstruction = { parts: systemInstruction.map(text => ({ text })) };
                if (typeof CPM.buildGeminiThinkingConfig === 'function') {
                    const _tc = CPM.buildGeminiThinkingConfig(model, config.thinking, config.thinkingBudget, false);
                    if (_tc) body.generationConfig.thinkingConfig = _tc;
                } else if (config.thinking && config.thinking !== 'off' && config.thinking !== 'none') {
                    body.generationConfig.thinkingConfig = { includeThoughts: true, thinkingLevel: String(config.thinking).toLowerCase() };
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
                // Strip thought:true from historical parts for thinking models
                // (Gemini API may reject requests with thought:true in historical parts)
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

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : (window.Risuai || window.risuai).nativeFetch;
                const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abortSignal });
                if (!res.ok) return { success: false, content: `[Gemini Error ${res.status}] ${await res.text()}`, _status: res.status };

                if (streamingEnabled) {
                    // Streaming: return SSE ReadableStream
                    // BUG-D2 FIX: Pass onComplete callback for thought signature + token usage capture
                    const _onComplete = typeof CPM.saveThoughtSignatureFromStream === 'function'
                        ? () => CPM.saveThoughtSignatureFromStream(config, _reqId) : undefined;
                    return { success: true, content: CPM.createSSEStream(res, (line) => CPM.parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
                } else {
                    // Non-streaming: parse JSON response directly
                    const data = await res.json();
                    if (typeof CPM.parseGeminiNonStreamingResponse === 'function') {
                        return CPM.parseGeminiNonStreamingResponse(data, config, _reqId);
                    }
                    // Fallback: extract text directly
                    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
                    return { success: !!text, content: text || '[Gemini] Empty response' };
                }
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_gemini_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_gemini_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-gemini',
            icon: '🔵',
            label: 'Gemini Studio',
            exportKeys: ['cpm_gemini_key', 'cpm_gemini_thinking_level', 'cpm_gemini_thinking_budget', 'chat_gemini_preserveSystem', 'chat_gemini_showThoughtsToken', 'chat_gemini_useThoughtSignature', 'chat_gemini_usePlainFetch', 'cpm_dynamic_googleai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-indigo-400 mb-6 pb-3 border-b border-gray-700">Gemini Studio Configuration (설정)</h3>
                    ${await renderInput('cpm_gemini_key', 'API Key (API 키 - 여러 개 입력 시 공백/줄바꾼으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_dynamic_googleai', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_gemini_thinking_level', 'Thinking Level (생각 수준 - Gemini 3용)', 'select', lists.thinkingList)}
                    ${await renderInput('cpm_gemini_thinking_budget', 'Thinking Budget Tokens (생각 토큰 예산 - Gemini 2.5용, 0은 끄기)', 'number')}
                    ${await renderInput('chat_gemini_preserveSystem', 'Preserve System (시스템 프롬프트 보존)', 'checkbox')}
                    ${await renderInput('chat_gemini_showThoughtsToken', 'Show Thoughts Token Info (생각 토큰 알림 표시)', 'checkbox')}
                    ${await renderInput('chat_gemini_useThoughtSignature', 'Use Thought Signature (생각 서명 추출 사용)', 'checkbox')}
                    ${await renderInput('chat_gemini_usePlainFetch', 'Use Plain Fetch (직접 요청 쓰기 - 프록시/V3 캐싱 우회)', 'checkbox')}
                `;
            }
        }
    });
})();
