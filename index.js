const fs = require('fs');
const { randomUUID } = require('crypto');
const ejs = require('ejs');
const fileType = require('file-type');
const detectFileTypeFromBuffer = fileType.fileTypeFromBuffer || fileType.fromBuffer;
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');
const parseJsonResponse = require('./lib/parse-json-response');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { MCPToolsManager } = require('./mcp-tools');
const { fetchBinaryResponse } = require('./http-client');
const {
    assertAbortSignal,
    assertNoStoredSignal,
    raceWithSignal,
    sleepWithSignal,
    throwIfAborted
} = require('./lib/abort-signal');
const { isPlainObject } = require('./lib/object-utils');
const { normalizeContentCache } = require('./lib/content-cache');
const tokenUsage = require('./lib/token-usage');
const debugFormat = require('./lib/debug-format');
const { hasToolInteraction } = require('./lib/messages');
const { assertProviderApiKeys } = require('./lib/provider-api-key');
const { runWithStreamCallback } = require('./lib/stream-context');
const { listModelShortcuts, resolveModelShortcut } = require('./lib/model-registry');
const { parseChainModels, resolveChainModel } = require('./lib/model-chain');
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
const {
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
    MixDeepSeek,
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
    MixGoogle
} = require('./lib/providers');


const DEFAULT_RETRYABLE_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504, 529];
const DEFAULT_MAX_TOOL_ROUNDS = 25;
const DEFAULT_MIX = { openrouter: false, together: false, lambda: false };

function getErrorStatusCode(error) {
    return error?.statusCode ?? error?.response?.status ?? error?.response?.statusCode ?? null;
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

    constructor({ options = {}, config = {}, mix = {} } = {}, { limiter = null } = {}) {
        assertNoStoredSignal(options, 'options');
        assertNoStoredSignal(config, 'config');
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
            max_tool_rounds: DEFAULT_MAX_TOOL_ROUNDS, // tool call rounds per request, -1=unlimited
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
        // Only flags set by the caller override shortcut defaults; this.mix also shows library defaults.
        this._mixOverrides = { ...mix };
        this.mix = { ...DEFAULT_MIX, ...mix };

        // One slot per provider request round; derived instances share it by default.
        this.limiter = limiter || new Bottleneck(this.config.bottleneck);

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
        const models = parseChainModels(modelSpecs)
            .flatMap(model => resolveChainModel(this, model));
        return this._attachModels(models);
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

    _sharedLimiter(config) {
        return Object.prototype.hasOwnProperty.call(config, 'bottleneck') ? null : this.limiter;
    }

    new({ options = {}, config = {}, mix = {} } = {}) {
        const hasSystemOverride = Object.prototype.hasOwnProperty.call(config, 'system');
        const instance = new ModelMix({
            options: { ...this.options, ...options },
            config: { ...this.config, ...config },
            mix: { ...this._mixOverrides, ...mix }
        }, { limiter: this._sharedLimiter(config) });
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

    async _invokeChild(input, parentExecution, signal) {
        if (!isPlainObject(input)) {
            throw new TypeError('Child invocation must be a plain object.');
        }
        if (input.history !== undefined && input.history !== false) {
            throw new TypeError('Child invocations currently require history: false.');
        }
        if (Object.prototype.hasOwnProperty.call(input, 'signal')) {
            throw new TypeError('Child invocations inherit the parent AbortSignal and cannot override it.');
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
        assertNoStoredSignal(options, 'options');
        assertNoStoredSignal(config, 'config');
        throwIfAborted(signal);
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
            ? new ModelMix({ options, config, mix }, { limiter: this._sharedLimiter(config) })
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
        const result = await child._execute({
            outputMode,
            signal,
            executionMetadata: execution
        });
        return { ...result, execution };
    }

    static formatJSON(obj) {
        return debugFormat.formatJSON(obj);
    }

    static formatMessage(message) {
        return debugFormat.formatMessage(message);
    }

    // debug logging helpers
    static truncate(str, maxLen = 1000) {
        return debugFormat.truncate(str, maxLen);
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
        return debugFormat.formatInputSummary(messages, system, debug);
    }

    static formatOutputSummary(result, debug) {
        return debugFormat.formatOutputSummary(result, debug);
    }

    attach(key, provider) {
        return this._attachModels([{ key, provider }]);
    }

    /** Hook for subclasses that accept only some provider types. */
    _assertAttachable(provider) {
    }

    /**
     * Attach { key, provider } entries atomically: every entry is validated and every
     * required API key is checked before any model is added.
     */
    _attachModels(models) {
        const pending = [];
        for (const { key, provider } of models) {
            assertNoStoredSignal(provider?.options, 'provider.options');
            assertNoStoredSignal(provider?.config, 'provider.config');
            this._assertAttachable(provider);

            const isAttached = model => model.key === key
                && model.provider.constructor === provider.constructor;
            if (this.models.some(isAttached) || pending.some(isAttached)) continue;
            pending.push({ key, provider });
        }
        if (pending.length === 0) return this;

        if (this.messages.length > 0) {
            throw new Error("Cannot add models after message generation has started.");
        }
        assertProviderApiKeys(pending);

        this.models.push(...pending);
        return this;
    }

    lmstudio(model = 'lmstudio', { options = {}, config = {} } = {}) {
        return this.attach(model, new MixLMStudio({ options, config }));
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

    _addImageSource(source, { role = "user", cache } = {}) {
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

    addImageFromBuffer(buffer, { role = "user", cache } = {}) {
        return this._addImageSource({ type: "buffer", data: buffer }, { role, cache });
    }

    addImage(filePath, { role = "user", cache } = {}) {
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Image file not found: ${filePath}`);
        }

        return this._addImageSource({ type: "file", data: filePath }, { role, cache });
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

        return this._addImageSource(source, { role, cache });
    }

    async processImages(signal) {
        assertAbortSignal(signal);
        const preparedContent = [];
        for (const message of this.messages) {
            if (!Array.isArray(message.content)) continue;
            const nextContent = [];

            for (const content of message.content) {
                if (content.type !== 'image' || content.source.type === 'base64') {
                    nextContent.push(content);
                    continue;
                }

                try {
                    let buffer, mimeType;

                    switch (content.source.type) {
                        case 'url':
                            const response = await fetchBinaryResponse(content.source.data, { signal });
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

                    throwIfAborted(signal);

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

                    nextContent.push({
                        ...content,
                        source: {
                            type: "base64",
                            media_type: mimeType,
                            data: buffer.toString('base64')
                        }
                    });

                } catch (error) {
                    throwIfAborted(signal);
                    console.error(`Error processing image:`, error);
                }
            }
            preparedContent.push({ message, content: nextContent });
        }
        throwIfAborted(signal);
        for (const prepared of preparedContent) prepared.message.content = prepared.content;
    }

    async message(signal) {
        let raw = await this.execute({ options: { stream: false }, outputMode: 'message', signal });
        return raw.message;
    }

    async json(schemaExample = null, schemaDescription = {}, { type = 'json_object', addExample = false, addSchema = true, addNote = false } = {}, signal) {
        assertAbortSignal(signal);

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
        const { message } = await this.execute({ options, config, systemSuffix, outputMode: 'json', signal });
        let parsed;
        try {
            parsed = parseJsonResponse(message);
        } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            parsed = JSON.parse(this._extractBlock(message));
        }
        return isArrayWrap ? parsed.out : parsed;
    }

    _extractBlock(response) {
        const block = response.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return block ? block[1].trim() : response.trim();
    }

    async block({ addSystemExtra = true } = {}, signal) {
        assertAbortSignal(signal);
        const systemSuffix = addSystemExtra
            ? "\nReturn the result of the task between triple backtick block code tags ```"
            : '';
        const { message } = await this.execute({
            options: { stream: false },
            systemSuffix,
            outputMode: 'block',
            signal
        });
        return this._extractBlock(message);
    }

    async raw(signal) {
        return this.execute({ options: { stream: false }, outputMode: 'raw', signal });
    }

    async stream(callback, signal) {
        assertAbortSignal(signal);
        return this._execute({ options: { stream: true }, outputMode: 'stream', signal, streamCallback: callback });
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
        return hasToolInteraction(message);
    }

    groupByRoles(messages) {
        return messages.reduce((acc, currentMessage, index) => {
            // Don't group tool messages or assistant messages with tool_calls
            // Each tool response must be separate with its own tool_call_id
            const shouldNotGroup = ModelMix.hasToolInteraction(currentMessage);

            if (index === 0 || currentMessage.role !== messages[index - 1].role || shouldNotGroup) {
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

    async prepareMessages(renderContext = createTemplateRenderContext(() => this._choiceRandom()), signal) {
        await this.processImages(signal);

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

    async _executePlugins(execution) {
        const { config, options, signal, systemSuffix, outputMode, templateContext } = execution;
        const preparedMessages = await this.prepareMessages(templateContext, signal);
        this._requirePreparedMessages(preparedMessages);

        const request = {
            system: this._renderSystem(config, {}, systemSuffix, templateContext),
            messages: clonePluginValue(preparedMessages),
            tools: [],
            options: clonePluginValue({ ...this.options, ...options }),
            config: clonePluginValue(this._mergeRequestConfig(config)),
            outputMode
        };
        const metadata = execution.executionMetadata || {
            executionId: randomUUID(),
            parentExecutionId: null,
            depth: 0
        };
        let providerInvoked = false;

        const dispatch = async index => {
            if (index === this.plugins.length) {
                providerInvoked = true;
                return this._executeProviderChain({
                    ...execution,
                    pluginRequest: request,
                    executionMetadata: metadata
                });
            }

            throwIfAborted(signal);
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
                signal,
                invoke: input => this._invokeChild(input, metadata, signal)
            };
            const result = await plugin.execute(context, next);
            throwIfAborted(signal);
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
        const tools = pluginRequest?.tools.length ? {
            ...this.tools,
            local: [...(this.tools.local || []), ...pluginRequest.tools.map(entry => entry.tool)]
        } : this.tools;
        const toolOptions = provider.getOptionsTools(tools);
        const currentOptions = {
            ...this.options,
            messages: preparedMessages,
            ...provider.options,
            ...toolOptions,
            ...options,
            ...(pluginRequest?.options || {}),
            model: currentModel.key
        };
        if (pluginRequest?.tools.length && currentOptions.tools !== toolOptions.tools) {
            if (!Array.isArray(currentOptions.tools)) {
                throw new TypeError('Request options.tools must be an array when using plugin tools.');
            }
            currentOptions.tools = [...(toolOptions.tools || []), ...currentOptions.tools];
            const names = new Set();
            for (const tool of currentOptions.tools) {
                for (const definition of tool.functionDeclarations || [tool.function || tool]) {
                    if (!definition.name) continue;
                    if (names.has(definition.name)) throw new Error(`Duplicate tool name: ${definition.name}`);
                    names.add(definition.name);
                }
            }
        }
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
        assertNoStoredSignal(currentOptions, 'options');
        assertNoStoredSignal(currentConfig, 'config');

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

    async _invokeProviderWithRetry(provider, currentOptions, currentConfig, resolvedModelKey, signal, streamCallback) {
        const onStream = currentOptions.stream && streamCallback ? streamCallback : undefined;
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
                throwIfAborted(signal);
                const result = await runWithStreamCallback(onStream, () => provider.create({
                    options: currentOptions,
                    config: currentConfig,
                    signal
                }));
                throwIfAborted(signal);
                return { result, elapsedMs: Date.now() - startTime };
            } catch (error) {
                throwIfAborted(signal);
                const statusCode = getErrorStatusCode(error);
                if (attempt >= retries || !retryableStatusCodes.has(statusCode)) throw error;

                if (currentConfig.debug >= 1) {
                    console.log(`↺ Retrying [${resolvedModelKey}] due to status ${statusCode} (${attempt + 2}/${retries + 1})`);
                }
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                await sleepWithSignal(delay, signal);
                attempt += 1;
            }
        }
    }

    _enrichResultTokens(result, resolvedModelKey, elapsedMs, provider) {
        if (!result.tokens) return;

        const normalizedTokens = ModelMix.normalizeTokenUsage(result.tokens);
        const costBreakdown = ModelMix.calculateCostBreakdown(resolvedModelKey, normalizedTokens);
        const cacheMetrics = ModelMix.calculateCacheMetrics(resolvedModelKey, normalizedTokens);
        const reportedCost = provider.getReportedCost?.(result.response);
        result.tokens = {
            ...result.tokens,
            ...normalizedTokens,
            ...cacheMetrics,
            cost: Number.isFinite(reportedCost) && reportedCost >= 0 ? reportedCost : costBreakdown.total,
            costBreakdown
        };
        const elapsedSec = elapsedMs / 1000;
        result.tokens.speed = elapsedSec > 0 ? Math.round(result.tokens.output / elapsedSec) : 0;
    }

    /** Append the assistant tool call turn and tool results; returns the next plugin request. */
    async _appendToolResults(result, pluginRequest, signal, pluginTools) {
        const toolMessages = pluginRequest
            ? clonePluginValue(pluginRequest.messages)
            : clonePluginValue(this.messages);
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
        const toolResults = await this.processToolCalls(result.toolCalls, signal, pluginTools);
        for (const toolResult of toolResults) {
            toolMessages.push({
                role: 'tool',
                tool_call_id: toolResult.tool_call_id,
                name: toolResult.name,
                content: toolResult.content
            });
        }
        this.messages = toolMessages;
        return pluginRequest ? { ...pluginRequest, messages: toolMessages } : null;
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

    _registerPluginTools(pluginRequest) {
        if (!Array.isArray(pluginRequest.tools)) {
            throw new TypeError('Plugin request tools must be an array.');
        }
        const pluginTools = new MCPToolsManager();
        const names = new Set(Object.values(this.tools).flat().map(tool => tool.name));
        for (const entry of pluginRequest.tools) {
            if (!isPlainObject(entry) || !isPlainObject(entry.tool)) {
                throw new TypeError('Plugin request tools must contain { tool, callback }.');
            }
            if (names.has(entry.tool.name)) {
                throw new Error(`Duplicate tool name: ${entry.tool.name}`);
            }
            pluginTools.registerTool(entry.tool, entry.callback);
            names.add(entry.tool.name);
        }
        return pluginTools;
    }

    /** Run the fallback chain, then execute requested tools and repeat until the model answers. */
    async _executeProviderChain(execution) {
        if (!this.models || this.models.length === 0) {
            throw new Error('No models specified. Use methods like .gpt5mini(), .sonnet5() first.');
        }

        let { pluginRequest } = execution;
        const pluginTools = pluginRequest ? this._registerPluginTools(pluginRequest) : null;
        const finalConfig = pluginRequest ? pluginRequest.config : this._mergeRequestConfig(execution.config);
        const maxToolRounds = finalConfig.max_tool_rounds ?? DEFAULT_MAX_TOOL_ROUNDS;
        let originalMessages = null;

        try {
            for (let toolRound = 0; ; toolRound++) {
                // One limiter slot per round (fallbacks and retries included). Tools run
                // outside the slot, so tool callbacks and nested ModelMix calls never
                // wait on a slot their caller holds.
                const result = await this.limiter.schedule(() => {
                    throwIfAborted(execution.signal);
                    return this._executeProviderRound({ ...execution, pluginRequest });
                });
                if (!result.toolCalls || result.toolCalls.length === 0) {
                    this._recordProviderResult(result);
                    return result;
                }
                if (maxToolRounds >= 0 && toolRound >= maxToolRounds) {
                    const error = new Error(`Tool call limit reached: the model requested tools after ${toolRound} round(s) (config.max_tool_rounds = ${maxToolRounds}).`);
                    error.code = 'MAX_TOOL_ROUNDS';
                    error.toolCalls = result.toolCalls;
                    throw error;
                }
                originalMessages ??= this.messages;
                pluginRequest = await this._appendToolResults(result, pluginRequest, execution.signal, pluginTools);
            }
        } catch (error) {
            if (execution.signal?.aborted && originalMessages) this.messages = originalMessages;
            throw error;
        }
    }

    /** One request through the fallback chain; returns the first successful provider result. */
    async _executeProviderRound({
        config,
        options,
        signal,
        systemSuffix,
        templateContext,
        pluginRequest,
        streamCallback
    }) {
        const preparedMessages = pluginRequest
            ? pluginRequest.messages
            : await this.prepareMessages(templateContext, signal);
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
            debugFormat.logProviderAttempt({
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
                    providerAttempt.resolvedModelKey,
                    signal,
                    streamCallback
                );
                this._enrichResultTokens(result, providerAttempt.resolvedModelKey, elapsedMs, providerAttempt.provider);

                if (!result.toolCalls || result.toolCalls.length === 0) {
                    debugFormat.logProviderSuccess(result, providerAttempt.currentConfig);
                }
                return result;
            } catch (error) {
                throwIfAborted(signal);
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
        signal,
        systemSuffix = '',
        outputMode = 'raw'
    } = {}) {
        return this._execute({ config, options, signal, systemSuffix, outputMode });
    }

    /**
     * Root of one execution. Per-request state (stream callback, template renders,
     * plugin metadata) travels in the execution object instead of on the instance
     * or on shared providers.
     */
    async _execute({
        config = {},
        options = {},
        signal,
        systemSuffix = '',
        outputMode = 'raw',
        streamCallback = null,
        executionMetadata = null
    } = {}) {
        assertAbortSignal(signal);
        assertNoStoredSignal(this.config, 'config');
        assertNoStoredSignal(this.options, 'options');
        assertNoStoredSignal(config, 'config');
        assertNoStoredSignal(options, 'options');
        for (const model of this.models) {
            assertNoStoredSignal(model.provider?.config, 'provider.config');
            assertNoStoredSignal(model.provider?.options, 'provider.options');
        }
        if (this.plugins.length === 0 && (!this.models || this.models.length === 0)) {
            throw new Error('No models specified. Use methods like .gpt5mini(), .sonnet5() first.');
        }

        const templateContext = createTemplateRenderContext(() => this._choiceRandom());
        const execution = {
            config,
            options,
            signal,
            systemSuffix,
            outputMode,
            streamCallback,
            templateContext,
            executionMetadata,
            pluginRequest: null
        };
        const run = this.plugins.length > 0
            ? this._executePlugins(execution)
            : this._executeProviderChain(execution);

        const result = await raceWithSignal(run, signal);
        throwIfAborted(signal);
        this._commitTemplateRenderContext(templateContext);
        return result;
    }

    async processToolCalls(toolCalls, signal, pluginTools) {
        assertAbortSignal(signal);
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
                if (pluginTools?.hasTool(toolName) || this.mcpToolsManager.hasTool(toolName)) {
                    const manager = pluginTools?.hasTool(toolName) ? pluginTools : this.mcpToolsManager;
                    const response = await manager.executeTool(toolName, toolArgs, signal);
                    throwIfAborted(signal);
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
                    }, undefined, signal ? { signal } : undefined);
                    throwIfAborted(signal);

                    result.push({
                        name: toolName,
                        tool_call_id: toolId,
                        content: response.content.map(item => item.text).join("\n")
                    });
                }
            } catch (error) {
                throwIfAborted(signal);
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

for (const shortcut of listModelShortcuts()) {
    ModelMix.prototype[shortcut] = function (args = {}) {
        return this._attachModels(resolveModelShortcut(shortcut, args, this._mixOverrides));
    };
}

class ModerationMix extends ModelMix {
    static new(setup = {}) {
        return new ModerationMix(setup);
    }

    new({ options = {}, config = {} } = {}) {
        return new ModerationMix({
            options: { ...this.options, ...options },
            config: { ...this.config, ...config }
        }, { limiter: this._sharedLimiter(config) });
    }

    _assertAttachable(provider) {
        if (!(provider instanceof MixModeration)) {
            throw new Error('ModerationMix only accepts moderation providers.');
        }
    }

    openai({ options = {}, config = {} } = {}) {
        return this.attach('omni-moderation-latest', new MixOpenAIModeration({ options, config }));
    }

    async message() {
        throw new Error('ModerationMix does not generate messages. Use raw() and read result.moderation.');
    }

    async json() {
        throw new Error('ModerationMix does not generate JSON. Use raw() and read result.moderation.');
    }

    async block() {
        throw new Error('ModerationMix does not generate blocks. Use raw() and read result.moderation.');
    }

    async stream() {
        throw new Error('ModerationMix does not support streaming. Use raw().');
    }
}

module.exports = { MixCustom, ModelMix, ModerationMix, MixModeration, MixAnthropic, MixKimi, MixMiniMax, MixMiMo, MixDeepSeek, MixOpenAI, MixOpenAIResponses, MixOpenAIModeration, MixOpenAIWebSocket, MixOpenRouter, MixPerplexity, MixOllama, MixLambda, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle, MixFireworks, MixNVIDIA, normalizeEffort, applyUnifiedEffort, resolveProviderFamily };
