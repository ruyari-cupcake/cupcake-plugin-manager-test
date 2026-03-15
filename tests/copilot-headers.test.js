/**
 * Unit tests for copilot-headers.js — all exported helpers and constants.
 * Covers: normalization, boolean predicates, token exchange header builder,
 * static request header builder, and constant consistency.
 */
import { describe, it, expect } from 'vitest';
import {
    COPILOT_CHAT_VERSION,
    VSCODE_VERSION,
    GITHUB_API_VERSION,
    GITHUB_TOKEN_API_VERSION,
    COPILOT_TOKEN_USER_AGENT,
    normalizeCopilotNodelessMode,
    shouldUseNodelessTokenHeaders,
    shouldUseLegacyCopilotRequestHeaders,
    buildCopilotTokenExchangeHeaders,
    getCopilotStaticHeaders,
} from '../src/lib/copilot-headers.js';

// ── Constants ──
describe('Copilot header constants', () => {
    it('exports non-empty version strings', () => {
        expect(COPILOT_CHAT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        expect(VSCODE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        expect(GITHUB_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(GITHUB_TOKEN_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('COPILOT_TOKEN_USER_AGENT includes VSCODE_VERSION', () => {
        expect(COPILOT_TOKEN_USER_AGENT).toContain(`Code/${VSCODE_VERSION}`);
        expect(COPILOT_TOKEN_USER_AGENT).toContain('Mozilla/5.0');
    });
});

// ── normalizeCopilotNodelessMode ──
describe('normalizeCopilotNodelessMode', () => {
    it('returns "off" for null', () => {
        expect(normalizeCopilotNodelessMode(null)).toBe('off');
    });

    it('returns "off" for undefined', () => {
        expect(normalizeCopilotNodelessMode(undefined)).toBe('off');
    });

    it('returns "off" for empty string', () => {
        expect(normalizeCopilotNodelessMode('')).toBe('off');
    });

    it('returns "off" for the literal "off"', () => {
        expect(normalizeCopilotNodelessMode('off')).toBe('off');
    });

    it('returns "nodeless-1" for exact match', () => {
        expect(normalizeCopilotNodelessMode('nodeless-1')).toBe('nodeless-1');
    });

    it('returns "nodeless-2" for exact match', () => {
        expect(normalizeCopilotNodelessMode('nodeless-2')).toBe('nodeless-2');
    });

    it('returns "off" for unknown strings', () => {
        expect(normalizeCopilotNodelessMode('nodeless-3')).toBe('off');
        expect(normalizeCopilotNodelessMode('NODELESS-1')).toBe('off'); // case-sensitive
        expect(normalizeCopilotNodelessMode('true')).toBe('off');
        expect(normalizeCopilotNodelessMode('1')).toBe('off');
        expect(normalizeCopilotNodelessMode('garbage')).toBe('off');
    });
});

// ── shouldUseNodelessTokenHeaders ──
describe('shouldUseNodelessTokenHeaders', () => {
    it('returns false for "off"', () => {
        expect(shouldUseNodelessTokenHeaders('off')).toBe(false);
    });

    it('returns false for null/undefined/empty', () => {
        expect(shouldUseNodelessTokenHeaders(null)).toBe(false);
        expect(shouldUseNodelessTokenHeaders(undefined)).toBe(false);
        expect(shouldUseNodelessTokenHeaders('')).toBe(false);
    });

    it('returns true for "nodeless-1"', () => {
        expect(shouldUseNodelessTokenHeaders('nodeless-1')).toBe(true);
    });

    it('returns true for "nodeless-2"', () => {
        expect(shouldUseNodelessTokenHeaders('nodeless-2')).toBe(true);
    });

    it('returns false for unknown values (normalization)', () => {
        expect(shouldUseNodelessTokenHeaders('nodeless-3')).toBe(false);
        expect(shouldUseNodelessTokenHeaders('NODELESS-1')).toBe(false);
    });
});

// ── shouldUseLegacyCopilotRequestHeaders ──
describe('shouldUseLegacyCopilotRequestHeaders', () => {
    it('returns false for "off"', () => {
        expect(shouldUseLegacyCopilotRequestHeaders('off')).toBe(false);
    });

    it('returns false for "nodeless-1"', () => {
        expect(shouldUseLegacyCopilotRequestHeaders('nodeless-1')).toBe(false);
    });

    it('returns true for "nodeless-2" only', () => {
        expect(shouldUseLegacyCopilotRequestHeaders('nodeless-2')).toBe(true);
    });

    it('returns false for null/undefined/empty', () => {
        expect(shouldUseLegacyCopilotRequestHeaders(null)).toBe(false);
        expect(shouldUseLegacyCopilotRequestHeaders(undefined)).toBe(false);
        expect(shouldUseLegacyCopilotRequestHeaders('')).toBe(false);
    });
});

// ── buildCopilotTokenExchangeHeaders ──
describe('buildCopilotTokenExchangeHeaders', () => {
    const TOKEN = 'ghp_testtoken123';

    it('returns full headers in "off" mode (default)', () => {
        const h = buildCopilotTokenExchangeHeaders(TOKEN);
        expect(h['Accept']).toBe('application/json');
        expect(h['Authorization']).toBe(`Bearer ${TOKEN}`);
        expect(h['User-Agent']).toBe(COPILOT_TOKEN_USER_AGENT);
        expect(h['Editor-Version']).toBe(`vscode/${VSCODE_VERSION}`);
        expect(h['Editor-Plugin-Version']).toBe(`copilot-chat/${COPILOT_CHAT_VERSION}`);
        expect(h['X-GitHub-Api-Version']).toBe(GITHUB_TOKEN_API_VERSION);
    });

    it('returns full headers when mode is explicitly "off"', () => {
        const h = buildCopilotTokenExchangeHeaders(TOKEN, 'off');
        expect(h['Editor-Version']).toBeDefined();
        expect(h['Editor-Plugin-Version']).toBeDefined();
        expect(h['X-GitHub-Api-Version']).toBeDefined();
    });

    it('returns minimal headers in "nodeless-1" mode', () => {
        const h = buildCopilotTokenExchangeHeaders(TOKEN, 'nodeless-1');
        expect(h['Accept']).toBe('application/json');
        expect(h['Authorization']).toBe(`Bearer ${TOKEN}`);
        expect(h['User-Agent']).toBe(COPILOT_TOKEN_USER_AGENT);
        // These should be absent
        expect(h['Editor-Version']).toBeUndefined();
        expect(h['Editor-Plugin-Version']).toBeUndefined();
        expect(h['X-GitHub-Api-Version']).toBeUndefined();
    });

    it('returns minimal headers in "nodeless-2" mode (same as nodeless-1 for token exchange)', () => {
        const h = buildCopilotTokenExchangeHeaders(TOKEN, 'nodeless-2');
        expect(h['Accept']).toBe('application/json');
        expect(h['Authorization']).toBe(`Bearer ${TOKEN}`);
        expect(h['User-Agent']).toBe(COPILOT_TOKEN_USER_AGENT);
        expect(h['Editor-Version']).toBeUndefined();
        expect(h['Editor-Plugin-Version']).toBeUndefined();
        expect(h['X-GitHub-Api-Version']).toBeUndefined();
    });

    it('returns full headers for unknown mode values (falls back to off)', () => {
        const h = buildCopilotTokenExchangeHeaders(TOKEN, 'garbage');
        expect(h['Editor-Version']).toBeDefined();
        expect(h['Editor-Plugin-Version']).toBeDefined();
        expect(h['X-GitHub-Api-Version']).toBeDefined();
    });

    it('returns full headers for null/undefined mode', () => {
        const h1 = buildCopilotTokenExchangeHeaders(TOKEN, null);
        expect(h1['Editor-Version']).toBeDefined();
        const h2 = buildCopilotTokenExchangeHeaders(TOKEN, undefined);
        expect(h2['Editor-Version']).toBeDefined();
    });

    it('exactly 3 keys in minimal mode, 6 keys in full mode', () => {
        const minimal = buildCopilotTokenExchangeHeaders(TOKEN, 'nodeless-1');
        expect(Object.keys(minimal)).toHaveLength(3);

        const full = buildCopilotTokenExchangeHeaders(TOKEN, 'off');
        expect(Object.keys(full)).toHaveLength(6);
    });
});

// ── getCopilotStaticHeaders ──
describe('getCopilotStaticHeaders', () => {
    it('returns full static headers in "off" mode (default)', () => {
        const h = getCopilotStaticHeaders();
        expect(h['Copilot-Integration-Id']).toBe('vscode-chat');
        expect(h['Editor-Plugin-Version']).toBe(`copilot-chat/${COPILOT_CHAT_VERSION}`);
        expect(h['Editor-Version']).toBe(`vscode/${VSCODE_VERSION}`);
        expect(h['User-Agent']).toBe(`GitHubCopilotChat/${COPILOT_CHAT_VERSION}`);
        expect(h['X-Github-Api-Version']).toBe(GITHUB_API_VERSION);
        expect(h['X-Initiator']).toBe('user');
        expect(h['X-Interaction-Type']).toBe('conversation-panel');
        expect(h['X-Vscode-User-Agent-Library-Version']).toBe('electron-fetch');
    });

    it('returns full static headers in "nodeless-1" mode (only token exchange is reduced)', () => {
        const h = getCopilotStaticHeaders('nodeless-1');
        // nodeless-1 does NOT affect request headers, only token exchange
        expect(h['Editor-Plugin-Version']).toBeDefined();
        expect(h['Editor-Version']).toBeDefined();
        expect(h['User-Agent']).toBeDefined();
        expect(h['X-Github-Api-Version']).toBeDefined();
        expect(Object.keys(h).length).toBeGreaterThan(1);
    });

    it('returns minimal static headers in "nodeless-2" mode', () => {
        const h = getCopilotStaticHeaders('nodeless-2');
        expect(h['Copilot-Integration-Id']).toBe('vscode-chat');
        // All other headers should be absent
        expect(h['Editor-Plugin-Version']).toBeUndefined();
        expect(h['Editor-Version']).toBeUndefined();
        expect(h['User-Agent']).toBeUndefined();
        expect(h['X-Github-Api-Version']).toBeUndefined();
        expect(h['X-Initiator']).toBeUndefined();
        expect(h['X-Interaction-Type']).toBeUndefined();
        expect(h['X-Vscode-User-Agent-Library-Version']).toBeUndefined();
        expect(Object.keys(h)).toHaveLength(1);
    });

    it('returns full static headers for unknown mode (falls back to off)', () => {
        const h = getCopilotStaticHeaders('garbage');
        expect(h['Editor-Plugin-Version']).toBeDefined();
        expect(Object.keys(h).length).toBeGreaterThan(1);
    });

    it('returns full static headers for null/undefined', () => {
        const h1 = getCopilotStaticHeaders(null);
        expect(h1['Editor-Plugin-Version']).toBeDefined();
        const h2 = getCopilotStaticHeaders(undefined);
        expect(h2['Editor-Plugin-Version']).toBeDefined();
    });
});

// ── Cross-mode consistency ──
describe('Cross-mode consistency', () => {
    it('off mode: full token headers + full request headers', () => {
        const token = buildCopilotTokenExchangeHeaders('ghp_test', 'off');
        const request = getCopilotStaticHeaders('off');
        expect(token['Editor-Version']).toBeDefined();
        expect(request['Editor-Version']).toBeDefined();
    });

    it('nodeless-1: minimal token headers + full request headers', () => {
        const token = buildCopilotTokenExchangeHeaders('ghp_test', 'nodeless-1');
        const request = getCopilotStaticHeaders('nodeless-1');
        expect(token['Editor-Version']).toBeUndefined();
        expect(request['Editor-Version']).toBeDefined();
    });

    it('nodeless-2: minimal token headers + minimal request headers', () => {
        const token = buildCopilotTokenExchangeHeaders('ghp_test', 'nodeless-2');
        const request = getCopilotStaticHeaders('nodeless-2');
        expect(token['Editor-Version']).toBeUndefined();
        expect(request['Editor-Version']).toBeUndefined();
        expect(request['Copilot-Integration-Id']).toBe('vscode-chat');
    });

    it('Authorization header is always present in token exchange regardless of mode', () => {
        for (const mode of ['off', 'nodeless-1', 'nodeless-2']) {
            const h = buildCopilotTokenExchangeHeaders('ghp_mytoken', mode);
            expect(h['Authorization']).toBe('Bearer ghp_mytoken');
        }
    });

    it('Copilot-Integration-Id is always present in static headers regardless of mode', () => {
        for (const mode of ['off', 'nodeless-1', 'nodeless-2', null, undefined, '']) {
            const h = getCopilotStaticHeaders(mode);
            expect(h['Copilot-Integration-Id']).toBe('vscode-chat');
        }
    });
});
