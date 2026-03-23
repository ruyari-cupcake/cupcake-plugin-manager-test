import { describe, it, expect } from 'vitest';
import {
    parseOpenAISSELine,
    normalizeOpenAIMessageContent,
    parseGeminiSSELine,
    GEMINI_BLOCK_REASONS,
} from '../src/lib/sse-parsers.js';

describe('parseOpenAISSELine', () => {
    it('returns null for non-data lines', () => {
        expect(parseOpenAISSELine('event: message')).toBeNull();
        expect(parseOpenAISSELine(': comment')).toBeNull();
        expect(parseOpenAISSELine('')).toBeNull();
    });

    it('returns null for [DONE] signal', () => {
        expect(parseOpenAISSELine('data: [DONE]')).toBeNull();
    });

    it('extracts delta content from standard OpenAI SSE', () => {
        const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
        expect(parseOpenAISSELine(line)).toBe('Hello');
    });

    it('returns null when no delta content', () => {
        const line = 'data: {"choices":[{"delta":{}}]}';
        expect(parseOpenAISSELine(line)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
        expect(parseOpenAISSELine('data: {invalid}')).toBeNull();
    });

    it('handles empty choices array', () => {
        expect(parseOpenAISSELine('data: {"choices":[]}')).toBeNull();
    });

    it('extracts reasoning_content field', () => {
        const line = 'data: {"choices":[{"delta":{"reasoning_content":"think step"}}]}';
        expect(parseOpenAISSELine(line)).toBe('think step');
    });

    it('extracts reasoning_text field when no reasoning_content', () => {
        const line = 'data: {"choices":[{"delta":{"reasoning_text":"copilot gemini think"}}]}';
        expect(parseOpenAISSELine(line)).toBe('copilot gemini think');
    });

    it('extracts reasoning field as last fallback', () => {
        const line = 'data: {"choices":[{"delta":{"reasoning":"basic reasoning"}}]}';
        expect(parseOpenAISSELine(line)).toBe('basic reasoning');
    });

    it('prefers reasoning_content over reasoning_text', () => {
        const line = 'data: {"choices":[{"delta":{"reasoning_content":"primary","reasoning_text":"secondary"}}]}';
        expect(parseOpenAISSELine(line)).toBe('primary');
    });

    it('extracts thought-flagged delta.content', () => {
        const line = 'data: {"choices":[{"delta":{"content":"thinking stuff","thought":true},"thought":true}]}';
        expect(parseOpenAISSELine(line)).toBe('thinking stuff');
    });

    it('extracts thought via choices[0].thought flag', () => {
        const line = 'data: {"choices":[{"delta":{"content":"inner thought"},"thought":true}]}';
        expect(parseOpenAISSELine(line)).toBe('inner thought');
    });
});

describe('normalizeOpenAIMessageContent', () => {
    it('returns string content as-is', () => {
        expect(normalizeOpenAIMessageContent('hello')).toBe('hello');
    });

    it('returns empty string for null/undefined', () => {
        expect(normalizeOpenAIMessageContent(null)).toBe('');
        expect(normalizeOpenAIMessageContent(undefined)).toBe('');
    });

    it('concatenates array of text parts', () => {
        const content = [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
        ];
        expect(normalizeOpenAIMessageContent(content)).toBe('Part 1Part 2');
    });

    it('handles mixed string and object parts', () => {
        const content = ['Hello', { text: ' World' }];
        expect(normalizeOpenAIMessageContent(content)).toBe('Hello World');
    });

    it('handles content property in parts', () => {
        const content = [{ type: 'text', content: 'from content' }];
        expect(normalizeOpenAIMessageContent(content)).toBe('from content');
    });

    it('converts non-string/non-array to string', () => {
        expect(normalizeOpenAIMessageContent(42)).toBe('42');
    });
});

describe('GEMINI_BLOCK_REASONS', () => {
    it('contains expected block reasons', () => {
        expect(GEMINI_BLOCK_REASONS).toContain('SAFETY');
        expect(GEMINI_BLOCK_REASONS).toContain('RECITATION');
        expect(GEMINI_BLOCK_REASONS).toContain('PROHIBITED_CONTENT');
    });
});

describe('parseGeminiSSELine', () => {
    it('returns null for non-data lines', () => {
        expect(parseGeminiSSELine('event: update')).toBeNull();
    });

    it('extracts text from Gemini SSE chunk', () => {
        const line = 'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}';
        expect(parseGeminiSSELine(line)).toBe('Hello');
    });

    it('handles thought blocks', () => {
        const config = {};
        const line = 'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"thinking..."}]}}]}';
        const result = parseGeminiSSELine(line, config);
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('thinking...');
        expect(config._inThoughtBlock).toBe(true);
    });

    it('closes thought block on regular text after thought', () => {
        const config = { _inThoughtBlock: true };
        const line = 'data: {"candidates":[{"content":{"parts":[{"text":"response"}]}}]}';
        const result = parseGeminiSSELine(line, config);
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('response');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('detects safety blocks', () => {
        const line = 'data: {"promptFeedback":{"blockReason":"SAFETY"}}';
        const result = parseGeminiSSELine(line);
        expect(result).toContain('Gemini Safety Block');
    });

    it('captures thought_signature', () => {
        const config = { useThoughtSignature: true };
        const line = 'data: {"candidates":[{"content":{"parts":[{"text":"hi","thought_signature":"sig123"}]}}]}';
        parseGeminiSSELine(line, config);
        expect(config._lastSignature).toBe('sig123');
    });

    it('captures usageMetadata', () => {
        const config = {};
        const line = 'data: {"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":50}}';
        parseGeminiSSELine(line, config);
        expect(config._streamUsageMetadata).toEqual({ promptTokenCount: 100, candidatesTokenCount: 50 });
    });

    it('returns null for invalid JSON', () => {
        expect(parseGeminiSSELine('data: {bad}')).toBeNull();
    });

    it('closes thought block on finishReason', () => {
        const config = { _inThoughtBlock: true };
        const line = 'data: {"candidates":[{"finishReason":"STOP","content":{"parts":[]}}]}';
        const result = parseGeminiSSELine(line, config);
        expect(result).toContain('</Thoughts>');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('accumulates stream response text when useThoughtSignature is enabled', () => {
        const config = { useThoughtSignature: true };
        parseGeminiSSELine('data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}', config);
        parseGeminiSSELine('data: {"candidates":[{"content":{"parts":[{"text":"World"}]}}]}', config);
        expect(config._streamResponseText).toBe('Hello World');
    });
});
