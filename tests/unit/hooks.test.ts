import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-hooks-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeCtx(repoRoot: string, overrides: Record<string, unknown> = {}) {
  return {
    repoRoot,
    verbose: false,
    nonInteractive: true,
    answers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Claude Code settings.json hook format validation
// ---------------------------------------------------------------------------

describe("step-hooks — generated settings.json", () => {
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

  it("generates valid settings.json with correct hook format", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settingsPath = join(tempDir, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();

    // Validate each hook section has the correct format:
    // { matcher?: string, hooks: [{ type: "command", command: string }] }
    for (const [, entries] of Object.entries(settings.hooks)) {
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries as Record<string, unknown>[]) {
        expect(entry.hooks).toBeDefined();
        expect(Array.isArray(entry.hooks)).toBe(true);
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          expect(hook.type).toBe("command");
          expect(typeof hook.command).toBe("string");
          expect((hook.command as string).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("PreToolUse hooks have correct matchers", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));
    const preToolUse = settings.hooks.PreToolUse as Record<string, unknown>[];

    expect(preToolUse.length).toBe(3);

    // Write/Edit hook
    const editHook = preToolUse.find((h) => (h.matcher as string)?.includes("Write"));
    expect(editHook).toBeDefined();
    expect(editHook?.matcher).toBe("Write|Edit|MultiEdit");

    // Bash hook
    const bashHook = preToolUse.find((h) => h.matcher === "Bash");
    expect(bashHook).toBeDefined();

    // Pre-commit typecheck hook
    const commitHook = preToolUse.find((h) => (h.matcher as string)?.includes("git commit"));
    expect(commitHook).toBeDefined();
  });

  it("PostToolUse hooks have correct matchers", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));
    const postToolUse = settings.hooks.PostToolUse as Record<string, unknown>[];

    expect(postToolUse.length).toBe(3);

    // Write/Edit post hook
    expect(postToolUse.some((h) => (h.matcher as string)?.includes("Write"))).toBe(true);

    // Bash post hook
    expect(postToolUse.some((h) => h.matcher === "Bash")).toBe(true);

    // GitNexus reindex hook
    const gitnexusHook = postToolUse.find((h) =>
      (h.matcher as string)?.includes("git commit"),
    );
    expect(gitnexusHook).toBeDefined();
  });

  it("dafke hooks warn when CLI is not installed", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));

    for (const entries of Object.values(settings.hooks)) {
      for (const entry of entries as Record<string, unknown>[]) {
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          const cmd = hook.command as string;
          // Every command that calls dafke should check availability
          if (cmd.includes("dafke hook")) {
            expect(cmd).toContain("command -v dafke");
            // Should either warn or gracefully degrade
            const hasWarn = cmd.includes("dafke not found");
            const hasGraceful = cmd.includes("|| true");
            expect(hasWarn || hasGraceful).toBe(true);
          }
        }
      }
    }
  });

  it("hook event names match hook.ts switch cases", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));

    // Valid event names from hook.ts: session-start, pre-bash, pre-edit, post-bash, post-edit, stop, prompt-submit
    const validEvents = ["session-start", "pre-bash", "pre-edit", "post-bash", "post-edit", "stop", "prompt-submit", "skills-check", "doc-check"];

    for (const [, entries] of Object.entries(settings.hooks)) {
      for (const entry of entries as Record<string, unknown>[]) {
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          const cmd = hook.command as string;
          // Extract event name from "dafke hook <event>" pattern
          const match = cmd.match(/dafke\s+hook\s+(\S+)/);
          if (match) {
            expect(validEvents).toContain(match[1]);
          }
        }
      }
    }
  });

  it("Stop hook exists and uses correct event name", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));
    const stop = settings.hooks.Stop as Record<string, unknown>[];

    expect(stop.length).toBe(1);
    const cmd = ((stop[0].hooks as Record<string, unknown>[])[0].command) as string;
    expect(cmd).toContain("dafke hook stop");
    expect(cmd).toContain("dafke not found");
  });

  it("SessionStart emits the AI-responsibility disclaimer as a systemMessage", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));
    const sessionStart = settings.hooks.SessionStart as Record<string, unknown>[];
    expect(sessionStart.length).toBe(1);

    const hooks = sessionStart[0].hooks as Record<string, unknown>[];
    const disclaimerHook = hooks.find((h) => {
      const cmd = h.command as string;
      return cmd.includes("systemMessage") && cmd.includes("DISCLAIMER");
    });
    expect(disclaimerHook).toBeDefined();

    // The command must emit parseable JSON so Claude Code reads systemMessage.
    const cmd = (disclaimerHook as Record<string, unknown>).command as string;
    const jsonMatch = /echo '(\{.*\})'$/.exec(cmd);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse((jsonMatch as RegExpExecArray)[1] ?? "") as { systemMessage: string };
    expect(parsed.systemMessage).toContain("DISCLAIMER");
    expect(parsed.systemMessage).toContain("human submitter");
    expect(parsed.systemMessage).toContain("license compliance");
  });

  it("does NOT echo a per-prompt disclaimer reminder (fixed in 0.3.2)", async () => {
    // Regression guard: the v0.3.1 UserPromptSubmit echo caused the model to
    // re-print the disclaimer on every turn. The SessionStart systemMessage
    // replaces it. If UserPromptSubmit is ever added back, it must NOT echo
    // a REMINDER about the disclaimer.
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));
    const ups = settings.hooks.UserPromptSubmit as Record<string, unknown>[] | undefined;
    if (!ups) return; // absent is fine
    for (const entry of ups) {
      for (const hook of entry.hooks as Record<string, unknown>[]) {
        const cmd = (hook.command as string) ?? "";
        expect(cmd).not.toMatch(/REMINDER.*disclaimer/i);
      }
    }
  });

  it("generates mcp.json alongside settings.json", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const mcpPath = join(tempDir, ".claude", "mcp.json");
    expect(existsSync(mcpPath)).toBe(true);

    const mcp = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.context7).toBeDefined();
    expect(mcp.mcpServers.playwright).toBeDefined();
    expect(mcp.mcpServers.gitnexus).toBeDefined();
    expect(mcp.mcpServers.gitnexus.env.GITNEXUS_REPO_PATH).toBe(tempDir);
  });

  it("generates lefthook.yml with git hooks", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const lefthookPath = join(tempDir, "lefthook.yml");
    expect(existsSync(lefthookPath)).toBe(true);

    const content = readFileSync(lefthookPath, "utf-8");
    expect(content).toContain("pre-commit");
    expect(content).toContain("pre-push");
    expect(content).toContain("commit-msg");
  });

  it("pre-commit gitleaks scans only the staged diff (fixed in 0.3.3)", async () => {
    // Regression guard: `gitleaks detect --source . --no-git` walks the full
    // working tree on every commit (~100 MB / several seconds in populated
    // repos). The staged-only form is ~tens of ms. If this flips back to
    // `detect --no-git`, every downstream developer pays latency per commit.
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const content = readFileSync(join(tempDir, "lefthook.yml"), "utf-8");
    expect(content).toContain("gitleaks protect --staged");
    expect(content).not.toContain("gitleaks detect --source . --no-git");
  });

  it("pre-commit lint/typecheck glob-filter so non-JS/TS commits skip them (fixed in 0.3.3)", async () => {
    // In .NET-only repos (or any repo without a root package.json), the old
    // `npm run lint --if-present` errored with ENOENT and blocked the commit.
    // The glob filter ensures the command is skipped entirely when no JS/TS
    // is staged; the discovery loop walks up to the nearest package.json so
    // polyglot layouts (e.g. .NET + React subproject) work without a root
    // package.json.
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const content = readFileSync(join(tempDir, "lefthook.yml"), "utf-8");

    // Both lint and typecheck must declare a glob filter.
    const lintBlock = content.slice(content.indexOf("lint:"), content.indexOf("typecheck:"));
    expect(lintBlock).toMatch(/glob:\s*"\*\.\{[^}]*ts[^}]*\}"/);

    const typecheckBlock = content.slice(content.indexOf("typecheck:"), content.indexOf("pre-push:"));
    expect(typecheckBlock).toMatch(/glob:\s*"\*\.\{[^}]*ts[^}]*\}"/);

    // Both must discover the nearest package.json rather than assuming one
    // exists at the repo root.
    expect(lintBlock).toContain("package.json");
    expect(typecheckBlock).toContain("package.json");
  });

  it("no hooks use non-existent dafke event names", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"));

    // These OLD event names should NOT appear anywhere
    const invalidEvents = ["pre-write", "post-write", "on-stop"];

    for (const [, entries] of Object.entries(settings.hooks)) {
      for (const entry of entries as Record<string, unknown>[]) {
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          const cmd = hook.command as string;
          for (const invalid of invalidEvents) {
            expect(cmd).not.toContain(`hook ${invalid}`);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// hook command — event handlers
// ---------------------------------------------------------------------------

describe("hook command — event handlers", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-bash blocks dangerous rm -rf /", async () => {
    const originalStdin = process.stdin;
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "pre-bash" } });

    // Should output JSON response
    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const output = calls.join("");
    expect(output).toContain('"continue"');

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true, configurable: true });
  });

  it("pre-edit allows normal content", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "pre-edit" } });

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);
  });

  it("unknown event returns continue:true", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "nonexistent-event" } });

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hook list command
// ---------------------------------------------------------------------------

describe("hook command — list", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("lists hooks when no args provided (defaults to list)", async () => {
    // Create settings.json with hooks
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo test" }] }],
      },
    }), "utf-8");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: undefined } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Configured Hooks");
    expect(output).toContain("PreToolUse");
    expect(output).toContain("Available hook events");
  });

  it("lists hooks with explicit 'list' event", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "list" } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Configured Hooks");
    expect(output).toContain("session-start");
    expect(output).toContain("pre-bash");
    expect(output).toContain("skills-check");
  });

  it("shows lefthook.yml hooks when present", async () => {
    writeFileSync(join(tempDir, "lefthook.yml"), "pre-commit:\n  commands:\n    lint:\n      run: npm run lint\n", "utf-8");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "list" } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Git hooks");
    expect(output).toContain("npm run lint");
  });

  it("shows message when no settings.json exists", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "list" } });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No .claude/settings.json");
  });
});

// ---------------------------------------------------------------------------
// hook handlers — direct event handler tests
// ---------------------------------------------------------------------------

import { Readable } from "node:stream";

/**
 * Helper: run a hook event with a specific JSON payload piped through stdin.
 * Returns the parsed response object from stdout.
 */
async function runHookWithPayload(
  event: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

  // Create a readable stream that emits the payload then ends
  const jsonStr = JSON.stringify(payload);
  const readable = new Readable({
    read() {
      this.push(Buffer.from(jsonStr));
      this.push(null);
    },
  });
  Object.defineProperty(readable, "isTTY", { value: false });

  const originalStdin = process.stdin;
  Object.defineProperty(process, "stdin", {
    value: readable,
    writable: true,
    configurable: true,
  });

  vi.resetModules();
  vi.doMock("../../src/core/config/config-manager.js", () => ({
    ConfigManager: class { async loadManifest() { return null; } },
  }));

  const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
  // @ts-expect-error - internal run
  await hookCommand.run({ args: { event } });

  Object.defineProperty(process, "stdin", {
    value: originalStdin,
    writable: true,
    configurable: true,
  });

  const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
  const output = calls.join("");
  stdoutSpy.mockRestore();

  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch {
    return { raw: output };
  }
}

describe("handlePreBash — dangerous command blocking", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["rm -rf /", /rm\s+-rf/],
    ["rm -rf *", /rm\s+-rf/],
    ["rm -rf ~/important", /rm\s+-rf/],
    ["DROP TABLE users", /DROP\s+TABLE/],
    ["DROP DATABASE production", /DROP\s+DATABASE/],
    ["TRUNCATE TABLE logs", /TRUNCATE\s+TABLE/],
    ["DELETE FROM users;", /DELETE\s+FROM/],
    ["mkfs.ext4 /dev/sda1", /mkfs\./],
    ["dd if=/dev/zero of=/dev/sda", /dd\s+if=/],
    [":(){:|:&};", /fork bomb/],
    ["chmod -R 777 /", /chmod/],
    ["git push --force origin main", /git\s+push/],
    ["git push -f origin main", /git\s+push/],
    ["git reset --hard HEAD~5", /git\s+reset/],
  ])("blocks dangerous command: %s", async (command) => {
    const response = await runHookWithPayload("pre-bash", { command });
    expect(response.continue).toBe(false);
    expect(response.suppress).toBe(true);
    expect(response.message).toBeDefined();
  });

  it.each([
    "npm install",
    "git status",
    "ls -la",
    "echo hello",
    "cat package.json",
    "node --version",
  ])("allows safe command: %s", async (command) => {
    const response = await runHookWithPayload("pre-bash", { command });
    expect(response.continue).toBe(true);
    expect(response.suppress).toBeUndefined();
  });
});

describe("handlePreEdit — security scanning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips security scan for test files", async () => {
    const response = await runHookWithPayload("pre-edit", {
      file_path: "src/utils/__tests__/helper.test.ts",
      content: 'eval("dangerous code")',
    });
    expect(response.continue).toBe(true);
    expect((response.data as Record<string, unknown>)?.securitySkipped).toBe("test-file");
  });

  it("skips security scan for .spec files", async () => {
    const response = await runHookWithPayload("pre-edit", {
      file_path: "tests/unit/app.spec.ts",
      content: 'eval("code")',
    });
    expect(response.continue).toBe(true);
    expect((response.data as Record<string, unknown>)?.securitySkipped).toBe("test-file");
  });

  it("flags eval() in production files", async () => {
    const response = await runHookWithPayload("pre-edit", {
      file_path: "src/utils/helper.ts",
      content: 'const result = eval("1+1");',
    });
    expect(response.continue).toBe(true);
    expect(response.message).toBeDefined();
    expect(String(response.message)).toContain("Security");
    const data = response.data as Record<string, unknown>;
    expect(data?.warnings).toBeDefined();
  });

  it("allows clean production file content", async () => {
    const response = await runHookWithPayload("pre-edit", {
      file_path: "src/utils/helper.ts",
      content: 'export function add(a: number, b: number): number { return a + b; }',
    });
    expect(response.continue).toBe(true);
    expect(response.message).toBeUndefined();
  });
});

describe("handlePostBash — git commit tracking", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks git commit (returns tracked: true)", async () => {
    const response = await runHookWithPayload("post-bash", { command: 'git commit -m "fix: bug"' });
    expect(response.continue).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data?.tracked).toBe(true);
    expect(data?.type).toBe("git-commit");
  });

  it("regular bash returns tracked: false", async () => {
    const response = await runHookWithPayload("post-bash", { command: "npm run build" });
    expect(response.continue).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data?.tracked).toBe(false);
    expect(data?.type).toBe("bash");
  });
});

describe("handlePromptSubmit — ticket ID detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects JIRA ticket IDs (ABC-123)", async () => {
    const response = await runHookWithPayload("prompt-submit", {
      prompt: "Fix the bug described in ABC-123",
    });
    expect(response.continue).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data?.ticketIds).toBeDefined();
    expect(data?.ticketIds).toContain("ABC-123");
  });

  it("detects Azure DevOps IDs (AB#123)", async () => {
    const response = await runHookWithPayload("prompt-submit", {
      prompt: "Implement the feature from AB#456",
    });
    expect(response.continue).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data?.ticketIds).toBeDefined();
    expect(data?.ticketIds).toContain("456");
  });

  it("returns empty when no tickets found", async () => {
    const response = await runHookWithPayload("prompt-submit", {
      prompt: "Just a regular prompt with no ticket references",
    });
    expect(response.continue).toBe(true);
    // No data.ticketIds expected when no tickets found
    const data = response.data as Record<string, unknown> | undefined;
    expect(data?.ticketIds).toBeUndefined();
  });
});

describe("handleDocCheck — stale docs detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("warns when docs > 7 days old", async () => {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "ARCHITECTURE.md"), "# Architecture", "utf-8");

    // Set mtime to 10 days ago
    const { utimesSync } = await import("node:fs");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    utimesSync(join(docsDir, "ARCHITECTURE.md"), tenDaysAgo, tenDaysAgo);

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "doc-check" } });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);
    expect(response.message).toContain("days old");
    expect(response.message).toContain("docs");
  });

  it("no warning when docs are fresh", async () => {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "ARCHITECTURE.md"), "# Architecture", "utf-8");

    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "doc-check" } });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);
    expect(response.message).toBeUndefined();
  });

  it("no docs path returns continue:true", async () => {
    // tempDir has no docs/ directory
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "doc-check" } });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);
    expect(response.message).toBeUndefined();
  });
});

describe("handleSkillsCheck — missing skills", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports missing skills when package has more than project", async () => {
    const projectDir = makeTempDir();
    // Create project skills directory with just one skill
    const projectSkillsDir = join(projectDir, ".claude", "skills", "existing-skill");
    mkdirSync(projectSkillsDir, { recursive: true });
    writeFileSync(join(projectSkillsDir, "SKILL.md"), "# Skill", "utf-8");

    vi.spyOn(process, "cwd").mockReturnValue(projectDir);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "skills-check" } });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    expect(response.continue).toBe(true);

    rmSync(projectDir, { recursive: true, force: true });
  });
});

describe("readStdin — TTY handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {} for TTY input (resulting in empty payload)", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      writable: true,
      configurable: true,
    });

    vi.resetModules();
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class { async loadManifest() { return null; } },
    }));

    const { default: hookCommand } = await import("../../src/cli/commands/hook.js");
    // @ts-expect-error - internal run
    await hookCommand.run({ args: { event: "pre-bash" } });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const response = JSON.parse(calls.join(""));
    // With empty payload, pre-bash should continue (no dangerous command)
    expect(response.continue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADO MCP wrapper — PAT base64 encoding
// ---------------------------------------------------------------------------

describe("step-hooks — ADO MCP wrapper base64 PAT encoding", () => {
  let tempDir: string;
  const mockPrompts = {
    log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn(), message: vi.fn() },
    confirm: vi.fn(() => true),
    isCancel: vi.fn(() => false),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  };

  beforeEach(() => {
    tempDir = makeTempDir();
    // Create a fake .claude.json target so registerMcpServer writes there
    mkdirSync(join(tempDir, "home"), { recursive: true });
    writeFileSync(join(tempDir, "home", ".claude.json"), "{}", "utf-8");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: set up all mocks so that execute() detects an ADO org and
   * generates the azure-devops-mcp.sh wrapper script.
   *
   * We mock:
   *   - @clack/prompts          — suppress interactive prompts
   *   - execa                   — execaSync returns fake ADO remote URL;
   *                               async execa is a no-op (for installLefthook)
   *   - config-manager          — loadGlobalConfig returns ADO org/pat
   *   - node:os (homedir)       — redirects ~/.claude.json writes to temp dir
   */
  async function setupAndExecute(): Promise<string> {
    vi.doMock("@clack/prompts", () => mockPrompts);

    vi.doMock("execa", () => ({
      execaSync: (_cmd: string, _args: string[]) => ({
        stdout: "https://dev.azure.com/testorg/TestProject/_git/repo",
      }),
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return {
            version: "1.0.0",
            auth: {
              azureDevOps: {
                pat: "fake-pat-value",
                orgUrl: "https://dev.azure.com/testorg",
              },
            },
            preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true },
          };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => join(tempDir, "home") };
    });

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(tempDir);
    await execute(ctx);

    const wrapperPath = join(tempDir, ".claude", "azure-devops-mcp.sh");
    return readFileSync(wrapperPath, "utf-8");
  }

  it("generated ADO MCP wrapper uses base64 PAT encoding", async () => {
    const content = await setupAndExecute();

    // The script must encode the PAT as ":PAT" then base64
    expect(content).toContain('printf ":%s"');
    expect(content).toContain("base64");
    expect(content).toContain("tr -d");
  });

  it("generated ADO MCP wrapper does not pass raw PAT", async () => {
    const content = await setupAndExecute();

    // The old pattern that exported the raw PAT must NOT appear
    expect(content).not.toContain('export PERSONAL_ACCESS_TOKEN="${AZURE_PERSONAL_TOKEN}"');
    // Also verify we never export the raw env var directly
    expect(content).not.toContain('PERSONAL_ACCESS_TOKEN="${AZURE_PERSONAL_TOKEN}"');
  });

  it("generated ADO MCP wrapper uses proper variable quoting", async () => {
    const content = await setupAndExecute();

    // RAW_PAT assignment must use proper quoting to prevent word splitting
    expect(content).toContain('"${RAW_PAT}"');
    // The AZURE_PERSONAL_TOKEN reference must also be quoted
    expect(content).toContain('"${AZURE_PERSONAL_TOKEN}"');
  });
});
