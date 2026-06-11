import type { ReadinessScores, Wave } from "../config/config-schema.js";
import type { Rules } from "../config/rules-schema.js";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImprovementAction {
  dimension: string;
  currentScore: number;
  targetScore: number;
  action: string;
  estimatedTime: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface AssessmentResult {
  scores: ReadinessScores;
  totalScore: number;
  wave: Wave;
  dimensionResults: DimensionResult[];
  improvementPlan: ImprovementAction[];
}

// ---------------------------------------------------------------------------
// Hard-gate dimension keys
// ---------------------------------------------------------------------------

const HARD_GATES: ReadonlyArray<keyof ReadinessScores> = ["cicd", "security"] as const;
const HARD_GATE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Wave thresholds
// ---------------------------------------------------------------------------

const WAVE1_TOTAL_THRESHOLD = 20;
const WAVE2_TOTAL_THRESHOLD = 12;

// ---------------------------------------------------------------------------
// Estimated improvement times per score delta
// ---------------------------------------------------------------------------

const ESTIMATED_TIMES: Record<string, Record<number, string>> = {
  cicd: { 1: "1-2 weeks", 2: "2-4 weeks", 3: "1-2 months" },
  security: { 1: "1-2 weeks", 2: "2-4 weeks", 3: "1-2 months" },
  coverage: { 1: "1-2 weeks", 2: "2-4 weeks", 3: "1-2 months" },
  review: { 1: "1 week", 2: "2-3 weeks", 3: "1-2 months" },
  dora: { 1: "2-4 weeks", 2: "1-2 months", 3: "2-3 months" },
  docs: { 1: "2-3 days", 2: "1 week", 3: "2-3 weeks" },
};

function getEstimatedTime(dimension: string, delta: number): string {
  const times = ESTIMATED_TIMES[dimension];
  if (!times) return "unknown";
  if (delta <= 1) return times[1] ?? "1-2 weeks";
  if (delta <= 2) return times[2] ?? "2-4 weeks";
  return times[3] ?? "1-2 months";
}

// ---------------------------------------------------------------------------
// Assessment Engine
// ---------------------------------------------------------------------------

export class AssessmentEngine {
  constructor(private readonly analyzers: DimensionAnalyzer[]) {}

  async assess(repoRoot: string, rules?: Rules, context?: AnalyzerContext): Promise<AssessmentResult> {
    const dimensionResults = await Promise.all(
      this.analyzers.map((a) => a.analyze(repoRoot, context)),
    );

    // Use rules-based thresholds when provided, otherwise fall back to defaults
    const hardGateThreshold = rules?.assessment.hardGateThreshold ?? HARD_GATE_THRESHOLD;
    const wave1Threshold = rules?.assessment.wave1Threshold ?? WAVE1_TOTAL_THRESHOLD;
    const wave2Threshold = rules?.assessment.wave2Threshold ?? WAVE2_TOTAL_THRESHOLD;
    const hardGates: readonly string[] = rules?.assessment.hardGates ?? HARD_GATES;

    const scores = this.computeScores(dimensionResults);
    const totalScore = this.computeTotal(scores);
    const wave = this.assignWave(scores, totalScore, hardGates, hardGateThreshold, wave1Threshold, wave2Threshold);
    const improvementPlan = this.generateImprovementPlan(dimensionResults, scores, hardGates, hardGateThreshold);

    return { scores, totalScore, wave, dimensionResults, improvementPlan };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private computeScores(results: DimensionResult[]): ReadinessScores {
    const clamp = (score: number) => Math.min(5, Math.max(0, Math.round(score)));
    const lookup = new Map(results.map((r) => [r.dimension, clamp(r.score)]));

    return {
      cicd: lookup.get("cicd") ?? 0,
      coverage: lookup.get("coverage") ?? 0,
      security: lookup.get("security") ?? 0,
      review: lookup.get("review") ?? 0,
      dora: lookup.get("dora") ?? 0,
      docs: lookup.get("docs") ?? 0,
    };
  }

  private computeTotal(scores: ReadinessScores): number {
    return scores.cicd + scores.coverage + scores.security + scores.review + scores.dora + scores.docs;
  }

  private assignWave(
    scores: ReadinessScores,
    totalScore: number,
    hardGates: readonly string[] = HARD_GATES,
    hardGateThreshold: number = HARD_GATE_THRESHOLD,
    wave1Threshold: number = WAVE1_TOTAL_THRESHOLD,
    wave2Threshold: number = WAVE2_TOTAL_THRESHOLD,
  ): Wave {
    const hardGatesMet = hardGates.every((gate) => {
      const score = scores[gate as keyof ReadinessScores];
      return score !== undefined && score >= hardGateThreshold;
    });

    if (hardGatesMet && totalScore >= wave1Threshold) {
      return "wave1";
    }

    if (hardGatesMet && totalScore >= wave2Threshold) {
      return "wave2";
    }

    return "wave3";
  }

  private generateImprovementPlan(
    results: DimensionResult[],
    scores: ReadinessScores,
    hardGates: readonly string[] = HARD_GATES,
    hardGateThreshold: number = HARD_GATE_THRESHOLD,
  ): ImprovementAction[] {
    const actions: ImprovementAction[] = [];

    for (const result of results) {
      const key = result.dimension as keyof ReadinessScores;
      const currentScore = scores[key];

      if (currentScore === undefined) continue;

      // Already at maximum score — nothing to improve
      if (currentScore >= 5) continue;

      // Determine target score based on whether this is a hard gate
      const isHardGate = hardGates.includes(result.dimension);
      const targetScore = isHardGate
        ? Math.max(hardGateThreshold, currentScore + 1)
        : Math.min(5, currentScore + 1);

      if (currentScore >= targetScore && currentScore >= 3) continue;

      // Determine priority
      let priority: ImprovementAction["priority"];
      if (isHardGate && currentScore < hardGateThreshold) {
        priority = "critical";
      } else if (isHardGate) {
        priority = "high";
      } else if (currentScore < 2) {
        priority = "high";
      } else if (currentScore < 3) {
        priority = "medium";
      } else {
        priority = "low";
      }

      const delta = targetScore - currentScore;
      const suggestion = result.suggestions[0] ?? `Improve ${result.dimension} score.`;

      actions.push({
        dimension: result.dimension,
        currentScore,
        targetScore,
        action: suggestion,
        estimatedTime: getEstimatedTime(result.dimension, delta),
        priority,
      });
    }

    // Sort: critical first, then high, medium, low
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));

    return actions;
  }
}
