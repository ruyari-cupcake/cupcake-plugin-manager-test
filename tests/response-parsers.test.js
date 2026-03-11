import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from '../src/lib/response-parsers.js';
import { _takeTokenUsage, _tokenUsageStore } from '../src/lib/token-usage.js';

beforeEach(() => {
    _tokenUsageStore.clear();
});

describe('parseOpenAINonStreamingResponse', () => {
    it('extracts text from standard response', () => {
        const data = { choices: [{ message: { content: 'Hello world' } }] };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello world');
    });

    it('returns failure for empty response', () => {
        const result = parseOpenAINonStreamingResponse({});
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });

    it('wraps reasoning_content in Thoughts tags', () => {
        const data = {
            choices: [{ reasoning_content: 'thinking...', message: { content: 'answer' } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('thinking...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('answer');
    });

    it('handles OpenRouter reasoning field', () => {
        const data = {
            choices: [{ message: { content: 'answer', reasoning: 'thought process' } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('thought process');
    });

    it('extracts DeepSeek <think> blocks', () => {
        const data = {
            choices: [{ message: { content: '<think>deep thinking</think>The answer is 42.' } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('deep thinking');
        expect(result.content).toContain('The answer is 42.');
    });

    it('handles array content', () => {
        const data = {
            choices: [{ message: { content: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }] } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toBe('part1part2');
    });
});

describe('parseResponsesAPINonStreamingResponse', () => {
    it('extracts text from output items', () => {
        const data = {
            output: [
                { type: 'message', content: [{ type: 'output_text', text: 'Hello GPT-5.4' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello GPT-5.4');
    });

    it('extracts reasoning summary', () => {
        const data = {
            output: [
                { type: 'reasoning', summary: [{ type: 'summary_text', text: 'I think...' }] },
                { type: 'message', content: [{ type: 'output_text', text: 'Result' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('I think...');
        expect(result.content).toContain('Result');
    });

    it('falls back to Chat Completions format', () => {
        const data = { choices: [{ message: { content: 'fallback' } }] };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('fallback');
    });

    it('returns failure for empty output', () => {
        const result = parseResponsesAPINonStreamingResponse({});
        expect(result.success).toBe(false);
    });
});

describe('parseGeminiNonStreamingResponse', () => {
    it('extracts text from candidates', () => {
        const data = {
            candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Gemini response');
    });

    it('handles safety block', () => {
        const data = { promptFeedback: { blockReason: 'SAFETY' } };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    // Regression: verifies shared GEMINI_BLOCK_REASONS constant (dedup item #3)
    it.each(['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'])(
        'detects %s block reason via shared constant',
        (reason) => {
            const data = { promptFeedback: { blockReason: reason } };
            const result = parseGeminiNonStreamingResponse(data);
            expect(result.success).toBe(false);
        }
    );

    it('wraps thought parts in Thoughts tags', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'thinking...' },
                        { text: 'answer' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('thinking...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('answer');
    });

    it('returns empty response message when no content', () => {
        const data = { candidates: [{ content: { parts: [] } }] };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.content).toContain('[Gemini] Empty response');
    });

    it('detects PROHIBITED_CONTENT block', () => {
        const data = { candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('PROHIBITED_CONTENT');
    });
});

describe('parseClaudeNonStreamingResponse', () => {
    it('extracts text content', () => {
        const data = { content: [{ type: 'text', text: 'Claude says hi' }] };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Claude says hi');
    });

    it('handles API error response', () => {
        const data = { type: 'error', error: { message: 'Rate limited' } };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Rate limited');
    });

    it('wraps thinking blocks', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Let me consider...' },
                { type: 'text', text: 'The answer is.' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Let me consider...');
        expect(result.content).toContain('</Thoughts>');
        expect(result.content).toContain('The answer is.');
    });

    it('handles redacted_thinking', () => {
        const data = {
            content: [
                { type: 'redacted_thinking' },
                { type: 'text', text: 'result' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('{{redacted_thinking}}');
        expect(result.content).toContain('result');
    });

    it('closes unclosed thinking block', () => {
        const data = {
            content: [{ type: 'thinking', thinking: 'still thinking...' }],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('</Thoughts>');
    });

    it('handles interleaved thinking blocks (thinking→text→thinking→text)', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'First reasoning step.' },
                { type: 'text', text: 'Intermediate answer.' },
                { type: 'thinking', thinking: 'Second reasoning after tool.' },
                { type: 'text', text: 'Final conclusion.' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(true);
        // Both thinking blocks present
        expect(result.content).toContain('First reasoning step.');
        expect(result.content).toContain('Second reasoning after tool.');
        // Both text blocks present
        expect(result.content).toContain('Intermediate answer.');
        expect(result.content).toContain('Final conclusion.');
        // Proper structure: thoughts close before text
        const firstThinkEnd = result.content.indexOf('</Thoughts>');
        const intermediateTextStart = result.content.indexOf('Intermediate answer.');
        expect(firstThinkEnd).toBeLessThan(intermediateTextStart);
    });

    it('handles thinking block with empty thinking string', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: 'Answer without thinking.' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Answer without thinking.');
        // Empty thinking should NOT produce Thoughts tags
        expect(result.content).not.toContain('<Thoughts>');
    });

    it('stores estimated reasoning usage for anthropic thinking blocks when exact field is absent', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Let me consider...' },
                { type: 'text', text: 'The answer is.' },
            ],
            usage: { input_tokens: 50, output_tokens: 20 },
        };

        parseClaudeNonStreamingResponse(data, {}, 'req-claude-est-1');
        const usage = _takeTokenUsage('req-claude-est-1', false);

        expect(usage).not.toBeNull();
        expect(usage.input).toBe(50);
        expect(usage.output).toBe(20);
        expect(usage.reasoning).toBe(16);
        expect(usage.reasoningEstimated).toBe(true);
    });
});
