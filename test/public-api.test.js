const { expect } = require('chai');

const api = require('../index.js');

describe('public module boundary', () => {
    it('preserves the CommonJS export surface', () => {
        expect(Object.keys(api).sort()).to.deep.equal([
            'MixAnthropic',
            'MixCerebras',
            'MixCustom',
            'MixFireworks',
            'MixGoogle',
            'MixGrok',
            'MixGroq',
            'MixKimi',
            'MixLMStudio',
            'MixMiMo',
            'MixMiniMax',
            'MixModeration',
            'MixNVIDIA',
            'MixOllama',
            'MixOpenAI',
            'MixOpenAIModeration',
            'MixOpenAIResponses',
            'MixOpenAIWebSocket',
            'MixOpenRouter',
            'MixPerplexity',
            'MixTogether',
            'ModelMix',
            'ModerationMix',
            'applyUnifiedEffort',
            'normalizeEffort',
            'resolveProviderFamily'
        ]);
    });

    it('preserves provider inheritance and class identity', () => {
        expect(Object.getPrototypeOf(api.MixOpenAIResponses.prototype)).to.equal(api.MixOpenAI.prototype);
        expect(Object.getPrototypeOf(api.MixOpenAIModeration.prototype)).to.equal(api.MixModeration.prototype);
        expect(Object.getPrototypeOf(api.ModerationMix.prototype)).to.equal(api.ModelMix.prototype);
        expect(require('../index.js').MixCustom).to.equal(api.MixCustom);
    });

    it('keeps root exports usable by model shortcuts', () => {
        const model = api.ModelMix.new().qwen35397b({ config: { apiKey: 'test-key' } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].provider.constructor).to.equal(api.MixOpenRouter);
    });

    it('keeps the mutable pricing catalog private', () => {
        expect(require('../lib/token-usage')).to.not.have.property('MODEL_PRICING');
    });
});
