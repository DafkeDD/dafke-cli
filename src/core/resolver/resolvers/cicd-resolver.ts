import { hasAzurePipeline } from "../../detection/pipeline-files.js";
import { TemplateEngine } from "../../scaffold/template-engine.js";
import {
  buildGeneratedFile,
  type DimensionResolver,
  type ResolveContext,
  type ResolveResult,
  type GeneratedFile,
} from "../dimension-resolver.js";

const HARD_GATE_THRESHOLD = 3;

function detectCiPlatform(ctx: ResolveContext): "github-actions" | "azure-devops" {
  if (ctx.ciPlatform !== "none") {
    return ctx.ciPlatform as "github-actions" | "azure-devops";
  }
  if (hasAzurePipeline(ctx.repoRoot)) {
    return "azure-devops";
  }
  return "github-actions";
}

export class CicdResolver implements DimensionResolver {
  readonly dimension = "cicd";

  canResolve(ctx: ResolveContext): boolean {
    // Resolve at any score < 5: generates full pipeline at 0-2, no-ops at 3+ if pipeline exists
    return ctx.currentScore < 5;
  }

  async resolve(ctx: ResolveContext): Promise<ResolveResult> {
    const generatedFiles: GeneratedFile[] = [];
    const warnings: string[] = [];
    const platform = detectCiPlatform(ctx);

    const engine = new TemplateEngine();

    const templatePath = platform === "github-actions"
      ? "ci/github-actions/quality-gates.yml"
      : "ci/azure-devops/quality-gates.yml";

    const outputPath = platform === "github-actions"
      ? ".github/workflows/quality-gates.yml"
      : "azure-pipelines.yml";

    try {
      const content = engine.render(templatePath, {
        version: "resolve",
        techStack: ctx.techStack,
        coverageThreshold: String(ctx.rules.governance.coverageThreshold),
        prSizeLimit: String(ctx.rules.governance.prSizeLimit),
        curlyOpen: "{",
        curlyClose: "}",
      });

      generatedFiles.push(buildGeneratedFile(ctx, outputPath, content));
    } catch (error) {
      warnings.push(
        `Failed to render CI template: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      dimension: this.dimension,
      generatedFiles,
      previousScore: ctx.currentScore,
      expectedScore: Math.min(5, Math.max(HARD_GATE_THRESHOLD, ctx.currentScore + 2)),
      summary: `Generated ${platform} CI pipeline with tests, lint, SAST, and secrets scanning.`,
      warnings,
    };
  }
}
