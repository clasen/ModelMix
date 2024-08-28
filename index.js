const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');

class ModelMix {
    constructor(args = { options: {}, config: {} }) {
        this.models = {};
        this.defaultOptions = {
            max_tokens: 2000,
            temperature: 1,
            top_p: 1,
            ...args.options
        };

        // Standard Bottleneck configuration
        const defaultBottleneckConfig = {
            maxConcurrent: 8,     // Maximum number of concurrent requests
            minTime: 500,         // Minimum time between requests (in ms)
        };

        this.config = {
            system: 'You are an assistant.',
            max_history: 5, // Default max history
            debug: false,
            bottleneck: defaultBottleneckConfig,
            ...args.config
        }

        this.limiter = new Bottleneck(this.config.bottleneck);
    }

    replace(keyValues) {
        this.config.replace = keyValues;
        return this;
    }

    attach(modelInstance) {
        const key = modelInstance.config.prefix.join("_");
        this.models[key] = modelInstance;
        return this;
    }

    create(modelKey, args = { config: {}, options: {} }) {
        const modelEntry = Object.values(this.models).find(entry =>
            entry.config.prefix.some(p => modelKey.startsWith(p))
        );

        if (!modelEntry) {
            throw new Error(`Model with prefix matching ${modelKey} is not attached.`);
        }

        const options = {
            ...this.defaultOptions,
            ...modelEntry.options,
            ...args.options,
            model: modelKey
        };

        const config = {
            ...this.config,
            ...modelEntry.config,
            ...args.config
        };

        return new MessageHandler(this, modelEntry, options, config);
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

    readFile(filePath, options = { encoding: 'utf8' }) {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);
            return fs.readFileSync(absolutePath, options);
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
    constructor(mix, modelEntry, options, config) {
        this.mix = mix;
        this.modelEntry = modelEntry;
        this.options = options;
        this.config = config;
        this.messages = [];

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

    addTextFromFile(filePath, config = { role: "user" }) {
        const content = this.mix.readFile(filePath);
        this.addText(content, config);
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

    addImage(filePath, config = { role: "user" }) {
        const imageBuffer = this.mix.readFile(filePath, { encoding: null });
        const mimeType = mime.lookup(filePath);

        if (!mimeType || !mimeType.startsWith('image/')) {
            throw new Error('Invalid image file type');
        }

        const data = imageBuffer.toString('base64');

        const imageMessage = {
            ...config,
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
        const response = await this.execute();
        return response.message;
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
        return input.split(/([¿?¡!,"';:\(\)\.\s])/).map(x => x in replace ? replace[x] : x).join("");
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

    async execute() {
        return this.mix.limiter.schedule(async () => {
            await this.processImageUrls();

            this.applyTemplate();
            this.messages = this.messages.slice(-this.config.max_history);
            this.messages = this.groupByRoles(this.messages);

            if (this.messages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }

            this.options.messages = this.messages;

            try {
                const result = await this.modelEntry.create({ options: this.options, config: this.config });
                this.messages.push({ role: "assistant", content: result.message });
                return result;
            } catch (error) {
                throw error;
            }
        });
    }
}
class MixCustom {
    constructor(args = { config: {}, options: {}, headers: {} }) {
        this.config = this.getDefaultConfig(args.config);
        this.options = this.getDefaultOptions(args.options);
        this.headers = this.getDefaultHeaders(args.headers);
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

    async create(args = { config: {}, options: {} }) {
        try {
            if (args.config.debug) {
                log.debug("config");
                log.info(args.config);
                log.debug("options");
                log.inspect(args.options);
            }

            if (args.options.stream) {
                return this.processStream(await axios.post(this.config.url, args.options, {
                    headers: this.headers,
                    responseType: 'stream'
                }));
            } else {
                return this.processResponse(await axios.post(this.config.url, args.options, {
                    headers: this.headers
                }));
            }
        } catch (error) {
            throw this.handleError(error, args);
        }
    }

    handleError(error, args) {
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
            config: args.config,
            options: args.options
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
            prefix: ['gpt'],
            apiKey: process.env.OPENAI_API_KEY,
            ...customConfig
        });
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        args.options.messages = MixOpenAI.convertMessages(args.options.messages);
        return super.create(args);
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

    create(args = { config: {}, options: {} }) {
        args.options.system = args.config.system;
        return super.create(args);
    }
}

class MixPerplexity extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.perplexity.ai/chat/completions',
            prefix: ['llama-3', 'mixtral'],
            apiKey: process.env.PPLX_API_KEY,
            ...customConfig
        });
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        return super.create(args);
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

    create(args = { config: {}, options: {} }) {

        args.options.messages = MixOllama.convertMessages(args.options.messages);
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        return super.create(args);
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

class MixLMStudio extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'http://localhost:1234/v1/chat/completions',
            ...customConfig
        });
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        args.options.messages = MixOpenAI.convertMessages(args.options.messages);
        return super.create(args);
    }
}

class MixGroq extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.groq.com/openai/v1/chat/completions',
            prefix: ["llama", "mixtral", "gemma"],
            apiKey: process.env.GROQ_API_KEY,
            ...customConfig
        });
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        args.options.messages = MixOpenAI.convertMessages(args.options.messages);
        return super.create(args);
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixOpenAI, MixPerplexity, MixOllama, MixLMStudio, MixGroq };