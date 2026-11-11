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

import type { MissingApiKey, MissingApiKeyError } from '../types';

interface ProviderClassInfo {
    name: string;
    apiKeyEnv?: string;
    apiKeyName?: string;
}

export interface ApiKeyProvider {
    config?: { apiKey?: unknown };
}

export interface ProviderModelEntry {
    key?: string;
    provider: ApiKeyProvider;
}

function providerClass(provider: object): ProviderClassInfo {
    return provider.constructor as unknown as ProviderClassInfo;
}

export function resolveProviderApiKey(provider: object, customConfig: { apiKey?: string } = {}): string | undefined {
    const environmentVariable = providerClass(provider).apiKeyEnv;
    return customConfig.apiKey || (environmentVariable ? process.env[environmentVariable] : undefined);
}

export function findMissingApiKey(provider: ApiKeyProvider | null | undefined, modelKey?: string): MissingApiKey | null {
    const providerInfo = provider?.constructor as unknown as ProviderClassInfo | undefined;
    const environmentVariable = providerInfo?.apiKeyEnv;
    if (!provider || !providerInfo || !environmentVariable || provider.config?.apiKey) return null;
    return {
        provider: providerInfo.apiKeyName || providerInfo.name,
        env: environmentVariable,
        ...(modelKey !== undefined && { model: modelKey })
    };
}

function formatMissingApiKey({ provider, env, model }: MissingApiKey): string {
    const target = model === undefined ? provider : `${provider} (${model})`;
    return `${target}: set ${env} or pass config.apiKey`;
}

function missingApiKeysError(missing: MissingApiKey[]): MissingApiKeyError {
    const error = new Error(missing.length === 1
        ? `${missing[0].provider} API key not found. Please provide it in config or set ${missing[0].env} environment variable.`
        : `Missing API keys for the requested models:\n${missing.map(item => `- ${formatMissingApiKey(item)}`).join('\n')}`) as MissingApiKeyError;
    error.code = 'MISSING_API_KEY';
    error.missingKeys = missing;
    return error;
}

/**
 * Throw one error listing every provider in `models` ({ key, provider }[])
 * whose API key is not configured.
 */
export function assertProviderApiKeys(models: Iterable<ProviderModelEntry>): void {
    const missing: MissingApiKey[] = [];
    const seen = new Set<string>();
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
