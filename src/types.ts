import type { ModelMix } from './index';
import type { MixCustom } from './lib/providers/base';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | string;

export type DebugLevel = 0 | 1 | 2 | 3 | 4;

/** Unified effort: -1 = adaptive, 0–100 = intensity. */
export type EffortValue = number;

export interface PromptCacheOptions {
    mode?: 'implicit' | 'explicit';
    ttl?: '30m';
}

export interface CacheBreakpoint {
    breakpoint: true;
}

export interface AnthropicCacheControl {
    type: 'ephemeral';
    ttl?: '5m' | '1h';
}

export interface BottleneckConfig {
    maxConcurrent?: number;
    minTime?: number;
    reservoir?: number;
    reservoirRefreshAmount?: number;
    reservoirRefreshInterval?: number;
    [key: string]: unknown;
}

export interface RetryConfig {
    enabled?: boolean;
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryableStatusCodes?: number[];
}

export interface ModelMixOptions {
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
    model?: string;
    messages?: ChatMessage[];
    response_format?: { type: string; [key: string]: unknown };
    prompt_cache_key?: string;
    /** OpenAI models before GPT-5.6. GPT-5.6 uses prompt_cache_options.ttl. */
    prompt_cache_retention?: string;
    /** GPT-5.6 Responses API prompt caching controls. */
    prompt_cache_options?: PromptCacheOptions;
    /** Anthropic automatic caching, or the policy used by neutral explicit breakpoints. */
    cache_control?: AnthropicCacheControl;
    [key: string]: unknown;
}

export interface ModelMixConfig {
    system?: string;
    /** 0 = stateless, N = last N messages, -1 = unlimited */
    max_history?: number;
    /** Tool call rounds allowed per request before failing with code MAX_TOOL_ROUNDS; -1 = unlimited. Default 25. */
    max_tool_rounds?: number;
    /** 0=silent, 1=minimal, 2=summary, 3=full, 4=verbose */
    debug?: DebugLevel | number;
    bottleneck?: BottleneckConfig;
    retry?: RetryConfig;
    roundRobin?: boolean;
    /** Unified effort (-1 adaptive, or 0–100). Not a native provider field. */
    effort?: EffortValue | null;
    templateData?: Record<string, unknown>;
    schema?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ModelMixMixFlags {
    anthropic?: boolean;
    openrouter?: boolean;
    cerebras?: boolean;
    groq?: boolean;
    together?: boolean;
    lambda?: boolean;
    fireworks?: boolean;
    nvidia?: boolean;
    moonshot?: boolean;
    minimax?: boolean;
    mimo?: boolean;
    deepseek?: boolean;
    [key: string]: boolean | undefined;
}

export interface ModelMixSetup {
    options?: ModelMixOptions;
    config?: ModelMixConfig;
    mix?: ModelMixMixFlags;
}

export interface ModelAttachArgs {
    options?: ModelMixOptions;
    config?: ModelMixConfig;
    mix?: ModelMixMixFlags;
}

export interface RoleOptions {
    role?: MessageRole;
    /** Provider-neutral explicit cache breakpoint, translated by each adapter. */
    cache?: CacheBreakpoint;
}

export interface TextContentPart {
    type: 'text';
    text: string;
    cache?: CacheBreakpoint;
    cache_control?: AnthropicCacheControl;
}

export interface ImageContentPart {
    type: 'image';
    source: {
        type: 'base64' | 'url' | 'file' | 'buffer' | string;
        media_type?: string;
        data: string | Buffer;
    };
    cache?: CacheBreakpoint;
    cache_control?: AnthropicCacheControl;
}

export type ContentPart = TextContentPart | ImageContentPart | Record<string, unknown>;

export interface ChatMessage {
    role: MessageRole;
    content?: string | ContentPart[] | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
    [key: string]: unknown;
}

export interface ToolCall {
    id?: string;
    type?: string;
    name?: string;
    input?: unknown;
    arguments?: unknown;
    function?: {
        name: string;
        arguments: string | Record<string, unknown>;
    };
}

export interface TokenCostBreakdown {
    uncachedInput: number;
    cachedInput: number;
    cacheWrite: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    output: number;
    total: number;
}

export interface TokenUsage {
    input: number;
    /** Generated tokens excluding separately reported reasoning. */
    output: number;
    /** Internal reasoning tokens billed at the output rate when reported separately. */
    thinking: number;
    total: number;
    cached: number;
    cacheWrite: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    uncachedInput: number;
    cacheHitRate: number;
    /** USD avoided versus billing cache reads at the uncached input rate. */
    cacheSavings: number;
    /** Extra USD paid for cache writes versus ordinary uncached input. */
    cacheWritePremium: number;
    /** Full future cache hits needed to recover the current write premium. */
    breakEvenHits: number;
    /** USD charged by OpenRouter when available, otherwise the catalog estimate. */
    cost: number;
    /** Catalog-based estimate; its total can differ from the reported charge in cost. */
    costBreakdown: TokenCostBreakdown;
    speed?: number;
}

export interface ModelMixResult {
    message?: string;
    think?: string | null;
    signature?: string | null;
    toolCalls?: ToolCall[];
    tokens?: TokenUsage;
    response?: unknown;
    assistantMessage?: ChatMessage;
    execution?: PluginExecutionMetadata;
    moderation?: ModerationResult[];
    [key: string]: unknown;
}

export interface ModerationCategories {
    harassment: boolean;
    'harassment/threatening': boolean;
    hate: boolean;
    'hate/threatening': boolean;
    illicit: boolean | null;
    'illicit/violent': boolean | null;
    'self-harm': boolean;
    'self-harm/instructions': boolean;
    'self-harm/intent': boolean;
    sexual: boolean;
    'sexual/minors': boolean;
    violence: boolean;
    'violence/graphic': boolean;
}

export type ModerationCategoryScores = Record<keyof ModerationCategories, number>;
export type ModerationAppliedInputTypes = Record<keyof ModerationCategories, Array<'text' | 'image'>>;

export interface ModerationResult {
    flagged: boolean;
    categories: ModerationCategories;
    category_scores: ModerationCategoryScores;
    category_applied_input_types: ModerationAppliedInputTypes;
}

export type ModelMixOutputMode = 'message' | 'json' | 'block' | 'raw' | 'stream';

export interface PluginExecutionMetadata {
    executionId: string;
    parentExecutionId: string | null;
    depth: number;
}

export type PluginInheritancePolicy =
    | 'inherit'
    | 'none'
    | { include: string[] }
    | { exclude: string[] };

export interface ChildInvocation {
    system?: string;
    systemFile?: string;
    assign?: Record<string, unknown>;
    messages: ChatMessage[];
    tools?: ToolWithCallback[];
    options?: ModelMixOptions;
    config?: ModelMixConfig;
    mix?: ModelMixMixFlags;
    model?: ModelMix;
    plugins?: PluginInheritancePolicy;
    history?: false;
    outputMode?: ModelMixOutputMode;
}

export interface PluginExecutionContext {
    request: {
        system: string;
        messages: ChatMessage[];
        tools: ToolWithCallback[];
        options: ModelMixOptions;
        config: ModelMixConfig;
        outputMode: ModelMixOutputMode;
    };
    execution: Readonly<PluginExecutionMetadata>;
    signal?: AbortSignal;
    invoke(input: ChildInvocation): Promise<ModelMixResult>;
}

export interface ModelMixPlugin {
    name: string;
    execute(
        context: PluginExecutionContext,
        next: () => Promise<ModelMixResult>
    ): Promise<ModelMixResult>;
}

export interface StreamChunk {
    response: unknown;
    message: string;
    delta: string;
}

export type StreamCallback = (chunk: StreamChunk) => void;

export interface SchemaFieldDescriptor {
    description?: string;
    required?: boolean;
    enum?: unknown[];
    default?: unknown;
    nullable?: boolean;
    [key: string]: unknown;
}

export type SchemaDescription =
    | string
    | SchemaFieldDescriptor
    | SchemaDescription[]
    | { [key: string]: SchemaDescription };

export interface JsonMethodOptions {
    type?: string;
    addExample?: boolean;
    addSchema?: boolean;
    addNote?: boolean;
}

export interface BlockOptions {
    addSystemExtra?: boolean;
}

export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    [key: string]: unknown;
}

export type ToolCallback = (
    args: Record<string, unknown>,
    signal?: AbortSignal
) => unknown | Promise<unknown>;

export interface ToolWithCallback {
    tool: ToolDefinition;
    callback: ToolCallback;
}

export interface ListedTools {
    local: ToolDefinition[];
    mcp: ToolDefinition[];
}

export interface AttachedModel {
    key: string;
    provider: MixCustom;
}

export interface ProviderConstructorArgs {
    config?: ModelMixConfig & {
        url?: string;
        apiKey?: string;
        [key: string]: unknown;
    };
    options?: ModelMixOptions;
    headers?: Record<string, string>;
}

export interface CreateArgs {
    config?: ModelMixConfig;
    options?: ModelMixOptions;
    signal?: AbortSignal;
    outputMode?: ModelMixOutputMode;
}

export type ProviderFamily =
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'deepseek'
    | 'minimax'
    | string;

export interface MissingApiKey {
    provider: string;
    env: string;
    model?: string;
}

/** Thrown when attaching a model whose provider has no API key (code 'MISSING_API_KEY'). */
export interface MissingApiKeyError extends Error {
    code: 'MISSING_API_KEY';
    missingKeys: MissingApiKey[];
}

