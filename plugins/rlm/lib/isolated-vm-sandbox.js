const ivm = require('isolated-vm');
const { RlmLimitError } = require('./budget');

const MINIMUM_ISOLATE_MEMORY_BYTES = 8 * 1024 * 1024;

function timeoutError() {
    return new RlmLimitError('maxWallTimeMs', 'RLM wall-time limit exceeded.');
}

function memoryError(error) {
    return /memory|heap|array buffer allocation/i.test(error.message);
}

function executionTimeoutError(error) {
    return /timed out|execution terminated/i.test(error.message);
}

function sandboxSource(code) {
    return `'use strict';\n${code}`;
}

function createIsolatedVmSandbox() {
    return {
        async execute({ code, variables, query, limits, signal, timeoutMs }) {
            signal?.throwIfAborted();
            if (limits.sandboxMemoryBytes < MINIMUM_ISOLATE_MEMORY_BYTES) {
                throw new TypeError(
                    `limits.sandboxMemoryBytes must be at least ${MINIMUM_ISOLATE_MEMORY_BYTES}.`
                );
            }
            const isolate = new ivm.Isolate({
                memoryLimit: Math.ceil(limits.sandboxMemoryBytes / (1024 * 1024))
            });
            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                if (!isolate.isDisposed) isolate.dispose();
            }, timeoutMs);
            const onAbort = () => {
                if (!isolate.isDisposed) isolate.dispose();
            };
            signal?.addEventListener('abort', onAbort, { once: true });

            try {
                const context = await isolate.createContext();
                const jail = context.global;
                await jail.set(
                    'variables',
                    new ivm.ExternalCopy(variables).copyInto()
                );
                await jail.set('__queryReference', new ivm.Reference(query));
                await context.eval(`
                    (() => {
                        const queryReference = globalThis.__queryReference;
                        Object.defineProperty(globalThis, 'query', {
                            configurable: false,
                            enumerable: true,
                            writable: false,
                            value(input) {
                                return queryReference.apply(undefined, [input], {
                                    arguments: { copy: true },
                                    result: { promise: true, copy: true }
                                });
                            }
                        });
                        delete globalThis.__queryReference;
                    })();
                `, { timeout: timeoutMs });
                return await context.eval(sandboxSource(code), {
                    copy: true,
                    filename: 'rlm-planner.js',
                    promise: true,
                    timeout: timeoutMs
                });
            } catch (error) {
                signal?.throwIfAborted();
                if (memoryError(error)) {
                    throw new RlmLimitError(
                        'sandboxMemoryBytes',
                        'RLM sandbox memory limit exceeded.'
                    );
                }
                if (timedOut || executionTimeoutError(error)) throw timeoutError();
                throw error;
            } finally {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', onAbort);
                if (!isolate.isDisposed) isolate.dispose();
            }
        }
    };
}

module.exports = {
    MINIMUM_ISOLATE_MEMORY_BYTES,
    createIsolatedVmSandbox
};
