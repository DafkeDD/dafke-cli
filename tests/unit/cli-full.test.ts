import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-cli-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ===========================================================================
// hook command
// ===========================================================================

describe("hook command (full)", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {
      /* noop */
    }) as never);
    vi.spyOn(console, "log").mockImplementation(() => {
      /* noop */
    });
  });

  function getStdoutJSON(): Record<string, unknown> | null {
    for (let i = stdoutSpy.mock.calls.length - 1; i >= 0; i--) {
      try {
        const raw = String(stdoutSpy.mock.calls[i]?.[0]);
        return JSON.parse(raw.trim()) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    return null;
  }

  it("session-start: returns no-manifest status", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return null;
        }
      },
    }));

    const hookModule = await import("../../src/cli/commands/hook.js");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // @ts-expect-error - internal
    await hookModule.default.run({ args: { event: "session-start" } });

    const r = getStdoutJSON();
    expect(r).not.toBeNull();
    expect(r?.["continue"]).toBe(true);
    expect((r?.["data"] as Record<string, unknown>)?.["status"]).toBe(
      "no-manifest",
    );
  });

  it("session-start: returns ok with manifest data", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return {
            corulusCcVersion: "0.1.0",
            techStack: "typescript",
            wave: "wave1",
            readinessScores: {
              cicd: 3,
              coverage: 3,
              security: 3,
              review: 3,
              dora: 3,
              docs: 3,
            },
          };
        }
      },
    }));

    const hookModule = await import("../../src/cli/commands/hook.js");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // @ts-expect-error - internal
    await hookModule.default.run({ args: { event: "session-start" } });

    const r = getStdoutJSON();
    expect(r).not.toBeNull();
    const data = r?.["data"] as Record<string, unknown>;
    expect(data?.["status"]).toBe("ok");
    expect(data?.["wave"]).toBe("wave1");
    expect(data?.["techStack"]).toBe("typescript");
  });

  it("stop: returns sessionEnd timestamp", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return null;
        }
      },
    }));

    const hookModule = await import("../../src/cli/commands/hook.js");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // @ts-expect-error - internal
    await hookModule.default.run({ args: { event: "stop" } });

    const r = getStdoutJSON();
    expect(r?.["continue"]).toBe(true);
    const data = r?.["data"] as Record<string, unknown>;
    expect(typeof data?.["sessionEnd"]).toBe("string");
  });

  it("post-edit: returns editCount data", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return null;
        }
      },
    }));

    const hookModule = await import("../../src/cli/commands/hook.js");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // @ts-expect-error - internal
    await hookModule.default.run({ args: { event: "post-edit" } });

    const r = getStdoutJSON();
    expect((r?.["data"] as Record<string, unknown>)?.["editCount"]).toBe(1);
  });

  it("unknown event: returns continue:true", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return null;
        }
      },
    }));

    const hookModule = await import("../../src/cli/commands/hook.js");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // @ts-expect-error - internal
    await hookModule.default.run({ args: { event: "some-unknown" } });

    const r = getStdoutJSON();
    expect(r?.["continue"]).toBe(true);
  });

  describe("pre-bash: dangerous command blocking", () => {
    const DANGEROUS_COMMANDS = [
      /rm\s+-rf\s+\//,
      /rm\s+-rf\s+\*/,
      /rm\s+-rf\s+~/,
      /DROP\s+TABLE/i,
      /DROP\s+DATABASE/i,
      /TRUNCATE\s+TABLE/i,
      /DELETE\s+FROM\s+\S+\s*;?\s*$/i,
      /mkfs\./,
      /dd\s+if=/,
      /:\(\)\{\s*:\|:\s*&\s*\}\s*;/,
      /chmod\s+-R\s+777\s+\//,
      /git\s+push\s+--force\s+origin\s+main/,
      /git\s+push\s+-f\s+origin\s+main/,
      /git\s+reset\s+--hard\s+HEAD~\d+/,
    ];

    const dangerousCases = [
      "rm -rf /",
      "rm -rf *",
      "rm -rf ~",
      "DROP TABLE users",
      "DROP DATABASE production",
      "TRUNCATE TABLE sessions",
      "DELETE FROM users;",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      "chmod -R 777 /",
      "git push --force origin main",
      "git push -f origin main",
      "git reset --hard HEAD~5",
    ];

    for (const cmd of dangerousCases) {
      it(`blocks: ${cmd}`, () => {
        expect(DANGEROUS_COMMANDS.some((p) => p.test(cmd))).toBe(true);
      });
    }

    it("allows safe commands through", () => {
      const safe = [
        "git status",
        "npm test",
        "ls -la",
        "cat file.txt",
        "npm run build",
        "rm -rf node_modules",
        "git push origin feature",
        "DELETE FROM users WHERE id = 1",
      ];
      for (const cmd of safe) {
        expect(DANGEROUS_COMMANDS.some((p) => p.test(cmd))).toBe(false);
      }
    });
  });

  describe("pre-edit: security patterns", () => {
    const SECURITY_PATTERNS = [
      /\beval\s*\(/,
      /\binnerHTML\s*=/,
      /\bdocument\.write\s*\(/,
      /\bexec\s*\(/,
      /\bFunction\s*\(/,
      /\bdangerouslySetInnerHTML/,
      /\bchild_process/,
      /\bprocess\.env\b/,
      /(?:password|secret|api_key|apikey|token)\s*[:=]\s*["'][^"']+["']/i,
    ];

    const flagged = [
      "eval('code')",
      "element.innerHTML = x",
      "document.write(d)",
      "exec('cmd')",
      "new Function('return 1')",
      "dangerouslySetInnerHTML={{ __html: x }}",
      "require('child_process')",
      "const k = process.env.SECRET",
      'password = "secret123"',
    ];

    for (const content of flagged) {
      it(`detects: ${content.slice(0, 30)}`, () => {
        expect(SECURITY_PATTERNS.some((p) => p.test(content))).toBe(true);
      });
    }

    it("does not flag safe code", () => {
      const safe = [
        "const result = calculate()",
        "element.textContent = 'hello'",
        "console.log('test')",
        "const x = 42",
      ];
      for (const c of safe) {
        expect(SECURITY_PATTERNS.some((p) => p.test(c))).toBe(false);
      }
    });
  });

  describe("post-bash: commit tracking", () => {
    it("tracks git commit commands", () => {
      expect(/\bgit\s+commit\b/.test("git commit -m 'fix'")).toBe(true);
    });

    it("does not track non-commit commands", () => {
      for (const cmd of ["git status", "npm test", "git push"]) {
        expect(/\bgit\s+commit\b/.test(cmd)).toBe(false);
      }
    });
  });

  describe("prompt-submit: ticket detection", () => {
    it("detects Jira ticket IDs", () => {
      const p = /\b([A-Z]{2,10}-\d{1,6})\b/g;
      const ids = [...("Fix PROJ-123 and BUG-456".matchAll(p))].map(
        (m) => m[1],
      );
      expect(ids).toContain("PROJ-123");
      expect(ids).toContain("BUG-456");
    });

    it("detects Azure DevOps ticket IDs", () => {
      const p = /\bAB#(\d+)\b/g;
      const ids = [...("Implement AB#12345 and AB#67890".matchAll(p))].map(
        (m) => m[1],
      );
      expect(ids).toEqual(["12345", "67890"]);
    });

    it("returns empty when no tickets found", () => {
      const p = /\b([A-Z]{2,10}-\d{1,6})\b/g;
      const ids = [...("Just a regular prompt".matchAll(p))];
      expect(ids).toHaveLength(0);
    });
  });
});


// ===========================================================================
// update command
// ===========================================================================

describe("update command (full)", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* noop */
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function mockUpdateDeps(overrides: {
    checkForUpdates?: () => Promise<string | null>;
    detectDrift?: () => Promise<unknown[]>;
    applyUpdate?: () => Promise<void>;
    loadManifest?: () => Promise<unknown>;
    saveManifest?: () => Promise<void>;
    confirm?: () => boolean;
  } = {}) {
    vi.doMock("@clack/prompts", () => ({
      spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
      confirm: vi.fn(overrides.confirm ?? (() => true)),
      isCancel: vi.fn(() => false),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        message: vi.fn(),
      },
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return overrides.loadManifest ? overrides.loadManifest() : null;
        }
        async saveManifest() {
          if (overrides.saveManifest) await overrides.saveManifest();
        }
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: {} };
        }
        async saveGlobalConfig() {
          /* noop */
        }
      },
    }));

    vi.doMock("../../src/core/updater/update-checker.js", () => ({
      UpdateChecker: class {
        async checkForUpdates() {
          return overrides.checkForUpdates
            ? overrides.checkForUpdates()
            : null;
        }
        async detectDrift() {
          return overrides.detectDrift ? overrides.detectDrift() : [];
        }
        async applyUpdate() {
          if (overrides.applyUpdate) await overrides.applyUpdate();
        }
      },
    }));
  }

  it("reports no manifest found", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockUpdateDeps();

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("No manifest found");
  });

  it("reports new version available", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockUpdateDeps({
      checkForUpdates: async () => "1.0.0",
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("1.0.0");
  });

  it("reports no drift detected", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("No drift detected");
  });

  it("shows drift in check-only mode", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
      detectDrift: async () => [
        {
          filePath: ".claude/settings.json",
          type: "missing",
          templateContent: "{}",
        },
        {
          filePath: "lefthook.yml",
          type: "modified",
          diff: "-old\n+new",
          templateContent: "new",
        },
      ],
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: true, force: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("Check-only mode");
  });

  it("applies changes in force mode", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    let applied = false;
    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
      detectDrift: async () => [
        { filePath: "t.txt", type: "missing", templateContent: "x" },
      ],
      applyUpdate: async () => {
        applied = true;
      },
      saveManifest: async () => {
        /* noop */
      },
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: true } });

    expect(applied).toBe(true);
  });

  it("user declines to apply changes", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    let applied = false;
    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
      detectDrift: async () => [
        { filePath: "t.txt", type: "missing", templateContent: "x" },
      ],
      applyUpdate: async () => {
        applied = true;
      },
      confirm: () => false,
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: false } });

    expect(applied).toBe(false);
  });

  it("displays truncated diff for long diffs", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
      detectDrift: async () => [
        {
          filePath: "f.json",
          type: "modified",
          diff: "+a\n-b\n c\n+d\n-e\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11",
          templateContent: "new",
        },
      ],
      confirm: () => false,
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: true, force: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("truncated");
  });

  it("detects legacy skills without --plugins and suggests migration", async () => {
    vi.resetModules();
    // Create legacy skills
    mkdirSync(join(tempDir, ".claude", "skills", "dafke-test"), { recursive: true });
    writeFileSync(join(tempDir, ".claude", "skills", "dafke-test", "SKILL.md"), "# Test");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: false, plugins: false } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("legacy");
    expect(out).toContain("--plugins");
  });

  it("--plugins removes identical legacy skills", async () => {
    vi.resetModules();
    // Create legacy skill identical to plugin template
    const skillContent = "---\nname: test-skill\n---\n# Test";
    mkdirSync(join(tempDir, ".claude", "skills", "dafke-test"), { recursive: true });
    writeFileSync(join(tempDir, ".claude", "skills", "dafke-test", "SKILL.md"), skillContent);

    // Create matching plugin template
    const pkgRoot = join(tempDir, "_pkg");
    mkdirSync(join(pkgRoot, "plugins", "dafke-sdlc", "skills", "dafke-test"), { recursive: true });
    writeFileSync(join(pkgRoot, "plugins", "dafke-sdlc", "skills", "dafke-test", "SKILL.md"), skillContent);
    mkdirSync(join(pkgRoot, "plugins"), { recursive: true });
    writeFileSync(join(pkgRoot, "package.json"), "{}");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue(pkgRoot),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: true, plugins: true } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("removed");
    expect(existsSync(join(tempDir, ".claude", "skills", "dafke-test"))).toBe(false);
  });

  it("--plugins warns on modified legacy skills", async () => {
    vi.resetModules();
    // Create legacy skill that differs from template
    mkdirSync(join(tempDir, ".claude", "skills", "dafke-custom"), { recursive: true });
    writeFileSync(join(tempDir, ".claude", "skills", "dafke-custom", "SKILL.md"), "# Custom modified");

    // Create different plugin template
    const pkgRoot = join(tempDir, "_pkg2");
    mkdirSync(join(pkgRoot, "plugins", "dafke-sdlc", "skills", "dafke-custom"), { recursive: true });
    writeFileSync(join(pkgRoot, "plugins", "dafke-sdlc", "skills", "dafke-custom", "SKILL.md"), "# Original");
    writeFileSync(join(pkgRoot, "package.json"), "{}");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue(pkgRoot),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: true, plugins: true } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("differs");
    expect(out).toContain("manual review");
    // File should still exist (not deleted)
    expect(existsSync(join(tempDir, ".claude", "skills", "dafke-custom"))).toBe(true);
  });

  it("--plugins without claude CLI exits with error", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(false),
    }));

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    try {
      // @ts-expect-error - internal
      await cmd.run({ args: { check: false, force: true, plugins: true } });
    } catch {
      // Expected — process.exit throws
    }

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("--plugins removes legacy agent directories", async () => {
    vi.resetModules();
    // Create legacy agent dir
    mkdirSync(join(tempDir, ".claude", "agents", "dafke-dev-team"), { recursive: true });
    writeFileSync(join(tempDir, ".claude", "agents", "dafke-dev-team", "lead.md"), "# Lead");

    const pkgRoot = join(tempDir, "_pkg3");
    mkdirSync(join(pkgRoot, "plugins"), { recursive: true });
    writeFileSync(join(pkgRoot, "package.json"), "{}");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    mockUpdateDeps({
      loadManifest: async () => ({ corulusCcVersion: "0.1.0" }),
    });
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue(pkgRoot),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    const { default: cmd } = await import("../../src/cli/commands/update.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { check: false, force: true, plugins: true } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("dafke-dev-team");
    expect(existsSync(join(tempDir, ".claude", "agents", "dafke-dev-team"))).toBe(false);
  });
});

// ===========================================================================
// plugin command
// ===========================================================================

describe("plugin command (full)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lists plugins without claude CLI", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(false),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "list" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Claude Code CLI is required");
  });

  it("lists all 5 dafke plugins", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "list" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("dafke-sdlc");
    expect(out).toContain("dafke-quality");
    expect(out).toContain("dafke-observability");
    expect(out).toContain("dafke-docs");
    expect(out).toContain("dafke-config");
  });

  it("shows installed status for installed plugins", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "  ❯ dafke-sdlc@dafke\n  ❯ dafke-quality@dafke", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "list" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("installed");
  });

  it("install rejects unknown plugin name", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "nonexistent" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Unknown plugin");
  });

  it("install requires a name", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Plugin name required");
  });

  it("defaults to list action", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: {} });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Dafke Plugins");
  });

  it("installs a valid plugin successfully", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue("/tmp/fake-root"),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "dafke", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "dafke-sdlc" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("installed");
  });

  it("install handles execa failure gracefully", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue("/tmp/fake-root"),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn()
        .mockResolvedValueOnce({ stdout: "dafke", exitCode: 0 }) // marketplace list
        .mockRejectedValueOnce(new Error("install failed")), // install
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "dafke-sdlc" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Failed to install");
  });

  it("uninstalls a plugin", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "uninstall", name: "dafke-sdlc" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("uninstalled");
  });

  it("uninstall requires name", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "uninstall" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Plugin name required");
  });

  it("uninstall handles failure gracefully", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("uninstall failed")),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "uninstall", name: "dafke-sdlc" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Failed to uninstall");
  });

  it("install accepts short name without dafke- prefix", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue("/tmp/fake-root"),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "dafke", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "sdlc" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("dafke-sdlc");
  });

  it("marketplace setup failure is handled gracefully", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue("/tmp/fake-root"),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("marketplace failed")),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "dafke-sdlc" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Failed to setup Dafke marketplace");
  });

  it("install registers marketplace when not already present", async () => {
    vi.resetModules();
    // Create fake marketplace manifest so the guard passes
    const fakeRoot = join(tmpdir(), `dafke-plugin-test-${randomUUID()}`);
    mkdirSync(join(fakeRoot, ".claude-plugin"), { recursive: true });
    writeFileSync(join(fakeRoot, ".claude-plugin", "marketplace.json"), "{}");
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/utils/package-root.js", () => ({
      findProjectRoot: vi.fn().mockReturnValue(fakeRoot),
    }));
    const calls: string[][] = [];
    vi.doMock("execa", () => ({
      execa: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
        calls.push(args);
        if (args[1] === "marketplace" && args[2] === "list") return Promise.resolve({ stdout: "", exitCode: 0 });
        return Promise.resolve({ stdout: "", exitCode: 0 });
      }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "install", name: "dafke-sdlc" } });
    const addCall = calls.find((c) => c[1] === "marketplace" && c[2] === "add");
    expect(addCall).toBeDefined();
  });

  it("list handles claude plugin list failure gracefully", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("claude not responding")),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "list" } });
    // Should still show all plugins as "not installed" rather than crashing
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("not installed");
    expect(out).toContain("dafke-sdlc");
  });

  it("remove alias works same as uninstall", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "remove", name: "dafke-docs" } });
    const out = (console.log as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("uninstalled");
  });

  it("rejects unknown action", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    const { default: cmd } = await import("../../src/cli/commands/plugin.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { action: "foo" } });
    const out = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(out).toContain("Unknown action");
  });
});

// ===========================================================================
// init command
// ===========================================================================

describe("init command (full)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {
      /* noop */
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      /* noop */
    });
  });

  it("module exports correct meta", async () => {
    vi.resetModules();
    const { default: cmd } = await import("../../src/cli/commands/init.js");
    expect(cmd.meta?.name).toBe("init");
    expect(cmd.args).toHaveProperty("resume");
    expect(cmd.args).toHaveProperty("skip");
    expect(cmd.args).toHaveProperty("non-interactive");
    expect(cmd.args).toHaveProperty("verbose");
  });

  it("invokes WizardRunner with correct options", async () => {
    vi.resetModules();
    let opts: unknown;
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/core/wizard/wizard-runner.js", () => ({
      WizardRunner: class {
        async run(o: unknown) {
          opts = o;
        }
      },
    }));

    const { default: cmd } = await import("../../src/cli/commands/init.js");
    // @ts-expect-error - internal
    await cmd.run({
      args: {
        resume: true,
        skip: "auth,plugins",
        "non-interactive": true,
        verbose: true,
      },
    });

    expect(opts).toEqual({
      resume: true,
      skip: "auth,plugins",
      nonInteractive: true,
      verbose: true,
    });
  });

  it("defaults to non-resume interactive mode", async () => {
    vi.resetModules();
    let opts: unknown;
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/core/wizard/wizard-runner.js", () => ({
      WizardRunner: class {
        async run(o: unknown) {
          opts = o;
        }
      },
    }));

    const { default: cmd } = await import("../../src/cli/commands/init.js");
    // @ts-expect-error - internal
    await cmd.run({
      args: {
        resume: false,
        skip: undefined,
        "non-interactive": false,
        verbose: false,
      },
    });

    expect(opts).toEqual({
      resume: false,
      skip: undefined,
      nonInteractive: false,
      verbose: false,
    });
  });
});

// ===========================================================================
// migrate command — REMOVED (command deleted in v0.4.0)
// ===========================================================================

// ===========================================================================
// audit command
// ===========================================================================

describe("audit command (full)", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* noop */
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      /* noop */
    });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      /* noop */
    }) as never);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function mockAuditDeps(manifest: unknown = null) {
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return manifest;
        }
        async saveManifest() {
          /* noop */
        }
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: {} };
        }
        async loadRules() {
          return null;
        }
      },
    }));

    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() {
          return {
            scores: {
              cicd: 3,
              coverage: 3,
              security: 3,
              review: 3,
              dora: 3,
              docs: 3,
            },
            totalScore: 18,
            wave: "wave2",
            dimensionResults: [
              {
                dimension: "cicd",
                score: 3,
                details: "Good CI",
                evidence: ["workflow"],
                suggestions: ["add SAST"],
              },
              {
                dimension: "coverage",
                score: 3,
                details: "OK",
                evidence: [],
                suggestions: [],
              },
              {
                dimension: "security",
                score: 3,
                details: "OK",
                evidence: [],
                suggestions: [],
              },
              {
                dimension: "review",
                score: 3,
                details: "OK",
                evidence: [],
                suggestions: [],
              },
              {
                dimension: "dora",
                score: 3,
                details: "OK",
                evidence: [],
                suggestions: [],
              },
              {
                dimension: "docs",
                score: 3,
                details: "OK",
                evidence: [],
                suggestions: [],
              },
            ],
            improvementPlan: [
              {
                dimension: "cicd",
                currentScore: 3,
                targetScore: 4,
                action: "Add SAST",
                estimatedTime: "1w",
                priority: "medium",
              },
            ],
          };
        }
      },
    }));

    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({
      CoverageAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({
      SecurityAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({
      ReviewAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({
      DoraAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({
      DocsAnalyzer: vi.fn(),
    }));
  }

  it("runs standalone when no manifest", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps(null);

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "text", dimension: undefined } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("Readiness Assessment");
  });

  it("outputs text format", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps({ corulusCcVersion: "0.1.0" });

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "text", dimension: undefined } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("Readiness Assessment");
  });

  it("outputs JSON format", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps({ corulusCcVersion: "0.1.0" });

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "json", dimension: undefined } });

    const jsonCalls = consoleSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonCalls[0]?.[0] as string);
    expect(parsed).toHaveProperty("scores");
    expect(parsed).toHaveProperty("wave");
    expect(parsed).toHaveProperty("totalScore");
  });

  it("outputs table format", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps({ corulusCcVersion: "0.1.0" });

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "table", dimension: undefined } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("Dimension");
    expect(out).toContain("Score");
  });

  it("shows dimension detail", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps({ corulusCcVersion: "0.1.0" });

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "text", dimension: "cicd" } });

    const out = consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
    expect(out).toContain("Detailed Report");
  });

  it("handles unknown dimension", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    mockAuditDeps({ corulusCcVersion: "0.1.0" });

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // process.exit is mocked, so execution continues past exit(1) and may throw
    try {
      // @ts-expect-error - internal
      await cmd.run({ args: { format: "text", dimension: "nonexistent" } });
    } catch {
      // Expected: dimResult is undefined after mocked process.exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("saves scores to manifest", async () => {
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    let saved = false;
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return { corulusCcVersion: "0.1.0" };
        }
        async saveManifest() {
          saved = true;
        }
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: {} };
        }
        async loadRules() {
          return null;
        }
      },
    }));
    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() {
          return {
            scores: {
              cicd: 4,
              coverage: 4,
              security: 4,
              review: 4,
              dora: 4,
              docs: 4,
            },
            totalScore: 24,
            wave: "wave1",
            dimensionResults: [],
            improvementPlan: [],
          };
        }
      },
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({
      CoverageAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({
      SecurityAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({
      ReviewAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({
      DoraAnalyzer: vi.fn(),
    }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({
      DocsAnalyzer: vi.fn(),
    }));

    const { default: cmd } = await import("../../src/cli/commands/audit.js");
    // @ts-expect-error - internal
    await cmd.run({ args: { format: "json", dimension: undefined } });

    expect(saved).toBe(true);
  });
});
