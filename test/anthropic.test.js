const { expect } = require('chai');
const { ModelMix, MixAnthropic } = require('../index.js');

describe('Anthropic Model Registration Tests', () => {
    it('should register Claude Opus 4.8', () => {
        const model = ModelMix.new();
        model.opus48();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-4-8');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should register Claude Opus 4.8 with thinking enabled', () => {
        const model = ModelMix.new();
        model.opus48think();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-4-8');
        expect(model.models[0].provider.options.thinking).to.deep.equal({
            type: 'enabled',
            budget_tokens: 1638
        });
    });

    it('should register Claude Sonnet 5', () => {
        const model = ModelMix.new();
        model.sonnet5();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-sonnet-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should register Claude Sonnet 5 with thinking enabled', () => {
        const model = ModelMix.new();
        model.sonnet5think();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-sonnet-5');
        expect(model.models[0].provider.options.thinking).to.deep.equal({
            type: 'enabled',
            budget_tokens: 1638
        });
    });
});
