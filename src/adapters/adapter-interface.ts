import type { TechStack } from "../core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Adapter configuration types
// ---------------------------------------------------------------------------

export interface CoverageConfig {
  tool: string;
  command: string;
  reportPath: string;
  reportFormat: "cobertura" | "lcov" | "jacoco" | "clover";
}

export interface MutationConfig {
  tool: string;
  command: string;
  configFile: string;
  supported: boolean;
}

export interface SecurityConfig {
  sastTools: string[];
  secretsDetection: string;
  scaTools: string[];
}

export interface BuildInfo {
  buildTool: string;
  buildCommand: string;
  testCommand: string;
  lintCommand: string | null;
}

// ---------------------------------------------------------------------------
// Detection & analysis results
// ---------------------------------------------------------------------------

export interface DetectionResult {
  detected: boolean;
  confidence: number; // 0-1
  indicators: string[]; // files/patterns that triggered detection
}

export interface AnalysisResult {
  techStack: TechStack;
  buildInfo: BuildInfo;
  entryPoints: string[];
  testFramework: string | null;
  coverageToolDetected: boolean;
  existingCoverage: number | null; // percentage if available
  hasCI: boolean;
  hasSAST: boolean;
  hasSecretsDetection: boolean;
  dependencies: { total: number; outdated: number };
}

// ---------------------------------------------------------------------------
// TechnologyAdapter interface
// ---------------------------------------------------------------------------

export interface TechnologyAdapter {
  readonly name: TechStack;
  readonly displayName: string;

  detect(repoRoot: string): Promise<DetectionResult>;
  analyze(repoRoot: string): Promise<AnalysisResult>;
  getCoverageConfig(): CoverageConfig;
  getMutationConfig(): MutationConfig;
  getSecurityConfig(): SecurityConfig;
  getBuildInfo(repoRoot: string): Promise<BuildInfo>;
  getClaudeMdSection(): string;
  getCITemplateId(): string;

  /** Returns rule template names for .claude/rules/ generation. Optional — falls back to global-only. */
  getInstructionTemplates?(): string[];
}
