function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function finiteRating(value, path) {
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`${path} must be a non-negative finite number.`);
    }
    return value;
}

function validateModel(value, path) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.models)) {
        throw new TypeError(`${path} must be a ModelMix instance.`);
    }
    return value;
}

function createWorkerCatalog(workers) {
    if (!isPlainObject(workers) || Object.keys(workers).length === 0) {
        throw new TypeError('workers must be a non-empty plain object.');
    }

    const models = new Map();
    const manifest = {};
    for (const name of Object.keys(workers).sort()) {
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
            throw new TypeError(`Worker name "${name}" must use letters, numbers, underscores, or hyphens.`);
        }
        const worker = workers[name];
        if (!isPlainObject(worker)) {
            throw new TypeError(`Worker "${name}" must be a plain object.`);
        }
        if (typeof worker.description !== 'string' || worker.description.trim().length === 0) {
            throw new TypeError(`Worker "${name}" description must be a non-empty string.`);
        }
        const usesParent = worker.useParent === true;
        if (usesParent === (worker.model !== undefined)) {
            throw new TypeError(
                `Worker "${name}" must define exactly one of model or useParent: true.`
            );
        }
        models.set(
            name,
            usesParent ? undefined : validateModel(worker.model, `Worker "${name}" model`)
        );
        manifest[name] = {
            intelligence: finiteRating(worker.intelligence, `Worker "${name}" intelligence`),
            cost: finiteRating(worker.cost, `Worker "${name}" cost`),
            speed: finiteRating(worker.speed, `Worker "${name}" speed`),
            description: worker.description
        };
    }

    return {
        get(name) {
            if (typeof name !== 'string' || !models.has(name)) {
                throw new Error(`Unknown RLM worker "${name}".`);
            }
            return models.get(name);
        },
        manifest
    };
}

module.exports = {
    createWorkerCatalog
};
