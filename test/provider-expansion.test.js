const { expect } = require('chai');
const nock = require('nock');
const {
    ModelMix,
    MixFireworks,
    MixMiMo,
    MixMiniMax,
    MixNVIDIA,
    MixOpenRouter,
    MixTogether
} = require('../index.js');

describe('Provider expansion regressions', () => {
    it('should keep OpenRouter fallbacks disabled by default', () => {
        const originalMiniMaxApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = 'test-minimax-key';

        try {
            const kimi = ModelMix.new().kimiK26();
            const minimax = ModelMix.new().minimaxM27();

            expect(kimi.models.some(({ provider }) => provider instanceof MixOpenRouter)).to.equal(false);
            expect(minimax.models.map(({ key }) => key)).to.deep.equal(['MiniMax-M2.7']);
            expect(minimax.models[0].provider).to.be.instanceOf(MixMiniMax);
        } finally {
            if (originalMiniMaxApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalMiniMaxApiKey;
        }
    });

    it('should retain every enabled Muse Glimmer 30B provider, including shared model keys', () => {
        const model = ModelMix.new().museGlimmer30b({
            mix: {
                nvidia: true,
                fireworks: true,
                together: true,
                openrouter: true
            }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'meta/muse-glimmer-30b',
            'accounts/fireworks/models/muse-glimmer-30b',
            'meta/muse-glimmer-30b',
            'meta-models/Muse-Glimmer-30B'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixNVIDIA);
        expect(model.models[1].provider).to.be.instanceOf(MixFireworks);
        expect(model.models[2].provider).to.be.instanceOf(MixOpenRouter);
        expect(model.models[3].provider).to.be.instanceOf(MixTogether);
    });

    it('should retain every enabled MiniMax M2.7 provider in fallback order', () => {
        const originalMiniMaxApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = 'test-minimax-key';

        try {
            const model = ModelMix.new().minimaxM27({
                mix: {
                    nvidia: true,
                    fireworks: true,
                    openrouter: true,
                    minimax: true,
                    together: true
                }
            });

            expect(model.models.map(({ key }) => key)).to.deep.equal([
                'minimaxai/minimax-m2.7',
                'accounts/fireworks/models/minimax-m2p7',
                'minimax/minimax-m2.7',
                'MiniMax-M2.7',
                'MiniMaxAI/MiniMax-M2.7'
            ]);
            expect(model.models[0].provider).to.be.instanceOf(MixNVIDIA);
            expect(model.models[1].provider).to.be.instanceOf(MixFireworks);
            expect(model.models[2].provider).to.be.instanceOf(MixOpenRouter);
            expect(model.models[3].provider).to.be.instanceOf(MixMiniMax);
            expect(model.models[4].provider).to.be.instanceOf(MixTogether);
        } finally {
            if (originalMiniMaxApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalMiniMaxApiKey;
        }
    });

    it('should register Fireworks for MiniMax M3 without changing its default', () => {
        const model = ModelMix.new().minimaxM3({
            mix: { fireworks: true, openrouter: false, minimax: false, together: false }
        });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/minimax-m3');
        expect(model.models[0].provider).to.be.instanceOf(MixFireworks);
    });

    it('should send MiMo 2.6 Pro requests to the native MiMo API', async () => {
        const api = nock('https://api.xiaomimimo.com')
            .post('/v1/chat/completions', body => {
                expect(body.model).to.equal('mimo-v2.6-pro');
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
            });

        const model = ModelMix.new().mimo26pro({
            mix: { mimo: true, openrouter: false },
            config: { apiKey: 'test-mimo-key' }
        });

        expect(model.models).to.have.length(1);
        expect(model.models[0].provider).to.be.instanceOf(MixMiMo);

        const response = await model.addText('Hi').message();

        expect(response).to.equal('ok');
        api.done();
    });
});
