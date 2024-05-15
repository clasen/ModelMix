const axios = require('axios');

class ModelMix {
    constructor(options = {}) {
        this.models = {};
        this.defaultOptions = {
            model: 'gpt-4o',
            max_tokens: 2000,
            temperature: 1,
            system: 'You are an assistant.',
            top_p: 1,
            ...options
        };
    }

    attach(modelInstance) {
        const key = modelInstance.constructor.name.replace('Model', '').toLowerCase();
        this.models[key] = modelInstance;
        modelInstance.queue = [];
        modelInstance.active_requests = 0;
    }

    async create(prompt, modelKey, options = {}) {
        const modelEntry = Object.values(this.models).find(entry =>
            entry.config.prefix.some(p => modelKey.startsWith(p))
        );

        if (!modelEntry) {
            throw new Error(`Model with prefix matching ${modelKey} is not attached.`);
        }

        const config = { ...this.defaultOptions, ...modelEntry.options, ...options, model: modelKey };

        return new Promise((resolve, reject) => {
            modelEntry.queue.push({ prompt, config, resolve, reject });
            this.processQueue(modelEntry);
        });
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
            const result = await modelEntry.create(nextTask.prompt, nextTask.config);
            nextTask.resolve(result);
        } catch (error) {
            nextTask.reject(error);
        } finally {
            modelEntry.active_requests--;
            this.processQueue(modelEntry);
        }
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

    async create(prompt, options = {}) {
        options.messages = [
            { role: "system", content: options.system },
            { role: "user", content: prompt }
        ];

        delete options.system;

        const response = await this.openai.chat.completions.create(options);

        return response.choices[0].message.content;
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
            prefix: ["claude"],
            max_request: 1,
            ...args.config || {}
        }
    }

    async create(prompt, options = {}) {
        options.messages = [
            { role: "user", content: prompt }
        ];

        const response = await this.anthropic.messages.create(options);

        const responseText = response.content[0].text;

        // Add a short delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

        return responseText.trim();
    }
}

class CustomModel {
    constructor(args = { config: {}, options: {} }) {
        this.config = {
            url: 'https://api.perplexity.ai/chat/completions',
            bearer: '',
            prefix: ["pplx", "llama", "mixtral"],
            max_request: 1,
            ...args.config
        };

        this.options = {
            return_citations: false,
            return_images: false,
            stream: false,
            presence_penalty: 0,
            frequency_penalty: 1,
            ...args.options
        };
    }

    async create(prompt, options = {}) {
        const mergedOptions = {
            ...this.options,
            ...options,
            messages: [
                { role: "system", content: options.system || "" },
                { role: "user", content: prompt }
            ]
        };

        delete mergedOptions.system;

        const response = await axios.post(this.config.url, mergedOptions, {
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${this.config.bearer}`,
                'content-type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    }
}

module.exports = { OpenAIModel, AnthropicModel, CustomModel, ModelMix };
