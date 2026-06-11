import { TemplateEngine } from "../../scaffold/template-engine.js";
import {
  buildGeneratedFile,
  type DimensionResolver,
  type ResolveContext,
  type ResolveResult,
  type GeneratedFile,
} from "../dimension-resolver.js";

function packageEcosystemFor(techStack: string): string {
  switch (techStack) {
    case "java": return "maven";
    case "dotnet": return "nuget";
    case "typescript": return "npm";
    case "python": return "pip";
    default: return "npm";
  }
}

export class SecurityResolver implements DimensionResolver {
  readonly dimension = "security";

  canResolve(ctx: ResolveContext): boolean {
    return ctx.currentScore < 5;
  }

  async resolve(ctx: ResolveContext): Promise<ResolveResult> {
    const generatedFiles: GeneratedFile[] = [];
    const warnings: string[] = [];
    const engine = new TemplateEngine();
    const vars = { version: "resolve" };

    // 1. Semgrep config (SAST)
    try {
      const content = engine.render("resolve/security/semgrep.yml", vars);
      generatedFiles.push(buildGeneratedFile(ctx, ".semgrep.yml", content));
    } catch (error) {
      warnings.push(`Failed to render semgrep template: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Gitleaks config (secrets)
    try {
      const content = engine.render("resolve/security/gitleaks.toml", vars);
      generatedFiles.push(buildGeneratedFile(ctx, ".gitleaks.toml", content));
    } catch (error) {
      warnings.push(`Failed to render gitleaks template: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. Dependency scanning (SCA) — platform-dependent
    const platform = ctx.ciPlatform !== "none" ? ctx.ciPlatform : "github-actions";
    try {
      if (platform === "github-actions") {
        const content = engine.render("resolve/security/dependabot.yml", {
          ...vars,
          packageEcosystem: packageEcosystemFor(ctx.techStack),
        });
        generatedFiles.push(buildGeneratedFile(ctx, ".github/dependabot.yml", content));
      } else {
        const content = engine.render("resolve/security/renovate.json", vars);
        generatedFiles.push(buildGeneratedFile(ctx, "renovate.json", content));
        warnings.push("Renovate requires the Mend Renovate service to be enabled on your Azure DevOps org or GitHub repo.");
      }
    } catch (error) {
      warnings.push(`Failed to render dependency scanning template: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Integration warning for semgrep config
    warnings.push("Ensure your CI pipeline uses '--config .semgrep.yml' alongside '--config auto' in its semgrep scan step.");

    // Expected score based on what we generated (SBOM requires CI integration, not a placeholder file)
    const writtenCount = generatedFiles.filter((f) => f.written || ctx.dryRun).length;
    const hasBaseline = writtenCount >= 3; // semgrep + gitleaks + SCA
    const expectedScore = hasBaseline ? 4 : writtenCount >= 2 ? 3 : Math.min(5, ctx.currentScore + 1);

    return {
      dimension: this.dimension,
      generatedFiles,
      previousScore: ctx.currentScore,
      expectedScore: Math.min(5, expectedScore),
      summary: "Generated SAST (Semgrep), secrets detection (Gitleaks), and dependency scanning configs.",
      warnings,
    };
  }
}
