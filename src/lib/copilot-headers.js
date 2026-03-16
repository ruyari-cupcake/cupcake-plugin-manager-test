// @ts-check
/**
 * copilot-headers.js — Copilot API emulation header constants.
 *
 * Extracted from fetch-custom.js so that version bumps (e.g. when GitHub
 * updates the Copilot Chat extension) can be done in a single place
 * without touching the core fetch logic.
 *
 * Default version literals live in copilot-version-defaults.js — edit
 * ONLY that file when a new VS Code / Copilot Chat / Electron build ships.
 *
 * Users can override every version at runtime via plugin settings.
 * Call setCopilotVersionOverrides() at boot time to apply saved overrides.
 */
import {
    DEFAULT_COPILOT_CHAT_VERSION,
    DEFAULT_VSCODE_VERSION,
    DEFAULT_CHROME_VERSION,
    DEFAULT_ELECTRON_VERSION,
} from './copilot-version-defaults.js';

/** @deprecated Re-exported for backward compatibility — prefer DEFAULT_COPILOT_CHAT_VERSION from copilot-version-defaults.js. */
export const COPILOT_CHAT_VERSION = DEFAULT_COPILOT_CHAT_VERSION;

/** @deprecated Re-exported for backward compatibility — prefer DEFAULT_VSCODE_VERSION from copilot-version-defaults.js. */
export const VSCODE_VERSION = DEFAULT_VSCODE_VERSION;

// ── User overrides (empty string = use default) ──
/** @type {string} */
let _userChatVersion = '';
/** @type {string} */
let _userVscodeVersion = '';
/** @type {string} */
let _userChromeVersion = '';
/** @type {string} */
let _userElectronVersion = '';

/**
 * Set user-provided version overrides. Empty/falsy values fall back to defaults.
 * @param {{ chatVersion?: string, vscodeVersion?: string, chromeVersion?: string, electronVersion?: string }} overrides
 */
export function setCopilotVersionOverrides(overrides) {
    _userChatVersion = (overrides.chatVersion || '').trim();
    _userVscodeVersion = (overrides.vscodeVersion || '').trim();
    _userChromeVersion = (overrides.chromeVersion || '').trim();
    _userElectronVersion = (overrides.electronVersion || '').trim();
}

/** Effective Chat version (user override → default). */
export function getEffectiveChatVersion() {
    return _userChatVersion || DEFAULT_COPILOT_CHAT_VERSION;
}

/** Effective VS Code version (user override → default). */
export function getEffectiveVscodeVersion() {
    return _userVscodeVersion || DEFAULT_VSCODE_VERSION;
}

/** Effective Chrome version (user override → default). */
export function getEffectiveChromeVersion() {
    return _userChromeVersion || DEFAULT_CHROME_VERSION;
}

/** Effective Electron version (user override → default). */
export function getEffectiveElectronVersion() {
    return _userElectronVersion || DEFAULT_ELECTRON_VERSION;
}

/** GitHub API version header value. */
export const GITHUB_API_VERSION = '2025-10-01';

/** Token exchange API version header value. */
export const GITHUB_TOKEN_API_VERSION = '2024-12-15';

/** Browser-like User-Agent used for token exchange (computed dynamically). */
function getCopilotTokenUserAgent() {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/${getEffectiveVscodeVersion()} Chrome/${getEffectiveChromeVersion()} Electron/${getEffectiveElectronVersion()} Safari/537.36`;
}

/**
 * @deprecated Kept for backward compatibility — prefer getCopilotTokenUserAgent().
 * Uses compile-time defaults; runtime overrides are NOT reflected here.
 */
export const COPILOT_TOKEN_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/${DEFAULT_VSCODE_VERSION} Chrome/${DEFAULT_CHROME_VERSION} Electron/${DEFAULT_ELECTRON_VERSION} Safari/537.36`;

/** @typedef {'off' | 'nodeless-1' | 'nodeless-2'} CopilotNodelessMode */

/**
 * Normalize the persisted node-less compatibility mode.
 *
 * @param {string | null | undefined} value
 * @returns {CopilotNodelessMode}
 */
export function normalizeCopilotNodelessMode(value) {
    if (value === 'nodeless-1' || value === 'nodeless-2') return value;
    return 'off';
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function shouldUseNodelessTokenHeaders(mode) {
    const normalized = normalizeCopilotNodelessMode(mode);
    return normalized === 'nodeless-1' || normalized === 'nodeless-2';
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function shouldUseLegacyCopilotRequestHeaders(mode) {
    return normalizeCopilotNodelessMode(mode) === 'nodeless-2';
}

/**
 * Build headers for GitHub OAuth → Copilot token exchange.
 * `nodeless-1` and `nodeless-2` intentionally keep this minimal so users can
 * test browser-direct node-less environments with fewer CORS-preflight issues.
 *
 * @param {string} oauthToken
 * @param {string | null | undefined} [mode='off']
 * @returns {Record<string, string>}
 */
export function buildCopilotTokenExchangeHeaders(oauthToken, mode = 'off') {
    const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${oauthToken}`,
        'User-Agent': getCopilotTokenUserAgent(),
    };
    if (shouldUseNodelessTokenHeaders(mode)) return headers;
    return {
        ...headers,
        'Editor-Version': `vscode/${getEffectiveVscodeVersion()}`,
        'Editor-Plugin-Version': `copilot-chat/${getEffectiveChatVersion()}`,
        'X-GitHub-Api-Version': GITHUB_TOKEN_API_VERSION,
    };
}

/**
 * Build the static Copilot emulation headers.
 * Dynamic per-request headers (machine-id, session-id, interaction-id, etc.)
 * are NOT included here — they are set by the caller.
 *
 * `nodeless-2` uses the old minimal request-header profile so users can test
 * restrictive node-less hosts without changing the global/default behavior.
 *
 * @param {string | null | undefined} [mode='off']
 * @returns {Record<string, string>}
 */
export function getCopilotStaticHeaders(mode = 'off') {
    if (shouldUseLegacyCopilotRequestHeaders(mode)) {
        return {
            'Copilot-Integration-Id': 'vscode-chat',
        };
    }
    const chatVer = getEffectiveChatVersion();
    const codeVer = getEffectiveVscodeVersion();
    return {
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Plugin-Version': `copilot-chat/${chatVer}`,
        'Editor-Version': `vscode/${codeVer}`,
        'User-Agent': `GitHubCopilotChat/${chatVer}`,
        'X-Github-Api-Version': GITHUB_API_VERSION,
        'X-Initiator': 'user',
        'X-Interaction-Type': 'conversation-panel',
        'X-Vscode-User-Agent-Library-Version': 'electron-fetch',
    };
}
