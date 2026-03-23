/**
 * sub-plugin-data-management.test.js — Tests for:
 *   - backupPluginData / restorePluginData (roundtrip, safety guards)
 *   - _purgePluginData (per-plugin data deletion, isolation)
 *   - removeWithData (registry + data removal)
 *   - findOrphanedPluginData / purgeOrphanedPluginData (orphan detection)
 *   - _buildPluginShortNames (helper accuracy)
 *   - _getKnownKeysMap (completeness)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──
const { mockPluginStorage, mockSafeLocalStorage } = vi.hoisted(() => {
    /** @type {Map<string, any>} */
    const psStore = new Map();
    /** @type {Map<string, any>} */
    const slsStore = new Map();

    return {
        mockPluginStorage: {
            _store: psStore,
            getItem: vi.fn(async (key) => psStore.get(key) ?? null),
            setItem: vi.fn(async (key, val) => { psStore.set(key, val); }),
            removeItem: vi.fn(async (key) => { psStore.delete(key); }),
            keys: vi.fn(async () => [...psStore.keys()]),
        },
        mockSafeLocalStorage: {
            _store: slsStore,
            getItem: vi.fn(async (key) => slsStore.get(key) ?? null),
            setItem: vi.fn(async (key, val) => { slsStore.set(key, val); }),
            removeItem: vi.fn(async (key) => { slsStore.delete(key); }),
            keys: vi.fn(async () => [...slsStore.keys()]),
        },
    };
});

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        safeLocalStorage: mockSafeLocalStorage,
        risuFetch: vi.fn(),
        getRootDocument: vi.fn().mockResolvedValue(null),
        addProvider: vi.fn(),
    },
    CPM_VERSION: '1.22.34',
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

import { SubPluginManager } from '../src/lib/sub-plugin-manager.js';

// ── Test Helpers ──
function resetStores() {
    mockPluginStorage._store.clear();
    mockSafeLocalStorage._store.clear();
    vi.clearAllMocks();
    SubPluginManager.plugins = [];
}

function seedTranslationCachePlugin() {
    SubPluginManager.plugins = [{
        id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0',
        code: '// @name CPM Component - Translation Cache Manager\nconsole.log("tc");',
        enabled: true, description: 'Translation cache', icon: '🌐', updateUrl: '',
    }];
}

function seedChatLimiterPlugin() {
    SubPluginManager.plugins = [{
        id: 'sp_cl', name: 'CPM Component - Chat Limiter', version: '0.2.1',
        code: '// @name CPM Component - Chat Limiter\nconsole.log("cl");',
        enabled: true, description: 'Chat limiter', icon: '🔒', updateUrl: '',
    }];
}

function seedProviderPlugin() {
    SubPluginManager.plugins = [{
        id: 'sp_ant', name: 'CPM Provider - Anthropic', version: '1.6.8',
        code: '// @name CPM Provider - Anthropic\nconsole.log("ant");',
        enabled: true, description: 'Anthropic provider', icon: '🤖', updateUrl: '',
    }];
}

// ════════════════════════════════════════════════════════════════
// 1. _buildPluginShortNames
// ════════════════════════════════════════════════════════════════

describe('_buildPluginShortNames (via _purgePluginData key scanning)', () => {
    beforeEach(resetStores);

    it('Translation Cache Manager → includes "translationcachemanager"', async () => {
        seedTranslationCachePlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{}');
        // Core key that must NOT be deleted
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');

        const deleted = await SubPluginManager._purgePluginData('CPM Component - Translation Cache Manager');

        expect(deleted).toContain('pluginStorage:cpm_transcache_corrections');
        expect(deleted).toContain('pluginStorage:cpm_transcache_timestamps');
        // Core key must survive
        expect(deleted).not.toContain('pluginStorage:cpm_installed_subplugins');
    });

    it('Chat Limiter → deletes safeLocalStorage keys', async () => {
        seedChatLimiterPlugin();
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '5');

        const deleted = await SubPluginManager._purgePluginData('CPM Component - Chat Limiter');

        expect(deleted).toContain('safeLocalStorage:cpm_chat_limiter_active');
        expect(deleted).toContain('safeLocalStorage:cpm_chat_limiter_count');
    });

    it('Provider plugins do not accidentally delete other plugins keys', async () => {
        seedProviderPlugin();
        // Put Translation Cache keys in storage — they must NOT be touched
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');

        const deleted = await SubPluginManager._purgePluginData('CPM Provider - Anthropic');

        expect(deleted).toHaveLength(0);
        // All other keys survive
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(true);
        expect(mockPluginStorage._store.has('cpm_installed_subplugins')).toBe(true);
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════
// 2. backupPluginData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager.backupPluginData', () => {
    beforeEach(resetStores);

    it('returns null for non-existent plugin', async () => {
        const result = await SubPluginManager.backupPluginData('nonexistent_id');
        expect(result).toBeNull();
    });

    it('backs up Translation Cache known keys from pluginStorage', async () => {
        seedTranslationCachePlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[{"from":"a","to":"b"}]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{"k":123}');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]'); // system key

        const backup = await SubPluginManager.backupPluginData('sp_tc');

        expect(backup).not.toBeNull();
        expect(backup.pluginName).toBe('CPM Component - Translation Cache Manager');
        expect(backup.pluginMeta.version).toBe('1.4.0');
        expect(backup.storageData).toHaveLength(2);

        const keys = backup.storageData.map(d => d.key);
        expect(keys).toContain('cpm_transcache_corrections');
        expect(keys).toContain('cpm_transcache_timestamps');
        // System key must NOT be included
        expect(keys).not.toContain('cpm_installed_subplugins');
    });

    it('backs up Chat Limiter known keys from safeLocalStorage', async () => {
        seedChatLimiterPlugin();
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '10');

        const backup = await SubPluginManager.backupPluginData('sp_cl');

        expect(backup).not.toBeNull();
        expect(backup.storageData).toHaveLength(2);
        expect(backup.storageData.every(d => d.storage === 'safeLocalStorage')).toBe(true);
        expect(backup.storageData.find(d => d.key === 'cpm_chat_limiter_active').value).toBe('true');
        expect(backup.storageData.find(d => d.key === 'cpm_chat_limiter_count').value).toBe('10');
    });

    it('returns empty storageData for provider plugin (no storage keys)', async () => {
        seedProviderPlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]'); // belongs to translation cache

        const backup = await SubPluginManager.backupPluginData('sp_ant');

        expect(backup).not.toBeNull();
        expect(backup.pluginName).toBe('CPM Provider - Anthropic');
        expect(backup.storageData).toHaveLength(0);
    });

    it('picks up dynamically-created keys via prefix scan (matching short name)', async () => {
        seedTranslationCachePlugin();
        // Known keys
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        // Dynamic key that contains the full short name "translationcachemanager"
        mockPluginStorage._store.set('cpm_translationcachemanager_extra', '{"v":1}');

        const backup = await SubPluginManager.backupPluginData('sp_tc');

        const keys = backup.storageData.map(d => d.key);
        expect(keys).toContain('cpm_transcache_corrections');
        expect(keys).toContain('cpm_translationcachemanager_extra');
    });

    it('does NOT pick up keys with only partial name overlap', async () => {
        seedTranslationCachePlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        // Key with "transcache" — shorter than any short name, should NOT match
        mockPluginStorage._store.set('cpm_transcache_metadata', '{"v":1}');

        const backup = await SubPluginManager.backupPluginData('sp_tc');

        const keys = backup.storageData.map(d => d.key);
        expect(keys).toContain('cpm_transcache_corrections'); // known key
        expect(keys).not.toContain('cpm_transcache_metadata'); // not a known key, partial match
    });
});

// ════════════════════════════════════════════════════════════════
// 3. restorePluginData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager.restorePluginData', () => {
    beforeEach(resetStores);

    it('restores pluginStorage keys from backup', async () => {
        const backup = {
            pluginName: 'CPM Component - Translation Cache Manager',
            pluginMeta: { id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0' },
            storageData: [
                { storage: 'pluginStorage', key: 'cpm_transcache_corrections', value: '[{"from":"x","to":"y"}]' },
                { storage: 'pluginStorage', key: 'cpm_transcache_timestamps', value: '{"k":999}' },
            ],
        };

        const result = await SubPluginManager.restorePluginData(backup);

        expect(result.restoredKeys).toHaveLength(2);
        expect(mockPluginStorage._store.get('cpm_transcache_corrections')).toBe('[{"from":"x","to":"y"}]');
        expect(mockPluginStorage._store.get('cpm_transcache_timestamps')).toBe('{"k":999}');
    });

    it('restores safeLocalStorage keys from backup', async () => {
        const backup = {
            pluginName: 'CPM Component - Chat Limiter',
            pluginMeta: { id: 'sp_cl' },
            storageData: [
                { storage: 'safeLocalStorage', key: 'cpm_chat_limiter_active', value: 'false' },
                { storage: 'safeLocalStorage', key: 'cpm_chat_limiter_count', value: '3' },
            ],
        };

        const result = await SubPluginManager.restorePluginData(backup);

        expect(result.restoredKeys).toHaveLength(2);
        expect(mockSafeLocalStorage._store.get('cpm_chat_limiter_active')).toBe('false');
        expect(mockSafeLocalStorage._store.get('cpm_chat_limiter_count')).toBe('3');
    });

    it('REFUSES to restore core CPM system keys', async () => {
        const maliciousBackup = {
            pluginName: 'Evil Plugin',
            pluginMeta: { id: 'evil' },
            storageData: [
                { storage: 'pluginStorage', key: 'cpm_installed_subplugins', value: '[]' },
                { storage: 'pluginStorage', key: 'cpm_settings_backup', value: '{}' },
                { storage: 'pluginStorage', key: 'cpm_last_version_check', value: '0' },
                { storage: 'pluginStorage', key: 'cpm_last_main_version_check', value: '0' },
                { storage: 'pluginStorage', key: 'cpm_pending_main_update', value: 'null' },
                { storage: 'pluginStorage', key: 'cpm_last_boot_status', value: '{}' },
            ],
        };

        const result = await SubPluginManager.restorePluginData(maliciousBackup);

        expect(result.restoredKeys).toHaveLength(0);
        // None of the system keys should exist in store
        for (const entry of maliciousBackup.storageData) {
            expect(mockPluginStorage._store.has(entry.key)).toBe(false);
        }
    });

    it('REFUSES to restore non-cpm_ prefixed keys', async () => {
        const suspiciousBackup = {
            pluginName: 'Some Plugin',
            pluginMeta: { id: 'sus' },
            storageData: [
                { storage: 'pluginStorage', key: 'user_api_key', value: 'stolen' },
                { storage: 'pluginStorage', key: 'some_random_key', value: 'injected' },
                { storage: 'safeLocalStorage', key: 'auth_token', value: 'hijacked' },
            ],
        };

        const result = await SubPluginManager.restorePluginData(suspiciousBackup);

        expect(result.restoredKeys).toHaveLength(0);
    });

    it('handles null/invalid backup gracefully', async () => {
        const r1 = await SubPluginManager.restorePluginData(/** @type {any} */ (null));
        expect(r1.restoredKeys).toHaveLength(0);

        const r2 = await SubPluginManager.restorePluginData(/** @type {any} */ ({ pluginName: 'X' }));
        expect(r2.restoredKeys).toHaveLength(0);

        const r3 = await SubPluginManager.restorePluginData(/** @type {any} */ ({ pluginName: 'X', storageData: 'not-an-array' }));
        expect(r3.restoredKeys).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════
// 4. Backup → Purge → Restore roundtrip
// ════════════════════════════════════════════════════════════════

describe('Backup → Purge → Restore roundtrip', () => {
    beforeEach(resetStores);

    it('Translation Cache: backup, purge, verify empty, restore, verify restored', async () => {
        seedTranslationCachePlugin();
        const originalCorrections = '[{"from":"hello","to":"안녕하세요"}]';
        const originalTimestamps = '{"hello":1700000000}';
        mockPluginStorage._store.set('cpm_transcache_corrections', originalCorrections);
        mockPluginStorage._store.set('cpm_transcache_timestamps', originalTimestamps);
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]'); // system key

        // Step 1: Backup
        const backup = await SubPluginManager.backupPluginData('sp_tc');
        expect(backup).not.toBeNull();
        expect(backup.storageData).toHaveLength(2);

        // Step 2: Purge
        const deleted = await SubPluginManager._purgePluginData('CPM Component - Translation Cache Manager');
        expect(deleted.length).toBeGreaterThanOrEqual(2);

        // Verify data is gone
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(false);
        expect(mockPluginStorage._store.has('cpm_transcache_timestamps')).toBe(false);
        // System key must survive
        expect(mockPluginStorage._store.has('cpm_installed_subplugins')).toBe(true);

        // Step 3: Restore
        const result = await SubPluginManager.restorePluginData(backup);
        expect(result.restoredKeys).toHaveLength(2);

        // Verify data is back
        expect(mockPluginStorage._store.get('cpm_transcache_corrections')).toBe(originalCorrections);
        expect(mockPluginStorage._store.get('cpm_transcache_timestamps')).toBe(originalTimestamps);
    });

    it('Chat Limiter: backup, purge, restore via safeLocalStorage', async () => {
        seedChatLimiterPlugin();
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '7');

        // Backup
        const backup = await SubPluginManager.backupPluginData('sp_cl');
        expect(backup.storageData).toHaveLength(2);

        // Purge
        await SubPluginManager._purgePluginData('CPM Component - Chat Limiter');
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(false);
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_count')).toBe(false);

        // Restore
        const result = await SubPluginManager.restorePluginData(backup);
        expect(result.restoredKeys).toHaveLength(2);
        expect(mockSafeLocalStorage._store.get('cpm_chat_limiter_active')).toBe('true');
        expect(mockSafeLocalStorage._store.get('cpm_chat_limiter_count')).toBe('7');
    });
});

// ════════════════════════════════════════════════════════════════
// 5. removeWithData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager.removeWithData', () => {
    beforeEach(resetStores);

    it('removes plugin from registry AND deletes associated data', async () => {
        seedTranslationCachePlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{}');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');

        expect(SubPluginManager.plugins).toHaveLength(1);

        const result = await SubPluginManager.removeWithData('sp_tc');

        // Plugin removed from registry
        expect(SubPluginManager.plugins).toHaveLength(0);
        // Data deleted
        expect(result.removedKeys.length).toBeGreaterThanOrEqual(2);
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(false);
        expect(mockPluginStorage._store.has('cpm_transcache_timestamps')).toBe(false);
        // System key survives
        expect(mockPluginStorage._store.has('cpm_installed_subplugins')).toBe(true);
    });

    it('does not delete other plugins data', async () => {
        // Install both TC and CL
        SubPluginManager.plugins = [
            { id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0', code: 'tc', enabled: true, description: '', icon: '', updateUrl: '' },
            { id: 'sp_cl', name: 'CPM Component - Chat Limiter', version: '0.2.1', code: 'cl', enabled: true, description: '', icon: '', updateUrl: '' },
        ];
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');

        // Remove only Translation Cache
        await SubPluginManager.removeWithData('sp_tc');

        // TC data deleted
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(false);
        // CL data survives
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(true);
        // CL plugin still in registry
        expect(SubPluginManager.plugins).toHaveLength(1);
        expect(SubPluginManager.plugins[0].name).toBe('CPM Component - Chat Limiter');
    });

    it('handles non-existent plugin id gracefully', async () => {
        const result = await SubPluginManager.removeWithData('nonexistent');
        expect(result.removedKeys).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════
// 6. findOrphanedPluginData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager.findOrphanedPluginData', () => {
    beforeEach(resetStores);

    it('returns empty when no orphaned keys exist', async () => {
        seedTranslationCachePlugin();
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');

        const orphans = await SubPluginManager.findOrphanedPluginData();
        expect(orphans).toHaveLength(0);
    });

    it('detects Translation Cache orphan keys when plugin is uninstalled', async () => {
        // No plugins installed, but TC data remains
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{}');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]'); // system, not orphan

        const orphans = await SubPluginManager.findOrphanedPluginData();

        expect(orphans.length).toBeGreaterThanOrEqual(1);
        const tcOrphan = orphans.find(o => o.pluginName.includes('Translation Cache'));
        expect(tcOrphan).toBeTruthy();
        expect(tcOrphan.keys.length).toBeGreaterThanOrEqual(2);
    });

    it('detects Chat Limiter orphan keys from safeLocalStorage', async () => {
        // No plugins installed, but CL data remains in safeLocalStorage
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '3');

        const orphans = await SubPluginManager.findOrphanedPluginData();

        expect(orphans.length).toBeGreaterThanOrEqual(1);
        const clOrphan = orphans.find(o => o.pluginName.includes('Chat Limiter'));
        expect(clOrphan).toBeTruthy();
        expect(clOrphan.keys.length).toBe(2);
    });

    it('does NOT flag installed plugin data as orphaned', async () => {
        seedTranslationCachePlugin();
        seedChatLimiterPlugin(); // This overwrites plugins array — use push instead
        SubPluginManager.plugins = [
            { id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0', code: 'tc', enabled: true, description: '', icon: '', updateUrl: '' },
            { id: 'sp_cl', name: 'CPM Component - Chat Limiter', version: '0.2.1', code: 'cl', enabled: true, description: '', icon: '', updateUrl: '' },
        ];
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');

        const orphans = await SubPluginManager.findOrphanedPluginData();
        expect(orphans).toHaveLength(0);
    });

    it('does NOT flag core CPM system keys as orphans', async () => {
        // System keys only in storage, no plugins installed
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');
        mockPluginStorage._store.set('cpm_settings_backup', '{}');
        mockPluginStorage._store.set('cpm_last_version_check', '0');
        mockPluginStorage._store.set('cpm_last_main_version_check', '0');
        mockPluginStorage._store.set('cpm_pending_main_update', 'null');
        mockPluginStorage._store.set('cpm_last_boot_status', '{}');

        const orphans = await SubPluginManager.findOrphanedPluginData();
        expect(orphans).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════
// 7. purgeOrphanedPluginData
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager.purgeOrphanedPluginData', () => {
    beforeEach(resetStores);

    it('deletes orphaned keys for a specific plugin', async () => {
        // TC uninstalled, data remains
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{}');

        const count = await SubPluginManager.purgeOrphanedPluginData('CPM Component - Translation Cache Manager');

        expect(count).toBe(2);
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(false);
        expect(mockPluginStorage._store.has('cpm_transcache_timestamps')).toBe(false);
    });

    it('returns 0 when no orphans match the name', async () => {
        const count = await SubPluginManager.purgeOrphanedPluginData('Nonexistent Plugin');
        expect(count).toBe(0);
    });

    it('does NOT delete other orphaned plugins data', async () => {
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');

        // Only purge Translation Cache orphans
        await SubPluginManager.purgeOrphanedPluginData('CPM Component - Translation Cache Manager');

        // TC data gone
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(false);
        // CL data survives
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════
// 8. _getKnownKeysMap completeness
// ════════════════════════════════════════════════════════════════

describe('SubPluginManager._getKnownKeysMap', () => {
    it('contains all 13 known sub-plugins', () => {
        const map = SubPluginManager._getKnownKeysMap();
        const keys = Object.keys(map);

        // Components (6)
        expect(keys).toContain('cpmcomponent-translationcachemanager');
        expect(keys).toContain('cpmcomponent-chatlimiter');
        expect(keys).toContain('cpmcomponent-chatnavigation');
        expect(keys).toContain('cpmcomponent-chatinputresizer');
        expect(keys).toContain('cpmcomponent-copilottokenmanager');
        expect(keys).toContain('cpmcomponent-autotranslatelastcharalpha');

        // Providers (7)
        expect(keys).toContain('cpmprovider-anthropic');
        expect(keys).toContain('cpmprovider-awsbedrock');
        expect(keys).toContain('cpmprovider-deepseek');
        expect(keys).toContain('cpmprovider-geministudio');
        expect(keys).toContain('cpmprovider-openai');
        expect(keys).toContain('cpmprovider-openrouter');
        expect(keys).toContain('cpmprovider-vertexai');

        expect(keys).toHaveLength(13);
    });

    it('only Translation Cache and Chat Limiter have actual storage keys', () => {
        const map = SubPluginManager._getKnownKeysMap();

        // TC
        expect(map['cpmcomponent-translationcachemanager'].pluginStorage).toEqual(
            ['cpm_transcache_corrections', 'cpm_transcache_timestamps']
        );

        // CL
        expect(map['cpmcomponent-chatlimiter'].safeLocalStorage).toEqual(
            ['cpm_chat_limiter_active', 'cpm_chat_limiter_count']
        );

        // All others should be empty objects
        const withKeys = Object.entries(map).filter(([_, v]) =>
            (v.pluginStorage && v.pluginStorage.length > 0) ||
            (v.safeLocalStorage && v.safeLocalStorage.length > 0)
        );
        expect(withKeys).toHaveLength(2);
    });
});

// ════════════════════════════════════════════════════════════════
// 9. Cross-plugin isolation stress test
// ════════════════════════════════════════════════════════════════

describe('Cross-plugin data isolation', () => {
    beforeEach(resetStores);

    it('purging Translation Cache never touches Chat Limiter data or system keys', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0', code: 'tc', enabled: true, description: '', icon: '', updateUrl: '' },
            { id: 'sp_cl', name: 'CPM Component - Chat Limiter', version: '0.2.1', code: 'cl', enabled: true, description: '', icon: '', updateUrl: '' },
        ];

        // Seed all types of data
        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_transcache_timestamps', '{}');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');
        mockPluginStorage._store.set('cpm_settings_backup', '{}');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '5');

        // Purge only Translation Cache
        const deleted = await SubPluginManager._purgePluginData('CPM Component - Translation Cache Manager');

        // TC data gone
        expect(deleted).toContain('pluginStorage:cpm_transcache_corrections');
        expect(deleted).toContain('pluginStorage:cpm_transcache_timestamps');

        // CL data intact
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(true);
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_count')).toBe(true);

        // System keys intact
        expect(mockPluginStorage._store.has('cpm_installed_subplugins')).toBe(true);
        expect(mockPluginStorage._store.has('cpm_settings_backup')).toBe(true);
    });

    it('purging Chat Limiter never touches Translation Cache data or system keys', async () => {
        SubPluginManager.plugins = [
            { id: 'sp_tc', name: 'CPM Component - Translation Cache Manager', version: '1.4.0', code: 'tc', enabled: true, description: '', icon: '', updateUrl: '' },
            { id: 'sp_cl', name: 'CPM Component - Chat Limiter', version: '0.2.1', code: 'cl', enabled: true, description: '', icon: '', updateUrl: '' },
        ];

        mockPluginStorage._store.set('cpm_transcache_corrections', '[]');
        mockPluginStorage._store.set('cpm_installed_subplugins', '[]');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_active', 'true');
        mockSafeLocalStorage._store.set('cpm_chat_limiter_count', '5');

        await SubPluginManager._purgePluginData('CPM Component - Chat Limiter');

        // CL gone
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_active')).toBe(false);
        expect(mockSafeLocalStorage._store.has('cpm_chat_limiter_count')).toBe(false);

        // TC intact
        expect(mockPluginStorage._store.has('cpm_transcache_corrections')).toBe(true);
        // System intact
        expect(mockPluginStorage._store.has('cpm_installed_subplugins')).toBe(true);
    });
});
