import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { collectStream, checkStreamCapability, resetStreamCapability } from '../src/lib/stream-utils.js';

describe('collectStream', () => {
    it('collects string chunks', async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue('Hello ');
                controller.enqueue('World');
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('Hello World');
    });

    it('collects Uint8Array chunks', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('Hello'));
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('Hello');
    });

    it('handles empty stream', async () => {
        const stream = new ReadableStream({
            start(controller) { controller.close(); },
        });
        expect(await collectStream(stream)).toBe('');
    });

    it('handles null chunks gracefully', async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue('A');
                controller.enqueue(null);
                controller.enqueue('B');
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('AB');
    });

    it('handles mixed string and Uint8Array chunks', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue('Hello ');
                controller.enqueue(encoder.encode('World'));
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('Hello World');
    });

    it('collects ArrayBuffer chunks', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('Buffer!').buffer);
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('Buffer!');
    });

    it('stringifies unknown chunk types', async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(42);
                controller.enqueue(true);
                controller.close();
            },
        });
        expect(await collectStream(stream)).toBe('42true');
    });
});

describe('checkStreamCapability', () => {
    beforeEach(() => {
        resetStreamCapability();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        resetStreamCapability();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns true when structured-clone probe succeeds and caches the result', async () => {
        let channelCount = 0;
        class FakeMessageChannel {
            constructor() {
                channelCount++;
                this.port1 = {
                    close() {},
                    postMessage: () => {
                        queueMicrotask(() => this.port2.onmessage?.({ data: { ok: true } }));
                    },
                };
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(checkStreamCapability()).resolves.toBe(true);
        await expect(checkStreamCapability()).resolves.toBe(true);

        expect(channelCount).toBe(1);
        expect(logSpy).toHaveBeenCalledWith('[CupcakePM] ReadableStream is structured-cloneable — streaming enabled.');
    });

    it('falls back to guest-bridge transfer probe when structured clone fails', async () => {
        let phase = 0;
        class FakeMessageChannel {
            constructor() {
                phase++;
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
                this.port1 = {
                    close() {},
                    postMessage: (_payload, transferables) => {
                        if (phase === 1) throw new Error('clone failed');
                        if (transferables?.length) queueMicrotask(() => this.port2.onmessage?.({ data: { ok: true } }));
                    },
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', {
            querySelector: vi.fn(() => ({
                textContent: 'function collectTransferables(obj, transferables = []) { if (obj instanceof ReadableStream) transferables.push(obj); return transferables; }',
            })),
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(checkStreamCapability()).resolves.toBe(true);

        expect(logSpy).toHaveBeenCalledWith('[CupcakePM] Guest bridge patched + browser supports transfer — streaming enabled.');
    });

    it('returns false when both probes fail', async () => {
        class FakeMessageChannel {
            constructor() {
                this.port1 = {
                    close() {},
                    postMessage: () => { throw new Error('no transfer'); },
                };
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', { querySelector: vi.fn(() => ({ textContent: 'function noop() { return transferables; }' })) });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(checkStreamCapability()).resolves.toBe(false);

        expect(logSpy).toHaveBeenCalledWith('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
    });

    it('returns false when structured-clone emits messageerror and caches the result', async () => {
        let channelCount = 0;
        class FakeMessageChannel {
            constructor() {
                channelCount++;
                this.port1 = {
                    close() {},
                    postMessage: () => {
                        queueMicrotask(() => this.port2.onmessageerror?.(new Event('messageerror')));
                    },
                };
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(checkStreamCapability()).resolves.toBe(false);
        await expect(checkStreamCapability()).resolves.toBe(false);

        expect(channelCount).toBe(1);
        expect(logSpy).toHaveBeenCalledWith('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
    });

    it('resetStreamCapability clears cached result for a new probe', async () => {
        let mode = 'success';
        class FakeMessageChannel {
            constructor() {
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
                this.port1 = {
                    close() {},
                    postMessage: () => {
                        if (mode === 'success') queueMicrotask(() => this.port2.onmessage?.({ data: { ok: true } }));
                        else throw new Error('fail');
                    },
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
        vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(checkStreamCapability()).resolves.toBe(true);
        resetStreamCapability();
        mode = 'fail';

        await expect(checkStreamCapability()).resolves.toBe(false);
    });

    it('returns false via Phase 1 timeout when postMessage never triggers callbacks', async () => {
        vi.useFakeTimers();
        class FakeMessageChannel {
            constructor() {
                this.port1 = {
                    close() {},
                    // postMessage succeeds but never fires onmessage/onmessageerror
                    postMessage: () => {},
                };
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', { querySelector: vi.fn(() => null) });
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const promise = checkStreamCapability();
        // Advance past the 500ms timeout in Phase 1
        await vi.advanceTimersByTimeAsync(600);
        await expect(promise).resolves.toBe(false);
        vi.useRealTimers();
    });

    it('returns false via Phase 2 timeout when guest-bridge postMessage never responds', async () => {
        vi.useFakeTimers();
        let phase = 0;
        class FakeMessageChannel {
            constructor() {
                phase++;
                this.port2 = {
                    onmessage: null,
                    onmessageerror: null,
                    close() {},
                };
                this.port1 = {
                    close() {},
                    postMessage: (_payload, _transferables) => {
                        if (phase === 1) throw new Error('clone failed');
                        // Phase 2: postMessage succeeds but never triggers onmessage (timeout)
                    },
                };
            }
        }
        vi.stubGlobal('MessageChannel', FakeMessageChannel);
        vi.stubGlobal('document', {
            querySelector: vi.fn(() => ({
                textContent: 'function collectTransferables(obj, transferables = []) { if (obj instanceof ReadableStream) transferables.push(obj); return transferables; }',
            })),
        });
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const promise = checkStreamCapability();
        // Advance past Phase 1 timeout (500ms) + Phase 2 timeout (500ms)
        await vi.advanceTimersByTimeAsync(1200);
        await expect(promise).resolves.toBe(false);
        vi.useRealTimers();
    });
});
