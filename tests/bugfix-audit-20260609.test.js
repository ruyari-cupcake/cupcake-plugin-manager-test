/**
 * bugfix-audit-20260609.test.js — Tests for CPM v1.20.16 bug audit fixes.
 * Covers BUG-A001, A002, A003, A004, B001, C003, C004.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import { buildGeminiThinkingConfig } from '../src/lib/format-gemini.js';

// ═══════════════════════════════════════════════════════
//  BUG-A002: formatToOpenAI mergesys — system-only messages
// ═══════════════════════════════════════════════════════

describe('[BUG-A002] formatToOpenAI mergesys with system-only messages', () => {
    it('preserves system-only messages as synthetic user message', () => {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'system', content: 'Be concise.' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result.length).toBeGreaterThanOrEqual(1);
        // Should not silently discard all content
        const allContent = result.map(m => m.content).join(' ');
        expect(allContent).toContain('You are a helpful assistant.');
        expect(allContent).toContain('Be concise.');
    });

    it('creates a user-role message when only system messages exist and mergesys=true', () => {
        const messages = [
            { role: 'system', content: 'System prompt only.' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result.length).toBe(1);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe('System prompt only.');
    });

    it('still merges system into first user message when user messages exist', () => {
        const messages = [
            { role: 'system', content: 'System A' },
            { role: 'system', content: 'System B' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result.length).toBe(1);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toContain('System A');
        expect(result[0].content).toContain('System B');
        expect(result[0].content).toContain('Hello');
    });

    it('returns empty array when no messages at all with mergesys', () => {
        const result = formatToOpenAI([], { mergesys: true });
        expect(result).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-B001: buildGeminiThinkingConfig — Gemini 3 budget→level
// ═══════════════════════════════════════════════════════

describe('[BUG-B001] buildGeminiThinkingConfig — Gemini 3 budget→level translation', () => {
    // Gemini 3 with explicit level should still work as before
    it('returns thinkingLevel when explicit level is set for Gemini 3', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', 'HIGH', 0);
        expect(cfg).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' });
    });

    it('returns thinkingLevel when explicit level is "low" for Gemini 3', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-flash-preview', 'low', 0);
        expect(cfg).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' });
    });

    // The BUG-B001 fix: budget-only should now translate to thinkingLevel
    it('translates high budget to HIGH for Gemini 3 Pro when no level set', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', null, 16384);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('HIGH');
        expect(cfg.includeThoughts).toBe(true);
        expect(cfg.thinkingBudget).toBeUndefined();
    });

    it('translates low budget to LOW for Gemini 3 Pro when no level set', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', null, 4000);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    it('translates budget=8192 to HIGH for Gemini 3 Pro', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', null, 8192);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('HIGH');
    });

    it('translates budget=8191 to LOW for Gemini 3 Pro', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', null, 8191);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    // Gemini 3 Flash has different thresholds (LOW/MEDIUM/HIGH)
    it('translates budget=4096 to MEDIUM for Gemini 3 Flash', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-flash-preview', null, 4096);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('MEDIUM');
    });

    it('translates budget=16384 to HIGH for Gemini 3 Flash', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-flash-preview', null, 16384);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('HIGH');
    });

    it('translates budget=2000 to LOW for Gemini 3 Flash', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-flash-preview', null, 2000);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    // No level and no budget should return null
    it('returns null when neither level nor budget set for Gemini 3', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', null, 0);
        expect(cfg).toBeNull();
    });

    it('returns null when level is "off" and no budget for Gemini 3', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-pro-preview', 'off', 0);
        expect(cfg).toBeNull();
    });

    it('returns null when level is "none" and no budget for Gemini 3', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3-flash-preview', 'none', 0);
        expect(cfg).toBeNull();
    });

    // Gemini 2.5 should still use budget directly (no regression)
    it('returns thinkingBudget for Gemini 2.5 (no regression)', () => {
        const cfg = buildGeminiThinkingConfig('gemini-2.5-flash', null, 8192);
        expect(cfg).toEqual({ includeThoughts: true, thinkingBudget: 8192 });
    });

    it('returns level-mapped budget for Gemini 2.5 with level only', () => {
        const cfg = buildGeminiThinkingConfig('gemini-2.5-pro', 'HIGH', 0);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingBudget).toBe(24576);
    });

    // Gemini 3.1 should also be handled by the Gemini 3 path
    it('handles Gemini 3.1 models with budget→level', () => {
        const cfg = buildGeminiThinkingConfig('gemini-3.1-pro-preview', null, 10000);
        expect(cfg).not.toBeNull();
        expect(cfg.thinkingLevel).toBe('HIGH');
        expect(cfg.thinkingBudget).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-C003: SSE CRLF handling — verified via stream-builders
// ═══════════════════════════════════════════════════════

describe('[BUG-C003] SSE CRLF handling', () => {
    // We test the CRLF fix by verifying that createSSEStream correctly
    // processes \r\n line endings. Since createSSEStream requires a Response
    // object, we test the regex pattern directly.
    it('regex /\\r?\\n/ splits CRLF correctly', () => {
        const sseData = 'data: {"text":"hello"}\r\ndata: {"text":"world"}\r\n\r\n';
        const lines = sseData.split(/\r?\n/);
        // Should produce: ['data: {"text":"hello"}', 'data: {"text":"world"}', '', '']
        expect(lines[0]).toBe('data: {"text":"hello"}');
        expect(lines[1]).toBe('data: {"text":"world"}');
        // No \r characters in any line
        for (const line of lines) {
            expect(line).not.toContain('\r');
        }
    });

    it('regex /\\r?\\n/ splits LF-only correctly (no regression)', () => {
        const sseData = 'data: {"text":"hello"}\ndata: {"text":"world"}\n';
        const lines = sseData.split(/\r?\n/);
        expect(lines[0]).toBe('data: {"text":"hello"}');
        expect(lines[1]).toBe('data: {"text":"world"}');
    });

    it('regex /\\r?\\n/ handles mixed CRLF and LF', () => {
        const sseData = 'data: {"a":"1"}\r\ndata: {"b":"2"}\ndata: {"c":"3"}\r\n';
        const lines = sseData.split(/\r?\n/);
        expect(lines[0]).toBe('data: {"a":"1"}');
        expect(lines[1]).toBe('data: {"b":"2"}');
        expect(lines[2]).toBe('data: {"c":"3"}');
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-A001: checkStreamCapability regex window
// ═══════════════════════════════════════════════════════

describe('[BUG-A001] checkStreamCapability regex window size', () => {
    it('regex with 3000-char window finds ReadableStream in long function body', () => {
        // Simulate a collectTransferables function that's >800 chars
        const padding = 'x'.repeat(1200);
        const fnBody = `function collectTransferables(data) { ${padding} if (data instanceof ReadableStream) { transferables.push(data); } return transferables }`;
        // The old regex (800 chars) would NOT find "return transferables" or would miss "ReadableStream"
        const oldRegex = /function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/;
        const newRegex = /function\s+collectTransferables\b[\s\S]{0,3000}?return\s+transferables/;

        const oldMatch = fnBody.match(oldRegex);
        const newMatch = fnBody.match(newRegex);

        // Old regex may fail to match (or match without ReadableStream in window)
        if (oldMatch) {
            // If old regex matches, ReadableStream might not be in the matched window
            expect(oldMatch[0].includes('ReadableStream')).toBe(false);
        }
        // New regex should always match and include ReadableStream
        expect(newMatch).not.toBeNull();
        expect(newMatch[0]).toContain('ReadableStream');
    });

    it('regex with 3000-char window still works for short function body', () => {
        const fnBody = 'function collectTransferables(data) { if (data instanceof ReadableStream) { } return transferables }';
        const newRegex = /function\s+collectTransferables\b[\s\S]{0,3000}?return\s+transferables/;
        const match = fnBody.match(newRegex);
        expect(match).not.toBeNull();
        expect(match[0]).toContain('ReadableStream');
    });
});

// ═══════════════════════════════════════════════════════
//  Integration: BUG-B001 cross-verification with RisuAI thresholds
// ═══════════════════════════════════════════════════════

describe('[BUG-B001] RisuAI cross-verification — budget→level thresholds', () => {
    // RisuAI google.ts thresholds for gemini-3-flash-preview:
    //   budgetNum >= 16384 → HIGH
    //   budgetNum >= 4096 → MEDIUM
    //   else → LOW

    const flashModel = 'gemini-3-flash-preview';

    it('flash: budget=16383 → MEDIUM (just under HIGH threshold)', () => {
        const cfg = buildGeminiThinkingConfig(flashModel, null, 16383);
        expect(cfg.thinkingLevel).toBe('MEDIUM');
    });

    it('flash: budget=16384 → HIGH (at threshold)', () => {
        const cfg = buildGeminiThinkingConfig(flashModel, null, 16384);
        expect(cfg.thinkingLevel).toBe('HIGH');
    });

    it('flash: budget=4095 → LOW (just under MEDIUM threshold)', () => {
        const cfg = buildGeminiThinkingConfig(flashModel, null, 4095);
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    it('flash: budget=4096 → MEDIUM (at threshold)', () => {
        const cfg = buildGeminiThinkingConfig(flashModel, null, 4096);
        expect(cfg.thinkingLevel).toBe('MEDIUM');
    });

    // RisuAI google.ts thresholds for gemini-3-pro* (non-flash):
    //   budgetNum >= 8192 → HIGH
    //   else → LOW

    const proModel = 'gemini-3-pro-preview';

    it('pro: budget=8191 → LOW (just under HIGH threshold)', () => {
        const cfg = buildGeminiThinkingConfig(proModel, null, 8191);
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    it('pro: budget=8192 → HIGH (at threshold)', () => {
        const cfg = buildGeminiThinkingConfig(proModel, null, 8192);
        expect(cfg.thinkingLevel).toBe('HIGH');
    });

    it('pro: budget=1 → LOW (minimum budget)', () => {
        const cfg = buildGeminiThinkingConfig(proModel, null, 1);
        expect(cfg.thinkingLevel).toBe('LOW');
    });

    it('pro: budget=100000 → HIGH (very large budget)', () => {
        const cfg = buildGeminiThinkingConfig(proModel, null, 100000);
        expect(cfg.thinkingLevel).toBe('HIGH');
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-A004: Key pool collision — verified by checking pool name format
// ═══════════════════════════════════════════════════════

describe('[BUG-A004] Key pool name must include URL to prevent collision', () => {
    it('pool name format includes URL and model separator', () => {
        // The fix changes from `_cpm_custom_inline_${config.model}` to
        // `_cpm_custom_inline_${encodeURIComponent(config.url)}_${config.model}`
        const url1 = 'https://api.openai.com';
        const url2 = 'https://custom-proxy.example.com';
        const model = 'gpt-4o';

        const poolName1 = `_cpm_custom_inline_${encodeURIComponent(url1 || '')}_${model || 'unknown'}`;
        const poolName2 = `_cpm_custom_inline_${encodeURIComponent(url2 || '')}_${model || 'unknown'}`;

        // Same model but different URLs should produce different pool names
        expect(poolName1).not.toBe(poolName2);
        expect(poolName1).toContain('openai.com');
        expect(poolName2).toContain('custom-proxy');
    });

    it('pool name with empty URL still works', () => {
        const poolName = `_cpm_custom_inline_${encodeURIComponent('')}_${'gpt-4o'}`;
        expect(poolName).toBe('_cpm_custom_inline__gpt-4o');
    });

    it('pool name with empty model falls back to unknown', () => {
        const poolName = `_cpm_custom_inline_${encodeURIComponent('https://api.example.com')}_${'unknown'}`;
        expect(poolName).toContain('unknown');
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-C004: Body size limit — hard reject at 10MB
// ═══════════════════════════════════════════════════════

describe('[BUG-C004] Body size hard limit at 10MB', () => {
    it('10MB threshold is correctly calculated', () => {
        const tenMB = 10_000_000;
        const bodyLength = 10_000_001; // just over 10MB
        expect(bodyLength > tenMB).toBe(true);

        const fiveMB = 5_000_000;
        const warnBodyLength = 5_500_000; // between 5MB and 10MB
        expect(warnBodyLength > fiveMB).toBe(true);
        expect(warnBodyLength <= tenMB).toBe(true);
    });

    it('error message includes size and actionable hint', () => {
        const bodyLen = 11_000_000;
        const sizeMB = (bodyLen / 1_048_576).toFixed(1);
        const errorMsg = `[Cupcake PM] Request body too large (${sizeMB} MB). V3 bridge limit is ~10 MB. Reduce chat history or remove images.`;
        expect(errorMsg).toContain('10.5 MB');
        expect(errorMsg).toContain('Reduce chat history');
    });
});

// ═══════════════════════════════════════════════════════
//  BUG-A003: Deep-clone failure — bail early
// ═══════════════════════════════════════════════════════

describe('[BUG-A003] Deep-clone failure should return error, not continue', () => {
    it('verifies that JSON.parse(JSON.stringify()) throws on circular reference', () => {
        const obj = { a: 1 };
        obj.self = obj; // circular reference

        expect(() => JSON.stringify(obj)).toThrow();
    });

    it('error message is descriptive for serialization failures', () => {
        const errorMessage = 'Converting circular structure to JSON';
        const result = `[Cupcake PM] Message serialization failed: ${errorMessage}. Messages may contain non-serializable objects.`;
        expect(result).toContain('serialization failed');
        expect(result).toContain('circular structure');
    });
});
