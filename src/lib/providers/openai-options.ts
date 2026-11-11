import type { ModelMixOptions } from '../../types';

export function normalizeOpenAIOptions(options: ModelMixOptions): ModelMixOptions {
    const model = options.model;
    if (/^o\d/.test(model || '')) {
        delete options.max_tokens;
        delete options.temperature;
    }
    if (model?.includes('gpt-5') || /^(?:openai\/)?gpt-6(?:[.-]|$)/.test(model || '')) {
        if (options.max_tokens) {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
        }
        delete options.temperature;
    }
    return options;
}
