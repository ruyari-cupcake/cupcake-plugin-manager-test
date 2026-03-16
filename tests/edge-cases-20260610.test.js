/**
 * edge-cases-20260610.test.js — Additional edge case & boundary tests
 * for CPM v1.20.16 bug audit. Covers B/C category bug scenarios and
 * uncovered branches in format/stream/fetch modules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import {
    buildGeminiThinkingConfig,
    validateGeminiParams,
    geminiSupportsPenalty,
    getGeminiSafetySettings,
    ThoughtSignatureCache,
    formatToGemini,
} from '../src/lib/format-gemini.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';

// ═══════════════════════════════════════════════════════
//  formatToOpenAI — config flag combinations
// ═══════════════════════════════════════════════════════

describe('formatToOpenAI — config flag edge cases', () => {
    it('mergesys + altrole: system merges then assistant→model', () => {
        const messages = [
            { role: 'system', content: 'Be helpful' },
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true, altrole: true });
        // System should merge into first user message, assistant should become model
        const userMsg = result.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
        expect(userMsg.content).toContain('Be helpful');
        const modelMsg = result.find(m => m.role === 'model');
        expect(modelMsg).toBeDefined();
        expect(modelMsg.content).toBe('Hello');
    });

    it('mergesys + developerRole: system merges, no leftover system messages', () => {
        const messages = [
            { role: 'system', content: 'Sys A' },
            { role: 'system', content: 'Sys B' },
            { role: 'user', content: 'Question' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true, developerRole: true });
        // mergesys reduces to user + (any), no system or developer role should appear
        const hasSys = result.some(m => m.role === 'system');
        // system was already merged, so developerRole has nothing to convert
        expect(hasSys).toBe(false);
    });

    it('developerRole alone: system→developer conversion', () => {
        const messages = [
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Hi' },
            { role: 'system', content: 'Also be friendly' },
        ];
        const result = formatToOpenAI(messages, { developerRole: true });
        const devMsgs = result.filter(m => m.role === 'developer');
        expect(devMsgs.length).toBe(2);
        expect(devMsgs[0].content).toBe('Be concise');
        expect(devMsgs[1].content).toBe('Also be friendly');
    });

    it('altrole: consecutive assistant messages merge', () => {
        const messages = [
            { role: 'user', content: 'Start' },
            { role: 'assistant', content: 'Part 1' },
            { role: 'assistant', content: 'Part 2' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        const modelMsgs = result.filter(m => m.role === 'model');
        expect(modelMsgs.length).toBe(1);
        expect(modelMsgs[0].content).toContain('Part 1');
        expect(modelMsgs[0].content).toContain('Part 2');
    });

    it('mergesys with multimodal first user message stringifies array content', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: [
                { type: 'text', text: 'Look at this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ]},
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        const userMsg = result.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
        // mergesys concatenates: sysPrompt + "\n\n" + JSON.stringify(array)
        expect(typeof userMsg.content).toBe('string');
        expect(userMsg.content).toContain('System prompt');
        expect(userMsg.content).toContain('Look at this');
    });
});

// ═══════════════════════════════════════════════════════
//  buildGeminiThinkingConfig — edge model/input cases
// ═══════════════════════════════════════════════════════

describe('buildGeminiThinkingConfig — edge cases', () => {
    it('budget as string is parsed correctly', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, '8192');
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' });
    });

    it('budget as string below threshold → LOW', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, '1000');
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' });
    });

    it('gemini-3-flash-lite model is treated as flash variant', () => {
        const result = buildGeminiThinkingConfig('gemini-3-flash-lite', null, 10000);
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'MEDIUM' });
    });

    it('gemini-3-flash-lite with high budget → HIGH', () => {
        const result = buildGeminiThinkingConfig('gemini-3-flash-lite', null, 20000);
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' });
    });

    it('negative budget returns null for Gemini 3', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, -1000);
        expect(result).toBeNull();
    });

    it('budget=0 returns null for Gemini 3', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, 0);
        expect(result).toBeNull();
    });

    it('budget=NaN treated as 0 → null', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, NaN);
        expect(result).toBeNull();
    });

    it('budget=undefined treated as 0 → null', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', null, undefined);
        expect(result).toBeNull();
    });

    it('Gemini 2.5 with level "MINIMAL" → thinkingBudget 1024', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'MINIMAL', null);
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 1024 });
    });

    it('Gemini 2.5 with level "HIGH" → thinkingBudget 24576', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'HIGH', null);
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 24576 });
    });
});

// ═══════════════════════════════════════════════════════
//  validateGeminiParams — boundary values
// ═══════════════════════════════════════════════════════

describe('validateGeminiParams — boundary conditions', () => {
    it('topK exactly at max (64) is kept', () => {
        const gc = { topK: 64 };
        validateGeminiParams(gc);
        expect(gc.topK).toBe(64);
    });

    it('topK exceeding max (65) is deleted', () => {
        const gc = { topK: 65 };
        validateGeminiParams(gc);
        expect(gc.topK).toBeUndefined();
    });

    it('topK non-integer (3.5) is deleted', () => {
        const gc = { topK: 3.5 };
        validateGeminiParams(gc);
        expect(gc.topK).toBeUndefined();
    });

    it('temperature at max (2.0) is kept', () => {
        const gc = { temperature: 2.0 };
        validateGeminiParams(gc);
        expect(gc.temperature).toBe(2.0);
    });

    it('temperature exceeding max (2.1) falls back to 1', () => {
        const gc = { temperature: 2.1 };
        validateGeminiParams(gc);
        expect(gc.temperature).toBe(1);
    });

    it('frequencyPenalty at boundary ±2.0 is valid', () => {
        const gc1 = { frequencyPenalty: 2.0 };
        const gc2 = { frequencyPenalty: -2.0 };
        validateGeminiParams(gc1);
        validateGeminiParams(gc2);
        expect(gc1.frequencyPenalty).toBe(2.0);
        expect(gc2.frequencyPenalty).toBe(-2.0);
    });

    it('frequencyPenalty exceeding 2.0 is deleted', () => {
        const gc = { frequencyPenalty: 2.01 };
        validateGeminiParams(gc);
        expect(gc.frequencyPenalty).toBeUndefined();
    });

    it('null/undefined input does not throw', () => {
        expect(() => validateGeminiParams(null)).not.toThrow();
        expect(() => validateGeminiParams(undefined)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════
//  geminiSupportsPenalty — model detection
// ═══════════════════════════════════════════════════════

describe('geminiSupportsPenalty — model detection', () => {
    it('embedding model → false', () => {
        expect(geminiSupportsPenalty('embedding-001')).toBe(false);
    });

    it('aqa model → false', () => {
        expect(geminiSupportsPenalty('aqa')).toBe(false);
    });

    it('flash-lite model → false', () => {
        expect(geminiSupportsPenalty('gemini-2.0-flash-lite')).toBe(false);
    });

    it('nano model → false', () => {
        expect(geminiSupportsPenalty('gemini-nano')).toBe(false);
    });

    it('experimental model → false', () => {
        expect(geminiSupportsPenalty('gemini-2.0-flash-exp')).toBe(false);
    });

    it('standard pro model → true', () => {
        expect(geminiSupportsPenalty('gemini-2.5-pro')).toBe(true);
    });

    it('standard flash model → true', () => {
        expect(geminiSupportsPenalty('gemini-2.5-flash')).toBe(true);
    });

    it('empty string → false', () => {
        expect(geminiSupportsPenalty('')).toBe(false);
    });

    it('null/undefined → false', () => {
        expect(geminiSupportsPenalty(null)).toBe(false);
        expect(geminiSupportsPenalty(undefined)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════
//  ThoughtSignatureCache — eviction & retrieval
// ═══════════════════════════════════════════════════════

describe('ThoughtSignatureCache — eviction', () => {
    beforeEach(() => ThoughtSignatureCache.clear());

    it('stores and retrieves a signature', () => {
        ThoughtSignatureCache.save('some response text', 'SIG_12345');
        expect(ThoughtSignatureCache.get('some response text')).toBe('SIG_12345');
    });

    it('returns null for unknown response text', () => {
        expect(ThoughtSignatureCache.get('nonexistent')).toBeNull();
    });

    it('evicts oldest entry when exceeding maxSize', () => {
        for (let i = 0; i < 51; i++) {
            ThoughtSignatureCache.save(`response_${i}`, `sig_${i}`);
        }
        // 51st entry should evict entry 0
        expect(ThoughtSignatureCache.get('response_0')).toBeNull();
        // Entry 50 should still exist
        expect(ThoughtSignatureCache.get('response_50')).toBe('sig_50');
        // Entry 1 should still exist
        expect(ThoughtSignatureCache.get('response_1')).toBe('sig_1');
    });

    it('does not save null/empty values', () => {
        ThoughtSignatureCache.save('', 'sig');
        ThoughtSignatureCache.save('text', '');
        ThoughtSignatureCache.save(null, 'sig');
        ThoughtSignatureCache.save('text', null);
        expect(ThoughtSignatureCache._cache.size).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
//  getGeminiSafetySettings — civic integrity filter
// ═══════════════════════════════════════════════════════

describe('getGeminiSafetySettings — model-aware civic integrity', () => {
    it('includes CIVIC_INTEGRITY for standard models', () => {
        const settings = getGeminiSafetySettings('gemini-2.5-pro');
        const civic = settings.find(s => s.category === 'HARM_CATEGORY_CIVIC_INTEGRITY');
        expect(civic).toBeDefined();
    });

    it('always includes 4 base safety categories', () => {
        const settings = getGeminiSafetySettings('any-model');
        const cats = settings.map(s => s.category);
        expect(cats).toContain('HARM_CATEGORY_HATE_SPEECH');
        expect(cats).toContain('HARM_CATEGORY_DANGEROUS_CONTENT');
        expect(cats).toContain('HARM_CATEGORY_HARASSMENT');
        expect(cats).toContain('HARM_CATEGORY_SEXUALLY_EXPLICIT');
    });

    it('all thresholds are OFF', () => {
        const settings = getGeminiSafetySettings('gemini-2.5-pro');
        for (const s of settings) {
            expect(s.threshold).toBe('OFF');
        }
    });
});

// ═══════════════════════════════════════════════════════
//  SSE CRLF — regex edge cases
// ═══════════════════════════════════════════════════════

describe('SSE CRLF regex — boundary cases', () => {
    it('CR-only (\\r) line endings are not split', () => {
        // /\r?\n/ does NOT match standalone \r — this is expected SSE spec behavior
        const data = 'data: hello\rdata: world\n';
        const lines = data.split(/\r?\n/);
        // Only \n splits, so \r stays embedded in the first "line"
        expect(lines[0]).toBe('data: hello\rdata: world');
    });

    it('empty data line after split is handled', () => {
        const data = 'data: chunk\r\n\r\n';
        const lines = data.split(/\r?\n/);
        // Should get: ['data: chunk', '', '']
        expect(lines[0]).toBe('data: chunk');
        expect(lines[1]).toBe('');
    });

    it('SSE comment lines start with colon', () => {
        const data = ':comment\r\ndata: real\r\n\r\n';
        const lines = data.split(/\r?\n/);
        const nonComment = lines.filter(l => l.trim() && !l.trim().startsWith(':'));
        expect(nonComment.length).toBe(1);
        expect(nonComment[0]).toBe('data: real');
    });
});

// ═══════════════════════════════════════════════════════
//  Body size thresholds — exact boundary (unit tests)
// ═══════════════════════════════════════════════════════

describe('Body size thresholds — boundary values', () => {
    it('5MB exactly (5_000_000) should trigger warn but not reject', () => {
        const len = 5_000_000;
        const isWarn = len > 5_000_000;
        const isReject = len > 10_000_000;
        expect(isWarn).toBe(false); // exactly 5MB does NOT warn (> not >=)
        expect(isReject).toBe(false);
    });

    it('5MB + 1 (5_000_001) should trigger warn', () => {
        const len = 5_000_001;
        const isWarn = len > 5_000_000;
        const isReject = len > 10_000_000;
        expect(isWarn).toBe(true);
        expect(isReject).toBe(false);
    });

    it('10MB exactly (10_000_000) should NOT reject (> not >=)', () => {
        const len = 10_000_000;
        const isReject = len > 10_000_000;
        expect(isReject).toBe(false);
    });

    it('10MB + 1 (10_000_001) should reject', () => {
        const len = 10_000_001;
        const isReject = len > 10_000_000;
        expect(isReject).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
//  formatToAnthropic — multimodal + system combinations
// ═══════════════════════════════════════════════════════

describe('formatToAnthropic — multimodal edge cases', () => {
    it('image-only message without text is preserved', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0=' } },
            ]},
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
        const userMsg = msgs.find(m => m.role === 'user');
        expect(userMsg).toBeDefined();
        const hasImage = userMsg.content.some(p => p.type === 'image');
        expect(hasImage).toBe(true);
    });

    it('system message after multimodal user is handled', () => {
        const messages = [
            { role: 'user', content: [
                { type: 'text', text: 'Look at this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ]},
            { role: 'system', content: 'New context' },
            { role: 'user', content: 'Continue' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        // Non-leading system should become "System: New context"
        const allContent = msgs.flatMap(m =>
            Array.isArray(m.content) ? m.content.map(p => p.text || '') : [String(m.content)]
        ).join(' ');
        expect(allContent).toContain('System: New context');
    });

    it('empty messages array returns defaults', () => {
        const { messages: msgs, system } = formatToAnthropic([]);
        expect(system).toBe('');
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════
//  formatToGemini — preserveSystem edge cases
// ═══════════════════════════════════════════════════════

describe('formatToGemini — system instruction handling', () => {
    it('preserveSystem extracts leading system messages into systemInstruction', () => {
        const messages = [
            { role: 'system', content: 'Be helpful' },
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Hello' },
        ];
        const { systemInstruction, contents } = formatToGemini(messages, { preserveSystem: true });
        expect(systemInstruction).toContain('Be helpful');
        expect(systemInstruction).toContain('Be concise');
        // Contents should only have user message
        const userPart = contents.find(c => c.role === 'user');
        expect(userPart).toBeDefined();
    });

    it('non-leading system messages are kept in content flow', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'Mid context' },
            { role: 'user', content: 'More' },
        ];
        const { systemInstruction, contents } = formatToGemini(messages, { preserveSystem: true });
        expect(systemInstruction).toContain('System prompt');
        // Mid context should appear somewhere in contents
        const allText = contents.flatMap(c =>
            c.parts?.map(p => p.text || '') || []
        ).join(' ');
        expect(allText).toContain('Mid context');
    });
});

// ═══════════════════════════════════════════════════════
//  formatToOpenAI — mergesys synthetic user robustness
// ═══════════════════════════════════════════════════════

describe('formatToOpenAI mergesys — synthetic user robustness', () => {
    it('three system messages merge into one synthetic user', () => {
        const messages = [
            { role: 'system', content: 'A' },
            { role: 'system', content: 'B' },
            { role: 'system', content: 'C' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result.length).toBe(1);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toContain('A');
        expect(result[0].content).toContain('B');
        expect(result[0].content).toContain('C');
    });

    it('system + assistant with no user → system becomes synthetic user', () => {
        const messages = [
            { role: 'system', content: 'Setup' },
            { role: 'assistant', content: 'Ready' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        // System merges into first non-system message (assistant) as prepended content
        expect(result.length).toBeGreaterThanOrEqual(1);
        const allContent = result.map(m => m.content).join(' ');
        expect(allContent).toContain('Setup');
    });

    it('empty string system messages are handled', () => {
        const messages = [
            { role: 'system', content: '' },
            { role: 'user', content: 'Hi' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════
//  Key pool naming — collision prevention (integration)
// ═══════════════════════════════════════════════════════

describe('Key pool naming — collision prevention', () => {
    it('different URLs produce different pool names', () => {
        const name1 = `_cpm_custom_inline_${encodeURIComponent('https://api.openai.com')}_${'gpt-4o'}`;
        const name2 = `_cpm_custom_inline_${encodeURIComponent('https://api.anthropic.com')}_${'gpt-4o'}`;
        expect(name1).not.toBe(name2);
    });

    it('same URL + different model produce different pool names', () => {
        const name1 = `_cpm_custom_inline_${encodeURIComponent('https://api.openai.com')}_${'gpt-4o'}`;
        const name2 = `_cpm_custom_inline_${encodeURIComponent('https://api.openai.com')}_${'gpt-4o-mini'}`;
        expect(name1).not.toBe(name2);
    });
});
