const { expect } = require('chai');
const { ModelMix, MixFireworks, MixOpenRouter, MixTogether } = require('../index.js');

describe('Qwen Model Registration Tests', () => {
    it('should register OpenRouter Qwen 3.6 Plus by default', () => {
        const model = ModelMix.new().qwen36plus();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.6-plus');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
    });

    it('should retain Fireworks Qwen 3.6 Plus as an explicit deployment option', () => {
        const model = ModelMix.new();
        model.qwen36plus({ mix: { fireworks: true, openrouter: false, together: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/qwen3p6-plus');
        expect(model.models[0].provider).to.be.instanceOf(MixFireworks);
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

    it('should register Together Qwen 3.7 Plus when together mix is enabled', () => {
        const model = ModelMix.new();
        model.qwen37plus({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('Qwen/Qwen3.7-Plus');
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
    });

    it('should apply OpenRouter long-context pricing to Qwen 3.6 and 3.7 Plus', () => {
        expect(ModelMix.calculateCost('qwen/qwen3.6-plus', {
            input: 256_000,
            output: 1_000_000
        })).to.equal(4.2328);
        expect(ModelMix.calculateCost('qwen/qwen3.7-plus', {
            input: 256_000,
            output: 1_000_000
        })).to.equal(4.08576);
    });

    it('should register Fireworks Qwen 3.8 Max before the OpenRouter fallback by default', () => {
        const model = ModelMix.new();
        model.qwen38max();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'accounts/fireworks/models/qwen3p8-2p4t-a95b',
            'qwen/qwen3.8-max'
        ]);
        expect(ModelMix.calculateCost('accounts/fireworks/models/qwen3p8-2p4t-a95b', {
            input: 1_000_000,
            cached: 250_000,
            output: 1_000_000
        })).to.equal(7.5625);
    });

    it('should register only OpenRouter Qwen 3.8 Max when Fireworks is disabled', () => {
        const model = ModelMix.new();
        model.qwen38max({ mix: { fireworks: false, openrouter: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.8-max');
    });

    it('should register Qwen 3.8 27B through OpenRouter', () => {
        const model = ModelMix.new().qwen3827b();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.8-27b');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('qwen/qwen3.8-27b', {
            input: 1_000_000,
            cached: 250_000,
            output: 1_000_000
        })).to.equal(3.55);
    });

    it('should support Qwen 3.8 27B in chain()', () => {
        const model = ModelMix.new().chain('qwen3827b');

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.8-27b');
    });

    it('should register Qwen 3.5 397B A17B through OpenRouter', () => {
        const model = ModelMix.new().qwen35397b();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.5-397b-a17b');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('qwen/qwen3.5-397b-a17b', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(2.835);
    });

    it('should support Qwen 3.5 397B A17B in chain()', () => {
        const model = ModelMix.new().chain('qwen35397b');

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('qwen/qwen3.5-397b-a17b');
    });
});
