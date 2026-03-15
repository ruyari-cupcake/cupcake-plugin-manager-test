/**
 * coverage-settings-backup.test.js — Deep branch coverage for settings-backup.js
 * Uses vi.mock to properly mock shared-state.js dependency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
    const _store = {};
    return {
        _store,
        Risu: {
            pluginStorage: {
                getItem: vi.fn(async (key) => _store[key] ?? null),
                setItem: vi.fn(async (key, value) => { _store[key] = value; }),
                removeItem: vi.fn(async (key) => { delete _store[key]; }),
            },
            getArgument: vi.fn(async () => ''),
            setArgument: vi.fn(),
            registerSetting: vi.fn(),
        },
        safeGetArg: vi.fn(async () => ''),
        registeredProviderTabs: [],
    };
});

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.Risu,
    safeGetArg: (...args) => h.safeGetArg(...args),
    registeredProviderTabs: h.registeredProviderTabs,
    CPM_VERSION: '1.20.7-test',
}));

import { SettingsBackup, isManagedSettingKey, getManagedSettingKeys } from '../src/lib/settings-backup.js';

describe('SettingsBackup — deep branch coverage', () => {
    beforeEach(() => {
        SettingsBackup._cache = null;

        // Clear store
        for (const key of Object.keys(h._store)) delete h._store[key];

        // Reset mocks
        h.Risu.pluginStorage.getItem.mockImplementation(async (key) => h._store[key] ?? null);
        h.Risu.pluginStorage.setItem.mockImplementation(async (key, value) => { h._store[key] = value; });
        h.Risu.pluginStorage.removeItem.mockImplementation(async (key) => { delete h._store[key]; });
        h.Risu.getArgument.mockImplementation(async () => '');
        h.Risu.setArgument.mockClear();
        h.safeGetArg.mockImplementation(async () => '');
    });

    afterEach(() => {
        SettingsBackup._cache = null;
    });

    it('load() with no stored data sets _cache to empty object', async () => {
        const result = await SettingsBackup.load();
        expect(result).toEqual({});
        expect(SettingsBackup._cache).toEqual({});
    });

    it('load() with valid backup data parses it', async () => {
        h._store[SettingsBackup.STORAGE_KEY] = JSON.stringify({ cpm_openai_key: 'sk-test' });
        const result = await SettingsBackup.load();
        expect(result.cpm_openai_key).toBe('sk-test');
    });

    it('load() with malformed JSON catches error and sets empty cache', async () => {
        h.Risu.pluginStorage.getItem.mockResolvedValue('{bad json!!!}');
        const result = await SettingsBackup.load();
        // parseAndValidate should fail, fallback is {}
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
    });

    it('load() catches pluginStorage exception', async () => {
        h.Risu.pluginStorage.getItem.mockRejectedValue(new Error('storage unavailable'));
        const result = await SettingsBackup.load();
        expect(result).toEqual({});
    });

    it('snapshotAll() saves all non-empty settings', async () => {
        h.safeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_openai_key') return 'sk-test123';
            if (key === 'cpm_streaming_enabled') return 'true';
            return '';
        });

        await SettingsBackup.snapshotAll();

        expect(SettingsBackup._cache).toBeTruthy();
        expect(SettingsBackup._cache.cpm_openai_key).toBe('sk-test123');
        expect(SettingsBackup._cache.cpm_streaming_enabled).toBe('true');
        expect(h.Risu.pluginStorage.setItem).toHaveBeenCalled();
    });

    it('restoreIfEmpty() returns 0 when cache is empty', async () => {
        SettingsBackup._cache = {};
        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(0);
    });

    it('restoreIfEmpty() returns 0 when cache is null', async () => {
        SettingsBackup._cache = null;
        // load will give empty since no stored data
        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(0);
    });

    it('restoreIfEmpty() skips keys that already have values', async () => {
        SettingsBackup._cache = {
            cpm_openai_key: 'backup-val',
            cpm_streaming_enabled: 'true',
        };
        // Return existing value for first key, empty for second
        h.safeGetArg.mockImplementation(async (key) => {
            if (key === 'cpm_openai_key') return 'existing-val';
            return '';
        });

        const count = await SettingsBackup.restoreIfEmpty();
        expect(count).toBe(1); // only streaming_enabled should be restored
        expect(h.Risu.setArgument).toHaveBeenCalledWith('cpm_streaming_enabled', 'true');
    });

    it('updateKey() triggers load if cache is null', async () => {
        SettingsBackup._cache = null;
        await SettingsBackup.updateKey('cpm_test_key', 'test_value');
        expect(SettingsBackup._cache).toBeTruthy();
        expect(SettingsBackup._cache.cpm_test_key).toBe('test_value');
    });

    it('save() catches setItem exception', async () => {
        SettingsBackup._cache = { key: 'value' };
        h.Risu.pluginStorage.setItem.mockRejectedValue(new Error('write fail'));
        // Should not throw
        await SettingsBackup.save();
    });
});

describe('isManagedSettingKey', () => {
    it('returns true for cpm_ prefix', () => {
        expect(isManagedSettingKey('cpm_openai_key')).toBe(true);
    });

    it('returns true for cpm- prefix', () => {
        expect(isManagedSettingKey('cpm-some-key')).toBe(true);
    });

    it('returns true for non-prefix managed keys', () => {
        expect(isManagedSettingKey('tools_githubCopilotToken')).toBe(true);
    });

    it('returns false for non-managed keys', () => {
        expect(isManagedSettingKey('random_key')).toBe(false);
        expect(isManagedSettingKey('')).toBe(false);
        expect(isManagedSettingKey(42)).toBe(false);
        expect(isManagedSettingKey(null)).toBe(false);
    });
});

describe('getManagedSettingKeys', () => {
    it('returns unique array including aux keys', () => {
        const keys = getManagedSettingKeys([]);
        expect(keys.length).toBeGreaterThan(0);
        expect(new Set(keys).size).toBe(keys.length); // unique
        expect(keys.some(k => k.startsWith('cpm_slot_'))).toBe(true);
    });

    it('includes exportKeys from provider tabs', () => {
        const customTabs = [
            { exportKeys: ['cpm_custom_setting_1', 'cpm_custom_setting_2'] },
        ];
        const keys = getManagedSettingKeys(customTabs);
        expect(keys).toContain('cpm_custom_setting_1');
        expect(keys).toContain('cpm_custom_setting_2');
    });

    it('handles non-array providerTabs', () => {
        const keys = getManagedSettingKeys(null);
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
    });
});
