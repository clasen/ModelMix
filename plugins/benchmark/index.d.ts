import type { ChatMessage, ModelMixPlugin, TokenUsage } from '../..';

export interface BenchmarkOptions {
  criteriaModel: string;
  models: string[];
}

export interface BenchmarkModel {
  id: string;
  shortcut: string;
  effort: number | null;
  canonicalModel: string;
}

export interface BenchmarkCriterion {
  id: string;
  description: string;
}

export interface BenchmarkScore {
  criterionId: string;
  score: number;
  justification: string;
}

export interface BenchmarkCallMetrics {
  elapsedMs: number;
  tokens: Partial<TokenUsage> | null;
  cost: number | null;
}

export interface BenchmarkEvaluation {
  judge: BenchmarkModel;
  scores: BenchmarkScore[];
  metrics: BenchmarkCallMetrics;
}

export interface BenchmarkCriterionAverage {
  criterionId: string;
  score: number | null;
}

export interface BenchmarkResult {
  id: string;
  shortcut: string;
  effort: number | null;
  canonicalModel: string;
  response: string | null;
  responseMetrics: BenchmarkCallMetrics | null;
  evaluations: BenchmarkEvaluation[];
  averages: BenchmarkCriterionAverage[] | null;
  score: number | null;
  evaluationCount: {
    expected: number;
    valid: number;
  };
}

export interface BenchmarkErrorDetails {
  name: string;
  message: string;
  code?: unknown;
  statusCode?: unknown;
  details?: unknown;
}

export interface BenchmarkError {
  stage: 'response' | 'evaluation';
  participant: string;
  judge?: string;
  error: BenchmarkErrorDetails;
  metrics: BenchmarkCallMetrics;
}

export interface BenchmarkTokenTotals {
  input?: number;
  output?: number;
  thinking?: number;
  total?: number;
  cached?: number;
  cacheWrite?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  uncachedInput?: number;
}

export interface BenchmarkReport {
  task: {
    system: string;
    messages: ChatMessage[];
  };
  criteria: {
    model: BenchmarkModel;
    items: BenchmarkCriterion[];
    metrics: BenchmarkCallMetrics;
  };
  results: BenchmarkResult[];
  errors: BenchmarkError[];
  metrics: {
    elapsedMs: number;
    tokens: BenchmarkTokenTotals | null;
    cost: number | null;
    calls: {
      attempted: number;
      withTokens: number;
      withCost: number;
    };
  };
}

export declare function benchmark(options: BenchmarkOptions): ModelMixPlugin;
