import WebSocket, { type ClientOptions } from 'ws';
import { fetchJsonResponse } from '../../http-client';
import { isPlainObject } from '../object-utils';
import {
    normalizeContentCache,
    stripContentCacheMetadata
} from '../content-cache';
import { resolveProviderApiKey } from '../provider-api-key';
import { normalizeTokenUsage, extractCacheTokens, extractCacheWriteTokens } from '../token-usage';
import { normalizeOpenAIOptions } from './openai-options';
import { currentStreamCallback } from '../stream-context';
import {
    throwIfAborted,
    validateProviderExecution
} from '../abort-signal';
import { rejectsAnthropicSamplingParams } from './anthropic';
import {
    MixCustom,
    MixModeration,
    MixOpenAI,
    type ProviderConfig,
    type ProviderJson
} from './base';
import type {
    ChatMessage,
    CreateArgs,
    ModelMixConfig,
    ModelMixOptions,
    ModelMixResult,
    TokenUsage
} from '../../types';

type ModerationInput =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

/** Explicit prompt cache controls belong to the documented "GPT-5.6 and later" family. */
function isGPT56OrLater(model: unknown): boolean {
    if (typeof model !== 'string') return false;
    return model.startsWith('gpt-5.6') || /^(?:openai\/)?gpt-6(?:[.-]|$)/.test(model);
}

export class MixOpenAIResponses extends MixOpenAI {
    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        validateProviderExecution(this, { config, options, signal });
        normalizeOpenAIOptions(options);
        const responsesUrl = (this.config.url as string).replace('/chat/completions', '/responses');
        const request = MixOpenAIResponses.buildResponsesRequest(options, config);
        const response = await fetchJsonResponse(responsesUrl, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(request),
            signal
        });
        throwIfAborted(signal);

        return MixOpenAIResponses.processResponsesResponse(response);
    }

    static buildResponsesRequest(options: ModelMixOptions = {}, config: ModelMixConfig = {}): ProviderJson {
        const input = MixOpenAIResponses.messagesToResponsesInput(options.messages, {
            translateNeutralCache: isGPT56OrLater(options.model)
        });
        if (config.system) {
            input.unshift({ role: 'developer', content: [{ type: 'input_text', text: config.system }] });
        }
        MixOpenAIResponses.validatePromptCaching(options, input);
        const request: ProviderJson = {
            model: options.model,
            input,
            stream: false
        };

        if (options.reasoning_effort) request.reasoning = { effort: options.reasoning_effort };
        if (options.verbosity) request.text = { verbosity: options.verbosity };
        if (options.tools !== undefined) {
            request.tools = (options.tools as ProviderJson[]).map(tool => tool.type === 'function' && tool.function
                ? { type: 'function', strict: false, ...tool.function }
                : tool);
        }
        if (options.tool_choice !== undefined) {
            request.tool_choice = (options.tool_choice as ProviderJson)?.function
                ? { type: 'function', name: (options.tool_choice as ProviderJson).function.name }
                : options.tool_choice;
        }
        if (options.parallel_tool_calls !== undefined) request.parallel_tool_calls = options.parallel_tool_calls;

        if (options.response_format) {
            const rf: ProviderJson = options.response_format;
            let format: ProviderJson;
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

    static validatePromptCaching(options: ModelMixOptions, input: ProviderJson[]): void {
        const supportsCacheControls = isGPT56OrLater(options.model);
        const cacheOptions: unknown = options.prompt_cache_options;
        const breakpoints = input.flatMap(message => Array.isArray(message.content)
            ? message.content
                .filter((block: ProviderJson) => block?.prompt_cache_breakpoint !== undefined)
                .map((block: ProviderJson) => block.prompt_cache_breakpoint)
            : []);

        if (supportsCacheControls && options.prompt_cache_retention !== undefined) {
            throw new Error('GPT-5.6 and later models do not support prompt_cache_retention; use prompt_cache_options.ttl instead.');
        }
        if (!supportsCacheControls && cacheOptions !== undefined) {
            throw new Error('prompt_cache_options is only supported by GPT-5.6 and later models.');
        }
        if (!supportsCacheControls && breakpoints.length > 0) {
            throw new Error('prompt_cache_breakpoint is only supported by GPT-5.6 and later models.');
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

    static processResponsesResponse(response: { data: unknown }): ModelMixResult {
        const data = response.data as ProviderJson;
        MixCustom.assertResponse(data);
        const message = MixOpenAIResponses.extractResponsesMessage(data);
        const toolCalls = (data.output || [])
            .filter((item: ProviderJson) => item.type === 'function_call')
            .map((item: ProviderJson) => ({
                id: item.call_id,
                type: 'function',
                function: { name: item.name, arguments: item.arguments }
            }));
        return {
            message,
            think: null,
            toolCalls,
            ...(toolCalls.length > 0 && {
                assistantMessage: {
                    role: 'assistant',
                    content: message || null,
                    tool_calls: toolCalls,
                    _responsesOutput: data.output
                }
            }),
            tokens: MixOpenAIResponses.extractResponsesTokens(data),
            response: data
        };
    }

    static extractResponsesTokens(data: ProviderJson): TokenUsage {
        if (data.usage) {
            const output = data.usage.output_tokens || 0;
            const thinking = data.usage.output_tokens_details?.reasoning_tokens || 0;
            return normalizeTokenUsage({
                input: data.usage.input_tokens || 0,
                output: output - thinking,
                thinking,
                total: data.usage.total_tokens,
                cached: extractCacheTokens(data.usage),
                cacheWrite: extractCacheWriteTokens(data.usage)
            });
        }
        return normalizeTokenUsage();
    }

    static extractResponsesMessage(data: ProviderJson): string {
        if (!Array.isArray(data.output)) return '';
        return data.output
            .filter((item: ProviderJson) => item.type === 'message')
            .flatMap((item: ProviderJson) => Array.isArray(item.content) ? item.content : [])
            .filter((content: ProviderJson) => content.type === 'output_text' && typeof content.text === 'string')
            .map((content: ProviderJson) => content.text)
            .join('\n')
            .trim();
    }

    static messagesToResponsesInput(messages: ChatMessage[] = [], { translateNeutralCache = false }: { translateNeutralCache?: boolean } = {}): ProviderJson[] {
        const mapped: ProviderJson[] = [];

        for (const message of messages) {
            if (!message || !message.role) continue;
            if (message.role === 'assistant' && Array.isArray(message._responsesOutput)) {
                mapped.push(...message._responsesOutput);
                continue;
            }
            if (message.role === 'tool') {
                mapped.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content });
                continue;
            }

            const content: ProviderJson[] = [];
            const isAssistant = message.role === 'assistant';
            const textType = isAssistant ? 'output_text' : 'input_text';
            if (typeof message.content === 'string') {
                if (message.content) content.push({ type: textType, text: message.content });
            } else if (Array.isArray(message.content)) {
                for (const item of message.content as ProviderJson[]) {
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
                        let imageUrl: string;
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

            if (content.length > 0) {
                mapped.push({ role: message.role, content });
            }
            for (const call of (message.tool_calls || []) as ProviderJson[]) {
                const args = call.function ? call.function.arguments : call.input ?? call.arguments ?? {};
                mapped.push({
                    type: 'function_call',
                    call_id: call.id,
                    name: call.function ? call.function.name : call.name,
                    arguments: typeof args === 'string' ? args : JSON.stringify(args)
                });
            }
        }

        return mapped;
    }
}

export class MixOpenAIModeration extends MixModeration {
    static apiKeyEnv = 'OPENAI_API_KEY';
    static apiKeyName = 'OpenAI';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.openai.com/v1/moderations',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        validateProviderExecution(this, { config, options, signal });
        if (options.stream) {
            throw new Error('Stream is not supported for OpenAI moderation');
        }

        const input = MixOpenAIModeration.messagesToModerationInput(options.messages);
        const response = await fetchJsonResponse(this.config.url as string, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ model: options.model, input }),
            signal
        });
        throwIfAborted(signal);

        return {
            moderation: response.data.results,
            tokens: normalizeTokenUsage(),
            response: response.data
        };
    }

    static messagesToModerationInput(messages: ChatMessage[] = []): ModerationInput[] {
        const input: ModerationInput[] = [];

        for (const message of messages) {
            if (typeof message.content === 'string') {
                input.push({ type: 'text', text: message.content });
                continue;
            }
            if (!Array.isArray(message.content)) continue;

            for (const content of message.content as ProviderJson[]) {
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

export class MixOpenAIWebSocket extends MixOpenAIResponses {
    _createWebSocket(url: string, options: ClientOptions): WebSocket {
        return new WebSocket(url, options);
    }

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        return super.getDefaultConfig({
            realtimeUrl: 'wss://api.openai.com/v1/realtime',
            websocketTimeoutMs: 120000,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        validateProviderExecution(this, { config, options, signal });
        normalizeOpenAIOptions(options);
        const mergedConfig: ProviderJson = { ...this.config, ...config };
        const realtimeUrl = `${mergedConfig.realtimeUrl}?model=${encodeURIComponent(options.model as string)}`;
        const timeoutMs = mergedConfig.websocketTimeoutMs || 120000;
        const streamCallback = currentStreamCallback() || this.streamCallback;

        return await new Promise<ModelMixResult>((resolve, reject) => {
            const ws = this._createWebSocket(realtimeUrl, {
                headers: {
                    authorization: `Bearer ${mergedConfig.apiKey}`
                }
            });

            const events: ProviderJson[] = [];
            let message = '';
            let settled = false;
            let finalResponse: ProviderJson = null;

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

            const cleanUp = () => {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', onAbort);
            };
            const onAbort = () => {
                if (settled) return;
                settled = true;
                cleanUp();
                ws.terminate();
                reject(signal?.reason);
            };
            signal?.addEventListener('abort', onAbort, { once: true });

            ws.on('open', () => {
                const session: ProviderJson = {
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

                const responseConfig: ProviderJson = { output_modalities: ['text'] };
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
                let event: ProviderJson;
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
                        if (streamCallback) {
                            streamCallback({ response: event, message, delta });
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

    static messagesToConversationItems(messages: ChatMessage[] = []): ProviderJson[] {
        const items: ProviderJson[] = [];

        for (const message of messages) {
            if (!message || !message.role) continue;
            if (message.role === 'tool' || message.tool_calls) continue;

            const role = message.role === 'assistant' ? 'assistant' : (message.role === 'system' ? 'system' : 'user');
            const content: ProviderJson[] = [];

            if (typeof message.content === 'string') {
                content.push({
                    type: role === 'assistant' ? 'text' : 'input_text',
                    text: message.content
                });
            } else if (Array.isArray(message.content)) {
                for (const item of message.content as ProviderJson[]) {
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

    static extractDelta(event: ProviderJson): string {
        if (typeof event.delta === 'string') return event.delta;
        return '';
    }
}

export class MixOpenRouter extends MixOpenAI {
    static apiKeyEnv = 'OPENROUTER_API_KEY';
    static apiKeyName = 'OpenRouter';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        if (rejectsAnthropicSamplingParams(options.model)) {
            delete options.temperature;
            delete options.top_p;
            delete options.top_k;
        }
        return super.create({ config, options, signal });
    }

    getReportedCost(response: unknown): number | undefined {
        const usageSource: ProviderJson = Array.isArray(response)
            ? response.findLast((chunk: ProviderJson) => chunk.usage)
            : response;
        const cost = usageSource?.usage?.cost;
        return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
    }
}

export class MixKimi extends MixOpenAI {
    static apiKeyEnv = 'MOONSHOT_API_KEY';
    static apiKeyName = 'Moonshot';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.moonshot.ai/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        if (Object.hasOwn(options, 'max_tokens')) {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
        }

        delete options.temperature;
        delete options.top_p;
        delete options.n;
        delete options.presence_penalty;
        delete options.frequency_penalty;

        return super.create({ config, options, signal });
    }

    extractDelta(data: unknown): string {
        return (data as ProviderJson)?.choices?.[0]?.delta?.content || '';
    }

    processResponse(response: { data: unknown }): ModelMixResult {
        return {
            ...super.processResponse(response),
            assistantMessage: (response.data as ProviderJson)?.choices?.[0]?.message
        };
    }
}
