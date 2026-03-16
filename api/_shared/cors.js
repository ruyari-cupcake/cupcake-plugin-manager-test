/**
 * api/_shared/cors.js — Shared CORS helpers for Vercel serverless functions.
 *
 * All three API endpoints (main-plugin, versions, update-bundle) use
 * identical CORS headers.  This module provides the base header set
 * and a pre-flight handler so that each endpoint stays DRY.
 *
 * Usage:
 *   import { BASE_CORS_HEADERS, handleCorsOptions } from './_shared/cors.js';
 */

/** Base CORS response headers shared by every API endpoint. */
export const BASE_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
};

/**
 * Handle an OPTIONS pre-flight request.
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if the request was handled (caller should return)
 */
export function handleCorsOptions(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, BASE_CORS_HEADERS);
        res.end();
        return true;
    }
    return false;
}

/**
 * Merge BASE_CORS_HEADERS with an endpoint-specific Cache-Control policy
 * and optional extra headers.
 * @param {string} cacheControl - Cache-Control header value
 * @param {Record<string, string>} [extra] - Additional response headers
 * @returns {Record<string, string>}
 */
export function corsHeaders(cacheControl, extra = {}) {
    return {
        ...BASE_CORS_HEADERS,
        'Cache-Control': cacheControl,
        ...extra,
    };
}
