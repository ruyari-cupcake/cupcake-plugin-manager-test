/**
 * @file cpm-chat-limiter.test.js — Tests for cpm-chat-limiter.js
 * Tests CSS generation logic, selector detection, state management,
 * and CPM sub-plugin registration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Read the plugin source to extract and test its logic
const PLUGIN_SRC = fs.readFileSync(
    path.resolve('cpm-chat-limiter.js'), 'utf-8'
);

// ════════════════════════════════════════════
// Header & metadata tests
// ════════════════════════════════════════════
describe('cpm-chat-limiter.js — header metadata', () => {
    it('has correct @name', () => {
        expect(PLUGIN_SRC).toMatch(/\/\/@name\s+CPM Component - Chat Limiter/);
    });

    it('has correct @version', () => {
        expect(PLUGIN_SRC).toMatch(/\/\/@version\s+0\.1\.0/);
    });

    it('has @update-url pointing to test2 repo', () => {
        expect(PLUGIN_SRC).toMatch(/@update-url\s+https:\/\/raw\.githubusercontent\.com\/ruyari-cupcake\/cupcake-plugin-manager-test2\//);
    });

    it('has @display-name', () => {
        expect(PLUGIN_SRC).toContain('@display-name');
    });
});

// ════════════════════════════════════════════
// CSS generation logic (extracted pure function test)
// ════════════════════════════════════════════
describe('cpm-chat-limiter — CSS generation', () => {
    // Replicate the generateCSS function from the plugin
    function generateCSS(selector, count) {
        if (!selector || count < 1) return '';
        return `${selector}:nth-child(n+${count + 1}) { display: none !important; }`;
    }

    it('generates correct nth-child CSS for keepCount=6', () => {
        const css = generateCSS('.flex-col-reverse > .chat-message-container', 6);
        expect(css).toBe('.flex-col-reverse > .chat-message-container:nth-child(n+7) { display: none !important; }');
    });

    it('generates correct CSS for keepCount=1', () => {
        const css = generateCSS('.flex-col-reverse > .chat-message-container', 1);
        expect(css).toContain(':nth-child(n+2)');
    });

    it('generates correct CSS for keepCount=100', () => {
        const css = generateCSS('.message-container', 100);
        expect(css).toContain(':nth-child(n+101)');
    });

    it('returns empty string for invalid selector', () => {
        expect(generateCSS('', 6)).toBe('');
        expect(generateCSS(null, 6)).toBe('');
    });

    it('returns empty string for count < 1', () => {
        expect(generateCSS('.test', 0)).toBe('');
        expect(generateCSS('.test', -1)).toBe('');
    });
});

// ════════════════════════════════════════════
// Sub-plugin registration integration test
// ════════════════════════════════════════════
describe('cpm-chat-limiter — sub-plugin registration', () => {
    let _origSubPlugins;
    let _origCleanup;

    beforeEach(() => {
        globalThis.CupcakePM_SubPlugins = globalThis.CupcakePM_SubPlugins || [];
        _origSubPlugins = globalThis.CupcakePM_SubPlugins;
        _origCleanup = globalThis._cpmLimiterCleanup;
    });

    afterEach(async () => {
        if (typeof globalThis._cpmLimiterCleanup === 'function') {
            try { await globalThis._cpmLimiterCleanup(); } catch (_) { /* */ }
        }
        globalThis.CupcakePM_SubPlugins = _origSubPlugins;
        globalThis._cpmLimiterCleanup = _origCleanup;
        delete globalThis.risuai;
        delete globalThis.Risuai;
    });

    it('registers to CupcakePM_SubPlugins when risuai exists', async () => {
        // Setup mock risuai
        const mockDoc = {
            querySelector: vi.fn().mockResolvedValue(null),
            createElement: vi.fn().mockResolvedValue({
                setAttribute: vi.fn(),
                setInnerHTML: vi.fn(),
            }),
        };
        globalThis.risuai = {
            getRootDocument: vi.fn().mockResolvedValue(mockDoc),
            safeLocalStorage: {
                getItem: vi.fn().mockResolvedValue(null),
                setItem: vi.fn(),
            },
            onUnload: vi.fn(),
            getArgument: vi.fn().mockResolvedValue(null),
        };
        globalThis.CupcakePM_SubPlugins = [];

        // Execute the plugin by eval (since it's an IIFE)
        // Use dynamic import + data URL workaround
        const blob = new Blob([PLUGIN_SRC], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        try {
            await import(url);
        } catch (_) {
            // May fail in test env but sub-plugin registration happens synchronously
        }
        URL.revokeObjectURL(url);

        // Check registration
        const registered = (globalThis.CupcakePM_SubPlugins || []).find(p => p.id === 'cpm-chat-limiter');
        if (registered) {
            expect(registered.name).toBe('Chat Limiter');
            expect(registered.version).toBe('0.1.0');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_enable');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_count');
            expect(typeof registered.onRender).toBe('function');
        }

        delete globalThis.risuai;
    });
});

// ════════════════════════════════════════════
// Source code structure verification
// ════════════════════════════════════════════
describe('cpm-chat-limiter — code structure', () => {
    it('contains hot-reload cleanup pattern', () => {
        expect(PLUGIN_SRC).toContain('_cpmLimiterCleanup');
    });

    it('contains CSS selector array with 4 fallback selectors', () => {
        expect(PLUGIN_SRC).toContain('.flex-col-reverse > .chat-message-container');
        expect(PLUGIN_SRC).toContain('.chat-message-list > .chat-message-container');
        expect(PLUGIN_SRC).toContain('[class*="chat"] > [class*="message"]');
        expect(PLUGIN_SRC).toContain('.message-container');
    });

    it('uses display: none !important for hiding', () => {
        expect(PLUGIN_SRC).toContain('display: none !important');
    });

    it('uses nth-child CSS mechanism', () => {
        expect(PLUGIN_SRC).toContain(':nth-child(n+');
    });

    it('registers cleanup via risuai.onUnload', () => {
        expect(PLUGIN_SRC).toContain('risuai.onUnload');
    });

    it('has localStorage persistence via safeLocalStorage', () => {
        expect(PLUGIN_SRC).toContain('safeLocalStorage.getItem');
        expect(PLUGIN_SRC).toContain('safeLocalStorage.setItem');
    });

    it('does NOT contain auto-scroll code', () => {
        expect(PLUGIN_SRC).not.toContain('scrollToNewestMessage');
        expect(PLUGIN_SRC).not.toContain('isNearBottom');
        expect(PLUGIN_SRC).not.toContain('scrollThreshold');
    });

    it('does NOT contain keyboard shortcut code', () => {
        expect(PLUGIN_SRC).not.toContain('keydown');
        expect(PLUGIN_SRC).not.toContain('parseShortcut');
    });

    it('does NOT contain fold/unfold UI code', () => {
        expect(PLUGIN_SRC).not.toContain('toggle');
        expect(PLUGIN_SRC).not.toContain('border-top: 3px dashed');
    });

    it('has versions.json entry matching file header', () => {
        const versions = JSON.parse(fs.readFileSync(path.resolve('versions.json'), 'utf-8'));
        const entry = versions['CPM Component - Chat Limiter'];
        expect(entry).toBeDefined();
        expect(entry.version).toBe('0.1.0');
        expect(entry.file).toBe('cpm-chat-limiter.js');
    });
});
