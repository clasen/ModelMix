const { expect } = require('chai');
const { ModelMix } = require('../index.js');

describe('GLM Model Registration Tests', () => {
    it('should register Together GLM 5.2 by default', () => {
        const model = ModelMix.new();
        model.GLM52();

        expect(model.models).to.have.length(1);
        expect(model.models[0].key).to.equal('zai-org/GLM-5.2');
    });
});
