import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-doctor-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Set up a fully-healthy repo root with all files the doctor checks for. */
function setupHealthyRepo(repoRoot: string): void {
  // .dafke/ directory
  const corulusDir = join(repoRoot, ".dafke");
  mkdirSync(corulusDir, { recursive: true });

  // manifest.yaml
  const manifest = {
    corulusCcVersion: "0.1.0",
    configSchemaVersion: 1,
    techStack: "typescript",
    ciPlatform: "github-actions",
    overrides: {},
  };
  writeFileSync(join(corulusDir, "manifest.yaml"), stringifyYaml(manifest), "utf-8");

  // .claude/settings.json
  const claudeDir = join(repoRoot, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ permissions: {} }, null, 2), "utf-8");

  // CLAUDE.md
  writeFileSync(join(repoRoot, "CLAUDE.md"), "# CLAUDE.md\n", "utf-8");

  // MCP config
  writeFileSync(join(claudeDir, "mcp.json"), JSON.stringify({ servers: {} }), "utf-8");

  // lefthook.yml
  writeFileSync(join(repoRoot, "lefthook.yml"), "pre-commit:\n  commands: {}\n", "utf-8");

  // .gitnexus/
  mkdirSync(join(repoRoot, ".gitnexus"), { recursive: true });
}

// ---------------------------------------------------------------------------
// Tests
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

  // -----------------------------------------------------------------------
  // Filesystem-based checks — pass / fail
  // -----------------------------------------------------------------------

  describe("filesystem checks", () => {
    const checkCases = [
      {
        check: ".dafke/ directory",
        setup: (root: string) => mkdirSync(join(root, ".dafke"), { recursive: true }),
        passMsg: "Directory exists",
        failMsg: "Missing .dafke/ directory",
      },
      {
        check: "manifest.yaml",
        setup: (root: string) => {
          mkdirSync(join(root, ".dafke"), { recursive: true });
          writeFileSync(
            join(root, ".dafke", "manifest.yaml"),
            stringifyYaml({ corulusCcVersion: "0.1.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} }),
            "utf-8",
          );
        },
        passMsg: "Valid YAML",
        failMsg: "Missing .dafke/manifest.yaml",
      },
      {
        check: "settings.json",
        setup: (root: string) => {
          mkdirSync(join(root, ".claude"), { recursive: true });
          writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify({ permissions: {} }), "utf-8");
        },
        passMsg: "Valid JSON",
        failMsg: "Missing .claude/settings.json",
      },
      {
        check: "CLAUDE.md",
        setup: (root: string) => writeFileSync(join(root, "CLAUDE.md"), "# CLAUDE.md\n", "utf-8"),
        passMsg: "CLAUDE.md exists",
        failMsg: "Missing CLAUDE.md",
      },
      {
        check: "MCP Servers",
        setup: (root: string) => {
          mkdirSync(join(root, ".claude"), { recursive: true });
          writeFileSync(join(root, ".claude", "mcp.json"), JSON.stringify({}), "utf-8");
        },
        passMsg: "MCP config found",
        failMsg: "No MCP server configuration found",
      },
      {
        check: "Git Hooks",
        setup: (root: string) => writeFileSync(join(root, "lefthook.yml"), "pre-commit:\n  commands: {}\n", "utf-8"),
        passMsg: "lefthook.yml exists",
        failMsg: "No lefthook.yml found",
      },
      {
        check: "GitNexus Index",
        setup: (root: string) => mkdirSync(join(root, ".gitnexus"), { recursive: true }),
        passMsg: ".gitnexus/ directory exists",
        failMsg: "No .gitnexus/ directory",
      },
    ];

    it.each(checkCases)(
      "$check passes when set up correctly",
      async ({ setup }) => {
        setup(tempDir);
        setupHealthyRepo(tempDir); // ensure all other checks also pass
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);

        vi.resetModules();
        // Mock execa for system deps
        vi.doMock("execa", () => ({
          execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
        }));

        const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
        // @ts-expect-error - internal run
        await doctorCommand.run({ args: { fix: false } });

        // Check that at least some checks passed (all file-based checks should pass)
        const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
        expect(output).toContain("passed");
      },
    );

    it.each(checkCases)(
      "$check fails when not set up",
      async ({ failMsg }) => {
        // Empty temp dir — nothing set up
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);

        vi.resetModules();
        vi.doMock("execa", () => ({
          execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
        }));

        const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
        // @ts-expect-error - internal run
        await doctorCommand.run({ args: { fix: false } });

        const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
        expect(output).toContain(failMsg);
      },
    );
  });

  // -----------------------------------------------------------------------
  // Fix mode — creates missing files
  // -----------------------------------------------------------------------

  describe("fix mode", () => {
    it("creates .dafke/ directory when missing", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      expect(existsSync(join(tempDir, ".dafke"))).toBe(true);
    });

    it("creates manifest.yaml when missing", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      const manifestPath = join(tempDir, ".dafke", "manifest.yaml");
      expect(existsSync(manifestPath)).toBe(true);
      const content = readFileSync(manifestPath, "utf-8");
      expect(content).toContain("corulusCcVersion");
    });

    it("creates .claude/settings.json when missing", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      const settingsPath = join(tempDir, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);
    });

    it("creates CLAUDE.md when missing", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    });

    it("reports fixed count in output", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("fixed");
    });
  });

  // -----------------------------------------------------------------------
  // System dependency checks
  // -----------------------------------------------------------------------

  describe("system dependency checks", () => {
    it("passes when git, node, and claude are available", async () => {
      setupHealthyRepo(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === "git") return Promise.resolve({ stdout: "git version 2.45.0", exitCode: 0 });
          if (cmd === "claude") return Promise.resolve({ stdout: "claude 1.0.0", exitCode: 0 });
          return Promise.resolve({ stdout: "mocked", exitCode: 0 });
        }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Git");
      expect(output).toContain("Node.js");
    });

    it("fails when git is not available", async () => {
      setupHealthyRepo(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === "git") return Promise.reject(new Error("not found"));
          if (cmd === "claude") return Promise.reject(new Error("not found"));
          return Promise.resolve({ stdout: "mocked", exitCode: 0 });
        }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Git: Not found");
    });

    it("fails when claude CLI is not available", async () => {
      setupHealthyRepo(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === "git") return Promise.resolve({ stdout: "git version 2.45.0", exitCode: 0 });
          if (cmd === "claude") return Promise.reject(new Error("not found"));
          return Promise.resolve({ stdout: "mocked", exitCode: 0 });
        }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Not found");
    });
  });

  // -----------------------------------------------------------------------
  // Overall pass/fail counts
  // -----------------------------------------------------------------------

  describe("summary output", () => {
    it("shows pass and fail counts", async () => {
      // Empty dir: several checks will fail
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("passed");
      expect(output).toContain("failed");
    });

    it("shows --fix suggestion when there are fixable failures", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("--fix");
    });
  });

  // -----------------------------------------------------------------------
  // Invalid file content checks
  // -----------------------------------------------------------------------

  describe("invalid file content", () => {
    it("detects invalid YAML in manifest.yaml", async () => {
      mkdirSync(join(tempDir, ".dafke"), { recursive: true });
      writeFileSync(join(tempDir, ".dafke", "manifest.yaml"), "invalid: [yaml: {{bad", "utf-8");
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Invalid YAML");
    });

    it("detects invalid JSON in settings.json", async () => {
      mkdirSync(join(tempDir, ".claude"), { recursive: true });
      writeFileSync(join(tempDir, ".claude", "settings.json"), "not valid json!", "utf-8");
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Invalid JSON");
    });

    it("detects invalid JSON in MCP config", async () => {
      mkdirSync(join(tempDir, ".claude"), { recursive: true });
      writeFileSync(join(tempDir, ".claude", "mcp.json"), "broken{json", "utf-8");
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("invalid JSON");
    });
  });

  // -----------------------------------------------------------------------
  // Manifest creation uses wizard state
  // -----------------------------------------------------------------------

  describe("manifest --fix uses wizard state", () => {
    it("uses techStack from wizard state when available", async () => {
      // No manifest, but wizard state exists
      const corulusDir = join(tempDir, ".dafke");
      mkdirSync(corulusDir, { recursive: true });
      writeFileSync(
        join(corulusDir, "state.json"),
        JSON.stringify({
          wizardVersion: "0.2.0",
          startedAt: new Date().toISOString(),
          completedSteps: ["auth", "detect"],
          answers: { techStack: "java", ciPlatform: "azure-devops" },
        }),
        "utf-8",
      );
      // Set up other files so doctor doesn't fail on unrelated checks
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(claudeDir, "mcp.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(tempDir, "CLAUDE.md"), "# CLAUDE.md\n", "utf-8");
      writeFileSync(join(tempDir, "lefthook.yml"), "pre-commit:\n  commands: {}\n", "utf-8");
      mkdirSync(join(tempDir, ".gitnexus"), { recursive: true });

      vi.spyOn(process, "cwd").mockReturnValue(tempDir);
      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      const manifestPath = join(corulusDir, "manifest.yaml");
      expect(existsSync(manifestPath)).toBe(true);
      const content = readFileSync(manifestPath, "utf-8");
      expect(content).toContain("java");
      expect(content).toContain("azure-devops");
    });

    it("falls back to defaults when no wizard state", async () => {
      // No manifest, no state
      const corulusDir = join(tempDir, ".dafke");
      mkdirSync(corulusDir, { recursive: true });
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(claudeDir, "mcp.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(tempDir, "CLAUDE.md"), "# CLAUDE.md\n", "utf-8");
      writeFileSync(join(tempDir, "lefthook.yml"), "pre-commit:\n  commands: {}\n", "utf-8");
      mkdirSync(join(tempDir, ".gitnexus"), { recursive: true });

      vi.spyOn(process, "cwd").mockReturnValue(tempDir);
      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: true } });

      const manifestPath = join(corulusDir, "manifest.yaml");
      expect(existsSync(manifestPath)).toBe(true);
      const content = readFileSync(manifestPath, "utf-8");
      expect(content).toContain("unknown");
      expect(content).toContain("none");
    });

    it("suggests --resume when wizard state exists but no manifest", async () => {
      const corulusDir = join(tempDir, ".dafke");
      mkdirSync(corulusDir, { recursive: true });
      writeFileSync(
        join(corulusDir, "state.json"),
        JSON.stringify({
          wizardVersion: "0.2.0",
          startedAt: new Date().toISOString(),
          completedSteps: ["auth"],
          answers: {},
        }),
        "utf-8",
      );
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(claudeDir, "mcp.json"), JSON.stringify({}), "utf-8");
      writeFileSync(join(tempDir, "CLAUDE.md"), "# CLAUDE.md\n", "utf-8");
      writeFileSync(join(tempDir, "lefthook.yml"), "pre-commit:\n  commands: {}\n", "utf-8");
      mkdirSync(join(tempDir, ".gitnexus"), { recursive: true });

      vi.spyOn(process, "cwd").mockReturnValue(tempDir);
      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run -- fix=false so it just reports
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("--resume");
    });
  });

  // -----------------------------------------------------------------------
  // Git hooks alternate file
  // -----------------------------------------------------------------------

  describe("alternate git hook config", () => {
    it("detects lefthook.yaml (alternative name)", async () => {
      writeFileSync(join(tempDir, "lefthook.yaml"), "pre-commit:\n  commands: {}\n", "utf-8");
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      vi.doMock("execa", () => ({
        execa: vi.fn().mockResolvedValue({ stdout: "mocked v1.0.0", exitCode: 0 }),
      }));

      const { default: doctorCommand } = await import("../../src/cli/commands/doctor.js");
      // @ts-expect-error - internal run
      await doctorCommand.run({ args: { fix: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("lefthook.yaml exists");
    });
  });
});
