/**
 * integration-auto-updater.test.js — Integration tests for auto-updater.js
 * uncovered branches.
 *
 * Targets:
 *   L547-551 (Content-Length mismatch → incomplete download + retry/return error)
 *   L583-587 (retry loop exhaustion → error return after MAX_RETRIES)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    risu: {
        log: vi.fn(),
        nativeFetch: vi.fn(),
        risuFetch: vi.fn(),
        pluginStorage: {
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        },
    },
    cpmVersion: '1.20.7',
}));

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: h.cpmVersion,
}));
vi.mock('../src/lib/endpoints.js', () => ({
    VERSIONS_URL: 'https://test.example.com/versions.json',
    MAIN_UPDATE_URL: 'https://test.example.com/provider-manager.js',
    UPDATE_BUNDLE_URL: 'https://test.example.com/update-bundle.json',
}));

import { autoUpdaterMethods } from '../src/lib/auto-updater.js';

describe('auto-updater — download integrity and retry tests', () => {
    /** @type {any} */
    let updater;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });

        // Create a "this" context that simulates SubPluginManager
        updater = {
            ...autoUpdaterMethods,
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * Helper: make bundle attempt always fail so we fall through to direct download
     */
    function failBundleAttempt() {
        // risuFetch is used for bundle fetch and versions manifest
        h.risu.risuFetch.mockImplementation(async (url) => {
            // First call = bundle attempt → fail
            if (url.includes('update-bundle')) {
                return { data: null, status: 404 };
            }
            // Versions manifest → fail (no SHA verification)
            if (url.includes('versions')) {
                throw new Error('versions manifest unavailable');
            }
            return { data: null, status: 500 };
        });
    }

    describe('L547-551: Content-Length mismatch — incomplete download', () => {
        it('retries when Content-Length exceeds actual body bytes (attempt < MAX_RETRIES)', async () => {
            failBundleAttempt();

            let attempt = 0;
            h.risu.nativeFetch.mockImplementation(async () => {
                attempt++;
                if (attempt <= 2) {
                    // Return incomplete download: Content-Length says 1000, but body is shorter
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (name) => name === 'content-length' ? '1000' : null,
                        },
                        text: async () => 'short',
                    };
                }
                // 3rd attempt: return complete download
                return {
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    text: async () => '// valid plugin code here',
                };
            });

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(true);
            expect(result.code).toBe('// valid plugin code here');
            expect(attempt).toBe(3);
        });

        it('returns error when all retries have Content-Length mismatch', async () => {
            failBundleAttempt();

            h.risu.nativeFetch.mockImplementation(async () => ({
                ok: true,
                status: 200,
                headers: {
                    get: (name) => name === 'content-length' ? '5000' : null,
                },
                text: async () => 'x',
            }));

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(false);
            expect(result.error).toContain('불완전');
        });
    });

    describe('L583-587: retry loop exhaustion after errors', () => {
        it('returns error after MAX_RETRIES nativeFetch failures', async () => {
            failBundleAttempt();

            h.risu.nativeFetch.mockRejectedValue(new Error('network error'));

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(false);
            expect(result.error).toContain('다운로드 실패');
            expect(result.error).toContain('3회 시도');
        });

        it('returns error when HTTP status is non-2xx on all attempts', async () => {
            failBundleAttempt();

            h.risu.nativeFetch.mockImplementation(async () => ({
                ok: false,
                status: 500,
                headers: { get: () => null },
            }));

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(false);
            expect(result.error).toContain('다운로드 실패');
        });

        it('succeeds on second attempt after first failure', async () => {
            failBundleAttempt();

            let attempt = 0;
            h.risu.nativeFetch.mockImplementation(async () => {
                attempt++;
                if (attempt === 1) throw new Error('temporary failure');
                return {
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    text: async () => '// recovered plugin code',
                };
            });

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(true);
            expect(result.code).toBe('// recovered plugin code');
        });
    });

    describe('nativeFetch fallback to risuFetch', () => {
        it('falls back to risuFetch when nativeFetch throws', async () => {
            // Bundle attempt fails
            h.risu.risuFetch.mockImplementation(async (url) => {
                if (url.includes('update-bundle')) return { data: null, status: 404 };
                if (url.includes('versions')) throw new Error('versions unavailable');
                // Fallback fetch for direct download
                return { data: '// fallback code', status: 200 };
            });

            h.risu.nativeFetch.mockRejectedValue(new Error('native not available'));

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(true);
            expect(result.code).toBe('// fallback code');
        });

        it('returns error when risuFetch fallback also fails', async () => {
            h.risu.risuFetch.mockImplementation(async (url) => {
                if (url.includes('update-bundle')) return { data: null, status: 404 };
                if (url.includes('versions')) throw new Error('unavailable');
                return { data: null, status: 500 };
            });

            h.risu.nativeFetch.mockRejectedValue(new Error('native not available'));

            const result = await updater._downloadMainPluginCode();
            expect(result.ok).toBe(false);
        });
    });
});
