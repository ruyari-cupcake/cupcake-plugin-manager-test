// @ts-check
/**
 * settings-backup.js — Persistent settings backup/restore via pluginStorage.
 * Survives plugin deletion — settings can be auto-restored on reinstall.
 */
import { Risu, safeGetArg, registeredProviderTabs } from './shared-state.js';
import { parseAndValidate, schemas } from './schema.js';

export const AUX_SETTING_SLOTS = ['translation', 'emotion', 'memory', 'other'];

export function getAuxSettingKeys() {
    return AUX_SETTING_SLOTS.flatMap(s => [
        `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
        `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
        `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
    ]);
}

export const NON_PREFIX_MANAGED_SETTING_KEYS = [
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

export const BASE_SETTING_KEYS = [
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
export function isManagedSettingKey(key) {
    return typeof key === 'string' && key.length > 0 && (
        key.startsWith('cpm_')
        || key.startsWith('cpm-')
        || NON_PREFIX_MANAGED_SETTING_KEYS.includes(key)
    );
}

export function getManagedSettingKeys(providerTabs = registeredProviderTabs) {
    const dynamicKeys = Array.isArray(providerTabs)
        ? providerTabs.flatMap(tab => (/** @type {Record<string, any>} */ (tab))?.exportKeys || []).filter(isManagedSettingKey)
        : [];
    return [...new Set([...getAuxSettingKeys(), ...BASE_SETTING_KEYS, ...dynamicKeys])];
}

export const SettingsBackup = {
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
