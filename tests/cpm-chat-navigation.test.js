/**
 * @file cpm-chat-navigation.test.js — Tests for cpm-chat-navigation.js v2.1.6
 * Tests keyboard listener cleanup, currentIndex clamping, container selector
 * validation, Limiter event sync, and SafeElement reference preservation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const NAV_SRC = fs.readFileSync(
    path.resolve('cpm-chat-navigation.js'), 'utf-8'
);

// ════════════════════════════════════════════
// Header & metadata
// ════════════════════════════════════════════
describe('cpm-chat-navigation.js — header metadata', () => {
    it('has correct @version 2.1.6', () => {
        expect(NAV_SRC).toMatch(/\/\/@version\s+2\.1\.6/);
    });

    it('has @update-url pointing to test2 repo', () => {
        expect(NAV_SRC).toMatch(/@update-url\s+https:\/\/raw\.githubusercontent\.com\/ruyari-cupcake\/cupcake-plugin-manager-test2\//);
    });
});

// ════════════════════════════════════════════
// FIX-1: currentIndex clamping (Limiter 연동)
// ════════════════════════════════════════════
describe('cpm-chat-navigation — currentIndex clamping logic', () => {
    // Simulate scrollUp behavior
    function simulateScrollUp(currentIndex, count) {
        if (count === 0) return currentIndex;
        if (currentIndex > count) currentIndex = count;
        if (currentIndex < count) currentIndex++;
        return currentIndex;
    }

    // Simulate scrollDown behavior
    function simulateScrollDown(currentIndex, count) {
        if (count === 0) return currentIndex;
        if (currentIndex > count) currentIndex = count;
        if (currentIndex > 1) currentIndex--;
        return currentIndex;
    }

    it('scrollUp: clamps from 50 to 6 when keepCount=6', () => {
        expect(simulateScrollUp(50, 6)).toBe(6); // 50→6 (clamped, already at max)
    });

    it('scrollUp: normal increment when in range', () => {
        expect(simulateScrollUp(3, 6)).toBe(4);
    });

    it('scrollUp: stays at max when already at max', () => {
        expect(simulateScrollUp(6, 6)).toBe(6);
    });

    it('scrollUp: returns unchanged when count=0', () => {
        expect(simulateScrollUp(5, 0)).toBe(5);
    });

    it('scrollDown: clamps from 50 to 5 when keepCount=6', () => {
        expect(simulateScrollDown(50, 6)).toBe(5); // 50→6→5
    });

    it('scrollDown: normal decrement when in range', () => {
        expect(simulateScrollDown(3, 6)).toBe(2);
    });

    it('scrollDown: stays at 1 when already at 1', () => {
        expect(simulateScrollDown(1, 6)).toBe(1);
    });

    it('scrollDown: returns unchanged when count=0', () => {
        expect(simulateScrollDown(5, 0)).toBe(5);
    });

    it('scrollDown: clamps and decrements in a single step', () => {
        // User was at index 100, limiter set to 10
        expect(simulateScrollDown(100, 10)).toBe(9); // 100→10→9
    });

    it('source contains FIX-1 clamping in scrollUp', () => {
        expect(NAV_SRC).toMatch(/scrollUp[\s\S]*?currentIndex > count\) currentIndex = count/);
    });

    it('source contains FIX-1 clamping in scrollDown', () => {
        expect(NAV_SRC).toMatch(/scrollDown[\s\S]*?currentIndex > count\) currentIndex = count/);
    });
});

// ════════════════════════════════════════════
// FIX-2: Container selector validation
// ════════════════════════════════════════════
describe('cpm-chat-navigation — container selector validation', () => {
    it('source checks for .chat-message-container child in findChatContainer', () => {
        expect(NAV_SRC).toContain('.chat-message-container');
        expect(NAV_SRC).toContain('> .chat-message-container');
    });

    it('has comment about INNER container validation', () => {
        expect(NAV_SRC).toContain('FIX-2');
    });
});

// ════════════════════════════════════════════
// FIX-3: Limiter change event sync
// ════════════════════════════════════════════
describe('cpm-chat-navigation — Limiter event sync', () => {
    it('listens for cpm-limiter-change event', () => {
        expect(NAV_SRC).toContain("'cpm-limiter-change'");
    });

    it('removes limiter listener on cleanup', () => {
        expect(NAV_SRC).toContain("removeEventListener('cpm-limiter-change'");
    });

    // Simulate the event handler logic
    it('limiter change handler clamps currentIndex', () => {
        let currentIndex = 50;
        const onLimiterChange = (detail) => {
            const { enabled: limEnabled, keepCount: limKeep } = detail;
            if (limEnabled && currentIndex > limKeep) {
                currentIndex = Math.max(1, limKeep);
            }
        };

        onLimiterChange({ enabled: true, keepCount: 6 });
        expect(currentIndex).toBe(6);
    });

    it('limiter change handler does nothing when disabled', () => {
        let currentIndex = 50;
        const onLimiterChange = (detail) => {
            const { enabled: limEnabled, keepCount: limKeep } = detail;
            if (limEnabled && currentIndex > limKeep) {
                currentIndex = Math.max(1, limKeep);
            }
        };

        onLimiterChange({ enabled: false, keepCount: 6 });
        expect(currentIndex).toBe(50);
    });

    it('limiter change handler does nothing when index already within range', () => {
        let currentIndex = 3;
        const onLimiterChange = (detail) => {
            const { enabled: limEnabled, keepCount: limKeep } = detail;
            if (limEnabled && currentIndex > limKeep) {
                currentIndex = Math.max(1, limKeep);
            }
        };

        onLimiterChange({ enabled: true, keepCount: 6 });
        expect(currentIndex).toBe(3);
    });
});

// ════════════════════════════════════════════
// FIX-A: Keyboard listener body reference preservation
// ════════════════════════════════════════════
describe('cpm-chat-navigation — SafeElement reference preservation', () => {
    it('source stores keyListenerBody reference', () => {
        expect(NAV_SRC).toContain('keyListenerBody');
    });

    it('enableKeyboard stores body in keyListenerBody', () => {
        expect(NAV_SRC).toMatch(/keyListenerBody\s*=\s*body/);
    });

    it('disableKeyboard uses keyListenerBody (not new querySelector)', () => {
        // Ensure disableKeyboard does NOT call querySelector('body')
        const disableKbSection = NAV_SRC.match(/const disableKeyboard[\s\S]*?};/);
        expect(disableKbSection).not.toBeNull();
        const section = disableKbSection[0];
        expect(section).not.toContain("querySelector('body')");
        expect(section).toContain('keyListenerBody');
    });

    it('source stores widgetBodyRef reference for createWidget', () => {
        expect(NAV_SRC).toContain('widgetBodyRef');
    });

    it('createWidget stores body in widgetBodyRef', () => {
        expect(NAV_SRC).toMatch(/widgetBodyRef\s*=\s*body/);
    });

    it('destroyWidget uses widgetBodyRef (not new querySelector for body)', () => {
        const destroySection = NAV_SRC.match(/const destroyWidget[\s\S]*?};/);
        expect(destroySection).not.toBeNull();
        const section = destroySection[0];
        expect(section).not.toMatch(/querySelector\(['"]body['"]\)/);
        expect(section).toContain('widgetBodyRef');
    });

    it('cleanup nullifies keyListenerBody', () => {
        expect(NAV_SRC).toContain('keyListenerBody = null');
    });

    it('cleanup nullifies widgetBodyRef', () => {
        expect(NAV_SRC).toContain('widgetBodyRef = null');
    });
});

// ════════════════════════════════════════════
// Mode cycling
// ════════════════════════════════════════════
describe('cpm-chat-navigation — mode cycling', () => {
    const MODES = ['four', 'two', 'keyboard', 'off'];

    it('has 4 modes in correct order', () => {
        expect(NAV_SRC).toContain("'four', 'two', 'keyboard', 'off'");
    });

    it('cycleMode calls destroyWidget and disableKeyboard before switching', () => {
        const cycleModeSection = NAV_SRC.match(/const cycleMode[\s\S]*?};/);
        expect(cycleModeSection).not.toBeNull();
        const section = cycleModeSection[0];
        expect(section).toContain('destroyWidget');
        expect(section).toContain('disableKeyboard');
    });

    it('cycling correctly wraps around', () => {
        let idx = -1;
        for (let i = 0; i < 5; i++) {
            idx = (idx + 1) % MODES.length;
        }
        // -1→0(four)→1(two)→2(keyboard)→3(off)→0(four)
        expect(MODES[idx]).toBe('four');
    });
});

// ════════════════════════════════════════════
// Limiter inter-plugin state + event dispatch
// ════════════════════════════════════════════
describe('cpm-chat-limiter — event dispatch (FIX-3)', () => {
    const LIMITER_SRC = fs.readFileSync(
        path.resolve('cpm-chat-limiter.js'), 'utf-8'
    );

    it('limiter dispatches cpm-limiter-change CustomEvent', () => {
        expect(LIMITER_SRC).toContain("new CustomEvent('cpm-limiter-change'");
    });

    it('CustomEvent detail includes enabled, keepCount, totalMessageCount', () => {
        expect(LIMITER_SRC).toContain('detail: { enabled, keepCount, totalMessageCount }');
    });

    it('event dispatch is wrapped in try-catch', () => {
        // Find the dispatch block
        const dispatchMatch = LIMITER_SRC.match(/try\s*\{[\s\S]*?CustomEvent[\s\S]*?\}\s*catch/);
        expect(dispatchMatch).not.toBeNull();
    });

    it('limiter version is 0.2.2+', () => {
        expect(LIMITER_SRC).toMatch(/\/\/@version\s+0\.2\.[2-9]/);
    });
});

// ════════════════════════════════════════════
// Chat Resizer reference preservation (FIX-C)
// ════════════════════════════════════════════
describe('cpm-chat-resizer — SafeElement reference preservation', () => {
    const RESIZER_SRC = fs.readFileSync(
        path.resolve('cpm-chat-resizer.js'), 'utf-8'
    );

    it('stores body reference in _cpmResizerBodyRef', () => {
        expect(RESIZER_SRC).toContain('_cpmResizerBodyRef');
    });

    it('cleanup uses _cpmResizerBodyRef (not new querySelector)', () => {
        // Find the actual cleanup function body
        const cleanupIdx = RESIZER_SRC.indexOf('window._cpmResizerCleanup = async');
        expect(cleanupIdx).toBeGreaterThan(-1);
        // Extract section from that point forward (~500 chars)
        const section = RESIZER_SRC.substring(cleanupIdx, cleanupIdx + 500);
        expect(section).not.toMatch(/querySelector\(['"]body['"]\)/);
        expect(section).toContain('_cpmResizerBodyRef');
    });

    it('cleanup nullifies _cpmResizerBodyRef', () => {
        expect(RESIZER_SRC).toContain('_cpmResizerBodyRef = null');
    });

    it('resizer version is 0.3.8+', () => {
        expect(RESIZER_SRC).toMatch(/\/\/@version\s+0\.3\.[8-9]/);
    });
});

// ════════════════════════════════════════════
// Cross-plugin conflict: Limiter + Navigation integration
// ════════════════════════════════════════════
describe('cross-plugin — Limiter + Navigation integration', () => {
    it('Navigation reads _cpmLimiterState in getMessageCount', () => {
        expect(NAV_SRC).toContain('window._cpmLimiterState');
    });

    it('Navigation clamps count with Math.min(total, limiter.keepCount)', () => {
        expect(NAV_SRC).toContain('Math.min(total, limiter.keepCount)');
    });

    // End-to-end clamping simulation
    it('E2E: Limiter change → Navigation index clamping', () => {
        // Simulate Limiter state
        const limiterState = { enabled: true, keepCount: 6, totalMessageCount: 100 };

        // Simulate Navigation getMessageCount
        const total = 100; // All DOM children
        const count = limiterState.enabled
            ? Math.min(total, limiterState.keepCount)
            : total;
        expect(count).toBe(6);

        // Simulate scrollUp with stale currentIndex
        let currentIndex = 50;
        if (currentIndex > count) currentIndex = count;
        if (currentIndex < count) currentIndex++;
        expect(currentIndex).toBe(6); // Clamped, already at max

        // Simulate scrollDown
        currentIndex = 50;
        if (currentIndex > count) currentIndex = count;
        if (currentIndex > 1) currentIndex--;
        expect(currentIndex).toBe(5); // Clamped to 6, then decremented to 5
    });

    it('E2E: Limiter disabled → full range available', () => {
        const limiterState = { enabled: false, keepCount: 6, totalMessageCount: 100 };
        const total = 100;
        const count = limiterState.enabled
            ? Math.min(total, limiterState.keepCount)
            : total;
        expect(count).toBe(100);

        let currentIndex = 50;
        if (currentIndex > count) currentIndex = count;
        if (currentIndex < count) currentIndex++;
        expect(currentIndex).toBe(51); // Normal increment
    });
});
