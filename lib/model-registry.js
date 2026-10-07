const {
    MixOpenAI,
    MixOpenAIResponses,
    MixOpenAIWebSocket,
    MixOpenRouter,
    MixKimi,
    MixAnthropic,
    MixMiniMax,
    MixMiMo,
    MixDeepSeek,
    MixPerplexity,
    MixGrok,
    MixLambda,
    MixTogether,
    MixFireworks,
    MixNVIDIA,
    MixGoogle
} = require('./providers');

/** Provider behind each `mix` flag. */
const MIX_ROUTE_PROVIDERS = {
    anthropic: MixAnthropic,
    openrouter: MixOpenRouter,
    fireworks: MixFireworks,
    together: MixTogether,
    nvidia: MixNVIDIA,
    lambda: MixLambda,
    moonshot: MixKimi,
    minimax: MixMiniMax,
    mimo: MixMiMo,
    deepseek: MixDeepSeek
};

/**
 * Model shortcuts: the single source for fluent methods and chain() names.
 *
 * - `provider` + `key`: an official route that is always attached.
 * - `routes`: optional `{ mixFlag: modelKey }` routes, attached in order when
 *   the resolved flag is true.
 * - `defaultMix`: routes selected when the call passes no `mix`. Flags from
 *   ModelMix.new({ mix }) override these defaults; a call-level `mix` replaces
 *   them, so shortcut({ mix: { fireworks: true } }) selects only what it names.
 * - `baseMix`: flags that apply even when a call-level `mix` is passed.
 * - `alias`: another shortcut with the same behavior.
 */
const MODEL_SHORTCUTS = {
    gpt5mini: { provider: MixOpenAI, key: 'gpt-5-mini', routes: { openrouter: 'openai/gpt-5-mini' } },
    gpt5nano: { provider: MixOpenAI, key: 'gpt-5-nano', routes: { openrouter: 'openai/gpt-5-nano' } },
    gpt52: { provider: MixOpenAIResponses, key: 'gpt-5.2', routes: { openrouter: 'openai/gpt-5.2' } },
    gpt54: { provider: MixOpenAIResponses, key: 'gpt-5.4', routes: { openrouter: 'openai/gpt-5.4' } },
    gpt54mini: { provider: MixOpenAIResponses, key: 'gpt-5.4-mini', routes: { openrouter: 'openai/gpt-5.4-mini' } },
    gpt54nano: { provider: MixOpenAIResponses, key: 'gpt-5.4-nano', routes: { openrouter: 'openai/gpt-5.4-nano' } },
    gpt54pro: { provider: MixOpenAIResponses, key: 'gpt-5.4-pro', routes: { openrouter: 'openai/gpt-5.4-pro' } },
    gpt55: { provider: MixOpenAIResponses, key: 'gpt-5.5', routes: { openrouter: 'openai/gpt-5.5' } },
    gpt55pro: { provider: MixOpenAIResponses, key: 'gpt-5.5-pro', routes: { openrouter: 'openai/gpt-5.5-pro' } },
    gpt6astra: { provider: MixOpenAIResponses, key: 'gpt-6-astra', routes: { openrouter: 'openai/gpt-6-astra' } },
    gpt61sol: { provider: MixOpenAIResponses, key: 'gpt-6.1-sol', routes: { openrouter: 'openai/gpt-6.1-sol' } },
    gpt6sol: { provider: MixOpenAIResponses, key: 'gpt-6-sol', routes: { openrouter: 'openai/gpt-6-sol' } },
    gpt6luna: { provider: MixOpenAIResponses, key: 'gpt-6-luna', routes: { openrouter: 'openai/gpt-6-luna' } },
    gpt56sol: { provider: MixOpenAIResponses, key: 'gpt-5.6-sol', routes: { openrouter: 'openai/gpt-5.6-sol' } },
    gpt56terra: { provider: MixOpenAIResponses, key: 'gpt-5.6-terra', routes: { openrouter: 'openai/gpt-5.6-terra' } },
    gpt56luna: { provider: MixOpenAIResponses, key: 'gpt-5.6-luna', routes: { openrouter: 'openai/gpt-5.6-luna' } },
    gptRealtime: { provider: MixOpenAIWebSocket, key: 'gpt-realtime' },
    gptRealtimeMini: { provider: MixOpenAIWebSocket, key: 'gpt-realtime-mini' },

    fable51: {
        baseMix: { anthropic: true },
        routes: { anthropic: 'claude-fable-5-1', openrouter: 'anthropic/claude-fable-5.1' }
    },
    fable50: { provider: MixAnthropic, key: 'claude-fable-5' },
    fable5: { alias: 'fable50' },
    opus55: { provider: MixAnthropic, key: 'claude-opus-5-5' },
    opus50: { provider: MixAnthropic, key: 'claude-opus-5' },
    opus5: { alias: 'opus50' },
    opus48: { provider: MixAnthropic, key: 'claude-opus-4-8' },
    opus47: { provider: MixAnthropic, key: 'claude-opus-4-7' },
    opus46: { provider: MixAnthropic, key: 'claude-opus-4-6' },
    sonnet55: { provider: MixAnthropic, key: 'claude-sonnet-5-5' },
    sonnet50: { provider: MixAnthropic, key: 'claude-sonnet-5' },
    sonnet5: { alias: 'sonnet50' },
    sonnet45: { provider: MixAnthropic, key: 'claude-sonnet-4-5-20250929' },
    haiku55: { provider: MixAnthropic, key: 'claude-haiku-5-5' },
    haiku45: { provider: MixAnthropic, key: 'claude-haiku-4-5-20251001' },

    gemini38flash: { provider: MixGoogle, key: 'gemini-3.8-flash' },
    gemini37flash: { provider: MixGoogle, key: 'gemini-3.7-flash' },
    gemini36flash: { provider: MixGoogle, key: 'gemini-3.6-flash' },
    gemini35flash: { provider: MixGoogle, key: 'gemini-3.5-flash' },
    gemini35flashLite: { provider: MixGoogle, key: 'gemini-3.5-flash-lite' },
    gemini31flashLite: { provider: MixGoogle, key: 'gemini-3.1-flash-lite-preview' },

    sonarPro: { provider: MixPerplexity, key: 'sonar-pro' },
    sonar: { provider: MixPerplexity, key: 'sonar' },

    grok47: { provider: MixGrok, key: 'grok-4.7' },
    grok46: { provider: MixGrok, key: 'grok-4.6' },
    grok43: { provider: MixGrok, key: 'grok-4.3' },

    museGlimmer30b: {
        defaultMix: { fireworks: true },
        routes: {
            nvidia: 'meta/muse-glimmer-30b',
            fireworks: 'accounts/fireworks/models/muse-glimmer-30b',
            openrouter: 'meta/muse-glimmer-30b',
            together: 'meta-models/Muse-Glimmer-30B'
        }
    },
    museSpark12: { provider: MixOpenRouter, key: 'meta/muse-spark-1.2' },
    museSpark12c: { provider: MixOpenRouter, key: 'meta/muse-spark-1.2-contributor' },
    museSpark13: { provider: MixOpenRouter, key: 'meta/muse-spark-1.3' },
    museSpark13c: { provider: MixOpenRouter, key: 'meta/muse-spark-1.3-contributor' },

    qwen35397b: { provider: MixOpenRouter, key: 'qwen/qwen3.5-397b-a17b' },
    qwen36plus: {
        defaultMix: { openrouter: true },
        routes: {
            fireworks: 'accounts/fireworks/models/qwen3p6-plus',
            openrouter: 'qwen/qwen3.6-plus',
            together: 'Qwen/Qwen3.6-Plus'
        }
    },
    qwen37plus: {
        defaultMix: { fireworks: true },
        routes: {
            fireworks: 'accounts/fireworks/models/qwen3p7-plus',
            openrouter: 'qwen/qwen3.7-plus',
            together: 'Qwen/Qwen3.7-Plus'
        }
    },
    qwen38max: {
        defaultMix: { fireworks: true },
        routes: {
            fireworks: 'accounts/fireworks/models/qwen3p8-2p4t-a95b',
            openrouter: 'qwen/qwen3.8-max'
        }
    },
    qwen3827b: { provider: MixOpenRouter, key: 'qwen/qwen3.8-27b' },
    qwen38flash: { provider: MixOpenRouter, key: 'qwen/qwen3.8-flash' },

    hermes470b: { provider: MixOpenRouter, key: 'nousresearch/hermes-4-70b' },
    hermes4405b: { provider: MixOpenRouter, key: 'nousresearch/hermes-4-405b' },
    hermes3: {
        defaultMix: { openrouter: true },
        routes: {
            lambda: 'Hermes-3-Llama-3.1-405B-FP8',
            openrouter: 'nousresearch/hermes-3-llama-3.1-405b:free'
        }
    },

    kimiK26: {
        defaultMix: { fireworks: true },
        routes: {
            fireworks: 'accounts/fireworks/models/kimi-k2p6',
            openrouter: 'moonshotai/kimi-k2.6',
            together: 'moonshotai/Kimi-K2.6'
        }
    },
    kimiK27Code: {
        defaultMix: { together: true },
        routes: {
            together: 'moonshotai/Kimi-K2.7-Code',
            fireworks: 'accounts/fireworks/models/kimi-k2p7-code',
            openrouter: 'moonshotai/kimi-k2.7-code'
        }
    },
    kimiK3: {
        defaultMix: { moonshot: true },
        routes: {
            moonshot: 'kimi-k3',
            fireworks: 'accounts/fireworks/models/kimi-k3',
            openrouter: 'moonshotai/kimi-k3',
            together: 'moonshotai/Kimi-K3'
        }
    },

    minimaxM27: {
        defaultMix: { minimax: true },
        routes: {
            nvidia: 'minimaxai/minimax-m2.7',
            fireworks: 'accounts/fireworks/models/minimax-m2p7',
            openrouter: 'minimax/minimax-m2.7',
            minimax: 'MiniMax-M2.7',
            together: 'MiniMaxAI/MiniMax-M2.7'
        }
    },
    minimaxM3: {
        defaultMix: { minimax: true },
        routes: {
            fireworks: 'accounts/fireworks/models/minimax-m3',
            openrouter: 'minimax/minimax-m3',
            minimax: 'MiniMax-M3',
            together: 'MiniMaxAI/MiniMax-M3'
        }
    },
    minimaxM31Flash: { provider: MixMiniMax, key: 'MiniMax-M3.1-Flash-Preview' },
    mimo25: {
        defaultMix: { openrouter: true },
        routes: { mimo: 'mimo-v2.5', openrouter: 'xiaomi/mimo-v2.5' }
    },
    mimo25pro: {
        defaultMix: { openrouter: true },
        routes: { mimo: 'mimo-v2.5-pro', openrouter: 'xiaomi/mimo-v2.5-pro' }
    },
    mimo26pro: {
        defaultMix: { openrouter: true },
        routes: { mimo: 'mimo-v2.6-pro', openrouter: 'xiaomi/mimo-v2.6-pro' }
    },

    deepseekPro: { provider: MixOpenRouter, key: 'deepseek/deepseek-v4-pro-0813' },
    deepseekV4Pro: {
        defaultMix: { fireworks: true },
        routes: {
            nvidia: 'deepseek-ai/deepseek-v4-pro',
            fireworks: 'accounts/fireworks/models/deepseek-v4-pro-0813',
            openrouter: 'deepseek/deepseek-v4-pro',
            together: 'deepseek-ai/DeepSeek-V4-Pro'
        }
    },
    deepseekV4Flash: {
        defaultMix: { fireworks: true },
        routes: {
            nvidia: 'deepseek-ai/deepseek-v4-flash',
            fireworks: 'accounts/fireworks/models/deepseek-v4-flash',
            openrouter: 'deepseek/deepseek-v4-flash',
            together: 'deepseek-ai/DeepSeek-V4-Flash'
        }
    },
    deepseekV41Flash: {
        defaultMix: { deepseek: true },
        routes: {
            deepseek: 'deepseek-flash',
            fireworks: 'accounts/fireworks/models/deepseek-v4p1-flash',
            openrouter: 'deepseek/deepseek-v4.1-flash'
        }
    },

    GLM52: {
        defaultMix: { together: true },
        routes: {
            together: 'zai-org/GLM-5.2',
            fireworks: 'accounts/fireworks/models/glm-5p2',
            openrouter: 'z-ai/glm-5.2'
        }
    },
    GLM53: { provider: MixOpenRouter, key: 'z-ai/glm-5.3' },
    GLM53Flash: { provider: MixOpenRouter, key: 'z-ai/glm-5.3-flash' }
};

for (const [name, spec] of Object.entries(MODEL_SHORTCUTS)) {
    if (spec.alias !== undefined && !MODEL_SHORTCUTS[spec.alias]) {
        throw new Error(`Model shortcut "${name}" aliases unknown shortcut "${spec.alias}".`);
    }
    for (const flag of Object.keys(spec.routes || {})) {
        if (!MIX_ROUTE_PROVIDERS[flag]) {
            throw new Error(`Model shortcut "${name}" uses unknown mix route "${flag}".`);
        }
    }
}

function getModelShortcut(name) {
    if (!Object.prototype.hasOwnProperty.call(MODEL_SHORTCUTS, name)) return null;
    const spec = MODEL_SHORTCUTS[name];
    return spec.alias === undefined ? spec : MODEL_SHORTCUTS[spec.alias];
}

function listModelShortcuts() {
    return Object.keys(MODEL_SHORTCUTS);
}

/**
 * Build the { key, provider } entries a shortcut attaches, without attaching them.
 * `instanceMix` holds only the flags the caller set on ModelMix.new({ mix }).
 */
function resolveModelShortcut(name, { options = {}, config = {}, mix } = {}, instanceMix = {}) {
    const spec = getModelShortcut(name);
    if (!spec) {
        throw new Error(`Unknown model shortcut "${name}".`);
    }

    const flags = mix === undefined
        ? { ...spec.baseMix, ...spec.defaultMix, ...instanceMix }
        : { ...spec.baseMix, ...instanceMix, ...mix };
    const models = [];
    if (spec.provider) {
        models.push({ key: spec.key, provider: new spec.provider({ options, config }) });
    }
    for (const [flag, key] of Object.entries(spec.routes || {})) {
        if (flags[flag]) {
            models.push({ key, provider: new MIX_ROUTE_PROVIDERS[flag]({ options, config }) });
        }
    }
    return models;
}

module.exports = {
    MODEL_SHORTCUTS,
    listModelShortcuts,
    resolveModelShortcut
};
