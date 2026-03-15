/**
 * integration-router-uncovered.test.js — Integration tests targeting remaining
 * uncovered branches in router.js.
 *
 * Targets:
 *   L193-197 — slot !== 'chat' with heuristicConfirmed=false (unconfirmed guard)
 *   L243    — streaming enabled but bridge NOT capable → collectStream fallback
 *             (with ReadableStream content)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    safeGetArg: vi.fn(async (_key, _def = '') => _def),
    safeGetBoolArg: vi.fn(async (_key, _def = false) => _def),
    sanitizeMessages: vi.fn((x) => x || []),
    inferSlot: vi.fn(async () => ({ slot: 'chat', heuristicConfirmed: false })),
    fetchCustom: vi.fn(async () => ({ success: true, content: 'ok' })),
    storeReq: vi.fn(() => 'req-int-1'),
    updateReq: vi.fn(),
    takeTokenUsage: vi.fn(() => null),
    showToast: vi.fn(),
    collectStream: vi.fn(async (s) => {
        const reader = s.getReader();
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text;
    }),
    checkStreamCapability: vi.fn(async () => false),
    customFetchers: {},
    state: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    risu: { log: vi.fn() },
    argStore: {},
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    safeGetArg: (...args) => h.safeGetArg(...args),
    safeGetBoolArg: (...args) => h.safeGetBoolArg(...args),
    state: h.state,
    customFetchers: h.customFetchers,
}));
vi.mock('../src/lib/sanitize.js', () => ({ sanitizeMessages: (...a) => h.sanitizeMessages(...a) }));
vi.mock('../src/lib/slot-inference.js', () => ({ inferSlot: (...a) => h.inferSlot(...a) }));
vi.mock('../src/lib/fetch-custom.js', () => ({ fetchCustom: (...a) => h.fetchCustom(...a) }));
vi.mock('../src/lib/api-request-log.js', () => ({
    storeApiRequest: (...a) => h.storeReq(...a),
    updateApiRequest: (...a) => h.updateReq(...a),
    getAllApiRequests: vi.fn(() => []),
}));
vi.mock('../src/lib/token-usage.js', () => ({ _takeTokenUsage: (...a) => h.takeTokenUsage(...a) }));
vi.mock('../src/lib/token-toast.js', () => ({ showTokenUsageToast: (...a) => h.showToast(...a) }));
vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: (...a) => h.collectStream(...a),
    checkStreamCapability: (...a) => h.checkStreamCapability(...a),
}));

import { handleRequest } from '../src/lib/router.js';

function makeTextStream(parts) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const part of parts) controller.enqueue(encoder.encode(part));
            controller.close();
        },
    });
}

describe('router.js — uncovered branch integration tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(h.customFetchers).forEach(k => delete h.customFetchers[k]);
        Object.keys(h.argStore).forEach(k => delete h.argStore[k]);
        h.safeGetArg.mockImplementation(async (key, def = '') => h.argStore[key] ?? def);
        h.safeGetBoolArg.mockImplementation(async (key, def = false) => {
            const v = h.argStore[key];
            if (v === undefined) return def;
            return v === true || v === 'true';
        });
        h.inferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        h.checkStreamCapability.mockResolvedValue(false);
    });

    // ═══════════════════════════════════════════════════════════════════
    //  L193-197: slot !== 'chat' + heuristicConfirmed = false
    //  This is a defensive guard: inferSlot normally returns 'chat' when
    //  unconfirmed, but the code guards against it returning a non-chat
    //  slot with heuristicConfirmed=false.
    // ═══════════════════════════════════════════════════════════════════

    describe('L193-197: unconfirmed non-chat slot guard', () => {
        it('skips CPM overrides when slot is non-chat but not heuristically confirmed', async () => {
            // Mock inferSlot to return a non-chat slot with heuristicConfirmed=false
            h.inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: false });

            // Set translation slot params that would be applied if confirmed
            h.argStore.cpm_slot_translation_temp = '0.1';
            h.argStore.cpm_slot_translation_max_out = '500';

            const fetcher = vi.fn().mockResolvedValue({ success: true, content: 'translated' });
            h.customFetchers.TestTrans = fetcher;

            const args = { prompt_chat: [{ role: 'user', content: 'translate this' }] };
            const result = await handleRequest(args, { provider: 'TestTrans', name: 'TransModel' });

            expect(result.success).toBe(true);
            // CPM slot overrides should NOT be applied
            expect(args.temperature).toBeUndefined();
            expect(args.max_tokens).toBeUndefined();
        });

        it('applies CPM overrides when slot is non-chat AND heuristically confirmed', async () => {
            h.inferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: true });
            h.argStore.cpm_slot_translation_temp = '0.3';
            h.argStore.cpm_slot_translation_max_out = '200';

            const fetcher = vi.fn().mockResolvedValue({ success: true, content: 'ok' });
            h.customFetchers.Confirmed = fetcher;

            const args = { prompt_chat: [{ role: 'user', content: 'translate this' }] };
            await handleRequest(args, { provider: 'Confirmed', name: 'ConfModel' });

            // Overrides should be applied
            expect(args.temperature).toBe(0.3);
            expect(args.max_tokens).toBe(200);
        });

        it('handles emotion slot unconfirmed — no overrides applied', async () => {
            h.inferSlot.mockResolvedValue({ slot: 'emotion', heuristicConfirmed: false });
            h.argStore.cpm_slot_emotion_temp = '0.5';

            const fetcher = vi.fn().mockResolvedValue({ success: true, content: 'happy' });
            h.customFetchers.EmoProvider = fetcher;

            const args = { prompt_chat: [{ role: 'user', content: 'emotion check' }] };
            await handleRequest(args, { provider: 'EmoProvider', name: 'EmoModel' });

            expect(args.temperature).toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    //  L243: streaming enabled + ReadableStream content + bridge NOT capable
    //  → fallback to collectStream (string)
    // ═══════════════════════════════════════════════════════════════════

    describe('L243: streaming enabled but bridge incapable → collectStream fallback', () => {
        it('collects ReadableStream to string when bridge is not capable', async () => {
            h.argStore.cpm_streaming_enabled = 'true';
            h.checkStreamCapability.mockResolvedValue(false);

            h.customFetchers.StreamProv = vi.fn().mockResolvedValue({
                success: true,
                content: makeTextStream(['Hello', ' ', 'World']),
            });

            const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };
            const result = await handleRequest(args, { provider: 'StreamProv', name: 'StreamModel' });

            // Should have collected the stream to a string
            expect(typeof result.content).toBe('string');
            expect(result.content).toBe('Hello World');
            expect(h.collectStream).toHaveBeenCalled();
        });

        it('shows token toast after collecting stream when tokens available', async () => {
            h.argStore.cpm_streaming_enabled = 'true';
            h.argStore.cpm_show_token_usage = 'true';
            h.checkStreamCapability.mockResolvedValue(false);
            h.takeTokenUsage.mockReturnValue({ input: 10, output: 20, reasoning: 0, cached: 0, total: 30 });

            h.customFetchers.TokenProv = vi.fn().mockResolvedValue({
                success: true,
                content: makeTextStream(['Response']),
            });

            const args = { prompt_chat: [{ role: 'user', content: 'test' }] };
            await handleRequest(args, { provider: 'TokenProv', name: 'TokenModel' });

            expect(h.showToast).toHaveBeenCalled();
        });

        it('passes through ReadableStream when bridge IS capable', async () => {
            h.argStore.cpm_streaming_enabled = 'true';
            h.checkStreamCapability.mockResolvedValue(true);

            h.customFetchers.StreamCapable = vi.fn().mockResolvedValue({
                success: true,
                content: makeTextStream(['Pass', 'Through']),
            });

            const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };
            const result = await handleRequest(args, { provider: 'StreamCapable', name: 'CapableModel' });

            // Should return a ReadableStream (piped through TransformStream)
            expect(result.content).toBeInstanceOf(ReadableStream);
            // collectStream should NOT have been called
            expect(h.collectStream).not.toHaveBeenCalled();
        });

        it('collects stream when streaming is disabled (no bridge check needed)', async () => {
            // streaming_enabled = false (default)
            h.customFetchers.NoStream = vi.fn().mockResolvedValue({
                success: true,
                content: makeTextStream(['No', 'Stream']),
            });

            const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };
            const result = await handleRequest(args, { provider: 'NoStream', name: 'NoStreamModel' });

            expect(typeof result.content).toBe('string');
            expect(result.content).toBe('NoStream');
        });
    });
});
