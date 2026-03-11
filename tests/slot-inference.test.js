import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSafeGetArg } = vi.hoisted(() => {
    const mockSafeGetArg = vi.fn().mockResolvedValue('');
    return { mockSafeGetArg };
});

vi.mock('../src/lib/shared-state.js', () => ({
    safeGetArg: mockSafeGetArg,
}));

import {
    scoreSlotHeuristic,
    inferSlot,
    SLOT_HEURISTICS,
    CPM_SLOT_LIST,
} from '../src/lib/slot-inference.js';

describe('CPM_SLOT_LIST', () => {
    it('contains expected slot types', () => {
        expect(CPM_SLOT_LIST).toEqual(['translation', 'emotion', 'memory', 'other']);
    });
});

describe('SLOT_HEURISTICS', () => {
    it('has entries for all slots', () => {
        for (const slot of CPM_SLOT_LIST) {
            expect(SLOT_HEURISTICS[slot]).toBeDefined();
            expect(SLOT_HEURISTICS[slot].patterns).toBeInstanceOf(Array);
            expect(typeof SLOT_HEURISTICS[slot].weight).toBe('number');
        }
    });
});

describe('scoreSlotHeuristic', () => {
    it('returns 0 for empty/null prompt', () => {
        expect(scoreSlotHeuristic('', 'translation')).toBe(0);
        expect(scoreSlotHeuristic(null, 'translation')).toBe(0);
    });

    it('returns 0 for unknown slot name', () => {
        expect(scoreSlotHeuristic('translate this', 'nonexistent')).toBe(0);
    });

    it('scores translation keywords', () => {
        expect(scoreSlotHeuristic('Please translate this text', 'translation')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('번역해주세요', 'translation')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('翻訳してください', 'translation')).toBeGreaterThan(0);
    });

    it('scores emotion keywords', () => {
        expect(scoreSlotHeuristic('Detect the emotion in this text', 'emotion')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('감정 분석', 'emotion')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('facial expression analysis', 'emotion')).toBeGreaterThan(0);
    });

    it('scores memory keywords', () => {
        expect(scoreSlotHeuristic('Summarize the conversation', 'memory')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('요약해주세요', 'memory')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('key points from the chat', 'memory')).toBeGreaterThan(0);
    });

    it('scores other/utility keywords', () => {
        expect(scoreSlotHeuristic('Execute this lua script', 'other')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('트리거 실행', 'other')).toBeGreaterThan(0);
        expect(scoreSlotHeuristic('function call tool use', 'other')).toBeGreaterThan(0);
    });

    it('returns 0 for non-matching text', () => {
        expect(scoreSlotHeuristic('The weather is nice today', 'translation')).toBe(0);
        expect(scoreSlotHeuristic('Hello world', 'emotion')).toBe(0);
    });

    it('accumulates score for multiple matching patterns', () => {
        const text = 'Please translate this text from source language to target language';
        const score = scoreSlotHeuristic(text, 'translation');
        // Should match multiple patterns: "translat", "source language", "target language"
        expect(score).toBeGreaterThan(2);
    });
});

describe('inferSlot', () => {
    const configureMock = (config = {}) => {
        mockSafeGetArg.mockImplementation(async (key, defaultValue = '') => {
            return config[key] || defaultValue;
        });
    };

    beforeEach(() => {
        mockSafeGetArg.mockReset();
        mockSafeGetArg.mockResolvedValue('');
    });

    it('returns chat when model matches no slots', async () => {
        configureMock({});
        const result = await inferSlot({ uniqueId: 'model_x' }, {});
        expect(result).toEqual({ slot: 'chat', heuristicConfirmed: false });
    });

    it('returns translation with heuristic confirmation when model matches only translation slot AND prompt confirms', async () => {
        configureMock({
            'cpm_slot_translation': 'gemini-flash',
        });
        const args = {
            prompt_chat: [
                { role: 'system', content: 'Translate the following text to Korean.' },
                { role: 'user', content: '번역해주세요' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'gemini-flash' }, args);
        expect(result).toEqual({ slot: 'translation', heuristicConfirmed: true });
    });

    it('falls back to chat when model matches only translation slot BUT prompt has no translation keywords (same-model safety)', async () => {
        configureMock({
            'cpm_slot_translation': 'gemini-flash',
        });
        // No translation keywords — likely a main chat request using the same model
        const args = {
            prompt_chat: [
                { role: 'system', content: 'You are a friendly character named Alice.' },
                { role: 'user', content: 'Hello, how are you today?' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'gemini-flash' }, args);
        expect(result).toEqual({ slot: 'chat', heuristicConfirmed: false });
    });

    it('returns emotion with heuristic confirmation when model matches only emotion slot AND prompt confirms', async () => {
        configureMock({
            'cpm_slot_emotion': 'gpt-4o-mini',
        });
        const args = {
            prompt_chat: [
                { role: 'system', content: 'Detect the emotion and facial expression of the character.' },
                { role: 'user', content: 'What is the character feeling?' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'gpt-4o-mini' }, args);
        expect(result).toEqual({ slot: 'emotion', heuristicConfirmed: true });
    });

    it('falls back to chat when single-slot match has no prompt content (safe default)', async () => {
        configureMock({
            'cpm_slot_emotion': 'gpt-4o-mini',
        });
        const result = await inferSlot({ uniqueId: 'gpt-4o-mini' }, {});
        expect(result).toEqual({ slot: 'chat', heuristicConfirmed: false });
    });

    it('uses heuristics when model matches multiple slots — translation wins', async () => {
        configureMock({
            'cpm_slot_translation': 'shared-model',
            'cpm_slot_emotion': 'shared-model',
        });
        const args = {
            prompt_chat: [
                { role: 'system', content: 'You are a translator. Translate the following text to Korean.' },
                { role: 'user', content: 'Hello world' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'shared-model' }, args);
        expect(result).toEqual({ slot: 'translation', heuristicConfirmed: true });
    });

    it('falls back to chat when multi-slot heuristics are inconclusive', async () => {
        configureMock({
            'cpm_slot_translation': 'shared-model',
            'cpm_slot_emotion': 'shared-model',
        });
        const args = {
            prompt_chat: [
                { role: 'system', content: 'General purpose instruction with no specific keywords' },
                { role: 'user', content: 'Hello' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'shared-model' }, args);
        expect(result).toEqual({ slot: 'chat', heuristicConfirmed: false });
    });

    it('falls back to chat when no prompt content for multi-slot disambiguation', async () => {
        configureMock({
            'cpm_slot_translation': 'shared-model',
            'cpm_slot_memory': 'shared-model',
        });
        const result = await inferSlot({ uniqueId: 'shared-model' }, {});
        expect(result).toEqual({ slot: 'chat', heuristicConfirmed: false });
    });

    it('returns memory when single-slot match AND prompt has memory keywords', async () => {
        configureMock({
            'cpm_slot_memory': 'summarizer-model',
        });
        const args = {
            prompt_chat: [
                { role: 'system', content: 'Summarize the following conversation. Extract key points.' },
                { role: 'user', content: 'The conversation was about...' },
            ]
        };
        const result = await inferSlot({ uniqueId: 'summarizer-model' }, args);
        expect(result).toEqual({ slot: 'memory', heuristicConfirmed: true });
    });
});
