import { expect } from 'chai';
import { ModelMix, MixAnthropic, MixCustom, MixGoogle, MixMiMo, MixOpenAI, MixOpenAIResponses, MixOpenRouter } from '../index.js';
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

    it('should normalize prompt cache usage from supported provider formats', function () {
        const openAIChatTokens = MixCustom.extractTokens({
            usage: {
                prompt_tokens: 120,
                completion_tokens: 30,
                total_tokens: 150,
                prompt_tokens_details: {
                    cached_tokens: 80,
                    cache_write_tokens: 10
                }
            }
        });
        const openAIResponsesTokens = MixOpenAIResponses.extractResponsesTokens({
            usage: {
                input_tokens: 90,
                output_tokens: 20,
                total_tokens: 110,
                input_tokens_details: {
                    cached_tokens: 45,
                    cache_write_tokens: 15
                }
            }
        });
        const anthropicTokens = MixAnthropic.extractTokens({
            usage: {
                input_tokens: 60,
                output_tokens: 15,
                cache_read_input_tokens: 25,
                cache_creation_input_tokens: 10
            }
        });
        const googleTokens = MixGoogle.extractTokens({
            usageMetadata: {
                promptTokenCount: 70,
                candidatesTokenCount: 10,
                thoughtsTokenCount: 5,
                totalTokenCount: 85,
                cachedContentTokenCount: 35
            }
        });

        expect(openAIChatTokens).to.include({
            input: 120,
            output: 30,
            total: 150,
            cached: 80,
            cacheWrite: 10,
            uncachedInput: 30,
            cacheHitRate: 0.6667
        });
        expect(openAIResponsesTokens).to.include({
            input: 90,
            output: 20,
            total: 110,
            cached: 45,
            cacheWrite: 15,
            uncachedInput: 30,
            cacheHitRate: 0.5
        });
        expect(anthropicTokens).to.include({
            input: 95,
            output: 15,
            total: 110,
            cached: 25,
            cacheWrite: 10,
            uncachedInput: 60,
            cacheHitRate: 0.2632
        });
        expect(googleTokens).to.include({
            input: 70,
            output: 10,
            thinking: 5,
            total: 85,
            cached: 35,
            cacheWrite: 0,
            uncachedInput: 35,
            cacheHitRate: 0.5
        });
    });

    it('should return zero for prompt cache categories omitted by the provider', function () {
        const tokens = MixCustom.extractTokens({
            usage: {
                prompt_tokens: 20,
                completion_tokens: 5,
                total_tokens: 25
            }
        });

        expect(tokens).to.include({
            cached: 0,
            cacheWrite: 0,
            uncachedInput: 20,
            cacheHitRate: 0,
            cost: 0
        });
        expect(tokens.costBreakdown).to.deep.equal({
            uncachedInput: 0,
            cachedInput: 0,
            cacheWrite: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0,
            total: 0
        });
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

    it('should pass GPT-5.6 explicit cache controls and preserve block breakpoints', function () {
        const breakpoint = { mode: 'explicit' };
        const request = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [{
                role: 'developer',
                content: [
                    { type: 'text', text: 'Stable instructions', prompt_cache_breakpoint: breakpoint },
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
                        prompt_cache_breakpoint: breakpoint
                    },
                    {
                        type: 'input_file',
                        file_id: 'file_123',
                        prompt_cache_breakpoint: breakpoint
                    }
                ]
            }],
            prompt_cache_key: 'explicit-cache',
            prompt_cache_options: { mode: 'explicit', ttl: '30m' }
        });

        expect(request.prompt_cache_options).to.deep.equal({ mode: 'explicit', ttl: '30m' });
        expect(request.input[0].content).to.deep.equal([
            { type: 'input_text', text: 'Stable instructions', prompt_cache_breakpoint: breakpoint },
            {
                type: 'input_image',
                image_url: 'data:image/png;base64,AAAA',
                prompt_cache_breakpoint: breakpoint
            },
            {
                type: 'input_file',
                file_id: 'file_123',
                prompt_cache_breakpoint: breakpoint
            }
        ]);
    });

    it('should translate neutral cache breakpoints for GPT-5.6 and filter them for older models', async function () {
        const breakpoint = { mode: 'explicit' };
        const model = ModelMix.new()
            .addText('Stable text', { role: 'developer', cache: { breakpoint: true } })
            .addImageFromUrl('data:image/png;base64,AAAA', { cache: { breakpoint: true } });
        const messages = await model.prepareMessages();
        const gpt56Request = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages,
            prompt_cache_options: { mode: 'explicit', ttl: '30m' }
        });
        const olderRequest = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.4',
            messages
        });

        expect(messages[0].content[0]).to.deep.include({ cache: { breakpoint: true } });
        expect(messages[0].content[0]).to.not.have.property('prompt_cache_breakpoint');
        expect(gpt56Request.input[0].content[0].prompt_cache_breakpoint).to.deep.equal(breakpoint);
        expect(gpt56Request.input[1].content[0]).to.deep.equal({
            type: 'input_image',
            image_url: 'data:image/png;base64,AAAA',
            prompt_cache_breakpoint: breakpoint
        });
        expect(olderRequest.input[0].content[0]).to.not.have.property('cache');
        expect(olderRequest.input[0].content[0]).to.not.have.property('prompt_cache_breakpoint');
        expect(olderRequest.input[1].content[0]).to.not.have.property('prompt_cache_breakpoint');
    });

    it('should map assistant history to Responses output_text content', function () {
        const request = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [
                { role: 'user', content: [{ type: 'text', text: 'My name is Alice' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'Nice to meet you' }] },
                { role: 'user', content: [{ type: 'text', text: 'What is my name?' }] }
            ]
        });

        expect(request.input[0].content[0]).to.deep.equal({
            type: 'input_text',
            text: 'My name is Alice'
        });
        expect(request.input[1].content[0]).to.deep.equal({
            type: 'output_text',
            text: 'Nice to meet you'
        });
        expect(request.input[2].content[0]).to.deep.equal({
            type: 'input_text',
            text: 'What is my name?'
        });
    });

    it('should not treat the native OpenAI breakpoint as a fluent API alias', async function () {
        const nativeBreakpoint = { prompt_cache_breakpoint: { mode: 'explicit' } };
        const model = ModelMix.new()
            .addText('Stable text', nativeBreakpoint)
            .addImageFromUrl('data:image/png;base64,AAAA', nativeBreakpoint);
        const messages = await model.prepareMessages();
        const request = MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages,
            prompt_cache_options: { mode: 'explicit', ttl: '30m' }
        });

        expect(messages[0].content).to.have.length(2);
        expect(messages[0].content.every(item => item.cache === undefined)).to.equal(true);
        const content = request.input.flatMap(item => item.content ?? []);
        expect(content).to.have.length(2);
        expect(content.every(item => item.prompt_cache_breakpoint === undefined)).to.equal(true);
    });

    it('should strip neutral and Anthropic cache metadata from OpenAI-compatible chat requests', function () {
        const messages = [{
            role: 'user',
            content: [{
                type: 'text',
                text: 'Stable text',
                cache: { breakpoint: true },
                cache_control: { type: 'ephemeral' }
            }]
        }];
        const converted = MixOpenAI.convertMessages(messages, { system: 'System' });

        expect(converted[1].content[0]).to.deep.equal({ type: 'text', text: 'Stable text' });
        expect(messages[0].content[0]).to.deep.include({ cache: { breakpoint: true } });
    });

    it('should reject prompt cache controls unsupported by the selected OpenAI model', function () {
        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [{ role: 'user', content: 'Hi' }],
            prompt_cache_retention: '24h'
        })).to.throw('prompt_cache_options.ttl');

        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.4',
            messages: [{ role: 'user', content: 'Hi' }],
            prompt_cache_options: { mode: 'explicit', ttl: '30m' }
        })).to.throw('only supported by GPT-5.6');

        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.4',
            messages: [{
                role: 'user',
                content: [{
                    type: 'text',
                    text: 'Hi',
                    prompt_cache_breakpoint: { mode: 'explicit' }
                }]
            }]
        })).to.throw('prompt_cache_breakpoint is only supported by GPT-5.6');
    });

    it('should validate GPT-5.6 prompt cache option values', function () {
        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [{ role: 'user', content: 'Hi' }],
            prompt_cache_options: { mode: 'automatic', ttl: '30m' }
        })).to.throw('mode must be "implicit" or "explicit"');

        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [{ role: 'user', content: 'Hi' }],
            prompt_cache_options: { mode: 'explicit', ttl: '1h' }
        })).to.throw('ttl must be "30m"');

        expect(() => MixOpenAIResponses.buildResponsesRequest({
            model: 'gpt-5.6-luna',
            messages: [{
                role: 'user',
                content: [{
                    type: 'text',
                    text: 'Hi',
                    prompt_cache_breakpoint: { mode: 'implicit' }
                }]
            }]
        })).to.throw('breakpoint mode must be "explicit"');
    });

    it('should register GPT-5.5 shortcuts with OpenAI Responses provider', function () {
        const model = ModelMix.new()
            .gpt55()
            .gpt55pro();

        expect(model.models).to.have.length(2);
        expect(model.models[0].key).to.equal('gpt-5.5');
        expect(model.models[1].key).to.equal('gpt-5.5-pro');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenAIResponses);
        expect(model.models[1].provider).to.be.instanceOf(MixOpenAIResponses);
    });

    it('should register GPT-5.6 shortcuts with OpenAI Responses provider', function () {
        const model = ModelMix.new()
            .gpt56sol()
            .gpt56terra()
            .gpt56luna();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'gpt-5.6-sol',
            'gpt-5.6-terra',
            'gpt-5.6-luna'
        ]);
        expect(model.models.every(({ provider }) => provider instanceof MixOpenAIResponses)).to.equal(true);
        expect(ModelMix.calculateCost('gpt-5.6-sol', { input: 1_000_000, output: 1_000_000 })).to.equal(55);
        expect(ModelMix.calculateCost('gpt-5.6-terra', { input: 1_000_000, output: 1_000_000 })).to.equal(22);
        expect(ModelMix.calculateCost('gpt-5.6-luna', { input: 1_000_000, output: 1_000_000 })).to.equal(2.2);
    });

    it('should calculate GPT-5.6 cache reads and writes at their actual rates', function () {
        const tokens = ModelMix.normalizeTokenUsage({
            input: 1200,
            output: 50,
            cached: 800,
            cacheWrite: 200
        });

        expect(ModelMix.calculateCostBreakdown('gpt-5.6-terra', tokens)).to.deep.equal({
            uncachedInput: 0.0004,
            cachedInput: 0.00016,
            cacheWrite: 0.0005,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0.0006,
            total: 0.00166
        });
        expect(ModelMix.calculateCost('gpt-5.6-terra', tokens)).to.equal(0.00166);
    });

    it('should apply GPT-5.6 long-context multipliers to the entire request', function () {
        const tokens = ModelMix.normalizeTokenUsage({
            input: 300_000,
            output: 1_000,
            cached: 100_000,
            cacheWrite: 100_000
        });

        expect(ModelMix.calculateCostBreakdown('gpt-5.6-luna', tokens)).to.deep.equal({
            uncachedInput: 0.04,
            cachedInput: 0.004,
            cacheWrite: 0.05,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0.0018,
            total: 0.0958
        });
        expect(ModelMix.calculateCacheMetrics('gpt-5.6-luna', tokens)).to.deep.equal({
            cacheSavings: 0.036,
            cacheWritePremium: 0.01,
            breakEvenHits: 0.2778
        });
    });

    it('should not apply GPT-5.6 long-context multipliers at exactly 272K input tokens', function () {
        const tokens = ModelMix.normalizeTokenUsage({
            input: 272_000,
            output: 1_000,
            cached: 100_000,
            cacheWrite: 100_000
        });

        expect(ModelMix.calculateCostBreakdown('gpt-5.6-luna', tokens)).to.deep.equal({
            uncachedInput: 0.0144,
            cachedInput: 0.002,
            cacheWrite: 0.025,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0.0012,
            total: 0.0426
        });
    });

    it('should price Anthropic 5-minute and 1-hour cache writes separately', function () {
        const tokens = MixAnthropic.extractTokens({
            usage: {
                input_tokens: 10,
                output_tokens: 5,
                cache_read_input_tokens: 400,
                cache_creation_input_tokens: 300,
                cache_creation: {
                    ephemeral_5m_input_tokens: 100,
                    ephemeral_1h_input_tokens: 200
                }
            }
        });

        expect(tokens).to.include({
            input: 710,
            cached: 400,
            cacheWrite: 300,
            cacheWrite5m: 100,
            cacheWrite1h: 200,
            uncachedInput: 10
        });
        expect(ModelMix.calculateCostBreakdown('claude-haiku-4-5-20251001', tokens)).to.deep.equal({
            uncachedInput: 0.00001,
            cachedInput: 0.00004,
            cacheWrite: 0.000525,
            cacheWrite5m: 0.000125,
            cacheWrite1h: 0.0004,
            output: 0.000025,
            total: 0.0006
        });
        expect(ModelMix.calculateCacheMetrics('claude-haiku-4-5-20251001', tokens)).to.deep.equal({
            cacheSavings: 0.00036,
            cacheWritePremium: 0.000225,
            breakEvenHits: 0.8333
        });
    });

    it('should expose normalized cache costs through raw() and lastRaw', async function () {
        const provider = new MixCustom();
        provider.create = async () => ({
            message: 'ok',
            think: null,
            toolCalls: [],
            tokens: MixOpenAIResponses.extractResponsesTokens({
                usage: {
                    input_tokens: 1200,
                    output_tokens: 50,
                    total_tokens: 1250,
                    input_tokens_details: {
                        cached_tokens: 1024,
                        cache_write_tokens: 0
                    }
                }
            }),
            response: {}
        });

        const model = ModelMix.new()
            .attach('gpt-5.6-luna', provider)
            .addText('test');
        const result = await model.raw();

        expect(result.tokens).to.include({
            input: 1200,
            output: 50,
            total: 1250,
            cached: 1024,
            cacheWrite: 0,
            uncachedInput: 176,
            cacheHitRate: 0.8533,
            cacheSavings: 0.00018432,
            cacheWritePremium: 0,
            breakEvenHits: 0,
            cost: 0.00011568
        });
        expect(result.tokens.costBreakdown).to.deep.equal({
            uncachedInput: 0.0000352,
            cachedInput: 0.00002048,
            cacheWrite: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 0.00006,
            total: 0.00011568
        });
        expect(model.lastRaw.tokens).to.deep.equal(result.tokens);
    });

    it('should register Gemini Flash shortcuts with Google provider', function () {
        const model = ModelMix.new()
            .gemini37flash()
            .gemini36flash()
            .gemini35flash()
            .gemini35flashLite();

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'gemini-3.7-flash',
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.5-flash-lite'
        ]);
        expect(model.models.every(({ provider }) => provider instanceof MixGoogle)).to.equal(true);
        expect(ModelMix.calculateCost('gemini-3.7-flash', { input: 1_000_000, output: 1_000_000 })).to.equal(4.5);
        expect(ModelMix.calculateCost('gemini-3.6-flash', { input: 1_000_000, output: 1_000_000 })).to.equal(4.5);
        expect(ModelMix.calculateCost('gemini-3.5-flash', { input: 1_000_000, output: 1_000_000 })).to.equal(5.25);
        expect(ModelMix.calculateCost('gemini-3.5-flash-lite', { input: 1_000_000, output: 1_000_000 })).to.equal(2.8);
    });

    it('should calculate Gemini 3.7 Flash cache reads at the introductory rate', function () {
        expect(ModelMix.calculateCostBreakdown('gemini-3.7-flash', {
            input: 1_000_000,
            output: 1_000_000,
            thinking: 500_000,
            cached: 1_000_000
        })).to.deep.equal({
            uncachedInput: 0,
            cachedInput: 0.075,
            cacheWrite: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            output: 5.625,
            total: 5.7
        });
    });

    it('should forward options and config through gemini37flash()', function () {
        const options = { thinkingLevel: 'high' };
        const config = { max_history: 3 };
        const model = ModelMix.new().gemini37flash({ options, config });

        expect(model.models[0].provider).to.be.instanceOf(MixGoogle);
        expect(model.models[0].provider.options).to.deep.equal(options);
        expect(model.models[0].provider.config).to.include(config);
    });

    it('should register MiMo shortcuts with native and OpenRouter providers', function () {
        const originalMimoApiKey = process.env.MIMO_API_KEY;
        const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

        process.env.MIMO_API_KEY = 'test-mimo-key';
        process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

        try {
            const model = ModelMix.new()
                .mimo25()
                .mimo25pro({ mix: { mimo: true, openrouter: true } });

            expect(model.models).to.have.length(3);
            expect(model.models[0].key).to.equal('xiaomi/mimo-v2.5');
            expect(model.models[1].key).to.equal('mimo-v2.5-pro');
            expect(model.models[2].key).to.equal('xiaomi/mimo-v2.5-pro');

            expect(model.models[0].provider).to.be.instanceOf(MixOpenRouter);
            expect(model.models[1].provider).to.be.instanceOf(MixMiMo);
            expect(model.models[2].provider).to.be.instanceOf(MixOpenRouter);
        } finally {
            if (originalMimoApiKey === undefined) delete process.env.MIMO_API_KEY;
            else process.env.MIMO_API_KEY = originalMimoApiKey;

            if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
            else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
        }
    });

    it('should use api-key header for MiMo provider', function () {
        const originalMimoApiKey = process.env.MIMO_API_KEY;
        process.env.MIMO_API_KEY = 'test-mimo-key';

        try {
            const provider = new MixMiMo();
            expect(provider.headers['api-key']).to.equal('test-mimo-key');
            expect(provider.headers.authorization).to.equal(undefined);
            expect(provider.config.url).to.equal('https://api.xiaomimimo.com/v1/chat/completions');
        } finally {
            if (originalMimoApiKey === undefined) delete process.env.MIMO_API_KEY;
            else process.env.MIMO_API_KEY = originalMimoApiKey;
        }
    });

    it('should throw a clear error when MIMO_API_KEY is missing', function () {
        const originalMimoApiKey = process.env.MIMO_API_KEY;
        delete process.env.MIMO_API_KEY;

        try {
            expect(() => new MixMiMo()).to.throw('MIMO_API_KEY');
        } finally {
            if (originalMimoApiKey === undefined) delete process.env.MIMO_API_KEY;
            else process.env.MIMO_API_KEY = originalMimoApiKey;
        }
    });

    it('should track tokens in OpenAI response', async function () {
        this.timeout(30000);

        const model = ModelMix.new()
            .gpt56luna()
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
            .gemini37flash()
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
            .gpt56luna();

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
            .gpt56luna()
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
            { name: 'OpenAI', create: (m) => m.gpt56luna() },
            { name: 'Anthropic', create: (m) => m.haiku45() },
            { name: 'Google', create: (m) => m.gemini37flash() }
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
