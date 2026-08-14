const { createRuntimeBudget } = require('./budget');

function textContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n');
}

function requestTask(request) {
    return request.messages
        .filter(message => message?.role === 'user')
        .map(message => textContent(message.content))
        .filter(Boolean)
        .join('\n\n');
}

function queryPayloadBytes({ system, message }) {
    return Buffer.byteLength(JSON.stringify({ system, message }), 'utf8');
}

function validateQueryInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('query() expects a plain object.');
    }
    if (typeof input.worker !== 'string' || input.worker.length === 0) {
        throw new TypeError('query.worker must be a non-empty string.');
    }
    if (typeof input.system !== 'string' || input.system.trim().length === 0) {
        throw new TypeError('query.system must be a non-empty string.');
    }
    if (typeof input.message !== 'string') {
        throw new TypeError('query.message must be a string.');
    }
    return input;
}

function sumTokens(calls) {
    const totals = {
        input: 0,
        output: 0,
        total: 0,
        cached: 0,
        cacheWrite: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        uncachedInput: 0,
        cost: 0
    };
    let found = false;
    for (const call of calls) {
        const tokens = call.tokens;
        if (!tokens) continue;
        found = true;
        for (const key of Object.keys(totals)) {
            if (Number.isFinite(tokens[key])) totals[key] += tokens[key];
        }
    }
    return found ? totals : undefined;
}

class RlmExecutionState {
    constructor(limits) {
        this.budget = createRuntimeBudget(limits);
        this.calls = [];
    }

    record(kind, result, details = {}, { includeTokens = true } = {}) {
        this.calls.push({
            kind,
            ...details,
            execution: result.execution || null,
            tokens: includeTokens ? (result.tokens || null) : null
        });
    }

    diagnostics(rootExecution, terminationReason = 'completed') {
        return {
            execution: rootExecution,
            calls: this.calls.map(call => ({ ...call })),
            budget: this.budget.snapshot(),
            terminationReason
        };
    }
}

function createQueryRuntime({ context, catalog, maxDepth, state }) {
    return async rawInput => {
        const startedAt = Date.now();
        const input = validateQueryInput(rawInput);
        const model = catalog.get(input.worker);
        const directLeaf = context.execution.depth >= maxDepth;
        const payloadBytes = queryPayloadBytes(input);
        state.budget.assertQueryPayload(payloadBytes);
        const invocation = directLeaf
            ? {
                model,
                system: input.system,
                messages: [{ role: 'user', content: input.message }],
                plugins: { exclude: ['rlm'] },
                history: false,
                outputMode: 'raw'
            }
            : {
                model,
                messages: [{ role: 'user', content: input.system }],
                config: {
                    rlmInvocation: {
                        state,
                        task: input.system,
                        variables: { input: input.message }
                    },
                },
                plugins: 'inherit',
                history: false,
                outputMode: 'raw'
            };
        const result = directLeaf
            ? await state.budget.runQuery(
                { payloadBytes },
                () => context.invoke(invocation)
            )
            : await context.invoke(invocation);
        if (typeof result.message !== 'string') {
            throw new TypeError(`RLM worker "${input.worker}" must return a message string.`);
        }
        state.record('worker', result, {
            worker: input.worker,
            directLeaf,
            depthBoundary: directLeaf ? maxDepth : null,
            elapsedMs: Date.now() - startedAt
        }, { includeTokens: directLeaf });
        return result.message;
    };
}

module.exports = {
    RlmExecutionState,
    createQueryRuntime,
    queryPayloadBytes,
    requestTask,
    sumTokens,
    validateQueryInput
};
