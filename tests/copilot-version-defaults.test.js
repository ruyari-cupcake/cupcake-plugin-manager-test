/**
 * Tests for copilot-version-defaults.js — single-source-of-truth version constants.
 * Validates that all default versions are non-empty, well-formed semver-ish strings,
 * and that no stale hard-coded literal leaks into copilot-headers.js.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_COPILOT_CHAT_VERSION,
    DEFAULT_VSCODE_VERSION,
    DEFAULT_CHROME_VERSION,
    DEFAULT_ELECTRON_VERSION,
} from '../src/lib/copilot-version-defaults.js';

describe('copilot-version-defaults exports', () => {
    it('DEFAULT_COPILOT_CHAT_VERSION is a non-empty string', () => {
        expect(typeof DEFAULT_COPILOT_CHAT_VERSION).toBe('string');
        expect(DEFAULT_COPILOT_CHAT_VERSION.length).toBeGreaterThan(0);
    });

    it('DEFAULT_VSCODE_VERSION matches semver pattern', () => {
        expect(DEFAULT_VSCODE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('DEFAULT_CHROME_VERSION matches semver-like pattern (major.minor.build.patch)', () => {
        expect(DEFAULT_CHROME_VERSION).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it('DEFAULT_ELECTRON_VERSION matches semver pattern', () => {
        expect(DEFAULT_ELECTRON_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe('copilot-headers.js uses copilot-version-defaults.js (no stale literals)', () => {
    it('COPILOT_CHAT_VERSION re-export matches default', () => {
        // Dynamically import to ensure the re-export alias equals the default
        return import('../src/lib/copilot-headers.js').then((mod) => {
            expect(mod.COPILOT_CHAT_VERSION).toBe(DEFAULT_COPILOT_CHAT_VERSION);
        });
    });

    it('VSCODE_VERSION re-export matches default', () => {
        return import('../src/lib/copilot-headers.js').then((mod) => {
            expect(mod.VSCODE_VERSION).toBe(DEFAULT_VSCODE_VERSION);
        });
    });

    it('COPILOT_TOKEN_USER_AGENT contains all default versions', () => {
        return import('../src/lib/copilot-headers.js').then((mod) => {
            expect(mod.COPILOT_TOKEN_USER_AGENT).toContain(DEFAULT_VSCODE_VERSION);
            expect(mod.COPILOT_TOKEN_USER_AGENT).toContain(DEFAULT_CHROME_VERSION);
            expect(mod.COPILOT_TOKEN_USER_AGENT).toContain(DEFAULT_ELECTRON_VERSION);
        });
    });
});
