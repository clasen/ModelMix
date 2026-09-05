const { expect } = require('chai');
const nock = require('nock');
const {
    ModelMix,
    MixFireworks,
    MixNVIDIA,
    MixOpenRouter,
    MixTogether
} = require('../index.js');

describe('Muse Model Registration Tests', () => {
    it('sends Muse Spark 1.3 requests through chain() with supported effort and options', async () => {
        const api = nock('https://openrouter.ai')
            .post('/api/v1/chat/completions', body => {
                expect(body.model).to.equal('meta/muse-spark-1.3');
                expect(body.reasoning_effort).to.equal('minimal');
                expect(body.max_tokens).to.equal(2048);
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
            });

        const model = ModelMix.new({ config: { apiKey: 'test-key' }, options: { max_tokens: 2048 } })
            .chain('museSpark13@0')
            .addText('Hi');

        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(await model.message()).to.equal('ok');
        api.done();
    });

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

    for (const [shortcut, key] of [
        ['museSpark12', 'meta/muse-spark-1.2'],
        ['museSpark12c', 'meta/muse-spark-1.2-contributor'],
        ['museSpark13', 'meta/muse-spark-1.3'],
        ['museSpark13c', 'meta/muse-spark-1.3-contributor']
    ]) {
        it(`registers ${shortcut} directly and through chain()`, () => {
            const direct = ModelMix.new()[shortcut]({
                config: { apiKey: 'test-key' },
                options: { max_tokens: 2048 }
            });
            const chain = ModelMix.new({ config: { apiKey: 'test-key' } }).chain(shortcut);

            for (const model of [direct, chain]) {
                expect(model.models).to.have.length(1);
                expect(model.models[0].key).to.equal(key);
                expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
            }
            expect(direct.models[0].provider.options.max_tokens).to.equal(2048);
        });
    }
});
