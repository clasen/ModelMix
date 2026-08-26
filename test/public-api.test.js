const { expect } = require('chai');

const api = require('../index.js');

describe('public module boundary', () => {
    it('preserves the CommonJS export surface', () => {
        expect(Object.keys(api).sort()).to.deep.equal([
            'MixAnthropic',
            'MixCerebras',
            'MixCustom',
            'MixFireworks',
            'MixGoogle',
            'MixGrok',
            'MixGroq',
            'MixKimi',
            'MixLMStudio',
            'MixMiMo',
            'MixMiniMax',
            'MixModeration',
            'MixNVIDIA',
            'MixOllama',
            'MixOpenAI',
            'MixOpenAIModeration',
            'MixOpenAIResponses',
            'MixOpenAIWebSocket',
            'MixOpenRouter',
            'MixPerplexity',
            'MixTogether',
            'ModelMix',
            'ModerationMix',
            'applyUnifiedEffort',
            'normalizeEffort',
            'resolveProviderFamily'
        ]);
    });

    it('preserves provider inheritance and class identity', () => {
        expect(Object.getPrototypeOf(api.MixOpenAIResponses.prototype)).to.equal(api.MixOpenAI.prototype);
        expect(Object.getPrototypeOf(api.MixOpenAIModeration.prototype)).to.equal(api.MixModeration.prototype);
        expect(Object.getPrototypeOf(api.ModerationMix.prototype)).to.equal(api.ModelMix.prototype);
        expect(require('../index.js').MixCustom).to.equal(api.MixCustom);
    });

    it('keeps root exports usable by model shortcuts', () => {
        const model = api.ModelMix.new().qwen35397b({ config: { apiKey: 'test-key' } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].provider.constructor).to.equal(api.MixOpenRouter);
    });

    const explicitApiKeyCases = [
        ['OpenAI', config => new api.MixOpenAIResponses({ config })],
        ['OpenAI moderation', config => new api.MixOpenAIModeration({ config })],
        ['Anthropic', config => new api.MixAnthropic({ config })],
        ['Gemini', config => new api.MixGoogle({ config })],
        ['MiniMax', config => new api.MixMiniMax({ config })],
        ['MiMo', config => new api.MixMiMo({ config })],
        ['Perplexity', config => new api.MixPerplexity({ config })],
        ['Grok', config => new api.MixGrok({ config })],
        ['Lambda', config => api.ModelMix.new({ mix: { openrouter: false, lambda: true } })
            .hermes3({ config }).models[0].provider],
        ['Groq', config => new api.MixGroq({ config })],
        ['Together', config => new api.MixTogether({ config })],
        ['Cerebras', config => new api.MixCerebras({ config })],
        ['Fireworks', config => new api.MixFireworks({ config })],
        ['NVIDIA', config => new api.MixNVIDIA({ config })],
        ['OpenRouter', config => new api.MixOpenRouter({ config })],
        ['Moonshot', config => new api.MixKimi({ config })]
    ];

    for (const [providerName, createProvider] of explicitApiKeyCases) {
        it(`uses an explicit API key for ${providerName} without reading environment credentials`, () => {
            const originalEnv = process.env;
            process.env = new Proxy(originalEnv, {
                get(target, property, receiver) {
                    if (typeof property === 'string' && property.endsWith('_API_KEY')) {
                        throw new Error(`${property} should not be read`);
                    }
                    return Reflect.get(target, property, receiver);
                }
            });

            try {
                const provider = createProvider({ apiKey: 'explicit-key' });

                expect(provider.config.apiKey).to.equal('explicit-key');
            } finally {
                process.env = originalEnv;
            }
        });
    }

    it('keeps the mutable pricing catalog private', () => {
        expect(require('../lib/token-usage')).to.not.have.property('MODEL_PRICING');
    });
});
