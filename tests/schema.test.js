/**
 * Tests for schema.js — lightweight structural schema validation.
 */
import { describe, it, expect } from 'vitest';
import { validateSchema, parseAndValidate, schemas } from '../src/lib/schema.js';

// ── validateSchema basic type checks ──

describe('validateSchema — primitives', () => {
    it('validates string type', () => {
        const r = validateSchema('hello', { type: 'string' });
        expect(r.ok).toBe(true);
        expect(r.data).toBe('hello');
    });

    it('rejects number for string type', () => {
        const r = validateSchema(42, { type: 'string', fallback: 'default' });
        expect(r.ok).toBe(false);
        expect(r.fallback).toBe('default');
    });

    it('validates number type', () => {
        const r = validateSchema(3.14, { type: 'number' });
        expect(r.ok).toBe(true);
        expect(r.data).toBe(3.14);
    });

    it('rejects NaN for number type', () => {
        const r = validateSchema(NaN, { type: 'number', fallback: 0 });
        expect(r.ok).toBe(false);
        expect(r.fallback).toBe(0);
    });

    it('rejects Infinity for number type', () => {
        const r = validateSchema(Infinity, { type: 'number', fallback: -1 });
        expect(r.ok).toBe(false);
    });

    it('validates boolean type', () => {
        expect(validateSchema(true, { type: 'boolean' }).ok).toBe(true);
        expect(validateSchema(false, { type: 'boolean' }).ok).toBe(true);
    });

    it('rejects string for boolean type', () => {
        const r = validateSchema('true', { type: 'boolean', fallback: false });
        expect(r.ok).toBe(false);
    });

    it('rejects null/undefined', () => {
        const r1 = validateSchema(null, { type: 'string', fallback: '' });
        expect(r1.ok).toBe(false);
        const r2 = validateSchema(undefined, { type: 'object', fallback: {} });
        expect(r2.ok).toBe(false);
    });
});

// ── Array validation ──

describe('validateSchema — arrays', () => {
    it('validates plain array', () => {
        const r = validateSchema([1, 2, 3], { type: 'array' });
        expect(r.ok).toBe(true);
        expect(r.data).toEqual([1, 2, 3]);
    });

    it('rejects object for array type', () => {
        const r = validateSchema({ a: 1 }, { type: 'array', fallback: [] });
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual([]);
    });

    it('enforces maxItems (soft truncation)', () => {
        const r = validateSchema([1, 2, 3, 4, 5], { type: 'array', maxItems: 3 });
        expect(r.ok).toBe(true);
        expect(r.data).toEqual([1, 2, 3]);
    });

    it('filters invalid items when items schema provided', () => {
        const r = validateSchema(
            [{ id: 'a', code: 'x' }, 'not-an-object', { id: 'b', code: 'y' }],
            {
                type: 'array',
                items: { type: 'object', required: ['id', 'code'] },
            }
        );
        expect(r.ok).toBe(true);
        expect(r.data).toHaveLength(2);
        expect(r.data[0].id).toBe('a');
        expect(r.data[1].id).toBe('b');
    });
});

// ── Object validation ──

describe('validateSchema — objects', () => {
    it('validates plain object', () => {
        const r = validateSchema({ x: 1 }, { type: 'object' });
        expect(r.ok).toBe(true);
    });

    it('rejects array for object type', () => {
        const r = validateSchema([], { type: 'object', fallback: {} });
        expect(r.ok).toBe(false);
    });

    it('checks required keys', () => {
        const r = validateSchema({ a: 1 }, { type: 'object', required: ['a', 'b'], fallback: {} });
        expect(r.ok).toBe(false);
        expect(r.error).toContain('b');
    });

    it('validates nested properties', () => {
        const r = validateSchema(
            { name: 'test', count: 'wrong' },
            {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    count: { type: 'number', fallback: 0 },
                },
            }
        );
        expect(r.ok).toBe(true);
        expect(r.data.name).toBe('test');
        expect(r.data.count).toBe(0); // fallback because 'wrong' is not a number
    });
});

// ── String constraints ──

describe('validateSchema — string maxLength', () => {
    it('truncates strings exceeding maxLength', () => {
        const r = validateSchema('abcdefgh', { type: 'string', maxLength: 5 });
        expect(r.ok).toBe(true);
        expect(r.data).toBe('abcde');
    });
});

// ── parseAndValidate convenience ──

describe('parseAndValidate', () => {
    it('parses valid JSON and validates', () => {
        const r = parseAndValidate('{"a":1}', { type: 'object' });
        expect(r.ok).toBe(true);
        expect(r.data.a).toBe(1);
    });

    it('fails on malformed JSON', () => {
        const r = parseAndValidate('{invalid', { type: 'object', fallback: {} });
        expect(r.ok).toBe(false);
        expect(r.error).toContain('JSON parse failed');
        expect(r.fallback).toEqual({});
    });

    it('fails when JSON parses but schema mismatches', () => {
        const r = parseAndValidate('"hello"', { type: 'object', fallback: {} });
        expect(r.ok).toBe(false);
    });
});

// ── Pre-defined schemas ──

describe('schemas.subPluginRegistry', () => {
    it('validates a correct registry array', () => {
        const data = [
            { id: 'sp_1', code: 'console.log(1)', name: 'A', version: '1.0', enabled: true, description: '', icon: '🧪', updateUrl: '' },
            { id: 'sp_2', code: 'console.log(2)', name: 'B', version: '2.0', enabled: false, description: 'desc', icon: '📦', updateUrl: 'http://x' },
        ];
        const r = validateSchema(data, schemas.subPluginRegistry);
        expect(r.ok).toBe(true);
        expect(r.data).toHaveLength(2);
    });

    it('filters out entries missing required fields', () => {
        const data = [
            { id: 'sp_1', code: 'ok' },
            { name: 'no-id-or-code' },           // missing id + code
            { id: 'sp_3' },                        // missing code
        ];
        const r = validateSchema(data, schemas.subPluginRegistry);
        expect(r.ok).toBe(true);
        expect(r.data).toHaveLength(1);
        expect(r.data[0].id).toBe('sp_1');
    });

    it('rejects non-array', () => {
        const r = validateSchema('not-array', schemas.subPluginRegistry);
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual([]);
    });
});

describe('schemas.updateBundle', () => {
    it('validates correct bundle structure', () => {
        const data = {
            versions: { 'Plugin A': { version: '1.0', file: 'a.js' } },
            code: { 'a.js': 'console.log("a")' },
        };
        const r = validateSchema(data, schemas.updateBundle);
        expect(r.ok).toBe(true);
    });

    it('fails when versions key is missing', () => {
        const r = validateSchema({ code: {} }, schemas.updateBundle);
        expect(r.ok).toBe(false);
    });

    it('returns fallback for non-object input', () => {
        const r = validateSchema('bad', schemas.updateBundle);
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual({ versions: {}, code: {} });
    });
});

describe('schemas.settingsBackup', () => {
    it('validates key-value backup object', () => {
        const r = validateSchema({ cpm_openai_key: 'sk-xxx', cpm_fallback_temp: '0.7' }, schemas.settingsBackup);
        expect(r.ok).toBe(true);
    });

    it('rejects array', () => {
        const r = validateSchema([1, 2], schemas.settingsBackup);
        expect(r.ok).toBe(false);
    });
});

// ── Missing schema and edge-case coverage ──

describe('schemas.bootStatus', () => {
    it('validates correct bootStatus object', () => {
        const r = validateSchema({ ts: Date.now(), version: '1.20.0' }, schemas.bootStatus);
        expect(r.ok).toBe(true);
        expect(r.data.ts).toBeTypeOf('number');
        expect(r.data.version).toBe('1.20.0');
    });

    it('applies property-level fallbacks for invalid fields', () => {
        const r = validateSchema({ ts: 'not-a-number', version: 42 }, schemas.bootStatus);
        expect(r.ok).toBe(true);
        expect(r.data.ts).toBe(0);       // number fallback
        expect(r.data.version).toBe('');  // string fallback
    });

    it('rejects non-object input', () => {
        const r = validateSchema('bad', schemas.bootStatus);
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual({});
    });

    it('accepts empty object (no required keys)', () => {
        const r = validateSchema({}, schemas.bootStatus);
        expect(r.ok).toBe(true);
    });
});

describe('schemas.updateBundleVersions', () => {
    it('validates a plain object', () => {
        const r = validateSchema({ 'Plugin A': { version: '1.0' } }, schemas.updateBundleVersions);
        expect(r.ok).toBe(true);
    });

    it('rejects non-object', () => {
        const r = validateSchema([1, 2], schemas.updateBundleVersions);
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual({});
    });

    it('rejects null', () => {
        const r = validateSchema(null, schemas.updateBundleVersions);
        expect(r.ok).toBe(false);
    });
});

describe('validateSchema — unknown type passthrough', () => {
    it('passes data through when schema type is unrecognized', () => {
        const r = validateSchema(42, { type: /** @type {any} */ ('custom') });
        expect(r.ok).toBe(true);
        expect(r.data).toBe(42);
    });

    it('passes object through with unknown type', () => {
        const data = { foo: 'bar' };
        const r = validateSchema(data, { type: /** @type {any} */ ('weird') });
        expect(r.ok).toBe(true);
        expect(r.data).toBe(data);
    });
});

describe('validateSchema — combined array constraints', () => {
    it('applies maxItems AND items filter together', () => {
        const r = validateSchema(
            [{ id: 'a' }, 'bad', { id: 'b' }, { id: 'c' }, 'bad2', { id: 'd' }],
            {
                type: 'array',
                maxItems: 4,               // truncates to first 4 elements
                items: { type: 'object' },  // then filters non-objects
            }
        );
        expect(r.ok).toBe(true);
        // First 4: [{id:'a'}, 'bad', {id:'b'}, {id:'c'}] → after items filter: [{id:'a'}, {id:'b'}, {id:'c'}]
        expect(r.data).toHaveLength(3);
    });

    it('array fallback defaults to [] when no explicit fallback', () => {
        const r = validateSchema('not-array', { type: 'array' });
        expect(r.ok).toBe(false);
        expect(r.fallback).toEqual([]);
    });
});

describe('validateSchema — string maxLength boundary', () => {
    it('does not truncate string of exactly maxLength', () => {
        const r = validateSchema('abcde', { type: 'string', maxLength: 5 });
        expect(r.ok).toBe(true);
        expect(r.data).toBe('abcde');
    });

    it('truncates string one char over maxLength', () => {
        const r = validateSchema('abcdef', { type: 'string', maxLength: 5 });
        expect(r.ok).toBe(true);
        expect(r.data).toBe('abcde');
    });
});
