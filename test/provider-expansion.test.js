const { expect } = require('chai');
const {
    ModelMix,
    MixFireworks,
    MixMiniMax,
    MixNVIDIA,
    MixOpenRouter,
    MixTogether
} = require('../index.js');

describe('Provider expansion regressions', () => {
    it('should retain every enabled GPT OSS provider, including shared model keys', () => {
        const model = ModelMix.new().gptOss({
            mix: {
                nvidia: true,
                fireworks: true,
                together: true,
                cerebras: true,
                groq: true,
                openrouter: true
            }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'openai/gpt-oss-120b',
            'accounts/fireworks/models/gpt-oss-120b',
            'openai/gpt-oss-120b',
            'gpt-oss-120b',
            'openai/gpt-oss-120b',
            'openai/gpt-oss-120b'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixNVIDIA);
        expect(model.models[1].provider).to.be.instanceOf(MixFireworks);
        expect(ModelMix.calculateCost('accounts/fireworks/models/gpt-oss-120b', {
            input: 1_000_000,
            cached: 500_000,
            output: 1_000_000
        })).to.equal(0.682);
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
});
