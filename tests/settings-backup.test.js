/**
 * Tests for settings-backup.js — persistent settings backup.
 * Covers key enumeration, isManagedSettingKey, getAuxSettingKeys, and getManagedSettingKeys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    SettingsBackup,
    getManagedSettingKeys,
    isManagedSettingKey,
    getAuxSettingKeys,
    AUX_SETTING_SLOTS,
    NON_PREFIX_MANAGED_SETTING_KEYS,
} from '../src/lib/settings-backup.js';

describe('SettingsBackup', () => {
    it('has a STORAGE_KEY', () => {
        expect(SettingsBackup.STORAGE_KEY).toBe('cpm_settings_backup');
    });

    it('getAllKeys returns an array of settings keys', () => {
        const keys = SettingsBackup.getAllKeys();
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
        // Should include slot keys
        expect(keys).toContain('cpm_slot_translation');
        expect(keys).toContain('cpm_slot_emotion');
        expect(keys).toContain('cpm_slot_memory');
        expect(keys).toContain('cpm_slot_other');
    });

    it('getAllKeys includes fallback keys', () => {
        const keys = SettingsBackup.getAllKeys();
        expect(keys).toContain('cpm_fallback_temp');
        expect(keys).toContain('cpm_fallback_max_tokens');
    });

    it('getAllKeys includes slot parameter keys', () => {
        const keys = SettingsBackup.getAllKeys();
        expect(keys).toContain('cpm_slot_translation_temp');
        expect(keys).toContain('cpm_slot_emotion_max_out');
        expect(keys).toContain('cpm_slot_memory_top_p');
    });

    it('getAllKeys includes custom models key', () => {
        const keys = SettingsBackup.getAllKeys();
        expect(keys).toContain('cpm_custom_models');
    });

    it('getAllKeys includes every @arg declared in the main plugin header', () => {
        const pluginHeader = fs.readFileSync(
            path.resolve(import.meta.dirname, '../src/plugin-header.js'),
            'utf8'
        );
        const declaredArgKeys = [...pluginHeader.matchAll(/^\/\/@arg\s+([^\s]+)\s+/gm)]
            .map((match) => match[1]);

        const keys = SettingsBackup.getAllKeys();
        for (const key of declaredArgKeys) {
            expect(keys).toContain(key);
        }
    });

    it('filters unrelated dynamic export keys while keeping CPM-owned keys', () => {
        const keys = getManagedSettingKeys([
            {
                exportKeys: [
                    'cpm_dynamic_custom',
                    'tools_githubCopilotToken',
                    'common_openai_servicetier',
                    'asset_library_index',
                    'totally_unrelated_key',
                ],
            },
        ]);

        expect(keys).toContain('cpm_dynamic_custom');
        expect(keys).toContain('tools_githubCopilotToken');
        expect(keys).toContain('common_openai_servicetier');
        expect(keys).not.toContain('asset_library_index');
        expect(keys).not.toContain('totally_unrelated_key');
    });

    it('has internal _cache object', () => {
        expect(typeof SettingsBackup._cache).toBe('object');
    });

    it('updateKey stores value in cache (async)', async () => {
        await SettingsBackup.updateKey('test_key_123', 'test_value');
        expect(SettingsBackup._cache['test_key_123']).toBe('test_value');
        // Cleanup
        delete SettingsBackup._cache['test_key_123'];
    });
});

// ── isManagedSettingKey ──

describe('isManagedSettingKey', () => {
    it('returns true for cpm_ prefixed keys', () => {
        expect(isManagedSettingKey('cpm_openai_key')).toBe(true);
        expect(isManagedSettingKey('cpm_fallback_temp')).toBe(true);
        expect(isManagedSettingKey('cpm_custom_models')).toBe(true);
    });

    it('returns true for cpm- (hyphen) prefixed keys', () => {
        expect(isManagedSettingKey('cpm-custom')).toBe(true);
        expect(isManagedSettingKey('cpm-something-else')).toBe(true);
    });

    it('returns true for NON_PREFIX_MANAGED_SETTING_KEYS', () => {
        expect(isManagedSettingKey('common_openai_servicetier')).toBe(true);
        expect(isManagedSettingKey('tools_githubCopilotToken')).toBe(true);
        expect(isManagedSettingKey('chat_claude_caching')).toBe(true);
        expect(isManagedSettingKey('chat_gemini_preserveSystem')).toBe(true);
    });

    it('returns false for unrelated keys', () => {
        expect(isManagedSettingKey('asset_library_index')).toBe(false);
        expect(isManagedSettingKey('random_key')).toBe(false);
        expect(isManagedSettingKey('totally_unrelated')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
        expect(isManagedSettingKey(null)).toBe(false);
        expect(isManagedSettingKey(undefined)).toBe(false);
        expect(isManagedSettingKey(123)).toBe(false);
        expect(isManagedSettingKey(true)).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(isManagedSettingKey('')).toBe(false);
    });
});

// ── getAuxSettingKeys ──

describe('getAuxSettingKeys', () => {
    it('generates keys for all 4 slots', () => {
        const keys = getAuxSettingKeys();
        for (const slot of AUX_SETTING_SLOTS) {
            expect(keys).toContain(`cpm_slot_${slot}`);
            expect(keys).toContain(`cpm_slot_${slot}_temp`);
            expect(keys).toContain(`cpm_slot_${slot}_top_p`);
            expect(keys).toContain(`cpm_slot_${slot}_top_k`);
            expect(keys).toContain(`cpm_slot_${slot}_rep_pen`);
            expect(keys).toContain(`cpm_slot_${slot}_freq_pen`);
            expect(keys).toContain(`cpm_slot_${slot}_pres_pen`);
            expect(keys).toContain(`cpm_slot_${slot}_max_context`);
            expect(keys).toContain(`cpm_slot_${slot}_max_out`);
        }
    });

    it('generates exactly 4 slots × 9 params = 36 keys', () => {
        const keys = getAuxSettingKeys();
        expect(keys).toHaveLength(36);
    });

    it('AUX_SETTING_SLOTS contains expected slots', () => {
        expect(AUX_SETTING_SLOTS).toEqual(['translation', 'emotion', 'memory', 'other']);
    });
});

// ── getManagedSettingKeys deduplication ──

describe('getManagedSettingKeys — deduplication', () => {
    it('returns unique keys even when dynamic keys overlap with base keys', () => {
        const keys = getManagedSettingKeys([
            {
                exportKeys: [
                    'cpm_openai_key',       // already in BASE_SETTING_KEYS
                    'cpm_fallback_temp',    // already in BASE_SETTING_KEYS
                    'cpm_dynamic_new',      // new key
                ],
            },
        ]);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size); // no duplicates
        expect(keys).toContain('cpm_dynamic_new');
    });

    it('handles empty providerTabs', () => {
        const keys = getManagedSettingKeys([]);
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
    });

    it('handles providerTabs with no exportKeys', () => {
        const keys = getManagedSettingKeys([{ name: 'Test Tab' }]);
        expect(Array.isArray(keys)).toBe(true);
    });

    it('handles null/undefined providerTabs', () => {
        const keys = getManagedSettingKeys(null);
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
    });
});

// ── NON_PREFIX_MANAGED_SETTING_KEYS completeness ──

describe('NON_PREFIX_MANAGED_SETTING_KEYS', () => {
    it('are all included in the full managed keys list', () => {
        const allKeys = getManagedSettingKeys();
        for (const key of NON_PREFIX_MANAGED_SETTING_KEYS) {
            expect(allKeys).toContain(key);
        }
    });

    it('none start with cpm_ prefix', () => {
        for (const key of NON_PREFIX_MANAGED_SETTING_KEYS) {
            expect(key.startsWith('cpm_')).toBe(false);
        }
    });
});
