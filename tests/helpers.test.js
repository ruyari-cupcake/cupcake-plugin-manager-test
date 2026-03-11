import { describe, it, expect } from 'vitest';
import {
    safeUUID,
    safeStringify,
    hasNonEmptyMessageContent,
    hasAttachedMultimodals,
    escHtml,
    parseBase64DataUri,
    extractImageUrlFromPart,
} from '../src/lib/helpers.js';

describe('safeUUID', () => {
    it('returns a string in UUID-like format', () => {
        const uuid = safeUUID();
        expect(typeof uuid).toBe('string');
        expect(uuid.length).toBeGreaterThanOrEqual(32);
        // Should have hyphens
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generates unique values', () => {
        const uuids = new Set(Array.from({ length: 100 }, () => safeUUID()));
        expect(uuids.size).toBe(100);
    });
});

describe('safeStringify', () => {
    it('removes null entries from arrays', () => {
        const obj = { items: [1, null, 3, undefined, 5] };
        const result = JSON.parse(safeStringify(obj));
        expect(result.items).toEqual([1, 3, 5]);
    });

    it('handles nested arrays', () => {
        const obj = { a: [1, null], b: { c: [null, 'hello', null] } };
        const result = JSON.parse(safeStringify(obj));
        expect(result.a).toEqual([1]);
        expect(result.b.c).toEqual(['hello']);
    });

    it('preserves non-array values', () => {
        const obj = { name: 'test', count: 42, flag: true };
        const result = JSON.parse(safeStringify(obj));
        expect(result).toEqual(obj);
    });

    it('handles empty arrays', () => {
        const obj = { items: [] };
        const result = JSON.parse(safeStringify(obj));
        expect(result.items).toEqual([]);
    });

    it('handles all-null arrays', () => {
        const obj = { items: [null, undefined, null] };
        const result = JSON.parse(safeStringify(obj));
        expect(result.items).toEqual([]);
    });
});

describe('hasNonEmptyMessageContent', () => {
    it('returns false for null', () => {
        expect(hasNonEmptyMessageContent(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(hasNonEmptyMessageContent(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(hasNonEmptyMessageContent('')).toBe(false);
        expect(hasNonEmptyMessageContent('   ')).toBe(false);
    });

    it('returns true for non-empty string', () => {
        expect(hasNonEmptyMessageContent('hello')).toBe(true);
    });

    it('returns true for non-empty array', () => {
        expect(hasNonEmptyMessageContent([{ type: 'text', text: 'hi' }])).toBe(true);
    });

    it('returns false for empty array', () => {
        expect(hasNonEmptyMessageContent([])).toBe(false);
    });

    it('returns true for object', () => {
        expect(hasNonEmptyMessageContent({ text: 'hi' })).toBe(true);
    });

    it('converts other types to string', () => {
        expect(hasNonEmptyMessageContent(42)).toBe(true);
        expect(hasNonEmptyMessageContent(0)).toBe(true); // "0" is non-empty
    });
});

describe('hasAttachedMultimodals', () => {
    it('returns false for null/undefined', () => {
        expect(hasAttachedMultimodals(null)).toBe(false);
        expect(hasAttachedMultimodals(undefined)).toBe(false);
    });

    it('returns false when no multimodals property', () => {
        expect(hasAttachedMultimodals({ content: 'hello' })).toBe(false);
    });

    it('returns false for empty multimodals array', () => {
        expect(hasAttachedMultimodals({ multimodals: [] })).toBe(false);
    });

    it('returns true for non-empty multimodals array', () => {
        expect(hasAttachedMultimodals({ multimodals: [{ type: 'image' }] })).toBe(true);
    });

    it('returns false for non-array multimodals', () => {
        expect(hasAttachedMultimodals({ multimodals: 'not-array' })).toBe(false);
    });
});

describe('escHtml', () => {
    it('escapes HTML special characters', () => {
        expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('escapes ampersands', () => {
        expect(escHtml('a & b')).toBe('a &amp; b');
    });

    it('handles null/undefined', () => {
        expect(escHtml(null)).toBe('');
        expect(escHtml(undefined)).toBe('');
    });

    it('converts non-strings', () => {
        expect(escHtml(42)).toBe('42');
    });
});

describe('parseBase64DataUri', () => {
    it('parses standard image data URI', () => {
        const result = parseBase64DataUri('data:image/png;base64,abc123');
        expect(result.mimeType).toBe('image/png');
        expect(result.data).toBe('abc123');
    });

    it('parses audio data URI', () => {
        const result = parseBase64DataUri('data:audio/wav;base64,wavdata');
        expect(result.mimeType).toBe('audio/wav');
        expect(result.data).toBe('wavdata');
    });

    it('handles raw base64 without data URI prefix', () => {
        const result = parseBase64DataUri('abc123rawbase64');
        expect(result.mimeType).toBeNull();
        expect(result.data).toBe('abc123rawbase64');
    });

    it('handles null/undefined/empty', () => {
        expect(parseBase64DataUri(null)).toEqual({ mimeType: null, data: '' });
        expect(parseBase64DataUri(undefined)).toEqual({ mimeType: null, data: '' });
        expect(parseBase64DataUri('')).toEqual({ mimeType: null, data: '' });
    });

    it('handles non-string input', () => {
        expect(parseBase64DataUri(42)).toEqual({ mimeType: null, data: '' });
    });

    it('handles data URI with complex MIME type', () => {
        const result = parseBase64DataUri('data:application/octet-stream;base64,bindata');
        expect(result.mimeType).toBe('application/octet-stream');
        expect(result.data).toBe('bindata');
    });
});

describe('extractImageUrlFromPart', () => {
    it('extracts URL from OpenAI object format', () => {
        expect(extractImageUrlFromPart({ image_url: { url: 'https://example.com/img.png' } }))
            .toBe('https://example.com/img.png');
    });

    it('extracts URL from string format', () => {
        expect(extractImageUrlFromPart({ image_url: 'https://example.com/img.png' }))
            .toBe('https://example.com/img.png');
    });

    it('returns empty string for null/missing', () => {
        expect(extractImageUrlFromPart(null)).toBe('');
        expect(extractImageUrlFromPart({})).toBe('');
        expect(extractImageUrlFromPart({ image_url: {} })).toBe('');
    });
});
