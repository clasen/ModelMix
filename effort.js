/**
 * Unified effort scale for ModelMix.
 *
 * Policy value: integer -1 (adaptive) or 0..100.
 * Stored in config.effort (never in native options).
 * Mapped to provider-native fields only when native effort controls are absent.
 */

const OPENAI_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_LEVEL_LADDER = [...OPENAI_LEVELS, 'max'];
const ANTHROPIC_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const GEMINI_LEVELS = ['minimal', 'low', 'medium', 'high'];

const OPENAI_BANDS = [
    [0, 19, 'none'],
    [20, 39, 'low'],
    [40, 59, 'medium'],
    [60, 79, 'high'],
    [80, 100, 'xhigh'],
];

const ANTHROPIC_BANDS = [
    [0, 19, 'low'],
    [20, 39, 'medium'],
    [40, 59, 'high'],
    [60, 79, 'xhigh'],
    [80, 100, 'max'],
];

const GEMINI_BANDS = [
    [0, 24, 'minimal'],
    [25, 49, 'low'],
    [50, 74, 'medium'],
    [75, 100, 'high'],
];

/** Exact model → supported OpenAI reasoning_effort values */
const OPENAI_MODEL_LEVELS = {
    'gpt-5.6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'gpt-5.6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    'accounts/fireworks/models/qwen3p8-2p4t-a95b': ['none', 'low', 'medium', 'high'],
    'grok-4.6': ['low', 'medium', 'high', 'xhigh'],
    'gpt-5': ['minimal', 'low', 'medium', 'high'],
    'gpt-5-mini': ['minimal', 'low', 'medium', 'high'],
    'gpt-5-nano': ['minimal', 'low', 'medium', 'high'],
    'gpt-5.3-codex': ['low', 'medium', 'high', 'xhigh'],
    'gpt-oss-120b': ['low', 'medium', 'high'],
    'openai/gpt-oss-120b': ['low', 'medium', 'high'],
    'openai/gpt-oss-120b:free': ['low', 'medium', 'high'],
};

/**
 * DeepSeek V4 (OpenAI-compatible): reasoning_effort low|high|max + thinking toggle.
 * Official mapping: low/high/max; xhigh remaps per model (flash→high, pro→max).
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 */
const DEEPSEEK_LEVELS = ['none', 'low', 'high', 'max'];
const DEEPSEEK_BANDS = [
    [0, 19, 'none'],
    [20, 39, 'low'],
    [40, 79, 'high'],
    [80, 100, 'max'],
];

/**
 * MiniMax M3 (OpenAI-compatible): thinking.type disabled | adaptive.
 * @see https://platform.minimax.io/docs/api-reference/text-openai-api
 */
const MINIMAX_LEVELS = ['disabled', 'adaptive'];
const MINIMAX_BANDS = [
    [0, 19, 'disabled'],
    [20, 100, 'adaptive'],
];

/** Exact model → supported Gemini thinkingLevel values */
const GEMINI_MODEL_LEVELS = {
    'gemini-3.7-flash': ['low', 'medium', 'high'],
    'gemini-3-pro-preview': ['low', 'high'],
    'gemini-3.1-pro-preview': ['low', 'medium', 'high'],
    'gemini-2.5-pro': ['low', 'medium', 'high'],
    'gemini-2.5-flash': ['low', 'medium', 'high'],
    'gemini-2.5-flash-lite': ['low', 'medium', 'high'],
};

const GEMINI_25_BUDGET_MAX = {
    'gemini-2.5-pro': 32768,
    'gemini-2.5-flash': 24576,
    'gemini-2.5-flash-lite': 24576,
};

const PROVIDER_FAMILY_BY_CLASS = {
    MixAnthropic: 'anthropic',
    MixGoogle: 'google',
    MixOpenAI: 'openai',
    MixOpenAIResponses: 'openai',
    MixOpenAIWebSocket: 'openai',
    MixOpenRouter: 'openai',
    MixKimi: 'openai',
    MixMiniMax: 'openai',
    MixMiMo: 'openai',
    MixGrok: 'openai',
    MixGroq: 'openai',
    MixTogether: 'openai',
    MixCerebras: 'openai',
    MixFireworks: 'openai',
    MixNVIDIA: 'openai',
    MixPerplexity: null,
    MixOllama: null,
    MixLMStudio: null,
    MixLambda: null,
    MixCustom: null,
};

/** Logical alias from `.grok420()` — resolved to reasoning / non-reasoning at request time. */
const GROK420_ALIAS = 'grok-4.20-0309';
const GROK420_REASONING = 'grok-4.20-0309-reasoning';
const GROK420_NON_REASONING = 'grok-4.20-0309-non-reasoning';

function isGrok420Alias(modelKey) {
    return modelKey === GROK420_ALIAS;
}

/**
 * Pick Grok 4.20 concrete model from unified effort (and native reasoning_effort).
 * - no effort / OpenAI band `none` (0–19) / native `none` → non-reasoning
 * - effort -1 or 20–100 / native non-none reasoning_effort → reasoning
 */
function resolveGrok420ModelKey(modelKey, effort, options = {}) {
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

function normalizeEffort(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`Invalid effort: expected integer -1 or 0..100, got ${JSON.stringify(value)}`);
    }
    if (value === -1) return -1;
    if (value < 0 || value > 100) {
        throw new Error(`Invalid effort: expected integer -1 or 0..100, got ${value}`);
    }
    return value;
}

function levelFromBands(effort, bands) {
    for (const [lo, hi, level] of bands) {
        if (effort >= lo && effort <= hi) return level;
    }
    return bands[bands.length - 1][2];
}

function pickNearestLevel(desired, ladder, supported) {
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

function supportedOpenAILevels(modelKey) {
    if (modelKey && OPENAI_MODEL_LEVELS[modelKey]) {
        return OPENAI_MODEL_LEVELS[modelKey];
    }
    return OPENAI_LEVELS;
}

function supportedGeminiLevels(modelKey) {
    if (modelKey && GEMINI_MODEL_LEVELS[modelKey]) {
        return GEMINI_MODEL_LEVELS[modelKey];
    }
    return GEMINI_LEVELS;
}

function isGemini25(modelKey) {
    return typeof modelKey === 'string' && modelKey.includes('2.5');
}

function isDeepSeekV4(modelKey) {
    if (typeof modelKey !== 'string') return false;
    const key = modelKey.toLowerCase();
    return key.includes('deepseek-v4') || key.includes('deepseek_v4');
}

function isMiniMax(modelKey) {
    return typeof modelKey === 'string' && modelKey.toLowerCase().includes('minimax');
}

/** Max budget_tokens when mapping unified effort onto manual Anthropic thinking. */
const ANTHROPIC_MANUAL_BUDGET_MAX = 16384;

/**
 * Models that use adaptive thinking + output_config.effort (Claude 5 / Fable /
 * Opus 4.6+ / Sonnet 4.6+). Older ones (Sonnet 4.5, Haiku 4.5, Opus 4.5) use
 * thinking.type=enabled + budget_tokens.
 */
function usesAnthropicAdaptiveThinking(modelKey) {
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
    if (id.includes('haiku')) return false;

    return true;
}

function mapAnthropicManualBudget(normalized) {
    return Math.max(1024, Math.round((normalized / 100) * ANTHROPIC_MANUAL_BUDGET_MAX));
}

function mapAnthropicEffort(normalized, modelKey) {
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

function mapDeepSeekEffort(normalized) {
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

function mapMiniMaxEffort(normalized) {
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
function mapAdaptiveEffort(providerFamily, modelKey) {
    if (providerFamily === 'anthropic') {
        return { thinking: { type: 'adaptive' } };
    }
    if (providerFamily === 'google') {
        if (modelKey === 'gemini-3.7-flash') return null;
        // Gemini dynamic thinking: thinkingBudget -1 (2.5 official; accepted on 3.x as dynamic)
        return { thinkingConfig: { thinkingBudget: -1 } };
    }
    if (providerFamily === 'openai' && isMiniMax(modelKey)) {
        return { thinking: { type: 'adaptive' } };
    }
    // OpenAI / DeepSeek: no adaptive enum — cannot set adaptive
    return null;
}

function gemini25BudgetMax(modelKey) {
    if (modelKey && GEMINI_25_BUDGET_MAX[modelKey] != null) {
        return GEMINI_25_BUDGET_MAX[modelKey];
    }
    return 24576;
}

/**
 * @returns {'openai'|'anthropic'|'google'|null}
 */
function resolveProviderFamily(providerInstance) {
    if (!providerInstance || !providerInstance.constructor) return null;
    let proto = providerInstance;
    while (proto) {
        const name = proto.constructor?.name;
        if (name && Object.prototype.hasOwnProperty.call(PROVIDER_FAMILY_BY_CLASS, name)) {
            return PROVIDER_FAMILY_BY_CLASS[name];
        }
        proto = Object.getPrototypeOf(proto);
        if (!proto || proto === Object.prototype) break;
    }
    return null;
}

function hasNativeEffort(family, options = {}, modelKey) {
    if (family === 'openai') {
        if (options.reasoning_effort != null && options.reasoning_effort !== '') return true;
        // DeepSeek / MiniMax use thinking.type as the on/off (or adaptive) control
        if ((isDeepSeekV4(modelKey) || isMiniMax(modelKey)) && options.thinking != null) return true;
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
function mapEffort(providerFamily, effort, modelKey) {
    const normalized = normalizeEffort(effort);

    if (!providerFamily) return null;

    if (normalized === -1) {
        return mapAdaptiveEffort(providerFamily, modelKey);
    }

    if (providerFamily === 'openai') {
        if (isDeepSeekV4(modelKey)) {
            return mapDeepSeekEffort(normalized);
        }
        if (isMiniMax(modelKey)) {
            return mapMiniMaxEffort(normalized);
        }
        // Non-reasoning Grok 4.20 has no reasoning_effort control
        if (modelKey === GROK420_NON_REASONING) {
            return null;
        }
        const supported = supportedOpenAILevels(modelKey);
        const desired = normalized === 100 && supported.includes('max')
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
function applyUnifiedEffort(options, config, providerFamily, modelKey) {
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
            ...(options.output_config || {}),
            ...patch.output_config
        };
    }
    if (patch.thinking) {
        options.thinking = {
            ...(options.thinking || {}),
            ...patch.thinking
        };
        // Adaptive thinking rejects budget_tokens; drop it if we switched mode.
        if (patch.thinking.type === 'adaptive') {
            delete options.thinking.budget_tokens;
        }
        // DeepSeek non-thinking: do not send reasoning_effort
        if (patch.thinking.type === 'disabled') {
            delete options.reasoning_effort;
        }
    }
    if (patch.thinkingConfig) {
        options.thinkingConfig = {
            ...(options.thinkingConfig || {}),
            ...patch.thinkingConfig
        };
    }

    return options;
}

module.exports = {
    normalizeEffort,
    mapEffort,
    mapAdaptiveEffort,
    applyUnifiedEffort,
    hasNativeEffort,
    resolveProviderFamily,
    resolveGrok420ModelKey,
    isGrok420Alias,
    isDeepSeekV4,
    isMiniMax,
    usesAnthropicAdaptiveThinking,
    levelFromBands,
    pickNearestLevel,
    OPENAI_BANDS,
    ANTHROPIC_BANDS,
    GEMINI_BANDS,
    DEEPSEEK_BANDS,
    OPENAI_LEVELS,
    ANTHROPIC_LEVELS,
    GEMINI_LEVELS,
    DEEPSEEK_LEVELS,
    ANTHROPIC_MANUAL_BUDGET_MAX,
    GROK420_ALIAS,
    GROK420_REASONING,
    GROK420_NON_REASONING,
};
