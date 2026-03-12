import { expect } from 'chai';
import { ModelMix, MixAnthropic, MixCustom, MixGoogle, MixOpenAIResponses } from '../index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const nock = require('nock');

describe('Token Usage Tracking', () => {

    // Ensure nock doesn't interfere with live requests via MockHttpSocket
    before(function() {
        nock.cleanAll();
        nock.restore();
    });

    after(function() {
        // Re-activate nock for any subsequent test suites
        nock.activate();
    });

    it('should extract cached tokens from supported provider usage formats', function () {
        const openAIChatTokens = MixCustom.extractTokens({
            usage: {
                prompt_tokens: 120,
                completion_tokens: 30,
                total_tokens: 150,
                prompt_tokens_details: {
                    cached_tokens: 80
                }
            }
        });
        const openAIResponsesTokens = MixOpenAIResponses.extractResponsesTokens({
            usage: {
                input_tokens: 90,
                output_tokens: 20,
                total_tokens: 110,
                input_tokens_details: {
                    cached_tokens: 45
                }
            }
        });
        const anthropicTokens = MixAnthropic.extractTokens({
            usage: {
                input_tokens: 60,
                output_tokens: 15,
                cache_read_input_tokens: 25
            }
        });
        const googleTokens = MixGoogle.extractTokens({
            usageMetadata: {
                promptTokenCount: 70,
                candidatesTokenCount: 10,
                totalTokenCount: 80,
                cachedContentTokenCount: 35
            }
        });

        expect(openAIChatTokens.cached).to.equal(80);
        expect(openAIResponsesTokens.cached).to.equal(45);
        expect(anthropicTokens.cached).to.equal(25);
        expect(googleTokens.cached).to.equal(35);
    });

    it('should pass OpenAI Responses prompt cache options through the request body', function () {
        const request = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.4',
            messages: [{
                role: 'user',
                content: [{ type: 'text', text: 'Explain caching briefly.' }]
            }],
            prompt_cache_key: 'demo-gpt54-cache',
            prompt_cache_retention: '24h'
        });

        expect(request.prompt_cache_key).to.equal('demo-gpt54-cache');
        expect(request.prompt_cache_retention).to.equal('24h');
    });

    it('should track tokens in OpenAI response', async function () {
        this.timeout(30000);

        const model = ModelMix.new()
            .gpt5nano()
            .addText('Say hi');

        const result = await model.raw();

        expect(result).to.have.property('tokens');
        expect(result.tokens).to.have.property('input');
        expect(result.tokens).to.have.property('output');
        expect(result.tokens).to.have.property('total');
        expect(result.tokens).to.have.property('cached');
        
        expect(result.tokens.input).to.be.a('number');
        expect(result.tokens.output).to.be.a('number');
        expect(result.tokens.total).to.be.a('number');
        expect(result.tokens.cached).to.be.a('number');
        
        expect(result.tokens.input).to.be.greaterThan(0);
        expect(result.tokens.output).to.be.greaterThan(0);
        expect(result.tokens.total).to.be.greaterThan(0);
    });

    it('should track tokens in Anthropic response', async function () {
        this.timeout(30000);

        const model = ModelMix.new()
            .haiku45()
            .addText('Say hi');

        const result = await model.raw();

        expect(result).to.have.property('tokens');
        expect(result.tokens).to.have.property('input');
        expect(result.tokens).to.have.property('output');
        expect(result.tokens).to.have.property('total');
        expect(result.tokens).to.have.property('cached');
        
        expect(result.tokens.input).to.be.greaterThan(0);
        expect(result.tokens.output).to.be.greaterThan(0);
        expect(result.tokens.total).to.equal(result.tokens.input + result.tokens.output);
    });

    it('should track tokens in Google Gemini response', async function () {
        this.timeout(30000);

        const model = ModelMix.new()
            .gemini3flash()
            .addText('Say hi');

        const result = await model.raw();

        expect(result).to.have.property('tokens');
        expect(result.tokens).to.have.property('input');
        expect(result.tokens).to.have.property('output');
        expect(result.tokens).to.have.property('total');
        expect(result.tokens).to.have.property('cached');
        
        expect(result.tokens.input).to.be.greaterThan(0);
        expect(result.tokens.output).to.be.greaterThan(0);
        expect(result.tokens.total).to.be.greaterThan(0);
    });

    it('should accumulate tokens across conversation turns', async function () {
        this.timeout(60000);

        const conversation = ModelMix.new({ config: { max_history: 10 } })
            .gpt5nano();

        // First turn
        conversation.addText('My name is Alice');
        const result1 = await conversation.raw();
        
        expect(result1.tokens.input).to.be.greaterThan(0);
        expect(result1.tokens.output).to.be.greaterThan(0);

        // Second turn (should have more input tokens due to history)
        conversation.addText('What is my name?');
        const result2 = await conversation.raw();
        
        expect(result2.tokens.input).to.be.greaterThan(result1.tokens.input);
        expect(result2.tokens.output).to.be.greaterThan(0);

        // Verify both results have valid token counts
        expect(result1.tokens.total).to.equal(result1.tokens.input + result1.tokens.output);
        expect(result2.tokens.total).to.be.greaterThan(0);
    });

    it('should track tokens with JSON responses', async function () {
        this.timeout(30000);

        const model = ModelMix.new()
            .gpt5nano()
            .addText('Return a simple greeting');

        // Using raw() to get token info
        const result = await model.raw();

        expect(result).to.have.property('tokens');
        expect(result.tokens.input).to.be.greaterThan(0);
        expect(result.tokens.output).to.be.greaterThan(0);
        expect(result.tokens.total).to.be.greaterThan(0);
    });

    it('should have consistent token format across providers', async function () {
        this.timeout(90000);

        const providers = [
            { name: 'OpenAI', create: (m) => m.gpt5nano() },
            { name: 'Anthropic', create: (m) => m.haiku45() },
            { name: 'Google', create: (m) => m.gemini3flash() }
        ];

        for (const provider of providers) {
            const model = ModelMix.new();
            provider.create(model).addText('Hi');

            const result = await model.raw();

            // Verify consistent structure
            expect(result.tokens, `${provider.name} should have tokens object`).to.exist;
            expect(result.tokens.input, `${provider.name} should have input`).to.be.a('number');
            expect(result.tokens.output, `${provider.name} should have output`).to.be.a('number');
            expect(result.tokens.total, `${provider.name} should have total`).to.be.a('number');
            expect(result.tokens.cached, `${provider.name} should have cached`).to.be.a('number');
            
            // Verify values are positive
            expect(result.tokens.input, `${provider.name} input should be > 0`).to.be.greaterThan(0);
            expect(result.tokens.output, `${provider.name} output should be > 0`).to.be.greaterThan(0);
            expect(result.tokens.total, `${provider.name} total should be > 0`).to.be.greaterThan(0);
        }
    });
});
