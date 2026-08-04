const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixAnthropic } = require('../index.js');

describe('Anthropic Model Registration Tests', () => {
    it('should register Claude Fable 5', () => {
        const model = ModelMix.new();
        model.fable5();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-fable-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should register Claude Fable 5 with max effort thinking', () => {
        const model = ModelMix.new();
        model.fable5think();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-fable-5');
        expect(model.models[0].provider.options.output_config).to.deep.equal({ effort: 'max' });
        expect(model.models[0].provider.options.thinking).to.deep.equal({ display: 'summarized' });
        expect(model.models[0].provider.options).to.not.have.property('temperature');
    });

    it('should register Claude Opus 5', () => {
        const model = ModelMix.new();
        model.opus5();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-5');
        expect(model.models[0].provider).to.be.instanceOf(MixAnthropic);
    });

    it('should register Claude Opus 5 with max effort thinking', () => {
        const model = ModelMix.new();
        model.opus5think();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('claude-opus-5');
        expect(model.models[0].provider.options.output_config).to.deep.equal({ effort: 'max' });
        expect(model.models[0].provider.options.thinking).to.deep.equal({ display: 'summarized' });
        expect(model.models[0].provider.options).to.not.have.property('temperature');
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
            expect(MixAnthropic.rejectsSamplingParams('claude-opus-4-1-20250805')).to.equal(false);
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
