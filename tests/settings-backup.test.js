/**
 * Tests for settings-backup.js — persistent settings backup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SettingsBackup, getManagedSettingKeys } from '../src/lib/settings-backup.js';

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
