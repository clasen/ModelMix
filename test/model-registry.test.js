const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const nock = require('nock');
const {
    ModelMix,
    MixCustom,
    MixOpenAI,
    MixOpenRouter,
    MixFireworks,
    MixTogether,
    MixKimi,
    MixAnthropic,
    MixGoogle,
    MixPerplexity,
    MixLMStudio,
    resolveProviderFamily
} = require('../index.js');
const { listModelShortcuts, MODEL_SHORTCUTS } = require('../lib/model-registry');

function keys(model) {
    return model.models.map(({ key }) => key);
}

function withoutEnv(names, fn) {
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
        for (const name of names) delete process.env[name];
        return fn();
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
}

describe('Model registry', () => {
    it('declares every registered shortcut in index.d.ts', () => {
        const declarations = fs.readFileSync(path.join(__dirname, '..', 'index.d.ts'), 'utf8');
        for (const shortcut of listModelShortcuts()) {
            expect(declarations, shortcut).to.match(new RegExp(`\\n\\s+${shortcut}\\(`));
        }
    });

    it('generates a fluent method for every shortcut', () => {
        for (const shortcut of listModelShortcuts()) {
            expect(ModelMix.prototype[shortcut], shortcut).to.be.a('function');
            expect(ModelMix.new()[shortcut]().models.length, shortcut).to.be.greaterThan(0);
        }
    });

    it('keeps aliases equivalent to their target', () => {
        for (const [shortcut, spec] of Object.entries(MODEL_SHORTCUTS)) {
            if (spec.alias === undefined) continue;
            expect(keys(ModelMix.new()[shortcut]()), shortcut).to.deep.equal(keys(ModelMix.new()[spec.alias]()));
        }
    });

    describe('mix resolution', () => {
        it('lets ModelMix.new({ mix }) override shortcut defaults', () => {
            const model = ModelMix.new({ mix: { fireworks: false, openrouter: true } }).kimiK26();
            expect(keys(model)).to.deep.equal(['moonshotai/kimi-k2.6']);
            expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        });

        it('lets an instance flag enable a route the shortcut leaves off', () => {
            const model = ModelMix.new({ mix: { openrouter: true } }).kimiK3();
            expect(keys(model)).to.deep.equal(['kimi-k3', 'moonshotai/kimi-k3']);
            expect(model.models[0].provider).to.be.instanceOf(MixKimi);
        });

        it('keeps instance flags on models derived with new()', () => {
            const model = ModelMix.new({ mix: { fireworks: false, together: true } }).new().kimiK26();
            expect(keys(model)).to.deep.equal(['moonshotai/Kimi-K2.6']);
            expect(model.models[0].provider).to.be.instanceOf(MixTogether);
        });

        it('treats a call-level mix as the exact route selection', () => {
            expect(keys(ModelMix.new().kimiK26({ mix: { openrouter: true } })))
                .to.deep.equal(['moonshotai/kimi-k2.6']);
            expect(keys(ModelMix.new().kimiK26({ mix: { fireworks: true, together: true } })))
                .to.deep.equal(['accounts/fireworks/models/kimi-k2p6', 'moonshotai/Kimi-K2.6']);
        });

        it('keeps the official Anthropic route for Fable 5.1 unless disabled', () => {
            expect(keys(ModelMix.new().fable51({ mix: { openrouter: true } })))
                .to.deep.equal(['claude-fable-5-1', 'anthropic/claude-fable-5.1']);
            expect(keys(ModelMix.new({ mix: { anthropic: false, openrouter: true } }).fable51()))
                .to.deep.equal(['anthropic/claude-fable-5.1']);
        });

        it('reports library defaults on instance.mix without overriding shortcut defaults', () => {
            const model = ModelMix.new();
            expect(model.mix).to.include({ openrouter: false, together: false, lambda: false });
            expect(keys(model.kimiK27Code())).to.deep.equal(['moonshotai/Kimi-K2.7-Code']);
        });
    });

    it('resolves provider families from static class declarations', () => {
        const cases = [
            [MixOpenAI, 'openai'],
            [MixOpenRouter, 'openai'],
            [MixFireworks, 'openai'],
            [MixAnthropic, 'anthropic'],
            [MixGoogle, 'google'],
            [MixPerplexity, null],
            [MixLMStudio, null],
            [MixCustom, null]
        ];
        for (const [Provider, family] of cases) {
            expect(resolveProviderFamily(new Provider({ config: { apiKey: 'test' } })), Provider.name).to.equal(family);
        }

        class CustomOpenAICompatible extends MixCustom {
            static family = 'openai';
        }
        expect(resolveProviderFamily(new CustomOpenAICompatible())).to.equal('openai');
    });
});

describe('API key checks', () => {
    afterEach(() => nock.cleanAll());

    it('does not throw when a provider is constructed without its key', () => {
        withoutEnv(['FIREWORKS_API_KEY'], () => {
            expect(() => new MixFireworks()).to.not.throw();
        });
    });

    it('reports every missing key of a chain in one error and attaches nothing', () => {
        withoutEnv(['FIREWORKS_API_KEY', 'TOGETHER_API_KEY', 'ANTHROPIC_API_KEY'], () => {
            const model = ModelMix.new().gpt5nano();
            let error;
            try {
                model.chain('kimiK26', 'GLM52', 'sonnet55');
            } catch (caught) {
                error = caught;
            }

            expect(error).to.be.instanceOf(Error);
            expect(error.code).to.equal('MISSING_API_KEY');
            expect(error.missingKeys.map(({ env }) => env)).to.deep.equal([
                'FIREWORKS_API_KEY',
                'TOGETHER_API_KEY',
                'ANTHROPIC_API_KEY'
            ]);
            expect(error.message).to.include('FIREWORKS_API_KEY')
                .and.to.include('TOGETHER_API_KEY')
                .and.to.include('ANTHROPIC_API_KEY');
            expect(keys(model)).to.deep.equal(['gpt-5-nano']);
        });
    });

    it('checks every route a multi-provider shortcut selects', () => {
        withoutEnv(['TOGETHER_API_KEY'], () => {
            const model = ModelMix.new();
            expect(() => model.kimiK26({ mix: { fireworks: true, together: true } })).to.throw(/TOGETHER_API_KEY/);
            expect(model.models).to.have.length(0);
        });
    });

    it('accepts config.apiKey instead of the environment variable', () => {
        withoutEnv(['FIREWORKS_API_KEY'], () => {
            const model = ModelMix.new().kimiK26({ config: { apiKey: 'fw-inline-key' } });
            expect(model.models[0].provider.config.apiKey).to.equal('fw-inline-key');
        });
    });

    it('rejects direct provider requests without a key before any HTTP call', async () => {
        const provider = withoutEnv(['FIREWORKS_API_KEY'], () => new MixFireworks());
        nock.disableNetConnect();
        try {
            const error = await provider.create({
                options: { model: 'accounts/fireworks/models/kimi-k2p6', messages: [] },
                config: {}
            }).then(() => null, caught => caught);
            expect(error.code).to.equal('MISSING_API_KEY');
            expect(error.message).to.include('FIREWORKS_API_KEY');
        } finally {
            nock.enableNetConnect();
        }
    });
});
