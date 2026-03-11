// @ts-check
/**
 * copilot-headers.js — Copilot API emulation header constants.
 *
 * Extracted from fetch-custom.js so that version bumps (e.g. when GitHub
 * updates the Copilot Chat extension) can be done in a single place
 * without touching the core fetch logic.
 */

/** Copilot Chat extension version emulated by CPM. */
export const COPILOT_CHAT_VERSION = '0.37.4';

/** VS Code editor version emulated by CPM. */
export const VSCODE_VERSION = '1.109.2';

/** GitHub API version header value. */
export const GITHUB_API_VERSION = '2025-10-01';

/**
 * Build the static Copilot emulation headers.
 * Dynamic per-request headers (machine-id, session-id, interaction-id, etc.)
 * are NOT included here — they are set by the caller.
 *
 * @returns {Record<string, string>}
 */
export function getCopilotStaticHeaders() {
    return {
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
        'Editor-Version': `vscode/${VSCODE_VERSION}`,
        'User-Agent': `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
        'X-Github-Api-Version': GITHUB_API_VERSION,
        'X-Initiator': 'user',
        'X-Interaction-Type': 'conversation-panel',
        'X-Vscode-User-Agent-Library-Version': 'electron-fetch',
    };
}
