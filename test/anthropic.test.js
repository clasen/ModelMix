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

    describe('Sampling params (temperature/top_p/top_k)', () => {
        it('should detect models that reject sampling params', () => {
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-8')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-7')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-sonnet-5')).to.equal(true);
            expect(MixAnthropic.rejectsSamplingParams('claude-fable-5')).to.equal(true);
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
