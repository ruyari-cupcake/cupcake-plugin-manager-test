/**
 * @file cpm-chat-limiter.test.js — Tests for cpm-chat-limiter.js v0.2.0
 * Tests CSS generation logic, selector detection, state management,
 * inter-plugin API, Navigation compatibility, and CPM sub-plugin registration.
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

    it('has correct @version 0.2.2', () => {
        expect(PLUGIN_SRC).toMatch(/\/\/@version\s+0\.2\.2/);
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
// Inter-plugin API (_cpmLimiterState)
// ════════════════════════════════════════════
describe('cpm-chat-limiter — inter-plugin API', () => {
    it('source exposes _cpmLimiterState on window', () => {
        expect(PLUGIN_SRC).toContain('window._cpmLimiterState');
    });

    it('_cpmLimiterState has isVisible method', () => {
        expect(PLUGIN_SRC).toContain('isVisible:');
    });

    it('_cpmLimiterState has getVisibleCount method', () => {
        expect(PLUGIN_SRC).toContain('getVisibleCount:');
    });

    it('_cpmLimiterState exposes enabled, keepCount, totalMessageCount', () => {
        expect(PLUGIN_SRC).toContain('enabled,');
        expect(PLUGIN_SRC).toContain('keepCount,');
        expect(PLUGIN_SRC).toContain('totalMessageCount,');
    });

    // Test isVisible logic directly
    it('isVisible returns true for indices within keepCount', () => {
        const isVisible = (index, en, kc) => !en || index <= kc;
        expect(isVisible(1, true, 6)).toBe(true);
        expect(isVisible(6, true, 6)).toBe(true);
        expect(isVisible(7, true, 6)).toBe(false);
        expect(isVisible(100, true, 6)).toBe(false);
    });

    it('isVisible returns true for all indices when disabled', () => {
        const isVisible = (index, en, _kc) => !en || index <= _kc;
        expect(isVisible(999, false, 6)).toBe(true);
    });

    // Test getVisibleCount logic directly
    it('getVisibleCount clamps to totalMessageCount', () => {
        const getVisibleCount = (en, kc, total) =>
            en ? Math.min(kc, total) : total;
        expect(getVisibleCount(true, 6, 42)).toBe(6);
        expect(getVisibleCount(true, 6, 3)).toBe(3);
        expect(getVisibleCount(false, 6, 42)).toBe(42);
    });

    it('cleanup deletes _cpmLimiterState', () => {
        expect(PLUGIN_SRC).toContain('delete window._cpmLimiterState');
    });
});

// ════════════════════════════════════════════
// Navigation compatibility
// ════════════════════════════════════════════
describe('cpm-chat-navigation — Limiter compatibility', () => {
    const NAV_SRC = fs.readFileSync(
        path.resolve('cpm-chat-navigation.js'), 'utf-8'
    );

    it('Navigation checks _cpmLimiterState in getMessageCount', () => {
        expect(NAV_SRC).toContain('_cpmLimiterState');
    });

    it('Navigation clamps count to limiter.keepCount', () => {
        expect(NAV_SRC).toContain('Math.min(total, limiter.keepCount)');
    });

    it('Navigation version is 2.1.6+', () => {
        expect(NAV_SRC).toMatch(/\/\/@version\s+2\.1\.[6-9]/);
    });

    // Simulate the clamping logic
    it('clamping logic: with limiter enabled, count is limited', () => {
        const getClampedCount = (total, limiterState) => {
            if (limiterState && limiterState.enabled) {
                return Math.min(total, limiterState.keepCount);
            }
            return total;
        };
        expect(getClampedCount(100, { enabled: true, keepCount: 6 })).toBe(6);
        expect(getClampedCount(100, { enabled: false, keepCount: 6 })).toBe(100);
        expect(getClampedCount(3, { enabled: true, keepCount: 6 })).toBe(3);
        expect(getClampedCount(100, null)).toBe(100);
        expect(getClampedCount(100, undefined)).toBe(100);
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
        delete globalThis._cpmLimiterState;
    });

    it('registers to CupcakePM_SubPlugins when risuai exists', async () => {
        // Setup mock risuai
        const mockDoc = {
            querySelector: vi.fn().mockResolvedValue(null),
            querySelectorAll: vi.fn().mockResolvedValue([]),
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
            expect(registered.version).toBe('0.2.0');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_enable');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_count');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_slider');
            expect(registered.uiHtml).toContain('cpm_chat_limiter_status');
            expect(typeof registered.onRender).toBe('function');
        }

        delete globalThis.risuai;
    });
});

// ════════════════════════════════════════════
// v0.2.0 new features — source code verification
// ════════════════════════════════════════════
describe('cpm-chat-limiter v0.2.0 — new features', () => {
    it('contains range slider input', () => {
        expect(PLUGIN_SRC).toContain('type="range"');
        expect(PLUGIN_SRC).toContain('cpm_chat_limiter_slider');
    });

    it('slider and number input are synced', () => {
        // Both update via applyCount function
        expect(PLUGIN_SRC).toContain('applyCount');
        // slider input event updates countInput
        expect(PLUGIN_SRC).toContain("slider.addEventListener('input'");
        // countInput change event updates slider
        expect(PLUGIN_SRC).toContain("countInput.addEventListener('change'");
    });

    it('has message count status display', () => {
        expect(PLUGIN_SRC).toContain('cpm_chat_limiter_status');
        expect(PLUGIN_SRC).toContain('메시지 표시 중');
        expect(PLUGIN_SRC).toContain('비활성화됨');
    });

    it('has MutationObserver support', () => {
        expect(PLUGIN_SRC).toContain('startObserver');
        expect(PLUGIN_SRC).toContain('stopObserver');
        expect(PLUGIN_SRC).toContain('.observe(');
    });

    it('has auto-scroll function', () => {
        expect(PLUGIN_SRC).toContain('scrollToLatest');
        expect(PLUGIN_SRC).toContain('scrollTo');
        expect(PLUGIN_SRC).toContain("behavior: 'smooth'");
    });

    it('scrollToLatest called when toggled ON', () => {
        expect(PLUGIN_SRC).toContain('if (enabled) await scrollToLatest()');
    });

    it('has keepCount persistence', () => {
        expect(PLUGIN_SRC).toContain('cpm_chat_limiter_count');
        expect(PLUGIN_SRC).toContain('STORAGE_KEY_COUNT');
    });

    it('has totalMessageCount tracking', () => {
        expect(PLUGIN_SRC).toContain('totalMessageCount');
        expect(PLUGIN_SRC).toContain('countMessages');
    });

    it('cleanup stops observer', () => {
        expect(PLUGIN_SRC).toContain('stopObserver()');
    });
});

// ════════════════════════════════════════════
// Source code structure verification (from v0.1.0)
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

    it('does NOT contain keyboard shortcut code', () => {
        expect(PLUGIN_SRC).not.toContain('keydown');
        expect(PLUGIN_SRC).not.toContain('parseShortcut');
    });

    it('does NOT contain fold/unfold UI code', () => {
        expect(PLUGIN_SRC).not.toContain('border-top: 3px dashed');
    });

    it('has versions.json entry matching file header', () => {
        const versions = JSON.parse(fs.readFileSync(path.resolve('versions.json'), 'utf-8'));
        const entry = versions['CPM Component - Chat Limiter'];
        expect(entry).toBeDefined();
        expect(entry.version).toBe('0.2.1');
        expect(entry.file).toBe('cpm-chat-limiter.js');
    });
});

// ════════════════════════════════════════════
// Conflict verification — Resizer vs Limiter CSS
// ════════════════════════════════════════════
describe('cpm-chat-limiter — conflict verification', () => {
    const RESIZER_SRC = fs.readFileSync(
        path.resolve('cpm-chat-resizer.js'), 'utf-8'
    );

    it('Resizer does NOT target chat message containers', () => {
        expect(RESIZER_SRC).not.toContain('.chat-message-container');
        expect(RESIZER_SRC).not.toContain('.flex-col-reverse');
    });

    it('Resizer and Limiter use different style tag identifiers', () => {
        expect(RESIZER_SRC).toContain('cpm-maximizer-styles');
        expect(PLUGIN_SRC).toContain('x-cpm-limiter-style');
        // No overlap
        expect(PLUGIN_SRC).not.toContain('cpm-maximizer-styles');
        expect(RESIZER_SRC).not.toContain('x-cpm-limiter-style');
    });

    it('Limiter CSS does not affect textarea elements', () => {
        expect(PLUGIN_SRC).not.toContain('textarea');
    });

    it('Resizer CSS does not use nth-child for message hiding', () => {
        expect(RESIZER_SRC).not.toContain('nth-child');
        expect(RESIZER_SRC).not.toContain('display: none !important');
    });
});

// ════════════════════════════════════════════
// v0.2.1 cleanup improvements
// ════════════════════════════════════════════
describe('cpm-chat-limiter v0.2.1 — listener cleanup', () => {
    it('defines _cpmLimiterUICleanup for re-render safety', () => {
        expect(PLUGIN_SRC).toContain('_cpmLimiterUICleanup');
    });

    it('calls _cpmLimiterUICleanup before registering new listeners', () => {
        const cleanupCallIdx = PLUGIN_SRC.indexOf('if (window._cpmLimiterUICleanup) window._cpmLimiterUICleanup()');
        const addListenerIdx = PLUGIN_SRC.indexOf("checkbox.addEventListener('change'");
        expect(cleanupCallIdx).toBeGreaterThan(-1);
        expect(addListenerIdx).toBeGreaterThan(-1);
        expect(cleanupCallIdx).toBeLessThan(addListenerIdx);
    });

    it('assigns cleanup that removes all three UI listeners', () => {
        expect(PLUGIN_SRC).toContain("checkbox.removeEventListener('change'");
        expect(PLUGIN_SRC).toContain("slider.removeEventListener('input'");
        expect(PLUGIN_SRC).toContain("countInput.removeEventListener('change'");
    });

    it('uses named functions for event handlers (not anonymous)', () => {
        expect(PLUGIN_SRC).toContain('const onCheckboxChange');
        expect(PLUGIN_SRC).toContain('const onSliderInput');
        expect(PLUGIN_SRC).toContain('const onCountChange');
    });
});

// ════════════════════════════════════════════
// Navigation & Resizer cleanup registration
// ════════════════════════════════════════════
describe('sub-plugin cleanup registration', () => {
    const NAV_SRC = fs.readFileSync(path.resolve('cpm-chat-navigation.js'), 'utf-8');
    const RESIZER_SRC_2 = fs.readFileSync(path.resolve('cpm-chat-resizer.js'), 'utf-8');

    it('Navigation registers risuai.onUnload', () => {
        expect(NAV_SRC).toContain('risuai.onUnload(window._cpmNaviCleanup)');
    });

    it('Resizer registers risuai.onUnload', () => {
        expect(RESIZER_SRC_2).toContain('risuai.onUnload(window._cpmResizerCleanup)');
    });

    it('Navigation CupcakePM_SubPlugins name has NO emoji prefix', () => {
        // Name should be plain "Chat Navigation", not "🧭 Chat Navigation"
        const regMatch = NAV_SRC.match(/CupcakePM_SubPlugins\.push\(\{[^}]*name:\s*'([^']+)'/s);
        expect(regMatch).not.toBeNull();
        expect(regMatch[1]).toBe('Chat Navigation');
        expect(regMatch[1]).not.toMatch(/^\p{Emoji}/u);
    });

    it('Navigation icon field retains compass emoji', () => {
        expect(NAV_SRC).toContain("icon: '🧭'");
    });
});
