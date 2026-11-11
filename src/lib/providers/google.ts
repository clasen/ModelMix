import { fetchJsonResponse } from '../../http-client';
import { configForDebug } from '../provider-debug';
import { resolveProviderApiKey } from '../provider-api-key';
import { formatJSON } from '../debug-format';
import {
    normalizeTokenUsage,
    extractCacheTokens,
    extractCacheWriteTokens
} from '../token-usage';
import {
    throwIfAborted,
    validateProviderExecution
} from '../abort-signal';
import { MixCustom, type ProviderConfig, type ProviderJson } from './base';
import type {
    ChatMessage,
    CreateArgs,
    ModelMixOptions,
    ModelMixResult,
    TokenUsage,
    ToolCall,
    ToolDefinition
} from '../../types';

export class MixGoogle extends MixCustom {
    static apiKeyEnv = 'GEMINI_API_KEY';
    static apiKeyName = 'Gemini';
    static family = 'google';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);
        return super.getDefaultConfig({
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            apiKey,
            ...customConfig
        });
    }

    getDefaultHeaders(customHeaders?: Record<string, string>): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            ...customHeaders
        };
    }

    static convertMessages(messages: ChatMessage[]): ProviderJson[] {
        return messages.map(message => {

            // Handle assistant messages with tool_calls (content is null)
            if (message.role === 'assistant' && message.tool_calls) {
                return {
                    role: 'model',
                    parts: message.tool_calls.map((toolCall: ProviderJson) => {
                        const part: ProviderJson = {
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

            if (typeof message.content === 'string') {
                return {
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }]
                };
            }
            if (!Array.isArray(message.content)) return message;
            const role = (message.role === 'assistant' || message.role === 'tool') ? 'model' : 'user'
            const contents = message.content as ProviderJson[];

            if (message.role === 'tool') {
                // Handle old format: content is an array of {name, content}
                return {
                    role,
                    parts: contents.map(content => ({
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
                parts: contents.map(content => {
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

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        validateProviderExecution(this, { config, options, signal });
        const generateContentApi = options.stream ? 'streamGenerateContent' : 'generateContent';

        const fullUrl = `${this.config.url}/${options.model}:${generateContentApi}?key=${this.config.apiKey}`;


        const content = config.system;
        const systemInstruction = { parts: [{ text: content }] };

        const payloadOptions = options as ProviderJson;
        payloadOptions.messages = MixGoogle.convertMessages(payloadOptions.messages);

        const generationConfig: ProviderJson = {
            maxOutputTokens: payloadOptions.max_tokens,
        }

        if (payloadOptions.top_p) {
            generationConfig.topP = payloadOptions.top_p;
        }

        // Thinking / effort (from unified config.effort or native options)
        if (payloadOptions.thinkingConfig) {
            generationConfig.thinkingConfig = payloadOptions.thinkingConfig;
        } else if (payloadOptions.thinkingLevel != null || payloadOptions.thinkingBudget != null) {
            generationConfig.thinkingConfig = {};
            if (payloadOptions.thinkingLevel != null) {
                generationConfig.thinkingConfig.thinkingLevel = payloadOptions.thinkingLevel;
            }
            if (payloadOptions.thinkingBudget != null) {
                generationConfig.thinkingConfig.thinkingBudget = payloadOptions.thinkingBudget;
            }
        }

        // Gemini does not support responseMimeType when function calling is used
        const hasTools = payloadOptions.tools && payloadOptions.tools.length > 0 &&
            payloadOptions.tools.some((t: ProviderJson) => t.functionDeclarations && t.functionDeclarations.length > 0);

        if (!hasTools) {
            generationConfig.responseMimeType = payloadOptions.response_format?.type === 'json_object'
                || payloadOptions.response_format?.type === 'json_schema'
                ? 'application/json'
                : 'text/plain';
        }

        const payload = {
            generationConfig,
            systemInstruction,
            contents: payloadOptions.messages,
            tools: payloadOptions.tools
        };

        try {
            // debug level 4 (verbose): Full request details
            if ((config.debug ?? 0) >= 4) {
                console.log('\n[REQUEST DETAILS - GOOGLE]');

                console.log('\n[CONFIG]');
                console.log(formatJSON(configForDebug(config)));

                console.log('\n[PAYLOAD]');
                console.log(formatJSON(payload));
            }

            if (options.stream) {
                throw new Error('Stream is not supported for Gemini');
            } else {
                return this.processResponse(await fetchJsonResponse(fullUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify(payload),
                    signal
                }));
            }
        } catch (error) {
            throwIfAborted(signal);
            throw this.handleError(error);
        }
    }

    processResponse(response: { data: unknown }): ModelMixResult {
        return {
            message: MixGoogle.extractMessage(response.data),
            think: null,
            toolCalls: MixGoogle.extractToolCalls(response.data),
            tokens: MixGoogle.extractTokens(response.data),
            response: response.data
        }
    }

    static extractToolCalls(data: unknown): ToolCall[] {
        return (data as ProviderJson).candidates?.[0]?.content?.parts?.map((part: ProviderJson) => {
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
        }).filter((item: ToolCall | null) => item !== null) || [];
    }

    static extractMessage(data: unknown): string | undefined {
        const parts: ProviderJson[] | undefined = (data as ProviderJson).candidates?.[0]?.content?.parts;
        const textParts = parts?.filter(part => !part.thought && typeof part.text === 'string');
        return textParts?.length ? textParts.map(part => part.text).join('') : undefined;
    }

    static extractTokens(data: unknown): TokenUsage {
        const payload = data as ProviderJson;
        // Google Gemini format
        if (payload.usageMetadata) {
            return normalizeTokenUsage({
                input: payload.usageMetadata.promptTokenCount || 0,
                output: payload.usageMetadata.candidatesTokenCount || 0,
                thinking: payload.usageMetadata.thoughtsTokenCount || 0,
                total: payload.usageMetadata.totalTokenCount,
                cached: extractCacheTokens(payload.usageMetadata),
                cacheWrite: extractCacheWriteTokens(payload.usageMetadata)
            });
        }
        return normalizeTokenUsage();
    }

    static stripUnsupportedSchemaProps(schema: unknown): unknown {
        if (!schema || typeof schema !== 'object') return schema;
        const cleaned: ProviderJson = { ...schema };
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

    static getOptionsTools(tools: Record<string, ToolDefinition[]>): Partial<ModelMixOptions> {
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

        const options: Partial<ModelMixOptions> = {};

        // Solo incluir tools si el array no está vacío
        if (functionDeclarations.length > 0) {
            options.tools = [{
                functionDeclarations
            }];
        }

        return options;
    }

    getOptionsTools(tools: Record<string, ToolDefinition[]>): Partial<ModelMixOptions> {
        return MixGoogle.getOptionsTools(tools);
    }
}
