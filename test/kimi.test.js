const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixFireworks, MixKimi, MixOpenRouter, MixTogether } = require('../dist/index.js');

describe('Kimi Model Registration Tests', () => {
    it('should register only Together Kimi K2.7 Code by default', () => {
        const model = ModelMix.new();
        model.kimiK27Code();

        expect(model.models.map(({ key }) => key)).to.deep.equal(['moonshotai/Kimi-K2.7-Code']);
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
    });

    it('should register every requested Kimi K2.7 Code provider', () => {
        const model = ModelMix.new().kimiK27Code({
            mix: { together: true, fireworks: true, openrouter: true }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'moonshotai/Kimi-K2.7-Code',
            'accounts/fireworks/models/kimi-k2p7-code',
            'moonshotai/kimi-k2.7-code'
        ]);
        expect(model.models[1].provider).to.be.instanceOf(MixFireworks);
        expect(model.models[2].provider).to.be.instanceOf(MixOpenRouter);
    });

    it('should register Kimi K3 with the native Moonshot provider by default', () => {
        const originalMoonshotApiKey = process.env.MOONSHOT_API_KEY;
        process.env.MOONSHOT_API_KEY = 'test-moonshot-key';

        try {
            const model = ModelMix.new().kimiK3();

            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal('kimi-k3');
            expect(model.models[0].provider).to.be.instanceOf(MixKimi);
            expect(model.models[0].provider.config.url).to.equal('https://api.moonshot.ai/v1/chat/completions');
        } finally {
            if (originalMoonshotApiKey === undefined) delete process.env.MOONSHOT_API_KEY;
            else process.env.MOONSHOT_API_KEY = originalMoonshotApiKey;
        }
    });

    it('should support Kimi K3 through OpenRouter when requested', () => {
        const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

        try {
            const model = ModelMix.new().kimiK3({ mix: { moonshot: false, openrouter: true } });

            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal('moonshotai/kimi-k3');
            expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
        } finally {
            if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
            else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
        }
    });

    it('should register Fireworks and Together Kimi K3 when requested', () => {
        const model = ModelMix.new().kimiK3({
            mix: { moonshot: false, fireworks: true, openrouter: false, together: true }
        });

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'accounts/fireworks/models/kimi-k3',
            'moonshotai/Kimi-K3'
        ]);
        expect(model.models[0].provider).to.be.instanceOf(MixFireworks);
        expect(model.models[1].provider).to.be.instanceOf(MixTogether);
    });

    it('should adapt Kimi K3 requests to its fixed sampling API', async () => {
        const originalMoonshotApiKey = process.env.MOONSHOT_API_KEY;
        process.env.MOONSHOT_API_KEY = 'test-moonshot-key';

        try {
            const provider = new MixKimi();
            let requestBody;
            nock('https://api.moonshot.ai')
                .post('/v1/chat/completions', body => {
                    requestBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{ message: { content: 'Done' } }]
                });

            await provider.create({
                config: { system: 'You are an assistant.' },
                options: {
                    model: 'kimi-k3',
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 1000,
                    temperature: 0.5,
                    top_p: 0.9,
                    n: 2,
                    presence_penalty: 0.2,
                    frequency_penalty: 0.3
                }
            });

            expect(requestBody.max_completion_tokens).to.equal(1000);
            expect(requestBody).to.not.have.property('max_tokens');
            expect(requestBody).to.not.have.property('temperature');
            expect(requestBody).to.not.have.property('top_p');
            expect(requestBody).to.not.have.property('n');
            expect(requestBody).to.not.have.property('presence_penalty');
            expect(requestBody).to.not.have.property('frequency_penalty');
        } finally {
            if (originalMoonshotApiKey === undefined) delete process.env.MOONSHOT_API_KEY;
            else process.env.MOONSHOT_API_KEY = originalMoonshotApiKey;
        }
    });

    it('should preserve Kimi K3 reasoning content in tool-call continuations', async () => {
        const originalMoonshotApiKey = process.env.MOONSHOT_API_KEY;
        process.env.MOONSHOT_API_KEY = 'test-moonshot-key';

        try {
            let continuationBody;
            nock('https://api.moonshot.ai')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'I will calculate that.',
                            reasoning_content: 'I need the calculator tool.',
                            tool_calls: [{
                                id: 'call_calculate',
                                type: 'function',
                                function: {
                                    name: 'calculate',
                                    arguments: '{"expression":"2 + 2"}'
                                }
                            }]
                        }
                    }]
                })
                .post('/v1/chat/completions', body => {
                    continuationBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{ message: { role: 'assistant', content: 'The answer is 4.' } }]
                });

            const model = ModelMix.new().kimiK3();
            model.addTool({
                name: 'calculate',
                description: 'Evaluates an expression.',
                inputSchema: {
                    type: 'object',
                    properties: { expression: { type: 'string' } },
                    required: ['expression']
                }
            }, ({ expression }) => expression === '2 + 2' ? 4 : null);
            model.addText('What is 2 + 2?');

            expect(await model.message()).to.equal('The answer is 4.');
            const assistantMessage = continuationBody.messages.find(message => message.role === 'assistant');
            expect(assistantMessage).to.deep.equal({
                role: 'assistant',
                content: 'I will calculate that.',
                reasoning_content: 'I need the calculator tool.',
                tool_calls: [{
                    id: 'call_calculate',
                    type: 'function',
                    function: {
                        name: 'calculate',
                        arguments: '{"expression":"2 + 2"}'
                    }
                }]
            });
        } finally {
            if (originalMoonshotApiKey === undefined) delete process.env.MOONSHOT_API_KEY;
            else process.env.MOONSHOT_API_KEY = originalMoonshotApiKey;
        }
    });

    it('should register Kimi K3.1 Pro with the native Moonshot provider by default', () => {
        const model = ModelMix.new().kimiK31Pro();

        expect(model.models.map(({ key }) => key)).to.deep.equal(['kimi-k3.1-pro']);
        expect(model.models[0].provider).to.be.instanceOf(MixKimi);
        expect(model.models[0].provider.config.url).to.equal('https://api.moonshot.ai/v1/chat/completions');
    });

    it('should append OpenRouter Kimi K3.1 Pro when requested', () => {
        const model = ModelMix.new({ mix: { openrouter: true } }).kimiK31Pro();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'kimi-k3.1-pro',
            'moonshotai/kimi-k3.1-pro'
        ]);
        expect(model.models[1].provider).to.be.instanceOf(MixOpenRouter);
    });

    it('should register Kimi K3.1 Pro Highspeed only through Moonshot', () => {
        const model = ModelMix.new().chain('kimiK31ProHighspeed');

        expect(model.models.map(({ key }) => key)).to.deep.equal(['kimi-k3.1-pro-highspeed']);
        expect(model.models[0].provider).to.be.instanceOf(MixKimi);
    });

    it('should send Kimi K3.1 Pro effort without fixed sampling parameters', async () => {
        let requestBody;
        nock('https://api.moonshot.ai')
            .post('/v1/chat/completions', body => {
                requestBody = body;
                return true;
            })
            .reply(200, {
                choices: [{ message: { content: 'Done' } }]
            });

        const model = ModelMix.new({ options: { temperature: 0.5, top_p: 0.9 } })
            .chain('kimiK31Pro@0')
            .addText('Hello');

        expect(await model.message()).to.equal('Done');
        expect(requestBody.model).to.equal('kimi-k3.1-pro');
        expect(requestBody.reasoning_effort).to.equal('low');
        expect(requestBody).to.not.have.property('temperature');
        expect(requestBody).to.not.have.property('top_p');
        expect(requestBody).to.not.have.property('thinking');
    });

    it('should price Kimi K3.1 Pro and Highspeed with cached input', () => {
        const usage = { input: 1_000_000, cached: 500_000, output: 1_000_000 };

        expect(ModelMix.calculateCost('kimi-k3.1-pro', usage)).to.equal(11.1);
        expect(ModelMix.calculateCost('moonshotai/kimi-k3.1-pro', usage)).to.equal(11.1);
        expect(ModelMix.calculateCost('kimi-k3.1-pro-highspeed', usage)).to.equal(22.1);
    });
});
