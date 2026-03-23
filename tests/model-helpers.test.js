import { describe, it, expect } from 'vitest';
import {
    isO3O4Family,
    isGPT5Family,
    needsDeveloperRole,
    isGemini3Model,
    isGeminiNoCivicModel,
    supportsOpenAIReasoningEffort,
    needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams,
    shouldStripGPT54SamplingForReasoning,
    needsMaxCompletionTokens,
} from '../src/lib/model-helpers.js';

// ── isO3O4Family (base detector) ──
describe('isO3O4Family', () => {
    it('returns false for null/empty', () => {
        expect(isO3O4Family(null)).toBe(false);
        expect(isO3O4Family('')).toBe(false);
    });

    it('matches o3 variants', () => {
        expect(isO3O4Family('o3')).toBe(true);
        expect(isO3O4Family('o3-mini')).toBe(true);
        expect(isO3O4Family('o3-pro')).toBe(true);
        expect(isO3O4Family('o3-deep-research')).toBe(true);
    });

    it('matches o4 variants', () => {
        expect(isO3O4Family('o4-mini')).toBe(true);
        expect(isO3O4Family('o4-mini-deep-research')).toBe(true);
    });

    it('handles slash-prefixed IDs', () => {
        expect(isO3O4Family('openai/o3')).toBe(true);
        expect(isO3O4Family('openai/o4-mini')).toBe(true);
    });

    it('rejects non-o3/o4 models', () => {
        expect(isO3O4Family('o1')).toBe(false);
        expect(isO3O4Family('o1-preview')).toBe(false);
        expect(isO3O4Family('gpt-5')).toBe(false);
        expect(isO3O4Family('gpt-4o')).toBe(false);
    });
});

// ── isGPT5Family ──
describe('isGPT5Family', () => {
    it('returns false for null/empty', () => {
        expect(isGPT5Family(null)).toBe(false);
        expect(isGPT5Family('')).toBe(false);
    });

    it('matches GPT-5 variants', () => {
        expect(isGPT5Family('gpt-5')).toBe(true);
        expect(isGPT5Family('gpt-5.4')).toBe(true);
        expect(isGPT5Family('gpt-5-mini')).toBe(true);
        expect(isGPT5Family('gpt-5-nano')).toBe(true);
        expect(isGPT5Family('gpt-5-2025-01-15')).toBe(true);
        expect(isGPT5Family('openai/gpt-5')).toBe(true);
    });

    it('rejects non-GPT-5 models', () => {
        expect(isGPT5Family('gpt-4o')).toBe(false);
        expect(isGPT5Family('gpt-4.5')).toBe(false);
        expect(isGPT5Family('o3')).toBe(false);
    });
});

// ── needsDeveloperRole ──
describe('needsDeveloperRole', () => {
    it('returns false for null/empty', () => {
        expect(needsDeveloperRole(null)).toBe(false);
        expect(needsDeveloperRole('')).toBe(false);
    });

    it('returns true for GPT-5 family', () => {
        expect(needsDeveloperRole('gpt-5')).toBe(true);
        expect(needsDeveloperRole('gpt-5.4')).toBe(true);
        expect(needsDeveloperRole('openai/gpt-5')).toBe(true);
    });

    it('returns true for o2+ models', () => {
        expect(needsDeveloperRole('o2')).toBe(true);
        expect(needsDeveloperRole('o3')).toBe(true);
        expect(needsDeveloperRole('o4-mini')).toBe(true);
        expect(needsDeveloperRole('o9')).toBe(true);
    });

    it('returns true for o1 (not preview/mini)', () => {
        expect(needsDeveloperRole('o1')).toBe(true);
    });

    it('returns false for o1-preview and o1-mini (legacy)', () => {
        expect(needsDeveloperRole('o1-preview')).toBe(false);
        expect(needsDeveloperRole('o1-mini')).toBe(false);
    });

    it('returns false for GPT-4 family', () => {
        expect(needsDeveloperRole('gpt-4o')).toBe(false);
        expect(needsDeveloperRole('gpt-4.5')).toBe(false);
        expect(needsDeveloperRole('gpt-4-turbo')).toBe(false);
    });

    it('returns false for non-OpenAI models', () => {
        expect(needsDeveloperRole('claude-3-opus')).toBe(false);
        expect(needsDeveloperRole('gemini-pro')).toBe(false);
    });
});

// ── isGemini3Model ──
describe('isGemini3Model', () => {
    it('returns false for null/empty', () => {
        expect(isGemini3Model(null)).toBe(false);
        expect(isGemini3Model('')).toBe(false);
    });

    it('detects Gemini 3 models', () => {
        expect(isGemini3Model('gemini-3-flash')).toBe(true);
        expect(isGemini3Model('gemini-3')).toBe(true);
        expect(isGemini3Model('Gemini-3-Pro')).toBe(true);
    });

    it('rejects Gemini 2.x models', () => {
        expect(isGemini3Model('gemini-2.5-flash')).toBe(false);
        expect(isGemini3Model('gemini-2.0-pro')).toBe(false);
    });
});

// ── isGeminiNoCivicModel ──
describe('isGeminiNoCivicModel', () => {
    it('returns false for null/empty', () => {
        expect(isGeminiNoCivicModel(null)).toBe(false);
        expect(isGeminiNoCivicModel('')).toBe(false);
    });

    it('detects models without CIVIC_INTEGRITY support', () => {
        expect(isGeminiNoCivicModel('gemini-2.0-flash-lite-preview')).toBe(true);
        expect(isGeminiNoCivicModel('gemini-2.0-pro-exp')).toBe(true);
    });

    it('returns false for standard Gemini models', () => {
        expect(isGeminiNoCivicModel('gemini-2.5-flash')).toBe(false);
        expect(isGeminiNoCivicModel('gemini-3-flash')).toBe(false);
        expect(isGeminiNoCivicModel('gemini-2.0-flash')).toBe(false);
    });
});

describe('supportsOpenAIReasoningEffort', () => {
    it('returns false for null/empty', () => {
        expect(supportsOpenAIReasoningEffort(null)).toBe(false);
        expect(supportsOpenAIReasoningEffort('')).toBe(false);
    });

    it('matches o3 variants', () => {
        expect(supportsOpenAIReasoningEffort('o3')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o3-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o3-pro')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o3-deep-research')).toBe(true);
    });

    it('matches o4 variants', () => {
        expect(supportsOpenAIReasoningEffort('o4-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('o4-mini-deep-research')).toBe(true);
    });

    it('matches GPT-5 family', () => {
        expect(supportsOpenAIReasoningEffort('gpt-5')).toBe(true);
        expect(supportsOpenAIReasoningEffort('gpt-5.4')).toBe(true);
        expect(supportsOpenAIReasoningEffort('gpt-5-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('gpt-5-nano')).toBe(true);
        expect(supportsOpenAIReasoningEffort('gpt-5-2025-01-15')).toBe(true);
    });

    it('handles slash-prefixed model IDs', () => {
        expect(supportsOpenAIReasoningEffort('openai/o3-mini')).toBe(true);
        expect(supportsOpenAIReasoningEffort('openai/gpt-5')).toBe(true);
    });

    it('rejects Gemini and other non-matching models', () => {
        expect(supportsOpenAIReasoningEffort('gemini-2.5-flash')).toBe(false);
        expect(supportsOpenAIReasoningEffort('gemini-3-pro')).toBe(false);
        expect(supportsOpenAIReasoningEffort('gpt-4o')).toBe(false);
        expect(supportsOpenAIReasoningEffort('claude-3-opus')).toBe(false);
    });
});

describe('needsCopilotResponsesAPI', () => {
    it('returns false for null/empty', () => {
        expect(needsCopilotResponsesAPI(null)).toBe(false);
        expect(needsCopilotResponsesAPI('')).toBe(false);
    });

    it('returns true for GPT-5.4+', () => {
        expect(needsCopilotResponsesAPI('gpt-5.4')).toBe(true);
        expect(needsCopilotResponsesAPI('gpt-5.5')).toBe(true);
        expect(needsCopilotResponsesAPI('gpt-5.10')).toBe(true);
    });

    it('returns false for GPT-5.3 and below', () => {
        expect(needsCopilotResponsesAPI('gpt-5.3')).toBe(false);
        expect(needsCopilotResponsesAPI('gpt-5.0')).toBe(false);
        expect(needsCopilotResponsesAPI('gpt-5')).toBe(false);
    });

    it('handles slash prefix', () => {
        expect(needsCopilotResponsesAPI('openai/gpt-5.4')).toBe(true);
    });
});

describe('shouldStripOpenAISamplingParams', () => {
    it('returns true for o3/o4 family', () => {
        expect(shouldStripOpenAISamplingParams('o3')).toBe(true);
        expect(shouldStripOpenAISamplingParams('o3-mini')).toBe(true);
        expect(shouldStripOpenAISamplingParams('o4-mini')).toBe(true);
        expect(shouldStripOpenAISamplingParams('o4-mini-deep-research')).toBe(true);
    });

    it('returns false for non-o3/o4 models', () => {
        expect(shouldStripOpenAISamplingParams('gpt-5')).toBe(false);
        expect(shouldStripOpenAISamplingParams('o1')).toBe(false);
        expect(shouldStripOpenAISamplingParams('o1-preview')).toBe(false);
        expect(shouldStripOpenAISamplingParams('gpt-4o')).toBe(false);
    });
});

describe('shouldStripGPT54SamplingForReasoning', () => {
    it('returns true for GPT-5.4 when reasoning is enabled', () => {
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', 'high')).toBe(true);
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4-2026-03-05', 'xhigh')).toBe(true);
        expect(shouldStripGPT54SamplingForReasoning('openai/gpt-5.4', 'medium')).toBe(true);
    });

    it('returns false for GPT-5.4 when reasoning is none/off', () => {
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', 'none')).toBe(false);
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', 'off')).toBe(false);
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.4', '')).toBe(false);
    });

    it('returns false for non-GPT-5.4 models', () => {
        expect(shouldStripGPT54SamplingForReasoning('gpt-5.2', 'high')).toBe(false);
        expect(shouldStripGPT54SamplingForReasoning('gpt-5', 'high')).toBe(false);
        expect(shouldStripGPT54SamplingForReasoning('o3', 'high')).toBe(false);
    });
});

describe('needsMaxCompletionTokens', () => {
    it('returns true for GPT-4.5, GPT-5, o-series', () => {
        expect(needsMaxCompletionTokens('gpt-4.5')).toBe(true);
        expect(needsMaxCompletionTokens('gpt-5')).toBe(true);
        expect(needsMaxCompletionTokens('o1')).toBe(true);
        expect(needsMaxCompletionTokens('o3')).toBe(true);
    });

    it('returns false for other models', () => {
        expect(needsMaxCompletionTokens('gpt-4o')).toBe(false);
        expect(needsMaxCompletionTokens('claude-3')).toBe(false);
        expect(needsMaxCompletionTokens(null)).toBe(false);
    });
});
