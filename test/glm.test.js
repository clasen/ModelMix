const { expect } = require('chai');
const { ModelMix, MixFireworks, MixOpenRouter, MixTogether } = require('../index.js');

describe('GLM Model Registration Tests', () => {
    it('should register Together GLM 5.2 before the OpenRouter fallback by default', () => {
        const model = ModelMix.new();
        model.GLM52();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'zai-org/GLM-5.2',
            'z-ai/glm-5.2'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
        expect(model.models[1].provider).to.be.instanceOf(MixOpenRouter);
    });

    it('should register every requested GLM 5.2 provider', () => {
        const model = ModelMix.new().GLM52({
            mix: { together: true, fireworks: true, openrouter: true }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'zai-org/GLM-5.2',
            'accounts/fireworks/models/glm-5p2',
            'z-ai/glm-5.2'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
        expect(model.models[1].provider).to.be.instanceOf(MixFireworks);
        expect(model.models[2].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('accounts/fireworks/models/glm-5p2', {
            input: 1_000_000,
            cached: 500_000,
            output: 1_000_000
        })).to.equal(5.17);
    });

    it('should register GLM 5.3 through OpenRouter', () => {
        const model = ModelMix.new().GLM53();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('z-ai/glm-5.3');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('z-ai/glm-5.3', {
            input: 1_000_000,
            cached: 500_000,
            output: 1_000_000
        })).to.equal(5.23);
    });

    it('should support GLM 5.3 in chain()', () => {
        const model = ModelMix.new().chain('GLM53');

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('z-ai/glm-5.3');
    });
});
