const { expect } = require('chai');
const path = require('path');
const { MixCustom, ModelMix } = require('../index.js');

function createProvider(handler = async () => ({ message: 'provider', toolCalls: [] })) {
    const provider = new MixCustom();
    provider.create = handler;
    return provider;
}

describe('ModelMix plugins', () => {
    it('keeps registration instance-scoped and lets new instances inherit plugins without history', () => {
        const plugin = { name: 'metrics', execute: (_context, next) => next() };
        const parent = ModelMix.new().use(plugin).addText('parent history');
        const sibling = ModelMix.new();
        const child = parent.new();

        expect(parent.plugins).to.deep.equal([plugin]);
        expect(child.plugins).to.deep.equal([plugin]);
        expect(child.plugins).to.not.equal(parent.plugins);
        expect(child.messages).to.deep.equal([]);
        expect(sibling.plugins).to.deep.equal([]);
    });

    it('runs middleware in registration order and allows request transforms', async () => {
        let providerRequest;
        const provider = createProvider(async request => {
            providerRequest = request;
            return { message: 'done', toolCalls: [] };
        });
        const events = [];
        const model = ModelMix.new()
            .attach('custom', provider)
            .use({
                name: 'outer',
                async execute(context, next) {
                    events.push('outer:before');
                    context.request.system = 'plugin system';
                    context.request.messages[0].content[0].text = 'plugin message';
                    context.request.options.temperature = 0.25;
                    context.request.config.marker = 'plugin config';
                    const result = await next();
                    events.push('outer:after');
                    return { ...result, wrapped: true };
                }
            })
            .use({
                name: 'inner',
                async execute(_context, next) {
                    events.push('inner:before');
                    const result = await next();
                    events.push('inner:after');
                    return result;
                }
            })
            .addText('original');

        const result = await model.raw();

        expect(events).to.deep.equal([
            'outer:before',
            'inner:before',
            'inner:after',
            'outer:after'
        ]);
        expect(providerRequest.options.messages[0].content[0].text).to.equal('plugin message');
        expect(providerRequest.options.temperature).to.equal(0.25);
        expect(providerRequest.config.system).to.equal('plugin system');
        expect(providerRequest.config.marker).to.equal('plugin config');
        expect(result).to.include({ message: 'done', wrapped: true });
        expect(model.lastRaw).to.equal(result);
    });

    it('supports short-circuit results across non-streaming output modes', async () => {
        let providerCalls = 0;
        const createModel = () => ModelMix.new()
            .attach('custom', createProvider(async () => {
                providerCalls += 1;
                return { message: 'provider', toolCalls: [] };
            }))
            .use({
                name: 'short-circuit',
                async execute() {
                    return { message: '```json\n{"answer":"plugin"}\n```', source: 'plugin' };
                }
            })
            .addText('ignored');

        expect(await createModel().message()).to.include('"answer":"plugin"');
        expect(await createModel().block()).to.equal('{"answer":"plugin"}');
        expect(await createModel().json()).to.deep.equal({ answer: 'plugin' });
        expect(await createModel().raw()).to.include({ source: 'plugin' });
        expect(providerCalls).to.equal(0);
    });

    it('wraps a complete tool-call execution without rerunning middleware', async () => {
        const providerMessages = [];
        let providerCalls = 0;
        let middlewareCalls = 0;
        const provider = createProvider(async ({ options }) => {
            providerCalls += 1;
            providerMessages.push(options.messages);
            if (providerCalls === 1) {
                return {
                    message: '',
                    toolCalls: [{ id: 'tool-1', name: 'noop', input: {} }]
                };
            }
            return { message: 'tool complete', toolCalls: [] };
        });
        const model = ModelMix.new()
            .attach('custom', provider)
            .addTool({
                name: 'noop',
                description: 'Return a fixed result.',
                inputSchema: { type: 'object' }
            }, async () => 'ok')
            .use({
                name: 'transform',
                async execute(context, next) {
                    middlewareCalls += 1;
                    context.request.messages[0].content[0].text = 'transformed prompt';
                    return next();
                }
            })
            .addText('original prompt');

        expect(await model.message()).to.equal('tool complete');
        expect(middlewareCalls).to.equal(1);
        expect(providerCalls).to.equal(2);
        expect(providerMessages[0][0].content[0].text).to.equal('transformed prompt');
        expect(providerMessages[1][0].content[0].text).to.equal('transformed prompt');
        expect(providerMessages[1].some(message => message.role === 'tool')).to.equal(true);
    });

    for (const [policyName, policy, expectedPlugins] of [
        ['inherit', 'inherit', ['parent', 'alpha', 'beta']],
        ['none', 'none', []],
        ['include', { include: ['beta'] }, ['beta']],
        ['exclude', { exclude: ['parent', 'alpha'] }, ['beta']]
    ]) {
        it(`applies the ${policyName} child plugin policy and execution metadata`, async () => {
            const events = [];
            let childProviderRequest;
            const provider = createProvider(async request => {
                childProviderRequest = request;
                return { message: 'child result', toolCalls: [] };
            });
            const parentPlugin = {
                name: 'parent',
                async execute(context, next) {
                    events.push({ name: 'parent', ...context.execution });
                    if (context.execution.depth > 0) return next();
                    return context.invoke({
                        system: 'child system',
                        messages: [{ role: 'user', content: [{ type: 'text', text: 'child prompt' }] }],
                        plugins: policy
                    });
                }
            };
            const recorder = name => ({
                name,
                async execute(context, next) {
                    events.push({ name, ...context.execution });
                    return next();
                }
            });
            const model = ModelMix.new({ config: { max_history: -1 } })
                .attach('custom', provider)
                .use(parentPlugin)
                .use(recorder('alpha'))
                .use(recorder('beta'))
                .addText('parent prompt');

            const result = await model.raw();
            const childEvents = events.filter(event => event.depth === 1);

            expect(result.message).to.equal('child result');
            expect(result.execution).to.deep.include({
                parentExecutionId: events[0].executionId,
                depth: 1
            });
            expect(childEvents.map(event => event.name)).to.deep.equal(expectedPlugins);
            expect(events[0].depth).to.equal(0);
            expect(events[0].parentExecutionId).to.equal(null);
            for (const childEvent of childEvents) {
                expect(childEvent.executionId).to.equal(childEvents[0].executionId);
                expect(childEvent.parentExecutionId).to.equal(events[0].executionId);
            }
            expect(childEvents[0]?.executionId).to.not.equal(events[0].executionId);
            expect(childProviderRequest.options.messages).to.deep.equal([
                { role: 'user', content: [{ type: 'text', text: 'child prompt' }] }
            ]);
            expect(childProviderRequest.config.system).to.equal('child system');
        });
    }

    it('can invoke a child through another ModelMix worker chain', async () => {
        let parentProviderCalls = 0;
        const parentProvider = createProvider(async () => {
            parentProviderCalls += 1;
            return { message: 'parent', toolCalls: [] };
        });
        let workerRequest;
        const worker = ModelMix.new({
            options: { temperature: 0.25 },
            config: { workerPolicy: 'preserved' }
        }).attach('worker', createProvider(async request => {
            workerRequest = request;
            return {
                message: 'worker result',
                toolCalls: []
            };
        }));
        const model = ModelMix.new()
            .attach('parent', parentProvider)
            .use({
                name: 'worker-router',
                execute(context) {
                    return context.invoke({
                        model: worker,
                        messages: [{ role: 'user', content: 'worker prompt' }],
                        plugins: 'none'
                    });
                }
            })
            .addText('parent prompt');

        expect(await model.message()).to.equal('worker result');
        expect(parentProviderCalls).to.equal(0);
        expect(workerRequest.options.temperature).to.equal(0.25);
        expect(workerRequest.config.workerPolicy).to.equal('preserved');
    });

    it('renders child system files with ModelMix assign data and relative includes', async () => {
        let providerRequest;
        const model = ModelMix.new()
            .attach('custom', createProvider(async request => {
                providerRequest = request;
                return { message: 'rendered', toolCalls: [] };
            }))
            .use({
                name: 'template-child',
                execute(context) {
                    return context.invoke({
                        systemFile: path.join(__dirname, 'fixtures/system-template.txt'),
                        assign: {
                            role: '<%- mustRemainData %>',
                            language: 'English'
                        },
                        messages: [{ role: 'user', content: 'child task' }],
                        plugins: 'none'
                    });
                }
            })
            .addText('parent task');

        expect(await model.message()).to.equal('rendered');
        expect(providerRequest.config.system.trimEnd()).to.equal([
            'You are a <%- mustRemainData %>.',
            'Always respond in English.'
        ].join('\n'));
    });

    it('rejects duplicate names, invalid child history, and repeated next calls', async () => {
        const duplicate = { name: 'duplicate', execute: (_context, next) => next() };
        const model = ModelMix.new().use(duplicate);
        expect(() => model.use(duplicate)).to.throw('already registered');

        const historyModel = ModelMix.new()
            .attach('custom', createProvider())
            .use({
                name: 'history',
                execute(context) {
                    return context.invoke({ messages: [], history: true });
                }
            })
            .addText('parent');
        let historyError;
        try {
            await historyModel.raw();
        } catch (error) {
            historyError = error;
        }
        expect(historyError).to.be.instanceOf(TypeError);
        expect(historyError.message).to.include('history: false');

        const nextModel = ModelMix.new()
            .attach('custom', createProvider())
            .use({
                name: 'twice',
                async execute(_context, next) {
                    await next();
                    return next();
                }
            })
            .addText('parent');
        let nextError;
        try {
            await nextModel.raw();
        } catch (error) {
            nextError = error;
        }
        expect(nextError).to.be.instanceOf(Error);
        expect(nextError.message).to.include('multiple times');

        const conflictingSystemModel = ModelMix.new()
            .attach('custom', createProvider())
            .use({
                name: 'conflicting-system',
                execute(context) {
                    return context.invoke({
                        system: 'inline',
                        systemFile: 'system.md',
                        messages: [],
                        plugins: 'none'
                    });
                }
            })
            .addText('parent');
        let conflictingSystemError;
        try {
            await conflictingSystemModel.raw();
        } catch (error) {
            conflictingSystemError = error;
        }
        expect(conflictingSystemError).to.be.instanceOf(TypeError);
        expect(conflictingSystemError.message).to.include('only one of system or systemFile');
    });

    it('does not fall through to providers when a plugin fails', async () => {
        let providerCalls = 0;
        const model = ModelMix.new()
            .attach('custom', createProvider(async () => {
                providerCalls += 1;
                return { message: 'provider', toolCalls: [] };
            }))
            .use({
                name: 'failure',
                async execute() {
                    throw new Error('plugin failure');
                }
            })
            .addText('prompt');

        let failure;
        try {
            await model.raw();
        } catch (error) {
            failure = error;
        }
        expect(failure).to.be.instanceOf(Error);
        expect(failure.message).to.equal('plugin failure');
        expect(providerCalls).to.equal(0);
    });
});
