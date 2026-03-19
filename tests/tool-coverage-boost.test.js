/**
 * @file tool-coverage-boost.test.js — Additional tests to boost tool-use coverage to 90%+
 * Covers: _parseSearchResults per-provider, webSearch per-provider, calculate Math.Math edge,
 *         tool-loop max-depth recovery, tool-loop MAX_CALLS mid-round exit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock for tool-executor ──
const h = vi.hoisted(() => ({
    getArg: vi.fn(() => ''),
    nativeFetch: vi.fn(),
}));

vi.mock('../src/lib/tool-use/tool-config.js', () => ({
    isToolUseEnabled: vi.fn(() => true),
    isToolEnabled: vi.fn(() => true),
    getToolMaxDepth: vi.fn(async () => 5),
    getToolTimeout: vi.fn(async () => 10000),
    getWebSearchConfig: vi.fn(async () => ({
        provider: 'brave', url: '', key: 'test-key', cx: ''
    })),
}));

vi.stubGlobal('Risu', {
    getArgument: h.getArg,
    nativeFetch: h.nativeFetch,
});

const { getWebSearchConfig } = await import('../src/lib/tool-use/tool-config.js');
const { calculate, webSearch, fetchUrl } = await import('../src/lib/tool-use/tool-executor.js');

// ════════════════════════════════════════════
// calculate — additional coverage
// ════════════════════════════════════════════
describe('calculate edge cases', () => {
    it('handles Math.Math. prefix (already prefixed expression)', () => {
        // Input already has Math. prefix → gets double-prefixed → then cleaned
        const r = calculate({ expression: 'Math.sqrt(16)' });
        expect(r.result).toBe(4);
    });

    it('handles deeply nested Math.Math.Math. prefix', () => {
        // Edge case: triple-prefixed
        const r = calculate({ expression: 'Math.Math.sqrt(25)' });
        expect(r.result).toBe(5);
    });
});

// ════════════════════════════════════════════
// webSearch — per-provider coverage
// ════════════════════════════════════════════
describe('webSearch provider coverage', () => {
    beforeEach(() => {
        h.nativeFetch.mockReset();
    });

    it('brave: builds correct URL and parses results', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'brave', url: '', key: 'brave-key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                web: { results: [
                    { title: 'Result 1', url: 'https://example.com', description: 'Desc 1' },
                    { title: 'Result 2', url: 'https://example2.com', description: 'Desc 2' }
                ]}
            })
        });
        const r = await webSearch({ query: 'test query', count: 2 });
        expect(r.results).toHaveLength(2);
        expect(r.results[0].title).toBe('Result 1');
        expect(h.nativeFetch).toHaveBeenCalledWith(
            expect.stringContaining('search.brave.com'),
            expect.any(Object)
        );
    });

    it('serpapi: builds correct URL and parses results', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'serpapi', url: '', key: 'serp-key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                organic_results: [
                    { title: 'Serp 1', link: 'https://s1.com', snippet: 'Snippet 1' }
                ]
            })
        });
        const r = await webSearch({ query: 'test' });
        expect(r.results).toHaveLength(1);
        expect(r.results[0].url).toBe('https://s1.com');
    });

    it('google_cse: builds correct URL with cx', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'google_cse', url: '', key: 'g-key', cx: 'my-cx-id'
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [
                    { title: 'Google 1', link: 'https://g1.com', snippet: 'Google snippet' }
                ]
            })
        });
        const r = await webSearch({ query: 'test' });
        expect(r.results).toHaveLength(1);
        expect(h.nativeFetch).toHaveBeenCalledWith(
            expect.stringContaining('cx=my-cx-id'),
            expect.any(Object)
        );
    });

    it('google_cse: returns error when cx missing', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'google_cse', url: '', key: 'g-key', cx: ''
        });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toContain('CX');
    });

    it('custom: builds URL with {query} placeholder', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'custom', url: 'https://my-api.com/search?q={query}', key: 'custom-key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ results: [{ title: 'Custom', url: 'https://c.com', snippet: 'C' }] })
        });
        const r = await webSearch({ query: 'hello world' });
        expect(r.results).toHaveLength(1);
        expect(h.nativeFetch).toHaveBeenCalledWith(
            expect.stringContaining('hello%20world'),
            expect.any(Object)
        );
    });

    it('custom: builds URL without {query} placeholder', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'custom', url: 'https://my-api.com/search', key: 'custom-key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ items: [{ title: 'T', link: 'https://l.com', snippet: 'S' }] })
        });
        const r = await webSearch({ query: 'test' });
        expect(r.results).toHaveLength(1);
    });

    it('handles search API HTTP error', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'brave', url: '', key: 'key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({ ok: false, status: 403 });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toContain('403');
    });

    it('handles search fetch exception', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'brave', url: '', key: 'key', cx: ''
        });
        h.nativeFetch.mockRejectedValue(new Error('DNS failure'));
        const r = await webSearch({ query: 'test' });
        expect(r.error).toContain('DNS failure');
    });

    it('returns no results message when empty', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'brave', url: '', key: 'key', cx: ''
        });
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ web: { results: [] } })
        });
        const r = await webSearch({ query: 'obscure query' });
        expect(r.message).toContain('No results');
        expect(r.results).toHaveLength(0);
    });

    it('returns error when no API key', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'brave', url: '', key: '', cx: ''
        });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toContain('API key');
    });

    it('returns error for empty query', async () => {
        const r = await webSearch({ query: '' });
        expect(r.error).toContain('empty');
    });

    it('returns error when URL not configured for custom provider', async () => {
        vi.mocked(getWebSearchConfig).mockResolvedValue({
            provider: 'unknown_provider', url: '', key: 'key', cx: ''
        });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toContain('URL');
    });
});

// ════════════════════════════════════════════
// fetchUrl — additional coverage
// ════════════════════════════════════════════
describe('fetchUrl edge cases', () => {
    beforeEach(() => {
        h.nativeFetch.mockReset();
    });

    it('handles fetch failure with HTTP error status', async () => {
        h.nativeFetch.mockResolvedValue({ ok: false, status: 404 });
        const r = await fetchUrl({ url: 'https://example.com/missing' });
        expect(r.error).toContain('404');
    });

    it('handles fetch exception', async () => {
        h.nativeFetch.mockRejectedValue(new Error('Connection reset'));
        const r = await fetchUrl({ url: 'https://example.com' });
        expect(r.error).toContain('Connection reset');
    });
});

// ════════════════════════════════════════════
// tool-loop — max-depth recovery path
// ════════════════════════════════════════════
describe('tool-loop max-depth and MAX_CALLS', () => {
    let runToolLoop;
    let getToolMaxDepth, _getToolTimeout;

    beforeEach(async () => {
        const configMod = await import('../src/lib/tool-use/tool-config.js');
        getToolMaxDepth = configMod.getToolMaxDepth;
        _getToolTimeout = configMod.getToolTimeout;
        const mod = await import('../src/lib/tool-use/tool-loop.js');
        runToolLoop = mod.runToolLoop;
    });

    it('triggers max-depth recovery when tool_calls persist beyond maxDepth', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(1); // Only 1 round allowed

        const toolCallResponse = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: 'call_1', function: { name: 'get_current_datetime', arguments: '{}' } }]
                }
            }]
        };

        let callCount = 0;
        const fetchFn = vi.fn().mockImplementation(async (_config) => {
            callCount++;
            if (callCount <= 2) {
                // Keep returning tool_calls (forcing depth overflow)
                return { success: true, content: '', _rawData: toolCallResponse };
            }
            // Final call (no tools) — return text
            return { success: true, content: 'Final answer after depth limit' };
        });

        const result = await runToolLoop({
            initialResult: { success: true, content: '', _rawData: toolCallResponse },
            messages: [{ role: 'user', content: 'time' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        // Should have triggered the max-depth recovery: adds error results + system message + final call
        expect(result.success).toBe(true);
        expect(result.content).toBe('Final answer after depth limit');
        // fetchFn should be called: once in loop + once for recovery = at least 2 beyond initial
        expect(fetchFn).toHaveBeenCalled();
    });

    it('handles multiple tool calls in single response', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(5);

        const multiToolResponse = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                        { id: 'c1', function: { name: 'get_current_datetime', arguments: '{}' } },
                        { id: 'c2', function: { name: 'calculate', arguments: '{"expression":"2+2"}' } },
                    ]
                }
            }]
        };

        const fetchFn = vi.fn().mockResolvedValue({
            success: true, content: 'Got both results', _rawData: { choices: [{ message: { role: 'assistant', content: 'Used both tools' } }] }
        });

        const result = await runToolLoop({
            initialResult: { success: true, content: '', _rawData: multiToolResponse },
            messages: [{ role: 'user', content: 'time and calc' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('Used both tools');
    });

    it('handles Anthropic format tool calls', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(5);

        const anthropicToolResponse = {
            content: [
                { type: 'text', text: 'Let me check...' },
                { type: 'tool_use', id: 'tu_1', name: 'get_current_datetime', input: {} }
            ],
            stop_reason: 'tool_use'
        };

        const fetchFn = vi.fn().mockResolvedValue({
            success: true, content: 'Time result',
            _rawData: { content: [{ type: 'text', text: 'The time is now 3pm' }], stop_reason: 'end_turn' }
        });

        const result = await runToolLoop({
            initialResult: { success: true, content: '', _rawData: anthropicToolResponse },
            messages: [{ role: 'user', content: 'time' }],
            config: { format: 'anthropic' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('The time is now 3pm');
    });

    it('handles Google/Gemini format tool calls', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(5);

        const geminiToolResponse = {
            candidates: [{
                content: {
                    parts: [
                        { functionCall: { name: 'calculate', args: { expression: '3*7' } } }
                    ]
                }
            }]
        };

        const fetchFn = vi.fn().mockResolvedValue({
            success: true, content: '21',
            _rawData: { candidates: [{ content: { parts: [{ text: '3 times 7 is 21' }] } }] }
        });

        const result = await runToolLoop({
            initialResult: { success: true, content: '', _rawData: geminiToolResponse },
            messages: [{ role: 'user', content: 'calc' }],
            config: { format: 'google' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('3 times 7 is 21');
    });

    it('handles tool execution error gracefully in loop', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(5);

        const result = await runToolLoop({
            initialResult: {
                success: true, content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant', content: null,
                            tool_calls: [{ id: 'c1', function: { name: 'nonexistent_tool', arguments: '{}' } }]
                        }
                    }]
                }
            },
            messages: [{ role: 'user', content: 'test' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn: vi.fn().mockResolvedValue({
                success: true, content: 'OK despite error',
                _rawData: { choices: [{ message: { role: 'assistant', content: 'Handled the error' } }] }
            }),
        });
        expect(result.success).toBe(true);
    });

    it('handles null fetchFn response', async () => {
        vi.mocked(getToolMaxDepth).mockResolvedValue(5);

        const result = await runToolLoop({
            initialResult: {
                success: true, content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant', content: null,
                            tool_calls: [{ id: 'c1', function: { name: 'get_current_datetime', arguments: '{}' } }]
                        }
                    }]
                }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn: vi.fn().mockResolvedValue(null),
        });
        expect(result.success).toBe(false);
    });
});
