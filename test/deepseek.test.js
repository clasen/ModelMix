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

    it('should register Fireworks DeepSeek V4 Flash by default', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: true, openrouter: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/deepseek-v4-flash');
        expect(ModelMix.calculateCost('accounts/fireworks/models/deepseek-v4-flash', {
            input: 1_000_000,
            output: 1_000_000
        })).to.be.closeTo(0.42, 1e-10);
    });

    it('should register NVIDIA DeepSeek V4 Flash when nvidia mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: false, nvidia: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/deepseek-v4-flash');
    });

    it('should register OpenRouter DeepSeek V4 Flash when openrouter mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek/deepseek-v4-flash');
        expect(ModelMix.calculateCost('deepseek/deepseek-v4-flash', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(0.27);
    });

    it('should register Together DeepSeek V4 Flash when together mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/DeepSeek-V4-Flash');
    });
});
