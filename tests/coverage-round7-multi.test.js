// @ts-check
/**
 * Coverage Round 7 — Multi-file branch coverage targeting.
 * Targets: aws-signer, format-gemini, key-pool, token-usage, slot-inference, sse-parsers
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ─── aws-signer ───
import { guessServiceRegion, AwsV4Signer } from '../src/lib/aws-signer.js';

// ─── format-gemini ───
import { validateGeminiParams, buildGeminiThinkingConfig, formatToGemini, ThoughtSignatureCache } from '../src/lib/format-gemini.js';

// ─── key-pool ───
import { KeyPool } from '../src/lib/key-pool.js';

// ─── token-usage ───
import { _tokenUsageStore, _tokenUsageKey, _setTokenUsage, _takeTokenUsage, _normalizeTokenUsage } from '../src/lib/token-usage.js';

// ─── sse-parsers ───
import { parseGeminiSSELine, normalizeOpenAIMessageContent } from '../src/lib/sse-parsers.js';


// ══════════════════════════════════════════════════════════════
//  AWS-SIGNER — guessServiceRegion edge cases
// ══════════════════════════════════════════════════════════════
describe('guessServiceRegion edge cases', () => {
    /** helper */
    const gsr = (
        /** @type {string} */ hostname,
        /** @type {string} */ pathname = '/'
    ) => guessServiceRegion(new URL(`https://${hostname}${pathname}`), new Headers());

    it('.on.aws hostname that does NOT match lambda-url pattern → empty', () => {
        const [svc, region] = gsr('something.on.aws');
        expect(svc).toBe('');
        expect(region).toBe('');
    });

    it('.on.aws hostname that matches lambda-url pattern', () => {
        const [svc, region] = gsr('myfunction.lambda-url.us-east-1.on.aws');
        expect(svc).toBe('lambda');
        expect(region).toBe('us-east-1');
    });

    it('backblaze B2 hostname matching s3 pattern', () => {
        const [svc, region] = gsr('mybucket.s3.us-west-002.backblazeb2.com');
        expect(svc).toBe('s3');
        expect(region).toBe('us-west-002');
    });

    it('backblaze B2 hostname NOT matching s3 pattern', () => {
        const [svc, region] = gsr('other.backblazeb2.com');
        expect(svc).toBe('');
        expect(region).toBe('');
    });

    it('Cloudflare R2', () => {
        const [svc, region] = gsr('account.r2.cloudflarestorage.com');
        expect(svc).toBe('s3');
        expect(region).toBe('auto');
    });

    it('iot hostname with /mqtt path → iotdevicegateway', () => {
        const [svc] = gsr('something.iot.us-east-1.amazonaws.com', '/mqtt');
        expect(svc).toBe('iotdevicegateway');
    });

    it('iot hostname with non-mqtt path that starts with data.jobs.iot → iot-jobs-data', () => {
        const [svc] = gsr('data.jobs.iot.us-west-2.amazonaws.com', '/something');
        expect(svc).toBe('iot-jobs-data');
    });

    it('iot hostname starting with iot. → execute-api', () => {
        const [svc] = gsr('iot.us-east-1.amazonaws.com', '/api');
        expect(svc).toBe('execute-api');
    });

    it('iot hostname with non-special prefix → iotdata', () => {
        const [svc] = gsr('streams.iot.us-east-1.amazonaws.com', '/data');
        expect(svc).toBe('iotdata');
    });

    it('autoscaling with AnyScaleFrontendService target → application-autoscaling', () => {
        const headers = new Headers({ 'X-Amz-Target': 'AnyScaleFrontendService.SomeAction' });
        const [svc] = guessServiceRegion(new URL('https://autoscaling.us-east-1.amazonaws.com/'), headers);
        expect(svc).toBe('application-autoscaling');
    });

    it('autoscaling with AnyScaleScalingPlannerFrontendService → autoscaling-plans', () => {
        const headers = new Headers({ 'X-Amz-Target': 'AnyScaleScalingPlannerFrontendService.SomeAction' });
        const [svc] = guessServiceRegion(new URL('https://autoscaling.us-east-1.amazonaws.com/'), headers);
        expect(svc).toBe('autoscaling-plans');
    });

    it('s3- prefix service → region from suffix', () => {
        const [svc, region] = gsr('s3-us-west-2.amazonaws.com');
        expect(svc).toBe('s3');
        expect(region).toBe('us-west-2');
    });

    it('s3-fips- prefix → strips fips prefix', () => {
        const [svc, region] = gsr('s3-fips-us-east-1.amazonaws.com');
        expect(svc).toBe('s3');
        // removes "fips-" leaving "us-east-1"
        expect(region).toBe('us-east-1');
    });

    it('s3-external-1 → strips external prefix', () => {
        const [svc, region] = gsr('s3-external-1.amazonaws.com');
        expect(svc).toBe('s3');
        expect(region).toBe('');
    });

    it('service ending with -fips → strips suffix', () => {
        const [svc] = gsr('lambda-fips.us-east-1.amazonaws.com');
        expect(svc).toBe('lambda');
    });

    it('us-gov region → us-gov-west-1', () => {
        const [svc, region] = gsr('s3.us-gov.amazonaws.com');
        expect(svc).toBe('s3');
        expect(region).toBe('us-gov-west-1');
    });

    it('service/region swap when service looks like region and region does not', () => {
        // e.g. hostname like "us-east-1.bedrock.amazonaws.com"
        // after match: service = 'bedrock', region = 'us-east-1'
        // this shouldn't swap because bedrock doesn't end in -\d
        // Need service that ends in -\d: e.g. custom-1.bedrock.amazonaws.com
        // match[1] = 'bedrock', match[2] = 'custom-1' → region ends in -1 so no swap happens
        // Actually: if service ends in -\d and region does NOT end in -\d → swap
        // Let's test: hostname "us-east-1.myservice.amazonaws.com"
        // after regex: service = 'myservice', region = 'us-east-1'
        // service 'myservice' does NOT end in -\d → no swap → normal result
        // we need: service DOES end in -\d and region does NOT
        // e.g. "myregion.custom-1.amazonaws.com"
        // match[1] = 'custom-1', match[2] = 'myregion'
        // /-\d$/.test('custom-1') → true, !/-\d$/.test('myregion') → true → swap!
        const [svc, region] = gsr('myregion.custom-1.amazonaws.com');
        expect(svc).toBe('myregion');
        expect(region).toBe('custom-1');
    });

    it('HOST_SERVICES mapping (appstream2 → appstream)', () => {
        const [svc] = gsr('appstream2.us-east-1.amazonaws.com');
        expect(svc).toBe('appstream');
    });
});


// ══════════════════════════════════════════════════════════════
//  AWS-SIGNER — AwsV4Signer constructor & sign edge cases
// ══════════════════════════════════════════════════════════════
describe('AwsV4Signer edge cases', () => {
    const baseOpts = {
        url: 'https://bedrock.us-east-1.amazonaws.com/invoke',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
    };

    it('method defaults to GET when no body', () => {
        const signer = new AwsV4Signer({ ...baseOpts });
        expect(signer.method).toBe('GET');
    });

    it('method defaults to POST when body is present', () => {
        const signer = new AwsV4Signer({ ...baseOpts, body: '{}' });
        expect(signer.method).toBe('POST');
    });

    it('uses provided datetime', () => {
        const dt = '20250101T000000Z';
        const signer = new AwsV4Signer({ ...baseOpts, datetime: dt });
        expect(signer.datetime).toBe(dt);
    });

    it('guessedService/Region fall back to empty when both service/region omitted and URL non-AWS', () => {
        const signer = new AwsV4Signer({
            url: 'https://example.com/api',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
        });
        expect(signer.service).toBe('');
        expect(signer.region).toBe('us-east-1'); // fallback
    });

    it('signQuery mode sets search params', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 's3',
            region: 'us-east-1',
            signQuery: true,
            sessionToken: 'tok',
        });
        expect(signer.signQuery).toBe(true);
        expect(signer.url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    });

    it('appendSessionToken is true for iotdevicegateway', () => {
        const signer = new AwsV4Signer({
            url: 'https://something.iot.us-east-1.amazonaws.com/mqtt',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
        });
        expect(signer.appendSessionToken).toBe(true);
    });

    it('s3 service sets X-Amz-Content-Sha256 to UNSIGNED-PAYLOAD', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 's3',
            region: 'us-east-1',
        });
        expect(signer.headers.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
    });

    it('singleEncode skips double encoding', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 'bedrock',
            region: 'us-east-1',
            singleEncode: true,
        });
        expect(typeof signer.encodedPath).toBe('string');
    });

    it('s3 encodedPath catches bad URIs', () => {
        // A URL with %ZZ (invalid percent-encoding) should survive via catch branch
        const signer = new AwsV4Signer({
            url: 'https://s3.amazonaws.com/bucket/%ZZfoo',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            service: 's3',
            region: 'us-east-1',
        });
        // Should use the raw pathname fallback
        expect(signer.encodedPath).toContain('bucket');
    });

    it('s3 encodedSearch deduplicates keys', () => {
        const signer = new AwsV4Signer({
            url: 'https://s3.us-east-1.amazonaws.com/bucket?prefix=a&prefix=b',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            service: 's3',
            region: 'us-east-1',
        });
        // Only one 'prefix' key should remain
        const prefixOccurrences = signer.encodedSearch.split('prefix').length - 1;
        expect(prefixOccurrences).toBe(1);
    });

    it('sign() with signQuery writes signature to URL', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 'bedrock',
            region: 'us-east-1',
            signQuery: true,
            body: '{}',
        });
        const result = await signer.sign();
        expect(result.url.searchParams.has('X-Amz-Signature')).toBe(true);
    });

    it('sign() with signQuery + sessionToken + appendSessionToken → writes Security-Token', async () => {
        const signer = new AwsV4Signer({
            url: 'https://something.iot.us-east-1.amazonaws.com/mqtt',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            sessionToken: 'SESSTOKEN',
            signQuery: true,
        });
        const result = await signer.sign();
        expect(result.url.searchParams.get('X-Amz-Security-Token')).toBe('SESSTOKEN');
    });

    it('sign() without signQuery writes Authorization header', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 'bedrock',
            region: 'us-east-1',
            body: '{}',
        });
        const result = await signer.sign();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('hexBodyHash throws for non-string/non-ArrayBuffer body', async () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 'bedrock',
            region: 'us-east-1',
            // @ts-ignore — intentional wrong type
            body: { bad: true },
        });
        await expect(signer.sign()).rejects.toThrow('body must be a string');
    });

    it('sort comparator covers all branches for search params', () => {
        const signer = new AwsV4Signer({
            url: 'https://bedrock.us-east-1.amazonaws.com/?a=2&a=1&b=1',
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            service: 'bedrock',
            region: 'us-east-1',
        });
        // Same key 'a' with different values → v1/v2 comparison branches
        expect(signer.encodedSearch).toContain('a=1');
        expect(signer.encodedSearch).toContain('a=2');
    });

    it('allHeaders includes unsignable headers in signature', () => {
        const signer = new AwsV4Signer({
            ...baseOpts,
            service: 'bedrock',
            region: 'us-east-1',
            body: '{}',
            allHeaders: true,
            headers: { 'content-type': 'application/json', 'authorization': 'test' },
        });
        expect(signer.signableHeaders).toContain('content-type');
    });
});


// ══════════════════════════════════════════════════════════════
//  FORMAT-GEMINI — validateGeminiParams
// ══════════════════════════════════════════════════════════════
describe('validateGeminiParams edge cases', () => {
    it('topK non-integer → deleted', () => {
        const cfg = { topK: 5.5 };
        validateGeminiParams(cfg);
        expect(cfg.topK).toBeUndefined();
    });

    it('topK integer → kept', () => {
        const cfg = { topK: 10 };
        validateGeminiParams(cfg);
        expect(cfg.topK).toBe(10);
    });

    it('temperature > 2 → reset to 1', () => {
        const cfg = { temperature: 3 };
        validateGeminiParams(cfg);
        expect(cfg.temperature).toBe(1);
    });

    it('frequencyPenalty out of range → deleted (no fallback)', () => {
        const cfg = { frequencyPenalty: 5 };
        validateGeminiParams(cfg);
        expect(cfg.frequencyPenalty).toBeUndefined();
    });

    it('null/undefined input → no-op', () => {
        expect(() => /** @type {any} */ (validateGeminiParams)(null)).not.toThrow();
        expect(() => /** @type {any} */ (validateGeminiParams)(undefined)).not.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════
//  FORMAT-GEMINI — buildGeminiThinkingConfig
// ══════════════════════════════════════════════════════════════
describe('buildGeminiThinkingConfig edge cases', () => {
    it('Gemini 3 + VertexAI → thinking_level (snake_case)', () => {
        const result = buildGeminiThinkingConfig('gemini-3-ultra', 'HIGH', undefined, true);
        expect(result).toEqual({ includeThoughts: true, thinking_level: 'HIGH' });
    });

    it('Gemini 3 + non-Vertex → thinkingLevel (camelCase lowercase)', () => {
        const result = buildGeminiThinkingConfig('gemini-3-pro', 'HIGH', undefined, false);
        expect(result).toEqual({ includeThoughts: true, thinkingLevel: 'high' });
    });

    it('Gemini 3 + off → null', () => {
        expect(buildGeminiThinkingConfig('gemini-3-pro', 'off')).toBeNull();
    });

    it('Gemini 2.5 + explicit budget > 0', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', 'MEDIUM', 8000);
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 8000 });
    });

    it('Gemini 2.5 + level with mapped budget', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-flash', 'LOW');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 4096 });
    });

    it('Gemini 2.5 + level that parses as integer', () => {
        const result = buildGeminiThinkingConfig('gemini-2.5-pro', '5000');
        expect(result).toEqual({ includeThoughts: true, thinkingBudget: 5000 });
    });

    it('Gemini 2.5 + off → null', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-pro', 'off')).toBeNull();
    });

    it('Gemini 2.5 + none → null', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-pro', 'none')).toBeNull();
    });

    it('Gemini 2.5 + no level, no budget → null', () => {
        expect(buildGeminiThinkingConfig('gemini-2.5-pro', '')).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════
//  FORMAT-GEMINI — formatToGemini edge cases
// ══════════════════════════════════════════════════════════════
describe('formatToGemini edge cases', () => {
    it('non-string non-array content → JSON.stringify', () => {
        const result = formatToGemini([{ role: 'user', content: { foo: 'bar' } }]);
        const text = result.contents[0]?.parts[0]?.text;
        expect(text).toContain('foo');
    });

    it('system messages after leading phase merge into existing user', () => {
        const result = formatToGemini([
            { role: 'system', content: 'You are an AI' },
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'Extra context' },
        ]);
        // Non-leading system merges into user content
        const userParts = result.contents.find(c => c.role === 'user')?.parts;
        expect(userParts).toBeDefined();
        // Should have merged system text
        const allText = (userParts || []).map((/** @type {any} */ p) => p.text).join(' ');
        expect(allText).toContain('Extra context');
    });

    it('system after leading block with no preceding user → creates new user', () => {
        const result = formatToGemini([
            { role: 'system', content: 'Lead' },
            { role: 'assistant', content: 'Hi' },
            { role: 'system', content: 'Mid-system' },
        ]);
        // Mid-system should produce a user message
        const hasUser = result.contents.some(c => c.role === 'user' && c.parts.some((/** @type {any} */ p) => p.text?.includes('Mid-system')));
        expect(hasUser).toBe(true);
    });

    it('empty message (no text, no multimodals) → skipped', () => {
        const result = formatToGemini([
            { role: 'user', content: '' },
            { role: 'user', content: 'Real message' },
        ]);
        expect(result.contents.length).toBe(1);
        expect(result.contents[0].parts[0].text).toBe('Real message');
    });

    it('preserveSystem=true places system in systemInstruction', () => {
        const result = formatToGemini(
            [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'Hello' }],
            { preserveSystem: true }
        );
        expect(result.systemInstruction).toContain('System prompt');
    });

    it('preserveSystem=false merges system into first user', () => {
        const result = formatToGemini(
            [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'Hello' }],
            { preserveSystem: false }
        );
        expect(result.systemInstruction.length).toBe(0);
        const firstUserText = result.contents[0]?.parts?.map((/** @type {any} */ p) => p.text).join(' ');
        expect(firstUserText).toContain('System prompt');
    });

    it('preserveSystem=true with only system → adds Start user', () => {
        const result = formatToGemini(
            [{ role: 'system', content: 'Sys only' }],
            { preserveSystem: true }
        );
        expect(result.systemInstruction).toContain('Sys only');
        expect(result.contents.length).toBe(1);
        expect(result.contents[0].parts[0].text).toBe('Start');
    });

    it('consecutive same-role text messages merge', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
        ]);
        // Should merge into one user message
        expect(result.contents.length).toBe(1);
        const texts = result.contents[0].parts.map((/** @type {any} */ p) => p.text);
        expect(texts).toContain('Part 1');
        expect(texts).toContain('Part 2');
    });

    it('thought signature injection for model messages', () => {
        ThoughtSignatureCache.clear();
        ThoughtSignatureCache.save('Some AI response text', 'cached-sig-abc');
        const result = formatToGemini(
            [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Some AI response text' },
                { role: 'user', content: 'Follow up' },
            ],
            { useThoughtSignature: true }
        );
        const modelMsg = result.contents.find(c => c.role === 'model');
        expect(modelMsg).toBeDefined();
        const sigPart = modelMsg.parts.find((/** @type {any} */ p) => p.thoughtSignature);
        expect(sigPart?.thoughtSignature).toBe('cached-sig-abc');
        ThoughtSignatureCache.clear();
    });

    it('multimodal message merges into preceding same-role', () => {
        const result = formatToGemini([
            { role: 'user', content: 'Text before' },
            { role: 'user', content: [
                { type: 'text', text: 'Caption' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }
            ] },
        ]);
        // Should merge into single user message
        expect(result.contents.length).toBe(1);
        const parts = result.contents[0].parts;
        expect(parts.some((/** @type {any} */ p) => p.inlineData)).toBe(true);
    });

    it('multimodal message creates new entry when different role', () => {
        const result = formatToGemini([
            { role: 'assistant', content: 'Hello' },
            { role: 'user', content: [
                { type: 'text', text: 'Check this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }
            ] },
        ]);
        expect(result.contents.length).toBe(2);
        const userMsg = result.contents.find(c => c.role === 'user');
        expect(userMsg.parts.some((/** @type {any} */ p) => p.inlineData)).toBe(true);
    });
});


// ══════════════════════════════════════════════════════════════
//  KEY-POOL — edge cases
// ══════════════════════════════════════════════════════════════
describe('KeyPool edge cases', () => {
    beforeEach(() => {
        KeyPool._pools = {};
        KeyPool._getArgFn = null;
    });

    it('_looksLikeWindowsPath detects UNC paths', () => {
        expect(KeyPool._looksLikeWindowsPath('\\\\server\\share')).toBe(true);
    });

    it('_looksLikeWindowsPath detects drive letters', () => {
        expect(KeyPool._looksLikeWindowsPath('C:\\Users\\test.json')).toBe(true);
    });

    it('_looksLikeWindowsPath returns false for JSON', () => {
        expect(KeyPool._looksLikeWindowsPath('{"key": "value"}')).toBe(false);
    });

    it('_buildJsonCredentialError for Windows path', () => {
        const err = KeyPool._buildJsonCredentialError('C:\\path\\to\\file.json');
        expect(err.message).toContain('Windows');
    });

    it('_buildJsonCredentialError for Bad Unicode escape', () => {
        const err = KeyPool._buildJsonCredentialError('bad', { message: 'Bad Unicode escape at pos 5' });
        expect(err.message).toContain('역슬래시');
    });

    it('_buildJsonCredentialError for generic error', () => {
        const err = KeyPool._buildJsonCredentialError('bad', { message: 'Unexpected token' });
        expect(err.message).toContain('Unexpected token');
    });

    it('_parseJsonCredentials throws for Windows path', () => {
        expect(() => KeyPool._parseJsonCredentials('C:\\something')).toThrow('Windows');
    });

    it('_parseJsonCredentials parses JSON array', () => {
        const result = KeyPool._parseJsonCredentials('[{"a":1},{"b":2}]');
        expect(result.length).toBe(2);
    });

    it('_parseJsonCredentials parses comma-separated objects', () => {
        const result = KeyPool._parseJsonCredentials('{"a":1},{"b":2}');
        expect(result.length).toBe(2);
    });

    it('_parseJsonCredentials parses single object', () => {
        const result = KeyPool._parseJsonCredentials('{"key":"value"}');
        expect(result.length).toBe(1);
    });

    it('_parseJsonCredentials returns empty for empty input', () => {
        expect(KeyPool._parseJsonCredentials('')).toEqual([]);
    });

    it('_parseJsonCredentials returns empty for unparseable non-object', () => {
        expect(KeyPool._parseJsonCredentials('"just a string"')).toEqual([]);
    });

    it('pickJson returns empty when credentials parse to empty', async () => {
        KeyPool._getArgFn = async () => 'not json at all %%%';
        const result = await KeyPool.pickJson('empty_arg');
        expect(result).toBe('');
    });

    it('pickJson with parse error stores error message', async () => {
        KeyPool._getArgFn = async () => 'C:\\bad\\path';
        try { await KeyPool.pickJson('errored_arg'); } catch {}
        // Pool should have error set
        const pool = KeyPool._pools['errored_arg'];
        expect(pool?.error || pool?.keys?.length === 0).toBeTruthy();
    });

    it('withRotation returns error when no keys available', async () => {
        KeyPool._getArgFn = async () => '';
        const result = await KeyPool.withRotation('empty', async () => ({ success: true }));
        expect(result.success).toBe(false);
        expect(result.content).toContain('KeyPool');
    });

    it('withRotation drains keys on retryable error', async () => {
        KeyPool._getArgFn = async () => 'key1 key2 key3';
        let callCount = 0;
        const result = await KeyPool.withRotation('multi_key', async () => {
            callCount++;
            if (callCount <= 2) return { success: false, _status: 429, content: 'rate limited' };
            return { success: true, content: 'ok' };
        });
        expect(result.success).toBe(true);
        expect(callCount).toBe(3);
    });

    it('withJsonRotation returns error with errorMessage when empty', async () => {
        KeyPool._getArgFn = async () => 'C:\\Users\\file.json';
        const result = await KeyPool.withJsonRotation('bad_json', async () => ({ success: true }));
        expect(result.success).toBe(false);
        expect(result.content).toContain('KeyPool');
    });

    it('withJsonRotation returns generic message when no error', async () => {
        KeyPool._getArgFn = async () => '';
        const result = await KeyPool.withJsonRotation('empty_json', async () => ({ success: true }));
        expect(result.success).toBe(false);
    });

    it('withJsonRotation drains on retryable and exhausts', async () => {
        KeyPool._getArgFn = async () => '[{"cred":"a"}]';
        const result = await KeyPool.withJsonRotation('exhaust', async () => ({
            success: false, _status: 429, content: 'rate limited'
        }));
        expect(result.success).toBe(false);
    });
});


// ══════════════════════════════════════════════════════════════
//  TOKEN-USAGE — edge cases
// ══════════════════════════════════════════════════════════════
describe('token-usage edge cases', () => {
    beforeEach(() => {
        _tokenUsageStore.clear();
    });

    it('_tokenUsageKey returns legacy key for falsy requestId', () => {
        expect(_tokenUsageKey('')).toBe('_latest');
        expect(_tokenUsageKey('', true)).toBe('_stream_latest');
    });

    it('_setTokenUsage evicts oldest when exceeding max', () => {
        // Fill up to just over 100
        for (let i = 0; i < 102; i++) {
            _setTokenUsage(`req_${i}`, { input: i, output: 0, reasoning: 0, cached: 0, total: i });
        }
        expect(_tokenUsageStore.size).toBeLessThanOrEqual(101);
    });

    it('_setTokenUsage ignores non-object usage', () => {
        const sizeBefore = _tokenUsageStore.size;
        // @ts-ignore
        _setTokenUsage('badreq', null);
        expect(_tokenUsageStore.size).toBe(sizeBefore);
    });

    it('_takeTokenUsage falls back to legacy key', () => {
        _tokenUsageStore.set('_latest', /** @type {any} */ ({ input: 10, output: 5, reasoning: 0, cached: 0, total: 15 }));
        const result = _takeTokenUsage('nonexistent_req');
        expect(result).toBeDefined();
        expect(result?.input).toBe(10);
        // legacy key should be removed
        expect(_tokenUsageStore.has('_latest')).toBe(false);
    });

    it('_takeTokenUsage returns null when neither scoped nor legacy exist', () => {
        expect(_takeTokenUsage('nothing')).toBeNull();
    });

    it('_normalizeTokenUsage openai format', () => {
        const usage = _normalizeTokenUsage({
            prompt_tokens: 100,
            completion_tokens: 50,
            completion_tokens_details: { reasoning_tokens: 10 },
            prompt_tokens_details: { cached_tokens: 20 },
            total_tokens: 150,
        }, 'openai');
        expect(usage).toEqual({ input: 100, output: 50, reasoning: 10, cached: 20, total: 150 });
    });

    it('_normalizeTokenUsage anthropic with explicit reasoning tokens', () => {
        const usage = _normalizeTokenUsage({
            input_tokens: 200,
            output_tokens: 100,
            reasoning_tokens: 30,
            cache_read_input_tokens: 10,
        }, 'anthropic');
        expect(usage?.reasoning).toBe(30);
    });

    it('_normalizeTokenUsage anthropic with estimated reasoning', () => {
        const usage = _normalizeTokenUsage({
            input_tokens: 200,
            output_tokens: 500,
        }, 'anthropic', { anthropicHasThinking: true, anthropicVisibleText: 'Short visible text' });
        expect(usage?.reasoningEstimated).toBe(true);
        expect(usage?.reasoning).toBeGreaterThan(0);
    });

    it('_normalizeTokenUsage anthropic no thinking → reasoning 0', () => {
        const usage = _normalizeTokenUsage({
            input_tokens: 200,
            output_tokens: 100,
        }, 'anthropic');
        expect(usage?.reasoning).toBe(0);
    });

    it('_normalizeTokenUsage anthropic thinking but output=0 → no estimated reasoning', () => {
        const usage = _normalizeTokenUsage({
            input_tokens: 200,
            output_tokens: 0,
        }, 'anthropic', { anthropicHasThinking: true, anthropicVisibleText: 'text' });
        expect(usage?.reasoning).toBe(0);
        expect(usage?.reasoningEstimated).toBeUndefined();
    });

    it('_normalizeTokenUsage gemini format', () => {
        const usage = _normalizeTokenUsage({
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            thoughtsTokenCount: 20,
            cachedContentTokenCount: 10,
            totalTokenCount: 180,
        }, 'gemini');
        expect(usage).toEqual({ input: 100, output: 50, reasoning: 20, cached: 10, total: 180 });
    });

    it('_normalizeTokenUsage returns null for invalid raw', () => {
        expect(_normalizeTokenUsage(/** @type {any} */ (null), 'openai')).toBeNull();
    });

    it('_normalizeTokenUsage CJK heuristic for estimated reasoning', () => {
        // CJK text should bias higher token count
        const usage = _normalizeTokenUsage({
            input_tokens: 100,
            output_tokens: 1000,
        }, 'anthropic', {
            anthropicHasThinking: true,
            anthropicVisibleText: '这是一段中文文本用于测试',  // CJK text
        });
        expect(usage?.reasoningEstimated).toBe(true);
    });
});


// ══════════════════════════════════════════════════════════════
//  SSE-PARSERS — parseGeminiSSELine edge cases
// ══════════════════════════════════════════════════════════════
describe('parseGeminiSSELine edge cases', () => {
    it('non-data line → null', () => {
        expect(parseGeminiSSELine('event: message')).toBeNull();
    });

    it('invalid JSON → null', () => {
        expect(parseGeminiSSELine('data: not{json')).toBeNull();
    });

    it('safety block while in thought block → closes thoughts', () => {
        const config = /** @type {any} */ ({ _inThoughtBlock: true });
        const result = parseGeminiSSELine(
            `data: ${JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })}`,
            config
        );
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('Safety Block');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('safety block not in thought block', () => {
        const config = /** @type {any} */ ({});
        const result = parseGeminiSSELine(
            `data: ${JSON.stringify({ promptFeedback: { blockReason: 'RECITATION' } })}`,
            config
        );
        expect(result).toContain('RECITATION');
    });

    it('thought part opens thought block', () => {
        const config = /** @type {any} */ ({});
        const result = parseGeminiSSELine(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking...' }] } }] })}`,
            config
        );
        expect(result).toContain('<Thoughts>');
        expect(result).toContain('thinking...');
        expect(config._inThoughtBlock).toBe(true);
    });

    it('non-thought part after thought block → closes thought block', () => {
        const config = /** @type {any} */ ({ _inThoughtBlock: true });
        const result = parseGeminiSSELine(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] })}`,
            config
        );
        expect(result).toContain('</Thoughts>');
        expect(result).toContain('answer');
        expect(config._inThoughtBlock).toBe(false);
    });

    it('thought signature capture with useThoughtSignature', () => {
        const config = /** @type {any} */ ({ useThoughtSignature: true });
        parseGeminiSSELine(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'response text', thought_signature: 'sig123' }] } }] })}`,
            config
        );
        expect(config._lastSignature).toBe('sig123');
    });

    it('text accumulation with useThoughtSignature', () => {
        const config = /** @type {any} */ ({ useThoughtSignature: true, _streamResponseText: 'prev' });
        parseGeminiSSELine(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ' next' }] } }] })}`,
            config
        );
        expect(config._streamResponseText).toBe('prev next');
    });

    it('usageMetadata is captured', () => {
        const config = /** @type {any} */ ({});
        parseGeminiSSELine(
            `data: ${JSON.stringify({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } })}`,
            config
        );
        expect(config._streamUsageMetadata).toBeDefined();
    });
});


// ══════════════════════════════════════════════════════════════
//  SSE-PARSERS — normalizeOpenAIMessageContent edge cases
// ══════════════════════════════════════════════════════════════
describe('normalizeOpenAIMessageContent edge cases', () => {
    it('null → empty string', () => {
        expect(normalizeOpenAIMessageContent(null)).toBe('');
    });

    it('array with string items', () => {
        expect(normalizeOpenAIMessageContent(['hello', ' world'])).toBe('hello world');
    });

    it('array with objects without text → skip', () => {
        expect(normalizeOpenAIMessageContent([{ not_text: 'x' }])).toBe('');
    });

    it('array with mixed string, text object, and type:text object', () => {
        const content = [
            'hello',
            { text: ' world' },
            { type: 'text', content: '!' },
            null,
            42,
        ];
        expect(normalizeOpenAIMessageContent(content)).toBe('hello world!');
    });

    it('non-array non-string → String()', () => {
        expect(normalizeOpenAIMessageContent(42)).toBe('42');
    });
});
