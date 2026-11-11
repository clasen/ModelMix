const { expect } = require('chai');
const {
    RlmLimitError,
    createQuickJsSandbox
} = require('..');

function limits(sandboxMemoryBytes = 16 * 1024 * 1024) {
    return { sandboxMemoryBytes };
}

describe('RLM QuickJS sandbox', () => {
    it('exposes only copied variables and the validated query callback', async () => {
        const sandbox = createQuickJsSandbox();
        const calls = [];
        const value = await sandbox.execute({
            code: `(async () => ({
                item: variables.items[0],
                response: await query({ worker: 'fast', system: 'Classify.', message: 'Ada' }),
                globals: {
                    process: typeof process,
                    require: typeof require,
                    fetch: typeof fetch,
                    Buffer: typeof Buffer,
                    query: typeof query
                }
            }))()`,
            variables: { items: ['external'] },
            query: async input => {
                calls.push(input);
                return 'person';
            },
            limits: limits(),
            timeoutMs: 1000
        });

        expect(value).to.deep.equal({
            item: 'external',
            response: 'person',
            globals: {
                process: 'undefined',
                require: 'undefined',
                fetch: 'undefined',
                Buffer: 'undefined',
                query: 'function'
            }
        });
        expect(calls).to.deep.equal([{
            worker: 'fast',
            system: 'Classify.',
            message: 'Ada'
        }]);
    });

    it('terminates programs that exceed their wall-time limit', async () => {
        let failure;
        try {
            await createQuickJsSandbox().execute({
                code: '(async () => { while (true) {} })()',
                variables: {},
                query: async () => '',
                limits: limits(),
                timeoutMs: 20
            });
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(RlmLimitError);
        expect(failure.limit).to.equal('maxWallTimeMs');
    });

    it('terminates an in-flight program and preserves the abort reason', async () => {
        const controller = new AbortController();
        const reason = new Error('stop sandbox');
        const execution = createQuickJsSandbox().execute({
            code: '(async () => { while (true) {} })()',
            variables: {},
            query: async () => '',
            limits: limits(),
            signal: controller.signal,
            timeoutMs: 1000
        });

        setTimeout(() => controller.abort(reason), 20);

        let failure;
        try {
            await execution;
        } catch (error) {
            failure = error;
        }
        expect(failure).to.equal(reason);
    });

    it('surfaces query failures inside the sandbox', async () => {
        const value = await createQuickJsSandbox().execute({
            code: `(async () => {
                try {
                    await query({ worker: 'fast', system: 'Classify.', message: 'Ada' });
                    return 'resolved';
                } catch (error) {
                    return error.message;
                }
            })()`,
            variables: {},
            query: async () => {
                throw new Error('worker unavailable');
            },
            limits: limits(),
            timeoutMs: 1000
        });

        expect(value).to.equal('worker unavailable');
    });

    it('terminates programs that exceed the configured sandbox memory', async () => {
        let failure;
        try {
            await createQuickJsSandbox().execute({
                code: `(() => {
                    const values = [];
                    while (true) {
                        const item = new Uint8Array(1024 * 1024);
                        for (let index = 0; index < item.length; index += 4096) item[index] = 1;
                        values.push(item);
                    }
                })()`,
                variables: {},
                query: async () => '',
                limits: limits(8 * 1024 * 1024),
                timeoutMs: 2000
            });
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(RlmLimitError);
        expect(failure.limit).to.equal('sandboxMemoryBytes');
    });
});
