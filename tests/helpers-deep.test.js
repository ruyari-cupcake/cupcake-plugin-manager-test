/**
 * Deep coverage tests for helpers.js
 * Covers: safeUUID fallback, getSubPluginFileAccept, extractImageUrlFromPart edge cases,
 * all uncovered branches in lines 20-22, 101-109.
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
    safeUUID,
    safeStringify,
    hasNonEmptyMessageContent,
    hasAttachedMultimodals,
    escHtml,
    parseBase64DataUri,
    extractImageUrlFromPart,
    getSubPluginFileAccept,
} from '../src/lib/helpers.js';

describe('safeUUID', () => {
    it('returns a UUID-like string', () => {
        const uuid = safeUUID();
        expect(typeof uuid).toBe('string');
        expect(uuid.length).toBeGreaterThanOrEqual(30);
        expect(uuid).toMatch(/^[0-9a-f-]+$/);
    });

    it('falls back to random UUID when crypto.randomUUID is not available', () => {
        const origRandomUUID = crypto.randomUUID;
        // Temporarily remove crypto.randomUUID
        Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
        try {
            const uuid = safeUUID();
            expect(typeof uuid).toBe('string');
            // Should match the v4 UUID pattern from fallback
            expect(uuid).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
        } finally {
            Object.defineProperty(crypto, 'randomUUID', { value: origRandomUUID, configurable: true, writable: true });
        }
    });

    it('falls back when crypto.randomUUID throws', () => {
        const origRandomUUID = crypto.randomUUID;
        Object.defineProperty(crypto, 'randomUUID', {
            value: () => { throw new Error('not supported'); },
            configurable: true,
            writable: true,
        });
        try {
            const uuid = safeUUID();
            expect(typeof uuid).toBe('string');
            expect(uuid.length).toBeGreaterThan(20);
        } finally {
            Object.defineProperty(crypto, 'randomUUID', { value: origRandomUUID, configurable: true, writable: true });
        }
    });
});

describe('extractImageUrlFromPart', () => {
    it('returns empty string for null/undefined', () => {
        expect(extractImageUrlFromPart(null)).toBe('');
        expect(extractImageUrlFromPart(undefined)).toBe('');
    });

    it('returns string image_url directly', () => {
        expect(extractImageUrlFromPart({ image_url: 'https://example.com/img.png' })).toBe('https://example.com/img.png');
    });

    it('returns url from object image_url', () => {
        expect(extractImageUrlFromPart({ image_url: { url: 'https://example.com/img.png' } })).toBe('https://example.com/img.png');
    });

    it('returns empty string when image_url is neither string nor obj with url', () => {
        expect(extractImageUrlFromPart({ image_url: 123 })).toBe('');
        expect(extractImageUrlFromPart({ image_url: null })).toBe('');
        expect(extractImageUrlFromPart({})).toBe('');
    });
});

describe('getSubPluginFileAccept', () => {
    it('returns standard accept for desktop', () => {
        const result = getSubPluginFileAccept();
        expect(result).toContain('.js');
        expect(result).toContain('text/javascript');
    });

    it('returns broader accept for mobile/iOS user agents', () => {
        const origUA = navigator.userAgent;
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
            configurable: true,
        });
        try {
            const result = getSubPluginFileAccept();
            expect(result).toContain('*/*');
        } finally {
            Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
        }
    });

    it('returns broader accept for Android user agents', () => {
        const origUA = navigator.userAgent;
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile',
            configurable: true,
        });
        try {
            const result = getSubPluginFileAccept();
            expect(result).toContain('*/*');
        } finally {
            Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
        }
    });

    it('detects iPadOS via MacIntel + maxTouchPoints', () => {
        const origUA = navigator.userAgent;
        const origPlatform = navigator.platform;
        const origTP = navigator.maxTouchPoints;
        Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', configurable: true });
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
        try {
            const result = getSubPluginFileAccept();
            expect(result).toContain('*/*');
        } finally {
            Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
            Object.defineProperty(navigator, 'platform', { value: origPlatform, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: origTP, configurable: true });
        }
    });
});

describe('hasAttachedMultimodals', () => {
    it('returns false for null/undefined', () => {
        expect(hasAttachedMultimodals(null)).toBe(false);
        expect(hasAttachedMultimodals(undefined)).toBe(false);
    });

    it('returns false when multimodals is not an array', () => {
        expect(hasAttachedMultimodals({ multimodals: 'string' })).toBe(false);
    });

    it('returns false when multimodals is empty', () => {
        expect(hasAttachedMultimodals({ multimodals: [] })).toBe(false);
    });

    it('returns true when multimodals has items', () => {
        expect(hasAttachedMultimodals({ multimodals: [{ type: 'image' }] })).toBe(true);
    });
});

describe('hasNonEmptyMessageContent — edge cases', () => {
    it('returns true for objects', () => {
        expect(hasNonEmptyMessageContent({ key: 'val' })).toBe(true);
    });

    it('returns true for non-empty arrays', () => {
        expect(hasNonEmptyMessageContent(['a'])).toBe(true);
    });

    it('returns false for empty arrays', () => {
        expect(hasNonEmptyMessageContent([])).toBe(false);
    });

    it('handles numbers (via String coercion)', () => {
        expect(hasNonEmptyMessageContent(42)).toBe(true);
        expect(hasNonEmptyMessageContent(0)).toBe(true);
    });

    it('returns false for whitespace-only string', () => {
        expect(hasNonEmptyMessageContent('   ')).toBe(false);
    });
});

describe('parseBase64DataUri — edge cases', () => {
    it('handles null input', () => {
        expect(parseBase64DataUri(null)).toEqual({ mimeType: null, data: '' });
    });

    it('handles non-string input', () => {
        expect(parseBase64DataUri(123)).toEqual({ mimeType: null, data: '' });
    });

    it('handles empty string', () => {
        expect(parseBase64DataUri('')).toEqual({ mimeType: null, data: '' });
    });

    it('handles raw base64 without data URI prefix', () => {
        expect(parseBase64DataUri('rawBase64Data')).toEqual({ mimeType: null, data: 'rawBase64Data' });
    });

    it('handles data URI with no mime type', () => {
        const result = parseBase64DataUri('data:;base64,abc');
        expect(result.data).toBe('abc');
    });
});

describe('escHtml', () => {
    it('escapes all special characters', () => {
        expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('handles null/undefined', () => {
        expect(escHtml(null)).toBe('');
        expect(escHtml(undefined)).toBe('');
    });

    it('handles ampersands', () => {
        expect(escHtml('a & b')).toBe('a &amp; b');
    });
});

describe('safeStringify', () => {
    it('filters nulls from arrays', () => {
        expect(safeStringify([1, null, 2, undefined, 3])).toBe('[1,2,3]');
    });

    it('handles nested arrays', () => {
        const obj = { arr: [1, null, { inner: [null, 'a'] }] };
        const parsed = JSON.parse(safeStringify(obj));
        expect(parsed.arr).toEqual([1, { inner: ['a'] }]);
    });

    it('handles normal objects', () => {
        expect(safeStringify({ a: 1, b: 'text' })).toBe('{"a":1,"b":"text"}');
    });
});
