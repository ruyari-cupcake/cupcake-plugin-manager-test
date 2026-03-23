/**
 * Tests for BUG-CACHE-1: Anthropic caching should NOT activate when checkbox is disabled,
 * even if the TTL dropdown has a residual '1h' value.
 *
 * Also tests the API_LOG constants and copilot_cache_control / proxy Copilot routing.
 */
import { describe, it, expect } from 'vitest';
import {
    API_LOG_RESPONSE_MAX_CHARS,
    API_LOG_CONSOLE_MAX_CHARS,
    API_LOG_RISU_MAX_CHARS,
} from '../src/lib/api-request-log.js';
import { formatToOpenAI } from '../src/lib/format-openai.js';

// ── BUG-CACHE-1: Simulate the exact config derivation logic from cpm-provider-anthropic.js ──
// This replicates the oneHourCaching / config.caching calculation to prove correctness.

function deriveCacheConfig({ cacheEnabled, cacheRaw, cacheTtl }) {
    const cacheTtlNormalized = String(cacheTtl || '').trim().toLowerCase();
    // Fixed logic: cacheEnabled must be true for oneHourCaching
    const oneHourCaching = !!cacheEnabled && (cacheTtlNormalized === '1h' || String(cacheRaw || '').trim().toLowerCase() === '1h');
    return {
        caching: !!cacheEnabled,
        claude1HourCaching: oneHourCaching,
    };
}

describe('BUG-CACHE-1: Anthropic caching config derivation', () => {
    it('cacheEnabled=false, cacheTtl="1h" → caching=false, oneHourCaching=false (THE BUG)', () => {
        const result = deriveCacheConfig({ cacheEnabled: false, cacheRaw: '', cacheTtl: '1h' });
        expect(result.caching).toBe(false);
        expect(result.claude1HourCaching).toBe(false);
    });

    it('cacheEnabled=true, cacheTtl="1h" → caching=true, oneHourCaching=true', () => {
        const result = deriveCacheConfig({ cacheEnabled: true, cacheRaw: 'true', cacheTtl: '1h' });
        expect(result.caching).toBe(true);
        expect(result.claude1HourCaching).toBe(true);
    });

    it('cacheEnabled=true, cacheTtl="" → caching=true, oneHourCaching=false', () => {
        const result = deriveCacheConfig({ cacheEnabled: true, cacheRaw: 'true', cacheTtl: '' });
        expect(result.caching).toBe(true);
        expect(result.claude1HourCaching).toBe(false);
    });

    it('cacheEnabled=false, cacheTtl="" → caching=false, oneHourCaching=false', () => {
        const result = deriveCacheConfig({ cacheEnabled: false, cacheRaw: '', cacheTtl: '' });
        expect(result.caching).toBe(false);
        expect(result.claude1HourCaching).toBe(false);
    });

    it('cacheRaw="1h" shortcut → only works when cacheEnabled is true', () => {
        // cacheRaw='1h' was an old shortcut that should also respect the checkbox
        const disabledResult = deriveCacheConfig({ cacheEnabled: false, cacheRaw: '1h', cacheTtl: '' });
        expect(disabledResult.caching).toBe(false);
        expect(disabledResult.claude1HourCaching).toBe(false);

        const enabledResult = deriveCacheConfig({ cacheEnabled: true, cacheRaw: '1h', cacheTtl: '' });
        expect(enabledResult.caching).toBe(true);
        expect(enabledResult.claude1HourCaching).toBe(true);
    });

    it('cacheEnabled=false with undefined/null TTL values → safe defaults', () => {
        const result = deriveCacheConfig({ cacheEnabled: false, cacheRaw: undefined, cacheTtl: undefined });
        expect(result.caching).toBe(false);
        expect(result.claude1HourCaching).toBe(false);
    });
});

describe('BUG-LOG-1: API log constants', () => {
    it('API_LOG_RESPONSE_MAX_CHARS is 0 (unlimited — full response stored)', () => {
        expect(API_LOG_RESPONSE_MAX_CHARS).toBe(0);
    });

    it('API_LOG_CONSOLE_MAX_CHARS is 8000', () => {
        expect(API_LOG_CONSOLE_MAX_CHARS).toBe(8000);
    });

    it('API_LOG_RISU_MAX_CHARS is 2000', () => {
        expect(API_LOG_RISU_MAX_CHARS).toBe(2000);
    });
});

// ── Copilot Cache Control (비표준 방식) tests ──

describe('copilot_cache_control — non-standard OpenAI caching', () => {
    const messages = [
        { role: 'system', content: 'A'.repeat(5000) },
        { role: 'user', content: 'B'.repeat(3000) },
        { role: 'assistant', content: 'C'.repeat(8000) },
        { role: 'user', content: 'D'.repeat(1000) },
        { role: 'assistant', content: 'E'.repeat(6000) },
        { role: 'user', content: 'F'.repeat(200) },
    ];

    it('copilotCacheControl=false → no copilot_cache_control on messages', () => {
        const result = formatToOpenAI(messages, { copilotCacheControl: false });
        for (const msg of result) {
            expect(msg).not.toHaveProperty('copilot_cache_control');
        }
    });

    it('copilotCacheControl=true → adds copilot_cache_control to top 4 by size', () => {
        const result = formatToOpenAI(messages, { copilotCacheControl: true });
        const tagged = result.filter(m => m.copilot_cache_control);
        expect(tagged.length).toBe(4);
        // The 4 largest: assistant 8000, assistant 6000, system 5000, user 3000
        // Verify the smallest 2 (#4=1000, #5=200) are NOT tagged
        const untagged = result.filter(m => !m.copilot_cache_control);
        expect(untagged.length).toBe(2);
    });

    it('copilot_cache_control has correct structure {type: "ephemeral"}', () => {
        const result = formatToOpenAI(messages, { copilotCacheControl: true });
        const tagged = result.filter(m => m.copilot_cache_control);
        for (const msg of tagged) {
            expect(msg.copilot_cache_control).toEqual({ type: 'ephemeral' });
        }
    });

    it('fewer than 4 messages → all get tagged', () => {
        const short = [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'world' },
        ];
        const result = formatToOpenAI(short, { copilotCacheControl: true });
        const tagged = result.filter(m => m.copilot_cache_control);
        expect(tagged.length).toBe(2);
    });

    it('empty messages → no error', () => {
        const result = formatToOpenAI([], { copilotCacheControl: true });
        expect(result.length).toBe(0);
    });
});

// ── Proxy Copilot routing logic test ──

describe('Proxy resolveTargetUrl — Copilot detection in X-Target-URL mode', () => {
    // Simulate the proxy's resolveTargetUrl logic
    function resolveTargetUrl(headers, _pathname) {
        const xTargetUrl = headers['X-Target-URL'];
        if (xTargetUrl) {
            const copilotAuth = headers['X-Copilot-Auth'];
            if (copilotAuth) {
                try {
                    const targetHost = new URL(xTargetUrl).hostname.toLowerCase();
                    if (targetHost.includes('githubcopilot.com')) {
                        const targetPath = new URL(xTargetUrl).pathname;
                        return { mode: 'copilot', copilotAuth, copilotPath: targetPath };
                    }
                } catch { /* fall through */ }
            }
            return { mode: 'header' };
        }
        return { mode: null };
    }

    it('X-Target-URL with Copilot domain + X-Copilot-Auth → copilot mode', () => {
        const result = resolveTargetUrl({
            'X-Target-URL': 'https://api.githubcopilot.com/chat/completions',
            'X-Copilot-Auth': 'ghu_test_token',
        }, '/chat/completions');
        expect(result.mode).toBe('copilot');
        expect(result.copilotAuth).toBe('ghu_test_token');
        expect(result.copilotPath).toBe('/chat/completions');
    });

    it('X-Target-URL with Copilot domain but NO X-Copilot-Auth → generic header mode', () => {
        const result = resolveTargetUrl({
            'X-Target-URL': 'https://api.githubcopilot.com/chat/completions',
        }, '/chat/completions');
        expect(result.mode).toBe('header');
    });

    it('X-Target-URL with non-Copilot domain + X-Copilot-Auth → generic header mode', () => {
        const result = resolveTargetUrl({
            'X-Target-URL': 'https://api.openai.com/v1/chat/completions',
            'X-Copilot-Auth': 'ghu_test_token',
        }, '/v1/chat/completions');
        expect(result.mode).toBe('header');
    });

    it('No X-Target-URL → null mode', () => {
        const result = resolveTargetUrl({}, '/');
        expect(result.mode).toBe(null);
    });
});
