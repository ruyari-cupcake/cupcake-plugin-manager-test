import { describe, expect, it } from 'vitest';

import {
    normalizeCustomModel,
    parseCustomModelsValue,
    serializeCustomModelExport,
    serializeCustomModelsSetting,
} from '../src/lib/custom-model-serialization.js';

describe('custom-model-serialization', () => {
    it('parses string and array inputs into custom model arrays', () => {
        expect(parseCustomModelsValue('[{"name":"A"}]')).toEqual([{ name: 'A' }]);
        expect(parseCustomModelsValue([{ name: 'B' }, null, 'x'])).toEqual([{ name: 'B' }]);
        expect(parseCustomModelsValue('{"name":"invalid"}')).toEqual([]);
        expect(parseCustomModelsValue('not-json')).toEqual([]);
    });

    it('normalizes numbers, booleans, defaults, and trims proxy url', () => {
        const normalized = normalizeCustomModel({
            uniqueId: 'custom_1',
            name: 123,
            model: 'gpt-test',
            url: 'https://api.example.com',
            key: 789,
            proxyUrl: ' https://proxy.example.com  ',
            format: '',
            tok: '',
            responsesMode: '',
            thinking: '',
            thinkingBudget: '4096',
            maxOutputLimit: 'bad-value',
            promptCacheRetention: '',
            reasoning: '',
            verbosity: '',
            effort: '',
            sysfirst: 'TRUE',
            mergesys: '1',
            altrole: 'yes',
            mustuser: 'on',
            maxout: 1,
            decoupled: 'true',
            thought: 'true',
            adaptiveThinking: 'false',
            customParams: { temperature: 0.7 },
            _tag: 'tag-1',
        });

        expect(normalized).toMatchObject({
            uniqueId: 'custom_1',
            name: '123',
            model: 'gpt-test',
            url: 'https://api.example.com',
            key: '789',
            proxyUrl: 'https://proxy.example.com',
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'auto',
            thinking: 'none',
            thinkingBudget: 4096,
            maxOutputLimit: 0,
            promptCacheRetention: 'none',
            reasoning: 'none',
            verbosity: 'none',
            effort: 'none',
            sysfirst: true,
            mergesys: true,
            altrole: true,
            mustuser: true,
            maxout: true,
            streaming: false,
            decoupled: true,
            thought: true,
            adaptiveThinking: false,
            customParams: '[object Object]',
            _tag: 'tag-1',
        });
    });

    it('derives streaming from decoupled when streaming is omitted', () => {
        expect(normalizeCustomModel({ decoupled: false }).streaming).toBe(true);
        expect(normalizeCustomModel({ decoupled: true }).streaming).toBe(false);
    });

    it('serializes exported custom model without key, uniqueId, or tag', () => {
        const exported = serializeCustomModelExport({
            uniqueId: 'custom_1',
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com',
            key: 'secret',
            proxyUrl: 'https://proxy.example.com',
            _tag: 'internal',
        });

        expect(exported).toMatchObject({
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com',
            proxyUrl: 'https://proxy.example.com',
            _cpmModelExport: true,
        });
        expect(exported.key).toBeUndefined();
        expect(exported.uniqueId).toBeUndefined();
        expect(exported._tag).toBeUndefined();
    });

    it('serializes settings payload without api keys and preserves advanced fields', () => {
        const serialized = serializeCustomModelsSetting(JSON.stringify([{
            uniqueId: 'custom_1',
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com',
            key: 'secret',
            proxyUrl: 'https://proxy.example.com',
            responsesMode: 'on',
            thinkingBudget: '1024',
            maxOutputLimit: 2048,
            sysfirst: 'true',
            customParams: '{"temperature":0.2}',
        }]));

        expect(JSON.parse(serialized)).toEqual([{
            uniqueId: 'custom_1',
            name: 'Model A',
            model: 'gpt-4.1',
            url: 'https://api.example.com',
            proxyUrl: 'https://proxy.example.com',
            proxyDirect: false,
            format: 'openai',
            tok: 'o200k_base',
            responsesMode: 'on',
            thinking: 'none',
            thinkingBudget: 1024,
            maxOutputLimit: 2048,
            promptCacheRetention: 'none',
            reasoning: 'none',
            verbosity: 'none',
            effort: 'none',
            sysfirst: true,
            mergesys: false,
            altrole: false,
            mustuser: false,
            maxout: false,
            streaming: false,
            decoupled: true,
            thought: false,
            adaptiveThinking: false,
            customParams: '{"temperature":0.2}',
        }]);
    });

    it('keeps api keys when explicitly requested for full settings export', () => {
        const serialized = serializeCustomModelsSetting([{ uniqueId: 'custom_1', name: 'Model A', key: 'secret-key' }], { includeKey: true });
        expect(JSON.parse(serialized)[0].key).toBe('secret-key');
    });
});