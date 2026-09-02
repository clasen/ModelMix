function assertAbortSignal(signal) {
    if (signal === undefined) return;
    if (!(signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal.');
    }
    signal.throwIfAborted();
}

function assertNoStoredSignal(value, label) {
    if (value && Object.prototype.hasOwnProperty.call(value, 'signal')) {
        throw new TypeError(`${label}.signal is not supported; pass the AbortSignal to the execution method.`);
    }
}

function throwIfAborted(signal) {
    if (signal) signal.throwIfAborted();
}

function validateProviderExecution(provider, { config, options, signal }) {
    assertAbortSignal(signal);
    assertNoStoredSignal(provider.config, 'provider.config');
    assertNoStoredSignal(provider.options, 'provider.options');
    assertNoStoredSignal(config, 'config');
    assertNoStoredSignal(options, 'options');
}

function raceWithSignal(promise, signal) {
    if (!signal) return promise;
    throwIfAborted(signal);
    let onAbort;
    const aborted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.race([promise, aborted]).finally(() => {
        signal.removeEventListener('abort', onAbort);
    });
}

function sleepWithSignal(ms, signal) {
    if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
    throwIfAborted(signal);
    let timeout;
    const sleep = new Promise(resolve => {
        timeout = setTimeout(resolve, ms);
    });
    return raceWithSignal(sleep, signal).finally(() => clearTimeout(timeout));
}

module.exports = {
    assertAbortSignal,
    assertNoStoredSignal,
    raceWithSignal,
    sleepWithSignal,
    throwIfAborted,
    validateProviderExecution
};
