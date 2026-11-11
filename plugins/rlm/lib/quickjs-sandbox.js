const path = require('path');
const { Worker } = require('worker_threads');
const { RlmLimitError } = require('./budget');

const WORKER_PATH = path.join(__dirname, 'quickjs-sandbox-worker.js');

function sandboxError({ name, message }) {
    if (/out of memory/i.test(message)) {
        return new RlmLimitError('sandboxMemoryBytes', 'RLM sandbox memory limit exceeded.');
    }
    const error = new Error(message);
    error.name = name;
    return error;
}

function createQuickJsSandbox() {
    return {
        async execute({ code, variables, query, limits, signal, timeoutMs }) {
            signal?.throwIfAborted();
            const stopFlag = new Int32Array(new SharedArrayBuffer(4));
            const worker = new Worker(WORKER_PATH, {
                workerData: {
                    code,
                    variables,
                    memoryLimitBytes: limits.sandboxMemoryBytes,
                    stopFlag
                }
            });
            let timeout;
            let onAbort;

            try {
                return await new Promise((resolve, reject) => {
                    timeout = setTimeout(() => reject(new RlmLimitError(
                        'maxWallTimeMs',
                        'RLM wall-time limit exceeded.'
                    )), timeoutMs);
                    onAbort = () => reject(signal.reason);
                    signal?.addEventListener('abort', onAbort, { once: true });

                    worker.on('message', message => {
                        if (message.type === 'result') {
                            resolve(message.value);
                        } else if (message.type === 'error') {
                            reject(sandboxError(message.error));
                        } else if (message.type === 'query') {
                            Promise.resolve()
                                .then(() => query(message.input))
                                .then(
                                    value => worker.postMessage({ id: message.id, ok: true, value }),
                                    error => worker.postMessage({
                                        id: message.id,
                                        ok: false,
                                        name: error?.name || 'Error',
                                        message: error?.message || String(error)
                                    })
                                );
                        }
                    });
                    worker.on('error', reject);
                    worker.on('exit', exitCode => reject(new Error(
                        `RLM sandbox worker exited with code ${exitCode}.`
                    )));
                });
            } finally {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', onAbort);
                Atomics.store(stopFlag, 0, 1);
                await worker.terminate();
            }
        }
    };
}

module.exports = { createQuickJsSandbox };
