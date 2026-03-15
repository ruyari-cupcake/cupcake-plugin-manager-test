// @ts-check
/**
 * shared-state.js — Central shared mutable state for Cupcake Provider Manager.
 *
 * Uses a state object pattern so other modules can mutate values
 * without running into ES module import-binding re-assignment restrictions.
 *
 * Also exports safeGetArg / safeGetBoolArg / isDynamicFetchEnabled which
 * depend on the Risu global.
 */

/**
 * @typedef {Object} VertexTokenCache
 * @property {string|null} token
 * @property {number} expiry
 */

/**
 * @typedef {Object} CpmState
 * @property {Array<Object>} ALL_DEFINED_MODELS
 * @property {Array<Object>} CUSTOM_MODELS_CACHE
 * @property {VertexTokenCache} vertexTokenCache
 * @property {string|null} _currentExecutingPluginId
 */

/**
 * @typedef {Object} PluginRegistration
 * @property {string[]} providerNames
 * @property {Object[]} tabObjects
 * @property {Array<{name: string, fetchDynamicModels: Function}>} fetcherEntries
 */

/** @typedef {Window & typeof globalThis & { risuai?: any, Risuai?: any }} RisuWindow */

// ─── Constants ───
export const CPM_VERSION = '1.20.13';

// ─── RisuAI Global Reference ───
const risuWindow = typeof window !== 'undefined'
    ? /** @type {RisuWindow} */ (window)
    : undefined;

export const Risu = (typeof window !== 'undefined')
    ? (risuWindow?.risuai || risuWindow?.Risuai)
    : undefined;

// ─── Mutable State Container ───
// All mutable singletons live here. Other modules import `state` and
// read/write properties directly (e.g. state.ALL_DEFINED_MODELS = [...]).
/** @type {CpmState} */
export const state = {
    ALL_DEFINED_MODELS: [],
    CUSTOM_MODELS_CACHE: [],
    vertexTokenCache: { token: null, expiry: 0 },
    _currentExecutingPluginId: null,
};

// ─── Registries (object/array refs – mutated in place) ───
/** @type {Record<string, Function>} */
export const customFetchers = {};
/** @type {Array<Object>} */
export const registeredProviderTabs = [];
/** @type {Array<Object>} */
export const pendingDynamicFetchers = [];
/** @type {Record<string, PluginRegistration>} */
export const _pluginRegistrations = {}; // pluginId -> { providerNames: [], tabObjects: [], fetcherEntries: [] }
/** @type {Record<string, Function[]>} */
export const _pluginCleanupHooks = {}; // pluginId -> function[]

// ─── Safe argument helpers (depend on Risu global) ───

/**
 * Safely read a RisuAI argument value. Returns defaultValue on error or empty.
 * @param {string} key
 * @param {string} [defaultValue='']
 * @returns {Promise<string>}
 */
export async function safeGetArg(key, defaultValue = '') {
    try {
        const val = await Risu.getArgument(key);
        return val !== undefined && val !== null && val !== '' ? val : defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Safely read a boolean argument value.
 * @param {string} key
 * @param {boolean} [defaultValue=false]
 * @returns {Promise<boolean>}
 */
export async function safeGetBoolArg(key, defaultValue = false) {
    try {
        const val = await Risu.getArgument(key);
        if (val === 'true' || val === true) return true;
        if (val === 'false' || val === false || val === '') return false;
        return defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Check if dynamic model fetching is enabled for a given provider.
 * Setting key: cpm_dynamic_<providerName_lowercase> = 'true'.
 * @param {string} providerName
 */
export async function isDynamicFetchEnabled(providerName) {
    const key = `cpm_dynamic_${providerName.toLowerCase()}`;
    try {
        const val = await safeGetArg(key);
        return val === 'true';
    } catch {
        return false;
    }
}
