const GPT56_LONG_CONTEXT_PRICING = Object.freeze({
    inputThreshold: 272_000,
    inputMultiplier: 2,
    outputMultiplier: 1.5
});

const GROK46_LONG_CONTEXT_PRICING = Object.freeze({
    inputThreshold: 200_000,
    inputMultiplier: 2,
    outputMultiplier: 2,
    inclusive: true
});

function usesLongContextRates(pricing, inputTokens) {
    const longContext = pricing.longContext;
    if (!longContext) return false;
    return longContext.inclusive
        ? inputTokens >= longContext.inputThreshold
        : inputTokens > longContext.inputThreshold;
}

const MODEL_PRICING = {
    // OpenAI
    'gpt-realtime-mini': { input: 0.60, cachedInput: 0.06, output: 2.40 },
    'gpt-realtime': { input: 4.00, cachedInput: 0.40, output: 16.00 },
    'gpt-5.6-sol': { input: 5.00, cachedInput: 0.50, cacheWrite: 6.25, output: 30.00, longContext: GPT56_LONG_CONTEXT_PRICING },
    'gpt-5.6-terra': { input: 2.00, cachedInput: 0.20, cacheWrite: 2.50, output: 12.00, longContext: GPT56_LONG_CONTEXT_PRICING },
    'gpt-5.6-luna': { input: 0.20, cachedInput: 0.02, cacheWrite: 0.25, output: 1.20, longContext: GPT56_LONG_CONTEXT_PRICING },
    'gpt-5.5-pro': { input: 30.00, output: 180.00 },
    'gpt-5.5': { input: 5.00, cachedInput: 0.50, output: 30.00 },
    'gpt-5.4': { input: 2.50, cachedInput: 0.25, output: 15.00 },
    'gpt-5.4-pro': { input: 30.00, output: 180.00 },
    'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.50 },
    'gpt-5.4-nano': { input: 0.20, cachedInput: 0.02, output: 1.25 },
    'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.2-chat-latest': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.1': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.00 },
    'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.40 },
    'gpt-4.1': { input: 2.00, cachedInput: 0.50, output: 8.00 },
    'gpt-4.1-mini': { input: 0.40, cachedInput: 0.10, output: 1.60 },
    'gpt-4.1-nano': { input: 0.10, cachedInput: 0.025, output: 0.40 },
    // gptOss (NVIDIA/Fireworks/Together/Groq/Cerebras/OpenRouter)
    'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
    'gpt-oss-120b': { input: 0.15, output: 0.60 },
    'accounts/fireworks/models/gpt-oss-120b': { input: 0.15, cachedInput: 0.014, output: 0.60 },
    // Anthropic
    'claude-fable-5': { input: 10.00, cachedInput: 1.00, cacheWrite: 12.50, cacheWrite1h: 20.00, output: 50.00 },
    'claude-opus-5': { input: 5.00, cachedInput: 0.50, cacheWrite: 6.25, cacheWrite1h: 10.00, output: 25.00 },
    'claude-sonnet-5': { input: 3.00, cachedInput: 0.30, cacheWrite: 3.75, cacheWrite1h: 6.00, output: 15.00 },
    'claude-opus-4-8': { input: 5.00, cachedInput: 0.50, cacheWrite: 6.25, cacheWrite1h: 10.00, output: 25.00 },
    'claude-opus-4-7': { input: 5.00, cachedInput: 0.50, cacheWrite: 6.25, cacheWrite1h: 10.00, output: 25.00 },
    'claude-opus-4-6': { input: 5.00, cachedInput: 0.50, cacheWrite: 6.25, cacheWrite1h: 10.00, output: 25.00 },
    'claude-sonnet-4-6': { input: 3.00, cachedInput: 0.30, cacheWrite: 3.75, cacheWrite1h: 6.00, output: 15.00 },
    'claude-sonnet-4-5-20250929': { input: 3.00, cachedInput: 0.30, cacheWrite: 3.75, cacheWrite1h: 6.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 1.00, cachedInput: 0.10, cacheWrite: 1.25, cacheWrite1h: 2.00, output: 5.00 },
    // Google
    'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
    'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
    'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
    'gemini-3.7-flash': { input: 0.75, cachedInput: 0.075, output: 3.75 },
    'gemini-3.6-flash': { input: 0.75, cachedInput: 0.075, output: 3.75 },
    'gemini-3.5-flash': { input: 0.75, output: 4.50 },
    'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
    // Grok
    'grok-4.6': { input: 2.00, cachedInput: 0.50, output: 6.00, longContext: GROK46_LONG_CONTEXT_PRICING },
    'grok-4.5': { input: 2.00, output: 6.00 },
    'grok-4.3': { input: 1.25, output: 2.50 },
    'grok-4.20-multi-agent-0309': { input: 1.25, output: 2.50 },
    'grok-4.20-0309': { input: 1.25, output: 2.50 },
    'grok-4.20-0309-reasoning': { input: 1.25, output: 2.50 },
    'grok-4.20-0309-non-reasoning': { input: 1.25, output: 2.50 },
    // Muse Glimmer 30B (NVIDIA/OpenRouter, Fireworks, Together)
    'meta/muse-glimmer-30b': { input: 0.35, cachedInput: 0.04, output: 1.50 },
    'accounts/fireworks/models/muse-glimmer-30b': { input: 0.35, cachedInput: 0.04, output: 1.50 },
    'meta-models/Muse-Glimmer-30B': { input: 0.35, cachedInput: 0.04, output: 1.50 },
    // Fireworks
    'accounts/fireworks/models/deepseek-v4-flash': { input: 0.14, output: 0.28 },
    'accounts/fireworks/models/deepseek-v4-pro': { input: 1.74, output: 3.48 },
    'accounts/fireworks/models/deepseek-v4-pro-0813': { input: 1.32, cachedInput: 0.044, output: 3.96 },
    'deepseek-ai/DeepSeek-V4-Flash': { input: 0.14, output: 0.28 },
    'deepseek-ai/DeepSeek-V4-Pro': { input: 2.10, output: 4.40 },
    'deepseek/deepseek-v4-flash': { input: 0.09, output: 0.18 },
    'accounts/fireworks/models/glm-4p7': { input: 0.55, output: 2.19 },
    'zai-org/GLM-5.2': { input: 1.40, cachedInput: 0.26, output: 4.40 },
    'accounts/fireworks/models/glm-5p2': { input: 1.40, cachedInput: 0.14, output: 4.40 },
    'z-ai/glm-5.2': { input: 0.966, cachedInput: 0.1932, output: 3.036 },
    'z-ai/glm-5.3': { input: 1.40, cachedInput: 0.26, output: 4.40 },
    'accounts/fireworks/models/kimi-k2p5': { input: 0.50, output: 2.80 },
    'qwen/qwen3.5-397b-a17b': { input: 0.385, output: 2.45 },
    'accounts/fireworks/models/qwen3p6-plus': { input: 0.50, output: 3.00 },
    'Qwen/Qwen3.6-Plus': { input: 0.50, output: 3.00 },
    'qwen/qwen3.6-plus': {
        input: 0.325,
        cacheWrite: 0.40625,
        output: 1.95,
        longContext: { inputThreshold: 256_000, inputMultiplier: 4, outputMultiplier: 2, inclusive: true }
    },
    'accounts/fireworks/models/qwen3p7-plus': { input: 0.40, output: 1.60 },
    'qwen/qwen3.7-plus': {
        input: 0.32,
        cachedInput: 0.064,
        cacheWrite: 0.40,
        output: 1.28,
        longContext: { inputThreshold: 256_000, inputMultiplier: 3, outputMultiplier: 3, inclusive: true }
    },
    'Qwen/Qwen3.7-Plus': { input: 0.32, output: 1.28 },
    'accounts/fireworks/models/qwen3p8-2p4t-a95b': { input: 2.00, cachedInput: 0.25, output: 6.00 },
    'qwen/qwen3.8-max': { input: 2.00, output: 6.00 },
    'qwen/qwen3.8-27b': { input: 0.45, cachedInput: 0.05, output: 3.20 },
    // MiniMax
    'MiniMax-M2.5': { input: 0.30, output: 1.20 },
    'MiniMax-M2.7': { input: 0.30, output: 1.20 },
    'MiniMax-M3': { input: 0.30, output: 1.20 },
    'minimax/minimax-m2.7': { input: 0.30, output: 1.20 },
    'minimax/minimax-m3': { input: 0.30, output: 1.20 },
    'minimaxai/minimax-m2.7': { input: 0.30, output: 1.20 },
    'MiniMaxAI/MiniMax-M2.7': { input: 0.30, output: 1.20 },
    'MiniMaxAI/MiniMax-M3': { input: 0.30, output: 1.20 },
    'accounts/fireworks/models/minimax-m2p7': { input: 0.30, cachedInput: 0.059, output: 1.20 },
    'accounts/fireworks/models/minimax-m3': { input: 0.30, cachedInput: 0.059, output: 1.20 },
    // Perplexity
    'sonar': { input: 1.00, output: 1.00 },
    'sonar-pro': { input: 3.00, output: 15.00 },
    // Hermes 4 (OpenRouter)
    'nousresearch/hermes-4-70b': { input: 0.13, output: 0.40 },
    'nousresearch/hermes-4-405b': { input: 1.00, output: 3.00 },
    // Hermes 3 (Lambda/OpenRouter)
    'Hermes-3-Llama-3.1-405B-FP8': { input: 0.80, output: 0.80 },
    'nousresearch/hermes-3-llama-3.1-405b:free': { input: 0, output: 0 },
    // Kimi K2.5 (Together/Fireworks/OpenRouter)
    'moonshotai/Kimi-K2.5': { input: 0.50, output: 2.80 },
    'moonshotai/kimi-k2.5': { input: 0.50, output: 2.80 },
    // Kimi K3
    'kimi-k3': { input: 3.00, cachedInput: 0.30, output: 15.00 },
    'moonshotai/kimi-k3': { input: 3.00, cachedInput: 0.30, output: 15.00 },
    'accounts/fireworks/models/kimi-k3': { input: 3.00, cachedInput: 0.30, output: 15.00 },
    'moonshotai/Kimi-K3': { input: 3.00, cachedInput: 0.30, output: 15.00 },
    // Kimi K2.7 Code
    'moonshotai/Kimi-K2.7-Code': { input: 0.95, cachedInput: 0.19, output: 4.00 },
    'accounts/fireworks/models/kimi-k2p7-code': { input: 0.95, cachedInput: 0.19, output: 4.00 },
    'moonshotai/kimi-k2.7-code': { input: 0.71, cachedInput: 0.15, output: 3.50 },
    // GLM 4.7 (OpenRouter/Cerebras)
    'z-ai/glm-4.7': { input: 0.55, output: 2.19 },
    'zai-glm-4.7': { input: 0.55, output: 2.19 },
};

function normalizeTokenUsage({ input = 0, output = 0, thinking = 0, total, cached = 0, cacheWrite = 0, cacheWrite5m = 0, cacheWrite1h = 0 } = {}) {
    const tokenCount = value => Number.isFinite(value) ? Math.max(0, value) : 0;
    const normalizedInput = tokenCount(input);
    const normalizedOutput = tokenCount(output);
    const normalizedThinking = tokenCount(thinking);
    const normalizedCached = tokenCount(cached);
    const normalizedCacheWrite5m = tokenCount(cacheWrite5m);
    const normalizedCacheWrite1h = tokenCount(cacheWrite1h);
    const normalizedCacheWrite = Math.max(
        tokenCount(cacheWrite),
        normalizedCacheWrite5m + normalizedCacheWrite1h
    );
    const normalizedTotal = Number.isFinite(total)
        ? Math.max(0, total)
        : normalizedInput + normalizedOutput + normalizedThinking;
    const uncachedInput = Math.max(0, normalizedInput - normalizedCached - normalizedCacheWrite);
    const cacheHitRate = normalizedInput > 0
        ? Number((normalizedCached / normalizedInput).toFixed(4))
        : 0;

    return {
        input: normalizedInput,
        output: normalizedOutput,
        thinking: normalizedThinking,
        total: normalizedTotal,
        cached: normalizedCached,
        cacheWrite: normalizedCacheWrite,
        cacheWrite5m: normalizedCacheWrite5m,
        cacheWrite1h: normalizedCacheWrite1h,
        uncachedInput,
        cacheHitRate,
        cacheSavings: 0,
        cacheWritePremium: 0,
        breakEvenHits: 0,
        cost: 0,
        costBreakdown: {
            uncachedInput: 0,
            cachedInput: 0,
            cacheWrite: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0,
            total: 0
        }
    };
}

function calculateCostBreakdown(modelKey, tokens) {
    const pricing = MODEL_PRICING[modelKey];
    if (!pricing) return normalizeTokenUsage().costBreakdown;

    const normalized = normalizeTokenUsage(tokens);
    const longContext = pricing.longContext;
    const useLongContextRates = usesLongContextRates(pricing, normalized.input);
    const inputMultiplier = useLongContextRates ? longContext.inputMultiplier : 1;
    const outputMultiplier = useLongContextRates ? longContext.outputMultiplier : 1;
    const {
        input: inputPerMillion,
        cachedInput: cachedInputPerMillion = inputPerMillion,
        cacheWrite: cacheWritePerMillion = inputPerMillion,
        cacheWrite1h: cacheWrite1hPerMillion = cacheWritePerMillion,
        output: outputPerMillion
    } = pricing;
    const roundCost = value => Number(value.toFixed(12));
    const genericCacheWrite = Math.max(
        0,
        normalized.cacheWrite - normalized.cacheWrite5m - normalized.cacheWrite1h
    );
    const cacheWrite5mCost = roundCost(
        normalized.cacheWrite5m * cacheWritePerMillion * inputMultiplier / 1_000_000
    );
    const cacheWrite1hCost = roundCost(
        normalized.cacheWrite1h * cacheWrite1hPerMillion * inputMultiplier / 1_000_000
    );
    const genericCacheWriteCost = roundCost(
        genericCacheWrite * cacheWritePerMillion * inputMultiplier / 1_000_000
    );
    const breakdown = {
        uncachedInput: roundCost(normalized.uncachedInput * inputPerMillion * inputMultiplier / 1_000_000),
        cachedInput: roundCost(normalized.cached * cachedInputPerMillion * inputMultiplier / 1_000_000),
        cacheWrite: roundCost(genericCacheWriteCost + cacheWrite5mCost + cacheWrite1hCost),
        cacheWrite5m: cacheWrite5mCost,
        cacheWrite1h: cacheWrite1hCost,
        output: roundCost(
            (normalized.output + normalized.thinking) * outputPerMillion * outputMultiplier / 1_000_000
        )
    };
    breakdown.total = roundCost(
        breakdown.uncachedInput
        + breakdown.cachedInput
        + breakdown.cacheWrite
        + breakdown.output
    );
    return breakdown;
}

function calculateCacheMetrics(modelKey, tokens) {
    const pricing = MODEL_PRICING[modelKey];
    const emptyMetrics = {
        cacheSavings: 0,
        cacheWritePremium: 0,
        breakEvenHits: 0
    };
    if (!pricing) return emptyMetrics;

    const normalized = normalizeTokenUsage(tokens);
    const longContext = pricing.longContext;
    const useLongContextRates = usesLongContextRates(pricing, normalized.input);
    const inputMultiplier = useLongContextRates ? longContext.inputMultiplier : 1;
    const cachedInputPerMillion = pricing.cachedInput ?? pricing.input;
    const cacheWritePerMillion = pricing.cacheWrite ?? pricing.input;
    const cacheWrite1hPerMillion = pricing.cacheWrite1h ?? cacheWritePerMillion;
    const readSavingsPerMillion = Math.max(0, pricing.input - cachedInputPerMillion) * inputMultiplier;
    const writePremiumPerMillion = Math.max(0, cacheWritePerMillion - pricing.input) * inputMultiplier;
    const write1hPremiumPerMillion = Math.max(0, cacheWrite1hPerMillion - pricing.input) * inputMultiplier;
    const roundCost = value => Number(value.toFixed(12));
    const cacheSavings = roundCost(normalized.cached * readSavingsPerMillion / 1_000_000);
    const genericCacheWrite = Math.max(
        0,
        normalized.cacheWrite - normalized.cacheWrite5m - normalized.cacheWrite1h
    );
    const cacheWritePremium = roundCost(
        (
            (genericCacheWrite + normalized.cacheWrite5m) * writePremiumPerMillion
            + normalized.cacheWrite1h * write1hPremiumPerMillion
        ) / 1_000_000
    );
    const fullHitSavings = normalized.cacheWrite * readSavingsPerMillion / 1_000_000;

    return {
        cacheSavings,
        cacheWritePremium,
        breakEvenHits: fullHitSavings > 0
            ? Number((cacheWritePremium / fullHitSavings).toFixed(4))
            : 0
    };
}

function calculateCost(modelKey, tokens) {
    if (!hasModelPricing(modelKey)) return null;
    return calculateCostBreakdown(modelKey, tokens).total;
}

function hasModelPricing(modelKey) {
    return Object.prototype.hasOwnProperty.call(MODEL_PRICING, modelKey);
}

function extractCacheTokens(usage = {}) {
    return usage.input_tokens_details?.cached_tokens
        ?? usage.prompt_tokens_details?.cached_tokens
        ?? usage.cache_read_input_tokens
        ?? usage.cachedContentTokenCount
        ?? usage.cached_content_token_count
        ?? 0;
}

function extractCacheWriteTokens(usage = {}) {
    return usage.input_tokens_details?.cache_write_tokens
        ?? usage.prompt_tokens_details?.cache_write_tokens
        ?? usage.cache_creation_input_tokens
        ?? usage.cache_write_input_tokens
        ?? usage.cacheWriteTokenCount
        ?? usage.cache_write_token_count
        ?? 0;
}

module.exports = {
    normalizeTokenUsage,
    calculateCostBreakdown,
    calculateCacheMetrics,
    calculateCost,
    hasModelPricing,
    extractCacheTokens,
    extractCacheWriteTokens
};
