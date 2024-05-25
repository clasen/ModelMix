const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');

class ModelMix {
    constructor(args = { options: {}, config: {} }) {
        this.models = {};
        this.defaultOptions = {
            model: 'gpt-4o',
            max_tokens: 2000,
            temperature: 1,
            top_p: 1,
            ...args.options
        };

        this.config = {
            system: 'You are an assistant.',
            max_request: 1,
            max_history: 5, // Default max history
            ...args.config
        }
    }

    attach(modelInstance) {
        const key = modelInstance.constructor.name.replace('Model', '').toLowerCase();
        this.models[key] = modelInstance;
        modelInstance.queue = [];
        modelInstance.active_requests = 0;
    }

    create(modelKey, overOptions = {}) {
        const modelEntry = Object.values(this.models).find(entry =>
            entry.config.prefix.some(p => modelKey.startsWith(p))
        );

        if (!modelEntry) {
            throw new Error(`Model with prefix matching ${modelKey} is not attached.`);
        }

        const options = { ...this.defaultOptions, ...modelEntry.options, ...overOptions, model: modelKey };
        const config = { ...this.config, ...modelEntry.config };

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

    async message() {
        const response = await this.execute();
        return response.message;
    }

    async raw() {
        const data = await this.execute();
        return data.response;
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

    async execute() {

        this.messages = this.groupByRoles(this.messages);

        if (this.messages.length === 0) { // Only system message is present
            throw new Error("No user messages have been added. Use addMessage(prompt) to add a message.");
        }

        this.messages = this.messages.slice(-this.config.max_history);
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

class OpenAIModel {
    constructor(openai, args = { options: {}, config: {} }) {
        this.openai = openai;

        this.options = {
            frequency_penalty: 0,
            presence_penalty: 0,
            stream: false,
            ...args.options
        }

        this.config = {
            prefix: ["gpt"],
            max_request: 1,
            ...args.config || {}
        }
    }

    async create(args = { options: {}, config: {} }) {

        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        args.options.messages = this.convertMessages(args.options.messages);
        const response = await this.openai.chat.completions.create(args.options);
        return { response, message: response.choices[0].message.content };
    }

    convertMessages(messages) {
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

class AnthropicModel {
    constructor(anthropic, args = { options: {}, config: {} }) {
        this.anthropic = anthropic;
        this.options = {
            temperature: 0.5,
            ...args.options || {}
        }

        this.config = {
            prefix: ['claude'],
            max_request: 1,
            ...args.config || {}
        }
    }

    async create(args = { config: {}, options: {} }) {

        args.options.system = args.config.system;

        const response = await this.anthropic.messages.create(args.options);
        const responseText = response.content[0].text;

        return { response, message: responseText.trim() };
    }
}

class CustomModel {
    constructor(args = { config: {}, options: {}, headers: {} }) {
        this.config = this.getDefaultConfig(args.config);
        this.options = { ...args.options };
        this.headers = { ...this.getDefaultHeaders(), ...args.headers };
    }

    getDefaultConfig(customConfig) {
        return {
            url: '',
            apikey: '',
            prefix: [],
            ...customConfig
        };
    }

    getDefaultHeaders() {
        return {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': `Bearer ${this.config.apikey}`
        };
    }

    async create(args = { config: {}, options: {} }) {
        const response = await axios.post(this.config.url, args.options, {
            headers: this.headers
        });

        return this.processResponse(response);
    }

    processResponse(response) {
        return { response: response.data, message: response.data.choices[0].message.content };
    }
}

class CustomOpenAIModel extends CustomModel {
    getDefaultConfig(customConfig) {
        return {
            ...super.getDefaultConfig(customConfig),
            url: 'https://api.openai.com/v1/chat/completions',
            prefix: ['gpt']
        };
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        args.options.messages = this.convertMessages(args.options.messages);
        console.log(args.options.messages[1].content[0])
        return super.create(args);
    }

    convertMessages(messages) {
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

class CustomAnthropicModel extends CustomModel {
    getDefaultConfig(customConfig) {
        return {
            ...super.getDefaultConfig(customConfig),
            url: 'https://api.anthropic.com/v1/messages',
            prefix: ['claude']
        };
    }

    getDefaultHeaders() {
        return {
            ...super.getDefaultHeaders(),
            'x-api-key': this.config.apikey,
            'anthropic-version': '2023-06-01'
        };
    }

    processResponse(response) {
        return { response: response.data, message: response.data.content[0].text };
    }
}

class CustomPerplexityModel extends CustomModel {
    getDefaultConfig(customConfig) {
        return {
            ...super.getDefaultConfig(customConfig),
            url: 'https://api.perplexity.ai/chat/completions',
            prefix: ['pplx', 'llama', 'mixtral']
        };
    }

    create(args = { config: {}, options: {} }) {
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        return super.create(args);
    }
}

module.exports = { OpenAIModel, AnthropicModel, CustomModel, ModelMix, CustomAnthropicModel, CustomOpenAIModel, CustomPerplexityModel };