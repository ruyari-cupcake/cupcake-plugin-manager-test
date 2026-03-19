/**
 * universal-cors-proxy-worker 테스트
 * Worker의 라우팅 로직 (X-Target-URL, URL-in-URL, Copilot 호환)과
 * CPM rewrite 모드에서 X-Target-URL 헤더 전달 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Worker 모듈의 핸들러를 테스트하기 위한 최소 환경 구성 ──
// Cloudflare Workers의 fetch() 전역 함수를 시뮬레이션
const mockFetchResponse = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: new Map(Object.entries(headers)),
  body: JSON.stringify(body),
  text: async () => JSON.stringify(body),
  json: async () => body,
});

// ── Worker 모듈 직접 로드 대신 핵심 라우팅 로직만 단위 테스트 ──
describe('Universal CORS Proxy Worker — routing logic', () => {
  // resolveTargetUrl 로직 재현 (Worker 코드의 핵심)
  function resolveTargetUrl(headers, pathname) {
    const xTargetUrl = headers['x-target-url'];
    if (xTargetUrl) return { targetUrl: xTargetUrl, mode: 'header' };

    if (/^\/https?:\/\//i.test(pathname)) {
      return { targetUrl: pathname.slice(1), mode: 'url-in-url' };
    }

    const copilotAuth = headers['x-copilot-auth'];
    const COPILOT_PATHS = new Set([
      '/chat/completions', '/v1/chat/completions',
      '/v1/messages', '/responses', '/v1/responses',
    ]);
    if (copilotAuth && COPILOT_PATHS.has(pathname)) {
      return { targetUrl: null, mode: 'copilot', copilotAuth };
    }

    return { targetUrl: null, mode: null };
  }

  describe('X-Target-URL header mode', () => {
    it('uses X-Target-URL header when present', () => {
      const result = resolveTargetUrl(
        { 'x-target-url': 'https://api.nano-gpt.com/v1/chat/completions' },
        '/v1/chat/completions',
      );
      expect(result.mode).toBe('header');
      expect(result.targetUrl).toBe('https://api.nano-gpt.com/v1/chat/completions');
    });

    it('X-Target-URL takes priority over URL-in-URL path', () => {
      const result = resolveTargetUrl(
        { 'x-target-url': 'https://api.nano-gpt.com/v1/chat/completions' },
        '/https://other.api.com/v1/chat/completions',
      );
      expect(result.mode).toBe('header');
      expect(result.targetUrl).toBe('https://api.nano-gpt.com/v1/chat/completions');
    });

    it('supports any URL as target', () => {
      const result = resolveTargetUrl(
        { 'x-target-url': 'https://api.deepseek.com/chat/completions' },
        '/chat/completions',
      );
      expect(result.mode).toBe('header');
      expect(result.targetUrl).toBe('https://api.deepseek.com/chat/completions');
    });
  });

  describe('URL-in-URL mode', () => {
    it('parses /https://target/path format', () => {
      const result = resolveTargetUrl(
        {},
        '/https://api.nano-gpt.com/v1/chat/completions',
      );
      expect(result.mode).toBe('url-in-url');
      expect(result.targetUrl).toBe('https://api.nano-gpt.com/v1/chat/completions');
    });

    it('parses http:// (non-TLS) target', () => {
      const result = resolveTargetUrl(
        {},
        '/http://localhost:8080/v1/chat/completions',
      );
      expect(result.mode).toBe('url-in-url');
      expect(result.targetUrl).toBe('http://localhost:8080/v1/chat/completions');
    });
  });

  describe('Copilot compat mode', () => {
    it('activates on X-Copilot-Auth header + standard path', () => {
      const result = resolveTargetUrl(
        { 'x-copilot-auth': 'gho_testtoken123' },
        '/v1/chat/completions',
      );
      expect(result.mode).toBe('copilot');
      expect(result.copilotAuth).toBe('gho_testtoken123');
    });

    it('does not activate without standard copilot path', () => {
      const result = resolveTargetUrl(
        { 'x-copilot-auth': 'gho_testtoken123' },
        '/some/random/path',
      );
      expect(result.mode).toBeNull();
    });

    it('does not activate without X-Copilot-Auth header', () => {
      const result = resolveTargetUrl(
        {},
        '/v1/chat/completions',
      );
      expect(result.mode).toBeNull();
    });
  });

  describe('fallback — no target', () => {
    it('returns null mode for unknown request', () => {
      const result = resolveTargetUrl({}, '/unknown/path');
      expect(result.mode).toBeNull();
      expect(result.targetUrl).toBeNull();
    });
  });
});

// ── SSRF 방지 로직 테스트 ──
describe('Universal CORS Proxy Worker — SSRF prevention', () => {
  function isBlockedHost(hostname) {
    const h = hostname.toLowerCase();
    if (
      h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' ||
      h.endsWith('.local') ||
      /^10\.\d+\.\d+\.\d+$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h) ||
      /^192\.168\.\d+\.\d+$/.test(h)
    ) return true;
    return false;
  }

  it.each([
    'localhost', '127.0.0.1', '::1', '0.0.0.0',
    'myhost.local', '10.0.0.1', '172.16.0.1', '192.168.1.100',
  ])('blocks private address: %s', (hostname) => {
    expect(isBlockedHost(hostname)).toBe(true);
  });

  it.each([
    'api.nano-gpt.com', 'api.openai.com', 'api.anthropic.com',
    'integrate.api.nvidia.com', '8.8.8.8',
  ])('allows public address: %s', (hostname) => {
    expect(isBlockedHost(hostname)).toBe(false);
  });
});

// ── CPM Rewrite 모드에서 X-Target-URL 헤더 전달 검증 ──
const cpm = vi.hoisted(() => ({
  mockSmartFetch: vi.fn(),
  mockGetArg: vi.fn().mockResolvedValue(''),
  mockGetBoolArg: vi.fn().mockResolvedValue(false),
  state: {
    ALL_DEFINED_MODELS: [],
    CUSTOM_MODELS_CACHE: [],
    vertexTokenCache: { token: null, expiry: 0 },
    _currentExecutingPluginId: null,
  },
  customFetchers: {},
  risu: {
    log: vi.fn(),
    setArgument: vi.fn(),
    getArgument: vi.fn(async () => ''),
  },
}));

vi.mock('../src/lib/smart-fetch.js', () => ({
  smartNativeFetch: (...args) => cpm.mockSmartFetch(...args),
}));
vi.mock('../src/lib/copilot-token.js', () => ({
  ensureCopilotApiToken: vi.fn().mockResolvedValue(''),
}));
vi.mock('../src/lib/shared-state.js', () => ({
  Risu: cpm.risu,
  safeGetArg: (...args) => cpm.mockGetArg(...args),
  safeGetBoolArg: (...args) => cpm.mockGetBoolArg(...args),
  state: cpm.state,
  customFetchers: cpm.customFetchers,
  isDynamicFetchEnabled: vi.fn(async () => false),
}));
vi.mock('../src/lib/api-request-log.js', () => ({
  updateApiRequest: vi.fn(), storeApiRequest: vi.fn(() => 'req-1'),
  getAllApiRequests: vi.fn(() => []), getApiRequestById: vi.fn(),
  getLatestApiRequest: vi.fn(), clearApiRequests: vi.fn(),
}));
vi.mock('../src/lib/stream-utils.js', () => ({
  checkStreamCapability: vi.fn().mockResolvedValue(false),
  collectStream: vi.fn(async () => ''),
}));
vi.mock('../src/lib/slot-inference.js', () => ({
  inferSlot: vi.fn(async () => ({ slot: 'chat', heuristicConfirmed: false })),
}));
vi.mock('../src/lib/token-usage.js', () => ({
  _takeTokenUsage: vi.fn(() => null),
}));
vi.mock('../src/lib/token-toast.js', () => ({
  showTokenUsageToast: vi.fn(),
}));

import { fetchByProviderId } from '../src/lib/router.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

function makeOkJsonResponse(body, status = 200) {
  return {
    ok: true, status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const BASIC_ARGS = {
  prompt_chat: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' },
  ],
};

describe('CPM provider-manager — X-Target-URL in Rewrite mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cpm.mockGetArg.mockResolvedValue('');
    cpm.mockGetBoolArg.mockResolvedValue(false);
    cpm.state.CUSTOM_MODELS_CACHE = [];
    cpm.state.ALL_DEFINED_MODELS = [];
    for (const key of Object.keys(cpm.customFetchers)) delete cpm.customFetchers[key];
  });

  it('Rewrite mode: X-Target-URL header contains original target URL', async () => {
    cpm.state.CUSTOM_MODELS_CACHE = [{
      uniqueId: 'nanogpt-test',
      name: 'NanoGPT Test',
      model: 'gpt-4o',
      url: 'https://api.nano-gpt.com/v1/chat/completions',
      key: 'nano-test-key-123',
      proxyUrl: 'https://my-universal-proxy.workers.dev',
      format: 'openai',
      sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
      reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
      thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
      maxOutputLimit: 0, promptCacheRetention: 'none',
      decoupled: false, thought: false, streaming: false,
      customParams: '', effort: 'none', adaptiveThinking: false,
    }];

    cpm.mockSmartFetch.mockResolvedValueOnce(
      makeOkJsonResponse({ choices: [{ message: { content: 'nanogpt ok' } }] }),
    );

    await fetchByProviderId(
      { provider: 'Custom', name: 'NanoGPT Test', uniqueId: 'nanogpt-test' },
      BASIC_ARGS,
    );

    expect(cpm.mockSmartFetch).toHaveBeenCalled();

    // Rewrite mode: URL은 프록시 도메인으로 교체됨
    const fetchedUrl = cpm.mockSmartFetch.mock.calls[0][0];
    expect(fetchedUrl).toBe('https://my-universal-proxy.workers.dev/v1/chat/completions');

    // X-Target-URL 헤더가 원래 대상 URL을 포함하는지 확인
    const fetchOptions = cpm.mockSmartFetch.mock.calls[0][1];
    expect(fetchOptions.headers['X-Target-URL']).toBe(
      'https://api.nano-gpt.com/v1/chat/completions',
    );
  });

  it('Direct mode (proxyDirect=true): X-Target-URL header is the full target URL', async () => {
    cpm.state.CUSTOM_MODELS_CACHE = [{
      uniqueId: 'nanogpt-direct',
      name: 'NanoGPT Direct',
      model: 'gpt-4o',
      url: 'https://api.nano-gpt.com/v1/chat/completions',
      key: 'nano-test-key-456',
      proxyUrl: 'https://my-universal-proxy.workers.dev',
      proxyDirect: true,
      format: 'openai',
      sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
      reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
      thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
      maxOutputLimit: 0, promptCacheRetention: 'none',
      decoupled: false, thought: false, streaming: false,
      customParams: '', effort: 'none', adaptiveThinking: false,
    }];

    cpm.mockSmartFetch.mockResolvedValueOnce(
      makeOkJsonResponse({ choices: [{ message: { content: 'direct ok' } }] }),
    );

    await fetchByProviderId(
      { provider: 'Custom', name: 'NanoGPT Direct', uniqueId: 'nanogpt-direct' },
      BASIC_ARGS,
    );

    expect(cpm.mockSmartFetch).toHaveBeenCalled();

    // Direct mode: URL은 프록시 자체
    const fetchedUrl = cpm.mockSmartFetch.mock.calls[0][0];
    expect(fetchedUrl).toBe('https://my-universal-proxy.workers.dev');

    // X-Target-URL 헤더가 원래 대상 URL을 포함
    const fetchOptions = cpm.mockSmartFetch.mock.calls[0][1];
    expect(fetchOptions.headers['X-Target-URL']).toContain('nano-gpt.com');
  });

  it('No proxy: X-Target-URL header is NOT sent', async () => {
    cpm.state.CUSTOM_MODELS_CACHE = [{
      uniqueId: 'openai-noproxy',
      name: 'OpenAI Direct',
      model: 'gpt-4o',
      url: 'https://api.openai.com/v1/chat/completions',
      key: 'sk-test123',
      proxyUrl: '',
      format: 'openai',
      sysfirst: false, altrole: false, mustuser: false, maxout: false, mergesys: false,
      reasoning: 'none', verbosity: 'none', responsesMode: 'auto',
      thinking: 'none', tok: 'o200k_base', thinkingBudget: 0,
      maxOutputLimit: 0, promptCacheRetention: 'none',
      decoupled: false, thought: false, streaming: false,
      customParams: '', effort: 'none', adaptiveThinking: false,
    }];

    cpm.mockSmartFetch.mockResolvedValueOnce(
      makeOkJsonResponse({ choices: [{ message: { content: 'direct ok' } }] }),
    );

    await fetchByProviderId(
      { provider: 'Custom', name: 'OpenAI Direct', uniqueId: 'openai-noproxy' },
      BASIC_ARGS,
    );

    const fetchOptions = cpm.mockSmartFetch.mock.calls[0][1];
    expect(fetchOptions.headers['X-Target-URL']).toBeUndefined();
  });
});
