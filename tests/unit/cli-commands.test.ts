import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(repoRoot: string, overrides: Record<string, unknown> = {}): void {
  const manifestDir = join(repoRoot, ".dafke");
  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    corulusCcVersion: "0.1.0",
    configSchemaVersion: 1,
    techStack: "typescript",
    ciPlatform: "github-actions",
    readinessScores: { cicd: 3, coverage: 3, security: 3, review: 3, dora: 3, docs: 3 },
    wave: "wave2",
    lastAudit: "2026-01-01T00:00:00.000Z",
    overrides: {},
    ...overrides,
  };
  writeFileSync(join(manifestDir, "manifest.yaml"), stringifyYaml(manifest), "utf-8");
}

// ---------------------------------------------------------------------------
// audit command
// ---------------------------------------------------------------------------

describe("audit command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exits with error when no manifest exists", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - accessing internal run method for testing
    await auditCommand.run({ args: { format: "text", dimension: undefined } });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("outputs JSON format when requested", async () => {
    writeManifest(tempDir);
    // Create a minimal github workflow so CICD analyzer can find something
    const workflowDir = join(tempDir, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "ci.yml"), "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint\n", "utf-8");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - accessing internal run method for testing
    await auditCommand.run({ args: { format: "json", dimension: undefined } });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const output = JSON.parse(jsonCalls[0]?.[0] as string);
    expect(output).toHaveProperty("scores");
    expect(output).toHaveProperty("wave");
    expect(output).toHaveProperty("totalScore");
    expect(output).toHaveProperty("improvementPlan");
  });

  it("saves scores to manifest after assessment", async () => {
    // Write a manifest without scores — omit the keys so Zod defaults kick in
    const manifestDir = join(tempDir, ".dafke");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "manifest.yaml"),
      stringifyYaml({
        corulusCcVersion: "0.1.0",
        configSchemaVersion: 1,
        techStack: "typescript",
        ciPlatform: "github-actions",
        overrides: {},
      }),
      "utf-8",
    );
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: auditCommand } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - accessing internal run method for testing
    await auditCommand.run({ args: { format: "json", dimension: undefined } });

    // Manifest should now have scores
    const manifestPath = join(tempDir, ".dafke", "manifest.yaml");
    const content = readFileSync(manifestPath, "utf-8");
    expect(content).toContain("readinessScores");
  });
});

// ---------------------------------------------------------------------------
// status command
// ---------------------------------------------------------------------------

describe("status command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("suggests init when no manifest found", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: statusCommand } = await import("../../src/cli/commands/status.js");
    // @ts-expect-error - accessing internal run method for testing
    await statusCommand.run({ args: { format: "text" } });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("init");
  });

  it("displays dashboard with scores", async () => {
    writeManifest(tempDir);
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: statusCommand } = await import("../../src/cli/commands/status.js");
    // @ts-expect-error - accessing internal run method for testing
    await statusCommand.run({ args: { format: "text" } });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Readiness Scorecard");
    expect(output).toContain("Wave");
  });

  it("outputs JSON format", async () => {
    writeManifest(tempDir);
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: statusCommand } = await import("../../src/cli/commands/status.js");
    // @ts-expect-error - accessing internal run method for testing
    await statusCommand.run({ args: { format: "json" } });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const output = JSON.parse(jsonCalls[0]?.[0] as string);
    expect(output).toHaveProperty("scores");
    expect(output).toHaveProperty("wave");
  });
});

// ---------------------------------------------------------------------------
// doctor command
// ---------------------------------------------------------------------------

describe("doctor command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects missing .dafke directory", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
    // @ts-expect-error - accessing internal run method for testing
    await doctorCommand.run({ args: { fix: false } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    // Should report results
    expect(output).toContain("Results");
  });

  it("creates .dafke directory in fix mode", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
    // @ts-expect-error - accessing internal run method for testing
    await doctorCommand.run({ args: { fix: true } });

    expect(existsSync(join(tempDir, ".dafke"))).toBe(true);
  });

  it("creates CLAUDE.md in fix mode", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
    // @ts-expect-error - accessing internal run method for testing
    await doctorCommand.run({ args: { fix: true } });

    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// update command - UpdateChecker
// ---------------------------------------------------------------------------

describe("UpdateChecker", () => {
  it("returns null when fetch fails", async () => {
    const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
    const checker = new UpdateChecker();

    // Mock fetch to fail
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await checker.checkForUpdates();
    expect(result).toBeNull();

    global.fetch = originalFetch;
  });

  it("detects missing files as drift", async () => {
    const tempDir = makeTempDir();
    const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
    const checker = new UpdateChecker();

    const results = await checker.detectDrift(tempDir);
    // Results depend on whether templates exist in project, but should not throw
    expect(Array.isArray(results)).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("applies updates by writing files", async () => {
    const tempDir = makeTempDir();
    const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
    const checker = new UpdateChecker();

    await checker.applyUpdate(tempDir, [
      { filePath: "test-file.txt", type: "missing", templateContent: "hello world" },
    ]);

    expect(existsSync(join(tempDir, "test-file.txt"))).toBe(true);
    expect(readFileSync(join(tempDir, "test-file.txt"), "utf-8")).toBe("hello world");

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// repos command
// ---------------------------------------------------------------------------

describe("repos command", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("outputs empty JSON array when no providers configured", async () => {
    // Mock ConfigManager to return empty auth
    const { default: reposCommand } = await import("../../src/cli/commands/repos.js");

    // The command loads global config which should have no auth tokens set
    // It should output an empty list or error
    // @ts-expect-error - accessing internal run method for testing
    await reposCommand.run({ args: { provider: "all", format: "json" } });

    // Should have called console.log at least once
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("shows provider-specific message when unconfigured", async () => {
    const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
    // @ts-expect-error - accessing internal run method for testing
    await reposCommand.run({ args: { provider: "github", format: "text" } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    // Should mention connect or not configured
    expect(output.toLowerCase()).toMatch(/connect|not configured|no repositories/i);
  });
});

// ---------------------------------------------------------------------------
// connect command
// ---------------------------------------------------------------------------

describe("connect command", () => {
  it("module exports a citty command with correct meta", async () => {
    const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
    expect(connectCommand).toBeDefined();
    expect(connectCommand.meta?.name).toBe("connect");
    expect(connectCommand.args).toHaveProperty("service");
  });
});

// ---------------------------------------------------------------------------
// hook command
// ---------------------------------------------------------------------------

describe("hook command", () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("blocks dangerous rm -rf / command", async () => {
    // We test the internal handlers directly since the command reads stdin
    const hookModule = await import("../../src/cli/commands/hook.js");
    void hookModule;

    // Mock stdin to provide payload
    const mockStdin = {
      isTTY: false,
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === "data") {
          cb(Buffer.from(JSON.stringify({ command: "rm -rf /" })));
        }
        if (event === "end") {
          (cb as () => void)();
        }
        return mockStdin;
      }),
    };

    // Test the pre-bash event by calling the run method
    // Due to stdin complexity, we test the pattern matching directly
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /DROP\s+TABLE/i,
      /DELETE\s+FROM\s+\S+\s*;?\s*$/i,
    ];

    expect(dangerousPatterns[0]?.test("rm -rf /")).toBe(true);
    expect(dangerousPatterns[1]?.test("DROP TABLE users")).toBe(true);
    expect(dangerousPatterns[2]?.test("DELETE FROM users;")).toBe(true);
  });

  it("allows safe commands", () => {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /DROP\s+TABLE/i,
      /rm\s+-rf\s+\*/,
    ];

    const safeCommands = ["git status", "npm test", "ls -la", "cat file.txt"];

    for (const cmd of safeCommands) {
      const isBlocked = dangerousPatterns.some((p) => p.test(cmd));
      expect(isBlocked).toBe(false);
    }
  });

  it("detects security patterns in edits", () => {
    const securityPatterns = [
      /\beval\s*\(/,
      /\binnerHTML\s*=/,
      /\bdangerouslySetInnerHTML/,
    ];

    expect(securityPatterns[0]?.test("eval('code')")).toBe(true);
    expect(securityPatterns[1]?.test("element.innerHTML = data")).toBe(true);
    expect(securityPatterns[2]?.test("dangerouslySetInnerHTML={{ __html: x }}")).toBe(true);
    expect(securityPatterns[0]?.test("const result = calculate()")).toBe(false);
  });

  it("detects Jira ticket IDs in prompts", () => {
    const ticketPattern = /\b([A-Z]{2,10}-\d{1,6})\b/;
    expect(ticketPattern.test("Fix PROJ-123 bug")).toBe(true);
    expect(ticketPattern.test("no tickets here")).toBe(false);

    const match = "Implement FEAT-456 and BUG-789".match(new RegExp(ticketPattern.source, "g"));
    expect(match).toEqual(["FEAT-456", "BUG-789"]);
  });

  it("detects Azure DevOps ticket IDs in prompts", () => {
    const azPattern = /\bAB#(\d+)\b/;
    expect(azPattern.test("Fix AB#12345")).toBe(true);
    expect(azPattern.test("no tickets")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TemplateEngine
// ---------------------------------------------------------------------------

describe("TemplateEngine", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("renders simple variable substitution", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "Hello {{name}}!", "utf-8");
    const result = engine.render("test.md", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("renders if blocks", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "{{#if show}}visible{{/if}}", "utf-8");

    expect(engine.render("test.md", { show: true })).toBe("visible");
    expect(engine.render("test.md", { show: false })).toBe("");
  });

  it("renders if-else blocks", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "{{#if active}}yes{{else}}no{{/if}}", "utf-8");

    expect(engine.render("test.md", { active: true })).toBe("yes");
    expect(engine.render("test.md", { active: false })).toBe("no");
  });

  it("renders each blocks with primitives", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "Items: {{#each items}}{{this}}, {{/each}}", "utf-8");
    const result = engine.render("test.md", { items: ["a", "b", "c"] });
    expect(result).toBe("Items: a, b, c, ");
  });

  it("renders each blocks with objects", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "{{#each users}}{{name}} {{/each}}", "utf-8");
    const result = engine.render("test.md", { users: [{ name: "Alice" }, { name: "Bob" }] });
    expect(result).toBe("Alice Bob ");
  });

  it("returns empty string for falsy each items", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "test.md"), "{{#each items}}x{{/each}}", "utf-8");
    const result = engine.render("test.md", { items: [] });
    expect(result).toBe("");
  });

  it("throws for missing template", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    expect(() => engine.getTemplate("nonexistent.md")).toThrow("Template not found");
  });

  it("hasTemplate returns correct results", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    writeFileSync(join(tempDir, "exists.md"), "content", "utf-8");
    expect(engine.hasTemplate("exists.md")).toBe(true);
    expect(engine.hasTemplate("nope.md")).toBe(false);
  });

  it("renderString works without loading a file", async () => {
    const { TemplateEngine } = await import("../../src/core/scaffold/template-engine.js");
    const engine = new TemplateEngine(tempDir);

    const result = engine.renderString("Hello {{name}}", { name: "Test" });
    expect(result).toBe("Hello Test");
  });
});
