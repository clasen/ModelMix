const { expect } = require('chai');
const { RlmLimitError } = require('..');
const { createRuntimeBudget } = require('../lib/budget');

function limits(overrides = {}) {
    return {
        maxQueryBytes: 100,
        sandboxMemoryBytes: 1024 * 1024,
        maxConcurrentQueries: 2,
        maxCalls: 4,
        maxOutputBytes: 100,
        maxGeneratedTokens: 20,
        maxWallTimeMs: 1000,
        ...overrides
    };
}

describe('RLM runtime budget', () => {
    it('limits active queries while allowing queued work to finish', async () => {
        const budget = createRuntimeBudget(limits());
        let active = 0;
        let peak = 0;
        const operation = async value => budget.runQuery({ payloadBytes: 10 }, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 10));
            active -= 1;
            return { message: value, tokens: { output: 1 } };
        });

        const results = await Promise.all([
            operation('a'),
            operation('b'),
            operation('c'),
            operation('d')
        ]);

        expect(results.map(result => result.message)).to.deep.equal(['a', 'b', 'c', 'd']);
        expect(peak).to.equal(2);
        expect(budget.snapshot()).to.include({
            calls: 4,
            active: 0,
            peakConcurrency: 2,
            outputBytes: 4,
            generatedTokens: 4
        });
    });

    it('fails clearly on payload, call, output, and token limits', async () => {
        const payloadBudget = createRuntimeBudget(limits());
        expect(() => payloadBudget.assertQueryPayload(101))
            .to.throw(RlmLimitError).with.property('limit', 'maxQueryBytes');

        const callBudget = createRuntimeBudget(limits({ maxCalls: 1 }));
        await callBudget.runPlanner(async () => ({ message: 'planner' }));
        let callFailure;
        try {
            await callBudget.runPlanner(async () => ({ message: 'again' }));
        } catch (error) {
            callFailure = error;
        }
        expect(callFailure).to.be.instanceOf(RlmLimitError);
        expect(callFailure.limit).to.equal('maxCalls');

        const outputBudget = createRuntimeBudget(limits({ maxOutputBytes: 2 }));
        let outputFailure;
        try {
            await outputBudget.runPlanner(async () => ({ message: 'long' }));
        } catch (error) {
            outputFailure = error;
        }
        expect(outputFailure.limit).to.equal('maxOutputBytes');

        const tokenBudget = createRuntimeBudget(limits({ maxGeneratedTokens: 1 }));
        let tokenFailure;
        try {
            await tokenBudget.runPlanner(async () => ({
                message: '',
                tokens: { output: 2 }
            }));
        } catch (error) {
            tokenFailure = error;
        }
        expect(tokenFailure.limit).to.equal('maxGeneratedTokens');
    });
});
