// @ts-check
/**
 * api-request-log.js — API Request History (ring buffer for API View feature).
 * Tracks HTTP requests/responses for debugging UI. Max 20 entries.
 */
import { safeUUID } from './helpers.js';

const _apiRequestHistory = new Map();
const _API_REQUEST_HISTORY_MAX = 20;
/** @type {string | null} */
let _apiRequestLatestId = null;

/**
 * Store a new API request entry and return its unique ID.
 * @param {Object} entry - Initial request metadata
 * @returns {string} Generated requestId
 */
export function storeApiRequest(entry) {
    const requestId = safeUUID();
    _apiRequestHistory.set(requestId, entry);
    _apiRequestLatestId = requestId;
    if (_apiRequestHistory.size > _API_REQUEST_HISTORY_MAX) {
        const firstKey = _apiRequestHistory.keys().next().value;
        _apiRequestHistory.delete(firstKey);
    }
    return requestId;
}

/**
 * Update an existing API request entry by requestId.
 * @param {string} requestId
 * @param {Object} updates - Fields to merge into the existing entry
 */
export function updateApiRequest(requestId, updates) {
    const entry = _apiRequestHistory.get(requestId);
    if (entry) Object.assign(entry, updates);
}

/**
 * Get the latest API request entry (for API View display).
 * @returns {Object|null}
 */
export function getLatestApiRequest() {
    if (_apiRequestLatestId) return _apiRequestHistory.get(_apiRequestLatestId);
    return null;
}

/**
 * Get all API request entries as an array, newest first.
 * @returns {any[]}
 */
export function getAllApiRequests() {
    const entries = [];
    for (const [id, entry] of _apiRequestHistory) {
        entries.push({ id, ...entry });
    }
    return entries.reverse();
}

/**
 * Get a specific API request by its ID.
 * @param {string} requestId
 * @returns {Object|null}
 */
export function getApiRequestById(requestId) {
    return _apiRequestHistory.get(requestId) || null;
}

/**
 * Clear all stored requests (for testing or reset).
 */
export function clearApiRequests() {
    _apiRequestHistory.clear();
    _apiRequestLatestId = null;
}
