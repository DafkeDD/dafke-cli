import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import type { ResolveContext } from "../../src/core/resolver/dimension-resolver.js";
import type { DimensionResult } from "../../src/core/analyzer/dimension-analyzer.js";
import type { ImprovementAction } from "../../src/core/analyzer/assessment-engine.js";
import { RulesSchema } from "../../src/core/config/rules-schema.js";
import { CicdResolver } from "../../src/core/resolver/resolvers/cicd-resolver.js";
import { SecurityResolver } from "../../src/core/resolver/resolvers/security-resolver.js";
import { CoverageResolver } from "../../src/core/resolver/resolvers/coverage-resolver.js";
import { ReviewResolver } from "../../src/core/resolver/resolvers/review-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-resolve-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeDimensionResult(dimension: string, score: number): DimensionResult {
  return {
    dimension,
    score,
    details: `Test result for ${dimension}`,
    evidence: [],
    suggestions: [`Improve ${dimension}.`],
  };
}

function makeAction(dimension: string, currentScore: number, targetScore: number): ImprovementAction {
  return {
    dimension,
    currentScore,
    targetScore,
    action: `Improve ${dimension}.`,
    estimatedTime: "1-2 weeks",
    priority: "critical",
  };
}

function makeContext(
  repoRoot: string,
  dimension: string,
  overrides: Partial<ResolveContext> = {},
): ResolveContext {
  const currentScore = overrides.currentScore ?? 0;
  const targetScore = overrides.targetScore ?? 3;
  return {
    repoRoot,
    techStack: "typescript",
    ciPlatform: "github-actions",
    dryRun: false,
    force: false,
    currentScore,
    targetScore,
    dimensionResult: makeDimensionResult(dimension, currentScore),
    improvementAction: makeAction(dimension, currentScore, targetScore),
    rules: RulesSchema.parse({}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CicdResolver
// ---------------------------------------------------------------------------

describe("CicdResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("canResolve returns true when score < 3", () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { currentScore: 0 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns true when score is 2", () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { currentScore: 2 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns true when score is 3 (maturity mode)", () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { currentScore: 3 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns false when score is 5", () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { currentScore: 5 });
    expect(resolver.canResolve(ctx)).toBe(false);
  });

  it("generates GitHub Actions workflow for github-actions platform", async () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.dimension).toBe("cicd");
    expect(result.generatedFiles.length).toBeGreaterThan(0);
    expect(result.generatedFiles[0].relativePath).toBe(".github/workflows/quality-gates.yml");
    expect(result.generatedFiles[0].content).toContain("Quality Gates");
    expect(result.generatedFiles[0].written).toBe(true);
    expect(result.expectedScore).toBeGreaterThanOrEqual(3);
  });

  it("generates Azure Pipelines for azure-devops platform", async () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "azure-devops" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.length).toBeGreaterThan(0);
    expect(result.generatedFiles[0].relativePath).toBe("azure-pipelines.yml");
    expect(result.generatedFiles[0].content).toContain("Quality Gates");
    expect(result.generatedFiles[0].written).toBe(true);
  });

  it("detects azure-devops from filesystem when ciPlatform is none", async () => {
    writeFileSync(join(tempDir, "azure-pipelines.yml"), "trigger: none\n", "utf-8");
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "none" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].relativePath).toBe("azure-pipelines.yml");
  });

  it("defaults to github-actions when ciPlatform is none and no azure files", async () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "none" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].relativePath).toBe(".github/workflows/quality-gates.yml");
  });

  it("skips existing file without --force", async () => {
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "quality-gates.yml"), "existing", "utf-8");

    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].written).toBe(false);
    expect(result.generatedFiles[0].skipReason).toContain("already exists");
    expect(result.generatedFiles[0].existedBefore).toBe(true);
  });

  it("overwrites existing file with --force", async () => {
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "quality-gates.yml"), "existing", "utf-8");

    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { ciPlatform: "github-actions", force: true });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].written).toBe(true);
    expect(result.generatedFiles[0].existedBefore).toBe(true);
  });

  it("dry-run does not mark files as written", async () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { dryRun: true });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].written).toBe(false);
    expect(result.generatedFiles[0].content).toBeTruthy();
  });

  it("returns previousScore and expectedScore in result", async () => {
    const resolver = new CicdResolver();
    const ctx = makeContext(tempDir, "cicd", { currentScore: 1 });
    const result = await resolver.resolve(ctx);

    expect(result.previousScore).toBe(1);
    expect(result.expectedScore).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// SecurityResolver
// ---------------------------------------------------------------------------

describe("SecurityResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("canResolve returns true when score < 3", () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 0 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns true when score is 3 (maturity mode)", () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 3 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("generates semgrep, gitleaks, and dependabot configs for GitHub", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.dimension).toBe("security");
    expect(result.generatedFiles.length).toBe(3);

    const paths = result.generatedFiles.map((f) => f.relativePath);
    expect(paths).toContain(".semgrep.yml");
    expect(paths).toContain(".gitleaks.toml");
    expect(paths).toContain(".github/dependabot.yml");
  });

  it("generates renovate.json instead of dependabot for Azure DevOps", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { ciPlatform: "azure-devops" });
    const result = await resolver.resolve(ctx);

    const paths = result.generatedFiles.map((f) => f.relativePath);
    expect(paths).toContain(".semgrep.yml");
    expect(paths).toContain(".gitleaks.toml");
    expect(paths).toContain("renovate.json");
    expect(paths).not.toContain(".github/dependabot.yml");
  });

  it("uses correct package ecosystem for java", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", {
      ciPlatform: "github-actions",
      techStack: "java",
    });
    const result = await resolver.resolve(ctx);

    const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
    expect(depFile?.content).toContain("maven");
  });

  it("uses correct package ecosystem for dotnet", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", {
      ciPlatform: "github-actions",
      techStack: "dotnet",
    });
    const result = await resolver.resolve(ctx);

    const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
    expect(depFile?.content).toContain("nuget");
  });

  it("skips existing files without --force", async () => {
    writeFileSync(join(tempDir, ".semgrep.yml"), "existing", "utf-8");

    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    const semgrepFile = result.generatedFiles.find((f) => f.relativePath === ".semgrep.yml");
    expect(semgrepFile?.written).toBe(false);
    expect(semgrepFile?.skipReason).toContain("already exists");

    // Other files should still be generated
    const gitleaksFile = result.generatedFiles.find((f) => f.relativePath === ".gitleaks.toml");
    expect(gitleaksFile?.written).toBe(true);
  });

  it("expected score is 4 when all 3 files generated", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 0 });
    const result = await resolver.resolve(ctx);

    expect(result.expectedScore).toBe(4);
  });

  it("dry-run returns files without writing", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { dryRun: true });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.every((f) => !f.written)).toBe(true);
    expect(result.generatedFiles.length).toBe(3);
  });

  it("semgrep content references semgrep scan", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security");
    const result = await resolver.resolve(ctx);

    const semgrep = result.generatedFiles.find((f) => f.relativePath === ".semgrep.yml");
    expect(semgrep?.content).toContain("semgrep");
  });

  it("gitleaks content includes allowlist", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security");
    const result = await resolver.resolve(ctx);

    const gitleaks = result.generatedFiles.find((f) => f.relativePath === ".gitleaks.toml");
    expect(gitleaks?.content).toContain("allowlist");
    expect(gitleaks?.content).toContain("node_modules");
  });
});

// ---------------------------------------------------------------------------
// CoverageResolver
// ---------------------------------------------------------------------------

describe("CoverageResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("canResolve returns true when score < 1", () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 0 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns true when score is 1 (maturity mode)", () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 1 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("generates .nycrc.json for typescript", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "typescript" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.length).toBe(1);
    expect(result.generatedFiles[0].relativePath).toBe(".nycrc.json");
    const content = JSON.parse(result.generatedFiles[0].content);
    expect(content.reporter).toContain("lcov");
    expect(content.lines).toBe(80);
  });

  it("generates coverlet.runsettings for dotnet", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "dotnet" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.length).toBe(1);
    expect(result.generatedFiles[0].relativePath).toBe("coverlet.runsettings");
    expect(result.generatedFiles[0].content).toContain("XPlat Code Coverage");
  });

  it("generates jacoco snippet for java", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "java" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.length).toBe(1);
    expect(result.generatedFiles[0].relativePath).toBe(".dafke/jacoco-snippet.xml");
    expect(result.generatedFiles[0].content).toContain("jacoco-maven-plugin");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("generates coverage guide for unknown tech stack", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "unknown" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.length).toBe(1);
    expect(result.generatedFiles[0].relativePath).toBe(".dafke/coverage-guide.md");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("expected score is at least 1", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 0 });
    const result = await resolver.resolve(ctx);

    expect(result.expectedScore).toBeGreaterThanOrEqual(1);
  });

  it("skips existing file without --force", async () => {
    writeFileSync(join(tempDir, ".nycrc.json"), "{}", "utf-8");

    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "typescript" });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].written).toBe(false);
    expect(result.generatedFiles[0].skipReason).toContain("already exists");
  });

  it("dry-run returns file content without writing", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { techStack: "typescript", dryRun: true });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles[0].written).toBe(false);
    expect(result.generatedFiles[0].content).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ReviewResolver
// ---------------------------------------------------------------------------

describe("ReviewResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("canResolve returns true when score < 3", () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 0 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("canResolve returns true when score is 3 (maturity mode)", () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3 });
    expect(resolver.canResolve(ctx)).toBe(true);
  });

  it("generates CODEOWNERS, PR template, and branch protection for GitHub", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.dimension).toBe("review");
    expect(result.generatedFiles.length).toBe(3);

    const paths = result.generatedFiles.map((f) => f.relativePath);
    expect(paths).toContain(".github/CODEOWNERS");
    expect(paths).toContain(".github/PULL_REQUEST_TEMPLATE.md");
    expect(paths).toContain(".github/settings.yml");
  });

  it("generates CODEOWNERS at root and PR template for Azure DevOps", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
    const result = await resolver.resolve(ctx);

    const paths = result.generatedFiles.map((f) => f.relativePath);
    expect(paths).toContain("CODEOWNERS");
    expect(paths).toContain(".azuredevops/pull_request_template.md");
    // No settings.yml for Azure DevOps
    expect(paths).not.toContain(".github/settings.yml");
  });

  it("CODEOWNERS contains FIXME placeholder", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review");
    const result = await resolver.resolve(ctx);

    const codeowners = result.generatedFiles.find((f) => f.relativePath.includes("CODEOWNERS"));
    expect(codeowners?.content).toContain("@FIXME-add-team");
  });

  it("PR template contains AI code review checklist", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    const template = result.generatedFiles.find((f) =>
      f.relativePath.includes("PULL_REQUEST_TEMPLATE"),
    );
    expect(template?.content).toContain("AI Code Review Checklist");
    expect(template?.content).toContain("- [ ]");
    expect(template?.content).toContain("400 lines");
  });

  it("branch protection config requires 1 approval", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
    expect(settings?.content).toContain("required_approving_review_count: 1");
    expect(settings?.content).toContain("require_code_owner_reviews: true");
  });

  it("expected score is at least 3", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 0 });
    const result = await resolver.resolve(ctx);

    expect(result.expectedScore).toBeGreaterThanOrEqual(3);
  });

  it("warns about CODEOWNERS placeholder", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review");
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("FIXME"))).toBe(true);
  });

  it("skips existing CODEOWNERS without --force", async () => {
    const ghDir = join(tempDir, ".github");
    mkdirSync(ghDir, { recursive: true });
    writeFileSync(join(ghDir, "CODEOWNERS"), "existing", "utf-8");

    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
    expect(codeowners?.written).toBe(false);
    expect(codeowners?.skipReason).toContain("already exists");

    // Other files should still be generated
    const template = result.generatedFiles.find((f) =>
      f.relativePath.includes("PULL_REQUEST_TEMPLATE"),
    );
    expect(template?.written).toBe(true);
  });

  it("dry-run returns all files without writing", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { dryRun: true });
    const result = await resolver.resolve(ctx);

    expect(result.generatedFiles.every((f) => !f.written)).toBe(true);
    expect(result.generatedFiles.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Maturity mode tests (score 3→5)
// ---------------------------------------------------------------------------

describe("SecurityResolver — maturity mode (score 3+)", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("does not generate .cyclonedx.json placeholder (SBOM requires CI integration)", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 4 });
    const result = await resolver.resolve(ctx);

    const sbom = result.generatedFiles.find((f) => f.relativePath === ".cyclonedx.json");
    expect(sbom).toBeUndefined();
  });

  it("expected score is capped at 4 without CI-detected SBOM/DAST", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 4 });
    const result = await resolver.resolve(ctx);

    expect(result.expectedScore).toBe(4);
  });

  it("warns about Renovate service for Azure DevOps", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 4, ciPlatform: "azure-devops" });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("Renovate") && w.includes("Mend"))).toBe(true);
  });

  it("does not warn about Renovate for GitHub (uses Dependabot)", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 4, ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("Renovate") && w.includes("Mend"))).toBe(false);
  });

  it("warns about semgrep CI integration", async () => {
    const resolver = new SecurityResolver();
    const ctx = makeContext(tempDir, "security", { currentScore: 4 });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("semgrep") && w.includes("--config"))).toBe(true);
  });
});

describe("ReviewResolver — maturity mode (score 3+)", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("generates CodeRabbit config when score is 3", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3 });
    const result = await resolver.resolve(ctx);

    const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
    expect(coderabbit).toBeDefined();
    expect(coderabbit?.content).toContain("auto_review");
    expect(coderabbit?.content).toContain("assertive");
  });

  it("does not generate CodeRabbit when score < 3", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 1 });
    const result = await resolver.resolve(ctx);

    const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
    expect(coderabbit).toBeUndefined();
  });

  it("summary mentions AI review bot", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3 });
    const result = await resolver.resolve(ctx);

    expect(result.summary).toContain("review bot");
  });

  it("warns about CodeRabbit app requirement", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3 });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("CodeRabbit") && w.includes("App"))).toBe(true);
  });

  it("warns about Probot Settings for GitHub branch protection", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3, ciPlatform: "github-actions" });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("Probot Settings"))).toBe(true);
  });

  it("does not warn about Probot for Azure DevOps", async () => {
    const resolver = new ReviewResolver();
    const ctx = makeContext(tempDir, "review", { currentScore: 3, ciPlatform: "azure-devops" });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("Probot Settings"))).toBe(false);
  });
});

describe("CoverageResolver — maturity mode (score 3+)", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("generates Stryker config for TypeScript when score is 3", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 3, techStack: "typescript" });
    const result = await resolver.resolve(ctx);

    const stryker = result.generatedFiles.find((f) => f.relativePath === "stryker.config.json");
    expect(stryker).toBeDefined();
    const config = JSON.parse(stryker?.content ?? "{}");
    expect(config.testRunner).toBe("vitest");
    expect(config.mutate).toContain("src/**/*.ts");
  });

  it("generates PIT snippet for Java when score is 3", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 3, techStack: "java" });
    const result = await resolver.resolve(ctx);

    const pit = result.generatedFiles.find((f) => f.relativePath === ".dafke/pitest-snippet.xml");
    expect(pit).toBeDefined();
    expect(pit?.content).toContain("pitest-maven");
  });

  it("generates Stryker config for .NET when score is 3", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 3, techStack: "dotnet" });
    const result = await resolver.resolve(ctx);

    const stryker = result.generatedFiles.find((f) => f.relativePath === "stryker-config.json");
    expect(stryker).toBeDefined();
    expect(stryker?.content).toContain("stryker-config");
  });

  it("warns for unsupported tech stack mutation testing", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 3, techStack: "delphi" });
    const result = await resolver.resolve(ctx);

    expect(result.warnings.some((w) => w.includes("No mutation testing"))).toBe(true);
  });

  it("does not generate mutation testing when score < 3", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 0, techStack: "typescript" });
    const result = await resolver.resolve(ctx);

    const stryker = result.generatedFiles.find((f) => f.relativePath === "stryker.config.json");
    expect(stryker).toBeUndefined();
  });

  it("expected score is higher with mutation testing", async () => {
    const resolver = new CoverageResolver();
    const ctx = makeContext(tempDir, "coverage", { currentScore: 3, techStack: "typescript" });
    const result = await resolver.resolve(ctx);

    expect(result.expectedScore).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ReviewResolver — mutation killing
// ---------------------------------------------------------------------------

describe("ReviewResolver — mutation killing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---- canResolve boundary: score < 5 ----

  describe("canResolve boundary", () => {
    it("returns true when score is 4 (just below threshold)", () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 4 });
      expect(resolver.canResolve(ctx)).toBe(true);
    });

    it("returns false when score is 5 (at threshold)", () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 5 });
      expect(resolver.canResolve(ctx)).toBe(false);
    });
  });

  // ---- Platform-dependent file generation ----

  describe("platform-dependent file paths", () => {
    it("generates exactly 3 files for github-actions", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions", currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(3);
      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain(".github/CODEOWNERS");
      expect(paths).toContain(".github/PULL_REQUEST_TEMPLATE.md");
      expect(paths).toContain(".github/settings.yml");
    });

    it("generates exactly 2 files for azure-devops (no settings.yml)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops", currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(2);
      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain("CODEOWNERS");
      expect(paths).toContain(".azuredevops/pull_request_template.md");
      expect(paths).not.toContain(".github/CODEOWNERS");
      expect(paths).not.toContain(".github/settings.yml");
    });

    it("treats 'none' platform as GitHub (isGitHub = true)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "none", currentScore: 0 });
      const result = await resolver.resolve(ctx);

      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain(".github/CODEOWNERS");
      expect(paths).toContain(".github/PULL_REQUEST_TEMPLATE.md");
      expect(paths).toContain(".github/settings.yml");
    });
  });

  // ---- File content assertions (kill StringLiteral mutations) ----

  describe("generated file contents", () => {
    it("CODEOWNERS for GitHub contains team handles and security-sensitive path comments", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners).toBeDefined();
      expect(codeowners?.content).toContain("* @FIXME-add-team");
      expect(codeowners?.content).toContain("@FIXME-security-team");
      expect(codeowners?.content).toContain("dafke resolve");
    });

    it("CODEOWNERS for Azure DevOps is at repo root with same content", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === "CODEOWNERS");
      expect(codeowners).toBeDefined();
      expect(codeowners?.content).toContain("* @FIXME-add-team");
      expect(codeowners?.content).toContain("@FIXME-security-team");
    });

    it("Azure DevOps PR template contains AI checklist items and size limit", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template).toBeDefined();
      expect(template?.content).toContain("AI Code Review Checklist");
      expect(template?.content).toContain("- [ ]");
      expect(template?.content).toContain("No hardcoded secrets");
      expect(template?.content).toContain("Co-Authored-By");
      expect(template?.content).toContain("Description");
    });

    it("GitHub branch protection settings.yml contains approval requirements", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings).toBeDefined();
      expect(settings?.content).toContain("required_approving_review_count: 1");
      expect(settings?.content).toContain("require_code_owner_reviews: true");
    });

    it("CodeRabbit config contains expected review settings", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
      expect(coderabbit?.content).toContain("profile: assertive");
      expect(coderabbit?.content).toContain("request_changes_workflow: true");
      expect(coderabbit?.content).toContain("high_level_summary: true");
      expect(coderabbit?.content).toContain("auto_review:");
      expect(coderabbit?.content).toContain("enabled: true");
      expect(coderabbit?.content).toContain("auto_reply: true");
    });
  });

  // ---- CodeRabbit boundary: currentScore >= 3 ----

  describe("CodeRabbit generation boundary", () => {
    it("does NOT generate .coderabbit.yaml at score 2", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeUndefined();
    });

    it("generates .coderabbit.yaml at score 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
      expect(coderabbit?.written).toBe(true);
    });

    it("generates .coderabbit.yaml at score 4", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 4 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
    });
  });

  // ---- Expected score calculation (kill ArithmeticOperator/Math mutations) ----

  describe("expectedScore calculation", () => {
    it("score 0 without bot: expected = max(3, 0+2) = 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      // currentScore=0 < 3, so no CodeRabbit → hasBot=false
      // expectedScore = Math.min(5, Math.max(3, 0 + 2)) = Math.min(5, 3) = 3
      expect(result.expectedScore).toBe(3);
    });

    it("score 1 without bot: expected = max(3, 1+2) = 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 1 });
      const result = await resolver.resolve(ctx);

      // expectedScore = Math.min(5, Math.max(3, 1 + 2)) = Math.min(5, 3) = 3
      expect(result.expectedScore).toBe(3);
    });

    it("score 2 without bot: expected = max(3, 2+2) = 4", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2 });
      const result = await resolver.resolve(ctx);

      // expectedScore = Math.min(5, Math.max(3, 2 + 2)) = Math.min(5, 4) = 4
      expect(result.expectedScore).toBe(4);
    });

    it("score 3 with bot: expected = min(5, 3+3) = 5", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      // currentScore=3 >= 3, so CodeRabbit generated → hasBot=true
      // expectedScore = Math.min(5, 3 + 3) = Math.min(5, 6) = 5
      expect(result.expectedScore).toBe(5);
    });

    it("score 4 with bot: expected = min(5, 4+3) = 5", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 4 });
      const result = await resolver.resolve(ctx);

      // currentScore=4 >= 3, so CodeRabbit generated → hasBot=true
      // expectedScore = Math.min(5, 4 + 3) = Math.min(5, 7) = 5
      expect(result.expectedScore).toBe(5);
    });

    it("dry-run score 3 with bot: hasBot still true (dryRun counted)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3, dryRun: true });
      const result = await resolver.resolve(ctx);

      // CodeRabbit file exists with dryRun=true → hasBot=true
      // expectedScore = Math.min(5, 3 + 3) = 5
      expect(result.expectedScore).toBe(5);
    });
  });

  // ---- Summary text differs based on hasBot ----

  describe("summary", () => {
    it("includes 'review bot' when CodeRabbit is generated", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("review bot");
    });

    it("includes 'CODEOWNERS' when no CodeRabbit", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("CODEOWNERS");
      expect(result.summary).toContain("branch protection");
      expect(result.summary).not.toContain("review bot");
    });
  });

  // ---- previousScore preserved ----

  describe("previousScore", () => {
    it("preserves currentScore as previousScore in result", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2 });
      const result = await resolver.resolve(ctx);

      expect(result.previousScore).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// SecurityResolver — mutation killing
// ---------------------------------------------------------------------------

describe("SecurityResolver — mutation killing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---- canResolve boundary: score < 5 ----

  describe("canResolve boundary", () => {
    it("returns true when score is 4 (just below threshold)", () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 4 });
      expect(resolver.canResolve(ctx)).toBe(true);
    });

    it("returns false when score is 5 (at threshold)", () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 5 });
      expect(resolver.canResolve(ctx)).toBe(false);
    });
  });

  // ---- Platform-dependent SCA generation ----

  describe("platform-dependent dependency scanning", () => {
    it("generates dependabot.yml for github-actions", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain(".github/dependabot.yml");
      expect(paths).not.toContain("renovate.json");
    });

    it("generates renovate.json for azure-devops (not dependabot)", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain("renovate.json");
      expect(paths).not.toContain(".github/dependabot.yml");
    });

    it("treats 'none' platform as github-actions (generates dependabot)", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "none" });
      const result = await resolver.resolve(ctx);

      const paths = result.generatedFiles.map((f) => f.relativePath);
      expect(paths).toContain(".github/dependabot.yml");
      expect(paths).not.toContain("renovate.json");
    });

    it("generates exactly 3 files for any platform", async () => {
      const resolver = new SecurityResolver();
      const ctxGithub = makeContext(tempDir, "security", { ciPlatform: "github-actions" });
      const resultGithub = await resolver.resolve(ctxGithub);
      expect(resultGithub.generatedFiles.length).toBe(3);

      // Clean up temp for second resolve
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = makeTempDir();

      const ctxAzure = makeContext(tempDir, "security", { ciPlatform: "azure-devops" });
      const resultAzure = await resolver.resolve(ctxAzure);
      expect(resultAzure.generatedFiles.length).toBe(3);
    });
  });

  // ---- Package ecosystem mapping (kill StringLiteral mutations) ----

  describe("package ecosystem mapping in dependabot.yml", () => {
    it("uses npm for typescript", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", {
        ciPlatform: "github-actions",
        techStack: "typescript",
      });
      const result = await resolver.resolve(ctx);

      const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
      expect(depFile).toBeDefined();
      expect(depFile?.content).toContain("npm");
    });

    it("uses maven for java", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", {
        ciPlatform: "github-actions",
        techStack: "java",
      });
      const result = await resolver.resolve(ctx);

      const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
      expect(depFile?.content).toContain("maven");
    });

    it("uses nuget for dotnet", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", {
        ciPlatform: "github-actions",
        techStack: "dotnet",
      });
      const result = await resolver.resolve(ctx);

      const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
      expect(depFile?.content).toContain("nuget");
    });

    it("uses pip for python", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", {
        ciPlatform: "github-actions",
        techStack: "python",
      });
      const result = await resolver.resolve(ctx);

      const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
      expect(depFile?.content).toContain("pip");
    });

    it("defaults to npm for unknown tech stack", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", {
        ciPlatform: "github-actions",
        techStack: "unknown",
      });
      const result = await resolver.resolve(ctx);

      const depFile = result.generatedFiles.find((f) => f.relativePath === ".github/dependabot.yml");
      expect(depFile?.content).toContain("npm");
    });
  });

  // ---- File content assertions (kill StringLiteral/BlockStatement mutations) ----

  describe("generated file contents", () => {
    it("semgrep config contains semgrep rules", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security");
      const result = await resolver.resolve(ctx);

      const semgrep = result.generatedFiles.find((f) => f.relativePath === ".semgrep.yml");
      expect(semgrep).toBeDefined();
      expect(semgrep?.content).toContain("semgrep");
      expect(semgrep?.content.length).toBeGreaterThan(10);
    });

    it("gitleaks config includes toml structure and allowlist", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security");
      const result = await resolver.resolve(ctx);

      const gitleaks = result.generatedFiles.find((f) => f.relativePath === ".gitleaks.toml");
      expect(gitleaks).toBeDefined();
      expect(gitleaks?.content).toContain("allowlist");
      expect(gitleaks?.content).toContain("node_modules");
      expect(gitleaks?.content.length).toBeGreaterThan(10);
    });

    it("renovate.json contains valid JSON structure", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const renovate = result.generatedFiles.find((f) => f.relativePath === "renovate.json");
      expect(renovate).toBeDefined();
      expect(renovate?.content.length).toBeGreaterThan(2);
      // Should be parseable JSON
      expect(() => JSON.parse(renovate?.content ?? "")).not.toThrow();
    });
  });

  // ---- Expected score by writtenCount ----

  describe("expectedScore by writtenCount", () => {
    it("writtenCount 3 (all written) → expectedScore 4", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      // All 3 files written → hasBaseline=true → expectedScore=4
      expect(result.generatedFiles.filter((f) => f.written).length).toBe(3);
      expect(result.expectedScore).toBe(4);
    });

    it("writtenCount 2 (one skipped) → expectedScore 3", async () => {
      // Pre-create semgrep so it gets skipped
      writeFileSync(join(tempDir, ".semgrep.yml"), "existing", "utf-8");

      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      const writtenCount = result.generatedFiles.filter((f) => f.written).length;
      expect(writtenCount).toBe(2);
      // writtenCount >= 2 but < 3 → expectedScore=3
      expect(result.expectedScore).toBe(3);
    });

    it("writtenCount 1 (two skipped) → expectedScore currentScore+1", async () => {
      // Pre-create semgrep and gitleaks so they get skipped
      writeFileSync(join(tempDir, ".semgrep.yml"), "existing", "utf-8");
      writeFileSync(join(tempDir, ".gitleaks.toml"), "existing", "utf-8");

      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 1 });
      const result = await resolver.resolve(ctx);

      const writtenCount = result.generatedFiles.filter((f) => f.written).length;
      expect(writtenCount).toBe(1);
      // writtenCount < 2 → expectedScore = Math.min(5, currentScore+1) = 2
      expect(result.expectedScore).toBe(2);
    });

    it("writtenCount 0 (all skipped) → expectedScore currentScore+1", async () => {
      // Pre-create all 3 files so they all get skipped
      writeFileSync(join(tempDir, ".semgrep.yml"), "existing", "utf-8");
      writeFileSync(join(tempDir, ".gitleaks.toml"), "existing", "utf-8");
      const ghDir = join(tempDir, ".github");
      mkdirSync(ghDir, { recursive: true });
      writeFileSync(join(ghDir, "dependabot.yml"), "existing", "utf-8");

      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 2 });
      const result = await resolver.resolve(ctx);

      const writtenCount = result.generatedFiles.filter((f) => f.written).length;
      expect(writtenCount).toBe(0);
      // writtenCount < 2 → expectedScore = Math.min(5, currentScore+1) = 3
      expect(result.expectedScore).toBe(3);
    });

    it("dry-run counts all files toward writtenCount", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 0, dryRun: true });
      const result = await resolver.resolve(ctx);

      // In dry-run, written=false for all, but writtenCount uses (f.written || ctx.dryRun)
      // So writtenCount=3 → hasBaseline=true → expectedScore=4
      expect(result.generatedFiles.every((f) => !f.written)).toBe(true);
      expect(result.expectedScore).toBe(4);
    });

    it("expectedScore is capped at 5", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 4 });
      const result = await resolver.resolve(ctx);

      // hasBaseline → expectedScore=4, then Math.min(5, 4) = 4
      // But the code is Math.min(5, expectedScore) — cap ensures never > 5
      expect(result.expectedScore).toBeLessThanOrEqual(5);
    });
  });

  // ---- Warnings for Azure DevOps Renovate ----

  describe("platform-specific warnings", () => {
    it("warns about Mend Renovate for azure-devops", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      expect(result.warnings.some((w) => w.includes("Renovate") && w.includes("Mend"))).toBe(true);
    });

    it("does not warn about Mend Renovate for github-actions", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      expect(result.warnings.some((w) => w.includes("Renovate") && w.includes("Mend"))).toBe(false);
    });

    it("always warns about semgrep CI integration", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security");
      const result = await resolver.resolve(ctx);

      expect(result.warnings.some((w) => w.includes("--config") && w.includes("semgrep"))).toBe(true);
    });
  });

  // ---- previousScore preserved ----

  describe("previousScore", () => {
    it("preserves currentScore as previousScore in result", async () => {
      const resolver = new SecurityResolver();
      const ctx = makeContext(tempDir, "security", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      expect(result.previousScore).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// ReviewResolver — mutation killing round 2
// ---------------------------------------------------------------------------

describe("ReviewResolver — mutation killing round 2", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---- CODEOWNERS file content: kill all StringLiteral mutations ----

  describe("CODEOWNERS content assertions", () => {
    it("GitHub CODEOWNERS contains the comment header with 'dafke resolve'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners).toBeDefined();
      expect(codeowners?.content).toContain("# CODEOWNERS — generated by dafke resolve");
    });

    it("CODEOWNERS contains the FIXME replacement instruction comment", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content).toContain("# Replace @FIXME-add-team with your actual team handles.");
    });

    it("CODEOWNERS contains default reviewers line '* @FIXME-add-team'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content).toContain("* @FIXME-add-team");
    });

    it("CODEOWNERS contains security-sensitive path comments with @FIXME-security-team", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content).toContain("@FIXME-security-team");
      expect(codeowners?.content).toContain("src/auth/");
      expect(codeowners?.content).toContain("src/data/");
    });

    it("CODEOWNERS contains 'Default reviewers for all files' comment", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content).toContain("# Default reviewers for all files");
    });

    it("CODEOWNERS contains 'Security-sensitive paths require security team review' comment", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content).toContain("# Security-sensitive paths require security team review");
    });

    it("Azure DevOps CODEOWNERS at root contains same content strings", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === "CODEOWNERS");
      expect(codeowners).toBeDefined();
      expect(codeowners?.content).toContain("# CODEOWNERS — generated by dafke resolve");
      expect(codeowners?.content).toContain("* @FIXME-add-team");
      expect(codeowners?.content).toContain("@FIXME-security-team");
      expect(codeowners?.content).toContain("# Default reviewers for all files");
    });
  });

  // ---- PR template content: kill StringLiteral mutations for both platforms ----

  describe("PR template content assertions", () => {
    it("GitHub PR template contains 'Description' section", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      expect(template).toBeDefined();
      expect(template?.content).toContain("## Description");
    });

    it("GitHub PR template contains 'AI Code Review Checklist' with specific items", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      expect(template?.content).toContain("## AI Code Review Checklist");
      expect(template?.content).toContain("No hardcoded secrets or credentials");
      expect(template?.content).toContain("Error handling is comprehensive");
      expect(template?.content).toContain("Co-Authored-By");
      expect(template?.content).toContain("All tests pass");
    });

    it("GitHub PR template contains prSizeLimit from rules", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      // Default prSizeLimit is 400
      expect(template?.content).toContain("400 lines changed");
    });

    it("GitHub PR template contains Type of Change section", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      expect(template?.content).toContain("## Type of Change");
      expect(template?.content).toContain("Bug fix");
      expect(template?.content).toContain("New feature");
    });

    it("GitHub PR template contains Testing section", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      expect(template?.content).toContain("## Testing");
      expect(template?.content).toContain("Unit tests added/updated");
      expect(template?.content).toContain("Coverage threshold maintained");
    });

    it("Azure DevOps PR template contains '## Description'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template).toBeDefined();
      expect(template?.content).toContain("## Description");
    });

    it("Azure DevOps PR template contains '## AI Code Review Checklist'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content).toContain("## AI Code Review Checklist");
    });

    it("Azure DevOps PR template contains 'No hardcoded secrets or credentials'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content).toContain("No hardcoded secrets or credentials");
    });

    it("Azure DevOps PR template contains 'Error handling is comprehensive'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content).toContain("Error handling is comprehensive");
    });

    it("Azure DevOps PR template contains prSizeLimit from rules", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      // Default prSizeLimit is 400
      expect(template?.content).toContain("400 lines changed");
    });

    it("Azure DevOps PR template contains 'Co-Authored-By' line", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content).toContain("Co-Authored-By header present for AI-assisted code");
    });

    it("Azure DevOps PR template contains 'All tests pass'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content).toContain("All tests pass");
    });
  });

  // ---- Branch protection (settings.yml) content: kill StringLiteral mutations ----

  describe("branch protection settings.yml content", () => {
    it("contains 'required_pull_request_reviews' section", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings).toBeDefined();
      expect(settings?.content).toContain("required_pull_request_reviews");
    });

    it("contains 'required_approving_review_count: 1'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("required_approving_review_count: 1");
    });

    it("contains 'require_code_owner_reviews: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("require_code_owner_reviews: true");
    });

    it("contains 'required_status_checks' section with 'strict: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("required_status_checks");
      expect(settings?.content).toContain("strict: true");
    });

    it("contains 'default_branch: main'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("default_branch: main");
    });

    it("contains branch name 'main' in protection rules", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("name: main");
    });

    it("contains probot/settings reference comment", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("probot/settings");
    });

    it("contains 'dafke' version reference in header", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content).toContain("dafke");
    });
  });

  // ---- CodeRabbit config content: kill StringLiteral mutations ----

  describe("CodeRabbit config content", () => {
    it("contains 'language: en'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
      expect(coderabbit?.content).toContain("language: en");
    });

    it("contains 'reviews:' section", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("reviews:");
    });

    it("contains 'profile: assertive'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("profile: assertive");
    });

    it("contains 'request_changes_workflow: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("request_changes_workflow: true");
    });

    it("contains 'high_level_summary: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("high_level_summary: true");
    });

    it("contains 'auto_review:' with 'enabled: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("auto_review:");
      expect(coderabbit?.content).toContain("enabled: true");
    });

    it("contains 'drafts: false'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("drafts: false");
    });

    it("contains 'chat:' with 'auto_reply: true'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("chat:");
      expect(coderabbit?.content).toContain("auto_reply: true");
    });

    it("contains header comment with 'dafke resolve'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content).toContain("# CodeRabbit AI code review — generated by dafke resolve");
    });
  });

  // ---- Warning content: kill StringLiteral mutations in warning messages ----

  describe("warning message content", () => {
    it("CODEOWNERS warning contains exact placeholder instruction text", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeownersWarning = result.warnings.find((w) => w.includes("CODEOWNERS"));
      expect(codeownersWarning).toBeDefined();
      expect(codeownersWarning).toContain("CODEOWNERS generated with placeholder teams");
      expect(codeownersWarning).toContain("update @FIXME-add-team with real team handles");
    });

    it("Probot Settings warning contains exact text", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const probotWarning = result.warnings.find((w) => w.includes("Probot"));
      expect(probotWarning).toBeDefined();
      expect(probotWarning).toContain("Branch protection via settings.yml requires the Probot Settings GitHub App to be installed");
    });

    it("CodeRabbit warning contains exact app requirement text", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbitWarning = result.warnings.find((w) => w.includes("CodeRabbit"));
      expect(coderabbitWarning).toBeDefined();
      expect(coderabbitWarning).toContain("CodeRabbit requires the CodeRabbit App to be installed on your repo");
    });

    it("No CodeRabbit warning when score < 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2, ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      expect(result.warnings.some((w) => w.includes("CodeRabbit"))).toBe(false);
    });

    it("No Probot warning for Azure DevOps platform", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      expect(result.warnings.some((w) => w.includes("Probot"))).toBe(false);
      expect(result.warnings.some((w) => w.includes("settings.yml"))).toBe(false);
    });

    it("CODEOWNERS warning is always present regardless of platform", async () => {
      const resolver = new ReviewResolver();
      const ctxGh = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const resultGh = await resolver.resolve(ctxGh);
      expect(resultGh.warnings.some((w) => w.includes("CODEOWNERS generated with placeholder teams"))).toBe(true);

      rmSync(tempDir, { recursive: true, force: true });
      tempDir = makeTempDir();

      const ctxAz = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const resultAz = await resolver.resolve(ctxAz);
      expect(resultAz.warnings.some((w) => w.includes("CODEOWNERS generated with placeholder teams"))).toBe(true);
    });
  });

  // ---- Summary text: kill StringLiteral mutations in summary ----

  describe("summary content", () => {
    it("summary with bot contains 'AI review bot' and 'CodeRabbit'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("AI review bot");
      expect(result.summary).toContain("CodeRabbit");
    });

    it("summary without bot contains 'CODEOWNERS', 'PR template', and 'branch protection'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("CODEOWNERS");
      expect(result.summary).toContain("PR template");
      expect(result.summary).toContain("branch protection");
    });

    it("summary without bot does not contain 'CodeRabbit'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 1 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).not.toContain("CodeRabbit");
    });

    it("summary with bot contains 'Generated review config'", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 4 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("Generated review config");
    });

    it("summary without bot contains 'Generated' prefix", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.summary).toContain("Generated");
    });
  });

  // ---- dimension property always returns 'review' ----

  describe("dimension property", () => {
    it("result.dimension is always 'review'", async () => {
      const resolver = new ReviewResolver();

      const ctx1 = makeContext(tempDir, "review", { currentScore: 0, ciPlatform: "github-actions" });
      const result1 = await resolver.resolve(ctx1);
      expect(result1.dimension).toBe("review");

      rmSync(tempDir, { recursive: true, force: true });
      tempDir = makeTempDir();

      const ctx2 = makeContext(tempDir, "review", { currentScore: 3, ciPlatform: "azure-devops" });
      const result2 = await resolver.resolve(ctx2);
      expect(result2.dimension).toBe("review");
    });

    it("resolver.dimension property is 'review'", () => {
      const resolver = new ReviewResolver();
      expect(resolver.dimension).toBe("review");
    });
  });

  // ---- CODEOWNERS path differs by platform (kill ConditionalExpression) ----

  describe("CODEOWNERS path by platform", () => {
    it("uses '.github/CODEOWNERS' path for github-actions", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath.includes("CODEOWNERS"));
      expect(codeowners?.relativePath).toBe(".github/CODEOWNERS");
    });

    it("uses 'CODEOWNERS' path (root) for azure-devops", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath.includes("CODEOWNERS"));
      expect(codeowners?.relativePath).toBe("CODEOWNERS");
    });
  });

  // ---- generatedFiles array order and file count per platform ----

  describe("generatedFiles array structure", () => {
    it("GitHub score < 3: exactly 3 files (CODEOWNERS, PR template, settings.yml)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions", currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(3);
      expect(result.generatedFiles[0].relativePath).toContain("CODEOWNERS");
      expect(result.generatedFiles[1].relativePath).toContain("PULL_REQUEST_TEMPLATE");
      expect(result.generatedFiles[2].relativePath).toBe(".github/settings.yml");
    });

    it("GitHub score >= 3: exactly 4 files (+ CodeRabbit)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions", currentScore: 3 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(4);
      expect(result.generatedFiles[3].relativePath).toBe(".coderabbit.yaml");
    });

    it("Azure score < 3: exactly 2 files (CODEOWNERS, PR template)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops", currentScore: 0 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(2);
      expect(result.generatedFiles[0].relativePath).toBe("CODEOWNERS");
      expect(result.generatedFiles[1].relativePath).toBe(".azuredevops/pull_request_template.md");
    });

    it("Azure score >= 3: exactly 3 files (+ CodeRabbit)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops", currentScore: 3 });
      const result = await resolver.resolve(ctx);

      expect(result.generatedFiles.length).toBe(3);
      expect(result.generatedFiles[2].relativePath).toBe(".coderabbit.yaml");
    });
  });

  // ---- hasBot check uses written || dryRun (kill ObjectLiteral/ConditionalExpression) ----

  describe("hasBot scoring depends on written OR dryRun", () => {
    it("dryRun=true with score >= 3 still counts as hasBot for expectedScore", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3, dryRun: true });
      const result = await resolver.resolve(ctx);

      // In dryRun, written=false but ctx.dryRun=true, so hasBot uses (f.written || ctx.dryRun)
      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
      expect(coderabbit?.written).toBe(false); // dryRun mode
      expect(result.expectedScore).toBe(5); // hasBot = true -> min(5, 3+3) = 5
    });

    it("dryRun=false with score >= 3 and file written still counts as hasBot", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3, dryRun: false, force: true });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeDefined();
      expect(coderabbit?.written).toBe(true);
      expect(result.expectedScore).toBe(5); // hasBot = true -> min(5, 3+3) = 5
    });

    it("score < 3 with dryRun=true still has no CodeRabbit file", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2, dryRun: true });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit).toBeUndefined();
      // hasBot=false -> expectedScore = Math.min(5, Math.max(3, 2+2)) = 4
      expect(result.expectedScore).toBe(4);
    });
  });

  // ---- Exact expectedScore calculation boundary values ----

  describe("expectedScore precise boundary values", () => {
    it("score 0 without bot: min(5, max(3, 0+2)) = 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 0 });
      const result = await resolver.resolve(ctx);
      expect(result.expectedScore).toBe(3);
    });

    it("score 1 without bot: min(5, max(3, 1+2)) = 3", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 1 });
      const result = await resolver.resolve(ctx);
      expect(result.expectedScore).toBe(3);
    });

    it("score 2 without bot: min(5, max(3, 2+2)) = 4", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 2 });
      const result = await resolver.resolve(ctx);
      expect(result.expectedScore).toBe(4);
    });

    it("score 3 with bot: min(5, 3+3) = 5", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);
      expect(result.expectedScore).toBe(5);
    });

    it("score 4 with bot: min(5, 4+3) = 5 (capped)", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 4 });
      const result = await resolver.resolve(ctx);
      expect(result.expectedScore).toBe(5);
    });
  });

  // ---- Non-empty content assertions (prevent empty string mutations) ----

  describe("file content is non-empty", () => {
    it("CODEOWNERS content length > 50 chars", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const codeowners = result.generatedFiles.find((f) => f.relativePath === ".github/CODEOWNERS");
      expect(codeowners?.content.length).toBeGreaterThan(50);
    });

    it("PR template content length > 50 chars", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) => f.relativePath === ".github/PULL_REQUEST_TEMPLATE.md");
      expect(template?.content.length).toBeGreaterThan(50);
    });

    it("settings.yml content length > 50 chars", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "github-actions" });
      const result = await resolver.resolve(ctx);

      const settings = result.generatedFiles.find((f) => f.relativePath === ".github/settings.yml");
      expect(settings?.content.length).toBeGreaterThan(50);
    });

    it("CodeRabbit config content length > 50 chars", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { currentScore: 3 });
      const result = await resolver.resolve(ctx);

      const coderabbit = result.generatedFiles.find((f) => f.relativePath === ".coderabbit.yaml");
      expect(coderabbit?.content.length).toBeGreaterThan(50);
    });

    it("Azure DevOps PR template content length > 50 chars", async () => {
      const resolver = new ReviewResolver();
      const ctx = makeContext(tempDir, "review", { ciPlatform: "azure-devops" });
      const result = await resolver.resolve(ctx);

      const template = result.generatedFiles.find((f) =>
        f.relativePath === ".azuredevops/pull_request_template.md",
      );
      expect(template?.content.length).toBeGreaterThan(50);
    });
  });
});
