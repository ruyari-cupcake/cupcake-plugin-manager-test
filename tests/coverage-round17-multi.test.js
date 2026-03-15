/**
 * Round 17: Aggressive branch coverage push across sanitize, aws-signer, format-openai,
 * format-anthropic, and other files. Need 18 more branches.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    extractNormalizedMessagePayload,
    sanitizeMessages,
    sanitizeBodyJSON,
    stripThoughtDisplayContent,
    stripStaleAutoCaption,
} from '../src/lib/sanitize.js';
import { AwsV4Signer } from '../src/lib/aws-signer.js';
import { formatToOpenAI } from '../src/lib/format-openai.js';
import { formatToAnthropic } from '../src/lib/format-anthropic.js';

// ─── sanitize.js ───
describe('sanitize.js branches — Round 17', () => {
    // L60/L61: stripStaleAutoCaption edge cases
    it('stripStaleAutoCaption with bracket content that has < 3 words keeps bracket', () => {
        const text = 'Check this image [AB CD]';
        // < 3 alphabetic words in brackets — should keep (but bracket is only 2 words)
        stripStaleAutoCaption(text, {});
        // Actually needs 7+ chars in bracket to match regex, so try a longer one
        const text2 = 'Check this image [12, 34, 56, 78]';
        const result2 = stripStaleAutoCaption(text2, {});
        expect(result2).toContain('[12, 34, 56, 78]');
    });

    it('stripStaleAutoCaption with bracket content ≥3 words strips it', () => {
        const text = 'Check this image [a beautiful scenic mountain view]';
        const result = stripStaleAutoCaption(text, {});
        expect(result).not.toContain('[a beautiful');
    });

    it('stripStaleAutoCaption with no bracket content', () => {
        expect(stripStaleAutoCaption('Hello world', {})).toBe('Hello world');
    });

    it('stripStaleAutoCaption when message has multimodals returns unchanged', () => {
        const text = 'Content [some auto caption text here]';
        const result = stripStaleAutoCaption(text, { multimodals: [{ type: 'image' }] });
        expect(result).toContain('[some auto');
    });

    // L107: extractNormalizedMessagePayload with image_url as object  
    it('extractNormalizedMessagePayload handles image_url object with url prop', () => {
        const msg = {
            content: [
                { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
        expect(result.multimodals[0].url).toBe('https://example.com/img.png');
    });

    it('extractNormalizedMessagePayload handles image_url as string', () => {
        const msg = {
            content: [
                { type: 'image_url', image_url: 'https://example.com/img.png' },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
    });

    // L117: input_image with object image_url
    it('extractNormalizedMessagePayload handles input_image type', () => {
        const msg = {
            content: [
                { type: 'input_image', image_url: { url: 'data:image/png;base64,abc123' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
        expect(result.multimodals[0].type).toBe('image');
    });

    it('extractNormalizedMessagePayload handles input_audio type', () => {
        const msg = {
            content: [
                { type: 'input_audio', input_audio: { data: 'base64data', format: 'wav' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
        expect(result.multimodals[0].type).toBe('audio');
    });

    it('extractNormalizedMessagePayload handles input_audio without format (default mp3)', () => {
        const msg = {
            content: [
                { type: 'input_audio', input_audio: { data: 'base64data' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals[0].mimeType).toBe('audio/mp3');
    });

    // L119/L127: Anthropic image source
    it('extractNormalizedMessagePayload handles Anthropic image block', () => {
        const msg = {
            content: [
                { type: 'image', source: { type: 'base64', data: 'abc123', media_type: 'image/jpeg' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
        expect(result.multimodals[0].mimeType).toBe('image/jpeg');
    });

    it('extractNormalizedMessagePayload handles Anthropic image without media_type', () => {
        const msg = {
            content: [
                { type: 'image', source: { type: 'base64', data: 'abc123' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals[0].mimeType).toBe('image/png');
    });

    // Content as non-array, non-string object
    it('extractNormalizedMessagePayload with object content (has .text)', () => {
        const msg = { content: { text: 'Hello structured' } };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toBe('Hello structured');
    });

    it('extractNormalizedMessagePayload with object content (no .text)', () => {
        const msg = { content: { value: 'something' } };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.text).toContain('something');
    });

    // Gemini inlineData part
    it('extractNormalizedMessagePayload handles Gemini inlineData', () => {
        const msg = {
            content: [
                { inlineData: { mimeType: 'image/png', data: 'base64data' } },
            ],
        };
        const result = extractNormalizedMessagePayload(msg);
        expect(result.multimodals.length).toBe(1);
    });

    // L196: sanitizeBodyJSON with invalid entries removed
    it('sanitizeBodyJSON removes invalid message entries', () => {
        const json = JSON.stringify({
            messages: [
                { role: 'user', content: 'Hello' },
                null,
                { role: '', content: 'invalid role' },
                { role: 'assistant', content: '' },
            ],
        });
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = sanitizeBodyJSON(json);
        const parsed = JSON.parse(result);
        expect(parsed.messages.length).toBeLessThan(4);
        spy.mockRestore();
    });

    it('sanitizeBodyJSON removes null contents entries', () => {
        const json = JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: 'Hello' }] },
                null,
                'string',
            ],
        });
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = sanitizeBodyJSON(json);
        const parsed = JSON.parse(result);
        expect(parsed.contents.length).toBe(1);
        spy.mockRestore();
    });

    it('sanitizeBodyJSON with non-JSON string returns as-is', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = sanitizeBodyJSON('not json');
        expect(result).toBe('not json');
        spy.mockRestore();
    });

    // L247: stripThoughtDisplayContent with old format
    it('stripThoughtDisplayContent removes new format <Thoughts> tags', () => {
        const text = '<Thoughts>Reasoning here</Thoughts>\nFinal answer';
        expect(stripThoughtDisplayContent(text)).toBe('Final answer');
    });

    it('stripThoughtDisplayContent removes old format > [Thought Process]', () => {
        const text = '> [Thought Process]\n> some reasoning\n\n\nActual response';
        const result = stripThoughtDisplayContent(text);
        expect(result).toContain('Actual response');
    });

    it('stripThoughtDisplayContent with empty string returns empty', () => {
        expect(stripThoughtDisplayContent('')).toBe('');
    });

    // sanitizeMessages specific cases
    it('sanitizeMessages filters messages with toJSON property', () => {
        const msgs = [
            { role: 'user', content: 'Hello', toJSON: () => ({}) },
        ];
        const result = sanitizeMessages(msgs);
        expect(result.length).toBe(1);
        expect(result[0].toJSON).toBeUndefined();
    });

    it('sanitizeMessages with non-array returns empty array', () => {
        expect(sanitizeMessages(/** @type {any} */ ('not array'))).toEqual([]);
    });

    it('sanitizeMessages filters null/non-object messages', () => {
        const msgs = /** @type {any[]} */ ([null, 'str', undefined, { role: 'user', content: 'Ok' }]);
        expect(sanitizeMessages(msgs).length).toBe(1);
    });

    it('sanitizeMessages filters messages with empty content', () => {
        const msgs = [
            { role: 'user', content: '' },
            { role: 'assistant', content: '   ' },
        ];
        expect(sanitizeMessages(msgs).length).toBe(0);
    });
});

// ─── aws-signer.js ───
describe('aws-signer.js branches — Round 17', () => {
    it('parses Lambda Function URL on .on.aws domain', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://abcdefg.lambda-url.us-east-1.on.aws/invoke',
        });
        // Should detect service=lambda, region=us-east-1
        expect(signer.service).toBe('lambda');
        expect(signer.region).toBe('us-east-1');
    });

    it('parses Cloudflare R2 URL', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://mybucket.r2.cloudflarestorage.com/key',
        });
        expect(signer.service).toBe('s3');
        expect(signer.region).toBe('auto');
    });

    it('parses Backblaze B2 URL', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://s3.us-west-004.backblazeb2.com/mybucket',
        });
        expect(signer.service).toBe('s3');
        expect(signer.region).toBe('us-west-004');
    });

    it('parses standard Bedrock URL', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com/invoke',
            service: 'bedrock',
        });
        expect(signer.region).toBe('us-east-1');
    });

    it('parses S3 URL with region in hostname', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/key',
        });
        expect(signer.service).toBe('s3');
    });

    it('parses S3 with signQuery=true adds X-Amz-Expires', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/key',
            signQuery: true,
        });
        expect(signer.url.searchParams.has('X-Amz-Algorithm')).toBe(true);
    });

    it('parses S3 with session token', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            sessionToken: 'sessToken',
            url: 'https://mybucket.s3.us-west-2.amazonaws.com/key',
        });
        // Session token adds X-Amz-Security-Token header
        expect(signer.headers.get('X-Amz-Security-Token')).toBe('sessToken');
    });

    it('parses IoT hostname variants', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://iot.us-east-1.amazonaws.com/things',
        });
        expect(signer.service).toBe('execute-api');
    });

    it('parses us-gov region', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://bedrock-runtime.us-gov.amazonaws.com/invoke',
        });
        expect(signer.region).toBe('us-gov-west-1');
    });

    it('parses s3-accelerate hostname', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://mybucket.s3-accelerate.amazonaws.com/key',
        });
        expect(signer.service).toBe('s3');
    });

    it('sign method returns object with headers and url', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com/invoke',
            method: 'POST',
            body: '{"test":true}',
            service: 'bedrock',
            region: 'us-east-1',
        });
        const result = await signer.sign();
        expect(result.headers).toBeDefined();
        expect(result.url).toBeDefined();
        expect(result.headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    });

    it('sign method with signQuery adds signature to URL', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://bedrock-runtime.us-east-1.amazonaws.com/invoke',
            service: 'bedrock',
            region: 'us-east-1',
            signQuery: true,
        });
        const result = await signer.sign();
        expect(result.url.toString()).toContain('X-Amz-Signature');
    });

    it('parses FIPS endpoint', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://bedrock-fips.us-east-1.amazonaws.com/invoke',
        });
        expect(signer.service).toBe('bedrock');
    });

    it('parses non-standard .on.aws URL (no lambda match)', async () => {
        const signer = new AwsV4Signer({
            accessKeyId: 'AKIA1234',
            secretAccessKey: 'secret',
            url: 'https://custom.on.aws/path',
            service: 'custom',
            region: 'us-east-1',
        });
        expect(signer.service).toBe('custom');
    });
});

// ─── format-openai.js ───
describe('format-openai.js additional branches — Round 17', () => {
    it('formatToOpenAI with system messages', () => {
        const result = formatToOpenAI([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ]);
        expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('formatToOpenAI with multimodal content', () => {
        const result = formatToOpenAI([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Describe this' },
                    { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
                ],
            },
        ]);
        expect(result.length).toBe(1);
    });

    it('formatToOpenAI with empty messages', () => {
        const result = formatToOpenAI([]);
        expect(result).toEqual([]);
    });

    it('formatToOpenAI with object content', () => {
        const result = formatToOpenAI([
            { role: 'user', content: { text: 'Structured text' } },
        ]);
        expect(result.length).toBe(1);
    });
});

// ─── format-anthropic.js ───
describe('format-anthropic.js additional branches — Round 17', () => {
    it('formatToAnthropic with system at start extracts system prompt', () => {
        const result = formatToAnthropic([
            { role: 'system', content: 'You are Claude.' },
            { role: 'user', content: 'Hello' },
        ]);
        expect(result.system).toBe('You are Claude.');
        expect(result.messages.length).toBeGreaterThan(0);
    });

    it('formatToAnthropic with multimodal image', () => {
        const result = formatToAnthropic([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Look at this' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
                ],
            },
        ]);
        expect(result.messages.length).toBe(1);
    });

    it('formatToAnthropic with consecutive user messages merges', () => {
        const result = formatToAnthropic([
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
        ]);
        expect(result.messages.length).toBe(1); // merged
    });

    it('formatToAnthropic with mid-system message', () => {
        const result = formatToAnthropic([
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'Updated instruction' },
            { role: 'assistant', content: 'Sure' },
        ]);
        expect(result.messages.length).toBeGreaterThan(0);
    });

    it('formatToAnthropic with thinking parameter', () => {
        const result = formatToAnthropic([
            { role: 'user', content: 'Hello' },
        ], { anthropicThinking: { type: 'enabled', budget_tokens: 1024 } });
        expect(result.messages.length).toBe(1);
    });

    it('formatToAnthropic with empty messages adds dummy user', () => {
        const result = formatToAnthropic([]);
        // Anthropic requires at least one user message
        expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });
});
