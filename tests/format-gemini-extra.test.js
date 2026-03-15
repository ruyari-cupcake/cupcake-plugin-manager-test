import { beforeEach, describe, expect, it } from 'vitest';
import {
    ThoughtSignatureCache,
    buildGeminiThinkingConfig,
    cleanExperimentalModelParams,
    formatToGemini,
    getGeminiSafetySettings,
    validateGeminiParams,
} from '../src/lib/format-gemini.js';

describe('ThoughtSignatureCache', () => {
    beforeEach(() => {
        ThoughtSignatureCache.clear();
        ThoughtSignatureCache._maxSize = 3;
    });

    it('saves and retrieves signatures using normalized response text', () => {
        ThoughtSignatureCache.save('<Thoughts>hidden</Thoughts>Visible answer', 'sig-1');
        expect(ThoughtSignatureCache.get('Visible answer')).toBe('sig-1');
    });

    it('returns null for missing response text', () => {
        expect(ThoughtSignatureCache.get('missing')).toBeNull();
        expect(ThoughtSignatureCache.get('')).toBeNull();
    });

    it('evicts the oldest entry when max size is exceeded', () => {
        ThoughtSignatureCache.save('one', 's1');
        ThoughtSignatureCache.save('two', 's2');
        ThoughtSignatureCache.save('three', 's3');
        ThoughtSignatureCache.save('four', 's4');

        expect(ThoughtSignatureCache.get('one')).toBeNull();
        expect(ThoughtSignatureCache.get('four')).toBe('s4');
    });
});

describe('format-gemini extra parameter coverage', () => {
    it('keeps CIVIC_INTEGRITY for unrelated models', () => {
        const categories = getGeminiSafetySettings('gemini-2.0-flash').map(v => v.category);
        expect(categories).toContain('HARM_CATEGORY_CIVIC_INTEGRITY');
    });

    it('removes invalid topK and presencePenalty lower bound violations', () => {
        const config = { topK: 0, presencePenalty: -3 };
        validateGeminiParams(config);
        expect(config.topK).toBeUndefined();
        expect(config.presencePenalty).toBeUndefined();
    });

    it('accepts integer topK within range and topP boundary', () => {
        const config = { topK: 40, topP: 1 };
        validateGeminiParams(config);
        expect(config.topK).toBe(40);
        expect(config.topP).toBe(1);
    });

    it('preserves unsupported-penalty cleanup when values already absent', () => {
        const config = {};
        cleanExperimentalModelParams(config, 'gemini-exp');
        expect(config).toEqual({});
    });

    it('maps numeric thinking level strings for Gemini 2.5', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-pro', '8192')).toEqual({ includeThoughts: true, thinkingBudget: 8192 });
    });
});

describe('formatToGemini extra formatting coverage', () => {
    beforeEach(() => {
        ThoughtSignatureCache.clear();
    });

    it('injects cached thoughtSignature into historical model messages when enabled', () => {
        ThoughtSignatureCache.save('Answer text', 'sig-123');
        const { contents } = formatToGemini([
            { role: 'assistant', content: 'Answer text' },
        ], { useThoughtSignature: true });

        expect(contents[0].parts[0]).toEqual({ text: 'Answer text', thoughtSignature: 'sig-123' });
    });

    it('converts image URL multimodals into fileData parts', () => {
        const { contents } = formatToGemini([
            {
                role: 'user',
                content: 'Describe image',
                multimodals: [{ type: 'image', url: 'https://example.com/cat.png', mimeType: 'image/png' }],
            },
        ]);

        expect(contents[0].parts).toEqual([
            { text: 'Describe image' },
            { fileData: { mimeType: 'image/png', fileUri: 'https://example.com/cat.png' } },
        ]);
    });

    it('converts base64 audio and video multimodals into inlineData parts', () => {
        const { contents } = formatToGemini([
            {
                role: 'user',
                content: 'Process media',
                multimodals: [
                    { type: 'audio', base64: 'data:audio/mp3;base64,aaa' },
                    { type: 'video', base64: 'data:video/mp4;base64,bbb' },
                ],
            },
        ]);

        expect(contents[0].parts).toEqual([
            { text: 'Process media' },
            { inlineData: { mimeType: 'audio/mp3', data: 'aaa' } },
            { inlineData: { mimeType: 'video/mp4', data: 'bbb' } },
        ]);
    });

    it('merges multimodal text into previous same-role text part when possible', () => {
        const { contents } = formatToGemini([
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2', multimodals: [{ type: 'image', base64: 'data:image/png;base64,ccc' }] },
        ]);

        expect(contents).toHaveLength(1);
        expect(contents[0].parts[0].text).toBe('Part 1\n\nPart 2');
        expect(contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'ccc' } });
    });

    it('converts generic object content using JSON.stringify when no text exists', () => {
        const { contents } = formatToGemini([
            { role: 'user', content: { foo: 'bar' } },
        ]);

        expect(contents[0].parts[0].text).toBe('{"foo":"bar"}');
    });

    it('skips fully empty user messages without multimodals', () => {
        const { contents } = formatToGemini([
            { role: 'user', content: '   ' },
            { role: 'user', content: 'kept' },
        ]);

        expect(contents).toEqual([{ role: 'user', parts: [{ text: 'kept' }] }]);
    });

    it('merges non-leading system into an existing user message', () => {
        const { contents } = formatToGemini([
            { role: 'user', content: 'hello' },
            { role: 'system', content: 'policy' },
            { role: 'user', content: 'again' },
        ]);

        expect(contents[0].parts).toEqual([
            { text: 'hello' },
            { text: 'system: policy' },
            { text: 'again' },
        ]);
    });
});
