const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');

class ModelMix {
    constructor({ options = {}, config = {} } = {}) {
        this.models = [];
        this.messages = [];
        this.options = {
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

    static create({ options = {}, config = {} } = {}) {
        return new ModelMix({ options, config });
    }

    create() {
        return new ModelMix({ options: this.options, config: this.config });
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

    // --- Model addition methods ---
    gpt41({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1', new MixOpenAI({ options, config }));
    }
    gpt41mini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-mini', new MixOpenAI({ options, config }));
    }
    gpt41nano({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-nano', new MixOpenAI({ options, config }));
    }
    gpt4o({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4o', new MixOpenAI({ options, config }));
    }
    o4mini({ options = {}, config = {} } = {}) {
        return this.attach('o4-mini', new MixOpenAI({ options, config }));
    }
    o3({ options = {}, config = {} } = {}) {
        return this.attach('o3', new MixOpenAI({ options, config }));
    }
    gpt45({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.5-preview', new MixOpenAI({ options, config }));
    }
    sonnet37({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-7-sonnet-20250219', new MixAnthropic({ options, config }));
    }
    sonnet37think({ options = {
        thinking: {
            "type": "enabled",
            "budget_tokens": 1024
        },
        temperature: 1
    }, config = {} } = {}) {
        return this.attach('claude-3-7-sonnet-20250219', new MixAnthropic({ options, config }));
    }
    sonnet35({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-5-sonnet-20241022', new MixAnthropic({ options, config }));
    }
    haiku35({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-5-haiku-20241022', new MixAnthropic({ options, config }));
    }
    gemini25flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-flash-preview-04-17', new MixGoogle({ options, config }));
    }
    gemini25proExp({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-pro-exp-03-25', new MixGoogle({ options, config }));
    }
    gemini25pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-pro-preview-05-06', new MixGoogle({ options, config }));
    }
    sonar({ options = {}, config = {} } = {}) {
        return this.attach('sonar-pro', new MixPerplexity({ options, config }));
    }
    qwen3({ options = {}, config = {} } = {}) {
        return this.attach('Qwen/Qwen3-235B-A22B-fp8-tput', new MixTogether({ options, config }));
    }
    grok2({ options = {}, config = {} } = {}) {
        return this.attach('grok-2-latest', new MixGrok({ options, config }));
    }
    grok3({ options = {}, config = {} } = {}) {
        return this.attach('grok-3-beta', new MixGrok({ options, config }));
    }
    grok3mini({ options = {}, config = {} } = {}) {
        return this.attach('grok-3-mini-beta', new MixGrok({ options, config }));
    }
    scout({ options = {}, config = {} } = {}) {
        return this.attach('llama-4-scout-17b-16e-instruct', new MixCerebras({ options, config }));
    }

    // --- Message handling methods ---
    new() {
        this.messages = [];
        return this;
    }

    addText(text, { role = "user" } = {}) {
        const content = [{
            type: "text",
            text
        }];

        this.messages.push({ role, content });
        return this;
    }

    addTextFromFile(filePath, { role = "user" } = {}) {
        const content = this.readFile(filePath);
        this.addText(content, { role });
        return this;
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

    addImage(filePath, { role = "user" } = {}) {
        const imageBuffer = this.readFile(filePath, { encoding: null });
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
        if (!this.imagesToProcess) {
            this.imagesToProcess = [];
        }
        this.imagesToProcess.push({ url, config });
        return this;
    }

    async processImageUrls() {
        if (!this.imagesToProcess) return;

        const imageContents = await Promise.all(
            this.imagesToProcess.map(async (image) => {
                try {
                    const response = await axios.get(image.url, { responseType: 'arraybuffer' });
                    const base64 = Buffer.from(response.data, 'binary').toString('base64');
                    const mimeType = response.headers['content-type'];
                    return { base64, mimeType, config: image.config };
                } catch (error) {
                    console.error(`Error downloading image from ${image.url}:`, error);
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
        this.streamCallback = callback;
        return this.execute();
    }

    replaceKeyFromFile(key, filePath) {
        const content = this.readFile(filePath);
        this.replace({ [key]: this.template(content, this.config.replace) });
        return this;
    }

    template(input, replace) {
        if (!replace) return input;
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

        this.config.system = this.template(this.config.system, this.config.replace);

        this.messages = this.messages.map(message => {
            if (message.content instanceof Array) {
                message.content = message.content.map(content => {
                    if (content.type === 'text') {
                        content.text = this.template(content.text, this.config.replace);
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

    async execute() {
        if (!this.models || this.models.length === 0) {
            throw new Error("No models specified. Use methods like .gpt(), .sonnet() first.");
        }

        return this.limiter.schedule(async () => {
            await this.prepareMessages();

            if (this.messages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }

            let lastError = null;

            for (let i = 0; i < this.models.length; i++) {

                const currentModel = this.models[i];
                const currentModelKey = currentModel.key;
                const providerInstance = currentModel.provider;

                let options = {
                    ...this.options,
                    ...providerInstance.options,
                    model: currentModelKey
                };

                const config = {
                    ...this.config,
                    ...providerInstance.config,
                };

                if (config.debug) {
                    const isPrimary = i === 0;
                    log.debug(`[${currentModelKey}] Attempt #${i + 1}` + (isPrimary ? ' (Primary)' : ' (Fallback)'));
                }

                try {
                    if (options.stream && this.streamCallback) {
                        providerInstance.streamCallback = this.streamCallback;
                    }

                    const result = await providerInstance.create({ options, config });

                    this.messages.push({ role: "assistant", content: result.message });

                    if (config.debug) {
                        log.debug(`Request successful with model: ${currentModelKey}`);
                        log.inspect(result.response);
                    }

                    return result;

                } catch (error) {
                    lastError = error;
                    log.warn(`Model ${currentModelKey} failed (Attempt #${i + 1}/${this.models.length}).`);
                    if (error.message) log.warn(`Error: ${error.message}`);
                    if (error.statusCode) log.warn(`Status Code: ${error.statusCode}`);
                    if (error.details) log.warn(`Details: ${JSON.stringify(error.details)}`);

                    if (i === this.models.length - 1) {
                        log.error(`All ${this.models.length} model(s) failed. Throwing last error from ${currentModelKey}.`);
                        throw lastError;
                    } else {
                        const nextModelKey = this.models[i + 1].key;
                        log.info(`-> Proceeding to next model: ${nextModelKey}`);
                    }
                }
            }

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

    extractMessage(data) {
        if (data.choices && data.choices[0].message.content) return data.choices[0].message.content;
        return '';
    }

    processResponse(response) {
        return {
            response: response.data,
            message: this.extractMessage(response.data)
        };
    }
}

class MixOpenAI extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.openai.com/v1/chat/completions',
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

    extractMessage(data) {
        if (data.content) {
            // thinking
            if (data.content?.[1]?.text) {
                return data.content[1].text;
            }

            if (data.content[0].text) {
                return data.content[0].text;
            }
        }
        return '';
    }
}

class MixPerplexity extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.perplexity.ai/chat/completions',
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

    extractMessage(data) {
        return data.message.content.trim();
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

class MixGoogle extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            apiKey: process.env.GOOGLE_API_KEY,
            ...customConfig
        });
    }

    getDefaultHeaders(customHeaders) {
        return {
            'Content-Type': 'application/json',
            ...customHeaders
        };
    }

    getDefaultOptions(customOptions) {
        return {
            generationConfig: {
                responseMimeType: "text/plain"
            },
            ...customOptions
        };
    }

    static convertMessages(messages) {
        return messages.map(message => {
            const parts = [];

            if (message.content instanceof Array) {
                message.content.forEach(content => {
                    if (content.type === 'text') {
                        parts.push({ text: content.text });
                    } else if (content.type === 'image') {
                        parts.push({
                            inline_data: {
                                mime_type: content.source.media_type,
                                data: content.source.data
                            }
                        });
                    }
                });
            } else {
                parts.push({ text: message.content });
            }

            return {
                role: message.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Google API key not found. Please provide it in config or set GOOGLE_API_KEY environment variable.');
        }

        const modelId = options.model || 'gemini-2.5-flash-preview-04-17';
        const generateContentApi = options.stream ? 'streamGenerateContent' : 'generateContent';

        // Construct the full URL with model ID, API endpoint, and API key
        const fullUrl = `${this.config.url}/${modelId}:${generateContentApi}?key=${this.config.apiKey}`;

        // Convert messages to Gemini format
        const contents = MixGoogle.convertMessages(options.messages);

        // Add system message if present
        if (config.system || config.systemExtra) {
            contents.unshift({
                role: 'user',
                parts: [{ text: (config.system || '') + (config.systemExtra || '') }]
            });
        }

        // Prepare the request payload
        const payload = {
            contents,
            generationConfig: options.generationConfig || this.getDefaultOptions().generationConfig
        };

        try {
            if (options.stream) {
                throw new Error('Stream is not supported for Gemini');
            } else {
                return this.processResponse(await axios.post(fullUrl, payload, {
                    headers: this.headers
                }));
            }
        } catch (error) {
            throw this.handleError(error, { config, options });
        }
    }

    extractMessage(data) {
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixOpenAI, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle };