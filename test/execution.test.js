const { expect } = require('chai');
const { ModelMix, MixCustom } = require('../index.js');

const TOOL = {
    name: 'ping',
    description: 'Ping.',
    inputSchema: { type: 'object', properties: {} }
};

function toolCall(id = 'call_ping') {
    return { id, type: 'function', function: { name: 'ping', arguments: '{}' } };
}

class ToolThenAnswer extends MixCustom {
    constructor({ delayMs = 0, alwaysTool = false, ...args } = {}) {
        super(args);
        this.delayMs = delayMs;
        this.alwaysTool = alwaysTool;
        this.calls = 0;
    }

    async create({ options }) {
        this.calls += 1;
        if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
        const answered = options.messages.some(message => message.role === 'tool');
        if (this.alwaysTool || !answered) {
            return { message: '', toolCalls: [toolCall(`call_${this.calls}`)], tokens: { input: 1, output: 1 } };
        }
        return { message: 'done', toolCalls: [], tokens: { input: 1, output: 1 } };
    }
}

class Answer extends MixCustom {
    async create() {
        return { message: 'inner', toolCalls: [], tokens: { input: 1, output: 1 } };
    }
}

function withTimeout(promise, ms = 2000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function limitedModel(maxConcurrent = 1) {
    return ModelMix.new({ config: { bottleneck: { maxConcurrent, minTime: 0 } } });
}

describe('Execution pipeline', () => {
    describe('tool rounds and the rate limiter', () => {
        it('completes a tool round with maxConcurrent 1', async () => {
            const model = limitedModel(1)
                .attach('fake', new ToolThenAnswer())
                .addTool(TOOL, async () => 'pong')
                .addText('Ping it');

            expect(await withTimeout(model.message())).to.equal('done');
        });

        it('completes concurrent tool rounds that fill every limiter slot', async () => {
            const base = limitedModel(2).attach('fake', new ToolThenAnswer({ delayMs: 10 }));
            const runs = [0, 1].map(() => base.new()
                .addTool(TOOL, async () => 'pong')
                .addText('Ping it')
                .message());

            expect(await withTimeout(Promise.all(runs))).to.deep.equal(['done', 'done']);
        });

        it('lets a tool callback call a model that shares the limiter', async () => {
            const model = limitedModel(1).attach('fake', new ToolThenAnswer());
            const inner = model.new({ mix: {} });
            inner.models = [{ key: 'answer', provider: new Answer() }];
            let innerMessage;
            model
                .addTool(TOOL, async () => {
                    innerMessage = await inner.new().addText('Inner question').message();
                    return innerMessage;
                })
                .addText('Ping it');

            expect(inner.limiter).to.equal(model.limiter);
            expect(await withTimeout(model.message())).to.equal('done');
            expect(innerMessage).to.equal('inner');
        });

        it('stops after config.max_tool_rounds rounds of tool calls', async () => {
            const provider = new ToolThenAnswer({ alwaysTool: true });
            let toolRuns = 0;
            const model = ModelMix.new({ config: { max_tool_rounds: 2, bottleneck: { minTime: 0 } } })
                .attach('fake', provider)
                .addTool(TOOL, async () => {
                    toolRuns += 1;
                    return 'pong';
                })
                .addText('Loop forever');

            const error = await withTimeout(model.message()).then(() => null, caught => caught);
            expect(error).to.be.instanceOf(Error);
            expect(error.code).to.equal('MAX_TOOL_ROUNDS');
            expect(error.message).to.include('max_tool_rounds = 2');
            expect(toolRuns).to.equal(2);
            expect(provider.calls).to.equal(3);
        });

        it('accepts max_tool_rounds -1 as unlimited', async () => {
            const model = ModelMix.new({ config: { max_tool_rounds: -1, bottleneck: { minTime: 0 } } })
                .attach('fake', new ToolThenAnswer())
                .addTool(TOOL, async () => 'pong')
                .addText('Ping it');

            expect(await withTimeout(model.message())).to.equal('done');
        });
    });

    describe('shared limiter', () => {
        it('shares the parent limiter with new() unless bottleneck is overridden', () => {
            const base = ModelMix.new();
            expect(base.new().limiter).to.equal(base.limiter);
            expect(base.new({ config: { max_history: 2 } }).limiter).to.equal(base.limiter);

            const own = base.new({ config: { bottleneck: { maxConcurrent: 1 } } });
            expect(own.limiter).to.not.equal(base.limiter);
            expect(own.new().limiter).to.equal(own.limiter);
        });

        it('shares the parent limiter with plugin child invocations', async () => {
            let childLimiter;
            const model = limitedModel(1)
                .attach('answer', new Answer())
                .use({
                    name: 'child-probe',
                    async execute(context) {
                        const result = await context.invoke({
                            messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
                            plugins: 'none'
                        });
                        return result;
                    }
                })
                .addText('Hi');
            const originalExecute = ModelMix.prototype._execute;
            try {
                ModelMix.prototype._execute = function (...args) {
                    if (this !== model) childLimiter = this.limiter;
                    return originalExecute.apply(this, args);
                };
                await withTimeout(model.raw());
            } finally {
                ModelMix.prototype._execute = originalExecute;
            }
            expect(childLimiter).to.equal(model.limiter);
        });
    });

    describe('per-request stream callbacks', () => {
        class DelayedStream extends MixCustom {
            async create({ options }) {
                const text = options.messages.at(-1).content[0].text;
                const onStream = require('../lib/stream-context').currentStreamCallback();
                for (const delta of text.split('')) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                    onStream?.({ delta, message: '', response: {} });
                }
                return { message: text, toolCalls: [], tokens: { input: 1, output: 1 } };
            }
        }

        it('keeps concurrent streams on shared providers separate', async () => {
            const base = ModelMix.new({ config: { bottleneck: { maxConcurrent: 2, minTime: 0 } } })
                .attach('fake', new DelayedStream());
            const first = [];
            const second = [];
            await Promise.all([
                base.new().addText('aaaa').stream(({ delta }) => first.push(delta)),
                base.new().addText('bbbb').stream(({ delta }) => second.push(delta))
            ]);

            expect(first.join('')).to.equal('aaaa');
            expect(second.join('')).to.equal('bbbb');
            expect(base.models[0].provider.streamCallback).to.equal(null);
        });
    });
});
