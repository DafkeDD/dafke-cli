import { describe, it, expect } from "vitest";
import { analyzePipeline, getQualityGateSummary } from "../../src/core/wizard/steps/step-ci.js";
import type { PipelineAnalysis } from "../../src/core/wizard/steps/step-ci.js";

// ---------------------------------------------------------------------------
// analyzePipeline
// ---------------------------------------------------------------------------

describe("analyzePipeline", () => {
  it("detects tests keyword", () => {
    const result = analyzePipeline("steps:\n  - run: npm run test");
    expect(result.hasTests).toBe(true);
  });

  it("detects 'npm run test' pattern", () => {
    const result = analyzePipeline("script:\n  npm  run  test --ci");
    expect(result.hasTests).toBe(true);
  });

  it("detects lint keyword", () => {
    const result = analyzePipeline("steps:\n  - run: npm run lint");
    expect(result.hasLint).toBe(true);
  });

  it("detects eslint keyword", () => {
    const result = analyzePipeline("steps:\n  - run: npx eslint .");
    expect(result.hasLint).toBe(true);
  });

  it("detects typecheck via tsc", () => {
    const result = analyzePipeline("steps:\n  - run: npx tsc --noEmit");
    expect(result.hasTypecheck).toBe(true);
  });

  it("detects typecheck keyword", () => {
    const result = analyzePipeline("steps:\n  - run: npm run typecheck");
    expect(result.hasTypecheck).toBe(true);
  });

  it("detects SAST via semgrep", () => {
    const result = analyzePipeline("steps:\n  - run: semgrep --config auto");
    expect(result.hasSast).toBe(true);
  });

  it("detects SAST via gitleaks", () => {
    const result = analyzePipeline("steps:\n  - run: gitleaks detect");
    expect(result.hasSast).toBe(true);
  });

  it("detects SAST keyword", () => {
    const result = analyzePipeline("steps:\n  - name: Run SAST scan");
    expect(result.hasSast).toBe(true);
  });

  it("detects coverage keyword", () => {
    const result = analyzePipeline("steps:\n  - run: npm run test -- --coverage");
    expect(result.hasCoverage).toBe(true);
  });

  it("detects coverlet keyword (dotnet)", () => {
    const result = analyzePipeline("steps:\n  - run: dotnet test --collect coverlet");
    expect(result.hasCoverage).toBe(true);
  });

  it("detects jacoco keyword (java)", () => {
    const result = analyzePipeline("steps:\n  - name: JaCoCo coverage report");
    expect(result.hasCoverage).toBe(true);
  });

  it("returns all false for empty content", () => {
    const result = analyzePipeline("");
    expect(result.hasTests).toBe(false);
    expect(result.hasLint).toBe(false);
    expect(result.hasTypecheck).toBe(false);
    expect(result.hasSast).toBe(false);
    expect(result.hasCoverage).toBe(false);
    expect(result.detectedStages).toEqual([]);
  });

  it("detects stages from YAML-like content", () => {
    const content = `
stages:
  - stage: Build
  - stage: Test
  - stage: Deploy
`;
    const result = analyzePipeline(content);
    expect(result.detectedStages).toEqual(["Build", "Test", "Deploy"]);
  });

  it("detects all gates in a full pipeline", () => {
    const content = `
name: CI
on: push
jobs:
  build:
    steps:
      - run: npm run lint
      - run: npm run test --coverage
      - run: npx tsc --noEmit
      - run: semgrep --config auto
`;
    const result = analyzePipeline(content);
    expect(result.hasTests).toBe(true);
    expect(result.hasLint).toBe(true);
    expect(result.hasTypecheck).toBe(true);
    expect(result.hasSast).toBe(true);
    expect(result.hasCoverage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getQualityGateSummary
// ---------------------------------------------------------------------------

describe("getQualityGateSummary", () => {
  it("returns empty missing when all gates present", () => {
    const analysis: PipelineAnalysis = {
      hasTests: true,
      hasLint: true,
      hasTypecheck: true,
      hasSast: true,
      hasCoverage: true,
      detectedStages: [],
    };
    const summary = getQualityGateSummary(analysis);
    expect(summary.present).toEqual(["tests", "lint", "typecheck", "SAST/security", "coverage"]);
    expect(summary.missing).toEqual([]);
  });

  it("returns all missing when no gates present", () => {
    const analysis: PipelineAnalysis = {
      hasTests: false,
      hasLint: false,
      hasTypecheck: false,
      hasSast: false,
      hasCoverage: false,
      detectedStages: [],
    };
    const summary = getQualityGateSummary(analysis);
    expect(summary.present).toEqual([]);
    expect(summary.missing).toEqual(["tests", "lint", "typecheck", "SAST/security", "coverage"]);
  });

  it("returns correct split with partial gates", () => {
    const analysis: PipelineAnalysis = {
      hasTests: true,
      hasLint: true,
      hasTypecheck: false,
      hasSast: false,
      hasCoverage: true,
      detectedStages: [],
    };
    const summary = getQualityGateSummary(analysis);
    expect(summary.present).toEqual(["tests", "lint", "coverage"]);
    expect(summary.missing).toEqual(["typecheck", "SAST/security"]);
  });

  it("counts correctly with single gate present", () => {
    const analysis: PipelineAnalysis = {
      hasTests: false,
      hasLint: false,
      hasTypecheck: true,
      hasSast: false,
      hasCoverage: false,
      detectedStages: [],
    };
    const summary = getQualityGateSummary(analysis);
    expect(summary.present).toHaveLength(1);
    expect(summary.missing).toHaveLength(4);
    expect(summary.present).toContain("typecheck");
  });
});
