import type { ModelMixPlugin } from '../..';

export interface SkillsOptions {
  /** Explicit skill directories or SKILL.md files, resolved relative to process.cwd(). */
  paths: string[];
}

/** Load local skill metadata and expose instructions and references through read_skill. */
export declare function skills(options: SkillsOptions): Promise<ModelMixPlugin>;
