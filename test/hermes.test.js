const { expect } = require('chai');
const { ModelMix, MixOpenRouter } = require('../index.js');

describe('Hermes Model Registration Tests', () => {
    it('should register Hermes 4 70B through OpenRouter', () => {
        const model = ModelMix.new().hermes470b();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('nousresearch/hermes-4-70b');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('nousresearch/hermes-4-70b', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(0.53);
    });

    it('should register Hermes 4 405B through OpenRouter', () => {
        const model = ModelMix.new().hermes4405b();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('nousresearch/hermes-4-405b');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('nousresearch/hermes-4-405b', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(4);
    });

    it('should support both Hermes 4 shortcuts in chain()', () => {
        const model = ModelMix.new().chain('hermes470b', 'hermes4405b');

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'nousresearch/hermes-4-70b',
            'nousresearch/hermes-4-405b'
        ]);
    });
});
