const { expect } = require('chai');

const { ModelMix } = require('../index.js');
const { listChainModelShortcuts } = require('../lib/model-chain');
const { applyUnifiedEffort, resolveProviderFamily } = require('../effort');

describe('model chain catalog', () => {
    it('contains only implemented ModelMix shortcuts', () => {
        for (const shortcut of listChainModelShortcuts()) {
            expect(ModelMix.prototype[shortcut], shortcut).to.be.a('function');
        }
    });

    it('resolves named levels per provider while retaining numeric overrides and inheritance', () => {
        const model = ModelMix.new().effort(20)
            .chain('gpt6luna@high', 'sonnet5@high', 'gemini38flash@high', 'gpt6sol@50', 'gpt6astra');
        const options = model.models.map(({ key, provider }) => applyUnifiedEffort(
            {}, { ...model.config, ...provider.config }, resolveProviderFamily(provider), key
        ));
        expect(options).to.deep.equal([
            { reasoning_effort: 'high' },
            { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'high' } },
            { thinkingConfig: { thinkingLevel: 'high' } },
            { reasoning_effort: 'medium' },
            { reasoning_effort: 'low' }
        ]);
        expect(model.config.effort).to.equal(20);
        expect(model.models[3].provider.config.effort).to.equal(50);
        expect(model.models[4].provider.config).not.to.have.property('effort');
    });

    it('applies named levels to every enabled provider fallback', () => {
        const model = ModelMix.new({ mix: { openrouter: true } }).chain('gpt6luna@max', 'fable51@high');
        expect(model.models).to.have.length(4);
        for (const { key, provider } of model.models) {
            const options = applyUnifiedEffort({}, provider.config, resolveProviderFamily(provider), key);
            expect(options.reasoning_effort || options.output_config?.effort)
                .to.equal(key.includes('gpt') ? 'max' : 'high');
        }
    });

    it('rejects invalid or unsupported names without partially attaching a chain', () => {
        for (const spec of ['gpt6luna@typo', 'gpt6luna@minimal', 'gemini38flash@xhigh', 'sonar@high']) {
            const model = ModelMix.new().gpt5nano();
            const original = [...model.models];
            expect(() => model.chain('sonnet5@50', spec)).to.throw(/Invalid effort/);
            expect(model.models).to.deep.equal(original);
        }
    });

    it('keeps explicit native effort controls ahead of named chain overrides', () => {
        const model = ModelMix.new({ options: { reasoning_effort: 'low' } }).chain('gpt6luna@high');
        const { key, provider } = model.models[0];
        const options = applyUnifiedEffort({ ...model.options }, provider.config, resolveProviderFamily(provider), key);
        expect(options.reasoning_effort).to.equal('low');
    });

    it('validates named levels even when the model is already attached', () => {
        const model = ModelMix.new().chain('gpt6luna@50');
        expect(() => model.chain('gpt6luna@minimal')).to.throw(/Invalid effort/);
        model.chain('gpt6luna@high');
        expect(model.models).to.have.length(1);
        expect(model.models[0].provider.config.effort).to.equal(50);
    });
});
