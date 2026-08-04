/**
 * Type definitions for modelmix
 * @see https://github.com/clasen/ModelMix
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | string;

export type DebugLevel = 0 | 1 | 2 | 3 | 4;

/** Unified effort: -1 = adaptive, 0–100 = intensity. */
export type EffortValue = number;

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
  [key: string]: unknown;
}

export interface ModelMixConfig {
  system?: string;
  /** 0 = stateless, N = last N messages, -1 = unlimited */
  max_history?: number;
  /** 0=silent, 1=minimal, 2=summary, 3=full, 4=verbose */
  debug?: DebugLevel | number;
  bottleneck?: BottleneckConfig;
  retry?: RetryConfig;
  roundRobin?: boolean;
  /** Unified effort (-1 adaptive, or 0–100). Not a native provider field. */
  effort?: EffortValue | null;
  replace?: Record<string, string>;
  schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModelMixMixFlags {
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
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  source: {
    type: 'base64' | 'url' | 'file' | 'buffer' | string;
    media_type?: string;
    data: string | Buffer;
  };
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

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cached: number;
  cost?: number | null;
  speed?: number;
}

export interface ModelMixResult {
  message?: string;
  think?: string | null;
  signature?: string;
  toolCalls?: ToolCall[];
  tokens?: TokenUsage;
  response?: unknown;
  assistantMessage?: ChatMessage;
  [key: string]: unknown;
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
  args: Record<string, unknown>
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
}

export type ProviderFamily =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'minimax'
  | string;

export declare class ModelMix {
  models: AttachedModel[];
  messages: ChatMessage[];
  tools: Record<string, ToolDefinition[]>;
  toolClient: Record<string, unknown>;
  mcp: Record<string, unknown>;
  options: ModelMixOptions;
  config: ModelMixConfig;
  mix: ModelMixMixFlags;
  lastRaw: ModelMixResult | null;
  streamCallback: StreamCallback | null;

  constructor(setup?: ModelMixSetup);

  static new(setup?: ModelMixSetup): ModelMix;
  static formatJSON(obj: unknown): string;
  static formatMessage(message: unknown): unknown;
  static truncate(str: string, maxLen?: number): string;
  static calculateCost(
    modelKey: string,
    tokens: { input: number; output: number }
  ): number | null;
  static extractCacheTokens(usage?: Record<string, unknown>): number;
  static formatInputSummary(
    messages: ChatMessage[],
    system: string,
    debug?: number
  ): string;
  static formatOutputSummary(result: ModelMixResult, debug: number): string;
  static hasToolInteraction(message: ChatMessage | null | undefined): boolean;

  new(setup?: ModelMixSetup): ModelMix;
  replace(keyValues: Record<string, string>): this;
  effort(value: EffortValue): this;
  attach(key: string, provider: MixCustom): this;

  // OpenAI
  gpt41(args?: ModelAttachArgs): this;
  gpt41mini(args?: ModelAttachArgs): this;
  gpt41nano(args?: ModelAttachArgs): this;
  gpt5(args?: ModelAttachArgs): this;
  gpt5mini(args?: ModelAttachArgs): this;
  gpt5nano(args?: ModelAttachArgs): this;
  gpt51(args?: ModelAttachArgs): this;
  gpt52(args?: ModelAttachArgs): this;
  gpt54(args?: ModelAttachArgs): this;
  gpt54mini(args?: ModelAttachArgs): this;
  gpt54nano(args?: ModelAttachArgs): this;
  gpt54pro(args?: ModelAttachArgs): this;
  gpt55(args?: ModelAttachArgs): this;
  gpt55pro(args?: ModelAttachArgs): this;
  gpt56sol(args?: ModelAttachArgs): this;
  gpt56terra(args?: ModelAttachArgs): this;
  gpt56luna(args?: ModelAttachArgs): this;
  gptRealtime(args?: ModelAttachArgs): this;
  gptRealtimeMini(args?: ModelAttachArgs): this;
  gpt53codex(args?: ModelAttachArgs): this;
  gpt53chat(args?: ModelAttachArgs): this;
  gptOss(args?: ModelAttachArgs): this;

  // Anthropic
  fable5(args?: ModelAttachArgs): this;
  fable5think(args?: ModelAttachArgs): this;
  opus5(args?: ModelAttachArgs): this;
  opus5think(args?: ModelAttachArgs): this;
  opus48think(args?: ModelAttachArgs): this;
  opus47think(args?: ModelAttachArgs): this;
  opus46think(args?: ModelAttachArgs): this;
  opus48(args?: ModelAttachArgs): this;
  opus47(args?: ModelAttachArgs): this;
  opus46(args?: ModelAttachArgs): this;
  opus41(args?: ModelAttachArgs): this;
  opus41think(args?: ModelAttachArgs): this;
  sonnet5(args?: ModelAttachArgs): this;
  sonnet5think(args?: ModelAttachArgs): this;
  sonnet4(args?: ModelAttachArgs): this;
  sonnet4think(args?: ModelAttachArgs): this;
  sonnet46(args?: ModelAttachArgs): this;
  sonnet46think(args?: ModelAttachArgs): this;
  sonnet45(args?: ModelAttachArgs): this;
  sonnet45think(args?: ModelAttachArgs): this;
  haiku35(args?: ModelAttachArgs): this;
  haiku45(args?: ModelAttachArgs): this;
  haiku45think(args?: ModelAttachArgs): this;

  // Google
  gemini25flash(args?: ModelAttachArgs): this;
  gemini31pro(args?: ModelAttachArgs): this;
  gemini3pro(args?: ModelAttachArgs): this;
  gemini3flash(args?: ModelAttachArgs): this;
  gemini36flash(args?: ModelAttachArgs): this;
  gemini35flash(args?: ModelAttachArgs): this;
  gemini31flashLite(args?: ModelAttachArgs): this;
  gemini25pro(args?: ModelAttachArgs): this;

  // Perplexity
  sonarPro(args?: ModelAttachArgs): this;
  sonar(args?: ModelAttachArgs): this;

  // Grok
  grok43(args?: ModelAttachArgs): this;
  grok420multiAgent(args?: ModelAttachArgs): this;
  grok420think(args?: ModelAttachArgs): this;
  grok420(args?: ModelAttachArgs): this;
  grok41think(args?: ModelAttachArgs): this;
  grok41(args?: ModelAttachArgs): this;

  // Multi-provider
  qwen3(args?: ModelAttachArgs): this;
  qwen36plus(args?: ModelAttachArgs): this;
  hermes3(args?: ModelAttachArgs): this;
  kimiK26think(args?: ModelAttachArgs): this;
  kimiK27Code(args?: ModelAttachArgs): this;
  kimiK3(args?: ModelAttachArgs): this;
  kimiK25think(args?: ModelAttachArgs): this;
  lmstudio(model?: string, args?: ModelAttachArgs): this;
  minimaxM25(args?: ModelAttachArgs): this;
  minimaxM27(args?: ModelAttachArgs): this;
  minimaxM3(args?: ModelAttachArgs): this;
  mimo25(args?: ModelAttachArgs): this;
  mimo25pro(args?: ModelAttachArgs): this;
  deepseekV4Pro(args?: ModelAttachArgs): this;
  deepseekV4Flash(args?: ModelAttachArgs): this;
  GLM51(args?: ModelAttachArgs): this;
  GLM52(args?: ModelAttachArgs): this;
  GLM5(args?: ModelAttachArgs): this;

  addText(text: string, options?: RoleOptions): this;
  addTextFromFile(filePath: string, options?: RoleOptions): this;
  setSystem(text: string): this;
  setSystemFromFile(filePath: string): this;
  addImageFromBuffer(buffer: Buffer, options?: RoleOptions): this;
  addImage(filePath: string, options?: RoleOptions): this;
  addImageFromUrl(url: string, options?: RoleOptions): Promise<this>;
  processImages(): Promise<void>;

  message(): Promise<string>;
  json<T = unknown>(
    schemaExample?: T | T[] | null,
    schemaDescription?: SchemaDescription,
    options?: JsonMethodOptions
  ): Promise<T>;
  block(options?: BlockOptions): Promise<string>;
  raw(): Promise<ModelMixResult>;
  stream(callback: StreamCallback): Promise<ModelMixResult>;

  replaceKeyFromFile(key: string, filePath: string): this;
  groupByRoles(messages: ChatMessage[]): ChatMessage[];
  applyTemplate(): void;
  prepareMessages(): Promise<void>;
  readFile(filePath: string, options?: { encoding?: BufferEncoding | null }): string | Buffer;
  execute(args?: CreateArgs): Promise<ModelMixResult>;
  processToolCalls(toolCalls: ToolCall[]): Promise<
    Array<{ name: string; tool_call_id: string; content: string }>
  >;

  addMCP(...npxArgs: string[]): Promise<void>;
  addTool(toolDefinition: ToolDefinition, callback: ToolCallback): this;
  addTools(toolsWithCallbacks: ToolWithCallback[]): this;
  removeTool(toolName: string): this;
  listTools(): ListedTools;
}

export declare class MixCustom {
  config: ModelMixConfig & { url?: string; apiKey?: string };
  options: ModelMixOptions;
  headers: Record<string, string>;
  streamCallback: StreamCallback | null;

  constructor(args?: ProviderConstructorArgs);

  getDefaultOptions(customOptions?: ModelMixOptions): ModelMixOptions;
  getDefaultConfig(customConfig?: Record<string, unknown>): Record<string, unknown>;
  getDefaultHeaders(customHeaders?: Record<string, string>): Record<string, string>;
  convertMessages(messages: ChatMessage[], config?: ModelMixConfig): ChatMessage[];

  static stripContentTypeHeader(headers?: Record<string, string>): Record<string, string>;
  static createMultipartFormData(args?: {
    fields?: Record<string, unknown>;
    files?: unknown[];
  }): { body: Buffer; headers: Record<string, string> };
  static buildRequestBodyAndHeaders(
    options: ModelMixOptions,
    headers: Record<string, string>
  ): { body: unknown; headers: Record<string, string>; options: ModelMixOptions };
  static extractMessage(data: unknown): string;
  static extractThink(data: unknown): string | null;
  static extractToolCalls(data: unknown): ToolCall[];
  static extractTokens(data: unknown): TokenUsage;

  create(args?: CreateArgs): Promise<ModelMixResult>;
  handleError(
    error: unknown,
    context: CreateArgs
  ): {
    message: string;
    statusCode: number | null;
    details: unknown;
    stack?: string;
    config?: ModelMixConfig;
    options?: ModelMixOptions;
  };
  processStream(response: { data: NodeJS.ReadableStream }): Promise<ModelMixResult>;
  extractDelta(data: unknown): string;
  processResponse(response: { data: unknown }): ModelMixResult;
  getOptionsTools(tools: Record<string, ToolDefinition[]>): Partial<ModelMixOptions>;
}

export declare class MixOpenAI extends MixCustom {}
export declare class MixOpenAIResponses extends MixOpenAI {}
export declare class MixOpenAIWebSocket extends MixOpenAIResponses {}
export declare class MixOpenRouter extends MixOpenAI {}
export declare class MixKimi extends MixOpenAI {}
export declare class MixAnthropic extends MixCustom {}
export declare class MixMiniMax extends MixOpenAI {}
export declare class MixMiMo extends MixOpenAI {}
export declare class MixPerplexity extends MixCustom {}
export declare class MixOllama extends MixCustom {}
export declare class MixGrok extends MixOpenAI {}
export declare class MixLambda extends MixCustom {}
export declare class MixLMStudio extends MixCustom {}
export declare class MixGroq extends MixCustom {}
export declare class MixTogether extends MixCustom {}
export declare class MixCerebras extends MixCustom {}
export declare class MixFireworks extends MixCustom {}
export declare class MixNVIDIA extends MixCustom {}
export declare class MixGoogle extends MixCustom {}

/** Normalize unified effort to integer -1 or 0..100. */
export function normalizeEffort(value: unknown): EffortValue;

/** Map unified effort onto provider-native option fields (no-op if native already set). */
export function applyUnifiedEffort(
  options: ModelMixOptions,
  config: ModelMixConfig,
  providerFamily: ProviderFamily,
  modelKey?: string
): ModelMixOptions;

/** Resolve provider family from a Mix* instance. */
export function resolveProviderFamily(providerInstance: MixCustom): ProviderFamily;
