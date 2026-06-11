/**
 * Base interface and types for readiness dimension resolvers.
 *
 * Each resolver generates configuration files to improve a specific
 * dimension of the 6-dimension readiness scoring model.
 */

import type { DimensionResult } from "../analyzer/dimension-analyzer.js";
import type { ImprovementAction } from "../analyzer/assessment-engine.js";
import type { TechStack } from "../config/config-schema.js";
import type { Rules } from "../config/rules-schema.js";

export type CiPlatform = "azure-devops" | "github-actions" | "none";

export interface ResolveContext {
  repoRoot: string;
  techStack: TechStack;
  ciPlatform: CiPlatform;
  dryRun: boolean;
  force: boolean;
  currentScore: number;
  targetScore: number;
  dimensionResult: DimensionResult;
  improvementAction: ImprovementAction;
  rules: Rules;
}

export interface GeneratedFile {
  /** Path relative to repoRoot. */
  relativePath: string;
  /** Rendered content to write. */
  content: string;
  /** Whether a file already existed at this path. */
  existedBefore: boolean;
  /** Whether the file was actually written (false in dry-run or if existed and !force). */
  written: boolean;
  /** Why it was skipped, if applicable. */
  skipReason?: string;
}

export interface ResolveResult {
  dimension: string;
  generatedFiles: GeneratedFile[];
  previousScore: number;
  expectedScore: number;
  summary: string;
  warnings: string[];
}

export interface DimensionResolver {
  /** Identifier matching a key in ReadinessScores. */
  readonly dimension: string;
  /** Return true if this resolver can meaningfully act on the current state. */
  canResolve(ctx: ResolveContext): boolean;
  /** Execute the resolution, generating files. */
  resolve(ctx: ResolveContext): Promise<ResolveResult>;
}

// ---------------------------------------------------------------------------
// Shared helper for building GeneratedFile entries
// ---------------------------------------------------------------------------

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Build a GeneratedFile entry, handling dry-run / force / exists logic.
 */
export function buildGeneratedFile(
  ctx: ResolveContext,
  relativePath: string,
  content: string,
): GeneratedFile {
  const fullPath = join(ctx.repoRoot, relativePath);
  const existedBefore = existsSync(fullPath);

  if (ctx.dryRun) {
    return { relativePath, content, existedBefore, written: false };
  }
  if (existedBefore && !ctx.force) {
    return { relativePath, content, existedBefore: true, written: false, skipReason: "File already exists (use --force to overwrite)" };
  }
  return { relativePath, content, existedBefore, written: true };
}
