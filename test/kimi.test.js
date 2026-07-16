const { expect } = require('chai');
const nock = require('nock');
const { ModelMix, MixKimi, MixOpenRouter, MixTogether } = require('../index.js');

describe('Kimi Model Registration Tests', () => {
    it('should register Together Kimi K2.7 Code by default', () => {
        const model = ModelMix.new();
        model.kimiK27Code();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('moonshotai/Kimi-K2.7-Code');
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
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
});
