function normalizeOpenAIOptions(options) {
    if (/^o\d/.test(options.model || '')) {
        delete options.max_tokens;
        delete options.temperature;
    }
    if (options.model?.includes('gpt-5') || /^(?:openai\/)?gpt-6(?:-|$)/.test(options.model || '')) {
        if (options.max_tokens) {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
        }
        delete options.temperature;
    }
    return options;
}

module.exports = { normalizeOpenAIOptions };
