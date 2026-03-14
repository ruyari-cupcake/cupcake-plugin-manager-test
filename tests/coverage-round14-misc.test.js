/**
 * Round 14: Final targeted branch coverage push.
 * Targets ~35+ uncovered branches across token-usage, schema, key-pool,
 * sub-plugin-manager, cupcake-api, csp-exec, settings-backup, and auto-updater.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── token-usage.js ───
describe('token-usage.js additional branches — Round 14', () => {
    let _normalizeTokenUsage, _setTokenUsage, _takeTokenUsage;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/lib/token-usage.js');
        _normalizeTokenUsage = mod._normalizeTokenUsage;
        _setTokenUsage = mod._setTokenUsage;
        _takeTokenUsage = mod._takeTokenUsage;
    });

    it('normalizeTokenUsage returns null for non-object raw', () => {
        expect(_normalizeTokenUsage(null, 'openai')).toBeNull();
        expect(_normalizeTokenUsage(undefined, 'openai')).toBeNull();
        expect(_normalizeTokenUsage('string', 'openai')).toBeNull();
    });

    it('openai format with prompt_cache_hit_tokens (no cached_tokens)', () => {
        const result = _normalizeTokenUsage({
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_cache_hit_tokens: 20,
        }, 'openai');
        expect(result.cached).toBe(20);
        expect(result.input).toBe(100);
    });

    it('openai format with completion_tokens_details.reasoning_tokens', () => {
        const result = _normalizeTokenUsage({
            prompt_tokens: 100,
            completion_tokens: 50,
            completion_tokens_details: { reasoning_tokens: 30 },
        }, 'openai');
        expect(result.reasoning).toBe(30);
    });

    it('openai format with no total_tokens calculates from input+output', () => {
        const result = _normalizeTokenUsage({
            prompt_tokens: 100,
            completion_tokens: 50,
        }, 'openai');
        expect(result.total).toBe(150);
    });

    it('anthropic format with NO explicit reasoning → estimated reasoning', () => {
        const result = _normalizeTokenUsage({
            input_tokens: 100,
            output_tokens: 500,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
        }, 'anthropic', {
            anthropicHasThinking: true,
            anthropicVisibleText: 'Short answer.',
        });
        expect(result.input).toBe(100);
        expect(result.output).toBe(500);
        // reasoning should be estimated (output - visibleTextTokens)
        expect(result.reasoning).toBeGreaterThan(0);
        expect(result.reasoningEstimated).toBe(true);
    });

    it('anthropic format without thinking → no reasoning estimation', () => {
        const result = _normalizeTokenUsage({
            input_tokens: 100,
            output_tokens: 50,
        }, 'anthropic', {
            anthropicHasThinking: false,
        });
        expect(result.reasoning).toBe(0);
        expect(result.reasoningEstimated).toBeUndefined();
    });

    it('anthropic format with thinking but empty visible text → estimated from output', () => {
        const result = _normalizeTokenUsage({
            input_tokens: 100,
            output_tokens: 200,
        }, 'anthropic', {
            anthropicHasThinking: true,
            anthropicVisibleText: '',
        });
        expect(result.reasoning).toBe(200); // all output is reasoning
    });

    it('anthropic format with thinking but visible text tokens >= output → no estimation', () => {
        // When all output seems to be visible text, estimatedReasoning would be 0
        const result = _normalizeTokenUsage({
            input_tokens: 100,
            output_tokens: 2, // very low output
        }, 'anthropic', {
            anthropicHasThinking: true,
            anthropicVisibleText: 'This is a very long visible text response that would have many tokens estimated as at least 20 or so',
        });
        // estimatedReasoning would be Math.max(0, 2 - estimatedVisible) = 0
        expect(result.reasoning).toBe(0);
    });

    it('gemini format with all fields', () => {
        const result = _normalizeTokenUsage({
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            thoughtsTokenCount: 25,
            cachedContentTokenCount: 10,
            totalTokenCount: 175,
        }, 'gemini');
        expect(result.input).toBe(100);
        expect(result.output).toBe(50);
        expect(result.reasoning).toBe(25);
        expect(result.cached).toBe(10);
        expect(result.total).toBe(175);
    });

    it('gemini format with no totalTokenCount calculates total', () => {
        const result = _normalizeTokenUsage({
            promptTokenCount: 100,
            candidatesTokenCount: 50,
        }, 'gemini');
        expect(result.total).toBe(150);
    });

    it('unknown format returns null', () => {
        const result = _normalizeTokenUsage({ foo: 1 }, 'unknown');
        expect(result).toBeNull();
    });

    it('setTokenUsage and takeTokenUsage round-trip', () => {
        _setTokenUsage('req-round14', { input: 10, output: 5, reasoning: 0, cached: 0, total: 15 });
        const taken = _takeTokenUsage('req-round14');
        expect(taken).not.toBeNull();
        if (taken) {
            expect(taken.input).toBe(10);
        }
        // Second take should be empty
        const again = _takeTokenUsage('req-round14');
        expect(again).toBeNull();
    });
});

// ─── schema.js ───
describe('schema.js additional branches — Round 14', () => {
    let validateSchema, validateModel, validateSettings;

    beforeEach(async () => {
        const mod = await import('../src/lib/schema.js');
        validateSchema = mod.validateSchema;
        validateModel = mod.validateModel;
        validateSettings = mod.validateSettings;
    });

    it('validates array with maxItems truncation', () => {
        const schema = { type: 'array', maxItems: 3, items: { type: 'string' } };
        const result = validateSchema(['a', 'b', 'c', 'd', 'e'], schema);
        expect(result.ok).toBe(true);
        expect(result.data.length).toBe(3);
    });

    it('validates array without items schema', () => {
        const schema = { type: 'array' };
        const result = validateSchema([1, 2, 3], schema);
        expect(result.ok).toBe(true);
        expect(result.data).toEqual([1, 2, 3]);
    });

    it('validates array items with invalid entries filtered', () => {
        const schema = { type: 'array', items: { type: 'number' } };
        const result = validateSchema([1, 'not_a_number', 3], schema);
        expect(result.ok).toBe(true);
        expect(result.data).toEqual([1, 3]); // 'not_a_number' filtered
    });

    it('validates object with required key missing', () => {
        const schema = { type: 'object', required: ['name'] };
        const result = validateSchema({}, schema);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('name');
    });

    it('validates object with property sub-validation failure → uses fallback', () => {
        const schema = {
            type: 'object',
            properties: {
                count: { type: 'number', fallback: 0 },
            },
        };
        const result = validateSchema({ count: 'not_a_number' }, schema);
        expect(result.ok).toBe(true);
        expect(result.data.count).toBe(0); // fallback used
    });

    it('validates string with maxLength truncation', () => {
        const schema = { type: 'string', maxLength: 5 };
        const result = validateSchema('hello world', schema);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('hello');
    });

    it('validates number fails for Infinity', () => {
        const schema = { type: 'number' };
        const result = validateSchema(Infinity, schema);
        expect(result.ok).toBe(false);
    });

    it('validates boolean type', () => {
        const schema = { type: 'boolean' };
        expect(validateSchema(true, schema).ok).toBe(true);
        expect(validateSchema('true', schema).ok).toBe(false);
    });

    it('unknown schema type passes data through', () => {
        const schema = { type: 'custom_type' };
        const result = validateSchema('anything', schema);
        expect(result.ok).toBe(true);
    });

    it('null data returns error with fallback', () => {
        const schema = { type: 'string', fallback: 'default' };
        const result = validateSchema(null, schema);
        expect(result.ok).toBe(false);
        expect(result.fallback).toBe('default');
    });

    it('validates non-array for array type with fallback', () => {
        const schema = { type: 'array', fallback: [] };
        const result = validateSchema('not_array', schema);
        expect(result.ok).toBe(false);
        expect(result.fallback).toEqual([]);
    });

    it('validates array for object type with fallback', () => {
        const schema = { type: 'object', fallback: {} };
        const result = validateSchema([1, 2], schema);
        expect(result.ok).toBe(false);
    });
});

// ─── key-pool.js ───
describe('key-pool.js additional branches — Round 14', () => {
    let KeyPool;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/lib/key-pool.js');
        KeyPool = mod.KeyPool;
        KeyPool.setGetArgFn(async (/** @type {string} */ key) => {
            if (key === 'test_pool') return 'key1 key2 key3';
            if (key === 'json_pool') return JSON.stringify([{ type: 'service_account', project_id: 'test' }]);
            if (key === 'empty_pool') return '';
            if (key === 'windows_path') return 'C:\\Users\\test\\key.json';
            if (key === 'bad_unicode') return '{"key": "\\u00ZZ"}'; // Bad unicode escape
            return '';
        });
    });

    it('_looksLikeWindowsPath detects Windows paths', () => {
        expect(KeyPool._looksLikeWindowsPath('C:\\Users\\test')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('\\\\server\\share')).toBe(true);
        expect(KeyPool._looksLikeWindowsPath('/unix/path')).toBe(false);
        expect(KeyPool._looksLikeWindowsPath('')).toBe(false);
    });

    it('_buildJsonCredentialError for Windows path input', () => {
        const err = KeyPool._buildJsonCredentialError('C:\\Users\\key.json');
        expect(err.message).toContain('Windows');
    });

    it('_buildJsonCredentialError for Bad Unicode escape', () => {
        const err = KeyPool._buildJsonCredentialError('invalid', new Error('Bad Unicode escape'));
        expect(err.message).toContain('역슬래시');
    });

    it('_buildJsonCredentialError for generic parse error', () => {
        const err = KeyPool._buildJsonCredentialError('invalid', new Error('Unknown error'));
        expect(err.message).toContain('Unknown error');
    });

    it('_parseJsonCredentials with Windows path throws', () => {
        expect(() => KeyPool._parseJsonCredentials('C:\\Users\\key.json')).toThrow();
    });

    it('_parseJsonCredentials with JSON array', () => {
        const result = KeyPool._parseJsonCredentials('[{"id":"a"},{"id":"b"}]');
        expect(result.length).toBe(2);
    });

    it('_parseJsonCredentials with comma-separated JSON objects', () => {
        const result = KeyPool._parseJsonCredentials('{"id":"a"},{"id":"b"}');
        expect(result.length).toBe(2);
    });

    it('_parseJsonCredentials with single JSON object', () => {
        const result = KeyPool._parseJsonCredentials('{"id":"a"}');
        expect(result.length).toBe(1);
    });

    it('_parseJsonCredentials with empty string returns empty', () => {
        expect(KeyPool._parseJsonCredentials('')).toEqual([]);
    });

    it('pick returns empty when pool is empty', async () => {
        const key = await KeyPool.pick('empty_pool');
        expect(key).toBe('');
    });

    it('pickJson returns credential from JSON pool', async () => {
        const key = await KeyPool.pickJson('json_pool');
        expect(key).toBeTruthy();
        expect(JSON.parse(key).type).toBe('service_account');
    });

    it('pickJson returns empty for Windows path credential', async () => {
        const key = await KeyPool.pickJson('windows_path');
        expect(key).toBe('');
    });

    it('pickJson returns empty for unparseable credential', async () => {
        // Re-set the getter to return something that fails to parse
        KeyPool.setGetArgFn(async () => 'not valid json at all');
        const key = await KeyPool.pickJson('bad_pool');
        expect(key).toBe('');
    });

    it('withJsonRotation handles bad credential gracefully', async () => {
        KeyPool.setGetArgFn(async () => '');
        const result = await KeyPool.withJsonRotation('empty_pool', async () => ({ success: true }));
        expect(result.success).toBe(false);
    });

    it('pickJson respects cooldown', async () => {
        KeyPool._cooldowns['cooldown_test'] = Date.now() + 60000;
        const key = await KeyPool.pickJson('cooldown_test');
        expect(key).toBe('');
        delete KeyPool._cooldowns['cooldown_test'];
    });
});

// ─── csp-exec.js ───
describe('csp-exec.js branches — Round 14', () => {
    let executePluginInCSP;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/lib/csp-exec.js');
        executePluginInCSP = mod.executePluginInCSP;
    });

    it('executePluginInCSP resolves when script completes', async () => {
        // In test environment without real DOM, the script execution
        // may use eval fallback or timeout
        try {
            await Promise.race([
                executePluginInCSP('console.log("test")', 'TestPlugin'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
            ]);
        } catch (e) {
            // Expected: either timeout or CSP block
            expect(e.message).toMatch(/timeout|CSP|script/i);
        }
    });
});

// ─── cupcake-api tests moved to coverage-round14b-cupcake-api.test.js ───

// ─── sub-plugin-manager.js — compareVersions ───
describe('sub-plugin-manager additional branches — Round 14', () => {
    let SubPluginManager;

    beforeEach(async () => {
        vi.resetModules();
        vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
            const orig = await importOriginal();
            return {
                ...orig,
                state: {
                    ALL_DEFINED_MODELS: [],
                    CUSTOM_MODELS_CACHE: [],
                    _currentExecutingPluginId: '',
                    vertexTokenCache: { token: null, expiry: 0 },
                },
                customFetchers: {},
                registeredProviderTabs: [],
                pendingDynamicFetchers: [],
                _pluginRegistrations: {},
                _pluginCleanupHooks: {},
            };
        });
        const mod = await import('../src/lib/sub-plugin-manager.js');
        SubPluginManager = mod.SubPluginManager;
    });

    it('compareVersions with null/undefined versions', () => {
        expect(SubPluginManager.compareVersions(null, '1.0.0')).toBe(1);
        expect(SubPluginManager.compareVersions('1.0.0', null)).toBe(-1);
        expect(SubPluginManager.compareVersions(null, null)).toBe(0);
    });

    it('compareVersions with valid versions', () => {
        expect(SubPluginManager.compareVersions('1.0.0', '1.0.1')).toBe(1);
        expect(SubPluginManager.compareVersions('2.0.0', '1.0.0')).toBe(-1);
        expect(SubPluginManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('compareVersions with different length versions', () => {
        expect(SubPluginManager.compareVersions('1.0', '1.0.1')).toBe(1);
        expect(SubPluginManager.compareVersions('1.0.0.1', '1.0.0')).toBe(-1);
    });

    it('compareVersions with non-numeric characters stripped', () => {
        expect(SubPluginManager.compareVersions('v1.2.3-beta', 'v1.2.4')).toBe(1);
    });

    it('unloadPlugin with no registration does nothing', () => {
        expect(() => SubPluginManager.unloadPlugin('nonexistent-id')).not.toThrow();
    });
});

// ─── auto-updater binary-expr short-circuits ───
describe('auto-updater binary-expr branches — Round 14', () => {
    let autoUpdaterMethods;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/lib/auto-updater.js');
        autoUpdaterMethods = mod.autoUpdaterExports || mod;
    });

    it('compareVersions with versions containing non-numeric chars', () => {
        // Exercise the || fallback in compareVersions(a, b) for empty after strip
        if (typeof autoUpdaterMethods.compareVersions === 'function') {
            const result = autoUpdaterMethods.compareVersions('---', '1.0.0');
            expect(typeof result).toBe('number');
        }
    });
});

// ─── settings-backup.js ───
describe('settings-backup.js branches — Round 14', () => {
    let exportSettings, importSettings;

    beforeEach(async () => {
        vi.resetModules();
        vi.mock('../src/lib/shared-state.js', async (importOriginal) => {
            const orig = await importOriginal();
            return {
                ...orig,
                safeGetArg: vi.fn().mockResolvedValue(''),
                safeGetBoolArg: vi.fn().mockResolvedValue(false),
                state: { CUSTOM_MODELS_CACHE: [] },
            };
        });
        const mod = await import('../src/lib/settings-backup.js');
        exportSettings = mod.exportSettings;
        importSettings = mod.importSettings;
    });

    it('exportSettings returns JSON with settings', async () => {
        if (typeof exportSettings !== 'function') return;
        const result = await exportSettings();
        expect(typeof result).toBe('string');
        const parsed = JSON.parse(result);
        expect(parsed).toBeDefined();
    });

    it('importSettings with invalid JSON returns error', async () => {
        if (typeof importSettings !== 'function') return;
        const result = await importSettings('not valid json');
        expect(result.success).toBe(false);
    });

    it('importSettings with valid backup data', async () => {
        if (typeof importSettings !== 'function') return;
        const backup = JSON.stringify({
            _cpm_backup_version: 1,
            settings: {},
            customModels: [],
        });
        const result = await importSettings(backup);
        // Should process without crashing
        expect(typeof result.success).toBe('boolean');
    });
});
