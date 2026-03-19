/**
 * @file vertex-auth.test.js — Vertex AI Service Account auth module tests
 * Covers: parseServiceAccountJson, looksLikeServiceAccountJson, getVertexBearerToken caching, invalidateTokenCache, clearAllTokenCaches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock crypto.subtle & Risu ──
const h = vi.hoisted(() => ({
    nativeFetch: vi.fn(),
    importKey: vi.fn(),
    sign: vi.fn(),
}));

vi.stubGlobal('Risu', { nativeFetch: h.nativeFetch });
vi.stubGlobal('crypto', {
    subtle: {
        importKey: h.importKey,
        sign: h.sign,
    }
});

// btoa/atob stubs (Node.js environment)
if (typeof globalThis.btoa === 'undefined') {
    vi.stubGlobal('btoa', (s) => Buffer.from(s, 'binary').toString('base64'));
    vi.stubGlobal('atob', (s) => Buffer.from(s, 'base64').toString('binary'));
}

const {
    parseServiceAccountJson,
    looksLikeServiceAccountJson,
    getVertexBearerToken,
    invalidateTokenCache,
    clearAllTokenCaches,
} = await import('../src/lib/vertex-auth.js');

// ── Sample SA JSON ──
// Use valid base64 inside PEM (doesn't need to be a real RSA key, just valid base64 for atob)
const FAKE_PEM = '-----BEGIN RSA PRIVATE KEY-----\n' +
    'MIIBogIBAAJBALRiMLAH/BmV2ZqIQywMEE0+MJWAPOEExYl0LKFSaFKPIjJFP1X3\n' +
    'VqUEP2M4ARJPFBCX+GJgmHJFGHJ1r1MCAwEAAQ==\n' +
    '-----END RSA PRIVATE KEY-----\n';

const VALID_SA = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: FAKE_PEM,
});

const _VALID_SA_OBJ = JSON.parse(VALID_SA);

// ────────────────────────────────────────────
// parseServiceAccountJson
// ────────────────────────────────────────────
describe('parseServiceAccountJson', () => {
    it('parses valid SA JSON', () => {
        const result = parseServiceAccountJson(VALID_SA);
        expect(result.client_email).toBe('test@test-project.iam.gserviceaccount.com');
        expect(result.private_key).toContain('BEGIN RSA PRIVATE KEY');
        expect(result.project_id).toBe('test-project');
    });

    it('rejects empty string', () => {
        expect(() => parseServiceAccountJson('')).toThrow('비어 있습니다');
    });

    it('rejects null/undefined', () => {
        expect(() => parseServiceAccountJson(null)).toThrow('비어 있습니다');
        expect(() => parseServiceAccountJson(undefined)).toThrow('비어 있습니다');
    });

    it('rejects Windows file path', () => {
        expect(() => parseServiceAccountJson('C:\\Users\\credentials.json')).toThrow('파일 경로');
    });

    it('rejects UNC path', () => {
        expect(() => parseServiceAccountJson('\\\\server\\share\\key.json')).toThrow('파일 경로');
    });

    it('rejects invalid JSON', () => {
        expect(() => parseServiceAccountJson('not json')).toThrow('JSON 파싱 오류');
    });

    it('rejects array', () => {
        expect(() => parseServiceAccountJson('[]')).toThrow('JSON 객체 형식');
    });

    it('rejects missing client_email', () => {
        const json = JSON.stringify({ private_key: '-----BEGIN RSA PRIVATE KEY-----\nfoo\n-----END RSA PRIVATE KEY-----' });
        expect(() => parseServiceAccountJson(json)).toThrow('client_email 또는 private_key가 누락');
    });

    it('rejects missing private_key', () => {
        const json = JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com' });
        expect(() => parseServiceAccountJson(json)).toThrow('client_email 또는 private_key가 누락');
    });

    it('rejects invalid PEM format', () => {
        const json = JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com', private_key: 'not-a-pem-key' });
        expect(() => parseServiceAccountJson(json)).toThrow('PEM 형식');
    });

    it('trims whitespace before parsing', () => {
        const result = parseServiceAccountJson('  ' + VALID_SA + '  ');
        expect(result.client_email).toBe('test@test-project.iam.gserviceaccount.com');
    });
});

// ────────────────────────────────────────────
// looksLikeServiceAccountJson
// ────────────────────────────────────────────
describe('looksLikeServiceAccountJson', () => {
    it('returns true for valid SA JSON', () => {
        expect(looksLikeServiceAccountJson(VALID_SA)).toBe(true);
    });

    it('returns false for empty/null/undefined', () => {
        expect(looksLikeServiceAccountJson('')).toBe(false);
        expect(looksLikeServiceAccountJson(null)).toBe(false);
        expect(looksLikeServiceAccountJson(undefined)).toBe(false);
    });

    it('returns false for non-string', () => {
        expect(looksLikeServiceAccountJson(42)).toBe(false);
        expect(looksLikeServiceAccountJson({})).toBe(false);
    });

    it('returns false for non-object JSON', () => {
        expect(looksLikeServiceAccountJson('"hello"')).toBe(false);
    });

    it('returns false for object missing type field', () => {
        expect(looksLikeServiceAccountJson(JSON.stringify({ client_email: 'a', private_key: 'b' }))).toBe(false);
    });

    it('returns false for wrong type', () => {
        expect(looksLikeServiceAccountJson(JSON.stringify({ type: 'oauth2', client_email: 'a', private_key: 'b' }))).toBe(false);
    });

    it('returns false for missing client_email', () => {
        expect(looksLikeServiceAccountJson(JSON.stringify({ type: 'service_account', private_key: 'b' }))).toBe(false);
    });

    it('returns false for plain API key', () => {
        expect(looksLikeServiceAccountJson('sk-abcdef1234567890')).toBe(false);
    });

    it('returns false for invalid JSON starting with {', () => {
        expect(looksLikeServiceAccountJson('{invalid json}')).toBe(false);
    });
});

// ────────────────────────────────────────────
// getVertexBearerToken
// ────────────────────────────────────────────
describe('getVertexBearerToken', () => {
    const FAKE_TOKEN = 'ya29.fake-access-token';

    beforeEach(() => {
        clearAllTokenCaches();
        h.nativeFetch.mockReset();
        h.importKey.mockReset();
        h.sign.mockReset();

        // Stub crypto operations
        h.importKey.mockResolvedValue('fake-key-obj');
        h.sign.mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);

        // Stub OAuth token response
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: FAKE_TOKEN, expires_in: 3600 }),
        });
    });

    it('returns access token on success', async () => {
        const token = await getVertexBearerToken(VALID_SA);
        expect(token).toBe(FAKE_TOKEN);
    });

    it('calls crypto.subtle.importKey with pkcs8', async () => {
        await getVertexBearerToken(VALID_SA);
        expect(h.importKey).toHaveBeenCalledWith(
            'pkcs8',
            expect.any(ArrayBuffer),
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );
    });

    it('calls nativeFetch with OAuth endpoint', async () => {
        await getVertexBearerToken(VALID_SA);
        expect(h.nativeFetch).toHaveBeenCalledWith(
            'https://oauth2.googleapis.com/token',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            })
        );
    });

    it('returns cached token on second call', async () => {
        const t1 = await getVertexBearerToken(VALID_SA);
        const t2 = await getVertexBearerToken(VALID_SA);
        expect(t1).toBe(FAKE_TOKEN);
        expect(t2).toBe(FAKE_TOKEN);
        // Only 1 fetch - second was cached
        expect(h.nativeFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on OAuth failure', async () => {
        h.nativeFetch.mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve('Unauthorized'),
        });
        await expect(getVertexBearerToken(VALID_SA)).rejects.toThrow('OAuth 토큰 교환 실패');
    });

    it('throws on invalid SA JSON', async () => {
        await expect(getVertexBearerToken('not-json')).rejects.toThrow('JSON 파싱 오류');
    });
});

// ────────────────────────────────────────────
// invalidateTokenCache
// ────────────────────────────────────────────
describe('invalidateTokenCache', () => {
    beforeEach(() => {
        clearAllTokenCaches();
        h.nativeFetch.mockReset();
        h.importKey.mockReset();
        h.sign.mockReset();
        h.importKey.mockResolvedValue('fake-key-obj');
        h.sign.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'token1', expires_in: 3600 }),
        });
    });

    it('invalidates cache so next call fetches again', async () => {
        await getVertexBearerToken(VALID_SA);
        expect(h.nativeFetch).toHaveBeenCalledTimes(1);

        invalidateTokenCache(VALID_SA);

        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'token2', expires_in: 3600 }),
        });

        const t = await getVertexBearerToken(VALID_SA);
        expect(t).toBe('token2');
        expect(h.nativeFetch).toHaveBeenCalledTimes(2);
    });

    it('does not throw for invalid JSON', () => {
        expect(() => invalidateTokenCache('bad-json')).not.toThrow();
    });
});

// ────────────────────────────────────────────
// clearAllTokenCaches
// ────────────────────────────────────────────
describe('clearAllTokenCaches', () => {
    beforeEach(() => {
        clearAllTokenCaches();
        h.importKey.mockResolvedValue('fake-key-obj');
        h.sign.mockResolvedValue(new Uint8Array([5]).buffer);
        h.nativeFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'tok-clear', expires_in: 3600 }),
        });
    });

    it('clears all caches', async () => {
        await getVertexBearerToken(VALID_SA);
        expect(h.nativeFetch).toHaveBeenCalledTimes(1);

        clearAllTokenCaches();

        const t = await getVertexBearerToken(VALID_SA);
        expect(t).toBe('tok-clear');
        expect(h.nativeFetch).toHaveBeenCalledTimes(2);
    });
});
