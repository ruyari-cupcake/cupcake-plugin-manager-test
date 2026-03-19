/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const PLUGIN_SOURCE = readFileSync(resolve(ROOT, 'cpm-translation-cache.js'), 'utf-8');
const CORRECTIONS_KEY = 'cpm_transcache_corrections';

function flush() {
    return new Promise((resolveFlush) => setTimeout(resolveFlush, 0));
}

function createPluginStorage(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        store,
        getItem: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
        setItem: vi.fn(async (key, value) => {
            store.set(key, value);
        }),
        removeItem: vi.fn(async (key) => {
            store.delete(key);
        }),
        clear: vi.fn(async () => {
            store.clear();
        }),
        key: vi.fn(async () => null),
        keys: vi.fn(async () => Array.from(store.keys())),
        length: vi.fn(async () => store.size),
    };
}

function installPlugin({ cacheEntries = [], cacheLookup = {}, storedCorrections = null } = {}) {
    let registeredProvider = null;
    const pluginStorage = createPluginStorage(
        storedCorrections
            ? { [CORRECTIONS_KEY]: JSON.stringify(storedCorrections) }
            : {}
    );

    const risuai = {
        searchTranslationCache: vi.fn(async () => cacheEntries.map((entry) => ({ ...entry }))),
        getTranslationCache: vi.fn(async (key) => (key in cacheLookup ? cacheLookup[key] : null)),
        pluginStorage,
        addRisuScriptHandler: vi.fn(),
        removeRisuScriptHandler: vi.fn(),
    };

    const CupcakePM = {
        registerProvider: vi.fn((provider) => {
            registeredProvider = provider;
        }),
        safeGetArg: vi.fn(async () => 'true'),
        setArg: vi.fn(),
    };

    const windowObj = {
        risuai,
        Risuai: risuai,
        CupcakePM,
    };

    const runner = new Function('window', PLUGIN_SOURCE);
    runner(windowObj);

    return {
        api: windowObj._cpmTransCache,
        CupcakePM,
        pluginStorage,
        registeredProvider,
        risuai,
        windowObj,
    };
}

describe('cpm-translation-cache import/export', () => {
    let originalCreateElement;
    let originalConfirm;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let lastCreatedInput = null;
    let lastBlob = null;

    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '<div id="cpm-transcache-result"></div>';
        originalCreateElement = document.createElement.bind(document);
        originalConfirm = globalThis.confirm;
        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;

        globalThis.confirm = vi.fn(() => true);
        URL.createObjectURL = vi.fn((blob) => {
            lastBlob = blob;
            return 'blob://cpm-transcache-test';
        });
        URL.revokeObjectURL = vi.fn();

        vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
            const el = originalCreateElement(tagName, options);
            if (String(tagName).toLowerCase() === 'input') {
                lastCreatedInput = el;
            }
            return el;
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        lastCreatedInput = null;
        lastBlob = null;
        globalThis.confirm = originalConfirm;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('exports CPM envelope with cache, merged, and corrections data', async () => {
        const { api } = installPlugin({
            cacheEntries: [
                { key: 'hello', value: '안녕' },
                { key: 'bye', value: '잘가' },
            ],
            cacheLookup: {
                hello: '안녕',
                bye: '잘가',
            },
            storedCorrections: {
                hello: { old: '안녕', new: '안녕하세요' },
            },
        });

        await flush();
        await api.exportCache();

        const exported = JSON.parse(await lastBlob.text());
        expect(exported._cpmTransCacheFormat).toBe(2);
        expect(exported.cache).toEqual({
            hello: '안녕',
            bye: '잘가',
        });
        expect(exported.merged).toEqual({
            hello: '안녕하세요',
            bye: '잘가',
        });
        expect(exported.corrections).toEqual({
            hello: { old: '안녕', new: '안녕하세요' },
        });
    });

    it('imports exported envelope into overlay storage and shows overlay-only entries in browseAll', async () => {
        const exportEnv = installPlugin({
            cacheEntries: [
                { key: 'hello', value: '안녕' },
                { key: 'bye', value: '잘가' },
            ],
            cacheLookup: {
                hello: '안녕',
                bye: '잘가',
            },
            storedCorrections: {
                hello: { old: '안녕', new: '안녕하세요' },
            },
        });

        await flush();
        await exportEnv.api.exportCache();
        const exportedJson = await lastBlob.text();

        lastBlob = null;
        document.body.innerHTML = '<div id="cpm-transcache-result"></div>';

        const importEnv = installPlugin({
            cacheEntries: [],
            cacheLookup: {},
            storedCorrections: null,
        });

        await flush();
        importEnv.api.importCache();

        Object.defineProperty(lastCreatedInput, 'files', {
            configurable: true,
            value: [
                {
                    text: vi.fn(async () => exportedJson),
                },
            ],
        });

        await lastCreatedInput.onchange({ target: lastCreatedInput });
        await flush();

        const stored = JSON.parse(importEnv.pluginStorage.store.get(CORRECTIONS_KEY));
        expect(stored).toEqual({
            hello: { old: '안녕', new: '안녕하세요' },
            bye: { old: '잘가', new: '잘가' },
        });

        await importEnv.api.browseAll();
        await flush();

        const resultHtml = document.getElementById('cpm-transcache-result').innerHTML;
        expect(resultHtml).toContain('hello');
        expect(resultHtml).toContain('bye');
        expect(resultHtml).toContain('안녕하세요');
        expect(resultHtml).toContain('오버레이 전용');
    });
});
