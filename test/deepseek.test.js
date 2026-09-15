const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixDeepSeek, MixFireworks, MixOpenRouter } = require('../index.js');

describe('DeepSeek Model Registration Tests', () => {
    it('registers V4 Pro 0813 through OpenRouter and preserves caller settings', () => {
        const model = ModelMix.new();
        expect(model.deepseekPro({
            options: { temperature: 0.5 },
            config: { apiKey: 'test-key', effort: 100 }
        })).to.equal(model);

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek/deepseek-v4-pro-0813');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(model.models[0].provider.options.temperature).to.equal(0.5);
        expect(model.models[0].provider.config.effort).to.equal(100);
    });

    describe('DeepSeek V4 Pro 0813 requests', () => {
        afterEach(() => nock.cleanAll());

        for (const [effort, level] of [[0, undefined], [20, 'low'], [60, 'high'], [100, 'max'], [-1, undefined]]) {
            it(`sends the exact model ID through chain() at effort ${effort} and accounts for cached input`, async () => {
                const scope = nock('https://openrouter.ai')
                    .post('/api/v1/chat/completions', body => {
                        expect(body.model).to.equal('deepseek/deepseek-v4-pro-0813');
                        expect(body.reasoning_effort).to.equal(level);
                        expect(body.thinking).to.deep.equal(effort === -1
                            ? undefined
                            : { type: effort === 0 ? 'disabled' : 'enabled' });
                        return true;
                    })
                    .reply(200, {
                        model: 'deepseek/deepseek-v4-pro-0813',
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 1000,
                            completion_tokens: 100,
                            prompt_tokens_details: { cached_tokens: 400 }
                        }
                    });
                const model = ModelMix.new().chain(`deepseekPro@${effort}`).addText('Hello');

                expect(await model.message()).to.equal('ok');
                expect(scope.isDone()).to.equal(true);
                expect(model.lastRaw.tokens).to.include({ input: 1000, cached: 400, output: 100 });
                expect(model.lastRaw.tokens.cost).to.be.closeTo(0.000545952, 1e-12);
            });
        }
    });

    it('requires native credentials and accepts DEEPSEEK_API_KEY', () => {
        const originalApiKey = process.env.DEEPSEEK_API_KEY;
        try {
            delete process.env.DEEPSEEK_API_KEY;
            expect(() => new MixDeepSeek()).to.throw(/DEEPSEEK_API_KEY/);
            process.env.DEEPSEEK_API_KEY = 'native-test-key';
            const model = ModelMix.new().deepseekV41Flash({ mix: { deepseek: true, openrouter: false } });
            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal('deepseek-flash');
            expect(model.models[0].provider.config.apiKey).to.equal('native-test-key');
        } finally {
            if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
            else process.env.DEEPSEEK_API_KEY = originalApiKey;
        }
    });

    it('registers DeepSeek V4.1 Flash through OpenRouter and preserves caller settings', () => {
        const model = ModelMix.new();
        expect(model.deepseekV41Flash({
            options: { temperature: 0.5 },
            config: { effort: 100 }
        })).to.equal(model);

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek/deepseek-v4.1-flash');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        expect(model.models[0].provider.options.temperature).to.equal(0.5);
        expect(model.models[0].provider.config.effort).to.equal(100);
    });

    describe('DeepSeek V4.1 Flash requests', () => {
        afterEach(() => nock.cleanAll());

        it('falls back from native DeepSeek through Fireworks to OpenRouter', async () => {
            const native = nock('https://api.deepseek.com')
                .post('/chat/completions', body => body.model === 'deepseek-flash')
                .reply(503, { error: { message: 'Unavailable' } });
            const fireworks = nock('https://api.fireworks.ai')
                .post('/inference/v1/chat/completions')
                .reply(503, { error: { message: 'Unavailable' } });
            const openrouter = nock('https://openrouter.ai')
                .post('/api/v1/chat/completions')
                .reply(200, { choices: [{ message: { content: 'fallback' } }] });
            const model = ModelMix.new({ config: { retry: { retries: 0 } } })
                .deepseekV41Flash({
                    mix: { deepseek: true, fireworks: true, openrouter: true },
                    config: { apiKey: 'test-key' }
                }).addText('Hello');

            expect(await model.message()).to.equal('fallback');
            expect(native.isDone()).to.equal(true);
            expect(fireworks.isDone()).to.equal(true);
            expect(openrouter.isDone()).to.equal(true);
        });

        for (const [effort, level] of [[0, undefined], [20, 'low'], [60, 'high'], [100, 'max'], [-1, undefined]]) {
            it(`sends native DeepSeek effort ${effort} and reads native cache usage`, async () => {
                const scope = nock('https://api.deepseek.com', {
                    reqheaders: { authorization: 'Bearer native-test-key' }
                })
                    .post('/chat/completions', body => {
                        expect(body.model).to.equal('deepseek-flash');
                        expect(body.reasoning_effort).to.equal(level);
                        expect(body.thinking).to.deep.equal(effort === -1
                            ? undefined
                            : { type: effort === 0 ? 'disabled' : 'enabled' });
                        return true;
                    })
                    .reply(200, {
                        choices: [{ message: { role: 'assistant', content: 'ok', reasoning_content: 'Reasoning' } }],
                        usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 400 }
                    });
                const model = ModelMix.new().deepseekV41Flash({
                    mix: { deepseek: true, openrouter: false },
                    config: { apiKey: 'native-test-key', effort }
                }).addText('Hello');

                expect(model.models).to.have.length(1);
                expect(model.models[0].provider).to.be.instanceOf(MixDeepSeek);
                expect(await model.message()).to.equal('ok');
                expect(scope.isDone()).to.equal(true);
                expect(model.lastRaw.tokens).to.include({ input: 1000, cached: 400, output: 100 });
                expect(model.lastRaw.tokens.cost).to.be.closeTo(0.0003024, 1e-12);
            });
        }

        it('preserves native reasoning across tool continuation and later turns', async () => {
            const assistantMessage = {
                role: 'assistant', content: null, reasoning_content: 'Use the lookup tool.',
                tool_calls: [{ id: 'call_lookup', type: 'function', function: { name: 'lookup', arguments: '{}' } }]
            };
            const scope = nock('https://api.deepseek.com')
                .post('/chat/completions')
                .reply(200, { choices: [{ message: assistantMessage }] })
                .post('/chat/completions', body => {
                    expect(body.messages.find(message => message.role === 'assistant')).to.deep.equal(assistantMessage);
                    expect(body.messages.find(message => message.role === 'tool')).to.include({ tool_call_id: 'call_lookup' });
                    return true;
                })
                .reply(200, { choices: [{ message: { role: 'assistant', content: 'Found', reasoning_content: 'Lookup complete.' } }] })
                .post('/chat/completions', body => {
                    expect(body.messages.filter(message => message.role === 'assistant').map(message => message.reasoning_content))
                        .to.deep.equal(['Use the lookup tool.', 'Lookup complete.']);
                    return true;
                })
                .reply(200, { choices: [{ message: { role: 'assistant', content: 'Done' } }] });
            const model = ModelMix.new().deepseekV41Flash({
                mix: { deepseek: true, openrouter: false },
                config: { apiKey: 'native-test-key' }
            }).addTool({
                name: 'lookup', description: 'Look up a value.',
                inputSchema: { type: 'object', properties: {} }
            }, () => 'value').addText('Look it up');

            expect(await model.message()).to.equal('Found');
            model.addText('Continue');
            expect(await model.message()).to.equal('Done');
            expect(scope.isDone()).to.equal(true);
        });

        it('streams native text without including empty reasoning or usage deltas', async () => {
            const chunks = [
                { choices: [{ delta: { reasoning_content: 'Reasoning' } }] },
                { choices: [{ delta: { content: 'Hello' } }] },
                { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 400 } }
            ];
            const scope = nock('https://api.deepseek.com')
                .post('/chat/completions', body => body.stream === true)
                .reply(200, chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', {
                    'content-type': 'text/event-stream'
                });
            const model = ModelMix.new().deepseekV41Flash({
                mix: { deepseek: true, openrouter: false },
                config: { apiKey: 'native-test-key' }
            }).addText('Hello');
            const deltas = [];
            const result = await model.stream(({ delta }) => deltas.push(delta));

            expect(result.message).to.equal('Hello');
            expect(deltas.join('')).to.equal('Hello');
            expect(result.tokens.cached).to.equal(400);
            expect(scope.isDone()).to.equal(true);
        });

        it('uses only Fireworks when selected and accounts for its cached input pricing', async () => {
            const scope = nock('https://api.fireworks.ai')
                .post('/inference/v1/chat/completions', body => {
                    expect(body.model).to.equal('accounts/fireworks/models/deepseek-v4p1-flash');
                    expect(body.reasoning_effort).to.equal('max');
                    expect(body.thinking).to.deep.equal({ type: 'enabled' });
                    expect(body.temperature).to.equal(0.5);
                    return true;
                })
                .reply(200, {
                    choices: [{ message: { content: 'ok' } }],
                    usage: {
                        prompt_tokens: 1000,
                        completion_tokens: 100,
                        prompt_tokens_details: { cached_tokens: 400 }
                    }
                });
            const model = ModelMix.new().deepseekV41Flash({
                mix: { fireworks: true, openrouter: false },
                config: { effort: 100 },
                options: { temperature: 0.5 }
            }).addText('Hello');

            expect(model.models).to.have.length(1);
            expect(model.models[0].provider).to.be.instanceOf(MixFireworks);
            expect(await model.message()).to.equal('ok');
            expect(scope.isDone()).to.equal(true);
            expect(model.lastRaw.tokens).to.include({ input: 1000, cached: 400, output: 100 });
            expect(model.lastRaw.tokens.cost).to.be.closeTo(0.0002008, 1e-12);
        });

        it('falls back from Fireworks to OpenRouter when both are enabled', async () => {
            const fireworks = nock('https://api.fireworks.ai')
                .post('/inference/v1/chat/completions')
                .reply(503, { error: { message: 'Unavailable' } });
            const openrouter = nock('https://openrouter.ai')
                .post('/api/v1/chat/completions', body => body.model === 'deepseek/deepseek-v4.1-flash')
                .reply(200, { choices: [{ message: { content: 'fallback' } }] });
            const model = ModelMix.new({ config: { retry: { retries: 0 } } })
                .deepseekV41Flash({ mix: { fireworks: true, openrouter: true } })
                .addText('Hello');

            expect(model.models.map(({ key }) => key)).to.deep.equal([
                'accounts/fireworks/models/deepseek-v4p1-flash',
                'deepseek/deepseek-v4.1-flash'
            ]);
            expect(await model.message()).to.equal('fallback');
            expect(fireworks.isDone()).to.equal(true);
            expect(openrouter.isDone()).to.equal(true);
        });

        for (const [effort, level] of [[0, null], [20, 'low'], [60, 'high'], [100, 'max'], [-1, undefined]]) {
            it(`sends chain effort ${effort} and accounts for cached input`, async () => {
                const scope = nock('https://openrouter.ai')
                    .post('/api/v1/chat/completions', body => {
                        expect(body.model).to.equal('deepseek/deepseek-v4.1-flash');
                        expect(body.reasoning_effort).to.equal(level || undefined);
                        expect(body.thinking).to.deep.equal(level === undefined
                            ? undefined
                            : { type: level === null ? 'disabled' : 'enabled' });
                        return true;
                    })
                    .reply(200, {
                        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
                        usage: {
                            prompt_tokens: 1000,
                            completion_tokens: 100,
                            prompt_tokens_details: { cached_tokens: 400 }
                        }
                    });

                const model = ModelMix.new().chain(`deepseekV41Flash@${effort}`).addText('Hello');
                expect(await model.message()).to.equal('ok');
                expect(scope.isDone()).to.equal(true);
                expect(model.lastRaw.tokens).to.include({ input: 1000, cached: 400, output: 100 });
                expect(model.lastRaw.tokens.cost).to.be.closeTo(0.000156, 1e-12);
            });
        }
    });

    it('should register Fireworks DeepSeek V4 Pro by default', () => {
        const model = ModelMix.new();
        model.deepseekV4Pro({ mix: { fireworks: true, openrouter: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/deepseek-v4-pro-0813');
        expect(ModelMix.calculateCost('accounts/fireworks/models/deepseek-v4-pro-0813', {
            input: 1_000_000,
            cached: 250_000,
            output: 1_000_000
        })).to.be.closeTo(4.961, 1e-10);
    });

    it('should register Together DeepSeek V4 Pro when together mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Pro({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/DeepSeek-V4-Pro');
    });

    it('should register Fireworks DeepSeek V4 Flash by default', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: true, openrouter: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/deepseek-v4-flash');
        expect(ModelMix.calculateCost('accounts/fireworks/models/deepseek-v4-flash', {
            input: 1_000_000,
            output: 1_000_000
        })).to.be.closeTo(0.42, 1e-10);
    });

    it('should register NVIDIA DeepSeek V4 Flash when nvidia mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: false, nvidia: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/deepseek-v4-flash');
    });

    it('should register OpenRouter DeepSeek V4 Flash when openrouter mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek/deepseek-v4-flash');
        expect(ModelMix.calculateCost('deepseek/deepseek-v4-flash', {
            input: 1_000_000,
            output: 1_000_000
        })).to.equal(0.27);
    });

    it('should register Together DeepSeek V4 Flash when together mix is enabled', () => {
        const model = ModelMix.new();
        model.deepseekV4Flash({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('deepseek-ai/DeepSeek-V4-Flash');
    });
});
