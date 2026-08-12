const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixGrok } = require('../index.js');
const {
    mapEffort,
    resolveGrok420ModelKey,
    GROK420_ALIAS,
    GROK420_REASONING,
    GROK420_NON_REASONING
} = require('../effort.js');

describe('Grok Model Registration Tests', () => {
    const grokModels = [
        { method: 'grok46', key: 'grok-4.6' },
        { method: 'grok45', key: 'grok-4.5' },
        { method: 'grok43', key: 'grok-4.3' },
        { method: 'grok420multiAgent', key: 'grok-4.20-multi-agent-0309' },
        { method: 'grok420', key: GROK420_ALIAS }
    ];

    for (const grokModel of grokModels) {
        it(`should register ${grokModel.key} with ${grokModel.method}()`, () => {
            const model = ModelMix.new();
            model[grokModel.method]();

            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal(grokModel.key);
        });
    }

    it('forwards options and config through grok46()', () => {
        const options = { reasoning_effort: 'xhigh' };
        const config = { max_history: 3 };
        const model = ModelMix.new().grok46({ options, config });

        expect(model.models[0].provider).to.be.instanceOf(MixGrok);
        expect(model.models[0].provider.options).to.deep.equal(options);
        expect(model.models[0].provider.config).to.include(config);
    });

    it('maps unified effort to Grok 4.6 supported levels', () => {
        expect(mapEffort('openai', 0, 'grok-4.6')).to.deep.equal({ reasoning_effort: 'low' });
        expect(mapEffort('openai', 39, 'grok-4.6')).to.deep.equal({ reasoning_effort: 'low' });
        expect(mapEffort('openai', 40, 'grok-4.6')).to.deep.equal({ reasoning_effort: 'medium' });
        expect(mapEffort('openai', 60, 'grok-4.6')).to.deep.equal({ reasoning_effort: 'high' });
        expect(mapEffort('openai', 100, 'grok-4.6')).to.deep.equal({ reasoning_effort: 'xhigh' });
        expect(mapEffort('openai', -1, 'grok-4.6')).to.equal(null);
    });

    it('sends a supported Grok 4.6 reasoning effort', async () => {
        const originalApiKey = process.env.XAI_API_KEY;
        process.env.XAI_API_KEY = 'test-key';
        const api = nock('https://api.x.ai')
            .post('/v1/chat/completions', body => {
                expect(body.model).to.equal('grok-4.6');
                expect(body.reasoning_effort).to.equal('low');
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
            });

        try {
            const response = await ModelMix.new()
                .effort(0)
                .grok46({ config: { apiKey: 'test-key' } })
                .addText('Hi')
                .message();

            expect(response).to.equal('ok');
            api.done();
        } finally {
            if (originalApiKey === undefined) delete process.env.XAI_API_KEY;
            else process.env.XAI_API_KEY = originalApiKey;
        }
    });

    it('calculates Grok 4.6 cache and long-context costs', () => {
        expect(ModelMix.calculateCostBreakdown('grok-4.6', {
            input: 1_000_000,
            output: 1_000_000,
            cached: 1_000_000
        })).to.deep.equal({
            uncachedInput: 0,
            cachedInput: 1,
            cacheWrite: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 12,
            total: 13
        });
        expect(ModelMix.calculateCost('grok-4.6', {
            input: 199_999,
            output: 1_000_000
        })).to.equal(6.399998);
        expect(ModelMix.calculateCost('grok-4.6', {
            input: 200_000,
            output: 1_000_000
        })).to.equal(12.8);
    });
});

describe('Grok 4.20 effort → model resolution', () => {
    it('uses non-reasoning when effort is unset', () => {
        expect(resolveGrok420ModelKey(GROK420_ALIAS, undefined)).to.equal(GROK420_NON_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, null)).to.equal(GROK420_NON_REASONING);
    });

    it('uses non-reasoning for OpenAI none band (0–19)', () => {
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 0)).to.equal(GROK420_NON_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 19)).to.equal(GROK420_NON_REASONING);
    });

    it('uses reasoning for effort 20–100 and -1', () => {
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 20)).to.equal(GROK420_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 50)).to.equal(GROK420_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 100)).to.equal(GROK420_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, -1)).to.equal(GROK420_REASONING);
    });

    it('honors native reasoning_effort over config.effort', () => {
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 0, { reasoning_effort: 'high' }))
            .to.equal(GROK420_REASONING);
        expect(resolveGrok420ModelKey(GROK420_ALIAS, 100, { reasoning_effort: 'none' }))
            .to.equal(GROK420_NON_REASONING);
    });

    it('leaves non-alias keys unchanged', () => {
        expect(resolveGrok420ModelKey(GROK420_REASONING, 50)).to.equal(GROK420_REASONING);
        expect(resolveGrok420ModelKey('grok-4.3', 50)).to.equal('grok-4.3');
    });

    it('does not send reasoning_effort to concrete Grok 4.20 variants', async () => {
        const api = nock('https://api.x.ai')
            .post('/v1/chat/completions', body => {
                expect(body.model).to.equal(GROK420_REASONING);
                expect(body).to.not.have.property('reasoning_effort');
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
            });
        const provider = new MixGrok({
            config: { apiKey: 'test-key' }
        });

        await provider.create({
            options: {
                model: GROK420_REASONING,
                reasoning_effort: 'medium',
                messages: [{ role: 'user', content: 'Hi' }]
            }
        });

        api.done();
    });
});
