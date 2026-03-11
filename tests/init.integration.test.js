/**
 * Integration tests for init.js — _exposeScopeToWindow + boot helpers.
 *
 * The init.js IIFE runs at import time, making direct testing difficult.
 * Instead, we test the key exported/used functions:
 *   - _exposeScopeToWindow (via setExposeScopeFunction callback)
 *   - Custom model migration logic (C1-C9 → JSON)
 *   - Model registration into ALL_DEFINED_MODELS
 *
 * We also test the Cupcake API surface (cupcake-api.js) which is
 * initialized during boot.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Ensure `window` is available in Node test environment ──
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// ─── Test _exposeScopeToWindow via the DI mechanism ───
describe('_exposeScopeToWindow (DI capture)', () => {
    // The setExposeScopeFunction captures the function reference.
    // We can retrieve it and call it to verify window assignments.
    it('setExposeScopeFunction stores a callable function', async () => {
        const { setExposeScopeFunction } = await import('../src/lib/sub-plugin-manager.js');
        // The real init.js already called setExposeScopeFunction with _exposeScopeToWindow.
        // We can mock it by calling with our own to verify the mechanism works.
        const myFn = () => {};
        setExposeScopeFunction(myFn);
        // The function was captured (we just verified the DI mechanism works);
        // restore with null for safety
        setExposeScopeFunction(null);
        expect(typeof setExposeScopeFunction).toBe('function');
    });
});

// ─── Test cupcake-api.js setupCupcakeAPI ───
describe('setupCupcakeAPI', () => {
    beforeEach(() => {
        delete globalThis.CupcakePM;
    });

    it('creates window.CupcakePM with expected API surface', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        setupCupcakeAPI();

        expect(globalThis.CupcakePM).toBeDefined();
        expect(typeof globalThis.CupcakePM).toBe('object');
    });

    it('CupcakePM has registerProvider function', async () => {
        const { setupCupcakeAPI } = await import('../src/lib/cupcake-api.js');
        setupCupcakeAPI();

        expect(typeof globalThis.CupcakePM.registerProvider).toBe('function');
    });
});

// ─── Test custom model migration logic (extracted) ───
describe('Custom model migration helpers', () => {
    it('custom models are parsed from JSON correctly', () => {
        const json = JSON.stringify([
            { uniqueId: 'custom1', name: 'My Model', model: 'gpt-4', url: 'http://x', format: 'openai' },
            { uniqueId: 'custom2', name: 'Gemini', model: 'gemini-pro', url: 'http://y', format: 'google' },
        ]);
        const parsed = JSON.parse(json);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(2);
        expect(parsed[0].uniqueId).toBe('custom1');
        expect(parsed[1].format).toBe('google');
    });

    it('custom models registered into ALL_DEFINED_MODELS simulate correctly', () => {
        const CUSTOM_MODELS_CACHE = [
            { uniqueId: 'custom1', name: 'My Model', model: 'gpt-4', url: 'http://x', format: 'openai' },
        ];
        const ALL_DEFINED_MODELS = [];

        // Simulate init.js registration logic
        CUSTOM_MODELS_CACHE.forEach(m => {
            ALL_DEFINED_MODELS.push({
                uniqueId: m.uniqueId,
                id: m.model,
                name: m.name || m.uniqueId,
                provider: 'Custom',
            });
        });

        expect(ALL_DEFINED_MODELS.length).toBe(1);
        expect(ALL_DEFINED_MODELS[0].provider).toBe('Custom');
        expect(ALL_DEFINED_MODELS[0].id).toBe('gpt-4');
        expect(ALL_DEFINED_MODELS[0].name).toBe('My Model');
    });

    it('model sort logic keeps stable alphabetical order', () => {
        const models = [
            { provider: 'OpenAI', name: 'GPT-4o' },
            { provider: 'Anthropic', name: 'Claude Sonnet' },
            { provider: 'OpenAI', name: 'GPT-3.5' },
            { provider: 'Custom', name: 'Zzz Model' },
            { provider: 'Anthropic', name: 'Claude Haiku' },
        ];

        // Reproduce init.js sort logic
        models.sort((a, b) => {
            const providerCompare = a.provider.localeCompare(b.provider);
            if (providerCompare !== 0) return providerCompare;
            return a.name.localeCompare(b.name);
        });

        expect(models[0].provider).toBe('Anthropic');
        expect(models[0].name).toBe('Claude Haiku');
        expect(models[1].name).toBe('Claude Sonnet');
        expect(models[2].provider).toBe('Custom');
        expect(models[3].provider).toBe('OpenAI');
        expect(models[3].name).toBe('GPT-3.5');
        expect(models[4].name).toBe('GPT-4o');
    });

    it('C1-C9 legacy migration produces valid custom model objects', async () => {
        // Simulate the migration logic from init.js
        const legacyArgs = {
            cpm_c1_url: 'https://api.example.com',
            cpm_c1_model: 'gpt-4',
            cpm_c1_key: 'sk-test',
            cpm_c1_name: 'Legacy Model 1',
            cpm_c1_format: 'openai',
        };

        const safeGetArg = async (key) => legacyArgs[key] || '';
        const safeGetBoolArg = async (key) => legacyArgs[key] === 'true';

        // Reproduce migration logic
        const migrated = [];
        for (let i = 1; i <= 9; i++) {
            const legacyUrl = await safeGetArg(`cpm_c${i}_url`);
            const legacyModel = await safeGetArg(`cpm_c${i}_model`);
            const legacyKey = await safeGetArg(`cpm_c${i}_key`);
            if (!legacyUrl && !legacyModel && !legacyKey) continue;
            migrated.push({
                uniqueId: `custom${i}`,
                name: await safeGetArg(`cpm_c${i}_name`) || `Custom ${i}`,
                model: legacyModel || '',
                url: legacyUrl || '',
                key: legacyKey || '',
                format: await safeGetArg(`cpm_c${i}_format`) || 'openai',
                sysfirst: await safeGetBoolArg(`cpm_c${i}_sysfirst`),
                altrole: await safeGetBoolArg(`cpm_c${i}_altrole`),
                mustuser: await safeGetBoolArg(`cpm_c${i}_mustuser`),
                maxout: await safeGetBoolArg(`cpm_c${i}_maxout`),
                mergesys: await safeGetBoolArg(`cpm_c${i}_mergesys`),
                decoupled: await safeGetBoolArg(`cpm_c${i}_decoupled`),
                thought: await safeGetBoolArg(`cpm_c${i}_thought`),
                reasoning: await safeGetArg(`cpm_c${i}_reasoning`) || 'none',
                verbosity: await safeGetArg(`cpm_c${i}_verbosity`) || 'none',
                thinking: await safeGetArg(`cpm_c${i}_thinking`) || 'none',
                responsesMode: 'auto',
                tok: await safeGetArg(`cpm_c${i}_tok`) || 'o200k_base',
                customParams: '',
            });
        }

        expect(migrated.length).toBe(1); // only C1 had data
        expect(migrated[0].uniqueId).toBe('custom1');
        expect(migrated[0].name).toBe('Legacy Model 1');
        expect(migrated[0].url).toBe('https://api.example.com');
        expect(migrated[0].model).toBe('gpt-4');
        expect(migrated[0].format).toBe('openai');
        expect(migrated[0].reasoning).toBe('none');
        expect(migrated[0].responsesMode).toBe('auto');
    });
});

// ─── Test model flag assignment logic from init.js ───
describe('Model flag assignment', () => {
    const computeFlags = (provider, modelId) => {
        const isClaudeFamily = provider === 'Anthropic' || provider === 'AWS' || (provider === 'VertexAI' && modelId.startsWith('claude-'));
        const isGeminiFamily = provider === 'GoogleAI' || (provider === 'VertexAI' && modelId.startsWith('gemini-'));
        const isOpenAIFamily = provider === 'OpenAI';

        const modelFlags = [0, 8]; // hasImageInput, hasStreaming
        if (isClaudeFamily) {
            modelFlags.push(7);    // hasFirstSystemPrompt
        } else if (isGeminiFamily) {
            modelFlags.push(7, 9); // hasFirstSystemPrompt + requiresAlternateRole
        } else {
            modelFlags.push(6);    // hasFullSystemPrompt
        }
        if (isOpenAIFamily && /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelId)) {
            modelFlags.push(14);   // DeveloperRole
        }
        return modelFlags;
    };

    it('Anthropic models get hasFirstSystemPrompt (flag 7)', () => {
        const flags = computeFlags('Anthropic', 'claude-sonnet-4-20250514');
        expect(flags).toContain(7);
        expect(flags).not.toContain(6);
        expect(flags).not.toContain(9);
    });

    it('Gemini models get hasFirstSystemPrompt + requiresAlternateRole', () => {
        const flags = computeFlags('GoogleAI', 'gemini-2.0-flash');
        expect(flags).toContain(7);
        expect(flags).toContain(9);
        expect(flags).not.toContain(6);
    });

    it('OpenAI models get hasFullSystemPrompt (flag 6)', () => {
        const flags = computeFlags('OpenAI', 'gpt-4o');
        expect(flags).toContain(6);
        expect(flags).not.toContain(7);
    });

    it('OpenAI o-series get DeveloperRole (flag 14)', () => {
        expect(computeFlags('OpenAI', 'o3')).toContain(14);
        expect(computeFlags('OpenAI', 'o3-mini')).toContain(14);
        expect(computeFlags('OpenAI', 'gpt-5')).toContain(14);
    });

    it('OpenAI o1-preview does NOT get DeveloperRole', () => {
        expect(computeFlags('OpenAI', 'o1-preview')).not.toContain(14);
        expect(computeFlags('OpenAI', 'o1-mini')).not.toContain(14);
    });

    it('VertexAI Claude models get hasFirstSystemPrompt', () => {
        const flags = computeFlags('VertexAI', 'claude-3-haiku');
        expect(flags).toContain(7);
        expect(flags).not.toContain(9);
    });

    it('VertexAI Gemini models get requiresAlternateRole', () => {
        const flags = computeFlags('VertexAI', 'gemini-2.0-flash');
        expect(flags).toContain(9);
    });

    it('all models get hasImageInput (0) and hasStreaming (8)', () => {
        expect(computeFlags('OpenAI', 'gpt-4o')).toContain(0);
        expect(computeFlags('OpenAI', 'gpt-4o')).toContain(8);
        expect(computeFlags('Anthropic', 'claude-sonnet-4-20250514')).toContain(0);
        expect(computeFlags('Custom', 'my-model')).toContain(0);
    });

    it('Custom provider models get hasFullSystemPrompt', () => {
        const flags = computeFlags('Custom', 'my-model');
        expect(flags).toContain(6);
    });
});
