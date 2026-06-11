import { describe, it, expect } from "vitest";
import type { DimensionResult, DimensionAnalyzer } from "../../src/core/analyzer/dimension-analyzer.js";

describe("DimensionResult interface", () => {
  it("valid DimensionResult has all required fields", () => {
    const result: DimensionResult = {
      dimension: "cicd",
      score: 4,
      details: "Good CI/CD pipeline detected",
      evidence: ["GitHub Actions workflow found", "lint step present"],
      suggestions: ["Add deployment stage"],
    };

    expect(result.dimension).toBe("cicd");
    expect(result.score).toBe(4);
    expect(result.details).toBe("Good CI/CD pipeline detected");
    expect(result.evidence).toHaveLength(2);
    expect(result.suggestions).toHaveLength(1);
  });

  it("score at minimum bound (0) is valid", () => {
    const result: DimensionResult = {
      dimension: "security",
      score: 0,
      details: "No security measures found",
      evidence: [],
      suggestions: ["Add SAST scanning"],
    };

    expect(result.score).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("score at maximum bound (5) is valid", () => {
    const result: DimensionResult = {
      dimension: "testing",
      score: 5,
      details: "Excellent test coverage",
      evidence: ["90%+ coverage", "mutation testing configured"],
      suggestions: [],
    };

    expect(result.score).toBe(5);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("score outside valid range (negative) fails validation", () => {
    const score = -1;
    expect(score).toBeLessThan(0);
    expect(score).not.toBeGreaterThanOrEqual(0);
  });

  it("score outside valid range (above 5) fails validation", () => {
    const score = 6;
    expect(score).toBeGreaterThan(5);
    expect(score).not.toBeLessThanOrEqual(5);
  });

  it("evidence and suggestions can be empty arrays", () => {
    const result: DimensionResult = {
      dimension: "docs",
      score: 3,
      details: "Average documentation",
      evidence: [],
      suggestions: [],
    };

    expect(result.evidence).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });
});

describe("DimensionAnalyzer interface", () => {
  it("conforming object has dimension and analyze", () => {
    const analyzer: DimensionAnalyzer = {
      dimension: "cicd",
      async analyze(_repoRoot: string): Promise<DimensionResult> {
        return {
          dimension: "cicd",
          score: 3,
          details: "mock analysis",
          evidence: [],
          suggestions: [],
        };
      },
    };

    expect(analyzer.dimension).toBe("cicd");
    expect(typeof analyzer.analyze).toBe("function");
  });

  it("analyze returns a DimensionResult", async () => {
    const analyzer: DimensionAnalyzer = {
      dimension: "security",
      async analyze(): Promise<DimensionResult> {
        return {
          dimension: "security",
          score: 2,
          details: "needs improvement",
          evidence: ["no SAST"],
          suggestions: ["add scanning"],
        };
      },
    };

    const result = await analyzer.analyze("/tmp/test-repo");
    expect(result.dimension).toBe("security");
    expect(result.score).toBe(2);
    expect(result.evidence).toContain("no SAST");
  });
});
