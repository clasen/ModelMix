import {
    GROK420_REASONING,
    GROK420_NON_REASONING
} from '../../effort';
import { resolveProviderApiKey } from '../provider-api-key';
import { MixCustom, MixOpenAI, type ProviderConfig, type ProviderJson } from './base';
import type {
    ChatMessage,
    CreateArgs,
    ModelMixConfig,
    ModelMixOptions,
    ModelMixResult,
    TokenUsage
} from '../../types';

export class MixDeepSeek extends MixOpenAI {
    static apiKeyEnv = 'DEEPSEEK_API_KEY';
    static apiKeyName = 'DeepSeek';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.deepseek.com/chat/completions',
            apiKey,
            ...customConfig
        });
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

export class MixMiniMax extends MixOpenAI {
    static apiKeyEnv = 'MINIMAX_API_KEY';
    static apiKeyName = 'MiniMax';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.minimax.io/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    extractDelta(data: unknown): string {
        const payload = data as ProviderJson;
        // MiniMax might send different formats during streaming
        if (payload.choices && payload.choices[0] && payload.choices[0].delta && payload.choices[0].delta.content) {
            return payload.choices[0].delta.content;
        }
        return '';
    }
}

export class MixMiMo extends MixOpenAI {
    static apiKeyEnv = 'MIMO_API_KEY';
    static apiKeyName = 'MiMo';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return MixCustom.prototype.getDefaultConfig.call(this, {
            url: 'https://api.xiaomimimo.com/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    getDefaultHeaders(customHeaders?: Record<string, string>): Record<string, string> {
        return {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': this.config.apiKey as string,
            ...customHeaders
        };
    }
}

export class MixPerplexity extends MixCustom {
    static apiKeyEnv = 'PPLX_API_KEY';
    static apiKeyName = 'Perplexity';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.perplexity.ai/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {

        if (config.schema) {
            options.response_format = {
                type: 'json_schema',
                json_schema: { schema: config.schema }
            };
        }

        return super.create({ config, options, signal });
    }
}

export class MixOllama extends MixCustom {

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        return super.getDefaultConfig({
            url: 'http://localhost:11434/api/chat',
            ...customConfig
        });
    }

    getDefaultOptions(customOptions?: ModelMixOptions): ModelMixOptions {
        return {
            options: customOptions,
        };
    }

    extractDelta(data: unknown): string {
        const payload = data as ProviderJson;
        if (payload.message && payload.message.content) return payload.message.content;
        return '';
    }

    extractMessage(data: unknown): string {
        return (data as ProviderJson).message.content.trim();
    }

    convertMessages(messages: ChatMessage[], config?: ModelMixConfig): ChatMessage[] {
        return MixOllama.convertMessages(messages, config);
    }

    static convertMessages(messages: ChatMessage[], config?: ModelMixConfig): ChatMessage[] {
        const content = (config as ModelMixConfig).system;
        messages = [{ role: 'system', content }, ...messages || []];

        return messages.map(entry => {
            let content = '';
            let images: unknown[] = [];

            (entry.content as ProviderJson[]).forEach(item => {
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

export class MixGrok extends MixOpenAI {
    static apiKeyEnv = 'XAI_API_KEY';
    static apiKeyName = 'Grok';

    static extractTokens(data: unknown): TokenUsage {
        const payload = data as ProviderJson;
        if (!payload.usage) return MixCustom.extractTokens(payload);
        return MixCustom.extractTokens({
            ...payload,
            usage: {
                ...payload.usage,
                completion_tokens: (payload.usage.completion_tokens || 0)
                    + (payload.usage.completion_tokens_details?.reasoning_tokens || 0)
            }
        });
    }

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.x.ai/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    async create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        if (options.model === GROK420_REASONING || options.model === GROK420_NON_REASONING) {
            delete options.reasoning_effort;
        }
        return super.create({ config, options, signal });
    }
}

export class MixLambda extends MixCustom {
    static apiKeyEnv = 'LAMBDA_API_KEY';
    static apiKeyName = 'Lambda';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.lambda.ai/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }
}

export class MixLMStudio extends MixCustom {
    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        return super.getDefaultConfig({
            url: 'http://localhost:1234/v1/chat/completions',
            ...customConfig
        });
    }

    create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        if (config.schema) {
            options.response_format = {
                type: 'json_schema',
                json_schema: { schema: config.schema }
            };
        }
        return super.create({ config, options, signal });
    }

    static extractThink(data: unknown): string | null {
        const message = (data as ProviderJson).choices[0].message?.content?.trim() || '';

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

    static extractMessage(data: unknown): string | undefined {
        const message = (data as ProviderJson).choices[0].message?.content?.trim() || '';

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

    processResponse(response: { data: unknown }): ModelMixResult {
        return {
            message: MixLMStudio.extractMessage(response.data),
            think: MixLMStudio.extractThink(response.data),
            toolCalls: MixCustom.extractToolCalls(response.data),
            tokens: MixCustom.extractTokens(response.data),
            response: response.data
        };
    }
}

export class MixGroq extends MixCustom {
    static apiKeyEnv = 'GROQ_API_KEY';
    static apiKeyName = 'Groq';
    static family = 'openai';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.groq.com/openai/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }
}

export class MixTogether extends MixCustom {
    static apiKeyEnv = 'TOGETHER_API_KEY';
    static apiKeyName = 'Together';
    static family = 'openai';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.together.xyz/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    getDefaultOptions(customOptions?: ModelMixOptions): ModelMixOptions {
        return {
            stop: ["<|eot_id|>", "<|eom_id|>"],
            ...customOptions
        };
    }
}

export class MixCerebras extends MixCustom {
    static apiKeyEnv = 'CEREBRAS_API_KEY';
    static apiKeyName = 'Cerebras';
    static family = 'openai';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.cerebras.ai/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }

    create({ config = {}, options = {}, signal }: CreateArgs = {}): Promise<ModelMixResult> {
        delete options.response_format;
        return super.create({ config, options, signal });
    }
}

export class MixFireworks extends MixCustom {
    static apiKeyEnv = 'FIREWORKS_API_KEY';
    static apiKeyName = 'Fireworks';
    static family = 'openai';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://api.fireworks.ai/inference/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }
}

export class MixNVIDIA extends MixCustom {
    static apiKeyEnv = 'NVIDIA_API_KEY';
    static apiKeyName = 'NVIDIA';
    static family = 'openai';

    getDefaultConfig(customConfig?: Record<string, unknown>): ProviderConfig {
        const apiKey = resolveProviderApiKey(this, customConfig);

        return super.getDefaultConfig({
            url: 'https://integrate.api.nvidia.com/v1/chat/completions',
            apiKey,
            ...customConfig
        });
    }
}
