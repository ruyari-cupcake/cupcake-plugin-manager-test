/**
 * Tests for sub-plugin-manager.js — SubPluginManager utilities.
 */
import { describe, it, expect } from 'vitest';
import { SubPluginManager, setExposeScopeFunction } from '../src/lib/sub-plugin-manager.js';

describe('SubPluginManager', () => {
    it('has plugins array', () => {
        expect(Array.isArray(SubPluginManager.plugins)).toBe(true);
    });

    it('has _pendingUpdateNames array', () => {
        expect(Array.isArray(SubPluginManager._pendingUpdateNames)).toBe(true);
    });

    it('extractMetadata extracts name from code', () => {
        const code = `
            // @name TestPlugin
            // @version 1.0.0
            // @description A test plugin
            // @icon 🧪
            // @update-url https://example.com/plugin.js
            console.log("hello");
        `;
        const meta = SubPluginManager.extractMetadata(code);
        expect(meta.name).toBe('TestPlugin');
        expect(meta.version).toBe('1.0.0');
        expect(meta.description).toBe('A test plugin');
        expect(meta.icon).toBe('🧪');
        expect(meta.updateUrl).toBe('https://example.com/plugin.js');
    });

    it('extractMetadata uses defaults for missing fields', () => {
        const code = 'console.log("no metadata");';
        const meta = SubPluginManager.extractMetadata(code);
        expect(meta.name).toBe('Unnamed Sub-Plugin');
        expect(meta.version).toBe('');
    });

    it('compareVersions returns correct ordering', () => {
        // Convention: returns 1 when b > a, -1 when a > b, 0 when equal
        expect(SubPluginManager.compareVersions('1.0.0', '1.0.1')).toBe(1);
        expect(SubPluginManager.compareVersions('1.0.1', '1.0.0')).toBe(-1);
        expect(SubPluginManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
        expect(SubPluginManager.compareVersions('2.0.0', '1.9.9')).toBe(-1);
        expect(SubPluginManager.compareVersions('1.10.0', '1.9.0')).toBe(-1);
    });

    it('compareVersions handles missing version gracefully', () => {
        expect(SubPluginManager.compareVersions('', '1.0.0')).toBe(0);
        expect(SubPluginManager.compareVersions('1.0.0', '')).toBe(0);
        expect(SubPluginManager.compareVersions('', '')).toBe(0);
    });
});

describe('setExposeScopeFunction', () => {
    it('is a function', () => {
        expect(typeof setExposeScopeFunction).toBe('function');
    });

    it('accepts a function without throwing', () => {
        expect(() => setExposeScopeFunction(() => {})).not.toThrow();
    });
});
