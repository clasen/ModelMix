const {
    stripContentTypeHeader,
    createMultipartFormData,
    buildRequestBodyAndHeaders
} = require('../../multipart');
const {
    fetchJsonResponse,
    fetchStreamResponse
} = require('../../http-client');
const {
    stripContentCacheMetadata
} = require('../content-cache');
const { configForDebug, redactSecret } = require('../provider-debug');
const { requireProviderApiKey } = require('../provider-api-key');
const { normalizeOpenAIOptions } = require('./openai-options');
const {
    assertNoStoredSignal,
    throwIfAborted,
    validateProviderExecution
} = require('../abort-signal');

function createBaseProviders({ ModelMix }) {
    class MixCustom {
        constructor({ config = {}, options = {}, headers = {} } = {}) {
            assertNoStoredSignal(config, 'config');
            assertNoStoredSignal(options, 'options');
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
    
        sanitizeCacheOptions(options) {
            delete options.cache_control;
            delete options.prompt_cache_key;
            delete options.prompt_cache_options;
            delete options.prompt_cache_retention;
        }
    
        static stripContentTypeHeader(headers = {}) {
            return stripContentTypeHeader(headers);
        }
    
        static createMultipartFormData({ fields = {}, files = [] } = {}) {
            return createMultipartFormData({ fields, files });
        }
    
        static buildRequestBodyAndHeaders(options, headers) {
            return buildRequestBodyAndHeaders(options, headers);
        }
    
        async create({ config = {}, options = {}, signal } = {}) {
            validateProviderExecution(this, { config, options, signal });
            try {
                this.sanitizeCacheOptions(options);
                if (Array.isArray(options.messages)) {
                    options.messages = this.convertMessages(options.messages, config);
                }
    
                const request = buildRequestBodyAndHeaders(options, this.headers);
    
                // debug level 4 (verbose): Full request details
                if (config.debug >= 4) {
                    console.log('\n[REQUEST DETAILS]');
    
                    console.log('\n[CONFIG]');
                    console.log(ModelMix.formatJSON(configForDebug(config)));
    
                    console.log('\n[OPTIONS]');
                    console.log(ModelMix.formatJSON(request.options));
                }
    
                if (options.stream) {
                    return await this.processStream(await fetchStreamResponse(this.config.url, {
                        method: 'POST',
                        headers: request.headers,
                        body: request.body,
                        signal
                    }));
                } else {
                    return this.processResponse(await fetchJsonResponse(this.config.url, {
                        method: 'POST',
                        headers: request.headers,
                        body: request.body,
                        signal
                    }));
                }
            } catch (error) {
                throwIfAborted(signal);
                throw this.handleError(error);
            }
        }
    
        handleError(error) {
            let errorMessage = 'An error occurred in MixCustom';
            let statusCode = null;
            let errorDetails = null;
    
            if (error?.isHttpError || error?.response || typeof error?.statusCode === 'number') {
                statusCode = error.statusCode ?? error.response?.status ?? null;
                errorMessage = error.message || `Request to ${this.config.url} failed with status code ${statusCode}`;
                errorDetails = error.details ?? error.response?.data ?? null;
            } else if (error?.message) {
                errorMessage = error.message;
            }
    
            const formattedError = {
                message: redactSecret(errorMessage, this.config.apiKey),
                statusCode,
                details: redactSecret(errorDetails, this.config.apiKey),
                stack: redactSecret(error.stack, this.config.apiKey)
            };
    
            return formattedError;
        }
    
        processStream(response) {
            return new Promise((resolve, reject) => {
                let raw = [];
                let message = '';
                let buffer = '';
                let completed = false;
                let chatCompletion = false;
                let usage = {};
                let usageMetadata;
    
                response.data.on('data', chunk => {
                    buffer += chunk.toString();
    
                    let boundary;
                    while ((boundary = buffer.indexOf('\n')) !== -1) {
                        const dataStr = buffer.slice(0, boundary).trim();
                        buffer = buffer.slice(boundary + 1);
    
                        const firstBraceIndex = dataStr.indexOf('{');
                        if (dataStr === 'data: [DONE]' || dataStr === '[DONE]') {
                            completed = true;
                            continue;
                        }
                        if (firstBraceIndex === -1) continue;
    
                        const jsonStr = dataStr.slice(firstBraceIndex);
                        try {
                            const data = JSON.parse(jsonStr);
                            MixCustom.assertResponse(data);
                            chatCompletion ||= Array.isArray(data.choices);
                            completed ||= Boolean(data.choices?.[0]?.finish_reason);
                            raw.push(data);
                            usage = { ...usage, ...data.message?.usage, ...data.usage };
                            if (data.usageMetadata) usageMetadata = data.usageMetadata;
                            const delta = this.extractDelta(data);
                            message += delta;
                            if (this.streamCallback) {
                                this.streamCallback({ response: data, message, delta });
                            }
                        } catch (error) {
                            reject(error);
                            response.data.destroy();
                            return;
                        }
                    }
                });
    
                response.data.on('end', () => {
                    if (chatCompletion && !completed) {
                        reject(MixCustom.responseError(raw.at(-1), 'Provider stream ended without completing.'));
                        return;
                    }
                    resolve({
                        response: raw,
                        message: message.trim(),
                        toolCalls: [],
                        think: null,
                        tokens: this.constructor.extractTokens({ usage, usageMetadata })
                    });
                });
                response.data.on('error', reject);
            });
        }
    
        extractDelta(data) {
            return data.choices?.[0]?.delta?.content || '';
        }

        static responseError(data, message, statusCode = 502) {
            const error = new Error(message);
            error.statusCode = statusCode;
            error.details = data;
            return error;
        }

        static assertResponse(data) {
            const failure = data?.error || data?.choices?.find(choice => choice.error)?.error;
            if (failure || data?.choices?.some(choice => choice.finish_reason === 'error') || data?.status === 'failed') {
                throw MixCustom.responseError(
                    data,
                    failure?.message || 'Provider failed to complete the response.',
                    Number.isInteger(failure?.code) && failure.code >= 400 && failure.code <= 599 ? failure.code : 502
                );
            }
        }
    
        static extractMessage(data) {
            MixCustom.assertResponse(data);
            const choice = data?.choices?.[0] || {};
            const messageObj = choice.message || {};
            const finishReason = choice.finish_reason;
    
            if (typeof messageObj.refusal === 'string' && messageObj.refusal.trim().length > 0) {
                throw new Error(`OpenAI model refused to process this request: ${messageObj.refusal}`);
            }
    
            if (finishReason === 'content_filter') {
                throw new Error('OpenAI response was blocked by content_filter.');
            }
    
            let message = '';
            if (typeof messageObj.content === 'string') {
                message = messageObj.content.trim();
            } else if (Array.isArray(messageObj.content)) {
                const refusalPart = messageObj.content.find(part => part?.type === 'refusal' || (typeof part?.refusal === 'string' && part.refusal.trim().length > 0));
                if (refusalPart) {
                    const refusalText = typeof refusalPart.refusal === 'string' ? refusalPart.refusal : 'No refusal text provided.';
                    throw new Error(`OpenAI model refused to process this request: ${refusalText}`);
                }
                message = messageObj.content
                    .filter(part => typeof part?.text === 'string')
                    .map(part => part.text)
                    .join('')
                    .trim();
            }
    
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
    
        static extractTokens(data) {
            // OpenAI/Groq/Together/Lambda/Cerebras/Fireworks format
            if (data.usage) {
                const output = data.usage.completion_tokens || 0;
                const thinking = data.usage.completion_tokens_details?.reasoning_tokens || 0;
                return ModelMix.normalizeTokenUsage({
                    input: data.usage.prompt_tokens || 0,
                    output: output - thinking,
                    thinking,
                    total: data.usage.total_tokens,
                    cached: ModelMix.extractCacheTokens(data.usage),
                    cacheWrite: ModelMix.extractCacheWriteTokens(data.usage)
                });
            }
            return ModelMix.normalizeTokenUsage();
        }
    
        processResponse(response) {
            const message = MixCustom.extractMessage(response.data);
            const toolCalls = MixCustom.extractToolCalls(response.data);
            if (!message && toolCalls.length === 0 && response.data?.choices?.[0]?.finish_reason !== 'length') {
                throw MixCustom.responseError(response.data, 'Provider returned no text or tool calls without completing a usable response.');
            }
            return {
                message,
                think: MixCustom.extractThink(response.data),
                toolCalls,
                tokens: this.constructor.extractTokens(response.data),
                response: response.data
            }
        }
    
        getOptionsTools(tools) {
            return MixOpenAI.getOptionsTools(tools);
        }
    }
    
    class MixOpenAI extends MixCustom {
        sanitizeCacheOptions(options) {
            delete options.cache_control;
            delete options.prompt_cache_options;
        }
    
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'OPENAI_API_KEY', 'OpenAI');
    
            return super.getDefaultConfig({
                url: 'https://api.openai.com/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {}, signal } = {}) {
            normalizeOpenAIOptions(options);
            return super.create({ config, options, signal });
        }
    
        static convertMessages(messages, config) {
    
            const content = config.system;
            messages = [{ role: 'system', content }, ...messages || []];
    
            const results = []
            for (const message of messages) {
    
                if (message.tool_calls) {
                    results.push({
                        role: 'assistant',
                        content: message.content ?? null,
                        ...(message.reasoning_content && { reasoning_content: message.reasoning_content }),
                        tool_calls: message.tool_calls
                    })
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
    
                let convertedMessage = { ...message };
                if (Array.isArray(message.content)) {
                    convertedMessage = {
                        ...message,
                        content: message.content.filter(content => content !== null && content !== undefined).map(content => {
                            if (content && content.type === 'image') {
                                const { media_type, data } = content.source;
                                return {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${media_type};base64,${data}`
                                    }
                                };
                            }
                            return stripContentCacheMetadata(content);
                        })
                    };
                }
    
                results.push(convertedMessage);
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
    
            if (toolsArray.length > 0) {
                options.tools = toolsArray;
            }
    
            return options;
        }
    }
    
    class MixModeration extends MixCustom {
        getOptionsTools() {
            return {};
        }
    }

    return { MixCustom, MixOpenAI, MixModeration };
}

module.exports = createBaseProviders;
