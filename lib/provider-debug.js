function configForDebug(config) {
    const safeConfig = { ...config };
    delete safeConfig.apiKey;
    delete safeConfig.debug;
    return safeConfig;
}

function redactSecret(value, secret, seen = new WeakSet()) {
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

module.exports = { configForDebug, redactSecret };
