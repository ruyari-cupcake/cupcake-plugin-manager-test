/**
 * sub-plugin-lifecycle.test.js — Tests for SubPluginManager real code paths:
 *   - install / remove / toggle / registry persistence
 *   - loadRegistry with schema validation (valid, corrupt, array-of-junk)
 *   - checkAllUpdates with malformed bundle shapes
 *   - compareVersions edge cases
 *   - unloadPlugin cleanup
 *
 * These complement the existing sub-plugin-manager.test.js (metadata extraction)
 * and sub-plugin-integrity.test.js (SHA-256 verification).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──
const { mockPluginStorage, mockRisuFetch } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn() },
    mockRisuFetch: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        risuFetch: (...a) => mockRisuFetch(...a),
        getRootDocument: vi.fn().mockResolvedValue(null),
        addProvider: vi.fn(),
    },
    CPM_VERSION: '1.19.6',
    state: { _currentExecutingPluginId: null, ALL_DEFINED_MODELS: [] },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
    isDynamicFetchEnabled: vi.fn(),
}));

vi.mock('../src/lib/csp-exec.js', () => ({
    _executeViaScriptTag: vi.fn().mockResolvedValue(undefined),
}));

import { SubPluginManager, _computeSHA256 } from '../src/lib/sub-plugin-manager.js';

// ════════════════════════════════════════════════════════════════
// A. Install / Remove / Toggle lifecycle
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — install lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SubPluginManager.plugins = [];
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
    });

    it('install() adds a new plugin and persists to storage', async () => {
        const code = '// @name Alpha\n// @version 1.0.0\nconsole.log("alpha");';
        const name = await SubPluginManager.install(code);

        expect(name).toBe('Alpha');
        expect(SubPluginManager.plugins).toHaveLength(1);
        expect(SubPluginManager.plugins[0].code).toBe(code);
        expect(SubPluginManager.plugins[0].enabled).toBe(true);

        // saveRegistry should have been called
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            SubPluginManager.STORAGE_KEY,
            expect.any(String)
        );
    });

    it('install() updates existing plugin by name', async () => {
        SubPluginManager.plugins = [{
            id: 'sp_1', name: 'Alpha', version: '1.0.0', code: 'old', enabled: true,
            description: '', icon: '📦', updateUrl: '',
        }];

        const codeV2 = '// @name Alpha\n// @version 2.0.0\nconsole.log("alpha v2");';
        const name = await SubPluginManager.install(codeV2);

        expect(name).toBe('Alpha');
        expect(SubPluginManager.plugins).toHaveLength(1); // not duplicated
        expect(SubPluginManager.plugins[0].version).toBe('2.0.0');
        expect(SubPluginManager.plugins[0].code).toBe(codeV2);
        expect(SubPluginManager.plugins[0].id).toBe('sp_1'); // id preserved
    });

    it('remove() deletes a plugin and persists', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_1', name: 'A', code: 'a', enabled: true },
            { id: 'sp_2', name: 'B', code: 'b', enabled: true },
        ];
        await SubPluginManager.remove('sp_1');

        expect(SubPluginManager.plugins).toHaveLength(1);
        expect(SubPluginManager.plugins[0].id).toBe('sp_2');
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
    });

    it('remove() with non-existent id does nothing', async () => {
        SubPluginManager.plugins = [{ id: 'sp_1', name: 'A', code: 'a', enabled: true }];
        await SubPluginManager.remove('sp_nonexistent');
        expect(SubPluginManager.plugins).toHaveLength(1);
    });

    it('toggle() sets enabled state', async () => {
        SubPluginManager.plugins = [{ id: 'sp_1', name: 'A', code: 'a', enabled: true }];
        await SubPluginManager.toggle('sp_1', false);

        expect(SubPluginManager.plugins[0].enabled).toBe(false);
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
    });

    it('toggle() on non-existent id does nothing', async () => {
        SubPluginManager.plugins = [{ id: 'sp_1', name: 'A', code: 'a', enabled: true }];
        await SubPluginManager.toggle('sp_nonexistent', false);
        expect(SubPluginManager.plugins[0].enabled).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════
// B. loadRegistry — schema validation paths
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — loadRegistry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SubPluginManager.plugins = [];
    });

    it('loads valid registry from storage', async () => {
        const stored = JSON.stringify([
            { id: 'sp_1', code: 'console.log(1)', name: 'P1', version: '1.0', enabled: true, description: '', icon: '📦', updateUrl: '' },
        ]);
        mockPluginStorage.getItem.mockResolvedValue(stored);
        await SubPluginManager.loadRegistry();

        expect(SubPluginManager.plugins).toHaveLength(1);
        expect(SubPluginManager.plugins[0].name).toBe('P1');
    });

    it('recovers from corrupted JSON', async () => {
        mockPluginStorage.getItem.mockResolvedValue('{broken json!!!');
        await SubPluginManager.loadRegistry();
        expect(SubPluginManager.plugins).toEqual([]);
    });

    it('recovers when storage returns non-array JSON', async () => {
        mockPluginStorage.getItem.mockResolvedValue('{"not":"an-array"}');
        await SubPluginManager.loadRegistry();
        expect(SubPluginManager.plugins).toEqual([]);
    });

    it('filters entries missing required fields (id, code)', async () => {
        const stored = JSON.stringify([
            { id: 'sp_1', code: 'valid' },
            { name: 'no-id' },
            { id: 'sp_3' },  // missing code
        ]);
        mockPluginStorage.getItem.mockResolvedValue(stored);
        await SubPluginManager.loadRegistry();

        expect(SubPluginManager.plugins).toHaveLength(1);
        expect(SubPluginManager.plugins[0].id).toBe('sp_1');
    });

    it('handles null storage (fresh install)', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        await SubPluginManager.loadRegistry();
        expect(SubPluginManager.plugins).toEqual([]);
    });

    it('handles pluginStorage.getItem throwing', async () => {
        mockPluginStorage.getItem.mockRejectedValue(new Error('storage unavailable'));
        await SubPluginManager.loadRegistry();
        expect(SubPluginManager.plugins).toEqual([]);
    });
});

// ════════════════════════════════════════════════════════════════
// C. checkAllUpdates — malformed bundle handling
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — checkAllUpdates malformed bundles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SubPluginManager.plugins = [{
            id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
            enabled: true, code: 'old', updateUrl: 'https://example.com',
        }];
    });

    it('returns empty array when bundle is a string (not object)', async () => {
        mockRisuFetch.mockResolvedValue({ data: '"just a string"' });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('returns empty array when bundle has no versions key', async () => {
        mockRisuFetch.mockResolvedValue({ data: JSON.stringify({ code: {} }) });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('returns empty array when fetch fails', async () => {
        mockRisuFetch.mockResolvedValue({ data: null, status: 500 });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('returns empty array when risuFetch throws', async () => {
        mockRisuFetch.mockRejectedValue(new Error('network error'));
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toEqual([]);
    });

    it('skips plugin when code is missing from bundle', async () => {
        mockRisuFetch.mockResolvedValue({
            data: JSON.stringify({
                versions: { 'Test Plugin': { version: '2.0.0', file: 'test.js' } },
                code: {}, // no code for test.js
            }),
        });
        const results = await SubPluginManager.checkAllUpdates();
        expect(results).toHaveLength(1);
        expect(results[0].code).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════
// D. compareVersions extended edge cases
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — compareVersions edge cases', () => {
    const cmp = (a, b) => SubPluginManager.compareVersions(a, b);

    it('handles version with v prefix', () => {
        expect(cmp('v1.0.0', 'v1.0.1')).toBe(1);
    });

    it('handles different segment counts', () => {
        expect(cmp('1.0', '1.0.1')).toBe(1);
        expect(cmp('1.0.0.0', '1.0')).toBe(0);
    });

    it('handles large version numbers', () => {
        expect(cmp('1.999.0', '2.0.0')).toBe(1);
    });

    it('handles pre-release tags (ignores non-numeric)', () => {
        // Strips non-numeric chars, so "1.0.0-beta" → "1.0.0"
        expect(cmp('1.0.0-beta', '1.0.0')).toBe(0);
    });
});

// ════════════════════════════════════════════════════════════════
// E. applyUpdate — name mismatch guard
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager — applyUpdate name guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPluginStorage.setItem.mockResolvedValue(undefined);
        SubPluginManager.plugins = [{
            id: 'sp_1', name: 'Alpha', version: '1.0.0',
            enabled: true, code: 'old', updateUrl: 'https://example.com',
        }];
    });

    it('blocks update when code name mismatches plugin name', async () => {
        const code = '// @name Beta\n// @version 2.0.0\nconsole.log("wrong");';
        const hash = await _computeSHA256(code);
        const ok = await SubPluginManager.applyUpdate('sp_1', code, hash);
        expect(ok).toBe(false);
        expect(SubPluginManager.plugins[0].code).toBe('old');
    });

    it('returns false for non-existent plugin id', async () => {
        const ok = await SubPluginManager.applyUpdate('sp_nonexistent', 'code');
        expect(ok).toBe(false);
    });

    it('returns false when no code provided', async () => {
        const ok = await SubPluginManager.applyUpdate('sp_1', null);
        expect(ok).toBe(false);
    });
});
