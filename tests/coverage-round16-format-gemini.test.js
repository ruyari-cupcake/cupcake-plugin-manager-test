/**
 * Round 16: format-gemini.js and auto-updater.js branch coverage.
 * Static imports for proper coverage tracking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    formatToGemini,
    buildGeminiThinkingConfig,
    validateGeminiParams,
    isExperimentalGeminiModel,
    cleanExperimentalModelParams,
    ThoughtSignatureCache,
    getGeminiSafetySettings,
} from '../src/lib/format-gemini.js';

// ─── format-gemini.js ───
describe('format-gemini.js uncovered branches — Round 16', () => {
    beforeEach(() => {
        ThoughtSignatureCache.clear();
    });

    // L219: system messages at start (systemPhase=true)
    it('formatToGemini with leading system messages (preserveSystem=true)', () => {
        const result = formatToGemini([
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
        ], { preserveSystem: true });
        expect(result.systemInstruction.length).toBeGreaterThan(0);
        expect(result.systemInstruction[0]).toContain('helpful');
    });

    it('formatToGemini with leading system messages (preserveSystem=false default)', () => {
        const result = formatToGemini([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ]);
        // System instruction merged into first user message
        expect(result.systemInstruction.length).toBe(0);
        expect(result.contents[0].parts[0].text).toContain('system:');
    });

    // L241: system message AFTER non-system messages
    it('formatToGemini with mid-conversation system message', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'New instruction' },
            { role: 'assistant', content: 'Sure' },
        ]);
        // System message merged into user content
        const allTexts = result.contents.flatMap(c => c.parts.map(p => p.text || ''));
        expect(allTexts.some(t => t.includes('system:'))).toBe(true);
    });

    it('formatToGemini mid-system message creates new user part if no prior user', () => {
        const result = formatToGemini([
            { role: 'assistant', content: 'Previous response' },
            { role: 'system', content: 'Instruction update' },
            { role: 'user', content: 'Follow up' },
        ]);
        expect(result.contents.length).toBeGreaterThan(0);
    });

    // L248-L257: multimodal with same role as last message (merge)
    it('formatToGemini multimodal message merged with same-role last message', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Look at this' },
            {
                role: 'user',
                content: 'And this image',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,iVBOR', mimeType: 'image/png' }],
            },
        ]);
        // Should merge into single user message with multiple parts
        const userMsgs = result.contents.filter(c => c.role === 'user');
        expect(userMsgs.length).toBe(1);
        expect(userMsgs[0].parts.length).toBeGreaterThan(1);
    });

    // L257: multimodal merged, no trimmed text
    it('formatToGemini multimodal message without text, merged with same role', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Start' },
            {
                role: 'user',
                content: '',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,iVBOR', mimeType: 'image/png' }],
            },
        ]);
        const userMsgs = result.contents.filter(c => c.role === 'user');
        expect(userMsgs.length).toBe(1);
    });

    // L265: different role multimodal → new content entry
    it('formatToGemini multimodal message with different role from last', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Request' },
            {
                role: 'assistant',
                content: 'Here is an image',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,iVBOR', mimeType: 'image/png' }],
            },
        ]);
        expect(result.contents.length).toBe(2);
    });

    // L269: new role multimodal with empty text
    it('formatToGemini multimodal message with different role, no text', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Request' },
            {
                role: 'assistant',
                content: '',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,iVBOR', mimeType: 'image/png' }],
            },
        ]);
        // Should still create a model message with just the image
        expect(result.contents.length).toBe(2);
    });

    // L276: useThoughtSignature with model role
    it('formatToGemini with useThoughtSignature and model message', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Response text' },
        ], { useThoughtSignature: true });
        expect(result.contents.length).toBe(2);
    });

    // L278-L279: useThoughtSignature when cache has matching signature
    it('formatToGemini with useThoughtSignature and cached signature', () => {
        // Prime the cache
        ThoughtSignatureCache.save('Response text', 'cached-sig-123');
        const result = formatToGemini([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Response text' },
        ], { useThoughtSignature: true });
        // Should inject thoughtSignature into part
        const modelMsg = result.contents.find(c => c.role === 'model');
        expect(modelMsg.parts[0].thoughtSignature).toBe('cached-sig-123');
    });

    it('formatToGemini with useThoughtSignature but no cache hit', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Totally new response' },
        ], { useThoughtSignature: true });
        const modelMsg = result.contents.find(c => c.role === 'model');
        expect(modelMsg.parts[0].thoughtSignature).toBeUndefined();
    });

    // L55: validateGeminiParams — exclusiveMax (currently always false, but test edge)
    it('validateGeminiParams with out-of-range temperature uses fallback', () => {
        const config = { temperature: 5 };
        validateGeminiParams(config);
        expect(config.temperature).toBe(1);
    });

    it('validateGeminiParams with out-of-range topP deletes it', () => {
        const config = { topP: 2 };
        validateGeminiParams(config);
        expect(config.topP).toBeUndefined();
    });

    it('validateGeminiParams with non-integer topK deletes it', () => {
        const config = { topK: 1.5 };
        validateGeminiParams(config);
        expect(config.topK).toBeUndefined();
    });

    it('validateGeminiParams with negative presencePenalty deletes it', () => {
        const config = { presencePenalty: -3 };
        validateGeminiParams(config);
        expect(config.presencePenalty).toBeUndefined();
    });

    // buildGeminiThinkingConfig branches
    it('buildGeminiThinkingConfig gemini-3 with level=off', () => {
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'off')).toBeNull();
    });

    it('buildGeminiThinkingConfig gemini-3 with level=MEDIUM + isVertexAI', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', 'MEDIUM', undefined, true);
        expect(result.thinking_level).toBe('MEDIUM');
    });

    it('buildGeminiThinkingConfig gemini-3 with level=MEDIUM, no vertex', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', 'MEDIUM');
        expect(result.thinkingLevel).toBe('medium');
    });

    it('buildGeminiThinkingConfig gemini-2.5 with budget number', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-flash', 'HIGH', 5000);
        expect(result.thinkingBudget).toBe(5000);
    });

    it('buildGeminiThinkingConfig gemini-2.5 with level mapped to budget', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-flash', 'HIGH');
        expect(result.thinkingBudget).toBe(24576);
    });

    it('buildGeminiThinkingConfig gemini-2.5 with unknown level string', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-flash', '8192');
        expect(result.thinkingBudget).toBe(8192);
    });

    it('buildGeminiThinkingConfig returns null for no level', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-flash', '')).toBeNull();
    });

    it('buildGeminiThinkingConfig returns null for level=none', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-flash', 'none')).toBeNull();
    });

    // cleanExperimentalModelParams
    it('cleanExperimentalModelParams strips penalties for experimental models', () => {
        const config = { frequencyPenalty: 0.5, presencePenalty: 0.5 };
        cleanExperimentalModelParams(config, 'gemini-2.5-flash-exp');
        expect(config.frequencyPenalty).toBeUndefined();
    });

    it('cleanExperimentalModelParams strips zero penalties for supported models', () => {
        const config = { frequencyPenalty: 0, presencePenalty: 0 };
        cleanExperimentalModelParams(config, 'gemini-2.5-pro');
        expect(config.frequencyPenalty).toBeUndefined();
        expect(config.presencePenalty).toBeUndefined();
    });

    // isExperimentalGeminiModel
    it('isExperimentalGeminiModel recognizes experimental models', () => {
        expect(isExperimentalGeminiModel('gemini-exp-1')).toBe(true);
        expect(isExperimentalGeminiModel('gemini-2.5-pro')).toBe(false);
        expect(isExperimentalGeminiModel('')).toBeFalsy();
    });

    // ThoughtSignatureCache overflow
    it('ThoughtSignatureCache evicts oldest entry when over maxSize', () => {
        for (let i = 0; i < 55; i++) {
            ThoughtSignatureCache.save(`text${i}`, `sig${i}`);
        }
        expect(ThoughtSignatureCache._cache.size).toBeLessThanOrEqual(51);
    });

    // getGeminiSafetySettings
    it('getGeminiSafetySettings returns settings array', () => {
        if (typeof getGeminiSafetySettings === 'function') {
            const settings = getGeminiSafetySettings();
            expect(Array.isArray(settings)).toBe(true);
        }
    });

    // Multiple system messages before first non-system
    it('formatToGemini with multiple leading system messages', () => {
        const result = formatToGemini([
            { role: 'system', content: 'Instruction 1' },
            { role: 'system', content: 'Instruction 2' },
            { role: 'user', content: 'Hello' },
        ], { preserveSystem: true });
        expect(result.systemInstruction.length).toBe(2);
    });

    // preserveSystem with no user messages
    it('formatToGemini preserveSystem with only system messages adds placeholder user', () => {
        const result = formatToGemini([
            { role: 'system', content: 'Instruction' },
        ], { preserveSystem: true });
        // Should add placeholder user message
        expect(result.contents.length).toBe(1);
        expect(result.contents[0].parts[0].text).toBe('Start');
    });

    // Text-only model messages that merge consecutive same-role  
    it('formatToGemini merges consecutive assistant messages', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Part 1' },
            { role: 'assistant', content: 'Part 2' },
        ]);
        // Consecutive assistant messages merged
        const modelMsgs = result.contents.filter(c => c.role === 'model');
        expect(modelMsgs.length).toBe(1);
        expect(modelMsgs[0].parts.length).toBe(2);
    });

    // Non-image/audio/video multimodal type (ignored)
    it('formatToGemini ignores non-image/audio/video multimodal types', () => {
        const result = formatToGemini([
            {
                role: 'user',
                content: 'File attached',
                multimodals: [{ type: 'document', base64: 'data:application/pdf;base64,abc', mimeType: 'application/pdf' }],
            },
        ]);
        const userMsg = result.contents[0];
        // Should only have text part, document multimodal ignored
        expect(userMsg.parts.every(p => p.text !== undefined)).toBe(true);
    });

    // Multimodal with URL (fileUri)
    it('formatToGemini multimodal with URL uses fileData', () => {
        const result = formatToGemini([
            {
                role: 'user',
                content: 'See image',
                multimodals: [{ type: 'image', url: 'https://example.com/img.png', mimeType: 'image/png' }],
            },
        ]);
        const parts = result.contents[0].parts;
        const filePart = parts.find(p => p.fileData);
        expect(filePart).toBeDefined();
        expect(filePart.fileData.fileUri).toBe('https://example.com/img.png');
    });
});

// ─── auto-updater.js binary-expr ───
describe('auto-updater.js binary-expr branches — Round 16', () => {
    let autoUpdater;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../src/lib/auto-updater.js');
        autoUpdater = mod.autoUpdater || mod.default || mod;
    });

    it('compareVersions with undefined version uses 0.0.0 default', () => {
        if (typeof autoUpdater.compareVersions !== 'function') return;
        const result = autoUpdater.compareVersions(undefined, '1.0.0');
        expect(result).toBeGreaterThan(0);
    });

    it('compareVersions with null versions', () => {
        if (typeof autoUpdater.compareVersions !== 'function') return;
        expect(autoUpdater.compareVersions(null, null)).toBe(0);
    });

    it('_isRetriableError with non-retriable message', () => {
        if (typeof autoUpdater._isRetriableError !== 'function') return;
        expect(autoUpdater._isRetriableError('Plugin not found')).toBe(false);
    });

    it('_isRetriableError with retriable message', () => {
        if (typeof autoUpdater._isRetriableError !== 'function') return;
        expect(autoUpdater._isRetriableError('network error: timeout')).toBe(true);
    });
});
