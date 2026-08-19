const { isPlainObject } = require('./object-utils');

function normalizeContentCache(cache) {
    if (cache !== undefined) {
        if (!isPlainObject(cache) || cache.breakpoint !== true) {
            throw new TypeError('cache must be { breakpoint: true }.');
        }
        return { breakpoint: true };
    }
    return undefined;
}

function stripContentCacheMetadata(content) {
    if (!content || typeof content !== 'object') return content;
    const sanitized = { ...content };
    delete sanitized.cache;
    delete sanitized.cache_control;
    delete sanitized.prompt_cache_breakpoint;
    return sanitized;
}

function hasNeutralCacheBreakpoint(messages = []) {
    return messages.some(message => Array.isArray(message?.content)
        && message.content.some(block => block?.cache?.breakpoint === true));
}

module.exports = {
    normalizeContentCache,
    stripContentCacheMetadata,
    hasNeutralCacheBreakpoint
};
