const axios = require('axios');
const fs = require('fs');
const { fromBuffer } = require('file-type');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

class ModelMix {

    constructor({ options = {}, config = {} } = {}) {
        this.models = [];
        this.messages = [];
        this.tools = {};
        this.toolClient = {};
        this.mcp = {};
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
            max_history: 1, // Default max history
            debug: false,
            bottleneck: defaultBottleneckConfig,
            ...config
        }

        this.limiter = new Bottleneck(this.config.bottleneck);

    }

    replace(keyValues) {
        this.config.replace = { ...this.config.replace, ...keyValues };
        return this;
    }

    static new({ options = {}, config = {} } = {}) {
        return new ModelMix({ options, config });
    }

    new() {
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
    opus4think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-opus-4-20250514', new MixAnthropic({ options, config }));
    }
    opus4({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-20250514', new MixAnthropic({ options, config }));
    }
    sonnet4({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-4-20250514', new MixAnthropic({ options, config }));
    }
    sonnet4think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-sonnet-4-20250514', new MixAnthropic({ options, config }));
    }
    sonnet37({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-7-sonnet-20250219', new MixAnthropic({ options, config }));
    }
    sonnet37think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
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
    sonarPro({ options = {}, config = {} } = {}) {
        return this.attach('sonar-pro', new MixPerplexity({ options, config }));
    }
    sonar({ options = {}, config = {} } = {}) {
        return this.attach('sonar', new MixPerplexity({ options, config }));
    }

    grok3({ options = {}, config = {} } = {}) {
        return this.attach('grok-3', new MixGrok({ options, config }));
    }
    grok3mini({ options = {}, config = {} } = {}) {
        return this.attach('grok-3-mini', new MixGrok({ options, config }));
    }
    grok4({ options = {}, config = {} } = {}) {
        return this.attach('grok-4-0709', new MixGrok({ options, config }));
    }

    qwen3({ options = {}, config = {}, mix = { together: true, cerebras: false } } = {}) {
        if (mix.together) this.attach('Qwen/Qwen3-235B-A22B-fp8-tput', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('qwen-3-32b', new MixCerebras({ options, config }));
        return this;
    }

    scout({ options = {}, config = {}, mix = { groq: true, together: false, cerebras: false } } = {}) {
        if (mix.groq) this.attach('meta-llama/llama-4-scout-17b-16e-instruct', new MixGroq({ options, config }));
        if (mix.together) this.attach('meta-llama/Llama-4-Scout-17B-16E-Instruct', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('llama-4-scout-17b-16e-instruct', new MixCerebras({ options, config }));
        return this;
    }
    maverick({ options = {}, config = {}, mix = { groq: true, together: false, lambda: false } } = {}) {
        if (mix.groq) this.attach('meta-llama/llama-4-maverick-17b-128e-instruct', new MixGroq({ options, config }));
        if (mix.together) this.attach('meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', new MixTogether({ options, config }));
        if (mix.lambda) this.attach('llama-4-maverick-17b-128e-instruct-fp8', new MixLambda({ options, config }));
        return this;
    }

    deepseekR1({ options = {}, config = {}, mix = { groq: true, together: false, cerebras: false } } = {}) {
        if (mix.groq) this.attach('deepseek-r1-distill-llama-70b', new MixGroq({ options, config }));
        if (mix.together) this.attach('deepseek-ai/DeepSeek-R1', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('deepseek-r1-distill-llama-70b', new MixCerebras({ options, config }));
        return this;
    }

    hermes3({ options = {}, config = {}, mix = { lambda: true } } = {}) {
        this.attach('Hermes-3-Llama-3.1-405B-FP8', new MixLambda({ options, config }));
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

    addImageFromBuffer(buffer, { role = "user" } = {}) {
        this.messages.push({
            role,
            content: [{
                type: "image",
                source: {
                    type: "buffer",
                    data: buffer
                }
            }]
        });
        return this;
    }

    addImage(filePath, { role = "user" } = {}) {
        this.messages.push({
            role,
            content: [{
                type: "image",
                source: {
                    type: "file",
                    data: filePath
                }
            }]
        });
        return this;
    }

    addImageFromUrl(url, { role = "user" } = {}) {
        this.messages.push({
            role,
            content: [{
                type: "image",
                source: {
                    type: "url",
                    data: url
                }
            }]
        });
        return this;
    }

    async processImages() {
        // Process images that are in messages
        for (let i = 0; i < this.messages.length; i++) {
            const message = this.messages[i];
            if (!message.content) continue;
            
            for (let j = 0; j < message.content.length; j++) {
                const content = message.content[j];
                if (content.type !== 'image' || content.source.type === 'base64') continue;
                
                try {
                    let buffer, mimeType;
                    
                    switch (content.source.type) {
                        case 'url':
                            const response = await axios.get(content.source.data, { responseType: 'arraybuffer' });
                            buffer = Buffer.from(response.data);
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
                        const fileType = await fromBuffer(buffer);
                        if (!fileType || !fileType.mime.startsWith('image/')) {
                            throw new Error(`Invalid image - unable to detect valid image format`);
                        }
                        mimeType = fileType.mime;
                    }
                    
                    // Update the content with processed image
                    message.content[j] = {
                        type: "image",
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
        let raw = await this.execute({ options: { stream: false } });
        return raw.message;
    }

    async json(schemaExample = null, schemaDescription = {}, { type = 'json_object', addExample = false, addSchema = true, addNote = false } = {}) {

        let options = {
            response_format: { type },
            stream: false,
        }

        let config = {
            system: this.config.system,
        }

        if (schemaExample) {
            config.schema = generateJsonSchema(schemaExample, schemaDescription);

            if (addSchema) {
                config.system += "\n\nOutput JSON Schema: \n```\n" + JSON.stringify(config.schema) + "\n```";
            }
            if (addExample) {
                config.system += "\n\nOutput JSON Example: \n```\n" + JSON.stringify(schemaExample) + "\n```";
            }
            if (addNote) {
                config.system += "\n\nOutput JSON Escape: double quotes, backslashes, and control characters inside JSON strings.\nEnsure the output contains no comments.";
            }
        }
        const { message } = await this.execute({ options, config });
        return JSON.parse(this._extractBlock(message));
    }

    _extractBlock(response) {
        const block = response.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return block ? block[1].trim() : response;
    }

    async block({ addSystemExtra = true } = {}) {
        let config = {
            system: this.config.system,
        }

        if (addSystemExtra) {
            config.system += "\nReturn the result of the task between triple backtick block code tags ```";
        }
        const { message } = await this.execute({ options: { stream: false }, config });
        return this._extractBlock(message);
    }

    async raw() {
        return this.execute({ options: { stream: false } });
    }

    async stream(callback) {
        this.streamCallback = callback;
        return this.execute({ options: { stream: true } });
    }

    replaceKeyFromFile(key, filePath) {
        const content = this.readFile(filePath);
        this.replace({ [key]: this._template(content, this.config.replace) });
        return this;
    }

    _template(input, replace) {
        if (!replace) return input;
        for (const k in replace) {
            input = input.split(/([¿?¡!,"';:\(\)\.\s])/).map(x => x === k ? replace[k] : x).join("");
        }
        return input;
    }

    groupByRoles(messages) {
        return messages.reduce((acc, currentMessage, index) => {
            if (index === 0 || currentMessage.role !== messages[index - 1].role) {
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

    applyTemplate() {
        if (!this.config.replace) return;

        this.config.system = this._template(this.config.system, this.config.replace);

        this.messages = this.messages.map(message => {
            if (message.content instanceof Array) {
                message.content = message.content.map(content => {
                    if (content.type === 'text') {
                        content.text = this._template(content.text, this.config.replace);
                    }
                    return content;
                });
            }
            return message;
        });
    }

    async prepareMessages() {
        await this.processImages();
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

    async execute({ config = {}, options = {} } = {}) {
        if (!this.models || this.models.length === 0) {
            throw new Error("No models specified. Use methods like .gpt41mini(), .sonnet4() first.");
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
                const optionsTools = providerInstance.getOptionsTools(this.tools);

                options = {
                    ...this.options,
                    ...providerInstance.options,
                    ...optionsTools,
                    ...options,
                    model: currentModelKey
                };

                config = {
                    ...this.config,
                    ...providerInstance.config,
                    ...config,
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

                    if (result.toolCalls.length > 0) {

                        if (result.message) {
                            if (result.signature) {
                                this.messages.push({
                                    role: "assistant", content: [{
                                        type: "thinking",
                                        thinking: result.think,
                                        signature: result.signature
                                    }]
                                });
                            } else {
                                this.addText(result.message, { role: "assistant" });
                            }
                        }

                        this.messages.push({ role: "assistant", content: result.toolCalls, tool_calls: result.toolCalls });

                        const content = await this.processToolCalls(result.toolCalls);
                        this.messages.push({ role: 'tool', content });

                        return this.execute();
                    }

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

    async processToolCalls(toolCalls) {
        const result = []

        for (const toolCall of toolCalls) {
            const client = this.toolClient[toolCall.function.name];

            const response = await client.callTool({
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments)
            });

            result.push({
                name: toolCall.function.name,
                tool_call_id: toolCall.id,
                content: response.content.map(item => item.text).join("\n")
            });
        }
        return result;
    }

    async addMCP() {

        const key = arguments[0];

        if (this.mcp[key]) {
            log.info(`MCP ${key} already attached.`);
            return;
        }

        if (this.config.max_history < 3) {
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

    convertMessages(messages, config) {
        return MixOpenAI.convertMessages(messages, config);
    }

    async create({ config = {}, options = {} } = {}) {
        try {

            options.messages = this.convertMessages(options.messages, config);

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
        return data.choices[0].delta.content;
    }

    static extractMessage(data) {
        const message = data.choices[0].message?.content?.trim() || '';
        const endTagIndex = message.indexOf('</think>');
        if (message.startsWith('<think>') && endTagIndex !== -1) {
            return message.substring(endTagIndex + 8).trim();
        }
        return message;
    }

    static extractThink(data) {

        if (data.choices[0].message?.reasoning_content) {
            return data.choices[0].message.reasoning_content;
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

    processResponse(response) {
        return {
            message: MixCustom.extractMessage(response.data),
            think: MixCustom.extractThink(response.data),
            toolCalls: MixCustom.extractToolCalls(response.data),
            response: response.data
        }
    }

    getOptionsTools(tools) {
        return MixOpenAI.getOptionsTools(tools);
    }
}

class MixOpenAI extends MixCustom {
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

        return super.create({ config, options });
    }

    static convertMessages(messages, config) {

        const content = config.system;
        messages = [{ role: 'system', content }, ...messages || []];

        const results = []
        for (const message of messages) {

            if (message.tool_calls) {
                results.push({ role: 'assistant', tool_calls: message.tool_calls })
                continue;
            }

            if (message.role === 'tool') {
                for (const content of message.content) {
                    results.push({ role: 'tool', ...content })
                }
                continue;
            }

            if (Array.isArray(message.content))
                for (const content of message.content) {
                    if (content.type === 'image') {
                        const { type, media_type, data } = content.source;
                        message.content = [{
                            type: 'image_url',
                            image_url: {
                                url: `data:${media_type};${type},${data}`
                            }
                        }];
                    }
                }

            results.push(message);
        }
        return results;
    }

    static getOptionsTools(tools) {
        const options = {};
        options.tools = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                options.tools.push({
                    type: 'function',
                    function: {
                        name: item.name,
                        description: item.description,
                        parameters: item.inputSchema
                    }
                });
            }
        }

        // options.tool_choice = "auto";

        return options;
    }
}

class MixAnthropic extends MixCustom {

    static thinkingOptions = {
        thinking: {
            "type": "enabled",
            "budget_tokens": 1024
        },
        temperature: 1
    };

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

        // Remove top_p for thinking
        if (options.thinking) {
            delete options.top_p;
        }

        delete options.response_format;

        options.system = config.system;
        return super.create({ config, options });
    }

    convertMessages(messages, config) {
        return MixAnthropic.convertMessages(messages, config);
    }

    static convertMessages(messages, config) {
        return messages.map(message => {
            if (message.role === 'tool') {
                return {
                    role: "user",
                    content: message.content.map(content => ({
                        type: "tool_result",
                        tool_use_id: content.tool_call_id,
                        content: content.content
                    }))
                }
            }

            message.content = message.content.map(content => {
                if (content.type === 'function') {
                    return {
                        type: 'tool_use',
                        id: content.id,
                        name: content.function.name,
                        input: JSON.parse(content.function.arguments)
                    }
                }
                return content;
            });

            return message;
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
        if (data.content?.[1]?.text) {
            return data.content[1].text;
        }
        return data.content[0].text;
    }

    static extractThink(data) {
        return data.content[0]?.thinking || null;
    }

    static extractSignature(data) {
        return data.content[0]?.signature || null;
    }

    processResponse(response) {
        return {
            message: MixAnthropic.extractMessage(response.data),
            think: MixAnthropic.extractThink(response.data),
            toolCalls: MixAnthropic.extractToolCalls(response.data),
            response: response.data,
            signature: MixAnthropic.extractSignature(response.data)
        }
    }

    getOptionsTools(tools) {
        return MixAnthropic.getOptionsTools(tools);
    }

    static getOptionsTools(tools) {
        const options = {};
        options.tools = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                options.tools.push({
                    type: 'custom',
                    name: item.name,
                    description: item.description,
                    input_schema: item.inputSchema
                });
            }
        }

        return options;
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
}

class MixGoogle extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            apiKey: process.env.GOOGLE_API_KEY,
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

            if (!Array.isArray(message.content)) return message;
            const role = (message.role === 'assistant' || message.role === 'tool') ? 'model' : 'user'

            if (message.role === 'tool') {
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
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Google API key not found. Please provide it in config or set GOOGLE_API_KEY environment variable.');
        }

        const generateContentApi = options.stream ? 'streamGenerateContent' : 'generateContent';

        const fullUrl = `${this.config.url}/${options.model}:${generateContentApi}?key=${this.config.apiKey}`;


        const content = config.system;
        const systemInstruction = { parts: [{ text: content }] };

        options.messages = MixGoogle.convertMessages(options.messages);

        const generationConfig = {
            topP: options.top_p,
            maxOutputTokens: options.max_tokens,
        }

        generationConfig.responseMimeType = "text/plain";

        const payload = {
            generationConfig,
            systemInstruction,
            contents: options.messages,
            tools: options.tools
        };

        try {
            if (config.debug) {
                log.debug("config");
                log.info(config);
                log.debug("payload");
                log.inspect(payload);
            }

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

    processResponse(response) {
        return {
            message: MixGoogle.extractMessage(response.data),
            think: null,
            toolCalls: MixGoogle.extractToolCalls(response.data),
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
                    }
                };
            }
            return null;
        }).filter(item => item !== null) || [];
    }

    static extractMessage(data) {
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    static getOptionsTools(tools) {
        const functionDeclarations = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                functionDeclarations.push({
                    name: item.name,
                    description: item.description,
                    parameters: item.inputSchema
                });
            }
        }

        const options = {
            tools: [{
                functionDeclarations
            }]
        };

        return options;
    }

    getOptionsTools(tools) {
        return MixGoogle.getOptionsTools(tools);
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixOpenAI, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle };