const { expect } = require('chai');
const sinon = require('sinon');

const { MixOpenAI, ModelMix } = require('../../..');
const { benchmark } = require('..');

const criteria = {
    criteria: [
        { id: 'correctness', description: 'How completely the response fulfills the task.' },
        { id: 'clarity', description: 'How clear and coherent the response is.' }
    ]
};

function request(overrides = {}) {
    return {
        system: 'Original system instructions',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Complete the task.' }] }],
        options: { max_tokens: 123, response_format: { type: 'json_object' } },
        config: { system: 'Original system instructions' },
        outputMode: 'json',
        ...overrides
    };
}

function modelKey(input) {
    return input.model.models[0].key;
}

function validEvaluation(correctness = 8, clarity = 6) {
    return JSON.stringify({
        scores: [
            { criterionId: 'correctness', score: correctness, justification: 'It fulfills the task.' },
            { criterionId: 'clarity', score: clarity, justification: 'It is easy to follow.' }
        ]
    });
}

function metricsResult(message, cost = 0.01) {
    return {
        message,
        tokens: { input: 1, output: 2, total: 3, cost }
    };
}

function directContext(invoke, overrides = {}) {
    return {
        request: request(overrides),
        execution: { executionId: 'root', parentExecutionId: null, depth: 0 },
        signal: overrides.signal,
        invoke
    };
}

async function expectRejection(promise, message) {
    let rejection;
    try {
        await promise;
    } catch (error) {
        rejection = error;
    }
    expect(rejection).to.be.an('error');
    expect(rejection.message).to.include(message);
}

describe('benchmark plugin', () => {
    afterEach(() => sinon.restore());

    it('accepts a closing Markdown delimiter on criteria and evaluations without changing the response', async () => {
        const response = 'Candidate with ```text\ncontent\n```';
        const plugin = benchmark({ criteriaModel: 'gpt5nano', models: ['gpt5', 'sonnet5'] });
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria) + '```');
            }
            if (input.system.includes('evaluate one candidate response')) {
                return metricsResult(validEvaluation() + '\n```\n');
            }
            return metricsResult(response);
        }));
        expect(raw.benchmark.errors).to.deep.equal([]);
        expect(raw.benchmark.results[0].response).to.equal(response);
        expect(raw.benchmark.results.map(result => result.score)).to.deep.equal([7, 7]);
    });

    it('still rejects invalid or incomplete evaluations with closing Markdown delimiters', async () => {
        const plugin = benchmark({ criteriaModel: 'gpt5nano', models: ['gpt5', 'sonnet5'] });
        let evaluation = 0;
        const invalid = [validEvaluation() + ' explanation```', '{"scores":[]}```'];
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                return metricsResult(invalid[evaluation++]);
            }
            return metricsResult('Candidate');
        }));
        expect(raw.benchmark.results.map(result => result.score)).to.deep.equal([null, null]);
        expect(raw.benchmark.errors.map(item => item.error.details.outputText)).to.deep.equal(invalid);
        expect(raw.benchmark.errors[0].error.message).to.include('invalid JSON');
        expect(raw.benchmark.errors[1].error.message).to.include('every criterion exactly once');
    });

    for (const failJudge of [false, true]) {
        it(`runs Gemini through its adapter and ${failJudge ? 'preserves provider failures in logs and the report' : 'keeps JSON mode limited to criteria and judging'}`, async () => {
            const log = sinon.stub(console, 'log');
            const bodies = [];
            const providerError = 'Invalid JSON payload received. Unknown name "content".';
            sinon.stub(global, 'fetch').callsFake(async (_url, input) => {
                const body = JSON.parse(input.body);
                bodies.push(body);
                const system = body.systemInstruction.parts.map(part => part.text).join('');
                const judging = system.includes('evaluate one candidate response');
                if (judging && failJudge) {
                    return new Response(JSON.stringify({ error: { message: providerError } }), { status: 400 });
                }
                const text = system.includes('define evaluation criteria')
                    ? JSON.stringify(criteria)
                    : judging ? validEvaluation() : 'Gemini candidate';
                return new Response(JSON.stringify({
                    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }]
                }), { status: 200 });
            });
            sinon.stub(MixOpenAI.prototype, 'create').callsFake(async ({ config }) => (
                metricsResult(config.system.includes('evaluate one candidate response')
                    ? validEvaluation() : 'Other candidate')
            ));
            const report = await ModelMix.new({ config: { apiKey: 'test-key', debug: 1 } })
                .use(benchmark({ criteriaModel: 'gemini38flash@20', models: ['gemini38flash@20', 'gpt5mini@20'] }))
                .addText('Complete the task.')
                .json();

            expect(bodies).to.have.length(3);
            expect(bodies.map(body => body.generationConfig.responseMimeType)).to.deep.equal([
                'application/json', 'text/plain', 'application/json'
            ]);
            for (const body of bodies) {
                expect(body.contents).to.have.length(1);
                expect(body.contents[0]).to.have.keys('role', 'parts');
                expect(body.contents[0].parts[0].text).to.be.a('string');
            }
            expect(report.results[0].response).to.equal('Gemini candidate');
            expect(report.results[0].score).to.equal(7);
            expect(report.metrics.calls.attempted).to.equal(5);
            expect(report.errors).to.have.length(failJudge ? 1 : 0);
            expect(report.results[1].score).to.equal(failJudge ? null : 7);
            if (failJudge) {
                expect(report.errors[0]).to.include({ stage: 'evaluation', judge: 'gemini38flash@20' });
                expect(report.errors[0].error.statusCode).to.equal(400);
                expect(report.errors[0].error.details.error.message).to.equal(providerError);
                expect(log.args.flat().join('\n')).to.include(providerError).and.include('HTTP 400');
            }
        });
    }

    it('preserves Markdown fences inside valid JSON evaluations and the final JSON report', async () => {
        sinon.stub(MixOpenAI.prototype, 'create').callsFake(async ({ config }) => {
            if (config.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (config.system.includes('evaluate one candidate response')) {
                const value = JSON.parse(validEvaluation());
                value.scores[0].justification = 'The response contains ```text and ``` markers.';
                return metricsResult(JSON.stringify(value));
            }
            return metricsResult('```text\nA candidate answer\n```');
        });
        const report = await ModelMix.new().use(benchmark({
            criteriaModel: 'gpt5nano', models: ['gpt5', 'gpt5mini']
        })).addText('Evaluate the answer.').json();
        expect(report.errors).to.deep.equal([]);
        expect(report.results[0].response).to.equal('```text\nA candidate answer\n```');
        expect(report.results[0].evaluationCount.valid).to.equal(1);
    });

    it('rejects truncated output with its finish reason and preserves the text and metrics', async () => {
        const plugin = benchmark({ criteriaModel: 'gpt5nano', models: ['gpt5', 'sonnet5'] });
        const log = sinon.stub(console, 'log');
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                return {
                    ...metricsResult('{"scores":['),
                    response: { choices: [{ finish_reason: 'length' }] }
                };
            }
            return metricsResult('Candidate answer');
        }, { config: { debug: 1 } }));
        expect(raw.benchmark.errors).to.have.length(2);
        expect(raw.benchmark.errors[0].error.message).to.include('token limit');
        expect(raw.benchmark.errors[0].error.details).to.include({
            finishReason: 'length', outputText: '{"scores":['
        });
        expect(raw.benchmark.metrics.calls.attempted).to.equal(5);
        expect(raw.benchmark.metrics.cost).to.be.closeTo(0.05, 1e-12);
        expect(raw.benchmark.results[0].score).to.equal(null);
        expect(log.args.flat().join('\n')).to.include('token limit');
    });

    it('returns a JSON report with isolated responses, cross-evaluations, averages, and metrics', async () => {
        const calls = [];
        const plugin = benchmark({
            criteriaModel: 'gpt5nano@10',
            models: ['gpt5@0', 'gpt5mini@25', 'sonnet5@50']
        });
        const context = directContext(async input => {
            calls.push(input);
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                return metricsResult(validEvaluation());
            }
            return metricsResult(`response:${modelKey(input)}`);
        });

        const raw = await plugin.execute(context);
        const report = JSON.parse(raw.message);

        expect(raw.benchmark).to.deep.equal(report);
        expect(report.criteria.items).to.deep.equal(criteria.criteria);
        expect(report.criteria.model).to.include({ id: 'gpt5nano@10', effort: 10 });
        expect(report.results).to.have.length(3);
        expect(report.results.map(result => result.response)).to.deep.equal([
            'response:gpt-5',
            'response:gpt-5-mini',
            'response:claude-sonnet-5'
        ]);
        for (const result of report.results) {
            expect(result.evaluationCount).to.deep.equal({ expected: 2, valid: 2 });
            expect(result.averages).to.deep.equal([
                { criterionId: 'correctness', score: 8 },
                { criterionId: 'clarity', score: 6 }
            ]);
            expect(result.score).to.equal(7);
        }
        expect(report.errors).to.deep.equal([]);
        expect(report.metrics.tokens).to.include({ input: 10, output: 20, total: 30 });
        expect(report.metrics.cost).to.be.closeTo(0.1, 1e-12);
        expect(report.metrics.calls).to.deep.equal({ attempted: 10, withTokens: 10, withCost: 10 });

        const participantCalls = calls.filter(call => call.system === request().system);
        expect(participantCalls).to.have.length(3);
        for (const call of participantCalls) {
            expect(call.messages).to.deep.equal(request().messages);
            expect(call.options).to.not.have.property('response_format');
            expect(call.plugins).to.equal('none');
            expect(call.history).to.equal(false);
        }
        for (const call of calls.filter(call => call.system !== request().system)) {
            expect(call.options.response_format).to.deep.equal({ type: 'json_object' });
        }
    });

    it('treats aliases as one model for duplicates and self-evaluation exclusion', async () => {
        const plugin = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['sonnet5@10', 'sonnet50@20', 'gpt5@30']
        });
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                return metricsResult(validEvaluation());
            }
            return metricsResult(`response:${modelKey(input)}`);
        }));

        expect(raw.benchmark.results.map(result => result.evaluationCount)).to.deep.equal([
            { expected: 1, valid: 1 },
            { expected: 1, valid: 1 },
            { expected: 2, valid: 2 }
        ]);
        expect(raw.benchmark.results[0].evaluations[0].judge.canonicalModel).to.equal('gpt-5');
        expect(raw.benchmark.results[1].evaluations[0].judge.canonicalModel).to.equal('gpt-5');
        expect(raw.benchmark.results[2].evaluations.map(item => item.judge.id)).to.deep.equal([
            'sonnet5@10',
            'sonnet50@20'
        ]);

        const duplicate = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['sonnet5@100', 'sonnet50@100', 'gpt5']
        });
        await expectRejection(duplicate.execute(directContext(async () => {
            throw new Error('should not be called');
        })), 'duplicates the same model and effective effort');

        const inheritedDuplicate = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['sonnet5', 'sonnet50', 'gpt5']
        });
        await expectRejection(inheritedDuplicate.execute(directContext(async () => {
            throw new Error('should not be called');
        }, {
            config: { system: 'Original system instructions', effort: 40 }
        })), 'duplicates the same model and effective effort');

        const oneDistinctModel = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['sonnet5@10', 'sonnet50@20']
        });
        await expectRejection(oneDistinctModel.execute(directContext(async () => {
            throw new Error('should not be called');
        })), 'at least two distinct models');
    });

    it('keeps partial results and lets a failed participant continue as a judge', async () => {
        const evaluationCalls = [];
        const plugin = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['gpt5', 'gpt5mini', 'sonnet5']
        });
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                const payload = JSON.parse(input.messages[0].content);
                const judge = modelKey(input);
                evaluationCalls.push({ judge, response: payload.candidateResponse });
                if (judge === 'claude-sonnet-5' && payload.candidateResponse === 'response:gpt-5-mini') {
                    return metricsResult('{invalid');
                }
                return metricsResult(validEvaluation(9, 7));
            }
            if (modelKey(input) === 'gpt-5') throw new Error('participant unavailable');
            return metricsResult(`response:${modelKey(input)}`);
        }));

        const [failed, mini, sonnet] = raw.benchmark.results;
        expect(failed.response).to.equal(null);
        expect(failed.responseMetrics).to.include({ tokens: null, cost: null });
        expect(failed.score).to.equal(null);
        expect(failed.evaluationCount).to.deep.equal({ expected: 0, valid: 0 });
        expect(mini.evaluationCount).to.deep.equal({ expected: 2, valid: 1 });
        expect(sonnet.evaluationCount).to.deep.equal({ expected: 2, valid: 2 });
        expect(sonnet.score).to.equal(8);
        expect(evaluationCalls).to.deep.include({
            judge: 'gpt-5',
            response: 'response:gpt-5-mini'
        });
        expect(evaluationCalls).to.deep.include({
            judge: 'gpt-5',
            response: 'response:claude-sonnet-5'
        });
        expect(raw.benchmark.errors.map(error => error.stage)).to.deep.equal([
            'response',
            'evaluation'
        ]);
        expect(raw.benchmark.errors[1].error.message).to.include('invalid JSON');
        expect(raw.benchmark.metrics.calls).to.deep.equal({ attempted: 8, withTokens: 7, withCost: 7 });
        expect(raw.benchmark.metrics.cost).to.be.closeTo(0.07, 1e-12);
    });

    it('rejects incomplete evaluations without using any of their scores', async () => {
        const plugin = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['gpt5', 'sonnet5']
        });
        const raw = await plugin.execute(directContext(async input => {
            if (input.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (input.system.includes('evaluate one candidate response')) {
                return metricsResult(JSON.stringify({
                    scores: [{
                        criterionId: 'correctness',
                        score: 10,
                        justification: 'Only one criterion was scored.'
                    }]
                }));
            }
            return metricsResult(`response:${modelKey(input)}`);
        }));

        for (const result of raw.benchmark.results) {
            expect(result.evaluations).to.deep.equal([]);
            expect(result.averages).to.deep.equal([
                { criterionId: 'correctness', score: null },
                { criterionId: 'clarity', score: null }
            ]);
            expect(result.score).to.equal(null);
        }
        expect(raw.benchmark.errors).to.have.length(2);
    });

    it('aborts when criteria generation fails and propagates cancellation', async () => {
        const invalidCriteria = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['gpt5', 'sonnet5']
        });
        await expectRejection(invalidCriteria.execute(directContext(async () => (
            metricsResult(JSON.stringify({ criteria: [] }))
        ))), 'criteria generation failed');

        const controller = new AbortController();
        controller.abort(new Error('cancel benchmark'));
        let calls = 0;
        await expectRejection(invalidCriteria.execute(directContext(async () => {
            calls += 1;
            return metricsResult(JSON.stringify(criteria));
        }, { signal: controller.signal })), 'cancel benchmark');
        expect(calls).to.equal(0);
    });

    it('logs intermediate progress when ModelMix debug is enabled', async () => {
        const plugin = benchmark({
            criteriaModel: 'gpt5nano',
            models: ['gpt5', 'sonnet5']
        });
        const log = sinon.stub(console, 'log');
        try {
            await plugin.execute(directContext(async input => {
                if (input.system.includes('define evaluation criteria')) {
                    return metricsResult(JSON.stringify(criteria));
                }
                if (input.system.includes('evaluate one candidate response')) {
                    return metricsResult(validEvaluation());
                }
                return metricsResult(`response:${modelKey(input)}`);
            }, {
                config: { system: 'Original system instructions', debug: 1 }
            }));
        } finally {
            log.restore();
        }

        const output = log.args.flat().join('\n');
        expect(output).to.include('[benchmark] Generating criteria with gpt5nano.');
        expect(output).to.include('[benchmark] Running response 1/2: gpt5.');
        expect(output).to.include('[benchmark] Running evaluation 2/2:');
        expect(output).to.include('[benchmark] Completed benchmark');
    });

    it('integrates with ModelMix json() and exposes the same report through lastRaw', async () => {
        sinon.stub(MixOpenAI.prototype, 'create').callsFake(async ({ config, options }) => {
            if (config.system.includes('define evaluation criteria')) {
                return metricsResult(JSON.stringify(criteria));
            }
            if (config.system.includes('evaluate one candidate response')) {
                return metricsResult(validEvaluation());
            }
            expect(options).to.not.have.property('response_format');
            return metricsResult(`response:${options.model}`);
        });
        const model = ModelMix.new()
            .use(benchmark({
                criteriaModel: 'gpt5nano',
                models: ['gpt5', 'gpt5mini']
            }))
            .addText('Complete the task.');

        const report = await model.json();

        expect(report.results).to.have.length(2);
        expect(model.lastRaw.benchmark).to.deep.equal(report);
        expect(JSON.parse(model.lastRaw.message)).to.deep.equal(report);
    });
});
