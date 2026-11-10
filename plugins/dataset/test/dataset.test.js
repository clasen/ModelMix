const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MixCustom, ModelMix } = require('../../..');
const { dataset } = require('..');

function createModel(file, handler = async () => ({ message: 'Hello back.', toolCalls: [] }), options = {}) {
    const provider = new MixCustom();
    provider.create = handler;
    return ModelMix.new({ config: { system: 'You are terse.', bottleneck: { minTime: 0 } } })
        .attach('custom', provider)
        .use(dataset({ file, ...options }));
}

function readLines(file) {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
}

describe('Dataset plugin', () => {
    let directory;
    let file;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modelmix-dataset-'));
        file = path.join(directory, 'train.jsonl');
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it('appends one chat example per successful execution', async () => {
        const model = createModel(file);
        await model.addText('Hello').addText('there').message();
        await model.addText('Again').message();

        expect(readLines(file)).to.deep.equal([
            {
                messages: [
                    { role: 'system', content: 'You are terse.' },
                    { role: 'user', content: 'Hello\n\nthere' },
                    { role: 'assistant', content: 'Hello back.' }
                ]
            },
            {
                messages: [
                    { role: 'system', content: 'You are terse.' },
                    { role: 'user', content: 'Again' },
                    { role: 'assistant', content: 'Hello back.' }
                ]
            }
        ]);
    });

    it('records the raw JSON text returned by the model', async () => {
        const model = createModel(file, async () => ({ message: '{"answer":42}', toolCalls: [] }));
        expect(await model.addText('Answer').json({ answer: 0 })).to.deep.equal({ answer: 42 });

        const [{ messages }] = readLines(file);
        expect(messages[0].role).to.equal('system');
        expect(messages[0].content).to.include('You are terse.');
        expect(messages.at(-1)).to.deep.equal({ role: 'assistant', content: '{"answer":42}' });
    });

    it('records reasoning in reasoning_content when think is enabled', async () => {
        const reasoning = async () => ({ message: '42', think: 'Six times seven.', toolCalls: [] });
        await createModel(file, reasoning, { think: true }).addText('Answer').message();
        await createModel(file, async () => ({ message: '42', think: '', toolCalls: [] }), { think: true }).addText('Answer').message();
        await createModel(file, reasoning).addText('Answer').message();

        expect(readLines(file).map(line => line.messages.at(-1))).to.deep.equal([
            { role: 'assistant', reasoning_content: 'Six times seven.', content: '42' },
            { role: 'assistant', content: '42' },
            { role: 'assistant', content: '42' }
        ]);
    });

    it('rejects non-text content before calling the provider', async () => {
        let called = false;
        const model = createModel(file, async () => { called = true; return { message: 'nope', toolCalls: [] }; });
        model.addText('Describe');
        model.messages.push({
            role: 'user',
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'ZmFrZQ==' } }]
        });

        let rejection;
        try {
            await model.message();
        } catch (error) {
            rejection = error;
        }
        expect(rejection).to.be.instanceOf(TypeError);
        expect(rejection.message).to.include('text-only');
        expect(called).to.equal(false);
        expect(fs.existsSync(file)).to.equal(false);
    });

    it('writes nothing when the execution fails', async () => {
        const model = createModel(file, async () => { throw new Error('provider down'); });
        let rejection;
        try {
            await model.addText('Hello').message();
        } catch (error) {
            rejection = error;
        }
        expect(rejection.message).to.include('provider down');
        expect(fs.existsSync(file)).to.equal(false);
    });

    it('requires a file path', () => {
        expect(() => dataset({})).to.throw(TypeError, 'file');
    });
});
