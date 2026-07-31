const { expect } = require('chai');
const {
    normalizeEffort,
    mapEffort,
    applyUnifiedEffort,
    hasNativeEffort,
    resolveProviderFamily,
    levelFromBands,
    OPENAI_BANDS,
    ANTHROPIC_BANDS,
    GEMINI_BANDS,
} = require('../effort.js');
const {
    ModelMix,
    MixOpenAI,
    MixOpenAIResponses,
    MixAnthropic,
    MixGoogle,
    MixPerplexity,
} = require('../index.js');

describe('Unified effort scale', () => {
    describe('normalizeEffort', () => {
        it('accepts -1 and 0..100 integers', () => {
            expect(normalizeEffort(-1)).to.equal(-1);
            expect(normalizeEffort(0)).to.equal(0);
            expect(normalizeEffort(50)).to.equal(50);
            expect(normalizeEffort(100)).to.equal(100);
        });

        it('rejects invalid values', () => {
            expect(() => normalizeEffort(1.5)).to.throw(/Invalid effort/);
            expect(() => normalizeEffort(101)).to.throw(/Invalid effort/);
            expect(() => normalizeEffort(-2)).to.throw(/Invalid effort/);
            expect(() => normalizeEffort('medium')).to.throw(/Invalid effort/);
            expect(() => normalizeEffort(null)).to.throw(/Invalid effort/);
        });
    });

    describe('band mapping', () => {
        it('maps OpenAI bands', () => {
            expect(levelFromBands(0, OPENAI_BANDS)).to.equal('none');
            expect(levelFromBands(19, OPENAI_BANDS)).to.equal('none');
            expect(levelFromBands(20, OPENAI_BANDS)).to.equal('low');
            expect(levelFromBands(40, OPENAI_BANDS)).to.equal('medium');
            expect(levelFromBands(60, OPENAI_BANDS)).to.equal('high');
            expect(levelFromBands(80, OPENAI_BANDS)).to.equal('xhigh');
            expect(levelFromBands(100, OPENAI_BANDS)).to.equal('xhigh');
        });

        it('maps Anthropic bands', () => {
            expect(levelFromBands(0, ANTHROPIC_BANDS)).to.equal('low');
            expect(levelFromBands(20, ANTHROPIC_BANDS)).to.equal('medium');
            expect(levelFromBands(40, ANTHROPIC_BANDS)).to.equal('high');
            expect(levelFromBands(60, ANTHROPIC_BANDS)).to.equal('xhigh');
            expect(levelFromBands(80, ANTHROPIC_BANDS)).to.equal('max');
        });

        it('maps Gemini bands', () => {
            expect(levelFromBands(0, GEMINI_BANDS)).to.equal('minimal');
            expect(levelFromBands(25, GEMINI_BANDS)).to.equal('low');
            expect(levelFromBands(50, GEMINI_BANDS)).to.equal('medium');
            expect(levelFromBands(75, GEMINI_BANDS)).to.equal('high');
        });
    });

    describe('mapEffort', () => {
        it('maps OpenAI effort to reasoning_effort', () => {
            expect(mapEffort('openai', 10)).to.deep.equal({ reasoning_effort: 'none' });
            expect(mapEffort('openai', 50)).to.deep.equal({ reasoning_effort: 'medium' });
            expect(mapEffort('openai', 90)).to.deep.equal({ reasoning_effort: 'xhigh' });
        });

        it('sets OpenAI adaptive only when supported (otherwise no-op)', () => {
            expect(mapEffort('openai', -1)).to.equal(null);
            expect(mapEffort('openai', -1, 'gpt-5.2')).to.equal(null);
        });

        it('clamps OpenAI to model-supported levels', () => {
            expect(mapEffort('openai', 10, 'gpt-5.3-codex')).to.deep.equal({ reasoning_effort: 'low' });
            expect(mapEffort('openai', 10, 'gpt-oss-120b')).to.deep.equal({ reasoning_effort: 'low' });
        });

        it('maps Anthropic effort to output_config.effort', () => {
            expect(mapEffort('anthropic', 10)).to.deep.equal({ output_config: { effort: 'low' } });
            expect(mapEffort('anthropic', 90)).to.deep.equal({ output_config: { effort: 'max' } });
        });

        it('maps Anthropic adaptive to thinking.type=adaptive', () => {
            expect(mapEffort('anthropic', -1)).to.deep.equal({ thinking: { type: 'adaptive' } });
        });

        it('maps Gemini 3+ thinkingLevel', () => {
            expect(mapEffort('google', 10, 'gemini-3.6-flash')).to.deep.equal({
                thinkingConfig: { thinkingLevel: 'minimal' }
            });
            expect(mapEffort('google', 80, 'gemini-3.6-flash')).to.deep.equal({
                thinkingConfig: { thinkingLevel: 'high' }
            });
        });

        it('clamps Gemini levels for models with fewer steps', () => {
            expect(mapEffort('google', 10, 'gemini-3-pro-preview')).to.deep.equal({
                thinkingConfig: { thinkingLevel: 'low' }
            });
        });

        it('maps Gemini adaptive (-1) to thinkingBudget -1', () => {
            expect(mapEffort('google', -1, 'gemini-3.6-flash')).to.deep.equal({
                thinkingConfig: { thinkingBudget: -1 }
            });
            expect(mapEffort('google', -1, 'gemini-2.5-flash')).to.deep.equal({
                thinkingConfig: { thinkingBudget: -1 }
            });
        });

        it('maps Gemini 2.5 to thinkingBudget', () => {
            expect(mapEffort('google', 0, 'gemini-2.5-flash')).to.deep.equal({
                thinkingConfig: { thinkingBudget: 0 }
            });
            expect(mapEffort('google', 100, 'gemini-2.5-flash')).to.deep.equal({
                thinkingConfig: { thinkingBudget: 24576 }
            });
            expect(mapEffort('google', 50, 'gemini-2.5-pro')).to.deep.equal({
                thinkingConfig: { thinkingBudget: 16384 }
            });
        });

        it('maps DeepSeek V4 effort to thinking + reasoning_effort', () => {
            const key = 'accounts/fireworks/models/deepseek-v4-flash';
            expect(mapEffort('openai', 0, key)).to.deep.equal({
                thinking: { type: 'disabled' }
            });
            expect(mapEffort('openai', 30, key)).to.deep.equal({
                reasoning_effort: 'low',
                thinking: { type: 'enabled' }
            });
            expect(mapEffort('openai', 50, key)).to.deep.equal({
                reasoning_effort: 'high',
                thinking: { type: 'enabled' }
            });
            expect(mapEffort('openai', 100, 'deepseek-ai/DeepSeek-V4-Pro')).to.deep.equal({
                reasoning_effort: 'max',
                thinking: { type: 'enabled' }
            });
            // No adaptive control on DeepSeek → no-op
            expect(mapEffort('openai', -1, 'deepseek/deepseek-v4-flash')).to.equal(null);
        });

        it('maps MiniMax thinking adaptive/disabled', () => {
            expect(mapEffort('openai', -1, 'MiniMax-M3')).to.deep.equal({
                thinking: { type: 'adaptive' }
            });
            expect(mapEffort('openai', 0, 'minimax/minimax-m3')).to.deep.equal({
                thinking: { type: 'disabled' }
            });
            expect(mapEffort('openai', 50, 'MiniMaxAI/MiniMax-M3')).to.deep.equal({
                thinking: { type: 'adaptive' }
            });
        });

        it('returns null for unsupported families', () => {
            expect(mapEffort(null, 50)).to.equal(null);
        });
    });

    describe('applyUnifiedEffort / native wins', () => {
        it('applies OpenAI mapping when native absent', () => {
            const options = {};
            applyUnifiedEffort(options, { effort: 50 }, 'openai', 'gpt-5.2');
            expect(options.reasoning_effort).to.equal('medium');
        });

        it('applies MiniMax adaptive from config.effort -1', () => {
            const options = {};
            applyUnifiedEffort(options, { effort: -1 }, 'openai', 'MiniMax-M3');
            expect(options.thinking).to.deep.equal({ type: 'adaptive' });
        });

        it('applies DeepSeek mapping on Fireworks model key', () => {
            const options = {};
            applyUnifiedEffort(
                options,
                { effort: 100 },
                'openai',
                'accounts/fireworks/models/deepseek-v4-flash'
            );
            expect(options.reasoning_effort).to.equal('max');
            expect(options.thinking).to.deep.equal({ type: 'enabled' });
        });

        it('applies DeepSeek disabled thinking without reasoning_effort', () => {
            const options = {};
            applyUnifiedEffort(
                options,
                { effort: 10 },
                'openai',
                'deepseek/deepseek-v4-flash'
            );
            expect(options.thinking).to.deep.equal({ type: 'disabled' });
            expect(options.reasoning_effort).to.equal(undefined);
        });

        it('skips DeepSeek mapping when thinking is already set', () => {
            const options = { thinking: { type: 'disabled' } };
            applyUnifiedEffort(
                options,
                { effort: 100 },
                'openai',
                'accounts/fireworks/models/deepseek-v4-flash'
            );
            expect(options.thinking).to.deep.equal({ type: 'disabled' });
            expect(options.reasoning_effort).to.equal(undefined);
        });

        it('skips OpenAI mapping when reasoning_effort is set', () => {
            const options = { reasoning_effort: 'none' };
            applyUnifiedEffort(options, { effort: 90 }, 'openai', 'gpt-5.2');
            expect(options.reasoning_effort).to.equal('none');
        });

        it('applies Anthropic mapping when native absent', () => {
            const options = {};
            applyUnifiedEffort(options, { effort: 90 }, 'anthropic', 'claude-opus-5');
            expect(options.output_config).to.deep.equal({ effort: 'max' });
        });

        it('skips Anthropic mapping when output_config.effort is set', () => {
            const options = { output_config: { effort: 'low', format: { type: 'json_schema' } } };
            applyUnifiedEffort(options, { effort: 90 }, 'anthropic', 'claude-opus-5');
            expect(options.output_config.effort).to.equal('low');
            expect(options.output_config.format).to.deep.equal({ type: 'json_schema' });
        });

        it('merges Anthropic adaptive without wiping display, drops budget_tokens', () => {
            const options = {
                thinking: { type: 'enabled', budget_tokens: 1638, display: 'summarized' }
            };
            applyUnifiedEffort(options, { effort: -1 }, 'anthropic', 'claude-sonnet-4-6');
            expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
        });

        it('skips Google mapping when thinkingConfig is set', () => {
            const options = { thinkingConfig: { thinkingLevel: 'low' } };
            applyUnifiedEffort(options, { effort: 90 }, 'google', 'gemini-3.6-flash');
            expect(options.thinkingConfig.thinkingLevel).to.equal('low');
        });

        it('does nothing when config.effort is undefined', () => {
            const options = {};
            applyUnifiedEffort(options, {}, 'openai', 'gpt-5.2');
            expect(options).to.deep.equal({});
        });

        it('hasNativeEffort detects provider fields', () => {
            expect(hasNativeEffort('openai', { reasoning_effort: 'high' })).to.equal(true);
            expect(hasNativeEffort('openai', {})).to.equal(false);
            expect(hasNativeEffort('anthropic', { output_config: { effort: 'max' } })).to.equal(true);
            expect(hasNativeEffort('google', { thinkingBudget: 1024 })).to.equal(true);
        });
    });

    describe('resolveProviderFamily', () => {
        it('resolves known providers', () => {
            expect(resolveProviderFamily(new MixOpenAI())).to.equal('openai');
            expect(resolveProviderFamily(new MixOpenAIResponses())).to.equal('openai');
            expect(resolveProviderFamily(new MixAnthropic())).to.equal('anthropic');
            expect(resolveProviderFamily(new MixGoogle())).to.equal('google');
            expect(resolveProviderFamily(new MixPerplexity())).to.equal(null);
        });
    });

    describe('ModelMix API surface', () => {
        it('accepts config.effort', () => {
            const model = ModelMix.new({ config: { effort: 25 } });
            expect(model.config.effort).to.equal(25);
        });

        it('accepts config.effort on model shorthand', () => {
            const model = ModelMix.new().deepseekV4Flash({ config: { effort: 100 } });
            expect(model.models[0].provider.config.effort).to.equal(100);
        });

        it('supports fluent .effort()', () => {
            const model = ModelMix.new().effort(-1);
            expect(model.config.effort).to.equal(-1);
        });

        it('lets .new({ config: { effort } }) override inherited config.effort', () => {
            const base = ModelMix.new({ config: { effort: 20 } });
            const child = base.new({ config: { effort: 80 } });
            expect(child.config.effort).to.equal(80);
            expect(base.config.effort).to.equal(20);
        });

        it('rejects invalid fluent effort', () => {
            expect(() => ModelMix.new().effort(150)).to.throw(/Invalid effort/);
        });
    });

    describe('provider request wiring', () => {
        it('OpenAI Responses request uses mapped reasoning_effort', () => {
            const options = { model: 'gpt-5.2', messages: [] };
            applyUnifiedEffort(options, { effort: 15 }, 'openai', 'gpt-5.2');
            const request = MixOpenAIResponses.buildResponsesRequest(options, {});
            expect(request.reasoning).to.deep.equal({ effort: 'none' });
        });

        it('Anthropic *think() native effort wins over config.effort', () => {
            const model = ModelMix.new({ config: { effort: 20 } }).opus5think();
            expect(model.models[0].provider.options.output_config.effort).to.equal('max');

            const options = {
                ...model.models[0].provider.options,
                model: 'claude-opus-5'
            };
            applyUnifiedEffort(options, { effort: 20 }, 'anthropic', 'claude-opus-5');
            expect(options.output_config.effort).to.equal('max');
        });

        it('MixGoogle generationConfig includes thinkingConfig from options', async () => {
            const google = new MixGoogle({ config: { apiKey: 'test-key' } });
            let capturedBody;
            const originalFetch = global.fetch;
            const responseBody = JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }
            });
            global.fetch = async (url, init) => {
                capturedBody = JSON.parse(init.body);
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    text: async () => responseBody,
                    json: async () => JSON.parse(responseBody)
                };
            };

            try {
                await google.create({
                    config: { system: 'sys' },
                    options: {
                        model: 'gemini-3.6-flash',
                        max_tokens: 100,
                        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
                        thinkingConfig: { thinkingLevel: 'low' }
                    }
                });
            } finally {
                global.fetch = originalFetch;
            }

            expect(capturedBody.generationConfig.thinkingConfig).to.deep.equal({
                thinkingLevel: 'low'
            });
        });
    });
});
