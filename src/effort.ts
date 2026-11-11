/**
 * Unified effort scale for ModelMix.
 *
 * Policy value: integer -1 (adaptive) or 0..100.
 * Stored in config.effort (never in native options).
 * Mapped to provider-native fields only when native effort controls are absent.
 */

import type { ModelMixConfig, ModelMixOptions, ProviderFamily } from './types';

type Band = readonly [number, number, string];

export interface EffortPatch {
    reasoning_effort?: string;
    thinking?: { type: string; budget_tokens?: number; display?: string };
    output_config?: { effort: string };
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string };
}

type EffortOptions = Record<string, any>;

export const OPENAI_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_LEVEL_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const ANTHROPIC_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const GEMINI_LEVELS = ['minimal', 'low', 'medium', 'high'];

export const OPENAI_BANDS: Band[] = [
    [0, 19, 'none'],
    [20, 39, 'low'],
    [40, 59, 'medium'],
    [60, 79, 'high'],
    [80, 100, 'xhigh'],
];

export const ANTHROPIC_BANDS: Band[] = [
    [0, 19, 'low'],
    [20, 39, 'medium'],
    [40, 59, 'high'],
    [60, 79, 'xhigh'],
    [80, 100, 'max'],
];

export const GEMINI_BANDS: Band[] = [
    [0, 24, 'minimal'],
    [25, 49, 'low'],
    [50, 74, 'medium'],
    [75, 100, 'high'],
];

const GLM53_BANDS: Band[] = [
    [0, 39, 'low'],
    [40, 79, 'high'],
    [80, 100, 'max'],
];

/** Exact model → supported OpenAI reasoning_effort values */
const OPENAI_MODEL_LEVELS: Record<string, string[]> = {
    'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6.1-sol': ['low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6.1-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'anthropic/claude-fable-5.2': ['low', 'medium', 'high', 'xhigh', 'max'],
    'anthropic/claude-fable-5.1': ['low', 'medium', 'high', 'xhigh', 'max'],
    'meta/muse-glimmer-30b': ['low', 'medium', 'high'],
    'accounts/fireworks/models/muse-glimmer-30b': ['low', 'medium', 'high', 'xhigh'],
    'meta-models/Muse-Glimmer-30B': ['low', 'medium', 'high', 'xhigh'],
    'meta/muse-ember': ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    'meta/muse-wonder': ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    'meta/muse-spark-1.2': ['minimal', 'low', 'medium', 'high', 'xhigh'],
    'meta/muse-spark-1.3-contributor': ['minimal', 'low', 'medium', 'high', 'xhigh'],
    'meta/muse-spark-1.2-contributor': ['minimal', 'low', 'medium', 'high', 'xhigh'],
    'meta/muse-spark-1.3': ['minimal', 'low', 'medium', 'high', 'xhigh'],
    'accounts/fireworks/models/qwen3p8-2p4t-a95b': ['none', 'low', 'medium', 'high'],
    'qwen/qwen3.8-27b': ['low', 'medium', 'xhigh'],
    'qwen/qwen3.8-flash': ['low', 'medium', 'xhigh'],
    'z-ai/glm-5.3': ['low', 'high', 'max'],
    'z-ai/glm-5.3-flash': ['low', 'high', 'max'],
    'grok-4.6': ['low', 'medium', 'high', 'xhigh'],
    'gpt-5': ['minimal', 'low', 'medium', 'high'],
    'gpt-5-mini': ['minimal', 'low', 'medium', 'high'],
    'gpt-5-nano': ['minimal', 'low', 'medium', 'high'],
    'gpt-5.3-codex': ['low', 'medium', 'high', 'xhigh'],
    'gpt-oss-120b': ['low', 'medium', 'high'],
    'openai/gpt-oss-120b': ['low', 'medium', 'high'],
    'accounts/fireworks/models/gpt-oss-120b': ['low', 'medium', 'high'],
    'kimi-k3': ['low', 'high', 'max'],
    'moonshotai/kimi-k3': ['low', 'high', 'max'],
    'accounts/fireworks/models/kimi-k3': ['low', 'high', 'max'],
    'moonshotai/Kimi-K3': ['low', 'high', 'max'],
    'kimi-k3.1-pro': ['low', 'high', 'max'],
    'kimi-k3.1-pro-highspeed': ['low', 'high', 'max'],
    'moonshotai/kimi-k3.1-pro': ['low', 'high', 'max'],
    'MiniMax-M3.1-Flash-Preview': ['low', 'medium', 'high', 'xhigh', 'max'],
    'zai-org/GLM-5.2': ['high', 'xhigh'],
    'accounts/fireworks/models/glm-5p2': ['high', 'xhigh'],
    'z-ai/glm-5.2': ['high', 'xhigh'],
};

/**
 * DeepSeek V4 (OpenAI-compatible): reasoning_effort low|high|max + thinking toggle.
 * Official mapping: low/high/max; xhigh remaps per model (flash→high, pro→max).
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 */
export const DEEPSEEK_LEVELS = ['none', 'low', 'high', 'max'];
export const DEEPSEEK_BANDS: Band[] = [
    [0, 19, 'none'],
    [20, 39, 'low'],
    [40, 79, 'high'],
    [80, 100, 'max'],
];

/**
 * MiniMax M3 (OpenAI-compatible): thinking.type disabled | adaptive.
 * @see https://platform.minimax.io/docs/api-reference/text-openai-api
 */
const MINIMAX_BANDS: Band[] = [
    [0, 19, 'disabled'],
    [20, 100, 'adaptive'],
];

/** Exact model → supported Gemini thinkingLevel values */
const GEMINI_MODEL_LEVELS: Record<string, string[]> = {
    'gemini-4-carbon': ['low', 'medium', 'high'],
    'gemini-4-argon': ['low', 'medium', 'high'],
    'gemini-3.8-flash': ['low', 'medium', 'high'],
    'gemini-3.7-flash': ['low', 'medium', 'high'],
    'gemini-3-pro-preview': ['low', 'high'],
    'gemini-3.1-pro-preview': ['low', 'medium', 'high'],
    'gemini-2.5-pro': ['low', 'medium', 'high'],
    'gemini-2.5-flash': ['low', 'medium', 'high'],
    'gemini-2.5-flash-lite': ['low', 'medium', 'high'],
};

const GEMINI_25_BUDGET_MAX: Record<string, number> = {
    'gemini-2.5-pro': 32768,
    'gemini-2.5-flash': 24576,
    'gemini-2.5-flash-lite': 24576,
};

/** Logical alias key `grok-4.20-0309` — resolved to reasoning / non-reasoning at request time. */
export const GROK420_ALIAS = 'grok-4.20-0309';
export const GROK420_REASONING = 'grok-4.20-0309-reasoning';
export const GROK420_NON_REASONING = 'grok-4.20-0309-non-reasoning';

export function isGrok420Alias(modelKey: unknown): boolean {
    return modelKey === GROK420_ALIAS;
}

/**
 * Pick Grok 4.20 concrete model from unified effort (and native reasoning_effort).
 * - no effort / OpenAI band `none` (0–19) / native `none` → non-reasoning
 * - effort -1 or 20–100 / native non-none reasoning_effort → reasoning
 */
export function resolveGrok420ModelKey(modelKey: string, effort: unknown, options: EffortOptions = {}): string {
    if (!isGrok420Alias(modelKey)) return modelKey;

    const native = options.reasoning_effort;
    if (native != null && native !== '') {
        return native === 'none' ? GROK420_NON_REASONING : GROK420_REASONING;
    }

    if (effort === undefined || effort === null) {
        return GROK420_NON_REASONING;
    }

    const normalized = normalizeEffort(effort);
    if (normalized === -1) return GROK420_REASONING;

    const level = levelFromBands(normalized, OPENAI_BANDS);
    return level === 'none' ? GROK420_NON_REASONING : GROK420_REASONING;
}

export function normalizeEffort(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`Invalid effort: expected integer -1 or 0..100, got ${JSON.stringify(value)}`);
    }
    if (value === -1) return -1;
    if (value < 0 || value > 100) {
        throw new Error(`Invalid effort: expected integer -1 or 0..100, got ${value}`);
    }
    return value;
}

export function levelFromBands(effort: number, bands: readonly Band[]): string {
    for (const [lo, hi, level] of bands) {
        if (effort >= lo && effort <= hi) return level;
    }
    return bands[bands.length - 1][2];
}

export function pickNearestLevel(desired: string, ladder: readonly string[], supported: readonly string[]): string {
    if (supported.includes(desired)) return desired;
    const desiredIdx = ladder.indexOf(desired);
    if (desiredIdx === -1) return supported[Math.floor(supported.length / 2)];

    let best = supported[0];
    let bestDist = Infinity;
    for (const level of supported) {
        const idx = ladder.indexOf(level);
        if (idx === -1) continue;
        const dist = Math.abs(idx - desiredIdx);
        if (dist < bestDist) {
            bestDist = dist;
            best = level;
        }
    }
    return best;
}

function supportedOpenAILevels(modelKey: unknown): string[] {
    const canonicalModelKey = typeof modelKey === 'string' && modelKey.startsWith('openai/')
        ? modelKey.slice('openai/'.length)
        : modelKey;
    if (typeof canonicalModelKey === 'string' && canonicalModelKey && OPENAI_MODEL_LEVELS[canonicalModelKey]) {
        return OPENAI_MODEL_LEVELS[canonicalModelKey];
    }
    return OPENAI_LEVELS;
}

function supportedGeminiLevels(modelKey: unknown): string[] {
    if (typeof modelKey === 'string' && modelKey && GEMINI_MODEL_LEVELS[modelKey]) {
        return GEMINI_MODEL_LEVELS[modelKey];
    }
    return GEMINI_LEVELS;
}

function isGemini25(modelKey: unknown): boolean {
    return typeof modelKey === 'string' && modelKey.includes('2.5');
}

export function isDeepSeekV4(modelKey: unknown): boolean {
    if (typeof modelKey !== 'string') return false;
    const key = modelKey.toLowerCase();
    return key === 'deepseek-flash' || key === '~deepseek/deepseek-pro-latest'
        || key.includes('deepseek-v4') || key.includes('deepseek_v4');
}

export function isMiniMax(modelKey: unknown): boolean {
    return typeof modelKey === 'string' && modelKey.toLowerCase().includes('minimax');
}

/** MiniMax models controlled by thinking.type; M3.1 Flash Preview uses reasoning_effort instead. */
function usesMiniMaxThinking(modelKey: unknown): boolean {
    return isMiniMax(modelKey) && !OPENAI_MODEL_LEVELS[modelKey as string];
}

/** Max budget_tokens when mapping unified effort onto manual Anthropic thinking. */
export const ANTHROPIC_MANUAL_BUDGET_MAX = 16384;

/**
 * Models that use adaptive thinking + output_config.effort (Claude 5 / Fable /
 * Opus 4.6+ / Sonnet 4.6+ / Haiku 5+). Older ones (Sonnet 4.5, Haiku 4.5, Opus 4.5) use
 * thinking.type=enabled + budget_tokens.
 */
export function usesAnthropicAdaptiveThinking(modelKey: unknown): boolean {
    const id = String(modelKey || '').toLowerCase();
    if (!id) return true;
    if (!id.includes('claude')) return true;
    if (id.includes('fable') || id.includes('mythos')) return true;

    const opus = id.match(/claude-opus-(\d+)(?:-(\d+))?/);
    if (opus) {
        const major = Number(opus[1]);
        const minor = opus[2] !== undefined ? Number(opus[2]) : 0;
        return major > 4 || (major === 4 && minor >= 6);
    }

    const sonnet = id.match(/claude-sonnet-(\d+)(?:-(\d+))?/);
    if (sonnet) {
        const major = Number(sonnet[1]);
        const minor = sonnet[2] !== undefined ? Number(sonnet[2]) : 0;
        return major > 4 || (major === 4 && minor >= 6);
    }

    // Haiku 4.5 and earlier: manual extended thinking only
    const haiku = id.match(/claude-haiku-(\d+)/);
    if (haiku) return Number(haiku[1]) >= 5;
    if (id.includes('haiku')) return false;

    return true;
}

function mapAnthropicManualBudget(normalized: number): number {
    return Math.max(1024, Math.round((normalized / 100) * ANTHROPIC_MANUAL_BUDGET_MAX));
}

function mapAnthropicEffort(normalized: number, modelKey: unknown): EffortPatch {
    if (!usesAnthropicAdaptiveThinking(modelKey)) {
        return {
            thinking: {
                type: 'enabled',
                budget_tokens: mapAnthropicManualBudget(normalized)
            }
        };
    }

    const desired = levelFromBands(normalized, ANTHROPIC_BANDS);
    const level = pickNearestLevel(desired, ANTHROPIC_LEVELS, ANTHROPIC_LEVELS);
    return {
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: level }
    };
}

function mapDeepSeekEffort(normalized: number): EffortPatch | null {
    // DeepSeek V4 has no adaptive mode (only enabled/disabled + low|high|max)
    if (normalized === -1) return null;
    const level = levelFromBands(normalized, DEEPSEEK_BANDS);
    if (level === 'none') {
        return { thinking: { type: 'disabled' } };
    }
    return {
        reasoning_effort: level,
        thinking: { type: 'enabled' }
    };
}

function mapMiniMaxEffort(normalized: number): EffortPatch {
    if (normalized === -1) {
        return { thinking: { type: 'adaptive' } };
    }
    const level = levelFromBands(normalized, MINIMAX_BANDS);
    return { thinking: { type: level } };
}

/**
 * Explicit adaptive mapping when the provider/model exposes it.
 * Returns null when adaptive is not a settable native control.
 */
export function mapAdaptiveEffort(providerFamily: ProviderFamily | null | undefined, modelKey: unknown): EffortPatch | null {
    if (providerFamily === 'anthropic') {
        return { thinking: { type: 'adaptive' } };
    }
    if (providerFamily === 'google') {
        // These models reject thinkingBudget; omitting thinking keeps their native default
        if (['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash'].includes(modelKey as string)) return null;
        // Gemini dynamic thinking: thinkingBudget -1 (2.5 official; accepted on 3.x as dynamic)
        return { thinkingConfig: { thinkingBudget: -1 } };
    }
    if (providerFamily === 'openai' && usesMiniMaxThinking(modelKey)) {
        return { thinking: { type: 'adaptive' } };
    }
    // OpenAI / DeepSeek: no adaptive enum — cannot set adaptive
    return null;
}

function gemini25BudgetMax(modelKey: unknown): number {
    if (typeof modelKey === 'string' && modelKey && GEMINI_25_BUDGET_MAX[modelKey] != null) {
        return GEMINI_25_BUDGET_MAX[modelKey];
    }
    return 24576;
}

/**
 * Provider classes declare their effort mapping family with `static family`.
 * @returns {'openai'|'anthropic'|'google'|null}
 */
export function resolveProviderFamily(providerInstance: object | null | undefined): ProviderFamily | null {
    return (providerInstance?.constructor as { family?: ProviderFamily | null } | undefined)?.family ?? null;
}

export function hasNativeEffort(family: ProviderFamily | null | undefined, options: EffortOptions = {}, modelKey?: unknown): boolean {
    if (family === 'openai') {
        if (options.reasoning_effort != null && options.reasoning_effort !== '') return true;
        // DeepSeek / MiniMax use thinking.type as the on/off (or adaptive) control
        if ((isDeepSeekV4(modelKey) || usesMiniMaxThinking(modelKey)) && options.thinking != null) return true;
        return false;
    }
    if (family === 'anthropic') {
        return options.output_config?.effort != null && options.output_config.effort !== '';
    }
    if (family === 'google') {
        if (options.thinkingConfig != null) return true;
        if (options.thinkingLevel != null) return true;
        if (options.thinkingBudget != null) return true;
        return false;
    }
    return false;
}

/**
 * Map unified effort to a provider-native patch object.
 * Returns null when there is nothing to set (unsupported family, or -1 on a
 * model with no adaptive control).
 *
 * @returns {object|null}
 */
export function mapEffort(providerFamily: ProviderFamily | null | undefined, effort: unknown, modelKey?: unknown): EffortPatch | null {
    const normalized = normalizeEffort(effort);

    if (!providerFamily) return null;

    if (normalized === -1) {
        return mapAdaptiveEffort(providerFamily, modelKey);
    }

    if (providerFamily === 'openai') {
        if (isDeepSeekV4(modelKey)) {
            return mapDeepSeekEffort(normalized);
        }
        if (usesMiniMaxThinking(modelKey)) {
            return mapMiniMaxEffort(normalized);
        }
        // Non-reasoning Grok 4.20 has no reasoning_effort control
        if (modelKey === GROK420_NON_REASONING) {
            return null;
        }
        const supported = supportedOpenAILevels(modelKey);
        const desired = modelKey === 'z-ai/glm-5.3' || modelKey === 'z-ai/glm-5.3-flash'
            ? levelFromBands(normalized, GLM53_BANDS)
            : ['anthropic/claude-fable-5.2', 'anthropic/claude-fable-5.1', 'MiniMax-M3.1-Flash-Preview'].includes(modelKey as string)
                ? levelFromBands(normalized, ANTHROPIC_BANDS)
                : normalized === 100 && supported.includes('max')
                    ? 'max'
                    : levelFromBands(normalized, OPENAI_BANDS);
        const level = pickNearestLevel(desired, OPENAI_LEVEL_LADDER, supported);
        return { reasoning_effort: level };
    }

    if (providerFamily === 'anthropic') {
        return mapAnthropicEffort(normalized, modelKey);
    }

    if (providerFamily === 'google') {
        if (isGemini25(modelKey)) {
            const max = gemini25BudgetMax(modelKey);
            const budget = Math.round((normalized / 100) * max);
            return { thinkingConfig: { thinkingBudget: budget } };
        }
        const desired = levelFromBands(normalized, GEMINI_BANDS);
        const level = pickNearestLevel(desired, GEMINI_LEVELS, supportedGeminiLevels(modelKey));
        return { thinkingConfig: { thinkingLevel: level } };
    }

    return null;
}

/**
 * Apply config.effort onto options when native controls are absent.
 * Mutates and returns options. Never writes ModelMix `effort` into the HTTP body.
 */
export function applyUnifiedEffort(
    options: ModelMixOptions,
    config: ModelMixConfig | null | undefined,
    providerFamily: ProviderFamily | null | undefined,
    modelKey?: string
): ModelMixOptions {
    if (!config || config.effort === undefined || config.effort === null) {
        return options;
    }
    if (!providerFamily) return options;
    if (hasNativeEffort(providerFamily, options, modelKey)) return options;

    const patch = mapEffort(providerFamily, config.effort, modelKey);
    if (!patch) return options;

    if (patch.reasoning_effort !== undefined) {
        options.reasoning_effort = patch.reasoning_effort;
    }
    if (patch.output_config) {
        options.output_config = {
            ...((options.output_config as object | undefined) || {}),
            ...patch.output_config
        };
    }
    if (patch.thinking) {
        options.thinking = {
            ...((options.thinking as object | undefined) || {}),
            ...patch.thinking
        };
        // Adaptive thinking rejects budget_tokens; drop it if we switched mode.
        if (patch.thinking.type === 'adaptive') {
            delete (options.thinking as Record<string, unknown>).budget_tokens;
        }
        // DeepSeek non-thinking: do not send reasoning_effort
        if (patch.thinking.type === 'disabled') {
            delete options.reasoning_effort;
        }
    }
    if (patch.thinkingConfig) {
        options.thinkingConfig = {
            ...((options.thinkingConfig as object | undefined) || {}),
            ...patch.thinkingConfig
        };
    }

    return options;
}

export function resolveNamedEffort(providerFamily: ProviderFamily | null | undefined, name: unknown, modelKey?: unknown): number {
    if (name === 'adaptive' && mapAdaptiveEffort(providerFamily, modelKey)) {
        return -1;
    }
    if (typeof name === 'string' && name !== 'adaptive') {
        for (let effort = 0; effort <= 100; effort++) {
            const patch = mapEffort(providerFamily, effort, modelKey);
            const level = patch?.reasoning_effort ?? patch?.output_config?.effort
                ?? patch?.thinkingConfig?.thinkingLevel ?? patch?.thinking?.type;
            if (level === name) return effort;
        }
    }
    throw new Error(`Invalid effort ${JSON.stringify(name)} for model "${modelKey}": no exact named level is available; use a supported name or numeric effort.`);
}

