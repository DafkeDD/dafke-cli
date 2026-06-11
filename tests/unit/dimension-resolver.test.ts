import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { buildGeneratedFile, type ResolveContext } from "../../src/core/resolver/dimension-resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-resolver-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeCtx(repoRoot: string, overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    repoRoot,
    techStack: "typescript",
    ciPlatform: "none",
    dryRun: false,
    force: false,
    currentScore: 2,
    targetScore: 4,
    dimensionResult: {
      dimension: "test",
      score: 2,
      details: "test details",
      evidence: [],
      suggestions: [],
    },
    improvementAction: {
      dimension: "test",
      currentScore: 2,
      targetScore: 4,
      action: "test action",
      estimatedTime: "1h",
      priority: "medium",
    },
    ...overrides,
  };
}

describe("buildGeneratedFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("dry-run returns written: false", () => {
    const ctx = makeCtx(tempDir, { dryRun: true });
    const result = buildGeneratedFile(ctx, "test.txt", "content");

    expect(result.written).toBe(false);
    expect(result.relativePath).toBe("test.txt");
    expect(result.content).toBe("content");
  });

  it("file exists + no force returns skipReason", () => {
    writeFileSync(join(tempDir, "existing.txt"), "old content", "utf-8");
    const ctx = makeCtx(tempDir, { force: false });
    const result = buildGeneratedFile(ctx, "existing.txt", "new content");

    expect(result.written).toBe(false);
    expect(result.existedBefore).toBe(true);
    expect(result.skipReason).toBeDefined();
    expect(result.skipReason).toContain("already exists");
  });

  it("file exists + force returns written: true", () => {
    writeFileSync(join(tempDir, "existing.txt"), "old content", "utf-8");
    const ctx = makeCtx(tempDir, { force: true });
    const result = buildGeneratedFile(ctx, "existing.txt", "new content");

    expect(result.written).toBe(true);
    expect(result.existedBefore).toBe(true);
    expect(result.skipReason).toBeUndefined();
  });

  it("file does not exist returns written: true", () => {
    const ctx = makeCtx(tempDir);
    const result = buildGeneratedFile(ctx, "new-file.txt", "content");

    expect(result.written).toBe(true);
    expect(result.existedBefore).toBe(false);
    expect(result.skipReason).toBeUndefined();
  });

  it("correct relativePath passed through", () => {
    const ctx = makeCtx(tempDir);
    const result = buildGeneratedFile(ctx, "some/nested/path.yml", "yaml content");

    expect(result.relativePath).toBe("some/nested/path.yml");
  });

  it("content passed through correctly", () => {
    const ctx = makeCtx(tempDir);
    const content = "multi\nline\ncontent\nwith special chars: !@#$%";
    const result = buildGeneratedFile(ctx, "file.txt", content);

    expect(result.content).toBe(content);
  });
});
