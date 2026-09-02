const {
    GROK420_REASONING,
    GROK420_NON_REASONING
} = require('../../effort');
const { requireProviderApiKey } = require('../provider-api-key');

function createCompatibleProviders({ MixCustom, MixOpenAI }) {
    class MixMiniMax extends MixOpenAI {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'MINIMAX_API_KEY', 'MiniMax');
    
            return MixCustom.prototype.getDefaultConfig.call(this, {
                url: 'https://api.minimax.io/v1/chat/completions',
                apiKey,
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
    
    class MixMiMo extends MixOpenAI {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'MIMO_API_KEY', 'MiMo');
    
            return MixCustom.prototype.getDefaultConfig.call(this, {
                url: 'https://api.xiaomimimo.com/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        getDefaultHeaders(customHeaders) {
            return {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': this.config.apiKey,
                ...customHeaders
            };
        }
    }
    
    class MixPerplexity extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'PPLX_API_KEY', 'Perplexity');
    
            return super.getDefaultConfig({
                url: 'https://api.perplexity.ai/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {}, signal } = {}) {
    
            if (config.schema) {
                options.response_format = {
                    type: 'json_schema',
                    json_schema: { schema: config.schema }
                };
            }
    
            return super.create({ config, options, signal });
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
            const apiKey = requireProviderApiKey(customConfig, 'XAI_API_KEY', 'Grok');
    
            return super.getDefaultConfig({
                url: 'https://api.x.ai/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        async create({ config = {}, options = {}, signal } = {}) {
            if (options.model === GROK420_REASONING || options.model === GROK420_NON_REASONING) {
                delete options.reasoning_effort;
            }
            return super.create({ config, options, signal });
        }
    }
    
    class MixLambda extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'LAMBDA_API_KEY', 'Lambda');
    
            return super.getDefaultConfig({
                url: 'https://api.lambda.ai/v1/chat/completions',
                apiKey,
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
    
        create({ config = {}, options = {}, signal } = {}) {
            if (config.schema) {
                options.response_format = {
                    type: 'json_schema',
                    json_schema: { schema: config.schema }
                };
            }
            return super.create({ config, options, signal });
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
                tokens: MixCustom.extractTokens(response.data),
                response: response.data
            };
        }
    }
    
    class MixGroq extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'GROQ_API_KEY', 'Groq');
    
            return super.getDefaultConfig({
                url: 'https://api.groq.com/openai/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    }
    
    class MixTogether extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'TOGETHER_API_KEY', 'Together');
    
            return super.getDefaultConfig({
                url: 'https://api.together.xyz/v1/chat/completions',
                apiKey,
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
            const apiKey = requireProviderApiKey(customConfig, 'CEREBRAS_API_KEY', 'Cerebras');
    
            return super.getDefaultConfig({
                url: 'https://api.cerebras.ai/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    
        create({ config = {}, options = {}, signal } = {}) {
            delete options.response_format;
            return super.create({ config, options, signal });
        }
    }
    
    class MixFireworks extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'FIREWORKS_API_KEY', 'Fireworks');
    
            return super.getDefaultConfig({
                url: 'https://api.fireworks.ai/inference/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    }
    
    class MixNVIDIA extends MixCustom {
        getDefaultConfig(customConfig) {
            const apiKey = requireProviderApiKey(customConfig, 'NVIDIA_API_KEY', 'NVIDIA');
    
            return super.getDefaultConfig({
                url: 'https://integrate.api.nvidia.com/v1/chat/completions',
                apiKey,
                ...customConfig
            });
        }
    }

    return {
        MixMiniMax,
        MixMiMo,
        MixPerplexity,
        MixOllama,
        MixGrok,
        MixLambda,
        MixLMStudio,
        MixGroq,
        MixTogether,
        MixCerebras,
        MixFireworks,
        MixNVIDIA
    };
}

module.exports = createCompatibleProviders;
