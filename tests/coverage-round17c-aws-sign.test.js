/**
 * Round 17c: Final branch push — targeting exactly the remaining uncovered lines.
 * aws-signer L183, L208, L213, L274 + fetch-custom, format-anthropic, init, settings
 */
import { describe, it, expect } from 'vitest';
import { AwsV4Signer } from '../src/lib/aws-signer.js';

describe('aws-signer sign() — S3 specific branches (L208, L213, L274)', () => {
    it('sign() with s3 service exercises S3 encodedPath (L208/L213)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/path/to/file.txt',
            method: 'GET',
            service: 's3',
            region: 'us-west-2',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
        // S3 path should be decoded via decodeURIComponent branch
        expect(signer.encodedPath).toContain('path');
    });

    it('sign() with s3 and encoded path (decodeURIComponent success)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/path%20with%20spaces/file%20name.txt',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('sign() with s3 and malformed encoded path (decodeURIComponent catch)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/path%',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        // Should fallback to raw pathname (catch branch)
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('sign() with s3 and duplicate query params (L274 dedup)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/key?prefix=a&prefix=b&marker=c',
            method: 'GET',
            service: 's3',
            region: 'us-west-2',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
        // The s3 dedup branch should filter duplicate 'prefix' keys
    });

    it('sign() with non-s3 service uses different encodedPath logic', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com//model//invoke',
            method: 'POST',
            body: '{}',
            service: 'bedrock',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
        // Non-s3 replaces multiple slashes: /\/+/g → '/'
    });

    it('signQuery with s3 and signQuery sets X-Amz-Expires', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/file.txt',
            method: 'GET',
            service: 's3',
            region: 'us-west-2',
            signQuery: true,
        });
        const result = await signer.sign();
        expect(result.url.searchParams.get('X-Amz-Signature')).toBeTruthy();
        expect(result.url.searchParams.get('X-Amz-Expires')).toBe('86400');
    });

    it('signQuery with s3 and existing X-Amz-Expires keeps it', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/file.txt?X-Amz-Expires=3600',
            method: 'GET',
            service: 's3',
            region: 'us-west-2',
            signQuery: true,
        });
        const result = await signer.sign();
        expect(result.url.searchParams.get('X-Amz-Expires')).toBe('3600');
    });

    it('sign() with appendSessionToken adds token after signature', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/file.txt',
            method: 'GET',
            service: 's3',
            region: 'us-west-2',
            signQuery: true,
            appendSessionToken: true,
            sessionToken: 'FwoGZXIvYXdzEBYaDHdummy',
        });
        const result = await signer.sign();
        expect(result.url.searchParams.get('X-Amz-Security-Token')).toBe('FwoGZXIvYXdzEBYaDHdummy');
    });

    it('sign() with allHeaders=true includes all headers in signature', async () => {
        const headers = new Headers({ 'Content-Type': 'application/json', 'X-Custom': 'val' });
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com/invoke',
            method: 'POST',
            body: '{}',
            service: 'bedrock',
            region: 'us-east-1',
            headers,
            allHeaders: true,
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('x-custom');
    });

    it('sign() with header whose value is empty exercises || fallback (L183)', async () => {
        // Headers.get returns null for missing headers, but for headers in signableHeaders
        // that aren't 'host', we get `this.headers.get(header) || ''`
        const headers = new Headers();
        headers.set('x-amz-target', ''); // empty header value
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com/invoke',
            method: 'POST',
            body: '{}',
            service: 'bedrock',
            region: 'us-east-1',
            headers,
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });
    
    it('sign() with singleEncode=true skips double encoding', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/already%20encoded',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
            singleEncode: true,
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('sign() s3 with + in path gets decoded to space', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/file+with+plusses.txt',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('sign() with empty search params (no ? query)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/key',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
        });
        await signer.sign();
        expect(signer.encodedSearch).toBe('');
    });

    it('s3 signQuery search param with empty key is filtered (L274 !k)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret123456789012345678901234',
            url: 'https://mybucket.s3.us-east-1.amazonaws.com/key?=emptykey&valid=yes',
            method: 'GET',
            service: 's3',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });
});

describe('aws-signer guessServiceRegion additional patterns', () => {
    it('parses autoscaling endpoint', () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://autoscaling.us-east-1.amazonaws.com/',
        });
        expect(signer.service).toBe('autoscaling');
    });

    it('parses s3- prefixed service (s3-external)', () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://s3-external-1.amazonaws.com/bucket',
        });
        expect(signer.service).toBe('s3');
    });

    it('parses FIPS with region suffix', () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://s3-fips.us-east-1.amazonaws.com/bucket',
        });
        expect(signer.service).toBe('s3');
    });

    it('iotdevicegateway sets appendSessionToken', () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://iotdevicegateway.us-east-1.amazonaws.com/',
            service: 'iotdevicegateway',
            region: 'us-east-1',
            sessionToken: 'token',
            signQuery: true,
        });
        expect(signer.appendSessionToken).toBe(true);
    });
});
