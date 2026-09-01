const { fetchJsonResponse } = require('../../http-client');
const { isPlainObject } = require('../object-utils');
const {
    normalizeContentCache,
    stripContentCacheMetadata
} = require('../content-cache');
const { requireProviderApiKey } = require('../provider-api-key');
const { normalizeOpenAIOptions } = require('./openai-options');

function createOpenAIProviders({
    ModelMix,
    MixCustom,
    MixOpenAI,
    MixModeration,
    rejectsAnthropicSamplingParams
}) {
    const WebSocket = require('ws');

    class MixOpenAIResponses extends MixOpenAI {
        async create({ config = {}, options = {} } = {}) {
            normalizeOpenAIOptions(options);
            const responsesUrl = this.config.url.replace('/chat/completions', '/responses');
            const request = MixOpenAIResponses.buildResponsesRequest(options, config);
            const response = await fetchJsonResponse(responsesUrl, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(request)
            });
    
            return MixOpenAIResponses.processResponsesResponse(response);
        }
    
        static buildResponsesRequest(options = {}, config = {}) {
            const isGPT56 = typeof options.model === 'string' && options.model.startsWith('gpt-5.6');
            const input = MixOpenAIResponses.messagesToResponsesInput(options.messages, {
                translateNeutralCache: isGPT56
            });
            if (config.system) {
                input.unshift({ role: 'developer', content: [{ type: 'input_text', text: config.system }] });
            }
            MixOpenAIResponses.validatePromptCaching(options, input);
            const request = {
                model: options.model,
                input,
                stream: false
            };
    
            if (options.reasoning_effort) request.reasoning = { effort: options.reasoning_effort };
            if (options.verbosity) request.text = { verbosity: options.verbosity };
    
            if (options.response_format) {
                const rf = options.response_format;
                let format;
                if (rf.type === 'json_schema' && rf.json_schema) {
                    format = {
                        type: 'json_schema',
                        name: rf.json_schema.name || 'response',
                        strict: true,
                        schema: rf.json_schema.schema
                    };
                } else if (rf.type) {
                    format = { type: rf.type };
                }
                if (format) {
                    request.text = { ...request.text, format };
                }
            }
    
            if (typeof options.max_completion_tokens === 'number') {
                request.max_output_tokens = options.max_completion_tokens;
            } else if (typeof options.max_tokens === 'number') {
                request.max_output_tokens = options.max_tokens;
            }
    
            if (typeof options.temperature === 'number') request.temperature = options.temperature;
            if (typeof options.top_p === 'number') request.top_p = options.top_p;
            if (typeof options.presence_penalty === 'number') request.presence_penalty = options.presence_penalty;
            if (typeof options.frequency_penalty === 'number') request.frequency_penalty = options.frequency_penalty;
            if (options.stop !== undefined) request.stop = options.stop;
            if (typeof options.n === 'number') request.n = options.n;
            if (options.logit_bias !== undefined) request.logit_bias = options.logit_bias;
            if (options.user !== undefined) request.user = options.user;
            if (options.prompt_cache_key !== undefined) request.prompt_cache_key = options.prompt_cache_key;
            if (options.prompt_cache_retention !== undefined) request.prompt_cache_retention = options.prompt_cache_retention;
            if (options.prompt_cache_options !== undefined) request.prompt_cache_options = options.prompt_cache_options;
    
            return request;
        }
    
        static validatePromptCaching(options, input) {
            const isGPT56 = typeof options.model === 'string' && options.model.startsWith('gpt-5.6');
            const cacheOptions = options.prompt_cache_options;
            const breakpoints = input.flatMap(message => Array.isArray(message.content)
                ? message.content
                    .filter(block => block?.prompt_cache_breakpoint !== undefined)
                    .map(block => block.prompt_cache_breakpoint)
                : []);
    
            if (isGPT56 && options.prompt_cache_retention !== undefined) {
                throw new Error('GPT-5.6 does not support prompt_cache_retention; use prompt_cache_options.ttl instead.');
            }
            if (!isGPT56 && cacheOptions !== undefined) {
                throw new Error('prompt_cache_options is only supported by GPT-5.6 models.');
            }
            if (!isGPT56 && breakpoints.length > 0) {
                throw new Error('prompt_cache_breakpoint is only supported by GPT-5.6 models.');
            }
            if (cacheOptions !== undefined) {
                if (!isPlainObject(cacheOptions)) {
                    throw new TypeError('prompt_cache_options must be a plain non-null object.');
                }
                if (cacheOptions.mode !== undefined
                    && cacheOptions.mode !== 'implicit'
                    && cacheOptions.mode !== 'explicit') {
                    throw new TypeError('prompt_cache_options.mode must be "implicit" or "explicit".');
                }
                if (cacheOptions.ttl !== undefined && cacheOptions.ttl !== '30m') {
                    throw new TypeError('prompt_cache_options.ttl must be "30m".');
                }
            }
            for (const breakpoint of breakpoints) {
                if (!isPlainObject(breakpoint)) {
                    throw new TypeError('prompt_cache_breakpoint must be a plain non-null object.');
                }
                if (breakpoint.mode !== 'explicit') {
                    throw new TypeError('prompt_cache_breakpoint mode must be "explicit".');
                }
            }
        }
    
        static processResponsesResponse(response) {
            const message = MixOpenAIResponses.extractResponsesMessage(response.data);
            return {
                message,
                think: null,
                toolCalls: [],
                tokens: MixOpenAIResponses.extractResponsesTokens(response.data),
                response: response.data
            };
        }
    
        static extractResponsesTokens(data) {
            if (data.usage) {
                return ModelMix.normalizeTokenUsage({
                    input: data.usage.input_tokens || 0,
                    output: data.usage.output_tokens || 0,
                    total: data.usage.total_tokens,
                    cached: ModelMix.extractCacheTokens(data.usage),
                    cacheWrite: ModelMix.extractCacheWriteTokens(data.usage)
                });
            }
            return ModelMix.normalizeTokenUsage();
        }
    
        static extractResponsesMessage(data) {
            if (!Array.isArray(data.output)) return '';
            return data.output
                .filter(item => item.type === 'message')
                .flatMap(item => Array.isArray(item.content) ? item.content : [])
                .filter(content => content.type === 'output_text' && typeof content.text === 'string')
                .map(content => content.text)
                .join('\n')
                .trim();
        }
    
        static messagesToResponsesInput(messages = [], { translateNeutralCache = false } = {}) {
            const mapped = [];
    
            for (const message of messages) {
                if (!message || !message.role) continue;
                if (message.tool_calls || message.role === 'tool') continue;
    
                const content = [];
                const isAssistant = message.role === 'assistant';
                const textType = isAssistant ? 'output_text' : 'input_text';
                if (typeof message.content === 'string') {
                    if (message.content) content.push({ type: textType, text: message.content });
                } else if (Array.isArray(message.content)) {
                    for (const item of message.content) {
                        if (!item || typeof item !== 'object') continue;
                        const neutralCache = item.cache !== undefined
                            ? normalizeContentCache(item.cache)
                            : undefined;
                        const promptCacheBreakpoint = item.prompt_cache_breakpoint !== undefined
                            ? item.prompt_cache_breakpoint
                            : (translateNeutralCache && neutralCache?.breakpoint
                                ? { mode: 'explicit' }
                                : undefined);
                        const breakpoint = !isAssistant && promptCacheBreakpoint !== undefined
                            ? { prompt_cache_breakpoint: promptCacheBreakpoint }
                            : {};
    
                        if ((item.type === 'text' || item.type === 'input_text' || item.type === 'output_text')
                            && typeof item.text === 'string') {
                            content.push({ type: textType, text: item.text, ...breakpoint });
                            continue;
                        }
                        if (item.type === 'image' && item.source) {
                            let imageUrl;
                            if (item.source.type === 'base64') {
                                if (!item.source.media_type || typeof item.source.data !== 'string') {
                                    throw new TypeError('Responses base64 images require source.media_type and string source.data.');
                                }
                                imageUrl = `data:${item.source.media_type};base64,${item.source.data}`;
                            } else if (item.source.type === 'url' && typeof item.source.data === 'string') {
                                imageUrl = item.source.data;
                            } else {
                                throw new TypeError('Responses images must be processed to base64 or use a URL source.');
                            }
                            content.push({ type: 'input_image', image_url: imageUrl, ...breakpoint });
                            continue;
                        }
                        if (item.type === 'image_url' && typeof item.image_url?.url === 'string') {
                            content.push({ type: 'input_image', image_url: item.image_url.url, ...breakpoint });
                            continue;
                        }
                        if (item.type === 'input_image' || item.type === 'input_file') {
                            content.push({
                                ...stripContentCacheMetadata(item),
                                ...breakpoint
                            });
                        }
                    }
                }
    
                if (content.length === 0) continue;
                mapped.push({
                    role: message.role,
                    content
                });
            }
    
            return mapped;
        }
    }
    
    class MixOpenAIModeration extends MixModeration {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'OPENAI_API_KEY', 'OpenAI');
    
            return super.getDefaultConfig({
                url: 'https://api.openai.com/v1/moderations',
                apiKey,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {} } = {}) {
            if (options.stream) {
                throw new Error('Stream is not supported for OpenAI moderation');
            }
    
            const input = MixOpenAIModeration.messagesToModerationInput(options.messages);
            const response = await fetchJsonResponse(this.config.url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({ model: options.model, input })
            });
    
            return {
                moderation: response.data.results,
                tokens: ModelMix.normalizeTokenUsage(),
                response: response.data
            };
        }
    
        static messagesToModerationInput(messages = []) {
            const input = [];
    
            for (const message of messages) {
                if (typeof message.content === 'string') {
                    input.push({ type: 'text', text: message.content });
                    continue;
                }
                if (!Array.isArray(message.content)) continue;
    
                for (const content of message.content) {
                    if (content?.type === 'text') {
                        input.push({ type: 'text', text: content.text });
                    } else if (content?.type === 'image') {
                        const { media_type: mediaType, data } = content.source || {};
                        if (!mediaType || !data) {
                            throw new Error('OpenAI moderation images must be prepared as base64 data URLs');
                        }
                        input.push({
                            type: 'image_url',
                            image_url: { url: `data:${mediaType};base64,${data}` }
                        });
                    }
                }
            }
    
            return input;
        }
    }
    
    class ModerationMix extends ModelMix {
        static new(setup = {}) {
            return new ModerationMix(setup);
        }
    
        new({ options = {}, config = {} } = {}) {
            return new ModerationMix({
                options: { ...this.options, ...options },
                config: { ...this.config, ...config }
            });
        }
    
        attach(key, provider) {
            if (!(provider instanceof MixModeration)) {
                throw new Error('ModerationMix only accepts moderation providers.');
            }
            return super.attach(key, provider);
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
    
    class MixOpenAIWebSocket extends MixOpenAIResponses {
        getDefaultConfig(customConfig) {
            return super.getDefaultConfig({
                realtimeUrl: 'wss://api.openai.com/v1/realtime',
                websocketTimeoutMs: 120000,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {} } = {}) {
            normalizeOpenAIOptions(options);
            const mergedConfig = { ...this.config, ...config };
            const realtimeUrl = `${mergedConfig.realtimeUrl}?model=${encodeURIComponent(options.model)}`;
            const timeoutMs = mergedConfig.websocketTimeoutMs || 120000;
    
            return await new Promise((resolve, reject) => {
                const ws = new WebSocket(realtimeUrl, {
                    headers: {
                        authorization: `Bearer ${mergedConfig.apiKey}`
                    }
                });
    
                const events = [];
                let message = '';
                let settled = false;
                let finalResponse = null;
    
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    ws.close();
                    reject({
                        message: `Realtime WebSocket timed out after ${timeoutMs}ms`,
                        statusCode: null,
                        details: null
                    });
                }, timeoutMs);
    
                const cleanUp = () => clearTimeout(timeout);
    
                ws.on('open', () => {
                    const session = {
                        type: 'realtime',
                        output_modalities: ['text']
                    };
    
                    if (mergedConfig.system) session.instructions = mergedConfig.system;
                    if (Array.isArray(options.tools) && options.tools.length > 0) {
                        session.tools = options.tools;
                    }
    
                    ws.send(JSON.stringify({ type: 'session.update', session }));
    
                    const items = MixOpenAIWebSocket.messagesToConversationItems(options.messages);
                    for (const item of items) {
                        ws.send(JSON.stringify({
                            type: 'conversation.item.create',
                            item
                        }));
                    }
    
                    const responseConfig = { output_modalities: ['text'] };
                    if (typeof options.max_completion_tokens === 'number') {
                        responseConfig.max_output_tokens = Math.min(options.max_completion_tokens, 4096);
                    } else if (typeof options.max_tokens === 'number') {
                        responseConfig.max_output_tokens = Math.min(options.max_tokens, 4096);
                    }
                    if (Array.isArray(options.tools) && options.tools.length > 0) responseConfig.tools = options.tools;
    
                    ws.send(JSON.stringify({
                        type: 'response.create',
                        response: responseConfig
                    }));
                });
    
                ws.on('message', raw => {
                    let event;
                    try {
                        event = JSON.parse(raw.toString());
                    } catch {
                        return;
                    }
    
                    events.push(event);
    
                    const isTextDeltaEvent = event.type === 'response.text.delta' || event.type === 'response.output_text.delta';
                    if (isTextDeltaEvent) {
                        const delta = MixOpenAIWebSocket.extractDelta(event);
                        if (delta) {
                            message += delta;
                            if (this.streamCallback) {
                                this.streamCallback({ response: event, message, delta });
                            }
                        }
                        return;
                    }
    
                    if (event.type === 'response.done') {
                        finalResponse = event.response || null;
                        if (!message && finalResponse) {
                            message = MixOpenAIResponses.extractResponsesMessage(finalResponse);
                        }
    
                        if (!settled) {
                            settled = true;
                            cleanUp();
                            ws.close();
                            resolve({
                                message: message.trim(),
                                think: null,
                                toolCalls: [],
                                tokens: MixOpenAIResponses.extractResponsesTokens(finalResponse || {}),
                                response: {
                                    response: finalResponse,
                                    events
                                }
                            });
                        }
                        return;
                    }
    
                    if (event.type === 'error' && !settled) {
                        settled = true;
                        cleanUp();
                        ws.close();
                        reject({
                            message: event.error?.message || 'Realtime WebSocket error',
                            statusCode: null,
                            details: event.error || event
                        });
                    }
                });
    
                ws.on('error', error => {
                    if (settled) return;
                    settled = true;
                    cleanUp();
                    reject({
                        message: error.message || 'Realtime WebSocket connection error',
                        statusCode: null,
                        details: null,
                        stack: error.stack
                    });
                });
    
                ws.on('close', () => {
                    if (settled) return;
                    settled = true;
                    cleanUp();
                    reject({
                        message: 'Realtime WebSocket closed before response.done',
                        statusCode: null,
                        details: null
                    });
                });
            });
        }
    
        static messagesToConversationItems(messages = []) {
            const items = [];
    
            for (const message of messages) {
                if (!message || !message.role) continue;
                if (message.role === 'tool' || message.tool_calls) continue;
    
                const role = message.role === 'assistant' ? 'assistant' : (message.role === 'system' ? 'system' : 'user');
                const content = [];
    
                if (typeof message.content === 'string') {
                    content.push({
                        type: role === 'assistant' ? 'text' : 'input_text',
                        text: message.content
                    });
                } else if (Array.isArray(message.content)) {
                    for (const item of message.content) {
                        if (!item || item.type !== 'text' || typeof item.text !== 'string') continue;
                        content.push({
                            type: role === 'assistant' ? 'text' : 'input_text',
                            text: item.text
                        });
                    }
                }
    
                if (content.length === 0) continue;
                items.push({ type: 'message', role, content });
            }
    
            return items;
        }
    
        static extractDelta(event) {
            if (typeof event.delta === 'string') return event.delta;
            return '';
        }
    }
    
    class MixOpenRouter extends MixOpenAI {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'OPENROUTER_API_KEY', 'OpenRouter');
    
            return MixCustom.prototype.getDefaultConfig.call(this, {
                url: 'https://openrouter.ai/api/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }

        async create({ config = {}, options = {} } = {}) {
            if (rejectsAnthropicSamplingParams(options.model)) {
                delete options.temperature;
                delete options.top_p;
                delete options.top_k;
            }
            return super.create({ config, options });
        }
    }
    
    class MixKimi extends MixOpenAI {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'MOONSHOT_API_KEY', 'Moonshot');
    
            return MixCustom.prototype.getDefaultConfig.call(this, {
                url: 'https://api.moonshot.ai/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {} } = {}) {
            if (Object.hasOwn(options, 'max_tokens')) {
                options.max_completion_tokens = options.max_tokens;
                delete options.max_tokens;
            }
    
            delete options.temperature;
            delete options.top_p;
            delete options.n;
            delete options.presence_penalty;
            delete options.frequency_penalty;
    
            return super.create({ config, options });
        }
    
        extractDelta(data) {
            return data?.choices?.[0]?.delta?.content || '';
        }
    
        processResponse(response) {
            return {
                ...super.processResponse(response),
                assistantMessage: response.data?.choices?.[0]?.message
            };
        }
    }

    return {
        MixOpenAIResponses,
        MixOpenAIModeration,
        ModerationMix,
        MixOpenAIWebSocket,
        MixOpenRouter,
        MixKimi
    };
}

module.exports = createOpenAIProviders;
