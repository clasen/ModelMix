const path = require('path');
const { describeVariables } = require('./variable-descriptors');

const PLANNER_SYSTEM_TEMPLATE = path.resolve(__dirname, '../prompts/planner.md');

function positiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive integer.`);
    }
    return value;
}

function planningHint(name, descriptor, maxQueryBytes) {
    const payloadBytes = descriptor.utf8Bytes ?? descriptor.estimatedBytes;
    if (payloadBytes <= maxQueryBytes) {
        return {
            path: name,
            strategy: 'direct',
            reason: 'The complete serialized value fits within one query payload.'
        };
    }
    if (descriptor.type === 'string') {
        return {
            path: name,
            strategy: 'split-string-semantically',
            boundary: 'paragraph',
            reason: 'The string is larger than the maximum query payload.'
        };
    }
    if (descriptor.type === 'array') {
        const oversizedFields = [];
        for (const [field, fieldDescriptor] of Object.entries(descriptor.itemShape.properties || {})) {
            if (fieldDescriptor.stringSize?.utf8Bytes.max > maxQueryBytes) oversizedFields.push(field);
        }
        if (descriptor.itemSize.max > maxQueryBytes) {
            return {
                path: name,
                strategy: 'split-oversized-items-semantically',
                boundary: 'paragraph',
                oversizedStringFields: oversizedFields,
                reason: 'At least one array item is larger than the maximum query payload.'
            };
        }
        const averageBytes = Math.max(1, descriptor.itemSize.average);
        return {
            path: name,
            strategy: 'batch-array-items',
            suggestedMaxItemsPerQuery: Math.max(1, Math.floor(maxQueryBytes / averageBytes)),
            reason: 'The array is larger than one query payload while individual items fit.'
        };
    }
    return {
        path: name,
        strategy: 'select-properties-or-descendants',
        reason: 'The structured value is larger than the maximum query payload.'
    };
}

function plannerTemplateData({
    variables,
    limits,
    workerManifest,
    outputMode = 'raw',
    outputSchema = null
}) {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
        throw new TypeError('limits must be a plain object.');
    }
    const maxQueryBytes = positiveInteger(limits.maxQueryBytes, 'limits.maxQueryBytes');
    const sandboxMemoryBytes = positiveInteger(limits.sandboxMemoryBytes, 'limits.sandboxMemoryBytes');
    const maxConcurrentQueries = positiveInteger(
        limits.maxConcurrentQueries,
        'limits.maxConcurrentQueries'
    );
    const manifest = describeVariables(variables);
    const planningHints = Object.entries(manifest.descriptors)
        .map(([name, descriptor]) => planningHint(name, descriptor, maxQueryBytes));
    if (!workerManifest || typeof workerManifest !== 'object' || Array.isArray(workerManifest)) {
        throw new TypeError('workerManifest must be a plain object.');
    }
    if (!['message', 'json', 'block', 'raw'].includes(outputMode)) {
        throw new TypeError(`Unsupported RLM planner output mode "${outputMode}".`);
    }

    return {
        variableManifest: JSON.stringify(manifest, null, 2),
        processingLimits: JSON.stringify({
            maxQueryBytes,
            sandboxMemoryBytes,
            maxConcurrentQueries
        }, null, 2),
        planningHints: JSON.stringify(planningHints, null, 2),
        workerManifest: JSON.stringify(workerManifest, null, 2),
        outputRequirements: JSON.stringify({
            mode: outputMode,
            schema: outputSchema
        }, null, 2),
        maxQueryBytes,
        maxConcurrentQueries
    };
}

function createPlannerInvocation({
    task,
    variables,
    limits,
    workerManifest,
    outputMode = 'raw',
    outputSchema = null
}) {
    if (typeof task !== 'string' || task.trim().length === 0) {
        throw new TypeError('task must be a non-empty string.');
    }
    return {
        systemFile: PLANNER_SYSTEM_TEMPLATE,
        assign: plannerTemplateData({
            variables,
            limits,
            workerManifest,
            outputMode,
            outputSchema
        }),
        messages: [{
            role: 'user',
            content: [{ type: 'text', text: task }]
        }],
        plugins: { exclude: ['rlm'] },
        history: false,
        outputMode: 'raw'
    };
}

module.exports = {
    PLANNER_SYSTEM_TEMPLATE,
    createPlannerInvocation,
    plannerTemplateData
};
