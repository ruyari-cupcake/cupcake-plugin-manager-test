/**
 * Round 15: response-parsers.js branch coverage — 13 uncovered branches.
 * Uses static imports for proper coverage tracking.
 */
import { describe, it, expect } from 'vitest';
import {
    parseOpenAINonStreamingResponse,
    parseResponsesAPINonStreamingResponse,
    parseGeminiNonStreamingResponse,
    parseClaudeNonStreamingResponse,
} from '../src/lib/response-parsers.js';

// ─── response-parsers.js ───
describe('response-parsers.js uncovered branches — Round 15', () => {

    // ── OpenAI ──

    it('L38: empty <think></think> tag → dsThinking is empty string', () => {
        const data = {
            choices: [{ message: { content: 'Hello <think></think>world' } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).not.toContain('<Thoughts>');
        expect(result.content).toContain('Hello');
    });

    it('L46: OpenAI response with no usage data', () => {
        const data = {
            choices: [{ message: { content: 'Hello world' } }],
            // no .usage
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello world');
    });

    it('OpenAI response with no message', () => {
        const data = { choices: [{}] };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });

    it('OpenAI response with openRouterReasoning but no reasoningContent', () => {
        const data = {
            choices: [{ message: { content: 'Answer', reasoning: 'Because...' } }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('Because...');
    });

    it('OpenAI response with both reasoningContent and reasoning → only reasoningContent used', () => {
        const data = {
            choices: [{
                reasoning_content: 'Primary reasoning',
                message: { content: 'Answer', reasoning: 'Secondary' },
            }],
        };
        const result = parseOpenAINonStreamingResponse(data);
        expect(result.content).toContain('Primary reasoning');
        expect(result.content).not.toContain('Secondary');
    });

    // ── Responses API ──

    it('L70: Responses API output_text part with empty text', () => {
        const data = {
            output: [
                { type: 'message', content: [{ type: 'output_text', text: '' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });

    it('L84: Responses API with no usage data', () => {
        const data = {
            output: [
                { type: 'message', content: [{ type: 'output_text', text: 'Hello' }] },
            ],
            // no .usage
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello');
    });

    it('Responses API with reasoning summary', () => {
        const data = {
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'I think...' },
                        { type: 'other', text: 'ignored' },
                    ],
                },
                { type: 'message', content: [{ type: 'output_text', text: 'Answer' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('I think...');
        expect(result.content).toContain('Answer');
    });

    it('Responses API with empty reasoning summary', () => {
        const data = {
            output: [
                { type: 'reasoning', summary: [{ type: 'other' }] },
                { type: 'message', content: [{ type: 'output_text', text: 'Answer' }] },
            ],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.content).not.toContain('<Thoughts>');
    });

    it('Responses API with null/non-object items in output', () => {
        const data = {
            output: [null, 'string', { type: 'message', content: [{ type: 'output_text', text: 'Ok' }] }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
    });

    it('Responses API with null/non-object items in content', () => {
        const data = {
            output: [{ type: 'message', content: [null, 'string', { type: 'output_text', text: 'Ok' }] }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
    });

    it('Responses API fallback to OpenAI format (choices present)', () => {
        const data = {
            choices: [{ message: { content: 'Fallback content' } }],
        };
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(true);
        expect(result.content).toContain('Fallback content');
    });

    it('Responses API with no output and no choices', () => {
        const data = {};
        const result = parseResponsesAPINonStreamingResponse(data);
        expect(result.success).toBe(false);
    });

    // ── Gemini ──

    it('L113+: Gemini with mixed thought and text parts', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Thinking...' },
                        { text: 'The answer' }, // non-thought part → L113 false branch
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('The answer');
    });

    it('L114: Gemini thought part with no text', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true }, // no text → L114 false branch
                        { text: 'The answer' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.content).toContain('The answer');
        // Should NOT have opened <Thoughts> since no text in thought part
    });

    it('L117: Gemini consecutive thought parts → already inThought', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Part 1' },
                        { thought: true, text: 'Part 2' }, // !inThought is false → L117 false
                        { text: 'Final answer' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.content).toContain('Part 1');
        expect(result.content).toContain('Part 2');
        expect(result.content).toContain('Final answer');
    });

    it('L133: Gemini with no thought_signature', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [{ text: 'Simple answer' }],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data, { useThoughtSignature: true });
        expect(result.success).toBe(true);
        // No signature to save
    });

    it('Gemini with thought_signature extraction', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Thinking...', thought_signature: 'sig123' },
                        { text: 'Answer' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data, { useThoughtSignature: true });
        expect(result.success).toBe(true);
    });

    it('Gemini with thoughtSignature (alt field)', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'Thinking...', thoughtSignature: 'sig456' },
                        { text: 'Answer' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data, { useThoughtSignature: true });
        expect(result.success).toBe(true);
    });

    it('Gemini safety block', () => {
        const data = {
            promptFeedback: { blockReason: 'SAFETY' },
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Safety Block');
    });

    it('Gemini with no candidates', () => {
        const data = {};
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });

    it('Gemini with usageMetadata', () => {
        const data = {
            candidates: [{
                content: { parts: [{ text: 'Answer' }] },
            }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        };
        const result = parseGeminiNonStreamingResponse(data, {}, 'req-gemini-1');
        expect(result.success).toBe(true);
    });

    it('Gemini with no usageMetadata', () => {
        const data = {
            candidates: [{
                content: { parts: [{ text: 'Answer' }] },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        expect(result.success).toBe(true);
    });

    it('Gemini with thought then text then thought (re-enter thought)', () => {
        const data = {
            candidates: [{
                content: {
                    parts: [
                        { thought: true, text: 'T1' },
                        { text: 'Content' },
                        { thought: true, text: 'T2' }, // re-enter thought mode
                        { text: 'More content' },
                    ],
                },
            }],
        };
        const result = parseGeminiNonStreamingResponse(data);
        // Should have two thought blocks
        const thinkMatches = result.content.match(/<Thoughts>/g);
        expect(thinkMatches?.length).toBe(2);
    });

    // ── Claude ──

    it('L148: Claude error with only data.error object (no .message)', () => {
        const data = { type: 'error', error: { code: 500 } };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Claude Error');
    });

    it('L157: Claude thinking block with empty thinking text', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: '' }, // falsy → L157 false
                { type: 'text', text: 'Answer' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).not.toContain('<Thoughts>');
        expect(result.content).toContain('Answer');
    });

    it('L162: Claude redacted_thinking when NOT in thinking mode', () => {
        const data = {
            content: [
                { type: 'redacted_thinking' }, // !inThinking true → opens Thoughts
                { type: 'text', text: 'Answer' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
        expect(result.content).toContain('{{redacted_thinking}}');
    });

    it('L162: Claude redacted_thinking when ALREADY in thinking mode', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Some thought' },
                { type: 'redacted_thinking' }, // !inThinking false → doesn't re-open
                { type: 'text', text: 'Answer' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('Some thought');
        expect(result.content).toContain('{{redacted_thinking}}');
    });

    it('L169: Claude text block when NOT in thinking mode (first block)', () => {
        const data = {
            content: [
                { type: 'text', text: 'Direct answer' }, // inThinking=false → L169 false branch
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toBe('Direct answer');
        expect(result.content).not.toContain('</Thoughts>');
    });

    it('L184: Claude with no usage data', () => {
        const data = {
            content: [
                { type: 'text', text: 'Answer' },
            ],
            // no .usage
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(true);
    });

    it('Claude error from data.message (no error object)', () => {
        const data = { type: 'error', message: 'Rate limited' };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Rate limited');
    });

    it('Claude empty content array', () => {
        const data = { content: [] };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.success).toBe(false);
        expect(result.content).toContain('Empty response');
    });

    it('Claude text block with empty text', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'I think...' },
                { type: 'text', text: '' }, // empty text
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        expect(result.content).toContain('<Thoughts>');
    });

    it('Claude with only thinking, no text block (inThinking stays true at end)', () => {
        const data = {
            content: [
                { type: 'thinking', thinking: 'Only thoughts' },
            ],
        };
        const result = parseClaudeNonStreamingResponse(data);
        // inThinking still true at end → closes Thoughts
        expect(result.content).toContain('</Thoughts>');
    });
});

// Router tests removed — parser tests are sufficient for this round.
