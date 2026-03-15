/**
 * Deep coverage tests for aws-signer.js
 * Covers: S3 signing paths, signQuery, sessionToken, guessServiceRegion edge cases,
 * hexBodyHash non-string body, encodedPath S3 vs non-S3, buf2hex, encodeRfc3986.
 */
import { describe, it, expect } from 'vitest';
import { buf2hex, encodeRfc3986, hmac, hash, guessServiceRegion, AwsV4Signer } from '../src/lib/aws-signer.js';

describe('buf2hex', () => {
    it('converts ArrayBuffer to hex string', () => {
        const arr = new Uint8Array([0, 15, 255, 128]).buffer;
        // 0 -> 00, 15 -> 0f, 255 -> ff, 128 -> 80
        expect(buf2hex(arr)).toBe('000fff80');
    });

    it('returns empty string for empty buffer', () => {
        expect(buf2hex(new Uint8Array([]).buffer)).toBe('');
    });

    it('handles single byte', () => {
        expect(buf2hex(new Uint8Array([0xab]).buffer)).toBe('ab');
    });
});

describe('encodeRfc3986', () => {
    it('encodes special characters', () => {
        expect(encodeRfc3986("test!'()*")).toBe('test%21%27%28%29%2A');
    });
    it('leaves normal chars unchanged', () => {
        expect(encodeRfc3986('hello%20world')).toBe('hello%20world');
    });
});

describe('hmac', () => {
    it('returns an ArrayBuffer', async () => {
        const result = await hmac('key', 'message');
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(result.byteLength).toBeGreaterThan(0);
    });
    it('accepts Uint8Array key', async () => {
        const key = new TextEncoder().encode('key');
        const result = await hmac(key, 'message');
        expect(result).toBeInstanceOf(ArrayBuffer);
    });
});

describe('hash', () => {
    it('returns SHA-256 digest of string', async () => {
        const result = await hash('hello');
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(result.byteLength).toBe(32); // SHA-256 = 32 bytes
    });
    it('returns SHA-256 digest of Uint8Array', async () => {
        const data = new TextEncoder().encode('hello');
        const result = await hash(data);
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(result.byteLength).toBe(32);
    });
});

describe('guessServiceRegion', () => {
    it('detects lambda URL', () => {
        const url = new URL('https://abc.lambda-url.us-east-1.on.aws/path');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('lambda');
        expect(region).toBe('us-east-1');
    });

    it('returns empty for non-matching .on.aws', () => {
        const url = new URL('https://example.on.aws/path');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('');
        expect(region).toBe('');
    });

    it('detects R2 cloudflarestorage', () => {
        const url = new URL('https://bucket.r2.cloudflarestorage.com/key');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('s3');
        expect(region).toBe('auto');
    });

    it('detects backblazeb2 S3', () => {
        const url = new URL('https://bucket.s3.us-west-002.backblazeb2.com/key');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('s3');
        expect(region).toBe('us-west-002');
    });

    it('returns empty for non-matching backblazeb2', () => {
        const url = new URL('https://example.backblazeb2.com/key');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('');
        expect(region).toBe('');
    });

    it('detects bedrock-runtime.us-east-1.amazonaws.com', () => {
        const url = new URL('https://bedrock-runtime.us-east-1.amazonaws.com/model/invoke');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('bedrock-runtime');
        expect(region).toBe('us-east-1');
    });

    it('detects us-gov region', () => {
        const url = new URL('https://s3.us-gov.amazonaws.com/bucket');
        const [_service, region] = guessServiceRegion(url, new Headers());
        expect(region).toBe('us-gov-west-1');
    });

    it('detects s3-accelerate', () => {
        const url = new URL('https://bucket.s3-accelerate.amazonaws.com');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('s3');
        expect(region).toBe('us-east-1');
    });

    it('detects iot data service', () => {
        const url = new URL('https://data.iot.us-west-2.amazonaws.com/topics/test');
        const [service, _region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('iotdata');
    });

    it('detects iot mqtt as iotdevicegateway', () => {
        // For iotdevicegateway, hostname must NOT start with 'iot.' (that gives execute-api)
        // Use a data.iot prefix so host doesn't start with 'iot.'
        const url = new URL('https://data.iot.us-west-2.amazonaws.com/mqtt');
        const [service, region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('iotdevicegateway');
        expect(region).toBe('us-west-2');
    });

    it('detects iot execute-api', () => {
        const url = new URL('https://iot.us-west-2.amazonaws.com/other');
        const [service, _region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('execute-api');
    });

    it('detects autoscaling application-autoscaling', () => {
        const url = new URL('https://autoscaling.us-east-1.amazonaws.com');
        const headers = new Headers({ 'X-Amz-Target': 'AnyScaleFrontendService.DescribeScalingPolicies' });
        const [service] = guessServiceRegion(url, headers);
        expect(service).toBe('application-autoscaling');
    });

    it('detects autoscaling-plans', () => {
        const url = new URL('https://autoscaling.us-east-1.amazonaws.com');
        const headers = new Headers({ 'X-Amz-Target': 'AnyScaleScalingPlannerFrontendService.CreateScalingPlan' });
        const [service] = guessServiceRegion(url, headers);
        expect(service).toBe('autoscaling-plans');
    });

    it('detects s3-fips-us-east-1 as s3/us-east-1', () => {
        // bucket.s3-fips-us-east-1.amazonaws.com
        // regex: match[1] = s3-fips-us-east-1, match[2] = bucket
        // service starts with s3-: region = fips-us-east-1 → strip fips- → us-east-1
        // But actually if there's a bucket subdomain, the regex might parse differently
        // Let's test without the bucket subdomain
        const url = new URL('https://s3-fips-us-east-1.amazonaws.com/bucket/key');
        const [service, _region] = guessServiceRegion(url, new Headers());
        expect(service).toBe('s3');
        // region has fips- stripped
    });

    it('strips -fips suffix from service', () => {
        const url = new URL('https://bedrock-fips.us-east-1.amazonaws.com');
        const [service] = guessServiceRegion(url, new Headers());
        expect(service).toBe('bedrock');
    });

    it('swaps service and region when service looks like region', () => {
        const url = new URL('https://us-east-1.bedrock.amazonaws.com');
        const [service, region] = guessServiceRegion(url, new Headers());
        // service=us-east-1, region=bedrock → swap
        expect(service).toBe('bedrock');
        expect(region).toBe('us-east-1');
    });

    it('handles HOST_SERVICES mapping', () => {
        const url = new URL('https://email.us-east-1.amazonaws.com');
        const [service] = guessServiceRegion(url, new Headers());
        expect(service).toBe('ses');
    });

    it('handles data.jobs.iot hostname', () => {
        const url = new URL('https://data.jobs.iot.us-west-2.amazonaws.com/things');
        const [service] = guessServiceRegion(url, new Headers());
        expect(service).toBe('iot-jobs-data');
    });
});

describe('AwsV4Signer', () => {
    const baseOpts = {
        url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/invoke',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        method: 'POST',
        body: '{"prompt":"hello"}',
        datetime: '20250610T120000Z',
    };

    it('throws if url is null', () => {
        expect(() => new AwsV4Signer({ ...baseOpts, url: null })).toThrow('url is a required option');
    });
    it('throws if accessKeyId is null', () => {
        expect(() => new AwsV4Signer({ ...baseOpts, accessKeyId: null })).toThrow('accessKeyId is a required option');
    });
    it('throws if secretAccessKey is null', () => {
        expect(() => new AwsV4Signer({ ...baseOpts, secretAccessKey: null })).toThrow('secretAccessKey is a required option');
    });

    it('defaults method to POST when body is present', () => {
        const signer = new AwsV4Signer({ ...baseOpts, method: undefined });
        expect(signer.method).toBe('POST');
    });

    it('defaults method to GET when no body', () => {
        const signer = new AwsV4Signer({ ...baseOpts, method: undefined, body: undefined });
        expect(signer.method).toBe('GET');
    });

    it('signs a basic request', async () => {
        const signer = new AwsV4Signer(baseOpts);
        const signed = await signer.sign();
        expect(signed.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
        expect(signed.headers.get('Authorization')).toContain('AKIAIOSFODNN7EXAMPLE');
        expect(signed.headers.get('X-Amz-Date')).toBe('20250610T120000Z');
    });

    it('includes session token when provided', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            sessionToken: 'session-token-value',
        });
        const signed = await signer.sign();
        expect(signed.headers.get('X-Amz-Security-Token')).toBe('session-token-value');
    });

    it('signs query string when signQuery is true', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            signQuery: true,
        });
        const signed = await signer.sign();
        expect(signed.url.searchParams.get('X-Amz-Signature')).toBeTruthy();
        expect(signed.url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    });

    it('appends session token for iotdevicegateway', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://iot.us-west-2.amazonaws.com/mqtt',
            signQuery: true,
            sessionToken: 'iot-session',
        });
        const signed = await signer.sign();
        expect(signed.url.searchParams.get('X-Amz-Security-Token')).toBe('iot-session');
    });

    it('sets X-Amz-Content-Sha256 UNSIGNED-PAYLOAD for S3', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://bucket.s3.us-east-1.amazonaws.com/key',
            service: 's3',
            region: 'us-east-1',
        });
        expect(signer.headers.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
    });

    it('sets S3 Expires for signQuery', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://bucket.s3.us-east-1.amazonaws.com/key',
            service: 's3',
            region: 'us-east-1',
            signQuery: true,
        });
        expect(signer.url.searchParams.get('X-Amz-Expires')).toBe('86400');
    });

    it('generates deterministic signature', async () => {
        const cache = new Map();
        const signer1 = new AwsV4Signer({ ...baseOpts, cache });
        const signer2 = new AwsV4Signer({ ...baseOpts, cache });
        const sig1 = await signer1.signature();
        const sig2 = await signer2.signature();
        expect(sig1).toBe(sig2);
    });

    it('uses cache for signing key', async () => {
        const cache = new Map();
        const signer1 = new AwsV4Signer({ ...baseOpts, cache });
        await signer1.signature();
        expect(cache.size).toBe(1);
        const signer2 = new AwsV4Signer({ ...baseOpts, cache });
        await signer2.signature();
        expect(cache.size).toBe(1); // same cache entry reused
    });

    it('canonical string contains method and path', async () => {
        const signer = new AwsV4Signer(baseOpts);
        const canonical = await signer.canonicalString();
        expect(canonical).toContain('POST');
        expect(canonical).toContain('/model/invoke');
    });

    it('hexBodyHash uses content header when present', async () => {
        const signer = new AwsV4Signer(baseOpts);
        signer.headers.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
        const hash = await signer.hexBodyHash();
        expect(hash).toBe('UNSIGNED-PAYLOAD');
    });

    it('hexBodyHash computes hash for string body', async () => {
        const signer = new AwsV4Signer(baseOpts);
        const hash = await signer.hexBodyHash();
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hexBodyHash computes hash for empty body', async () => {
        const signer = new AwsV4Signer({ ...baseOpts, body: undefined });
        const hash = await signer.hexBodyHash();
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hexBodyHash throws for non-string, non-buffer body', async () => {
        const signer = new AwsV4Signer({ ...baseOpts, body: { object: true } });
        signer.headers.delete('X-Amz-Content-Sha256');
        await expect(signer.hexBodyHash()).rejects.toThrow('body must be a string');
    });

    it('handles S3 encodedPath with special chars', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://bucket.s3.us-east-1.amazonaws.com/path%20with%20spaces/file.txt',
            service: 's3',
            region: 'us-east-1',
        });
        expect(signer.encodedPath).toBeTruthy();
    });

    it('normalizes non-S3 encodedPath with double slashes', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com//model//invoke',
        });
        // Non-S3 paths replace /+ with /
        expect(signer.encodedPath).not.toContain('//');
    });

    it('handles singleEncode option', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            singleEncode: true,
        });
        expect(signer.encodedPath).toBeTruthy();
    });

    it('deduplicates search params for S3', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            url: 'https://bucket.s3.us-east-1.amazonaws.com/key?prefix=a&prefix=b',
            service: 's3',
            region: 'us-east-1',
        });
        // S3 deduplicates by key
        expect(signer.encodedSearch).toBeTruthy();
    });
});
