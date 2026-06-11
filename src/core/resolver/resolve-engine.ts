import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { hasAzurePipeline } from "../detection/pipeline-files.js";
import { AssessmentEngine } from "../analyzer/assessment-engine.js";
import type { AssessmentResult } from "../analyzer/assessment-engine.js";
import { CicdAnalyzer } from "../analyzer/cicd-analyzer.js";
import { CoverageAnalyzer } from "../analyzer/coverage-analyzer.js";
import { SecurityAnalyzer } from "../analyzer/security-analyzer.js";
import { ReviewAnalyzer } from "../analyzer/review-analyzer.js";
import { DoraAnalyzer } from "../analyzer/dora-analyzer.js";
import { DocsAnalyzer } from "../analyzer/docs-analyzer.js";
import { ConfigManager } from "../config/config-manager.js";
import type { ReadinessScores, TechStack } from "../config/config-schema.js";
import type { Rules } from "../config/rules-schema.js";
import { ResolveError } from "../../utils/errors.js";
import { createAdapterRegistry } from "../../adapters/adapter-registry.js";
import { atomicWrite } from "../../utils/fs.js";

import type {
  CiPlatform,
  DimensionResolver,
  ResolveContext,
  ResolveResult,
} from "./dimension-resolver.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolveEngineOptions {
  repoRoot: string;
  dimensions?: string[];
  dryRun: boolean;
  force: boolean;
}

export interface ResolveReport {
  results: ResolveResult[];
  totalFilesGenerated: number;
  totalFilesSkipped: number;
  previousTotalScore: number;
  expectedTotalScore: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Dimensions that can be auto-resolved (docs and dora cannot)
// ---------------------------------------------------------------------------

const RESOLVABLE_DIMENSIONS = ["cicd", "security", "coverage", "review"];

// ---------------------------------------------------------------------------
// CI platform detection
// ---------------------------------------------------------------------------

function detectCiPlatform(repoRoot: string, manifestPlatform: string): CiPlatform {
  if (manifestPlatform && manifestPlatform !== "none") {
    return manifestPlatform as CiPlatform;
  }
  if (hasAzurePipeline(repoRoot)) {
    return "azure-devops";
  }
  if (existsSync(join(repoRoot, ".github"))) {
    return "github-actions";
  }
  return "github-actions"; // default
}

// ---------------------------------------------------------------------------
// ResolveEngine
// ---------------------------------------------------------------------------

export class ResolveEngine {
  constructor(private readonly resolvers: DimensionResolver[]) {}

  async resolve(options: ResolveEngineOptions): Promise<ResolveReport> {
    const { repoRoot, dryRun, force } = options;
    const configManager = new ConfigManager();
    const warnings: string[] = [];

    // 1. Load manifest and rules
    const manifest = await configManager.loadManifest(repoRoot);
    const rules: Rules = await configManager.loadRules(repoRoot);

    // 2. Run fresh audit
    let assessment: AssessmentResult;
    try {
      const engine = new AssessmentEngine([
        new CicdAnalyzer(),
        new CoverageAnalyzer(),
        new SecurityAnalyzer(),
        new ReviewAnalyzer(),
        new DoraAnalyzer(),
        new DocsAnalyzer(),
      ]);
      assessment = await engine.assess(repoRoot);
    } catch (error) {
      throw new ResolveError(
        `Failed to run assessment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 3. Detect tech stack and CI platform
    let techStack: TechStack = manifest?.techStack ?? "unknown";
    if (!manifest?.techStack) {
      const registry = createAdapterRegistry();
      const detection = await registry.detect(repoRoot);
      techStack = detection?.adapter.name ?? "unknown";
    }
    const ciPlatform: CiPlatform = detectCiPlatform(
      repoRoot,
      manifest?.ciPlatform ?? "none",
    );

    // 4. Filter dimensions
    const requestedDimensions = options.dimensions?.length
      ? options.dimensions.filter((d) => RESOLVABLE_DIMENSIONS.includes(d))
      : RESOLVABLE_DIMENSIONS;

    if (options.dimensions?.length) {
      const invalid = options.dimensions.filter((d) => !RESOLVABLE_DIMENSIONS.includes(d));
      if (invalid.length > 0) {
        warnings.push(
          `Skipping non-resolvable dimensions: ${invalid.join(", ")}. ` +
          `Resolvable: ${RESOLVABLE_DIMENSIONS.join(", ")}.`,
        );
      }
    }

    // 5. Run resolvers sequentially
    const results: ResolveResult[] = [];
    const previousTotalScore = assessment.totalScore;

    for (const resolver of this.resolvers) {
      if (!requestedDimensions.includes(resolver.dimension)) continue;

      const dimKey = resolver.dimension as keyof ReadinessScores;
      const currentScore = assessment.scores[dimKey];
      if (currentScore === undefined) continue;

      const dimResult = assessment.dimensionResults.find(
        (d) => d.dimension === resolver.dimension,
      );
      const action = assessment.improvementPlan.find(
        (a) => a.dimension === resolver.dimension,
      );

      if (!dimResult) continue;

      const ctx: ResolveContext = {
        repoRoot,
        techStack,
        ciPlatform,
        dryRun,
        force,
        currentScore,
        targetScore: action?.targetScore ?? Math.min(5, currentScore + 1),
        dimensionResult: dimResult,
        rules,
        improvementAction: action ?? {
          dimension: resolver.dimension,
          currentScore,
          targetScore: Math.min(5, currentScore + 1),
          action: dimResult.suggestions[0] ?? `Improve ${resolver.dimension}.`,
          estimatedTime: "unknown",
          priority: "medium",
        },
      };

      if (!resolver.canResolve(ctx)) continue;

      try {
        const result = await resolver.resolve(ctx);

        // Write files that are marked as written
        if (!dryRun) {
          for (const file of result.generatedFiles) {
            if (file.written) {
              try {
                await atomicWrite(join(repoRoot, file.relativePath), file.content);
              } catch (error) {
                file.written = false;
                file.skipReason = `Write failed: ${error instanceof Error ? error.message : String(error)}`;
                result.warnings.push(`Failed to write ${file.relativePath}: ${file.skipReason}`);
              }
            }
          }
        }

        results.push(result);
      } catch (error) {
        warnings.push(
          `Resolver for ${resolver.dimension} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 6. Post-resolve integration verification
    //    Check if generated security configs are referenced in existing CI pipeline.
    //    Only warn when CICD resolver did NOT generate a new pipeline (existing pipeline kept).
    const cicdResult = results.find((r) => r.dimension === "cicd");
    const cicdGeneratedNewPipeline = cicdResult?.generatedFiles.some((f) => f.written) ?? false;
    if (!cicdGeneratedNewPipeline) {
      const securityResult = results.find((r) => r.dimension === "security");
      if (securityResult) {
        // Read existing CI pipeline to check references
        let existingPipeline = "";
        const azurePipeline = join(repoRoot, "azure-pipelines.yml");
        if (existsSync(azurePipeline)) {
          try { existingPipeline = readFileSync(azurePipeline, "utf-8"); } catch { /* ignore */ }
        }
        const ghWorkflowDir = join(repoRoot, ".github", "workflows");
        if (existsSync(ghWorkflowDir)) {
          try {
            const { readdirSync } = await import("node:fs");
            for (const f of readdirSync(ghWorkflowDir)) {
              if (f.endsWith(".yml") || f.endsWith(".yaml")) {
                existingPipeline += readFileSync(join(ghWorkflowDir, f), "utf-8") + "\n";
              }
            }
          } catch { /* ignore */ }
        }

        if (existingPipeline) {
          const lower = existingPipeline.toLowerCase();
          const generatedSemgrep = securityResult.generatedFiles.some((f) => f.relativePath === ".semgrep.yml" && f.written);
          if (generatedSemgrep && !lower.includes(".semgrep.yml")) {
            warnings.push("Generated .semgrep.yml but your existing CI pipeline doesn't reference it. Update your semgrep step to use '--config .semgrep.yml'.");
          }
        }
      }
    }

    // 7. Compute totals
    const totalFilesGenerated = results.reduce(
      (sum, r) => sum + r.generatedFiles.filter((f) => f.written).length,
      0,
    );
    const totalFilesSkipped = results.reduce(
      (sum, r) => sum + r.generatedFiles.filter((f) => !f.written).length,
      0,
    );

    // Expected total: replace resolved dimension scores with expected scores
    const expectedScores = { ...assessment.scores };
    for (const result of results) {
      const key = result.dimension as keyof ReadinessScores;
      if (key in expectedScores) {
        expectedScores[key] = result.expectedScore;
      }
    }
    const expectedTotalScore =
      expectedScores.cicd + expectedScores.coverage + expectedScores.security +
      expectedScores.review + expectedScores.dora + expectedScores.docs;

    // 7. Update manifest (unless dry-run)
    if (!dryRun && manifest) {
      manifest.readinessScores = expectedScores;
      manifest.lastAudit = new Date().toISOString();
      try {
        await configManager.saveManifest(manifest, repoRoot);
      } catch (error) {
        warnings.push(
          `Failed to update manifest: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Collect all warnings
    const allWarnings = [
      ...warnings,
      ...results.flatMap((r) => r.warnings),
    ];

    return {
      results,
      totalFilesGenerated,
      totalFilesSkipped,
      previousTotalScore,
      expectedTotalScore,
      warnings: allWarnings,
    };
  }
}
