/**
 * Tests for sub-plugin integrity verification (SHA-256).
 * Covers _computeSHA256, checkAllUpdates integrity filtering, and
 * applyUpdate integrity blocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted to avoid TDZ issues) ──
const { mockPluginStorage, mockRisuFetch } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn() },
    mockRisuFetch: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        risuFetch: (...args) => mockRisuFetch(...args),
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
    _executeViaScriptTag: vi.fn(),
}));

import { SubPluginManager, _computeSHA256 } from '../src/lib/sub-plugin-manager.js';

describe('Sub-plugin integrity verification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SubPluginManager.plugins = [];
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockPluginStorage.setItem.mockResolvedValue(undefined);
    });

    // ── _computeSHA256 ──
    describe('_computeSHA256', () => {
        it('computes correct SHA-256 hex digest for known input', async () => {
            // SHA-256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
            const hash = await _computeSHA256('hello');
            expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
        });

        it('returns different hash for different input', async () => {
            const h1 = await _computeSHA256('hello');
            const h2 = await _computeSHA256('world');
            expect(h1).not.toBe(h2);
            expect(h2).toHaveLength(64);
        });

        it('returns empty string if crypto.subtle.digest throws', async () => {
            const origDigest = crypto.subtle.digest.bind(crypto.subtle);
            vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('Not supported'));
            try {
                const hash = await _computeSHA256('test');
                expect(hash).toBe('');
            } finally {
                crypto.subtle.digest = origDigest;
            }
        });
    });

    // ── checkAllUpdates integrity ──
    describe('checkAllUpdates — integrity filtering', () => {
        it('skips plugin when SHA-256 does not match', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';
            const correctHash = await _computeSHA256(pluginCode);
            const wrongHash = 'aaaa' + correctHash.substring(4); // tampered hash

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            mockRisuFetch.mockResolvedValue({
                data: JSON.stringify({
                    versions: { 'Test Plugin': { version: '2.0.0', file: 'test-plugin.js', sha256: wrongHash } },
                    code: { 'test-plugin.js': pluginCode },
                }),
            });

            const results = await SubPluginManager.checkAllUpdates();
            // Plugin should be skipped because integrity check fails
            expect(results).toHaveLength(0);
        });

        it('includes plugin when SHA-256 matches', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';
            const correctHash = await _computeSHA256(pluginCode);

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            mockRisuFetch.mockResolvedValue({
                data: JSON.stringify({
                    versions: { 'Test Plugin': { version: '2.0.0', file: 'test-plugin.js', sha256: correctHash } },
                    code: { 'test-plugin.js': pluginCode },
                }),
            });

            const results = await SubPluginManager.checkAllUpdates();
            expect(results).toHaveLength(1);
            expect(results[0].expectedSHA256).toBe(correctHash);
        });

        it('rejects plugin when manifest has no sha256 field (mandatory enforcement)', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            mockRisuFetch.mockResolvedValue({
                data: JSON.stringify({
                    versions: { 'Test Plugin': { version: '2.0.0', file: 'test-plugin.js' /* no sha256 */ } },
                    code: { 'test-plugin.js': pluginCode },
                }),
            });

            const results = await SubPluginManager.checkAllUpdates();
            // sha256 is mandatory — plugin should be rejected
            expect(results).toHaveLength(0);
        });
    });

    // ── applyUpdate integrity ──
    describe('applyUpdate — integrity verification', () => {
        it('blocks update when SHA-256 mismatch at apply-time', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';
            const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            const ok = await SubPluginManager.applyUpdate('sp_1', pluginCode, wrongHash);
            expect(ok).toBe(false);

            // Code should NOT be updated
            const p = SubPluginManager.plugins.find(x => x.id === 'sp_1');
            expect(p.code).toBe('old');
        });

        it('applies update when SHA-256 matches', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';
            const correctHash = await _computeSHA256(pluginCode);

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            const ok = await SubPluginManager.applyUpdate('sp_1', pluginCode, correctHash);
            expect(ok).toBe(true);

            const p = SubPluginManager.plugins.find(x => x.id === 'sp_1');
            expect(p.code).toBe(pluginCode);
            expect(p.version).toBe('2.0.0');
        });

        it('blocks update when no expectedSHA256 provided (mandatory enforcement)', async () => {
            const pluginCode = '// @name Test Plugin\n// @version 2.0.0\nconsole.log("v2");';

            SubPluginManager.plugins = [{
                id: 'sp_1', name: 'Test Plugin', version: '1.0.0',
                enabled: true, code: 'old', updateUrl: 'https://example.com',
            }];

            const ok = await SubPluginManager.applyUpdate('sp_1', pluginCode);
            expect(ok).toBe(false);

            // Code should NOT be updated
            const p = SubPluginManager.plugins.find(x => x.id === 'sp_1');
            expect(p.code).toBe('old');
        });
    });
});
