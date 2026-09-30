const createBaseProviders = require('./providers/base');
const createOpenAIProviders = require('./providers/openai');
const {
    createAnthropicProviders,
    rejectsAnthropicSamplingParams
} = require('./providers/anthropic');
const createCompatibleProviders = require('./providers/openai-compatible');
const createGoogleProviders = require('./providers/google');

const base = createBaseProviders();
const openai = createOpenAIProviders({ rejectsAnthropicSamplingParams, ...base });
const anthropic = createAnthropicProviders({ MixCustom: base.MixCustom });
const compatible = createCompatibleProviders({
    MixCustom: base.MixCustom,
    MixOpenAI: base.MixOpenAI
});
const google = createGoogleProviders({ MixCustom: base.MixCustom });

module.exports = {
    ...base,
    ...openai,
    ...anthropic,
    ...compatible,
    ...google
};
