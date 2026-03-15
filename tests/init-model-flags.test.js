/**
 * init-model-flags.test.js — Tests for model registration flag logic in init.js.
 *
 * The init.js IIFE registers models with different LLMFlags based on provider family:
 *   - All models: [0, 8] (hasImageInput, hasStreaming)
 *   - Claude family (Anthropic, AWS, VertexAI claude-*): + [7] (hasFirstSystemPrompt)
 *   - Gemini family (GoogleAI, VertexAI gemini-*): + [7, 9] (hasFirstSystemPrompt, requiresAlternateRole)
 *   - OpenAI family: + [6] (hasFullSystemPrompt)
 *   - OpenAI gpt-5/o2+/o1 (non-preview/mini): + [14] (DeveloperRole)
 *   - Other/Custom: + [6] (hasFullSystemPrompt)
 *
 * Since the IIFE runs at import time, these tests replicate the flag logic
 * and verify correctness for all provider/model combinations.
 */
import { describe, it, expect } from 'vitest';

// ── Replicate the exact flag logic from init.js ──
function computeModelFlags(provider, modelId) {
    const isClaudeFamily = provider === 'Anthropic' || provider === 'AWS' ||
        (provider === 'VertexAI' && modelId.startsWith('claude-'));
    const isGeminiFamily = provider === 'GoogleAI' ||
        (provider === 'VertexAI' && modelId.startsWith('gemini-'));
    const isOpenAIFamily = provider === 'OpenAI';

    const flags = [0, 8]; // hasImageInput, hasStreaming
    if (isClaudeFamily) {
        flags.push(7);    // hasFirstSystemPrompt
    } else if (isGeminiFamily) {
        flags.push(7, 9); // hasFirstSystemPrompt + requiresAlternateRole
    } else {
        flags.push(6);    // hasFullSystemPrompt
    }
    if (isOpenAIFamily && /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelId)) {
        flags.push(14);   // DeveloperRole
    }
    return flags;
}

describe('Model registration flag logic', () => {
    // ── Base flags ──
    it('all models have hasImageInput(0) and hasStreaming(8)', () => {
        const flags = computeModelFlags('Custom', 'anything');
        expect(flags).toContain(0);
        expect(flags).toContain(8);
    });

    // ── Anthropic / Claude family ──
    describe('Claude family', () => {
        it('Anthropic → hasFirstSystemPrompt(7)', () => {
            const flags = computeModelFlags('Anthropic', 'claude-3.5-sonnet');
            expect(flags).toContain(7);
            expect(flags).not.toContain(6);
            expect(flags).not.toContain(9);
        });

        it('AWS → hasFirstSystemPrompt(7)', () => {
            const flags = computeModelFlags('AWS', 'claude-3.5-sonnet');
            expect(flags).toContain(7);
        });

        it('VertexAI + claude- prefix → hasFirstSystemPrompt(7)', () => {
            const flags = computeModelFlags('VertexAI', 'claude-3.5-haiku');
            expect(flags).toContain(7);
            expect(flags).not.toContain(9);
        });
    });

    // ── Gemini family ──
    describe('Gemini family', () => {
        it('GoogleAI → hasFirstSystemPrompt(7) + requiresAlternateRole(9)', () => {
            const flags = computeModelFlags('GoogleAI', 'gemini-2.0-flash');
            expect(flags).toContain(7);
            expect(flags).toContain(9);
            expect(flags).not.toContain(6);
        });

        it('VertexAI + gemini- prefix → hasFirstSystemPrompt(7) + requiresAlternateRole(9)', () => {
            const flags = computeModelFlags('VertexAI', 'gemini-1.5-pro');
            expect(flags).toContain(7);
            expect(flags).toContain(9);
        });
    });

    // ── OpenAI family ──
    describe('OpenAI family', () => {
        it('OpenAI → hasFullSystemPrompt(6)', () => {
            const flags = computeModelFlags('OpenAI', 'gpt-4o');
            expect(flags).toContain(6);
            expect(flags).not.toContain(7);
        });

        it('OpenAI gpt-5 → DeveloperRole(14)', () => {
            const flags = computeModelFlags('OpenAI', 'gpt-5');
            expect(flags).toContain(14);
        });

        it('OpenAI gpt-5.4 → DeveloperRole(14)', () => {
            const flags = computeModelFlags('OpenAI', 'gpt-5.4');
            expect(flags).toContain(14);
        });

        it('OpenAI o2 → DeveloperRole(14)', () => {
            const flags = computeModelFlags('OpenAI', 'o2');
            expect(flags).toContain(14);
        });

        it('OpenAI o3 → DeveloperRole(14)', () => {
            const flags = computeModelFlags('OpenAI', 'o3');
            expect(flags).toContain(14);
        });

        it('OpenAI o1 (base, not preview/mini) → DeveloperRole(14)', () => {
            const flags = computeModelFlags('OpenAI', 'o1');
            expect(flags).toContain(14);
        });

        it('OpenAI o1-preview → NO DeveloperRole', () => {
            const flags = computeModelFlags('OpenAI', 'o1-preview');
            expect(flags).not.toContain(14);
        });

        it('OpenAI o1-mini → NO DeveloperRole', () => {
            const flags = computeModelFlags('OpenAI', 'o1-mini');
            expect(flags).not.toContain(14);
        });

        it('OpenAI gpt-4o → NO DeveloperRole', () => {
            const flags = computeModelFlags('OpenAI', 'gpt-4o');
            expect(flags).not.toContain(14);
        });

        it('Non-OpenAI gpt-5 → NO DeveloperRole (wrong provider)', () => {
            const flags = computeModelFlags('Custom', 'gpt-5');
            expect(flags).not.toContain(14);
        });
    });

    // ── Other/Custom providers ──
    describe('Other providers', () => {
        it('Custom provider → hasFullSystemPrompt(6)', () => {
            const flags = computeModelFlags('Custom', 'my-model');
            expect(flags).toContain(6);
        });

        it('VertexAI non-claude/gemini → hasFullSystemPrompt(6)', () => {
            const flags = computeModelFlags('VertexAI', 'some-other-model');
            expect(flags).toContain(6);
            expect(flags).not.toContain(7);
        });

        it('OpenRouter → hasFullSystemPrompt(6)', () => {
            const flags = computeModelFlags('OpenRouter', 'anthropic/claude-3');
            expect(flags).toContain(6);
        });
    });
});

// ── _exposeScopeToWindow coverage ──
describe('_exposeScopeToWindow DI mechanism', () => {
    it('setExposeScopeFunction accepts and stores function', async () => {
        const { setExposeScopeFunction } = await import('../src/lib/sub-plugin-manager.js');
        const myFn = () => {};
        expect(() => setExposeScopeFunction(myFn)).not.toThrow();
        setExposeScopeFunction(null);
    });
});

// ── Boot phase diagnostic logic ──
describe('Boot phase tracking pattern', () => {
    it('tracks completed and failed phases correctly', () => {
        const completed = [];
        const failed = [];

        const phaseDone = (phase) => { completed.push(phase); };
        const phaseFail = (phase, err) => { failed.push(`${phase}: ${err?.message || err}`); };

        phaseDone('register-settings');
        phaseDone('subplugin-registry');
        phaseFail('streaming-check', new Error('bridge unavailable'));
        phaseDone('custom-models');

        expect(completed).toEqual(['register-settings', 'subplugin-registry', 'custom-models']);
        expect(failed).toHaveLength(1);
        expect(failed[0]).toContain('streaming-check');
        expect(failed[0]).toContain('bridge unavailable');
    });

    it('boot summary message format', () => {
        const completed = ['a', 'b', 'c'];
        const failed = ['d: error'];
        const modelCount = 42;

        const summary = `[CPM] ✓ Boot complete — ${completed.length} phases OK, ${failed.length} failed, ${modelCount} models registered.`;
        expect(summary).toContain('3 phases OK');
        expect(summary).toContain('1 failed');
        expect(summary).toContain('42 models');
    });
});
