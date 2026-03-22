// @ts-check
/**
 * constants.js — Centralized magic numbers for the Cupcake Provider Manager.
 *
 * Avoids unnamed numeric literals scattered across modules.
 * Each constant documents its purpose and where it is consumed.
 */

/** Maximum request body size (bytes) before hard-reject. ~10 MB V3 bridge limit. */
export const MAX_BODY_BYTES = 10_000_000;

/** Warning threshold for request body size (bytes). ~5 MB. */
export const BODY_WARN_BYTES = 5_000_000;

/** Default max key-rotation retries before giving up (KeyPool). */
export const MAX_KEY_RETRIES = 30;

/** Base delay (ms) for exponential back-off on HTTP retries. */
export const RETRY_DELAY_BASE_MS = 1000;

/** Cap (ms) for exponential back-off delay. */
export const RETRY_DELAY_CAP_MS = 16_000;
