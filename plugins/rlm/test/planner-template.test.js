const { expect } = require('chai');
const { MixCustom, ModelMix } = require('../../../index.js');
const { createPlannerInvocation } = require('..');

function createProvider(handler) {
    const provider = new MixCustom();
    provider.create = handler;
    return provider;
}

describe('RLM planner Markdown template', () => {
    const limits = {
        maxQueryBytes: 64,
        sandboxMemoryBytes: 64 * 1024 * 1024,
        maxConcurrentQueries: 4,
        maxCalls: 20,
        maxOutputBytes: 1024 * 1024,
        maxGeneratedTokens: 10000,
        maxWallTimeMs: 30000
    };
    const workerManifest = {
        translator: {
            intelligence: 3,
            cost: 2,
            speed: 4,
            description: 'Translate external text'
        }
    };

    it('renders the planner Markdown through child assign() and its relative include', async () => {
        const task = 'Translate the external book chapter by chapter.';
        const variables = {
            chapters: [{
                heading: 'Hidden chapter title',
                content: 'Hidden paragraph one.\n\nHidden paragraph two.'
            }]
        };
        let plannerRequest;
        const model = ModelMix.new()
            .attach('planner', createProvider(async request => {
                plannerRequest = request;
                return { message: '(async () => "translated")()', toolCalls: [] };
            }))
            .use({
                name: 'rlm',
                execute(context) {
                    return context.invoke(createPlannerInvocation({
                        task,
                        variables,
                        limits,
                        workerManifest
                    }));
                }
            })
            .addText('Original request intercepted by RLM.');

        const result = await model.raw();

        expect(result.message).to.equal('(async () => "translated")()');
        expect(plannerRequest.config.system).to.include('# Recursive Language Model Planner');
        expect(plannerRequest.config.system).to.include('## External variable manifest');
        expect(plannerRequest.config.system).to.include('"items": 1');
        expect(plannerRequest.config.system).to.include('"maxQueryBytes": 64');
        expect(plannerRequest.config.system).to.include('## Worker catalog');
        expect(plannerRequest.config.system).to.include('"translator"');
        expect(plannerRequest.config.system).to.include('## Output requirements');
        expect(plannerRequest.config.system).to.include('"mode": "raw"');
        expect(plannerRequest.config.system).to.include('## Required processing rules');
        expect(plannerRequest.config.system).to.include('at most 4 active queries');
        expect(plannerRequest.options.messages).to.deep.equal([{
            role: 'user',
            content: [{ type: 'text', text: task }]
        }]);
        expect(plannerRequest.config.system).to.not.include(variables.chapters[0].heading);
        expect(plannerRequest.config.system).to.not.include(variables.chapters[0].content);
    });

    it('keeps EJS-looking variable paths as data instead of rendering them twice', async () => {
        const marker = '<%- leakedTemplateValue %>';
        let plannerSystem;
        const model = ModelMix.new()
            .attach('planner', createProvider(async ({ config }) => {
                plannerSystem = config.system;
                return { message: '(async () => null)()', toolCalls: [] };
            }))
            .use({
                name: 'rlm',
                execute(context) {
                    return context.invoke(createPlannerInvocation({
                        task: 'Inspect the external variable.',
                        variables: { [marker]: 'hidden payload' },
                        limits,
                        workerManifest
                    }));
                }
            })
            .assign({ leakedTemplateValue: 'must not execute' })
            .addText('parent');

        await model.raw();

        expect(plannerSystem).to.include(marker);
        expect(plannerSystem).to.not.include('must not execute');
        expect(plannerSystem).to.not.include('hidden payload');
    });

    it('fails before provider execution when planner template data is incomplete', async () => {
        let providerCalls = 0;
        const model = ModelMix.new()
            .attach('planner', createProvider(async () => {
                providerCalls += 1;
                return { message: 'unexpected', toolCalls: [] };
            }))
            .use({
                name: 'rlm',
                execute(context) {
                    const invocation = createPlannerInvocation({
                        task: 'Plan this task.',
                        variables: { input: 'hidden' },
                        limits,
                        workerManifest
                    });
                    delete invocation.assign.planningHints;
                    return context.invoke(invocation);
                }
            })
            .addText('parent');

        let failure;
        try {
            await model.raw();
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(Error);
        expect(failure.message).to.include('planningHints');
        expect(providerCalls).to.equal(0);
    });
});
