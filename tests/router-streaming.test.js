import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockArgStore,
    mockState,
    mockCustomFetchers,
    mockStoreApiRequest,
    mockUpdateApiRequest,
    mockTakeTokenUsage,
    mockShowTokenUsageToast,
    mockCollectStream,
    mockCheckStreamCapability,
    mockInferSlot,
    mockSanitizeMessages,
    mockRisu,
} = vi.hoisted(() => ({
    mockArgStore: {},
    mockState: { ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: { token: null, expiry: 0 }, _currentExecutingPluginId: null },
    mockCustomFetchers: {},
    mockStoreApiRequest: vi.fn(() => 'req-stream-1'),
    mockUpdateApiRequest: vi.fn(),
    mockTakeTokenUsage: vi.fn(() => null),
    mockShowTokenUsageToast: vi.fn(),
    mockCollectStream: vi.fn(),
    mockCheckStreamCapability: vi.fn(),
    mockInferSlot: vi.fn(),
    mockSanitizeMessages: vi.fn((msgs) => msgs ?? []),
    mockRisu: { log: vi.fn() },
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: mockRisu,
    safeGetArg: vi.fn(async (key, def = '') => mockArgStore[key] ?? def),
    safeGetBoolArg: vi.fn(async (key, def = false) => {
        const v = mockArgStore[key];
        if (v === undefined) return def;
        return v === true || v === 'true';
    }),
    state: mockState,
    customFetchers: mockCustomFetchers,
}));
vi.mock('../src/lib/sanitize.js', () => ({ sanitizeMessages: (...a) => mockSanitizeMessages(...a) }));
vi.mock('../src/lib/slot-inference.js', () => ({ inferSlot: (...a) => mockInferSlot(...a) }));
vi.mock('../src/lib/fetch-custom.js', () => ({ fetchCustom: vi.fn() }));
vi.mock('../src/lib/api-request-log.js', () => ({
    API_LOG_RESPONSE_MAX_CHARS: 0,
    API_LOG_CONSOLE_MAX_CHARS: 8000,
    API_LOG_RISU_MAX_CHARS: 2000,
    storeApiRequest: (...a) => mockStoreApiRequest(...a),
    updateApiRequest: (...a) => mockUpdateApiRequest(...a),
    getAllApiRequests: vi.fn(() => []),
}));
vi.mock('../src/lib/token-usage.js', () => ({ _takeTokenUsage: (...a) => mockTakeTokenUsage(...a) }));
vi.mock('../src/lib/token-toast.js', () => ({ showTokenUsageToast: (...a) => mockShowTokenUsageToast(...a) }));
vi.mock('../src/lib/stream-utils.js', () => ({
    collectStream: (...a) => mockCollectStream(...a),
    checkStreamCapability: (...a) => mockCheckStreamCapability(...a),
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

async function readStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
}

describe('handleRequest streaming and normalization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(mockArgStore).forEach(k => delete mockArgStore[k]);
        Object.keys(mockCustomFetchers).forEach(k => delete mockCustomFetchers[k]);
        mockInferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: false });
        mockCollectStream.mockImplementation(async (stream) => readStream(stream));
        mockCheckStreamCapability.mockResolvedValue(false);
    });

    it('returns pass-through stream when streaming is enabled and bridge is capable', async () => {
        mockArgStore.cpm_streaming_enabled = 'true';
        mockArgStore.cpm_show_token_usage = 'true';
        mockCheckStreamCapability.mockResolvedValue(true);
        mockTakeTokenUsage.mockReturnValue({ input: 1, output: 2, reasoning: 0, cached: 0, total: 3 });
        mockCustomFetchers.Streamer = vi.fn().mockResolvedValue({ success: true, content: makeTextStream(['Hello ', 'World']) });

        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, { provider: 'Streamer', name: 'StreamModel' });

        expect(result.content).toBeInstanceOf(ReadableStream);
        await expect(readStream(result.content)).resolves.toBe('Hello World');
        expect(mockShowTokenUsageToast).toHaveBeenCalled();
    });

    it('collects stream to string when bridge is not capable', async () => {
        mockArgStore.cpm_streaming_enabled = 'true';
        mockCustomFetchers.Streamer = vi.fn().mockResolvedValue({ success: true, content: makeTextStream(['A', 'B']) });

        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, { provider: 'Streamer', name: 'StreamModel' });

        expect(result.content).toBe('AB');
        expect(mockCollectStream).toHaveBeenCalled();
    });

    it('shows token toast for non-stream responses when enabled', async () => {
        mockArgStore.cpm_show_token_usage = 'true';
        mockTakeTokenUsage.mockReturnValue({ input: 3, output: 4, reasoning: 1, cached: 0, total: 8 });
        mockCustomFetchers.Sync = vi.fn().mockResolvedValue({ success: true, content: 'ok' });

        await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, { provider: 'Sync', name: 'SyncModel' });

        expect(mockShowTokenUsageToast).toHaveBeenCalledWith('[Sync] SyncModel', expect.any(Object), expect.any(Number));
    });

    it('coerces invalid provider result types into a normalized error result', async () => {
        mockCustomFetchers.Bad = vi.fn().mockResolvedValue('broken');

        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, { provider: 'Bad', name: 'BadModel' });

        expect(result.success).toBe(false);
        expect(result.content).toContain('Invalid provider result type');
    });

    it('does not apply slot overrides when non-chat slot is not heuristically confirmed', async () => {
        mockInferSlot.mockResolvedValue({ slot: 'translation', heuristicConfirmed: false });
        mockArgStore.cpm_slot_translation_temp = '0.2';
        const fetcher = vi.fn().mockResolvedValue({ success: true, content: 'ok' });
        mockCustomFetchers.Trans = fetcher;
        const args = { prompt_chat: [{ role: 'user', content: 'hi' }] };

        await handleRequest(args, { provider: 'Trans', name: 'TransModel' });

        expect(args.temperature).toBeUndefined();
        expect(fetcher).toHaveBeenCalled();
    });

    it('normalizes provider crashes into error results and logs status', async () => {
        const crash = new Error('kaboom');
        mockCustomFetchers.Crash = vi.fn().mockRejectedValue(crash);

        const result = await handleRequest({ prompt_chat: [{ role: 'user', content: 'hi' }] }, { provider: 'Crash', name: 'CrashModel' });

        expect(result.success).toBe(false);
        expect(result.content).toContain('kaboom');
        expect(mockUpdateApiRequest).toHaveBeenCalledWith('req-stream-1', expect.objectContaining({ status: 'error' }));
    });
});
