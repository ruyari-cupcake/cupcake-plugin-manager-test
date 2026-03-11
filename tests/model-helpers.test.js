import { describe, it, expect } from 'vitest';
import {
    supportsOpenAIReasoningEffort,
    needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams,
    shouldStripGPT54SamplingForReasoning,
    needsMaxCompletionTokens,
} from '../src/lib/model-helpers.js';

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

    it('rejects non-matching models', () => {
        expect(supportsOpenAIReasoningEffort('gpt-4o')).toBe(false);
        expect(supportsOpenAIReasoningEffort('claude-3-opus')).toBe(false);
        expect(supportsOpenAIReasoningEffort('gemini-pro')).toBe(false);
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
