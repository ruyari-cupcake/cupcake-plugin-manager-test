//@name CPM Provider - DeepSeek
//@version 1.4.5
//@description DeepSeek provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🟣
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-deepseek.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-DeepSeek] CupcakePM API not found!'); return; }

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
        name: 'DeepSeek',
        models: [
            { uniqueId: 'deepseek-chat', id: 'deepseek-chat', name: 'Deepseek Chat' },
            { uniqueId: 'deepseek-reasoner', id: 'deepseek-reasoner', name: 'Deepseek Reasoner' },
        ],
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_deepseek_key')
                    : await CPM.safeGetArg('cpm_deepseek_key');
                if (!key) return null;

                const res = await CPM.smartFetch('https://api.deepseek.com/models', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!res.ok) return null;

                const data = await res.json();
                if (!data.data) return null;

                return data.data.map(m => {
                    // Format name: "deepseek-chat" -> "DeepSeek Chat"
                    let name = m.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    name = name.replace(/^Deepseek/i, 'DeepSeek');
                    return { uniqueId: `deepseek-${m.id}`, id: m.id, name };
                });
            } catch (e) {
                console.warn('[CPM-DeepSeek] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const config = {
                url: await CPM.safeGetArg('cpm_deepseek_url'),
                model: await CPM.safeGetArg('cpm_deepseek_model') || modelDef.id,
            };

            const url = config.url || 'https://api.deepseek.com/v1/chat/completions';

            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);

            // Safety: DeepSeek API max_tokens limits (model-dependent)
            // deepseek-reasoner (V3.2 Thinking): max 64K, deepseek-chat (V3.2): max 8K
            const _dsModel = (config.model || '').toLowerCase();
            const _DS_MAX_OUT = _dsModel.includes('reasoner') ? 65536 : 8192;
            if (typeof maxTokens === 'number' && maxTokens > _DS_MAX_OUT) {
                console.warn(`[CPM-DeepSeek] max_tokens ${maxTokens} → clamped to ${_DS_MAX_OUT} for ${config.model} (API limit)`);
                maxTokens = _DS_MAX_OUT;
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
                        console.warn(`[CPM-DeepSeek] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status}`);
                        await sleep(retryDelay);
                    }

                    return response;
                };

                const _modelName = (config.model || '').toLowerCase();
                const _isReasoner = _modelName.includes('reasoner');
                const body = { model: config.model || 'deepseek-chat', messages: CPM.formatToOpenAI(messages), temperature: temp, max_tokens: maxTokens, stream: streamingEnabled };
                // BUG-D4 FIX: Request usage data in streaming mode when token display is enabled
                if (streamingEnabled) {
                    const _wantUsage = await CPM.safeGetBoolArg('cpm_show_token_usage', false);
                    if (_wantUsage) {
                        body.stream_options = { include_usage: true };
                    }
                }
                // Add optional params FIRST, then delete for reasoner
                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
                // deepseek-reasoner: API does not support temperature/top_p/penalties
                // Must be AFTER args assignment to ensure deletion takes priority
                if (_isReasoner) {
                    delete body.temperature;
                    delete body.top_p;
                    delete body.frequency_penalty;
                    delete body.presence_penalty;
                }

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : (window.Risuai || window.risuai).nativeFetch;
                const requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                const res = await executeRequest(
                    () => fetchFn(url, {
                        method: 'POST',
                        headers: requestHeaders,
                        body: JSON.stringify(body),
                        signal: abortSignal
                    }),
                    'request'
                );
                if (!res.ok) return { success: false, content: `[DeepSeek Error ${res.status}] ${await res.text()}`, _status: res.status };

                if (streamingEnabled) {
                    const hasReadableStreamBody = !!(res.body && typeof res.body.getReader === 'function');
                    if (!hasReadableStreamBody) {
                        console.warn('[CPM-DeepSeek] Streaming response body unavailable; retrying as non-streaming.');
                        const fallbackBody = { ...body, stream: false };
                        delete fallbackBody.stream_options;
                        const fallbackRes = await executeRequest(
                            () => fetchFn(url, {
                                method: 'POST',
                                headers: requestHeaders,
                                body: JSON.stringify(fallbackBody),
                                signal: abortSignal
                            }),
                            'non-stream fallback'
                        );
                        if (!fallbackRes.ok) return { success: false, content: `[DeepSeek Error ${fallbackRes.status}] ${await fallbackRes.text()}`, _status: fallbackRes.status };
                        const fallbackData = await fallbackRes.json();
                        return typeof CPM.parseOpenAINonStreamingResponse === 'function'
                            ? CPM.parseOpenAINonStreamingResponse(fallbackData, _reqId)
                            : { success: true, content: fallbackData.choices?.[0]?.message?.content || '' };
                    }
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
                return CPM.withKeyRotation('cpm_deepseek_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_deepseek_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-deepseek',
            icon: '🟣',
            label: 'DeepSeek',
            exportKeys: ['cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_dynamic_deepseek'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-purple-400 mb-6 pb-3 border-b border-gray-700">DeepSeek Configuration (설정)</h3>
                    ${await renderInput('cpm_deepseek_key', 'API Key (API 키 - 여러 개 입력 시 공백/줄바꾼으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_dynamic_deepseek', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_deepseek_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
