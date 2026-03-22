/**
 * @file prefetch-search.test.js — Unit tests for Prefetch Web Search.
 * Covers: isPrefetchSearchEnabled, injectPrefetchSearch, helper edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const h = vi.hoisted(() => ({
    getArg: vi.fn(() => ''),
    nativeFetch: vi.fn(),
}));

vi.mock('../src/lib/tool-use/tool-config.js', () => ({
    getWebSearchConfig: vi.fn(() => ({
        provider: 'brave', url: '', key: 'test-key', cx: ''
    })),
}));

vi.stubGlobal('Risu', {
    getArgument: h.getArg,
    nativeFetch: h.nativeFetch,
});

const { getWebSearchConfig } = await import('../src/lib/tool-use/tool-config.js');

const { isPrefetchSearchEnabled, injectPrefetchSearch } = await import(
    '../src/lib/tool-use/prefetch-search.js'
);

beforeEach(() => {
    vi.clearAllMocks();
    h.getArg.mockImplementation(() => '');
    h.nativeFetch.mockReset();
});

// helper: set Risu.getArgument return values by key
function mockArgs(/** @type {Record<string, any>} */ map) {
    h.getArg.mockImplementation((/** @type {string} */ id) => map[id] ?? '');
}

function braveResponse(results = []) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ web: { results } }),
    };
}

// ── isPrefetchSearchEnabled ──
describe('isPrefetchSearchEnabled', () => {
    it('returns false by default', async () => {
        expect(await isPrefetchSearchEnabled()).toBe(false);
    });

    it('returns true when arg is "true"', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        expect(await isPrefetchSearchEnabled()).toBe(true);
    });

    it('returns true when arg is boolean true', async () => {
        mockArgs({ cpm_prefetch_search_enabled: true });
        expect(await isPrefetchSearchEnabled()).toBe(true);
    });

    it('returns false when arg is "false"', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'false' });
        expect(await isPrefetchSearchEnabled()).toBe(false);
    });

    it('returns false when arg is "0"', async () => {
        mockArgs({ cpm_prefetch_search_enabled: '0' });
        expect(await isPrefetchSearchEnabled()).toBe(false);
    });
});

// ── injectPrefetchSearch — disabled / no user query ──
describe('injectPrefetchSearch — disabled or empty', () => {
    it('returns unchanged messages when disabled', async () => {
        const msgs = [{ role: 'user', content: 'hello' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
        expect(result.messages).toBe(msgs);
    });

    it('returns unchanged when no user message exists', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        const msgs = [{ role: 'system', content: 'You are helpful.' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
    });

    it('skips when user query is too short (1 char)', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        const msgs = [{ role: 'user', content: 'a' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
    });

    it('skips when user query is empty string', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        const msgs = [{ role: 'user', content: '' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
    });
});

// ── injectPrefetchSearch — keyword trigger filter ──
describe('injectPrefetchSearch — keyword trigger', () => {
    it('skips search when keywords set but no match', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_keywords: 'weather,news',
        });
        const msgs = [{ role: 'user', content: 'tell me a joke please' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
    });

    it('proceeds when keyword matches user query', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_keywords: 'weather,news',
        });
        h.nativeFetch.mockResolvedValue(braveResponse([
            { title: 'Weather Today', url: 'https://example.com', description: 'Sunny' },
        ]));
        const msgs = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'what is the weather today?' },
        ];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        expect(result.query).toBe('what is the weather today?');
    });

    it('triggers for all queries when keywords is empty', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_keywords: '',
        });
        h.nativeFetch.mockResolvedValue(braveResponse([
            { title: 'Result', url: 'https://example.com', description: 'Desc' },
        ]));
        const msgs = [{ role: 'user', content: 'random query here' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
    });
});

// ── injectPrefetchSearch — search API error handling ──
describe('injectPrefetchSearch — API errors', () => {
    it('returns error when search API key is missing', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        /** @type {any} */ (getWebSearchConfig).mockResolvedValueOnce({
            provider: 'brave', url: '', key: '', cx: '',
        });
        const msgs = [{ role: 'user', content: 'search something' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
        expect(result.error).toMatch(/key not configured/i);
    });

    it('returns error on HTTP failure', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue({ ok: false, status: 500 });
        const msgs = [{ role: 'user', content: 'search something' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
        expect(result.error).toMatch(/HTTP 500/);
    });

    it('returns error on network exception', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockRejectedValue(new Error('Network timeout'));
        const msgs = [{ role: 'user', content: 'search something' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
        expect(result.error).toMatch(/Network timeout/);
    });

    it('returns searched:false when results are empty', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse([]));
        const msgs = [{ role: 'user', content: 'obscure query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
    });
});

// ── injectPrefetchSearch — successful injection ──
describe('injectPrefetchSearch — success', () => {
    const searchResults = [
        { title: 'Result 1', url: 'https://r1.com', description: 'First result' },
        { title: 'Result 2', url: 'https://r2.com', description: 'Second result' },
    ];

    it('appends search block after system prompt by default', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const msgs = [
            { role: 'system', content: 'Be helpful.' },
            { role: 'user', content: 'best coffee beans' },
        ];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        expect(result.messages[0].content).toMatch(/^Be helpful\.\n\n\[Web Search Results/);
        expect(result.messages[0].content).toContain('Result 1');
        expect(result.messages[0].content).toContain('Result 2');
        expect(result.messages[0].content).toContain('[End of Web Search Results]');
    });

    it('prepends search block when position is "before"', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_position: 'before',
        });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const msgs = [
            { role: 'system', content: 'Be helpful.' },
            { role: 'user', content: 'best coffee beans' },
        ];
        const result = await injectPrefetchSearch(msgs);
        expect(result.messages[0].content).toMatch(/^\[Web Search Results/);
        expect(result.messages[0].content).toContain('Be helpful.');
    });

    it('creates new system message when none exists', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const msgs = [{ role: 'user', content: 'test query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        expect(result.messages.length).toBe(2);
        expect(result.messages[0].role).toBe('system');
        expect(result.messages[0].content).toContain('[Web Search Results');
    });

    it('does not mutate original messages array', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const original = [
            { role: 'system', content: 'Original system.' },
            { role: 'user', content: 'test query' },
        ];
        const origContent = original[0].content;
        await injectPrefetchSearch(original);
        expect(original[0].content).toBe(origContent);
    });

    it('snippet-only mode excludes title and URL', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_snippet_only: 'true',
        });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const msgs = [
            { role: 'system', content: 'System.' },
            { role: 'user', content: 'test query' },
        ];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        // In snippet-only, URL line should not be present
        expect(result.messages[0].content).not.toContain('URL:');
    });

    it('respects maxResults setting', async () => {
        mockArgs({
            cpm_prefetch_search_enabled: 'true',
            cpm_prefetch_search_max_results: '1',
        });
        h.nativeFetch.mockResolvedValue(braveResponse(searchResults));
        const msgs = [{ role: 'user', content: 'test query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        // Only 1 result should appear (nativeFetch called with count=1)
        const call = h.nativeFetch.mock.calls[0];
        expect(call[0]).toContain('count=1');
    });
});

// ── injectPrefetchSearch — multipart user content ──
describe('injectPrefetchSearch — multipart content', () => {
    it('extracts text from array-style content', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse([
            { title: 'T', url: 'https://u.com', description: 'D' },
        ]));
        const msgs = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
                { type: 'text', text: 'what is this image about?' },
            ],
        }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        expect(result.query).toBe('what is this image about?');
    });
});

// ── Search provider URL construction ──
describe('injectPrefetchSearch — provider URL construction', () => {
    it('constructs Brave API URL correctly', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        h.nativeFetch.mockResolvedValue(braveResponse([
            { title: 'T', url: 'https://u.com', description: 'D' },
        ]));
        const msgs = [{ role: 'user', content: 'test query' }];
        await injectPrefetchSearch(msgs);
        const url = h.nativeFetch.mock.calls[0][0];
        expect(url).toContain('api.search.brave.com');
        expect(url).toContain('q=test%20query');
    });

    it('constructs SerpAPI URL correctly', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        /** @type {any} */ (getWebSearchConfig).mockResolvedValueOnce({
            provider: 'serpapi', url: '', key: 'serp-key', cx: '',
        });
        h.nativeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ organic_results: [
                { title: 'SR', link: 'https://s.com', snippet: 'SerpSnip' },
            ]}),
        });
        const msgs = [{ role: 'user', content: 'test query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        const url = h.nativeFetch.mock.calls[0][0];
        expect(url).toContain('serpapi.com');
        expect(url).toContain('api_key=serp-key');
    });

    it('constructs Google CSE URL correctly', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        /** @type {any} */ (getWebSearchConfig).mockResolvedValueOnce({
            provider: 'google_cse', url: '', key: 'gkey', cx: 'my-cx',
        });
        h.nativeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ items: [
                { title: 'GR', link: 'https://g.com', snippet: 'GoogleSnip' },
            ]}),
        });
        const msgs = [{ role: 'user', content: 'test query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        const url = h.nativeFetch.mock.calls[0][0];
        expect(url).toContain('googleapis.com');
        expect(url).toContain('cx=my-cx');
    });

    it('returns error when Google CSE has no CX', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        /** @type {any} */ (getWebSearchConfig).mockResolvedValueOnce({
            provider: 'google_cse', url: '', key: 'gkey', cx: '',
        });
        const msgs = [{ role: 'user', content: 'test query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(false);
        expect(result.error).toMatch(/CX/i);
    });

    it('handles custom provider with {query} template URL', async () => {
        mockArgs({ cpm_prefetch_search_enabled: 'true' });
        /** @type {any} */ (getWebSearchConfig).mockResolvedValueOnce({
            provider: 'custom', url: 'https://myapi.com/search/{query}', key: 'k', cx: '',
        });
        h.nativeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ results: [
                { title: 'CR', url: 'https://c.com', snippet: 'Custom' },
            ]}),
        });
        const msgs = [{ role: 'user', content: 'my query' }];
        const result = await injectPrefetchSearch(msgs);
        expect(result.searched).toBe(true);
        const url = h.nativeFetch.mock.calls[0][0];
        expect(url).toContain('myapi.com/search/my%20query');
    });
});
