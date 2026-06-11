/**
 * Step 3: Readiness Assessment
 *
 * Runs the full 6-dimension assessment, displays a scorecard,
 * shows wave assignment, and presents the improvement plan.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { AssessmentEngine } from "../../analyzer/assessment-engine.js";
import { CicdAnalyzer } from "../../analyzer/cicd-analyzer.js";
import { CoverageAnalyzer } from "../../analyzer/coverage-analyzer.js";
import { SecurityAnalyzer } from "../../analyzer/security-analyzer.js";
import { ReviewAnalyzer } from "../../analyzer/review-analyzer.js";
import { DoraAnalyzer } from "../../analyzer/dora-analyzer.js";
import { DocsAnalyzer } from "../../analyzer/docs-analyzer.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

const WAVE_COLORS: Record<string, (s: string) => string> = {
  wave1: chalk.green,
  wave2: chalk.yellow,
  wave3: chalk.red,
};

const WAVE_DESCRIPTIONS: Record<string, string> = {
  wave1: "Ready for full AI-assisted development",
  wave2: "Ready with some improvements needed",
  wave3: "Foundational work required before AI adoption",
};

function scoreBar(score: number, max = 5): string {
  const filled = Math.round(score);
  const empty = max - filled;
  return chalk.green("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const engine = new AssessmentEngine([
    new CicdAnalyzer(),
    new CoverageAnalyzer(),
    new SecurityAnalyzer(),
    new ReviewAnalyzer(),
    new DoraAnalyzer(),
    new DocsAnalyzer(),
  ]);

  const s = p.spinner();
  s.start("Running readiness assessment across 6 dimensions...");

  let result;
  try {
    result = await engine.assess(ctx.repoRoot);
  } catch (error) {
    s.stop("Assessment failed");
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }

  s.stop("Assessment complete");

  // Display scorecard
  p.log.message(chalk.bold("\n  Readiness Scorecard"));
  p.log.message(chalk.dim("  " + "\u2500".repeat(44)));

  const dimensions: Array<[string, number]> = [
    ["CI/CD", result.scores.cicd],
    ["Coverage", result.scores.coverage],
    ["Security", result.scores.security],
    ["Code Review", result.scores.review],
    ["DORA Metrics", result.scores.dora],
    ["Documentation", result.scores.docs],
  ];

  for (const [label, score] of dimensions) {
    const paddedLabel = label.padEnd(16);
    p.log.message(`  ${paddedLabel} ${scoreBar(score)} ${score}/5`);
  }

  p.log.message(chalk.dim("  " + "\u2500".repeat(44)));
  p.log.message(`  ${"Total".padEnd(16)} ${chalk.bold(`${result.totalScore}/30`)}`);

  // Wave assignment
  const waveColor = WAVE_COLORS[result.wave] ?? chalk.white;
  p.log.message(`\n  Wave: ${waveColor(result.wave.toUpperCase())} - ${WAVE_DESCRIPTIONS[result.wave] ?? ""}`);

  // Improvement plan
  if (result.improvementPlan.length > 0) {
    p.log.message(chalk.bold("\n  Improvement Plan"));
    for (const action of result.improvementPlan.slice(0, 5)) {
      const icon = action.priority === "critical" ? "\u26a0" : action.priority === "high" ? "\u25b2" : "\u25cf";
      p.log.message(`  ${icon} [${action.priority}] ${action.action} (est. ${action.estimatedTime})`);
    }
  }

  if (ctx.nonInteractive) {
    return { success: true, data: { scores: result.scores, wave: result.wave, totalScore: result.totalScore } };
  }

  const proceed = await p.confirm({ message: "Continue with setup?" });
  if (p.isCancel(proceed) || !proceed) {
    return { success: false, message: "User chose to fix issues before continuing" };
  }

  return { success: true, data: { scores: result.scores, wave: result.wave, totalScore: result.totalScore } };
}
