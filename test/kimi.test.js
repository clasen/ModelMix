const { expect } = require('chai');
const { ModelMix, MixTogether } = require('../index.js');

describe('Kimi Model Registration Tests', () => {
    it('should register Together Kimi K2.7 Code by default', () => {
        const model = ModelMix.new();
        model.kimiK27Code();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('moonshotai/Kimi-K2.7-Code');
        expect(model.models[0].provider).to.be.instanceOf(MixTogether);
    });
});
