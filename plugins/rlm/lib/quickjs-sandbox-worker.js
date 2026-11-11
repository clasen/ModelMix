const { parentPort, workerData } = require('worker_threads');
const { newQuickJSWASMModuleFromVariant } = require('quickjs-emscripten-core');
const releaseSyncVariant = require('@jitl/quickjs-wasmfile-release-sync').default;

const pendingQueries = new Map();
let nextQueryId = 0;

function describeError(vm, handle) {
    const error = vm.dump(handle);
    if (error && typeof error === 'object') {
        return { name: String(error.name || 'Error'), message: String(error.message) };
    }
    return { name: 'Error', message: String(error) };
}

function toHandle(vm, parseJson, value) {
    if (value === undefined) return vm.undefined;
    const json = vm.newString(JSON.stringify(value));
    try {
        return vm.unwrapResult(vm.callFunction(parseJson, vm.undefined, json));
    } finally {
        json.dispose();
    }
}

function drainJobs(runtime) {
    const result = runtime.executePendingJobs();
    if (result.error) result.error.dispose();
}

async function run() {
    const { code, variables, memoryLimitBytes, stopFlag } = workerData;
    const QuickJS = await newQuickJSWASMModuleFromVariant(releaseSyncVariant);
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(memoryLimitBytes);
    runtime.setInterruptHandler(() => Atomics.load(stopFlag, 0) === 1);
    const vm = runtime.newContext();
    const parseJson = vm.unwrapResult(vm.evalCode('JSON.parse'));

    parentPort.on('message', message => {
        const deferred = pendingQueries.get(message.id);
        pendingQueries.delete(message.id);
        if (message.ok) {
            const value = toHandle(vm, parseJson, message.value);
            deferred.resolve(value);
            value.dispose();
        } else {
            const error = vm.newError({ name: message.name, message: message.message });
            deferred.reject(error);
            error.dispose();
        }
        drainJobs(runtime);
    });

    const variablesHandle = toHandle(vm, parseJson, variables);
    vm.setProp(vm.global, 'variables', variablesHandle);
    variablesHandle.dispose();

    const queryHandle = vm.newFunction('query', inputHandle => {
        const id = nextQueryId++;
        const deferred = vm.newPromise();
        pendingQueries.set(id, deferred);
        parentPort.postMessage({ type: 'query', id, input: vm.dump(inputHandle) });
        return deferred.handle;
    });
    vm.defineProp(vm.global, 'query', {
        configurable: false,
        enumerable: true,
        value: queryHandle
    });
    queryHandle.dispose();

    const evaluation = vm.evalCode(`'use strict';\n${code}`, 'rlm-planner.js');
    if (evaluation.error) {
        parentPort.postMessage({ type: 'error', error: describeError(vm, evaluation.error) });
        evaluation.error.dispose();
        return;
    }
    const settled = vm.resolvePromise(evaluation.value);
    evaluation.value.dispose();
    drainJobs(runtime);
    const outcome = await settled;
    if (outcome.error) {
        parentPort.postMessage({ type: 'error', error: describeError(vm, outcome.error) });
        outcome.error.dispose();
        return;
    }
    parentPort.postMessage({ type: 'result', value: vm.dump(outcome.value) });
    outcome.value.dispose();
}

run().catch(error => {
    parentPort.postMessage({
        type: 'error',
        error: { name: error.name || 'Error', message: error.message }
    });
});
