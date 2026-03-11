/**
 * settings-backup-lifecycle.test.js — Tests for SettingsBackup real code paths:
 *   - load() with schema validation (valid, corrupted, non-object)
 *   - snapshotAll() + restoreIfEmpty() round-trip
 *   - updateKey() persistence
 *
 * Supplements existing settings-backup.test.js (key enumeration only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPluginStorage, mockSafeGetArg, mockSetArgument } = vi.hoisted(() => ({
    mockPluginStorage: { getItem: vi.fn(), setItem: vi.fn() },
    mockSafeGetArg: vi.fn(),
    mockSetArgument: vi.fn(),
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: {
        pluginStorage: mockPluginStorage,
        setArgument: mockSetArgument,
    },
    safeGetArg: (...a) => mockSafeGetArg(...a),
    registeredProviderTabs: [],
}));

import { SettingsBackup } from '../src/lib/settings-backup.js';

describe('SettingsBackup — load()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SettingsBackup._cache = null;
    });

    it('loads valid backup from storage', async () => {
        const stored = JSON.stringify({ cpm_openai_key: 'sk-xxx', cpm_fallback_temp: '0.7' });
        mockPluginStorage.getItem.mockResolvedValue(stored);

        const cache = await SettingsBackup.load();
        expect(cache.cpm_openai_key).toBe('sk-xxx');
        expect(cache.cpm_fallback_temp).toBe('0.7');
    });

    it('recovers from corrupted JSON', async () => {
        mockPluginStorage.getItem.mockResolvedValue('{not valid json!!!');
        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });

    it('recovers when storage returns array (wrong type)', async () => {
        mockPluginStorage.getItem.mockResolvedValue('[1,2,3]');
        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });

    it('returns empty object for null storage (fresh install)', async () => {
        mockPluginStorage.getItem.mockResolvedValue(null);
        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });

    it('returns empty object when getItem throws', async () => {
        mockPluginStorage.getItem.mockRejectedValue(new Error('unavailable'));
        const cache = await SettingsBackup.load();
        expect(cache).toEqual({});
    });
});

describe('SettingsBackup — save()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SettingsBackup._cache = { key1: 'val1' };
    });

    it('persists cache to pluginStorage', async () => {
        await SettingsBackup.save();
        expect(mockPluginStorage.setItem).toHaveBeenCalledWith(
            'cpm_settings_backup',
            JSON.stringify({ key1: 'val1' })
        );
    });

    it('does not throw when setItem fails', async () => {
        mockPluginStorage.setItem.mockRejectedValue(new Error('write error'));
        await expect(SettingsBackup.save()).resolves.toBeUndefined();
    });
});

describe('SettingsBackup — updateKey()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SettingsBackup._cache = {};
        mockPluginStorage.getItem.mockResolvedValue('{}');
        mockPluginStorage.setItem.mockResolvedValue(undefined);
    });

    it('updates a key in cache and saves', async () => {
        await SettingsBackup.updateKey('cpm_openai_key', 'sk-new');
        expect(SettingsBackup._cache.cpm_openai_key).toBe('sk-new');
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
    });

    it('creates cache via load() when cache is null', async () => {
        SettingsBackup._cache = null;
        mockPluginStorage.getItem.mockResolvedValue('{"existing":"data"}');
        await SettingsBackup.updateKey('newkey', 'newval');
        expect(SettingsBackup._cache.existing).toBe('data');
        expect(SettingsBackup._cache.newkey).toBe('newval');
    });
});

describe('SettingsBackup — snapshotAll()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SettingsBackup._cache = {};
        mockPluginStorage.setItem.mockResolvedValue(undefined);
    });

    it('snapshots all managed keys from safeGetArg', async () => {
        const allKeys = SettingsBackup.getAllKeys();
        // Mock: return values for some keys, empty for others
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_openai_key') return 'sk-abc';
            if (key === 'cpm_fallback_temp') return '0.8';
            return '';
        });

        await SettingsBackup.snapshotAll();
        expect(SettingsBackup._cache.cpm_openai_key).toBe('sk-abc');
        expect(SettingsBackup._cache.cpm_fallback_temp).toBe('0.8');
        expect(mockSafeGetArg).toHaveBeenCalledTimes(allKeys.length);
        expect(mockPluginStorage.setItem).toHaveBeenCalled();
    });

    it('skips empty values during snapshot', async () => {
        mockSafeGetArg.mockResolvedValue('');
        await SettingsBackup.snapshotAll();
        expect(Object.keys(SettingsBackup._cache)).toHaveLength(0);
    });
});

describe('SettingsBackup — restoreIfEmpty()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPluginStorage.getItem.mockResolvedValue(null);
        mockSetArgument.mockResolvedValue(undefined);
    });

    it('restores keys that are currently empty', async () => {
        SettingsBackup._cache = {
            cpm_openai_key: 'sk-saved',
            cpm_fallback_temp: '0.5',
        };
        // Current values are all empty
        mockSafeGetArg.mockResolvedValue('');

        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(2);
        expect(mockSetArgument).toHaveBeenCalledWith('cpm_openai_key', 'sk-saved');
        expect(mockSetArgument).toHaveBeenCalledWith('cpm_fallback_temp', '0.5');
    });

    it('does not overwrite existing values', async () => {
        SettingsBackup._cache = {
            cpm_openai_key: 'sk-saved',
            cpm_fallback_temp: '0.5',
        };
        // cpm_openai_key already has a value
        mockSafeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_openai_key') return 'sk-existing';
            return '';
        });

        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(1); // only temp restored
        expect(mockSetArgument).not.toHaveBeenCalledWith('cpm_openai_key', expect.anything());
    });

    it('returns 0 when backup is empty', async () => {
        SettingsBackup._cache = {};
        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(0);
        expect(mockSetArgument).not.toHaveBeenCalled();
    });

    it('loads from storage when cache is null', async () => {
        SettingsBackup._cache = null;
        mockPluginStorage.getItem.mockResolvedValue(JSON.stringify({ cpm_openai_key: 'sk-old' }));
        mockSafeGetArg.mockResolvedValue('');

        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(1);
    });
});
