const createBaseProviders = require('./providers/base');
const createOpenAIProviders = require('./providers/openai');
const createAnthropicProviders = require('./providers/anthropic');
const createCompatibleProviders = require('./providers/openai-compatible');
const createGoogleProviders = require('./providers/google');

function createProviders({ ModelMix, log }) {
    const base = createBaseProviders({ ModelMix });
    const openai = createOpenAIProviders({ ModelMix, ...base });
    const anthropic = createAnthropicProviders({ ModelMix, MixCustom: base.MixCustom, log });
    const compatible = createCompatibleProviders({
        MixCustom: base.MixCustom,
        MixOpenAI: base.MixOpenAI
    });
    const google = createGoogleProviders({ ModelMix, MixCustom: base.MixCustom });

    return {
        ...base,
        ...openai,
        ...anthropic,
        ...compatible,
        ...google
    };
}

module.exports = createProviders;
