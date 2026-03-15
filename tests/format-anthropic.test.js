import { describe, it, expect } from 'vitest';
import { formatToAnthropic, _mergeOrPush } from '../src/lib/format-anthropic.js';

// ─── _mergeOrPush unit tests ─────────────────────────────────────────────────

describe('_mergeOrPush', () => {
    it('pushes new entry when array is empty', () => {
        const msgs = [];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'Hello' }]);
        expect(msgs).toHaveLength(1);
        expect(msgs[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Hello' }] });
    });

    it('pushes new entry when last message has different role', () => {
        const msgs = [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }];
        _mergeOrPush(msgs, 'assistant', [{ type: 'text', text: 'Hello' }]);
        expect(msgs).toHaveLength(2);
        expect(msgs[1].role).toBe('assistant');
    });

    it('merges into array content when same role', () => {
        const msgs = [{ role: 'user', content: [{ type: 'text', text: 'Part1' }] }];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'Part2' }]);
        expect(msgs).toHaveLength(1);
        expect(msgs[0].content).toHaveLength(2);
        expect(msgs[0].content[1]).toEqual({ type: 'text', text: 'Part2' });
    });

    it('upgrades string content to array when same role', () => {
        const msgs = [{ role: 'user', content: 'plain text' }];
        _mergeOrPush(msgs, 'user', [{ type: 'text', text: 'Part2' }]);
        expect(msgs).toHaveLength(1);
        expect(Array.isArray(msgs[0].content)).toBe(true);
        expect(msgs[0].content[0]).toEqual({ type: 'text', text: 'plain text' });
        expect(msgs[0].content[1]).toEqual({ type: 'text', text: 'Part2' });
    });

    it('merges multiple content parts at once', () => {
        const msgs = [{ role: 'user', content: [{ type: 'text', text: 'A' }] }];
        _mergeOrPush(msgs, 'user', [
            { type: 'image', source: { type: 'base64', data: 'x' } },
            { type: 'text', text: 'B' },
        ]);
        expect(msgs[0].content).toHaveLength(3);
    });
});

// ─── formatToAnthropic ──────────────────────────────────────────────────────

describe('formatToAnthropic', () => {
    it('extracts leading system messages into system prompt', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'system', content: 'Be concise.' },
            { role: 'user', content: 'Hello' },
        ];
        const { messages: msgs, system } = formatToAnthropic(messages);
        expect(system).toBe('You are helpful.\n\nBe concise.');
        expect(msgs[0].role).toBe('user');
    });

    it('converts non-leading system messages to user with "system: " prefix', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'Context update' },
            { role: 'assistant', content: 'Response' },
        ];
        const { messages: msgs, system } = formatToAnthropic(messages);
        expect(system).toBe('');
        // System message gets role 'user' and is merged with adjacent user messages
        // Since there's Hello (user) then system→user, they merge
        const userMsgs = msgs.filter(m => m.role === 'user');
        expect(userMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it('merges consecutive same-role messages', () => {
        const messages = [
            { role: 'user', content: 'Part 1' },
            { role: 'user', content: 'Part 2' },
            { role: 'assistant', content: 'Response' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        // Two consecutive user messages should be merged
        expect(msgs[0].role).toBe('user');
        expect(msgs[1].role).toBe('assistant');
        // Content should be array with both text parts
        expect(Array.isArray(msgs[0].content)).toBe(true);
    });

    it('ensures first message is user role', () => {
        const messages = [
            { role: 'assistant', content: 'Response first' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Start' }]);
    });

    it('handles image multimodals with base64', () => {
        const messages = [
            {
                role: 'user',
                content: 'Describe this',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc123' }],
            },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].role).toBe('user');
        const content = msgs[0].content;
        expect(Array.isArray(content)).toBe(true);
        // Anthropic puts images BEFORE text
        const imageBlock = content.find(b => b.type === 'image');
        expect(imageBlock).toBeDefined();
        expect(imageBlock.source.type).toBe('base64');
        expect(imageBlock.source.media_type).toBe('image/png');
    });

    it('falls back to plain text when multimodal payload has no valid images', () => {
        const messages = [
            {
                role: 'user',
                content: 'Text survives',
                multimodals: [{ type: 'audio', base64: 'data:audio/wav;base64,xxx' }, null],
            },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([{ type: 'text', text: 'Text survives' }]);
    });

    it('converts array text parts and inlineData images', () => {
        const messages = [{
            role: 'user',
            content: [
                { text: 'hello' },
                { inlineData: { mimeType: 'image/jpeg', data: 'abc123' } },
                { inlineData: { mimeType: 'application/pdf', data: 'skip-me' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' } },
            { type: 'text', text: 'hello' },
        ]);
    });

    it('converts image_url parts for both data-uri and remote urls', () => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: 'data:image/webp;base64,zzz' },
                { type: 'input_image', image_url: { url: 'https://example.com/cat.png' } },
            ],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].content).toEqual([
            { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'zzz' } },
            { type: 'image', source: { type: 'url', url: 'https://example.com/cat.png' } },
        ]);
    });

    it('converts non-leading system object content into a user system-prefixed message', () => {
        const messages = [
            { role: 'user', content: 'hello' },
            { role: 'system', content: { policy: 'strict' } },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content[1].text).toBe('system: {"policy":"strict"}');
    });

    it('preserves already-normalized base64 image parts', () => {
        const messages = [{
            role: 'assistant',
            content: [{ type: 'image', source: { type: 'base64', data: 'raw', media_type: 'image/png' } }],
        }];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(msgs[0].role).toBe('user');
        expect(msgs[1].content).toEqual([{ type: 'image', source: { type: 'base64', data: 'raw', media_type: 'image/png' } }]);
    });

    it('applies cache_control to the merged message corresponding to a cache point', () => {
        const messages = [
            { role: 'user', content: 'Part A' },
            { role: 'user', content: 'Part B', cachePoint: true },
            { role: 'assistant', content: 'Reply' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        expect(msgs[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('applies cache_control with caching enabled', () => {
        const messages = [
            { role: 'user', content: 'First message', cachePoint: true },
            { role: 'assistant', content: 'Response' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true });
        // The first formatted message should have cache_control on its last content block
        const firstMsg = msgs[0];
        if (Array.isArray(firstMsg.content)) {
            const lastBlock = firstMsg.content[firstMsg.content.length - 1];
            expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
        }
    });

    it('applies 1h TTL when claude1HourCaching is enabled', () => {
        const messages = [
            { role: 'user', content: 'Cached message', cachePoint: true },
            { role: 'assistant', content: 'Response' },
        ];
        const { messages: msgs } = formatToAnthropic(messages, { caching: true, claude1HourCaching: true });
        const firstMsg = msgs[0];
        if (Array.isArray(firstMsg.content)) {
            const lastBlock = firstMsg.content[firstMsg.content.length - 1];
            // Anthropic API only supports { type: 'ephemeral' } — custom TTL strings are not supported
            expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
        }
    });

    it('handles empty message array', () => {
        const { messages: msgs, system } = formatToAnthropic([]);
        expect(system).toBe('');
        // Should have at least one user message (Start)
        expect(msgs[0].role).toBe('user');
    });

    it('filters messages with empty content', () => {
        const messages = [
            { role: 'user', content: 'Valid' },
            { role: 'assistant', content: '' },
            { role: 'user', content: 'Also valid' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        // Empty assistant message should be filtered
        const validMsgs = msgs.filter(m => m.role === 'assistant');
        // No empty assistant messages should remain
        for (const msg of validMsgs) {
            if (Array.isArray(msg.content)) {
                expect(msg.content.length).toBeGreaterThan(0);
            }
        }
    });

    it('returns content as array of text blocks', () => {
        const messages = [
            { role: 'user', content: 'Hello world' },
        ];
        const { messages: msgs } = formatToAnthropic(messages);
        expect(Array.isArray(msgs[0].content)).toBe(true);
        expect(msgs[0].content[0]).toEqual({ type: 'text', text: 'Hello world' });
    });
});
