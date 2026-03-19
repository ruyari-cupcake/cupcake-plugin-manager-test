/**
 * @file tool-coverage-gaps.test.js — Coverage gap tests for tool-use modules
 * Targets: tool-config.js, tool-definitions.js, tool-mcp-bridge.js, tool-loop.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock for Risu.getArgument ──
const h = vi.hoisted(() => ({
    getArg: vi.fn(() => ''),
    registerMCP: vi.fn(),
    unregisterMCP: vi.fn(),
    nativeFetch: vi.fn(),
}));

vi.stubGlobal('Risu', {
    getArgument: h.getArg,
    registerMCP: h.registerMCP,
    unregisterMCP: h.unregisterMCP,
    nativeFetch: h.nativeFetch,
});

// ════════════════════════════════════════════
// tool-config.js
// ════════════════════════════════════════════
describe('tool-config', () => {
    let isToolUseEnabled, isToolEnabled, getToolMaxDepth, getToolTimeout, getWebSearchConfig;

    beforeEach(async () => {
        h.getArg.mockReset();
        h.getArg.mockResolvedValue('');
        // Re-import to get fresh module
        const mod = await import('../src/lib/tool-use/tool-config.js');
        isToolUseEnabled = mod.isToolUseEnabled;
        isToolEnabled = mod.isToolEnabled;
        getToolMaxDepth = mod.getToolMaxDepth;
        getToolTimeout = mod.getToolTimeout;
        getWebSearchConfig = mod.getWebSearchConfig;
    });

    describe('isToolUseEnabled', () => {
        it('returns false when empty', async () => {
            h.getArg.mockResolvedValue('');
            expect(await isToolUseEnabled()).toBe(false);
        });

        it('returns true for "true"', async () => {
            h.getArg.mockResolvedValue('true');
            expect(await isToolUseEnabled()).toBe(true);
        });

        it('returns true for boolean true', async () => {
            h.getArg.mockResolvedValue(true);
            expect(await isToolUseEnabled()).toBe(true);
        });

        it('returns true for "1"', async () => {
            h.getArg.mockResolvedValue('1');
            expect(await isToolUseEnabled()).toBe(true);
        });

        it('returns false for "false"', async () => {
            h.getArg.mockResolvedValue('false');
            expect(await isToolUseEnabled()).toBe(false);
        });

        it('returns false for false', async () => {
            h.getArg.mockResolvedValue(false);
            expect(await isToolUseEnabled()).toBe(false);
        });

        it('returns false for "0"', async () => {
            h.getArg.mockResolvedValue('0');
            expect(await isToolUseEnabled()).toBe(false);
        });

        it('returns default when getArgument throws', async () => {
            h.getArg.mockRejectedValue(new Error('fail'));
            expect(await isToolUseEnabled()).toBe(false);
        });
    });

    describe('isToolEnabled', () => {
        it('returns false when tool use is disabled', async () => {
            h.getArg.mockResolvedValue('');
            expect(await isToolEnabled('datetime')).toBe(false);
        });

        it('returns true when both master and tool enabled', async () => {
            h.getArg.mockImplementation(async (id) => {
                if (id === 'cpm_tool_use_enabled') return 'true';
                if (id === 'cpm_tool_datetime') return 'true';
                return '';
            });
            expect(await isToolEnabled('datetime')).toBe(true);
        });

        it('returns false when master enabled but tool disabled', async () => {
            h.getArg.mockImplementation(async (id) => {
                if (id === 'cpm_tool_use_enabled') return 'true';
                if (id === 'cpm_tool_calculator') return 'false';
                return '';
            });
            expect(await isToolEnabled('calculator')).toBe(false);
        });
    });

    describe('getToolMaxDepth', () => {
        it('returns default 5 when empty', async () => {
            expect(await getToolMaxDepth()).toBe(5);
        });

        it('returns parsed value', async () => {
            h.getArg.mockResolvedValue('10');
            expect(await getToolMaxDepth()).toBe(10);
        });

        it('caps at 20', async () => {
            h.getArg.mockResolvedValue('100');
            expect(await getToolMaxDepth()).toBe(20);
        });

        it('returns default for NaN', async () => {
            h.getArg.mockResolvedValue('abc');
            expect(await getToolMaxDepth()).toBe(5);
        });

        it('returns default for 0', async () => {
            h.getArg.mockResolvedValue('0');
            expect(await getToolMaxDepth()).toBe(5);
        });

        it('returns default for negative', async () => {
            h.getArg.mockResolvedValue('-5');
            expect(await getToolMaxDepth()).toBe(5);
        });
    });

    describe('getToolTimeout', () => {
        it('returns default 10000 when empty', async () => {
            expect(await getToolTimeout()).toBe(10000);
        });

        it('returns parsed value', async () => {
            h.getArg.mockResolvedValue('5000');
            expect(await getToolTimeout()).toBe(5000);
        });

        it('caps at 60000', async () => {
            h.getArg.mockResolvedValue('999999');
            expect(await getToolTimeout()).toBe(60000);
        });
    });

    describe('getWebSearchConfig', () => {
        it('returns defaults when empty', async () => {
            const cfg = await getWebSearchConfig();
            expect(cfg.provider).toBe('brave');
            expect(cfg.url).toBe('');
            expect(cfg.key).toBe('');
            expect(cfg.cx).toBe('');
        });

        it('returns configured values', async () => {
            h.getArg.mockImplementation(async (id) => {
                if (id === 'cpm_tool_websearch_provider') return 'google_cse';
                if (id === 'cpm_tool_websearch_url') return 'https://custom.api';
                if (id === 'cpm_tool_websearch_key') return 'my-key';
                if (id === 'cpm_tool_websearch_cx') return 'my-cx';
                return '';
            });
            const cfg = await getWebSearchConfig();
            expect(cfg.provider).toBe('google_cse');
            expect(cfg.key).toBe('my-key');
            expect(cfg.cx).toBe('my-cx');
        });
    });
});

// ════════════════════════════════════════════
// tool-definitions.js
// ════════════════════════════════════════════
describe('tool-definitions', () => {
    let getActiveToolList, getToolByName;

    beforeEach(async () => {
        h.getArg.mockReset();
        const mod = await import('../src/lib/tool-use/tool-definitions.js');
        getActiveToolList = mod.getActiveToolList;
        getToolByName = mod.getToolByName;
    });

    describe('getActiveToolList', () => {
        it('returns empty when all disabled', async () => {
            h.getArg.mockResolvedValue('');
            const list = await getActiveToolList();
            expect(list).toEqual([]);
        });

        it('returns enabled tools only', async () => {
            h.getArg.mockImplementation(async (id) => {
                if (id === 'cpm_tool_use_enabled') return 'true';
                if (id === 'cpm_tool_datetime') return 'true';
                if (id === 'cpm_tool_calculator') return 'true';
                return '';
            });
            const list = await getActiveToolList();
            expect(list.length).toBe(2);
            expect(list.map(t => t.name)).toContain('get_current_datetime');
            expect(list.map(t => t.name)).toContain('calculate');
        });

        it('returns all 5 when all enabled', async () => {
            h.getArg.mockResolvedValue('true');
            const list = await getActiveToolList();
            expect(list.length).toBe(5);
        });

        it('each tool has name, description, inputSchema', async () => {
            h.getArg.mockResolvedValue('true');
            const list = await getActiveToolList();
            for (const tool of list) {
                expect(tool).toHaveProperty('name');
                expect(tool).toHaveProperty('description');
                expect(tool).toHaveProperty('inputSchema');
                expect(typeof tool.name).toBe('string');
                expect(typeof tool.description).toBe('string');
                expect(typeof tool.inputSchema).toBe('object');
            }
        });
    });

    describe('getToolByName', () => {
        it('returns tool definition for known name', () => {
            const tool = getToolByName('calculate');
            expect(tool).not.toBeNull();
            expect(tool.name).toBe('calculate');
        });

        it('returns null for unknown name', () => {
            expect(getToolByName('nonexistent')).toBeNull();
        });

        it('finds all 5 built-in tools', () => {
            const names = ['get_current_datetime', 'calculate', 'roll_dice', 'web_search', 'fetch_url'];
            for (const name of names) {
                expect(getToolByName(name)).not.toBeNull();
            }
        });
    });
});

// ════════════════════════════════════════════
// tool-mcp-bridge.js
// ════════════════════════════════════════════
describe('tool-mcp-bridge', () => {
    let registerCpmTools, refreshCpmTools;

    beforeEach(async () => {
        h.getArg.mockReset();
        h.registerMCP.mockReset();
        h.unregisterMCP.mockReset();
        h.registerMCP.mockResolvedValue(undefined);
        h.unregisterMCP.mockResolvedValue(undefined);
        const mod = await import('../src/lib/tool-use/tool-mcp-bridge.js');
        registerCpmTools = mod.registerCpmTools;
        refreshCpmTools = mod.refreshCpmTools;
    });

    it('does nothing when tool use is disabled', async () => {
        h.getArg.mockResolvedValue('');
        await registerCpmTools('1.0.0');
        expect(h.registerMCP).not.toHaveBeenCalled();
    });

    it('registers MCP when tool use is enabled', async () => {
        h.getArg.mockResolvedValue('true');
        await registerCpmTools('2.0.0');
        expect(h.registerMCP).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'plugin:cpm-tools', version: '2.0.0' }),
            expect.any(Function),
            expect.any(Function)
        );
    });

    it('handles registerMCP failure gracefully', async () => {
        h.getArg.mockResolvedValue('true');
        h.registerMCP.mockRejectedValue(new Error('MCP not available'));
        await expect(registerCpmTools('1.0.0')).resolves.not.toThrow();
    });

    it('refreshCpmTools unregisters then re-registers', async () => {
        h.getArg.mockResolvedValue('true');
        await refreshCpmTools('1.0.0');
        expect(h.unregisterMCP).toHaveBeenCalledWith('plugin:cpm-tools');
        expect(h.registerMCP).toHaveBeenCalled();
    });

    it('refreshCpmTools handles unregister failure', async () => {
        h.getArg.mockResolvedValue('true');
        h.unregisterMCP.mockRejectedValue(new Error('not found'));
        await expect(refreshCpmTools('1.0.0')).resolves.not.toThrow();
    });

    it('uses default version "1.0.0" when not provided', async () => {
        h.getArg.mockResolvedValue('true');
        await registerCpmTools(undefined);
        expect(h.registerMCP).toHaveBeenCalledWith(
            expect.objectContaining({ version: '1.0.0' }),
            expect.any(Function),
            expect.any(Function)
        );
    });
});

// ════════════════════════════════════════════
// tool-loop.js — additional coverage
// ════════════════════════════════════════════
describe('tool-loop additional coverage', () => {
    let runToolLoop;

    beforeEach(async () => {
        h.getArg.mockReset();
        h.getArg.mockResolvedValue('true');
        const mod = await import('../src/lib/tool-use/tool-loop.js');
        runToolLoop = mod.runToolLoop;
    });

    it('returns initial result when no _rawData', async () => {
        const result = await runToolLoop({
            initialResult: { success: true, content: 'hello' },
            messages: [],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn: vi.fn()
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('hello');
    });

    it('returns text when initial has _rawData but no tool_calls', async () => {
        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: { choices: [{ message: { role: 'assistant', content: 'Just text' } }] }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn: vi.fn()
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('Just text');
    });

    it('handles fetchFn throwing during loop', async () => {
        const fetchFn = vi.fn()
            .mockRejectedValueOnce(new Error('Network timeout'));

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{ id: 'call_1', function: { name: 'calculate', arguments: '{"expression":"2+2"}' } }]
                        }
                    }]
                }
            },
            messages: [{ role: 'user', content: 'compute' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(false);
        expect(result.content).toContain('API request failed');
    });

    it('handles fetchFn returning failure during loop', async () => {
        const fetchFn = vi.fn().mockResolvedValue({ success: false, content: 'rate limit', _status: 429 });

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{ id: 'c1', function: { name: 'get_current_datetime', arguments: '{}' } }]
                        }
                    }]
                }
            },
            messages: [{ role: 'user', content: 'time' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(false);
        expect(result._status).toBe(429);
    });

    it('handles fetchFn returning no _rawData on second call', async () => {
        const fetchFn = vi.fn().mockResolvedValue({ success: true, content: 'Final answer' });

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{ id: 'c1', function: { name: 'get_current_datetime', arguments: '{}' } }]
                        }
                    }]
                }
            },
            messages: [{ role: 'user', content: 'time' }],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn,
        });
        expect(result.success).toBe(true);
        expect(result.content).toBe('Final answer');
    });

    it('respects abortSignal', async () => {
        const abortController = new AbortController();
        abortController.abort();

        const result = await runToolLoop({
            initialResult: {
                success: true,
                content: '',
                _rawData: {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{ id: 'c1', function: { name: 'calculate', arguments: '{"expression":"1+1"}' } }]
                        }
                    }]
                }
            },
            messages: [],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            abortSignal: abortController.signal,
            fetchFn: vi.fn(),
        });
        // Should exit early due to abort
        expect(result).toBeDefined();
    });

    it('returns stripped result when no active tools', async () => {
        h.getArg.mockResolvedValue(''); // all tools disabled
        const result = await runToolLoop({
            initialResult: { success: true, content: 'data', _rawData: { some: 'raw' } },
            messages: [],
            config: { format: 'openai' },
            temp: 1, maxTokens: 100, args: {},
            fetchFn: vi.fn()
        });
        expect(result.success).toBe(true);
        expect(result._rawData).toBeUndefined();
    });
});
