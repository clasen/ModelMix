import { assertProviderApiKeys, type ApiKeyProvider } from './provider-api-key';

interface ExecutionProvider extends ApiKeyProvider {
    config?: { apiKey?: unknown };
    options?: unknown;
}

export function assertAbortSignal(signal: unknown): asserts signal is AbortSignal | undefined {
    if (signal === undefined) return;
    if (!(signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal.');
    }
    signal.throwIfAborted();
}

export function assertNoStoredSignal(value: unknown, label: string): void {
    if (value && Object.prototype.hasOwnProperty.call(value, 'signal')) {
        throw new TypeError(`${label}.signal is not supported; pass the AbortSignal to the execution method.`);
    }
}

export function throwIfAborted(signal: AbortSignal | null | undefined): void {
    if (signal) signal.throwIfAborted();
}

export function validateProviderExecution(
    provider: ExecutionProvider,
    { config, options, signal }: { config?: unknown; options?: { model?: string } | null; signal?: unknown }
): void {
    assertAbortSignal(signal);
    assertNoStoredSignal(provider.config, 'provider.config');
    assertNoStoredSignal(provider.options, 'provider.options');
    assertNoStoredSignal(config, 'config');
    assertNoStoredSignal(options, 'options');
    // Providers used directly (without attach()) still fail before sending an unauthenticated request.
    assertProviderApiKeys([{ key: options?.model, provider }]);
}

export function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
    if (!signal) return promise;
    throwIfAborted(signal);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.race([promise, aborted]).finally(() => {
        signal.removeEventListener('abort', onAbort);
    });
}

export function sleepWithSignal(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
    if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
    throwIfAborted(signal);
    let timeout: NodeJS.Timeout | undefined;
    const sleep = new Promise<void>(resolve => {
        timeout = setTimeout(resolve, ms);
    });
    return raceWithSignal(sleep, signal).finally(() => clearTimeout(timeout));
}
