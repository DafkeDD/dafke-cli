import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { WizardStepContext } from "../../src/core/wizard/wizard-steps.js";
import { WIZARD_STEPS, STEP_LABELS } from "../../src/core/wizard/wizard-steps.js";

// ---------------------------------------------------------------------------
// Mock @clack/prompts globally
// ---------------------------------------------------------------------------

const mockPrompts = {
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  confirm: vi.fn(() => true),
  select: vi.fn(),
  multiselect: vi.fn(() => []),
  text: vi.fn(() => "test-input"),
  password: vi.fn(() => "secret"),
  isCancel: vi.fn(() => false),
};

vi.mock("@clack/prompts", () => mockPrompts);

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function makeCtx(repoRoot: string, overrides: Partial<WizardStepContext> = {}): WizardStepContext {
  return {
    repoRoot,
    verbose: false,
    nonInteractive: true,
    answers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// wizard-steps.ts constants
// ---------------------------------------------------------------------------

describe("wizard-steps constants", () => {
  it("defines exactly 13 steps", () => {
    expect(WIZARD_STEPS).toHaveLength(13);
  });

  it("has labels for every step", () => {
    for (const step of WIZARD_STEPS) {
      expect(STEP_LABELS[step]).toBeDefined();
      expect(typeof STEP_LABELS[step]).toBe("string");
    }
  });

  it("steps are in expected order", () => {
    expect(WIZARD_STEPS[0]).toBe("auth");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1]).toBe("verify");
  });
});

// ---------------------------------------------------------------------------
// step-auth
// ---------------------------------------------------------------------------

describe("step-auth", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-auth-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("skips prompts in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// step-detect
// ---------------------------------------------------------------------------

describe("step-detect", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-detect-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
    // Mock claude-cli to avoid real CLI calls and 5s timeouts in tests
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(false),
    }));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("auto-selects best match in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({
              detected: true,
              confidence: 0.95,
              indicators: ["package.json", "tsconfig.json"],
            }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("typescript");
  });
});

// ---------------------------------------------------------------------------
// step-assess
// ---------------------------------------------------------------------------

describe("step-assess", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-assess-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("runs assessment and returns scores in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() {
          return {
            scores: { cicd: 3, coverage: 2, security: 3, review: 2, dora: 1, docs: 1 },
            totalScore: 12,
            wave: "wave2",
            dimensionResults: [],
            improvementPlan: [
              { dimension: "dora", currentScore: 1, targetScore: 2, action: "Improve deploy frequency", estimatedTime: "2-4 weeks", priority: "high" },
            ],
          };
        }
      },
    }));

    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({ CicdAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({ CoverageAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({ SecurityAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({ ReviewAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({ DoraAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({ DocsAnalyzer: vi.fn() }));

    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["wave"]).toBe("wave2");
    expect(result.data?.["totalScore"]).toBe(12);
    expect(result.data?.["scores"]).toEqual({ cicd: 3, coverage: 2, security: 3, review: 2, dora: 1, docs: 1 });
  });
});

// ---------------------------------------------------------------------------
// step-claude-md
// ---------------------------------------------------------------------------

describe("step-claude-md", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-claudemd-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("generates CLAUDE.md in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getClaudeMdSection: () => "- Use vitest for testing\n- Use ESLint for linting",
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["claudeMdGenerated"]).toBe(true);

    const claudeMdPath = join(testRoot, "CLAUDE.md");
    expect(existsSync(claudeMdPath)).toBe(true);

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("Security Rules");
    expect(content).toContain("NEVER commit secrets");
    expect(content).toContain("typescript");
  });
});

// ---------------------------------------------------------------------------
// step-verify
// ---------------------------------------------------------------------------

describe("step-verify", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-verify-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("builds summary from answers and succeeds", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: async () => { throw new Error("not implemented"); },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        claudeMdGenerated: true,
        hooksInstalled: true,
        pluginsInstalled: 7,
        ciGenerated: true,
        boardConnected: false,
        skillsCopied: 5,
        agentsCopied: 3,
        wave: "wave1",
        totalScore: 22,
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["verified"]).toBe(true);
    expect(result.data?.["summary"]).toBeDefined();

    const summary = result.data?.["summary"] as Record<string, unknown>;
    expect(summary["claudeMd"]).toBe(true);
    expect(summary["hooks"]).toBe(true);
    expect(summary["plugins"]).toBe(7);
  });

  it("shows next steps for missing items", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: async () => { throw new Error("not implemented"); },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        claudeMdGenerated: false,
        hooksInstalled: false,
        pluginsInstalled: 0,
        wave: "wave3",
        totalScore: 8,
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    // p.log.message should have been called with next steps
    expect(mockPrompts.log.message).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// step-hooks
// ---------------------------------------------------------------------------

describe("step-hooks", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-step-hooks-${randomUUID()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("writes settings.json and lefthook.yml in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["hooksInstalled"]).toBe(true);

    const settingsPath = join(testRoot, ".claude", "settings.json");
    const lefthookPath = join(testRoot, "lefthook.yml");

    expect(existsSync(settingsPath)).toBe(true);
    expect(existsSync(lefthookPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();

    const lefthook = readFileSync(lefthookPath, "utf-8");
    expect(lefthook).toContain("pre-commit");
    expect(lefthook).toContain("pre-push");
  });
});
