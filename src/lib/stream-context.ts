import { AsyncLocalStorage } from 'async_hooks';
import type { StreamCallback } from '../types';

// Per-request stream callback. Providers are shared between ModelMix instances,
// so the callback must not be stored on the provider object.
const streamCallbackStorage = new AsyncLocalStorage<StreamCallback | null>();

export function runWithStreamCallback<T>(callback: StreamCallback | null | undefined, fn: () => T): T {
    return streamCallbackStorage.run(callback || null, fn);
}

export function currentStreamCallback(): StreamCallback | null {
    return streamCallbackStorage.getStore() || null;
}
