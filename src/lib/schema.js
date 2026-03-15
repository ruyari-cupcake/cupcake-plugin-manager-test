// @ts-check
/**
 * schema.js — Lightweight structural schema validation for parsed JSON.
 *
 * No external dependencies. Validates shapes of objects/arrays coming
 * from pluginStorage, remote update bundles, and backup restore paths.
 *
 * Usage:
 *   import { validateSchema, schemas } from './schema.js';
 *   const result = validateSchema(data, schemas.subPluginRegistry);
 *   if (!result.ok) { console.error(result.error); data = result.fallback; }
 */

/**
 * @typedef {{ ok: true, data: any, error?: undefined, fallback?: undefined }} ValidationSuccess
 */

/**
 * @typedef {{ ok: false, error: string, fallback: any, data?: undefined }} ValidationFailure
 */

/**
 * @typedef {ValidationSuccess | ValidationFailure} ValidationResult
 */

/**
 * @typedef {Object} SchemaRule
 * @property {'array'|'object'|'string'|'number'|'boolean'} type
 * @property {any} [fallback]          - value to use on validation failure
 * @property {Object<string, SchemaRule>} [properties] - for object type
 * @property {SchemaRule} [items]      - for array items
 * @property {string[]} [required]     - required keys for object type
 * @property {number} [maxItems]       - max array length (soft truncate)
 * @property {number} [maxLength]      - max string length
 */

/**
 * Validate `data` against a schema rule. Returns { ok, data/error, fallback }.
 * @param {any} data
 * @param {SchemaRule} schema
 * @returns {ValidationResult}
 */
export function validateSchema(data, schema) {
    if (data === null || data === undefined) {
        return { ok: false, error: 'Data is null/undefined', fallback: schema.fallback };
    }

    // Type check
    if (schema.type === 'array') {
        if (!Array.isArray(data)) {
            return { ok: false, error: `Expected array, got ${typeof data}`, fallback: schema.fallback ?? [] };
        }
        // maxItems soft truncation
        if (schema.maxItems && data.length > schema.maxItems) {
            data = data.slice(0, schema.maxItems);
        }
        // Validate each item if items schema exists
        if (schema.items) {
            const validItems = [];
            for (let i = 0; i < data.length; i++) {
                const itemResult = validateSchema(data[i], schema.items);
                if (itemResult.ok) {
                    validItems.push(itemResult.data);
                }
                // Skip invalid items silently (filter instead of fail)
            }
            return { ok: true, data: validItems };
        }
        return { ok: true, data };
    }

    if (schema.type === 'object') {
        if (typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, error: `Expected object, got ${Array.isArray(data) ? 'array' : typeof data}`, fallback: schema.fallback ?? {} };
        }
        // Required keys
        if (schema.required) {
            for (const key of schema.required) {
                if (!(key in data) || data[key] === undefined) {
                    return { ok: false, error: `Missing required key: ${key}`, fallback: schema.fallback ?? {} };
                }
            }
        }
        // Validate known properties
        if (schema.properties) {
            const out = { ...data };
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in out) {
                    const propResult = validateSchema(out[key], propSchema);
                    if (!propResult.ok) {
                        // Use property-level fallback
                        out[key] = propResult.fallback;
                    } else {
                        out[key] = propResult.data;
                    }
                }
            }
            return { ok: true, data: out };
        }
        return { ok: true, data };
    }

    if (schema.type === 'string') {
        if (typeof data !== 'string') {
            return { ok: false, error: `Expected string, got ${typeof data}`, fallback: schema.fallback ?? '' };
        }
        if (schema.maxLength && data.length > schema.maxLength) {
            data = data.substring(0, schema.maxLength);
        }
        return { ok: true, data };
    }

    if (schema.type === 'number') {
        if (typeof data !== 'number' || !isFinite(data)) {
            return { ok: false, error: `Expected finite number, got ${data}`, fallback: schema.fallback ?? 0 };
        }
        return { ok: true, data };
    }

    if (schema.type === 'boolean') {
        if (typeof data !== 'boolean') {
            return { ok: false, error: `Expected boolean, got ${typeof data}`, fallback: schema.fallback ?? false };
        }
        return { ok: true, data };
    }

    return { ok: true, data };
}

/**
 * Convenience: parse JSON string + validate in one step.
 * @param {string} jsonString
 * @param {SchemaRule} schema
 * @returns {ValidationResult}
 */
export function parseAndValidate(jsonString, schema) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        return { ok: false, error: `JSON parse failed: ${/** @type {Error} */ (e).message}`, fallback: schema.fallback };
    }
    return validateSchema(parsed, schema);
}


// ════════════════════════════════════════════════════════════════
// Pre-defined schemas for CPM data structures
// ════════════════════════════════════════════════════════════════

/** @type {SchemaRule} Sub-plugin registry entry */
const subPluginEntry = {
    type: 'object',
    required: ['id', 'code'],
    properties: {
        id:          { type: 'string', fallback: '' },
        name:        { type: 'string', fallback: 'Unnamed Sub-Plugin' },
        version:     { type: 'string', fallback: '' },
        description: { type: 'string', fallback: '' },
        icon:        { type: 'string', fallback: '📦' },
        code:        { type: 'string', fallback: '' },
        enabled:     { type: 'boolean', fallback: true },
        updateUrl:   { type: 'string', fallback: '' },
    },
    fallback: null,
};

export const schemas = {
    /** Array of installed sub-plugins (pluginStorage) */
    subPluginRegistry: {
        type: /** @type {const} */ ('array'),
        items: subPluginEntry,
        maxItems: 100,
        fallback: [],
    },

    /** update-bundle versions manifest (from remote) */
    updateBundleVersions: {
        type: /** @type {const} */ ('object'),
        fallback: {},
    },

    /** update-bundle top-level structure */
    updateBundle: {
        type: /** @type {const} */ ('object'),
        required: ['versions'],
        properties: {
            versions: { type: /** @type {const} */ ('object'), fallback: {} },
            code:     { type: /** @type {const} */ ('object'), fallback: {} },
        },
        fallback: { versions: {}, code: {} },
    },

    /** Settings backup (key-value map) */
    settingsBackup: {
        type: /** @type {const} */ ('object'),
        fallback: {},
    },

    /** boot-status diagnostic (pluginStorage) */
    bootStatus: {
        type: /** @type {const} */ ('object'),
        properties: {
            ts:      { type: 'number', fallback: 0 },
            version: { type: 'string', fallback: '' },
        },
        fallback: {},
    },
};
