/**
 * @file auto-bootstrap.test.js — Guard tests: autoBootstrapBundledPlugins is permanently disabled.
 * Verifies that the function is a no-op and never installs sub-plugins automatically.
 * Also verifies that checkVersionsQuiet and checkAllUpdates never install new plugins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    risu: {
        log: vi.fn(),
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        },
        getRootDocument: vi.fn().mockResolvedValue(null),
        getDatabase: vi.fn().mockResolvedValue(null),
    },
    cpmVersion: '1.22.36',
    safeGetBoolArg: vi.fn(async () => false),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: h.cpmVersion,
    safeGetBoolArg: h.safeGetBoolArg,
}));
vi.mock('../src/lib/endpoints.js', () => ({
    VERSIONS_URL: 'https://test.example.com/versions.json',
    MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
    UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
    CPM_ENV: 'test2',
}));

import { autoUpdaterMethods } from '../src/lib/auto-updater.js';

// ── Helpers ──
function makeBundle(extraVersions = {}, extraCode = {}) {
    return {
        versions: {
            'Cupcake Provider Manager': { version: '1.22.36', file: 'provider-manager.js', sha256: 'abc123' },
            'CPM Provider - OpenAI': { version: '1.5.9', file: 'cpm-provider-openai.js', sha256: 'def456' },
            ...extraVersions,
        },
        code: {
            'provider-manager.js': '//main plugin code',
            'cpm-provider-openai.js': `//@name CPM Provider - OpenAI\n//@version 1.5.9\n(()=>{})();`,
            ...extraCode,
        },
    };
}

// ════════════════════════════════════════════════════════════════
// 1. autoBootstrapBundledPlugins is permanently disabled (no-op)
// ════════════════════════════════════════════════════════════════

describe('autoBootstrapBundledPlugins — permanently disabled guard', () => {
    /** @type {any} */
    let mgr;

    beforeEach(() => {
        vi.clearAllMocks();
        mgr = {
            ...autoUpdaterMethods,
            plugins: [],
            install: vi.fn(),
            saveRegistry: vi.fn(async () => {}),
        };
    });

    it('always returns empty array (no-op)', async () => {
        // Even with a valid bundle available, it must not install anything
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js' } },
            { 'cpm-chat-limiter.js': '//@name CPM Component - Chat Limiter\n//@version 0.2.0\nconsole.log("limiter");' }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const installed = await mgr.autoBootstrapBundledPlugins();

        expect(installed).toEqual([]);
        expect(mgr.install).not.toHaveBeenCalled();
    });

    it('does not fetch any remote resources', async () => {
        await mgr.autoBootstrapBundledPlugins();

        expect(h.risu.risuFetch).not.toHaveBeenCalled();
        expect(h.risu.nativeFetch).not.toHaveBeenCalled();
    });

    it('does not modify plugin registry', async () => {
        mgr.plugins = [{ id: 'sp1', name: 'Existing Plugin', version: '1.0.0' }];
        const before = [...mgr.plugins];

        await mgr.autoBootstrapBundledPlugins();

        expect(mgr.plugins).toEqual(before);
        expect(mgr.saveRegistry).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 2. checkVersionsQuiet — only notifies, never installs new plugins
// ════════════════════════════════════════════════════════════════

describe('checkVersionsQuiet — never installs new sub-plugins', () => {
    /** @type {any} */
    let mgr;

    beforeEach(() => {
        vi.clearAllMocks();
        /** @type {any} */ (global).window = { _cpmVersionChecked: false };

        mgr = {
            ...autoUpdaterMethods,
            plugins: [],
            install: vi.fn(),
            saveRegistry: vi.fn(async () => {}),
            compareVersions(a, b) {
                const pa = (a || '0').split('.').map(Number);
                const pb = (b || '0').split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const diff = (pb[i] || 0) - (pa[i] || 0);
                    if (diff !== 0) return diff > 0 ? 1 : -1;
                }
                return 0;
            },
            showUpdateToast: vi.fn(async () => {}),
            _showMainUpdateAvailableToast: vi.fn(async () => {}),
            _showMainAutoUpdateResult: vi.fn(async () => {}),
            _rememberPendingMainUpdate: vi.fn(async () => {}),
            safeMainPluginUpdate: vi.fn(async () => ({ ok: true })),
            _pendingUpdateNames: [],
        };
    });

    afterEach(() => {
        delete /** @type {any} */ (global).window;
    });

    it('does NOT call install() even when manifest has plugins not in registry', async () => {
        // Manifest has plugins, but user hasn't installed them → must NOT auto-install
        const manifest = {
            'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js' },
            'CPM Provider - OpenAI': { version: '1.5.9', file: 'cpm-provider-openai.js' },
        };
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });
        mgr.plugins = []; // user has no plugins installed

        await mgr.checkVersionsQuiet();

        expect(mgr.install).not.toHaveBeenCalled();
        // Should not add any plugins to registry
        expect(mgr.plugins).toHaveLength(0);
    });

    it('only shows toast for updates to ALREADY installed plugins', async () => {
        mgr.plugins = [
            { id: 'sp1', name: 'CPM Provider - OpenAI', version: '1.5.0', updateUrl: 'https://test.com/openai.js' },
        ];
        const manifest = {
            'CPM Provider - OpenAI': { version: '1.5.9', changes: 'bugfix' },
            'CPM Component - Chat Limiter': { version: '0.2.0' }, // NOT installed — must be ignored
        };
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(manifest), status: 200 });

        await mgr.checkVersionsQuiet();

        // Only installed plugin update should appear in toast
        if (mgr.showUpdateToast.mock.calls.length > 0) {
            const updates = mgr.showUpdateToast.mock.calls[0][0];
            const names = updates.map(u => u.name);
            expect(names).toContain('CPM Provider - OpenAI');
            expect(names).not.toContain('CPM Component - Chat Limiter');
        }
        // Must NEVER call install
        expect(mgr.install).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 3. checkAllUpdates — only returns updates for installed plugins
// ════════════════════════════════════════════════════════════════

describe('checkAllUpdates — only installed plugins', () => {
    /** @type {any} */
    let mgr;

    beforeEach(() => {
        vi.clearAllMocks();
        mgr = {
            ...autoUpdaterMethods,
            plugins: [],
            install: vi.fn(),
            saveRegistry: vi.fn(async () => {}),
            compareVersions(a, b) {
                const pa = (a || '0').split('.').map(Number);
                const pb = (b || '0').split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const diff = (pb[i] || 0) - (pa[i] || 0);
                    if (diff !== 0) return diff > 0 ? 1 : -1;
                }
                return 0;
            },
            extractMetadata: vi.fn(),
        };
    });

    it('returns empty when user has no plugins installed', async () => {
        const bundle = makeBundle(
            { 'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js', sha256: 'abc' } },
            { 'cpm-chat-limiter.js': 'console.log("limiter")' }
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });
        mgr.plugins = [];

        const results = await mgr.checkAllUpdates();

        expect(results).toEqual([]);
        expect(mgr.install).not.toHaveBeenCalled();
    });

    it('only returns updates for plugins already in registry', async () => {
        mgr.plugins = [
            { id: 'sp1', name: 'CPM Provider - OpenAI', version: '1.5.0', updateUrl: 'https://test.com/openai.js' },
        ];
        // Bundle has OpenAI (newer) AND Chat Limiter (not installed).
        // Override default code with null so SHA-256 path is skipped → result includes code:null.
        const bundle = makeBundle(
            {
                'CPM Provider - OpenAI': { version: '1.6.0', file: 'cpm-provider-openai.js', sha256: 'abc123' },
                'CPM Component - Chat Limiter': { version: '0.2.0', file: 'cpm-chat-limiter.js', sha256: 'def456' },
            },
            { 'cpm-provider-openai.js': null } // override default code → no SHA check
        );
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const results = await mgr.checkAllUpdates();

        // Only OpenAI (installed, version < remote) should appear, NOT Chat Limiter
        const names = results.map(r => r.plugin.name);
        expect(names).toContain('CPM Provider - OpenAI');
        expect(names).not.toContain('CPM Component - Chat Limiter');
        expect(mgr.install).not.toHaveBeenCalled();
    });

    it('does NOT return plugins that are not in user registry at all', async () => {
        mgr.plugins = []; // empty registry
        const bundle = makeBundle();
        h.risu.risuFetch.mockResolvedValue({ data: JSON.stringify(bundle), status: 200 });

        const results = await mgr.checkAllUpdates();

        expect(results).toEqual([]);
    });
});
