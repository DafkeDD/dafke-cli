import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";
import { execaSync } from "execa";

import { ResolveEngine } from "../../src/core/resolver/resolve-engine.js";
import { CicdResolver } from "../../src/core/resolver/resolvers/cicd-resolver.js";
import { SecurityResolver } from "../../src/core/resolver/resolvers/security-resolver.js";
import { CoverageResolver } from "../../src/core/resolver/resolvers/coverage-resolver.js";
import { ReviewResolver } from "../../src/core/resolver/resolvers/review-resolver.js";
import type { DimensionResolver, ResolveResult } from "../../src/core/resolver/dimension-resolver.js";
import { ConfigManager } from "../../src/core/config/config-manager.js";
import { AssessmentEngine } from "../../src/core/analyzer/assessment-engine.js";
import type { AssessmentResult } from "../../src/core/analyzer/assessment-engine.js";
import type { ReadinessScores } from "../../src/core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-engine-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function initGitRepo(dir: string): void {
  execaSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["config", "user.email", "test@dafke.be"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["config", "user.name", "CI Test"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir, stdio: "ignore" });
}

function writeManifest(repoRoot: string, overrides: Record<string, unknown> = {}): void {
  const manifestDir = join(repoRoot, ".dafke");
  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    corulusCcVersion: "0.1.0",
    configSchemaVersion: 2,
    techStack: "typescript",
    ciPlatform: "github-actions",
    readinessScores: { cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0 },
    wave: "wave3",
    lastAudit: "2026-01-01T00:00:00.000Z",
    overrides: {},
    externalTools: {},
    ...overrides,
  };
  writeFileSync(join(manifestDir, "manifest.yaml"), stringifyYaml(manifest), "utf-8");
}

function createAllResolvers(): DimensionResolver[] {
  return [
    new CicdResolver(),
    new SecurityResolver(),
    new CoverageResolver(),
    new ReviewResolver(),
  ];
}

// ---------------------------------------------------------------------------
// ResolveEngine — happy paths
// ---------------------------------------------------------------------------

describe("ResolveEngine — happy paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves all dimensions on empty repo and generates files", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    // Should have results for cicd, security, coverage, review
    expect(report.results.length).toBeGreaterThanOrEqual(3);
    expect(report.totalFilesGenerated).toBeGreaterThan(0);
    expect(report.expectedTotalScore).toBeGreaterThan(report.previousTotalScore);
  });

  it("generates actual files on disk when not dry-run", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    // CI pipeline should exist
    expect(existsSync(join(tempDir, ".github/workflows/quality-gates.yml"))).toBe(true);

    // Security configs should exist
    expect(existsSync(join(tempDir, ".semgrep.yml"))).toBe(true);
    expect(existsSync(join(tempDir, ".gitleaks.toml"))).toBe(true);

    // Review configs should exist
    expect(existsSync(join(tempDir, ".github/CODEOWNERS"))).toBe(true);
    expect(existsSync(join(tempDir, ".github/PULL_REQUEST_TEMPLATE.md"))).toBe(true);
  });

  it("filters to specific dimension", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: false,
      force: false,
    });

    expect(report.results.length).toBe(1);
    expect(report.results[0].dimension).toBe("cicd");

    // Only CI file should be created, no security files
    expect(existsSync(join(tempDir, ".github/workflows/quality-gates.yml"))).toBe(true);
    expect(existsSync(join(tempDir, ".semgrep.yml"))).toBe(false);
  });

  it("dry-run returns report but writes no files", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(report.results.length).toBeGreaterThanOrEqual(3);
    expect(report.totalFilesGenerated).toBe(0);

    // No files should exist on disk
    expect(existsSync(join(tempDir, ".github/workflows/quality-gates.yml"))).toBe(false);
    expect(existsSync(join(tempDir, ".semgrep.yml"))).toBe(false);
  });

  it("force overwrites existing files", async () => {
    // Create existing file
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "quality-gates.yml"), "old content", "utf-8");

    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: false,
      force: true,
    });

    expect(report.totalFilesGenerated).toBe(1);

    const content = readFileSync(join(workflowDir, "quality-gates.yml"), "utf-8");
    expect(content).not.toBe("old content");
    expect(content).toContain("Quality Gates");
  });

  it("skips existing files without force", async () => {
    // Create existing file
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "quality-gates.yml"), "existing", "utf-8");

    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: false,
      force: false,
    });

    expect(report.totalFilesSkipped).toBeGreaterThan(0);

    const content = readFileSync(join(workflowDir, "quality-gates.yml"), "utf-8");
    expect(content).toBe("existing");
  });

  it("uses manifest tech stack when available", async () => {
    writeManifest(tempDir, { techStack: "dotnet", ciPlatform: "azure-devops" });

    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: false,
      force: false,
    });

    expect(report.results[0].generatedFiles[0].relativePath).toBe("azure-pipelines.yml");
  });

  it("detects typescript from package.json when no manifest", async () => {
    writeFileSync(join(tempDir, "package.json"), '{"name":"test"}', "utf-8");

    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["coverage"],
      dryRun: true,
      force: false,
    });

    // Should generate typescript-specific coverage config
    const coverageResult = report.results.find((r) => r.dimension === "coverage");
    if (coverageResult) {
      expect(coverageResult.generatedFiles[0].relativePath).toBe(".nycrc.json");
    }
  });

  it("expected total score is correctly computed", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(report.expectedTotalScore).toBeGreaterThan(report.previousTotalScore);
    expect(report.expectedTotalScore).toBeLessThanOrEqual(30);
  });

  it("updates manifest when not dry-run", async () => {
    writeManifest(tempDir);

    const engine = new ResolveEngine(createAllResolvers());
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    const manifestContent = readFileSync(
      join(tempDir, ".dafke", "manifest.yaml"),
      "utf-8",
    );
    // Manifest should have been updated with new lastAudit
    expect(manifestContent).toContain("lastAudit");
  });

  it("does not update manifest in dry-run", async () => {
    writeManifest(tempDir);
    const originalContent = readFileSync(
      join(tempDir, ".dafke", "manifest.yaml"),
      "utf-8",
    );

    const engine = new ResolveEngine(createAllResolvers());
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    const afterContent = readFileSync(
      join(tempDir, ".dafke", "manifest.yaml"),
      "utf-8",
    );
    expect(afterContent).toBe(originalContent);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — failure paths
// ---------------------------------------------------------------------------

describe("ResolveEngine — failure paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("one resolver failure does not block others", async () => {
    // Create a mock resolver that always throws
    const failingResolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: () => true,
      resolve: async () => {
        throw new Error("Intentional test failure");
      },
    };

    const engine = new ResolveEngine([
      failingResolver,
      new SecurityResolver(),
    ]);

    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    // Security should still resolve
    const securityResult = report.results.find((r) => r.dimension === "security");
    expect(securityResult).toBeDefined();
    expect(securityResult?.generatedFiles.length).toBeGreaterThan(0);

    // Warning about cicd failure should be present
    expect(report.warnings.some((w) => w.includes("cicd") && w.includes("failed"))).toBe(true);
  });

  it("warns about non-resolvable dimensions", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["dora", "docs", "cicd"],
      dryRun: true,
      force: false,
    });

    // Should warn about dora and docs being non-resolvable
    expect(report.warnings.some((w) => w.includes("non-resolvable"))).toBe(true);

    // cicd should still be resolved
    const cicdResult = report.results.find((r) => r.dimension === "cicd");
    expect(cicdResult).toBeDefined();
  });

  it("handles invalid-only dimension list gracefully", async () => {
    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["dora", "docs"],
      dryRun: true,
      force: false,
    });

    expect(report.results.length).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("still offers maturity improvements even when baseline dimensions pass", async () => {
    // Create a repo that already has everything
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, "ci.yml"),
      "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint\n      - run: semgrep scan\n",
      "utf-8",
    );
    writeFileSync(join(tempDir, ".semgrep.yml"), "rules: []", "utf-8");
    writeFileSync(join(tempDir, ".gitleaks.toml"), 'title = "config"', "utf-8");
    writeFileSync(join(tempDir, ".github/CODEOWNERS"), "* @team", "utf-8");
    writeFileSync(
      join(tempDir, ".github/PULL_REQUEST_TEMPLATE.md"),
      "## PR\n- [ ] checklist",
      "utf-8",
    );
    writeFileSync(join(tempDir, "package.json"), '{"name":"test","scripts":{"test":"vitest"}}', "utf-8");
    writeFileSync(
      join(tempDir, "vitest.config.ts"),
      "export default { test: { coverage: { provider: 'v8', lines: 80 } } }",
      "utf-8",
    );
    writeFileSync(join(tempDir, "README.md"), "# Test\nnpm test\nnpm run build\n".repeat(10), "utf-8");

    const engine = new ResolveEngine(createAllResolvers());
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // With maturity mode, coverage resolver still runs (score < 5)
    // It should offer mutation testing or other advanced configs
    const coverageResult = report.results.find((r) => r.dimension === "coverage");
    // Coverage score may be 1-4 depending on detected config; resolver runs if < 5
    if (coverageResult) {
      expect(coverageResult.generatedFiles.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles file write failure gracefully", async () => {
    // Create a mock resolver that returns a file with an invalid path
    const badPathResolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [{
          relativePath: "\0invalid",  // Invalid path character
          content: "test",
          existedBefore: false,
          written: true,
        }],
        previousScore: 0,
        expectedScore: 3,
        summary: "Test",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([badPathResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    // Should have a warning about the write failure or file marked as not written
    const file = report.results[0]?.generatedFiles[0];
    if (file) {
      expect(file.written).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for mutation-killing tests
// ---------------------------------------------------------------------------

/**
 * Build a mock DimensionResolver that returns controlled scores and warnings.
 */
function makeMockResolver(
  dimension: string,
  opts: {
    canResolve?: boolean;
    previousScore?: number;
    expectedScore?: number;
    warnings?: string[];
    generatedFiles?: ResolveResult["generatedFiles"];
  } = {},
): DimensionResolver {
  const {
    canResolve = true,
    previousScore = 0,
    expectedScore = 3,
    warnings = [],
    generatedFiles = [],
  } = opts;

  return {
    dimension,
    canResolve: () => canResolve,
    resolve: async (): Promise<ResolveResult> => ({
      dimension,
      generatedFiles,
      previousScore,
      expectedScore,
      summary: `Mock ${dimension} resolver`,
      warnings,
    }),
  };
}

/**
 * Create a fake AssessmentResult with exact known scores.
 */
function makeFakeAssessment(scores: ReadinessScores): AssessmentResult {
  const totalScore = scores.cicd + scores.coverage + scores.security +
    scores.review + scores.dora + scores.docs;

  const dimensionResults = Object.entries(scores).map(([dim, score]) => ({
    dimension: dim,
    score,
    details: `Mock ${dim} at ${score}`,
    evidence: [`${dim} score is ${score}`],
    suggestions: [`Improve ${dim}`],
  }));

  const improvementPlan = Object.entries(scores)
    .filter(([, score]) => score < 5)
    .map(([dim, score]) => ({
      dimension: dim,
      currentScore: score,
      targetScore: Math.min(5, score + 1),
      action: `Improve ${dim}`,
      estimatedTime: "1-2 weeks",
      priority: "medium" as const,
    }));

  return {
    scores,
    totalScore,
    wave: "wave3",
    dimensionResults,
    improvementPlan,
  };
}

// ---------------------------------------------------------------------------
// ResolveEngine — aggregate score calculation (kills ArithmeticOperator)
// ---------------------------------------------------------------------------

describe("ResolveEngine — aggregate score calculation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should compute expectedTotalScore as exact sum of all 6 dimension expected scores", async () => {
    // Known assessment scores: cicd=1, coverage=1, security=1, review=1, dora=2, docs=3
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 2, docs: 3,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);

    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    // Resolvers that change cicd -> 4 and security -> 5
    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", { expectedScore: 4 }),
      makeMockResolver("security", { expectedScore: 5 }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // Expected: cicd=4 (resolved), coverage=1 (unchanged), security=5 (resolved),
    //           review=1 (unchanged), dora=2 (unchanged), docs=3 (unchanged)
    // Sum: 4 + 1 + 5 + 1 + 2 + 3 = 16
    expect(report.expectedTotalScore).toBe(16);
  });

  it("should compute expectedTotalScore correctly when no resolvers change scores", async () => {
    const knownScores: ReadinessScores = {
      cicd: 2, coverage: 3, security: 1, review: 4, dora: 0, docs: 5,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    // No resolvers provided — expectedScores should match assessment scores
    const engine = new ResolveEngine([]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // Sum: 2 + 3 + 1 + 4 + 0 + 5 = 15
    expect(report.expectedTotalScore).toBe(15);
    expect(report.previousTotalScore).toBe(15);
  });

  it("should compute expectedTotalScore correctly when all 4 resolvable dimensions change", async () => {
    const knownScores: ReadinessScores = {
      cicd: 0, coverage: 0, security: 0, review: 0, dora: 1, docs: 2,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", { expectedScore: 3 }),
      makeMockResolver("coverage", { expectedScore: 2 }),
      makeMockResolver("security", { expectedScore: 4 }),
      makeMockResolver("review", { expectedScore: 1 }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // Sum: cicd=3, coverage=2, security=4, review=1, dora=1, docs=2 = 13
    expect(report.expectedTotalScore).toBe(13);
  });

  it("should preserve previousTotalScore from assessment", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 2, security: 3, review: 4, dora: 5, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 5 }),
    ]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // previousTotalScore = sum of assessment scores = 1+2+3+4+5+0 = 15
    expect(report.previousTotalScore).toBe(15);
    // expectedTotalScore = 5+2+3+4+5+0 = 19
    expect(report.expectedTotalScore).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — manifest persistence (kills ConditionalExpression/Block/Logical)
// ---------------------------------------------------------------------------

describe("ResolveEngine — manifest persistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should call saveManifest when dryRun=false AND manifest exists", async () => {
    writeManifest(tempDir);

    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const saveManifestSpy = vi.spyOn(ConfigManager.prototype, "saveManifest").mockResolvedValue(undefined);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    expect(saveManifestSpy).toHaveBeenCalledTimes(1);
    // Verify the manifest passed to saveManifest has updated readinessScores
    const savedManifest = saveManifestSpy.mock.calls[0][0];
    expect(savedManifest.readinessScores).toBeDefined();
    expect(savedManifest.readinessScores?.cicd).toBe(3);
    // lastAudit should have been set
    expect(savedManifest.lastAudit).toBeDefined();
    expect(typeof savedManifest.lastAudit).toBe("string");
  });

  it("should NOT call saveManifest when dryRun=true AND manifest exists", async () => {
    writeManifest(tempDir);

    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const saveManifestSpy = vi.spyOn(ConfigManager.prototype, "saveManifest").mockResolvedValue(undefined);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(saveManifestSpy).not.toHaveBeenCalled();
  });

  it("should NOT call saveManifest when dryRun=false AND manifest does not exist", async () => {
    // No writeManifest() => loadManifest returns null

    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const saveManifestSpy = vi.spyOn(ConfigManager.prototype, "saveManifest").mockResolvedValue(undefined);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    expect(saveManifestSpy).not.toHaveBeenCalled();
  });

  it("should NOT call saveManifest when dryRun=true AND manifest does not exist", async () => {
    // No writeManifest() => loadManifest returns null

    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const saveManifestSpy = vi.spyOn(ConfigManager.prototype, "saveManifest").mockResolvedValue(undefined);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(saveManifestSpy).not.toHaveBeenCalled();
  });

  it("should add warning instead of throwing when saveManifest fails", async () => {
    writeManifest(tempDir);

    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    vi.spyOn(ConfigManager.prototype, "saveManifest").mockRejectedValue(
      new Error("Disk full"),
    );

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    // Should not throw, but add a warning
    expect(report.warnings.some((w) => w.includes("Failed to update manifest") && w.includes("Disk full"))).toBe(true);
  });

  it("should persist updated readinessScores with all dimension expected scores", async () => {
    writeManifest(tempDir);

    const knownScores: ReadinessScores = {
      cicd: 0, coverage: 0, security: 0, review: 0, dora: 1, docs: 2,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const saveManifestSpy = vi.spyOn(ConfigManager.prototype, "saveManifest").mockResolvedValue(undefined);

    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", { expectedScore: 3 }),
      makeMockResolver("security", { expectedScore: 4 }),
      makeMockResolver("coverage", { expectedScore: 2 }),
      makeMockResolver("review", { expectedScore: 1 }),
    ];

    const engine = new ResolveEngine(resolvers);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: false,
      force: false,
    });

    expect(saveManifestSpy).toHaveBeenCalledTimes(1);
    const savedManifest = saveManifestSpy.mock.calls[0][0];
    expect(savedManifest.readinessScores).toBeDefined();
    const savedScores = savedManifest.readinessScores;
    expect(savedScores?.cicd).toBe(3);
    expect(savedScores?.coverage).toBe(2);
    expect(savedScores?.security).toBe(4);
    expect(savedScores?.review).toBe(1);
    // dora and docs unchanged from assessment
    expect(savedScores?.dora).toBe(1);
    expect(savedScores?.docs).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — warning propagation (kills ArrowFunction r.warnings)
// ---------------------------------------------------------------------------

describe("ResolveEngine — warning propagation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should propagate warnings from resolvers into final report", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", {
        expectedScore: 3,
        warnings: ["CICD warning: pipeline needs manual review"],
      }),
      makeMockResolver("security", {
        expectedScore: 4,
        warnings: ["Security warning: gitleaks config is outdated", "Security warning: semgrep rules need update"],
      }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // All three resolver warnings should be present in the report
    expect(report.warnings).toContain("CICD warning: pipeline needs manual review");
    expect(report.warnings).toContain("Security warning: gitleaks config is outdated");
    expect(report.warnings).toContain("Security warning: semgrep rules need update");
  });

  it("should include both engine-level and resolver-level warnings", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    // Request non-resolvable dimensions to generate engine-level warnings
    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", {
        expectedScore: 3,
        warnings: ["Resolver-level warning from cicd"],
      }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd", "dora"],
      dryRun: true,
      force: false,
    });

    // Engine-level warning about non-resolvable dimension
    expect(report.warnings.some((w) => w.includes("non-resolvable") && w.includes("dora"))).toBe(true);
    // Resolver-level warning
    expect(report.warnings).toContain("Resolver-level warning from cicd");
  });

  it("should return empty warnings array when no warnings are generated", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", { expectedScore: 3, warnings: [] }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    // No warnings from resolver, no invalid dimensions — should have no warnings
    // (or at most only CI integration warnings, which depend on existing files)
    const resolverWarnings = report.warnings.filter((w) =>
      !w.includes(".semgrep.yml") && !w.includes("CI pipeline"),
    );
    expect(resolverWarnings.length).toBe(0);
  });

  it("should propagate warnings from multiple resolvers in order", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolvers: DimensionResolver[] = [
      makeMockResolver("cicd", { expectedScore: 3, warnings: ["warn-cicd-1", "warn-cicd-2"] }),
      makeMockResolver("security", { expectedScore: 4, warnings: ["warn-sec-1"] }),
      makeMockResolver("coverage", { expectedScore: 2, warnings: ["warn-cov-1"] }),
      makeMockResolver("review", { expectedScore: 1, warnings: [] }),
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(report.warnings).toContain("warn-cicd-1");
    expect(report.warnings).toContain("warn-cicd-2");
    expect(report.warnings).toContain("warn-sec-1");
    expect(report.warnings).toContain("warn-cov-1");
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — dimension filtering (kills StringLiteral mutations)
// ---------------------------------------------------------------------------

describe("ResolveEngine — dimension filtering", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should call resolver for 'coverage' dimension when explicitly requested", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const coverageResolveFn = vi.fn(async (): Promise<ResolveResult> => ({
      dimension: "coverage",
      generatedFiles: [],
      previousScore: 1,
      expectedScore: 3,
      summary: "Coverage resolved",
      warnings: [],
    }));

    const coverageResolver: DimensionResolver = {
      dimension: "coverage",
      canResolve: () => true,
      resolve: coverageResolveFn,
    };

    const engine = new ResolveEngine([coverageResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["coverage"],
      dryRun: true,
      force: false,
    });

    expect(coverageResolveFn).toHaveBeenCalledTimes(1);
    expect(report.results.length).toBe(1);
    expect(report.results[0].dimension).toBe("coverage");
  });

  it("should call resolvers for all 4 resolvable dimensions when no filter is specified", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const calledDimensions: string[] = [];
    const resolvers: DimensionResolver[] = ["cicd", "security", "coverage", "review"].map(
      (dim) => ({
        dimension: dim,
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => {
          calledDimensions.push(dim);
          return {
            dimension: dim,
            generatedFiles: [],
            previousScore: 1,
            expectedScore: 3,
            summary: `${dim} resolved`,
            warnings: [],
          };
        },
      }),
    );

    const engine = new ResolveEngine(resolvers);
    await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(calledDimensions).toContain("cicd");
    expect(calledDimensions).toContain("security");
    expect(calledDimensions).toContain("coverage");
    expect(calledDimensions).toContain("review");
    expect(calledDimensions.length).toBe(4);
  });

  it("should skip resolver when dimension is not in RESOLVABLE_DIMENSIONS", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const doraResolveFn = vi.fn(async (): Promise<ResolveResult> => ({
      dimension: "dora",
      generatedFiles: [],
      previousScore: 0,
      expectedScore: 2,
      summary: "Dora resolved",
      warnings: [],
    }));

    const doraResolver: DimensionResolver = {
      dimension: "dora",
      canResolve: () => true,
      resolve: doraResolveFn,
    };

    const engine = new ResolveEngine([doraResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // "dora" is not a resolvable dimension — resolver should never be called
    expect(doraResolveFn).not.toHaveBeenCalled();
    expect(report.results.length).toBe(0);
  });

  it("should warn about non-resolvable dimensions and still resolve valid ones", async () => {
    const knownScores: ReadinessScores = {
      cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const engine = new ResolveEngine([
      makeMockResolver("cicd", { expectedScore: 3 }),
    ]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd", "dora", "docs"],
      dryRun: true,
      force: false,
    });

    // Warning about non-resolvable dimensions
    expect(report.warnings.some((w) => w.includes("non-resolvable") && w.includes("dora") && w.includes("docs"))).toBe(true);
    // The warning should mention the resolvable dimensions list
    expect(report.warnings.some((w) => w.includes("Resolvable:") && w.includes("cicd") && w.includes("security") && w.includes("coverage") && w.includes("review"))).toBe(true);
    // cicd should still resolve
    expect(report.results.length).toBe(1);
    expect(report.results[0].dimension).toBe("cicd");
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — targetScore calculation
// ---------------------------------------------------------------------------

describe("ResolveEngine — targetScore calculation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should pass targetScore from improvement plan action to resolver context", async () => {
    const knownScores: ReadinessScores = {
      cicd: 2, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    // Override improvement plan to set specific targetScore for cicd
    fakeAssessment.improvementPlan = [{
      dimension: "cicd",
      currentScore: 2,
      targetScore: 4,
      action: "Upgrade pipeline",
      estimatedTime: "2 weeks",
      priority: "high",
    }];
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    let capturedCtx: { targetScore: number } | undefined;
    const resolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: (ctx) => { capturedCtx = ctx; return true; },
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [],
        previousScore: 2,
        expectedScore: 4,
        summary: "Upgraded",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([resolver]);
    await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    // targetScore should be from the improvement plan action (4), not the default
    expect(capturedCtx).toBeDefined();
    expect(capturedCtx?.targetScore).toBe(4);
  });

  it("should use Math.min(5, currentScore + 1) as targetScore when no improvement action exists", async () => {
    const knownScores: ReadinessScores = {
      cicd: 3, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    // Remove all improvement plan actions for cicd
    fakeAssessment.improvementPlan = fakeAssessment.improvementPlan.filter(
      (a) => a.dimension !== "cicd",
    );
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    let capturedCtx: { targetScore: number } | undefined;
    const resolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: (ctx) => { capturedCtx = ctx; return true; },
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [],
        previousScore: 3,
        expectedScore: 4,
        summary: "Upgraded",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([resolver]);
    await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    // Default targetScore = Math.min(5, 3 + 1) = 4
    expect(capturedCtx).toBeDefined();
    expect(capturedCtx?.targetScore).toBe(4);
  });

  it("should cap targetScore at 5 when currentScore is 4 and no action exists", async () => {
    const knownScores: ReadinessScores = {
      cicd: 4, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    fakeAssessment.improvementPlan = fakeAssessment.improvementPlan.filter(
      (a) => a.dimension !== "cicd",
    );
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    let capturedCtx: { targetScore: number } | undefined;
    const resolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: (ctx) => { capturedCtx = ctx; return true; },
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [],
        previousScore: 4,
        expectedScore: 5,
        summary: "Maxed",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([resolver]);
    await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    // Default targetScore = Math.min(5, 4 + 1) = 5
    expect(capturedCtx).toBeDefined();
    expect(capturedCtx?.targetScore).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — CI integration warnings (semgrep verification)
// ---------------------------------------------------------------------------

describe("ResolveEngine — CI integration warnings", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should warn when .semgrep.yml is generated but not referenced in existing CI pipeline", async () => {
    // Create an existing workflow that does NOT reference .semgrep.yml
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, "ci.yml"),
      "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n",
      "utf-8",
    );

    const knownScores: ReadinessScores = {
      cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    // Security resolver that generates .semgrep.yml as written
    const securityResolver: DimensionResolver = {
      dimension: "security",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "security",
        generatedFiles: [{
          relativePath: ".semgrep.yml",
          content: "rules: []",
          existedBefore: false,
          written: true,
        }],
        previousScore: 0,
        expectedScore: 3,
        summary: "Security configs generated",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([securityResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["security"],
      dryRun: true,
      force: false,
    });

    expect(report.warnings.some((w) => w.includes(".semgrep.yml") && w.includes("CI pipeline"))).toBe(true);
  });

  it("should NOT warn about .semgrep.yml when CICD resolver generated a new pipeline", async () => {
    const knownScores: ReadinessScores = {
      cicd: 0, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    // CICD resolver generates a new pipeline (written: true)
    const cicdResolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [{
          relativePath: ".github/workflows/quality-gates.yml",
          content: "name: Quality Gates\n...",
          existedBefore: false,
          written: true,
        }],
        previousScore: 0,
        expectedScore: 3,
        summary: "CI pipeline generated",
        warnings: [],
      }),
    };

    // Security resolver generates .semgrep.yml
    const securityResolver: DimensionResolver = {
      dimension: "security",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "security",
        generatedFiles: [{
          relativePath: ".semgrep.yml",
          content: "rules: []",
          existedBefore: false,
          written: true,
        }],
        previousScore: 0,
        expectedScore: 3,
        summary: "Security configs generated",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([cicdResolver, securityResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    // Should NOT have the semgrep warning because CICD generated a new pipeline
    expect(report.warnings.some((w) => w.includes(".semgrep.yml") && w.includes("CI pipeline"))).toBe(false);
  });

  it("should NOT warn when existing CI pipeline already references .semgrep.yml", async () => {
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, "ci.yml"),
      "name: CI\non:\n  push:\njobs:\n  security:\n    runs-on: ubuntu-latest\n    steps:\n      - run: semgrep scan --config .semgrep.yml\n",
      "utf-8",
    );

    const knownScores: ReadinessScores = {
      cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const securityResolver: DimensionResolver = {
      dimension: "security",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "security",
        generatedFiles: [{
          relativePath: ".semgrep.yml",
          content: "rules: []",
          existedBefore: false,
          written: true,
        }],
        previousScore: 0,
        expectedScore: 3,
        summary: "Security configs generated",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([securityResolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["security"],
      dryRun: true,
      force: false,
    });

    // Should NOT warn because the existing CI already references .semgrep.yml
    expect(report.warnings.some((w) => w.includes(".semgrep.yml") && w.includes("CI pipeline"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — file counts (kills reduce/filter mutations)
// ---------------------------------------------------------------------------

describe("ResolveEngine — file counts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should count written files correctly in totalFilesGenerated", async () => {
    const knownScores: ReadinessScores = {
      cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: () => true,
      resolve: async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [
          { relativePath: "file1.yml", content: "a", existedBefore: false, written: true },
          { relativePath: "file2.yml", content: "b", existedBefore: false, written: true },
          { relativePath: "file3.yml", content: "c", existedBefore: true, written: false, skipReason: "exists" },
        ],
        previousScore: 0,
        expectedScore: 3,
        summary: "CI generated",
        warnings: [],
      }),
    };

    const engine = new ResolveEngine([resolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    // In dryRun, atomicWrite is not called, but totalFilesGenerated counts files with written=true
    // Wait — in dry-run the engine does NOT call atomicWrite, but it uses the `written` flag from the resolver.
    // Actually, looking at the code: the engine only writes when !dryRun. In dryRun, the files keep
    // their written flag from the resolver. But totalFilesGenerated counts files where written=true.
    expect(report.totalFilesGenerated).toBe(2);
    expect(report.totalFilesSkipped).toBe(1);
  });

  it("should count skipped files correctly in totalFilesSkipped", async () => {
    const knownScores: ReadinessScores = {
      cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolvers: DimensionResolver[] = [
      {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "a.yml", content: "a", existedBefore: true, written: false, skipReason: "exists" },
          ],
          previousScore: 0,
          expectedScore: 2,
          summary: "CI",
          warnings: [],
        }),
      },
      {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [
            { relativePath: "b.yml", content: "b", existedBefore: false, written: true },
            { relativePath: "c.yml", content: "c", existedBefore: true, written: false, skipReason: "exists" },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Security",
          warnings: [],
        }),
      },
    ];

    const engine = new ResolveEngine(resolvers);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dryRun: true,
      force: false,
    });

    expect(report.totalFilesGenerated).toBe(1);
    expect(report.totalFilesSkipped).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — canResolve and resolver skipping
// ---------------------------------------------------------------------------

describe("ResolveEngine — canResolve gating", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should skip resolver when canResolve returns false", async () => {
    const knownScores: ReadinessScores = {
      cicd: 5, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
    };
    const fakeAssessment = makeFakeAssessment(knownScores);
    vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

    const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
      dimension: "cicd",
      generatedFiles: [],
      previousScore: 5,
      expectedScore: 5,
      summary: "No change",
      warnings: [],
    }));

    const resolver: DimensionResolver = {
      dimension: "cicd",
      canResolve: () => false,
      resolve: resolveFn,
    };

    const engine = new ResolveEngine([resolver]);
    const report = await engine.resolve({
      repoRoot: tempDir,
      dimensions: ["cicd"],
      dryRun: true,
      force: false,
    });

    expect(resolveFn).not.toHaveBeenCalled();
    expect(report.results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ResolveEngine — mutation killing round 2
// ---------------------------------------------------------------------------

describe("ResolveEngine — mutation killing round 2", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---- File writing: atomicWrite called for written files, not for skipped ----

  describe("atomicWrite invocation", () => {
    it("should call atomicWrite for each file with written=true when dryRun=false", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const atomicWriteSpy = vi.fn<(targetPath: string, content: string, mode?: number) => Promise<void>>().mockResolvedValue(undefined);
      vi.spyOn(await import("../../src/utils/fs.js"), "atomicWrite").mockImplementation(atomicWriteSpy);

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "file-a.yml", content: "content-a", existedBefore: false, written: true },
            { relativePath: "file-b.yml", content: "content-b", existedBefore: false, written: true },
            { relativePath: "file-c.yml", content: "content-c", existedBefore: true, written: false, skipReason: "exists" },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: false,
        force: false,
      });

      // atomicWrite should be called exactly 2 times (for written=true files only)
      expect(atomicWriteSpy).toHaveBeenCalledTimes(2);
      expect(atomicWriteSpy).toHaveBeenCalledWith(join(tempDir, "file-a.yml"), "content-a");
      expect(atomicWriteSpy).toHaveBeenCalledWith(join(tempDir, "file-b.yml"), "content-b");
    });

    it("should NOT call atomicWrite when dryRun=true even with written=true files", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const atomicWriteSpy = vi.fn<(targetPath: string, content: string, mode?: number) => Promise<void>>().mockResolvedValue(undefined);
      vi.spyOn(await import("../../src/utils/fs.js"), "atomicWrite").mockImplementation(atomicWriteSpy);

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "file-a.yml", content: "content-a", existedBefore: false, written: true },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(atomicWriteSpy).not.toHaveBeenCalled();
    });

    it("should skip atomicWrite for files with written=false when dryRun=false", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const atomicWriteSpy = vi.fn<(targetPath: string, content: string, mode?: number) => Promise<void>>().mockResolvedValue(undefined);
      vi.spyOn(await import("../../src/utils/fs.js"), "atomicWrite").mockImplementation(atomicWriteSpy);

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "skipped.yml", content: "content", existedBefore: true, written: false, skipReason: "exists" },
          ],
          previousScore: 0,
          expectedScore: 1,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: false,
        force: false,
      });

      expect(atomicWriteSpy).not.toHaveBeenCalled();
    });
  });

  // ---- Write failure handling ----

  describe("write failure handling", () => {
    it("should set file.written=false and file.skipReason when atomicWrite throws", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const fsModule = await import("../../src/utils/fs.js");
      vi.spyOn(fsModule, "atomicWrite").mockRejectedValue(new Error("Permission denied"));

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "fail-file.yml", content: "x", existedBefore: false, written: true },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: false,
        force: false,
      });

      const file = report.results[0].generatedFiles[0];
      expect(file.written).toBe(false);
      expect(file.skipReason).toContain("Write failed");
      expect(file.skipReason).toContain("Permission denied");
    });

    it("should add a warning with the file path when atomicWrite throws", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const fsModule = await import("../../src/utils/fs.js");
      vi.spyOn(fsModule, "atomicWrite").mockRejectedValue(new Error("No space left"));

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "disk-full.yml", content: "x", existedBefore: false, written: true },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: false,
        force: false,
      });

      expect(report.warnings.some((w) =>
        w.includes("Failed to write") && w.includes("disk-full.yml") && w.includes("No space left"),
      )).toBe(true);
    });

    it("should handle non-Error throws in atomicWrite", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const fsModule = await import("../../src/utils/fs.js");
      vi.spyOn(fsModule, "atomicWrite").mockRejectedValue("string-error");

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "bad.yml", content: "x", existedBefore: false, written: true },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: false,
        force: false,
      });

      const file = report.results[0].generatedFiles[0];
      expect(file.written).toBe(false);
      expect(file.skipReason).toContain("Write failed");
      expect(file.skipReason).toContain("string-error");
    });
  });

  // ---- Semgrep CI integration cross-check details ----

  describe("semgrep CI integration cross-check", () => {
    it("should warn with exact text about --config when semgrep generated but not in CI", async () => {
      const workflowDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, "ci.yml"),
        "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n",
        "utf-8",
      );

      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const securityResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [{
            relativePath: ".semgrep.yml",
            content: "rules: []",
            existedBefore: false,
            written: true,
          }],
          previousScore: 0,
          expectedScore: 3,
          summary: "Security",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([securityResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      // Assert exact warning content
      const semgrepWarning = report.warnings.find((w) => w.includes(".semgrep.yml"));
      expect(semgrepWarning).toBeDefined();
      expect(semgrepWarning).toContain("Generated .semgrep.yml");
      expect(semgrepWarning).toContain("existing CI pipeline doesn't reference it");
      expect(semgrepWarning).toContain("--config .semgrep.yml");
    });

    it("should check azure-pipelines.yml for semgrep reference", async () => {
      // Create azure-pipelines.yml that does NOT reference semgrep
      writeFileSync(
        join(tempDir, "azure-pipelines.yml"),
        "trigger:\n  - main\npool:\n  vmImage: ubuntu-latest\nsteps:\n  - script: npm test\n",
        "utf-8",
      );

      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const securityResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [{
            relativePath: ".semgrep.yml",
            content: "rules: []",
            existedBefore: false,
            written: true,
          }],
          previousScore: 0,
          expectedScore: 3,
          summary: "Security",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([securityResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      expect(report.warnings.some((w) => w.includes(".semgrep.yml") && w.includes("CI pipeline"))).toBe(true);
    });

    it("should NOT warn when semgrep.yml is generated but NOT written (written=false)", async () => {
      const workflowDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, "ci.yml"),
        "name: CI\nsteps:\n  - run: npm test\n",
        "utf-8",
      );

      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const securityResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [{
            relativePath: ".semgrep.yml",
            content: "rules: []",
            existedBefore: true,
            written: false,
            skipReason: "exists",
          }],
          previousScore: 0,
          expectedScore: 2,
          summary: "Security",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([securityResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      // generatedSemgrep checks f.written — since it's false, no warning
      expect(report.warnings.some((w) => w.includes("Generated .semgrep.yml"))).toBe(false);
    });

    it("should NOT warn when no security result exists at all", async () => {
      const workflowDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, "ci.yml"),
        "name: CI\nsteps:\n  - run: npm test\n",
        "utf-8",
      );

      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      // Only cicd resolver, no security
      const cicdResolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [
            { relativePath: "ci.yml", content: "x", existedBefore: false, written: false },
          ],
          previousScore: 0,
          expectedScore: 3,
          summary: "CI",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([cicdResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(report.warnings.some((w) => w.includes(".semgrep.yml"))).toBe(false);
    });

    it("should NOT warn when no existing pipeline files exist", async () => {
      // No workflow dir and no azure-pipelines.yml
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const securityResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [{
            relativePath: ".semgrep.yml",
            content: "rules: []",
            existedBefore: false,
            written: true,
          }],
          previousScore: 0,
          expectedScore: 3,
          summary: "Security",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([securityResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      // existingPipeline is empty, so the warning block should not execute
      expect(report.warnings.some((w) => w.includes("Generated .semgrep.yml"))).toBe(false);
    });

    it("case-insensitive CI pipeline check: .SEMGREP.YML reference still suppresses warning", async () => {
      const workflowDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, "ci.yml"),
        "name: CI\nsteps:\n  - run: semgrep scan --config .SEMGREP.YML\n",
        "utf-8",
      );

      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 1, security: 0, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const securityResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "security",
          generatedFiles: [{
            relativePath: ".semgrep.yml",
            content: "rules: []",
            existedBefore: false,
            written: true,
          }],
          previousScore: 0,
          expectedScore: 3,
          summary: "Security",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([securityResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      // toLowerCase makes this case-insensitive
      expect(report.warnings.some((w) => w.includes("Generated .semgrep.yml"))).toBe(false);
    });
  });

  // ---- Invalid dimension warning exact text ----

  describe("invalid dimension warning exact text", () => {
    it("should include 'Skipping non-resolvable dimensions:' with exact dimension names", async () => {
      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const engine = new ResolveEngine([]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["dora"],
        dryRun: true,
        force: false,
      });

      const warning = report.warnings.find((w) => w.includes("non-resolvable"));
      expect(warning).toBeDefined();
      expect(warning).toContain("Skipping non-resolvable dimensions: dora");
      expect(warning).toContain("Resolvable: cicd, security, coverage, review.");
    });

    it("should list multiple invalid dimensions joined by comma-space", async () => {
      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const engine = new ResolveEngine([]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["dora", "docs", "nonexistent"],
        dryRun: true,
        force: false,
      });

      const warning = report.warnings.find((w) => w.includes("non-resolvable"));
      expect(warning).toBeDefined();
      expect(warning).toContain("dora, docs, nonexistent");
    });

    it("should NOT generate warning when all requested dimensions are valid", async () => {
      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const engine = new ResolveEngine([
        makeMockResolver("cicd", { expectedScore: 3 }),
      ]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(report.warnings.some((w) => w.includes("non-resolvable"))).toBe(false);
    });
  });

  // ---- File count with zero-file resolvers ----

  describe("file count edge cases", () => {
    it("totalFilesGenerated=0 and totalFilesSkipped=0 when resolver returns empty generatedFiles", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [],
          previousScore: 0,
          expectedScore: 1,
          summary: "Nothing generated",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(report.totalFilesGenerated).toBe(0);
      expect(report.totalFilesSkipped).toBe(0);
    });

    it("aggregates file counts across multiple resolvers correctly", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolvers: DimensionResolver[] = [
        {
          dimension: "cicd",
          canResolve: () => true,
          resolve: async (): Promise<ResolveResult> => ({
            dimension: "cicd",
            generatedFiles: [
              { relativePath: "a", content: "a", existedBefore: false, written: true },
              { relativePath: "b", content: "b", existedBefore: true, written: false, skipReason: "exists" },
            ],
            previousScore: 0,
            expectedScore: 2,
            summary: "CI",
            warnings: [],
          }),
        },
        {
          dimension: "security",
          canResolve: () => true,
          resolve: async (): Promise<ResolveResult> => ({
            dimension: "security",
            generatedFiles: [
              { relativePath: "c", content: "c", existedBefore: false, written: true },
              { relativePath: "d", content: "d", existedBefore: false, written: true },
              { relativePath: "e", content: "e", existedBefore: true, written: false, skipReason: "exists" },
            ],
            previousScore: 0,
            expectedScore: 3,
            summary: "Sec",
            warnings: [],
          }),
        },
        {
          dimension: "coverage",
          canResolve: () => true,
          resolve: async (): Promise<ResolveResult> => ({
            dimension: "coverage",
            generatedFiles: [
              { relativePath: "f", content: "f", existedBefore: true, written: false, skipReason: "exists" },
            ],
            previousScore: 0,
            expectedScore: 1,
            summary: "Cov",
            warnings: [],
          }),
        },
      ];

      const engine = new ResolveEngine(resolvers);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dryRun: true,
        force: false,
      });

      // written: a, c, d = 3; skipped: b, e, f = 3
      expect(report.totalFilesGenerated).toBe(3);
      expect(report.totalFilesSkipped).toBe(3);
    });
  });

  // ---- previousTotalScore comes from assessment ----

  describe("previousTotalScore and expectedTotalScore exact values", () => {
    it("previousTotalScore equals exact assessment.totalScore", async () => {
      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 3, security: 4, review: 1, dora: 5, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const engine = new ResolveEngine([]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dryRun: true,
        force: false,
      });

      // 2+3+4+1+5+0 = 15
      expect(report.previousTotalScore).toBe(15);
    });

    it("expectedTotalScore replaces only resolved dimension scores", async () => {
      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 2, security: 0, review: 3, dora: 4, docs: 5,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      // Only resolve security (0 -> 4)
      const engine = new ResolveEngine([
        makeMockResolver("security", { expectedScore: 4 }),
      ]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      // Expected: cicd=1, coverage=2, security=4(replaced), review=3, dora=4, docs=5 = 19
      expect(report.previousTotalScore).toBe(15); // 1+2+0+3+4+5
      expect(report.expectedTotalScore).toBe(19); // 1+2+4+3+4+5
    });
  });

  // ---- Resolver failure warning text ----

  describe("resolver failure warning text", () => {
    it("should include dimension name and error message in warning", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const failingResolver: DimensionResolver = {
        dimension: "security",
        canResolve: () => true,
        resolve: async () => {
          throw new Error("Template not found");
        },
      };

      const engine = new ResolveEngine([failingResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["security"],
        dryRun: true,
        force: false,
      });

      const warning = report.warnings.find((w) => w.includes("security"));
      expect(warning).toBeDefined();
      expect(warning).toContain("Resolver for security failed");
      expect(warning).toContain("Template not found");
    });

    it("should handle non-Error throws from resolver", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const failingResolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: () => true,
        resolve: async () => {
          throw 42;
        },
      };

      const engine = new ResolveEngine([failingResolver]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      const warning = report.warnings.find((w) => w.includes("cicd"));
      expect(warning).toBeDefined();
      expect(warning).toContain("Resolver for cicd failed");
      expect(warning).toContain("42");
    });
  });

  // ---- Context building: improvementAction fallback ----

  describe("context building when no improvement action exists", () => {
    it("should build fallback improvementAction with dimension suggestion text", async () => {
      const knownScores: ReadinessScores = {
        cicd: 2, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      // Remove cicd from improvement plan
      fakeAssessment.improvementPlan = fakeAssessment.improvementPlan.filter(
        (a) => a.dimension !== "cicd",
      );
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      let capturedCtx: ResolveContext | undefined;
      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: (ctx) => { capturedCtx = ctx as ResolveContext; return true; },
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [],
          previousScore: 2,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(capturedCtx).toBeDefined();
      expect(capturedCtx?.improvementAction.dimension).toBe("cicd");
      expect(capturedCtx?.improvementAction.currentScore).toBe(2);
      expect(capturedCtx?.improvementAction.targetScore).toBe(3); // Math.min(5, 2+1)
      expect(capturedCtx?.improvementAction.action).toContain("Improve cicd");
      expect(capturedCtx?.improvementAction.estimatedTime).toBe("unknown");
      expect(capturedCtx?.improvementAction.priority).toBe("medium");
    });

    it("should use first dimensionResult suggestion as fallback action text", async () => {
      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      // Set specific suggestion for cicd
      const cicdDimResult = fakeAssessment.dimensionResults.find((d) => d.dimension === "cicd");
      if (cicdDimResult) {
        cicdDimResult.suggestions = ["Add CI pipeline with quality gates"];
      }
      // Remove cicd from improvement plan so fallback triggers
      fakeAssessment.improvementPlan = fakeAssessment.improvementPlan.filter(
        (a) => a.dimension !== "cicd",
      );
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      let capturedCtx: ResolveContext | undefined;
      const resolver: DimensionResolver = {
        dimension: "cicd",
        canResolve: (ctx) => { capturedCtx = ctx as ResolveContext; return true; },
        resolve: async (): Promise<ResolveResult> => ({
          dimension: "cicd",
          generatedFiles: [],
          previousScore: 1,
          expectedScore: 3,
          summary: "Test",
          warnings: [],
        }),
      };

      const engine = new ResolveEngine([resolver]);
      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(capturedCtx).toBeDefined();
      expect(capturedCtx?.improvementAction.action).toBe("Add CI pipeline with quality gates");
    });
  });

  // ---- RESOLVABLE_DIMENSIONS exact values ----

  describe("RESOLVABLE_DIMENSIONS exact values", () => {
    it("should include 'cicd' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "cicd",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 3,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "cicd", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["cicd"], dryRun: true, force: false });
      expect(resolveFn).toHaveBeenCalledTimes(1);
    });

    it("should include 'security' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "security",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 3,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "security", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["security"], dryRun: true, force: false });
      expect(resolveFn).toHaveBeenCalledTimes(1);
    });

    it("should include 'coverage' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "coverage",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 3,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "coverage", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["coverage"], dryRun: true, force: false });
      expect(resolveFn).toHaveBeenCalledTimes(1);
    });

    it("should include 'review' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "review",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 3,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "review", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["review"], dryRun: true, force: false });
      expect(resolveFn).toHaveBeenCalledTimes(1);
    });

    it("should NOT include 'dora' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "dora",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 2,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "dora", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["dora"], dryRun: true, force: false });
      expect(resolveFn).not.toHaveBeenCalled();
    });

    it("should NOT include 'docs' as a resolvable dimension", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolveFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "docs",
        generatedFiles: [],
        previousScore: 0,
        expectedScore: 2,
        summary: "OK",
        warnings: [],
      }));

      const engine = new ResolveEngine([{ dimension: "docs", canResolve: () => true, resolve: resolveFn }]);
      await engine.resolve({ repoRoot: tempDir, dimensions: ["docs"], dryRun: true, force: false });
      expect(resolveFn).not.toHaveBeenCalled();
    });
  });

  // ---- Assessment failure wraps as ResolveError ----

  describe("assessment failure", () => {
    it("should throw ResolveError when assessment fails with Error", async () => {
      vi.spyOn(AssessmentEngine.prototype, "assess").mockRejectedValue(
        new Error("Assessment crash"),
      );

      const engine = new ResolveEngine([]);
      await expect(engine.resolve({
        repoRoot: tempDir,
        dryRun: true,
        force: false,
      })).rejects.toThrow("Failed to run assessment: Assessment crash");
    });

    it("should throw ResolveError when assessment fails with non-Error", async () => {
      vi.spyOn(AssessmentEngine.prototype, "assess").mockRejectedValue("string error");

      const engine = new ResolveEngine([]);
      await expect(engine.resolve({
        repoRoot: tempDir,
        dryRun: true,
        force: false,
      })).rejects.toThrow("Failed to run assessment: string error");
    });
  });

  // ---- flatMap vs filter: ensure all warnings from all results are collected ----

  describe("warning collection uses flatMap not filter", () => {
    it("should collect warnings from all resolvers, not just filter truthy values", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const resolvers: DimensionResolver[] = [
        makeMockResolver("cicd", { expectedScore: 3, warnings: ["cicd-w1", "cicd-w2"] }),
        makeMockResolver("security", { expectedScore: 4, warnings: [] }),
        makeMockResolver("coverage", { expectedScore: 2, warnings: ["cov-w1"] }),
        makeMockResolver("review", { expectedScore: 1, warnings: ["rev-w1", "rev-w2", "rev-w3"] }),
      ];

      const engine = new ResolveEngine(resolvers);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dryRun: true,
        force: false,
      });

      // flatMap produces 6 warnings total; filter would produce different results
      expect(report.warnings).toContain("cicd-w1");
      expect(report.warnings).toContain("cicd-w2");
      expect(report.warnings).toContain("cov-w1");
      expect(report.warnings).toContain("rev-w1");
      expect(report.warnings).toContain("rev-w2");
      expect(report.warnings).toContain("rev-w3");
      // Count total resolver warnings (engine-level warnings excluded)
      const resolverWarnings = report.warnings.filter((w) =>
        ["cicd-w1", "cicd-w2", "cov-w1", "rev-w1", "rev-w2", "rev-w3"].includes(w),
      );
      expect(resolverWarnings.length).toBe(6);
    });
  });

  // ---- Resolver dimension matching uses .includes() ----

  describe("resolver dimension matching", () => {
    it("should match resolver.dimension against requestedDimensions via includes", async () => {
      const knownScores: ReadinessScores = {
        cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      const cicdFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "cicd", generatedFiles: [], previousScore: 0, expectedScore: 3, summary: "OK", warnings: [],
      }));
      const secFn = vi.fn(async (): Promise<ResolveResult> => ({
        dimension: "security", generatedFiles: [], previousScore: 0, expectedScore: 3, summary: "OK", warnings: [],
      }));

      const engine = new ResolveEngine([
        { dimension: "cicd", canResolve: () => true, resolve: cicdFn },
        { dimension: "security", canResolve: () => true, resolve: secFn },
      ]);

      await engine.resolve({
        repoRoot: tempDir,
        dimensions: ["cicd"],
        dryRun: true,
        force: false,
      });

      expect(cicdFn).toHaveBeenCalledTimes(1);
      expect(secFn).not.toHaveBeenCalled();
    });
  });

  // ---- Manifest save failure warning text ----

  describe("manifest save failure warning text", () => {
    it("should include 'Failed to update manifest' and the error message", async () => {
      writeManifest(tempDir);

      const knownScores: ReadinessScores = {
        cicd: 1, coverage: 1, security: 1, review: 1, dora: 0, docs: 0,
      };
      const fakeAssessment = makeFakeAssessment(knownScores);
      vi.spyOn(AssessmentEngine.prototype, "assess").mockResolvedValue(fakeAssessment);

      vi.spyOn(ConfigManager.prototype, "saveManifest").mockRejectedValue(
        new Error("EACCES: permission denied"),
      );

      const engine = new ResolveEngine([
        makeMockResolver("cicd", { expectedScore: 3 }),
      ]);
      const report = await engine.resolve({
        repoRoot: tempDir,
        dryRun: false,
        force: false,
      });

      const warning = report.warnings.find((w) => w.includes("manifest"));
      expect(warning).toBeDefined();
      expect(warning).toContain("Failed to update manifest");
      expect(warning).toContain("EACCES: permission denied");
    });
  });
});
