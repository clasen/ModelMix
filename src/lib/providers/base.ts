import type { Readable } from 'stream';
import {
    stripContentTypeHeader,
    createMultipartFormData,
    buildRequestBodyAndHeaders,
    type MultipartInput
} from '../../multipart';
import {
    fetchJsonResponse,
    fetchStreamResponse
} from '../../http-client';
import {
    stripContentCacheMetadata
} from '../content-cache';
import { configForDebug, redactSecret } from '../provider-debug';
import { resolveProviderApiKey } from '../provider-api-key';
import { formatJSON } from '../debug-format';
import { currentStreamCallback } from '../stream-context';
import {
    normalizeTokenUsage,
    extractCacheTokens,
    extractCacheWriteTokens
} from '../token-usage';
import { normalizeOpenAIOptions } from './openai-options';
import {
    assertNoStoredSignal,
    throwIfAborted,
    validateProviderExecution
} from '../abort-signal';
import type {
    ChatMessage,
    CreateArgs,
    ModelMixConfig,
    ModelMixOptions,
    ModelMixResult,
    ProviderConstructorArgs,
    ProviderFamily,
    StreamCallback,
    TokenUsage,
    ToolCall,
    ToolDefinition
} from '../../types';

/** Untyped provider wire JSON; narrowed where it is read. */
export type ProviderJson = any;

export type ProviderConfig = ModelMixConfig & { url?: string; apiKey?: string };

export interface ProviderError {
    message: string;
    statusCode: number | null;
    details: unknown;
    stack?: string;
}

interface StatusError extends Error {
    statusCode?: number;
    details?: unknown;
}

export class MixCustom {
    static family: ProviderFamily | null = null;
    declare static apiKeyEnv?: string;
    declare static apiKeyName?: string;

    config: ProviderConfig;
    options: ModelMixOptions;
    headers: Record<string, string>;
    streamCallback: StreamCallback | null;

    constructor({ config = {}, options = {}, headers = {} }: ProviderConstructorArgs = {}) {
        assertNoStoredSignal(config, 'config');
        assertNoStoredSignal(options, 'options');
        this.config = this.getDefaultConfig(config);
        this.options = this.getDefaultOptions(options);
        this.headers = this.getDefaultHeaders(headers);
        this.streamCallback = null; // Fallback when no per-request stream callback is active
    }

    getDefaultOptions(customOptions?: ModelMixOptions): ModelMixOptions {
        return {
            ...customOptions
        };
    }

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        return {
            url: '',
            apiKey: '',
            ...customConfig
        };
    }

    getDefaultHeaders(customHeaders?: Record<string, string>): Record<string, string> {
        return {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': `Bearer ${this.config.apiKey}`,
            ...customHeaders
        };
    }

    convertMessages(messages: ChatMessage[], config?: ModelMixConfig): ChatMessage[] {
        return MixOpenAI.convertMessages(messages, config);
    }

    sanitizeCacheOptions(options: ModelMixOptions): void {
        delete options.cache_control;
        delete options.prompt_cache_key;
        delete options.prompt_cache_options;
        delete options.prompt_cache_retention;
    }

    static stripContentTypeHeader(headers: Record<string, string> = {}) {
        return stripContentTypeHeader(headers);
    }

    static createMultipartFormData({ fields = {}, files = [] }: MultipartInput = {}) {
        return createMultipartFormData({ fields, files });
    }

    static buildRequestBodyAndHeaders(options: ModelMixOptions, headers: Record<string, string>) {
        return buildRequestBodyAndHeaders(options, headers);
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        validateProviderExecution(this, { config, options, signal });
        try {
            this.sanitizeCacheOptions(options);
            if (Array.isArray(options.messages)) {
                options.messages = this.convertMessages(options.messages, config);
            }

            const request = buildRequestBodyAndHeaders(options, this.headers);

            // debug level 4 (verbose): Full request details
            if ((config.debug ?? 0) >= 4) {
                console.log('\n[REQUEST DETAILS]');

                console.log('\n[CONFIG]');
                console.log(formatJSON(configForDebug(config)));

                console.log('\n[OPTIONS]');
                console.log(formatJSON(request.options));
            }

            if (options.stream) {
                return await this.processStream(await fetchStreamResponse(this.config.url as string, {
                    method: 'POST',
                    headers: request.headers,
                    body: request.body,
                    signal
                }));
            } else {
                return this.processResponse(await fetchJsonResponse(this.config.url as string, {
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

    handleError(error: unknown): ProviderError {
        const failure = error as ProviderJson;
        let errorMessage = 'An error occurred in MixCustom';
        let statusCode = null;
        let errorDetails = null;

        if (failure?.isHttpError || failure?.response || typeof failure?.statusCode === 'number') {
            statusCode = failure.statusCode ?? failure.response?.status ?? null;
            errorMessage = failure.message || `Request to ${this.config.url} failed with status code ${statusCode}`;
            errorDetails = failure.details ?? failure.response?.data ?? null;
        } else if (failure?.message) {
            errorMessage = failure.message;
        }

        const formattedError: ProviderError = {
            message: redactSecret(errorMessage, this.config.apiKey) as string,
            statusCode,
            details: redactSecret(errorDetails, this.config.apiKey),
            stack: redactSecret(failure.stack, this.config.apiKey) as string | undefined
        };

        return formattedError;
    }

    processStream(
        response: { data: Readable },
        onStream: StreamCallback | null = currentStreamCallback() || this.streamCallback
    ): Promise<ModelMixResult> {
        return new Promise((resolve, reject) => {
            let raw: ProviderJson[] = [];
            let message = '';
            let buffer = '';
            let completed = false;
            let chatCompletion = false;
            let usage = {};
            let usageMetadata: unknown;

            response.data.on('data', (chunk: Buffer | string) => {
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
                        if (onStream) {
                            onStream({ response: data, message, delta });
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
                    tokens: (this.constructor as typeof MixCustom).extractTokens({ usage, usageMetadata })
                });
            });
            response.data.on('error', reject);
        });
    }

    extractDelta(data: unknown): string {
        return (data as ProviderJson).choices?.[0]?.delta?.content || '';
    }

    static responseError(data: unknown, message: string, statusCode = 502): StatusError {
        const error: StatusError = new Error(message);
        error.statusCode = statusCode;
        error.details = data;
        return error;
    }

    static assertResponse(data: unknown): void {
        const payload = data as ProviderJson;
        const failure = payload?.error || payload?.choices?.find((choice: ProviderJson) => choice.error)?.error;
        if (failure || payload?.choices?.some((choice: ProviderJson) => choice.finish_reason === 'error') || payload?.status === 'failed') {
            throw MixCustom.responseError(
                data,
                failure?.message || 'Provider failed to complete the response.',
                Number.isInteger(failure?.code) && failure.code >= 400 && failure.code <= 599 ? failure.code : 502
            );
        }
    }

    static extractMessage(data: unknown): string | undefined {
        MixCustom.assertResponse(data);
        const choice = (data as ProviderJson)?.choices?.[0] || {};
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
            const refusalPart = messageObj.content.find((part: ProviderJson) => part?.type === 'refusal' || (typeof part?.refusal === 'string' && part.refusal.trim().length > 0));
            if (refusalPart) {
                const refusalText = typeof refusalPart.refusal === 'string' ? refusalPart.refusal : 'No refusal text provided.';
                throw new Error(`OpenAI model refused to process this request: ${refusalText}`);
            }
            message = messageObj.content
                .filter((part: ProviderJson) => typeof part?.text === 'string')
                .map((part: ProviderJson) => part.text)
                .join('')
                .trim();
        }

        const endTagIndex = message.indexOf('</think>');
        if (message.startsWith('<think>') && endTagIndex !== -1) {
            return message.substring(endTagIndex + 8).trim();
        }
        return message;
    }

    static extractThink(data: unknown): string | null {
        const payload = data as ProviderJson;

        if (payload.choices[0].message?.reasoning_content) {
            return payload.choices[0].message.reasoning_content;
        } else if (payload.choices[0].message?.reasoning) {
            return payload.choices[0].message.reasoning;
        }

        const message = payload.choices[0].message?.content?.trim() || '';
        const endTagIndex = message.indexOf('</think>');
        if (message.startsWith('<think>') && endTagIndex !== -1) {
            return message.substring(7, endTagIndex).trim();
        }
        return null;
    }

    static extractToolCalls(data: unknown): ToolCall[] {
        return (data as ProviderJson).choices[0].message?.tool_calls?.map((call: ProviderJson) => ({
            id: call.id,
            type: 'function',
            function: {
                name: call.function.name,
                arguments: call.function.arguments
            }
        })) || []
    }

    static extractTokens(data: unknown): TokenUsage {
        const payload = data as ProviderJson;
        // OpenAI/Groq/Together/Lambda/Cerebras/Fireworks format
        if (payload.usage) {
            const output = payload.usage.completion_tokens || 0;
            const thinking = payload.usage.completion_tokens_details?.reasoning_tokens || 0;
            return normalizeTokenUsage({
                input: payload.usage.prompt_tokens || 0,
                output: output - thinking,
                thinking,
                total: payload.usage.total_tokens,
                cached: extractCacheTokens(payload.usage),
                cacheWrite: extractCacheWriteTokens(payload.usage)
            });
        }
        return normalizeTokenUsage();
    }

    processResponse(response: { data: unknown }): ModelMixResult {
        const data = response.data as ProviderJson;
        const message = MixCustom.extractMessage(data);
        const toolCalls = MixCustom.extractToolCalls(data);
        if (!message && toolCalls.length === 0 && data?.choices?.[0]?.finish_reason !== 'length') {
            throw MixCustom.responseError(data, 'Provider returned no text or tool calls without completing a usable response.');
        }
        return {
            message,
            think: MixCustom.extractThink(data),
            toolCalls,
            tokens: (this.constructor as typeof MixCustom).extractTokens(data),
            response: data
        }
    }

    getOptionsTools(tools: Record<string, ToolDefinition[]>): Partial<ModelMixOptions> {
        return MixOpenAI.getOptionsTools(tools);
    }

    /** Cost reported by the provider for this response, when it bills per request. */
    getReportedCost(response: unknown): number | undefined {
        return undefined;
    }
}

export class MixOpenAI extends MixCustom {
    static apiKeyEnv = 'OPENAI_API_KEY';
    static apiKeyName = 'OpenAI';
    static family = 'openai';

    sanitizeCacheOptions(options: ModelMixOptions): void {
        delete options.cache_control;
        delete options.prompt_cache_options;
    }

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.openai.com/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        normalizeOpenAIOptions(options);
        return super.create({ config, options, signal });
    }

    static convertMessages(messages: ChatMessage[], config?: ModelMixConfig): ChatMessage[] {

        const content = (config as ModelMixConfig).system;
        messages = [{ role: 'system', content }, ...messages || []];

        const results: ChatMessage[] = []
        for (const message of messages) {

            if (message.tool_calls) {
                results.push({
                    role: 'assistant',
                    content: message.content ?? null,
                    ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
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
                    for (const content of message.content as ProviderJson[]) {
                        results.push({
                            role: 'tool',
                            tool_call_id: content.tool_call_id,
                            content: content.content
                        })
                    }
                }
                continue;
            }

            let convertedMessage: ChatMessage = { ...message };
            if (Array.isArray(message.content)) {
                convertedMessage = {
                    ...message,
                    content: (message.content as ProviderJson[]).filter(content => content !== null && content !== undefined).map(content => {
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

    static getOptionsTools(tools: Record<string, ToolDefinition[]>): Partial<ModelMixOptions> {
        const options: Partial<ModelMixOptions> = {};
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

export class MixModeration extends MixCustom {
    getOptionsTools(): Partial<ModelMixOptions> {
        return {};
    }
}
