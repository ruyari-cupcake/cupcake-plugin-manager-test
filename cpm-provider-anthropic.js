//@name CPM Provider - Anthropic
//@version 1.6.6
//@description Anthropic Claude provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🟠
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-anthropic.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-Anthropic] CupcakePM API not found!'); return; }

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

    const CLAUDE_MODELS_BASE = [
        { baseId: "claude-haiku-4-5", date: "20251001", name: "Claude 4.5 Haiku", displayDate: "2025/10/01" },
        { baseId: "claude-sonnet-4", date: "20250514", name: "Claude 4 Sonnet", displayDate: "2025/05/14" },
        { baseId: "claude-sonnet-4-5", date: "20250929", name: "Claude 4.5 Sonnet", displayDate: "2025/09/29" },
        { baseId: "claude-opus-4", date: "20250514", name: "Claude 4 Opus", displayDate: "2025/05/14" },
        { baseId: "claude-opus-4-1", date: "20250805", name: "Claude 4.1 Opus", displayDate: "2025/08/05" },
        { baseId: "claude-opus-4-5", date: "20251101", name: "Claude 4.5 Opus", displayDate: "2025/11/01" },
    ];

    // Claude 4.6 models have no date suffix and support adaptive thinking
    const CLAUDE_46_MODELS = [
        { uniqueId: 'anthropic-claude-sonnet-4-6', id: 'claude-sonnet-4-6', name: 'Claude 4.6 Sonnet' },
        { uniqueId: 'anthropic-claude-opus-4-6', id: 'claude-opus-4-6', name: 'Claude 4.6 Opus' },
    ];

    const ADAPTIVE_THINKING_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6'];
    const EFFORT_OPTIONS = ['low', 'medium', 'high', 'max'];

    const models = [
        ...CLAUDE_46_MODELS,
        ...CLAUDE_MODELS_BASE.map(m => ({
            uniqueId: `anthropic-${m.baseId}-${m.date}`,
            id: `${m.baseId}-${m.date}`,
            name: `${m.name} (${m.displayDate})`
        }))
    ];

    CPM.registerProvider({
        name: 'Anthropic',
        models,
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_anthropic_key')
                    : await CPM.safeGetArg('cpm_anthropic_key');
                if (!key) return null;

                let allModels = [];
                let afterId = null;

                // Paginate through all available models (max 50 pages safety guard)
                let _pageCount = 0;
                const MAX_PAGES = 50;
                while (_pageCount < MAX_PAGES) {
                    _pageCount++;
                    let url = 'https://api.anthropic.com/v1/models?limit=100';
                    if (afterId) url += `&after_id=${encodeURIComponent(afterId)}`;

                    const res = await CPM.smartFetch(url, {
                        method: 'GET',
                        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
                    });
                    if (!res.ok) return null;

                    const data = await res.json();
                    if (data.data) allModels = allModels.concat(data.data);
                    if (!data.has_more) break;
                    afterId = data.last_id;
                }

                return allModels
                    .filter(m => m.type === 'model')
                    .map(m => {
                        let name = m.display_name || m.id;
                        // Append date suffix if present (e.g., "20251001" -> "2025/10/01")
                        const dateMatch = m.id.match(/(\d{4})(\d{2})(\d{2})$/);
                        if (dateMatch) name += ` (${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]})`;
                        return { uniqueId: `anthropic-${m.id}`, id: m.id, name };
                    });
            } catch (e) {
                console.warn('[CPM-Anthropic] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal, _reqId) {
            const cacheEnabled = await CPM.safeGetBoolArg('chat_claude_caching');
            const cacheRaw = await CPM.safeGetArg('chat_claude_caching');
            const cacheTtl = await CPM.safeGetArg('cpm_anthropic_cache_ttl');
            const cacheTtlNormalized = String(cacheTtl || '').trim().toLowerCase();
            const oneHourCaching = cacheTtlNormalized === '1h' || String(cacheRaw || '').trim().toLowerCase() === '1h';
            const config = {
                url: await CPM.safeGetArg('cpm_anthropic_url'),
                model: await CPM.safeGetArg('cpm_anthropic_model') || modelDef.id,
                budget: await CPM.safeGetArg('cpm_anthropic_thinking_budget'),
                effort: await CPM.safeGetArg('cpm_anthropic_thinking_effort'),
                caching: !!cacheEnabled || oneHourCaching,
                claude1HourCaching: oneHourCaching,
            };

            const url = config.url || 'https://api.anthropic.com/v1/messages';
            const streamingEnabled = await CPM.safeGetBoolArg('cpm_streaming_enabled', false);
            const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages, config);

            // Safety: Anthropic API max is 128K with output-128k beta header
            const _ANTH_MAX_OUT = 128000;
            if (typeof maxTokens === 'number' && maxTokens > _ANTH_MAX_OUT) {
                console.warn(`[CPM-Anthropic] max_tokens ${maxTokens} → clamped to ${_ANTH_MAX_OUT} (API limit)`);
                maxTokens = _ANTH_MAX_OUT;
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
                        console.warn(`[CPM-Anthropic] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status}`);
                        await sleep(retryDelay);
                    }

                    return response;
                };

                const body = {
                    model: config.model || 'claude-sonnet-4-5-20250929',
                    max_tokens: maxTokens,
                    temperature: temp,
                    messages: formattedMsgs,
                    stream: streamingEnabled,
                };
                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
                if (systemPrompt) {
                    if (config.caching) {
                        // BUG-4 FIX: Include ttl:'1h' when 1-hour caching is enabled
                        // Aligned with RisuAI-main anthropic.ts: db.claude1HourCaching → { type: 'ephemeral', ttl: '1h' }
                        const _sysCache = config.claude1HourCaching
                            ? { type: 'ephemeral', ttl: '1h' }
                            : { type: 'ephemeral' };
                        body.system = [{ type: 'text', text: systemPrompt, cache_control: _sysCache }];
                    } else {
                        body.system = systemPrompt;
                    }
                }

                const isAdaptiveModel = ADAPTIVE_THINKING_MODELS.some(m => (config.model || '').startsWith(m));

                // BUG-3 FIX: Only enter adaptive path when effort is explicitly set.
                // Budget-only on 4.6 models should use budget-based path (type: 'enabled').
                // RisuAI-main treats effort and budget as independent flows.
                if (isAdaptiveModel && config.effort) {
                    body.thinking = { type: 'adaptive' };
                    const effort = EFFORT_OPTIONS.includes(config.effort) ? config.effort : 'high';
                    body.output_config = { effort };
                    delete body.temperature;
                    delete body.top_k;
                    delete body.top_p;
                } else if (config.budget && parseInt(config.budget) > 0) {
                    body.thinking = { type: 'enabled', budget_tokens: parseInt(config.budget) };
                    if (body.max_tokens <= body.thinking.budget_tokens) body.max_tokens = body.thinking.budget_tokens + 4096;
                    delete body.temperature;
                    delete body.top_k;
                    delete body.top_p;
                }

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : (window.Risuai || window.risuai).nativeFetch;
                const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };

                // BUG-C3 FIX: Add anthropic-beta headers when needed (aligned with native anthropic.ts)
                const betas = [];
                // Output-128k beta: required when max_tokens > 8192
                if (body.max_tokens > 8192) betas.push('output-128k-2025-02-19');
                // Extended cache TTL beta: only for explicit 1-hour caching mode (claude1HourCaching)
                // Basic prompt caching (5-min ephemeral) is GA and doesn't need a beta header
                // RisuAI-main only adds this when db.claude1HourCaching is true (anthropic.ts L554)
                if (config.claude1HourCaching) betas.push('extended-cache-ttl-2025-04-11');
                if (betas.length > 0) headers['anthropic-beta'] = betas.join(',');

                const res = await executeRequest(
                    () => fetchFn(url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(body),
                        signal: abortSignal
                    }),
                    'request'
                );
                if (!res.ok) return { success: false, content: `[Anthropic Error ${res.status}] ${await res.text()}`, _status: res.status };

                if (streamingEnabled) {
                    const hasReadableStreamBody = !!(res.body && typeof res.body.getReader === 'function');
                    if (!hasReadableStreamBody) {
                        console.warn('[CPM-Anthropic] Streaming response body unavailable; retrying as non-streaming.');
                        const fallbackBody = { ...body, stream: false };
                        const fallbackRes = await executeRequest(
                            () => fetchFn(url, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(fallbackBody),
                                signal: abortSignal
                            }),
                            'non-stream fallback'
                        );
                        if (!fallbackRes.ok) return { success: false, content: `[Anthropic Error ${fallbackRes.status}] ${await fallbackRes.text()}`, _status: fallbackRes.status };
                        const fallbackData = await fallbackRes.json();
                        return typeof CPM.parseClaudeNonStreamingResponse === 'function'
                            ? CPM.parseClaudeNonStreamingResponse(fallbackData, {}, _reqId)
                            : (() => {
                                let r = '', th = false;
                                if (Array.isArray(fallbackData.content)) for (const b of fallbackData.content) {
                                    if (b.type === 'thinking' && b.thinking) {
                                        if (!th) { th = true; r += '<Thoughts>\n'; }
                                        r += b.thinking;
                                    } else if (b.type === 'redacted_thinking') {
                                        if (!th) { th = true; r += '<Thoughts>\n'; }
                                        r += '\n{{redacted_thinking}}\n';
                                    } else if (b.type === 'text') {
                                        if (th) { th = false; r += '</Thoughts>\n\n'; }
                                        r += b.text || '';
                                    }
                                }
                                if (th) r += '</Thoughts>\n\n';
                                return { success: !!r, content: r || '[Anthropic] Empty response' };
                            })();
                    }
                    return { success: true, content: CPM.createAnthropicSSEStream(res, abortSignal, _reqId) };
                } else {
                    const data = await res.json();
                    // parseClaudeNonStreamingResponse now always shows thinking (aligned with RisuAI-main)
                    return typeof CPM.parseClaudeNonStreamingResponse === 'function'
                        ? CPM.parseClaudeNonStreamingResponse(data, {}, _reqId)
                        : (() => {
                            let r = '', th = false;
                            if (Array.isArray(data.content)) for (const b of data.content) {
                                if (b.type === 'thinking' && b.thinking) {
                                    if (!th) { th = true; r += '<Thoughts>\n'; }
                                    r += b.thinking;
                                } else if (b.type === 'redacted_thinking') {
                                    if (!th) { th = true; r += '<Thoughts>\n'; }
                                    r += '\n{{redacted_thinking}}\n';
                                } else if (b.type === 'text') {
                                    if (th) { th = false; r += '</Thoughts>\n\n'; }
                                    r += b.text || '';
                                }
                            }
                            if (th) r += '</Thoughts>\n\n';
                            return { success: !!r, content: r || '[Anthropic] Empty response' };
                        })();
                }
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_anthropic_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_anthropic_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-anthropic',
            icon: '🟠',
            label: 'Anthropic',
            exportKeys: ['cpm_anthropic_key', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching', 'cpm_anthropic_cache_ttl', 'cpm_anthropic_url', 'cpm_dynamic_anthropic'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-orange-400 mb-6 pb-3 border-b border-gray-700">Anthropic Configuration (설정)</h3>
                    ${await renderInput('cpm_anthropic_key', 'API Key (API 키 - 여러 개 입력 시 공백/줄바꾼으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_dynamic_anthropic', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_anthropic_thinking_budget', 'Thinking Budget Tokens (생각 토큰 예산 - 4.5 이하 모델용, 0은 끄기)', 'number')}
                    ${await renderInput('cpm_anthropic_thinking_effort', 'Adaptive Thinking Effort (4.6 모델용: low/medium/high/max)')}
                    ${await renderInput('chat_claude_caching', 'Cache Enabled (프롬프트 캐싱 사용)', 'checkbox')}
                    ${await renderInput('cpm_anthropic_cache_ttl', 'Cache TTL (캐시 보존 시간)', 'select', [{ value: '', text: 'Default (5분, GA)' }, { value: '1h', text: 'Extended 1시간 (Beta)' }])}
                    ${await renderInput('cpm_anthropic_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
