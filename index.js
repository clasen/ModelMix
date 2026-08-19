const fs = require('fs');
const { randomUUID } = require('crypto');
const ejs = require('ejs');
const fileType = require('file-type');
const detectFileTypeFromBuffer = fileType.fileTypeFromBuffer || fileType.fromBuffer;
const { inspect } = require('util');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { MCPToolsManager } = require('./mcp-tools');
const { fetchBinaryResponse } = require('./http-client');
const { isPlainObject } = require('./lib/object-utils');
const { normalizeContentCache } = require('./lib/content-cache');
const tokenUsage = require('./lib/token-usage');
const { parseChainModels } = require('./lib/model-chain');
const {
    validateTemplateData,
    validateTemplateDataKey,
    preprocessChoiceDirectives,
    createTemplateRenderContext
} = require('./lib/template-engine');
const {
    normalizeEffort,
    applyUnifiedEffort,
    resolveProviderFamily,
    resolveGrok420ModelKey
} = require('./effort');

let MixCustom;
let MixOpenAI;
let MixModeration;
let MixOpenAIResponses;
let MixOpenAIModeration;
let MixOpenAIWebSocket;
let MixOpenRouter;
let MixKimi;
let MixAnthropic;
let MixMiniMax;
let MixMiMo;
let MixPerplexity;
let MixOllama;
let MixGrok;
let MixLambda;
let MixLMStudio;
let MixGroq;
let MixTogether;
let MixCerebras;
let MixFireworks;
let MixNVIDIA;
let MixGoogle;
let ModerationMix;

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504, 529];

function getErrorStatusCode(error) {
    return error?.statusCode ?? error?.response?.status ?? error?.response?.statusCode ?? null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    chain(...modelSpecs) {
        const models = parseChainModels(modelSpecs);
        for (const { shortcut, effort } of models) {
            if (effort === undefined) {
                this[shortcut]();
            } else {
                this[shortcut]({ config: { effort } });
            }
        }
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

    static normalizeTokenUsage(usage = {}) {
        return tokenUsage.normalizeTokenUsage(usage);
    }

    static calculateCostBreakdown(modelKey, tokens) {
        return tokenUsage.calculateCostBreakdown(modelKey, tokens);
    }

    static calculateCacheMetrics(modelKey, tokens) {
        return tokenUsage.calculateCacheMetrics(modelKey, tokens);
    }

    static calculateCost(modelKey, tokens) {
        return tokenUsage.calculateCost(modelKey, tokens);
    }

    static extractCacheTokens(usage = {}) {
        return tokenUsage.extractCacheTokens(usage);
    }

    static extractCacheWriteTokens(usage = {}) {
        return tokenUsage.extractCacheWriteTokens(usage);
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

        if (this.models.some(model => model.key === key
            && model.provider.constructor === provider.constructor)) {
            return this;
        }

        if (this.messages.length > 0) {
            throw new Error("Cannot add models after message generation has started.");
        }

        this.models.push({ key, provider });
        return this;
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
        if (mix.openrouter) this.attach('openai/gpt-oss-120b', new MixOpenRouter({ options, config }));
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
    gemini31pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3.1-pro-preview', new MixGoogle({ options, config }));
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

    qwen35397b({ options = {}, config = {} } = {}) {
        return this.attach('qwen/qwen3.5-397b-a17b', new MixOpenRouter({ options, config }));
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

    qwen38max({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/qwen3p8-2p4t-a95b', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('qwen/qwen3.8-max', new MixOpenRouter({ options, config }));
        return this;
    }

    hermes470b({ options = {}, config = {} } = {}) {
        return this.attach('nousresearch/hermes-4-70b', new MixOpenRouter({ options, config }));
    }

    hermes4405b({ options = {}, config = {} } = {}) {
        return this.attach('nousresearch/hermes-4-405b', new MixOpenRouter({ options, config }));
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
        if (mix.fireworks) this.attach('accounts/fireworks/models/deepseek-v4-pro-0813', new MixFireworks({ options, config }));
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

    _mergeRequestConfig(config = {}) {
        return {
            ...this.config,
            ...config,
            retry: {
                ...(this.config.retry || {}),
                ...(config.retry || {})
            }
        };
    }

    _requirePreparedMessages(messages) {
        if (messages.length === 0) {
            throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
        }
    }

    _renderSystem(config, providerConfig, systemSuffix, templateContext) {
        const systemTemplate = this._resolveSystemTemplate(config, providerConfig);
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
        return templateContext.renderedSystems.get(systemCacheKey) + systemSuffix;
    }

    async _executePlugins({
        config,
        options,
        systemSuffix,
        outputMode,
        templateContext,
        executionMetadata,
        isRootExecution
    }) {
        const preparedMessages = await this.prepareMessages(templateContext);
        this._requirePreparedMessages(preparedMessages);

        const request = {
            system: this._renderSystem(config, {}, systemSuffix, templateContext),
            messages: clonePluginValue(preparedMessages),
            options: clonePluginValue({ ...this.options, ...options }),
            config: clonePluginValue(this._mergeRequestConfig(config)),
            outputMode
        };
        const metadata = executionMetadata || {
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
                    _executionMetadata: metadata,
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
                execution: Object.freeze({ ...metadata }),
                invoke: input => this._invokeChild(input, metadata)
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

    _createProviderAttempt({
        currentModel,
        preparedMessages,
        config,
        options,
        finalConfig,
        pluginRequest,
        systemSuffix,
        templateContext
    }) {
        const provider = currentModel.provider;
        const currentOptions = {
            ...this.options,
            messages: preparedMessages,
            ...provider.options,
            ...provider.getOptionsTools(this.tools),
            ...options,
            ...(pluginRequest?.options || {}),
            model: currentModel.key
        };
        const currentConfig = pluginRequest
            ? {
                ...provider.config,
                ...pluginRequest.config,
                retry: {
                    ...(provider.config?.retry || {}),
                    ...(pluginRequest.config.retry || {})
                }
            }
            : {
                ...finalConfig,
                ...provider.config,
                ...config,
                retry: {
                    ...(finalConfig.retry || {}),
                    ...(provider.config?.retry || {}),
                    ...(config.retry || {})
                }
            };

        currentConfig.system = pluginRequest
            ? pluginRequest.system
            : this._renderSystem(config, provider.config, systemSuffix, templateContext);

        const resolvedModelKey = resolveGrok420ModelKey(
            currentModel.key,
            currentConfig.effort,
            currentOptions
        );
        currentOptions.model = resolvedModelKey;
        applyUnifiedEffort(
            currentOptions,
            currentConfig,
            resolveProviderFamily(provider),
            resolvedModelKey
        );

        return { provider, currentOptions, currentConfig, resolvedModelKey };
    }

    _logProviderAttempt({ attempt, originalIndex, provider, currentConfig, resolvedModelKey, preparedMessages }) {
        if (currentConfig.debug < 1) return;

        const isPrimary = attempt === 0;
        const prefix = isPrimary ? '→' : '↻';
        const suffix = isPrimary
            ? (currentConfig.roundRobin ? ` (round-robin #${originalIndex + 1})` : '')
            : ' (fallback)';
        const providerName = provider.constructor.name.replace(/^Mix/, '').toLowerCase();
        const effort = currentConfig.effort === undefined ? '' : `@${currentConfig.effort}`;
        const header = `\n${prefix} [${providerName}:${resolvedModelKey}${effort}] #${originalIndex + 1}${suffix}`;

        if (currentConfig.debug >= 2) {
            console.log(`${header}\n${ModelMix.formatInputSummary(preparedMessages, currentConfig.system, currentConfig.debug)}`);
        } else {
            console.log(header);
        }
    }

    async _invokeProviderWithRetry(provider, currentOptions, currentConfig, resolvedModelKey) {
        if (currentOptions.stream && this.streamCallback) {
            provider.streamCallback = this.streamCallback;
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
        while (true) {
            const startTime = Date.now();
            try {
                const result = await provider.create({ options: currentOptions, config: currentConfig });
                return { result, elapsedMs: Date.now() - startTime };
            } catch (error) {
                const statusCode = getErrorStatusCode(error);
                if (attempt >= retries || !retryableStatusCodes.has(statusCode)) throw error;

                if (currentConfig.debug >= 1) {
                    console.log(`↺ Retrying [${resolvedModelKey}] due to status ${statusCode} (${attempt + 2}/${retries + 1})`);
                }
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                await sleep(delay);
                attempt += 1;
            }
        }
    }

    _enrichResultTokens(result, resolvedModelKey, elapsedMs) {
        if (!result.tokens) return;

        const normalizedTokens = ModelMix.normalizeTokenUsage(result.tokens);
        const costBreakdown = ModelMix.calculateCostBreakdown(resolvedModelKey, normalizedTokens);
        const cacheMetrics = ModelMix.calculateCacheMetrics(resolvedModelKey, normalizedTokens);
        result.tokens = {
            ...result.tokens,
            ...normalizedTokens,
            ...cacheMetrics,
            cost: tokenUsage.hasModelPricing(resolvedModelKey) ? costBreakdown.total : 0,
            costBreakdown
        };
        const elapsedSec = elapsedMs / 1000;
        result.tokens.speed = elapsedSec > 0 ? Math.round(result.tokens.output / elapsedSec) : 0;
    }

    async _continueToolCalls(result, pluginRequest, execution) {
        const toolMessages = pluginRequest
            ? clonePluginValue(pluginRequest.messages)
            : this.messages;
        if (result.assistantMessage) {
            toolMessages.push(result.assistantMessage);
        } else if (result.message) {
            if (result.signature) {
                toolMessages.push({
                    role: 'assistant',
                    content: [{
                        type: 'thinking',
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
            toolMessages.push({ role: 'assistant', content: null, tool_calls: result.toolCalls });
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

        return this.execute({
            ...execution,
            _pluginRequest: pluginRequest
                ? { ...pluginRequest, messages: toolMessages }
                : null
        });
    }

    _logProviderSuccess(result, currentConfig) {
        if (currentConfig.debug === 1) console.log('✓ Success');

        if (currentConfig.debug >= 2) {
            const tokenInfo = result.tokens
                ? ` ${result.tokens.input} → ${result.tokens.output} tok`
                    + (result.tokens.cached ? ` (cached:${result.tokens.cached})` : '')
                    + (result.tokens.speed ? ` | ${result.tokens.speed} t/s` : '')
                    + (result.tokens.cost != null ? ` $${result.tokens.cost.toFixed(4)}` : '')
                : '';
            console.log(`✓${tokenInfo}\n${ModelMix.formatOutputSummary(result, currentConfig.debug).trim()}`);
        }

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
    }

    _recordProviderResult(result) {
        this.lastRaw = result;
        if (this.config.max_history === 0) {
            this.messages = [];
        } else if (result.message) {
            if (result.assistantMessage) {
                this.messages.push(result.assistantMessage);
            } else if (result.signature) {
                this.messages.push({
                    role: 'assistant',
                    content: [{
                        type: 'thinking',
                        thinking: result.think ?? '',
                        signature: result.signature
                    }, {
                        type: 'text',
                        text: result.message
                    }]
                });
            } else {
                this._addText(result.message, { role: 'assistant' });
            }
        }
    }

    _logProviderFailure(error, currentModelKey, attempt, modelsToTry) {
        log.warn(`Model ${currentModelKey} failed (Attempt #${attempt + 1}/${modelsToTry.length}).`);
        if (error.message) log.warn(`Error: ${error.message}`);
        if (error.statusCode) log.warn(`Status Code: ${error.statusCode}`);
        if (error.details) log.warn(`Details:\n${ModelMix.formatJSON(error.details)}`);

        if (attempt === modelsToTry.length - 1) {
            console.error(`All ${modelsToTry.length} model(s) failed. Throwing last error from ${currentModelKey}.`);
            throw error;
        }
        log.info(`-> Proceeding to next model: ${modelsToTry[attempt + 1].model.key}`);
    }

    async _executeProviderChain({
        config,
        options,
        systemSuffix,
        outputMode,
        templateContext,
        pluginRequest,
        executionMetadata,
        pluginsApplied
    }) {
        const preparedMessages = pluginRequest
            ? pluginRequest.messages
            : await this.prepareMessages(templateContext);
        this._requirePreparedMessages(preparedMessages);

        const finalConfig = pluginRequest ? pluginRequest.config : this._mergeRequestConfig(config);
        const modelsToTry = this.models.map((model, index) => ({ model, index }));
        if (finalConfig.roundRobin && this.models.length > 1) {
            this.models.push(this.models.shift());
        }

        let lastError = null;
        for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
            const { model: currentModel, index: originalIndex } = modelsToTry[attempt];
            const providerAttempt = this._createProviderAttempt({
                currentModel,
                preparedMessages,
                config,
                options,
                finalConfig,
                pluginRequest,
                systemSuffix,
                templateContext
            });
            this._logProviderAttempt({
                attempt,
                originalIndex,
                preparedMessages,
                ...providerAttempt
            });

            try {
                const { result, elapsedMs } = await this._invokeProviderWithRetry(
                    providerAttempt.provider,
                    providerAttempt.currentOptions,
                    providerAttempt.currentConfig,
                    providerAttempt.resolvedModelKey
                );
                this._enrichResultTokens(result, providerAttempt.resolvedModelKey, elapsedMs);

                if (result.toolCalls && result.toolCalls.length > 0) {
                    return this._continueToolCalls(result, pluginRequest, {
                        options,
                        config,
                        systemSuffix,
                        outputMode,
                        _templateContext: templateContext,
                        _executionMetadata: executionMetadata,
                        _pluginsApplied: pluginsApplied
                    });
                }

                this._logProviderSuccess(result, providerAttempt.currentConfig);
                this._recordProviderResult(result);
                return result;
            } catch (error) {
                lastError = error;
                this._logProviderFailure(error, currentModel.key, attempt, modelsToTry);
            }
        }

        log.error('Fallback logic completed without success or throwing the final error.');
        throw lastError || new Error('Failed to get response from any model, and no specific error was caught.');
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
            return this._executePlugins({
                config,
                options,
                systemSuffix,
                outputMode,
                templateContext,
                executionMetadata: _executionMetadata,
                isRootExecution
            });
        }

        if (!this.models || this.models.length === 0) {
            throw new Error('No models specified. Use methods like .gpt5(), .sonnet46() first.');
        }

        const execution = this.limiter.schedule(() => this._executeProviderChain({
            config,
            options,
            systemSuffix,
            outputMode,
            templateContext,
            pluginRequest: _pluginRequest,
            executionMetadata: _executionMetadata,
            pluginsApplied: _pluginsApplied
        }));

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

({
    MixCustom,
    MixOpenAI,
    MixModeration,
    MixOpenAIResponses,
    MixOpenAIModeration,
    MixOpenAIWebSocket,
    MixOpenRouter,
    MixKimi,
    MixAnthropic,
    MixMiniMax,
    MixMiMo,
    MixPerplexity,
    MixOllama,
    MixGrok,
    MixLambda,
    MixLMStudio,
    MixGroq,
    MixTogether,
    MixCerebras,
    MixFireworks,
    MixNVIDIA,
    MixGoogle,
    ModerationMix
} = require('./lib/providers')({
    ModelMix,
    log
}));

module.exports = { MixCustom, ModelMix, ModerationMix, MixModeration, MixAnthropic, MixKimi, MixMiniMax, MixMiMo, MixOpenAI, MixOpenAIResponses, MixOpenAIModeration, MixOpenAIWebSocket, MixOpenRouter, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle, MixFireworks, MixNVIDIA, normalizeEffort, applyUnifiedEffort, resolveProviderFamily };
