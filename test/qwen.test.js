const { expect } = require('chai');
const { ModelMix } = require('../index.js');

describe('Qwen Model Registration Tests', () => {
    it('should register Fireworks Qwen 3.6 Plus by default', () => {
        const model = ModelMix.new();
        model.qwen36plus({ mix: { fireworks: true, together: false } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('accounts/fireworks/models/qwen3p6-plus');
    });

    it('should register Together Qwen 3.6 Plus when together mix is enabled', () => {
        const model = ModelMix.new();
        model.qwen36plus({ mix: { fireworks: false, openrouter: false, together: true } });

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('Qwen/Qwen3.6-Plus');
    });
});
