// @ts-check
/**
 * copilot-version-defaults.js — Single-source-of-truth for Copilot emulation version defaults.
 *
 * When GitHub updates the Copilot Chat extension or VS Code ships a new
 * Electron/Chrome build, only THIS file needs editing.  No other source
 * file references raw version literals — they all read from here.
 *
 * Users can override every value at runtime via @arg settings
 * (cpm_copilot_vscode_version, cpm_copilot_chat_version,
 *  cpm_copilot_chrome_version, cpm_copilot_electron_version).
 *
 * Last updated: 2026-03-15
 */

/** Default Copilot Chat extension version — marketplace latest as of 2026-03-15. */
export const DEFAULT_COPILOT_CHAT_VERSION = '0.40.2026031401';

/** Default VS Code editor version — latest stable as of 2026-03-15. */
export const DEFAULT_VSCODE_VERSION = '1.111.0';

/** Default Chromium version bundled with the matching Electron release. */
export const DEFAULT_CHROME_VERSION = '142.0.7444.265';

/** Default Electron version bundled with the matching VS Code release. */
export const DEFAULT_ELECTRON_VERSION = '39.3.0';
