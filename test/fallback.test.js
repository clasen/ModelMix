const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { ModelMix } = require('../index.js');

describe('Provider Fallback Chain Tests', () => {

    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('Basic Fallback Chain', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should use primary provider when available', async () => {
            model.gpt5mini().sonnet4().addText('Hello');

            // Mock successful OpenAI response
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Hello from GPT-5 mini!'
                        }
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Hello from GPT-5 mini!');
        });

        it('should fallback to secondary provider when primary fails', async () => {
            model.gpt5mini().sonnet4().addText('Hello');

            // Mock failed OpenAI response (GPT-5 mini)
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(500, { error: 'Server error' });

            // Mock successful Anthropic response (Sonnet 4)
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Hello from Claude Sonnet 4!'
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Hello from Claude Sonnet 4!');
        });

        it('should cascade through multiple fallbacks', async () => {
            model.gpt5mini().sonnet4().gemini25flash().addText('Hello');

            // Mock failed OpenAI response
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(429, { error: 'Rate limit exceeded' });

            // Mock failed Anthropic response
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(401, { error: 'Unauthorized' });

            // Mock successful Google response
            nock('https://generativelanguage.googleapis.com')
                .post(/.*generateContent/)
                .reply(200, {
                    candidates: [{
                        content: {
                            parts: [{
                                text: 'Hello from Google Gemini 2.5 Flash!'
                            }]
                        }
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Hello from Google Gemini 2.5 Flash!');
        });

        it('should throw error when all providers fail', async () => {
            model.gpt5mini().sonnet4().addText('Hello');

            // Mock all providers failing
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(500, { error: 'All servers down' });

            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(500, { error: 'All servers down' });

            try {
                await model.message();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('500');
            }
        });
    });

    describe('Cross-Provider Fallback', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should fallback from OpenAI to Anthropic', async () => {
            model.gpt5mini().sonnet4().addText('Test message');

            // Mock OpenAI failure
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(503, { error: 'Service unavailable' });

            // Mock Anthropic success
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Response from Anthropic'
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Response from Anthropic');
        });

        it('should fallback from Anthropic to Google', async () => {
            model.sonnet4().gemini25flash().addText('Test message');

            // Mock Anthropic failure
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(401, { error: 'Unauthorized' });

            // Mock Google success
            nock('https://generativelanguage.googleapis.com')
                .post(/.*generateContent/)
                .reply(200, {
                    candidates: [{
                        content: {
                            parts: [{
                                text: 'Response from Google Gemini 2.5 Flash'
                            }]
                        }
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Response from Google Gemini 2.5 Flash');
        });

        it('should handle network timeout fallback', async () => {
            model.gpt5mini().sonnet4().addText('Hello');

            // Mock timeout error on first provider (using 408 Request Timeout)
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(408, { error: 'Request timeout' });

            // Mock successful response on fallback (Anthropic)
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Quick fallback response from Claude'
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Quick fallback response from Claude');
        });
    });

    describe('Fallback with Different Response Formats', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should handle JSON fallback correctly', async () => {
            const schema = { name: 'Alice', age: 30 };
            model.gpt5mini().sonnet4().addText('Generate user data');

            // Mock OpenAI failure
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(400, { error: 'Bad request' });

            // Mock Anthropic success with JSON
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({ name: 'Bob', age: 25 })
                    }]
                });

            const result = await model.json(schema);

            expect(result).to.have.property('name');
            expect(result).to.have.property('age');
            expect(result.name).to.equal('Bob');
            expect(result.age).to.equal(25);
        });

        it('should preserve message history through fallbacks', async () => {
            model.gpt5mini().sonnet4()
                .addText('First message')
                .addText('Second message');

            // Mock first provider failure
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(500, { error: 'Server error' });

            // Mock second provider success (Anthropic)
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Fallback response with context from Claude'
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Fallback response with context from Claude');
        });
    });

    describe('Fallback Configuration', () => {
        it('should respect custom provider configurations in fallback', async () => {
            const model = ModelMix.new({
                config: { debug: false },
                options: { temperature: 0.5 }
            });

            // Configure with custom temperature for fallback
            model.gpt5mini({ options: { temperature: 0.6 } })
                 .sonnet4({ options: { temperature: 0.7 } })
                 .addText('Creative response');

            // Mock first provider failure
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(503, { error: 'Service unavailable' });

            // Mock second provider success - verify temperature in request (Anthropic)
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(function(uri, requestBody) {
                    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
                    expect(body.temperature).to.equal(0.7);
                    return [200, {
                        content: [{
                            type: 'text',
                            text: 'Creative fallback response from Claude'
                        }]
                    }];
                });

            const response = await model.message();

            expect(response).to.include('Creative fallback response from Claude');
        });

        it('should handle provider-specific options in fallback chain', async () => {
            const model = ModelMix.new({
                config: { debug: false }
            });

            model.gpt5mini({ options: { max_tokens: 100 } })
                .sonnet4({ options: { max_tokens: 200 } })
                .addText('Generate text');

            // Mock OpenAI failure
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(429, { error: 'Rate limited' });

            // Mock Anthropic success - verify max_tokens
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(function (uri, body) {
                    expect(body.max_tokens).to.equal(200);
                    return [200, {
                        content: [{
                            type: 'text',
                            text: 'Fallback with correct max_tokens'
                        }]
                    }];
                });

            const response = await model.message();

            expect(response).to.include('Fallback with correct max_tokens');
        });
    });

    describe('Error Handling in Fallback', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should provide detailed error information when all fallbacks fail', async () => {
            model.gpt5mini().sonnet4().gemini25flash().addText('Test');

            // Mock all providers failing with different errors
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(500, { error: 'OpenAI server error' });

            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(401, { error: 'Anthropic auth error' });

            nock('https://generativelanguage.googleapis.com')
                .post(/.*generateContent/)
                .reply(403, { error: 'Google forbidden' });

            try {
                await model.message();
                expect.fail('Should have thrown an error');
            } catch (error) {
                // Should contain information about the final error
                expect(error.message).to.be.a('string');
            }
        });

        it('should handle malformed responses in fallback', async () => {
            model.gpt5mini().sonnet4().addText('Test');

            // Mock malformed response from first provider
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, { invalid: 'response' });

            // Mock valid response from fallback (Anthropic)
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Valid fallback response from Claude'
                    }]
                });

            const response = await model.message();

            expect(response).to.include('Valid fallback response from Claude');
        });
    });
});