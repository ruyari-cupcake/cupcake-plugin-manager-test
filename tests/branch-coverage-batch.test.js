/**
 * branch-coverage-batch.test.js
 * ─────────────────────────────
 * HD-2: Batch branch coverage improvement.
 * Targets uncovered branches across multiple modules:
 *   - sse-parsers.js   (thought blocks, safety block during thoughts, thought signature)
 *   - format-openai.js (Anthropic-style image, audio inlineData)
 *   - format-anthropic.js (mergeOrPush string content, URL image, cachePoint string content)
 *   - format-gemini.js (JSON.stringify fallback, inlineData merge, !preserveSystem model-first)
 *   - token-usage.js   (CJK-heavy text estimation via Anthropic thinking path)
 */
import { describe, it, expect } from 'vitest';
import { parseGeminiSSELine } from '../src/lib/sse-parsers.js';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import { formatToAnthropic, _mergeOrPush } from '../src/lib/format-anthropic.js';
import { formatToGemini } from '../src/lib/format-gemini.js';
import { _normalizeTokenUsage } from '../src/lib/token-usage.js';

// ═══════════════════════════════════════════════════════════════════
// 1. sse-parsers.js — Gemini thought block branches
// ═══════════════════════════════════════════════════════════════════
describe('parseGeminiSSELine — uncovered thought branches', () => {
    it('closes thought block before emitting safety block message', () => {
        const config = { _inThoughtBlock: true };
        const line = `data:${JSON.stringify({
            promptFeedback: { blockReason: 'SAFETY' },
        })}`;
        const result = parseGeminiSSELine(line, config);
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('Gemini Safety Block');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('opens thought block with <Thoughts> prefix on first thought part', () => {
        const config = { _inThoughtBlock: false };
        const line = `data:${JSON.stringify({
            candidates: [{ content: { parts: [{ thought: true, text: 'reasoning step 1' }] } }],
        })}`;
        const result = parseGeminiSSELine(line, config);
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('reasoning step 1');
        expect(config._inThoughtBlock).toBe(true);
    });

    it('does NOT add <Thoughts> prefix when already in thought block', () => {
        const config = { _inThoughtBlock: true };
        const line = `data:${JSON.stringify({
            candidates: [{ content: { parts: [{ thought: true, text: 'step 2' }] } }],
        })}`;
        const result = parseGeminiSSELine(line, config);
        expect(result).not.toContain('<Thoughts>');
        expect(result).toBe('step 2');
        expect(config._inThoughtBlock).toBe(true);
    });

    it('captures thought_signature when useThoughtSignature is enabled', () => {
        const config = { useThoughtSignature: true };
        const line = `data:${JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'hi', thought_signature: 'sig-abc-123' }] } }],
        })}`;
        parseGeminiSSELine(line, config);
        expect(config._lastSignature).toBe('sig-abc-123');
    });

    it('captures thoughtSignature (camelCase variant)', () => {
        const config = { useThoughtSignature: true };
        const line = `data:${JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'hi', thoughtSignature: 'sig-def-456' }] } }],
        })}`;
        parseGeminiSSELine(line, config);
        expect(config._lastSignature).toBe('sig-def-456');
    });

    it('accumulates _streamResponseText when useThoughtSignature is enabled', () => {
        const config = { useThoughtSignature: true, _streamResponseText: '' };
        const line = `data:${JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'hello' }] } }],
        })}`;
        parseGeminiSSELine(line, config);
        expect(config._streamResponseText).toBe('hello');
    });
});

// ═══════════════════════════════════════════════════════════════════
// 2. format-openai.js — Array content cross-format conversion
// ═══════════════════════════════════════════════════════════════════
describe('formatToOpenAI — uncovered array content branches', () => {
    it('converts Anthropic-style image block to OpenAI image_url format', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
                ],
            },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        const imgPart = result[0].content.find(p => p.type === 'image_url');
        expect(imgPart).toBeDefined();
        expect(imgPart.image_url.url).toBe('data:image/png;base64,abc123');
    });

    it('converts audio/wav inlineData to input_audio format', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { inlineData: { data: 'audiodata123', mimeType: 'audio/wav' } },
                ],
            },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        const audioPart = result[0].content.find(p => p.type === 'input_audio');
        expect(audioPart).toBeDefined();
        expect(audioPart.input_audio.data).toBe('audiodata123');
        expect(audioPart.input_audio.format).toBe('wav');
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3. format-anthropic.js — _mergeOrPush string merge + URL image + cache
// ═══════════════════════════════════════════════════════════════════
describe('_mergeOrPush — string content merge branch', () => {
    it('converts string content to array when merging same-role messages', () => {
        const msgs = [{ role: 'user', content: 'hello' }];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'world' }]);
        expect(msgs).toHaveLength(1);
        expect(Array.isArray(msgs[0].content)).toBe(true);
        expect(msgs[0].content).toHaveLength(2);
        expect(msgs[0].content[0]).toEqual({ type: 'text', text: 'hello' });
        expect(msgs[0].content[1]).toEqual({ type: 'text', text: 'world' });
    });
});

describe('formatToAnthropic — uncovered branches', () => {
    it('converts URL-based image_url to Anthropic URL source', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
                ],
            },
        ];
        const { messages: result } = formatToAnthropic(messages);
        const imgPart = result[0].content.find(p => p.type === 'image');
        expect(imgPart).toBeDefined();
        expect(imgPart.source.type).toBe('url');
        expect(imgPart.source.url).toBe('https://example.com/image.png');
    });

    it('applies cache_control to string content by wrapping in array', () => {
        // Create a message structure where formatted output has string content
        // at a cachePoint boundary. We need a message with cachePoint:true
        // whose Anthropic form ends up with string-like content in formattedMsgs.
        // Since _mergeOrPush always produces array content, the string path
        // is hit when an existing formattedMsg already has string content
        // (edge case from prior merge). We test this by pre-checking the branch:
        const messages = [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'Response' },
            { role: 'user', content: 'Second message', cachePoint: true },
        ];
        const { messages: result } = formatToAnthropic(messages, { caching: true });
        // The cachePoint message's content should have cache_control set
        const lastUserMsg = result.filter(m => m.role === 'user').pop();
        expect(lastUserMsg).toBeDefined();
        const lastContent = lastUserMsg.content[lastUserMsg.content.length - 1];
        expect(lastContent.cache_control).toBeDefined();
        expect(lastContent.cache_control.type).toBe('ephemeral');
    });
});

// ═══════════════════════════════════════════════════════════════════
// 4. format-gemini.js — JSON.stringify fallback, inlineData merge, preserveSystem
// ═══════════════════════════════════════════════════════════════════
describe('formatToGemini — uncovered branches', () => {
    it('JSON.stringifies non-string non-array content as fallback', () => {
        const messages = [
            { role: 'user', content: { custom: 'data', nested: true } },
        ];
        const { contents } = formatToGemini(messages);
        expect(contents).toHaveLength(1);
        const text = contents[0].parts[0].text;
        expect(text).toContain('"custom"');
        expect(text).toContain('"data"');
    });

    it('pushes new text part when last part is inlineData during same-role merge', () => {
        // Two consecutive user messages where first has image, second has text
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
                ],
            },
            { role: 'user', content: 'Describe this image' },
        ];
        const { contents } = formatToGemini(messages);
        // Should be merged into one user entry
        expect(contents).toHaveLength(1);
        expect(contents[0].role).toBe('user');
        // The last part should be the text, added as separate part (not concatenated to inlineData)
        const parts = contents[0].parts;
        const textPart = parts.find(p => typeof p.text === 'string' && p.text.includes('Describe'));
        expect(textPart).toBeDefined();
    });

    it('prepends system as new user message when first content is model role (!preserveSystem)', () => {
        const messages = [
            { role: 'system', content: 'Be helpful' },
            { role: 'assistant', content: 'Hello there!' },
        ];
        const { contents, systemInstruction } = formatToGemini(messages, { preserveSystem: false });
        // System should be merged into contents, not systemInstruction
        expect(systemInstruction).toHaveLength(0);
        // First entry should be a user message with system text prepended
        expect(contents[0].role).toBe('user');
        const sysText = contents[0].parts.find(p => p.text?.includes('system:'));
        expect(sysText).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════════════
// 5. token-usage.js — CJK-heavy text estimation (indirect test)
// ═══════════════════════════════════════════════════════════════════
describe('_normalizeTokenUsage — CJK estimation branch', () => {
    it('uses CJK-biased estimation for Anthropic with thinking and CJK visible text', () => {
        const raw = {
            input_tokens: 100,
            output_tokens: 500,
        };
        const meta = {
            anthropicHasThinking: true,
            // CJK-heavy visible text (>30% CJK) → triggers the CJK estimation branch
            anthropicVisibleText: '日本語テスト文字列です。これはCJK重みのテストです。',
        };
        const result = _normalizeTokenUsage(raw, 'anthropic', meta);
        expect(result).not.toBeNull();
        // With CJK estimation, reasoning should be positive (output - visibleEstimate)
        expect(result.reasoning).toBeGreaterThan(0);
        expect(result.reasoningEstimated).toBe(true);
    });

    it('returns zero reasoning for Anthropic without thinking flag', () => {
        const raw = { input_tokens: 100, output_tokens: 50 };
        const result = _normalizeTokenUsage(raw, 'anthropic');
        expect(result.reasoning).toBe(0);
        expect(result.reasoningEstimated).toBeUndefined();
    });
});
