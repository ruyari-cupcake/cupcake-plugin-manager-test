// @ts-check
/**
 * sub-plugin-manager.js — Dynamic sub-plugin lifecycle management.
 * Handles install, remove, toggle, execute, hot-reload, and auto-update.
 */
import {
    Risu, CPM_VERSION, state,
    customFetchers, registeredProviderTabs,
    pendingDynamicFetchers, _pluginRegistrations,
    _pluginCleanupHooks, isDynamicFetchEnabled,
} from './shared-state.js';
import { _executeViaScriptTag } from './csp-exec.js';
import { getManagedSettingKeys } from './settings-backup.js';
import { validateSchema, parseAndValidate, schemas } from './schema.js';
import { escHtml } from './helpers.js';

/**
 * Compute SHA-256 hex digest of a string using Web Crypto API.
 * Falls back gracefully if crypto.subtle is unavailable.
 * @param {string} text
 * @returns {Promise<string>} lowercase hex string, or empty string on failure
 */
async function _computeSHA256(text) {
    try {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return '';
    }
}

// Exported for testing
export { _computeSHA256 };

// DI: _exposeScopeToWindow is injected by init.js to avoid circular dependency.
let _exposeScopeToWindow = () => {};
export function setExposeScopeFunction(fn) { _exposeScopeToWindow = fn; }

export const SubPluginManager = {
    STORAGE_KEY: 'cpm_installed_subplugins',
    plugins: [],

    async loadRegistry() {
        try {
            const data = await Risu.pluginStorage.getItem(this.STORAGE_KEY);
            if (!data) { this.plugins = []; return; }
            const result = parseAndValidate(data, schemas.subPluginRegistry);
            if (!result.ok) {
                console.warn('[CPM Loader] Registry schema validation failed:', result.error);
                this.plugins = result.fallback;
            } else {
                this.plugins = result.data;
            }
        } catch (e) {
            console.error('[CPM Loader] Failed to load registry', e);
            this.plugins = [];
        }
    },

    async saveRegistry() {
        await Risu.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.plugins));
    },

    extractMetadata(code) {
        const meta = { name: 'Unnamed Sub-Plugin', version: '', description: '', icon: '📦', updateUrl: '' };
        const nameMatch = code.match(/\/\/\s*@(?:name|display-name)\s+(.+)/i);
        if (nameMatch) meta.name = nameMatch[1].trim();
        const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
        if (verMatch) meta.version = verMatch[1].trim();
        const descMatch = code.match(/\/\/\s*@description\s+(.+)/i);
        if (descMatch) meta.description = descMatch[1].trim();
        const iconMatch = code.match(/\/\/\s*@icon\s+(.+)/i);
        if (iconMatch) meta.icon = iconMatch[1].trim();
        const updateMatch = code.match(/\/\/\s*@update-url\s+(.+)/i);
        if (updateMatch) meta.updateUrl = updateMatch[1].trim();
        return meta;
    },

    async install(code) {
        const meta = this.extractMetadata(code);
        const existing = this.plugins.find(p => p.name === meta.name);
        if (existing) {
            existing.code = code;
            existing.version = meta.version;
            existing.description = meta.description;
            existing.icon = meta.icon;
            existing.updateUrl = meta.updateUrl;
            await this.saveRegistry();
            return meta.name;
        }
        const id = 'subplugin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.plugins.push({ id, code, enabled: true, ...meta });
        await this.saveRegistry();
        return meta.name;
    },

    async remove(id) {
        this.plugins = this.plugins.filter(p => p.id !== id);
        await this.saveRegistry();
    },

    async toggle(id, enabled) {
        const p = this.plugins.find(p => p.id === id);
        if (p) {
            p.enabled = enabled;
            await this.saveRegistry();
        }
    },

    async executeEnabled() {
        _exposeScopeToWindow();
        /** @type {any} */ (window).CupcakePM_SubPlugins = /** @type {any} */ (window).CupcakePM_SubPlugins || [];
        for (const p of this.plugins) {
            if (p.enabled) {
                try {
                    state._currentExecutingPluginId = p.id;
                    if (!_pluginRegistrations[p.id]) _pluginRegistrations[p.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                    await _executeViaScriptTag(p.code, p.name);
                    console.log(`[CPM Loader] Loaded Sub-Plugin: ${p.name}`);
                } catch (e) {
                    console.error(`[CPM Loader] Failed to load ${p.name}`, e);
                } finally {
                    state._currentExecutingPluginId = null;
                }
            }
        }
    },

    compareVersions(a, b) {
        if (!a || !b) return 0;
        const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number);
        const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (nb > na) return 1;
            if (na > nb) return -1;
        }
        return 0;
    },

    // ── Lightweight Silent Version Check ──
    VERSIONS_URL: 'https://cupcake-plugin-manager-test.vercel.app/api/versions',
    MAIN_UPDATE_URL: 'https://cupcake-plugin-manager-test.vercel.app/provider-manager.js',
    _VERSION_CHECK_COOLDOWN: 600000,
    _VERSION_CHECK_STORAGE_KEY: 'cpm_last_version_check',
    _MAIN_VERSION_CHECK_STORAGE_KEY: 'cpm_last_main_version_check',
    _pendingUpdateNames: [],

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
                // Mark that manifest provided main plugin version info — prevents redundant JS fallback
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
                    try { await this.safeMainPluginUpdate(mainUpdateInfo.remoteVersion, mainUpdateInfo.changes); } catch (_) { }
                }, delay);
            }
        } catch (e) {
            console.debug(`[CPM AutoCheck] Silent error:`, e.message || e);
        }
    },

    async showUpdateToast(updates) {
        try {
            const doc = await Risu.getRootDocument();
            if (!doc) { console.debug('[CPM Toast] getRootDocument returned null'); return; }

            const existing = await doc.querySelector('[x-cpm-toast]');
            if (existing) { try { await existing.remove(); } catch (_) { } }

            const count = updates.length;
            let detailLines = '';
            const showMax = Math.min(count, 3);
            for (let i = 0; i < showMax; i++) {
                const u = updates[i];
                const changeText = u.changes ? ` — ${escHtml(u.changes)}` : '';
                detailLines += `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${escHtml(u.icon)} ${escHtml(u.name)} <span style="color:#6ee7b7">${escHtml(u.localVersion)} → ${escHtml(u.remoteVersion)}</span>${changeText}</div>`;
            }
            if (count > showMax) {
                detailLines += `<div style="font-size:11px;color:#6b7280;margin-top:2px">...외 ${count - showMax}개</div>`;
            }

            const toast = await doc.createElement('div');
            await toast.setAttribute('x-cpm-toast', '1');
            const styles = {
                position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
                background: '#1f2937', border: '1px solid #374151', borderLeft: '3px solid #3b82f6',
                borderRadius: '10px', padding: '12px 14px', maxWidth: '380px', minWidth: '280px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                pointerEvents: 'auto', opacity: '0', transform: 'translateY(12px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
            };
            for (const [k, v] of Object.entries(styles)) await toast.setStyle(k, v);

            await toast.setInnerHTML(`
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:#e5e7eb">서브 플러그인 업데이트 ${count}개 있음</div>
                        ${detailLines}
                        <div style="font-size:11px;color:#6b7280;margin-top:4px">설정 → 서브 플러그인 탭에서 업데이트하세요</div>
                    </div>
                </div>
            `);

            const body = await doc.querySelector('body');
            if (body) { await body.appendChild(toast); console.log('[CPM Toast] Toast appended to root body'); }
            else { console.debug('[CPM Toast] body not found'); return; }

            setTimeout(async () => { try { await toast.setStyle('opacity', '1'); await toast.setStyle('transform', 'translateY(0)'); } catch (_) { } }, 50);
            setTimeout(async () => {
                try { await toast.setStyle('opacity', '0'); await toast.setStyle('transform', 'translateY(12px)');
                    setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 350);
                } catch (_) { }
            }, 8000);
        } catch (e) { console.debug('[CPM Toast] Failed to show toast:', e.message); }
    },

    async checkMainPluginVersionQuiet() {
        try {
            if (/** @type {any} */ (window)._cpmMainVersionFromManifest) {
                console.log('[CPM MainAutoCheck] Already checked via manifest, skipping JS fallback.');
                return;
            }
            if (/** @type {any} */ (window)._cpmMainVersionChecked) return;
            /** @type {any} */ (window)._cpmMainVersionChecked = true;

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
            console.log('[CPM MainAutoCheck] Fallback: fetching remote provider-manager.js...');

            let code;
            try {
                // Prefer nativeFetch (standard Response) — risuFetch may hang in iframe sandbox for large files
                const response = await Promise.race([
                    Risu.nativeFetch(cacheBuster, { method: 'GET' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('nativeFetch timed out (20s)')), 20000)),
                ]);
                if (!response.ok || response.status < 200 || response.status >= 300) {
                    console.warn(`[CPM MainAutoCheck] nativeFetch failed (HTTP ${response.status}), skipped.`);
                    return;
                }
                code = await response.text();
                console.log(`[CPM MainAutoCheck] nativeFetch OK (${(code.length / 1024).toFixed(1)}KB)`);
            } catch (nativeErr) {
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
                } catch (risuErr) {
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
                // Code already downloaded from version check — validate and install directly (no double download)
                const installResult = await this._validateAndInstallMainPlugin(code, remoteVersion, changes);
                if (!installResult.ok) {
                    console.warn(`[CPM MainAutoCheck] Direct install failed (${installResult.error}), trying fresh verified download...`);
                    await this.safeMainPluginUpdate(remoteVersion, changes);
                }
            } else {
                console.log('[CPM MainAutoCheck] Main plugin is up to date.');
            }
        } catch (e) { console.debug('[CPM MainAutoCheck] Silent error:', e.message || e); }
    },

    /**
     * Download main plugin code with verification (retry + Content-Length check).
     * Used when we don't already have the code (e.g., manifest-only path).
     *
     * @returns {Promise<{ok: boolean, code?: string, error?: string}>}
     */
    async _downloadMainPluginCode() {
        const LOG = '[CPM Download]';
        const MAX_RETRIES = 3;
        const url = this.MAIN_UPDATE_URL;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`${LOG} Attempt ${attempt}/${MAX_RETRIES}: ${url}`);
                const cacheBuster = url + '?_t=' + Date.now() + '_r=' + Math.random().toString(36).substr(2, 6);

                // Prefer nativeFetch (standard Response) for Content-Length access
                let response;
                try {
                    response = await Risu.nativeFetch(cacheBuster, { method: 'GET' });
                } catch (nativeErr) {
                    console.warn(`${LOG} nativeFetch failed, falling back to risuFetch:`, nativeErr.message || nativeErr);
                    const result = await Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });
                    if (!result.data || (result.status && result.status >= 400)) {
                        throw new Error(`risuFetch failed with status ${result.status}`);
                    }
                    const code = typeof result.data === 'string' ? result.data : String(result.data || '');
                    // risuFetch doesn't give us Content-Length, skip CL check
                    return { ok: true, code };
                }

                if (!response.ok || response.status < 200 || response.status >= 300) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();

                // Content-Length integrity check
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

                return { ok: true, code: text };
            } catch (e) {
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

    /**
     * Validate already-downloaded code and install to RisuAI DB.
     * Handles: header parsing, name/version/api check, settings preservation, DB write.
     *
     * @param {string} code - Downloaded plugin code
     * @param {string} remoteVersion - Expected remote version (for logging)
     * @param {string} [changes] - Change notes (for notification)
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async _validateAndInstallMainPlugin(code, remoteVersion, changes) {
        const LOG = '[CPM SafeUpdate]';
        const PLUGIN_NAME = 'Cupcake_Provider_Manager';

        if (!code || code.length < 100) {
            return { ok: false, error: '다운로드된 코드가 비어있거나 너무 짧습니다' };
        }

        // ── Step 1: Structural validation — parse plugin headers ──
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
            if (line.startsWith('//@name')) parsedName = line.slice(7).trim();
            if (line.startsWith('//@display-name')) parsedDisplayName = line.slice('//@display-name'.length + 1).trim();
            if (line.startsWith('//@version')) parsedVersion = line.split(' ').slice(1).join(' ').trim();
            if (line.startsWith('//@update-url')) parsedUpdateURL = line.split(' ')[1] || '';
            if (line.startsWith('//@api')) {
                const vers = line.slice(6).trim().split(' ');
                for (const v of vers) { if (['2.0', '2.1', '3.0'].includes(v)) { parsedApiVersion = v; break; } }
            }
            if (line.startsWith('//@arg') || line.startsWith('//@risu-arg')) {
                const parts = line.trim().split(' ');
                if (parts.length >= 3) {
                    const key = parts[1];
                    const type = parts[2];
                    if (type === 'int' || type === 'string') {
                        parsedArgs[key] = type;
                        defaultRealArg[key] = type === 'int' ? 0 : '';
                    }
                    if (parts.length > 3) {
                        const meta = {};
                        parts.slice(3).join(' ').replace(/\{\{(.+?)(::?(.+?))?\}\}/g, (_, g1, _g2, g3) => {
                            meta[g1] = g3 || '1';
                            return '';
                        });
                        if (Object.keys(meta).length > 0) parsedArgMeta[key] = meta;
                    }
                }
            }
            if (line.startsWith('//@link')) {
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

        // ── Step 2: Name identity check ──
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

        // ── Step 3: Write to RisuAI DB — preserve existing settings ──
        try {
            const db = await Risu.getDatabase();
            if (!db) {
                return { ok: false, error: 'RisuAI 데이터베이스 접근 실패 (권한 거부)' };
            }
            if (!db.plugins || !Array.isArray(db.plugins)) {
                return { ok: false, error: 'RisuAI 플러그인 목록을 찾을 수 없습니다' };
            }

            const existingIdx = db.plugins.findIndex(p => p.name === PLUGIN_NAME);
            if (existingIdx === -1) {
                return { ok: false, error: `기존 "${PLUGIN_NAME}" 플러그인을 DB에서 찾을 수 없습니다` };
            }

            const existing = db.plugins[existingIdx];
            const oldRealArg = existing.realArg || {};

            // Merge: keep existing values for matching arg types, add defaults for new args
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
                enabled: existing.enabled !== false, // preserve enabled state
            };

            db.plugins[existingIdx] = updatedPlugin;
            await Risu.setDatabaseLite(db);

            console.log(`${LOG} ✓ Successfully applied main plugin update: ${CPM_VERSION} → ${parsedVersion}`);
            console.log(`${LOG}   Settings preserved: ${Object.keys(mergedRealArg).length} args (${Object.keys(oldRealArg).length} existed, ${Object.keys(parsedArgs).length} in new version)`);

            // Show success notification
            await this._showMainAutoUpdateResult(CPM_VERSION, parsedVersion, changes || '', true);

            return { ok: true };
        } catch (e) {
            return { ok: false, error: `DB 저장 실패: ${e.message || e}` };
        }
    },

    /**
     * Safely update the main CPM plugin: download with verification → validate → install to DB.
     * Called automatically when a newer version is detected.
     *
     * @param {string} remoteVersion - Expected remote version (for logging)
     * @param {string} [changes] - Change notes (for notification)
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async safeMainPluginUpdate(remoteVersion, changes) {
        const dl = await this._downloadMainPluginCode();
        if (!dl.ok) {
            console.error(`[CPM SafeUpdate] Download failed: ${dl.error}`);
            await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, dl.error);
            return { ok: false, error: dl.error };
        }
        const result = await this._validateAndInstallMainPlugin(dl.code, remoteVersion, changes);
        if (!result.ok) {
            console.error(`[CPM SafeUpdate] Install failed: ${result.error}`);
            await this._showMainAutoUpdateResult(CPM_VERSION, remoteVersion, changes || '', false, result.error);
        }
        return result;
    },

    /**
     * Show a simple notification toast with the auto-update result.
     * No button — update happens automatically, user just needs to reload on success.
     *
     * @param {string} localVersion
     * @param {string} remoteVersion
     * @param {string} changes
     * @param {boolean} success
     * @param {string} [error]
     */
    async _showMainAutoUpdateResult(localVersion, remoteVersion, changes, success, error) {
        try {
            const doc = await Risu.getRootDocument();
            if (!doc) { console.debug('[CPM MainToast] getRootDocument returned null'); return; }

            const existing = await doc.querySelector('[x-cpm-main-toast]');
            if (existing) { try { await existing.remove(); } catch (_) { } }

            const subToastEl = await doc.querySelector('[x-cpm-toast]');
            const bottomPos = subToastEl ? '110px' : '20px';

            const toast = await doc.createElement('div');
            await toast.setAttribute('x-cpm-main-toast', '1');
            const borderColor = success ? '#6ee7b7' : '#f87171';
            const styles = {
                position: 'fixed', bottom: bottomPos, right: '20px', zIndex: '99999',
                background: '#1f2937', border: '1px solid #374151', borderLeft: `3px solid ${borderColor}`,
                borderRadius: '10px', padding: '12px 14px', maxWidth: '380px', minWidth: '280px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                pointerEvents: 'auto', opacity: '0', transform: 'translateY(12px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
            };
            for (const [k, v] of Object.entries(styles)) await toast.setStyle(k, v);

            const changesHtml = changes ? ` — ${escHtml(changes)}` : '';
            let html;
            if (success) {
                html = `
                    <div style="display:flex;align-items:flex-start;gap:10px">
                        <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:600;color:#6ee7b7">✓ 메인 플러그인 자동 업데이트 완료</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Cupcake PM <span style="color:#6ee7b7">${escHtml(localVersion)} → ${escHtml(remoteVersion)}</span>${changesHtml}</div>
                            <div style="font-size:11px;color:#fcd34d;margin-top:4px;font-weight:500">⚡ 페이지를 새로고침하면 적용됩니다</div>
                        </div>
                    </div>`;
            } else {
                html = `
                    <div style="display:flex;align-items:flex-start;gap:10px">
                        <div style="font-size:20px;line-height:1;flex-shrink:0">🧁</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:600;color:#f87171">⚠️ 자동 업데이트 실패</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Cupcake PM ${escHtml(localVersion)} → ${escHtml(remoteVersion)}</div>
                            <div style="font-size:10px;color:#f87171;margin-top:2px">${escHtml(error || '알 수 없는 오류')}</div>
                            <div style="font-size:10px;color:#6b7280;margin-top:4px">리스 설정 → 플러그인 탭 → + 버튼으로 수동 업데이트하세요</div>
                        </div>
                    </div>`;
            }
            await toast.setInnerHTML(html);

            const body = await doc.querySelector('body');
            if (!body) { console.debug('[CPM MainToast] body not found'); return; }
            await body.appendChild(toast);

            setTimeout(async () => { try { await toast.setStyle('opacity', '1'); await toast.setStyle('transform', 'translateY(0)'); } catch (_) { } }, 50);
            // Auto-dismiss after 10s (success) or 15s (failure — user needs time to read error)
            const dismissDelay = success ? 10000 : 15000;
            setTimeout(async () => {
                try { await toast.setStyle('opacity', '0'); await toast.setStyle('transform', 'translateY(12px)');
                    setTimeout(async () => { try { await toast.remove(); } catch (_) { } }, 350);
                } catch (_) { }
            }, dismissDelay);
        } catch (e) { console.debug('[CPM MainToast] Failed to show toast:', e.message || e); }
    },

    // ── Single-Bundle Update System ──
    UPDATE_BUNDLE_URL: 'https://cupcake-plugin-manager-test.vercel.app/api/update-bundle',

    async checkAllUpdates() {
        try {
            const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '_r=' + Math.random().toString(36).substr(2, 8);
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
                        // Integrity check: SHA-256 is MANDATORY for bundle updates.
                        // generate-bundle.cjs always embeds hashes; missing hash = untrusted source.
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

    async applyUpdate(pluginId, prefetchedCode, expectedSHA256) {
        const p = this.plugins.find(x => x.id === pluginId);
        if (!p) return false;
        if (!prefetchedCode) {
            console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
            return false;
        }
        try {
            // Integrity verification at apply-time (defense-in-depth)
            // SHA-256 is mandatory — reject if missing or mismatched.
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

    // ── Hot-Reload Infrastructure ──

    unloadPlugin(pluginId) {
        const reg = _pluginRegistrations[pluginId];
        if (!reg) return;

        const hooks = _pluginCleanupHooks[pluginId];
        if (hooks && Array.isArray(hooks)) {
            for (const hook of hooks) {
                try {
                    const result = hook();
                    if (result && typeof result.then === 'function') {
                        result.catch(e => console.warn(`[CPM Loader] Async cleanup hook error for ${pluginId}:`, e.message));
                    }
                } catch (e) { console.warn(`[CPM Loader] Cleanup hook error for ${pluginId}:`, e.message); }
            }
            delete _pluginCleanupHooks[pluginId];
        }

        for (const key of Object.keys(window)) {
            if (key.startsWith('_cpm') && key.endsWith('Cleanup') && typeof window[key] === 'function') {
                const providerNames = reg.providerNames.map(n => n.toLowerCase());
                const keyLower = key.toLowerCase();
                const isRelated = providerNames.some(name => keyLower.includes(name.replace(/\s+/g, '').toLowerCase()));
                if (isRelated) {
                    try {
                        console.log(`[CPM Loader] Calling window.${key}() for plugin ${pluginId}`);
                        const result = window[key]();
                        if (result && typeof result.then === 'function') {
                            result.catch(e => console.warn(`[CPM Loader] window.${key}() error:`, e.message));
                        }
                    } catch (e) { console.warn(`[CPM Loader] window.${key}() error:`, e.message); }
                }
            }
        }

        for (const name of reg.providerNames) {
            delete customFetchers[name];
            state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
        }
        for (const tab of reg.tabObjects) {
            const idx = registeredProviderTabs.indexOf(tab);
            if (idx !== -1) registeredProviderTabs.splice(idx, 1);
        }
        for (const entry of reg.fetcherEntries) {
            const idx = pendingDynamicFetchers.findIndex(f => f.name === entry.name);
            if (idx !== -1) pendingDynamicFetchers.splice(idx, 1);
        }
        _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
        console.log(`[CPM Loader] Unloaded registrations for plugin ${pluginId}`);
    },

    async executeOne(plugin) {
        if (!plugin || !plugin.enabled) return;
        _exposeScopeToWindow();
        try {
            state._currentExecutingPluginId = plugin.id;
            if (!_pluginRegistrations[plugin.id]) _pluginRegistrations[plugin.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            await _executeViaScriptTag(plugin.code, plugin.name);
            console.log(`[CPM Loader] Hot-loaded Sub-Plugin: ${plugin.name}`);
        } catch (e) {
            console.error(`[CPM Loader] Failed to hot-load ${plugin.name}`, e);
        } finally {
            state._currentExecutingPluginId = null;
        }
    },

    async hotReload(pluginId) {
        const plugin = this.plugins.find(p => p.id === pluginId);
        if (!plugin) return false;

        this.unloadPlugin(pluginId);

        if (plugin.enabled) {
            await this.executeOne(plugin);

            const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
            for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
                if (newProviderNames.includes(name)) {
                    try {
                        const enabled = await isDynamicFetchEnabled(name);
                        if (!enabled) { console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`); continue; }
                        console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                        const dynamicModels = await fetchDynamicModels();
                        if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                            state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                            for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                            console.log(`[CupcakePM] ✓ Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                        }
                    } catch (e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
                }
            }
        }
        console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
        return true;
    },

    async hotReloadAll() {
        for (const p of this.plugins) this.unloadPlugin(p.id);
        await this.executeEnabled();
        for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) continue;
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    state.ALL_DEFINED_MODELS = state.ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    for (const m of dynamicModels) state.ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (e) { console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e); }
        }
        console.log('[CPM Loader] Hot-reload all complete.');
    },

    // ── Purge All CPM Data ──
    // Storage keys used by CPM in pluginStorage
    _PLUGIN_STORAGE_KEYS: [
        'cpm_installed_subplugins',
        'cpm_settings_backup',
        'cpm_last_version_check',
        'cpm_last_main_version_check',
        'cpm_last_boot_status',
    ],

    /**
     * Completely purge ALL data stored by Cupcake Provider Manager.
     * This includes: pluginStorage items, all @arg setting keys,
     * sub-plugin registry, settings backup, and version check timestamps.
     *
     * WARNING: This is irreversible. Caller must confirm with the user first.
     * @returns {Promise<{pluginStorageCleared: number, argsCleared: number}>}
     */
    async purgeAllCpmData() {
        let pluginStorageCleared = 0;
        let argsCleared = 0;

        // 1. Clear all known pluginStorage keys
        for (const key of this._PLUGIN_STORAGE_KEYS) {
            try {
                await Risu.pluginStorage.removeItem(key);
                pluginStorageCleared++;
            } catch (e) {
                console.warn(`[CPM Purge] Failed to remove pluginStorage key '${key}':`, e.message || e);
            }
        }

        // 2. Also try to find and remove any sub-plugin specific pluginStorage keys
        try {
            const allKeys = await Risu.pluginStorage.keys();
            for (const key of allKeys) {
                if (key.startsWith('cpm_') || key.startsWith('cpm-')) {
                    try {
                        await Risu.pluginStorage.removeItem(key);
                        pluginStorageCleared++;
                    } catch (_) { /* ignore */ }
                }
            }
        } catch (_) {
            // pluginStorage.keys() may not be available in all environments
        }

        // 3. Clear all managed @arg setting keys
        const managedKeys = getManagedSettingKeys();
        for (const key of managedKeys) {
            try {
                Risu.setArgument(key, '');
                argsCleared++;
            } catch (e) {
                console.warn(`[CPM Purge] Failed to clear arg '${key}':`, e.message || e);
            }
        }

        // 4. Clear legacy custom model keys (cpm_c1..cpm_c10)
        const legacyFields = ['url', 'model', 'key', 'name', 'format', 'sysfirst', 'altrole', 'mustuser', 'maxout', 'mergesys', 'decoupled', 'thought', 'reasoning', 'verbosity', 'thinking', 'tok'];
        for (let i = 1; i <= 10; i++) {
            for (const field of legacyFields) {
                try {
                    Risu.setArgument(`cpm_c${i}_${field}`, '');
                    argsCleared++;
                } catch (_) { /* ignore */ }
            }
        }

        // 5. Clear in-memory state
        this.plugins = [];
        state.ALL_DEFINED_MODELS = [];
        state.CUSTOM_MODELS_CACHE = [];
        state.vertexTokenCache = { token: null, expiry: 0 };

        // 6. Clear sensitive window globals (in-memory tokens / session IDs)
        if (typeof window !== 'undefined') {
            const cpmGlobalKeys = Object.keys(window).filter(k => k.startsWith('_cpm') || k === 'CupcakePM' || k === 'CPM_VERSION' || k === 'cpmShortcutRegistered');
            for (const k of cpmGlobalKeys) {
                try { delete /** @type {any} */ (window)[k]; } catch (_) { /* ignore */ }
            }
        }

        console.log(`[CPM Purge] Complete. pluginStorage: ${pluginStorageCleared} keys, args: ${argsCleared} keys cleared.`);
        return { pluginStorageCleared, argsCleared };
    }
};
