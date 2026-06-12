import { z } from "zod";

// ---------------------------------------------------------------------------
// Tech stack & wave enums
// ---------------------------------------------------------------------------

export const TechStackSchema = z.enum([
  "typescript",
  "lua",
  "java",
  "dotnet",
  "python",
  "delphi",
  "foxpro",
  "unknown",
]);
// NOTE: Dafke is TypeScript-only. The extra legacy stack identifiers below are
// retained internally so detection/analyzer branches keep compiling, but the
// CLI only ever registers + accepts the TypeScript adapter.
export type TechStack = z.infer<typeof TechStackSchema>;

export const WaveSchema = z.enum(["wave1", "wave2", "wave3"]);
export type Wave = z.infer<typeof WaveSchema>;

// ---------------------------------------------------------------------------
// Readiness scores (6-dimension model, each 0-5)
// ---------------------------------------------------------------------------

export const ReadinessScoreSchema = z.number().int().min(0).max(5);

export const ReadinessScoresSchema = z.object({
  cicd: ReadinessScoreSchema,
  coverage: ReadinessScoreSchema,
  security: ReadinessScoreSchema,
  review: ReadinessScoreSchema,
  dora: ReadinessScoreSchema,
  docs: ReadinessScoreSchema,
});
export type ReadinessScores = z.infer<typeof ReadinessScoresSchema>;

// ---------------------------------------------------------------------------
// AI Share governance tiers
// ---------------------------------------------------------------------------

export const AiShareTierSchema = z.enum([
  "green",
  "optimal",
  "warning",
  "reduction",
]);
export type AiShareTier = z.infer<typeof AiShareTierSchema>;

// ---------------------------------------------------------------------------
// Global user config  (~/.dafke/config.yaml or platform equivalent)
// ---------------------------------------------------------------------------

export const GlobalConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  auth: z
    .object({
      azureDevOps: z
        .object({
          pat: z.string().optional(),
          orgUrl: z.string().url().optional(),
        })
        .optional(),
      github: z
        .object({
          token: z.string().optional(),
        })
        .optional(),
      jira: z
        .object({
          email: z.string().email().optional(),
          apiToken: z.string().optional(),
          siteUrl: z.string().url().optional(),
        })
        .optional(),
      confluence: z
        .object({
          email: z.string().email().optional(),
          apiToken: z.string().optional(),
          siteUrl: z.string().url().optional(),
        })
        .optional(),
      sonarqube: z
        .object({
          token: z.string().optional(),
          serverUrl: z.string().url().optional(),
        })
        .optional(),
    })
    .default({}),
  preferences: z
    .object({
      defaultProvider: z
        .enum(["azure-devops", "github"])
        .default("azure-devops"),
      language: z.string().default("en"),
      colorOutput: z.boolean().default(true),
    })
    .default(() => ({ defaultProvider: "azure-devops" as const, language: "en", colorOutput: true })),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// ---------------------------------------------------------------------------
// Backlog provider  (Azure DevOps Boards or Jira)
// ---------------------------------------------------------------------------

export const BacklogProviderSchema = z.object({
  type: z.enum(["azure-devops", "jira"]),
  organization: z.string().optional(),
  project: z.string(),
  team: z.string().optional(),
});
export type BacklogProvider = z.infer<typeof BacklogProviderSchema>;

// ---------------------------------------------------------------------------
// External tools declarations (per-dimension)
// ---------------------------------------------------------------------------

const ToolCategorySchema = z.enum([
  "sast", "secrets", "sca", "dast", "sbom",  // security categories
  "lint", "test", "deploy",                   // cicd categories
]);

const ExternalToolDeclarationSchema = z.object({
  tool: z.string(),
  category: ToolCategorySchema.optional(),
  evidence: z.string().optional(),
  url: z.string().optional(),
  pages: z.array(z.string()).optional(),
});
export type ExternalToolDeclaration = z.infer<typeof ExternalToolDeclarationSchema>;

const ExternalReviewPracticeSchema = z.object({
  practice: z.string(),
});

const ExternalDoraConfigSchema = z.object({
  deploymentSignal: z.enum(["git-tags", "manual"]).default("git-tags"),
  deploymentsLast90Days: z.number().int().min(0).optional(),
  deploymentEvidence: z.string().optional(),
});
export type ExternalDoraConfig = z.infer<typeof ExternalDoraConfigSchema>;

const ExternalCoverageConfigSchema = z.object({
  sonarProjectKey: z.string().optional(),
});
export type ExternalCoverageConfig = z.infer<typeof ExternalCoverageConfigSchema>;

export const ExternalToolsConfigSchema = z.object({
  security: z.array(ExternalToolDeclarationSchema).default([]),
  coverage: ExternalCoverageConfigSchema.default(() => ({ sonarProjectKey: undefined })),
  docs: z.array(ExternalToolDeclarationSchema).default([]),
  cicd: z.array(ExternalToolDeclarationSchema).default([]),
  dora: ExternalDoraConfigSchema.default(() => ({ deploymentSignal: "git-tags" as const })),
  review: z.array(ExternalReviewPracticeSchema).default([]),
}).default(() => ({
  security: [],
  coverage: {},
  docs: [],
  cicd: [],
  dora: { deploymentSignal: "git-tags" as const },
  review: [],
}));
export type ExternalToolsConfig = z.infer<typeof ExternalToolsConfigSchema>;

// ---------------------------------------------------------------------------
// Repository manifest  (.dafke/manifest.yaml)
// ---------------------------------------------------------------------------

const ConfluenceFolderSchema = z.object({
  name: z.string(),
  pageId: z.string(),
});

const ConfluenceTopologySchema = z.object({
  cloudId: z.string(),
  spaceId: z.string(),
  spaceKey: z.string(),
  rootFolder: ConfluenceFolderSchema,
  changeLog: ConfluenceFolderSchema,
  featuresFolder: ConfluenceFolderSchema,
  bugsFolder: ConfluenceFolderSchema,
});
export type ConfluenceTopology = z.infer<typeof ConfluenceTopologySchema>;

export const RepoManifestSchema = z.object({
  corulusCcVersion: z.string(),
  configSchemaVersion: z.number().int().default(1),
  lastAudit: z.string().datetime().optional(),
  techStack: TechStackSchema,
  ciPlatform: z
    .enum(["azure-devops", "azure-pipelines", "github-actions", "none"])
    .transform((v) => v === "azure-pipelines" ? "azure-devops" as const : v)
    .default("none"),
  extends: z.string().optional(), // e.g. "@dafke/cc-config-dotnet"
  backlogProvider: BacklogProviderSchema.optional(),
  confluence: ConfluenceTopologySchema.optional(),
  readinessScores: ReadinessScoresSchema.optional(),
  wave: WaveSchema.optional(),
  externalTools: ExternalToolsConfigSchema.optional(),
  overrides: z.record(z.string(), z.unknown()).default({}),
}).passthrough(); // Preserve unknown keys so older CLI versions don't strip new fields
export type RepoManifest = z.infer<typeof RepoManifestSchema>;

// ---------------------------------------------------------------------------
// Wizard state  (.dafke/state.json — resumable wizard progress)
// ---------------------------------------------------------------------------

export const WizardStepSchema = z.enum([
  "auth",
  "detect",
  "assess",
  "external_tools",
  "claude_md",
  "rules",
  "hooks",
  "plugins",
  "ci",
  "coverage",
  "arch",
  "connect",
  "skills",
  "verify",
]);
export type WizardStep = z.infer<typeof WizardStepSchema>;

export const WizardStateSchema = z.object({
  wizardVersion: z.string(),
  startedAt: z.string().datetime(),
  lastStep: WizardStepSchema.optional(),
  completedSteps: z.array(WizardStepSchema).default([]),
  answers: z.record(z.string(), z.unknown()).default({}),
  scores: ReadinessScoresSchema.optional(),
});
export type WizardState = z.infer<typeof WizardStateSchema>;
