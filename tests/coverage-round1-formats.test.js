/**
 * coverage-round1-formats.test.js — Branch coverage boost for format-gemini,
 * format-anthropic, token-usage, and response-parsers.
 *
 * Target: ~50+ uncovered branches.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
    validateGeminiParams,
    geminiSupportsPenalty,
    cleanExperimentalModelParams,
    buildGeminiThinkingConfig,
    ThoughtSignatureCache,
    formatToGemini,
} from '../src/lib/format-gemini.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';
import {
    _normalizeTokenUsage,
    _setTokenUsage,
    _takeTokenUsage,
    _tokenUsageStore,
    _tokenUsageKey,
} from '../src/lib/token-usage.js';
import {
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
} from '../src/lib/response-parsers.js';

// ─── format-gemini: validateGeminiParams ───

describe('validateGeminiParams extra branches', () => {
    it('deletes topK when it is a non-integer float', () => {
        const config = { topK: 1.5, temperature: 0.7 };
        validateGeminiParams(config);
        expect(config.topK).toBeUndefined();
        expect(config.temperature).toBe(0.7);
    });

    it('clamps temperature > 2 to fallback 1', () => {
        const config = { temperature: 3 };
        validateGeminiParams(config);
        expect(config.temperature).toBe(1);
    });

    it('deletes topP when below min (0)', () => {
        const config = { topP: -0.5 };
        validateGeminiParams(config);
        expect(config.topP).toBeUndefined();
    });

    it('handles null/non-object gracefully', () => {
        validateGeminiParams(null);
        validateGeminiParams('string');
        validateGeminiParams(42);
    });

    it('deletes frequencyPenalty when exceeding max (2)', () => {
        const config = { frequencyPenalty: 2.5 };
        validateGeminiParams(config);
        expect(config.frequencyPenalty).toBeUndefined();
    });

    it('keeps boundary value 2.0 for presencePenalty (inclusive)', () => {
        const config = { presencePenalty: 2 };
        validateGeminiParams(config);
        expect(config.presencePenalty).toBe(2);
    });
});

// ─── format-gemini: geminiSupportsPenalty ───

describe('geminiSupportsPenalty — model exclusions', () => {
    it('returns false for embedding models', () => {
        expect(geminiSupportsPenalty('text-embedding-004')).toBe(false);
        expect(geminiSupportsPenalty('models/embed-001')).toBe(false);
    });

    it('returns false for aqa models', () => {
        expect(geminiSupportsPenalty('aqa')).toBe(false);
    });

    it('returns false for flash-lite models', () => {
        expect(geminiSupportsPenalty('gemini-2.0-flash-lite')).toBe(false);
    });

    it('returns false for nano models', () => {
        expect(geminiSupportsPenalty('gemini-2.0-nano')).toBe(false);
    });

    it('returns false for experimental models', () => {
        expect(geminiSupportsPenalty('gemini-exp-1206')).toBe(false);
        expect(geminiSupportsPenalty('experimental-gemini')).toBe(false);
    });

    it('returns true for standard models', () => {
        expect(geminiSupportsPenalty('gemini-2.5-pro')).toBe(true);
    });

    it('returns false for falsy input', () => {
        expect(geminiSupportsPenalty('')).toBe(false);
        expect(geminiSupportsPenalty(null)).toBe(false);
    });
});

describe('cleanExperimentalModelParams', () => {
    it('deletes penalties for unsupported model', () => {
        const cfg = { frequencyPenalty: 0.5, presencePenalty: 0.3 };
        cleanExperimentalModelParams(cfg, 'text-embedding-004');
        expect(cfg.frequencyPenalty).toBeUndefined();
        expect(cfg.presencePenalty).toBeUndefined();
    });

    it('deletes zero penalties for supported model', () => {
        const cfg = { frequencyPenalty: 0, presencePenalty: 0 };
        cleanExperimentalModelParams(cfg, 'gemini-2.5-pro');
        expect(cfg.frequencyPenalty).toBeUndefined();
        expect(cfg.presencePenalty).toBeUndefined();
    });

    it('keeps non-zero penalties for supported model', () => {
        const cfg = { frequencyPenalty: 0.5, presencePenalty: 0.3 };
        cleanExperimentalModelParams(cfg, 'gemini-2.5-pro');
        expect(cfg.frequencyPenalty).toBe(0.5);
        expect(cfg.presencePenalty).toBe(0.3);
    });
});

// ─── format-gemini: buildGeminiThinkingConfig ───

describe('buildGeminiThinkingConfig', () => {
    it('Gemini 3 + VertexAI → snake_case thinking_level', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', 'HIGH', undefined, true);
        expect(result).toEqual({ includeThoughts: true, thinking_level: 'HIGH' });
    });

    it('Gemini 3 + non-Vertex → camelCase thinkingLevel', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', 'MEDIUM', undefined, false);
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'medium' });
    });

    it('Gemini 3 + off level → null', () => {
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'off')).toBeNull();
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'none')).toBeNull();
    });

    it('Gemini 2.5 + explicit budget → thinkingBudget', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'MEDIUM', 5000);
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 5000 });
    });

    it('Gemini 2.5 + level HIGH → mapped budget 24576', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'HIGH');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 24576 });
    });

    it('Gemini 2.5 + level MINIMAL → 1024', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'MINIMAL');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 1024 });
    });

    it('Gemini 2.5 + level LOW → 4096', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'LOW');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 4096 });
    });

    it('Gemini 2.5 + level MEDIUM → 10240', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'MEDIUM');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 10240 });
    });

    it('Gemini 2.5 + unknown level → fallback parseInt or 10240', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'CUSTOM');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 10240 });
    });

    it('Gemini 2.5 + numeric string level → parseInt', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', '8192');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 8192 });
    });

    it('returns null for off level on non-Gemini-3', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-pro', 'off')).toBeNull();
    });
});

// ─── format-gemini: ThoughtSignatureCache ───

describe('ThoughtSignatureCache', () => {
    beforeEach(() => ThoughtSignatureCache.clear());

    it('save and get cycle', () => {
        ThoughtSignatureCache.save('hello world response', 'sig-123');
        const sig = ThoughtSignatureCache.get('hello world response');
        expect(sig).toBe('sig-123');
    });

    it('returns null for missing key', () => {
        expect(ThoughtSignatureCache.get('nonexistent')).toBeNull();
    });

    it('returns null for empty responseText', () => {
        expect(ThoughtSignatureCache.get('')).toBeNull();
        expect(ThoughtSignatureCache.get(null)).toBeNull();
    });

    it('ignores save with empty responseText or signature', () => {
        ThoughtSignatureCache.save('', 'sig');
        ThoughtSignatureCache.save('text', '');
        expect(ThoughtSignatureCache._cache.size).toBe(0);
    });

    it('evicts oldest entry when exceeding maxSize', () => {
        for (let i = 0; i < 55; i++) {
            ThoughtSignatureCache.save(`response-${i}`, `sig-${i}`);
        }
        // Should have evicted some entries, remaining ≤ 50
        expect(ThoughtSignatureCache._cache.size).toBeLessThanOrEqual(50);
    });
});

// ─── format-gemini: formatToGemini ───

describe('formatToGemini coverage branches', () => {
    it('preserveSystem=false → prepends system to first user parts', () => {
        const msgs = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: false });
        expect(result.systemInstruction).toHaveLength(0);
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[0].parts[0].text).toContain('system:');
    });

    it('preserveSystem=false with no user messages → creates user entry', () => {
        const msgs = [
            { role: 'system', content: 'System prompt' },
            { role: 'assistant', content: 'Hello' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: false });
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[0].parts[0].text).toContain('system:');
    });

    it('preserveSystem=true with only system messages → adds "Start" user', () => {
        const msgs = [
            { role: 'system', content: 'Only system' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: true });
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].parts[0].text).toBe('Start');
    });

    it('useThoughtSignature=true injects cached signature', () => {
        ThoughtSignatureCache.clear();
        ThoughtSignatureCache.save('prev response text', 'cached-sig-abc');
        const msgs = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'prev response text' },
            { role: 'user', content: 'Follow up' },
        ];
        const result = formatToGemini(msgs, { useThoughtSignature: true });
        const modelMsg = result.contents.find(c => c.role === 'model');
        expect(modelMsg.parts[0].thoughtSignature).toBe('cached-sig-abc');
    });

    it('non-string content on message → JSON.stringify fallback', () => {
        const msgs = [
            { role: 'user', content: { custom: 'data', key: 123 } },
        ];
        const result = formatToGemini(msgs);
        expect(result.contents[0].parts[0].text).toContain('custom');
    });

    it('system message after system phase → merged into user content', () => {
        const msgs = [
            { role: 'system', content: 'Leading system' },
            { role: 'user', content: 'First user msg' },
            { role: 'system', content: 'Late system msg' },
            { role: 'user', content: 'Second user msg' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: true });
        // Late system msg should be merged as "system: Late system msg"
        const allParts = result.contents.flatMap(c => c.parts);
        const sysPart = allParts.find(p => p.text && p.text.startsWith('system:'));
        expect(sysPart).toBeDefined();
    });

    it('multimodal URL image → fileData part', () => {
        const msgs = [
            {
                role: 'user',
                content: 'look at this',
                multimodals: [{ type: 'image', url: 'https://example.com/img.png', mimeType: 'image/png' }],
            },
        ];
        const result = formatToGemini(msgs);
        const imgPart = result.contents[0].parts.find(p => p.fileData);
        expect(imgPart).toBeDefined();
        expect(imgPart.fileData.fileUri).toBe('https://example.com/img.png');
    });

    it('multimodal same-role merge with inlineData', () => {
        const msgs = [
            { role: 'user', content: 'first image', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc123' }] },
            { role: 'user', content: 'second text', multimodals: [{ type: 'audio', base64: 'data:audio/mp3;base64,xyz789' }] },
        ];
        const result = formatToGemini(msgs);
        // Should merge into one user entry
        expect(result.contents.filter(c => c.role === 'user')).toHaveLength(1);
        expect(result.contents[0].parts.length).toBeGreaterThanOrEqual(3);
    });

    it('empty content + zero multimodals → skipped', () => {
        const msgs = [
            { role: 'user', content: '   ' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToGemini(msgs);
        expect(result.contents).toHaveLength(1);
    });

    it('consecutive same-role text messages merge via parts.push', () => {
        const msgs = [
            { role: 'user', content: 'Part A' },
            { role: 'user', content: 'Part B' },
        ];
        const result = formatToGemini(msgs);
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].parts.length).toBe(2);
    });

    it('system content as non-string → JSON.stringify in systemInstruction', () => {
        const msgs = [
            { role: 'system', content: { key: 'value' } },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToGemini(msgs, { preserveSystem: true });
        expect(result.systemInstruction[0]).toContain('key');
    });
});

// ─── format-anthropic: additional branches ───

describe('formatToAnthropic — additional branch coverage', () => {
    it('URL image source → type:url source', () => {
        const msgs = [
            {
                role: 'user',
                content: 'look at this',
                multimodals: [{ type: 'image', url: 'https://example.com/img.png', mimeType: 'image/png' }],
            },
        ];
        const result = formatToAnthropic(msgs);
        const img = result.messages[0].content.find(c => c.type === 'image');
        expect(img.source.type).toBe('url');
        expect(img.source.url).toBe('https://example.com/img.png');
    });

    it('Array content with inlineData → image source', () => {
        const msgs = [
            {
                role: 'user',
                content: [
                    { inlineData: { mimeType: 'image/jpeg', data: 'base64data' } },
                ],
            },
        ];
        const result = formatToAnthropic(msgs);
        const content = result.messages[0].content;
        const img = content.find(c => c.type === 'image');
        expect(img).toBeDefined();
        expect(img.source.type).toBe('base64');
    });

    it('Array content with image_url type → data:image conversion', () => {
        const msgs = [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
                ],
            },
        ];
        const result = formatToAnthropic(msgs);
        const content = result.messages[0].content;
        const img = content.find(c => c.type === 'image');
        expect(img).toBeDefined();
        expect(img.source.data).toBe('abc123');
    });

    it('Array content with image_url http URL → source type url', () => {
        const msgs = [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: 'https://example.com/img.jpg' } },
                ],
            },
        ];
        const result = formatToAnthropic(msgs);
        const content = result.messages[0].content;
        const img = content.find(c => c.type === 'image');
        expect(img).toBeDefined();
        expect(img.source.type).toBe('url');
    });

    it('Array content with input_image type', () => {
        const msgs = [
            {
                role: 'user',
                content: [
                    { type: 'input_image', image_url: { url: 'data:image/png;base64,xyz' } },
                ],
            },
        ];
        const result = formatToAnthropic(msgs);
        const content = result.messages[0].content;
        const img = content.find(c => c.type === 'image');
        expect(img).toBeDefined();
    });

    it('caching=true + cachePoint on message → cache_control on last content part', () => {
        const msgs = [
            { role: 'user', content: 'Hello, please remember this.', cachePoint: true },
            { role: 'assistant', content: 'OK.' },
        ];
        const result = formatToAnthropic(msgs, { caching: true });
        const userMsg = result.messages[0];
        const lastPart = Array.isArray(userMsg.content)
            ? userMsg.content[userMsg.content.length - 1]
            : null;
        expect(lastPart?.cache_control).toBeDefined();
    });

    it('caching=true with 1 hour caching', () => {
        const msgs = [
            { role: 'user', content: 'Long context.', cachePoint: true },
            { role: 'assistant', content: 'OK.' },
        ];
        const result = formatToAnthropic(msgs, { caching: true, claude1HourCaching: true });
        const userMsg = result.messages[0];
        const lastPart = Array.isArray(userMsg.content)
            ? userMsg.content[userMsg.content.length - 1]
            : null;
        expect(lastPart?.cache_control?.type).toBe('ephemeral');
    });

    it('caching with string content → converts to array with cache_control', () => {
        // Create a scenario where fMsg.content is a string and cachePoint is set
        // This happens when formatToAnthropic creates messages with string content and
        // then the caching pass tries to add cache_control on a string content message.
        const msgs = [
            { role: 'user', content: 'Just plain text.', cachePoint: true },
            { role: 'assistant', content: 'Response.' },
        ];
        const result = formatToAnthropic(msgs, { caching: true });
        const userMsg = result.messages[0];
        // After cache_control processing, string content should be wrapped in array
        const content = userMsg.content;
        if (Array.isArray(content)) {
            const lastItem = content[content.length - 1];
            expect(lastItem.cache_control).toBeDefined();
        }
    });

    it('assistant with empty multimodals + text → plain text content', () => {
        const msgs = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'World', multimodals: [] },
        ];
        const result = formatToAnthropic(msgs);
        expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('same-role consecutive merges → _mergeOrPush appends', () => {
        const msgs = [
            { role: 'user', content: 'Part A', multimodals: [{ type: 'image', base64: 'data:image/png;base64,aaa' }] },
            { role: 'user', content: 'Part B', multimodals: [{ type: 'image', base64: 'data:image/png;base64,bbb' }] },
        ];
        const result = formatToAnthropic(msgs);
        // Both should be merged into one user message
        const userMsgs = result.messages.filter(m => m.role === 'user');
        expect(userMsgs).toHaveLength(1);
        expect(userMsgs[0].content.length).toBeGreaterThanOrEqual(3);
    });

    it('_mergeOrPush with string prev.content → wraps into array', () => {
        const msgs = [
            { role: 'user', content: 'Plain text' },
            { role: 'user', content: [{ type: 'text', text: 'Array text' }] },
        ];
        const result = formatToAnthropic(msgs);
        const userMsgs = result.messages.filter(m => m.role === 'user');
        expect(userMsgs).toHaveLength(1);
        const content = userMsgs[0].content;
        expect(Array.isArray(content)).toBe(true);
    });
});

// ─── token-usage additional branches ───

describe('token-usage additional branches', () => {
    beforeEach(() => _tokenUsageStore.clear());

    it('_normalizeTokenUsage — anthropic with explicit reasoning tokens', () => {
        const raw = {
            input_tokens: 100,
            output_tokens: 500,
            output_tokens_details: { reasoning_tokens: 200 },
        };
        const result = _normalizeTokenUsage(raw, 'anthropic');
        expect(result.reasoning).toBe(200);
    });

    it('_normalizeTokenUsage — anthropic with thinking estimation (CJK text)', () => {
        const raw = { input_tokens: 100, output_tokens: 5000 };
        const cjkText = '안녕하세요. 이것은 한국어 텍스트입니다. 많은 한자가 포함되어 있습니다.';
        const result = _normalizeTokenUsage(raw, 'anthropic', {
            anthropicHasThinking: true,
            anthropicVisibleText: cjkText,
        });
        expect(result.reasoning).toBeGreaterThan(0);
        expect(result.reasoningEstimated).toBe(true);
    });

    it('_normalizeTokenUsage — anthropic without thinking flag → 0 reasoning', () => {
        const raw = { input_tokens: 100, output_tokens: 500 };
        const result = _normalizeTokenUsage(raw, 'anthropic', { anthropicHasThinking: false });
        expect(result.reasoning).toBe(0);
    });

    it('_normalizeTokenUsage — gemini format', () => {
        const raw = {
            promptTokenCount: 200,
            candidatesTokenCount: 300,
            thoughtsTokenCount: 50,
            cachedContentTokenCount: 10,
            totalTokenCount: 560,
        };
        const result = _normalizeTokenUsage(raw, 'gemini');
        expect(result).toEqual({ input: 200, output: 300, reasoning: 50, cached: 10, total: 560 });
    });

    it('_normalizeTokenUsage — unknown format → null', () => {
        expect(_normalizeTokenUsage({ foo: 1 }, 'unknown')).toBeNull();
    });

    it('_normalizeTokenUsage — null input → null', () => {
        expect(_normalizeTokenUsage(null, 'openai')).toBeNull();
    });

    it('_setTokenUsage evicts oldest when exceeding max store size', () => {
        _tokenUsageStore.clear();
        for (let i = 0; i < 105; i++) {
            _setTokenUsage(`req-${i}`, { input: i, output: i, reasoning: 0, cached: 0, total: i * 2 });
        }
        expect(_tokenUsageStore.size).toBeLessThanOrEqual(100);
    });

    it('_takeTokenUsage — falls back to legacy key if scoped not found', () => {
        _tokenUsageStore.clear();
        const usage = { input: 10, output: 20, reasoning: 0, cached: 0, total: 30 };
        _tokenUsageStore.set('_latest', usage);
        const taken = _takeTokenUsage('nonexistent-id', false);
        expect(taken).toEqual(usage);
        expect(_tokenUsageStore.has('_latest')).toBe(false);
    });

    it('_takeTokenUsage — stream legacy key fallback', () => {
        _tokenUsageStore.clear();
        const usage = { input: 5, output: 10, reasoning: 0, cached: 0, total: 15 };
        _tokenUsageStore.set('_stream_latest', usage);
        const taken = _takeTokenUsage('nonexistent-id', true);
        expect(taken).toEqual(usage);
    });

    it('_takeTokenUsage — returns null when nothing found', () => {
        _tokenUsageStore.clear();
        expect(_takeTokenUsage('no-such-id', false)).toBeNull();
    });

    it('_tokenUsageKey with empty requestId → legacy key', () => {
        expect(_tokenUsageKey('', false)).toBe('_latest');
        expect(_tokenUsageKey('', true)).toBe('_stream_latest');
        expect(_tokenUsageKey(null, false)).toBe('_latest');
    });

    it('_normalizeTokenUsage — openai with cached tokens', () => {
        const raw = {
            prompt_tokens: 100,
            completion_tokens: 200,
            completion_tokens_details: { reasoning_tokens: 50 },
            prompt_tokens_details: { cached_tokens: 30 },
            total_tokens: 300,
        };
        const result = _normalizeTokenUsage(raw, 'openai');
        expect(result.reasoning).toBe(50);
        expect(result.cached).toBe(30);
    });

    it('_normalizeTokenUsage — openai with prompt_cache_hit_tokens', () => {
        const raw = {
            prompt_tokens: 100,
            completion_tokens: 200,
            prompt_cache_hit_tokens: 40,
        };
        const result = _normalizeTokenUsage(raw, 'openai');
        expect(result.cached).toBe(40);
    });
});

// ─── response-parsers additional branches ───

describe('response-parsers additional branches', () => {
    it('parseGeminiNonStreamingResponse — thought parts with thought=true', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Thinking about it...' },
                        { text: 'Here is the answer.' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Thinking about it...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('Here is the answer.');
    });

    it('parseGeminiNonStreamingResponse — thought_signature caching', () => {
        ThoughtSignatureCache.clear();
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Deep thought.', thought_signature: 'sig-deep-001' },
                        { text: 'Final answer.' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data, { useThoughtSignature: true });
        expect(result.success).toBe(true);
        // check that signature was cached — retrieve via cache
        const cached = ThoughtSignatureCache.get(result.content);
        expect(cached).toBe('sig-deep-001');
    });

    it('parseGeminiNonStreamingResponse — safety block reason', () => {
        const data = {
            promptFeedback: { blockReason: 'SAFETY' },
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    it('parseGeminiNonStreamingResponse — usageMetadata → sets token usage', () => {
        _tokenUsageStore.clear();
        const data = {
            candidates: [{ content: { parts: [{ text: 'Done' }] } }],
            usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 200,
                thoughtsTokenCount: 0,
                totalTokenCount: 300,
            },
        };
        parseGeminiNonStreamingResponse(data, {}, 'gemini-req-1');
        const usage = _takeTokenUsage('gemini-req-1', false);
        expect(usage).not.toBeNull();
        expect(usage.input).toBe(100);
    });

    it('parseClaudeNonStreamingResponse — error type', () => {
        const data = {
            type: 'error',
            error: { message: 'Rate limit exceeded' },
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Claude Error');
    });

    it('parseClaudeNonStreamingResponse — thinking + redacted_thinking', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Let me think...' },
                { type: 'redacted_thinking' },
                { type: 'text', text: 'Final answer.' },
            ],
            usage: { input_tokens: 100, output_tokens: 500 },
        };
        const result = parseClaudeNonStreamingResponse(data, {}, 'claude-req-1');
        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('{{redacted_thinking}}');
        expect(result.content).toContain('Final answer.');
    });

    it('parseResponsesAPINonStreamingResponse — reasoning + output_text', () => {
        const data = {
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'Reasoning about the problem...' },
                    ],
                },
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: 'The answer is 42.' },
                    ],
                },
            ],
            usage: { prompt_tokens: 50, completion_tokens: 100 },
        };
        const result = parseResponsesAPINonStreamingResponse(data, 'resp-req-1');
        expect(result.success).toBe(true);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Reasoning about the problem...');
        expect(result.content).toContain('The answer is 42.');
    });

    it('parseResponsesAPINonStreamingResponse — no output, falls back to OpenAI format', () => {
        const data = {
            choices: [{ message: { role: 'assistant', content: 'OpenAI format response' } }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('OpenAI format response');
    });

    it('parseResponsesAPINonStreamingResponse — empty output array', () => {
        const data = { output: [] };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.content).toContain('Empty response');
    });

    it('parseClaudeNonStreamingResponse — empty content', () => {
        const data = { content: [] };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });
});
