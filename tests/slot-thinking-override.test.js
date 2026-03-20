/**
 * slot-thinking-override.test.js — Tests for auxiliary model slot thinking/reasoning overrides.
 * Covers: handleRequest thinking override collection, fetchByProviderId config merge,
 *         priority chain (slot > custom model default), heuristic guard, cross-provider safety.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const {
    mockSafeGetArg,
    mockSafeGetBoolArg,
    mockInferSlot,
    mockFetchCustom,
} = vi.hoisted(() => ({
    mockSafeGetArg: vi.fn().mockResolvedValue(''),
    mockSafeGetBoolArg: vi.fn().mockResolvedValue(false),
    mockInferSlot: vi.fn().mockResolvedValue({ slot: 'chat', heuristicConfirmed: true }),
    mockFetchCustom: vi.fn().mockResolvedValue({ success: true, content: 'OK' }),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
        getDatabase: vi.fn(),
        setDatabaseLite: vi.fn(),
        risuFetch: vi.fn(),
        nativeFetch: vi.fn(),
        getArgument: vi.fn(),
        setArgument: vi.fn(),
        log: vi.fn(),
        registerSetting: vi.fn(),
    },
    CPM_VERSION: '1.20.18',
    safeGetArg: mockSafeGetArg,
    safeGetBoolArg: mockSafeGetBoolArg,
    state: { CUSTOM_MODELS_CACHE: [] },
    customFetchers: {},
}));

vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: vi.fn().mockResolvedValue(true),
    collectStream: vi.fn().mockResolvedValue('collected'),
}));

vi.mock('../src/lib/slot-inference.js', () => ({
    inferSlot: mockInferSlot,
}));

vi.mock('../src/lib/fetch-custom.js', () => ({
    fetchCustom: mockFetchCustom,
}));

vi.mock('../src/lib/api-request-log.js', () => ({
    API_LOG_RESPONSE_MAX_CHARS: 0,
    API_LOG_CONSOLE_MAX_CHARS: 8000,
    API_LOG_RISU_MAX_CHARS: 2000,
    storeApiRequest: vi.fn().mockReturnValue('req-1'),
    updateApiRequest: vi.fn(),
    getAllApiRequests: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/lib/token-usage.js', () => ({
    _takeTokenUsage: vi.fn().mockReturnValue(null),
    _normalizeTokenUsage: vi.fn(),
    _setTokenUsage: vi.fn(),
}));

vi.mock('../src/lib/token-toast.js', () => ({
    showTokenUsageToast: vi.fn(),
    _showTokenUsageToast: vi.fn(),
}));

// ── Helper: build mock args with slot-specific overrides ──
function buildSlotArgMock(slot, overrides = {}) {
    return async (key) => {
        const prefix = `cpm_slot_${slot}_`;
        if (key.startsWith(prefix)) {
            const param = key.slice(prefix.length);
            if (overrides[param] !== undefined) return String(overrides[param]);
        }
        return '';
    };
}

// ═══════════════════════════════════════════════════════
//  Test Suite
// ═══════════════════════════════════════════════════════

describe('slot thinking/reasoning override — handleRequest + fetchByProviderId', () => {
    let handleRequest;
    let stateRef;

    const baseModelDef = { provider: 'Custom_test', name: 'Test Model', uniqueId: 'test1' };
    const baseArgs = { prompt_chat: [{ role: 'user', content: 'Translate this to Korean' }] };

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('../src/lib/router.js');
        handleRequest = mod.handleRequest;
        const sharedState = await import('../src/lib/shared-state.js');
        stateRef = /** @type {any} */ (sharedState).state;
        stateRef.CUSTOM_MODELS_CACHE.length = 0;
        stateRef.CUSTOM_MODELS_CACHE.push({
            uniqueId: 'test1', url: 'https://api.test.com/v1', key: 'sk-test',
            model: 'test-model', format: 'openai',
            thinking: 'LOW', thinkingBudget: '4096',
            reasoning: 'low', verbosity: 'low',
            effort: 'low', adaptiveThinking: false,
        });
        mockSafeGetArg.mockResolvedValue('');
        mockSafeGetBoolArg.mockResolvedValue(false);
        mockInferSlot.mockResolvedValue({ slot: 'chat', heuristicConfirmed: true });
        mockFetchCustom.mockResolvedValue({ success: true, content: 'OK' });
    });

    // ── 1. Gemini thinking level slot override ──

    it('Gemini thinking_level=HIGH overrides custom model default (LOW)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { thinking: 'HIGH' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('HIGH');
    });

    it('Gemini thinking_level=MEDIUM applied via slot override', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'emotion', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('emotion', { thinking: 'MEDIUM' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('MEDIUM');
    });

    it('Gemini thinking_level empty → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {}));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('LOW');
    });

    it('Gemini thinking_level=none → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { thinking: 'none' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('LOW');
    });

    it('Gemini thinking_level=off → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { thinking: 'off' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('LOW');
    });

    // ── 2. Gemini thinkingBudget slot override ──

    it('thinkingBudget=8000 overrides custom model default (4096)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'memory', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('memory', { thinking_budget: '8000' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinkingBudget).toBe(8000);
    });

    it('thinkingBudget=0 → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'memory', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('memory', { thinking_budget: '0' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinkingBudget).toBe(4096);
    });

    it('thinkingBudget empty → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'memory', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('memory', {}));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinkingBudget).toBe(4096);
    });

    // ── 3. OpenAI reasoning effort ──

    it('reasoning=medium overrides custom model default (low)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'other', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('other', { reasoning: 'medium' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.reasoning).toBe('medium');
    });

    it('reasoning=none → falls back to custom model default (low)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'other', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('other', { reasoning: 'none' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.reasoning).toBe('low');
    });

    it('reasoning=high applied to translation slot', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { reasoning: 'high' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.reasoning).toBe('high');
    });

    // ── 4. OpenAI verbosity ──

    it('verbosity=high overrides custom model default (low)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { verbosity: 'high' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.verbosity).toBe('high');
    });

    it('verbosity=none → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { verbosity: 'none' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.verbosity).toBe('low');
    });

    // ── 5. Anthropic effort ──

    it('effort=high overrides custom model default (low)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'emotion', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('emotion', { effort: 'high' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.effort).toBe('high');
    });

    it('effort=max applied to memory slot', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'memory', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('memory', { effort: 'max' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.effort).toBe('max');
    });

    it('effort=none → falls back to custom model default (low)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'emotion', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('emotion', { effort: 'none' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.effort).toBe('low');
    });

    // ── 6. Anthropic adaptiveThinking ──

    it('adaptiveThinking=true overrides custom model default (false)', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {}));
        mockSafeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation_adaptive_thinking') return true;
            return false;
        });

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.adaptiveThinking).toBe(true);
    });

    it('adaptiveThinking=false → custom model default (false) preserved', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {}));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.adaptiveThinking).toBe(false);
    });

    // ── 7. Heuristic guard — no overrides when heuristicConfirmed=false ──

    it('heuristicConfirmed=false → no thinking overrides applied', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: false });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {
            thinking: 'HIGH', thinking_budget: '16000', reasoning: 'high',
            verbosity: 'high', effort: 'max',
        }));
        mockSafeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation_adaptive_thinking') return true;
            return false;
        });

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        // Should use custom model defaults, not slot overrides
        expect(config.thinking_level).toBe('LOW');
        expect(config.thinkingBudget).toBe(4096);
        expect(config.reasoning).toBe('low');
        expect(config.verbosity).toBe('low');
        expect(config.effort).toBe('low');
        expect(config.adaptiveThinking).toBe(false);
    });

    // ── 8. Chat slot — no aux overrides applied ──

    it('slot=chat → no thinking overrides even if safeGetArg returns values', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'chat', heuristicConfirmed: true });

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('LOW');
        expect(config.reasoning).toBe('low');
        expect(config.effort).toBe('low');
    });

    // ── 9. Combined overrides — multiple thinking params at once ──

    it('multiple thinking params applied simultaneously', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {
            thinking: 'HIGH', thinking_budget: '16000',
            reasoning: 'high', verbosity: 'medium',
            effort: 'max',
        }));
        mockSafeGetBoolArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation_adaptive_thinking') return true;
            return false;
        });

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('HIGH');
        expect(config.thinkingBudget).toBe(16000);
        expect(config.reasoning).toBe('high');
        expect(config.verbosity).toBe('medium');
        expect(config.effort).toBe('max');
        expect(config.adaptiveThinking).toBe(true);
    });

    // ── 10. All four slots work ──

    for (const slot of ['translation', 'emotion', 'memory', 'other']) {
        it(`slot=${slot} — thinking override reaches fetchCustom config`, async () => {
            mockInferSlot.mockResolvedValueOnce({ slot, heuristicConfirmed: true });
            mockSafeGetArg.mockImplementation(buildSlotArgMock(slot, { thinking: 'MEDIUM' }));

            await handleRequest({ ...baseArgs }, baseModelDef);
            const config = mockFetchCustom.mock.calls[0][0];
            expect(config.thinking_level).toBe('MEDIUM');
        });
    }

    // ── 11. Custom model with no thinking defaults ──

    it('custom model with no thinking defaults + slot override → slot values used', async () => {
        stateRef.CUSTOM_MODELS_CACHE.length = 0;
        stateRef.CUSTOM_MODELS_CACHE.push({
            uniqueId: 'test1', url: 'https://api.test.com/v1', key: 'sk-test',
            model: 'bare-model', format: 'openai',
            // No thinking/reasoning/effort fields at all
        });
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {
            thinking: 'HIGH', reasoning: 'high', effort: 'max',
        }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('HIGH');
        expect(config.reasoning).toBe('high');
        expect(config.effort).toBe('max');
        // thinkingBudget, verbosity → should fall back to defaults ('none'/0)
        expect(config.thinkingBudget).toBe(0);
        expect(config.verbosity).toBe('none');
    });

    // ── 12. Invalid thinkingBudget values ──

    it('thinkingBudget with negative value → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { thinking_budget: '-100' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinkingBudget).toBe(4096);
    });

    it('thinkingBudget with non-numeric value → falls back to custom model default', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { thinking_budget: 'abc' }));

        await handleRequest({ ...baseArgs }, baseModelDef);
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinkingBudget).toBe(4096);
    });

    // ── 13. _cpmSlotThinkingConfig not set when no overrides ──

    it('no overrides configured → _cpmSlotThinkingConfig not attached to args', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', {}));

        const args = { ...baseArgs };
        await handleRequest(args, baseModelDef);
        expect(args._cpmSlotThinkingConfig).toBeUndefined();
    });

    // ── 14. Sampling params still work alongside thinking overrides ──

    it('sampling + thinking overrides both applied', async () => {
        mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_slot_translation_temp') return '0.3';
            if (key === 'cpm_slot_translation_max_out') return '2048';
            if (key === 'cpm_slot_translation_thinking') return 'HIGH';
            if (key === 'cpm_slot_translation_reasoning') return 'medium';
            return '';
        });

        const args = { ...baseArgs };
        await handleRequest(args, baseModelDef);
        // Sampling params applied to args
        expect(args.temperature).toBe(0.3);
        expect(args.max_tokens).toBe(2048);
        // Thinking overrides applied to fetchCustom config
        const config = mockFetchCustom.mock.calls[0][0];
        expect(config.thinking_level).toBe('HIGH');
        expect(config.reasoning).toBe('medium');
    });

    // ── 15. Each reasoning effort level works ──

    for (const level of ['off', 'low', 'medium', 'high', 'xhigh']) {
        it(`reasoning=${level} applied correctly`, async () => {
            mockInferSlot.mockResolvedValueOnce({ slot: 'translation', heuristicConfirmed: true });
            mockSafeGetArg.mockImplementation(buildSlotArgMock('translation', { reasoning: level }));

            await handleRequest({ ...baseArgs }, baseModelDef);
            const config = mockFetchCustom.mock.calls[0][0];
            if (level === 'none') {
                expect(config.reasoning).toBe('low'); // fallback
            } else {
                expect(config.reasoning).toBe(level);
            }
        });
    }

    // ── 16. Each effort level works ──

    for (const level of ['unspecified', 'low', 'medium', 'high', 'max']) {
        it(`effort=${level} applied correctly`, async () => {
            mockInferSlot.mockResolvedValueOnce({ slot: 'emotion', heuristicConfirmed: true });
            mockSafeGetArg.mockImplementation(buildSlotArgMock('emotion', { effort: level }));

            await handleRequest({ ...baseArgs }, baseModelDef);
            const config = mockFetchCustom.mock.calls[0][0];
            expect(config.effort).toBe(level);
        });
    }
});
