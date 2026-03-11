/**
 * Deep coverage tests for key-pool.js
 * Covers: JSON credential parsing edge cases, withRotation drain/retry,
 * withJsonRotation, _buildJsonCredentialError, Windows path detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPool } from '../src/lib/key-pool.js';

describe('KeyPool — deep coverage', () => {
    beforeEach(() => {
        KeyPool._pools = {};
        KeyPool.setGetArgFn(async () => '');
    });

    // ── _looksLikeWindowsPath ──
    describe('_looksLikeWindowsPath', () => {
        it('returns true for C:\\ style paths', () => {
            expect(KeyPool._looksLikeWindowsPath('C:\\Users\\file.json')).toBe(true);
        });
        it('returns true for UNC paths', () => {
            expect(KeyPool._looksLikeWindowsPath('\\\\server\\share')).toBe(true);
        });
        it('returns false for JSON strings', () => {
            expect(KeyPool._looksLikeWindowsPath('{"type":"service_account"}')).toBe(false);
        });
        it('returns false for null/undefined/empty', () => {
            expect(KeyPool._looksLikeWindowsPath(null)).toBe(false);
            expect(KeyPool._looksLikeWindowsPath(undefined)).toBe(false);
            expect(KeyPool._looksLikeWindowsPath('')).toBe(false);
        });
    });

    // ── _buildJsonCredentialError ──
    describe('_buildJsonCredentialError', () => {
        it('returns Windows path error for Windows paths', () => {
            const err = KeyPool._buildJsonCredentialError('C:\\path\\file.json');
            expect(err.message).toContain('Windows');
        });
        it('returns Bad Unicode escape error', () => {
            const err = KeyPool._buildJsonCredentialError('{}', new Error('Bad Unicode escape'));
            expect(err.message).toContain('역슬래시');
        });
        it('returns generic parse error for other errors', () => {
            const err = KeyPool._buildJsonCredentialError('{}', new Error('Unexpected token'));
            expect(err.message).toContain('Unexpected token');
        });
        it('handles missing error message', () => {
            const err = KeyPool._buildJsonCredentialError('{}', null);
            expect(err.message).toContain('JSON');
        });
    });

    // ── _parseJsonCredentials ──
    describe('_parseJsonCredentials', () => {
        it('returns empty for empty string', () => {
            expect(KeyPool._parseJsonCredentials('')).toEqual([]);
        });
        it('returns empty for null/undefined', () => {
            expect(KeyPool._parseJsonCredentials(null)).toEqual([]);
            expect(KeyPool._parseJsonCredentials(undefined)).toEqual([]);
        });
        it('throws for Windows path', () => {
            expect(() => KeyPool._parseJsonCredentials('C:\\Users\\file.json')).toThrow('Windows');
        });
        it('parses single JSON object', () => {
            const r = KeyPool._parseJsonCredentials('{"type":"service_account"}');
            expect(r.length).toBe(1);
            expect(JSON.parse(r[0]).type).toBe('service_account');
        });
        it('parses JSON array of objects', () => {
            const r = KeyPool._parseJsonCredentials('[{"a":1},{"b":2}]');
            expect(r.length).toBe(2);
        });
        it('parses comma-separated JSON objects', () => {
            const r = KeyPool._parseJsonCredentials('{"a":1},{"b":2}');
            expect(r.length).toBe(2);
        });
        it('filters non-objects from array', () => {
            const r = KeyPool._parseJsonCredentials('[1, "str", {"a":1}, null]');
            expect(r.length).toBe(1);
        });
        it('returns empty for plain string', () => {
            const r = KeyPool._parseJsonCredentials('not json at all');
            expect(r).toEqual([]);
        });
    });

    // ── pick ──
    describe('pick', () => {
        it('returns empty for empty keys', async () => {
            KeyPool.setGetArgFn(async () => '');
            const k = await KeyPool.pick('api_key');
            expect(k).toBe('');
        });
        it('picks from whitespace-separated keys', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2 key3');
            const k = await KeyPool.pick('api_key');
            expect(['key1', 'key2', 'key3']).toContain(k);
        });
        it('reuses parsed pool when raw value unchanged', async () => {
            let callCount = 0;
            KeyPool.setGetArgFn(async () => { callCount++; return 'k1 k2'; });
            await KeyPool.pick('api_key');
            await KeyPool.pick('api_key');
            // getArg is called every time to check if raw changed
            expect(callCount).toBe(2);
            // But the pool is the same parsed set
            expect(KeyPool._pools['api_key'].keys).toEqual(['k1', 'k2']);
        });
        it('re-parses if raw value changes', async () => {
            let val = 'key1';
            KeyPool.setGetArgFn(async () => val);
            await KeyPool.pick('api_key');
            val = 'key2 key3';
            const k = await KeyPool.pick('api_key');
            expect(['key2', 'key3']).toContain(k);
        });
        it('throws if _getArgFn not set', async () => {
            KeyPool._getArgFn = null;
            await expect(KeyPool.pick('x')).rejects.toThrow('_getArgFn not set');
        });
        it('uses inline pool when available', async () => {
            KeyPool._pools['inline_test'] = { _inline: true, keys: ['a', 'b'] };
            const k = await KeyPool.pick('inline_test');
            expect(['a', 'b']).toContain(k);
        });
    });

    // ── drain ──
    describe('drain', () => {
        it('removes the specified key from pool', () => {
            KeyPool._pools['x'] = { keys: ['a', 'b', 'c'], lastRaw: 'a b c' };
            const remaining = KeyPool.drain('x', 'b');
            expect(remaining).toBe(2);
            expect(KeyPool._pools['x'].keys).toEqual(['a', 'c']);
        });
        it('returns 0 when no pool exists', () => {
            expect(KeyPool.drain('nonexistent', 'key')).toBe(0);
        });
        it('does nothing for key not in pool', () => {
            KeyPool._pools['x'] = { keys: ['a'], lastRaw: 'a' };
            expect(KeyPool.drain('x', 'z')).toBe(1);
        });
    });

    // ── remaining ──
    describe('remaining', () => {
        it('returns 0 for nonexistent pool', () => {
            expect(KeyPool.remaining('nope')).toBe(0);
        });
        it('returns correct count', () => {
            KeyPool._pools['x'] = { keys: ['a', 'b'] };
            expect(KeyPool.remaining('x')).toBe(2);
        });
    });

    // ── reset ──
    describe('reset', () => {
        it('deletes the pool', () => {
            KeyPool._pools['x'] = { keys: ['a'] };
            KeyPool.reset('x');
            expect(KeyPool._pools['x']).toBeUndefined();
        });
    });

    // ── withRotation ──
    describe('withRotation', () => {
        it('returns success on first try', async () => {
            KeyPool.setGetArgFn(async () => 'key1');
            const result = await KeyPool.withRotation('k', async (key) => {
                return { success: true, content: `ok-${key}` };
            });
            expect(result.success).toBe(true);
            expect(result.content).toBe('ok-key1');
        });

        it('retries on 429 and drains key', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2');
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async (key) => {
                attempt++;
                if (attempt === 1) return { success: false, _status: 429, content: 'rate limited' };
                return { success: true, content: `ok-${key}` };
            });
            expect(result.success).toBe(true);
            expect(attempt).toBe(2);
        });

        it('returns last result when all keys exhausted', async () => {
            KeyPool.setGetArgFn(async () => 'key1');
            const result = await KeyPool.withRotation('k', async () => {
                return { success: false, _status: 429, content: 'rate limited' };
            });
            expect(result.success).toBe(false);
            expect(result.content).toBe('rate limited');
        });

        it('returns error when no keys available', async () => {
            KeyPool.setGetArgFn(async () => '');
            const result = await KeyPool.withRotation('k', async () => {
                return { success: true, content: 'ok' };
            });
            expect(result.success).toBe(false);
            expect(result.content).toContain('API');
        });

        it('returns non-retryable failures immediately', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2');
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async () => {
                attempt++;
                return { success: false, _status: 401, content: 'unauthorized' };
            });
            expect(attempt).toBe(1);
            expect(result.content).toBe('unauthorized');
        });

        it('supports custom isRetryable', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2');
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async () => {
                attempt++;
                if (attempt === 1) return { success: false, _status: 500, content: 'server error' };
                return { success: true, content: 'ok' };
            }, { isRetryable: (r) => r._status === 500 });
            expect(result.success).toBe(true);
            expect(attempt).toBe(2);
        });

        it('respects maxRetries', async () => {
            KeyPool._pools['k'] = { _inline: true, keys: Array(100).fill('key') };
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async () => {
                attempt++;
                return { success: false, _status: 429, content: 'rate limited' };
            }, { maxRetries: 3 });
            expect(attempt).toBe(3);
            expect(result.success).toBe(false);
            expect(result.content).toContain('최대 재시도');
        });

        it('retries 503 service unavailable', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2');
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async () => {
                attempt++;
                if (attempt === 1) return { success: false, _status: 503, content: 'unavailable' };
                return { success: true, content: 'ok' };
            });
            expect(result.success).toBe(true);
        });

        it('retries 529 overloaded', async () => {
            KeyPool.setGetArgFn(async () => 'key1 key2');
            let attempt = 0;
            const result = await KeyPool.withRotation('k', async () => {
                attempt++;
                if (attempt === 1) return { success: false, _status: 529, content: 'overloaded' };
                return { success: true, content: 'ok' };
            });
            expect(result.success).toBe(true);
        });
    });

    // ── pickJson ──
    describe('pickJson', () => {
        it('returns empty for empty input', async () => {
            KeyPool.setGetArgFn(async () => '');
            const r = await KeyPool.pickJson('cred');
            expect(r).toBe('');
        });

        it('returns JSON credential string', async () => {
            KeyPool.setGetArgFn(async () => '{"type":"service_account","client_email":"test@test.iam.gserviceaccount.com"}');
            const r = await KeyPool.pickJson('cred');
            const parsed = JSON.parse(r);
            expect(parsed.type).toBe('service_account');
        });

        it('picks from multiple JSON credentials', async () => {
            KeyPool.setGetArgFn(async () => '[{"id":1},{"id":2}]');
            const r = await KeyPool.pickJson('cred');
            const parsed = JSON.parse(r);
            expect([1, 2]).toContain(parsed.id);
        });

        it('handles parse error gracefully', async () => {
            KeyPool.setGetArgFn(async () => 'C:\\bad\\path');
            const r = await KeyPool.pickJson('cred');
            expect(r).toBe('');
            expect(KeyPool._pools['cred'].error).toContain('Windows');
        });

        it('throws if _getArgFn not set', async () => {
            KeyPool._getArgFn = null;
            await expect(KeyPool.pickJson('x')).rejects.toThrow('_getArgFn not set');
        });
    });

    // ── withJsonRotation ──
    describe('withJsonRotation', () => {
        it('returns success on first try', async () => {
            KeyPool.setGetArgFn(async () => '{"type":"sa"}');
            const result = await KeyPool.withJsonRotation('cred', async (json) => {
                return { success: true, content: `ok-${JSON.parse(json).type}` };
            });
            expect(result.success).toBe(true);
            expect(result.content).toBe('ok-sa');
        });

        it('returns error message when no credentials available', async () => {
            KeyPool.setGetArgFn(async () => '');
            const result = await KeyPool.withJsonRotation('cred', async () => ({ success: true, content: 'ok' }));
            expect(result.success).toBe(false);
            expect(result.content).toContain('JSON');
        });

        it('returns stored error message when parsing failed', async () => {
            KeyPool.setGetArgFn(async () => 'C:\\bad\\path');
            const result = await KeyPool.withJsonRotation('cred', async () => ({ success: true, content: 'ok' }));
            expect(result.success).toBe(false);
            expect(result.content).toContain('Windows');
        });

        it('retries on 429 and drains credential', async () => {
            KeyPool.setGetArgFn(async () => '[{"id":1},{"id":2}]');
            let attempt = 0;
            const result = await KeyPool.withJsonRotation('cred', async () => {
                attempt++;
                if (attempt === 1) return { success: false, _status: 429, content: 'rate limited' };
                return { success: true, content: 'ok' };
            });
            expect(result.success).toBe(true);
        });

        it('returns last result when all JSON credentials exhausted', async () => {
            KeyPool.setGetArgFn(async () => '{"id":1}');
            const result = await KeyPool.withJsonRotation('cred', async () => {
                return { success: false, _status: 429, content: 'rate limited' };
            });
            expect(result.success).toBe(false);
        });

        it('respects maxRetries for JSON rotation', async () => {
            KeyPool.setGetArgFn(async () => '[{"id":1},{"id":2},{"id":3},{"id":4},{"id":5}]');
            let attempt = 0;
            const result = await KeyPool.withJsonRotation('cred', async () => {
                attempt++;
                return { success: false, _status: 429, content: 'rate limited' };
            }, { maxRetries: 2 });
            expect(attempt).toBe(2);
            expect(result.content).toContain('최대 재시도');
        });
    });
});
