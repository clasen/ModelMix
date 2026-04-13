const { expect } = require('chai');
const { MixCustom } = require('../index.js');

describe('Native multipart support', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('should create FormData from fields and files', () => {
        const formData = MixCustom.createMultipartFormData({
            fields: {
                model: 'whisper-1',
                metadata: { source: 'test' }
            },
            files: [{
                name: 'file',
                data: Buffer.from('hello'),
                filename: 'hello.txt',
                contentType: 'text/plain'
            }]
        });

        expect(formData).to.be.instanceOf(FormData);
        expect(formData.get('model')).to.equal('whisper-1');
        expect(formData.get('metadata')).to.equal('{"source":"test"}');

        const uploadedFile = formData.get('file');
        expect(uploadedFile).to.exist;
        expect(uploadedFile.name).to.equal('hello.txt');
        expect(uploadedFile.type).to.equal('text/plain');
    });

    it('should remove content-type header for multipart requests', () => {
        const request = MixCustom.buildRequestBodyAndHeaders({
            multipart: {
                fields: { model: 'whisper-1' }
            }
        }, {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: 'Bearer test'
        });

        expect(request.body).to.be.instanceOf(FormData);
        expect(request.headers).to.deep.equal({
            accept: 'application/json',
            authorization: 'Bearer test'
        });
    });

    it('should send multipart body in create()', async () => {
        let capturedRequest = null;

        global.fetch = async (url, request) => {
            capturedRequest = { url, request };
            return new Response(JSON.stringify({
                choices: [{
                    message: { content: 'ok' }
                }]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        };

        const mix = new MixCustom({
            config: {
                url: 'https://api.example.com/v1/upload',
                apiKey: 'token'
            }
        });

        const result = await mix.create({
            options: {
                stream: false,
                multipart: {
                    fields: { purpose: 'test' },
                    files: [{
                        name: 'file',
                        data: Buffer.from('sample'),
                        filename: 'sample.txt',
                        contentType: 'text/plain'
                    }]
                }
            }
        });

        expect(result.message).to.equal('ok');
        expect(capturedRequest.url).to.equal('https://api.example.com/v1/upload');
        expect(capturedRequest.request.body).to.be.instanceOf(FormData);
        expect(capturedRequest.request.headers).to.not.have.property('content-type');
    });
});
