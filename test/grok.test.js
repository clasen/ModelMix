const { expect } = require('chai');
const { ModelMix } = require('../index.js');

describe('Grok Model Registration Tests', () => {
    const grokModels = [
        { method: 'grok43', key: 'grok-4.3' },
        { method: 'grok420multiAgent', key: 'grok-4.20-multi-agent-0309' },
        { method: 'grok420think', key: 'grok-4.20-0309-reasoning' },
        { method: 'grok420', key: 'grok-4.20-0309-non-reasoning' }
    ];

    for (const grokModel of grokModels) {
        it(`should register ${grokModel.key} with ${grokModel.method}()`, () => {
            const model = ModelMix.new();
            model[grokModel.method]();

            expect(model.models).to.have.length(1);
            expect(model.models[0].key).to.equal(grokModel.key);
        });
    }
});
