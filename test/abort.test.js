const { expect } = require('chai');
const { EventEmitter } = require('events');
const sinon = require('sinon');
const {
    MixCustom,
    MixModeration,
    MixOpenAI,
    ModelMix
} = require('../index.js');
const createOpenAIProviders = require('../lib/providers/openai');
const { rejectsAnthropicSamplingParams } = require('../lib/providers/anthropic');
const {
    fetchBinaryResponse,
    fetchJsonResponse,
    fetchStreamResponse
} = require('../http-client');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('Expected promise to reject.');
}

function createProvider(handler) {
    const provider = new MixCustom();
    provider.create = handler;
    return provider;
}

function createModel(handler, config = {}) {
    return ModelMix.new({
        config: {
            bottleneck: { maxConcurrent: 8, minTime: 0 },
            ...config
        }
    }).attach('custom', createProvider(handler)).addText('test');
}

describe('AbortSignal execution contract', () => {
    if (global.setupTestHooks) global.setupTestHooks();

    it('passes the direct signal through every terminal method without storing it', async () => {
        const controller = new AbortController();
        const cases = [
            ['message', model => model.message(controller.signal), 'plain'],
            ['raw', model => model.raw(controller.signal), 'plain'],
            ['stream', model => model.stream(() => {}, controller.signal), 'plain'],
            ['block', model => model.block({}, controller.signal), '```plain```'],
            ['json', model => model.json(null, {}, {}, controller.signal), '{"ok":true}'],
            ['execute', model => model.execute({ signal: controller.signal }), 'plain']
        ];

        for (const [, invoke, message] of cases) {
            let providerRequest;
            const model = createModel(async request => {
                providerRequest = request;
                return { message, toolCalls: [] };
            });

            await invoke(model);

            expect(providerRequest.signal).to.equal(controller.signal);
            expect(providerRequest.config).to.not.have.property('signal');
            expect(providerRequest.options).to.not.have.property('signal');
            expect(model).to.not.have.property('signal');
            expect(model.config).to.not.have.property('signal');
            expect(model.options).to.not.have.property('signal');
        }
    });

    it('rejects invalid and misplaced signals before provider work starts', async () => {
        const signal = new AbortController().signal;
        expect(() => ModelMix.new({ config: { signal } })).to.throw(TypeError, 'config.signal');
        expect(() => ModelMix.new({ options: { signal } })).to.throw(TypeError, 'options.signal');
        expect(() => new MixCustom({ config: { signal } })).to.throw(TypeError, 'config.signal');
        expect(() => new MixCustom({ options: { signal } })).to.throw(TypeError, 'options.signal');

        let providerCalls = 0;
        const model = createModel(async () => {
            providerCalls += 1;
            return { message: 'unexpected', toolCalls: [] };
        });

        expect(await rejection(model.message({}))).to.be.instanceOf(TypeError);
        expect(await rejection(model.execute({ config: { signal } }))).to.be.instanceOf(TypeError);
        expect(await rejection(model.execute({ options: { signal } }))).to.be.instanceOf(TypeError);
        expect(providerCalls).to.equal(0);

        const pluginModel = createModel(async () => {
            providerCalls += 1;
            return { message: 'unexpected', toolCalls: [] };
        }).use({
            name: 'misplaced-signal',
            execute(context, next) {
                context.request.options.signal = signal;
                return next();
            }
        });
        const pluginError = await rejection(pluginModel.message());
        expect(pluginError).to.be.instanceOf(TypeError);
        expect(pluginError.message).to.include('options.signal');
        expect(providerCalls).to.equal(0);
    });

    it('preserves a pre-aborted custom reason and leaves execution state untouched', async () => {
        const reason = new Error('cancel before start');
        const controller = new AbortController();
        controller.abort(reason);
        let providerCalls = 0;
        const model = createModel(async () => {
            providerCalls += 1;
            return { message: 'unexpected', toolCalls: [] };
        });
        const originalMessages = model.messages.map(message => ({ ...message }));

        expect(await rejection(model.message(controller.signal))).to.equal(reason);
        expect(providerCalls).to.equal(0);
        expect(model.lastRaw).to.equal(null);
        expect(model.messages).to.deep.equal(originalMessages);
    });

    it('aborts remote image preparation without mutating messages or invoking a provider', async () => {
        const reason = new Error('stop image download');
        const controller = new AbortController();
        const fetchStarted = deferred();
        let fetchedSignal;
        sinon.stub(global, 'fetch').callsFake((_url, { signal }) => {
            fetchedSignal = signal;
            fetchStarted.resolve();
            return new Promise((_, rejectPromise) => {
                signal.addEventListener('abort', () => rejectPromise(signal.reason), { once: true });
            });
        });
        let providerCalls = 0;
        const model = ModelMix.new({ config: { bottleneck: { maxConcurrent: 1, minTime: 0 } } })
            .attach('custom', createProvider(async () => {
                providerCalls += 1;
                return { message: 'unexpected', toolCalls: [] };
            }))
            .addImageFromUrl('https://example.test/image.png')
            .addText('describe');
        const originalMessages = JSON.parse(JSON.stringify(model.messages));

        const execution = model.raw(controller.signal);
        await fetchStarted.promise;
        controller.abort(reason);

        expect(await rejection(execution)).to.equal(reason);
        expect(fetchedSignal).to.equal(controller.signal);
        expect(providerCalls).to.equal(0);
        expect(model.messages).to.deep.equal(originalMessages);
    });

    it('aborts an in-flight custom provider without falling back or recording its late result', async () => {
        const pending = deferred();
        const primaryStarted = deferred();
        const reason = new Error('stop provider');
        const controller = new AbortController();
        let primaryCalls = 0;
        let fallbackCalls = 0;
        const model = ModelMix.new({ config: { bottleneck: { maxConcurrent: 2, minTime: 0 } } })
            .attach('primary', createProvider(async () => {
                primaryCalls += 1;
                primaryStarted.resolve();
                return pending.promise;
            }))
            .attach('fallback', createProvider(async () => {
                fallbackCalls += 1;
                return { message: 'fallback', toolCalls: [] };
            }))
            .addText('test');

        const execution = model.raw(controller.signal);
        await primaryStarted.promise;
        controller.abort(reason);

        expect(await rejection(execution)).to.equal(reason);
        pending.resolve({ message: 'late', toolCalls: [] });
        await new Promise(resolve => setImmediate(resolve));
        expect(primaryCalls).to.equal(1);
        expect(fallbackCalls).to.equal(0);
        expect(model.lastRaw).to.equal(null);
    });

    it('rejects while queued and prevents the queued provider invocation', async () => {
        const first = deferred();
        const firstStarted = deferred();
        const reason = new Error('leave queue');
        const controller = new AbortController();
        let providerCalls = 0;
        const model = createModel(async () => {
            providerCalls += 1;
            if (providerCalls === 1) {
                firstStarted.resolve();
                return first.promise;
            }
            return { message: 'unexpected', toolCalls: [] };
        }, {
            max_history: -1,
            bottleneck: { maxConcurrent: 1, minTime: 0 }
        });

        const running = model.raw();
        await firstStarted.promise;
        const queued = model.raw(controller.signal);
        controller.abort(reason);

        expect(await rejection(queued)).to.equal(reason);
        first.resolve({ message: 'first', toolCalls: [] });
        await running;
        await new Promise(resolve => setImmediate(resolve));
        expect(providerCalls).to.equal(1);
    });

    it('aborts retry backoff without retrying or falling back', async () => {
        const reason = new Error('stop retry');
        const controller = new AbortController();
        let primaryCalls = 0;
        let fallbackCalls = 0;
        const model = ModelMix.new({
            config: {
                bottleneck: { maxConcurrent: 1, minTime: 0 },
                retry: {
                    enabled: true,
                    retries: 2,
                    baseDelayMs: 200,
                    maxDelayMs: 200,
                    retryableStatusCodes: [429]
                }
            }
        })
            .attach('primary', createProvider(async () => {
                primaryCalls += 1;
                throw { message: 'rate limited', statusCode: 429 };
            }))
            .attach('fallback', createProvider(async () => {
                fallbackCalls += 1;
                return { message: 'fallback', toolCalls: [] };
            }))
            .addText('test');

        const execution = model.raw(controller.signal);
        await new Promise(resolve => setTimeout(resolve, 20));
        controller.abort(reason);

        expect(await rejection(execution)).to.equal(reason);
        expect(primaryCalls).to.equal(1);
        expect(fallbackCalls).to.equal(0);
    });

    it('isolates signals across concurrent executions on one instance', async () => {
        const first = deferred();
        const second = deferred();
        const started = deferred();
        const controllerA = new AbortController();
        const controllerB = new AbortController();
        const reason = new Error('only A');
        const requests = [];
        const model = createModel(async request => {
            requests.push(request);
            if (requests.length === 2) started.resolve();
            return requests.length === 1 ? first.promise : second.promise;
        }, {
            max_history: -1,
            bottleneck: { maxConcurrent: 2, minTime: 0 }
        });

        const executionA = model.raw(controllerA.signal);
        const executionB = model.raw(controllerB.signal);
        await started.promise;
        controllerA.abort(reason);
        second.resolve({ message: 'B', toolCalls: [] });

        expect(await rejection(executionA)).to.equal(reason);
        expect((await executionB).message).to.equal('B');
        first.resolve({ message: 'late A', toolCalls: [] });
        await new Promise(resolve => setImmediate(resolve));
        expect(requests.map(request => request.signal)).to.deep.equal([
            controllerA.signal,
            controllerB.signal
        ]);
        expect(model.lastRaw.message).to.equal('B');
    });

    it('exposes the signal to plugins and inherits it in child invocations', async () => {
        const controller = new AbortController();
        const contexts = [];
        let providerSignal;
        const provider = createProvider(async request => {
            providerSignal = request.signal;
            return { message: 'child', toolCalls: [] };
        });
        const model = ModelMix.new({ config: { bottleneck: { maxConcurrent: 2, minTime: 0 } } })
            .attach('custom', provider)
            .use({
                name: 'child',
                execute(context, next) {
                    contexts.push(context);
                    if (context.execution.depth > 0) return next();
                    return context.invoke({
                        messages: [{ role: 'user', content: 'child prompt' }],
                        history: false
                    });
                }
            })
            .addText('parent prompt');

        expect((await model.raw(controller.signal)).message).to.equal('child');
        expect(contexts).to.have.length(2);
        expect(contexts.every(context => context.signal === controller.signal)).to.equal(true);
        expect(contexts.every(context => !Object.hasOwn(context.request.config, 'signal'))).to.equal(true);
        expect(contexts.every(context => !Object.hasOwn(context.request.options, 'signal'))).to.equal(true);
        expect(providerSignal).to.equal(controller.signal);
    });

    it('passes the signal to local and MCP tools and preserves abort through tool handling', async () => {
        const controller = new AbortController();
        let localSignal;
        const model = ModelMix.new().addTool({
            name: 'local',
            description: 'local tool',
            inputSchema: { type: 'object' }
        }, async (_args, signal) => {
            localSignal = signal;
            return 'local result';
        });

        const localResult = await model.processToolCalls([
            { id: 'local-1', name: 'local', input: {} }
        ], controller.signal);
        expect(localSignal).to.equal(controller.signal);
        expect(localResult[0].content).to.equal('local result');

        let mcpArguments;
        model.toolClient.remote = {
            async callTool(...args) {
                mcpArguments = args;
                return { content: [{ type: 'text', text: 'remote result' }] };
            }
        };
        const remoteResult = await model.processToolCalls([
            { id: 'remote-1', name: 'remote', input: { value: 1 } }
        ], controller.signal);
        expect(remoteResult[0].content).to.equal('remote result');
        expect(mcpArguments[2]).to.deep.equal({ signal: controller.signal });

        const reason = new Error('stop local tool');
        const abortController = new AbortController();
        const toolStarted = deferred();
        let providerCalls = 0;
        const toolModel = createModel(async () => {
            providerCalls += 1;
            return {
                message: '',
                toolCalls: [{ id: 'slow-1', name: 'slow', input: {} }]
            };
        }, { max_history: -1 }).addTool({
            name: 'slow',
            description: 'slow tool',
            inputSchema: { type: 'object' }
        }, async (_args, signal) => {
            toolStarted.resolve(signal);
            return new Promise((_, rejectPromise) => {
                signal.addEventListener('abort', () => rejectPromise(signal.reason), { once: true });
            });
        });
        const originalMessages = JSON.parse(JSON.stringify(toolModel.messages));
        const execution = toolModel.raw(abortController.signal);
        expect(await toolStarted.promise).to.equal(abortController.signal);
        abortController.abort(reason);

        expect(await rejection(execution)).to.equal(reason);
        expect(providerCalls).to.equal(1);
        expect(toolModel.messages).to.deep.equal(originalMessages);
    });

    it('forwards the signal through every fetch helper without serializing it', async () => {
        const controller = new AbortController();
        const calls = [];
        sinon.stub(global, 'fetch').callsFake(async (_url, init) => {
            calls.push(init);
            if (calls.length === 1) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    text: async () => '{"ok":true}'
                };
            }
            if (calls.length === 2) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
                };
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers(),
                body: new ReadableStream({
                    start(streamController) {
                        streamController.close();
                    }
                })
            };
        });

        await fetchJsonResponse('https://example.test/json', { body: '{}', signal: controller.signal });
        await fetchBinaryResponse('https://example.test/binary', { signal: controller.signal });
        const stream = await fetchStreamResponse('https://example.test/stream', { body: '{}', signal: controller.signal });
        stream.data.resume();

        expect(calls).to.have.length(3);
        expect(calls.every(call => call.signal === controller.signal)).to.equal(true);
        expect(JSON.parse(calls[0].body)).to.not.have.property('signal');
    });

    it('keeps the signal outside a built-in provider payload', async () => {
        const controller = new AbortController();
        const reason = new Error('stop OpenAI request');
        const fetchStarted = deferred();
        let request;
        sinon.stub(global, 'fetch').callsFake((_url, init) => {
            request = init;
            fetchStarted.resolve();
            return new Promise((_, rejectPromise) => {
                init.signal.addEventListener('abort', () => rejectPromise(init.signal.reason), { once: true });
            });
        });
        const model = ModelMix.new({ config: { bottleneck: { maxConcurrent: 1, minTime: 0 } } })
            .gpt51()
            .addText('test');

        const execution = model.raw(controller.signal);
        await fetchStarted.promise;
        expect(request.signal).to.equal(controller.signal);
        expect(JSON.parse(request.body)).to.not.have.property('signal');
        controller.abort(reason);
        expect(await rejection(execution)).to.equal(reason);
    });

    it('aborts the realtime WebSocket and preserves the custom reason', async () => {
        const created = deferred();
        class FakeWebSocket extends EventEmitter {
            constructor() {
                super();
                this.readyState = 0;
                this.terminated = false;
                created.resolve(this);
                setImmediate(() => {
                    if (this.terminated) return;
                    this.readyState = 1;
                    this.emit('open');
                });
            }

            send() {}

            close() {
                this.terminate();
            }

            terminate() {
                if (this.terminated) return;
                this.terminated = true;
                this.readyState = 3;
                this.emit('close');
            }
        }
        const wsPath = require.resolve('ws');
        const originalWebSocket = require.cache[wsPath].exports;
        require.cache[wsPath].exports = FakeWebSocket;
        try {
            const { MixOpenAIWebSocket } = createOpenAIProviders({
                ModelMix,
                MixCustom,
                MixOpenAI,
                MixModeration,
                rejectsAnthropicSamplingParams
            });
            const provider = new MixOpenAIWebSocket({
                config: {
                    apiKey: 'test-key',
                    realtimeUrl: 'ws://example.test',
                    websocketTimeoutMs: 2000
                }
            });
            const model = ModelMix.new({ config: { bottleneck: { maxConcurrent: 1, minTime: 0 } } })
                .attach('realtime-test', provider)
                .addText('test');
            const controller = new AbortController();
            const reason = new Error('close realtime');
            const execution = model.raw(controller.signal);
            const socket = await created.promise;
            controller.abort(reason);
            expect(await rejection(execution)).to.equal(reason);
            expect(socket.terminated).to.equal(true);
        } finally {
            require.cache[wsPath].exports = originalWebSocket;
        }
    });
});
