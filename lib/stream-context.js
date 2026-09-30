const { AsyncLocalStorage } = require('async_hooks');

// Per-request stream callback. Providers are shared between ModelMix instances,
// so the callback must not be stored on the provider object.
const streamCallbackStorage = new AsyncLocalStorage();

function runWithStreamCallback(callback, fn) {
    return streamCallbackStorage.run(callback || null, fn);
}

function currentStreamCallback() {
    return streamCallbackStorage.getStore() || null;
}

module.exports = { runWithStreamCallback, currentStreamCallback };
