const { expect } = require('chai');
const { ModelMix } = require('../index.js');
const {
    resolveGrok420ModelKey,
    GROK420_ALIAS,
    GROK420_REASONING,
    GROK420_NON_REASONING
} = require('../effort.js');

describe('Grok Model Registration Tests', () => {
    const grokModels = [
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
});
