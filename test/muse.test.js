const { expect } = require('chai');
const {
    ModelMix,
    MixFireworks,
    MixNVIDIA,
    MixOpenRouter,
    MixTogether
} = require('../index.js');

describe('Muse Model Registration Tests', () => {
    it('registers only Fireworks by default', () => {
        const model = ModelMix.new().museGlimmer30b();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'accounts/fireworks/models/muse-glimmer-30b'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixFireworks);
    });

    it('registers every supported provider in fallback order', () => {
        const model = ModelMix.new().museGlimmer30b({
            mix: { nvidia: true, fireworks: true, openrouter: true, together: true }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'meta/muse-glimmer-30b',
            'accounts/fireworks/models/muse-glimmer-30b',
            'meta/muse-glimmer-30b',
            'meta-models/Muse-Glimmer-30B'
        ]);
        expect(model.models.map(({ provider }) => provider.constructor)).to.deep.equal([
            MixNVIDIA,
            MixFireworks,
            MixOpenRouter,
            MixTogether
        ]);
    });

    it('calculates cached input pricing for every provider model ID', () => {
        const usage = { input: 1_000_000, cached: 250_000, output: 1_000_000 };

        for (const key of [
            'meta/muse-glimmer-30b',
            'accounts/fireworks/models/muse-glimmer-30b',
            'meta-models/Muse-Glimmer-30B'
        ]) {
            expect(ModelMix.calculateCost(key, usage)).to.equal(1.7725);
        }
    });

    it('supports Muse Glimmer 30B in chain()', () => {
        const model = ModelMix.new().chain('museGlimmer30b');

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'accounts/fireworks/models/muse-glimmer-30b'
        ]);
    });

    it('registers Muse Spark 1.2 Contributor through OpenRouter', () => {
        const model = ModelMix.new().museSpark12Contributor();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('meta/muse-spark-1.2-contributor');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(ModelMix.calculateCost('meta/muse-spark-1.2-contributor', {
            input: 1_000_000,
            cached: 250_000,
            output: 1_000_000
        })).to.equal(0.2755);
    });

    it('supports Muse Spark 1.2 Contributor in chain()', () => {
        const model = ModelMix.new().chain('museSpark12Contributor');

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('meta/muse-spark-1.2-contributor');
    });
});
