const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { ModelMix } = require('../index.js');

describe('Image Processing and Multimodal Support Tests', () => {

    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('Image Data Handling', () => {
        let model;

        const max_history = 2;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false },
                config: { max_history }
            });
        });

        it('should handle base64 image data correctly', async () => {
            const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

            model.gpt52()
                .addText('What do you see in this image?')
                .addImageFromUrl(base64Image);

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content).to.be.an('array');
                    expect(body.messages[1].content).to.have.length(max_history);
                    expect(body.messages[1].content[max_history - 1].image_url.url).to.equal(base64Image);

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'I can see a small test image'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('I can see a small test image');
        });

        it('should support multimodal with sonnet46()', async () => {
            const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

            model.sonnet46()
                .addText('Describe this image')
                .addImageFromUrl(base64Image);

            // Claude expects images as base64 in the content array
            // We'll check that the message is formatted as expected
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(function (uri, body) {
                    console.log(body.messages);
                    // body is already parsed as JSON by nock
                    expect(body.messages).to.be.an('array');
                    // Find the message with the image
                    const userMsg = body.messages.find(m => m.role === 'user');
                    expect(userMsg).to.exist;
                    const imageContent = userMsg.content.find(c => c.type === 'image');
                    expect(imageContent).to.exist;
                    expect(imageContent.source.type).to.equal('base64');
                    expect(imageContent.source.data).to.equal(base64Image.split(',')[1]);
                    expect(imageContent.source.media_type).to.equal('image/png');
                    return [200, {
                        content: [{ type: "text", text: "This is a small PNG test image." }],
                        role: "assistant"
                    }];
                });

            const response = await model.message();
            expect(response).to.include('small PNG test image');
        });

    });
});