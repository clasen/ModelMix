const { isPlainObject } = require('../object-utils');
const {
    normalizeContentCache,
    stripContentCacheMetadata,
    hasNeutralCacheBreakpoint
} = require('../content-cache');

function createAnthropicProviders({ ModelMix, MixCustom, log }) {
    class MixAnthropic extends MixCustom {
    
        sanitizeCacheOptions(options) {
            delete options.prompt_cache_key;
            delete options.prompt_cache_options;
            delete options.prompt_cache_retention;
        }
    
        static validateCacheControl(cacheControl) {
            if (!isPlainObject(cacheControl) || cacheControl.type !== 'ephemeral') {
                throw new TypeError('Anthropic cache_control must have type "ephemeral".');
            }
            if (cacheControl.ttl !== undefined
                && cacheControl.ttl !== '5m'
                && cacheControl.ttl !== '1h') {
                throw new TypeError('Anthropic cache_control.ttl must be "5m" or "1h".');
            }
        }
    
        /**
         * Opus 4.7+ and Claude 5 family reject sampling params (temperature/top_p/top_k).
         * See: https://platform.claude.com/docs/en/about-claude/models/migration-guide
         */
        static rejectsSamplingParams(model = '') {
            const id = String(model).toLowerCase();
            if (!id.includes('claude')) return false;
            if (id.includes('mythos') || id.includes('fable')) return true;
    
            const opus = id.match(/claude-opus-(\d+)(?:-(\d+))?/);
            if (opus) {
                const major = Number(opus[1]);
                const minor = opus[2] !== undefined ? Number(opus[2]) : 0;
                return major > 4 || (major === 4 && minor >= 7);
            }
    
            const sonnet = id.match(/claude-sonnet-(\d+)/);
            if (sonnet) return Number(sonnet[1]) >= 5;
    
            return false;
        }
    
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
    
            if (MixAnthropic.rejectsSamplingParams(options.model)) {
                delete options.temperature;
                delete options.top_p;
                delete options.top_k;
            }
    
            const requestConfig = { ...config };
            if (hasNeutralCacheBreakpoint(options.messages)) {
                const contentCacheControl = options.cache_control ?? { type: 'ephemeral' };
                MixAnthropic.validateCacheControl(contentCacheControl);
                requestConfig._contentCacheControl = { ...contentCacheControl };
                delete options.cache_control;
            } else if (options.cache_control !== undefined) {
                MixAnthropic.validateCacheControl(options.cache_control);
            }
    
            options.system = config.system;
    
            try {
                return await super.create({ config: requestConfig, options });
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
                    // Preceding assistant may use OpenAI tool_calls or Anthropic tool_use blocks.
                    let foundToolCall = false;
                    for (let j = i - 1; j >= 0; j--) {
                        if (ModelMix.hasToolInteraction(messages[j]) && messages[j].role === 'assistant') {
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
                    // Handle new format: tool_call_id directly on message
                    if (message.tool_call_id) {
                        return {
                            role: "user",
                            content: [{
                                type: "tool_result",
                                tool_use_id: message.tool_call_id,
                                content: message.content
                            }]
                        }
                    }
                    // Handle old format: content is an array
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
                    const content = message.content.filter(content => content !== null && content !== undefined).map(content => {
                        const neutralCache = content?.cache !== undefined
                            ? normalizeContentCache(content.cache)
                            : undefined;
                        if (neutralCache && content.cache_control !== undefined) {
                            throw new TypeError('Use either cache or cache_control on an Anthropic content block, not both.');
                        }
                        let converted = content;
                        if (content && content.type === 'function') {
                            converted = {
                                type: 'tool_use',
                                id: content.id,
                                name: content.function.name,
                                input: JSON.parse(content.function.arguments)
                            };
                        }
                        const sanitized = stripContentCacheMetadata(converted);
                        if (content.cache_control !== undefined) {
                            MixAnthropic.validateCacheControl(content.cache_control);
                            sanitized.cache_control = { ...content.cache_control };
                        } else if (neutralCache?.breakpoint) {
                            sanitized.cache_control = {
                                ...(config?._contentCacheControl || { type: 'ephemeral' })
                            };
                        }
                        return sanitized;
                    });
                    return { ...message, content };
                }
    
                return { ...message };
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
            const content = Array.isArray(data?.content) ? data.content : [];
            const stopReason = data?.stop_reason;
    
            // Anthropic can return text in different positions depending on thinking/tool blocks.
            const textBlock = content.find(block => typeof block?.text === 'string' && block.text.trim().length > 0);
            if (textBlock) {
                return textBlock.text;
            }
    
            // A tool_use turn can legitimately contain no text blocks.
            if (stopReason === 'tool_use') {
                return '';
            }
    
            // Empty/non-text content is often due to safety refusal or token limits.
            const contentTypes = content.map(block => block?.type || 'unknown').join(', ') || 'none';
    
            if (stopReason === 'refusal') {
                throw new Error('Anthropic refused to process this request (content policy). Try different wording or a fallback model.');
            }
            if (!content.length) {
                throw new Error(`Anthropic returned empty content (stop_reason: ${stopReason ?? 'unknown'}).`);
            }
            throw new Error(`Anthropic content blocks are missing .text (stop_reason: ${stopReason ?? 'unknown'}, content_types: ${contentTypes}).`);
        }
    
        static extractThinkingBlock(data) {
            const content = Array.isArray(data?.content) ? data.content : [];
            return content.find(block => block?.type === 'thinking') || null;
        }
    
        static extractThink(data) {
            const block = MixAnthropic.extractThinkingBlock(data);
            // Preserve empty string: display "omitted" returns thinking: "" with a signature.
            return typeof block?.thinking === 'string' ? block.thinking : null;
        }
    
        static extractSignature(data) {
            const block = MixAnthropic.extractThinkingBlock(data);
            return typeof block?.signature === 'string' && block.signature
                ? block.signature
                : null;
        }
    
        static extractTokens(data) {
            // Anthropic format
            if (data.usage) {
                const cached = ModelMix.extractCacheTokens(data.usage);
                const cacheWrite5m = data.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
                const cacheWrite1h = data.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
                const cacheWrite = Math.max(
                    ModelMix.extractCacheWriteTokens(data.usage),
                    cacheWrite5m + cacheWrite1h
                );
                const input = (data.usage.input_tokens || 0) + cached + cacheWrite;
                const output = data.usage.output_tokens || 0;
                return ModelMix.normalizeTokenUsage({
                    input,
                    output,
                    total: input + output,
                    cached,
                    cacheWrite,
                    cacheWrite5m,
                    cacheWrite1h
                });
            }
            return ModelMix.normalizeTokenUsage();
        }
    
        processResponse(response) {
            const data = response.data;
            return {
                message: MixAnthropic.extractMessage(data),
                think: MixAnthropic.extractThink(data),
                toolCalls: MixAnthropic.extractToolCalls(data),
                tokens: MixAnthropic.extractTokens(data),
                response: data,
                signature: MixAnthropic.extractSignature(data),
                // Replay Anthropic content blocks verbatim (including empty thinking).
                assistantMessage: Array.isArray(data?.content)
                    ? { role: 'assistant', content: data.content }
                    : undefined
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

    return { MixAnthropic };
}

module.exports = createAnthropicProviders;
