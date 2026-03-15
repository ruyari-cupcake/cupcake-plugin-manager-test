/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function importSharedStateWithHosts(hosts) {
    vi.resetModules();
    delete window.risuai;
    delete window.Risuai;
    if ('risuai' in hosts) window.risuai = hosts.risuai;
    if ('Risuai' in hosts) window.Risuai = hosts.Risuai;
    return import('../src/lib/shared-state.js');
}

describe('Risu host bridge compatibility', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        delete window.risuai;
        delete window.Risuai;
    });

    it('binds to window.Risuai when the lowercase bridge is unavailable', async () => {
        const upperBridge = {
            getArgument: vi.fn().mockResolvedValue('upper-bridge'),
        };

        const mod = await importSharedStateWithHosts({ Risuai: upperBridge });

        expect(mod.Risu).toBe(upperBridge);
        expect(await mod.safeGetArg('host_key', 'fallback')).toBe('upper-bridge');
        expect(await mod.safeGetBoolArg('flag_key', true)).toBe(true);
        expect(upperBridge.getArgument).toHaveBeenCalledWith('host_key');
    });

    it('prefers window.risuai when both bridge spellings exist', async () => {
        const lowerBridge = {
            getArgument: vi.fn().mockResolvedValue('true'),
        };
        const upperBridge = {
            getArgument: vi.fn().mockResolvedValue('false'),
        };

        const mod = await importSharedStateWithHosts({ risuai: lowerBridge, Risuai: upperBridge });

        expect(mod.Risu).toBe(lowerBridge);
        expect(await mod.isDynamicFetchEnabled('OpenAI')).toBe(true);
        expect(lowerBridge.getArgument).toHaveBeenCalledWith('cpm_dynamic_openai');
        expect(upperBridge.getArgument).not.toHaveBeenCalled();
    });
});