/**
 * @vitest-environment jsdom
 *
 * settings-export-import-comprehensive.test.js
 * ─────────────────────────────────────────────
 * 설정 내보내기/불러오기 전체 라운드트립 테스트.
 *
 * 검증 항목:
 *   - 모든 프로바이더 API 키 (OpenAI, Anthropic, Gemini, Vertex, AWS, OpenRouter, DeepSeek)
 *   - 프록시 URL
 *   - 커스텀 모델 (모든 고급 필드 포함)
 *   - 서브플러그인 레지스트리 + pluginStorage 스냅샷
 *   - aux slot 설정, fallback 파라미터
 *   - 스트리밍, 호환성 모드, 토큰 표시 등 플래그
 *   - normalizeImportEnvelope 에지 케이스
 *   - importPluginStorageSnapshot 에지 케이스 (removeItem 없는 환경)
 *   - parseCustomModelsValue 에지 케이스
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks (모든 프로바이더 키 + 고급 설정 포함) ───

const h = vi.hoisted(() => {
    /** 전체 매니지드 설정 시뮬레이션 */
    const fullSettings = {
        // ── OpenAI ──
        cpm_openai_key: 'sk-openai-12345',
        cpm_openai_url: 'https://api.openai.com/v1',
        cpm_openai_model: 'gpt-4.1',
        cpm_openai_reasoning: 'medium',
        cpm_openai_verbosity: 'low',
        common_openai_servicetier: 'default',
        cpm_openai_prompt_cache_retention: 'none',
        cpm_dynamic_openai: 'true',
        // ── Anthropic ──
        cpm_anthropic_key: 'sk-ant-api-key-67890',
        cpm_anthropic_url: 'https://api.anthropic.com',
        cpm_anthropic_model: 'claude-sonnet-4-20250514',
        cpm_anthropic_thinking_budget: '4096',
        cpm_anthropic_thinking_effort: 'high',
        chat_claude_caching: 'true',
        chat_claude_cachingBreakpoints: '3',
        chat_claude_cachingMaxExtension: '10',
        cpm_anthropic_cache_ttl: '3600',
        cpm_dynamic_anthropic: 'true',
        // ── Gemini ──
        cpm_gemini_key: 'AIzaSy-gemini-key',
        cpm_gemini_model: 'gemini-2.5-pro',
        cpm_gemini_thinking_level: 'high',
        cpm_gemini_thinking_budget: '8192',
        chat_gemini_preserveSystem: 'true',
        chat_gemini_showThoughtsToken: 'true',
        chat_gemini_useThoughtSignature: 'false',
        chat_gemini_usePlainFetch: 'true',
        cpm_dynamic_googleai: '',
        // ── Vertex ──
        cpm_vertex_key_json: '{"type":"service_account","project_id":"my-project"}',
        cpm_vertex_location: 'us-central1',
        cpm_vertex_model: 'gemini-2.5-pro',
        cpm_vertex_thinking_level: 'low',
        cpm_vertex_thinking_budget: '1024',
        cpm_vertex_claude_thinking_budget: '2048',
        cpm_vertex_claude_effort: 'medium',
        chat_vertex_preserveSystem: 'false',
        chat_vertex_showThoughtsToken: 'true',
        chat_vertex_useThoughtSignature: 'true',
        cpm_dynamic_vertexai: 'true',
        // ── AWS ──
        cpm_aws_key: 'AKIAIOSFODNN7EXAMPLE',
        cpm_aws_secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        cpm_aws_region: 'us-east-1',
        cpm_aws_thinking_budget: '2048',
        cpm_aws_thinking_effort: 'medium',
        cpm_dynamic_aws: '',
        // ── OpenRouter ──
        cpm_openrouter_key: 'sk-or-v1-openrouter-key',
        cpm_openrouter_url: 'https://openrouter.ai/api/v1',
        cpm_openrouter_model: 'anthropic/claude-sonnet-4-20250514',
        cpm_openrouter_provider: 'anthropic',
        cpm_openrouter_reasoning: 'on',
        cpm_dynamic_openrouter: 'true',
        // ── DeepSeek ──
        cpm_deepseek_key: 'sk-deepseek-abcdef',
        cpm_deepseek_url: 'https://api.deepseek.com/v1',
        cpm_deepseek_model: 'deepseek-chat',
        cpm_dynamic_deepseek: '',
        // ── Copilot ──
        tools_githubCopilotToken: 'ghu_copilot_sample_token',
        // ── 커스텀 모델 (JSON) ──
        cpm_custom_models: JSON.stringify([
            {
                uniqueId: 'custom_1',
                name: 'Custom OpenAI Compatible',
                model: 'gpt-4.1-mini',
                url: 'https://custom-api.example.com/v1',
                key: 'sk-custom-key-1',
                proxyUrl: 'https://proxy.custom.com',
                format: 'openai',
                tok: 'o200k_base',
                responsesMode: 'on',
                thinking: 'high',
                thinkingBudget: 3072,
                maxOutputLimit: 8192,
                promptCacheRetention: 'in_memory',
                reasoning: 'high',
                verbosity: 'low',
                effort: 'medium',
                sysfirst: true,
                mergesys: true,
                altrole: false,
                mustuser: true,
                maxout: true,
                streaming: true,
                thought: true,
                adaptiveThinking: true,
                customParams: '{"temperature":0.3,"top_p":0.9}',
            },
            {
                uniqueId: 'custom_2',
                name: 'Gemini Custom',
                model: 'gemini-2.5-flash',
                url: 'https://gemini-proxy.example.com',
                key: 'gemini-custom-key',
                proxyUrl: '',
                format: 'google',
                tok: 'gemma',
                responsesMode: 'auto',
                thinking: 'none',
                thinkingBudget: 0,
                maxOutputLimit: 4096,
                promptCacheRetention: 'none',
                reasoning: 'none',
                verbosity: 'none',
                effort: 'none',
                sysfirst: false,
                mergesys: false,
                altrole: true,
                mustuser: false,
                maxout: false,
                streaming: false,
                decoupled: true,
                thought: false,
                adaptiveThinking: false,
                customParams: '',
            },
        ]),
        // ── aux slot 설정 ──
        cpm_slot_translation: 'openai/gpt-4.1-mini',
        cpm_slot_translation_max_context: '4000',
        cpm_slot_translation_max_out: '1000',
        cpm_slot_translation_temp: '0.3',
        cpm_slot_translation_top_p: '0.9',
        cpm_slot_translation_top_k: '40',
        cpm_slot_translation_rep_pen: '1.0',
        cpm_slot_translation_freq_pen: '0.0',
        cpm_slot_translation_pres_pen: '0.0',
        cpm_slot_emotion: 'gemini/gemini-2.5-flash',
        cpm_slot_emotion_max_context: '2000',
        cpm_slot_emotion_max_out: '500',
        cpm_slot_emotion_temp: '0.7',
        cpm_slot_emotion_top_p: '1.0',
        cpm_slot_emotion_top_k: '',
        cpm_slot_emotion_rep_pen: '',
        cpm_slot_emotion_freq_pen: '',
        cpm_slot_emotion_pres_pen: '',
        cpm_slot_memory: '',
        cpm_slot_memory_max_context: '',
        cpm_slot_memory_max_out: '',
        cpm_slot_memory_temp: '',
        cpm_slot_memory_top_p: '',
        cpm_slot_memory_top_k: '',
        cpm_slot_memory_rep_pen: '',
        cpm_slot_memory_freq_pen: '',
        cpm_slot_memory_pres_pen: '',
        cpm_slot_other: '',
        cpm_slot_other_max_context: '',
        cpm_slot_other_max_out: '',
        cpm_slot_other_temp: '',
        cpm_slot_other_top_p: '',
        cpm_slot_other_top_k: '',
        cpm_slot_other_rep_pen: '',
        cpm_slot_other_freq_pen: '',
        cpm_slot_other_pres_pen: '',
        // ── fallback ──
        cpm_fallback_temp: '0.7',
        cpm_fallback_max_tokens: '4096',
        cpm_fallback_top_p: '0.95',
        cpm_fallback_freq_pen: '0.0',
        cpm_fallback_pres_pen: '0.0',
        // ── 기타 플래그 ──
        cpm_enable_chat_resizer: 'true',
        cpm_transcache_display_enabled: 'true',
        cpm_show_token_usage: 'true',
        cpm_streaming_enabled: 'true',
        cpm_streaming_show_thinking: 'false',
        cpm_compatibility_mode: 'false',
        cpm_copilot_nodeless_mode: 'true',
    };

    return {
        fullSettings,
        safeGetArg: vi.fn(async (key) => fullSettings[key] ?? ''),
        Risu: {
            pluginStorage: {
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
                removeItem: vi.fn(async () => {}),
                keys: vi.fn(async () => []),
            },
        },
        SubPluginManager: {
            plugins: [],
            unloadPlugin: vi.fn(),
            loadRegistry: vi.fn(async () => {}),
            executeEnabled: vi.fn(async () => {}),
        },
        escHtml: vi.fn((s) => String(s ?? '')),
        getManagedSettingKeys: vi.fn(() => Object.keys(fullSettings)),
        getAllApiRequests: vi.fn(() => []),
        getApiRequestById: vi.fn(() => null),
    };
});

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.Risu,
    safeGetArg: (...args) => h.safeGetArg(...args),
}));
vi.mock('../src/lib/helpers.js', () => ({
    escHtml: (...args) => h.escHtml(...args),
}));
vi.mock('../src/lib/settings-backup.js', () => ({
    getManagedSettingKeys: (...args) => h.getManagedSettingKeys(...args),
}));
vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: h.SubPluginManager,
}));
vi.mock('../src/lib/api-request-log.js', () => ({
    getAllApiRequests: (...args) => h.getAllApiRequests(...args),
    getApiRequestById: (...args) => h.getApiRequestById(...args),
}));

import { initExportImport } from '../src/lib/settings-ui-panels.js';
import {
    parseCustomModelsValue,
    normalizeCustomModel,
    serializeCustomModelExport,
    serializeCustomModelsSetting,
} from '../src/lib/custom-model-serialization.js';

const flushAsyncUi = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
};

// ═════════════════════════════════════════════════════════════════
// 1. 전체 설정 내보내기 → 불러오기 라운드트립
// ═════════════════════════════════════════════════════════════════

describe('Full settings export→import round-trip', () => {
    let capturedExportJson;

    beforeEach(async () => {
        vi.clearAllMocks();
        h.safeGetArg.mockImplementation(async (key) => h.fullSettings[key] ?? '');
        h.Risu.pluginStorage.keys.mockResolvedValue([
            'cpm_installed_subplugins',
            'cpm_settings_backup',
        ]);
        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => ({
            cpm_installed_subplugins: JSON.stringify([
                { id: 'sp-trans', name: 'Translator Sub', enabled: true, code: '/* translate */' },
                { id: 'sp-emotion', name: 'Emotion Sub', enabled: false, code: '/* emotion */' },
            ]),
            cpm_settings_backup: JSON.stringify({ cpm_openai_key: 'sk-backup-copy' }),
        }[key] ?? null));
        h.SubPluginManager.plugins = [{ id: 'sp-trans' }, { id: 'sp-emotion' }];
        globalThis.alert = vi.fn();

        // ── 내보내기 수행 ──
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const origCreate = document.createElement.bind(document);
        let anchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'a') anchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        capturedExportJson = JSON.parse(decodeURIComponent(anchor.href.split(',')[1]));
        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('export envelope has version, timestamp, settings, and pluginStorage', () => {
        expect(capturedExportJson._cpmExportVersion).toBe(2);
        expect(capturedExportJson.exportedAt).toBeTruthy();
        expect(capturedExportJson.settings).toBeTruthy();
        expect(capturedExportJson.pluginStorage).toBeTruthy();
    });

    // ── 프로바이더 API 키 ──

    it('preserves all provider API keys in export', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_openai_key).toBe('sk-openai-12345');
        expect(s.cpm_anthropic_key).toBe('sk-ant-api-key-67890');
        expect(s.cpm_gemini_key).toBe('AIzaSy-gemini-key');
        expect(s.cpm_vertex_key_json).toBe('{"type":"service_account","project_id":"my-project"}');
        expect(s.cpm_aws_key).toBe('AKIAIOSFODNN7EXAMPLE');
        expect(s.cpm_aws_secret).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        expect(s.cpm_openrouter_key).toBe('sk-or-v1-openrouter-key');
        expect(s.cpm_deepseek_key).toBe('sk-deepseek-abcdef');
        expect(s.tools_githubCopilotToken).toBe('ghu_copilot_sample_token');
    });

    // ── 프록시 URL ──

    it('preserves proxy URLs for all providers', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_openai_url).toBe('https://api.openai.com/v1');
        expect(s.cpm_anthropic_url).toBe('https://api.anthropic.com');
        expect(s.cpm_openrouter_url).toBe('https://openrouter.ai/api/v1');
        expect(s.cpm_deepseek_url).toBe('https://api.deepseek.com/v1');
    });

    // ── 모델 선택 ──

    it('preserves model selections for all providers', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_openai_model).toBe('gpt-4.1');
        expect(s.cpm_anthropic_model).toBe('claude-sonnet-4-20250514');
        expect(s.cpm_gemini_model).toBe('gemini-2.5-pro');
        expect(s.cpm_vertex_model).toBe('gemini-2.5-pro');
        expect(s.cpm_openrouter_model).toBe('anthropic/claude-sonnet-4-20250514');
        expect(s.cpm_deepseek_model).toBe('deepseek-chat');
    });

    // ── 커스텀 모델 ──

    it('exports custom models with all advanced fields and API keys', () => {
        const models = JSON.parse(capturedExportJson.settings.cpm_custom_models);
        expect(models).toHaveLength(2);

        const m1 = models[0];
        expect(m1.name).toBe('Custom OpenAI Compatible');
        expect(m1.model).toBe('gpt-4.1-mini');
        expect(m1.url).toBe('https://custom-api.example.com/v1');
        expect(m1.key).toBe('sk-custom-key-1');
        expect(m1.proxyUrl).toBe('https://proxy.custom.com');
        expect(m1.format).toBe('openai');
        expect(m1.tok).toBe('o200k_base');
        expect(m1.responsesMode).toBe('on');
        expect(m1.thinking).toBe('high');
        expect(m1.thinkingBudget).toBe(3072);
        expect(m1.maxOutputLimit).toBe(8192);
        expect(m1.promptCacheRetention).toBe('in_memory');
        expect(m1.reasoning).toBe('high');
        expect(m1.verbosity).toBe('low');
        expect(m1.effort).toBe('medium');
        expect(m1.sysfirst).toBe(true);
        expect(m1.mergesys).toBe(true);
        expect(m1.altrole).toBe(false);
        expect(m1.mustuser).toBe(true);
        expect(m1.maxout).toBe(true);
        expect(m1.streaming).toBe(true);
        expect(m1.thought).toBe(true);
        expect(m1.adaptiveThinking).toBe(true);
        expect(m1.customParams).toBe('{"temperature":0.3,"top_p":0.9}');

        const m2 = models[1];
        expect(m2.name).toBe('Gemini Custom');
        expect(m2.format).toBe('google');
        expect(m2.tok).toBe('gemma');
        expect(m2.key).toBe('gemini-custom-key');
    });

    // ── 서브플러그인 ──

    it('exports sub-plugin registry from pluginStorage', () => {
        const ps = capturedExportJson.pluginStorage;
        const subs = JSON.parse(ps.cpm_installed_subplugins);
        expect(subs).toHaveLength(2);
        expect(subs[0].id).toBe('sp-trans');
        expect(subs[0].name).toBe('Translator Sub');
        expect(subs[0].enabled).toBe(true);
        expect(subs[1].id).toBe('sp-emotion');
        expect(subs[1].enabled).toBe(false);
    });

    it('exports settings backup from pluginStorage', () => {
        const backup = JSON.parse(capturedExportJson.pluginStorage.cpm_settings_backup);
        expect(backup.cpm_openai_key).toBe('sk-backup-copy');
    });

    // ── aux 슬롯 ──

    it('preserves aux slot settings (translation, emotion)', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_slot_translation).toBe('openai/gpt-4.1-mini');
        expect(s.cpm_slot_translation_temp).toBe('0.3');
        expect(s.cpm_slot_translation_top_p).toBe('0.9');
        expect(s.cpm_slot_emotion).toBe('gemini/gemini-2.5-flash');
        expect(s.cpm_slot_emotion_temp).toBe('0.7');
    });

    // ── fallback 파라미터 ──

    it('preserves fallback parameters', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_fallback_temp).toBe('0.7');
        expect(s.cpm_fallback_max_tokens).toBe('4096');
        expect(s.cpm_fallback_top_p).toBe('0.95');
    });

    // ── 기타 플래그 ──

    it('preserves miscellaneous flags', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_enable_chat_resizer).toBe('true');
        expect(s.cpm_streaming_enabled).toBe('true');
        expect(s.cpm_streaming_show_thinking).toBe('false');
        expect(s.cpm_compatibility_mode).toBe('false');
        expect(s.cpm_copilot_nodeless_mode).toBe('true');
        expect(s.cpm_show_token_usage).toBe('true');
        expect(s.cpm_transcache_display_enabled).toBe('true');
    });

    // ── 사고 / reasoning 설정 ──

    it('preserves thinking and reasoning config across providers', () => {
        const s = capturedExportJson.settings;
        expect(s.cpm_anthropic_thinking_budget).toBe('4096');
        expect(s.cpm_anthropic_thinking_effort).toBe('high');
        expect(s.cpm_gemini_thinking_level).toBe('high');
        expect(s.cpm_gemini_thinking_budget).toBe('8192');
        expect(s.cpm_vertex_thinking_level).toBe('low');
        expect(s.cpm_vertex_thinking_budget).toBe('1024');
        expect(s.cpm_vertex_claude_thinking_budget).toBe('2048');
        expect(s.cpm_vertex_claude_effort).toBe('medium');
        expect(s.cpm_aws_thinking_budget).toBe('2048');
        expect(s.cpm_aws_thinking_effort).toBe('medium');
        expect(s.cpm_openai_reasoning).toBe('medium');
        expect(s.cpm_openrouter_reasoning).toBe('on');
    });

    // ── 클로드 캐싱 ──

    it('preserves Claude caching settings', () => {
        const s = capturedExportJson.settings;
        expect(s.chat_claude_caching).toBe('true');
        expect(s.chat_claude_cachingBreakpoints).toBe('3');
        expect(s.chat_claude_cachingMaxExtension).toBe('10');
        expect(s.cpm_anthropic_cache_ttl).toBe('3600');
    });

    // ── 라운드트립: 내보낸 것 다시 불러오기 ──

    it('round-trips: importing the exported JSON restores all provider keys, models, proxies, and flags', async () => {
        document.body.innerHTML = `
            <button id="cpm-export-btn">export</button>
            <button id="cpm-import-btn">import</button>
            <input id="cpm_openai_key" type="text">
            <input id="cpm_anthropic_key" type="text">
            <input id="cpm_streaming_enabled" type="checkbox">
        `;
        const setVal = vi.fn();
        const reopen = vi.fn();
        h.Risu.pluginStorage.keys.mockResolvedValue([]);

        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: JSON.stringify(capturedExportJson) } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        // 모든 프로바이더 키가 setVal로 호출되었는지 확인
        const calledKeys = setVal.mock.calls.map((c) => c[0]);
        expect(calledKeys).toContain('cpm_openai_key');
        expect(calledKeys).toContain('cpm_anthropic_key');
        expect(calledKeys).toContain('cpm_gemini_key');
        expect(calledKeys).toContain('cpm_vertex_key_json');
        expect(calledKeys).toContain('cpm_aws_key');
        expect(calledKeys).toContain('cpm_aws_secret');
        expect(calledKeys).toContain('cpm_openrouter_key');
        expect(calledKeys).toContain('cpm_deepseek_key');
        expect(calledKeys).toContain('tools_githubCopilotToken');

        // 프록시 URL
        expect(calledKeys).toContain('cpm_openai_url');
        expect(calledKeys).toContain('cpm_anthropic_url');
        expect(calledKeys).toContain('cpm_openrouter_url');
        expect(calledKeys).toContain('cpm_deepseek_url');

        // 모델
        expect(calledKeys).toContain('cpm_openai_model');
        expect(calledKeys).toContain('cpm_anthropic_model');
        expect(calledKeys).toContain('cpm_gemini_model');

        // fallback
        expect(calledKeys).toContain('cpm_fallback_temp');
        expect(calledKeys).toContain('cpm_fallback_max_tokens');

        // aux slot
        expect(calledKeys).toContain('cpm_slot_translation');
        expect(calledKeys).toContain('cpm_slot_translation_temp');
        expect(calledKeys).toContain('cpm_slot_emotion');

        // 실제 값 확인 (API 키)
        const findCall = (key) => setVal.mock.calls.find((c) => c[0] === key);
        expect(findCall('cpm_openai_key')[1]).toBe('sk-openai-12345');
        expect(findCall('cpm_anthropic_key')[1]).toBe('sk-ant-api-key-67890');
        expect(findCall('cpm_aws_secret')[1]).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

        // 커스텀 모델
        const customModelsArg = findCall('cpm_custom_models')[1];
        const importedModels = JSON.parse(customModelsArg);
        expect(importedModels).toHaveLength(2);
        expect(importedModels[0].key).toBe('sk-custom-key-1');
        expect(importedModels[0].proxyUrl).toBe('https://proxy.custom.com');
        expect(importedModels[0].thinking).toBe('high');
        expect(importedModels[0].thinkingBudget).toBe(3072);
        expect(importedModels[1].format).toBe('google');

        // DOM 업데이트
        expect(document.getElementById('cpm_openai_key').value).toBe('sk-openai-12345');
        expect(document.getElementById('cpm_anthropic_key').value).toBe('sk-ant-api-key-67890');

        // 서브플러그인 pluginStorage 복원
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalledWith(
            'cpm_installed_subplugins',
            expect.stringContaining('sp-trans')
        );

        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        expect(reopen).toHaveBeenCalled();
        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('round-trip: sub-plugins are unloaded then reloaded from imported registry', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const setVal = vi.fn();
        const reopen = vi.fn();
        h.SubPluginManager.plugins = [{ id: 'sp-trans' }, { id: 'sp-emotion' }];
        h.Risu.pluginStorage.keys.mockResolvedValue([]);

        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({ target: { result: JSON.stringify(capturedExportJson) } });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, reopen);
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(h.SubPluginManager.unloadPlugin).toHaveBeenCalledWith('sp-trans');
        expect(h.SubPluginManager.unloadPlugin).toHaveBeenCalledWith('sp-emotion');
        expect(h.SubPluginManager.loadRegistry).toHaveBeenCalled();
        expect(h.SubPluginManager.executeEnabled).toHaveBeenCalled();

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });
});

// ═════════════════════════════════════════════════════════════════
// 2. normalizeImportEnvelope 에지 케이스
// ═════════════════════════════════════════════════════════════════

describe('Import envelope edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.alert = vi.fn();
        h.Risu.pluginStorage.keys.mockResolvedValue([]);
        h.Risu.pluginStorage.getItem.mockResolvedValue(null);
        h.SubPluginManager.plugins = [];
    });

    function setupImportTest(jsonContent) {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() { this.onload({ target: { result: jsonContent } }); }
        }
        vi.stubGlobal('FileReader', MockFileReader);
        return { createdInput: () => createdInput, cleanup: () => Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate }) };
    }

    it('rejects null JSON value', async () => {
        const { createdInput, cleanup } = setupImportTest('null');
        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일'));
        cleanup();
    });

    it('rejects array JSON value', async () => {
        const { createdInput, cleanup } = setupImportTest('[1,2,3]');
        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일'));
        cleanup();
    });

    it('rejects number JSON value', async () => {
        const { createdInput, cleanup } = setupImportTest('42');
        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일'));
        cleanup();
    });

    it('rejects boolean JSON value', async () => {
        const { createdInput, cleanup } = setupImportTest('true');
        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('설정 파일'));
        cleanup();
    });

    it('treats a plain object without envelope keys as legacy settings-only import', async () => {
        const { createdInput, cleanup } = setupImportTest('{"cpm_openai_key":"sk-legacy-key","cpm_fallback_temp":"0.5"}');
        const setVal = vi.fn();
        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(setVal).toHaveBeenCalledWith('cpm_openai_key', 'sk-legacy-key');
        expect(setVal).toHaveBeenCalledWith('cpm_fallback_temp', '0.5');
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        cleanup();
    });

    it('handles envelope with missing settings/pluginStorage gracefully (uses empty objects)', async () => {
        const { createdInput, cleanup } = setupImportTest('{"_cpmExportVersion":2}');
        const setVal = vi.fn();
        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        // Should succeed with no settings to apply
        expect(setVal).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        cleanup();
    });

    it('handles envelope with settings=null and pluginStorage=null gracefully', async () => {
        const { createdInput, cleanup } = setupImportTest('{"_cpmExportVersion":2,"settings":null,"pluginStorage":null}');
        const setVal = vi.fn();
        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        const input = createdInput();
        Object.defineProperty(input, 'files', { value: [{ name: 'f.json' }], configurable: true });
        input.onchange({ target: input });
        await flushAsyncUi();

        expect(setVal).not.toHaveBeenCalled();
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');
        cleanup();
    });
});

// ═════════════════════════════════════════════════════════════════
// 3. importPluginStorageSnapshot 에지 케이스
// ═════════════════════════════════════════════════════════════════

describe('Import pluginStorage edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.alert = vi.fn();
        h.SubPluginManager.plugins = [];
    });

    it('falls back to setItem("") when removeItem is not available on pluginStorage', async () => {
        // removeItem 제거
        const origRemoveItem = h.Risu.pluginStorage.removeItem;
        h.Risu.pluginStorage.removeItem = 'not-a-function';
        h.Risu.pluginStorage.keys.mockResolvedValue(['cpm_old_orphan_key']);

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: {},
                            pluginStorage: { cpm_new_key: 'new-value' },
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        const setVal = vi.fn();
        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'f.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        // cpm_old_orphan_key는 removeItem 대신 setItem('', '')으로 삭제됨
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalledWith('cpm_old_orphan_key', '');
        // 새 키 추가
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalledWith('cpm_new_key', 'new-value');
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');

        h.Risu.pluginStorage.removeItem = origRemoveItem;
        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('does not import pluginStorage keys that lack the cpm prefix', async () => {
        h.Risu.pluginStorage.keys.mockResolvedValue([]);

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: {},
                            pluginStorage: {
                                cpm_valid_key: 'yes',
                                not_a_cpm_key: 'should_be_skipped',
                                random_other: 'nope',
                            },
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'f.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        const setItemCalls = h.Risu.pluginStorage.setItem.mock.calls.map((c) => c[0]);
        expect(setItemCalls).toContain('cpm_valid_key');
        expect(setItemCalls).not.toContain('not_a_cpm_key');
        expect(setItemCalls).not.toContain('random_other');

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('handles pluginStorage.keys() throwing an error during export', async () => {
        h.Risu.pluginStorage.keys.mockRejectedValue(new Error('keys() unavailable'));
        h.getManagedSettingKeys.mockReturnValue(['cpm_key1']);
        h.safeGetArg.mockResolvedValue('val1');

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const origCreate = document.createElement.bind(document);
        let anchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'a') anchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        // Should still export — keys() error is caught, falls back to KNOWN keys only
        const exported = JSON.parse(decodeURIComponent(anchor.href.split(',')[1]));
        expect(exported.settings.cpm_key1).toBe('val1');
        expect(exported.pluginStorage).toBeDefined();

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('handles pluginStorage.getItem throwing during export (skips failed keys)', async () => {
        h.Risu.pluginStorage.keys.mockResolvedValue(['cpm_ok_key', 'cpm_bad_key']);
        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => {
            if (key === 'cpm_bad_key') throw new Error('read error');
            return 'good-value';
        });
        h.getManagedSettingKeys.mockReturnValue([]);

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const origCreate = document.createElement.bind(document);
        let anchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'a') anchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        const exported = JSON.parse(decodeURIComponent(anchor.href.split(',')[1]));
        expect(exported.pluginStorage.cpm_ok_key).toBe('good-value');
        expect(exported.pluginStorage.cpm_bad_key).toBeUndefined();

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });
});

// ═════════════════════════════════════════════════════════════════
// 4. parseCustomModelsValue 추가 에지 케이스
// ═════════════════════════════════════════════════════════════════

describe('parseCustomModelsValue — additional edge cases', () => {
    it('returns empty array for number input', () => {
        expect(parseCustomModelsValue(42)).toEqual([]);
    });

    it('returns empty array for boolean input', () => {
        expect(parseCustomModelsValue(true)).toEqual([]);
        expect(parseCustomModelsValue(false)).toEqual([]);
    });

    it('returns empty array for object (non-array) input', () => {
        expect(parseCustomModelsValue({ key: 'val' })).toEqual([]);
    });

    it('returns empty array for undefined', () => {
        expect(parseCustomModelsValue(undefined)).toEqual([]);
    });

    it('returns empty array for null', () => {
        expect(parseCustomModelsValue(null)).toEqual([]);
    });

    it('filters out non-object entries from array', () => {
        expect(parseCustomModelsValue([{ name: 'A' }, 'stringval', 123, null, undefined, { name: 'B' }])).toEqual([{ name: 'A' }, { name: 'B' }]);
    });

    it('parses JSON string with non-array result to empty', () => {
        expect(parseCustomModelsValue('"just-a-string"')).toEqual([]);
        expect(parseCustomModelsValue('123')).toEqual([]);
        expect(parseCustomModelsValue('null')).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════
// 5. normalizeCustomModel 추가 에지 케이스
// ═════════════════════════════════════════════════════════════════

describe('normalizeCustomModel — additional branch coverage', () => {
    it('uses default streaming=false when neither streaming nor decoupled is set', () => {
        const m = normalizeCustomModel({ name: 'X' });
        expect(m.streaming).toBe(false);
        expect(m.decoupled).toBe(true);
    });

    it('explicitly set streaming=true overrides decoupled derivation', () => {
        const m = normalizeCustomModel({ streaming: true });
        expect(m.streaming).toBe(true);
        expect(m.decoupled).toBe(false);
    });

    it('explicitly set streaming=false with decoupled=false — streaming wins', () => {
        const m = normalizeCustomModel({ streaming: false, decoupled: false });
        expect(m.streaming).toBe(false);
        expect(m.decoupled).toBe(false);
    });

    it('handles completely empty raw object', () => {
        const m = normalizeCustomModel({});
        expect(m.name).toBe('');
        expect(m.model).toBe('');
        expect(m.url).toBe('');
        expect(m.format).toBe('openai');
        expect(m.tok).toBe('o200k_base');
    });

    it('handles null raw gracefully', () => {
        const m = normalizeCustomModel(null);
        expect(m.name).toBe('');
        expect(m.streaming).toBe(false);
    });

    it('handles undefined raw gracefully', () => {
        const m = normalizeCustomModel(undefined);
        expect(m.name).toBe('');
    });

    it('excludes key when includeKey is false', () => {
        const m = normalizeCustomModel({ key: 'secret' }, { includeKey: false });
        expect(m.key).toBeUndefined();
    });

    it('excludes uniqueId when includeUniqueId is false', () => {
        const m = normalizeCustomModel({ uniqueId: 'custom_1' }, { includeUniqueId: false });
        expect(m.uniqueId).toBeUndefined();
    });

    it('excludes _tag when includeTag is false', () => {
        const m = normalizeCustomModel({ _tag: 'test' }, { includeTag: false });
        expect(m._tag).toBeUndefined();
    });

    it('adds _cpmModelExport marker when includeExportMarker is true', () => {
        const m = normalizeCustomModel({ name: 'X' }, { includeExportMarker: true });
        expect(m._cpmModelExport).toBe(true);
    });

    it('does not add _cpmModelExport when includeExportMarker is false', () => {
        const m = normalizeCustomModel({ name: 'X' }, { includeExportMarker: false });
        expect(m._cpmModelExport).toBeUndefined();
    });

    it('omits uniqueId when raw does not have it', () => {
        const m = normalizeCustomModel({ name: 'NoId' }, { includeUniqueId: true });
        expect(m.uniqueId).toBeUndefined();
    });

    it('omits _tag when raw does not have it', () => {
        const m = normalizeCustomModel({ name: 'NoTag' }, { includeTag: true });
        expect(m._tag).toBeUndefined();
    });

    it('converts NaN thinkingBudget to 0', () => {
        const m = normalizeCustomModel({ thinkingBudget: 'not-a-number' });
        expect(m.thinkingBudget).toBe(0);
    });

    it('converts Infinity maxOutputLimit to 0', () => {
        const m = normalizeCustomModel({ maxOutputLimit: Infinity });
        // Infinity is a number but not Number.isFinite, so toInteger returns 0
        expect(m.maxOutputLimit).toBe(0);
    });

    it('toBool handles zero as false', () => {
        const m = normalizeCustomModel({ sysfirst: 0, mergesys: 0 });
        expect(m.sysfirst).toBe(false);
        expect(m.mergesys).toBe(false);
    });

    it('toBool handles non-truthy string as false', () => {
        const m = normalizeCustomModel({ sysfirst: 'false', mergesys: 'no', altrole: 'off', mustuser: '0', maxout: '' });
        expect(m.sysfirst).toBe(false);
        expect(m.mergesys).toBe(false);
        expect(m.altrole).toBe(false);
        expect(m.mustuser).toBe(false);
        expect(m.maxout).toBe(false);
    });

    it('toBool handles null and undefined as false', () => {
        const m = normalizeCustomModel({ sysfirst: null, mergesys: undefined });
        expect(m.sysfirst).toBe(false);
        expect(m.mergesys).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════
// 6. serializeCustomModelExport 추가 케이스
// ═════════════════════════════════════════════════════════════════

describe('serializeCustomModelExport — additional cases', () => {
    it('strips key, uniqueId, _tag and adds _cpmModelExport', () => {
        const exported = serializeCustomModelExport({
            uniqueId: 'custom_1', name: 'X', model: 'Y', key: 'secret', _tag: 'internal',
            proxyUrl: '  https://proxy.com  ',
            streaming: true,
        });
        expect(exported.key).toBeUndefined();
        expect(exported.uniqueId).toBeUndefined();
        expect(exported._tag).toBeUndefined();
        expect(exported._cpmModelExport).toBe(true);
        expect(exported.proxyUrl).toBe('https://proxy.com');
        expect(exported.streaming).toBe(true);
    });

    it('produces valid export from empty model without crashing', () => {
        const exported = serializeCustomModelExport({});
        expect(exported._cpmModelExport).toBe(true);
        expect(exported.name).toBe('');
        expect(exported.format).toBe('openai');
    });
});

// ═════════════════════════════════════════════════════════════════
// 7. serializeCustomModelsSetting 추가 케이스
// ═════════════════════════════════════════════════════════════════

describe('serializeCustomModelsSetting — additional cases', () => {
    it('handles empty array input', () => {
        expect(serializeCustomModelsSetting([])).toBe('[]');
    });

    it('handles empty string input', () => {
        expect(serializeCustomModelsSetting('')).toBe('[]');
    });

    it('handles null input', () => {
        expect(serializeCustomModelsSetting(null)).toBe('[]');
    });

    it('handles undefined input', () => {
        expect(serializeCustomModelsSetting(undefined)).toBe('[]');
    });

    it('strips keys by default', () => {
        const result = JSON.parse(serializeCustomModelsSetting([{ name: 'A', key: 'secret' }]));
        expect(result[0].key).toBeUndefined();
    });

    it('preserves keys when includeKey is true', () => {
        const result = JSON.parse(serializeCustomModelsSetting([{ name: 'A', key: 'secret' }], { includeKey: true }));
        expect(result[0].key).toBe('secret');
    });

    it('normalizes all advanced fields through serialization', () => {
        const input = [{
            name: 'Test',
            model: 'gpt-test',
            responsesMode: 'on',
            thinking: 'high',
            thinkingBudget: '2048',
            maxOutputLimit: '4096',
            promptCacheRetention: '24h',
            reasoning: 'medium',
            verbosity: 'low',
            effort: 'high',
            sysfirst: 'true',
            mergesys: '1',
            altrole: 'yes',
            mustuser: 'on',
            maxout: true,
            streaming: 'true',
            thought: 'true',
            adaptiveThinking: 'false',
            customParams: '{}',
        }];
        const result = JSON.parse(serializeCustomModelsSetting(input));
        expect(result[0]).toMatchObject({
            responsesMode: 'on',
            thinking: 'high',
            thinkingBudget: 2048,
            maxOutputLimit: 4096,
            promptCacheRetention: '24h',
            reasoning: 'medium',
            verbosity: 'low',
            effort: 'high',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: true,
            thought: true,
            adaptiveThinking: false,
            customParams: '{}',
        });
    });
});

// ═════════════════════════════════════════════════════════════════
// 8. 부분 데이터 불러오기 (일부 프로바이더만 설정된 경우)
// ═════════════════════════════════════════════════════════════════

describe('Partial import — only some providers configured', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.alert = vi.fn();
        h.Risu.pluginStorage.keys.mockResolvedValue([]);
        h.SubPluginManager.plugins = [];
    });

    it('imports settings with only OpenAI configured (other providers empty)', async () => {
        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const setVal = vi.fn();
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });

        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: {
                                cpm_openai_key: 'sk-only-openai',
                                cpm_openai_url: 'https://api.openai.com/v1',
                                cpm_openai_model: 'gpt-4.1',
                            },
                            pluginStorage: {},
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(setVal, vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'settings.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(setVal).toHaveBeenCalledWith('cpm_openai_key', 'sk-only-openai');
        expect(setVal).toHaveBeenCalledWith('cpm_openai_url', 'https://api.openai.com/v1');
        expect(setVal).toHaveBeenCalledWith('cpm_openai_model', 'gpt-4.1');
        expect(setVal).toHaveBeenCalledTimes(3);
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });
});

// ═════════════════════════════════════════════════════════════════
// 9. SubPluginManager edge cases during import
// ═════════════════════════════════════════════════════════════════

describe('SubPlugin handling during import', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.alert = vi.fn();
        h.Risu.pluginStorage.keys.mockResolvedValue([]);
    });

    it('handles unloadPlugin throwing for one plugin without crashing', async () => {
        h.SubPluginManager.plugins = [{ id: 'sp-crash' }, { id: 'sp-ok' }];
        h.SubPluginManager.unloadPlugin.mockImplementation((id) => {
            if (id === 'sp-crash') throw new Error('unload error');
        });

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: {},
                            pluginStorage: { cpm_installed_subplugins: '[]' },
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'f.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(h.SubPluginManager.unloadPlugin).toHaveBeenCalledWith('sp-crash');
        expect(h.SubPluginManager.unloadPlugin).toHaveBeenCalledWith('sp-ok');
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('skips loadRegistry/executeEnabled when imported data has no sub-plugin registry key', async () => {
        h.SubPluginManager.plugins = [];
        h.Risu.pluginStorage.keys.mockResolvedValue([]);

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: { cpm_openai_key: 'sk-x' },
                            pluginStorage: { cpm_settings_backup: '{}' },
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'f.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        // since pluginStorage does not contain 'cpm_installed_subplugins', loadRegistry should not be called
        expect(h.SubPluginManager.loadRegistry).not.toHaveBeenCalled();
        expect(h.SubPluginManager.executeEnabled).not.toHaveBeenCalled();

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('handles loadRegistry throwing without crashing the import', async () => {
        h.SubPluginManager.plugins = [];
        h.SubPluginManager.loadRegistry.mockRejectedValue(new Error('registry corrupt'));

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        let createdInput = null;
        const origCreate = document.createElement.bind(document);
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'input') { createdInput = el; el.click = vi.fn(); }
                return el;
            },
        });
        class MockFileReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify({
                            _cpmExportVersion: 2,
                            settings: {},
                            pluginStorage: { cpm_installed_subplugins: '[{"id":"sp1"}]' },
                        }),
                    },
                });
            }
        }
        vi.stubGlobal('FileReader', MockFileReader);

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-import-btn').click();
        Object.defineProperty(createdInput, 'files', { value: [{ name: 'f.json' }], configurable: true });
        createdInput.onchange({ target: createdInput });
        await flushAsyncUi();

        expect(h.SubPluginManager.loadRegistry).toHaveBeenCalled();
        // Should still succeed — the try/catch in the import catches this
        expect(globalThis.alert).toHaveBeenCalledWith('설정을 성공적으로 불러왔습니다!');

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });
});

// ═════════════════════════════════════════════════════════════════
// 10. pluginStorage: dynamic keys from Risu.pluginStorage.keys()
// ═════════════════════════════════════════════════════════════════

describe('Export with dynamic pluginStorage discovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.alert = vi.fn();
        h.getManagedSettingKeys.mockReturnValue([]);
    });

    it('discovers dynamic cpm_ keys from pluginStorage.keys() and includes them in export', async () => {
        h.Risu.pluginStorage.keys.mockResolvedValue([
            'cpm_installed_subplugins',
            'cpm_custom_dynamic_key',
            'cpm-hyphen-key',
            'other_non_cpm',
        ]);
        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => ({
            cpm_installed_subplugins: '[]',
            cpm_custom_dynamic_key: 'dynamic-value',
            'cpm-hyphen-key': 'hyphen-value',
        }[key] ?? null));

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const origCreate = document.createElement.bind(document);
        let anchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'a') anchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        const exported = JSON.parse(decodeURIComponent(anchor.href.split(',')[1]));
        expect(exported.pluginStorage.cpm_installed_subplugins).toBe('[]');
        expect(exported.pluginStorage.cpm_custom_dynamic_key).toBe('dynamic-value');
        expect(exported.pluginStorage['cpm-hyphen-key']).toBe('hyphen-value');
        // non-cpm keys should not appear in dynamic discovery since the pattern filters them
        // But note: getCpmPluginStorageKeys includes both KNOWN_KEYS + pattern-matched keys
        // 'other_non_cpm' does not match /^cpm[_-]/ so should be excluded
        expect(exported.pluginStorage.other_non_cpm).toBeUndefined();

        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });

    it('falls back to KNOWN_KEYS when pluginStorage.keys is not a function', async () => {
        const origKeys = h.Risu.pluginStorage.keys;
        h.Risu.pluginStorage.keys = undefined;

        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => {
            if (key === 'cpm_installed_subplugins') return '[]';
            if (key === 'cpm_settings_backup') return '{}';
            return null;
        });

        document.body.innerHTML = '<button id="cpm-export-btn">export</button><button id="cpm-import-btn">import</button>';
        const origCreate = document.createElement.bind(document);
        let anchor = null;
        Object.defineProperty(document, 'createElement', {
            configurable: true,
            value(tag, opts) {
                const el = origCreate(tag, opts);
                if (String(tag).toLowerCase() === 'a') anchor = el;
                return el;
            },
        });

        initExportImport(vi.fn(), vi.fn());
        document.getElementById('cpm-export-btn').click();
        await flushAsyncUi();

        const exported = JSON.parse(decodeURIComponent(anchor.href.split(',')[1]));
        expect(exported.pluginStorage.cpm_installed_subplugins).toBe('[]');
        expect(exported.pluginStorage.cpm_settings_backup).toBe('{}');

        h.Risu.pluginStorage.keys = origKeys;
        Object.defineProperty(document, 'createElement', { configurable: true, value: origCreate });
    });
});
