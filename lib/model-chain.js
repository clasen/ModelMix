const { normalizeEffort, resolveNamedEffort, resolveProviderFamily } = require('../effort');
const { listModelShortcuts, resolveModelShortcut } = require('./model-registry');

const CHAIN_MODEL_SHORTCUTS = new Set(listModelShortcuts());

function parseChainModels(modelSpecs) {
    if (modelSpecs.length === 0) {
        throw new TypeError('chain() requires at least one model shortcut string.');
    }

    return modelSpecs.map((modelSpec, index) => {
        if (typeof modelSpec !== 'string') {
            throw new TypeError(`Invalid chain model at index ${index}: expected a model shortcut string.`);
        }

        const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:@(-?\d+|[a-z]+))?$/.exec(modelSpec);
        if (!match) {
            throw new TypeError(`Invalid chain model "${modelSpec}": expected "shortcut" or "shortcut@effort".`);
        }

        const shortcut = match[1];
        if (!CHAIN_MODEL_SHORTCUTS.has(shortcut)) {
            throw new Error(`Unknown model shortcut "${shortcut}" in chain().`);
        }

        return {
            shortcut,
            effort: match[2] === undefined ? undefined
                : /^-?\d+$/.test(match[2]) ? normalizeEffort(Number(match[2])) : match[2]
        };
    });
}

/** Build the { key, provider } entries for one parsed chain model without attaching them. */
function resolveChainModel(model, { shortcut, effort }, args = {}) {
    const config = typeof effort === 'number' ? { ...args.config, effort } : { ...args.config };
    const models = resolveModelShortcut(shortcut, { ...args, config }, model._mixOverrides);
    if (typeof effort === 'string') {
        // Validate every provider before attach() deduplicates existing models.
        for (const entry of models) {
            entry.provider.config = {
                ...entry.provider.config,
                effort: resolveNamedEffort(resolveProviderFamily(entry.provider), effort, entry.key)
            };
        }
    }
    return models;
}

function attachChainModel(model, parsed, args = {}) {
    model._attachModels(resolveChainModel(model, parsed, args));
}

function listChainModelShortcuts() {
    return [...CHAIN_MODEL_SHORTCUTS];
}

module.exports = { listChainModelShortcuts, parseChainModels, resolveChainModel, attachChainModel };
