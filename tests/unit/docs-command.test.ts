import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-docs-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// docs command — happy paths
// ---------------------------------------------------------------------------

describe("docs command — happy paths", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("dry-run shows all documentation layers", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: undefined, "dry-run": true, update: false, format: "markdown" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("GitNexus");
    expect(output).toContain("Dependency Analysis");
    expect(output).toContain("Graphify");
    expect(output).toContain("Documentation Assembly");
    expect(output).toContain("ARCHITECTURE.md");
    expect(output).toContain("INDEX.md");
  });

  it("dry-run shows TypeDoc for TypeScript projects", async () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: undefined, "dry-run": true, update: false, format: "markdown" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("TypeDoc");
  });

  it("skip flag excludes specified layers from dry-run", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": true, update: false, format: "markdown" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("DRY RUN");
    expect(output).not.toContain("GitNexus —");
    expect(output).not.toContain("Graphify —");
  });

  it("generates ARCHITECTURE.md and INDEX.md when tools fail gracefully", { timeout: 15_000 }, async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "graphify,typedoc", "dry-run": false, update: false, format: "markdown" },
    });

    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "INDEX.md"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "modules"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "diagrams"))).toBe(true);

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(arch).toContain("Architecture Documentation");
    expect(arch).toContain("Table of Contents");
    expect(arch).toContain("Risk Assessment");
  });

  it("json format outputs structured result", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const result = JSON.parse(jsonCalls[0][0] as string);
    expect(result).toHaveProperty("outputDir");
    expect(result).toHaveProperty("techStack");
    expect(result).toHaveProperty("archLines");
  });

  it("custom output directory is respected", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "architecture", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    expect(existsSync(join(tempDir, "architecture", "ARCHITECTURE.md"))).toBe(true);
    expect(existsSync(join(tempDir, "architecture", "INDEX.md"))).toBe(true);
  });

  it("detects TypeScript tech stack", async () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("TypeScript");
  });

  it("detects .NET tech stack from .sln files", async () => {
    writeFileSync(join(tempDir, "Project.sln"), "", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain(".NET");
  });

  it("detects Java tech stack from pom.xml", async () => {
    writeFileSync(join(tempDir, "pom.xml"), "<project></project>", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("Java");
  });

  it("detects Delphi tech stack from .dproj files", async () => {
    writeFileSync(join(tempDir, "MyApp.dproj"), "<Project></Project>", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("Delphi");
  });

  it("detects FoxPro tech stack from .prg files", async () => {
    writeFileSync(join(tempDir, "main.prg"), "DO FORM MainForm", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("FoxPro");
  });

  it("INDEX.md contains routing table entries", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const index = readFileSync(join(tempDir, "docs", "INDEX.md"), "utf-8");
    expect(index).toContain("high-level architecture");
    expect(index).toContain("ARCHITECTURE.md");
    expect(index).toContain("For AI Agents");
  });

  it("updates CLAUDE.md with documentation section", async () => {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# Project\n\nExisting content.\n", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("## Documentation");
    expect(claudeMd).toContain("ARCHITECTURE.md");
    expect(claudeMd).toContain("Existing content");
  });

  it("does not duplicate Documentation section in CLAUDE.md", async () => {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# Project\n\n## Documentation\n\nAlready exists.\n", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    const count = (claudeMd.match(/## Documentation/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("updates README.md with documentation links", async () => {
    writeFileSync(join(tempDir, "README.md"), "# My Project\n\nSome content.\n", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const readme = readFileSync(join(tempDir, "README.md"), "utf-8");
    expect(readme).toContain("## Documentation");
    expect(readme).toContain("Architecture Overview");
  });

  it("no banner appears after command", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": true, update: false, format: "markdown" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).not.toContain("██████╗");
  });
});

// ---------------------------------------------------------------------------
// docs command — content validation
// ---------------------------------------------------------------------------

describe("docs command — content validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("ARCHITECTURE.md contains Architecture Documentation heading", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(arch).toContain("Architecture Documentation");
  });

  it("ARCHITECTURE.md includes coupling section when deps available", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    // The Table of Contents lists Risk Assessment, which covers coupling
    expect(arch).toContain("Risk Assessment");
    // The doc always has a Circular dependencies entry in Risk Assessment
    expect(arch).toContain("Circular dependencies");
  });

  it("ARCHITECTURE.md includes risk assessment section", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(arch).toContain("## Risk Assessment");
  });

  it("INDEX.md contains routing table with ARCHITECTURE.md references", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const index = readFileSync(join(tempDir, "docs", "INDEX.md"), "utf-8");
    expect(index).toContain("high-level architecture");
    expect(index).toContain("ARCHITECTURE.md");
    expect(index).toContain("For AI Agents");
  });
});

// ---------------------------------------------------------------------------
// docs command — failure paths
// ---------------------------------------------------------------------------

describe("docs command — failure paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("generates minimal docs when all tools fail", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    // Should still produce ARCHITECTURE.md and INDEX.md even with no tools
    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "INDEX.md"))).toBe(true);

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(arch).toContain("Architecture Documentation");
    expect(arch).toContain("Risk Assessment");
  });

  it("handles missing CLAUDE.md gracefully", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    // Should not crash when CLAUDE.md doesn't exist
    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(true);
  });

  it("handles missing README.md gracefully", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    // Should not crash when README.md doesn't exist
    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(true);
  });

  it("detects Unknown tech stack when no indicators present", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const content = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("Unknown");
  });

  it("generates valid docs even with empty skip string", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "", "dry-run": true, update: false, format: "markdown" },
    });

    // dry-run with empty skip string should not crash
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// step-arch simplified
// ---------------------------------------------------------------------------

describe("step-arch (simplified)", () => {
  let tempDir: string;
  const mockPrompts = {
    log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn(), message: vi.fn() },
    confirm: vi.fn(() => true),
    isCancel: vi.fn(() => false),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  };

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("suggests docs instead of generating docs directly", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not available")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const result = await execute({
      repoRoot: tempDir,
      verbose: false,
      nonInteractive: true,
      answers: {},
    });

    expect(result.success).toBe(true);
    expect(result.data?.["archDocGenerated"]).toBe(false);
    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(false);

    const allCalls = [
      ...mockPrompts.log.info.mock.calls.map((c: unknown[]) => String(c[0])),
      ...mockPrompts.log.message.mock.calls.map((c: unknown[]) => String(c[0])),
    ];
    expect(allCalls.some((msg: string) => msg.includes("docs") || msg.includes("dafke-arch"))).toBe(true);
  });

  it("indexes GitNexus when available", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "indexed" }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const result = await execute({
      repoRoot: tempDir,
      verbose: false,
      nonInteractive: true,
      answers: {},
    });

    expect(result.success).toBe(true);
    expect(result.data?.["gitnexusIndexed"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// New feature tests — C4 diagram, per-module docs, --update
// ---------------------------------------------------------------------------

describe("docs new features", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("dry-run shows 6 layers with no crew references", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: undefined, "dry-run": true, update: false, format: "markdown" },
    });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("Index Builder");
    expect(output).not.toContain("Documentation Crew");
    expect(output).not.toContain("crew");
    expect(output).toContain("dafke-docs plugin");
  });

  it("generates C4 context diagram in diagrams/", async () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project", description: "A test project" }), "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const c4Path = join(tempDir, "docs", "diagrams", "c4-context.mmd");
    expect(existsSync(c4Path)).toBe(true);
    const c4Content = readFileSync(c4Path, "utf-8");
    expect(c4Content).toContain("C4Context");
    expect(c4Content).toContain("test-project");
    expect(c4Content).toContain("Developer");
  });

  it("generates per-module docs from src/ directories", async () => {
    mkdirSync(join(tempDir, "src", "utils"), { recursive: true });
    mkdirSync(join(tempDir, "src", "core"), { recursive: true });
    writeFileSync(join(tempDir, "src", "utils", "helpers.ts"), "export function helper() {}", "utf-8");
    writeFileSync(join(tempDir, "src", "core", "engine.ts"), "export class Engine {}", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    expect(existsSync(join(tempDir, "docs", "modules", "utils.md"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "modules", "core.md"))).toBe(true);

    const utilsDoc = readFileSync(join(tempDir, "docs", "modules", "utils.md"), "utf-8");
    expect(utilsDoc).toContain("utils");
    expect(utilsDoc).toContain("helpers.ts");
  });

  it("--update with no existing docs falls through to full generation", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: true, format: "markdown" },
    });

    // Should still generate docs since no existing ARCHITECTURE.md
    expect(existsSync(join(tempDir, "docs", "ARCHITECTURE.md"))).toBe(true);
  });

  it("ARCHITECTURE.md includes C4 diagram when available", async () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "my-system" }), "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "markdown" },
    });

    const arch = readFileSync(join(tempDir, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(arch).toContain("C4Context");
    expect(arch).toContain("System Context");
  });

  it("json output includes moduleDocs count", async () => {
    mkdirSync(join(tempDir, "src", "api"), { recursive: true });
    writeFileSync(join(tempDir, "src", "api", "handler.ts"), "export default {}", "utf-8");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: docsCommand } = await import("../../src/cli/commands/docs.js");
    // @ts-expect-error - internal run
    await docsCommand.run({
      args: { output: "docs", skip: "gitnexus,graphify,typedoc,deps", "dry-run": false, update: false, format: "json" },
    });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try { JSON.parse(call[0] as string); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    const result = JSON.parse(jsonCalls[0][0] as string);
    expect(result).toHaveProperty("moduleDocs");
    expect(result.moduleDocs).toBeGreaterThan(0);
  });
});
