const { expect } = require('chai');
const nock = require('nock');
const { ModerationMix, MixModeration, MixOpenAIModeration } = require('../index.js');

describe('OpenAI moderation', () => {
    const moderationResult = {
        flagged: true,
        categories: { violence: true },
        category_scores: { violence: 0.98 },
        category_applied_input_types: { violence: ['text', 'image'] }
    };

    it('registers omni-moderation-latest with openai()', () => {
        const model = ModerationMix.new().openai({ config: { apiKey: 'test-key' } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('omni-moderation-latest');
        expect(model.models[0].provider).to.be.instanceOf(MixOpenAIModeration);
        expect(model.models[0].provider.config.url).to.equal('https://api.openai.com/v1/moderations');
    });

    it('accepts an explicit API key without requiring the environment variable', () => {
        const originalApiKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;

        try {
            const model = ModerationMix.new().openai({ config: { apiKey: 'explicit-key' } });
            expect(model.models[0].provider.config.apiKey).to.equal('explicit-key');
        } finally {
            if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = originalApiKey;
        }
    });

    it('sends text and image input to the Moderations endpoint', async () => {
        const api = nock('https://api.openai.com')
            .post('/v1/moderations', body => {
                expect(body).to.deep.equal({
                    model: 'omni-moderation-latest',
                    input: [
                        { type: 'text', text: 'Check this' },
                        {
                            type: 'image_url',
                            image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
                        }
                    ]
                });
                return true;
            })
            .reply(200, {
                id: 'modr-test',
                model: 'omni-moderation-latest',
                results: [moderationResult]
            });

        const result = await ModerationMix.new()
            .openai({ config: { apiKey: 'test-key' } })
            .addText('Check this')
            .addImageFromUrl('data:image/png;base64,aW1hZ2U=')
            .raw();

        expect(result.moderation).to.deep.equal([moderationResult]);
        api.done();
    });

    it('exposes the complete API response through raw()', async () => {
        const response = {
            id: 'modr-test',
            model: 'omni-moderation-latest',
            results: [moderationResult]
        };
        const api = nock('https://api.openai.com')
            .post('/v1/moderations')
            .reply(200, response);

        const raw = await ModerationMix.new()
            .openai({ config: { apiKey: 'test-key' } })
            .addText('Check this')
            .raw();

        expect(raw.moderation).to.deep.equal(response.results);
        expect(raw.response).to.deep.equal(response);
        expect(raw.tokens).to.include({ input: 0, output: 0, total: 0, cost: 0 });
        api.done();
    });

    it('rejects streaming because the Moderations endpoint does not support it', async () => {
        const model = ModerationMix.new()
            .openai({ config: { apiKey: 'test-key' } })
            .addText('Check this');

        try {
            await model.stream(() => {});
            throw new Error('Expected stream() to reject');
        } catch (error) {
            expect(error.message).to.equal('ModerationMix does not support streaming. Use raw().');
        }
    });

    it('rejects generative providers from the moderation chain', () => {
        const model = ModerationMix.new();

        expect(() => model.gpt5nano({ config: { apiKey: 'test-key' } })).to.throw(
            'ModerationMix only accepts moderation providers.'
        );
    });

    it('accepts additional moderation providers as fallbacks', () => {
        class TestModeration extends MixModeration {}
        const model = ModerationMix.new()
            .openai({ config: { apiKey: 'test-key' } })
            .attach('test-moderation', new TestModeration({ config: { apiKey: 'test-key' } }));

        expect(model.models.map(({ key }) => key)).to.deep.equal([
            'omni-moderation-latest',
            'test-moderation'
        ]);
    });

    for (const method of ['message', 'json', 'block']) {
        it(`rejects ${method}() because moderation is not generative`, async () => {
            const model = ModerationMix.new()
                .openai({ config: { apiKey: 'test-key' } })
                .addText('Check this');

            try {
                await model[method]();
                throw new Error(`Expected ${method}() to reject`);
            } catch (error) {
                expect(error.message).to.include('ModerationMix does not generate');
            }
        });
    }

});
