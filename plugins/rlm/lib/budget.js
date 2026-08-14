class RlmLimitError extends Error {
    constructor(limit, message) {
        super(message);
        this.name = 'RlmLimitError';
        this.limit = limit;
    }
}

function positiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive integer.`);
    }
    return value;
}

function validateRuntimeLimits(limits) {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
        throw new TypeError('limits must be a plain object.');
    }
    return Object.freeze({
        maxQueryBytes: positiveInteger(limits.maxQueryBytes, 'limits.maxQueryBytes'),
        sandboxMemoryBytes: positiveInteger(limits.sandboxMemoryBytes, 'limits.sandboxMemoryBytes'),
        maxConcurrentQueries: positiveInteger(
            limits.maxConcurrentQueries,
            'limits.maxConcurrentQueries'
        ),
        maxCalls: positiveInteger(limits.maxCalls, 'limits.maxCalls'),
        maxOutputBytes: positiveInteger(limits.maxOutputBytes, 'limits.maxOutputBytes'),
        maxGeneratedTokens: positiveInteger(
            limits.maxGeneratedTokens,
            'limits.maxGeneratedTokens'
        ),
        maxWallTimeMs: positiveInteger(limits.maxWallTimeMs, 'limits.maxWallTimeMs')
    });
}

function createRuntimeBudget(limits, now = Date.now) {
    const validated = validateRuntimeLimits(limits);
    const startedAt = now();
    const queue = [];
    let calls = 0;
    let active = 0;
    let peakConcurrency = 0;
    let outputBytes = 0;
    let generatedTokens = 0;

    const checkTime = () => {
        if (now() - startedAt > validated.maxWallTimeMs) {
            throw new RlmLimitError('maxWallTimeMs', 'RLM wall-time limit exceeded.');
        }
    };
    const acquire = () => new Promise(resolve => {
        if (active < validated.maxConcurrentQueries) {
            active += 1;
            peakConcurrency = Math.max(peakConcurrency, active);
            resolve();
        } else {
            queue.push(resolve);
        }
    });
    const release = () => {
        const next = queue.shift();
        if (next) {
            next();
        } else {
            active -= 1;
        }
    };

    const accountResult = result => {
        const message = result?.message ?? '';
        const resultBytes = Buffer.byteLength(
            typeof message === 'string' ? message : JSON.stringify(message),
            'utf8'
        );
        outputBytes += resultBytes;
        generatedTokens += Number.isFinite(result?.tokens?.output)
            ? Math.max(0, result.tokens.output)
            : 0;
        if (outputBytes > validated.maxOutputBytes) {
            throw new RlmLimitError('maxOutputBytes', 'RLM output byte limit exceeded.');
        }
        if (generatedTokens > validated.maxGeneratedTokens) {
            throw new RlmLimitError(
                'maxGeneratedTokens',
                'RLM generated-token limit exceeded.'
            );
        }
    };
    const runCall = async ({ payloadBytes, enforcePayload }, operation) => {
        checkTime();
        if (enforcePayload && payloadBytes > validated.maxQueryBytes) {
            throw new RlmLimitError(
                'maxQueryBytes',
                `RLM query payload is ${payloadBytes} bytes; limit is ${validated.maxQueryBytes}.`
            );
        }
        if (calls >= validated.maxCalls) {
            throw new RlmLimitError('maxCalls', 'RLM call limit exceeded.');
        }
        calls += 1;
        await acquire();
        try {
            checkTime();
            const result = await operation();
            checkTime();
            accountResult(result);
            return result;
        } finally {
            release();
        }
    };

    return {
        limits: validated,
        assertQueryPayload(payloadBytes) {
            checkTime();
            if (payloadBytes > validated.maxQueryBytes) {
                throw new RlmLimitError(
                    'maxQueryBytes',
                    `RLM query payload is ${payloadBytes} bytes; limit is ${validated.maxQueryBytes}.`
                );
            }
        },
        async runQuery({ payloadBytes }, operation) {
            return runCall({ payloadBytes, enforcePayload: true }, operation);
        },
        async runPlanner(operation) {
            return runCall({ payloadBytes: 0, enforcePayload: false }, operation);
        },
        accountFinalOutput(value) {
            const message = typeof value === 'string' ? value : JSON.stringify(value);
            accountResult({ message });
            checkTime();
        },
        snapshot() {
            return {
                calls,
                active,
                peakConcurrency,
                outputBytes,
                generatedTokens,
                elapsedMs: now() - startedAt
            };
        }
    };
}

module.exports = {
    RlmLimitError,
    createRuntimeBudget,
    validateRuntimeLimits
};
