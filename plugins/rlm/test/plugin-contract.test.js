const { expect } = require('chai');
const { MixCustom, ModelMix } = require('../../../index.js');
const { RlmLimitError, rlm } = require('..');

function createProvider(handler) {
    const provider = new MixCustom();
    provider.create = handler;
    return provider;
}

function baseOptions(overrides = {}) {
    const workerModel = ModelMix.new().attach('worker', createProvider(async () => ({
        message: 'worker',
        toolCalls: []
    })));
    return {
        maxDepth: 0,
        variables: { input: 'hidden input' },
        workers: {
            worker: {
                model: workerModel,
                intelligence: 1,
                cost: 1,
                speed: 1,
                description: 'Test worker'
            }
        },
        limits: {
            maxQueryBytes: 1024,
            sandboxMemoryBytes: 1024 * 1024,
            maxConcurrentQueries: 1,
            maxCalls: 5,
            maxOutputBytes: 1024,
            maxGeneratedTokens: 100,
            maxWallTimeMs: 1000
        },
        sandbox: {
            async execute() {
                return 'done';
            }
        },
        ...overrides
    };
}

function plannerModel(plannerMessage, options = baseOptions()) {
    return ModelMix.new()
        .attach('planner', createProvider(async () => ({
            message: plannerMessage,
            toolCalls: []
        })))
        .use(rlm(options))
        .addText('Plan this operation.');
}

describe('RLM plugin contract', () => {
    it('fails at registration when required policy is absent or invalid', () => {
        expect(() => rlm()).to.throw('maxDepth');
        expect(() => rlm(baseOptions({ maxDepth: -1 }))).to.throw('maxDepth');
        expect(() => rlm(baseOptions({ variables: null }))).to.throw('variables');
        expect(() => rlm(baseOptions({ sandbox: {} }))).to.throw('sandbox');
        expect(() => rlm(baseOptions({
            limits: { ...baseOptions().limits, maxCalls: undefined }
        }))).to.throw('limits.maxCalls');
    });

    it('rejects streaming and malformed planner programs explicitly', async () => {
        let streamFailure;
        try {
            await plannerModel('(async () => "ok")()').stream(() => {});
        } catch (error) {
            streamFailure = error;
        }
        expect(streamFailure).to.be.instanceOf(Error);
        expect(streamFailure.message).to.include('streaming is not supported');

        let syntaxFailure;
        try {
            await plannerModel('```js\n(async () => "bad")()\n```').raw();
        } catch (error) {
            syntaxFailure = error;
        }
        expect(syntaxFailure).to.be.instanceOf(SyntaxError);
        expect(syntaxFailure.message).to.include('Markdown fences');
        expect(syntaxFailure.rlm.terminationReason).to.equal('error');
    });

    it('enforces wall time and attaches limit diagnostics to the error', async () => {
        const options = baseOptions({
            limits: { ...baseOptions().limits, maxWallTimeMs: 20 },
            sandbox: {
                execute() {
                    return new Promise(() => {});
                }
            }
        });
        let failure;
        try {
            await plannerModel('(async () => "slow")()', options).raw();
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(RlmLimitError);
        expect(failure.limit).to.equal('maxWallTimeMs');
        expect(failure.rlm.terminationReason).to.equal('limit:maxWallTimeMs');
    });

    it('preserves message, block, JSON, and raw caller contracts', async () => {
        const options = baseOptions({
            sandbox: {
                async execute() {
                    return { answer: 'ok' };
                }
            }
        });
        const createModel = () => plannerModel('(async () => ({ answer: "ok" }))()', options);

        expect(await createModel().message()).to.equal('{"answer":"ok"}');
        expect(await createModel().block()).to.equal('{"answer":"ok"}');
        expect(await createModel().json({ answer: '' })).to.deep.equal({ answer: 'ok' });
        expect(await createModel().raw()).to.deep.include({ message: '{"answer":"ok"}' });
    });

    it('can route a named worker through the inherited parent model chain', async () => {
        const requests = [];
        const provider = createProvider(async request => {
            requests.push(request);
            return {
                message: requests.length === 1
                    ? '(async () => "planned")()'
                    : `parent:${request.options.messages[0].content}`,
                toolCalls: []
            };
        });
        const model = ModelMix.new()
            .attach('parent', provider)
            .use(rlm({
                maxDepth: 0,
                workers: {
                    parent: {
                        useParent: true,
                        intelligence: 3,
                        cost: 2,
                        speed: 3,
                        description: 'Current parent chain'
                    }
                },
                limits: baseOptions().limits,
                sandbox: {
                    execute({ query }) {
                        return query({
                            worker: 'parent',
                            system: 'Process this fragment.',
                            message: 'payload'
                        });
                    }
                }
            }))
            .addText('Plan this operation.');

        expect(await model.message()).to.equal('parent:payload');
        expect(requests).to.have.length(2);
        expect(requests[1].config.system).to.equal('Process this fragment.');
    });

    it('supports an abstract task without document input', async () => {
        const options = baseOptions({
            variables: undefined,
            sandbox: {
                execute({ variables }) {
                    return { externalVariables: Object.keys(variables).length };
                }
            }
        });

        expect(await plannerModel('(async () => ({ externalVariables: 0 }))()', options)
            .json({ externalVariables: 0 })).to.deep.equal({
            externalVariables: 0
        });
    });
});
