const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');

const log = require('lemonlog')('mmix');


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
            ...args.config
        }
    }

    attach(modelInstance) {
        const key = modelInstance.config.prefix.join("_");
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

        const options = {
            ...this.defaultOptions,
            ...modelEntry.options,
            ...overOptions,
            model: modelKey
        };
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

        if (this.messages.length === 0) {
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

class CustomModel {
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
            let message = "";
            let buffer = '';
            response.data.on('data', chunk => {
                buffer += chunk.toString();
                let boundary;
                while ((boundary = buffer.indexOf('\n')) !== -1) {

                    const dataStr = buffer.slice(0, boundary).trim();
                    buffer = buffer.slice(boundary + 1);


                    let jsonStr = dataStr;
                    if (dataStr.startsWith('data:')) {
                        jsonStr = dataStr.slice(5).trim();
                    }

                    if (jsonStr !== '[DONE]') {
                        try {
                            const data = JSON.parse(jsonStr);
                            if (this.streamCallback) { // Asegúrate de que el callback esté definido
                                let delta = "";

                                if (data.message.content) {
                                    delta = data.message.content;
                                } else if (data.delta && data.delta.text) {
                                    delta = data.delta.text;
                                } else if (data.choices && data.choices[0].delta.content) {
                                    delta = data.choices[0].delta.content;
                                }
                                message += delta;
                                this.streamCallback({ response: data, message, delta });
                                raw.push(data);
                            }
                        } catch (error) {
                            console.error('Error parsing JSON:', error);
                        }
                    }

                }
            });

            response.data.on('end', () => {
                resolve({ response: raw, message });
            });

            response.data.on('error', err => {
                reject(err);
            });
        });
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
        // args.options.stream = true; // Habilitar el streaming en las opciones
        args.options.messages = this.convertMessages(args.options.messages);
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
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01'
        };
    }

    // processStream(response) {
    //     return new Promise((resolve, reject) => {
    //         let raw = [];
    //         let message = "";
    //         let buffer = '';
    //         response.data.on('data', chunk => {
    //             buffer += chunk.toString();
    //             let boundary;
    //             while ((boundary = buffer.indexOf('\n')) !== -1) {

    //                 const dataStr = buffer.slice(0, boundary).trim();
    //                 buffer = buffer.slice(boundary + 1);

    //                 if (dataStr.startsWith('data:')) {
    //                     const jsonStr = dataStr.slice(5).trim();


    //                     if (jsonStr !== '[DONE]') {
    //                         try {
    //                             const data = JSON.parse(jsonStr);
    //                             if (this.streamCallback) { // Asegúrate de que el callback esté definido
    //                                 let delta = "";
    //                                 if (data.delta) {
    //                                     delta = data.delta.text;
    //                                     message += delta;
    //                                 }
    //                                 this.streamCallback({ response: data, message, delta });
    //                                 raw.push(data)
    //                             }
    //                         } catch (error) {
    //                             console.error('Error parsing JSON:', error);
    //                         }
    //                     }
    //                 }
    //             }
    //         });

    //         response.data.on('end', () => {
    //             resolve({ response: raw, message });
    //         });

    //         response.data.on('error', err => {
    //             reject(err);
    //         });
    //     });
    // }

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

class CustomOllamaModel extends CustomModel {

    getDefaultOptions(customOptions) {
        return {
            options: customOptions,
        };
    }

    create(args = { config: {}, options: {} }) {

        args.options.messages = this.convertMessages(args.options.messages);
        args.options.messages = [{ role: 'system', content: args.config.system }, ...args.options.messages || []];
        return super.create(args);
    }

    processResponse(response) {
        return { response: response.data, message: response.data.message.content.trim() };
    }

    convertMessages(messages) {
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

module.exports = { CustomModel, ModelMix, CustomAnthropicModel, CustomOpenAIModel, CustomPerplexityModel, CustomOllamaModel };