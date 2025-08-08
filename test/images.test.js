const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
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

            model.gpt4o()
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

        it('should support multimodal with sonnet4()', async () => {
            const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

            model.sonnet4()
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

        //     it('should handle multiple images in single message', async () => {
        //         const image1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';
        //         const image2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

        //         model.gpt4o()
        //             .addText('Compare these two images:')
        //             .addImage(image1)
        //             .addImage(image2);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.messages).to.have.length(3);

        //                 // First image
        //                 expect(body.messages[1].content[1].type).to.equal('image_url');
        //                 expect(body.messages[1].content[1].image_url.url).to.equal(image1);

        //                 // Second image
        //                 expect(body.messages[2].content[1].type).to.equal('image_url');
        //                 expect(body.messages[2].content[1].image_url.url).to.equal(image2);

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: 'Image 1 is JPEG, Image 2 is PNG'
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('Image 1 is JPEG, Image 2 is PNG');
        //     });

        //     it('should handle image URLs correctly', async () => {
        //         const imageUrl = 'https://example.com/test-image.jpg';

        //         model.gpt4o()
        //             .addText('Analyze this image from URL:')
        //             .addImageFromUrl(imageUrl);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.messages[1].content[1].type).to.equal('image_url');
        //                 expect(body.messages[1].content[1].image_url.url).to.equal(imageUrl);

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: 'Image loaded from URL successfully'
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('Image loaded from URL successfully');
        //     });

        //     it('should handle mixed text and image content', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';

        //         model.gpt4o()
        //             .addText('Look at this image and tell me what you see.')
        //             .addImage(imageData)
        //             .addText('Also, what format is it in?');

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.messages).to.have.length(3);

        //                 // Text message
        //                 expect(body.messages[0].content).to.equal('Look at this image and tell me what you see.');

        //                 // Image message
        //                 expect(body.messages[1].content).to.be.an('array');
        //                 expect(body.messages[1].content[1].type).to.equal('image_url');

        //                 // Follow-up text
        //                 expect(body.messages[2].content).to.equal('Also, what format is it in?');

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: 'I see a test image in JPEG format'
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('I see a test image in JPEG format');
        //     });
        // });

        // describe('Image File Processing', () => {
        //     let model;
        //     const fixturesPath = path.join(__dirname, 'fixtures');

        //     beforeEach(() => {
        //         model = ModelMix.new({
        //             config: { debug: false }
        //         });
        //     });

        //     it('should load and process local image files', async () => {
        //         // Create a simple test image file
        //         const testImagePath = path.join(fixturesPath, 'test.png');
        //         const simpleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

        //         // Write test image to file
        //         fs.writeFileSync(testImagePath, Buffer.from(simpleBase64, 'base64'));

        //         try {
        //             model.gpt4o()
        //                 .addText('Analyze this local image file:')
        //                 .addImage(testImagePath);

        //             nock('https://api.openai.com')
        //                 .post('/v1/chat/completions')
        //                 .reply(function(uri, requestBody) {
        //                     const body = JSON.parse(requestBody);
        //                     expect(body.messages[1].content[1].type).to.equal('image_url');
        //                     expect(body.messages[1].content[1].image_url.url).to.include('data:image');

        //                     return [200, {
        //                         choices: [{
        //                             message: {
        //                                 role: 'assistant',
        //                                 content: 'Local image file processed successfully'
        //                             }
        //                         }]
        //                     }];
        //                 });

        //             const response = await model.message();
        //             expect(response).to.include('Local image file processed successfully');
        //         } finally {
        //             // Clean up test file
        //             if (fs.existsSync(testImagePath)) {
        //                 fs.unlinkSync(testImagePath);
        //             }
        //         }
        //     });

        //     it('should handle various image formats', async () => {
        //         const formats = [
        //             { ext: 'jpg', mime: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==' },
        //             { ext: 'png', mime: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' },
        //             { ext: 'gif', mime: 'image/gif', data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
        //         ];

        //         for (const format of formats) {
        //             const base64Image = `data:${format.mime};base64,${format.data}`;

        //             model = ModelMix.new({ config: { debug: false } });
        //             model.gpt4o()
        //                 .addText(`Analyze this ${format.ext.toUpperCase()} image:`)
        //                 .addImage(base64Image);

        //             nock('https://api.openai.com')
        //                 .post('/v1/chat/completions')
        //                 .reply(function(uri, requestBody) {
        //                     const body = JSON.parse(requestBody);
        //                     expect(body.messages[1].content[1].image_url.url).to.include(format.mime);

        //                     return [200, {
        //                         choices: [{
        //                             message: {
        //                                 role: 'assistant',
        //                                 content: `${format.ext.toUpperCase()} image processed`
        //                             }
        //                         }]
        //                     }];
        //                 });

        //             const response = await model.message();
        //             expect(response).to.include(`${format.ext.toUpperCase()} image processed`);
        //         }
        //     });
        // });

        // describe('Provider-Specific Multimodal Support', () => {
        //     let model;

        //     beforeEach(() => {
        //         model = ModelMix.new({
        //             config: { debug: false }
        //         });
        //     });

        //     it('should handle multimodal for OpenAI correctly', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';

        //         model.gpt4o()
        //             .addText('Describe this image:')
        //             .addImage(imageData);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);

        //                 // Check OpenAI multimodal message format
        //                 expect(body.messages[1].content).to.be.an('array');
        //                 expect(body.messages[1].content[0]).to.deep.equal({
        //                     type: 'text',
        //                     text: 'Describe this image:'
        //                 });
        //                 expect(body.messages[1].content[1]).to.deep.equal({
        //                     type: 'image_url',
        //                     image_url: { url: imageData }
        //                 });

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: 'OpenAI multimodal format working'
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('OpenAI multimodal format working');
        //     });

        //     it('should handle multimodal for Google Gemini correctly', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';

        //         model.gemini15pro()
        //             .addText('What is in this image?')
        //             .addImage(imageData);

        //         nock('https://generativelanguage.googleapis.com')
        //             .post(/.*generateContent/)
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);

        //                 // Check Google multimodal message format
        //                 expect(body.contents[1].parts).to.be.an('array');
        //                 expect(body.contents[1].parts).to.have.length(2);
        //                 expect(body.contents[1].parts[0]).to.deep.equal({
        //                     text: 'What is in this image?'
        //                 });
        //                 expect(body.contents[1].parts[1]).to.deep.equal({
        //                     inlineData: {
        //                         mimeType: 'image/jpeg',
        //                         data: '/9j/4AAQSkZJRgABAQAAAQABAAD//2Q=='
        //                     }
        //                 });

        //                 return [200, {
        //                     candidates: [{
        //                         content: {
        //                             parts: [{
        //                                 text: 'Google multimodal format working'
        //                             }]
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('Google multimodal format working');
        //     });

        //     it('should handle multimodal fallback correctly', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';

        //         model.gpt4o().gemini15pro()
        //             .addText('Analyze this image:')
        //             .addImage(imageData);

        //         // Mock OpenAI failure
        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(503, { error: 'Service unavailable' });

        //         // Mock Google success with multimodal
        //         nock('https://generativelanguage.googleapis.com')
        //             .post(/.*generateContent/)
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.contents[1].parts[1].inlineData).to.exist;
        //                 expect(body.contents[1].parts[1].inlineData.mimeType).to.equal('image/jpeg');

        //                 return [200, {
        //                     candidates: [{
        //                         content: {
        //                             parts: [{
        //                                 text: 'Fallback multimodal successful'
        //                             }]
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('Fallback multimodal successful');
        //     });
        // });

        // describe('Image Processing with Templates', () => {
        //     let model;

        //     beforeEach(() => {
        //         model = ModelMix.new({
        //             config: { debug: false }
        //         });
        //     });

        //     it('should combine image processing with template replacement', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';

        //         model.gpt4o()
        //             .replace({ 
        //                 '{{task}}': 'object detection',
        //                 '{{format}}': 'JSON format',
        //                 '{{requirements}}': 'include confidence scores'
        //             })
        //             .addText('Perform {{task}} on this image and return results in {{format}} with {{requirements}}:')
        //             .addImage(imageData);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.messages[1].content[0].text).to.equal('Perform object detection on this image and return results in JSON format with include confidence scores:');
        //                 expect(body.messages[1].content[1].type).to.equal('image_url');

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: 'Template with image processing completed'
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const response = await model.message();
        //         expect(response).to.include('Template with image processing completed');
        //     });

        //     it('should handle JSON output with image analysis', async () => {
        //         const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==';
        //         const schema = {
        //             objects: [{ name: 'car', confidence: 0.95 }],
        //             colors: ['red', 'blue'],
        //             description: 'A detailed description'
        //         };

        //         model.gpt4o()
        //             .addText('Analyze this image and return structured data:')
        //             .addImage(imageData);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.response_format).to.exist;
        //                 expect(body.messages[1].content[1].type).to.equal('image_url');

        //                 return [200, {
        //                     choices: [{
        //                         message: {
        //                             role: 'assistant',
        //                             content: JSON.stringify({
        //                                 objects: [{ name: 'test_object', confidence: 0.85 }],
        //                                 colors: ['white', 'gray'],
        //                                 description: 'A simple test image with minimal content'
        //                             })
        //                         }
        //                     }]
        //                 }];
        //             });

        //         const result = await model.json(schema);
        //         expect(result.objects).to.be.an('array');
        //         expect(result.objects[0]).to.have.property('name');
        //         expect(result.objects[0]).to.have.property('confidence');
        //         expect(result.colors).to.be.an('array');
        //         expect(result.description).to.be.a('string');
        //     });
        // });

        // describe('Error Handling for Images', () => {
        //     let model;

        //     beforeEach(() => {
        //         model = ModelMix.new({
        //             config: { debug: false }
        //         });
        //     });

        //     it('should handle invalid image data gracefully', async () => {
        //         const invalidImageData = 'data:image/jpeg;base64,invalid_base64_data';

        //         model.gpt4o()
        //             .addText('Process this image:')
        //             .addImage(invalidImageData);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 // Should still send the invalid data to the API
        //                 expect(body.messages[1].content[1].image_url.url).to.equal(invalidImageData);

        //                 return [400, {
        //                     error: {
        //                         message: 'Invalid image data',
        //                         type: 'invalid_request_error'
        //                     }
        //                 }];
        //             });

        //         try {
        //             await model.message();
        //             expect.fail('Should have thrown an error');
        //         } catch (error) {
        //             expect(error.message).to.include('400');
        //         }
        //     });

        //     it('should handle missing image files gracefully', async () => {
        //         const nonExistentPath = '/path/that/does/not/exist.jpg';

        //         expect(() => {
        //             model.gpt4o()
        //                 .addText('Process this image:')
        //                 .addImage(nonExistentPath);
        //         }).to.not.throw();
        //     });

        //     it('should handle unsupported image formats', async () => {
        //         const unsupportedFormat = 'data:image/bmp;base64,Qk04AAAAAAAAA=';

        //         model.gpt4o()
        //             .addText('Process this BMP image:')
        //             .addImage(unsupportedFormat);

        //         nock('https://api.openai.com')
        //             .post('/v1/chat/completions')
        //             .reply(function(uri, requestBody) {
        //                 const body = JSON.parse(requestBody);
        //                 expect(body.messages[1].content[1].image_url.url).to.equal(unsupportedFormat);

        //                 return [400, {
        //                     error: {
        //                         message: 'Unsupported image format',
        //                         type: 'invalid_request_error'
        //                     }
        //                 }];
        //             });

        //         try {
        //             await model.message();
        //             expect.fail('Should have thrown an error');
        //         } catch (error) {
        //             expect(error.message).to.include('400');
        //         }
        //     });
    });
});