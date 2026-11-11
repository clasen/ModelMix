export function configForDebug<T extends object>(config: T): Omit<T, 'apiKey' | 'debug'> {
    const safeConfig: Record<string, unknown> = { ...(config as Record<string, unknown>) };
    delete safeConfig.apiKey;
    delete safeConfig.debug;
    return safeConfig as Omit<T, 'apiKey' | 'debug'>;
}

export function redactSecret(value: unknown, secret: string | null | undefined, seen: WeakSet<object> = new WeakSet()): unknown {
    if (!secret) return value;
    if (typeof value === 'string') return value.split(secret).join('[REDACTED]');
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';

    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => redactSecret(item, secret, seen));
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, redactSecret(item, secret, seen)])
    );
}
