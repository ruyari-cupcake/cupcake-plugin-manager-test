import { describe, it, expect } from 'vitest';
import { formatToOpenAI } from '../src/lib/format-openai.js';

describe('formatToOpenAI', () => {
    it('returns empty array for non-array input', () => {
        expect(formatToOpenAI(null)).toEqual([]);
        expect(formatToOpenAI('string')).toEqual([]);
    });

    it('formats basic text messages', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello!' },
            { role: 'assistant', content: 'Hi there!' },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.' });
        expect(result[1]).toEqual({ role: 'user', content: 'Hello!' });
        expect(result[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('normalizes model/char roles to assistant', () => {
        const messages = [
            { role: 'model', content: 'response' },
            { role: 'char', content: 'character response' },
        ];
        const result = formatToOpenAI(messages);
        expect(result[0].role).toBe('assistant');
        expect(result[1].role).toBe('assistant');
    });

    it('filters null/empty messages', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            null,
            { role: 'assistant', content: '' },
            { role: 'user', content: 'World' },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('Hello');
        expect(result[1].content).toBe('World');
    });

    it('merges system messages when mergesys is true', () => {
        const messages = [
            { role: 'system', content: 'System A' },
            { role: 'system', content: 'System B' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { mergesys: true });
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toContain('System A');
        expect(result[0].content).toContain('System B');
        expect(result[0].content).toContain('Hello');
    });

    it('prepends user message when mustuser is true and first is assistant', () => {
        const messages = [
            { role: 'assistant', content: 'Response first' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe(' ');
        expect(result[1].role).toBe('assistant');
    });

    it('does not prepend when first message is already user or system', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { mustuser: true });
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('user');
    });

    it('converts assistant to model with altrole', () => {
        const messages = [
            { role: 'assistant', content: 'Response' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result[0].role).toBe('model');
    });

    it('merges consecutive same-role messages when altrole is enabled', () => {
        const messages = [
            { role: 'assistant', content: 'Part 1' },
            { role: 'assistant', content: 'Part 2' },
            { role: 'user', content: 'User turn' },
            { role: 'user', content: 'User turn 2' },
        ];
        const result = formatToOpenAI(messages, { altrole: true });
        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('model');
        expect(result[0].content).toBe('Part 1\nPart 2');
        expect(result[1].role).toBe('user');
        expect(result[1].content).toBe('User turn\nUser turn 2');
    });

    it('moves system to front with sysfirst', () => {
        const messages = [
            { role: 'user', content: 'User first' },
            { role: 'system', content: 'System prompt' },
            { role: 'assistant', content: 'Response' },
        ];
        const result = formatToOpenAI(messages, { sysfirst: true });
        expect(result[0].role).toBe('system');
        expect(result[0].content).toBe('System prompt');
    });

    it('converts system to developer with developerRole', () => {
        const messages = [
            { role: 'system', content: 'Instructions' },
            { role: 'user', content: 'Hello' },
        ];
        const result = formatToOpenAI(messages, { developerRole: true });
        expect(result[0].role).toBe('developer');
        expect(result[1].role).toBe('user');
    });

    it('handles multimodal messages with images', () => {
        const messages = [
            {
                role: 'user',
                content: 'Describe this image',
                multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc123' }],
            },
        ];
        const result = formatToOpenAI(messages);
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0].content)).toBe(true);
        expect(result[0].content[0].type).toBe('text');
        expect(result[0].content[1].type).toBe('image_url');
    });

    it('preserves message name property', () => {
        const messages = [
            { role: 'user', content: 'Hello', name: 'Alice' },
        ];
        const result = formatToOpenAI(messages);
        expect(result[0].name).toBe('Alice');
    });

    it('strips RisuAI internal tags', () => {
        const messages = [
            { role: 'user', content: 'Hello <qak>tagged</qak> world' },
        ];
        const result = formatToOpenAI(messages);
        expect(result[0].content).toBe('Hello tagged world');
    });
});
