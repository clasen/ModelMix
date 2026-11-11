import { isPlainObject } from './object-utils';
import type { CacheBreakpoint } from '../types';

export function normalizeContentCache(cache: unknown): CacheBreakpoint | undefined {
    if (cache !== undefined) {
        if (!isPlainObject(cache) || cache.breakpoint !== true) {
            throw new TypeError('cache must be { breakpoint: true }.');
        }
        return { breakpoint: true };
    }
    return undefined;
}

export function stripContentCacheMetadata<T>(content: T): T {
    if (!content || typeof content !== 'object') return content;
    const sanitized: Record<string, unknown> = { ...(content as Record<string, unknown>) };
    delete sanitized.cache;
    delete sanitized.cache_control;
    delete sanitized.prompt_cache_breakpoint;
    return sanitized as T;
}

export function hasNeutralCacheBreakpoint(messages: Array<{ content?: unknown } | null | undefined> = []): boolean {
    return messages.some(message => Array.isArray(message?.content)
        && message.content.some((block: { cache?: { breakpoint?: unknown } } | null) => block?.cache?.breakpoint === true));
}
