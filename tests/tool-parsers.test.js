/**
 * @file tool-parsers.test.js — Tool response parser + tool loop unit tests
 * Covers: parseOpenAIToolCalls, parseAnthropicToolCalls, parseGeminiToolCalls,
 *         parseToolCalls dispatcher, formatToolResult, runToolLoop
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    parseOpenAIToolCalls,
    parseAnthropicToolCalls,
    parseGeminiToolCalls,
    parseToolCalls,
    formatToolResult,
} = await import('../src/lib/tool-use/tool-parsers.js');

// ── parseOpenAIToolCalls ──
describe('parseOpenAIToolCalls', () => {
    it('parses tool_calls from OpenAI response', () => {
        const data = {
            choices: [{ message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                    { id: 'call_1', function: { name: 'calculate', arguments: '{"expression":"2+2"}' } }
                ]
            }}]
        };
        const r = parseOpenAIToolCalls(data);
        expect(r.hasToolCalls).toBe(true);
        expect(r.toolCalls).toHaveLength(1);
        expect(r.toolCalls[0].name).toBe('calculate');
        expect(r.toolCalls[0].arguments.expression).toBe('2+2');
    });

    it('returns hasToolCalls=false when no tool_calls', () => {
        const data = { choices: [{ message: { role: 'assistant', content: 'Hello!' } }] };
        const r = parseOpenAIToolCalls(data);
        expect(r.hasToolCalls).toBe(false);
        expect(r.textContent).toBe('Hello!');
    });

    it('handles empty choices', () => {
        expect(parseOpenAIToolCalls({}).hasToolCalls).toBe(false);
        expect(parseOpenAIToolCalls({ choices: [] }).hasToolCalls).toBe(false);
    });

    it('handles malformed function.arguments JSON', () => {
        const data = {
            choices: [{ message: {
                tool_calls: [{ id: 'c1', function: { name: 'test', arguments: 'not-json' } }]
            }}]
        };
        const r = parseOpenAIToolCalls(data);
        expect(r.hasToolCalls).toBe(true);
        expect(r.toolCalls[0].arguments).toEqual({});
    });

    it('generates ID if missing', () => {
        const data = {
            choices: [{ message: {
                tool_calls: [{ function: { name: 'test', arguments: '{}' } }]
            }}]
        };
        const r = parseOpenAIToolCalls(data);
        expect(r.toolCalls[0].id).toMatch(/^call_/);
    });
});

// ── parseAnthropicToolCalls ──
describe('parseAnthropicToolCalls', () => {
    it('parses tool_use blocks', () => {
        const data = {
            content: [
                { type: 'text', text: 'Let me calculate...' },
                { type: 'tool_use', id: 'toolu_1', name: 'calculate', input: { expression: '2+2' } }
            ]
        };
        const r = parseAnthropicToolCalls(data);
        expect(r.hasToolCalls).toBe(true);
        expect(r.toolCalls).toHaveLength(1);
        expect(r.toolCalls[0].name).toBe('calculate');
        expect(r.textContent).toBe('Let me calculate...');
    });

    it('returns false when only text blocks', () => {
        const data = { content: [{ type: 'text', text: 'Hello!' }] };
        const r = parseAnthropicToolCalls(data);
        expect(r.hasToolCalls).toBe(false);
        expect(r.textContent).toBe('Hello!');
    });

    it('handles non-array content', () => {
        expect(parseAnthropicToolCalls({ content: null }).hasToolCalls).toBe(false);
        expect(parseAnthropicToolCalls({}).hasToolCalls).toBe(false);
    });

    it('preserves full assistant content in assistantMessage', () => {
        const data = {
            content: [
                { type: 'text', text: 'Thinking...' },
                { type: 'tool_use', id: 'tu1', name: 'roll_dice', input: { notation: '2d6' } }
            ]
        };
        const r = parseAnthropicToolCalls(data);
        expect(r.assistantMessage.role).toBe('assistant');
        expect(r.assistantMessage.content).toBe(data.content);
    });
});

// ── parseGeminiToolCalls ──
describe('parseGeminiToolCalls', () => {
    it('parses functionCall parts', () => {
        const data = {
            candidates: [{ content: { parts: [
                { functionCall: { name: 'roll_dice', args: { notation: '3d6' } } }
            ]}}]
        };
        const r = parseGeminiToolCalls(data);
        expect(r.hasToolCalls).toBe(true);
        expect(r.toolCalls[0].name).toBe('roll_dice');
        expect(r.toolCalls[0].arguments.notation).toBe('3d6');
    });

    it('returns false for text-only parts', () => {
        const data = {
            candidates: [{ content: { parts: [
                { text: 'Hello from Gemini!' }
            ]}}]
        };
        const r = parseGeminiToolCalls(data);
        expect(r.hasToolCalls).toBe(false);
        expect(r.textContent).toBe('Hello from Gemini!');
    });

    it('handles missing parts', () => {
        expect(parseGeminiToolCalls({}).hasToolCalls).toBe(false);
        expect(parseGeminiToolCalls({ candidates: [] }).hasToolCalls).toBe(false);
        expect(parseGeminiToolCalls({ candidates: [{ content: {} }] }).hasToolCalls).toBe(false);
    });

    it('generates gemini_ prefixed ID', () => {
        const data = {
            candidates: [{ content: { parts: [
                { functionCall: { name: 'test', args: {} } }
            ]}}]
        };
        const r = parseGeminiToolCalls(data);
        expect(r.toolCalls[0].id).toMatch(/^gemini_/);
    });
});

// ── parseToolCalls dispatcher ──
describe('parseToolCalls', () => {
    it('dispatches to OpenAI by default', () => {
        const data = { choices: [{ message: { content: 'Hi' } }] };
        expect(parseToolCalls(data, 'openai').textContent).toBe('Hi');
    });

    it('dispatches to Anthropic', () => {
        const data = { content: [{ type: 'text', text: 'Hi' }] };
        expect(parseToolCalls(data, 'anthropic').textContent).toBe('Hi');
    });

    it('dispatches to Google', () => {
        const data = { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] };
        expect(parseToolCalls(data, 'google').textContent).toBe('Hi');
    });

    it('defaults to OpenAI for unknown format', () => {
        const data = { choices: [{ message: { content: 'Hi' } }] };
        expect(parseToolCalls(data, 'unknown').textContent).toBe('Hi');
    });
});

// ── formatToolResult ──
describe('formatToolResult', () => {
    const call = { id: 'call_123', name: 'calculate' };
    const result = '{"result":4}';

    it('OpenAI format', () => {
        const r = formatToolResult(call, result, 'openai');
        expect(r).toEqual({ role: 'tool', tool_call_id: 'call_123', content: result });
    });

    it('Anthropic format', () => {
        const r = formatToolResult(call, result, 'anthropic');
        expect(r.role).toBe('user');
        expect(r.content[0].type).toBe('tool_result');
        expect(r.content[0].tool_use_id).toBe('call_123');
        expect(r.content[0].content).toBe(result);
    });

    it('Google format', () => {
        const r = formatToolResult(call, result, 'google');
        expect(r.role).toBe('function');
        expect(r.parts[0].functionResponse.name).toBe('calculate');
        expect(r.parts[0].functionResponse.response.result).toBe(result);
    });
});

// ── runToolLoop ──
describe('runToolLoop', () => {
    let runToolLoop;

    beforeEach(async () => {
        vi.resetModules();

        // Mock dependencies for tool-loop
        vi.doMock('../src/lib/tool-use/tool-definitions.js', () => ({
            getActiveToolList: vi.fn(() => [{ name: 'calculate', description: 'calc', inputSchema: {} }]),
        }));
        vi.doMock('../src/lib/tool-use/tool-executor.js', () => ({
            executeToolCall: vi.fn(async (name) => {
                if (name === 'calculate') return [{ type: 'text', text: '{"result":42}' }];
                return [{ type: 'text', text: '{"error":"unknown"}' }];
            }),
        }));
        vi.doMock('../src/lib/tool-use/tool-config.js', () => ({
            getToolMaxDepth: vi.fn(() => 3),
            getToolTimeout: vi.fn(() => 5000),
        }));

        const mod = await import('../src/lib/tool-use/tool-loop.js');
        runToolLoop = mod.runToolLoop;
    });

    it('returns immediately when no _rawData', async () => {
        const result = await runToolLoop({
            initialResult: { success: true, content: 'Hello' },
            messages: [],
            config: { format: 'openai' },
            temp: 0.7, maxTokens: 1000, args: {},
            fetchFn: vi.fn(),
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello');
        expect(result).not.toHaveProperty('_rawData');
    });

    it('returns text when no tool_calls in raw data', async () => {
        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: 'Hello',
                _rawData: { choices: [{ message: { content: 'Hello' } }] }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 0.7, maxTokens: 1000, args: {},
            fetchFn: vi.fn(),
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello');
    });

    it('executes tool loop: tool_call → execute → re-request → text response', async () => {
        const fetchFn = vi.fn().mockResolvedValueOnce({
            success: true,
            content: 'The answer is 42.',
            _rawData: { choices: [{ message: { role: 'assistant', content: 'The answer is 42.' } }] }
        });

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{ message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{ id: 'call_1', function: { name: 'calculate', arguments: '{"expression":"6*7"}' } }]
                    }}]
                }
            },
            messages: [{ role: 'user', content: 'What is 6*7?' }],
            config: { format: 'openai' },
            temp: 0.7, maxTokens: 1000, args: {},
            fetchFn,
        });

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
        expect(result.content).toBe('The answer is 42.');
    });

    it('handles API failure during tool round', async () => {
        const fetchFn = vi.fn().mockResolvedValueOnce({
            success: false,
            content: 'Rate limited',
            _status: 429
        });

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{ message: {
                        tool_calls: [{ id: 'c1', function: { name: 'calculate', arguments: '{}' } }]
                    }}]
                }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 0.7, maxTokens: 1000, args: {},
            fetchFn,
        });

        expect(result.success).toBe(false);
    });

    it('respects abort signal', async () => {
        const ac = new AbortController();
        ac.abort();

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{ message: {
                        tool_calls: [{ id: 'c1', function: { name: 'calculate', arguments: '{}' } }]
                    }}]
                }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 0.7, maxTokens: 1000, args: {},
            abortSignal: ac.signal,
            fetchFn: vi.fn(),
        });

        // Loop should exit early without calling fetchFn
        expect(result.content).toBe('');
    });

    it('Anthropic format loop', async () => {
        const fetchFn = vi.fn().mockResolvedValueOnce({
            success: true,
            content: 'Done!',
            _rawData: {
                content: [{ type: 'text', text: 'Done!' }]
            }
        });

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    content: [
                        { type: 'text', text: 'Let me check...' },
                        { type: 'tool_use', id: 'toolu_1', name: 'calculate', input: { expression: '1+1' } }
                    ]
                }
            },
            messages: [],
            config: { format: 'anthropic' },
            temp: 0.7, maxTokens: 1000, args: {},
            fetchFn,
        });

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
        expect(result.content).toBe('Done!');
    });
});
