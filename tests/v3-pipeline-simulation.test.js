/**
 * v3-pipeline-simulation.test.js
 *
 * 네이티브 RisuAI → reformater() → 플러그인 → 우리 포맷터
 * 이 테스트는 V3 플러그인 컨텍스트에서 reformater가 먼저 처리한 메시지가
 * 우리 포맷터를 거쳤을 때 네이티브와 동일한 결과를 내는지 검증합니다.
 *
 * 핵심: addProvider에서 LLMFlags를 등록하면, RisuAI의 reformater()가
 * messages를 먼저 가공한 후 플러그인에 전달합니다.
 *
 * LLMFlags:
 *   6 = hasFullSystemPrompt (OpenAI)
 *   7 = hasFirstSystemPrompt (Claude, Gemini)
 *   9 = requiresAlternateRole (Gemini)
 *   14 = DeveloperRole (GPT-5, o3/o4)
 */
import { describe, it, expect } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';
import { formatToGemini } from '../src/lib/format-gemini.js';

// ─── Simulated reformater() ─────────────────────────────────────────────
// Mirrors native Risuai-main/src/ts/process/request/request.ts reformater()
function simulateReformater(messages, flags) {
    let formated = messages.map(m => ({ ...m })); // shallow clone
    let systemPrompt = null;

    const hasFullSystem = flags.includes(6);
    const hasFirstSystem = flags.includes(7);
    const requiresAlternateRole = flags.includes(9);
    const mustStartWithUser = flags.includes(10); // mustStartWithUserInput

    if (!hasFullSystem) {
        if (hasFirstSystem) {
            while (formated.length > 0 && formated[0].role === 'system') {
                if (systemPrompt) {
                    systemPrompt.content += '\n\n' + formated[0].content;
                } else {
                    systemPrompt = { ...formated[0] };
                }
                formated = formated.slice(1);
            }
        }
        // Convert remaining system messages (native default: role='user', content='system: ...')
        for (let i = 0; i < formated.length; i++) {
            if (formated[i].role === 'system') {
                formated[i].content = `system: ${formated[i].content}`;
                formated[i].role = 'user'; // db.systemRoleReplacement default
            }
        }
    }

    if (requiresAlternateRole) {
        const newFormated = [];
        for (let i = 0; i < formated.length; i++) {
            const m = formated[i];
            if (newFormated.length === 0) { newFormated.push(m); continue; }
            if (newFormated[newFormated.length - 1].role === m.role) {
                newFormated[newFormated.length - 1].content += '\n' + m.content;
                continue;
            }
            newFormated.push(m);
        }
        formated = newFormated;
    }

    if (mustStartWithUser) {
        if (formated.length === 0 || formated[0].role !== 'user') {
            formated.unshift({ role: 'user', content: ' ' });
        }
    }

    if (systemPrompt) {
        formated.unshift(systemPrompt);
    }

    return formated;
}

// ─── Test Data ──────────────────────────────────────────────────────────
const TYPICAL_MESSAGES = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'system', content: 'Always be concise.' },
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'system', content: 'Context update: user is in Tokyo.' },
    { role: 'user', content: 'What time is it?' },
    { role: 'assistant', content: 'It is afternoon.' },
];

const SYSTEM_ONLY_MESSAGES = [
    { role: 'system', content: 'System prompt A' },
    { role: 'system', content: 'System prompt B' },
];

const NO_SYSTEM_MESSAGES = [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi!' },
];

const ASSISTANT_FIRST_MESSAGES = [
    { role: 'assistant', content: 'I start first.' },
    { role: 'user', content: 'OK, now me.' },
];

// ═════════════════════════════════════════════════════════════════════════
// OPENAI pipeline: flags = [0, 6, 8] + maybe [14]
// ═════════════════════════════════════════════════════════════════════════
describe('V3 Pipeline Simulation: OpenAI', () => {
    const OPENAI_FLAGS = [0, 6, 8]; // hasImageInput, hasFullSystemPrompt, hasStreaming
    const GPT5_FLAGS = [0, 6, 8, 14]; // + DeveloperRole

    it('hasFullSystemPrompt → system messages pass through untouched', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, OPENAI_FLAGS);
        const result = formatToOpenAI(afterReformater, {});

        // All system messages should remain as system
        const systems = result.filter(m => m.role === 'system');
        expect(systems.length).toBe(3);
        expect(result[0].role).toBe('system');
        expect(result[0].content).toBe('You are a helpful assistant.');
    });

    it('GPT-5 DeveloperRole → system messages become developer', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GPT5_FLAGS);
        const result = formatToOpenAI(afterReformater, { developerRole: true });

        const developers = result.filter(m => m.role === 'developer');
        const systems = result.filter(m => m.role === 'system');
        expect(developers.length).toBe(3);
        expect(systems.length).toBe(0);
        expect(developers[0].content).toBe('You are a helpful assistant.');
    });

    it('GPT-4.1 (no DeveloperRole) → system messages stay as system', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, OPENAI_FLAGS);
        const result = formatToOpenAI(afterReformater, { developerRole: false });

        const systems = result.filter(m => m.role === 'system');
        expect(systems.length).toBe(3);
    });

    it('no system messages → user/assistant pass through unchanged', () => {
        const afterReformater = simulateReformater(NO_SYSTEM_MESSAGES, OPENAI_FLAGS);
        const result = formatToOpenAI(afterReformater, {});

        expect(result.length).toBe(2);
        expect(result[0]).toEqual({ role: 'user', content: 'Hello!' });
        expect(result[1]).toEqual({ role: 'assistant', content: 'Hi!' });
        // No system messages should be present
        const systems = result.filter(m => m.role === 'system');
        expect(systems.length).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════
// ANTHROPIC pipeline: flags = [0, 7, 8]
// ═════════════════════════════════════════════════════════════════════════
describe('V3 Pipeline Simulation: Anthropic (Claude)', () => {
    const CLAUDE_FLAGS = [0, 7, 8]; // hasImageInput, hasFirstSystemPrompt, hasStreaming

    it('leading system → extracted as systemPrompt, non-leading → user with prefix', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, CLAUDE_FLAGS);
        const { messages: msgs, system } = formatToAnthropic(afterReformater, {});

        // System prompt should contain merged leading system messages
        expect(system).toContain('You are a helpful assistant.');
        expect(system).toContain('Always be concise.');

        // Non-leading system message ("Context update") should be a user message now
        // After reformater, it's already role='user', content='system: Context update...'
        // So it gets treated as a regular user message in formatToAnthropic
        const allContent = msgs.map(m =>
            typeof m.content === 'string' ? m.content :
            Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : ''
        ).join(' ');
        expect(allContent).toContain('system: Context update');
    });

    it('first message must be user → Start inserted when needed', () => {
        const afterReformater = simulateReformater(ASSISTANT_FIRST_MESSAGES, CLAUDE_FLAGS);
        // After reformater with hasFirstSystemPrompt (no system msgs, no mustStartWithUser)
        // messages remain: [assistant, user]
        const { messages: msgs } = formatToAnthropic(afterReformater, {});

        // formatToAnthropic ensures first message is user
        expect(msgs[0].role).toBe('user');
        const firstText = Array.isArray(msgs[0].content)
            ? msgs[0].content[0].text : msgs[0].content;
        expect(firstText).toBe('Start');
    });

    it('system-only messages → Start insertion', () => {
        const afterReformater = simulateReformater(SYSTEM_ONLY_MESSAGES, CLAUDE_FLAGS);
        // After reformater: system prompt extracted and re-prepended as one system msg
        const { messages: msgs, system } = formatToAnthropic(afterReformater, {});

        // System prompt should exist
        expect(system).toContain('System prompt A');
        expect(system).toContain('System prompt B');
        // Messages should have at least one user message (Start)
        expect(msgs.length).toBeGreaterThanOrEqual(1);
        expect(msgs[0].role).toBe('user');
    });

    it('no double-wrapping of system content from reformater', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, CLAUDE_FLAGS);
        const { messages: msgs } = formatToAnthropic(afterReformater, {});

        // Ensure non-leading system messages don't get double "system:" prefix
        const allContent = msgs.map(m =>
            typeof m.content === 'string' ? m.content :
            Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : ''
        ).join(' ');

        // Should contain "system: Context update" but NOT "system: system: Context update"
        expect(allContent).not.toContain('system: system:');
    });

    it('consecutive messages merge correctly', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, CLAUDE_FLAGS);
        const { messages: msgs } = formatToAnthropic(afterReformater, {});

        // All messages should alternate user/assistant
        for (let i = 1; i < msgs.length; i++) {
            // Consecutive same-role should not exist
            if (msgs[i - 1].role === msgs[i].role) {
                throw new Error(`Consecutive same-role at index ${i}: ${msgs[i - 1].role}`);
            }
        }
    });

    it('no system messages → system is empty, messages pass through', () => {
        const afterReformater = simulateReformater(NO_SYSTEM_MESSAGES, CLAUDE_FLAGS);
        const { messages: msgs, system } = formatToAnthropic(afterReformater, {});

        // No system prompt to extract
        expect(system).toBe('');
        // First message should already be user → no Start injection needed
        expect(msgs[0].role).toBe('user');
        // Should have user/assistant pair
        expect(msgs.length).toBe(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════
// GEMINI pipeline: flags = [0, 7, 8, 9]
// ═════════════════════════════════════════════════════════════════════════
describe('V3 Pipeline Simulation: Gemini', () => {
    const GEMINI_FLAGS = [0, 7, 8, 9]; // hasImageInput, hasFirstSystemPrompt, hasStreaming, requiresAlternateRole

    it('leading system → systemInstruction, non-leading → user parts', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GEMINI_FLAGS);
        const { contents, systemInstruction } = formatToGemini(afterReformater, { preserveSystem: true });

        // System instruction should contain merged leading system
        expect(systemInstruction.length).toBeGreaterThan(0);
        const sysText = systemInstruction.join(' ');
        expect(sysText).toContain('You are a helpful assistant.');
        expect(sysText).toContain('Always be concise.');

        // Contents should have proper user/model roles
        for (const c of contents) {
            expect(['user', 'model']).toContain(c.role);
        }
    });

    it('role mapping: assistant → model', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GEMINI_FLAGS);
        const { contents } = formatToGemini(afterReformater, { preserveSystem: true });

        // Native messages had 'assistant' → should become 'model' in Gemini format
        const hasModel = contents.some(c => c.role === 'model');
        expect(hasModel).toBe(true);
        const hasAssistant = contents.some(c => c.role === 'assistant');
        expect(hasAssistant).toBe(false);
    });

    it('consecutive same-role messages are merged (double-merge is idempotent)', () => {
        // reformater already merged same-role, formatToGemini should not break anything
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GEMINI_FLAGS);
        const { contents } = formatToGemini(afterReformater, { preserveSystem: true });

        // Verify no consecutive same-role
        for (let i = 1; i < contents.length; i++) {
            expect(contents[i].role).not.toBe(contents[i - 1].role);
        }
    });

    it('non-leading system messages appear as user text with prefix', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GEMINI_FLAGS);
        const { contents } = formatToGemini(afterReformater, { preserveSystem: true });

        // "Context update" was converted to 'user' by reformater with "system: " prefix
        // formatToGemini should have it somewhere in a user message
        const allUserText = contents
            .filter(c => c.role === 'user')
            .flatMap(c => c.parts.map(p => p.text || ''))
            .join(' ');
        expect(allUserText).toContain('system: Context update');
    });

    it('preserveSystem=false → system merged into first user message', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, GEMINI_FLAGS);
        const { contents, systemInstruction } = formatToGemini(afterReformater, { preserveSystem: false });

        // System instruction should be empty
        expect(systemInstruction.length).toBe(0);

        // First user message should contain system content
        const firstUserParts = contents[0]?.parts?.map(p => p.text || '').join(' ') || '';
        expect(firstUserParts).toContain('system:');
    });

    it('no mustStartWithUserInput for Gemini (native does not have this flag)', () => {
        // Gemini models don't have mustStartWithUserInput in native
        // So reformater doesn't prepend user ' '
        const afterReformater = simulateReformater(ASSISTANT_FIRST_MESSAGES, GEMINI_FLAGS);
        // After reformater with requiresAlternateRole: assistant first is fine

        const { contents } = formatToGemini(afterReformater, { preserveSystem: true });
        // First content should be model (from assistant), no forced user Start
        // (formatToGemini doesn't force user-first either, matching native Gemini)
        expect(contents.length).toBeGreaterThan(0);
    });

    it('no system messages → systemInstruction empty, user/model only', () => {
        const afterReformater = simulateReformater(NO_SYSTEM_MESSAGES, GEMINI_FLAGS);
        const { contents, systemInstruction } = formatToGemini(afterReformater, { preserveSystem: true });

        // No system messages → systemInstruction should be empty
        expect(systemInstruction.length).toBe(0);
        // Contents should only have user/model roles
        expect(contents.length).toBeGreaterThan(0);
        for (const c of contents) {
            expect(['user', 'model']).toContain(c.role);
        }
        // assistant → model mapping
        const hasModel = contents.some(c => c.role === 'model');
        expect(hasModel).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════
// CUSTOM MODEL pipeline: flags = [0, 6, 8] (always hasFullSystemPrompt)
// ═════════════════════════════════════════════════════════════════════════
describe('V3 Pipeline Simulation: Custom Models', () => {
    const CUSTOM_FLAGS = [0, 6, 8]; // hasImageInput, hasFullSystemPrompt, hasStreaming

    it('Custom + Anthropic format: system extraction works without reformater interference', () => {
        // Custom models get hasFullSystemPrompt → reformater does NOT touch system messages
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, CUSTOM_FLAGS);
        const { messages: msgs, system } = formatToAnthropic(afterReformater, {});

        // formatToAnthropic handles system extraction itself
        expect(system).toBe('You are a helpful assistant.\n\nAlways be concise.');
        // Non-leading system message should be prefixed
        const allContent = msgs.map(m =>
            typeof m.content === 'string' ? m.content :
            Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : ''
        ).join(' ');
        expect(allContent).toContain('system: Context update');
    });

    it('Custom + Google format: system extraction works without reformater interference', () => {
        const afterReformater = simulateReformater(TYPICAL_MESSAGES, CUSTOM_FLAGS);
        const { systemInstruction } = formatToGemini(afterReformater, { preserveSystem: true });

        expect(systemInstruction.join(' ')).toContain('You are a helpful assistant.');
        expect(systemInstruction.join(' ')).toContain('Always be concise.');
    });

    it('Custom + no system messages → Anthropic format passes cleanly', () => {
        const afterReformater = simulateReformater(NO_SYSTEM_MESSAGES, CUSTOM_FLAGS);
        const { messages: msgs, system } = formatToAnthropic(afterReformater, {});

        expect(system).toBe('');
        expect(msgs[0].role).toBe('user');
        expect(msgs.length).toBe(2);
    });

    it('Custom + no system messages → Gemini format passes cleanly', () => {
        const afterReformater = simulateReformater(NO_SYSTEM_MESSAGES, CUSTOM_FLAGS);
        const { contents, systemInstruction } = formatToGemini(afterReformater, { preserveSystem: true });

        expect(systemInstruction.length).toBe(0);
        expect(contents.length).toBeGreaterThan(0);
        const hasModel = contents.some(c => c.role === 'model');
        expect(hasModel).toBe(true);
    });
});
