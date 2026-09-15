const { expect } = require('chai');
const sinon = require('sinon');
const { MixGoogle, ModelMix } = require('../index');

describe('Google message and JSON contracts', () => {
    afterEach(() => sinon.restore());

    it('converts string user and assistant messages without changing their inputs', () => {
        const messages = [
            { role: 'user', content: 'Request' },
            { role: 'assistant', content: 'Answer' },
            { role: 'user', content: [{ type: 'text', text: 'Follow-up' }] }
        ];
        expect(MixGoogle.convertMessages(messages)).to.deep.equal([
            { role: 'user', parts: [{ text: 'Request' }] },
            { role: 'model', parts: [{ text: 'Answer' }] },
            { role: 'user', parts: [{ text: 'Follow-up' }] }
        ]);
        expect(messages[0]).to.deep.equal({ role: 'user', content: 'Request' });
    });

    it('sends child text messages and JSON mode through the real Google adapter', async () => {
        const bodies = [];
        sinon.stub(global, 'fetch').callsFake(async (_url, input) => {
            bodies.push(JSON.parse(input.body));
            return new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }]
            }), { status: 200 });
        });
        const worker = ModelMix.new({ config: { apiKey: 'test-key' } }).gemini38flash();
        const result = await ModelMix.new().use({
            name: 'child-json',
            execute: context => context.invoke({
                model: worker,
                system: 'Return JSON.',
                messages: [{ role: 'user', content: 'Evaluate this response.' }],
                options: { response_format: { type: 'json_object' } },
                plugins: 'none'
            })
        }).addText('Task').json();
        expect(result).to.deep.equal({ ok: true });
        expect(bodies[0].contents).to.deep.equal([
            { role: 'user', parts: [{ text: 'Evaluate this response.' }] }
        ]);
        expect(bodies[0].generationConfig.responseMimeType).to.equal('application/json');
    });

    it('combines answer text parts without including thought parts', () => {
        expect(MixGoogle.extractMessage({ candidates: [{ content: { parts: [
            { thought: true, text: 'Internal analysis' },
            { text: '{"ok":' },
            { text: 'true}' }
        ] } }] })).to.equal('{"ok":true}');
    });
});
