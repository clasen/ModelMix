const { normalizeEffort } = require('../effort');

const CHAIN_MODEL_SHORTCUTS = new Set([
    'gpt5', 'gpt5mini', 'gpt5nano',
    'gpt51', 'gpt52', 'gpt54', 'gpt54mini', 'gpt54nano', 'gpt54pro',
    'gpt55', 'gpt55pro', 'gpt56sol', 'gpt56terra', 'gpt56luna',
    'gptRealtime', 'gptRealtimeMini', 'gpt53codex', 'gpt53chat', 'gptOss',
    'fable51', 'fable50', 'fable5', 'opus50', 'opus5', 'opus48', 'opus47', 'opus46',
    'sonnet50', 'sonnet5', 'sonnet46', 'sonnet45', 'haiku45',
    'gemini31pro', 'gemini38flash', 'gemini37flash', 'gemini36flash', 'gemini35flash',
    'gemini35flashLite', 'gemini31flashLite', 'sonarPro', 'sonar',
    'grok46', 'grok45', 'grok43', 'grok420multiAgent', 'grok420',
    'museGlimmer30b', 'museSpark12', 'museSpark12c', 'museSpark13', 'museSpark13c',
    'qwen35397b', 'qwen36plus', 'qwen37plus', 'qwen38max', 'qwen3827b', 'qwen38flash',
    'hermes470b', 'hermes4405b', 'hermes3',
    'kimiK26', 'kimiK27Code', 'kimiK3', 'kimiK25',
    'minimaxM27', 'minimaxM3', 'mimo25', 'mimo25pro',
    'deepseekV4Pro', 'deepseekV4Flash', 'GLM52', 'GLM53', 'GLM53Flash'
]);

function parseChainModels(modelSpecs) {
    if (modelSpecs.length === 0) {
        throw new TypeError('chain() requires at least one model shortcut string.');
    }

    return modelSpecs.map((modelSpec, index) => {
        if (typeof modelSpec !== 'string') {
            throw new TypeError(`Invalid chain model at index ${index}: expected a model shortcut string.`);
        }

        const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:@(-?\d+))?$/.exec(modelSpec);
        if (!match) {
            throw new TypeError(`Invalid chain model "${modelSpec}": expected "shortcut" or "shortcut@effort".`);
        }

        const shortcut = match[1];
        if (!CHAIN_MODEL_SHORTCUTS.has(shortcut)) {
            throw new Error(`Unknown model shortcut "${shortcut}" in chain().`);
        }

        return {
            shortcut,
            effort: match[2] === undefined ? undefined : normalizeEffort(Number(match[2]))
        };
    });
}

function listChainModelShortcuts() {
    return [...CHAIN_MODEL_SHORTCUTS];
}

module.exports = { listChainModelShortcuts, parseChainModels };
