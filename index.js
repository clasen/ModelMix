const fs = require('fs');
const { randomUUID } = require('crypto');
const ejs = require('ejs');
const fileType = require('file-type');
const detectFileTypeFromBuffer = fileType.fileTypeFromBuffer || fileType.fromBuffer;
const { inspect } = require('util');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const WebSocket = require('ws');
const generateJsonSchema = require('./schema');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { MCPToolsManager } = require('./mcp-tools');
const {
    stripContentTypeHeader,
    createMultipartFormData,
    buildRequestBodyAndHeaders
} = require('./multipart');
const {
    fetchJsonResponse,
    fetchBinaryResponse,
    fetchStreamResponse
} = require('./http-client');
const {
    normalizeEffort,
    applyUnifiedEffort,
    resolveProviderFamily,
    resolveGrok420ModelKey,
    GROK420_REASONING,
    GROK420_NON_REASONING
} = require('./effort');

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504, 529];

function getErrorStatusCode(error) {
    return error?.statusCode ?? error?.response?.status ?? error?.response?.statusCode ?? null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clonePluginValue(value, seen = new WeakMap()) {
    if (value === null || typeof value !== 'object') return value;
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (seen.has(value)) return seen.get(value);

    if (Array.isArray(value)) {
        const clone = [];
        seen.set(value, clone);
        for (const item of value) clone.push(clonePluginValue(item, seen));
        return clone;
    }

    if (!isPlainObject(value)) return value;
    const clone = {};
    seen.set(value, clone);
    for (const [key, item] of Object.entries(value)) {
        clone[key] = clonePluginValue(item, seen);
    }
    return clone;
}

function validatePluginResult(result, pluginName) {
    if (!isPlainObject(result)) {
        throw new TypeError(`Plugin "${pluginName}" must return a ModelMixResult object.`);
    }
    return result;
}

function normalizeContentCache(cache) {
    if (cache !== undefined) {
        if (!isPlainObject(cache) || cache.breakpoint !== true) {
            throw new TypeError('cache must be { breakpoint: true }.');
        }
        return { breakpoint: true };
    }
    return undefined;
}

function stripContentCacheMetadata(content) {
    if (!content || typeof content !== 'object') return content;
    const sanitized = { ...content };
    delete sanitized.cache;
    delete sanitized.cache_control;
    delete sanitized.prompt_cache_breakpoint;
    return sanitized;
}

function hasNeutralCacheBreakpoint(messages = []) {
    return messages.some(message => Array.isArray(message?.content)
        && message.content.some(block => block?.cache?.breakpoint === true));
}

function validateTemplateData(value) {
    if (!isPlainObject(value)) {
        throw new TypeError('Template data must be a plain non-null object.');
    }
    if (Object.prototype.hasOwnProperty.call(value, '$mix')) {
        throw new TypeError('Template data key "$mix" is reserved.');
    }
}

function validateTemplateDataKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError('Template data key must be a non-empty string.');
    }
    if (key === '$mix') {
        throw new TypeError('Template data key "$mix" is reserved.');
    }
}

function templateLocation({ filename, label }, lineNumber) {
    return `${filename || label} at line ${lineNumber}`;
}

function preprocessChoiceDirectives(source, { filename = null, label = 'template' } = {}) {
    const parts = source.split(/(\r\n|\n|\r)/);
    const blocks = [];

    for (let index = 0; index < parts.length; index += 2) {
        const line = parts[index];
        const trimmed = line.trim();
        const lineNumber = (index / 2) + 1;
        const location = templateLocation({ filename, label }, lineNumber);
        const newline = parts[index + 1] || '';

        if (/^<%\s*choice\s*%>$/.test(trimmed)) {
            const parent = blocks[blocks.length - 1];
            if (parent && parent.optionCount === 0) {
                throw new Error(`A nested choice must be inside an option (${location}).`);
            }
            blocks.push({ lineNumber, optionCount: 0, weighted: null });
            parts[index] = '<% $mix.choice(option => { -%>';
            continue;
        }

        const optionMatch = trimmed.match(/^<%\s*option(?:\s+(.+?))?\s*%>$/);
        if (optionMatch) {
            const block = blocks[blocks.length - 1];
            if (!block) {
                throw new Error(`Option directive must be inside a choice (${location}).`);
            }

            const weightText = optionMatch[1];
            const weighted = weightText !== undefined;
            if (block.weighted !== null && block.weighted !== weighted) {
                throw new Error(`Choice options must either all have weights or all omit them (${location}).`);
            }

            let argument = '';
            if (weighted) {
                const weight = Number(weightText);
                if (!Number.isFinite(weight) || weight <= 0) {
                    throw new Error(`Choice weight must be a positive finite number (${location}).`);
                }
                argument = `${weight}, `;
            }

            block.weighted = weighted;
            parts[index] = `<% ${block.optionCount > 0 ? '}); ' : ''}option(${argument}() => { -%>`;
            block.optionCount += 1;
            continue;
        }

        if (/^<%\s*\/choice\s*%>$/.test(trimmed)) {
            const block = blocks.pop();
            if (!block) {
                throw new Error(`Closing choice directive has no matching opening directive (${location}).`);
            }
            if (block.optionCount === 0) {
                throw new Error(`Choice must contain at least one option (${location}).`);
            }
            parts[index] = '<% }); }); -%>';
            continue;
        }

        if (/^<%\s*(?:choice|option|\/choice)(?:\s|%>)/.test(trimmed)) {
            throw new Error(`Invalid choice directive (${location}).`);
        }

        const block = blocks[blocks.length - 1];
        if (block && block.optionCount === 0) {
            if (trimmed) {
                throw new Error(`Choice content must be inside an option (${location}).`);
            }
            parts[index] = '<%# -%>';
        }

        if (newline) parts[index + 1] = newline;
    }

    if (blocks.length > 0) {
        const block = blocks[blocks.length - 1];
        throw new Error(`Unclosed choice directive (${templateLocation({ filename, label }, block.lineNumber)}).`);
    }

    return parts.join('');
}

function createTemplateRenderContext(random = Math.random) {
    const choice = defineOptions => {
        if (typeof defineOptions !== 'function') {
            throw new TypeError('$mix.choice expects an option definition callback.');
        }

        const options = [];
        let weighted = null;
        const option = (weightOrRender, renderOption) => {
            const hasWeight = renderOption !== undefined;
            const weight = hasWeight ? weightOrRender : 1;
            const render = hasWeight ? renderOption : weightOrRender;

            if (weighted !== null && weighted !== hasWeight) {
                throw new TypeError('$mix.choice options cannot mix weighted and unweighted forms.');
            }
            if (!Number.isFinite(weight) || weight <= 0) {
                throw new TypeError('$mix.choice weights must be positive finite numbers.');
            }
            if (typeof render !== 'function') {
                throw new TypeError('$mix.choice options require a render callback.');
            }

            weighted = hasWeight;
            options.push({ weight, render });
        };

        defineOptions(option);
        if (options.length === 0) {
            throw new Error('$mix.choice requires at least one option.');
        }

        const totalWeight = options.reduce((sum, current) => sum + current.weight, 0);
        if (!Number.isFinite(totalWeight)) {
            throw new TypeError('$mix.choice total weight must be finite.');
        }

        let target = random() * totalWeight;
        for (const current of options) {
            target -= current.weight;
            if (target < 0) return current.render();
        }
        return options[options.length - 1].render();
    };

    return {
        helpers: Object.freeze({ choice }),
        renderedTemplateData: new Map(),
        renderedMessages: new Map(),
        renderedSystems: new Map()
    };
}

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

// Pricing per 1M tokens in USD
// Based on provider pricing pages linked in README
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
    // gptOss (Together/Groq/Cerebras/OpenRouter)
    'openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
    'gpt-oss-120b': { input: 0.15, output: 0.60 },
    'openai/gpt-oss-120b:free': { input: 0, output: 0 },
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
    // Fireworks
    'accounts/fireworks/models/deepseek-v4-flash': { input: 0.14, output: 0.28 },
    'accounts/fireworks/models/deepseek-v4-pro': { input: 1.74, output: 3.48 },
    'deepseek-ai/DeepSeek-V4-Flash': { input: 0.14, output: 0.28 },
    'deepseek-ai/DeepSeek-V4-Pro': { input: 2.10, output: 4.40 },
    'deepseek/deepseek-v4-flash': { input: 0.09, output: 0.18 },
    'accounts/fireworks/models/glm-4p7': { input: 0.55, output: 2.19 },
    'accounts/fireworks/models/glm-5p1': { input: 1.05, output: 3.50 },
    'zai-org/GLM-5.2': { input: 1.40, output: 4.40 },
    'accounts/fireworks/models/kimi-k2p5': { input: 0.50, output: 2.80 },
    'accounts/fireworks/models/qwen3p6-plus': { input: 0.50, output: 3.00 },
    'Qwen/Qwen3.6-Plus': { input: 0.50, output: 3.00 },
    'accounts/fireworks/models/qwen3p7-plus': { input: 0.40, output: 1.60 },
    'qwen/qwen3.7-plus': { input: 0.32, output: 1.28 },
    'qwen/qwen3.8-max': { input: 2.00, output: 6.00 },
    // MiniMax
    'MiniMax-M2.5': { input: 0.30, output: 1.20 },
    'MiniMax-M2.7': { input: 0.30, output: 1.20 },
    'MiniMax-M3': { input: 0.30, output: 1.20 },
    'minimax/minimax-m2.7': { input: 0.30, output: 1.20 },
    'minimax/minimax-m3': { input: 0.30, output: 1.20 },
    'MiniMaxAI/MiniMax-M3': { input: 0.30, output: 1.20 },
    // Perplexity
    'sonar': { input: 1.00, output: 1.00 },
    'sonar-pro': { input: 3.00, output: 15.00 },
    // Hermes3 (Lambda/OpenRouter)
    'Hermes-3-Llama-3.1-405B-FP8': { input: 0.80, output: 0.80 },
    'nousresearch/hermes-3-llama-3.1-405b:free': { input: 0, output: 0 },
    // Qwen3 (Together/Cerebras)
    'Qwen/Qwen3-235B-A22B-fp8-tput': { input: 0.20, output: 0.60 },
    'qwen-3-32b': { input: 0.20, output: 0.60 },
    // Kimi K2.5 (Together/Fireworks/OpenRouter)
    'moonshotai/Kimi-K2.5': { input: 0.50, output: 2.80 },
    'moonshotai/kimi-k2.5': { input: 0.50, output: 2.80 },
    // Kimi K3
    'kimi-k3': { input: 3.00, output: 15.00 },
    'moonshotai/kimi-k3': { input: 3.00, output: 15.00 },
    // GLM 4.7 (OpenRouter/Cerebras)
    'z-ai/glm-4.7': { input: 0.55, output: 2.19 },
    'zai-glm-4.7': { input: 0.55, output: 2.19 },
};

class ModelMix {

    constructor({ options = {}, config = {}, mix = {} } = {}) {
        this.models = [];
        this.messages = [];
        this.tools = {};
        this.toolClient = {};
        this.mcp = {};
        this.mcpToolsManager = new MCPToolsManager();
        this.plugins = [];
        this.templateFileAssignments = new Map();
        this.messageTemplates = new WeakMap();
        this.lastRaw = null;
        this.options = {
            max_tokens: 8192,
            temperature: 1, // 1 --> More creative, 0 --> More deterministic.
            ...options
        };

        // Standard Bottleneck configuration
        const defaultBottleneckConfig = {
            maxConcurrent: 8,     // Maximum number of concurrent requests
            minTime: 500,         // Minimum time between requests (in ms)
        };

        this.config = {
            system: 'You are an assistant.',
            max_history: 0, // 0=no history (stateless), N=keep last N messages, -1=unlimited
            debug: 0, // 0=silent, 1=minimal, 2=readable summary, 3=full (no truncate), 4=verbose (raw details)
            bottleneck: defaultBottleneckConfig,
            retry: {
                enabled: false,
                retries: 2,
                baseDelayMs: 500,
                maxDelayMs: 5000,
                retryableStatusCodes: [...DEFAULT_RETRYABLE_STATUS_CODES]
            },
            roundRobin: false, // false=fallback mode, true=round robin rotation
            ...config
        };
        this.systemTemplate = {
            source: this.config.system,
            filename: null
        };
        if (this.config.templateData !== undefined) {
            validateTemplateData(this.config.templateData);
        }
        // Unified effort is ModelMix policy (config.effort / .effort()), not a native option.
        if (this.config.effort !== undefined && this.config.effort !== null) {
            this.config.effort = normalizeEffort(this.config.effort);
        }
        const freeMix = { openrouter: true, cerebras: true, groq: true, together: false, lambda: false };
        this.mix = { ...freeMix, ...mix };

        this.limiter = new Bottleneck(this.config.bottleneck);

    }

    assign(keyValues) {
        validateTemplateData(keyValues);
        for (const key of Object.keys(keyValues)) {
            this.templateFileAssignments.delete(key);
        }
        this.config.templateData = { ...this.config.templateData, ...keyValues };
        return this;
    }

    assignKey(key, value) {
        validateTemplateDataKey(key);
        return this.assign({ [key]: value });
    }

    /**
     * Set unified reasoning effort: -1 (adaptive) or 0..100.
     * Stored in config.effort; mapped to provider-native fields at request time
     * unless a native effort control is already set (native wins).
     */
    effort(value) {
        this.config.effort = normalizeEffort(value);
        return this;
    }

    use(plugin) {
        if (!isPlainObject(plugin)) {
            throw new TypeError('plugin must be a plain object.');
        }
        if (typeof plugin.name !== 'string' || plugin.name.trim().length === 0) {
            throw new TypeError('plugin.name must be a non-empty string.');
        }
        if (typeof plugin.execute !== 'function') {
            throw new TypeError(`Plugin "${plugin.name}" must define execute(context, next).`);
        }
        if (this.plugins.some(current => current.name === plugin.name)) {
            throw new Error(`Plugin "${plugin.name}" is already registered on this instance.`);
        }
        this.plugins.push(plugin);
        return this;
    }

    static new({ options = {}, config = {}, mix = {} } = {}) {
        return new ModelMix({ options, config, mix });
    }

    new({ options = {}, config = {}, mix = {} } = {}) {
        const hasSystemOverride = Object.prototype.hasOwnProperty.call(config, 'system');
        const instance = new ModelMix({
            options: { ...this.options, ...options },
            config: { ...this.config, ...config },
            mix: { ...this.mix, ...mix }
        });
        if (!hasSystemOverride) {
            instance.systemTemplate = { ...this.systemTemplate };
        }
        instance.templateFileAssignments = new Map(this.templateFileAssignments);
        instance.plugins = [...this.plugins];
        for (const key of Object.keys(config.templateData || {})) {
            instance.templateFileAssignments.delete(key);
        }
        instance.models = this.models; // Share models array for round-robin rotation
        return instance;
    }

    _pluginsForPolicy(policy = 'inherit') {
        if (policy === 'inherit') return [...this.plugins];
        if (policy === 'none') return [];
        if (!isPlainObject(policy)) {
            throw new TypeError('plugins must be "inherit", "none", { include }, or { exclude }.');
        }

        const hasInclude = Object.prototype.hasOwnProperty.call(policy, 'include');
        const hasExclude = Object.prototype.hasOwnProperty.call(policy, 'exclude');
        if (hasInclude === hasExclude) {
            throw new TypeError('plugins policy must define exactly one of include or exclude.');
        }
        const names = hasInclude ? policy.include : policy.exclude;
        if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || name.length === 0)) {
            throw new TypeError('plugin include/exclude names must be non-empty strings.');
        }
        const uniqueNames = new Set(names);
        const knownNames = new Set(this.plugins.map(plugin => plugin.name));
        for (const name of uniqueNames) {
            if (!knownNames.has(name)) {
                throw new Error(`Plugin "${name}" is not registered on this instance.`);
            }
        }
        return hasInclude
            ? this.plugins.filter(plugin => uniqueNames.has(plugin.name))
            : this.plugins.filter(plugin => !uniqueNames.has(plugin.name));
    }

    async _invokeChild(input, parentExecution) {
        if (!isPlainObject(input)) {
            throw new TypeError('Child invocation must be a plain object.');
        }
        if (input.history !== undefined && input.history !== false) {
            throw new TypeError('Child invocations currently require history: false.');
        }

        const {
            system,
            systemFile,
            assign,
            messages = [],
            tools = [],
            options = {},
            config = {},
            mix = {},
            model = this,
            plugins = 'inherit',
            outputMode = 'raw'
        } = input;
        if (!Array.isArray(messages)) {
            throw new TypeError('Child invocation messages must be an array.');
        }
        if (system !== undefined && systemFile !== undefined) {
            throw new TypeError('Child invocation must define only one of system or systemFile.');
        }
        if (systemFile !== undefined && (typeof systemFile !== 'string' || systemFile.length === 0)) {
            throw new TypeError('Child invocation systemFile must be a non-empty string.');
        }
        if (assign !== undefined && !isPlainObject(assign)) {
            throw new TypeError('Child invocation assign must be a plain object.');
        }
        if (!Array.isArray(tools)) {
            throw new TypeError('Child invocation tools must be an array.');
        }
        if (!(model instanceof ModelMix)) {
            throw new TypeError('Child invocation model must be a ModelMix instance.');
        }

        const child = model === this
            ? ModelMix.new({ options, config, mix })
            : model.new({ options, config, mix });
        child.models = model.models;
        child.plugins = this._pluginsForPolicy(plugins);
        if (assign !== undefined) child.assign(assign);
        if (system !== undefined) child.setSystem(system);
        if (systemFile !== undefined) child.setSystemFromFile(systemFile);
        child.messages = clonePluginValue(messages);
        for (const tool of tools) {
            if (!isPlainObject(tool) || !isPlainObject(tool.tool) || typeof tool.callback !== 'function') {
                throw new TypeError('Child invocation tools must contain { tool, callback }.');
            }
            child.addTool(tool.tool, tool.callback);
        }

        const execution = {
            executionId: randomUUID(),
            parentExecutionId: parentExecution.executionId,
            depth: parentExecution.depth + 1
        };
        const result = await child.execute({
            outputMode,
            _executionMetadata: execution
        });
        return { ...result, execution };
    }

    static formatJSON(obj) {
        return inspect(obj, {
            depth: null,
            colors: true,
            maxArrayLength: null,
            breakLength: 80,
            compact: false
        });
    }

    static formatMessage(message) {
        if (typeof message !== 'string') return message;

        try {
            return ModelMix.formatJSON(JSON.parse(message.trim()));
        } catch (e) {
            return message;
        }
    }

    // debug logging helpers
    static truncate(str, maxLen = 1000) {
        if (!str || typeof str !== 'string') return str;
        return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    static normalizeTokenUsage({ input = 0, output = 0, thinking = 0, total, cached = 0, cacheWrite = 0, cacheWrite5m = 0, cacheWrite1h = 0 } = {}) {
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

    static calculateCostBreakdown(modelKey, tokens) {
        const pricing = MODEL_PRICING[modelKey];
        if (!pricing) return ModelMix.normalizeTokenUsage().costBreakdown;

        const normalized = ModelMix.normalizeTokenUsage(tokens);
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

    static calculateCacheMetrics(modelKey, tokens) {
        const pricing = MODEL_PRICING[modelKey];
        const emptyMetrics = {
            cacheSavings: 0,
            cacheWritePremium: 0,
            breakEvenHits: 0
        };
        if (!pricing) return emptyMetrics;

        const normalized = ModelMix.normalizeTokenUsage(tokens);
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

    static calculateCost(modelKey, tokens) {
        if (!MODEL_PRICING[modelKey]) return null;
        return ModelMix.calculateCostBreakdown(modelKey, tokens).total;
    }

    static extractCacheTokens(usage = {}) {
        return usage.input_tokens_details?.cached_tokens
            ?? usage.prompt_tokens_details?.cached_tokens
            ?? usage.cache_read_input_tokens
            ?? usage.cachedContentTokenCount
            ?? usage.cached_content_token_count
            ?? 0;
    }

    static extractCacheWriteTokens(usage = {}) {
        return usage.input_tokens_details?.cache_write_tokens
            ?? usage.prompt_tokens_details?.cache_write_tokens
            ?? usage.cache_creation_input_tokens
            ?? usage.cache_write_input_tokens
            ?? usage.cacheWriteTokenCount
            ?? usage.cache_write_token_count
            ?? 0;
    }

    static formatInputSummary(messages, system, debug = 2) {
        const lastMessage = messages[messages.length - 1];
        let inputText = '';

        if (lastMessage && Array.isArray(lastMessage.content)) {
            const textContent = lastMessage.content.find(c => c.type === 'text');
            if (textContent) inputText = textContent.text;
        } else if (lastMessage && typeof lastMessage.content === 'string') {
            inputText = lastMessage.content;
        }

        const noTruncate = debug >= 3;
        const systemStr = noTruncate ? (system || '') : ModelMix.truncate(system, 500);
        const inputStr = noTruncate ? inputText : ModelMix.truncate(inputText, 1200);
        const msgCount = `(${messages.length} msg${messages.length !== 1 ? 's' : ''})`;

        return `| SYSTEM\n${systemStr}\n| INPUT ${msgCount}\n${inputStr}`;
    }

    static formatOutputSummary(result, debug) {
        const parts = [];
        const noTruncate = debug >= 3;
        if (result.message) {
            // Try to parse as JSON for better formatting
            try {
                const parsed = JSON.parse(result.message.trim());
                // If it's valid JSON and debug >= 2, show it formatted
                if (debug >= 2) {
                    parts.push(`| OUTPUT (JSON)\n${ModelMix.formatJSON(parsed)}`);
                } else {
                    parts.push(`| OUTPUT\n${ModelMix.truncate(result.message, 1500)}`);
                }
            } catch (e) {
                parts.push(`| OUTPUT\n${noTruncate ? result.message : ModelMix.truncate(result.message, 1500)}`);
            }
        }
        if (result.think) {
            parts.push(`| THINK\n${noTruncate ? result.think : ModelMix.truncate(result.think, 800)}`);
        }
        if (result.toolCalls && result.toolCalls.length > 0) {
            const toolNames = result.toolCalls.map(t => t.function?.name || t.name).join(', ');
            parts.push(`| TOOLS\n${toolNames}`);
        }
        return parts.join('\n');
    }

    attach(key, provider) {

        if (this.models.some(model => model.key === key)) {
            return this;
        }

        if (this.messages.length > 0) {
            throw new Error("Cannot add models after message generation has started.");
        }

        this.models.push({ key, provider });
        return this;
    }

    gpt41({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1', new MixOpenAI({ options, config }));
    }
    gpt41mini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-mini', new MixOpenAI({ options, config }));
    }
    gpt41nano({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-nano', new MixOpenAI({ options, config }));
    }
    gpt5({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5', new MixOpenAI({ options, config }));
    }
    gpt5mini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5-mini', new MixOpenAI({ options, config }));
    }
    gpt5nano({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5-nano', new MixOpenAI({ options, config }));
    }
    gpt51({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.1', new MixOpenAIResponses({ options, config }));
    }
    gpt52({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.2', new MixOpenAIResponses({ options, config }));
    }
    gpt54({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.4', new MixOpenAIResponses({ options, config }));
    }
    gpt54mini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.4-mini', new MixOpenAIResponses({ options, config }));
    }
    gpt54nano({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.4-nano', new MixOpenAIResponses({ options, config }));
    }        
    gpt54pro({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.4-pro', new MixOpenAIResponses({ options, config }));
    }
    gpt55({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.5', new MixOpenAIResponses({ options, config }));
    }
    gpt55pro({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.5-pro', new MixOpenAIResponses({ options, config }));
    }
    gpt56sol({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.6-sol', new MixOpenAIResponses({ options, config }));
    }
    gpt56terra({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.6-terra', new MixOpenAIResponses({ options, config }));
    }
    gpt56luna({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.6-luna', new MixOpenAIResponses({ options, config }));
    }
    gptRealtime({ options = {}, config = {} } = {}) {
        return this.attach('gpt-realtime', new MixOpenAIWebSocket({ options, config }));
    }
    gptRealtimeMini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-realtime-mini', new MixOpenAIWebSocket({ options, config }));
    }
    gpt53codex({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.3-codex', new MixOpenAIResponses({ options, config }));
    }          
    gpt53chat({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.3-chat-latest', new MixOpenAIResponses({ options, config }));
    }
    gptOss({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('openai/gpt-oss-120b', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('gpt-oss-120b', new MixCerebras({ options, config }));
        if (mix.groq) this.attach('openai/gpt-oss-120b', new MixGroq({ options, config }));
        if (mix.openrouter) this.attach('openai/gpt-oss-120b:free', new MixOpenRouter({ options, config }));
        return this;
    }
    fable50({ options = {}, config = {} } = {}) {
        return this.attach('claude-fable-5', new MixAnthropic({ options, config }));
    }
    fable5(args = {}) {
        return this.fable50(args);
    }
    opus50({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-5', new MixAnthropic({ options, config }));
    }
    opus5(args = {}) {
        return this.opus50(args);
    }
    opus48({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-8', new MixAnthropic({ options, config }));
    }
    opus47({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-7', new MixAnthropic({ options, config }));
    }    
    opus46({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-6', new MixAnthropic({ options, config }));
    }
    sonnet50({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-5', new MixAnthropic({ options, config }));
    }
    sonnet5(args = {}) {
        return this.sonnet50(args);
    }
    sonnet46({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-4-6', new MixAnthropic({ options, config }));
    }
    sonnet45({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-4-5-20250929', new MixAnthropic({ options, config }));
    }
    haiku45({ options = {}, config = {} } = {}) {
        return this.attach('claude-haiku-4-5-20251001', new MixAnthropic({ options, config }));
    }
    gemini25flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-flash', new MixGoogle({ options, config }));
    }
    gemini31pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.1-pro-preview', new MixGoogle({ options, config }));
    }    
    gemini3pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3-pro-preview', new MixGoogle({ options, config }));
    }
    gemini3flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3-flash-preview', new MixGoogle({ options, config }));
    }
    gemini37flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.7-flash', new MixGoogle({ options, config }));
    }
    gemini36flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.6-flash', new MixGoogle({ options, config }));
    }
    gemini35flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.5-flash', new MixGoogle({ options, config }));
    }
    gemini35flashLite({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.5-flash-lite', new MixGoogle({ options, config }));
    }
    gemini31flashLite({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.1-flash-lite-preview', new MixGoogle({ options, config }));
    }
    gemini25pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-pro', new MixGoogle({ options, config }));
    }
    sonarPro({ options = {}, config = {} } = {}) {
        return this.attach('sonar-pro', new MixPerplexity({ options, config }));
    }
    sonar({ options = {}, config = {} } = {}) {
        return this.attach('sonar', new MixPerplexity({ options, config }));
    }

    grok46({ options = {}, config = {} } = {}) {
        return this.attach('grok-4.6', new MixGrok({ options, config }));
    }
    grok45({ options = {}, config = {} } = {}) {
        return this.attach('grok-4.5', new MixGrok({ options, config }));
    }
    grok43({ options = {}, config = {} } = {}) {
        return this.attach('grok-4.3', new MixGrok({ options, config }));
    }
    grok420multiAgent({ options = {}, config = {} } = {}) {
        return this.attach('grok-4.20-multi-agent-0309', new MixGrok({ options, config }));
    }
    /** Non-reasoning by default; with `.effort(20+)` / `-1` resolves to the reasoning model at request time. */
    grok420({ options = {}, config = {} } = {}) {
        return this.attach('grok-4.20-0309', new MixGrok({ options, config }));
    }

    qwen3({ options = {}, config = {}, mix = { together: true, cerebras: false } } = {}) {
        if (mix.together) this.attach('Qwen/Qwen3-235B-A22B-fp8-tput', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('qwen-3-32b', new MixCerebras({ options, config }));
        return this;
    }

    qwen36plus({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/qwen3p6-plus', new MixFireworks({ options, config }));
        if (mix.together) this.attach('Qwen/Qwen3.6-Plus', new MixTogether({ options, config }));
        return this;
    }

    qwen37plus({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/qwen3p7-plus', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('qwen/qwen3.7-plus', new MixOpenRouter({ options, config }));
        return this;
    }

    qwen38max({ options = {}, config = {}, mix = { openrouter: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.openrouter) this.attach('qwen/qwen3.8-max', new MixOpenRouter({ options, config }));
        return this;
    }

    hermes3({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.lambda) this.attach('Hermes-3-Llama-3.1-405B-FP8', new MixLambda({ options, config }));
        if (mix.openrouter) this.attach('nousresearch/hermes-3-llama-3.1-405b:free', new MixOpenRouter({ options, config }));
        return this;
    }

    kimiK26({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/kimi-k2p6', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k2.6', new MixOpenRouter({ options, config }));
        if (mix.together) this.attach('moonshotai/Kimi-K2.6', new MixTogether({ options, config }));
        return this;
    }    

    kimiK27Code({ options = {}, config = {}, mix = { together: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('moonshotai/Kimi-K2.7-Code', new MixTogether({ options, config }));
        return this;
    }

    kimiK3({ options = {}, config = {}, mix = { moonshot: true, openrouter: false } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.moonshot) this.attach('kimi-k3', new MixKimi({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k3', new MixOpenRouter({ options, config }));
        return this;
    }

    kimiK25({ options = {}, config = {}, mix = { together: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('moonshotai/Kimi-K2.5', new MixTogether({ options, config }));
        if (mix.fireworks) this.attach('accounts/fireworks/models/kimi-k2p5', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k2.5', new MixOpenRouter({ options, config }));
        return this;
    }

    lmstudio(model = 'lmstudio', { options = {}, config = {} } = {}) {
        return this.attach(model, new MixLMStudio({ options, config }));
    }


    minimaxM25({ options = {}, config = {}, mix = { minimax: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.minimax) this.attach('MiniMax-M2.5', new MixMiniMax({ options, config }));
        return this;
    }

    minimaxM27({ options = {}, config = {}, mix = { openrouter: true, minimax: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.nvidia) this.attach('minimaxai/minimax-m2.7', new MixNVIDIA({ options, config }));
        if (mix.openrouter) return this.attach('minimax/minimax-m2.7', new MixOpenRouter({ options, config }));
        if (mix.minimax) return this.attach('MiniMax-M2.7', new MixMiniMax({ options, config }));
        if (mix.together) return this.attach('MiniMaxAI/MiniMax-M2.7', new MixTogether({ options, config }));
        return this;
    }

    minimaxM3({ options = {}, config = {}, mix = { minimax: true, openrouter: false } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.openrouter) this.attach('minimax/minimax-m3', new MixOpenRouter({ options, config }));
        if (mix.minimax) this.attach('MiniMax-M3', new MixMiniMax({ options, config }));
        if (mix.together) this.attach('MiniMaxAI/MiniMax-M3', new MixTogether({ options, config }));
        return this;
    }

    mimo25({ options = {}, config = {}, mix = { openrouter: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.mimo) this.attach('mimo-v2.5', new MixMiMo({ options, config }));
        if (mix.openrouter) this.attach('xiaomi/mimo-v2.5', new MixOpenRouter({ options, config }));
        return this;
    }

    mimo25pro({ options = {}, config = {}, mix = { openrouter: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.mimo) this.attach('mimo-v2.5-pro', new MixMiMo({ options, config }));
        if (mix.openrouter) this.attach('xiaomi/mimo-v2.5-pro', new MixOpenRouter({ options, config }));
        return this;
    }

    deepseekV4Pro({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.nvidia) this.attach('deepseek-ai/deepseek-v4-pro', new MixNVIDIA({ options, config }));
        if (mix.fireworks) this.attach('accounts/fireworks/models/deepseek-v4-pro', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('deepseek/deepseek-v4-pro', new MixOpenRouter({ options, config }));
        if (mix.together) this.attach('deepseek-ai/DeepSeek-V4-Pro', new MixTogether({ options, config }));
        return this;
    }

    deepseekV4Flash({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.nvidia) this.attach('deepseek-ai/deepseek-v4-flash', new MixNVIDIA({ options, config }));
        if (mix.fireworks) this.attach('accounts/fireworks/models/deepseek-v4-flash', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('deepseek/deepseek-v4-flash', new MixOpenRouter({ options, config }));
        if (mix.together) this.attach('deepseek-ai/DeepSeek-V4-Flash', new MixTogether({ options, config }));
        return this;
    }

    GLM51({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.nvidia) this.attach('z-ai/glm-5.1', new MixNVIDIA({ options, config }));
        if (mix.fireworks) this.attach('accounts/fireworks/models/glm-5p1', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('z-ai/glm-5.1', new MixOpenRouter({ options, config }));
        if (mix.together) this.attach('zai-org/GLM-5.1', new MixTogether({ options, config }));
        return this;
    }

    GLM52({ options = {}, config = {}, mix = { together: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('zai-org/GLM-5.2', new MixTogether({ options, config }));
        return this;
    }

    addText(text, { role = "user", cache } = {}) {
        return this._addText(text, {
            role,
            cache: normalizeContentCache(cache),
            template: { source: text, filename: null }
        });
    }

    _addText(text, { role = "user", cache, template = null } = {}) {
        const content = [{
            type: "text",
            text,
            ...(cache !== undefined && { cache })
        }];

        if (template) {
            this.messageTemplates.set(content[0], template);
        }
        this.messages.push({ role, content });
        return this;
    }

    addTextFromFile(filePath, { role = "user", cache } = {}) {
        const filename = path.resolve(filePath);
        const content = this.readFile(filename);
        return this._addText(content, {
            role,
            cache: normalizeContentCache(cache),
            template: { source: content, filename }
        });
    }

    setSystem(text) {
        this.config.system = text;
        this.systemTemplate = { source: text, filename: null };
        return this;
    }

    setSystemFromFile(filePath) {
        const filename = path.resolve(filePath);
        const content = this.readFile(filename);
        this.config.system = content;
        this.systemTemplate = { source: content, filename };
        return this;
    }

    addImageFromBuffer(buffer, { role = "user", cache } = {}) {
        const contentCache = normalizeContentCache(cache);
        this.messages.push({
            role,
            content: [{
                type: "image",
                source: {
                    type: "buffer",
                    data: buffer
                },
                ...(contentCache !== undefined && { cache: contentCache })
            }]
        });
        return this;
    }

    addImage(filePath, { role = "user", cache } = {}) {
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Image file not found: ${filePath}`);
        }

        const contentCache = normalizeContentCache(cache);
        this.messages.push({
            role,
            content: [{
                type: "image",
                source: {
                    type: "file",
                    data: filePath
                },
                ...(contentCache !== undefined && { cache: contentCache })
            }]
        });
        return this;
    }

    addImageFromUrl(url, { role = "user", cache } = {}) {
        let source;
        if (url.startsWith('data:')) {
            // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                source = {
                    type: "base64",
                    media_type: match[1],
                    data: match[2]
                };
            } else {
                throw new Error('Invalid data URL format');
            }
        } else {
            source = {
                type: "url",
                data: url
            };
        }

        const contentCache = normalizeContentCache(cache);
        this.messages.push({
            role,
            content: [{
                type: "image",
                source,
                ...(contentCache !== undefined && { cache: contentCache })
            }]
        });

        return this;
    }

    async processImages() {
        for (let i = 0; i < this.messages.length; i++) {
            const message = this.messages[i];
            if (!Array.isArray(message.content)) continue;

            for (let j = 0; j < message.content.length; j++) {
                const content = message.content[j];
                if (content.type !== 'image' || content.source.type === 'base64') continue;

                try {
                    let buffer, mimeType;

                    switch (content.source.type) {
                        case 'url':
                            const response = await fetchBinaryResponse(content.source.data);
                            buffer = response.data;
                            mimeType = response.headers['content-type'];
                            break;

                        case 'file':
                            buffer = this.readFile(content.source.data, { encoding: null });
                            break;

                        case 'buffer':
                            buffer = content.source.data;
                            break;
                    }

                    // Detect mimeType if not provided
                    if (!mimeType) {
                        if (typeof detectFileTypeFromBuffer !== 'function') {
                            throw new Error('file-type module does not expose a buffer detector');
                        }
                        const detectedType = await detectFileTypeFromBuffer(buffer);
                        if (!detectedType || !detectedType.mime.startsWith('image/')) {
                            throw new Error(`Invalid image - unable to detect valid image format`);
                        }
                        mimeType = detectedType.mime;
                    }

                    // Update the content with processed image
                    message.content[j] = {
                        ...content,
                        source: {
                            type: "base64",
                            media_type: mimeType,
                            data: buffer.toString('base64')
                        }
                    };

                } catch (error) {
                    console.error(`Error processing image:`, error);
                    // Remove failed image from content
                    message.content.splice(j, 1);
                    j--;
                }
            }
        }
    }

    async message() {
        let raw = await this.execute({ options: { stream: false }, outputMode: 'message' });
        return raw.message;
    }

    async json(schemaExample = null, schemaDescription = {}, { type = 'json_object', addExample = false, addSchema = true, addNote = false } = {}) {

        let isArrayWrap = false;
        if (Array.isArray(schemaExample)) {
            isArrayWrap = true;
            schemaExample = { out: schemaExample };
            if (Array.isArray(schemaDescription)) {
                schemaDescription = { out: schemaDescription };
            }
        }

        let options = {
            response_format: { type },
            stream: false,
        }

        let config = {};
        let systemSuffix = '';

        if (schemaExample) {
            config.schema = generateJsonSchema(schemaExample, schemaDescription);

            if (addSchema) {
                systemSuffix += "\n\nOutput JSON Schema: \n```\n" + JSON.stringify(config.schema) + "\n```";
            }
            if (addExample) {
                systemSuffix += "\n\nOutput JSON Example: \n```\n" + JSON.stringify(schemaExample) + "\n```";
            }
            if (addNote) {
                systemSuffix += "\n\nOutput JSON Escape: double quotes, backslashes, and control characters inside JSON strings.\nEnsure the output contains no comments.";
            }
        }
        const { message } = await this.execute({ options, config, systemSuffix, outputMode: 'json' });
        const parsed = JSON.parse(this._extractBlock(message));
        return isArrayWrap ? parsed.out : parsed;
    }

    _extractBlock(response) {
        const block = response.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return block ? block[1].trim() : response.trim();
    }

    async block({ addSystemExtra = true } = {}) {
        const systemSuffix = addSystemExtra
            ? "\nReturn the result of the task between triple backtick block code tags ```"
            : '';
        const { message } = await this.execute({
            options: { stream: false },
            systemSuffix,
            outputMode: 'block'
        });
        return this._extractBlock(message);
    }

    async raw() {
        return this.execute({ options: { stream: false }, outputMode: 'raw' });
    }

    async stream(callback) {
        this.streamCallback = callback;
        return this.execute({ options: { stream: true }, outputMode: 'stream' });
    }

    assignKeyFromFile(key, filePath) {
        validateTemplateDataKey(key);
        this.readFile(filePath);

        const templateData = { ...this.config.templateData };
        delete templateData[key];
        this.config.templateData = templateData;
        this.templateFileAssignments.set(key, Object.freeze({
            key,
            filename: path.resolve(filePath)
        }));
        return this;
    }

    _choiceRandom() {
        return Math.random();
    }

    _templateData(renderContext) {
        const assigned = { ...(this.config.templateData || {}), $mix: renderContext.helpers };
        const data = { ...assigned };

        for (const [key, assignment] of this.templateFileAssignments) {
            data[key] = this._renderAssignedTemplate(assignment, assigned, renderContext);
        }

        return data;
    }

    _renderAssignedTemplate(assignment, data, renderContext) {
        if (renderContext.renderedTemplateData.has(assignment)) {
            return renderContext.renderedTemplateData.get(assignment);
        }

        const rendered = this._renderTemplateWithData(
            `<%- include(${JSON.stringify(assignment.filename)}) %>`,
            {
                filename: assignment.filename,
                label: `template data "${assignment.key}"`
            },
            data
        );
        renderContext.renderedTemplateData.set(assignment, rendered);
        return rendered;
    }

    _renderTemplate(
        source,
        { filename = null, label = 'template' } = {},
        renderContext = createTemplateRenderContext(() => this._choiceRandom())
    ) {
        return this._renderTemplateWithData(
            source,
            { filename, label },
            this._templateData(renderContext)
        );
    }

    _renderTemplateWithData(source, { filename = null, label = 'template' }, data) {
        if (typeof source !== 'string') {
            throw new TypeError(`${label} source must be a string.`);
        }

        try {
            const template = preprocessChoiceDirectives(source, { filename, label });
            return ejs.render(template, data, {
                ...(filename && { filename }),
                async: false,
                cache: false,
                compileDebug: true,
                unsafePrototypeLocals: false,
                includer: (originalPath, resolvedFilename) => {
                    if (!resolvedFilename) {
                        throw new Error(`Could not find the include file "${originalPath}"`);
                    }
                    const includedSource = fs.readFileSync(resolvedFilename, 'utf8').replace(/^\uFEFF/, '');
                    return {
                        filename: resolvedFilename,
                        template: preprocessChoiceDirectives(includedSource, {
                            filename: resolvedFilename,
                            label: 'included template'
                        })
                    };
                }
            });
        } catch (error) {
            const location = filename ? ` ${filename}` : '';
            const renderError = new Error(`Failed to render ${label}${location}: ${error.message}`);
            renderError.cause = error;
            throw renderError;
        }
    }

    static hasToolInteraction(message) {
        if (!message) return false;
        if (message.role === 'tool' || message.tool_calls || message.tool_call_id) return true;
        // Anthropic-native assistant turns store tool_use blocks in content (no tool_calls).
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            return message.content.some(block => block?.type === 'tool_use');
        }
        return false;
    }

    groupByRoles(messages) {
        return messages.reduce((acc, currentMessage, index) => {
            // Don't group tool messages or assistant messages with tool_calls
            // Each tool response must be separate with its own tool_call_id
            const shouldNotGroup = ModelMix.hasToolInteraction(currentMessage);

            if (index === 0 || currentMessage.role !== messages[index - 1].role || shouldNotGroup) {
                // acc.push({
                //     role: currentMessage.role,
                //     content: currentMessage.content
                // });
                acc.push(currentMessage);
            } else {
                acc[acc.length - 1].content = acc[acc.length - 1].content.concat(currentMessage.content);
            }
            return acc;
        }, []);
    }

    _renderMessageSnapshot(messages, renderContext) {
        return messages.map(message => ({
            ...message,
            content: Array.isArray(message.content)
                ? message.content.map(content => {
                    if (!content || typeof content !== 'object') return content;

                    const snapshotContent = { ...content };
                    const template = content.type === 'text'
                        ? this.messageTemplates.get(content)
                        : null;
                    if (!template) return snapshotContent;

                    let rendered = renderContext.renderedMessages.get(content)?.rendered;
                    if (rendered === undefined) {
                        rendered = this._renderTemplate(template.source, {
                            filename: template.filename,
                            label: 'message template'
                        }, renderContext);
                        renderContext.renderedMessages.set(content, { rendered, template });
                    }
                    snapshotContent.text = rendered;
                    return snapshotContent;
                })
                : message.content
        }));
    }

    _commitTemplateRenderContext(renderContext) {
        for (const [content, { rendered, template }] of renderContext.renderedMessages) {
            if (this.messageTemplates.get(content) !== template) continue;
            content.text = rendered;
            this.messageTemplates.delete(content);
        }
    }

    async prepareMessages(renderContext = createTemplateRenderContext(() => this._choiceRandom())) {
        await this.processImages();

        let messages = this.messages;

        // Smart message slicing based on max_history:
        // 0 = no history (stateless), N = keep last N messages, -1 = unlimited
        if (this.config.max_history > 0) {
            let sliceStart = Math.max(0, messages.length - this.config.max_history);

            // If we're slicing into the middle of a tool interaction,
            // backtrack to include the full sequence (user → assistant/tool_calls → tool results)
            while (sliceStart > 0 && sliceStart < messages.length) {
                const msg = messages[sliceStart];
                if (ModelMix.hasToolInteraction(msg)) {
                    sliceStart--;
                } else {
                    break;
                }
            }

            this.messages = messages.slice(sliceStart);
            messages = this.messages;
        }
        // max_history = -1: unlimited, no slicing
        // max_history = 0: no history, messages only contain what was added since last call

        return this.groupByRoles(this._renderMessageSnapshot(messages, renderContext));
    }

    readFile(filePath, { encoding = 'utf8' } = {}) {
        try {
            const absolutePath = path.resolve(filePath);
            return fs.readFileSync(absolutePath, { encoding });
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            } else if (error.code === 'EACCES') {
                throw new Error(`Permission denied: ${filePath}`);
            } else {
                throw new Error(`Error reading file ${filePath}: ${error.message}`);
            }
        }
    }

    _resolveSystemTemplate(config, providerConfig) {
        if (Object.prototype.hasOwnProperty.call(config, 'system')) {
            return { source: config.system, filename: null };
        }
        if (Object.prototype.hasOwnProperty.call(providerConfig, 'system')) {
            return { source: providerConfig.system, filename: null };
        }
        if (this.config.system !== this.systemTemplate.source) {
            return { source: this.config.system, filename: null };
        }
        return this.systemTemplate;
    }

    async execute({
        config = {},
        options = {},
        systemSuffix = '',
        outputMode = 'raw',
        _templateContext = null,
        _pluginRequest = null,
        _executionMetadata = null,
        _pluginsApplied = false
    } = {}) {
        const isRootExecution = _templateContext === null;
        const templateContext = _templateContext || createTemplateRenderContext(() => this._choiceRandom());

        if (!_pluginsApplied && this.plugins.length > 0) {
            const preparedMessages = await this.prepareMessages(templateContext);
            if (preparedMessages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }
            const requestConfig = {
                ...this.config,
                ...config,
                retry: {
                    ...(this.config.retry || {}),
                    ...(config.retry || {})
                }
            };
            const systemTemplate = this._resolveSystemTemplate(config, {});
            const systemCacheKey = JSON.stringify([systemTemplate.filename, systemTemplate.source]);
            if (!templateContext.renderedSystems.has(systemCacheKey)) {
                templateContext.renderedSystems.set(
                    systemCacheKey,
                    this._renderTemplate(systemTemplate.source, {
                        filename: systemTemplate.filename,
                        label: 'system template'
                    }, templateContext)
                );
            }
            const request = {
                system: templateContext.renderedSystems.get(systemCacheKey) + systemSuffix,
                messages: clonePluginValue(preparedMessages),
                options: clonePluginValue({ ...this.options, ...options }),
                config: clonePluginValue(requestConfig),
                outputMode
            };
            const executionMetadata = _executionMetadata || {
                executionId: randomUUID(),
                parentExecutionId: null,
                depth: 0
            };
            let providerInvoked = false;

            const dispatch = async index => {
                if (index === this.plugins.length) {
                    providerInvoked = true;
                    return this.execute({
                        config,
                        options,
                        systemSuffix,
                        outputMode,
                        _templateContext: templateContext,
                        _pluginRequest: request,
                        _executionMetadata: executionMetadata,
                        _pluginsApplied: true
                    });
                }

                const plugin = this.plugins[index];
                let nextCalled = false;
                const next = () => {
                    if (nextCalled) {
                        throw new Error(`Plugin "${plugin.name}" called next() multiple times.`);
                    }
                    nextCalled = true;
                    return dispatch(index + 1);
                };
                const context = {
                    request,
                    execution: Object.freeze({ ...executionMetadata }),
                    invoke: input => this._invokeChild(input, executionMetadata)
                };
                const result = await plugin.execute(context, next);
                return validatePluginResult(result, plugin.name);
            };

            const result = await dispatch(0);
            this.lastRaw = result;
            if (!providerInvoked) {
                if (this.config.max_history === 0) {
                    this.messages = [];
                } else if (result.message) {
                    this._addText(result.message, { role: 'assistant' });
                }
            }
            if (isRootExecution) this._commitTemplateRenderContext(templateContext);
            return result;
        }

        if (!this.models || this.models.length === 0) {
            throw new Error("No models specified. Use methods like .gpt5(), .sonnet46() first.");
        }

        const execution = this.limiter.schedule(async () => {
            const preparedMessages = _pluginRequest
                ? _pluginRequest.messages
                : await this.prepareMessages(templateContext);

            if (preparedMessages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }

            // Merge config to get final roundRobin value and retry settings
            const finalConfig = _pluginRequest
                ? _pluginRequest.config
                : {
                    ...this.config,
                    ...config,
                    retry: {
                        ...(this.config.retry || {}),
                        ...(config.retry || {})
                    }
                };

            // Try all models in order (first is primary, rest are fallbacks)
            const modelsToTry = this.models.map((model, index) => ({ model, index }));

            // Round robin: rotate models array AFTER using current for next request
            if (finalConfig.roundRobin && this.models.length > 1) {
                const firstModel = this.models.shift();
                this.models.push(firstModel);
            }

            let lastError = null;

            for (let i = 0; i < modelsToTry.length; i++) {

                const { model: currentModel, index: originalIndex } = modelsToTry[i];
                const currentModelKey = currentModel.key;
                const providerInstance = currentModel.provider;
                const optionsTools = providerInstance.getOptionsTools(this.tools);

                // Create clean copies for each provider to avoid contamination
                const currentOptions = {
                    ...this.options,
                    messages: preparedMessages,
                    ...providerInstance.options,
                    ...optionsTools,
                    ...options,
                    ...(_pluginRequest?.options || {}),
                    model: currentModelKey
                };

                const currentConfig = _pluginRequest
                    ? {
                        ...providerInstance.config,
                        ..._pluginRequest.config,
                        retry: {
                            ...(providerInstance.config?.retry || {}),
                            ...(_pluginRequest.config.retry || {})
                        }
                    }
                    : {
                        ...finalConfig,
                        ...providerInstance.config,
                        ...config,
                        retry: {
                            ...(finalConfig.retry || {}),
                            ...(providerInstance.config?.retry || {}),
                            ...(config.retry || {})
                        }
                    };
                if (_pluginRequest) {
                    currentConfig.system = _pluginRequest.system;
                } else {
                    const systemTemplate = this._resolveSystemTemplate(config, providerInstance.config);
                    const systemCacheKey = JSON.stringify([systemTemplate.filename, systemTemplate.source]);
                    if (!templateContext.renderedSystems.has(systemCacheKey)) {
                        templateContext.renderedSystems.set(
                            systemCacheKey,
                            this._renderTemplate(systemTemplate.source, {
                                filename: systemTemplate.filename,
                                label: 'system template'
                            }, templateContext)
                        );
                    }
                    currentConfig.system = templateContext.renderedSystems.get(systemCacheKey) + systemSuffix;
                }

                // Grok 4.20 alias → reasoning / non-reasoning from unified effort
                const resolvedModelKey = resolveGrok420ModelKey(
                    currentModelKey,
                    currentConfig.effort,
                    currentOptions
                );
                currentOptions.model = resolvedModelKey;

                // Unified effort → native provider fields (skipped if native already set)
                const providerFamily = resolveProviderFamily(providerInstance);
                applyUnifiedEffort(currentOptions, currentConfig, providerFamily, resolvedModelKey);

                if (currentConfig.debug >= 1) {
                    const isPrimary = i === 0;
                    const prefix = isPrimary ? '→' : '↻';
                    const suffix = isPrimary
                        ? (currentConfig.roundRobin ? ` (round-robin #${originalIndex + 1})` : '')
                        : ' (fallback)';
                    // Extract provider name from class name (e.g., "MixOpenRouter" -> "openrouter")
                    const providerName = providerInstance.constructor.name.replace(/^Mix/, '').toLowerCase();
                    const header = `\n${prefix} [${providerName}:${resolvedModelKey}] #${originalIndex + 1}${suffix}`;

                    if (currentConfig.debug >= 2) {
                        console.log(`${header}\n${ModelMix.formatInputSummary(preparedMessages, currentConfig.system, currentConfig.debug)}`);
                    } else {
                        console.log(header);
                    }
                }

                try {
                    if (currentOptions.stream && this.streamCallback) {
                        providerInstance.streamCallback = this.streamCallback;
                    }

                    const retryConfig = currentConfig.retry || {};
                    const retries = retryConfig.enabled ? Math.max(0, retryConfig.retries || 0) : 0;
                    const baseDelayMs = Math.max(0, retryConfig.baseDelayMs || 0);
                    const maxDelayMs = Math.max(baseDelayMs, retryConfig.maxDelayMs || baseDelayMs);
                    const retryableStatusCodes = new Set(
                        Array.isArray(retryConfig.retryableStatusCodes) && retryConfig.retryableStatusCodes.length > 0
                            ? retryConfig.retryableStatusCodes
                            : DEFAULT_RETRYABLE_STATUS_CODES
                    );

                    let attempt = 0;
                    let result;
                    let startTime = 0;

                    while (true) {
                        try {
                            startTime = Date.now();
                            result = await providerInstance.create({ options: currentOptions, config: currentConfig });
                            break;
                        } catch (attemptError) {
                            const statusCode = getErrorStatusCode(attemptError);
                            const isRetryable = retryableStatusCodes.has(statusCode);
                            const canRetry = attempt < retries && isRetryable;

                            if (!canRetry) {
                                throw attemptError;
                            }

                            if (currentConfig.debug >= 1) {
                                const nextAttempt = attempt + 2;
                                const totalAttempts = retries + 1;
                                console.log(`↺ Retrying [${resolvedModelKey}] due to status ${statusCode} (${nextAttempt}/${totalAttempts})`);
                            }

                            const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                            await sleep(delay);
                            attempt += 1;
                        }
                    }

                    const elapsedMs = Date.now() - startTime;

                    if (result.tokens) {
                        const normalizedTokens = ModelMix.normalizeTokenUsage(result.tokens);
                        const costBreakdown = ModelMix.calculateCostBreakdown(resolvedModelKey, normalizedTokens);
                        const cacheMetrics = ModelMix.calculateCacheMetrics(resolvedModelKey, normalizedTokens);
                        result.tokens = {
                            ...result.tokens,
                            ...normalizedTokens,
                            ...cacheMetrics,
                            cost: MODEL_PRICING[resolvedModelKey] ? costBreakdown.total : 0,
                            costBreakdown
                        };
                        const elapsedSec = elapsedMs / 1000;
                        result.tokens.speed = elapsedSec > 0 ? Math.round(result.tokens.output / elapsedSec) : 0;
                    }

                    if (result.toolCalls && result.toolCalls.length > 0) {
                        const toolMessages = _pluginRequest
                            ? clonePluginValue(_pluginRequest.messages)
                            : this.messages;
                        if (result.assistantMessage) {
                            toolMessages.push(result.assistantMessage);
                        } else if (result.message) {
                            if (result.signature) {
                                toolMessages.push({
                                    role: "assistant", content: [{
                                        type: "thinking",
                                        // Empty string is valid (Anthropic display: "omitted").
                                        thinking: result.think ?? '',
                                        signature: result.signature
                                    }]
                                });
                            } else {
                                toolMessages.push({
                                    role: 'assistant',
                                    content: [{ type: 'text', text: result.message }]
                                });
                            }
                        }

                        if (!result.assistantMessage) {
                            toolMessages.push({ role: "assistant", content: null, tool_calls: result.toolCalls });
                        }

                        const toolResults = await this.processToolCalls(result.toolCalls);
                        for (const toolResult of toolResults) {
                            toolMessages.push({
                                role: 'tool',
                                tool_call_id: toolResult.tool_call_id,
                                name: toolResult.name,
                                content: toolResult.content
                            });
                        }
                        this.messages = toolMessages;

                        const nextPluginRequest = _pluginRequest
                            ? {
                                ..._pluginRequest,
                                messages: toolMessages
                            }
                            : null;
                        return this.execute({
                            options,
                            config,
                            systemSuffix,
                            outputMode,
                            _templateContext: templateContext,
                            _pluginRequest: nextPluginRequest,
                            _executionMetadata,
                            _pluginsApplied
                        });
                    }

                    // debug level 1: Just success indicator
                    if (currentConfig.debug === 1) {
                        console.log(`✓ Success`);
                    }

                    // debug level 2: Readable summary of output
                    if (currentConfig.debug >= 2) {
                        const tokenInfo = result.tokens
                            ? ` ${result.tokens.input} → ${result.tokens.output} tok`
                                + (result.tokens.cached ? ` (cached:${result.tokens.cached})` : '')
                                + (result.tokens.speed ? ` | ${result.tokens.speed} t/s` : '')
                                + (result.tokens.cost != null ? ` $${result.tokens.cost.toFixed(4)}` : '')
                            : '';
                        console.log(`✓${tokenInfo}\n${ModelMix.formatOutputSummary(result, currentConfig.debug).trim()}`);
                    }

                    // debug level 4 (verbose): Full response details
                    if (currentConfig.debug >= 4) {
                        if (result.response) {
                            console.log('\n[RAW RESPONSE]');
                            console.log(ModelMix.formatJSON(result.response));
                        }

                        if (result.message) {
                            console.log('\n[FULL MESSAGE]');
                            console.log(ModelMix.formatMessage(result.message));
                        }

                        if (result.think) {
                            console.log('\n[FULL THINKING]');
                            console.log(result.think);
                        }
                    }

                    if (currentConfig.debug >= 1) console.log('');

                    this.lastRaw = result;

                    // Manage conversation history based on max_history setting
                    if (this.config.max_history === 0) {
                        // Stateless: clear messages so next call starts fresh
                        this.messages = [];
                    } else if (result.message) {
                        // Persist assistant response for multi-turn conversations
                        if (result.assistantMessage) {
                            this.messages.push(result.assistantMessage);
                        } else if (result.signature) {
                            this.messages.push({
                                role: "assistant", content: [{
                                    type: "thinking",
                                    // Empty string is valid (Anthropic display: "omitted").
                                    thinking: result.think ?? '',
                                    signature: result.signature
                                }, {
                                    type: "text",
                                    text: result.message
                                }]
                            });
                        } else {
                            this._addText(result.message, { role: "assistant" });
                        }
                    }

                    return result;

                } catch (error) {
                    lastError = error;
                    log.warn(`Model ${currentModelKey} failed (Attempt #${i + 1}/${modelsToTry.length}).`);
                    if (error.message) log.warn(`Error: ${error.message}`);
                    if (error.statusCode) log.warn(`Status Code: ${error.statusCode}`);
                    if (error.details) log.warn(`Details:\n${ModelMix.formatJSON(error.details)}`);

                    if (i === modelsToTry.length - 1) {
                        console.error(`All ${modelsToTry.length} model(s) failed. Throwing last error from ${currentModelKey}.`);
                        throw lastError;
                    } else {
                        const nextModelKey = modelsToTry[i + 1].model.key;
                        log.info(`-> Proceeding to next model: ${nextModelKey}`);
                    }
                }
            }

            log.error("Fallback logic completed without success or throwing the final error.");
            throw lastError || new Error("Failed to get response from any model, and no specific error was caught.");
        });

        if (!isRootExecution) return execution;

        const result = await execution;
        this._commitTemplateRenderContext(templateContext);
        return result;
    }

    async processToolCalls(toolCalls) {
        const result = []

        for (const toolCall of toolCalls) {
            // Handle different tool call formats more robustly
            let toolName, toolArgs, toolId;

            try {
                if (toolCall.function) {
                    // Formato OpenAI/normalizado
                    toolName = toolCall.function.name;
                    toolArgs = typeof toolCall.function.arguments === 'string'
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;
                    toolId = toolCall.id;
                } else if (toolCall.name) {
                    // Formato directo (posible formato alternativo)
                    toolName = toolCall.name;
                    toolArgs = toolCall.input || toolCall.arguments || {};
                    toolId = toolCall.id;
                } else {
                    log.error('Unknown tool call format:\n', toolCall);
                    continue;
                }

                // Validar que tenemos los datos necesarios
                if (!toolName) {
                    log.error('Tool call missing name:\n', toolCall);
                    continue;
                }

                // Verificar si es una herramienta local registrada
                if (this.mcpToolsManager.hasTool(toolName)) {
                    const response = await this.mcpToolsManager.executeTool(toolName, toolArgs);
                    result.push({
                        name: toolName,
                        tool_call_id: toolId,
                        content: response.content.map(item => item.text).join("\n")
                    });
                } else {
                    // Usar el cliente MCP externo
                    const client = this.toolClient[toolName];
                    if (!client) {
                        throw new Error(`No client found for tool: ${toolName}`);
                    }

                    const response = await client.callTool({
                        name: toolName,
                        arguments: toolArgs
                    });

                    result.push({
                        name: toolName,
                        tool_call_id: toolId,
                        content: response.content.map(item => item.text).join("\n")
                    });
                }
            } catch (error) {
                console.error(`Error processing tool call ${toolName}:`, error);
                result.push({
                    name: toolName || 'unknown',
                    tool_call_id: toolId || 'unknown',
                    content: `Error: ${error.message}`
                });
            }
        }
        return result;
    }

    async addMCP() {

        const key = arguments[0];

        if (this.mcp[key]) {
            log.info(`MCP ${key} already attached.`);
            return;
        }

        if (this.config.max_history >= 0 && this.config.max_history < 3) {
            log.warn(`MCP ${key} requires at least 3 max_history. Setting to 3.`);
            this.config.max_history = 3;
        }

        const env = {}
        for (const key in process.env) {
            if (['OPENAI', 'ANTHR', 'GOOGLE', 'GROQ', 'TOGET', 'LAMBDA', 'PPLX', 'XAI', 'CEREBR'].some(prefix => key.startsWith(prefix))) continue;
            env[key] = process.env[key];
        }

        const transport = new StdioClientTransport({
            command: "npx",
            args: ["-y", ...arguments],
            env
        });

        // Crear el cliente MCP
        this.mcp[key] = new Client({
            name: key,
            version: "1.0.0"
        });

        await this.mcp[key].connect(transport);

        const { tools } = await this.mcp[key].listTools();
        this.tools[key] = tools;

        for (const tool of tools) {
            this.toolClient[tool.name] = this.mcp[key];
        }

    }

    addTool(toolDefinition, callback) {

        if (this.config.max_history >= 0 && this.config.max_history < 3) {
            log.warn(`MCP ${toolDefinition.name} requires at least 3 max_history. Setting to 3.`);
            this.config.max_history = 3;
        }

        this.mcpToolsManager.registerTool(toolDefinition, callback);

        // Agregar la herramienta al sistema de tools para que sea incluida en las requests
        if (!this.tools.local) {
            this.tools.local = [];
        }
        this.tools.local.push({
            name: toolDefinition.name,
            description: toolDefinition.description,
            inputSchema: toolDefinition.inputSchema
        });

        return this;
    }

    addTools(toolsWithCallbacks) {
        for (const { tool, callback } of toolsWithCallbacks) {
            this.addTool(tool, callback);
        }
        return this;
    }

    removeTool(toolName) {
        this.mcpToolsManager.removeTool(toolName);

        // Also remove from the tools system
        if (this.tools.local) {
            this.tools.local = this.tools.local.filter(tool => tool.name !== toolName);
        }

        return this;
    }

    listTools() {
        const localTools = this.mcpToolsManager.getToolsForMCP();
        const mcpTools = Object.values(this.tools).flat();

        return {
            local: localTools,
            mcp: mcpTools.filter(tool => !localTools.find(local => local.name === tool.name))
        };
    }
}

class MixCustom {
    constructor({ config = {}, options = {}, headers = {} } = {}) {
        this.config = this.getDefaultConfig(config);
        this.options = this.getDefaultOptions(options);
        this.headers = this.getDefaultHeaders(headers);
        this.streamCallback = null; // Define streamCallback here
    }

    getDefaultOptions(customOptions) {
        return {
            ...customOptions
        };
    }

    getDefaultConfig(customConfig) {
        return {
            url: '',
            apiKey: '',
            ...customConfig
        };
    }

    getDefaultHeaders(customHeaders) {
        return {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': `Bearer ${this.config.apiKey}`,
            ...customHeaders
        };
    }

    convertMessages(messages, config) {
        return MixOpenAI.convertMessages(messages, config);
    }

    sanitizeCacheOptions(options) {
        delete options.cache_control;
        delete options.prompt_cache_key;
        delete options.prompt_cache_options;
        delete options.prompt_cache_retention;
    }

    static stripContentTypeHeader(headers = {}) {
        return stripContentTypeHeader(headers);
    }

    static createMultipartFormData({ fields = {}, files = [] } = {}) {
        return createMultipartFormData({ fields, files });
    }

    static buildRequestBodyAndHeaders(options, headers) {
        return buildRequestBodyAndHeaders(options, headers);
    }

    async create({ config = {}, options = {} } = {}) {
        try {
            this.sanitizeCacheOptions(options);
            if (Array.isArray(options.messages)) {
                options.messages = this.convertMessages(options.messages, config);
            }

            const request = buildRequestBodyAndHeaders(options, this.headers);

            // debug level 4 (verbose): Full request details
            if (config.debug >= 4) {
                console.log('\n[REQUEST DETAILS]');

                console.log('\n[CONFIG]');
                console.log(ModelMix.formatJSON(configForDebug(config)));

                console.log('\n[OPTIONS]');
                console.log(ModelMix.formatJSON(request.options));
            }

            if (options.stream) {
                return this.processStream(await fetchStreamResponse(this.config.url, {
                    method: 'POST',
                    headers: request.headers,
                    body: request.body
                }));
            } else {
                return this.processResponse(await fetchJsonResponse(this.config.url, {
                    method: 'POST',
                    headers: request.headers,
                    body: request.body
                }));
            }
        } catch (error) {
            throw this.handleError(error);
        }
    }

    handleError(error) {
        let errorMessage = 'An error occurred in MixCustom';
        let statusCode = null;
        let errorDetails = null;

        if (error?.isHttpError || error?.response || typeof error?.statusCode === 'number') {
            statusCode = error.statusCode ?? error.response?.status ?? null;
            errorMessage = error.message || `Request to ${this.config.url} failed with status code ${statusCode}`;
            errorDetails = error.details ?? error.response?.data ?? null;
        } else if (error?.message) {
            errorMessage = error.message;
        }

        const formattedError = {
            message: redactSecret(errorMessage, this.config.apiKey),
            statusCode,
            details: redactSecret(errorDetails, this.config.apiKey),
            stack: redactSecret(error.stack, this.config.apiKey)
        };

        return formattedError;
    }

    processStream(response) {
        return new Promise((resolve, reject) => {
            let raw = [];
            let message = '';
            let buffer = '';

            response.data.on('data', chunk => {
                buffer += chunk.toString();

                let boundary;
                while ((boundary = buffer.indexOf('\n')) !== -1) {
                    const dataStr = buffer.slice(0, boundary).trim();
                    buffer = buffer.slice(boundary + 1);

                    const firstBraceIndex = dataStr.indexOf('{');
                    if (dataStr === '[DONE]' || firstBraceIndex === -1) continue;

                    const jsonStr = dataStr.slice(firstBraceIndex);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (this.streamCallback) {
                            const delta = this.extractDelta(data);
                            message += delta;
                            this.streamCallback({ response: data, message, delta });
                            raw.push(data);
                        }
                    } catch (error) {
                        console.error('Error parsing JSON:', error);
                    }
                }
            });

            response.data.on('end', () => resolve({
                response: raw,
                message: message.trim(),
                toolCalls: [],
                think: null,
                tokens: raw.length > 0 ? MixCustom.extractTokens(raw[raw.length - 1]) : { input: 0, output: 0, total: 0, cached: 0 }
            }));
            response.data.on('error', reject);
        });
    }

    extractDelta(data) {
        return data.choices[0].delta.content;
    }

    static extractMessage(data) {
        const choice = data?.choices?.[0] || {};
        const messageObj = choice.message || {};
        const finishReason = choice.finish_reason;

        if (typeof messageObj.refusal === 'string' && messageObj.refusal.trim().length > 0) {
            throw new Error(`OpenAI model refused to process this request: ${messageObj.refusal}`);
        }

        if (finishReason === 'content_filter') {
            throw new Error('OpenAI response was blocked by content_filter.');
        }

        let message = '';
        if (typeof messageObj.content === 'string') {
            message = messageObj.content.trim();
        } else if (Array.isArray(messageObj.content)) {
            const refusalPart = messageObj.content.find(part => part?.type === 'refusal' || (typeof part?.refusal === 'string' && part.refusal.trim().length > 0));
            if (refusalPart) {
                const refusalText = typeof refusalPart.refusal === 'string' ? refusalPart.refusal : 'No refusal text provided.';
                throw new Error(`OpenAI model refused to process this request: ${refusalText}`);
            }
            message = messageObj.content
                .filter(part => typeof part?.text === 'string')
                .map(part => part.text)
                .join('')
                .trim();
        }

        const endTagIndex = message.indexOf('</think>');
        if (message.startsWith('<think>') && endTagIndex !== -1) {
            return message.substring(endTagIndex + 8).trim();
        }
        return message;
    }

    static extractThink(data) {

        if (data.choices[0].message?.reasoning_content) {
            return data.choices[0].message.reasoning_content;
        } else if (data.choices[0].message?.reasoning) {
            return data.choices[0].message.reasoning;
        }

        const message = data.choices[0].message?.content?.trim() || '';
        const endTagIndex = message.indexOf('</think>');
        if (message.startsWith('<think>') && endTagIndex !== -1) {
            return message.substring(7, endTagIndex).trim();
        }
        return null;
    }

    static extractToolCalls(data) {
        return data.choices[0].message?.tool_calls?.map(call => ({
            id: call.id,
            type: 'function',
            function: {
                name: call.function.name,
                arguments: call.function.arguments
            }
        })) || []
    }

    static extractTokens(data) {
        // OpenAI/Groq/Together/Lambda/Cerebras/Fireworks format
        if (data.usage) {
            return ModelMix.normalizeTokenUsage({
                input: data.usage.prompt_tokens || 0,
                output: data.usage.completion_tokens || 0,
                total: data.usage.total_tokens,
                cached: ModelMix.extractCacheTokens(data.usage),
                cacheWrite: ModelMix.extractCacheWriteTokens(data.usage)
            });
        }
        return ModelMix.normalizeTokenUsage();
    }

    processResponse(response) {
        return {
            message: MixCustom.extractMessage(response.data),
            think: MixCustom.extractThink(response.data),
            toolCalls: MixCustom.extractToolCalls(response.data),
            tokens: MixCustom.extractTokens(response.data),
            response: response.data
        }
    }

    getOptionsTools(tools) {
        return MixOpenAI.getOptionsTools(tools);
    }
}

class MixOpenAI extends MixCustom {
    sanitizeCacheOptions(options) {
        delete options.cache_control;
        delete options.prompt_cache_options;
    }

    getDefaultConfig(customConfig) {

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not found. Please provide it in config or set OPENAI_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.openai.com/v1/chat/completions',
            apiKey: process.env.OPENAI_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {

        // Remove max_tokens and temperature for o1/o3 models
        if (options.model?.startsWith('o')) {
            delete options.max_tokens;
            delete options.temperature;
        }

        // Use max_completion_tokens and remove temperature for GPT-5 models
        if (options.model?.includes('gpt-5')) {
            if (options.max_tokens) {
                options.max_completion_tokens = options.max_tokens;
                delete options.max_tokens;
            }
            delete options.temperature;
        }

        return super.create({ config, options });
    }

    static convertMessages(messages, config) {

        const content = config.system;
        messages = [{ role: 'system', content }, ...messages || []];

        const results = []
        for (const message of messages) {

            if (message.tool_calls) {
                results.push({
                    role: 'assistant',
                    content: message.content ?? null,
                    ...(message.reasoning_content && { reasoning_content: message.reasoning_content }),
                    tool_calls: message.tool_calls
                })
                continue;
            }

            if (message.role === 'tool') {
                // Handle new format: tool_call_id directly on message
                if (message.tool_call_id) {
                    results.push({
                        role: 'tool',
                        tool_call_id: message.tool_call_id,
                        content: message.content
                    });
                }
                // Handle old format: content is an array
                else if (Array.isArray(message.content)) {
                    for (const content of message.content) {
                        results.push({
                            role: 'tool',
                            tool_call_id: content.tool_call_id,
                            content: content.content
                        })
                    }
                }
                continue;
            }

            let convertedMessage = { ...message };
            if (Array.isArray(message.content)) {
                convertedMessage = {
                    ...message,
                    content: message.content.filter(content => content !== null && content !== undefined).map(content => {
                        if (content && content.type === 'image') {
                            const { media_type, data } = content.source;
                            return {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${media_type};base64,${data}`
                                }
                            };
                        }
                        return stripContentCacheMetadata(content);
                    })
                };
            }

            results.push(convertedMessage);
        }

        return results;
    }

    static getOptionsTools(tools) {
        const options = {};
        const toolsArray = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                toolsArray.push({
                    type: 'function',
                    function: {
                        name: item.name,
                        description: item.description,
                        parameters: item.inputSchema
                    }
                });
            }
        }

        // Solo incluir tools si el array no está vacío
        if (toolsArray.length > 0) {
            options.tools = toolsArray;
            // options.tool_choice = "auto";
        }

        return options;
    }
}

class MixOpenAIResponses extends MixOpenAI {
    async create({ config = {}, options = {} } = {}) {

        // Keep GPT/o-model option normalization behavior
        if (options.model?.startsWith('o')) {
            delete options.max_tokens;
            delete options.temperature;
        }
        if (options.model?.includes('gpt-5')) {
            if (options.max_tokens) {
                options.max_completion_tokens = options.max_tokens;
                delete options.max_tokens;
            }
            delete options.temperature;
        }

        const responsesUrl = this.config.url.replace('/chat/completions', '/responses');
        const request = MixOpenAIResponses.buildResponsesRequest(options, config);
        const response = await fetchJsonResponse(responsesUrl, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(request)
        });

        return MixOpenAIResponses.processResponsesResponse(response);
    }

    static buildResponsesRequest(options = {}, config = {}) {
        const isGPT56 = typeof options.model === 'string' && options.model.startsWith('gpt-5.6');
        const input = MixOpenAIResponses.messagesToResponsesInput(options.messages, {
            translateNeutralCache: isGPT56
        });
        if (config.system) {
            input.unshift({ role: 'developer', content: [{ type: 'input_text', text: config.system }] });
        }
        MixOpenAIResponses.validatePromptCaching(options, input);
        const request = {
            model: options.model,
            input,
            stream: false
        };

        if (options.reasoning_effort) request.reasoning = { effort: options.reasoning_effort };
        if (options.verbosity) request.text = { verbosity: options.verbosity };

        if (options.response_format) {
            const rf = options.response_format;
            let format;
            if (rf.type === 'json_schema' && rf.json_schema) {
                format = {
                    type: 'json_schema',
                    name: rf.json_schema.name || 'response',
                    strict: true,
                    schema: rf.json_schema.schema
                };
            } else if (rf.type) {
                format = { type: rf.type };
            }
            if (format) {
                request.text = { ...request.text, format };
            }
        }

        if (typeof options.max_completion_tokens === 'number') {
            request.max_output_tokens = options.max_completion_tokens;
        } else if (typeof options.max_tokens === 'number') {
            request.max_output_tokens = options.max_tokens;
        }

        if (typeof options.temperature === 'number') request.temperature = options.temperature;
        if (typeof options.top_p === 'number') request.top_p = options.top_p;
        if (typeof options.presence_penalty === 'number') request.presence_penalty = options.presence_penalty;
        if (typeof options.frequency_penalty === 'number') request.frequency_penalty = options.frequency_penalty;
        if (options.stop !== undefined) request.stop = options.stop;
        if (typeof options.n === 'number') request.n = options.n;
        if (options.logit_bias !== undefined) request.logit_bias = options.logit_bias;
        if (options.user !== undefined) request.user = options.user;
        if (options.prompt_cache_key !== undefined) request.prompt_cache_key = options.prompt_cache_key;
        if (options.prompt_cache_retention !== undefined) request.prompt_cache_retention = options.prompt_cache_retention;
        if (options.prompt_cache_options !== undefined) request.prompt_cache_options = options.prompt_cache_options;

        return request;
    }

    static validatePromptCaching(options, input) {
        const isGPT56 = typeof options.model === 'string' && options.model.startsWith('gpt-5.6');
        const cacheOptions = options.prompt_cache_options;
        const breakpoints = input.flatMap(message => Array.isArray(message.content)
            ? message.content
                .filter(block => block?.prompt_cache_breakpoint !== undefined)
                .map(block => block.prompt_cache_breakpoint)
            : []);

        if (isGPT56 && options.prompt_cache_retention !== undefined) {
            throw new Error('GPT-5.6 does not support prompt_cache_retention; use prompt_cache_options.ttl instead.');
        }
        if (!isGPT56 && cacheOptions !== undefined) {
            throw new Error('prompt_cache_options is only supported by GPT-5.6 models.');
        }
        if (!isGPT56 && breakpoints.length > 0) {
            throw new Error('prompt_cache_breakpoint is only supported by GPT-5.6 models.');
        }
        if (cacheOptions !== undefined) {
            if (!isPlainObject(cacheOptions)) {
                throw new TypeError('prompt_cache_options must be a plain non-null object.');
            }
            if (cacheOptions.mode !== undefined
                && cacheOptions.mode !== 'implicit'
                && cacheOptions.mode !== 'explicit') {
                throw new TypeError('prompt_cache_options.mode must be "implicit" or "explicit".');
            }
            if (cacheOptions.ttl !== undefined && cacheOptions.ttl !== '30m') {
                throw new TypeError('prompt_cache_options.ttl must be "30m".');
            }
        }
        for (const breakpoint of breakpoints) {
            if (!isPlainObject(breakpoint)) {
                throw new TypeError('prompt_cache_breakpoint must be a plain non-null object.');
            }
            if (breakpoint.mode !== 'explicit') {
                throw new TypeError('prompt_cache_breakpoint mode must be "explicit".');
            }
        }
    }

    static processResponsesResponse(response) {
        const message = MixOpenAIResponses.extractResponsesMessage(response.data);
        return {
            message,
            think: null,
            toolCalls: [],
            tokens: MixOpenAIResponses.extractResponsesTokens(response.data),
            response: response.data
        };
    }

    static extractResponsesTokens(data) {
        if (data.usage) {
            return ModelMix.normalizeTokenUsage({
                input: data.usage.input_tokens || 0,
                output: data.usage.output_tokens || 0,
                total: data.usage.total_tokens,
                cached: ModelMix.extractCacheTokens(data.usage),
                cacheWrite: ModelMix.extractCacheWriteTokens(data.usage)
            });
        }
        return ModelMix.normalizeTokenUsage();
    }

    static extractResponsesMessage(data) {
        if (!Array.isArray(data.output)) return '';
        return data.output
            .filter(item => item.type === 'message')
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .filter(content => content.type === 'output_text' && typeof content.text === 'string')
            .map(content => content.text)
            .join('\n')
            .trim();
    }

    static messagesToResponsesInput(messages = [], { translateNeutralCache = false } = {}) {
        const mapped = [];

        for (const message of messages) {
            if (!message || !message.role) continue;
            if (message.tool_calls || message.role === 'tool') continue;

            const content = [];
            const isAssistant = message.role === 'assistant';
            const textType = isAssistant ? 'output_text' : 'input_text';
            if (typeof message.content === 'string') {
                if (message.content) content.push({ type: textType, text: message.content });
            } else if (Array.isArray(message.content)) {
                for (const item of message.content) {
                    if (!item || typeof item !== 'object') continue;
                    const neutralCache = item.cache !== undefined
                        ? normalizeContentCache(item.cache)
                        : undefined;
                    const promptCacheBreakpoint = item.prompt_cache_breakpoint !== undefined
                        ? item.prompt_cache_breakpoint
                        : (translateNeutralCache && neutralCache?.breakpoint
                            ? { mode: 'explicit' }
                            : undefined);
                    const breakpoint = !isAssistant && promptCacheBreakpoint !== undefined
                        ? { prompt_cache_breakpoint: promptCacheBreakpoint }
                        : {};

                    if ((item.type === 'text' || item.type === 'input_text' || item.type === 'output_text')
                        && typeof item.text === 'string') {
                        content.push({ type: textType, text: item.text, ...breakpoint });
                        continue;
                    }
                    if (item.type === 'image' && item.source) {
                        let imageUrl;
                        if (item.source.type === 'base64') {
                            if (!item.source.media_type || typeof item.source.data !== 'string') {
                                throw new TypeError('Responses base64 images require source.media_type and string source.data.');
                            }
                            imageUrl = `data:${item.source.media_type};base64,${item.source.data}`;
                        } else if (item.source.type === 'url' && typeof item.source.data === 'string') {
                            imageUrl = item.source.data;
                        } else {
                            throw new TypeError('Responses images must be processed to base64 or use a URL source.');
                        }
                        content.push({ type: 'input_image', image_url: imageUrl, ...breakpoint });
                        continue;
                    }
                    if (item.type === 'image_url' && typeof item.image_url?.url === 'string') {
                        content.push({ type: 'input_image', image_url: item.image_url.url, ...breakpoint });
                        continue;
                    }
                    if (item.type === 'input_image' || item.type === 'input_file') {
                        content.push({
                            ...stripContentCacheMetadata(item),
                            ...breakpoint
                        });
                    }
                }
            }

            if (content.length === 0) continue;
            mapped.push({
                role: message.role,
                content
            });
        }

        return mapped;
    }
}

class MixOpenAIWebSocket extends MixOpenAIResponses {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            realtimeUrl: 'wss://api.openai.com/v1/realtime',
            websocketTimeoutMs: 120000,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (options.model?.startsWith('o')) {
            delete options.max_tokens;
            delete options.temperature;
        }
        if (options.model?.includes('gpt-5')) {
            if (options.max_tokens) {
                options.max_completion_tokens = options.max_tokens;
                delete options.max_tokens;
            }
            delete options.temperature;
        }

        const mergedConfig = { ...this.config, ...config };
        const realtimeUrl = `${mergedConfig.realtimeUrl}?model=${encodeURIComponent(options.model)}`;
        const timeoutMs = mergedConfig.websocketTimeoutMs || 120000;

        return await new Promise((resolve, reject) => {
            const ws = new WebSocket(realtimeUrl, {
                headers: {
                    authorization: `Bearer ${mergedConfig.apiKey}`
                }
            });

            const events = [];
            let message = '';
            let settled = false;
            let finalResponse = null;

            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                ws.close();
                reject({
                    message: `Realtime WebSocket timed out after ${timeoutMs}ms`,
                    statusCode: null,
                    details: null
                });
            }, timeoutMs);

            const cleanUp = () => clearTimeout(timeout);

            ws.on('open', () => {
                const session = {
                    type: 'realtime',
                    output_modalities: ['text']
                };

                if (mergedConfig.system) session.instructions = mergedConfig.system;
                if (Array.isArray(options.tools) && options.tools.length > 0) {
                    session.tools = options.tools;
                }

                ws.send(JSON.stringify({ type: 'session.update', session }));

                const items = MixOpenAIWebSocket.messagesToConversationItems(options.messages);
                for (const item of items) {
                    ws.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item
                    }));
                }

                const responseConfig = { output_modalities: ['text'] };
                if (typeof options.max_completion_tokens === 'number') {
                    responseConfig.max_output_tokens = Math.min(options.max_completion_tokens, 4096);
                } else if (typeof options.max_tokens === 'number') {
                    responseConfig.max_output_tokens = Math.min(options.max_tokens, 4096);
                }
                if (Array.isArray(options.tools) && options.tools.length > 0) responseConfig.tools = options.tools;

                ws.send(JSON.stringify({
                    type: 'response.create',
                    response: responseConfig
                }));
            });

            ws.on('message', raw => {
                let event;
                try {
                    event = JSON.parse(raw.toString());
                } catch {
                    return;
                }

                events.push(event);

                const isTextDeltaEvent = event.type === 'response.text.delta' || event.type === 'response.output_text.delta';
                if (isTextDeltaEvent) {
                    const delta = MixOpenAIWebSocket.extractDelta(event);
                    if (delta) {
                        message += delta;
                        if (this.streamCallback) {
                            this.streamCallback({ response: event, message, delta });
                        }
                    }
                    return;
                }

                if (event.type === 'response.done') {
                    finalResponse = event.response || null;
                    if (!message && finalResponse) {
                        message = MixOpenAIResponses.extractResponsesMessage(finalResponse);
                    }

                    if (!settled) {
                        settled = true;
                        cleanUp();
                        ws.close();
                        resolve({
                            message: message.trim(),
                            think: null,
                            toolCalls: [],
                            tokens: MixOpenAIResponses.extractResponsesTokens(finalResponse || {}),
                            response: {
                                response: finalResponse,
                                events
                            }
                        });
                    }
                    return;
                }

                if (event.type === 'error' && !settled) {
                    settled = true;
                    cleanUp();
                    ws.close();
                    reject({
                        message: event.error?.message || 'Realtime WebSocket error',
                        statusCode: null,
                        details: event.error || event
                    });
                }
            });

            ws.on('error', error => {
                if (settled) return;
                settled = true;
                cleanUp();
                reject({
                    message: error.message || 'Realtime WebSocket connection error',
                    statusCode: null,
                    details: null,
                    stack: error.stack
                });
            });

            ws.on('close', () => {
                if (settled) return;
                settled = true;
                cleanUp();
                reject({
                    message: 'Realtime WebSocket closed before response.done',
                    statusCode: null,
                    details: null
                });
            });
        });
    }

    static messagesToConversationItems(messages = []) {
        const items = [];

        for (const message of messages) {
            if (!message || !message.role) continue;
            if (message.role === 'tool' || message.tool_calls) continue;

            const role = message.role === 'assistant' ? 'assistant' : (message.role === 'system' ? 'system' : 'user');
            const content = [];

            if (typeof message.content === 'string') {
                content.push({
                    type: role === 'assistant' ? 'text' : 'input_text',
                    text: message.content
                });
            } else if (Array.isArray(message.content)) {
                for (const item of message.content) {
                    if (!item || item.type !== 'text' || typeof item.text !== 'string') continue;
                    content.push({
                        type: role === 'assistant' ? 'text' : 'input_text',
                        text: item.text
                    });
                }
            }

            if (content.length === 0) continue;
            items.push({ type: 'message', role, content });
        }

        return items;
    }

    static extractDelta(event) {
        if (typeof event.delta === 'string') return event.delta;
        return '';
    }
}

class MixOpenRouter extends MixOpenAI {
    getDefaultConfig(customConfig) {

        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('OpenRouter API key not found. Please provide it in config or set OPENROUTER_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey: process.env.OPENROUTER_API_KEY,
            ...customConfig
        });
    }
}

class MixKimi extends MixOpenAI {
    getDefaultConfig(customConfig) {
        if (!process.env.MOONSHOT_API_KEY) {
            throw new Error('Moonshot API key not found. Please provide it in config or set MOONSHOT_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.moonshot.ai/v1/chat/completions',
            apiKey: process.env.MOONSHOT_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (Object.hasOwn(options, 'max_tokens')) {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
        }

        delete options.temperature;
        delete options.top_p;
        delete options.n;
        delete options.presence_penalty;
        delete options.frequency_penalty;

        return super.create({ config, options });
    }

    extractDelta(data) {
        return data?.choices?.[0]?.delta?.content || '';
    }

    processResponse(response) {
        return {
            ...super.processResponse(response),
            assistantMessage: response.data?.choices?.[0]?.message
        };
    }
}

class MixAnthropic extends MixCustom {

    sanitizeCacheOptions(options) {
        delete options.prompt_cache_key;
        delete options.prompt_cache_options;
        delete options.prompt_cache_retention;
    }

    static validateCacheControl(cacheControl) {
        if (!isPlainObject(cacheControl) || cacheControl.type !== 'ephemeral') {
            throw new TypeError('Anthropic cache_control must have type "ephemeral".');
        }
        if (cacheControl.ttl !== undefined
            && cacheControl.ttl !== '5m'
            && cacheControl.ttl !== '1h') {
            throw new TypeError('Anthropic cache_control.ttl must be "5m" or "1h".');
        }
    }

    /**
     * Opus 4.7+ and Claude 5 family reject sampling params (temperature/top_p/top_k).
     * See: https://platform.claude.com/docs/en/about-claude/models/migration-guide
     */
    static rejectsSamplingParams(model = '') {
        const id = String(model).toLowerCase();
        if (!id.includes('claude')) return false;
        if (id.includes('mythos') || id.includes('fable')) return true;

        const opus = id.match(/claude-opus-(\d+)(?:-(\d+))?/);
        if (opus) {
            const major = Number(opus[1]);
            const minor = opus[2] !== undefined ? Number(opus[2]) : 0;
            return major > 4 || (major === 4 && minor >= 7);
        }

        const sonnet = id.match(/claude-sonnet-(\d+)/);
        if (sonnet) return Number(sonnet[1]) >= 5;

        return false;
    }

    getDefaultConfig(customConfig) {

        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('Anthropic API key not found. Please provide it in config or set ANTHROPIC_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.anthropic.com/v1/messages',
            apiKey: process.env.ANTHROPIC_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {

        delete options.response_format;

        if (MixAnthropic.rejectsSamplingParams(options.model)) {
            delete options.temperature;
            delete options.top_p;
            delete options.top_k;
        }

        const requestConfig = { ...config };
        if (hasNeutralCacheBreakpoint(options.messages)) {
            const contentCacheControl = options.cache_control ?? { type: 'ephemeral' };
            MixAnthropic.validateCacheControl(contentCacheControl);
            requestConfig._contentCacheControl = { ...contentCacheControl };
            delete options.cache_control;
        } else if (options.cache_control !== undefined) {
            MixAnthropic.validateCacheControl(options.cache_control);
        }

        options.system = config.system;

        try {
            return await super.create({ config: requestConfig, options });
        } catch (error) {
            // Log the error details for debugging
            if (error.response && error.response.data) {
                log.error('Anthropic API Error:\n', error.response.data);
            }
            throw error;
        }
    }

    convertMessages(messages, config) {
        return MixAnthropic.convertMessages(messages, config);
    }

    static convertMessages(messages, config) {
        // Filter out orphaned tool results for Anthropic
        const filteredMessages = [];
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'tool') {
                // Preceding assistant may use OpenAI tool_calls or Anthropic tool_use blocks.
                let foundToolCall = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (ModelMix.hasToolInteraction(messages[j]) && messages[j].role === 'assistant') {
                        foundToolCall = true;
                        break;
                    }
                }
                if (!foundToolCall) {
                    // Skip orphaned tool results
                    continue;
                }
            }
            filteredMessages.push(messages[i]);
        }

        return filteredMessages.map(message => {
            if (message.role === 'tool') {
                // Handle new format: tool_call_id directly on message
                if (message.tool_call_id) {
                    return {
                        role: "user",
                        content: [{
                            type: "tool_result",
                            tool_use_id: message.tool_call_id,
                            content: message.content
                        }]
                    }
                }
                // Handle old format: content is an array
                return {
                    role: "user",
                    content: message.content.map(content => ({
                        type: "tool_result",
                        tool_use_id: content.tool_call_id,
                        content: content.content
                    }))
                }
            }

            // Handle messages with tool_calls (assistant messages that call tools)
            if (message.tool_calls) {
                const content = message.tool_calls.map(call => ({
                    type: 'tool_use',
                    id: call.id,
                    name: call.function.name,
                    input: JSON.parse(call.function.arguments)
                }));
                return { role: 'assistant', content };
            }

            // Handle content conversion for other messages
            if (message.content && Array.isArray(message.content)) {
                const content = message.content.filter(content => content !== null && content !== undefined).map(content => {
                    const neutralCache = content?.cache !== undefined
                        ? normalizeContentCache(content.cache)
                        : undefined;
                    if (neutralCache && content.cache_control !== undefined) {
                        throw new TypeError('Use either cache or cache_control on an Anthropic content block, not both.');
                    }
                    let converted = content;
                    if (content && content.type === 'function') {
                        converted = {
                            type: 'tool_use',
                            id: content.id,
                            name: content.function.name,
                            input: JSON.parse(content.function.arguments)
                        };
                    }
                    const sanitized = stripContentCacheMetadata(converted);
                    if (content.cache_control !== undefined) {
                        MixAnthropic.validateCacheControl(content.cache_control);
                        sanitized.cache_control = { ...content.cache_control };
                    } else if (neutralCache?.breakpoint) {
                        sanitized.cache_control = {
                            ...(config?._contentCacheControl || { type: 'ephemeral' })
                        };
                    }
                    return sanitized;
                });
                return { ...message, content };
            }

            return { ...message };
        });
    }

    getDefaultHeaders(customHeaders) {
        return super.getDefaultHeaders({
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            ...customHeaders
        });
    }

    extractDelta(data) {
        if (data.delta && data.delta.text) return data.delta.text;
        return '';
    }

    static extractToolCalls(data) {

        return data.content.map(item => {
            if (item.type === 'tool_use') {
                return {
                    id: item.id,
                    type: 'function',
                    function: {
                        name: item.name,
                        arguments: JSON.stringify(item.input)
                    }
                };
            }
            return null;
        }).filter(item => item !== null);
    }

    static extractMessage(data) {
        const content = Array.isArray(data?.content) ? data.content : [];
        const stopReason = data?.stop_reason;

        // Anthropic can return text in different positions depending on thinking/tool blocks.
        const textBlock = content.find(block => typeof block?.text === 'string' && block.text.trim().length > 0);
        if (textBlock) {
            return textBlock.text;
        }

        // A tool_use turn can legitimately contain no text blocks.
        if (stopReason === 'tool_use') {
            return '';
        }

        // Empty/non-text content is often due to safety refusal or token limits.
        const contentTypes = content.map(block => block?.type || 'unknown').join(', ') || 'none';

        if (stopReason === 'refusal') {
            throw new Error('Anthropic refused to process this request (content policy). Try different wording or a fallback model.');
        }
        if (!content.length) {
            throw new Error(`Anthropic returned empty content (stop_reason: ${stopReason ?? 'unknown'}).`);
        }
        throw new Error(`Anthropic content blocks are missing .text (stop_reason: ${stopReason ?? 'unknown'}, content_types: ${contentTypes}).`);
    }

    static extractThinkingBlock(data) {
        const content = Array.isArray(data?.content) ? data.content : [];
        return content.find(block => block?.type === 'thinking') || null;
    }

    static extractThink(data) {
        const block = MixAnthropic.extractThinkingBlock(data);
        // Preserve empty string: display "omitted" returns thinking: "" with a signature.
        return typeof block?.thinking === 'string' ? block.thinking : null;
    }

    static extractSignature(data) {
        const block = MixAnthropic.extractThinkingBlock(data);
        return typeof block?.signature === 'string' && block.signature
            ? block.signature
            : null;
    }

    static extractTokens(data) {
        // Anthropic format
        if (data.usage) {
            const cached = ModelMix.extractCacheTokens(data.usage);
            const cacheWrite5m = data.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
            const cacheWrite1h = data.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
            const cacheWrite = Math.max(
                ModelMix.extractCacheWriteTokens(data.usage),
                cacheWrite5m + cacheWrite1h
            );
            const input = (data.usage.input_tokens || 0) + cached + cacheWrite;
            const output = data.usage.output_tokens || 0;
            return ModelMix.normalizeTokenUsage({
                input,
                output,
                total: input + output,
                cached,
                cacheWrite,
                cacheWrite5m,
                cacheWrite1h
            });
        }
        return ModelMix.normalizeTokenUsage();
    }

    processResponse(response) {
        const data = response.data;
        return {
            message: MixAnthropic.extractMessage(data),
            think: MixAnthropic.extractThink(data),
            toolCalls: MixAnthropic.extractToolCalls(data),
            tokens: MixAnthropic.extractTokens(data),
            response: data,
            signature: MixAnthropic.extractSignature(data),
            // Replay Anthropic content blocks verbatim (including empty thinking).
            assistantMessage: Array.isArray(data?.content)
                ? { role: 'assistant', content: data.content }
                : undefined
        }
    }

    getOptionsTools(tools) {
        return MixAnthropic.getOptionsTools(tools);
    }

    static getOptionsTools(tools) {
        const options = {};
        const toolsArray = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                toolsArray.push({
                    name: item.name,
                    description: item.description,
                    input_schema: item.inputSchema
                });
            }
        }

        // Solo incluir tools si el array no está vacío
        if (toolsArray.length > 0) {
            options.tools = toolsArray;
        }

        return options;
    }
}

class MixMiniMax extends MixOpenAI {
    getDefaultConfig(customConfig) {

        if (!process.env.MINIMAX_API_KEY) {
            throw new Error('MiniMax API key not found. Please provide it in config or set MINIMAX_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.minimax.io/v1/chat/completions',
            apiKey: process.env.MINIMAX_API_KEY,
            ...customConfig
        });
    }

    extractDelta(data) {
        // MiniMax might send different formats during streaming
        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            return data.choices[0].delta.content;
        }
        return '';
    }
}

class MixMiMo extends MixOpenAI {
    getDefaultConfig(customConfig) {
        if (!process.env.MIMO_API_KEY) {
            throw new Error('MiMo API key not found. Please provide it in config or set MIMO_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.xiaomimimo.com/v1/chat/completions',
            apiKey: process.env.MIMO_API_KEY,
            ...customConfig
        });
    }

    getDefaultHeaders(customHeaders) {
        return {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': this.config.apiKey,
            ...customHeaders
        };
    }
}

class MixPerplexity extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.PPLX_API_KEY) {
            throw new Error('Perplexity API key not found. Please provide it in config or set PPLX_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.perplexity.ai/chat/completions',
            apiKey: process.env.PPLX_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {

        if (config.schema) {
            options.response_format = {
                type: 'json_schema',
                json_schema: { schema: config.schema }
            };
        }

        return super.create({ config, options });
    }
}

class MixOllama extends MixCustom {

    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'http://localhost:11434/api/chat',
            ...customConfig
        });
    }

    getDefaultOptions(customOptions) {
        return {
            options: customOptions,
        };
    }

    extractDelta(data) {
        if (data.message && data.message.content) return data.message.content;
        return '';
    }

    extractMessage(data) {
        return data.message.content.trim();
    }

    convertMessages(messages, config) {
        return MixOllama.convertMessages(messages, config);
    }

    static convertMessages(messages, config) {
        const content = config.system;
        messages = [{ role: 'system', content }, ...messages || []];

        return messages.map(entry => {
            let content = '';
            let images = [];

            entry.content.forEach(item => {
                if (item.type === 'text') {
                    content += item.text + ' ';
                } else if (item.type === 'image') {
                    images.push(item.source.data);
                }
            });

            return {
                role: entry.role,
                content: content.trim(),
                images: images
            };
        });
    }
}

class MixGrok extends MixOpenAI {
    getDefaultConfig(customConfig) {

        if (!process.env.XAI_API_KEY) {
            throw new Error('Grok API key not found. Please provide it in config or set XAI_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.x.ai/v1/chat/completions',
            apiKey: process.env.XAI_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (options.model === GROK420_REASONING || options.model === GROK420_NON_REASONING) {
            delete options.reasoning_effort;
        }
        return super.create({ config, options });
    }
}

class MixLambda extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.LAMBDA_API_KEY) {
            throw new Error('Lambda API key not found. Please provide it in config or set LAMBDA_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.lambda.ai/v1/chat/completions',
            apiKey: process.env.LAMBDA_API_KEY,
            ...customConfig
        });
    }
}

class MixLMStudio extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'http://localhost:1234/v1/chat/completions',
            ...customConfig
        });
    }

    create({ config = {}, options = {} } = {}) {
        if (config.schema) {
            options.response_format = {
                type: 'json_schema',
                json_schema: { schema: config.schema }
            };
        }
        return super.create({ config, options });
    }

    static extractThink(data) {
        const message = data.choices[0].message?.content?.trim() || '';

        // Check for LMStudio special tags
        const startTag = '<|channel|>analysis<|message|>';
        const endTag = '<|end|><|start|>assistant<|channel|>final<|message|>';

        const startIndex = message.indexOf(startTag);
        const endIndex = message.indexOf(endTag);

        if (startIndex !== -1 && endIndex !== -1) {
            // Extract content between the special tags
            const thinkContent = message.substring(startIndex + startTag.length, endIndex).trim();
            return thinkContent;
        }

        // Fall back to default extraction method
        return MixCustom.extractThink(data);
    }

    static extractMessage(data) {
        const message = data.choices[0].message?.content?.trim() || '';

        // Check for LMStudio special tags and extract final message
        const endTag = '<|end|><|start|>assistant<|channel|>final<|message|>';
        const endIndex = message.indexOf(endTag);

        if (endIndex !== -1) {
            // Return only the content after the final message tag
            return message.substring(endIndex + endTag.length).trim();
        }

        // Fall back to default extraction method
        return MixCustom.extractMessage(data);
    }

    processResponse(response) {
        return {
            message: MixLMStudio.extractMessage(response.data),
            think: MixLMStudio.extractThink(response.data),
            toolCalls: MixCustom.extractToolCalls(response.data),
            tokens: MixCustom.extractTokens(response.data),
            response: response.data
        };
    }
}

class MixGroq extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.GROQ_API_KEY) {
            throw new Error('Groq API key not found. Please provide it in config or set GROQ_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.groq.com/openai/v1/chat/completions',
            apiKey: process.env.GROQ_API_KEY,
            ...customConfig
        });
    }
}

class MixTogether extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.TOGETHER_API_KEY) {
            throw new Error('Together API key not found. Please provide it in config or set TOGETHER_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.together.xyz/v1/chat/completions',
            apiKey: process.env.TOGETHER_API_KEY,
            ...customConfig
        });
    }

    getDefaultOptions(customOptions) {
        return {
            stop: ["<|eot_id|>", "<|eom_id|>"],
            ...customOptions
        };
    }
}

class MixCerebras extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.CEREBRAS_API_KEY) {
            throw new Error('Together API key not found. Please provide it in config or set CEREBRAS_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.cerebras.ai/v1/chat/completions',
            apiKey: process.env.CEREBRAS_API_KEY,
            ...customConfig
        });
    }

    create({ config = {}, options = {} } = {}) {
        delete options.response_format;
        return super.create({ config, options });
    }
}

class MixFireworks extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.FIREWORKS_API_KEY) {
            throw new Error('Fireworks API key not found. Please provide it in config or set FIREWORKS_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.fireworks.ai/inference/v1/chat/completions',
            apiKey: process.env.FIREWORKS_API_KEY,
            ...customConfig
        });
    }
}

class MixNVIDIA extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.NVIDIA_API_KEY) {
            throw new Error('NVIDIA API key not found. Please provide it in config or set NVIDIA_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            apiKey: process.env.NVIDIA_API_KEY,
            ...customConfig
        });
    }
}

class MixGoogle extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            apiKey: process.env.GEMINI_API_KEY,
            ...customConfig
        });
    }

    getDefaultHeaders(customHeaders) {
        return {
            'Content-Type': 'application/json',
            ...customHeaders
        };
    }

    static convertMessages(messages, config) {
        return messages.map(message => {

            // Handle assistant messages with tool_calls (content is null)
            if (message.role === 'assistant' && message.tool_calls) {
                return {
                    role: 'model',
                    parts: message.tool_calls.map(toolCall => {
                        const part = {
                            functionCall: {
                                name: toolCall.function.name,
                                args: JSON.parse(toolCall.function.arguments)
                            }
                        };
                        if (toolCall.thought_signature) {
                            part.thoughtSignature = toolCall.thought_signature;
                        }
                        return part;
                    })
                }
            }

            // Handle new tool result format: tool_call_id and name directly on message
            if (message.role === 'tool' && message.name) {
                return {
                    role: 'user',
                    parts: [{
                        functionResponse: {
                            name: message.name,
                            response: {
                                output: message.content,
                            },
                        }
                    }]
                }
            }

            if (!Array.isArray(message.content)) return message;
            const role = (message.role === 'assistant' || message.role === 'tool') ? 'model' : 'user'

            if (message.role === 'tool') {
                // Handle old format: content is an array of {name, content}
                return {
                    role,
                    parts: message.content.map(content => ({
                        functionResponse: {
                            name: content.name,
                            response: {
                                output: content.content,
                            },
                        }
                    }))
                }
            }

            return {
                role,
                parts: message.content.map(content => {
                    if (content.type === 'text') {
                        return { text: content.text };
                    }

                    if (content.type === 'image') {
                        return {
                            inline_data: {
                                mime_type: content.source.media_type,
                                data: content.source.data
                            }
                        }
                    }

                    if (content.type === 'function') {
                        return {
                            functionCall: {
                                name: content.function.name,
                                args: JSON.parse(content.function.arguments)
                            }
                        }
                    }

                    return content;
                })
            }
        });

        // Merge consecutive user messages containing only functionResponse parts
        // Google requires all function responses for a turn in a single message
        return converted.reduce((acc, msg) => {
            if (acc.length > 0) {
                const prev = acc[acc.length - 1];
                if (prev.role === 'user' && msg.role === 'user' &&
                    prev.parts.every(p => p.functionResponse) &&
                    msg.parts.every(p => p.functionResponse)) {
                    prev.parts.push(...msg.parts);
                    return acc;
                }
            }
            acc.push(msg);
            return acc;
        }, []);
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Gemini API key not found. Please provide it in config or set GEMINI_API_KEY environment variable.');
        }

        const generateContentApi = options.stream ? 'streamGenerateContent' : 'generateContent';

        const fullUrl = `${this.config.url}/${options.model}:${generateContentApi}?key=${this.config.apiKey}`;


        const content = config.system;
        const systemInstruction = { parts: [{ text: content }] };

        options.messages = MixGoogle.convertMessages(options.messages);

        const generationConfig = {
            maxOutputTokens: options.max_tokens,
        }

        if (options.top_p) {
            generationConfig.topP = options.top_p;
        }

        // Thinking / effort (from unified config.effort or native options)
        if (options.thinkingConfig) {
            generationConfig.thinkingConfig = options.thinkingConfig;
        } else if (options.thinkingLevel != null || options.thinkingBudget != null) {
            generationConfig.thinkingConfig = {};
            if (options.thinkingLevel != null) {
                generationConfig.thinkingConfig.thinkingLevel = options.thinkingLevel;
            }
            if (options.thinkingBudget != null) {
                generationConfig.thinkingConfig.thinkingBudget = options.thinkingBudget;
            }
        }

        // Gemini does not support responseMimeType when function calling is used
        const hasTools = options.tools && options.tools.length > 0 &&
            options.tools.some(t => t.functionDeclarations && t.functionDeclarations.length > 0);

        if (!hasTools) {
            generationConfig.responseMimeType = "text/plain";
        }

        const payload = {
            generationConfig,
            systemInstruction,
            contents: options.messages,
            tools: options.tools
        };

        try {
            // debug level 4 (verbose): Full request details
            if (config.debug >= 4) {
                console.log('\n[REQUEST DETAILS - GOOGLE]');

                console.log('\n[CONFIG]');
                console.log(ModelMix.formatJSON(configForDebug(config)));

                console.log('\n[PAYLOAD]');
                console.log(ModelMix.formatJSON(payload));
            }

            if (options.stream) {
                throw new Error('Stream is not supported for Gemini');
            } else {
                return this.processResponse(await fetchJsonResponse(fullUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify(payload)
                }));
            }
        } catch (error) {
            throw this.handleError(error);
        }
    }

    processResponse(response) {
        return {
            message: MixGoogle.extractMessage(response.data),
            think: null,
            toolCalls: MixGoogle.extractToolCalls(response.data),
            tokens: MixGoogle.extractTokens(response.data),
            response: response.data
        }
    }

    static extractToolCalls(data) {
        return data.candidates?.[0]?.content?.parts?.map(part => {
            if (part.functionCall) {
                return {
                    id: part.functionCall.id,
                    type: 'function',
                    function: {
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args)
                    },
                    thought_signature: part.thoughtSignature || ""
                };
            }
            return null;
        }).filter(item => item !== null) || [];
    }

    static extractMessage(data) {
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    static extractTokens(data) {
        // Google Gemini format
        if (data.usageMetadata) {
            return ModelMix.normalizeTokenUsage({
                input: data.usageMetadata.promptTokenCount || 0,
                output: data.usageMetadata.candidatesTokenCount || 0,
                thinking: data.usageMetadata.thoughtsTokenCount || 0,
                total: data.usageMetadata.totalTokenCount,
                cached: ModelMix.extractCacheTokens(data.usageMetadata),
                cacheWrite: ModelMix.extractCacheWriteTokens(data.usageMetadata)
            });
        }
        return ModelMix.normalizeTokenUsage();
    }

    static stripUnsupportedSchemaProps(schema) {
        if (!schema || typeof schema !== 'object') return schema;
        const cleaned = { ...schema };
        delete cleaned.default;
        if (cleaned.properties) {
            cleaned.properties = Object.fromEntries(
                Object.entries(cleaned.properties).map(([key, value]) => [key, MixGoogle.stripUnsupportedSchemaProps(value)])
            );
        }
        if (cleaned.items) {
            cleaned.items = MixGoogle.stripUnsupportedSchemaProps(cleaned.items);
        }
        return cleaned;
    }

    static getOptionsTools(tools) {
        const functionDeclarations = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                functionDeclarations.push({
                    name: item.name,
                    description: item.description,
                    parameters: MixGoogle.stripUnsupportedSchemaProps(item.inputSchema)
                });
            }
        }

        const options = {};

        // Solo incluir tools si el array no está vacío
        if (functionDeclarations.length > 0) {
            options.tools = [{
                functionDeclarations
            }];
        }

        return options;
    }

    getOptionsTools(tools) {
        return MixGoogle.getOptionsTools(tools);
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixKimi, MixMiniMax, MixMiMo, MixOpenAI, MixOpenAIResponses, MixOpenAIWebSocket, MixOpenRouter, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle, MixFireworks, MixNVIDIA, normalizeEffort, applyUnifiedEffort, resolveProviderFamily };
