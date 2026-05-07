const { expect } = require('chai');
const { ModelMix } = require('../index.js');

describe('DeepSeek Model Registration Tests', () => {
    it('should register Fireworks DeepSeek V4 Pro by default', () => {
        const model = ModelMix.new();
        model.deepseekV4Pro({ mix: { fireworks: true, openrouter: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/deepseek-v4-pro');
    });

    it('should register Together DeepSeek V4 Pro when together mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Pro({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/DeepSeek-V4-Pro');
    });
});
