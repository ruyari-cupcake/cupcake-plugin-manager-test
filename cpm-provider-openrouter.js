//@name CPM Provider - OpenRouter
//@version 1.3.4
//@description OpenRouter provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🌐
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-openrouter.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-OpenRouter] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'OpenRouter',
        models: [
            { uniqueId: 'openrouter-dynamic', id: 'openrouter', name: 'OpenRouter (Set inside PM config)' },
        ],
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const config = {
                url: await CPM.safeGetArg('cpm_openrouter_url'),
                model: await CPM.safeGetArg('cpm_openrouter_model'),
                reasoning: await CPM.safeGetArg('cpm_openrouter_reasoning'),
                providerString: await CPM.safeGetArg('cpm_openrouter_provider'),
            };

            if (!config.model || !config.model.trim()) {
                return { success: false, content: '[OpenRouter] Model Name이 설정되지 않았습니다. PM 설정 → OpenRouter 탭에서 Model Name을 입력해주세요. (예: anthropic/claude-sonnet-4)' };
            }
            const url = config.url || 'https://openrouter.ai/api/v1/chat/completions';

            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);

            // Key Rotation: wrap fetch in withKeyRotation for automatic retry on 429/529
            const doFetch = async (apiKey) => {
                const modelName = config.model.trim();
                // Detect models that need developer role (gpt-5, o-series)
                // BUG-5 FIX: Exclude o1-preview/o1-mini which lack DeveloperRole support
                const useDeveloperRole = /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelName);
                // Match only gpt-4.5, gpt-5, and o-series for max_completion_tokens
                const needsMaxCompletionTokens = /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(modelName);
                const body = { model: modelName, messages: CPM.formatToOpenAI(messages, { developerRole: useDeveloperRole }), temperature: temp, stream: streamingEnabled };
                // BUG-D1 FIX: Only request usage data when token display is enabled.
                if (streamingEnabled) {
                    const _wantUsage = await CPM.safeGetBoolArg('cpm_show_token_usage', false);
                    if (_wantUsage) {
                        body.stream_options = { include_usage: true };
                    }
                }
                if (needsMaxCompletionTokens) {
                    body.max_completion_tokens = maxTokens;
                } else {
                    body.max_tokens = maxTokens;
                }
                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
                if (args.repetition_penalty !== undefined && args.repetition_penalty !== null) body.repetition_penalty = args.repetition_penalty;
                // Align with RisuAI-main behavior: only o3/o4 reasoning-effort-only families
                // should strip sampling params. o1 family keeps OpenAIParameters.
                const shouldStripSampling = /(?:^|\/)o(?:3(?:-mini|-pro|-deep-research)?|4-mini(?:-deep-research)?)$/i.test(modelName);
                if (shouldStripSampling) {
                    delete body.temperature;
                    delete body.top_p;
                    delete body.top_k;
                    delete body.frequency_penalty;
                    delete body.presence_penalty;
                    delete body.repetition_penalty;
                }
                if (config.reasoning && config.reasoning !== 'none') {
                    const reasoningMaxTokens = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0
                        ? Number(maxTokens)
                        : 8192;
                    body.reasoning = { effort: config.reasoning, max_tokens: reasoningMaxTokens };
                }
                if (config.providerString) {
                    // Split comma-separated provider names into individual array elements
                    // e.g., "Hyperbolic,Together" → ["Hyperbolic", "Together"]
                    const providers = config.providerString.split(',').map(s => s.trim()).filter(Boolean);
                    if (providers.length > 0) {
                        body.provider = { order: providers };
                    }
                }

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : (window.Risuai || window.risuai).nativeFetch;
                const res = await fetchFn(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://risuai.xyz',
                        'X-Title': 'RisuAI - CPM'
                    },
                    body: JSON.stringify(body),
                    signal: abortSignal
                });
                if (!res.ok) return { success: false, content: `[OpenRouter Error ${res.status}] ${await res.text()}`, _status: res.status };

                if (streamingEnabled) {
                    return { success: true, content: typeof CPM.createOpenAISSEStream === 'function'
                        ? CPM.createOpenAISSEStream(res, abortSignal, _reqId)
                        : CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
                } else {
                    const data = await res.json();
                    return typeof CPM.parseOpenAINonStreamingResponse === 'function'
                        ? CPM.parseOpenAINonStreamingResponse(data, _reqId)
                        : { success: true, content: data.choices?.[0]?.message?.content || '' };
                }
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_openrouter_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_openrouter_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-openrouter',
            icon: '🌐',
            label: 'OpenRouter',
            exportKeys: ['cpm_openrouter_key', 'cpm_openrouter_model', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning', 'cpm_openrouter_url'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-teal-400 mb-6 pb-3 border-b border-gray-700">OpenRouter Configuration (설정)</h3>
                    ${await renderInput('cpm_openrouter_model', 'Model Name (API 모델 ID, 예: anthropic/claude-sonnet-4)', 'text')}
                    ${await renderInput('cpm_openrouter_key', 'API Key (API 키 - 여러 개 입력 시 공백/줄바꾼으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_openrouter_provider', 'Provider String (프로바이더 문자열 e.g., Hyperbolic)', 'text')}
                    ${await renderInput('cpm_openrouter_reasoning', 'Reasoning Header (추론 헤더)', 'select', lists.reasoningList)}
                    ${await renderInput('cpm_openrouter_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
