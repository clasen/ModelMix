const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');
const log = require('lemonlog')('ModelMix');

class ModelMix {
    constructor(args = { options: {}, config: {} }) {
        this.models = {};
        this.defaultOptions = {
            max_tokens: 2000,
            temperature: 1,
            top_p: 1,
            ...args.options
        };

        this.config = {
            system: 'You are an assistant.',
            max_request: 1,
            max_history: 5, // Default max history
            debug: false,
            ...args.config
        }
    }

    replace(keyValues) {
        this.config.replace = keyValues;
        return this;
    }

    attach(modelInstance) {
        const key = modelInstance.config.prefix.join("_");
        this.models[key] = modelInstance;
        modelInstance.queue = [];
        modelInstance.active_requests = 0;
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

    async processQueue(modelEntry) {
        if (modelEntry.active_requests >= modelEntry.config.max_request) {
            return;
        }

        const nextTask = modelEntry.queue.shift();
        if (!nextTask) {
            return;
        }

        modelEntry.active_requests++;

        try {
            const result = await modelEntry.create(nextTask.args);
            nextTask.resolve(result);
        } catch (error) {
            nextTask.reject(error);
        } finally {
            modelEntry.active_requests--;
            this.processQueue(modelEntry);
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
        try {
            const content = fs.readFileSync(filePath, { encoding: 'utf8' });
            this.addText(content, config);
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
        }
        return this;
    }

    addImage(filePath, config = { role: "user" }) {
        try {
            const imageBuffer = fs.readFileSync(filePath);
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
        } catch (error) {
            console.error('Error reading the image file:', error);
        }

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
        try {
            const content = fs.readFileSync(filePath, { encoding: 'utf8' });
            this.replace({ [key]: content });
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
        }
        return this;
    }

    template(input, replace) {
        return input.split(/([¿?¡!,"';:\.\s])/).map(x => x in replace ? replace[x] : x).join("");
    }

    groupByRoles(messages) {
        return messages.reduce((acc, message) => {
            const existingRole = acc.find(item => item.role === message.role);
            if (existingRole) {
                existingRole.content = existingRole.content.concat(message.content);
            } else {
                acc.push({ role: message.role, content: Array.isArray(message.content) ? message.content : [message.content] });
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

        await this.processImageUrls();

        this.applyTemplate();
        this.messages = this.messages.slice(-this.config.max_history);
        this.messages = this.groupByRoles(this.messages);

        if (this.messages.length === 0) {
            throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
        }

        this.options.messages = this.messages;

        return new Promise((resolve, reject) => {
            this.modelEntry.queue.push({
                args: { options: this.options, config: this.config },
                resolve: (result) => {
                    this.messages.push({ role: "assistant", content: result.message });
                    resolve(result);
                },
                reject
            });
            this.mix.processQueue(this.modelEntry);
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

        if (args.config.debug) {
            log.info("config");
            log.info(args.config);
            log.inspect("options");
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

    getDefaultHeaders(getDefaultHeaders) {
        return super.getDefaultHeaders({
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            ...getDefaultHeaders
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