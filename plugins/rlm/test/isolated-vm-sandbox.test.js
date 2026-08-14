const { expect } = require('chai');
const {
    RlmLimitError,
    createIsolatedVmSandbox
} = require('..');

function limits(sandboxMemoryBytes = 16 * 1024 * 1024) {
    return { sandboxMemoryBytes };
}

describe('RLM isolated-vm sandbox', () => {
    it('exposes only copied variables and the validated query callback', async () => {
        const sandbox = createIsolatedVmSandbox();
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
            await createIsolatedVmSandbox().execute({
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

    it('rejects memory limits below the isolated-vm minimum', async () => {
        let failure;
        try {
            await createIsolatedVmSandbox().execute({
                code: '(async () => "ok")()',
                variables: {},
                query: async () => '',
                limits: limits(1024 * 1024),
                timeoutMs: 1000
            });
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(TypeError);
        expect(failure.message).to.include('at least 8388608');
    });

    it('terminates programs that exceed the configured isolate heap', async () => {
        let failure;
        try {
            await createIsolatedVmSandbox().execute({
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
