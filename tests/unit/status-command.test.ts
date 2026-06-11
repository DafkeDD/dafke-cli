import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";
import { VERSION } from "../../src/version.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-status-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(repoRoot: string, overrides: Record<string, unknown> = {}): void {
  const manifestDir = join(repoRoot, ".dafke");
  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    corulusCcVersion: VERSION,
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
// Pure function tests — scoreColor, scoreBar, trafficLight, waveLabel
// These are module-internal functions. We test them indirectly through the
// command output, but also verify the full range of inputs through the
// dashboard rendering.
// ---------------------------------------------------------------------------

describe("status command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // No manifest → init suggestion
  // -----------------------------------------------------------------------

  describe("no manifest", () => {
    it("shows init suggestion when no manifest exists", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("No .dafke/manifest.yaml found");
      expect(output).toContain("dafke init");
    });
  });

  // -----------------------------------------------------------------------
  // Dashboard display with manifest
  // -----------------------------------------------------------------------

  describe("dashboard display", () => {
    it("shows readiness scorecard", async () => {
      writeManifest(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Readiness Scorecard");
      expect(output).toContain("CI/CD Maturity");
      expect(output).toContain("Test Coverage");
      expect(output).toContain("Security Pipeline");
      expect(output).toContain("Code Review");
      expect(output).toContain("DORA Metrics");
      expect(output).toContain("Documentation");
    });

    it("shows total score", async () => {
      writeManifest(tempDir, {
        readinessScores: { cicd: 4, coverage: 5, security: 3, review: 4, dora: 3, docs: 5 },
      });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      // Total = 4+5+3+4+3+5 = 24
      expect(output).toContain("24/30");
    });

    it("shows wave label", async () => {
      writeManifest(tempDir, { wave: "wave1" });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Wave 1");
    });

    it("shows 'Not assessed' when wave is undefined", async () => {
      writeManifest(tempDir, { wave: undefined });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Not assessed");
    });

    it("shows last audit date", async () => {
      writeManifest(tempDir, { lastAudit: "2026-04-15T10:00:00.000Z" });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("2026-04-15T10:00:00.000Z");
    });

    it("shows 'Never' when lastAudit is undefined", async () => {
      writeManifest(tempDir, { lastAudit: undefined });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Never");
    });

    it("shows 'No scores available' when readinessScores is undefined", async () => {
      writeManifest(tempDir, { readinessScores: undefined });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("No scores available");
    });

    it("shows adoption, quality, and experience success criteria", async () => {
      writeManifest(tempDir, {
        readinessScores: { cicd: 4, coverage: 4, security: 4, review: 4, dora: 4, docs: 4 },
      });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Adoption");
      expect(output).toContain("Activation Rate");
      expect(output).toContain("Daily Usage");
      expect(output).toContain("AI Share Tier");
      expect(output).toContain("Quality");
      expect(output).toContain("CFR Trend");
      expect(output).toContain("Coverage %");
      expect(output).toContain("PR Cycle Time");
      expect(output).toContain("Experience");
      expect(output).toContain("NPS");
      expect(output).toContain("Training Satisfaction");
    });
  });

  // -----------------------------------------------------------------------
  // Score-dependent coloring (tested via score ranges in output)
  // -----------------------------------------------------------------------

  describe("score display ranges", () => {
    const scoreTestCases = [
      { scores: { cicd: 0, coverage: 0, security: 0, review: 0, dora: 0, docs: 0 }, total: "0/30" },
      { scores: { cicd: 5, coverage: 5, security: 5, review: 5, dora: 5, docs: 5 }, total: "30/30" },
      { scores: { cicd: 1, coverage: 2, security: 3, review: 4, dora: 5, docs: 0 }, total: "15/30" },
    ];

    it.each(scoreTestCases)("displays total $total for given scores", async ({ scores, total }) => {
      writeManifest(tempDir, { readinessScores: scores });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain(total);
    });
  });

  // -----------------------------------------------------------------------
  // Wave labels
  // -----------------------------------------------------------------------

  describe("wave labels", () => {
    const waveCases = [
      { wave: "wave1", label: "Wave 1" },
      { wave: "wave2", label: "Wave 2" },
      { wave: "wave3", label: "Wave 3" },
    ];

    it.each(waveCases)("displays $label for $wave", async ({ wave, label }) => {
      writeManifest(tempDir, { wave });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain(label);
    });
  });

  // -----------------------------------------------------------------------
  // JSON format output
  // -----------------------------------------------------------------------

  describe("JSON format", () => {
    it("outputs valid JSON with all expected fields", async () => {
      writeManifest(tempDir, {
        readinessScores: { cicd: 3, coverage: 4, security: 2, review: 5, dora: 1, docs: 3 },
        wave: "wave1",
        lastAudit: "2026-01-01T00:00:00.000Z",
      });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "json" } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      const output = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(output).toHaveProperty("version");
      expect(output).toHaveProperty("configSchemaVersion");
      expect(output).toHaveProperty("techStack", "typescript");
      expect(output).toHaveProperty("wave", "wave1");
      expect(output).toHaveProperty("lastAudit", "2026-01-01T00:00:00.000Z");
      expect(output).toHaveProperty("scores");
      expect(output.scores).toEqual({
        cicd: 3, coverage: 4, security: 2, review: 5, dora: 1, docs: 3,
      });
    });

    it("outputs null for missing optional fields", async () => {
      writeManifest(tempDir, { wave: undefined, lastAudit: undefined, readinessScores: undefined });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "json" } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      const output = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(output.wave).toBeNull();
      expect(output.lastAudit).toBeNull();
      expect(output.scores).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // --explain flag
  // -----------------------------------------------------------------------

  describe("--explain flag", () => {
    it("shows dimension definitions when --explain is set", async () => {
      writeManifest(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text", explain: true } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Dimension Scoring Guide");
      expect(output).toContain("0 = No automation");
      expect(output).toContain("5 = Self-healing CD");
      expect(output).toContain("Success Criteria Thresholds");
      expect(output).toContain("Activation Rate");
    });

    it("does not show explanations without --explain", async () => {
      writeManifest(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text", explain: false } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).not.toContain("Dimension Scoring Guide");
      expect(output).not.toContain("0 = No automation");
    });

    it("includes explanations in JSON output when --explain is set", async () => {
      writeManifest(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "json", explain: true } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      const output = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(output).toHaveProperty("explanations");
      expect(output.explanations).toHaveProperty("dimensions");
      expect(output.explanations).toHaveProperty("successCriteria");
      expect(output.explanations.dimensions).toHaveProperty("cicd");
      expect(output.explanations.dimensions.cicd).toHaveProperty("rubric");
    });

    it("does not include explanations in JSON without --explain", async () => {
      writeManifest(tempDir);
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "json", explain: false } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      const output = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(output).not.toHaveProperty("explanations");
    });

    it("shows explanations even without manifest when --explain is set", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text", explain: true } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("No .dafke/manifest.yaml found");
      expect(output).toContain("Dimension Scoring Guide");
    });

    it("shows JSON explanations even without manifest when --explain is set", async () => {
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      vi.resetModules();
      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "json", explain: true } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      const output = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(output).toHaveProperty("dimensions");
    });
  });

  // -----------------------------------------------------------------------
  // Drift detection
  // -----------------------------------------------------------------------

  describe("drift detection", () => {
    it("shows 'In sync' when versions match", async () => {
      writeManifest(tempDir, { corulusCcVersion: VERSION });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("In sync");
    });

    it("shows 'Version mismatch' when versions differ", async () => {
      writeManifest(tempDir, { corulusCcVersion: "0.0.1" });
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const { default: statusCommand } = await import("../../src/cli/commands/status.js");
      // @ts-expect-error - internal run
      await statusCommand.run({ args: { format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Version mismatch");
    });
  });
});
