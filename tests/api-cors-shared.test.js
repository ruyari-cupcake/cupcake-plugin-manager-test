/**
 * Tests for api/_shared/cors.js — shared CORS helpers for serverless functions.
 * Verifies header constants, the OPTIONS pre-flight helper, and the
 * corsHeaders merge function.
 */
import { describe, it, expect, vi } from 'vitest';
import { BASE_CORS_HEADERS, handleCorsOptions, corsHeaders } from '../api/_shared/cors.js';

// ── BASE_CORS_HEADERS ──
describe('BASE_CORS_HEADERS', () => {
    it('allows all origins', () => {
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    });

    it('allows GET, HEAD, OPTIONS methods', () => {
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Methods']).toContain('GET');
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Methods']).toContain('HEAD');
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Methods']).toContain('OPTIONS');
    });

    it('allows Content-Type and Range headers', () => {
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Headers']).toContain('Content-Type');
        expect(BASE_CORS_HEADERS['Access-Control-Allow-Headers']).toContain('Range');
    });

    it('sets max-age to 86400 (24h)', () => {
        expect(BASE_CORS_HEADERS['Access-Control-Max-Age']).toBe('86400');
    });

    it('does NOT include Cache-Control (endpoint-specific)', () => {
        expect(BASE_CORS_HEADERS).not.toHaveProperty('Cache-Control');
    });
});

// ── handleCorsOptions ──
describe('handleCorsOptions', () => {
    function mockReqRes(method) {
        const req = { method };
        const res = { writeHead: vi.fn(), end: vi.fn() };
        return { req, res };
    }

    it('handles OPTIONS with 204 and CORS headers, returns true', () => {
        const { req, res } = mockReqRes('OPTIONS');
        const handled = handleCorsOptions(req, res);
        expect(handled).toBe(true);
        expect(res.writeHead).toHaveBeenCalledWith(204, BASE_CORS_HEADERS);
        expect(res.end).toHaveBeenCalled();
    });

    it('returns false for GET requests (no response sent)', () => {
        const { req, res } = mockReqRes('GET');
        const handled = handleCorsOptions(req, res);
        expect(handled).toBe(false);
        expect(res.writeHead).not.toHaveBeenCalled();
        expect(res.end).not.toHaveBeenCalled();
    });

    it('returns false for POST requests', () => {
        const { req, res } = mockReqRes('POST');
        expect(handleCorsOptions(req, res)).toBe(false);
    });

    it('returns false for HEAD requests', () => {
        const { req, res } = mockReqRes('HEAD');
        expect(handleCorsOptions(req, res)).toBe(false);
    });
});

// ── corsHeaders ──
describe('corsHeaders', () => {
    it('merges BASE_CORS_HEADERS with Cache-Control', () => {
        const h = corsHeaders('no-cache');
        expect(h['Access-Control-Allow-Origin']).toBe('*');
        expect(h['Access-Control-Max-Age']).toBe('86400');
        expect(h['Cache-Control']).toBe('no-cache');
    });

    it('includes extra headers', () => {
        const h = corsHeaders('public, max-age=300', {
            'Content-Type': 'application/json; charset=utf-8',
        });
        expect(h['Cache-Control']).toBe('public, max-age=300');
        expect(h['Content-Type']).toBe('application/json; charset=utf-8');
        expect(h['Access-Control-Allow-Origin']).toBe('*');
    });

    it('extra headers override base if conflicting', () => {
        const h = corsHeaders('no-cache', {
            'Access-Control-Allow-Origin': 'https://example.com',
        });
        expect(h['Access-Control-Allow-Origin']).toBe('https://example.com');
    });

    it('works with empty extra object', () => {
        const h = corsHeaders('no-store');
        expect(Object.keys(h)).toHaveLength(5); // 4 base + Cache-Control
        expect(h['Cache-Control']).toBe('no-store');
    });

    it('all three API endpoints use consistent base CORS values', () => {
        const mainH = corsHeaders('no-cache, no-store, must-revalidate', { 'Content-Type': 'application/javascript' });
        const versionsH = corsHeaders('public, max-age=300', { 'Content-Type': 'application/json' });
        const bundleH = corsHeaders('no-cache, no-store, must-revalidate', { 'Content-Type': 'application/json' });

        // All share the same CORS origin policy
        expect(mainH['Access-Control-Allow-Origin']).toBe(versionsH['Access-Control-Allow-Origin']);
        expect(versionsH['Access-Control-Allow-Origin']).toBe(bundleH['Access-Control-Allow-Origin']);

        // All share the same methods and allowed headers
        expect(mainH['Access-Control-Allow-Methods']).toBe(bundleH['Access-Control-Allow-Methods']);
        expect(mainH['Access-Control-Allow-Headers']).toBe(versionsH['Access-Control-Allow-Headers']);

        // Cache policies differ as expected
        expect(mainH['Cache-Control']).not.toBe(versionsH['Cache-Control']);
        expect(mainH['Cache-Control']).toBe(bundleH['Cache-Control']);
    });
});
