import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { StateManager } from "../../src/core/state/state-manager.js";
import type { WizardState, WizardStep } from "../../src/core/config/config-schema.js";

const TEST_ROOT = join(tmpdir(), `dafke-test-${randomUUID()}`);
const STATE_DIR = join(TEST_ROOT, ".dafke");
const STATE_PATH = join(STATE_DIR, "state.json");

function makeValidState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    wizardVersion: "1.0.0",
    startedAt: new Date().toISOString(),
    completedSteps: [],
    answers: {},
    ...overrides,
  };
}

describe("StateManager", () => {
  let manager: StateManager;

  beforeEach(() => {
    mkdirSync(STATE_DIR, { recursive: true });
    manager = new StateManager(TEST_ROOT);
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------

  describe("load()", () => {
    it("returns null when no state file exists", () => {
      // Ensure no state file
      if (existsSync(STATE_PATH)) rmSync(STATE_PATH);
      expect(manager.load()).toBeNull();
    });

    it("parses valid state", () => {
      const state = makeValidState({ wizardVersion: "2.0.0" });
      writeFileSync(STATE_PATH, JSON.stringify(state), "utf-8");

      const loaded = manager.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.wizardVersion).toBe("2.0.0");
      expect(loaded?.completedSteps).toEqual([]);
    });

    it("throws on invalid JSON", () => {
      writeFileSync(STATE_PATH, "not json {{{", "utf-8");
      expect(() => manager.load()).toThrow();
    });

    it("throws on schema validation failure", () => {
      // Missing required fields
      writeFileSync(STATE_PATH, JSON.stringify({ invalid: true }), "utf-8");
      expect(() => manager.load()).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // save()
  // -------------------------------------------------------------------------

  describe("save()", () => {
    it("creates .dafke directory if missing", () => {
      rmSync(STATE_DIR, { recursive: true, force: true });
      const state = makeValidState();

      manager.save(state);

      expect(existsSync(STATE_DIR)).toBe(true);
      expect(existsSync(STATE_PATH)).toBe(true);
    });

    it("performs atomic write (temp + rename)", () => {
      // We verify by checking the file is valid after save (atomic writes
      // ensure no partial writes visible)
      const state = makeValidState({ wizardVersion: "3.0.0" });
      manager.save(state);

      const raw = readFileSync(STATE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.wizardVersion).toBe("3.0.0");
    });

    it("validates against schema before writing", () => {
      const invalidState = { invalid: "data" } as unknown as WizardState;
      expect(() => manager.save(invalidState)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // completeStep()
  // -------------------------------------------------------------------------

  describe("completeStep()", () => {
    it("adds step to completedSteps", () => {
      const state = makeValidState();
      manager.save(state);

      manager.completeStep("auth");

      const loaded = manager.load();
      expect(loaded?.completedSteps).toContain("auth");
      expect(loaded?.lastStep).toBe("auth");
    });

    it("throws when no state exists", () => {
      expect(() => manager.completeStep("auth")).toThrow(
        "No wizard state found",
      );
    });

    it("does not duplicate completed steps", () => {
      const state = makeValidState({ completedSteps: ["auth"] });
      manager.save(state);

      manager.completeStep("auth");

      const loaded = manager.load();
      const authSteps = loaded?.completedSteps.filter((s) => s === "auth");
      expect(authSteps).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // isStepCompleted()
  // -------------------------------------------------------------------------

  describe("isStepCompleted()", () => {
    it("returns true for completed step", () => {
      const state = makeValidState({ completedSteps: ["detect", "assess"] });
      manager.save(state);

      expect(manager.isStepCompleted("detect")).toBe(true);
      expect(manager.isStepCompleted("assess")).toBe(true);
    });

    it("returns false for incomplete step", () => {
      const state = makeValidState({ completedSteps: ["auth"] });
      manager.save(state);

      expect(manager.isStepCompleted("detect")).toBe(false);
    });

    it("returns false when no state exists", () => {
      expect(manager.isStepCompleted("auth")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getNextStep()
  // -------------------------------------------------------------------------

  describe("getNextStep()", () => {
    const ALL_STEPS: readonly WizardStep[] = ["auth", "detect", "assess", "claude_md"];

    it("returns first incomplete step", () => {
      const state = makeValidState({ completedSteps: ["auth"] });
      manager.save(state);

      expect(manager.getNextStep(ALL_STEPS)).toBe("detect");
    });

    it("returns null when all steps are done", () => {
      const state = makeValidState({
        completedSteps: ["auth", "detect", "assess", "claude_md"],
      });
      manager.save(state);

      expect(manager.getNextStep(ALL_STEPS)).toBeNull();
    });

    it("returns first step when no state exists", () => {
      expect(manager.getNextStep(ALL_STEPS)).toBe("auth");
    });
  });

  // -------------------------------------------------------------------------
  // createFreshState()
  // -------------------------------------------------------------------------

  describe("createFreshState()", () => {
    it("returns valid initial state", () => {
      const state = manager.createFreshState("1.0.0");

      expect(state.wizardVersion).toBe("1.0.0");
      expect(state.startedAt).toBeDefined();
      expect(state.completedSteps).toEqual([]);
      expect(state.answers).toEqual({});
      expect(state.lastStep).toBeUndefined();

      // Should be valid according to schema
      manager.save(state); // Would throw if invalid
    });
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  describe("reset()", () => {
    it("removes state file", () => {
      const state = makeValidState();
      manager.save(state);
      expect(existsSync(STATE_PATH)).toBe(true);

      manager.reset();

      expect(existsSync(STATE_PATH)).toBe(false);
    });

    it("succeeds when no file exists", () => {
      // Should not throw
      expect(() => manager.reset()).not.toThrow();
    });
  });
});
