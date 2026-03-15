import { describe, it, expect } from 'vitest';
import {
    formatToGemini,
    getGeminiSafetySettings,
    validateGeminiParams,
    isExperimentalGeminiModel,
    geminiSupportsPenalty,
    cleanExperimentalModelParams,
    buildGeminiThinkingConfig,
} from '../src/lib/format-gemini.js';

describe('getGeminiSafetySettings', () => {
    it('returns 5 categories for standard models', () => {
        const settings = getGeminiSafetySettings('gemini-2.5-flash');
        expect(settings).toHaveLength(5);
        expect(settings.every(s => s.threshold === 'OFF')).toBe(true);
        const cats = settings.map(s => s.category);
        expect(cats).toContain('HARM_CATEGORY_CIVIC_INTEGRITY');
    });

    it('excludes CIVIC_INTEGRITY for specific models', () => {
        const settings = getGeminiSafetySettings('gemini-2.0-flash-lite-preview');
        expect(settings).toHaveLength(4);
        const cats = settings.map(s => s.category);
        expect(cats).not.toContain('HARM_CATEGORY_CIVIC_INTEGRITY');
    });

    it('excludes CIVIC_INTEGRITY for gemini-2.0-pro-exp', () => {
        const settings = getGeminiSafetySettings('gemini-2.0-pro-exp');
        expect(settings).toHaveLength(4);
    });

    it('handles null/undefined model ID', () => {
        const settings = getGeminiSafetySettings();
        expect(settings).toHaveLength(5);
    });
});

describe('validateGeminiParams', () => {
    it('does nothing for null/undefined config', () => {
        expect(() => validateGeminiParams(null)).not.toThrow();
        expect(() => validateGeminiParams(undefined)).not.toThrow();
    });

    it('clamps temperature to fallback when out of range', () => {
        const config = { temperature: 5 };
        validateGeminiParams(config);
        expect(config.temperature).toBe(1);
    });

    it('leaves valid temperature unchanged', () => {
        const config = { temperature: 0.7 };
        validateGeminiParams(config);
        expect(config.temperature).toBe(0.7);
    });

    it('removes topP when out of range', () => {
        const config = { topP: 1.5 };
        validateGeminiParams(config);
        expect(config.topP).toBeUndefined();
    });

    it('removes non-integer topK', () => {
        const config = { topK: 10.5 };
        validateGeminiParams(config);
        expect(config.topK).toBeUndefined();
    });

    it('preserves frequencyPenalty at exactMax boundary (inclusive)', () => {
        const config = { frequencyPenalty: 2 };
        validateGeminiParams(config);
        expect(config.frequencyPenalty).toBe(2);
    });

    it('preserves frequencyPenalty within range', () => {
        const config = { frequencyPenalty: 1.5 };
        validateGeminiParams(config);
        expect(config.frequencyPenalty).toBe(1.5);
    });

    it('skips null/undefined values', () => {
        const config = { temperature: null, topP: undefined };
        validateGeminiParams(config);
        expect(config.temperature).toBeNull();
    });
});

describe('isExperimentalGeminiModel', () => {
    it('returns true for experimental models', () => {
        expect(isExperimentalGeminiModel('gemini-2.0-flash-exp')).toBe(true);
        expect(isExperimentalGeminiModel('gemini-experimental-1206')).toBe(true);
    });

    it('returns false for standard models', () => {
        expect(isExperimentalGeminiModel('gemini-2.5-flash')).toBe(false);
        expect(isExperimentalGeminiModel('gemini-3-pro')).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isExperimentalGeminiModel(null)).toBeFalsy();
        expect(isExperimentalGeminiModel(undefined)).toBeFalsy();
    });
});

describe('geminiSupportsPenalty', () => {
    it('returns false for null', () => {
        expect(geminiSupportsPenalty(null)).toBe(false);
    });

    it('returns false for experimental models', () => {
        expect(geminiSupportsPenalty('gemini-2.0-flash-exp-0827')).toBe(false);
    });

    it('returns false for flash-lite models', () => {
        expect(geminiSupportsPenalty('gemini-2.0-flash-lite')).toBe(false);
    });

    it('returns false for nano models', () => {
        expect(geminiSupportsPenalty('gemini-nano')).toBe(false);
    });

    it('returns false for embedding models', () => {
        expect(geminiSupportsPenalty('text-embedding-004')).toBe(false);
    });

    it('returns true for standard pro/flash models', () => {
        expect(geminiSupportsPenalty('gemini-2.5-flash')).toBe(true);
        expect(geminiSupportsPenalty('gemini-3-pro')).toBe(true);
    });
});

describe('cleanExperimentalModelParams', () => {
    it('removes penalties for unsupported models', () => {
        const config = { frequencyPenalty: 0.5, presencePenalty: 0.5 };
        cleanExperimentalModelParams(config, 'gemini-2.0-flash-exp');
        expect(config.frequencyPenalty).toBeUndefined();
        expect(config.presencePenalty).toBeUndefined();
    });

    it('removes zero-valued penalties for supported models', () => {
        const config = { frequencyPenalty: 0, presencePenalty: 0 };
        cleanExperimentalModelParams(config, 'gemini-2.5-flash');
        expect(config.frequencyPenalty).toBeUndefined();
        expect(config.presencePenalty).toBeUndefined();
    });

    it('preserves non-zero penalties for supported models', () => {
        const config = { frequencyPenalty: 0.5, presencePenalty: 0.3 };
        cleanExperimentalModelParams(config, 'gemini-2.5-flash');
        expect(config.frequencyPenalty).toBe(0.5);
        expect(config.presencePenalty).toBe(0.3);
    });
});

describe('buildGeminiThinkingConfig', () => {
    it('returns null when level is off', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-flash', 'off')).toBeNull();
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'none')).toBeNull();
    });

    it('returns thinkingBudget for Gemini 2.5 with explicit budget', () => {
        const config = buildGeminiThinkingConfig('gemini-2.5-flash', null, 8192);
        expect(config).toEqual({ includeThoughts: true, thinkingBudget: 8192 });
    });

    it('maps level to budget for Gemini 2.5 without explicit budget', () => {
        const config = buildGeminiThinkingConfig('gemini-2.5-flash', 'HIGH');
        expect(config).toEqual({ includeThoughts: true, thinkingBudget: 24576 });
    });

    it('uses thinkingLevel (camelCase) for Gemini 3 (non-Vertex)', () => {
        const config = buildGeminiThinkingConfig('gemini-3-pro-preview', 'MEDIUM');
        expect(config).toEqual({ includeThoughts: true, thinkingLevel: 'medium' });
    });

    it('uses thinking_level (snake_case) for Gemini 3 on Vertex AI', () => {
        const config = buildGeminiThinkingConfig('gemini-3-pro', 'HIGH', null, true);
        expect(config).toEqual({ includeThoughts: true, thinking_level: 'HIGH' });
    });

    it('returns null for Gemini 3 with level=off', () => {
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'off')).toBeNull();
    });
});

describe('formatToGemini', () => {
    it('separates leading system messages into systemInstruction', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ];
        const { contents, systemInstruction } = formatToGemini(messages, { preserveSystem: true });
        expect(systemInstruction).toContain('You are helpful.');
        expect(contents[0].role).toBe('user');
    });

    it('merges system into contents when preserveSystem is false', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Hello' },
        ];
        const { contents, systemInstruction } = formatToGemini(messages, { preserveSystem: false });
        expect(systemInstruction).toHaveLength(0);
        // System prompt should be merged into first user message
        const firstText = contents[0].parts[0].text;
        expect(firstText).toContain('system:');
    });

    it('converts assistant/model role to model', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
        ];
        const { contents } = formatToGemini(messages);
        expect(contents[1].role).toBe('model');
    });

    it('keeps model-first chats unchanged to match native Gemini flow', () => {
        const messages = [
            { role: 'assistant', content: 'Model first' },
        ];
        const { contents } = formatToGemini(messages);
        expect(contents[0].role).toBe('model');
        expect(contents[0].parts[0].text).toBe('Model first');
    });

    it('merges consecutive same-role messages', () => {
        const messages = [
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
            { role: 'assistant', content: 'Response' },
        ];
        const { contents } = formatToGemini(messages);
        expect(contents[0].role).toBe('user');
        expect(contents[0].parts).toHaveLength(2);
        expect(contents[1].role).toBe('model');
    });

    it('strips thought display content from model messages', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: '<Thoughts>thinking...</Thoughts>\nActual response' },
        ];
        const { contents } = formatToGemini(messages);
        const modelText = contents[1].parts[0].text;
        expect(modelText).not.toContain('<Thoughts>');
        expect(modelText).toContain('Actual response');
    });

    it('handles non-leading system messages', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'Context update' },
            { role: 'assistant', content: 'Response' },
        ];
        const { contents } = formatToGemini(messages);
        // Non-leading system → merged into user content with "system: " prefix
        const userParts = contents[0].parts.map(p => p.text);
        expect(userParts.some(t => t.includes('system:'))).toBe(true);
    });

    it('handles empty messages', () => {
        const { contents, systemInstruction } = formatToGemini([]);
        expect(contents).toHaveLength(0);
        expect(systemInstruction).toHaveLength(0);
    });

    it('creates Start placeholder for preserveSystem with only system messages', () => {
        const messages = [
            { role: 'system', content: 'Only system content' },
        ];
        const { contents } = formatToGemini(messages, { preserveSystem: true });
        expect(contents).toHaveLength(1);
        expect(contents[0].parts[0].text).toBe('Start');
    });
});
