const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixAnthropic, MixOpenRouter } = require('../index.js');

describe('Anthropic Model Registration Tests', () => {
    it('should register Claude Fable 5.1 through Anthropic by default', () => {
        const model = ModelMix.new().fable51();

        expect(model.models.map(({ key }) => key)).to.deep.equal(['claude-fable-5-1']);
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should allow enabling or selecting the OpenRouter Claude Fable 5.1 route', () => {
        const both = ModelMix.new().fable51({ mix: { openrouter: true } });
        const routed = ModelMix.new().fable51({
            mix: { anthropic: false, openrouter: true }
        });

        expect(both.models.map(({ key }) => key)).to.deep.equal([
            'claude-fable-5-1',
            'anthropic/claude-fable-5.1'
        ]);
        expect(both.models[1].provider).to.be.instanceOf(MixOpenRouter);
        expect(routed.models.map(({ key }) => key)).to.deep.equal(['anthropic/claude-fable-5.1']);
        expect(routed.models[0].provider).to.be.instanceOf(MixOpenRouter);
    });

    it('should strip unsupported sampling params from OpenRouter Claude Fable 5.1 requests', async () => {
        const provider = new MixOpenRouter();
        let requestBody;
        nock('https://openrouter.ai')
            .post('/api/v1/chat/completions', body => {
                requestBody = body;
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'Done' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 }
            });

        await provider.create({
            config: { system: 'You are an assistant.' },
            options: {
                model: 'anthropic/claude-fable-5.1',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 100,
                temperature: 1,
                top_p: 0.9,
                top_k: 40
            }
        });

        expect(requestBody).to.not.have.property('temperature');
        expect(requestBody).to.not.have.property('top_p');
        expect(requestBody).to.not.have.property('top_k');
        expect(requestBody.model).to.equal('anthropic/claude-fable-5.1');
    });

    it('should price Claude Fable 5.1 cache usage equally across providers', () => {
        const tokens = {
            input: 3_000_000,
            uncachedInput: 1_000_000,
            cached: 1_000_000,
            cacheWrite: 1_000_000,
            cacheWrite5m: 1_000_000,
            output: 1_000_000
        };
        const expected = {
            uncachedInput: 10,
            cachedInput: 0.25,
            cacheWrite: 12.5,
            cacheWrite5m: 12.5,
            cacheWrite1h: 0,
            output: 50,
            total: 72.75
        };

        expect(ModelMix.calculateCostBreakdown('claude-fable-5-1', tokens)).to.deep.equal(expected);
        expect(ModelMix.calculateCostBreakdown('anthropic/claude-fable-5.1', tokens)).to.deep.equal(expected);
    });

    it('should register Claude Fable 5', () => {
        const model = ModelMix.new();
        model.fable50();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-fable-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should keep fable5() as an alias for fable50()', () => {
        const model = ModelMix.new();

        expect(model.fable5({
            options: { max_tokens: 123 },
            config: { url: 'https://anthropic.example.test' }
        })).to.equal(model);
        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-fable-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
        expect(model.models[0].provider.options.max_tokens).to.equal(123);
        expect(model.models[0].provider.config.url).to.equal('https://anthropic.example.test');
    });

    it('should apply max effort thinking via .effort(100).fable50()', () => {
        const model = ModelMix.new().effort(100).fable50();
        const { applyUnifiedEffort } = require('../effort.js');

        expect(model.config.effort).to.equal(100);
        const options = { model: 'claude-fable-5' };
        applyUnifiedEffort(options, model.config, 'anthropic', 'claude-fable-5');
        expect(options.output_config).to.deep.equal({ effort: 'max' });
        expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
    });

    it('should register Claude Opus 5', () => {
        const model = ModelMix.new();
        model.opus50();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should register Claude Opus 5.5', () => {
        const model = ModelMix.new();
        model.opus55();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-5-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should keep opus5() as an alias for opus50()', () => {
        const model = ModelMix.new();

        expect(model.opus5({
            options: { max_tokens: 123 },
            config: { url: 'https://anthropic.example.test' }
        })).to.equal(model);
        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
        expect(model.models[0].provider.options.max_tokens).to.equal(123);
        expect(model.models[0].provider.config.url).to.equal('https://anthropic.example.test');
    });

    it('should apply max effort thinking via .effort(100).opus50()', () => {
        const model = ModelMix.new().effort(100).opus50();
        const { applyUnifiedEffort } = require('../effort.js');

        expect(model.config.effort).to.equal(100);
        const options = { model: 'claude-opus-5' };
        applyUnifiedEffort(options, model.config, 'anthropic', 'claude-opus-5');
        expect(options.output_config).to.deep.equal({ effort: 'max' });
        expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
    });

    it('should apply max effort thinking via .effort(100).opus55()', () => {
        const model = ModelMix.new().effort(100).opus55();
        const { applyUnifiedEffort } = require('../effort.js');

        expect(model.config.effort).to.equal(100);
        const options = { model: 'claude-opus-5-5' };
        applyUnifiedEffort(options, model.config, 'anthropic', 'claude-opus-5-5');
        expect(options.output_config).to.deep.equal({ effort: 'max' });
        expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
    });

    describe('Sampling params (temperature/top_p/top_k)', () => {
        it('should detect models that reject sampling params', () => {
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-5-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-8')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-7')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-sonnet-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-fable-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-haiku-5-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('anthropic/claude-opus-5')).to.equal(true);

            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-6')).to.equal(false);
            expect(MixAnthropic.rejectsSamplingParams('claude-sonnet-4-6')).to.equal(false);
            expect(MixAnthropic.rejectsSamplingParams('claude-haiku-4-5-20251001')).to.equal(false);
        });

        it('should strip sampling params for Opus 5 requests', async () => {
            const originalApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

            try {
                const provider = new MixAnthropic();
                let requestBody;
                nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 1, output_tokens: 1 }
                    });

                await provider.create({
                    config: { system: 'You are an assistant.' },
                    options: {
                        model: 'claude-opus-5',
                        messages: [{ role: 'user', content: 'Hello' }],
                        max_tokens: 100,
                        temperature: 0.5,
                        top_p: 0.9,
                        top_k: 40
                    }
                });

                expect(requestBody).to.not.have.property('temperature');
                expect(requestBody).to.not.have.property('top_p');
                expect(requestBody).to.not.have.property('top_k');
                expect(requestBody.model).to.equal('claude-opus-5');
            } finally {
                if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
                else process.env.ANTHROPIC_API_KEY = originalApiKey;
                nock.cleanAll();
            }
        });

        it('should keep temperature for Opus 4.6 requests', async () => {
            const originalApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

            try {
                const provider = new MixAnthropic();
                let requestBody;
                nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 1, output_tokens: 1 }
                    });

                await provider.create({
                    config: { system: 'You are an assistant.' },
                    options: {
                        model: 'claude-opus-4-6',
                        messages: [{ role: 'user', content: 'Hello' }],
                        max_tokens: 100,
                        temperature: 0.5
                    }
                });

                expect(requestBody.temperature).to.equal(0.5);
            } finally {
                if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
                else process.env.ANTHROPIC_API_KEY = originalApiKey;
                nock.cleanAll();
            }
        });
    });

    describe('Provider-neutral prompt caching', () => {
        it('should translate neutral breakpoints and remove foreign OpenAI controls', async () => {
            const originalApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

            try {
                const provider = new MixAnthropic();
                let requestBody;
                nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 1, output_tokens: 1 }
                    });

                await provider.create({
                    config: { system: 'You are an assistant.' },
                    options: {
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 16,
                        cache_control: { type: 'ephemeral', ttl: '1h' },
                        prompt_cache_key: 'openai-only',
                        prompt_cache_options: { mode: 'explicit', ttl: '30m' },
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Stable', cache: { breakpoint: true } },
                                {
                                    type: 'text',
                                    text: 'Variable',
                                    prompt_cache_breakpoint: { mode: 'explicit' }
                                }
                            ]
                        }]
                    }
                });

                expect(requestBody).to.not.have.property('prompt_cache_key');
                expect(requestBody).to.not.have.property('prompt_cache_options');
                expect(requestBody).to.not.have.property('cache_control');
                expect(requestBody.messages[0].content[0]).to.deep.equal({
                    type: 'text',
                    text: 'Stable',
                    cache_control: { type: 'ephemeral', ttl: '1h' }
                });
                expect(requestBody.messages[0].content[1]).to.deep.equal({
                    type: 'text',
                    text: 'Variable'
                });
            } finally {
                if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
                else process.env.ANTHROPIC_API_KEY = originalApiKey;
                nock.cleanAll();
            }
        });

        it('should preserve top-level automatic caching when there is no explicit breakpoint', async () => {
            const originalApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

            try {
                const provider = new MixAnthropic();
                let requestBody;
                nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 1, output_tokens: 1 }
                    });

                await provider.create({
                    config: { system: 'You are an assistant.' },
                    options: {
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 16,
                        cache_control: { type: 'ephemeral' },
                        messages: [{ role: 'user', content: 'Hello' }]
                    }
                });

                expect(requestBody.cache_control).to.deep.equal({ type: 'ephemeral' });
            } finally {
                if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
                else process.env.ANTHROPIC_API_KEY = originalApiKey;
                nock.cleanAll();
            }
        });
    });

    it('should register Claude Opus 4.8', () => {
        const model = ModelMix.new();
        model.opus48();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-4-8');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should apply adaptive thinking via .effort(100).opus48()', () => {
        const model = ModelMix.new().effort(100).opus48();
        const { applyUnifiedEffort } = require('../effort.js');

        const options = { model: 'claude-opus-4-8' };
        applyUnifiedEffort(options, model.config, 'anthropic', 'claude-opus-4-8');
        expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
        expect(options.output_config).to.deep.equal({ effort: 'max' });
    });

    describe('Claude Haiku 5.5', () => {
        it('should register Claude Haiku 5.5 without replacing Haiku 4.5', () => {
            const model = ModelMix.new();

            expect(model.haiku55({
                options: { max_tokens: 123 },
                config: { effort: 50 }
            })).to.equal(model);
            model.haiku45();
            expect(model.models.map(({ key }) => key)).to.deep.equal([
                'claude-haiku-5-5', 'claude-haiku-4-5-20251001'
            ]);
            expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
            expect(model.models[0].provider.options.max_tokens).to.equal(123);
            expect(model.models[0].provider.config.effort).to.equal(50);
        });

        it('should support chain effort overrides', () => {
            const model = ModelMix.new().effort(20);

            expect(model.chain('haiku55@high', 'haiku45')).to.equal(model);
            expect(model.models.map(({ key }) => key)).to.deep.equal([
                'claude-haiku-5-5', 'claude-haiku-4-5-20251001'
            ]);
            expect(model.models[0].provider.config.effort).to.equal(40);
        });

        it('should use adaptive thinking with output_config.effort', () => {
            const { applyUnifiedEffort } = require('../effort.js');
            const options = { model: 'claude-haiku-5-5' };

            applyUnifiedEffort(options, { effort: 100 }, 'anthropic', 'claude-haiku-5-5');
            expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
            expect(options.output_config).to.deep.equal({ effort: 'max' });
            expect(options).to.not.have.nested.property('thinking.budget_tokens');
        });

        it('should strip sampling params from Haiku 5.5 requests', async () => {
            const originalApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

            try {
                const provider = new MixAnthropic();
                let requestBody;
                nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 1, output_tokens: 1 }
                    });

                await provider.create({
                    config: { system: 'You are an assistant.' },
                    options: {
                        model: 'claude-haiku-5-5',
                        messages: [{ role: 'user', content: 'Hello' }],
                        max_tokens: 100,
                        temperature: 1,
                        top_p: 0.9,
                        top_k: 40
                    }
                });

                expect(requestBody).to.not.have.property('temperature');
                expect(requestBody).to.not.have.property('top_p');
                expect(requestBody).to.not.have.property('top_k');
                expect(requestBody.model).to.equal('claude-haiku-5-5');
            } finally {
                if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
                else process.env.ANTHROPIC_API_KEY = originalApiKey;
                nock.cleanAll();
            }
        });

        it('should price prompts above 100K tokens at the long-context rate', () => {
            const short = { input: 100_000, uncachedInput: 100_000, output: 1_000_000 };
            const long = { input: 100_001, uncachedInput: 100_001, output: 1_000_000 };

            expect(ModelMix.calculateCostBreakdown('claude-haiku-5-5', short)).to.deep.equal({
                uncachedInput: 0.01,
                cachedInput: 0,
                cacheWrite: 0,
                cacheWrite5m: 0,
                cacheWrite1h: 0,
                output: 0.5,
                total: 0.51
            });
            expect(ModelMix.calculateCostBreakdown('claude-haiku-5-5', long)).to.deep.equal({
                uncachedInput: 0.0500005,
                cachedInput: 0,
                cacheWrite: 0,
                cacheWrite5m: 0,
                cacheWrite1h: 0,
                output: 2.5,
                total: 2.5500005
            });
        });
    });

    describe('Claude Sonnet 5.5', () => {
        it('should preserve fluent registration and provider options', () => {
            const model = ModelMix.new();

            expect(model.sonnet55({
                options: { max_tokens: 123 },
                config: { effort: 50 }
            })).to.equal(model);
            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal('claude-sonnet-5-5');
            expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
            expect(model.models[0].provider.options.max_tokens).to.equal(123);
            expect(model.models[0].provider.config.effort).to.equal(50);
        });

        it('should support chain effort overrides without replacing Sonnet 5', () => {
            const model = ModelMix.new().effort(20);

            expect(model.chain('sonnet55@high', 'sonnet5')).to.equal(model);
            expect(model.models.map(({ key }) => key)).to.deep.equal([
                'claude-sonnet-5-5', 'claude-sonnet-5'
            ]);
            expect(model.models[0].provider.config.effort).to.equal(40);
            expect(model.config.effort).to.equal(20);
        });

        for (const { name, args, thinking, effort } of [
            { name: 'native defaults', args: {} },
            {
                name: 'unified max effort',
                args: { config: { effort: 100 } },
                thinking: { type: 'adaptive', display: 'summarized' },
                effort: 'max'
            },
            {
                name: 'explicit between-tools thinking',
                args: {
                    config: { effort: 100 },
                    options: { thinking: { type: 'between_tools' }, output_config: { effort: 'high' } }
                },
                thinking: { type: 'between_tools' },
                effort: 'high'
            }
        ]) {
            it(`should send Sonnet 5.5 requests with ${name}`, async () => {
                let requestBody;
                const scope = nock('https://api.anthropic.com')
                    .post('/v1/messages', body => {
                        requestBody = body;
                        return true;
                    })
                    .reply(200, {
                        content: [{ type: 'text', text: 'Done' }],
                        usage: { input_tokens: 10, output_tokens: 5 }
                    });
                const model = ModelMix.new().sonnet55({
                    ...args,
                    options: { max_tokens: 128, temperature: 0.5, top_p: 0.9, top_k: 40, ...args.options }
                }).addText('Hello');

                expect(await model.message()).to.equal('Done');
                expect(scope.isDone()).to.equal(true);
                expect(requestBody.model).to.equal('claude-sonnet-5-5');
                expect(requestBody.max_tokens).to.equal(128);
                expect(requestBody).to.not.have.property('temperature');
                expect(requestBody).to.not.have.property('top_p');
                expect(requestBody).to.not.have.property('top_k');
                if (thinking) {
                    expect(requestBody.thinking).to.deep.equal(thinking);
                    expect(requestBody.output_config.effort).to.equal(effort);
                } else {
                    expect(requestBody).to.not.have.property('thinking');
                    expect(requestBody).to.not.have.property('output_config');
                }
            });
        }
    });

    it('should register Claude Sonnet 5', () => {
        const model = ModelMix.new();
        model.sonnet50();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-sonnet-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should keep sonnet5() as an alias for sonnet50()', () => {
        const model = ModelMix.new();

        expect(model.sonnet5({
            options: { max_tokens: 123 },
            config: { url: 'https://anthropic.example.test' }
        })).to.equal(model);
        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-sonnet-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
        expect(model.models[0].provider.options.max_tokens).to.equal(123);
        expect(model.models[0].provider.config.url).to.equal('https://anthropic.example.test');
    });

    it('should apply adaptive thinking via .effort(100).sonnet50()', () => {
        const model = ModelMix.new().effort(100).sonnet50();
        const { applyUnifiedEffort } = require('../effort.js');

        const options = { model: 'claude-sonnet-5' };
        applyUnifiedEffort(options, model.config, 'anthropic', 'claude-sonnet-5');
        expect(options.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
        expect(options.output_config).to.deep.equal({ effort: 'max' });
    });

    describe('Thinking block extraction', () => {
        it('should preserve empty thinking text from display omitted', () => {
            const data = {
                content: [{
                    type: 'thinking',
                    thinking: '',
                    signature: 'sig-omitted'
                }, {
                    type: 'text',
                    text: 'Hello'
                }]
            };

            expect(MixAnthropic.extractThink(data)).to.equal('');
            expect(MixAnthropic.extractSignature(data)).to.equal('sig-omitted');
        });

        it('should extract summarized thinking text', () => {
            const data = {
                content: [{
                    type: 'thinking',
                    thinking: 'Step by step...',
                    signature: 'sig-summarized'
                }, {
                    type: 'text',
                    text: 'Answer'
                }]
            };

            expect(MixAnthropic.extractThink(data)).to.equal('Step by step...');
            expect(MixAnthropic.extractSignature(data)).to.equal('sig-summarized');
        });

        it('should return null when thinking block is missing', () => {
            const data = {
                content: [{ type: 'text', text: 'Hello' }]
            };

            expect(MixAnthropic.extractThink(data)).to.equal(null);
            expect(MixAnthropic.extractSignature(data)).to.equal(null);
        });

        it('should persist Anthropic content blocks as assistantMessage', () => {
            const content = [{
                type: 'thinking',
                thinking: '',
                signature: 'sig-omitted'
            }, {
                type: 'text',
                text: 'Hello'
            }];
            const provider = new MixAnthropic();
            const result = provider.processResponse({ data: { content, usage: {} } });

            expect(result.think).to.equal('');
            expect(result.signature).to.equal('sig-omitted');
            expect(result.assistantMessage).to.deep.equal({
                role: 'assistant',
                content
            });
        });

        it('should keep tool_result after native Anthropic tool_use assistantMessage', () => {
            // processResponse stores assistant content as Anthropic blocks (tool_use),
            // not OpenAI-style tool_calls. convertMessages must still pair tool results.
            const toolUseId = 'toolu_01TestToolUseId';
            const converted = MixAnthropic.convertMessages([
                { role: 'user', content: [{ type: 'text', text: 'What time is it?' }] },
                {
                    role: 'assistant',
                    content: [{
                        type: 'tool_use',
                        id: toolUseId,
                        name: 'get_current_time',
                        input: {}
                    }]
                },
                {
                    role: 'tool',
                    tool_call_id: toolUseId,
                    name: 'get_current_time',
                    content: '2026-07-30T12:00:00Z'
                }
            ]);

            expect(converted).to.have.length(3);
            expect(converted[1]).to.deep.equal({
                role: 'assistant',
                content: [{
                    type: 'tool_use',
                    id: toolUseId,
                    name: 'get_current_time',
                    input: {}
                }]
            });
            expect(converted[2]).to.deep.equal({
                role: 'user',
                content: [{
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: '2026-07-30T12:00:00Z'
                }]
            });
        });
    });
});
