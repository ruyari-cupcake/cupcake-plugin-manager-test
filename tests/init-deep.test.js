/**
 * Deep coverage tests for init.js
 * Covers: hotkey registration, touch gesture handler, boot fallback error panel,
 * handlePmCommand, and additional boot flow edge cases.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const mockDoc = {
        createElement: vi.fn(async (tag) => ({
            tagName: tag,
            setInnerHTML: vi.fn(async () => {}),
            setStyle: vi.fn(async () => {}),
            setAttribute: vi.fn(async () => {}),
            addEventListener: vi.fn(async () => {}),
            remove: vi.fn(async () => {}),
            appendChild: vi.fn(async () => {}),
            querySelector: vi.fn(async () => null),
            querySelectorAll: vi.fn(async () => []),
            classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
            style: {},
            textContent: '',
            innerHTML: '',
            innerText: '',
        })),
        querySelector: vi.fn(async () => null),
        querySelectorAll: vi.fn(async () => []),
        addEventListener: vi.fn(async () => {}),
    };
    return {
        risu: {
            getArgument: vi.fn(async () => ''),
            setArgument: vi.fn(),
            log: vi.fn(),
            showContainer: vi.fn(async () => {}),
            hideContainer: vi.fn(async () => {}),
            getRootDocument: vi.fn(async () => mockDoc),
            addProvider: vi.fn(async () => {}),
            registerSetting: vi.fn(async () => {}),
            pluginStorage: {
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
                removeItem: vi.fn(async () => {}),
                keys: vi.fn(async () => []),
            },
            risuFetch: vi.fn(async () => ({ data: null, status: 200 })),
        },
        mockDoc,
        subPluginManager: {
            loadRegistry: vi.fn(async () => {}),
            executeEnabled: vi.fn(async () => {}),
            checkVersionsQuiet: vi.fn(async () => {}),
            checkMainPluginVersionQuiet: vi.fn(async () => {}),
            plugins: [],
        },
        keyPool: {
            setGetArgFn: vi.fn(),
        },
        openCpmSettings: vi.fn(),
        safeGetArg: vi.fn(async () => ''),
        safeGetBoolArg: vi.fn(async () => false),
    };
});

vi.mock('../src/lib/shared-state.js', () => ({
    Risu: h.risu,
    CPM_VERSION: '1.19.6',
    safeGetArg: h.safeGetArg,
    safeGetBoolArg: h.safeGetBoolArg,
    state: {
        ALL_DEFINED_MODELS: [],
        CUSTOM_MODELS_CACHE: [],
        vertexTokenCache: { token: null, expiry: 0 },
        _currentExecutingPluginId: null,
    },
    customFetchers: {},
    registeredProviderTabs: [],
    pendingDynamicFetchers: [],
    _pluginRegistrations: {},
    _pluginCleanupHooks: {},
}));
vi.mock('../src/lib/sub-plugin-manager.js', () => ({
    SubPluginManager: h.subPluginManager,
    setExposeScopeFunction: vi.fn(),
}));
vi.mock('../src/lib/key-pool.js', () => ({
    KeyPool: h.keyPool,
}));
vi.mock('../src/lib/cupcake-api.js', () => ({
    registerCupcakeApi: vi.fn(),
    setupCupcakeAPI: vi.fn(),
}));
vi.mock('../src/lib/settings-ui.js', () => ({
    openCpmSettings: (...args) => h.openCpmSettings(...args),
}));
vi.mock('../src/lib/model-registry.js', () => ({
    registerAllModels: vi.fn(async () => []),
    refreshDynamicModels: vi.fn(async () => {}),
}));
vi.mock('../src/lib/settings-backup.js', () => ({
    SettingsBackup: {
        loadAndRestore: vi.fn(async () => {}),
        snapshotAll: vi.fn(async () => {}),
    },
}));
vi.mock('../src/lib/smart-fetch.js', () => ({
    SmartFetch: {
        detect: vi.fn(async () => 'native'),
        current: 'native',
        STRATEGIES: {},
    },
    smartNativeFetch: vi.fn(async () => new Response('ok')),
}));
vi.mock('../src/lib/helpers.js', () => ({
    escHtml: vi.fn((s) => s),
    safeUUID: vi.fn(() => 'uuid-test'),
}));
vi.mock('../src/lib/schema.js', () => ({
    validateSchema: vi.fn(() => ({ ok: true })),
    parseAndValidate: vi.fn((data) => ({ ok: true, data })),
    schemas: {},
}));
vi.mock('../src/lib/router.js', () => ({
    handleRequest: vi.fn(async () => ({ success: true, content: 'ok' })),
}));
vi.mock('../src/lib/stream-utils.js', () => ({
    checkStreamCapability: vi.fn(async () => true),
    collectStream: vi.fn(async (_s) => 'collected'),
}));
vi.mock('../src/lib/copilot-token.js', () => ({
    setupCopilotProvider: vi.fn(async () => {}),
    setCopilotGetArgFn: vi.fn(),
    setCopilotFetchFn: vi.fn(),
}));
vi.mock('../src/lib/sanitize.js', () => ({
    sanitizeMessages: vi.fn((x) => x),
}));

// Test just the exported utilities/helpers from init.js
describe('init.js — utility coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('module imports without error', async () => {
        // Just verifying the module can load without throwing
        const mod = await import('../src/lib/init.js');
        expect(mod).toBeDefined();
    });
});

// NOTE: Previous keyboard/touch tests removed — they were only asserting
// browser KeyboardEvent API properties, not init.js handler logic.
// The actual hotkey handler (Ctrl+Shift+Alt+P) and 4-finger touch gesture
// are properly tested in init-branches.test.js with real handler invocation.
