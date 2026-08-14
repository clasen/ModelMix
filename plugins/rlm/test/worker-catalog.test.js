const { expect } = require('chai');
const { MixCustom, ModelMix } = require('../../../index.js');
const { createWorkerCatalog } = require('..');

function workerModel(secret = 'worker-secret') {
    return ModelMix.new().attach('worker-model', new MixCustom({
        config: { apiKey: secret, url: 'https://private-provider.invalid' }
    }));
}

describe('RLM worker catalog', () => {
    it('exposes decision metadata without models, providers, or credentials', () => {
        const model = workerModel();
        const catalog = createWorkerCatalog({
            expert: {
                model,
                intelligence: 5,
                cost: 4,
                speed: 2,
                description: 'Complex synthesis'
            },
            fast: {
                model: workerModel('another-secret'),
                intelligence: 1,
                cost: 1,
                speed: 5,
                description: 'Extraction and classification'
            }
        });

        expect(catalog.get('expert')).to.equal(model);
        expect(catalog.manifest).to.deep.equal({
            expert: {
                intelligence: 5,
                cost: 4,
                speed: 2,
                description: 'Complex synthesis'
            },
            fast: {
                intelligence: 1,
                cost: 1,
                speed: 5,
                description: 'Extraction and classification'
            }
        });
        const serialized = JSON.stringify(catalog.manifest);
        expect(serialized).to.not.include('worker-secret');
        expect(serialized).to.not.include('private-provider');
        expect(serialized).to.not.include('models');
    });

    it('rejects invalid workers and unknown selections', () => {
        expect(() => createWorkerCatalog({})).to.throw('non-empty');
        expect(() => createWorkerCatalog({
            invalid: {
                model: {},
                intelligence: 1,
                cost: 1,
                speed: 1,
                description: 'Invalid model'
            }
        })).to.throw('ModelMix instance');
        const catalog = createWorkerCatalog({
            valid: {
                model: workerModel(),
                intelligence: 1,
                cost: 1,
                speed: 1,
                description: 'Valid worker'
            }
        });
        expect(() => catalog.get('missing')).to.throw('Unknown RLM worker');
    });

    it('represents the inherited parent chain without exposing a model object', () => {
        const catalog = createWorkerCatalog({
            parent: {
                useParent: true,
                intelligence: 3,
                cost: 2,
                speed: 3,
                description: 'Use the current ModelMix chain'
            }
        });

        expect(catalog.get('parent')).to.equal(undefined);
        expect(catalog.manifest.parent).to.deep.equal({
            intelligence: 3,
            cost: 2,
            speed: 3,
            description: 'Use the current ModelMix chain'
        });
        expect(() => createWorkerCatalog({
            invalid: {
                model: workerModel(),
                useParent: true,
                intelligence: 1,
                cost: 1,
                speed: 1,
                description: 'Ambiguous worker'
            }
        })).to.throw('exactly one of model or useParent');
    });
});
