export interface NumericStats {
  min: number;
  max: number;
  average: number;
  total: number;
}

export interface StringSizeStats {
  characters: NumericStats;
  utf8Bytes: NumericStats;
  lines: NumericStats;
  paragraphs: NumericStats;
}

export interface VariableDescriptor {
  path: string;
  type: string;
  estimatedBytes: number;
  characters?: number;
  utf16CodeUnits?: number;
  utf8Bytes?: number;
  lines?: number;
  paragraphs?: number;
  items?: number;
  itemSize?: NumericStats;
  itemShape?: Record<string, unknown>;
  properties?: number;
  children?: Record<string, VariableDescriptor>;
}

export interface VariableManifest {
  sizeBasis: 'serialized-json-utf8';
  variables: number;
  estimatedBytes: number;
  descriptors: Record<string, VariableDescriptor>;
}

export interface PlannerLimits {
  maxQueryBytes: number;
  sandboxMemoryBytes: number;
  maxConcurrentQueries: number;
  maxCalls: number;
  maxOutputBytes: number;
  maxGeneratedTokens: number;
  maxWallTimeMs: number;
}

export interface MarkdownListItem {
  text: string;
  source: string;
  lists: MarkdownList[];
}

export interface MarkdownList {
  ordered: boolean;
  start: number | null;
  items: MarkdownListItem[];
}

export interface MarkdownSection {
  id: string;
  path: string[];
  title: string;
  depth: number;
  order: number;
  heading: string;
  body: string;
  lists: MarkdownList[];
  children: MarkdownSection[];
}

export interface MarkdownDocument {
  format: 'markdown';
  preamble: {
    source: string;
    lists: MarkdownList[];
  };
  sections: MarkdownSection[];
  stats: {
    characters: number;
    utf16CodeUnits: number;
    utf8Bytes: number;
    lines: number;
    sectionCount: number;
  };
}

export declare function parseMarkdownDocument(source: string): Promise<MarkdownDocument>;

export declare function reconstructMarkdownDocument(document: MarkdownDocument): string;

export declare function describeVariables(
  variables: Record<string, unknown>
): VariableManifest;

export interface PlannerTemplateData {
  variableManifest: string;
  processingLimits: string;
  planningHints: string;
  workerManifest: string;
  outputRequirements: string;
  maxQueryBytes: number;
  maxConcurrentQueries: number;
}

export interface PlannerInvocation {
  systemFile: string;
  assign: PlannerTemplateData;
  messages: Array<{
    role: 'user';
    content: Array<{ type: 'text'; text: string }>;
  }>;
  plugins: { exclude: ['rlm'] };
  history: false;
  outputMode: 'raw';
}

export declare function plannerTemplateData(input: {
  variables: Record<string, unknown>;
  limits: PlannerLimits;
  workerManifest: Record<string, unknown>;
  outputMode?: 'message' | 'json' | 'block' | 'raw';
  outputSchema?: Record<string, unknown> | null;
}): PlannerTemplateData;

export declare function createPlannerInvocation(input: {
  task: string;
  variables: Record<string, unknown>;
  limits: PlannerLimits;
  workerManifest: Record<string, unknown>;
  outputMode?: 'message' | 'json' | 'block' | 'raw';
  outputSchema?: Record<string, unknown> | null;
}): PlannerInvocation;

export interface RlmWorkerMetadata {
  intelligence: number;
  cost: number;
  speed: number;
  description: string;
}

export type RlmWorker = RlmWorkerMetadata & (
  | { model: object; useParent?: never }
  | { model?: never; useParent: true }
);

export interface RlmSandbox {
  execute(input: {
    code: string;
    variables: Record<string, unknown>;
    query: (input: {
      worker: string;
      system: string;
      message: string;
    }) => Promise<string>;
    limits: PlannerLimits;
    execution: {
      executionId: string;
      parentExecutionId: string | null;
      depth: number;
    };
    signal?: AbortSignal;
    timeoutMs: number;
  }): Promise<unknown>;
}

export declare function createIsolatedVmSandbox(): RlmSandbox;

export interface RlmDocumentInput {
  format: 'markdown';
  content: string;
}

export interface RlmOptions {
  maxDepth: number;
  variables?: Record<string, unknown>;
  documents?: Record<string, RlmDocumentInput>;
  workers: Record<string, RlmWorker>;
  limits: PlannerLimits;
  sandbox?: RlmSandbox;
}

export declare class RlmLimitError extends Error {
  limit: string;
}

export declare function createWorkerCatalog(workers: Record<string, RlmWorker>): {
  get(name: string): object | undefined;
  manifest: Record<string, RlmWorkerMetadata>;
};

export declare function rlm(options: RlmOptions): {
  name: 'rlm';
  execute(context: unknown): Promise<Record<string, unknown>>;
};
