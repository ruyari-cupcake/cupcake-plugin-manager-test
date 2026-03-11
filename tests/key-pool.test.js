import { describe, it, expect, beforeEach } from 'vitest';
import { KeyPool } from '../src/lib/key-pool.js';

describe('KeyPool', () => {
    beforeEach(() => {
        // Reset pools and inject mock getArg
        KeyPool._pools = {};
        KeyPool.setGetArgFn(async (key) => {
            const store = {
                'test_keys': 'key1 key2 key3',
                'single_key': 'onlykey',
                'empty_keys': '',
                'json_keys': '[{"key":"a"},{"key":"b"}]',
            };
            return store[key] || '';
        });
    });

    describe('pick', () => {
        it('returns a key from the pool', async () => {
            const key = await KeyPool.pick('test_keys');
            expect(['key1', 'key2', 'key3']).toContain(key);
        });

        it('returns single key when only one exists', async () => {
            const key = await KeyPool.pick('single_key');
            expect(key).toBe('onlykey');
        });

        it('returns empty string for empty pool', async () => {
            const key = await KeyPool.pick('empty_keys');
            expect(key).toBe('');
        });

        it('returns empty string for missing arg', async () => {
            const key = await KeyPool.pick('nonexistent');
            expect(key).toBe('');
        });

        it('caches parsed keys', async () => {
            await KeyPool.pick('test_keys');
            expect(KeyPool._pools['test_keys'].keys).toEqual(['key1', 'key2', 'key3']);
        });

        it('uses inline pool when _inline flag is set', async () => {
            KeyPool._pools['inline_test'] = {
                _inline: true,
                keys: ['custom1', 'custom2'],
            };
            const key = await KeyPool.pick('inline_test');
            expect(['custom1', 'custom2']).toContain(key);
        });
    });

    describe('drain', () => {
        it('removes a key from the pool', async () => {
            await KeyPool.pick('test_keys'); // initialize pool
            const remaining = KeyPool.drain('test_keys', 'key2');
            expect(remaining).toBe(2);
            expect(KeyPool._pools['test_keys'].keys).not.toContain('key2');
        });

        it('returns 0 for non-existent pool', () => {
            expect(KeyPool.drain('nonexistent', 'key')).toBe(0);
        });

        it('handles draining non-existent key gracefully', async () => {
            await KeyPool.pick('test_keys');
            const remaining = KeyPool.drain('test_keys', 'key_not_in_pool');
            expect(remaining).toBe(3); // no change
        });
    });

    describe('remaining', () => {
        it('returns 0 for non-existent pool', () => {
            expect(KeyPool.remaining('nonexistent')).toBe(0);
        });

        it('returns correct count after pick', async () => {
            await KeyPool.pick('test_keys');
            expect(KeyPool.remaining('test_keys')).toBe(3);
        });

        it('decreases after drain', async () => {
            await KeyPool.pick('test_keys');
            KeyPool.drain('test_keys', 'key1');
            expect(KeyPool.remaining('test_keys')).toBe(2);
        });
    });

    describe('reset', () => {
        it('removes pool entry', async () => {
            await KeyPool.pick('test_keys');
            KeyPool.reset('test_keys');
            expect(KeyPool._pools['test_keys']).toBeUndefined();
        });
    });

    describe('withRotation', () => {
        it('returns successful result immediately', async () => {
            const result = await KeyPool.withRotation('test_keys', async (key) => {
                return { success: true, content: `response with ${key}` };
            });
            expect(result.success).toBe(true);
        });

        it('rotates on retryable error (429)', async () => {
            let attempt = 0;
            const result = await KeyPool.withRotation('test_keys', async (_key) => {
                attempt++;
                if (attempt < 3) return { success: false, _status: 429, content: 'rate limited' };
                return { success: true, content: 'finally worked' };
            });
            expect(result.success).toBe(true);
            expect(attempt).toBe(3);
        });

        it('stops on non-retryable error', async () => {
            let attempt = 0;
            const result = await KeyPool.withRotation('test_keys', async (_key) => {
                attempt++;
                return { success: false, _status: 401, content: 'unauthorized' };
            });
            expect(result.success).toBe(false);
            expect(result._status).toBe(401);
            expect(attempt).toBe(1);
        });

        it('returns error when all keys exhausted', async () => {
            const result = await KeyPool.withRotation('test_keys', async (_key) => {
                return { success: false, _status: 429, content: 'rate limited' };
            });
            expect(result.success).toBe(false);
        });

        it('handles empty key pool', async () => {
            const result = await KeyPool.withRotation('empty_keys', async (_key) => {
                return { success: true };
            });
            expect(result.success).toBe(false);
            expect(result.content).toContain('사용 가능한 API 키가 없습니다');
        });
    });

    describe('_parseJsonCredentials', () => {
        it('parses JSON array', () => {
            const result = KeyPool._parseJsonCredentials('[{"a":1},{"b":2}]');
            expect(result).toHaveLength(2);
        });

        it('parses comma-separated JSON objects', () => {
            const result = KeyPool._parseJsonCredentials('{"a":1},{"b":2}');
            expect(result).toHaveLength(2);
        });

        it('parses single JSON object', () => {
            const result = KeyPool._parseJsonCredentials('{"key":"value"}');
            expect(result).toHaveLength(1);
        });

        it('returns empty array for empty string', () => {
            expect(KeyPool._parseJsonCredentials('')).toEqual([]);
            expect(KeyPool._parseJsonCredentials(null)).toEqual([]);
        });

        it('returns empty array for invalid JSON', () => {
            expect(KeyPool._parseJsonCredentials('not json')).toEqual([]);
        });
    });

    describe('pickJson', () => {
        it('returns a JSON credential string', async () => {
            const cred = await KeyPool.pickJson('json_keys');
            expect(cred).toBeTruthy();
            const parsed = JSON.parse(cred);
            expect(parsed).toHaveProperty('key');
        });
    });

    describe('withJsonRotation', () => {
        it('rotates JSON credentials on retryable error', async () => {
            let attempt = 0;
            const result = await KeyPool.withJsonRotation('json_keys', async (_credJson) => {
                attempt++;
                if (attempt < 2) return { success: false, _status: 429 };
                return { success: true, content: 'ok' };
            });
            expect(result.success).toBe(true);
            expect(attempt).toBe(2);
        });
    });
});
