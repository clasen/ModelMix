const { RlmLimitError, validateRuntimeLimits } = require('./budget');
const { createIsolatedVmSandbox } = require('./isolated-vm-sandbox');
const { parseMarkdownDocument } = require('./markdown');
const { createPlannerInvocation } = require('./planner-prompt');
const {
    RlmExecutionState,
    createQueryRuntime,
    requestTask,
    sumTokens
} = require('./runtime');
const { createWorkerCatalog } = require('./worker-catalog');
const { isPlainObject } = require('./validation');

function validateSandbox(sandbox) {
    if (!sandbox || typeof sandbox !== 'object' || typeof sandbox.execute !== 'function') {
        throw new TypeError('sandbox must define execute({ code, variables, query, limits, signal }).');
    }
    return sandbox;
}

function validateDocuments(documents) {
    if (documents === undefined) return {};
    if (!isPlainObject(documents)) {
        throw new TypeError('documents must be a plain object.');
    }
    for (const [name, document] of Object.entries(documents)) {
        if (!isPlainObject(document)) {
            throw new TypeError(`documents.${name} must be a plain object.`);
        }
        if (document.format !== 'markdown') {
            throw new TypeError(`documents.${name}.format must be "markdown".`);
        }
        if (typeof document.content !== 'string') {
            throw new TypeError(`documents.${name}.content must be a string.`);
        }
    }
    return documents;
}

async function createExternalVariables(variables, documents) {
    const result = { ...variables };
    for (const [name, document] of Object.entries(documents)) {
        if (Object.prototype.hasOwnProperty.call(result, name)) {
            throw new TypeError(`External variable "${name}" is defined more than once.`);
        }
        result[name] = await parseMarkdownDocument(document.content);
    }
    return result;
}

function validateGeneratedCode(code) {
    if (typeof code !== 'string' || code.trim().length === 0) {
        throw new TypeError('RLM planner must return non-empty JavaScript code.');
    }
    if (/```|~~~/.test(code)) {
        throw new SyntaxError('RLM planner returned Markdown fences instead of raw JavaScript.');
    }
    return code.trim();
}

function serializeResult(value) {
    if (typeof value === 'string') return value;
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch (error) {
        throw new TypeError(`RLM sandbox result must be JSON-serializable: ${error.message}`);
    }
    if (serialized === undefined) {
        throw new TypeError('RLM sandbox result must be JSON-serializable.');
    }
    return serialized;
}

function executionInput(context, configuredVariables) {
    const invocation = context.request.config.rlmInvocation;
    if (invocation !== undefined) {
        if (!isPlainObject(invocation) || !(invocation.state instanceof RlmExecutionState)) {
            throw new TypeError('Invalid internal RLM invocation state.');
        }
        return {
            state: invocation.state,
            task: invocation.task,
            variables: invocation.variables
        };
    }
    return {
        state: null,
        task: requestTask(context.request),
        variables: configuredVariables
    };
}

function runWithTimeout(operation, timeoutMs, signal) {
    signal?.throwIfAborted();
    let timeout;
    let onAbort;
    const promises = [
        operation(),
        new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new RlmLimitError(
                'maxWallTimeMs',
                'RLM wall-time limit exceeded.'
            )), timeoutMs);
        })
    ];
    if (signal) {
        promises.push(new Promise((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
        }));
    }
    return Promise.race(promises).finally(() => {
        clearTimeout(timeout);
        if (onAbort) signal.removeEventListener('abort', onAbort);
    });
}

function rlm({ maxDepth, variables = {}, documents, workers, limits, sandbox } = {}) {
    if (!Number.isInteger(maxDepth) || maxDepth < 0) {
        throw new TypeError('maxDepth must be a non-negative integer.');
    }
    if (!isPlainObject(variables)) {
        throw new TypeError('variables must be a plain object.');
    }
    const validatedDocuments = validateDocuments(documents);
    const catalog = createWorkerCatalog(workers);
    const validatedLimits = validateRuntimeLimits(limits);
    const sandboxAdapter = validateSandbox(
        sandbox === undefined ? createIsolatedVmSandbox() : sandbox
    );
    const configuredVariables = createExternalVariables(variables, validatedDocuments);

    return {
        name: 'rlm',
        async execute(context) {
            context.signal?.throwIfAborted();
            if (context.request.outputMode === 'stream') {
                throw new Error('RLM streaming is not supported; use a buffered output mode.');
            }
            const input = executionInput(context, await configuredVariables);
            if (typeof input.task !== 'string' || input.task.trim().length === 0) {
                throw new TypeError('RLM execution requires a non-empty task.');
            }
            if (!isPlainObject(input.variables)) {
                throw new TypeError('RLM execution variables must be a plain object.');
            }
            const state = input.state || new RlmExecutionState(validatedLimits);
            try {
                const plannerStartedAt = Date.now();
                const plannerResult = await state.budget.runPlanner(() => context.invoke(
                    createPlannerInvocation({
                        task: input.task,
                        variables: input.variables,
                        limits: validatedLimits,
                        workerManifest: catalog.manifest,
                        outputMode: context.request.outputMode,
                        outputSchema: context.request.config.schema || null
                    })
                ));
                context.signal?.throwIfAborted();
                state.record('planner', plannerResult, {
                    worker: null,
                    elapsedMs: Date.now() - plannerStartedAt
                });
                const code = validateGeneratedCode(plannerResult.message);
                const query = createQueryRuntime({
                    context,
                    catalog,
                    maxDepth,
                    state
                });
                const timeoutMs = Math.max(
                    1,
                    validatedLimits.maxWallTimeMs - state.budget.snapshot().elapsedMs
                );
                const value = await runWithTimeout(
                    () => sandboxAdapter.execute({
                        code,
                        variables: input.variables,
                        query,
                        limits: validatedLimits,
                        execution: context.execution,
                        signal: context.signal,
                        timeoutMs
                    }),
                    timeoutMs,
                    context.signal
                );
                context.signal?.throwIfAborted();
                const message = serializeResult(value);
                state.budget.accountFinalOutput(message);
                return {
                    message,
                    tokens: sumTokens(state.calls),
                    rlm: state.diagnostics(context.execution)
                };
            } catch (error) {
                context.signal?.throwIfAborted();
                error.rlm = state.diagnostics(
                    context.execution,
                    error.limit ? `limit:${error.limit}` : 'error'
                );
                throw error;
            }
        }
    };
}

module.exports = {
    createExternalVariables,
    rlm,
    serializeResult,
    validateDocuments,
    validateGeneratedCode
};
