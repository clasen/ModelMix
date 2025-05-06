const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');

class ModelMixBuilder {
    constructor(args = {}) {
        this.models = []; // Array of { key: string, providerClass: class, options: {}, config: {} }
        this.mix = new ModelMix(args);
        this.handler = null;
        this._messageHandlerMethods = [ // Methods to delegate after handler creation
            'new', 'addText', 'addTextFromFile', 'setSystem', 'setSystemFromFile',
            'addImage', 'addImageFromUrl', 'message', 'json', 'block', 'raw',
            'stream', 'replace', 'replaceKeyFromFile'
        ];
    }

    addModel(key, providerClass, { options = {}, config = {} } = {}) {
        if (this.handler) {
            throw new Error("Cannot add models after message generation has started.");
        }

        // Attach provider if not already attached
        const providerInstance = new providerClass();
        const mainPrefix = providerInstance.config.prefix[0];
        if (!Object.values(this.mix.models).some(p => p.config.prefix.includes(mainPrefix))) {
            this.mix.attach(providerInstance);
        }

        if (!key) {
            throw new Error(`Model key is required when adding a model via ${providerClass.name}.`);
        }
        this.models.push({ key, providerClass, options, config });
        return this;
    }

    _getHandler() {
        if (!this.handler) {
            if (!this.mix || this.models.length === 0) {
                throw new Error("No models specified. Use methods like .gpt(), .sonnet() first.");
            }

            // Pass all model definitions. The create method will handle it appropriately
            this.handler = this.mix.createByDef(this.models);

            // Delegate chainable methods to the handler
            this._messageHandlerMethods.forEach(methodName => {
                if (typeof this.handler[methodName] === 'function') {
                    this[methodName] = (...args) => {
                        const result = this.handler[methodName](...args);
                        // Return the handler instance for chainable methods, otherwise the result
                        return result === this.handler ? this : result;
                    };
                }
            });
            // Special handling for async methods that return results
            ['message', 'json', 'block', 'raw', 'stream'].forEach(asyncMethodName => {
                if (typeof this.handler[asyncMethodName] === 'function') {
                    this[asyncMethodName] = async (...args) => {
                        return await this.handler[asyncMethodName](...args);
                    };
                }
            });
        }
        return this.handler;
    }

    // --- Instance methods for adding models (primary or fallback) ---
    // These will be mirrored by static methods on ModelMix
    gpt41({ model = 'gpt-4.1', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    gpt41mini({ model = 'gpt-4.1-mini', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    gpt41nano({ model = 'gpt-4.1-nano', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    gpt4o({ model = 'gpt-4o', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    o4mini({ model = 'o4-mini', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    o3({ model = 'o3', options = {}, config = {} } = {}) {
        return this.addModel(model, MixOpenAI, { options, config });
    }
    sonnet37({ model = 'claude-3-7-sonnet-20250219', options = {}, config = {} } = {}) {
        return this.addModel(model, MixAnthropic, { options, config });
    }
    sonnet37think({ model = 'claude-3-7-sonnet-20250219', options = {
        thinking: {
            "type": "enabled",
            "budget_tokens": 1024
        },
        temperature: 1
    }, config = {} } = {}) {
        return this.addModel(model, MixAnthropic, { options, config });
    }
    sonnet35({ model = 'claude-3-5-sonnet-20240620', options = {}, config = {} } = {}) {
        return this.addModel(model, MixAnthropic, { options, config });
    }
    haiku({ model = 'claude-3-haiku-20240307', options = {}, config = {} } = {}) {
        return this.addModel(model, MixAnthropic, { options, config });
    }
    sonar({ model = 'sonar-pro', options = {}, config = {} } = {}) {
        return this.addModel(model, MixPerplexity, { options, config });
    }
    qwen3({ model = 'Qwen/Qwen3-235B-A22B-fp8-tput', options = {}, config = {} } = {}) {
        return this.addModel(model, MixTogether, { options, config });
    }
    grok2({ model = 'grok-2-latest', options = {}, config = {} } = {}) {
        return this.addModel(model, MixGrok, { options, config });
    }
    grok3({ model = 'grok-3-beta', options = {}, config = {} } = {}) {
        return this.addModel(model, MixGrok, { options, config });
    }
    grok3mini({ model = 'grok-3-mini-beta', options = {}, config = {} } = {}) {
        return this.addModel(model, MixGrok, { options, config });
    }
    scout({ model = 'llama-4-scout-17b-16e-instruct', options = {}, config = {} } = {}) {
        return this.addModel(model, MixCerebras, { options, config });
    }

    // --- Methods delegated to MessageHandler after creation ---
    // Define stubs that will call _getHandler first

    new() { this._getHandler(); return this.new(...arguments); }
    addText() { this._getHandler(); return this.addText(...arguments); }
    addTextFromFile() { this._getHandler(); return this.addTextFromFile(...arguments); }
    setSystem() { this._getHandler(); return this.setSystem(...arguments); }
    setSystemFromFile() { this._getHandler(); return this.setSystemFromFile(...arguments); }
    addImage() { this._getHandler(); return this.addImage(...arguments); }
    addImageFromUrl() { this._getHandler(); return this.addImageFromUrl(...arguments); }
    replace() { this._getHandler(); return this.replace(...arguments); }
    replaceKeyFromFile() { this._getHandler(); return this.replaceKeyFromFile(...arguments); }

    // Async methods need await
    async message() { this._getHandler(); return await this.message(...arguments); }
    async json() { this._getHandler(); return await this.json(...arguments); }
    async block() { this._getHandler(); return await this.block(...arguments); }
    async raw() { this._getHandler(); return await this.raw(...arguments); }
    async stream() { this._getHandler(); return await this.stream(...arguments); }
}

class ModelMix {
    constructor({ options = {}, config = {} } = {}) {
        this.models = {};
        this.defaultOptions = {
            max_tokens: 5000,
            temperature: 1, // 1 --> More creative, 0 --> More deterministic.
            top_p: 1, // 100% --> The model considers all possible tokens.
            ...options
        };

        // Standard Bottleneck configuration
        const defaultBottleneckConfig = {
            maxConcurrent: 8,     // Maximum number of concurrent requests
            minTime: 500,         // Minimum time between requests (in ms)
        };

        this.config = {
            system: 'You are an assistant.',
            systemExtra: '',
            max_history: 1, // Default max history
            debug: false,
            bottleneck: defaultBottleneckConfig,
            ...config
        }

        this.limiter = new Bottleneck(this.config.bottleneck);
    }

    replace(keyValues) {
        this.config.replace = keyValues;
        return this;
    }

    attach(...modelInstances) {
        for (const modelInstance of modelInstances) {
            const key = modelInstance.config.prefix.join("_");
            this.models[key] = modelInstance;
        }
        return this;
    }

    static create(args = {}) {
        return new ModelMixBuilder(args);
    }

    createByDef(modelDefinitions, { config: explicitOverallConfig = {}, options: explicitOverallOptions = {} } = {}) {

        // modelDefinitions is expected to be the array from ModelMixBuilder.models
        // e.g., [{ key, providerClass, options, config }, ...]
        const allModelsInfo = modelDefinitions;
        const modelKeys = allModelsInfo.map(m => m.key);

        if (modelKeys.length === 0) {
            throw new Error('No model keys provided in modelDefinitions.');
        }

        // Verificar que todos los modelos estén disponibles
        const unavailableModels = modelKeys.filter(modelKey => {
            return !Object.values(this.models).some(entry =>
                entry.config.prefix.some(p => modelKey.startsWith(p))
            );
        });

        if (unavailableModels.length > 0) {
            throw new Error(`The following models are not available: ${unavailableModels.join(', ')}`);
        }

        // Una vez verificado que todos están disponibles, obtener el primer modelo (primary)
        const primaryModelInfo = allModelsInfo[0];
        const primaryModelKey = primaryModelInfo.key;
        const primaryModelEntry = Object.values(this.models).find(entry =>
            entry.config.prefix.some(p => primaryModelKey.startsWith(p))
        );

        if (!primaryModelEntry) { // Should be caught by unavailableModels, but good for robustness
            throw new Error(`Primary model provider for key ${primaryModelKey} not found or attached.`);
        }

        // Options/config for the MessageHandler instance (session-level)
        // These are based on the primary model's specification.
        const optionsHandler = {
            ...this.defaultOptions,                 // ModelMix global defaults
            ...(primaryModelEntry.options || {}),   // Primary provider class defaults
            ...(primaryModelInfo.options || {}),    // Options from addModel for primary
            ...explicitOverallOptions,              // Explicit options to .create() if any
            model: primaryModelKey                  // Ensure primary model key is set
        };

        const configHandler = {
            ...this.config,                         // ModelMix global config
            ...(primaryModelEntry.config || {}),    // Primary provider class config
            ...(primaryModelInfo.config || {}),     // Config from addModel for primary
            ...explicitOverallConfig                // Explicit config to .create()
        };

        // Pass the entire allModelsInfo array for fallback/iteration
        return new MessageHandler(this, primaryModelEntry, optionsHandler, configHandler, allModelsInfo);
    }

    create(modelKeys = [], { config = {}, options = {} } = {}) {

        // Backward compatibility for string model keys
        if (!modelKeys || (Array.isArray(modelKeys) && modelKeys.length === 0)) {
            return new ModelMixBuilder({ config: { ...this.config, ...config }, options: { ...this.defaultOptions, ...options } });
        }

        // If modelKeys is a string, convert it to an array for backward compatibility
        const modelArray = Array.isArray(modelKeys) ? modelKeys : [modelKeys];

        if (modelArray.length === 0) {
            throw new Error('No model keys provided');
        }

        // Create model definitions based on string keys
        const modelDefinitions = modelArray.map(key => {
            // Find the provider for this model key
            const providerEntry = Object.values(this.models).find(entry =>
                entry.config.prefix.some(p => key.startsWith(p))
            );

            if (!providerEntry) {
                throw new Error(`Model provider not found for key: ${key}`);
            }

            // Return a synthesized model definition with just the key and options/config from the create call
            return {
                key,
                providerClass: null, // Not needed for our purpose
                options,            // Use the options from create call for all models
                config              // Use the config from create call for all models
            };
        });

        // Pass to the new implementation
        return this.createByDef(modelDefinitions, { config, options });
    }

    setSystem(text) {
        this.config.system = text;
        return this;
    }

    setSystemFromFile(filePath) {
        const content = this.readFile(filePath);
        this.setSystem(content);
        return this;
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
}

class MessageHandler {
    constructor(mix, modelEntry, options, config, allModelsInfo = []) {
        this.mix = mix;
        this.modelEntry = modelEntry; // Primary model's provider instance
        this.options = options;     // Session-level options, based on primary
        this.config = config;       // Session-level config, based on primary
        this.messages = [];
        this.allModelsInfo = allModelsInfo; // Store the full info array [{ key, providerClass, options, config }, ...]
        this.imagesToProcess = [];
    }

    new() {
        this.messages = [];
        return this;
    }

    addText(text, config = { role: "user" }) {
        const content = [{
            type: "text",
            text
        }];

        this.messages.push({ ...config, content });
        return this;
    }

    addTextFromFile(filePath, { role = "user" } = {}) {
        const content = this.mix.readFile(filePath);
        this.addText(content, { role });
        return this;
    }

    setSystem(text) {
        this.config.system = text;
        return this;
    }

    setSystemFromFile(filePath) {
        const content = this.mix.readFile(filePath);
        this.setSystem(content);
        return this;
    }

    addImage(filePath, { role = "user" } = {}) {
        const imageBuffer = this.mix.readFile(filePath, { encoding: null });
        const mimeType = mime.lookup(filePath);

        if (!mimeType || !mimeType.startsWith('image/')) {
            throw new Error('Invalid image file type');
        }

        const data = imageBuffer.toString('base64');

        const imageMessage = {
            ...{ role },
            content: [
                {
                    type: "image",
                    "source": {
                        type: "base64",
                        media_type: mimeType,
                        data
                    }
                }
            ]
        };

        this.messages.push(imageMessage);

        return this;
    }

    addImageFromUrl(url, config = { role: "user" }) {
        this.imagesToProcess.push({ url, config });
        return this;
    }

    async processImageUrls() {
        const imageContents = await Promise.all(
            this.imagesToProcess.map(async (image) => {
                try {
                    const response = await axios.get(image.url, { responseType: 'arraybuffer' });
                    const base64 = Buffer.from(response.data, 'binary').toString('base64');
                    const mimeType = response.headers['content-type'];
                    return { base64, mimeType, config: image.config };
                } catch (error) {
                    console.error(`Error descargando imagen desde ${image.url}:`, error);
                    return null;
                }
            })
        );

        imageContents.forEach((image) => {
            if (image) {
                const imageMessage = {
                    ...image.config,
                    content: [
                        {
                            type: "image",
                            "source": {
                                type: "base64",
                                media_type: image.mimeType,
                                data: image.base64
                            }
                        }
                    ]
                };
                this.messages.push(imageMessage);
            }
        });
    }

    async message() {
        this.options.stream = false;
        let raw = await this.execute();
        if (!raw.message && raw.response?.content?.[1]?.text) {
            return raw.response.content[1].text;
        }

        return raw.message;
    }

    async json(schemaExample = null, schemaDescription = {}, { type = 'json_object', addExample = false, addSchema = true } = {}) {
        this.options.response_format = { type };
        if (schemaExample) {

            if (addSchema) {
                const schema = generateJsonSchema(schemaExample, schemaDescription);
                this.config.systemExtra = "\nOutput JSON Schema: \n```\n" + JSON.stringify(schema) + "\n```";
            }

            if (addExample) {
                this.config.systemExtra += "\nOutput JSON Example: \n```\n" + JSON.stringify(schemaExample) + "\n```";
            }
        }
        const response = await this.message();
        this.config.systemExtra = "";
        return JSON.parse(this._extractBlock(response));
    }

    _extractBlock(response) {
        const block = response.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return block ? block[1].trim() : response;
    }

    async block({ addSystemExtra = true } = {}) {
        if (addSystemExtra) {
            this.config.systemExtra = "\nReturn the result of the task between triple backtick block code tags ```";
        }
        const response = await this.message();
        this.config.systemExtra = "";
        return this._extractBlock(response);
    }

    async raw() {
        this.options.stream = false;
        return this.execute();
    }

    async stream(callback) {
        this.options.stream = true;
        this.modelEntry.streamCallback = callback;
        return this.execute();
    }

    replace(keyValues) {
        this.config.replace = { ...this.config.replace, ...keyValues };
        return this;
    }

    replaceKeyFromFile(key, filePath) {
        const content = this.mix.readFile(filePath);
        this.replace({ [key]: this.template(content, this.config.replace) });
        return this;
    }

    template(input, replace) {
        for (const k in replace) {
            input = input.split(/([¿?¡!,"';:\(\)\.\s])/).map(x => x === k ? replace[k] : x).join("");
        }
        return input;
    }

    groupByRoles(messages) {
        return messages.reduce((acc, currentMessage, index) => {
            if (index === 0 || currentMessage.role !== messages[index - 1].role) {
                acc.push({
                    role: currentMessage.role,
                    content: currentMessage.content
                });
            } else {
                acc[acc.length - 1].content = acc[acc.length - 1].content.concat(currentMessage.content);
            }
            return acc;
        }, []);
    }

    applyTemplate() {
        if (!this.config.replace) return;

        this.config.system = this.template(this.config.system, this.config.replace)

        this.messages = this.messages.map(message => {
            if (message.content instanceof Array) {
                message.content = message.content.map(content => {
                    if (content.type === 'text') {
                        content.text = this.template(content.text, this.config.replace)
                    }
                    return content;
                });
            }
            return message;
        });
    }

    async prepareMessages() {
        await this.processImageUrls();
        this.applyTemplate();
        this.messages = this.messages.slice(-this.config.max_history);
        this.messages = this.groupByRoles(this.messages);
        this.options.messages = this.messages;
    }

    async execute() {
        return this.mix.limiter.schedule(async () => {
            await this.prepareMessages(); // Prepare messages once, outside the loop

            if (this.messages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }

            let lastError = null;
            const modelIterationList = this.allModelsInfo; // Use the full info for iteration

            // Iterate through the models defined in the handler's list
            for (let i = 0; i < modelIterationList.length; i++) {
                const currentModelDetail = modelIterationList[i];
                const currentModelKey = currentModelDetail.key;
                const currentModelBuilderOptions = currentModelDetail.options || {};
                const currentModelBuilderConfig = currentModelDetail.config || {};

                // Find the corresponding model provider instance in the ModelMix instance
                const currentModelProviderInstance = Object.values(this.mix.models).find(entry =>
                    entry.config.prefix.some(p => currentModelKey.startsWith(p))
                );

                if (!currentModelProviderInstance) {
                    log.warn(`Model provider not found or attached for key: ${currentModelKey}. Skipping.`);
                    if (!lastError) {
                        lastError = new Error(`Model provider not found for key: ${currentModelKey}`);
                    }
                    continue; // Try the next model
                }

                // Construct effective options and config for THIS attempt
                const attemptOptions = {
                    ...this.mix.defaultOptions,                            // 1. ModelMix global defaults
                    ...(currentModelProviderInstance.options || {}),      // 2. Provider class defaults for current model
                    ...this.options,                                       // 3. MessageHandler current general options (from primary + handler changes)
                    ...currentModelBuilderOptions,                         // 4. Specific options from addModel for THIS model
                    model: currentModelKey                                 // 5. Crucial: set current model key
                };

                const attemptConfig = {
                    ...this.mix.config,                                    // 1. ModelMix global config
                    ...(currentModelProviderInstance.config || {}),       // 2. Provider class config for current model
                    ...this.config,                                        // 3. MessageHandler current general config
                    ...currentModelBuilderConfig                           // 4. Specific config from addModel for THIS model
                };

                // Determine the effective debug flag for this attempt (for logging and API call context)
                // Precedence: model-specific builder config -> handler config -> mix config
                const effectiveDebugForAttempt = attemptConfig.hasOwnProperty('debug') ? attemptConfig.debug :
                    this.config.hasOwnProperty('debug') ? this.config.debug :
                        this.mix.config.debug;

                // Update attemptConfig with the finally resolved debug flag for the API call
                const apiCallConfig = { ...attemptConfig, debug: effectiveDebugForAttempt };


                if (effectiveDebugForAttempt) {
                    const isPrimary = i === 0;
                    log.debug(`Attempt #${i + 1}: Using model ${currentModelKey}` + (isPrimary ? ' (Primary)' : ' (Fallback)'));
                    log.debug("Effective attemptOptions for " + currentModelKey + ":");
                    log.inspect(attemptOptions);
                    log.debug("Effective apiCallConfig for " + currentModelKey + ":");
                    log.inspect(apiCallConfig);
                }


                // Apply model-specific adjustments to a copy of options for this attempt
                let finalAttemptOptions = { ...attemptOptions };
                if (currentModelProviderInstance instanceof MixOpenAI && finalAttemptOptions.model?.startsWith('o')) {
                    delete finalAttemptOptions.max_tokens;
                    delete finalAttemptOptions.temperature;
                }
                if (currentModelProviderInstance instanceof MixAnthropic) {
                    if (finalAttemptOptions.thinking) {
                        delete finalAttemptOptions.top_p;
                        // if (finalAttemptOptions.temperature < 1) {
                        //     finalAttemptOptions.temperature = 1;
                        // }
                    }
                    delete finalAttemptOptions.response_format; // Anthropic doesn't use this top-level option
                }
                // ... add other potential model-specific option adjustments here ...

                try {
                    // Attach the stream callback to the *current* model entry for this attempt
                    // this.modelEntry is the primary model's provider instance where streamCallback was stored by MessageHandler.stream()
                    if (finalAttemptOptions.stream && this.modelEntry && this.modelEntry.streamCallback) {
                        currentModelProviderInstance.streamCallback = this.modelEntry.streamCallback;
                    }

                    // Pass the adjusted options/config for this specific attempt
                    const result = await currentModelProviderInstance.create({ options: finalAttemptOptions, config: apiCallConfig });

                    // Add successful response to history *before* returning
                    let messageContentToAdd = result.message;
                    if (currentModelProviderInstance instanceof MixAnthropic && result.response?.content?.[0]?.text) {
                        messageContentToAdd = result.response.content[0].text;
                    } else if (currentModelProviderInstance instanceof MixOllama && result.response?.message?.content) {
                        messageContentToAdd = result.response.message.content;
                    } // Add more cases if other providers have different structures

                    this.messages.push({ role: "assistant", content: messageContentToAdd });

                    if (effectiveDebugForAttempt) {
                        log.debug(`Request successful with model: ${currentModelKey}`);
                        log.inspect(result.response);
                    }
                    return result; // Success!
                } catch (error) {
                    lastError = error; // Store the most recent error
                    log.warn(`Model ${currentModelKey} failed (Attempt #${i + 1}/${modelIterationList.length}).`);
                    if (error.message) log.warn(`Error: ${error.message}`);
                    if (error.statusCode) log.warn(`Status Code: ${error.statusCode}`);
                    if (error.details) log.warn(`Details: ${JSON.stringify(error.details)}`);

                    // Check if this is the last model in the list
                    if (i === modelIterationList.length - 1) {
                        log.error(`All ${modelIterationList.length} model(s) failed. Throwing last error from ${currentModelKey}.`);
                        throw lastError; // Re-throw the last encountered error
                    } else {
                        const nextModelKey = modelIterationList[i + 1].key;
                        log.info(`-> Proceeding to next model: ${nextModelKey}`);
                    }
                }
            }

            // This point should theoretically not be reached if there's at least one model key
            // and the loop either returns a result or throws an error.
            log.error("Fallback logic completed without success or throwing the final error.");
            throw lastError || new Error("Failed to get response from any model, and no specific error was caught.");
        });
    }
}
class MixCustom {
    constructor({ config = {}, options = {}, headers = {} } = {}) {
        this.config = this.getDefaultConfig(config);
        this.options = this.getDefaultOptions(options);
        this.headers = this.getDefaultHeaders(headers);
        this.streamCallback = null; // Definimos streamCallback aquí
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
            prefix: [],
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

    async create({ config = {}, options = {} } = {}) {
        try {
            if (config.debug) {
                log.debug("config");
                log.info(config);
                log.debug("options");
                log.inspect(options);
            }

            if (options.stream) {
                return this.processStream(await axios.post(this.config.url, options, {
                    headers: this.headers,
                    responseType: 'stream'
                }));
            } else {
                return this.processResponse(await axios.post(this.config.url, options, {
                    headers: this.headers
                }));
            }
        } catch (error) {
            throw this.handleError(error, { config, options });
        }
    }

    handleError(error, { config, options }) {
        let errorMessage = 'An error occurred in MixCustom';
        let statusCode = null;
        let errorDetails = null;

        if (error.isAxiosError) {
            statusCode = error.response ? error.response.status : null;
            errorMessage = `Request to ${this.config.url} failed with status code ${statusCode}`;
            errorDetails = error.response ? error.response.data : null;
        }

        const formattedError = {
            message: errorMessage,
            statusCode,
            details: errorDetails,
            stack: error.stack,
            config: config,
            options: options
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

            response.data.on('end', () => resolve({ response: raw, message: message.trim() }));
            response.data.on('error', reject);
        });
    }

    extractDelta(data) {
        if (data.choices && data.choices[0].delta.content) return data.choices[0].delta.content;
        return '';
    }

    processResponse(response) {
        return { response: response.data, message: response.data.choices[0].message.content };
    }
}

class MixOpenAI extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.openai.com/v1/chat/completions',
            prefix: ['gpt', 'ft:', 'o'],
            apiKey: process.env.OPENAI_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key not found. Please provide it in config or set OPENAI_API_KEY environment variable.');
        }

        // Remove max_tokens and temperature for o1/o3 models
        if (options.model?.startsWith('o')) {
            delete options.max_tokens;
            delete options.temperature;
        }

        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixOpenAI.convertMessages(options.messages);
        return super.create({ config, options });
    }

    static convertMessages(messages) {
        return messages.map(message => {
            if (message.role === 'user' && message.content instanceof Array) {
                message.content = message.content.map(content => {
                    if (content.type === 'image') {
                        const { type, media_type, data } = content.source;
                        return {
                            type: 'image_url',
                            image_url: {
                                url: `data:${media_type};${type},${data}`
                            }
                        };
                    }
                    return content;
                });
            }
            return message;
        });
    }
}

class MixAnthropic extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.anthropic.com/v1/messages',
            prefix: ['claude'],
            apiKey: process.env.ANTHROPIC_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Anthropic API key not found. Please provide it in config or set ANTHROPIC_API_KEY environment variable.');
        }

        // Remove top_p for thinking
        if (options.thinking) {
            delete options.top_p;
        }

        delete options.response_format;

        options.system = config.system + config.systemExtra;
        return super.create({ config, options });
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

    processResponse(response) {
        return { response: response.data, message: response.data.content[0].text };
    }
}

class MixPerplexity extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.perplexity.ai/chat/completions',
            prefix: ['sonar'],
            apiKey: process.env.PPLX_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Perplexity API key not found. Please provide it in config or set PPLX_API_KEY environment variable.');
        }

        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
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

    async create({ config = {}, options = {} } = {}) {

        options.messages = MixOllama.convertMessages(options.messages);
        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        return super.create({ config, options });
    }

    processResponse(response) {
        return { response: response.data, message: response.data.message.content.trim() };
    }

    static convertMessages(messages) {
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
        return super.getDefaultConfig({
            url: 'https://api.x.ai/v1/chat/completions',
            prefix: ['grok'],
            apiKey: process.env.XAI_API_KEY,
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

    async create({ config = {}, options = {} } = {}) {
        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixOpenAI.convertMessages(options.messages);
        return super.create({ config, options });
    }
}

class MixGroq extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.groq.com/openai/v1/chat/completions',
            prefix: ["llama", "mixtral", "gemma", "deepseek-r1-distill"],
            apiKey: process.env.GROQ_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Groq API key not found. Please provide it in config or set GROQ_API_KEY environment variable.');
        }

        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixOpenAI.convertMessages(options.messages);
        return super.create({ config, options });
    }
}

class MixTogether extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.together.xyz/v1/chat/completions',
            prefix: ["meta-llama", "google", "NousResearch", "deepseek-ai", "Qwen"],
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

    static convertMessages(messages) {
        return messages.map(message => {
            if (message.content instanceof Array) {
                message.content = message.content.map(content => content.text).join("\n\n");
            }
            return message;
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Together API key not found. Please provide it in config or set TOGETHER_API_KEY environment variable.');
        }

        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixTogether.convertMessages(options.messages);

        return super.create({ config, options });
    }
}

class MixCerebras extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.cerebras.ai/v1/chat/completions',
            prefix: ["llama"],
            apiKey: process.env.CEREBRAS_API_KEY,
            ...customConfig
        });
    }

    async create({ config = {}, options = {} } = {}) {
        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixTogether.convertMessages(options.messages);
        return super.create({ config, options });
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixOpenAI, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras };