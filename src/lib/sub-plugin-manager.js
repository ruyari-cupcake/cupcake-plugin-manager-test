// @ts-check
/**
 * sub-plugin-manager.js — Dynamic sub-plugin lifecycle management.
 * Handles install, remove, toggle, execute, hot-reload, and auto-update.
 *
 * Auto-update logic is defined in auto-updater.js and update-toast.js,
 * then spread into SubPluginManager to keep this file focused on core CRUD
 * and hot-reload infrastructure.
 */
import {
    Risu, state,
    customFetchers, registeredProviderTabs,
    pendingDynamicFetchers, _pluginRegistrations,
    _pluginCleanupHooks, isDynamicFetchEnabled,
} from './shared-state.js';
import { _executeViaScriptTag } from './csp-exec.js';
import { getManagedSettingKeys } from './settings-backup.js';
import { parseAndValidate, schemas } from './schema.js';
import { autoUpdaterMethods, _computeSHA256 } from './auto-updater.js';
import { updateToastMethods } from './update-toast.js';

// Re-export for external consumers and tests
export { _computeSHA256 };

// DI: _exposeScopeToWindow is injected by init.js to avoid circular dependency.
let _exposeScopeToWindow = () => {};
/** @param {() => void} fn */
export function setExposeScopeFunction(fn) { _exposeScopeToWindow = fn; }

export const SubPluginManager = {
    STORAGE_KEY: 'cpm_installed_subplugins',
    /** @type {any[]} */
    plugins: [],

    async loadRegistry() {
        try {
            const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
            if (!data) { this.plugins = []; return; }
            const result = parseAndValidate(data, schemas.subPluginRegistry);
            if (!result.ok) {
                console.warn('[CPM Loader] Registry schema validation failed:', result.error);
                this.plugins = result.fallback;
            } else {
                this.plugins = result.data;
            }
        } catch (e) {
            console.error('[CPM Loader] Failed to load registry', e);
            this.plugins = [];
        }
    },

    async saveRegistry() {
        await Risu.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.plugins));
    },

    /** @param {string} code */
    extractMetadata(code) {
        const meta = { name: 'Unnamed Sub-Plugin', version: '', description: '', icon: '📦', updateUrl: '' };
        const lines = code.split(/\r?\n/);
        let parsedName = '';
        let parsedDisplayName = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (!trimmed.startsWith('//')) break;

            const nameMatch = trimmed.match(/^\/\/\s*@name\s+(.+)$/i);
            if (nameMatch && !parsedName) {
                parsedName = nameMatch[1].trim();
                continue;
            }

            const displayNameMatch = trimmed.match(/^\/\/\s*@display-name\s+(.+)$/i);
            if (displayNameMatch && !parsedDisplayName) {
                parsedDisplayName = displayNameMatch[1].trim();
                continue;
            }

            const verMatch = trimmed.match(/^\/\/\s*@version\s+(.+)$/i);
            if (verMatch && !meta.version) {
                meta.version = verMatch[1].trim();
                continue;
            }

            const descMatch = trimmed.match(/^\/\/\s*@description\s+(.+)$/i);
            if (descMatch && !meta.description) {
                meta.description = descMatch[1].trim();
                continue;
            }

            const iconMatch = trimmed.match(/^\/\/\s*@icon\s+(.+)$/i);
            if (iconMatch && meta.icon === '📦') {
                meta.icon = iconMatch[1].trim();
                continue;
            }

            const updateMatch = trimmed.match(/^\/\/\s*@update-url\s+(.+)$/i);
            if (updateMatch && !meta.updateUrl) {
                meta.updateUrl = updateMatch[1].trim();
            }
        }

        meta.name = parsedName || parsedDisplayName || meta.name;
        return meta;
    },

    /** Names that must never be installed as a sub-plugin (main plugin identifiers). */
    BLOCKED_NAMES: ['Cupcake_Provider_Manager', 'Cupcake Provider Manager'],
    MAX_INSTALL_BYTES: 300 * 1024,

    /** @param {string} code */
    getCodeSizeBytes(code) {
        try {
            if (typeof TextEncoder !== 'undefined') {
                return new TextEncoder().encode(code || '').length;
            }
        } catch (_) {}
        return String(code || '').length;
    },

    /** @param {string} code */
    async install(code) {
        const meta = this.extractMetadata(code);
        const codeSizeBytes = this.getCodeSizeBytes(code);

        if (codeSizeBytes > this.MAX_INSTALL_BYTES) {
            throw new Error(
                `서브 플러그인 용량이 너무 큽니다. ` +
                `최대 ${(this.MAX_INSTALL_BYTES / 1024).toFixed(0)}KB까지만 설치할 수 있습니다.`
            );
        }

        // Block installing the main provider-manager plugin as a sub-plugin
        if (this.BLOCKED_NAMES.some(n => n.toLowerCase() === meta.name.toLowerCase())) {
            throw new Error(
                `'${meta.name}'은(는) 메인 프로바이더 매니저 플러그인입니다. ` +
                `서브 플러그인으로 설치할 수 없습니다.`
            );
        }

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

    /** @param {string} id */
    async remove(id) {
        this.plugins = this.plugins.filter(p => p.id !== id);
        await this.saveRegistry();
    },

    /**
     * @param {string} id
     * @param {boolean} enabled
     */
    async toggle(id, enabled) {
        const p = this.plugins.find(p => p.id === id);
        if (p) {
            p.enabled = enabled;
            await this.saveRegistry();
        }
    },

    async executeEnabled() {
        _exposeScopeToWindow();
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

    /**
     * @param {string} a
     * @param {string} b
     */
    compareVersions(a, b) {
        const sa = (a || '0.0.0').replace(/[^0-9.]/g, '') || '0.0.0';
        const sb = (b || '0.0.0').replace(/[^0-9.]/g, '') || '0.0.0';
        const pa = sa.split('.').map(Number);
        const pb = sb.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (nb > na) return 1;
            if (na > nb) return -1;
        }
        return 0;
    },

    // ── Auto-update system (from auto-updater.js) ──
    ...autoUpdaterMethods,

    // ── Toast UI (from update-toast.js) ──
    ...updateToastMethods,

    // ── Hot-Reload Infrastructure ──

    /** @param {string} pluginId */
    unloadPlugin(pluginId) {
        const reg = _pluginRegistrations[pluginId];
        if (!reg) return;

        const hooks = _pluginCleanupHooks[pluginId];
        if (hooks && Array.isArray(hooks)) {
            for (const hook of hooks) {
                try {
                    const result = hook();
                    if (result && typeof result.then === 'function') {
                        result.catch((/** @type {any} */ e) => console.warn(`[CPM Loader] Async cleanup hook error for ${pluginId}:`, e.message));
                    }
                } catch (/** @type {any} */ e) { console.warn(`[CPM Loader] Cleanup hook error for ${pluginId}:`, e.message); }
            }
            delete _pluginCleanupHooks[pluginId];
        }

        for (const key of Object.keys(window)) {
            if (key.startsWith('_cpm') && key.endsWith('Cleanup') && typeof /** @type {any} */ (window)[key] === 'function') {
                const providerNames = reg.providerNames.map(n => n.toLowerCase());
                const keyLower = key.toLowerCase();
                const isRelated = providerNames.some(name => keyLower.includes(name.replace(/\s+/g, '').toLowerCase()));
                if (isRelated) {
                    try {
                        console.log(`[CPM Loader] Calling window.${key}() for plugin ${pluginId}`);
                        const result = /** @type {any} */ (window)[key]();
                        if (result && typeof result.then === 'function') {
                            result.catch((/** @type {any} */ e) => console.warn(`[CPM Loader] window.${key}() error:`, e.message));
                        }
                    } catch (/** @type {any} */ e) { console.warn(`[CPM Loader] window.${key}() error:`, e.message); }
                }
            }
        }

        for (const name of reg.providerNames) {
            delete customFetchers[name];
            state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
        }
        for (const tab of reg.tabObjects) {
            const idx = registeredProviderTabs.indexOf(tab);
            if (idx !== -1) registeredProviderTabs.splice(idx, 1);
        }
        for (const entry of reg.fetcherEntries) {
            const idx = pendingDynamicFetchers.findIndex((/** @type {any} */ f) => f.name === entry.name);
            if (idx !== -1) pendingDynamicFetchers.splice(idx, 1);
        }
        _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
        console.log(`[CPM Loader] Unloaded registrations for plugin ${pluginId}`);
    },

    /** @param {any} plugin */
    async executeOne(plugin) {
        if (!plugin || !plugin.enabled) return;
        _exposeScopeToWindow();
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

    /** @param {string} pluginId */
    async hotReload(pluginId) {
        const plugin = this.plugins.find(p => p.id === pluginId);
        if (!plugin) return false;

        this.unloadPlugin(pluginId);

        if (plugin.enabled) {
            await this.executeOne(plugin);

            const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
            for (const _entry of [...pendingDynamicFetchers]) {
                /** @type {any} */
                const { name, fetchDynamicModels } = _entry;
                if (newProviderNames.includes(name)) {
                    try {
                        const enabled = await isDynamicFetchEnabled(name);
                        if (!enabled) { console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                        console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                        const dynamicModels = await fetchDynamicModels();
                        if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                            state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
                            for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                            console.log(`[CupcakePM] \u2713 Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                        }
                    } catch (/** @type {any} */ e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
                }
            }
        }
        console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
        return true;
    },

    async hotReloadAll() {
        for (const p of this.plugins) this.unloadPlugin(p.id);
        await this.executeEnabled();
        for (const _entry of [...pendingDynamicFetchers]) {
            /** @type {any} */
            const { name, fetchDynamicModels } = _entry;
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) continue;
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter((/** @type {any} */ m) => m.provider !== name);
                    for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (/** @type {any} */ e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
        }
        console.log('[CPM Loader] Hot-reload all complete.');
    },

    // ── Purge All CPM Data ──
    // Storage keys used by CPM in pluginStorage
    _PLUGIN_STORAGE_KEYS: [
        'cpm_installed_subplugins',
        'cpm_settings_backup',
        'cpm_last_version_check',
        'cpm_last_main_version_check',
        'cpm_pending_main_update',
        'cpm_last_boot_status',
    ],

    /**
     * Completely purge ALL data stored by Cupcake Provider Manager.
     * This includes: pluginStorage items, all @arg setting keys,
     * sub-plugin registry, settings backup, and version check timestamps.
     *
     * WARNING: This is irreversible. Caller must confirm with the user first.
     * @returns {Promise<{pluginStorageCleared: number, argsCleared: number}>}
     */
    async purgeAllCpmData() {
        let pluginStorageCleared = 0;
        let argsCleared = 0;

        // 1. Clear all known pluginStorage keys
        for (const key of this._PLUGIN_STORAGE_KEYS) {
            try {
                await Risu.pluginStorage.removeItem(key);
                pluginStorageCleared++;
            } catch (/** @type {any} */ e) {
                console.warn(`[CPM Purge] Failed to remove pluginStorage key '${key}':`, e.message || e);
            }
        }

        // 2. Also try to find and remove any sub-plugin specific pluginStorage keys
        try {
            const allKeys = await Risu.pluginStorage.keys();
            for (const key of allKeys) {
                if (key.startsWith('cpm_') || key.startsWith('cpm-')) {
                    try {
                        await Risu.pluginStorage.removeItem(key);
                        pluginStorageCleared++;
                    } catch (_) { /* ignore */ }
                }
            }
        } catch (_) {
            // pluginStorage.keys() may not be available in all environments
        }

        // 3. Clear all managed @arg setting keys
        const managedKeys = getManagedSettingKeys();
        for (const key of managedKeys) {
            try {
                Risu.setArgument(key, '');
                argsCleared++;
            } catch (/** @type {any} */ e) {
                console.warn(`[CPM Purge] Failed to clear arg '${key}':`, e.message || e);
            }
        }

        // 4. Clear legacy custom model keys (cpm_c1..cpm_c10)
        const legacyFields = ['url', 'model', 'key', 'name', 'format', 'sysfirst', 'altrole', 'mustuser', 'maxout', 'mergesys', 'decoupled', 'thought', 'reasoning', 'verbosity', 'thinking', 'tok'];
        for (let i = 1; i <= 10; i++) {
            for (const field of legacyFields) {
                try {
                    Risu.setArgument(`cpm_c${i}_${field}`, '');
                    argsCleared++;
                } catch (_) { /* ignore */ }
            }
        }

        // 5. Clear in-memory state
        this.plugins = [];
        state.ALL_DEFINED_MODELS = [];
        state.CUSTOM_MODELS_CACHE = [];
        state.vertexTokenCache = { token: null, expiry: 0 };

        // 6. Clear sensitive window globals (in-memory tokens / session IDs)
        if (typeof window !== 'undefined') {
            const cpmGlobalKeys = Object.keys(window).filter(k => k.startsWith('_cpm') || k === 'CupcakePM' || k === 'CPM_VERSION' || k === 'cpmShortcutRegistered');
            for (const k of cpmGlobalKeys) {
                try { delete /** @type {any} */ (window)[k]; } catch (_) { /* ignore */ }
            }
        }

        console.log(`[CPM Purge] Complete. pluginStorage: ${pluginStorageCleared} keys, args: ${argsCleared} keys cleared.`);
        return { pluginStorageCleared, argsCleared };
    }
};
