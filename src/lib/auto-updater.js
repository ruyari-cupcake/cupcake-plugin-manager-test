// @ts-check
/**
 * auto-updater.js — Main plugin auto-update logic.
 *
 * Extracted from sub-plugin-manager.js for maintainability.
 * All methods are designed to be spread into SubPluginManager and called
 * with `this` referencing SubPluginManager.
 *
 * Responsibilities:
 *   - Pending update marker persistence (read/write/clear/remember)
 *   - Retriable error classification
 *   - Version check (manifest + JS fallback)
 *   - Download with bundle-first strategy + Content-Length integrity
 *   - Validate & install to RisuAI DB (header parsing, settings preservation)
 *   - Boot retry lifecycle
 *   - Single-bundle sub-plugin update check & apply
 *   - Concurrent dedup via _mainUpdateInFlight
 */
import { Risu, CPM_VERSION, safeGetBoolArg } from './shared-state.js';
import { validateSchema, schemas } from './schema.js';
import {
    VERSIONS_URL as _VERSIONS_URL,
    MAIN_UPDATE_URL as _MAIN_UPDATE_URL,
    UPDATE_BUNDLE_URL as _UPDATE_BUNDLE_URL,
    CPM_ENV as _CPM_ENV,
} from './endpoints.js';

// ────────────────────────────────────────────────────────────────
// SHA-256 utility (module-level, not a method)
// ────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a string using Web Crypto API.
 * Falls back gracefully if crypto.subtle is unavailable.
 * @param {string} text
 * @returns {Promise<string>} lowercase hex string, or empty string on failure
 */
export async function _computeSHA256(text) {
    try {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return '';
    }
}

/**
 * Race a promise against a timeout and clear the timer once settled.
 * Prevents dangling timer handles during tests and retries.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
function _withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        Promise.resolve(promise).then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

// ────────────────────────────────────────────────────────────────
// Auto-updater method collection
// ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SubPluginLike
 * @property {string} id
 * @property {string} name
 * @property {string} [version]
 * @property {string} [code]
 * @property {string} [description]
 * @property {string} [icon]
 * @property {string} [updateUrl]
 * @property {boolean} [enabled]
 */

/**
 * Represents the full SubPluginManager object after all spreads are merged.
 * Used as `@this` context for auto-updater methods.
 * @typedef {Object} SubPluginManagerCtx
 * @property {SubPluginLike[]} plugins
 * @property {(a: string, b: string) => number} compareVersions
 * @property {(code: string) => {name: string, version: string, description?: string, icon?: string, updateUrl?: string}} extractMetadata
 * @property {() => Promise<void>} saveRegistry
 * @property {(updates: any[]) => Promise<void>} showUpdateToast
 * @property {(local: string, remote: string, changes: string, success: boolean, error?: string) => Promise<void>} _showMainAutoUpdateResult
 * @property {() => Promise<void>} _waitForMainPluginPersistence
 * @property {(remoteVersion: string, changes?: string) => Promise<{ok: boolean, error?: string}>} safeMainPluginUpdate
 * @property {(remoteVersion: string, changes: string) => Promise<void>} _rememberPendingMainUpdate
 * @property {() => Promise<void>} _clearPendingMainUpdate
 * @property {(error: string) => boolean} _isRetriableMainUpdateError
 * @property {() => Promise<string>} _getInstalledMainPluginVersion
 * @property {(data: any) => Promise<void>} _writePendingMainUpdate
 * @property {() => Promise<any>} _readPendingMainUpdate
 * @property {(expectedVersion?: string) => Promise<{ok: boolean, code?: string, error?: string}>} _downloadMainPluginCode
 * @property {(code: string, remoteVersion: string, changes?: string) => Promise<{ok: boolean, error?: string}>} _validateAndInstallMainPlugin
 * @property {string} VERSIONS_URL
 * @property {string} MAIN_UPDATE_URL
 * @property {string} UPDATE_BUNDLE_URL
 * @property {number} _VERSION_CHECK_COOLDOWN
 * @property {string} _VERSION_CHECK_STORAGE_KEY
 * @property {string} _MAIN_VERSION_CHECK_STORAGE_KEY
 * @property {string} _MAIN_UPDATE_RETRY_STORAGE_KEY
 * @property {number} _MAIN_UPDATE_RETRY_COOLDOWN
 * @property {number} _MAIN_UPDATE_RETRY_MAX_ATTEMPTS
 * @property {Promise<{ok: boolean, error?: string}>|null} _mainUpdateInFlight
 * @property {string[]} _pendingUpdateNames
 */

/**
 * Methods to be spread into SubPluginManager.
 * Every method uses `this` which will reference SubPluginManager at call-time.
 * @type {{[K: string]: any}}
 */
export const autoUpdaterMethods = {
    // ── Constants & State ──
    VERSIONS_URL: _VERSIONS_URL,
    MAIN_UPDATE_URL: _MAIN_UPDATE_URL,
    _VERSION_CHECK_COOLDOWN: 600000,
    _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
    _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
    _MAIN_UPDATE_RETRY_STORAGE_KEY: 'cpm_pending_main_update',
    _MAIN_UPDATE_RETRY_COOLDOWN: 300000,
    _MAIN_UPDATE_RETRY_MAX_ATTEMPTS: 2,
    _mainUpdateInFlight: null,
    _pendingUpdateNames: [],

    // ── Pending update marker persistence ──

    async _readPendingMainUpdate() {
        try {
            const raw = await Risu.pluginStorage.getItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY);
            if (!raw) return null;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!parsed || typeof parsed !== 'object') {
                await this._clearPendingMainUpdate();
                return null;
            }
            const version = String(parsed.version || '').trim();
            if (!version) {
                await this._clearPendingMainUpdate();
                return null;
            }
            return {
                version,
                changes: typeof parsed.changes === 'string' ? parsed.changes : '',
                createdAt: Number(parsed.createdAt) || 0,
                attempts: Number(parsed.attempts) || 0,
                lastAttemptTs: Number(parsed.lastAttemptTs) || 0,
                lastError: typeof parsed.lastError === 'string' ? parsed.lastError : '',
            };
        } catch (/** @type {any} */ e) {
            console.warn('[CPM Retry] Failed to read pending main update marker:', e.message || e);
            try { await this._clearPendingMainUpdate(); } catch (_) { }
            return null;
        }
    },

    /** @param {any} data */
    async _writePendingMainUpdate(data) {
        try {
            await Risu.pluginStorage.setItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY, JSON.stringify(data));
        } catch (/** @type {any} */ e) {
            console.warn('[CPM Retry] Failed to write pending main update marker:', e.message || e);
        }
    },

    async _clearPendingMainUpdate() {
        try {
            if (typeof Risu.pluginStorage.removeItem === 'function') {
                await Risu.pluginStorage.removeItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY);
            } else {
                await Risu.pluginStorage.setItem(this._MAIN_UPDATE_RETRY_STORAGE_KEY, '');
            }
        } catch (/** @type {any} */ e) {
            console.warn('[CPM Retry] Failed to clear pending main update marker:', e.message || e);
        }
    },

    /**
     * @param {string} remoteVersion
     * @param {string} [changes]
     */
    async _rememberPendingMainUpdate(remoteVersion, changes) {
        const version = String(remoteVersion || '').trim();
        if (!version) return;
        const existing = await this._readPendingMainUpdate();
        const sameVersion = existing && existing.version === version;
        await this._writePendingMainUpdate({
            version,
            changes: typeof changes === 'string' ? changes : (existing?.changes || ''),
            createdAt: sameVersion ? (existing.createdAt || Date.now()) : Date.now(),
            attempts: sameVersion ? (existing.attempts || 0) : 0,
            lastAttemptTs: sameVersion ? (existing.lastAttemptTs || 0) : 0,
            lastError: sameVersion ? (existing.lastError || '') : '',
        });
    },

    // ── Error classification ──

    /** @param {string|Error} error */
    _isRetriableMainUpdateError(error) {
        const msg = String(error || '').toLowerCase();
        if (!msg) return true;
        const nonRetriablePatterns = [
            '이름 불일치',
            '버전 불일치',
            'api 버전이 3.0이 아닙니다',
            '다운그레이드 차단',
            '이미 같은 버전입니다',
            '플러그인을 db에서 찾을 수 없습니다',
            '플러그인 목록을 찾을 수 없습니다',
        ];
        return !nonRetriablePatterns.some(pattern => msg.includes(pattern.toLowerCase()));
    },

    // ── Installed version helper ──

    async _getInstalledMainPluginVersion() {
        try {
            const db = await Risu.getDatabase();
            const plugin = db?.plugins?.find?.((/** @type {any} */ p) => p?.name === 'Cupcake_Provider_Manager');
            return String(plugin?.versionOfPlugin || CPM_VERSION || '').trim();
        } catch (_) {
            return String(CPM_VERSION || '').trim();
        }
    },

    // ── Boot retry lifecycle ──

    async retryPendingMainPluginUpdateOnBoot() {
        try {
            const pending = await this._readPendingMainUpdate();
            if (!pending) return false;

            const installedVersion = await this._getInstalledMainPluginVersion();
            if (installedVersion && this.compareVersions(installedVersion, pending.version) <= 0) {
                console.log(`[CPM Retry] Pending main update already satisfied (${installedVersion} >= ${pending.version}). Clearing marker.`);
                await this._clearPendingMainUpdate();
                return true;
            }

            if (pending.attempts >= this._MAIN_UPDATE_RETRY_MAX_ATTEMPTS) {
                console.warn(`[CPM Retry] Pending main update exceeded max attempts (${pending.attempts}/${this._MAIN_UPDATE_RETRY_MAX_ATTEMPTS}). Clearing marker.`);
                await this._clearPendingMainUpdate();
                return false;
            }

            const elapsed = Date.now() - (pending.lastAttemptTs || 0);
            if (pending.lastAttemptTs && elapsed < this._MAIN_UPDATE_RETRY_COOLDOWN) {
                console.log(`[CPM Retry] Pending main update cooldown active (${Math.ceil((this._MAIN_UPDATE_RETRY_COOLDOWN - elapsed) / 1000)}s left).`);
                return false;
            }

            await this._writePendingMainUpdate({
                ...pending,
                attempts: (pending.attempts || 0) + 1,
                lastAttemptTs: Date.now(),
                lastError: '',
            });

            console.log(`[CPM Retry] Retrying pending main update on boot: ${installedVersion || 'unknown'} → ${pending.version}`);
            if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
                console.log(`[CPM Retry] Auto-update disabled by user. Skipping boot retry.`);
                return false;
            }
            const result = await this.safeMainPluginUpdate(pending.version, pending.changes || '');
            if (!result.ok) {
                const latest = await this._readPendingMainUpdate();
                if (latest) {
                    await this._writePendingMainUpdate({
                        ...latest,
                        lastError: String(result.error || ''),
                    });
                }
            }
            return true;
        } catch (/** @type {any} */ e) {
            console.warn('[CPM Retry] Pending main update retry failed:', e.message || e);
            return false;
        }
    },

    // ── Manifest-based version check ──

    async checkVersionsQuiet() {
        try {
            if (/** @type {any} */ (window)._cpmVersionChecked) return;
            /** @type {any} */ (window)._cpmVersionChecked = true;

            try {
                const lastCheck = await Risu.pluginStorage.getItem(this._VERSION_CHECK_STORAGE_KEY);
                if (lastCheck) {
                    const elapsed = Date.now() - parseInt(lastCheck, 10);
                    if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                        console.log(`[CPM AutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago (cooldown: ${this._VERSION_CHECK_COOLDOWN / 60000}min)`);
                        return;
                    }
                }
            } catch (_) { /* pluginStorage not available */ }

            const cacheBuster = this.VERSIONS_URL + '?_t=' + Date.now();
            console.log(`[CPM AutoCheck] Fetching version manifest...`);

            const fetchPromise = Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Version manifest fetch timed out (15s)')), 15000));
            const result = await Promise.race([fetchPromise, timeoutPromise]);

            if (!result.data || (result.status && result.status >= 400)) {
                console.warn(`[CPM AutoCheck] Fetch failed (status=${result.status}), silently skipped.`);
                return;
            }

            const manifest = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
            const manifestResult = validateSchema(manifest, schemas.updateBundleVersions);
            if (!manifestResult.ok) {
                console.warn(`[CPM AutoCheck] Invalid manifest structure: ${manifestResult.error}`);
                return;
            }
            if (!manifest || typeof manifest !== 'object') return;

            const updatesAvailable = [];
            for (const p of this.plugins) {
                if (!p.updateUrl || !p.name) continue;
                const remote = manifest[p.name];
                if (!remote || !remote.version) continue;
                const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                if (cmp > 0) {
                    updatesAvailable.push({
                        name: p.name, icon: p.icon || '🧩',
                        localVersion: p.version || '0.0.0', remoteVersion: remote.version,
                        changes: remote.changes || '',
                    });
                }
            }

            let mainUpdateInfo = null;
            const mainRemote = manifest['Cupcake Provider Manager'];
            if (mainRemote && mainRemote.version) {
                /** @type {any} */ (window)._cpmMainVersionFromManifest = true;
                const mainCmp = this.compareVersions(CPM_VERSION, mainRemote.version);
                if (mainCmp > 0) {
                    mainUpdateInfo = {
                        localVersion: CPM_VERSION, remoteVersion: mainRemote.version,
                        changes: mainRemote.changes || '',
                    };
                    console.log(`[CPM AutoCheck] Main plugin update available: ${CPM_VERSION}→${mainRemote.version}`);
                } else {
                    console.log(`[CPM AutoCheck] Main plugin is up to date (${CPM_VERSION}).`);
                }
            }

            try {
                await Risu.pluginStorage.setItem(this._VERSION_CHECK_STORAGE_KEY, String(Date.now()));
            } catch (_) { /* ignore */ }

            if (updatesAvailable.length > 0) {
                this._pendingUpdateNames = updatesAvailable.map(u => u.name);
                console.log(`[CPM AutoCheck] ${updatesAvailable.length} update(s) available:`, updatesAvailable.map(u => `${u.name} ${u.localVersion}→${u.remoteVersion}`).join(', '));
                await this.showUpdateToast(updatesAvailable);
            } else {
                console.log(`[CPM AutoCheck] All sub-plugins up to date.`);
            }

            if (mainUpdateInfo) {
                const delay = updatesAvailable.length > 0 ? 1500 : 0;
                setTimeout(async () => {
                    if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
                        console.log(`[CPM AutoCheck] Auto-update disabled by user. Showing notification only.`);
                        try { await this._showMainUpdateAvailableToast(mainUpdateInfo.localVersion, mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (e) { console.warn('[CPM AutoCheck] _showMainUpdateAvailableToast failed:', e); }
                        return;
                    }
                        try { await this._rememberPendingMainUpdate(mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (e) { console.warn('[CPM AutoCheck] _rememberPendingMainUpdate failed:', e); }
                    try { await this.safeMainPluginUpdate(mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (e) { console.warn('[CPM AutoCheck] safeMainPluginUpdate failed:', e); }
                }, delay);
            }
        } catch (/** @type {any} */ e) {
            console.debug(`[CPM AutoCheck] Silent error:`, e.message || e);
        }
    },

    // ── JS fallback version check ──

    async checkMainPluginVersionQuiet() {
        try {
            if (/** @type {any} */ (window)._cpmMainVersionFromManifest) {
                console.log('[CPM MainAutoCheck] Already checked via manifest, skipping JS fallback.');
                return;
            }
            if (/** @type {any} */ (window)._cpmMainVersionChecked) return;
            /** @type {any} */ (window)._cpmMainVersionChecked = true;

            // ── Early exit: auto-update OFF → skip heavy JS download ──
            // Manifest path (checkVersionsQuiet) handles lightweight toast notifications.
            // This fallback downloads the full 50-70KB JS file, which is excessive for OFF users.
            if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
                console.log('[CPM MainAutoCheck] Auto-update disabled. Skipping heavy JS fallback download.');
                return;
            }

            try {
                const lastCheck = await Risu.pluginStorage.getItem(this._MAIN_VERSION_CHECK_STORAGE_KEY);
                if (lastCheck) {
                    const elapsed = Date.now() - parseInt(lastCheck, 10);
                    if (elapsed < this._VERSION_CHECK_COOLDOWN) {
                        console.log(`[CPM MainAutoCheck] Skipped — last check ${Math.round(elapsed / 60000)}min ago`);
                        return;
                    }
                }
            } catch (_) { /* ignore */ }

            const cacheBuster = this.MAIN_UPDATE_URL + '?_t=' + Date.now();
            console.log('[CPM MainAutoCheck] Fallback: fetching remote main plugin script...');

            let code;
            try {
                const response = await Promise.race([
                    Risu.nativeFetch(cacheBuster, { method: 'GET' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('nativeFetch timed out (20s)')), 20000)),
                ]);
                if (!response.ok || response.status < 200 || response.status >= 300) {
                    console.warn(`[CPM MainAutoCheck] nativeFetch failed (HTTP ${response.status}), skipped.`);
                    return;
                }
                code = await Promise.race([
                    response.text(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('nativeFetch body read timed out (20s)')), 20000)),
                ]);
                console.log(`[CPM MainAutoCheck] nativeFetch OK (${(code.length / 1024).toFixed(1)}KB)`);
            } catch (/** @type {any} */ nativeErr) {
                console.warn(`[CPM MainAutoCheck] nativeFetch failed: ${nativeErr.message || nativeErr}, trying risuFetch...`);
                try {
                    const result = await Promise.race([
                        Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('risuFetch timed out (20s)')), 20000)),
                    ]);
                    if (!result.data || (result.status && result.status >= 400)) {
                        console.warn(`[CPM MainAutoCheck] risuFetch also failed (status=${result.status}), skipped.`);
                        return;
                    }
                    code = typeof result.data === 'string' ? result.data : String(result.data || '');
                    console.log(`[CPM MainAutoCheck] risuFetch OK (${(code.length / 1024).toFixed(1)}KB)`);
                } catch (/** @type {any} */ risuErr) {
                    console.warn(`[CPM MainAutoCheck] Both fetch methods failed: ${risuErr.message || risuErr}`);
                    return;
                }
            }
            const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
            if (!verMatch) { console.warn('[CPM MainAutoCheck] Remote version tag not found in fetched code, skipped.'); return; }
            const changesMatch = code.match(/\/\/\s*@changes\s+(.+)/i);
            const changes = changesMatch ? changesMatch[1].trim() : '';

            const remoteVersion = (verMatch[1] || '').trim();
            const localVersion = CPM_VERSION;
            const cmp = this.compareVersions(localVersion, remoteVersion);

            try { await Risu.pluginStorage.setItem(this._MAIN_VERSION_CHECK_STORAGE_KEY, String(Date.now())); } catch (_) { /* ignore */ }

            if (cmp > 0) {
                console.log(`[CPM MainAutoCheck] Main update available: ${localVersion}→${remoteVersion}`);
                if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
                    console.log(`[CPM MainAutoCheck] Auto-update disabled by user. Showing notification only.`);
                    try { await this._showMainUpdateAvailableToast(localVersion, remoteVersion, changes); } catch (_) { }
                    return;
                }
                try { await this._rememberPendingMainUpdate(remoteVersion, changes); } catch (_) { }
                const installResult = await this._validateAndInstallMainPlugin(code, remoteVersion, changes);
                if (!installResult.ok) {
                    console.warn(`[CPM MainAutoCheck] Direct install failed (${installResult.error}), trying fresh verified download...`);
                    await this.safeMainPluginUpdate(remoteVersion, changes);
                }
            } else {
                console.log('[CPM MainAutoCheck] Main plugin is up to date.');
            }
        } catch (/** @type {any} */ e) { console.debug('[CPM MainAutoCheck] Silent error:', e.message || e); }
    },

    // ── Download with integrity verification ──

    /**
     * Download main plugin code with verification (retry + Content-Length check).
     * @param {string} [expectedVersion] - Version announced by manifest/API.
     * @returns {Promise<{ok: boolean, code?: string, error?: string}>}
     */
    async _downloadMainPluginCode(expectedVersion) {
        const LOG = '[CPM Download]';
        const MAX_RETRIES = 3;
        const url = this.MAIN_UPDATE_URL;

        // Prefer the update bundle (same source of truth as api/versions).
        try {
            const bundleUrl = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 6);
            console.log(`${LOG} Trying update bundle first: ${bundleUrl}`);
            const bundleResult = await Promise.race([
                Risu.risuFetch(bundleUrl, { method: 'GET', plainFetchForce: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('update bundle fetch timed out (20s)')), 20000)),
            ]);

            if (bundleResult?.data && (!bundleResult.status || bundleResult.status < 400)) {
                const rawBundle = typeof bundleResult.data === 'string' ? JSON.parse(bundleResult.data) : bundleResult.data;
                const parsedBundle = validateSchema(rawBundle, schemas.updateBundle);
                if (!parsedBundle.ok) {
                    throw new Error(`update bundle schema invalid: ${parsedBundle.error}`);
                }

                const bundle = parsedBundle.data;
                const mainEntry = bundle.versions?.['Cupcake Provider Manager'];
                const fileName = mainEntry?.file || 'provider-manager.js';
                const bundledCode = bundle.code?.[fileName];

                if (!mainEntry?.version) {
                    throw new Error('main plugin version missing in update bundle');
                }
                if (expectedVersion && mainEntry.version !== expectedVersion) {
                    throw new Error(`bundle version mismatch: expected ${expectedVersion}, got ${mainEntry.version}`);
                }
                if (!bundledCode || typeof bundledCode !== 'string') {
                    throw new Error(`main plugin code missing in update bundle (${fileName})`);
                }
                if (!mainEntry.sha256) {
                    throw new Error('main plugin bundle entry has no sha256 hash — refusing untrusted update');
                }
                const actualHash = await _computeSHA256(bundledCode);
                if (!actualHash) {
                    throw new Error('SHA-256 computation failed for bundled main plugin code');
                }
                if (actualHash !== mainEntry.sha256) {
                    throw new Error(`bundle sha256 mismatch: expected ${mainEntry.sha256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…`);
                }
                console.log(`${LOG} Bundle integrity OK [sha256:${mainEntry.sha256.substring(0, 12)}…]`);

                console.log(`${LOG} Bundle download OK: ${fileName} v${mainEntry.version} (${(bundledCode.length / 1024).toFixed(1)}KB)`);
                return { ok: true, code: bundledCode };
            }
            throw new Error(`update bundle fetch failed with status ${bundleResult?.status}`);
        } catch (/** @type {any} */ bundleErr) {
            console.warn(`${LOG} Update bundle path failed, falling back to direct JS:`, bundleErr.message || bundleErr);
        }

        // Best-effort: fetch expected SHA-256 from versions manifest for fallback integrity check
        let _fallbackExpectedSha256 = null;
        try {
            const vUrl = this.VERSIONS_URL + '?_t=' + Date.now();
            const vRes = await _withTimeout(
                Risu.risuFetch(vUrl, { method: 'GET', plainFetchForce: true }),
                10000,
                'versions manifest timed out (10s)'
            );
            if (vRes?.data) {
                const vData = typeof vRes.data === 'string' ? JSON.parse(vRes.data) : vRes.data;
                _fallbackExpectedSha256 = vData?.['Cupcake Provider Manager']?.sha256 || null;
                if (_fallbackExpectedSha256) {
                    console.log(`${LOG} Fallback integrity: got expected SHA from versions manifest [${_fallbackExpectedSha256.substring(0, 12)}…]`);
                }
            }
        } catch (_) {
            console.warn(`${LOG} Could not fetch versions manifest for fallback integrity check — proceeding without SHA verification`);
        }

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`${LOG} Attempt ${attempt}/${MAX_RETRIES}: ${url}`);
                const cacheBuster = url + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 6);

                let response;
                try {
                    response = await _withTimeout(
                        Risu.nativeFetch(cacheBuster, { method: 'GET' }),
                        20000,
                        'nativeFetch timed out (20s)'
                    );
                } catch (nativeErr) {
                    console.warn(`${LOG} nativeFetch failed, falling back to risuFetch:`, /** @type {any} */ (nativeErr).message || nativeErr);
                    const risuResult = await _withTimeout(
                        Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true }),
                        20000,
                        'risuFetch fallback timed out (20s)'
                    );
                    if (!risuResult.data || (risuResult.status && risuResult.status >= 400)) {
                        throw new Error(`risuFetch failed with status ${risuResult.status}`);
                    }
                    const code = typeof risuResult.data === 'string' ? risuResult.data : String(risuResult.data || '');
                    // Verify SHA-256 if available
                    if (_fallbackExpectedSha256) {
                        const actualHash = await _computeSHA256(code);
                        if (actualHash && actualHash !== _fallbackExpectedSha256) {
                            throw new Error(`direct download sha256 mismatch: expected ${_fallbackExpectedSha256.substring(0, 12)}…, got ${(actualHash || '?').substring(0, 12)}…`);
                        }
                        if (actualHash) console.log(`${LOG} Fallback integrity OK [sha256:${actualHash.substring(0, 12)}…]`);
                    } else {
                        console.warn(`${LOG} ⚠️ Direct download completed WITHOUT SHA-256 verification (versions manifest unavailable)`);
                    }
                    return { ok: true, code };
                }

                if (!response.ok || response.status < 200 || response.status >= 300) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await _withTimeout(
                    response.text(),
                    20000,
                    'response body read timed out (20s)'
                );

                const contentLength = parseInt(response.headers?.get?.('content-length') || '0', 10);
                if (contentLength > 0) {
                    const actualBytes = new TextEncoder().encode(text).byteLength;
                    if (actualBytes < contentLength) {
                        console.warn(`${LOG} Incomplete download (${attempt}/${MAX_RETRIES}): expected ${contentLength}B, got ${actualBytes}B`);
                        if (attempt < MAX_RETRIES) {
                            await new Promise(r => setTimeout(r, 1000 * attempt));
                            continue;
                        }
                        return { ok: false, error: `다운로드 불완전: ${contentLength}B 중 ${actualBytes}B만 수신됨` };
                    }
                    console.log(`${LOG} Content-Length OK: ${actualBytes}B / ${contentLength}B`);
                }

                // Verify SHA-256 if available
                if (_fallbackExpectedSha256) {
                    const actualHash = await _computeSHA256(text);
                    if (actualHash && actualHash !== _fallbackExpectedSha256) {
                        throw new Error(`direct download sha256 mismatch: expected ${_fallbackExpectedSha256.substring(0, 12)}…, got ${(actualHash || '?').substring(0, 12)}…`);
                    }
                    if (actualHash) console.log(`${LOG} Fallback integrity OK [sha256:${actualHash.substring(0, 12)}…]`);
                } else {
                    console.warn(`${LOG} ⚠️ Direct download completed WITHOUT SHA-256 verification (versions manifest unavailable)`);
                }

                return { ok: true, code: text };
            } catch (/** @type {any} */ e) {
                console.warn(`${LOG} Error (${attempt}/${MAX_RETRIES}):`, e.message || e);
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                } else {
                    return { ok: false, error: `다운로드 실패 (${MAX_RETRIES}회 시도): ${e.message || e}` };
                }
            }
        }
        return { ok: false, error: '다운로드 실패 (알 수 없는 오류)' };
    },

    // ── Validate & install to RisuAI DB ──

    /**
     * Validate already-downloaded code and install to RisuAI DB.
     * @param {string} code - Downloaded plugin code
     * @param {string} remoteVersion - Expected remote version
     * @param {string} [changes] - Change notes
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async _validateAndInstallMainPlugin(code, remoteVersion, changes) {
        const LOG = '[CPM SafeUpdate]';
        const PLUGIN_NAME = 'Cupcake_Provider_Manager';

        if (!code || code.length < 100) {
            return { ok: false, error: '다운로드된 코드가 비어있거나 너무 짧습니다' };
        }

        const lines = code.split('\n');
        let parsedName = '', parsedDisplayName = '', parsedVersion = '', parsedUpdateURL = '', parsedApiVersion = '2.0';
        /** @type {Record<string, 'int'|'string'>} */
        const parsedArgs = {};
        /** @type {Record<string, string|number>} */
        const defaultRealArg = {};
        /** @type {Record<string, Record<string, string>>} */
        const parsedArgMeta = {};
        /** @type {Array<{link: string, hoverText?: string}>} */
        const parsedCustomLink = [];

        for (const line of lines) {
            const nameMatch = line.match(/^\/\/@name\s+(.+)/);
            if (nameMatch) parsedName = nameMatch[1].trim();
            const displayMatch = line.match(/^\/\/@display-name\s+(.+)/);
            if (displayMatch) parsedDisplayName = displayMatch[1].trim();
            const verMatch = line.match(/^\/\/@version\s+(.+)/);
            if (verMatch) parsedVersion = verMatch[1].trim();
            const urlMatch = line.match(/^\/\/@update-url\s+(\S+)/);
            if (urlMatch) parsedUpdateURL = urlMatch[1];
            if (/^\/\/@api\s/.test(line)) {
                const vers = line.replace(/^\/\/@api\s+/, '').trim().split(' ');
                for (const v of vers) { if (['2.0', '2.1', '3.0'].includes(v)) { parsedApiVersion = v; break; } }
            }
            if (/^\/\/@(?:arg|risu-arg)\s/.test(line)) {
                const parts = line.trim().split(' ');
                if (parts.length >= 3) {
                    const key = parts[1];
                    const type = parts[2];
                    if (type === 'int' || type === 'string') {
                        parsedArgs[key] = type;
                        defaultRealArg[key] = type === 'int' ? 0 : '';
                    }
                    if (parts.length > 3) {
                        /** @type {Record<string, string>} */
                        const meta = {};
                        parts.slice(3).join(' ').replace(/\{\{(.+?)(::?(.+?))?\}\}/g, (/** @type {any} */ _, /** @type {string} */ g1, /** @type {any} */ _g2, /** @type {string} */ g3) => {
                            meta[g1] = g3 || '1';
                            return '';
                        });
                        if (Object.keys(meta).length > 0) parsedArgMeta[key] = meta;
                    }
                }
            }
            if (/^\/\/@link\s/.test(line)) {
                const link = line.split(' ')[1];
                if (link && link.startsWith('https')) {
                    const hoverText = line.split(' ').slice(2).join(' ').trim();
                    parsedCustomLink.push({ link, hoverText: hoverText || undefined });
                }
            }
        }

        if (!parsedName) {
            return { ok: false, error: '다운로드된 코드에서 플러그인 이름(@name)을 찾을 수 없습니다' };
        }
        if (parsedName !== PLUGIN_NAME) {
            return { ok: false, error: `이름 불일치: "${parsedName}" ≠ "${PLUGIN_NAME}"` };
        }
        if (!parsedVersion) {
            return { ok: false, error: '다운로드된 코드에서 버전 정보(@version)를 찾을 수 없습니다' };
        }
        if (parsedApiVersion !== '3.0') {
            return { ok: false, error: `API 버전이 3.0이 아닙니다: ${parsedApiVersion}` };
        }

        console.log(`${LOG} Parsed: name=${parsedName} ver=${parsedVersion} api=${parsedApiVersion} args=${Object.keys(parsedArgs).length}`);

        if (remoteVersion && parsedVersion !== remoteVersion) {
            return { ok: false, error: `버전 불일치: 기대 ${remoteVersion}, 실제 ${parsedVersion}` };
        }

        // Runtime guard: production 환경에서 test 서버 URL이 포함된 업데이트 차단
        if (_CPM_ENV === 'production' && parsedUpdateURL) {
            const _TEST_URL_PATTERN = /cupcake-plugin-manager-test\.vercel\.app|test-2-wheat-omega\.vercel\.app/i;
            if (_TEST_URL_PATTERN.test(parsedUpdateURL)) {
                console.warn(`${LOG} BLOCKED: 프로덕션 환경에서 테스트 서버 URL 업데이트 차단: ${parsedUpdateURL}`);
                return { ok: false, error: `프로덕션 환경에서 테스트 서버 URL 업데이트 차단` };
            }
        }

        try {
            const db = await Risu.getDatabase();
            if (!db) {
                return { ok: false, error: 'RisuAI 데이터베이스 접근 실패 (권한 거부)' };
            }
            if (!db.plugins || !Array.isArray(db.plugins)) {
                return { ok: false, error: 'RisuAI 플러그인 목록을 찾을 수 없습니다' };
            }

            const existingIdx = db.plugins.findIndex((/** @type {any} */ p) => p.name === PLUGIN_NAME);
            if (existingIdx === -1) {
                return { ok: false, error: `기존 "${PLUGIN_NAME}" 플러그인을 DB에서 찾을 수 없습니다` };
            }

            const existing = db.plugins[existingIdx];
            const currentInstalledVersion = existing.versionOfPlugin || CPM_VERSION;
            const installDirection = this.compareVersions(currentInstalledVersion, parsedVersion);
            if (installDirection === 0) {
                return { ok: false, error: `이미 같은 버전입니다: ${parsedVersion}` };
            }
            if (installDirection < 0) {
                return { ok: false, error: `다운그레이드 차단: 현재 ${currentInstalledVersion} > 다운로드 ${parsedVersion}` };
            }

            const existingScriptBytes = new TextEncoder().encode(String(existing.script || '')).byteLength;
            const nextScriptBytes = new TextEncoder().encode(String(code || '')).byteLength;
            if (existingScriptBytes >= (300 * 1024) && nextScriptBytes < existingScriptBytes * 0.95) {
                return { ok: false, error: `불완전한 다운로드 의심: 새 코드(${(nextScriptBytes / 1024).toFixed(1)}KB)가 기존(${(existingScriptBytes / 1024).toFixed(1)}KB)의 95% 미만입니다` };
            }

            const oldRealArg = existing.realArg || {};
            /** @type {Record<string, any>} */
            const mergedRealArg = {};
            for (const [key, type] of Object.entries(parsedArgs)) {
                if (key in oldRealArg && existing.arguments && existing.arguments[key] === type) {
                    mergedRealArg[key] = oldRealArg[key];
                } else {
                    mergedRealArg[key] = defaultRealArg[key];
                }
            }

            /** @type {any} */
            const updatedPlugin = {
                name: parsedName,
                displayName: parsedDisplayName || parsedName,
                script: code,
                arguments: parsedArgs,
                realArg: mergedRealArg,
                argMeta: parsedArgMeta,
                version: '3.0',
                customLink: parsedCustomLink,
                versionOfPlugin: parsedVersion,
                updateURL: parsedUpdateURL || existing.updateURL || '',
                enabled: existing.enabled !== false,
            };

            const nextPlugins = db.plugins.slice();
            nextPlugins[existingIdx] = updatedPlugin;
            await Risu.setDatabaseLite({ plugins: nextPlugins });

            try {
                const verifyDb = await Risu.getDatabase();
                const verifyPlugin = verifyDb?.plugins?.find?.((/** @type {any} */ p) => p.name === PLUGIN_NAME);
                console.log(`${LOG} In-memory verify: version=${verifyPlugin?.versionOfPlugin || 'missing'} script=${verifyPlugin?.script ? 'present' : 'missing'}`);
            } catch (/** @type {any} */ verifyErr) {
                console.warn(`${LOG} In-memory verify failed:`, verifyErr.message || verifyErr);
            }

            try {
                await Risu.pluginStorage.setItem('cpm_last_main_update_flush', JSON.stringify({
                    ts: Date.now(),
                    from: currentInstalledVersion,
                    to: parsedVersion,
                }));
                console.log(`${LOG} Autosave flush marker written to pluginStorage.`);
            } catch (/** @type {any} */ flushErr) {
                console.warn(`${LOG} Autosave flush marker write failed:`, flushErr.message || flushErr);
            }

            console.log(`${LOG} Waiting for RisuAI autosave flush before showing success...`);
            await this._waitForMainPluginPersistence();

            console.log(`${LOG} ✓ Successfully applied main plugin update: ${currentInstalledVersion} → ${parsedVersion}`);
            console.log(`${LOG}   Settings preserved: ${Object.keys(mergedRealArg).length} args (${Object.keys(oldRealArg).length} existed, ${Object.keys(parsedArgs).length} in new version)`);

            try { /** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot = true; } catch (_) { }

            await this._clearPendingMainUpdate();
            await this._showMainAutoUpdateResult(currentInstalledVersion, parsedVersion, changes || '', true);

            return { ok: true };
        } catch (/** @type {any} */ e) {
            return { ok: false, error: `DB 저장 실패: ${e.message || e}` };
        }
    },

    /**
     * Wait for RisuAI autosave flush.
     * @returns {Promise<void>}
     */
    async _waitForMainPluginPersistence() {
        await new Promise(resolve => setTimeout(resolve, 3500));
    },

    // ── Safe update orchestrator (dedup) ──

    /**
     * Safely update the main CPM plugin: download → validate → install.
     * @param {string} remoteVersion
     * @param {string} [changes]
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async safeMainPluginUpdate(remoteVersion, changes) {
        if (/** @type {any} */ (window)._cpmMainUpdateCompletedThisBoot) {
            console.log('[CPM SafeUpdate] Main update already completed this session — skipping.');
            try { await this._clearPendingMainUpdate(); } catch (_) { }
            return { ok: true };
        }

        if (this._mainUpdateInFlight) {
            console.log('[CPM SafeUpdate] Main update already in flight — joining existing run.');
            return await this._mainUpdateInFlight;
        }

        this._mainUpdateInFlight = (async () => {
            try {
                await this._rememberPendingMainUpdate(remoteVersion, changes);

                const dl = await this._downloadMainPluginCode(remoteVersion);
                if (!dl.ok) {
                    console.error(`[CPM SafeUpdate] Download failed: ${dl.error}`);
                    if (!this._isRetriableMainUpdateError(dl.error)) {
                        await this._clearPendingMainUpdate();
                    }
                    await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, dl.error);
                    return { ok: false, error: dl.error };
                }
                const result = await this._validateAndInstallMainPlugin(dl.code, remoteVersion, changes);
                if (!result.ok) {
                    console.error(`[CPM SafeUpdate] Install failed: ${result.error}`);
                    if (!this._isRetriableMainUpdateError(result.error)) {
                        await this._clearPendingMainUpdate();
                    }
                    const isSameVersionNoop = result.error && result.error.includes('이미 같은 버전');
                    if (!isSameVersionNoop) {
                        await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, result.error);
                    }
                }
                return result;
            } catch (/** @type {any} */ unexpectedErr) {
                console.error(`[CPM SafeUpdate] Unexpected error:`, unexpectedErr);
                return { ok: false, error: `예기치 않은 오류: ${unexpectedErr.message || unexpectedErr}` };
            }
        })();

        try {
            return await this._mainUpdateInFlight;
        } finally {
            this._mainUpdateInFlight = null;
        }
    },

    // ── Single-Bundle Update System ──
    UPDATE_BUNDLE_URL: _UPDATE_BUNDLE_URL,

    async checkAllUpdates() {
        try {
            const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 8);
            console.log(`[CPM Update] Fetching update bundle via risuFetch(plainFetchForce): ${cacheBuster}`);

            const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

            if (!result.data || (result.status && result.status >= 400)) {
                console.error(`[CPM Update] Failed to fetch update bundle: ${result.status}`);
                return [];
            }

            const raw = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
            const bundleResult = validateSchema(raw, schemas.updateBundle);
            if (!bundleResult.ok) {
                console.error(`[CPM Update] Bundle schema validation failed: ${bundleResult.error}`);
                return [];
            }
            const bundle = bundleResult.data;
            const manifest = bundle.versions || {};
            const codeBundle = bundle.code || {};
            console.log(`[CPM Update] Bundle loaded: ${Object.keys(manifest).length} versions, ${Object.keys(codeBundle).length} code files`);

            const results = [];
            for (const p of this.plugins) {
                if (!p.updateUrl || !p.name) continue;
                const remote = manifest[p.name];
                if (!remote || !remote.version) {
                    console.warn(`[CPM Update] ${p.name} not found in manifest, skipping.`);
                    continue;
                }
                const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                console.log(`[CPM Update] ${p.name}: local=${p.version} remote=${remote.version} cmp=${cmp}`);
                if (cmp > 0) {
                    const code = (remote.file && codeBundle[remote.file]) ? codeBundle[remote.file] : null;
                    if (code) {
                        console.log(`[CPM Update] Code ready for ${p.name} (${(code.length / 1024).toFixed(1)}KB)`);
                        if (!remote.sha256) {
                            console.error(`[CPM Update] ⚠️ REJECTED ${p.name}: bundle entry has no sha256 hash — refusing untrusted update`);
                            continue;
                        }
                        const actualHash = await _computeSHA256(code);
                        if (!actualHash) {
                            console.error(`[CPM Update] ⚠️ REJECTED ${p.name}: SHA-256 computation failed (Web Crypto unavailable) — cannot verify integrity`);
                            continue;
                        }
                        if (actualHash !== remote.sha256) {
                            console.error(`[CPM Update] ⚠️ INTEGRITY MISMATCH for ${p.name}: expected ${remote.sha256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}… — skipping`);
                            continue;
                        }
                        console.log(`[CPM Update] ✓ Integrity OK for ${p.name} [sha256:${actualHash.substring(0, 12)}…]`);
                    }
                    else console.warn(`[CPM Update] ${p.name} (${remote.file}) code not found in bundle`);
                    results.push({ plugin: p, remoteVersion: remote.version, localVersion: p.version || '0.0.0', remoteFile: remote.file, code, expectedSHA256: remote.sha256 });
                }
            }
            return results;
        } catch (e) {
            console.error(`[CPM Update] Failed to check updates:`, e);
            return [];
        }
    },

    /**
     * @param {string} pluginId
     * @param {string} prefetchedCode
     * @param {string} expectedSHA256
     */
    async applyUpdate(pluginId, prefetchedCode, expectedSHA256) {
        const p = /** @type {any[]} */ (this.plugins).find((/** @type {any} */ x) => x.id === pluginId);
        if (!p) return false;
        if (!prefetchedCode) {
            console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
            return false;
        }
        try {
            if (!expectedSHA256) {
                console.error(`[CPM Update] BLOCKED: No SHA-256 hash provided for ${p.name}. Refusing to apply unverified code.`);
                return false;
            }
            const actualHash = await _computeSHA256(prefetchedCode);
            if (!actualHash) {
                console.error(`[CPM Update] BLOCKED: SHA-256 computation failed for ${p.name} (Web Crypto unavailable).`);
                return false;
            }
            if (actualHash !== expectedSHA256) {
                console.error(`[CPM Update] BLOCKED: Integrity mismatch for ${p.name}. Expected sha256:${expectedSHA256.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…`);
                return false;
            }
            console.log(`[CPM Update] ✓ Apply-time integrity OK for ${p.name}`);
            console.log(`[CPM Update] Applying update for ${p.name} (${(prefetchedCode.length / 1024).toFixed(1)}KB)`);
            const meta = this.extractMetadata(prefetchedCode);

            // Runtime guard: production 환경에서 test URL이 포함된 서브 플러그인 업데이트 차단
            if (_CPM_ENV === 'production' && meta.updateUrl) {
                const _TEST_URL_PATTERN = /cupcake-plugin-manager-test2?\b|test-2-wheat-omega\.vercel\.app/i;
                if (_TEST_URL_PATTERN.test(meta.updateUrl)) {
                    console.error(`[CPM Update] BLOCKED: 프로덕션에서 테스트 레포 URL 감지: ${meta.updateUrl}`);
                    return false;
                }
            }

            if (meta.name && p.name && meta.name !== p.name) {
                console.error(`[CPM Update] BLOCKED: Tried to apply "${meta.name}" code to plugin "${p.name}". Names don't match.`);
                return false;
            }
            p.code = prefetchedCode;
            p.name = meta.name || p.name;
            p.version = meta.version;
            p.description = meta.description;
            p.icon = meta.icon;
            p.updateUrl = meta.updateUrl || p.updateUrl;
            await this.saveRegistry();
            console.log(`[CPM Update] Successfully applied update for ${p.name} → v${meta.version}`);
            return true;
        } catch (e) {
            console.error(`[CPM Update] Failed to apply update for ${p.name}:`, e);
            return false;
        }
    },

    // ── Auto-Bootstrap: auto-install bundled sub-plugins not yet in registry ──

    /**
     * Fetch the update bundle and install any sub-plugins that are in the bundle
     * but not yet in the user's installed plugins list.
     * Called once during init, after loadRegistry() and before executeEnabled().
     * @returns {Promise<string[]>} names of newly installed plugins
     */
    async autoBootstrapBundledPlugins() {
        const LOG = '[CPM Bootstrap]';
        try {
            // ── Early exit: auto-update OFF → skip bundle fetch & auto-install ──
            // Skips 50KB+ bundle download + JSON parsing + SHA-256 computation.
            // Existing sub-plugins in registry are unaffected (executeEnabled runs normally).
            if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
                console.log(`${LOG} Auto-update disabled. Skipping bundle fetch and auto-bootstrap.`);
                return [];
            }

            const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).substr(2, 8);
            const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

            if (!result.data || (result.status && result.status >= 400)) {
                console.warn(`${LOG} Bundle fetch failed (${result.status}), skipping auto-bootstrap.`);
                return [];
            }

            const raw = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
            const bundleResult = validateSchema(raw, schemas.updateBundle);
            if (!bundleResult.ok) {
                console.warn(`${LOG} Bundle schema validation failed, skipping.`);
                return [];
            }

            const bundle = bundleResult.data;
            const manifest = bundle.versions || {};
            const codeBundle = bundle.code || {};
            const installed = [];

            for (const [name, info] of Object.entries(manifest)) {
                // Skip if it's the main plugin
                if (this.BLOCKED_NAMES && this.BLOCKED_NAMES.some(
                    (/** @type {string} */ n) => n.toLowerCase() === name.toLowerCase()
                )) continue;

                // Skip if already installed
                const existing = this.plugins.find((/** @type {any} */ p) => p.name === name);
                if (existing) continue;

                // Must have code in bundle
                const file = /** @type {any} */ (info).file;
                const code = file ? codeBundle[file] : null;
                if (!code) {
                    console.warn(`${LOG} ${name}: code not found in bundle (file=${file}), skipping.`);
                    continue;
                }

                // SHA-256 integrity check
                const expectedHash = /** @type {any} */ (info).sha256;
                if (expectedHash) {
                    const actualHash = await _computeSHA256(code);
                    if (actualHash && actualHash !== expectedHash) {
                        console.error(`${LOG} ⚠️ REJECTED ${name}: integrity mismatch (expected ${expectedHash.substring(0, 12)}…, got ${actualHash.substring(0, 12)}…)`);
                        continue;
                    }
                }

                // Install
                try {
                    await this.install(code);
                    console.log(`${LOG} ✓ Auto-installed: ${name} v${/** @type {any} */ (info).version}`);
                    installed.push(name);
                } catch (/** @type {any} */ e) {
                    console.warn(`${LOG} Failed to auto-install ${name}: ${e.message}`);
                }
            }

            if (installed.length > 0) {
                console.log(`${LOG} Auto-bootstrap complete: ${installed.length} new plugin(s) installed.`);
            }
            return installed;
        } catch (/** @type {any} */ e) {
            console.warn(`${LOG} Auto-bootstrap failed: ${e.message}`);
            return [];
        }
    },
};
