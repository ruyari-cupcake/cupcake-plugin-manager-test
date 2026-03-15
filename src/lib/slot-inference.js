// @ts-check
/**
 * slot-inference.js — Infer which auxiliary slot a request is targeting.
 * Uses model assignment matching + prompt content heuristics for disambiguation.
 */
import { safeGetArg } from './shared-state.js';

export const CPM_SLOT_LIST = ['translation', 'emotion', 'memory', 'other'];

/**
 * Heuristic patterns for each slot type, used when the same model is assigned
 * to multiple slots and uniqueId alone can't disambiguate.
 */
export const SLOT_HEURISTICS = {
    translation: {
        patterns: [
            /translat(?:e|ion|ing)/i,
            /번역/,
            /翻[译訳]/,
            /source\s*(?:language|lang|text)/i,
            /target\s*(?:language|lang)/i,
            /\b(?:en|ko|ja|zh|de|fr|es|ru)\s*(?:→|->|to|에서|으로)\s*(?:en|ko|ja|zh|de|fr|es|ru)\b/i,
            /\[(?:SL|TL|Source|Target)\]/i,
            /output\s*(?:only\s*)?(?:the\s+)?translat/i,
        ],
        weight: 2
    },
    emotion: {
        patterns: [
            /emotion|감정|표정|expression|mood|sentiment/i,
            /\bemote\b/i,
            /facial\s*express/i,
            /character.*(?:emotion|feeling|mood)/i,
            /(?:detect|classify|analyze).*(?:emotion|sentiment)/i,
        ],
        weight: 2
    },
    memory: {
        patterns: [
            /summar(?:y|ize|izing|isation)/i,
            /요약/,
            /\bmemory\b/i,
            /메모리/,
            /\brecap\b/i,
            /condense.*(?:context|conversation|chat)|compress.*(?:context|conversation|chat)/i,
            /key\s*(?:points|events|details)/i,
            /\bhypa(?:memory|v[23])\b/i,
            /\bsupa(?:memory)?\b/i,
        ],
        weight: 2
    },
    other: {
        patterns: [
            /\blua\b/i,
            /\bscript/i,
            /\btrigger\b/i,
            /트리거/,
            /\bfunction\s*call/i,
            /\btool\s*(?:use|call)/i,
            /\bexecute\b/i,
            /\butility\b/i,
            /\bhelper\b/i,
        ],
        weight: 1
    }
};

/**
 * Score prompt content against slot heuristic patterns.
 * @param {string} promptText - Combined prompt text to analyze
 * @param {string} slotName - Slot name to score against
 * @returns {number} Score (higher = more confident match)
 */
export function scoreSlotHeuristic(promptText, slotName) {
    const heuristic = SLOT_HEURISTICS[/** @type {keyof typeof SLOT_HEURISTICS} */ (slotName)];
    if (!heuristic || !promptText) return 0;
    let score = 0;
    for (const pattern of heuristic.patterns) {
        if (pattern.test(promptText)) {
            score += heuristic.weight;
        }
    }
    return score;
}

/**
 * Infer the request slot from model definition and prompt content.
 *
 * SAFETY POLICY (v1.19.6): Even when a model matches exactly ONE aux slot,
 * we ALWAYS run heuristic confirmation. This protects against the common case
 * where the same model is assigned to both main chat (in Risu UI) and an aux
 * slot (in CPM settings). Without heuristic gating, every main-chat request
 * would incorrectly receive aux-slot parameter overrides (e.g., translation
 * temp=0.2 bleeding into main chat temp=1.0).
 *
 * Behavior:
 *   - 0 slot matches → 'chat' (no override)
 *   - 1 slot match  → heuristic must confirm (score > 0) → slot / 'chat'
 *   - 2+ slot match → heuristic must disambiguate clearly → slot / 'chat'
 *
 * When heuristics fail, Risu's native parameter values are used as-is.
 *
 * @param {Record<string, any>} activeModelDef - Model definition with uniqueId
 * @param {Record<string, any>} args - Request arguments (contains prompt_chat)
 * @returns {Promise<{slot: string, heuristicConfirmed: boolean}>}
 *          slot = 'chat' | 'translation' | 'emotion' | 'memory' | 'other'
 *          heuristicConfirmed = true when the slot was confirmed via content analysis
 */
export async function inferSlot(activeModelDef, args) {
    const matchingSlots = [];
    for (const slot of CPM_SLOT_LIST) {
        const configuredId = await safeGetArg(`cpm_slot_${slot}`, '');
        if (configuredId && configuredId === activeModelDef.uniqueId) {
            matchingSlots.push(slot);
        }
    }

    // No match → main chat, no overrides
    if (matchingSlots.length === 0) return { slot: 'chat', heuristicConfirmed: false };

    const isMultiCollision = matchingSlots.length > 1;
    if (isMultiCollision) {
        console.warn(`[Cupcake PM] ⚠️ inferSlot: Model '${activeModelDef.uniqueId}' is assigned to ${matchingSlots.length} slots: [${matchingSlots.join(', ')}]. Using prompt heuristics to disambiguate.`);
    } else {
        console.log(`[Cupcake PM] inferSlot: Model '${activeModelDef.uniqueId}' matches slot '${matchingSlots[0]}'. Running heuristic confirmation (same-model safety).`);
    }

    // Extract prompt text for heuristic analysis
    let promptText = '';
    if (args && args.prompt_chat && Array.isArray(args.prompt_chat)) {
        const msgs = args.prompt_chat;
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m) continue;
            const content = typeof m.content === 'string' ? m.content : '';
            if (m.role === 'system' || i < 3 || i >= msgs.length - 2) {
                promptText += content + '\n';
            }
        }
        promptText = promptText.substring(0, 3000);
    }

    if (!promptText.trim()) {
        // No prompt content → can't confirm slot. Use Risu values (safe default).
        console.warn(`[Cupcake PM] ⚠️ inferSlot: No prompt content for heuristic analysis. Falling back to 'chat' (Risu params will be used).`);
        return { slot: 'chat', heuristicConfirmed: false };
    }

    // Score each matching slot
    let bestSlot = null;
    let bestScore = 0;
    let secondBestScore = 0;
    for (const slot of matchingSlots) {
        const score = scoreSlotHeuristic(promptText, slot);
        if (score > bestScore) {
            secondBestScore = bestScore;
            bestScore = score;
            bestSlot = slot;
        } else if (score > secondBestScore) {
            secondBestScore = score;
        }
    }

    // For single match: require score > 0 (content confirms this is an aux request)
    // For multi match: require score > 0 AND beat second-best (clear winner)
    if (bestSlot && bestScore > 0) {
        if (!isMultiCollision || bestScore > secondBestScore) {
            console.log(`[Cupcake PM] inferSlot: Heuristic confirmed → '${bestSlot}' (score: ${bestScore}${isMultiCollision ? ` vs next: ${secondBestScore}` : ''}).`);
            return { slot: bestSlot, heuristicConfirmed: true };
        }
    }

    // Heuristic inconclusive → DON'T guess. Pass through Risu's native params.
    console.warn(`[Cupcake PM] ⚠️ inferSlot: Heuristic ${isMultiCollision ? 'inconclusive' : 'unconfirmed'} for '${matchingSlots.join(', ')}' (best score: ${bestScore}). Using Risu params (no CPM slot override).`);
    return { slot: 'chat', heuristicConfirmed: false };
}
