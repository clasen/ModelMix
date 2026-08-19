const { fetchJsonResponse } = require('../../http-client');
const { configForDebug } = require('../provider-debug');

function createGoogleProviders({ ModelMix, MixCustom }) {
    class MixGoogle extends MixCustom {
        getDefaultConfig(customConfig) {
            return super.getDefaultConfig({
                url: 'https://generativelanguage.googleapis.com/v1beta/models',
                apiKey: process.env.GEMINI_API_KEY,
                ...customConfig
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
                        parts: message.tool_calls.map(toolCall => {
                            const part = {
                                functionCall: {
                                    name: toolCall.function.name,
                                    args: JSON.parse(toolCall.function.arguments)
                                }
                            };
                            if (toolCall.thought_signature) {
                                part.thoughtSignature = toolCall.thought_signature;
                            }
                            return part;
                        })
                    }
                }
    
                // Handle new tool result format: tool_call_id and name directly on message
                if (message.role === 'tool' && message.name) {
                    return {
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: message.name,
                                response: {
                                    output: message.content,
                                },
                            }
                        }]
                    }
                }
    
                if (!Array.isArray(message.content)) return message;
                const role = (message.role === 'assistant' || message.role === 'tool') ? 'model' : 'user'
    
                if (message.role === 'tool') {
                    // Handle old format: content is an array of {name, content}
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
    
            // Merge consecutive user messages containing only functionResponse parts
            // Google requires all function responses for a turn in a single message
            return converted.reduce((acc, msg) => {
                if (acc.length > 0) {
                    const prev = acc[acc.length - 1];
                    if (prev.role === 'user' && msg.role === 'user' &&
                        prev.parts.every(p => p.functionResponse) &&
                        msg.parts.every(p => p.functionResponse)) {
                        prev.parts.push(...msg.parts);
                        return acc;
                    }
                }
                acc.push(msg);
                return acc;
            }, []);
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
    
            // Thinking / effort (from unified config.effort or native options)
            if (options.thinkingConfig) {
                generationConfig.thinkingConfig = options.thinkingConfig;
            } else if (options.thinkingLevel != null || options.thinkingBudget != null) {
                generationConfig.thinkingConfig = {};
                if (options.thinkingLevel != null) {
                    generationConfig.thinkingConfig.thinkingLevel = options.thinkingLevel;
                }
                if (options.thinkingBudget != null) {
                    generationConfig.thinkingConfig.thinkingBudget = options.thinkingBudget;
                }
            }
    
            // Gemini does not support responseMimeType when function calling is used
            const hasTools = options.tools && options.tools.length > 0 &&
                options.tools.some(t => t.functionDeclarations && t.functionDeclarations.length > 0);
    
            if (!hasTools) {
                generationConfig.responseMimeType = "text/plain";
            }
    
            const payload = {
                generationConfig,
                systemInstruction,
                contents: options.messages,
                tools: options.tools
            };
    
            try {
                // debug level 4 (verbose): Full request details
                if (config.debug >= 4) {
                    console.log('\n[REQUEST DETAILS - GOOGLE]');
    
                    console.log('\n[CONFIG]');
                    console.log(ModelMix.formatJSON(configForDebug(config)));
    
                    console.log('\n[PAYLOAD]');
                    console.log(ModelMix.formatJSON(payload));
                }
    
                if (options.stream) {
                    throw new Error('Stream is not supported for Gemini');
                } else {
                    return this.processResponse(await fetchJsonResponse(fullUrl, {
                        method: 'POST',
                        headers: this.headers,
                        body: JSON.stringify(payload)
                    }));
                }
            } catch (error) {
                throw this.handleError(error);
            }
        }
    
        processResponse(response) {
            return {
                message: MixGoogle.extractMessage(response.data),
                think: null,
                toolCalls: MixGoogle.extractToolCalls(response.data),
                tokens: MixGoogle.extractTokens(response.data),
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
    
        static extractTokens(data) {
            // Google Gemini format
            if (data.usageMetadata) {
                return ModelMix.normalizeTokenUsage({
                    input: data.usageMetadata.promptTokenCount || 0,
                    output: data.usageMetadata.candidatesTokenCount || 0,
                    thinking: data.usageMetadata.thoughtsTokenCount || 0,
                    total: data.usageMetadata.totalTokenCount,
                    cached: ModelMix.extractCacheTokens(data.usageMetadata),
                    cacheWrite: ModelMix.extractCacheWriteTokens(data.usageMetadata)
                });
            }
            return ModelMix.normalizeTokenUsage();
        }
    
        static stripUnsupportedSchemaProps(schema) {
            if (!schema || typeof schema !== 'object') return schema;
            const cleaned = { ...schema };
            delete cleaned.default;
            if (cleaned.properties) {
                cleaned.properties = Object.fromEntries(
                    Object.entries(cleaned.properties).map(([key, value]) => [key, MixGoogle.stripUnsupportedSchemaProps(value)])
                );
            }
            if (cleaned.items) {
                cleaned.items = MixGoogle.stripUnsupportedSchemaProps(cleaned.items);
            }
            return cleaned;
        }
    
        static getOptionsTools(tools) {
            const functionDeclarations = [];
            for (const tool in tools) {
                for (const item of tools[tool]) {
                    functionDeclarations.push({
                        name: item.name,
                        description: item.description,
                        parameters: MixGoogle.stripUnsupportedSchemaProps(item.inputSchema)
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

    return { MixGoogle };
}

module.exports = createGoogleProviders;
