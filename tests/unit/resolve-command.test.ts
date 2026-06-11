import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execaSync } from "execa";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-cmd-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function initGitRepo(dir: string): void {
  execaSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["config", "user.email", "test@dafke.be"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["config", "user.name", "CI Test"], { cwd: dir, stdio: "ignore" });
  execaSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir, stdio: "ignore" });
}

// ---------------------------------------------------------------------------
// resolve command
// ---------------------------------------------------------------------------

describe("resolve command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("runs without crashing on empty repo", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: undefined, "dry-run": true, force: false, format: "text" },
    });

    expect(consoleSpy).toHaveBeenCalled();
  });

  it("outputs valid JSON with --format json", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: undefined, "dry-run": true, force: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const report = JSON.parse(jsonCalls[0][0] as string);
    expect(report).toHaveProperty("results");
    expect(report).toHaveProperty("totalFilesGenerated");
    expect(report).toHaveProperty("totalFilesSkipped");
    expect(report).toHaveProperty("previousTotalScore");
    expect(report).toHaveProperty("expectedTotalScore");
    expect(report).toHaveProperty("warnings");
  });

  it("dry-run shows preview without writing", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: undefined, "dry-run": true, force: false, format: "text" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("DRY RUN");
  });

  it("filters to a specific dimension", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: "security", "dry-run": true, force: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const report = JSON.parse(jsonCalls[0][0] as string);
    expect(report.results.length).toBe(1);
    expect(report.results[0].dimension).toBe("security");
  });

  it("supports comma-separated dimensions", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: "cicd,security", "dry-run": true, force: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    const report = JSON.parse(jsonCalls[0][0] as string);
    expect(report.results.length).toBe(2);
    const dims = report.results.map((r: Record<string, unknown>) => r.dimension);
    expect(dims).toContain("cicd");
    expect(dims).toContain("security");
  });

  it("text format shows score change", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: "cicd", "dry-run": true, force: false, format: "text" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Should contain score information
    expect(output).toContain("/5");
    expect(output).toContain("Score:");
  });

  it("text format shows files to be generated", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: "security", "dry-run": true, force: false, format: "text" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(".semgrep.yml");
    expect(output).toContain(".gitleaks.toml");
  });

  it("handles non-resolvable dimension gracefully", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: resolveCommand } = await import("../../src/cli/commands/resolve.js");
    // @ts-expect-error - accessing internal run method for testing
    await resolveCommand.run({
      args: { dimension: "dora", "dry-run": true, force: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    const report = JSON.parse(jsonCalls[0][0] as string);
    expect(report.results.length).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// audit command — override feature
// ---------------------------------------------------------------------------

describe("audit command — override", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    initGitRepo(tempDir);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("applies score overrides in JSON output", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal run
    await auditCommand.run({
      args: { format: "json", dimension: undefined, override: "cicd=5,docs=5" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const result = JSON.parse(jsonCalls[0][0] as string);
    expect(result.scores.cicd).toBe(5);
    expect(result.scores.docs).toBe(5);
  });

  it("ignores invalid override dimension names", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal run
    await auditCommand.run({
      args: { format: "json", dimension: undefined, override: "nonexistent=5" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    const result = JSON.parse(jsonCalls[0][0] as string);
    // Score should not have been affected
    expect(result.scores.cicd).toBeLessThanOrEqual(5);
  });

  it("clamps override values to 0-5 range", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal run
    await auditCommand.run({
      args: { format: "json", dimension: undefined, override: "cicd=99,security=-1" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    const result = JSON.parse(jsonCalls[0][0] as string);
    expect(result.scores.cicd).toBe(5);  // clamped from 99
    expect(result.scores.security).toBe(0);  // clamped from -1
  });
});

// ---------------------------------------------------------------------------
// Template engine — eq helper
// ---------------------------------------------------------------------------

describe("TemplateEngine eq helper", () => {
  it("renders eq conditional for matching value", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine();
    const result = engine.renderString(
      '{{#if (eq lang "typescript")}}TS{{/if}}',
      { lang: "typescript" },
    );
    expect(result).toBe("TS");
  });

  it("renders empty for non-matching eq conditional", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine();
    const result = engine.renderString(
      '{{#if (eq lang "java")}}JAVA{{/if}}',
      { lang: "typescript" },
    );
    expect(result).toBe("");
  });

  it("handles eq with else branch", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine();
    const result = engine.renderString(
      '{{#if (eq lang "dotnet")}}NET{{else}}OTHER{{/if}}',
      { lang: "java" },
    );
    expect(result).toBe("OTHER");
  });

  it("handles multiple eq conditionals", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine();
    const tpl = '{{#if (eq ts "dotnet")}}A{{/if}}{{#if (eq ts "java")}}B{{/if}}{{#if (eq ts "typescript")}}C{{/if}}';
    expect(engine.renderString(tpl, { ts: "dotnet" })).toBe("A");
    expect(engine.renderString(tpl, { ts: "java" })).toBe("B");
    expect(engine.renderString(tpl, { ts: "typescript" })).toBe("C");
    expect(engine.renderString(tpl, { ts: "unknown" })).toBe("");
  });
});
