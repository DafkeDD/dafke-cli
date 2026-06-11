import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Mock @clack/prompts before importing WizardRunner
vi.mock("@clack/prompts", () => ({
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
  select: vi.fn(() => "skip"),
  isCancel: vi.fn(() => false),
}));

// Mock the banner
vi.mock("../../src/utils/banner.js", () => ({
  printBanner: vi.fn(),
}));

// Track which steps were executed and their results
const executedSteps: string[] = [];
let stepResults: Record<string, { success: boolean; data?: Record<string, unknown>; message?: string }> = {};

// Per-step call counters for controlling retry behavior
const stepCallCounts: Record<string, number> = {};
// Per-step override functions: return result based on call count
let stepOverrides: Record<string, ((callCount: number) => { success: boolean; data?: Record<string, unknown>; message?: string }) | undefined> = {};
// Per-step throw behavior: if set, the step will throw on the specified call counts
let stepThrowOn: Record<string, Set<number> | undefined> = {};

function getStepResult(stepId: string): { success: boolean; data?: Record<string, unknown>; message?: string } {
  stepCallCounts[stepId] = (stepCallCounts[stepId] ?? 0) + 1;
  const callCount = stepCallCounts[stepId];

  if (stepThrowOn[stepId]?.has(callCount)) {
    throw new Error(`Step ${stepId} threw on call ${callCount}`);
  }

  if (stepOverrides[stepId]) {
    const override = stepOverrides[stepId];
    if (override) return override(callCount);
  }

  return stepResults[stepId] ?? { success: true, data: {} };
}

// Create mock step modules
function makeMockStep(stepId: string) {
  return vi.fn(async () => ({
    execute: vi.fn(async () => {
      executedSteps.push(stepId);
      return stepResults[stepId] ?? { success: true, data: {} };
    }),
  }));
}

const mockStepLoaders: Record<string, ReturnType<typeof vi.fn>> = {};
for (const id of ["auth", "detect", "assess", "external_tools", "claude_md", "hooks", "plugins", "ci", "coverage", "arch", "connect", "verify"]) {
  mockStepLoaders[id] = makeMockStep(id);
}

// Mock all step imports — using getStepResult for dynamic per-call behavior
vi.mock("../../src/core/wizard/steps/step-auth.js", () => ({ execute: async () => { executedSteps.push("auth"); return getStepResult("auth"); } }));
vi.mock("../../src/core/wizard/steps/step-detect.js", () => ({ execute: async () => { executedSteps.push("detect"); return getStepResult("detect"); } }));
vi.mock("../../src/core/wizard/steps/step-assess.js", () => ({ execute: async () => { executedSteps.push("assess"); return getStepResult("assess"); } }));
vi.mock("../../src/core/wizard/steps/step-external-tools.js", () => ({ execute: async () => { executedSteps.push("external_tools"); return getStepResult("external_tools"); } }));
vi.mock("../../src/core/wizard/steps/step-claude-md.js", () => ({ execute: async () => { executedSteps.push("claude_md"); return getStepResult("claude_md"); } }));
vi.mock("../../src/core/wizard/steps/step-rules.js", () => ({ execute: async () => { executedSteps.push("rules"); return getStepResult("rules"); } }));
vi.mock("../../src/core/wizard/steps/step-hooks.js", () => ({ execute: async () => { executedSteps.push("hooks"); return getStepResult("hooks"); } }));
vi.mock("../../src/core/wizard/steps/step-plugins.js", () => ({ execute: async () => { executedSteps.push("plugins"); return getStepResult("plugins"); } }));
vi.mock("../../src/core/wizard/steps/step-ci.js", () => ({ execute: async () => { executedSteps.push("ci"); return getStepResult("ci"); } }));
vi.mock("../../src/core/wizard/steps/step-coverage.js", () => ({ execute: async () => { executedSteps.push("coverage"); return getStepResult("coverage"); } }));
vi.mock("../../src/core/wizard/steps/step-arch.js", () => ({ execute: async () => { executedSteps.push("arch"); return getStepResult("arch"); } }));
vi.mock("../../src/core/wizard/steps/step-connect.js", () => ({ execute: async () => { executedSteps.push("connect"); return getStepResult("connect"); } }));
vi.mock("../../src/core/wizard/steps/step-verify.js", () => ({ execute: async () => { executedSteps.push("verify"); return getStepResult("verify"); } }));

import * as p from "@clack/prompts";
import { WizardRunner } from "../../src/core/wizard/wizard-runner.js";
import { StateManager } from "../../src/core/state/state-manager.js";

const mockedSelect = vi.mocked(p.select);
const mockedConfirm = vi.mocked(p.confirm);
const mockedIsCancel = vi.mocked(p.isCancel);
const mockedLog = vi.mocked(p.log);

const ALL_STEPS = ["auth", "detect", "assess", "external_tools", "claude_md", "rules", "hooks", "plugins", "ci", "coverage", "arch", "connect", "verify"];

describe("WizardRunner", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `dafke-wizard-test-${randomUUID()}`);
    mkdirSync(join(testRoot, ".dafke"), { recursive: true });
    executedSteps.length = 0;
    // Reset step results to all succeeding
    stepResults = {};
    // Reset call counters and overrides
    Object.keys(stepCallCounts).forEach((key) => { stepCallCounts[key] = 0; });
    stepOverrides = {};
    stepThrowOn = {};
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("creates fresh state on first run", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    const statePath = join(testRoot, ".dafke", "state.json");
    expect(existsSync(statePath)).toBe(true);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.wizardVersion).toBeDefined();
    expect(state.startedAt).toBeDefined();
  });

  it("executes all 13 steps in order", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    expect(executedSteps).toEqual(ALL_STEPS);
  });

  it("resumes from checkpoint (skips completed steps)", async () => {
    // Pre-seed state with some completed steps
    const stateManager = new StateManager(testRoot);
    const state = stateManager.createFreshState("0.1.0");
    state.completedSteps = ["auth", "detect", "assess"];
    stateManager.save(state);

    const runner = new WizardRunner(testRoot);
    await runner.run({ resume: true, nonInteractive: true });

    // auth, detect, assess should NOT be in executed list
    expect(executedSteps).not.toContain("auth");
    expect(executedSteps).not.toContain("detect");
    expect(executedSteps).not.toContain("assess");

    // Remaining steps should be executed
    expect(executedSteps).toContain("claude_md");
    expect(executedSteps).toContain("verify");
  });

  it("skip flag skips specified steps", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ skip: "auth,plugins,coverage", nonInteractive: true });

    expect(executedSteps).not.toContain("auth");
    expect(executedSteps).not.toContain("plugins");
    expect(executedSteps).not.toContain("coverage");

    // Other steps should still execute
    expect(executedSteps).toContain("detect");
    expect(executedSteps).toContain("verify");
  });

  it("saves state after each successful step", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();
    expect(finalState).not.toBeNull();
    expect(finalState?.completedSteps).toEqual(ALL_STEPS);
  });

  it("failed step does not mark step as completed in non-interactive mode", async () => {
    stepResults["hooks"] = { success: false };

    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();

    // hooks should not be in completedSteps since it failed
    expect(finalState?.completedSteps).not.toContain("hooks");

    // Steps after hooks should still be attempted
    expect(executedSteps).toContain("plugins");
  });

  it("non-interactive flag is passed through to step context", async () => {
    const runner = new WizardRunner(testRoot);

    // We verify indirectly: non-interactive mode should complete without prompts
    await expect(runner.run({ nonInteractive: true })).resolves.not.toThrow();
  });

  it("merges step data into context for subsequent steps", async () => {
    stepResults["detect"] = { success: true, data: { techStack: "typescript" } };

    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    // Verify data was persisted to state
    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();
    expect(finalState?.answers["techStack"]).toBe("typescript");
  });

  it("step throws exception: error caught, continues in non-interactive", async () => {
    // Make the "hooks" step throw on every call
    stepThrowOn["hooks"] = new Set([1, 2, 3]);

    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true });

    // The step after hooks should still execute
    expect(executedSteps).toContain("plugins");
    expect(executedSteps).toContain("verify");

    // hooks should not be in completedSteps since it threw
    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();
    expect(finalState?.completedSteps).not.toContain("hooks");
  });

  it("resume with no existing state creates fresh state", async () => {
    // No pre-seeded state — resume should create fresh
    const runner = new WizardRunner(testRoot);
    await runner.run({ resume: true, nonInteractive: true });

    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();
    expect(finalState).not.toBeNull();
    expect(finalState?.wizardVersion).toBeDefined();
    // All steps should have been executed since there was no prior state
    expect(executedSteps).toEqual(ALL_STEPS);
  });

  it("scores from state merged into context", async () => {
    // Pre-seed state with scores (all 6 dimensions required)
    const stateManager = new StateManager(testRoot);
    const state = stateManager.createFreshState("0.1.0");
    state.scores = { cicd: 3, coverage: 2, security: 4, review: 1, dora: 0, docs: 5 };
    stateManager.save(state);

    const runner = new WizardRunner(testRoot);
    await runner.run({ resume: true, nonInteractive: true });

    // Verify scores were passed through
    const finalState = stateManager.load();
    expect(finalState).not.toBeNull();
    expect(finalState?.scores?.cicd).toBe(3);
    expect(finalState?.scores?.security).toBe(4);
    // The runner creates ctx with scores from state, so steps could have used them
    expect(executedSteps.length).toBeGreaterThan(0);
  });

  it("skip set parsing works correctly with spaces and empty entries", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ skip: " auth , plugins , , coverage ", nonInteractive: true });

    expect(executedSteps).not.toContain("auth");
    expect(executedSteps).not.toContain("plugins");
    expect(executedSteps).not.toContain("coverage");
    expect(executedSteps).toContain("detect");
    expect(executedSteps).toContain("verify");
  });

  it("verbose flag passed to context", async () => {
    const runner = new WizardRunner(testRoot);
    // Just verify it doesn't throw when verbose is passed
    await expect(runner.run({ verbose: true, nonInteractive: true })).resolves.not.toThrow();
    expect(executedSteps).toEqual(ALL_STEPS);
  });

  it("techStack CLI override is set in context answers", async () => {
    const runner = new WizardRunner(testRoot);
    await runner.run({ nonInteractive: true, techStack: "python" });

    const stateManager = new StateManager(testRoot);
    const finalState = stateManager.load();
    expect(finalState?.answers["techStack"]).toBe("python");
  });

  describe("interactive mode: step failure handling", () => {
    it("step fails -> user selects 'skip' -> continues with remaining steps", async () => {
      stepResults["hooks"] = { success: false, message: "hooks failed" };
      mockedSelect.mockResolvedValueOnce("skip");

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode (nonInteractive not set)

      // hooks was attempted but failed
      expect(executedSteps).toContain("hooks");
      // Subsequent steps still executed
      expect(executedSteps).toContain("plugins");
      expect(executedSteps).toContain("verify");

      const stateManager = new StateManager(testRoot);
      const finalState = stateManager.load();
      expect(finalState?.completedSteps).not.toContain("hooks");
    });

    it("step fails -> user selects 'abort' -> wizard stops with save message", async () => {
      stepResults["hooks"] = { success: false };
      mockedSelect.mockResolvedValueOnce("abort");

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // hooks was attempted
      expect(executedSteps).toContain("hooks");
      // Steps after hooks should NOT have been executed
      expect(executedSteps).not.toContain("plugins");
      expect(executedSteps).not.toContain("verify");

      // Progress saved message was logged
      expect(mockedLog.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress saved"),
      );
    });

    it("step fails -> user cancels action selection (isCancel) -> wizard stops", async () => {
      stepResults["hooks"] = { success: false };
      // select returns a cancel symbol
      mockedSelect.mockResolvedValueOnce(Symbol("cancel") as unknown as string);
      mockedIsCancel.mockReturnValueOnce(true);

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      expect(executedSteps).toContain("hooks");
      // Wizard should have stopped
      expect(executedSteps).not.toContain("plugins");

      expect(mockedLog.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress saved"),
      );
    });

    it("step fails -> user selects 'retry' -> retry succeeds", async () => {
      // First call fails, second call (retry) succeeds
      stepOverrides["hooks"] = (callCount: number) => {
        if (callCount === 1) return { success: false, message: "first attempt failed" };
        return { success: true, data: { hookResult: "retried-ok" } };
      };
      mockedSelect.mockResolvedValueOnce("retry");

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // hooks was called twice (initial + retry)
      const hooksCallCount = executedSteps.filter((s) => s === "hooks").length;
      expect(hooksCallCount).toBe(2);

      // Retry succeeded, so step should be completed
      const stateManager = new StateManager(testRoot);
      const finalState = stateManager.load();
      expect(finalState?.completedSteps).toContain("hooks");

      // Data from retry should be merged
      expect(finalState?.answers["hookResult"]).toBe("retried-ok");

      // success log with "(retry)" should have been called
      expect(mockedLog.success).toHaveBeenCalledWith(
        expect.stringContaining("done (retry)"),
      );

      // Subsequent steps also executed
      expect(executedSteps).toContain("plugins");
      expect(executedSteps).toContain("verify");
    });

    it("step fails -> user selects 'retry' -> retry also fails -> continues", async () => {
      // Both calls fail
      stepOverrides["hooks"] = () => ({ success: false, message: "still broken" });
      mockedSelect.mockResolvedValueOnce("retry");

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // hooks was called twice (initial + retry)
      const hooksCallCount = executedSteps.filter((s) => s === "hooks").length;
      expect(hooksCallCount).toBe(2);

      // Step should NOT be completed since retry also failed
      const stateManager = new StateManager(testRoot);
      const finalState = stateManager.load();
      expect(finalState?.completedSteps).not.toContain("hooks");

      // Warning about retry failing should have been logged
      expect(mockedLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("retry also failed"),
      );

      // Subsequent steps still executed (continues after retry failure)
      expect(executedSteps).toContain("plugins");
      expect(executedSteps).toContain("verify");
    });
  });

  describe("interactive mode: step exception handling", () => {
    it("step throws Error -> interactive mode, user continues", async () => {
      stepThrowOn["hooks"] = new Set([1]);
      mockedConfirm.mockResolvedValueOnce(true);

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // Error was logged
      expect(mockedLog.error).toHaveBeenCalledWith(
        expect.stringContaining("Step hooks threw on call 1"),
      );

      // User chose to continue, so subsequent steps executed
      expect(executedSteps).toContain("plugins");
      expect(executedSteps).toContain("verify");
    });

    it("step throws Error -> interactive mode, user stops", async () => {
      stepThrowOn["hooks"] = new Set([1]);
      mockedConfirm.mockResolvedValueOnce(false);

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // Error was logged
      expect(mockedLog.error).toHaveBeenCalledWith(
        expect.stringContaining("Step hooks threw on call 1"),
      );

      // User chose NOT to continue
      expect(executedSteps).not.toContain("plugins");
      expect(executedSteps).not.toContain("verify");

      // Progress saved message
      expect(mockedLog.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress saved"),
      );
    });

    it("step throws Error -> interactive mode, user cancels confirm prompt", async () => {
      stepThrowOn["hooks"] = new Set([1]);
      // confirm returns a cancel symbol
      mockedConfirm.mockResolvedValueOnce(Symbol("cancel") as unknown as boolean);
      mockedIsCancel.mockReturnValueOnce(true);

      const runner = new WizardRunner(testRoot);
      await runner.run(); // interactive mode

      // Wizard should have stopped
      expect(executedSteps).not.toContain("plugins");

      expect(mockedLog.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress saved"),
      );
    });

    it("step throws non-Error value -> error message uses String()", async () => {
      // Override the step to throw a non-Error value
      stepOverrides["hooks"] = () => {
        throw "string error value";
      };

      const runner = new WizardRunner(testRoot);
      await runner.run({ nonInteractive: true });

      expect(mockedLog.error).toHaveBeenCalledWith(
        expect.stringContaining("string error value"),
      );

      // Continues in non-interactive mode
      expect(executedSteps).toContain("plugins");
    });
  });

  describe("step failure message handling", () => {
    it("failed step without message shows 'failed' as default", async () => {
      stepResults["hooks"] = { success: false };

      const runner = new WizardRunner(testRoot);
      await runner.run({ nonInteractive: true });

      expect(mockedLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
      );
    });

    it("failed step with custom message shows that message", async () => {
      stepResults["hooks"] = { success: false, message: "custom failure reason" };

      const runner = new WizardRunner(testRoot);
      await runner.run({ nonInteractive: true });

      expect(mockedLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("custom failure reason"),
      );
    });
  });
});
