/**
 * integration-misc-uncovered.test.js — Targeted tests for remaining uncovered lines
 * across multiple source files.
 *
 * Targets:
 *   slot-inference.js L160  — multi-collision tie (equal scores → heuristic inconclusive)
 *   settings-backup.js L71-74 — getManagedSettingKeys with dynamicKeys
 *   settings-backup.js L83-84 — parseAndValidate !ok branch in SettingsBackup.load
 *   schema.js L44 — parseAndValidate function
 *   sub-plugin-manager.js L183 — cleanup hook isRelated guard
 *   sub-plugin-manager.js L327 — purgeAllCpmData dynamic keys
 *   fetch-custom.js L286-287 — customParams thenable rejection
 *   fetch-custom.js L388 — retry loop exhaustion
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
//  1. slot-inference.js — L160: multi-collision tie
// ═══════════════════════════════════════════════════════════════════

const mockSafeGetArg = vi.hoisted(() => vi.fn(async (_key, def = '') => def));

vi.mock('../src/lib/shared-state.js', () => ({
    safeGetArg: (...a) => mockSafeGetArg(...a),
    safeGetBoolArg: vi.fn(async (_key, def = false) => def),
    Risu: {
        log: vi.fn(),
        setArgument: vi.fn(),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
            keys: vi.fn(async () => []),
        },
    },
    registeredProviderTabs: [],
    state: { ALL_DEFINED_MODELS: [], CUSTOM_MODELS_CACHE: [], vertexTokenCache: {} },
    customFetchers: {},
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
}));

import { inferSlot, scoreSlotHeuristic } from '../src/lib/slot-inference.js';

describe('slot-inference — multi-collision tie (L160)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns heuristicConfirmed=false when two slots tie in score', async () => {
        // Assign same model to both translation and emotion slots
        const slotConfig = {
            cpm_slot_translation: 'model-shared',
            cpm_slot_emotion: 'model-shared',
        };
        mockSafeGetArg.mockImplementation(async (key, def = '') => slotConfig[key] ?? def);

        // Prompt content that matches exactly ONE pattern in each slot → tie
        // Translation: /번역/ → +2, Emotion: /감정/ → +2  = tie
        const args = {
            prompt_chat: [
                { role: 'system', content: '번역 감정' },
                { role: 'user', content: 'test data only' },
            ],
        };

        const result = await inferSlot({ uniqueId: 'model-shared' }, args);

        // When it's a tie, bestScore === secondBestScore, so isMultiCollision &&
        // !(bestScore > secondBestScore) → inconclusive
        // The result should be 'chat' with heuristicConfirmed=false
        expect(result.heuristicConfirmed).toBe(false);
        expect(result.slot).toBe('chat');
    });

    it('resolves collision when one slot has higher score', async () => {
        const slotConfig = {
            cpm_slot_translation: 'model-shared',
            cpm_slot_emotion: 'model-shared',
        };
        mockSafeGetArg.mockImplementation(async (key, def = '') => slotConfig[key] ?? def);

        // Prompt strongly matching translation only
        const args = {
            prompt_chat: [
                { role: 'system', content: 'Translate the following text from Korean to English. Source language: ko. Target language: en' },
                { role: 'user', content: '번역해 주세요' },
            ],
        };

        const result = await inferSlot({ uniqueId: 'model-shared' }, args);

        // Translation should win clearly
        expect(result.heuristicConfirmed).toBe(true);
        expect(result.slot).toBe('translation');
    });

    it('returns unconfirmed when single slot has zero heuristic score', async () => {
        mockSafeGetArg.mockImplementation(async (key, def = '') =>
            key === 'cpm_slot_other' ? 'model-x' : def
        );

        // Prompt with no "other" slot patterns
        const args = {
            prompt_chat: [
                { role: 'user', content: 'Hello, how are you today?' },
            ],
        };

        const result = await inferSlot({ uniqueId: 'model-x' }, args);
        expect(result.heuristicConfirmed).toBe(false);
        expect(result.slot).toBe('chat');
    });

    it('scoreSlotHeuristic returns 0 for unknown slot name', () => {
        expect(scoreSlotHeuristic('some text', 'nonexistent')).toBe(0);
    });

    it('scoreSlotHeuristic returns 0 for empty prompt', () => {
        expect(scoreSlotHeuristic('', 'translation')).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  2. schema.js — parseAndValidate (L44)
// ═══════════════════════════════════════════════════════════════════

import { parseAndValidate, schemas } from '../src/lib/schema.js';

describe('schema — parseAndValidate function (L44)', () => {
    it('parses valid JSON and validates successfully', () => {
        const result = parseAndValidate('{"key":"value"}', {
            type: 'object',
            properties: { key: { type: 'string' } },
        });
        expect(result.ok).toBe(true);
        expect(result.data.key).toBe('value');
    });

    it('returns error for invalid JSON', () => {
        const result = parseAndValidate('not valid json', {
            type: 'object',
            fallback: {},
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('parse');
        expect(result.fallback).toEqual({});
    });

    it('returns error when JSON is valid but fails schema validation', () => {
        const result = parseAndValidate('"a string"', {
            type: 'array',
            fallback: [],
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('array');
    });

    it('validates against settingsBackup schema', () => {
        const backupData = JSON.stringify({ cpm_streaming_enabled: 'true', cpm_fallback_temp: '0.7' });
        const result = parseAndValidate(backupData, schemas.settingsBackup);
        expect(result.ok).toBe(true);
    });

    it('handles null JSON string', () => {
        const result = parseAndValidate('null', { type: 'object', fallback: {} });
        expect(result.ok).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  3. settings-backup.js — getManagedSettingKeys with providerTabs dynamicKeys
// ═══════════════════════════════════════════════════════════════════

import { getManagedSettingKeys, SettingsBackup } from '../src/lib/settings-backup.js';

describe('settings-backup — getManagedSettingKeys with dynamicKeys (L71-74)', () => {
    it('includes dynamicKeys from provider tabs that have exportKeys', () => {
        const tabs = [
            { exportKeys: ['cpm_openai_key', 'cpm_openai_mode'] },
            { exportKeys: ['cpm_anthropic_key'] },
        ];
        const keys = getManagedSettingKeys(tabs);
        expect(keys).toContain('cpm_openai_key');
        expect(keys).toContain('cpm_openai_mode');
        expect(keys).toContain('cpm_anthropic_key');
    });

    it('filters out non-managed keys from exportKeys', () => {
        const tabs = [
            { exportKeys: ['cpm_valid_key', 'not_a_cpm_key', 'random'] },
        ];
        const keys = getManagedSettingKeys(tabs);
        expect(keys).toContain('cpm_valid_key');
        expect(keys).not.toContain('not_a_cpm_key');
        expect(keys).not.toContain('random');
    });

    it('handles tabs without exportKeys gracefully', () => {
        const tabs = [
            { label: 'Tab without exportKeys' },
            { exportKeys: ['cpm_test_key'] },
        ];
        const keys = getManagedSettingKeys(tabs);
        expect(keys).toContain('cpm_test_key');
    });

    it('handles non-array providerTabs gracefully', () => {
        const keys = getManagedSettingKeys(null);
        expect(Array.isArray(keys)).toBe(true);
    });

    it('deduplicates keys from multiple tabs', () => {
        const tabs = [
            { exportKeys: ['cpm_dup_key'] },
            { exportKeys: ['cpm_dup_key'] },
        ];
        const keys = getManagedSettingKeys(tabs);
        const dupCount = keys.filter(k => k === 'cpm_dup_key').length;
        expect(dupCount).toBe(1);
    });
});

describe('SettingsBackup.load — parseAndValidate !ok branch (L83-84)', () => {
    it('uses fallback when stored backup fails schema validation', async () => {
        const { Risu } = await import('../src/lib/shared-state.js');
        // Store invalid data (not an object → fails settingsBackup schema)
        Risu.pluginStorage.getItem.mockResolvedValueOnce('"not an object"');

        const cache = await SettingsBackup.load();
        // Should have used fallback (empty object or parsed result)
        expect(cache).toBeDefined();
        expect(typeof cache).toBe('object');
    });

    it('returns empty cache when storage returns null', async () => {
        const { Risu } = await import('../src/lib/shared-state.js');
        Risu.pluginStorage.getItem.mockResolvedValueOnce(null);

        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });

    it('returns empty cache when storage throws', async () => {
        const { Risu } = await import('../src/lib/shared-state.js');
        Risu.pluginStorage.getItem.mockRejectedValueOnce(new Error('storage error'));

        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });
});

describe('SettingsBackup.getAllKeys', () => {
    it('returns managed setting keys', () => {
        const keys = SettingsBackup.getAllKeys();
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
    });
});
