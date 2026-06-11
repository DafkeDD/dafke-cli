/**
 * Base interface and types for readiness assessment dimension analyzers.
 *
 * Each analyzer evaluates a single dimension of the 6-dimension readiness
 * scoring model (0-5 scale per dimension).
 */

import type { RepoManifest, GlobalConfig } from "../config/config-schema.js";
import type { SonarQubeClient } from "../../integrations/sonarqube/client.js";

export interface AnalyzerContext {
  /** Repository root path (same as the first positional argument). */
  repoRoot: string;
  /** Parsed repo manifest, if one exists. */
  manifest?: RepoManifest;
  /** User-level global config (auth, preferences). */
  globalConfig?: GlobalConfig;
  /** Pre-configured SonarQube client, if auth is available. */
  sonarqubeClient?: SonarQubeClient;
}

export interface DimensionResult {
  /** Name of the assessed dimension (e.g. "cicd", "security"). */
  dimension: string;
  /** Numeric score from 0 (worst) to 5 (best). */
  score: number;
  /** Human-readable summary of the score. */
  details: string;
  /** Concrete evidence found (or not found) during analysis. */
  evidence: string[];
  /** Actionable suggestions to improve the score. */
  suggestions: string[];
  /** Human-readable explanation of why this score was given and what would change it. */
  scoringRationale?: string;
}

export interface DimensionAnalyzer {
  /** Identifier that matches a key in ReadinessScores. */
  readonly dimension: string;
  /** Run analysis against the repository rooted at `repoRoot`. */
  analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult>;
}
