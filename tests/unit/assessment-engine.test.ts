import { describe, it, expect, vi } from "vitest";
import { AssessmentEngine } from "../../src/core/analyzer/assessment-engine.js";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "../../src/core/analyzer/dimension-analyzer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAnalyzer(dimension: string, score: number): DimensionAnalyzer {
  return {
    dimension,
    analyze: vi.fn<(repoRoot: string) => Promise<DimensionResult>>().mockResolvedValue({
      dimension,
      score,
      details: `Mock ${dimension} score ${score}`,
      evidence: [`${dimension} evidence`],
      suggestions: score < 5 ? [`Improve ${dimension}`] : [],
    }),
  };
}

function makeAnalyzers(scores: {
  cicd: number;
  security: number;
  coverage: number;
  review: number;
  dora: number;
  docs: number;
}): DimensionAnalyzer[] {
  return [
    makeMockAnalyzer("cicd", scores.cicd),
    makeMockAnalyzer("security", scores.security),
    makeMockAnalyzer("coverage", scores.coverage),
    makeMockAnalyzer("review", scores.review),
    makeMockAnalyzer("dora", scores.dora),
    makeMockAnalyzer("docs", scores.docs),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssessmentEngine", () => {
  describe("wave assignment", () => {
    it("assigns wave1 when total >= 20 and hard gates met", async () => {
      const analyzers = makeAnalyzers({
        cicd: 4,
        security: 4,
        coverage: 4,
        review: 3,
        dora: 3,
        docs: 3,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave1");
      expect(result.totalScore).toBe(21);
      expect(result.scores.cicd).toBe(4);
      expect(result.scores.security).toBe(4);
    });

    it("assigns wave1 with exactly 20 total and hard gates met", async () => {
      const analyzers = makeAnalyzers({
        cicd: 4,
        security: 3,
        coverage: 4,
        review: 3,
        dora: 3,
        docs: 3,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave1");
      expect(result.totalScore).toBe(20);
    });

    it("assigns wave2 when total is 12-19 and hard gates met", async () => {
      const analyzers = makeAnalyzers({
        cicd: 3,
        security: 3,
        coverage: 2,
        review: 2,
        dora: 2,
        docs: 2,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave2");
      expect(result.totalScore).toBe(14);
    });

    it("assigns wave2 with exactly total 12 and hard gates met", async () => {
      const analyzers = makeAnalyzers({
        cicd: 3,
        security: 3,
        coverage: 2,
        review: 2,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave2");
      expect(result.totalScore).toBe(12);
    });

    it("assigns wave3 when total < 12", async () => {
      const analyzers = makeAnalyzers({
        cicd: 3,
        security: 3,
        coverage: 1,
        review: 1,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave3");
      expect(result.totalScore).toBe(10);
    });

    it("assigns wave3 when cicd < 3 even if total >= 20", async () => {
      const analyzers = makeAnalyzers({
        cicd: 2,
        security: 5,
        coverage: 5,
        review: 4,
        dora: 4,
        docs: 4,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave3");
      expect(result.totalScore).toBe(24);
    });

    it("assigns wave3 when security < 3 even if total >= 20", async () => {
      const analyzers = makeAnalyzers({
        cicd: 5,
        security: 2,
        coverage: 5,
        review: 4,
        dora: 4,
        docs: 4,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave3");
      expect(result.totalScore).toBe(24);
    });

    it("assigns wave3 when both hard gates fail", async () => {
      const analyzers = makeAnalyzers({
        cicd: 1,
        security: 1,
        coverage: 1,
        review: 1,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.wave).toBe("wave3");
      expect(result.totalScore).toBe(6);
    });
  });

  describe("improvement plan", () => {
    it("generates improvement actions for below-threshold dimensions", async () => {
      const analyzers = makeAnalyzers({
        cicd: 2,
        security: 1,
        coverage: 3,
        review: 2,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.improvementPlan.length).toBeGreaterThan(0);

      // Verify every dimension with a low score has an action
      const dimensionsWithActions = new Set(result.improvementPlan.map((a) => a.dimension));
      expect(dimensionsWithActions.has("cicd")).toBe(true);
      expect(dimensionsWithActions.has("security")).toBe(true);
    });

    it("prioritizes hard gate failures as critical", async () => {
      const analyzers = makeAnalyzers({
        cicd: 1,
        security: 2,
        coverage: 4,
        review: 4,
        dora: 4,
        docs: 4,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      const cicdAction = result.improvementPlan.find((a) => a.dimension === "cicd");
      const securityAction = result.improvementPlan.find((a) => a.dimension === "security");

      expect(cicdAction).toBeDefined();
      expect(cicdAction?.priority).toBe("critical");
      expect(securityAction).toBeDefined();
      expect(securityAction?.priority).toBe("critical");

      // Critical items should be sorted first
      expect(result.improvementPlan[0]?.priority).toBe("critical");
    });

    it("assigns high priority to hard gate dimensions above threshold", async () => {
      const analyzers = makeAnalyzers({
        cicd: 3,
        security: 3,
        coverage: 1,
        review: 1,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      const cicdAction = result.improvementPlan.find((a) => a.dimension === "cicd");
      // cicd at 3 (hard gate met) gets high priority since it's a hard gate dimension
      if (cicdAction) {
        expect(cicdAction.priority).toBe("high");
      }
    });

    it("includes estimated time for each action", async () => {
      const analyzers = makeAnalyzers({
        cicd: 1,
        security: 1,
        coverage: 1,
        review: 1,
        dora: 1,
        docs: 1,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      for (const action of result.improvementPlan) {
        expect(action.estimatedTime).toBeTruthy();
        expect(typeof action.estimatedTime).toBe("string");
      }
    });

    it("does not generate actions for dimensions already at 5", async () => {
      const analyzers = makeAnalyzers({
        cicd: 5,
        security: 5,
        coverage: 5,
        review: 5,
        dora: 5,
        docs: 5,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.improvementPlan.length).toBe(0);
      expect(result.wave).toBe("wave1");
      expect(result.totalScore).toBe(30);
    });
  });

  describe("parallel execution", () => {
    it("runs all 6 analyzers in parallel", async () => {
      const resolveOrder: string[] = [];

      const makeDelayedAnalyzer = (dimension: string, delay: number): DimensionAnalyzer => ({
        dimension,
        analyze: vi.fn<(repoRoot: string) => Promise<DimensionResult>>().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          resolveOrder.push(dimension);
          return {
            dimension,
            score: 3,
            details: `${dimension} analysis`,
            evidence: [],
            suggestions: [],
          };
        }),
      });

      const analyzers = [
        makeDelayedAnalyzer("cicd", 50),
        makeDelayedAnalyzer("security", 10),
        makeDelayedAnalyzer("coverage", 30),
        makeDelayedAnalyzer("review", 20),
        makeDelayedAnalyzer("dora", 40),
        makeDelayedAnalyzer("docs", 5),
      ];

      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      // All analyzers should have been called
      for (const analyzer of analyzers) {
        expect(analyzer.analyze).toHaveBeenCalledWith("/fake/repo", undefined);
        expect(analyzer.analyze).toHaveBeenCalledTimes(1);
      }

      // All 6 results should be present
      expect(result.dimensionResults).toHaveLength(6);

      // If running in parallel, faster analyzers resolve before slower ones
      // (docs:5ms should resolve before cicd:50ms)
      expect(resolveOrder.indexOf("docs")).toBeLessThan(resolveOrder.indexOf("cicd"));
    });
  });

  describe("score computation", () => {
    it("clamps scores to 0-5 range", async () => {
      const analyzers: DimensionAnalyzer[] = [
        {
          dimension: "cicd",
          analyze: vi.fn<(repoRoot: string) => Promise<DimensionResult>>().mockResolvedValue({
            dimension: "cicd",
            score: 7, // Over max
            details: "overscored",
            evidence: [],
            suggestions: [],
          }),
        },
        {
          dimension: "security",
          analyze: vi.fn<(repoRoot: string) => Promise<DimensionResult>>().mockResolvedValue({
            dimension: "security",
            score: -1, // Under min
            details: "underscored",
            evidence: [],
            suggestions: [],
          }),
        },
        makeMockAnalyzer("coverage", 3),
        makeMockAnalyzer("review", 3),
        makeMockAnalyzer("dora", 3),
        makeMockAnalyzer("docs", 3),
      ];

      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.scores.cicd).toBe(5);
      expect(result.scores.security).toBe(0);
    });

    it("returns all dimension results in order", async () => {
      const analyzers = makeAnalyzers({
        cicd: 3,
        security: 3,
        coverage: 3,
        review: 3,
        dora: 3,
        docs: 3,
      });
      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.dimensionResults).toHaveLength(6);
      expect(result.dimensionResults.map((r) => r.dimension)).toEqual([
        "cicd",
        "security",
        "coverage",
        "review",
        "dora",
        "docs",
      ]);
    });
  });

  describe("AnalyzerContext threading", () => {
    it("passes context to each analyzer when provided", async () => {
      const context: AnalyzerContext = {
        repoRoot: "/fake/repo",
        manifest: { corulusCcVersion: "0.3.5", techStack: "typescript" } as AnalyzerContext["manifest"],
      };

      const analyzeSpy = vi.fn<(repoRoot: string, ctx?: AnalyzerContext) => Promise<DimensionResult>>().mockResolvedValue({
        dimension: "cicd", score: 3, details: "ok", evidence: [], suggestions: [],
      });

      const analyzers: DimensionAnalyzer[] = [{
        dimension: "cicd",
        analyze: analyzeSpy,
      }];

      for (const dim of ["coverage", "security", "review", "dora", "docs"]) {
        analyzers.push({
          dimension: dim,
          analyze: vi.fn<(repoRoot: string, ctx?: AnalyzerContext) => Promise<DimensionResult>>().mockResolvedValue({
            dimension: dim, score: 3, details: "ok", evidence: [], suggestions: [],
          }),
        });
      }

      const engine = new AssessmentEngine(analyzers);
      await engine.assess("/fake/repo", undefined, context);

      expect(analyzeSpy).toHaveBeenCalledWith("/fake/repo", context);
    });

    it("works without context (backward compat)", async () => {
      const analyzers: DimensionAnalyzer[] = (
        ["cicd", "security", "coverage", "review", "dora", "docs"] as const
      ).map((dim) => ({
        dimension: dim,
        analyze: vi.fn<(repoRoot: string, ctx?: AnalyzerContext) => Promise<DimensionResult>>().mockResolvedValue({
          dimension: dim, score: 3, details: "ok", evidence: [], suggestions: [],
        }),
      }));

      const engine = new AssessmentEngine(analyzers);
      const result = await engine.assess("/fake/repo");

      expect(result.totalScore).toBe(18);
      for (const a of analyzers) {
        expect(a.analyze).toHaveBeenCalledWith("/fake/repo", undefined);
      }
    });
  });
});
