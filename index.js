const axios = require('axios');
const fs = require('fs');
const { fromBuffer } = require('file-type');
const { inspect } = require('util');
const log = require('lemonlog')('ModelMix');
const Bottleneck = require('bottleneck');
const path = require('path');
const generateJsonSchema = require('./schema');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { MCPToolsManager } = require('./mcp-tools');

class ModelMix {

    constructor({ options = {}, config = {}, mix = {} } = {}) {
        this.models = [];
        this.messages = [];
        this.tools = {};
        this.toolClient = {};
        this.mcp = {};
        this.mcpToolsManager = new MCPToolsManager();
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
            max_history: 1, // Default max history
            debug: 0, // 0=silent, 1=minimal, 2=readable summary, 3=full details
            bottleneck: defaultBottleneckConfig,
            roundRobin: false, // false=fallback mode, true=round robin rotation
            ...config
        }
        const freeMix = { openrouter: true, cerebras: true, groq: true, together: false, lambda: false };
        this.mix = { ...freeMix, ...mix };

        this.limiter = new Bottleneck(this.config.bottleneck);

    }

    replace(keyValues) {
        this.config.replace = { ...this.config.replace, ...keyValues };
        return this;
    }

    static new({ options = {}, config = {}, mix = {} } = {}) {
        return new ModelMix({ options, config, mix });
    }

    new({ options = {}, config = {}, mix = {} } = {}) {
        const instance = new ModelMix({ options: { ...this.options, ...options }, config: { ...this.config, ...config }, mix: { ...this.mix, ...mix } });
        instance.models = this.models; // Share models array for round-robin rotation
        return instance;
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
    static truncate(str, maxLen = 100) {
        if (!str || typeof str !== 'string') return str;
        return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    static formatInputSummary(messages, system) {
        const lastMessage = messages[messages.length - 1];
        let inputText = '';

        if (lastMessage && Array.isArray(lastMessage.content)) {
            const textContent = lastMessage.content.find(c => c.type === 'text');
            if (textContent) inputText = textContent.text;
        } else if (lastMessage && typeof lastMessage.content === 'string') {
            inputText = lastMessage.content;
        }

        const systemStr = `System: ${ModelMix.truncate(system, 50)}`;
        const inputStr = `Input: ${ModelMix.truncate(inputText, 120)}`;
        const msgCount = `(${messages.length} msg${messages.length !== 1 ? 's' : ''})`;

        return `${systemStr} \n| ${inputStr} ${msgCount}`;
    }

    static formatOutputSummary(result, debug) {
        const parts = [];
        if (result.message) {
            // Try to parse as JSON for better formatting
            try {
                const parsed = JSON.parse(result.message.trim());
                // If it's valid JSON and debug >= 2, show it formatted
                if (debug >= 2) {
                    parts.push(`Output (JSON):\n${ModelMix.formatJSON(parsed)}`);
                } else {
                    parts.push(`Output: ${ModelMix.truncate(result.message, 150)}`);
                }
            } catch (e) {
                // Not JSON, show truncated as before
                parts.push(`Output: ${ModelMix.truncate(result.message, 150)}`);
            }
        }
        if (result.think) {
            parts.push(`Think: ${ModelMix.truncate(result.think, 80)}`);
        }
        if (result.toolCalls && result.toolCalls.length > 0) {
            const toolNames = result.toolCalls.map(t => t.function?.name || t.name).join(', ');
            parts.push(`Tools: ${toolNames}`);
        }
        return parts.join(' | ');
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

    gpt41({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1', new MixOpenAI({ options, config }));
    }
    gpt41mini({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-mini', new MixOpenAI({ options, config }));
    }
    gpt41nano({ options = {}, config = {} } = {}) {
        return this.attach('gpt-4.1-nano', new MixOpenAI({ options, config }));
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
        return this.attach('gpt-5.1', new MixOpenAI({ options, config }));
    }
    gpt52({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.2', new MixOpenAI({ options, config }));
    }
    gpt52chat({ options = {}, config = {} } = {}) {
        return this.attach('gpt-5.2-chat-latest', new MixOpenAI({ options, config }));
    }
    gptOss({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('openai/gpt-oss-120b', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('gpt-oss-120b', new MixCerebras({ options, config }));
        if (mix.groq) this.attach('openai/gpt-oss-120b', new MixGroq({ options, config }));
        if (mix.openrouter) this.attach('openai/gpt-oss-120b:free', new MixOpenRouter({ options, config }));
        return this;
    }
    opus45({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-5-20251101', new MixAnthropic({ options, config }));
    }
    opus41({ options = {}, config = {} } = {}) {
        return this.attach('claude-opus-4-1-20250805', new MixAnthropic({ options, config }));
    }
    opus41think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-opus-4-1-20250805', new MixAnthropic({ options, config }));
    }
    sonnet4({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-4-20250514', new MixAnthropic({ options, config }));
    }
    sonnet4think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-sonnet-4-20250514', new MixAnthropic({ options, config }));
    }
    sonnet45({ options = {}, config = {} } = {}) {
        return this.attach('claude-sonnet-4-5-20250929', new MixAnthropic({ options, config }));
    }
    sonnet45think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-sonnet-4-5-20250929', new MixAnthropic({ options, config }));
    }
    sonnet37({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-7-sonnet-20250219', new MixAnthropic({ options, config }));
    }
    sonnet37think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-3-7-sonnet-20250219', new MixAnthropic({ options, config }));
    }
    haiku35({ options = {}, config = {} } = {}) {
        return this.attach('claude-3-5-haiku-20241022', new MixAnthropic({ options, config }));
    }
    haiku45({ options = {}, config = {} } = {}) {
        return this.attach('claude-haiku-4-5-20251001', new MixAnthropic({ options, config }));
    }
    haiku45think({ options = {}, config = {} } = {}) {
        options = { ...MixAnthropic.thinkingOptions, ...options };
        return this.attach('claude-haiku-4-5-20251001', new MixAnthropic({ options, config }));
    }
    gemini25flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-flash', new MixGoogle({ options, config }));
    }
    gemini3pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3-pro-preview', new MixGoogle({ options, config }));
    }
    gemini3flash({ options = {}, config = {} } = {}) {
        return this.attach('gemini-3-flash-preview', new MixGoogle({ options, config }));
    }
    gemini25pro({ options = {}, config = {} } = {}) {
        return this.attach('gemini-2.5-pro', new MixGoogle({ options, config }));
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
    grok41think({ options = {}, config = {} } = {}) {
        return this.attach('grok-4-1-fast-reasoning', new MixGrok({ options, config }));
    }
    grok41({ options = {}, config = {} } = {}) {
        return this.attach('grok-4-1-fast-non-reasoning', new MixGrok({ options, config }));
    }

    qwen3({ options = {}, config = {}, mix = { together: true, cerebras: false } } = {}) {
        if (mix.together) this.attach('Qwen/Qwen3-235B-A22B-fp8-tput', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('qwen-3-32b', new MixCerebras({ options, config }));
        return this;
    }

    scout({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.groq) this.attach('meta-llama/llama-4-scout-17b-16e-instruct', new MixGroq({ options, config }));
        if (mix.together) this.attach('meta-llama/Llama-4-Scout-17B-16E-Instruct', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('llama-4-scout-17b-16e-instruct', new MixCerebras({ options, config }));
        return this;
    }
    maverick({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.groq) this.attach('meta-llama/llama-4-maverick-17b-128e-instruct', new MixGroq({ options, config }));
        if (mix.together) this.attach('meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', new MixTogether({ options, config }));
        if (mix.lambda) this.attach('llama-4-maverick-17b-128e-instruct-fp8', new MixLambda({ options, config }));
        return this;
    }

    deepseekR1({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.groq) this.attach('deepseek-r1-distill-llama-70b', new MixGroq({ options, config }));
        if (mix.together) this.attach('deepseek-ai/DeepSeek-R1', new MixTogether({ options, config }));
        if (mix.cerebras) this.attach('deepseek-r1-distill-llama-70b', new MixCerebras({ options, config }));
        if (mix.openrouter) this.attach('deepseek/deepseek-r1-0528:free', new MixOpenRouter({ options, config }));
        return this;
    }

    hermes3({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.lambda) this.attach('Hermes-3-Llama-3.1-405B-FP8', new MixLambda({ options, config }));
        if (mix.openrouter) this.attach('nousresearch/hermes-3-llama-3.1-405b:free', new MixOpenRouter({ options, config }));
        return this;
    }

    kimiK2({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('moonshotai/Kimi-K2-Instruct-0905', new MixTogether({ options, config }));
        if (mix.groq) this.attach('moonshotai/kimi-k2-instruct-0905', new MixGroq({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k2:free', new MixOpenRouter({ options, config }));
        return this;
    }

    kimiK25think({ options = {}, config = {}, mix = { together: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('moonshotai/Kimi-K2.5', new MixTogether({ options, config }));
        if (mix.fireworks) this.attach('accounts/fireworks/models/kimi-k2p5', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k2.5', new MixOpenRouter({ options, config }));
        return this;
    }    

    kimiK2think({ options = {}, config = {}, mix = { together: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.together) this.attach('moonshotai/Kimi-K2-Thinking', new MixTogether({ options, config }));
        if (mix.openrouter) this.attach('moonshotai/kimi-k2-thinking', new MixOpenRouter({ options, config }));
        return this;
    }

    lmstudio(model = 'lmstudio', { options = {}, config = {} } = {}) {
        return this.attach(model, new MixLMStudio({ options, config }));
    }

    minimaxM2({ options = {}, config = {} } = {}) {
        return this.attach('MiniMax-M2', new MixMiniMax({ options, config }));
    }

    minimaxM21({ options = {}, config = {}, mix = { minimax: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.minimax) this.attach('MiniMax-M2.1', new MixMiniMax({ options, config }));
        if (mix.cerebras) this.attach('MiniMax-M2.1', new MixCerebras({ options, config }));
        return this;
    }

    minimaxM2Stable({ options = {}, config = {} } = {}) {
        return this.attach('MiniMax-M2-Stable', new MixMiniMax({ options, config }));
    }

    deepseekV32({ options = {}, config = {}, mix = {} } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/deepseek-v3p2', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('deepseek/deepseek-v3.2', new MixOpenRouter({ options, config }));
        return this;
    }

    GLM47({ options = {}, config = {}, mix = { fireworks: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.fireworks) this.attach('accounts/fireworks/models/glm-4p7', new MixFireworks({ options, config }));
        if (mix.openrouter) this.attach('z-ai/glm-4.7', new MixOpenRouter({ options, config }));
        if (mix.cerebras) this.attach('zai-glm-4.7', new MixCerebras({ options, config }));
        return this;
    }

    GLM46({ options = {}, config = {}, mix = { cerebras: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.cerebras) this.attach('zai-glm-4.6', new MixCerebras({ options, config }));
        return this;
    }

    GLM45({ options = {}, config = {}, mix = { openrouter: true } } = {}) {
        mix = { ...this.mix, ...mix };
        if (mix.openrouter) this.attach('z-ai/glm-4.5-air:free', new MixOpenRouter({ options, config }));
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
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Image file not found: ${filePath}`);
        }

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

        this.messages.push({
            role,
            content: [{
                type: "image",
                source
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

        // Apply template replacements to system before adding extra instructions
        let systemWithReplacements = this._template(this.config.system, this.config.replace);

        let config = {
            system: systemWithReplacements,
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
        return block ? block[1].trim() : response.trim();
    }

    async block({ addSystemExtra = true } = {}) {
        // Apply template replacements to system before adding extra instructions
        let systemWithReplacements = this._template(this.config.system, this.config.replace);

        let config = {
            system: systemWithReplacements,
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
        try {
            const content = this.readFile(filePath);
            this.replace({ [key]: this._template(content, this.config.replace) });
        } catch (error) {
            // Gracefully handle file read errors without throwing
            log.warn(`replaceKeyFromFile: ${error.message}`);
        }
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
            // Don't group tool messages or assistant messages with tool_calls
            // Each tool response must be separate with its own tool_call_id
            const shouldNotGroup = currentMessage.role === 'tool' ||
                currentMessage.tool_calls ||
                currentMessage.tool_call_id;

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

        // Smart message slicing to preserve tool call sequences
        if (this.config.max_history > 0) {
            let sliceStart = Math.max(0, this.messages.length - this.config.max_history);

            // If we're slicing and there's a tool message at the start, 
            // ensure we include the preceding assistant message with tool_calls
            while (sliceStart > 0 &&
                sliceStart < this.messages.length &&
                this.messages[sliceStart].role === 'tool') {
                sliceStart--;
                // Also need to include the assistant message with tool_calls
                if (sliceStart > 0 &&
                    this.messages[sliceStart].role === 'assistant' &&
                    this.messages[sliceStart].tool_calls) {
                    break;
                }
            }

            this.messages = this.messages.slice(sliceStart);
        }

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
            throw new Error("No models specified. Use methods like .gpt5(), .sonnet4() first.");
        }

        return this.limiter.schedule(async () => {
            await this.prepareMessages();

            if (this.messages.length === 0) {
                throw new Error("No user messages have been added. Use addText(prompt), addTextFromFile(filePath), addImage(filePath), or addImageFromUrl(url) to add a prompt.");
            }

            // Merge config to get final roundRobin value
            const finalConfig = { ...this.config, ...config };

            // Try all models in order (first is primary, rest are fallbacks)
            const modelsToTry = this.models.map((model, index) => ({ model, index }));

            // Round robin: rotate models array AFTER using current for next request
            if (finalConfig.roundRobin && this.models.length > 1) {
                const firstModel = this.models.shift();
                this.models.push(firstModel);
            }

            let lastError = null;

            for (let i = 0; i < modelsToTry.length; i++) {

                const { model: currentModel, index: originalIndex } = modelsToTry[i];
                const currentModelKey = currentModel.key;
                const providerInstance = currentModel.provider;
                const optionsTools = providerInstance.getOptionsTools(this.tools);

                // Create clean copies for each provider to avoid contamination
                const currentOptions = {
                    ...this.options,
                    ...providerInstance.options,
                    ...optionsTools,
                    ...options,
                    model: currentModelKey
                };

                const currentConfig = {
                    ...this.config,
                    ...providerInstance.config,
                    ...config,
                };

                if (currentConfig.debug >= 1) {
                    const isPrimary = i === 0;
                    const prefix = isPrimary ? '→' : '↻';
                    const suffix = isPrimary
                        ? (currentConfig.roundRobin ? ` (round-robin #${originalIndex + 1})` : '')
                        : ' (fallback)';
                    // Extract provider name from class name (e.g., "MixOpenRouter" -> "openrouter")
                    const providerName = providerInstance.constructor.name.replace(/^Mix/, '').toLowerCase();
                    const header = `\n${prefix} [${providerName}:${currentModelKey}] #${originalIndex + 1}${suffix}`;

                    if (currentConfig.debug >= 2) {
                        console.log(`${header} | ${ModelMix.formatInputSummary(this.messages, currentConfig.system)}`);
                    } else {
                        console.log(header);
                    }
                }

                try {
                    if (currentOptions.stream && this.streamCallback) {
                        providerInstance.streamCallback = this.streamCallback;
                    }

                    const result = await providerInstance.create({ options: currentOptions, config: currentConfig });

                    if (result.toolCalls && result.toolCalls.length > 0) {

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

                        this.messages.push({ role: "assistant", content: null, tool_calls: result.toolCalls });

                        const toolResults = await this.processToolCalls(result.toolCalls);
                        for (const toolResult of toolResults) {
                            this.messages.push({
                                role: 'tool',
                                tool_call_id: toolResult.tool_call_id,
                                content: toolResult.content
                            });
                        }

                        return this.execute();
                    }

                    // debug level 1: Just success indicator
                    if (currentConfig.debug === 1) {
                        console.log(`✓ Success`);
                    }

                    // debug level 2: Readable summary of output
                    if (currentConfig.debug >= 2) {
                        console.log(`✓ ${ModelMix.formatOutputSummary(result, currentConfig.debug).trim()}`);
                    }

                    // debug level 3 (debug): Full response details
                    if (currentConfig.debug >= 3) {
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

                    return result;

                } catch (error) {
                    lastError = error;
                    log.warn(`Model ${currentModelKey} failed (Attempt #${i + 1}/${modelsToTry.length}).`);
                    if (error.message) log.warn(`Error: ${error.message}`);
                    if (error.statusCode) log.warn(`Status Code: ${error.statusCode}`);
                    if (error.details) log.warn(`Details:\n${ModelMix.formatJSON(error.details)}`);

                    if (i === modelsToTry.length - 1) {
                        console.error(`All ${modelsToTry.length} model(s) failed. Throwing last error from ${currentModelKey}.`);
                        throw lastError;
                    } else {
                        const nextModelKey = modelsToTry[i + 1].model.key;
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

    addTool(toolDefinition, callback) {

        if (this.config.max_history < 3) {
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

class MixCustom {
    constructor({ config = {}, options = {}, headers = {} } = {}) {
        this.config = this.getDefaultConfig(config);
        this.options = this.getDefaultOptions(options);
        this.headers = this.getDefaultHeaders(headers);
        this.streamCallback = null; // Define streamCallback here
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

            // debug level 3 (debug): Full request details
            if (config.debug >= 3) {
                console.log('\n[REQUEST DETAILS]');

                console.log('\n[CONFIG]');
                const configToLog = { ...config };
                delete configToLog.debug;
                console.log(ModelMix.formatJSON(configToLog));

                console.log('\n[OPTIONS]');
                console.log(ModelMix.formatJSON(options));
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

            response.data.on('end', () => resolve({
                response: raw,
                message: message.trim(),
                toolCalls: [],
                think: null
            }));
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
        } else if (data.choices[0].message?.reasoning) {
            return data.choices[0].message.reasoning;
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

        // Use max_completion_tokens and remove temperature for GPT-5 models
        if (options.model?.includes('gpt-5')) {
            if (options.max_tokens) {
                options.max_completion_tokens = options.max_tokens;
                delete options.max_tokens;
            }
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
                // Handle new format: tool_call_id directly on message
                if (message.tool_call_id) {
                    results.push({
                        role: 'tool',
                        tool_call_id: message.tool_call_id,
                        content: message.content
                    });
                }
                // Handle old format: content is an array
                else if (Array.isArray(message.content)) {
                    for (const content of message.content) {
                        results.push({
                            role: 'tool',
                            tool_call_id: content.tool_call_id,
                            content: content.content
                        })
                    }
                }
                continue;
            }

            if (Array.isArray(message.content)) {
                message.content = message.content.filter(content => content !== null && content !== undefined).map(content => {
                    if (content && content.type === 'image') {
                        const { media_type, data } = content.source;
                        return {
                            type: 'image_url',
                            image_url: {
                                url: `data:${media_type};base64,${data}`
                            }
                        };
                    }
                    return content;
                });
            }

            results.push(message);
        }

        return results;
    }

    static getOptionsTools(tools) {
        const options = {};
        const toolsArray = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                toolsArray.push({
                    type: 'function',
                    function: {
                        name: item.name,
                        description: item.description,
                        parameters: item.inputSchema
                    }
                });
            }
        }

        // Solo incluir tools si el array no está vacío
        if (toolsArray.length > 0) {
            options.tools = toolsArray;
            // options.tool_choice = "auto";
        }

        return options;
    }
}

class MixOpenRouter extends MixOpenAI {
    getDefaultConfig(customConfig) {

        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('OpenRouter API key not found. Please provide it in config or set OPENROUTER_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey: process.env.OPENROUTER_API_KEY,
            ...customConfig
        });
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

        delete options.response_format;

        options.system = config.system;

        try {
            return await super.create({ config, options });
        } catch (error) {
            // Log the error details for debugging
            if (error.response && error.response.data) {
                log.error('Anthropic API Error:\n', error.response.data);
            }
            throw error;
        }
    }

    convertMessages(messages, config) {
        return MixAnthropic.convertMessages(messages, config);
    }

    static convertMessages(messages, config) {
        // Filter out orphaned tool results for Anthropic
        const filteredMessages = [];
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'tool') {
                // Check if there's a preceding assistant message with tool_calls
                let foundToolCall = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (messages[j].role === 'assistant' && messages[j].tool_calls) {
                        foundToolCall = true;
                        break;
                    }
                }
                if (!foundToolCall) {
                    // Skip orphaned tool results
                    continue;
                }
            }
            filteredMessages.push(messages[i]);
        }

        return filteredMessages.map(message => {
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

            // Handle messages with tool_calls (assistant messages that call tools)
            if (message.tool_calls) {
                const content = message.tool_calls.map(call => ({
                    type: 'tool_use',
                    id: call.id,
                    name: call.function.name,
                    input: JSON.parse(call.function.arguments)
                }));
                return { role: 'assistant', content };
            }

            // Handle content conversion for other messages
            if (message.content && Array.isArray(message.content)) {
                message.content = message.content.filter(content => content !== null && content !== undefined).map(content => {
                    if (content && content.type === 'function') {
                        return {
                            type: 'tool_use',
                            id: content.id,
                            name: content.function.name,
                            input: JSON.parse(content.function.arguments)
                        }
                    }
                    return content;
                });
            }

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
        const toolsArray = [];
        for (const tool in tools) {
            for (const item of tools[tool]) {
                toolsArray.push({
                    name: item.name,
                    description: item.description,
                    input_schema: item.inputSchema
                });
            }
        }

        // Solo incluir tools si el array no está vacío
        if (toolsArray.length > 0) {
            options.tools = toolsArray;
        }

        return options;
    }
}

class MixMiniMax extends MixOpenAI {
    getDefaultConfig(customConfig) {

        if (!process.env.MINIMAX_API_KEY) {
            throw new Error('MiniMax API key not found. Please provide it in config or set MINIMAX_API_KEY environment variable.');
        }

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.minimax.io/v1/chat/completions',
            apiKey: process.env.MINIMAX_API_KEY,
            ...customConfig
        });
    }

    extractDelta(data) {
        // MiniMax might send different formats during streaming
        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            return data.choices[0].delta.content;
        }
        return '';
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

    create({ config = {}, options = {} } = {}) {
        if (config.schema) {
            options.response_format = {
                type: 'json_schema',
                json_schema: { schema: config.schema }
            };
        }
        return super.create({ config, options });
    }

    static extractThink(data) {
        const message = data.choices[0].message?.content?.trim() || '';

        // Check for LMStudio special tags
        const startTag = '<|channel|>analysis<|message|>';
        const endTag = '<|end|><|start|>assistant<|channel|>final<|message|>';

        const startIndex = message.indexOf(startTag);
        const endIndex = message.indexOf(endTag);

        if (startIndex !== -1 && endIndex !== -1) {
            // Extract content between the special tags
            const thinkContent = message.substring(startIndex + startTag.length, endIndex).trim();
            return thinkContent;
        }

        // Fall back to default extraction method
        return MixCustom.extractThink(data);
    }

    static extractMessage(data) {
        const message = data.choices[0].message?.content?.trim() || '';

        // Check for LMStudio special tags and extract final message
        const endTag = '<|end|><|start|>assistant<|channel|>final<|message|>';
        const endIndex = message.indexOf(endTag);

        if (endIndex !== -1) {
            // Return only the content after the final message tag
            return message.substring(endIndex + endTag.length).trim();
        }

        // Fall back to default extraction method
        return MixCustom.extractMessage(data);
    }

    processResponse(response) {
        return {
            message: MixLMStudio.extractMessage(response.data),
            think: MixLMStudio.extractThink(response.data),
            toolCalls: MixCustom.extractToolCalls(response.data),
            response: response.data
        };
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

    create({ config = {}, options = {} } = {}) {
        delete options.response_format;
        return super.create({ config, options });
    }
}

class MixFireworks extends MixCustom {
    getDefaultConfig(customConfig) {

        if (!process.env.FIREWORKS_API_KEY) {
            throw new Error('Fireworks API key not found. Please provide it in config or set FIREWORKS_API_KEY environment variable.');
        }

        return super.getDefaultConfig({
            url: 'https://api.fireworks.ai/inference/v1/chat/completions',
            apiKey: process.env.FIREWORKS_API_KEY,
            ...customConfig
        });
    }
}

class MixGoogle extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            apiKey: process.env.GEMINI_API_KEY,
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

            // Handle assistant messages with tool_calls (content is null)
            if (message.role === 'assistant' && message.tool_calls) {
                return {
                    role: 'model',
                    parts: message.tool_calls.map(toolCall => ({
                        functionCall: {
                            name: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments)
                        },
                        thought_signature: toolCall.thought_signature || ""
                    }))
                }
            }

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
            throw new Error('Gemini API key not found. Please provide it in config or set GEMINI_API_KEY environment variable.');
        }

        const generateContentApi = options.stream ? 'streamGenerateContent' : 'generateContent';

        const fullUrl = `${this.config.url}/${options.model}:${generateContentApi}?key=${this.config.apiKey}`;


        const content = config.system;
        const systemInstruction = { parts: [{ text: content }] };

        options.messages = MixGoogle.convertMessages(options.messages);

        const generationConfig = {
            maxOutputTokens: options.max_tokens,
        }

        if (options.top_p) {
            generationConfig.topP = options.top_p;
        }

        generationConfig.responseMimeType = "text/plain";

        const payload = {
            generationConfig,
            systemInstruction,
            contents: options.messages,
            tools: options.tools
        };

        try {
            // debug level 3 (debug): Full request details
            if (config.debug >= 3) {
                console.log('\n[REQUEST DETAILS - GOOGLE]');

                console.log('\n[CONFIG]');
                const configToLog = { ...config };
                delete configToLog.debug;
                console.log(ModelMix.formatJSON(configToLog));

                console.log('\n[PAYLOAD]');
                console.log(ModelMix.formatJSON(payload));
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
                    },
                    thought_signature: part.thoughtSignature || ""
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

        const options = {};
        
        // Solo incluir tools si el array no está vacío
        if (functionDeclarations.length > 0) {
            options.tools = [{
                functionDeclarations
            }];
        }

        return options;
    }

    getOptionsTools(tools) {
        return MixGoogle.getOptionsTools(tools);
    }
}

module.exports = { MixCustom, ModelMix, MixAnthropic, MixMiniMax, MixOpenAI, MixOpenRouter, MixPerplexity, MixOllama, MixLMStudio, MixGroq, MixTogether, MixGrok, MixCerebras, MixGoogle, MixFireworks };