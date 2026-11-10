import type { ModelMixPlugin } from '../..';

export interface DatasetOptions {
  /** JSONL file to append examples to, resolved relative to process.cwd(). */
  file: string;
  /** Record the model's reasoning in the final assistant message's `reasoning_content` when available. Defaults to false. */
  think?: boolean;
}

/** Append each successful text execution as a { messages } chat example to a JSONL file. */
export declare function dataset(options: DatasetOptions): ModelMixPlugin;
