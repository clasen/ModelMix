const { expect } = require('chai');
const { ModelMix } = require('../index.js');

describe('Qwen Model Registration Tests', () => {
    it('should register Fireworks Qwen 3.6 Plus by default', () => {
        const model = ModelMix.new();
        model.qwen36plus({ mix: { fireworks: true, together: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/qwen3p6-plus');
    });

    it('should register Together Qwen 3.6 Plus when together mix is enabled', () => {
        const model = ModelMix.new();
        model.qwen36plus({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('Qwen/Qwen3.6-Plus');
    });

    it('should register Fireworks Qwen 3.7 Plus by default', () => {
        const model = ModelMix.new();
        model.qwen37plus({ mix: { fireworks: true, openrouter: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/qwen3p7-plus');
        expect(ModelMix.calculateCost('accounts/fireworks/models/qwen3p7-plus', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(2.00);
    });

    it('should register OpenRouter Qwen 3.7 Plus when openrouter mix is enabled', () => {
        const model = ModelMix.new();
        model.qwen37plus({ mix: { fireworks: false, openrouter: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.7-plus');
    });

    it('should register OpenRouter Qwen 3.8 Max by default', () => {
        const model = ModelMix.new();
        model.qwen38max();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.8-max');
        expect(ModelMix.calculateCost('qwen/qwen3.8-max', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(8.00);
    });
});
