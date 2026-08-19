const { expect } = require('chai');

const { ModelMix } = require('../index.js');
const { listChainModelShortcuts } = require('../lib/model-chain');

describe('model chain catalog', () => {
    it('contains only implemented ModelMix shortcuts', () => {
        for (const shortcut of listChainModelShortcuts()) {
            expect(ModelMix.prototype[shortcut], shortcut).to.be.a('function');
        }
    });
});
