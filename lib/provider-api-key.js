/**
 * API key policy for providers.
 *
 * A provider class declares the environment variable it reads with
 * `static apiKeyEnv` (and a display name with `static apiKeyName`).
 * Constructing a provider never throws for a missing key; ModelMix runs
 * an explicit check before attaching models so a chain that cannot
 * authenticate every provider fails at build time with one error that
 * lists every missing key.
 */

function resolveProviderApiKey(provider, customConfig = {}) {
    const environmentVariable = provider.constructor.apiKeyEnv;
    return customConfig.apiKey || (environmentVariable ? process.env[environmentVariable] : undefined);
}

function findMissingApiKey(provider, modelKey) {
    const environmentVariable = provider?.constructor?.apiKeyEnv;
    if (!environmentVariable || provider.config?.apiKey) return null;
    return {
        provider: provider.constructor.apiKeyName || provider.constructor.name,
        env: environmentVariable,
        ...(modelKey !== undefined && { model: modelKey })
    };
}

function formatMissingApiKey({ provider, env, model }) {
    const target = model === undefined ? provider : `${provider} (${model})`;
    return `${target}: set ${env} or pass config.apiKey`;
}

function missingApiKeysError(missing) {
    const error = new Error(missing.length === 1
        ? `${missing[0].provider} API key not found. Please provide it in config or set ${missing[0].env} environment variable.`
        : `Missing API keys for the requested models:\n${missing.map(item => `- ${formatMissingApiKey(item)}`).join('\n')}`);
    error.code = 'MISSING_API_KEY';
    error.missingKeys = missing;
    return error;
}

/**
 * Throw one error listing every provider in `models` ({ key, provider }[])
 * whose API key is not configured.
 */
function assertProviderApiKeys(models) {
    const missing = [];
    const seen = new Set();
    for (const { key, provider } of models) {
        const item = findMissingApiKey(provider, key);
        if (!item) continue;
        const id = `${item.env}\0${item.model}`;
        if (seen.has(id)) continue;
        seen.add(id);
        missing.push(item);
    }
    if (missing.length > 0) throw missingApiKeysError(missing);
}

module.exports = {
    resolveProviderApiKey,
    findMissingApiKey,
    assertProviderApiKeys
};
