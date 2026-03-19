/**
 * @file tool-executor.test.js — Tool executor unit tests
 * Covers: calculate safety, rollDice, getCurrentDatetime, fetchUrl SSRF, webSearch, executeToolCall
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
    getArg: vi.fn(() => ''),
    nativeFetch: vi.fn(),
}));

vi.mock('../src/lib/tool-use/tool-config.js', () => ({
    isToolUseEnabled: vi.fn(() => true),
    isToolEnabled: vi.fn(() => true),
    getWebSearchConfig: vi.fn(() => ({
        provider: 'brave', url: '', key: 'test-key', cx: ''
    })),
}));

// Mock Risu global
vi.stubGlobal('Risu', {
    getArgument: h.getArg,
    nativeFetch: h.nativeFetch,
});

const {
    getCurrentDatetime,
    calculate,
    rollDice,
    webSearch,
    fetchUrl,
    executeToolCall,
} = await import('../src/lib/tool-use/tool-executor.js');

// ── getCurrentDatetime ──
describe('getCurrentDatetime', () => {
    it('returns valid datetime object', () => {
        const r = getCurrentDatetime({});
        expect(r).toHaveProperty('iso');
        expect(r).toHaveProperty('formatted');
        expect(r).toHaveProperty('timezone');
        expect(r).toHaveProperty('unix');
        expect(typeof r.unix).toBe('number');
    });

    it('uses provided timezone and locale', () => {
        const r = getCurrentDatetime({ timezone: 'America/New_York', locale: 'en-US' });
        expect(r.timezone).toBe('America/New_York');
        expect(r.formatted).toBeTruthy();
    });

    it('handles no args', () => {
        const r = getCurrentDatetime(null);
        expect(r.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

// ── calculate ──
describe('calculate', () => {
    it('basic arithmetic', () => {
        expect(calculate({ expression: '2 + 3 * 4' })).toEqual({ result: 14, expression: '2 + 3 * 4' });
    });

    it('Math functions', () => {
        expect(calculate({ expression: 'sqrt(144)' })).toEqual({ result: 12, expression: 'sqrt(144)' });
    });

    it('Math.PI constant', () => {
        const r = calculate({ expression: 'PI * 2' });
        expect(r.result).toBeCloseTo(Math.PI * 2);
    });

    it('Math.pow', () => {
        expect(calculate({ expression: 'pow(2, 10)' })).toEqual({ result: 1024, expression: 'pow(2, 10)' });
    });

    it('rejects empty expression', () => {
        expect(calculate({})).toEqual({ error: 'expression is empty' });
    });

    it('rejects overlong expression (>500 chars)', () => {
        const long = '1+'.repeat(260) + '1';
        const r = calculate({ expression: long });
        expect(r).toHaveProperty('error');
        expect(r.error).toMatch(/too long/);
    });

    it('rejects code injection: function keyword', () => {
        const r = calculate({ expression: 'function(){return 1}()' });
        expect(r).toHaveProperty('error');
        expect(r.error).toMatch(/Disallowed/);
    });

    it('rejects code injection: alert', () => {
        const r = calculate({ expression: 'alert(1)' });
        expect(r).toHaveProperty('error');
        expect(r.error).toMatch(/Disallowed/);
    });

    it('rejects code injection: window/document', () => {
        expect(calculate({ expression: 'window.location' })).toHaveProperty('error');
        expect(calculate({ expression: 'document.cookie' })).toHaveProperty('error');
    });

    it('rejects code injection: constructor/prototype', () => {
        expect(calculate({ expression: 'constructor.constructor("return this")()' })).toHaveProperty('error');
    });

    it('handles Infinity result', () => {
        const r = calculate({ expression: '1/0' });
        expect(r.error).toMatch(/Infinity|NaN/);
    });

    it('handles NaN result', () => {
        const r = calculate({ expression: '0/0' });
        expect(r.error).toMatch(/Infinity|NaN/);
    });

    it('already prefixed Math.sin is not double-prefixed', () => {
        const r = calculate({ expression: 'Math.sin(0)' });
        expect(r.result).toBe(0);
    });
});

// ── rollDice ──
describe('rollDice', () => {
    it('basic 1d6', () => {
        const r = rollDice({ notation: '1d6' });
        expect(r.rolls).toHaveLength(1);
        expect(r.rolls[0]).toBeGreaterThanOrEqual(1);
        expect(r.rolls[0]).toBeLessThanOrEqual(6);
        expect(r.total).toBe(r.rolls[0]);
    });

    it('2d6+3 with modifier', () => {
        const r = rollDice({ notation: '2d6+3' });
        expect(r.rolls).toHaveLength(2);
        expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 3);
    });

    it('3d8-2 with negative modifier', () => {
        const r = rollDice({ notation: '3d8-2' });
        expect(r.rolls).toHaveLength(3);
        expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) - 2);
    });

    it('default 1d6 when no notation', () => {
        const r = rollDice({});
        expect(r.rolls).toHaveLength(1);
    });

    it('invalid notation', () => {
        expect(rollDice({ notation: 'abc' })).toHaveProperty('error');
    });

    it('0d6 → error (count < 1)', () => {
        expect(rollDice({ notation: '0d6' })).toHaveProperty('error');
    });

    it('caps at 100 dice', () => {
        const r = rollDice({ notation: '200d6' });
        expect(r.rolls).toHaveLength(100);
    });

    it('caps sides at 1000', () => {
        const r = rollDice({ notation: '1d9999' });
        expect(r.rolls[0]).toBeLessThanOrEqual(1000);
    });
});

// ── fetchUrl SSRF protection ──
describe('fetchUrl SSRF protection', () => {
    it('blocks localhost', async () => {
        const r = await fetchUrl({ url: 'http://localhost/secret' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks 127.0.0.1', async () => {
        const r = await fetchUrl({ url: 'http://127.0.0.1/admin' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks 10.x.x.x', async () => {
        const r = await fetchUrl({ url: 'http://10.0.0.1:8080/internal' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks 172.16-31.x.x', async () => {
        const r = await fetchUrl({ url: 'http://172.16.0.1/api' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks 192.168.x.x', async () => {
        const r = await fetchUrl({ url: 'http://192.168.1.1/setup' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks [::1]', async () => {
        const r = await fetchUrl({ url: 'http://[::1]:3000/api' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks ::ffff:127.0.0.1 (IPv6-mapped localhost)', async () => {
        const r = await fetchUrl({ url: 'http://::ffff:127.0.0.1/api' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks [::ffff:192.168.1.1] (IPv6-mapped private)', async () => {
        const r = await fetchUrl({ url: 'http://[::ffff:192.168.1.1]/api' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('blocks ::ffff:10.0.0.1 (IPv6-mapped 10.x)', async () => {
        const r = await fetchUrl({ url: 'http://::ffff:10.0.0.1/api' });
        expect(r.error).toMatch(/Private|localhost|blocked/i);
    });

    it('rejects non-HTTP protocols', async () => {
        const r = await fetchUrl({ url: 'ftp://example.com/file' });
        expect(r.error).toMatch(/HTTP/i);
    });

    it('rejects empty URL', async () => {
        const r = await fetchUrl({});
        expect(r.error).toMatch(/empty/i);
    });

    it('fetches valid URL and strips HTML', async () => {
        h.nativeFetch.mockResolvedValueOnce({
            ok: true,
            text: () => Promise.resolve('<html><body><script>evil()</script><p>Hello World</p></body></html>')
        });
        const r = await fetchUrl({ url: 'https://example.com' });
        expect(r.content).toContain('Hello World');
        expect(r.content).not.toContain('script');
        expect(r.content).not.toContain('evil');
    });

    it('truncates content at 8KB', async () => {
        h.nativeFetch.mockResolvedValueOnce({
            ok: true,
            text: () => Promise.resolve('x'.repeat(20000))
        });
        const r = await fetchUrl({ url: 'https://example.com/long' });
        expect(r.content.length).toBeLessThanOrEqual(8000);
    });
});

// ── webSearch ──
describe('webSearch', () => {
    it('returns error when key is missing', async () => {
        const { getWebSearchConfig } = await import('../src/lib/tool-use/tool-config.js');
        vi.mocked(getWebSearchConfig).mockResolvedValueOnce({ provider: 'brave', url: '', key: '', cx: '' });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toMatch(/key not configured/i);
    });

    it('returns error when query is empty', async () => {
        const r = await webSearch({ query: '' });
        expect(r.error).toMatch(/empty/i);
    });

    it('brave search success', async () => {
        h.nativeFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                web: { results: [{ title: 'Test Page', url: 'https://example.com', description: 'A test page' }] }
            })
        });
        const r = await webSearch({ query: 'test query', count: 5 });
        expect(r.results).toHaveLength(1);
        expect(r.results[0].title).toBe('Test Page');
    });

    it('handles API error', async () => {
        h.nativeFetch.mockResolvedValueOnce({ ok: false, status: 403 });
        const r = await webSearch({ query: 'test' });
        expect(r.error).toMatch(/HTTP 403/);
    });
});

// ── executeToolCall ──
describe('executeToolCall', () => {
    it('dispatches known tool and returns MCPToolCallContent', async () => {
        const r = await executeToolCall('get_current_datetime', {});
        expect(r).toBeInstanceOf(Array);
        expect(r[0].type).toBe('text');
        const parsed = JSON.parse(r[0].text);
        expect(parsed).toHaveProperty('iso');
    });

    it('returns error for unknown tool', async () => {
        const r = await executeToolCall('nonexistent_tool', {});
        expect(r[0].type).toBe('text');
        const parsed = JSON.parse(r[0].text);
        expect(parsed.error).toMatch(/Unknown tool/);
    });

    it('catches executor errors', async () => {
        const r = await executeToolCall('calculate', undefined);
        expect(r[0].type).toBe('text');
        const parsed = JSON.parse(r[0].text);
        // calculate({}) should return { error: 'expression is empty' }
        expect(parsed).toHaveProperty('error');
    });
});
