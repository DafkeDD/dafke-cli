import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { ConfigManager } from "../../core/config/config-manager.js";
import { AssessmentEngine } from "../../core/analyzer/assessment-engine.js";
import { CicdAnalyzer } from "../../core/analyzer/cicd-analyzer.js";
import { CoverageAnalyzer } from "../../core/analyzer/coverage-analyzer.js";
import { SecurityAnalyzer } from "../../core/analyzer/security-analyzer.js";
import { ReviewAnalyzer } from "../../core/analyzer/review-analyzer.js";
import { DoraAnalyzer } from "../../core/analyzer/dora-analyzer.js";
import { DocsAnalyzer } from "../../core/analyzer/docs-analyzer.js";
import { SonarQubeClient } from "../../integrations/sonarqube/client.js";
import type { AnalyzerContext } from "../../core/analyzer/dimension-analyzer.js";
import type { AssessmentResult } from "../../core/analyzer/assessment-engine.js";
import type { ReadinessScores } from "../../core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  cicd: "CI/CD Maturity",
  coverage: "Test Coverage",
  security: "Security Pipeline",
  review: "Code Review Culture",
  dora: "DORA Metrics",
  docs: "Documentation",
};

const HARD_GATES: ReadonlyArray<keyof ReadinessScores> = ["cicd", "security"];
const HARD_GATE_THRESHOLD = 3;

function scoreColor(score: number): (text: string) => string {
  if (score >= 4) return chalk.green;
  if (score >= 3) return chalk.yellow;
  return chalk.red;
}

function scoreBar(score: number): string {
  const filled = "█".repeat(score);
  const empty = "░".repeat(5 - score);
  return scoreColor(score)(`${filled}${empty}`);
}

function priorityColor(priority: string): (text: string) => string {
  switch (priority) {
    case "critical": return chalk.bgRed.white;
    case "high": return chalk.red;
    case "medium": return chalk.yellow;
    default: return chalk.dim;
  }
}

function waveLabel(wave: string): string {
  switch (wave) {
    case "wave1": return chalk.green.bold("Wave 1 — Ready for AI-assisted development");
    case "wave2": return chalk.yellow.bold("Wave 2 — Needs minor improvements");
    case "wave3": return chalk.red.bold("Wave 3 — Significant gaps to address");
    default: return chalk.dim(wave);
  }
}

function displayTextFormat(result: AssessmentResult): void {
  console.log();
  console.log(chalk.bold.hex("#6366f1")("  Readiness Assessment Results"));
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();

  // Score table
  console.log(chalk.bold("  Dimension                Score   Bar"));
  console.log(chalk.dim("  " + "─".repeat(50)));

  const dimensions = Object.keys(result.scores) as (keyof ReadinessScores)[];
  for (const dim of dimensions) {
    const score = result.scores[dim];
    const label = (DIMENSION_LABELS[dim] ?? dim).padEnd(22);
    const isHardGate = (HARD_GATES as readonly string[]).includes(dim);
    const gate = isHardGate && score < HARD_GATE_THRESHOLD ? chalk.red(" ⚠ GATE") : "";
    console.log(`  ${label} ${scoreColor(score)(String(score) + "/5")}   ${scoreBar(score)}${gate}`);
  }

  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log(`  ${chalk.bold("Total:")} ${result.totalScore}/30`);
  console.log();

  // Wave assignment
  console.log(`  ${chalk.bold("Wave Assignment:")} ${waveLabel(result.wave)}`);
  console.log();

  // Improvement plan
  if (result.improvementPlan.length > 0) {
    console.log(chalk.bold("  Improvement Plan"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    for (const action of result.improvementPlan) {
      const pColor = priorityColor(action.priority);
      const pLabel = pColor(` ${action.priority.toUpperCase()} `);
      const dimLabel = DIMENSION_LABELS[action.dimension] ?? action.dimension;
      console.log(`  ${pLabel} ${chalk.bold(dimLabel)} (${action.currentScore} → ${action.targetScore})`);
      console.log(`    ${action.action}`);
      console.log(chalk.dim(`    Estimated: ${action.estimatedTime}`));
      console.log();
    }
  }
}

function displayTableFormat(result: AssessmentResult): void {
  console.log();
  const header = `${"Dimension".padEnd(22)} ${"Score".padEnd(6)} ${"Wave".padEnd(8)} ${"Priority Action"}`;
  console.log(chalk.bold(header));
  console.log("─".repeat(70));

  const dimensions = Object.keys(result.scores) as (keyof ReadinessScores)[];
  for (const dim of dimensions) {
    const score = result.scores[dim];
    const label = (DIMENSION_LABELS[dim] ?? dim).padEnd(22);
    const action = result.improvementPlan.find((a) => a.dimension === dim);
    const actionText = action ? `[${action.priority}] ${action.action.slice(0, 40)}` : chalk.green("OK");
    console.log(`${label} ${scoreColor(score)((score + "/5").padEnd(6))} ${result.wave.padEnd(8)} ${actionText}`);
  }

  console.log("─".repeat(70));
  console.log(`${"Total".padEnd(22)} ${String(result.totalScore + "/30").padEnd(6)} ${waveLabel(result.wave)}`);
  console.log();
}

function displayDimensionDetail(result: AssessmentResult, dimension: string): void {
  const dimResult = result.dimensionResults.find((d) => d.dimension === dimension);
  if (!dimResult) {
    console.error(chalk.red(`  Unknown dimension: ${dimension}`));
    console.log(`  Available: ${Object.keys(DIMENSION_LABELS).join(", ")}`);
    process.exit(1);
  }

  const key = dimension as keyof ReadinessScores;
  const score = result.scores[key];

  console.log();
  console.log(chalk.bold.hex("#6366f1")(`  ${DIMENSION_LABELS[dimension] ?? dimension} — Detailed Report`));
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();
  console.log(`  ${chalk.bold("Score:")} ${scoreColor(score ?? 0)(`${score}/5`)}  ${scoreBar(score ?? 0)}`);
  console.log(`  ${chalk.bold("Summary:")} ${dimResult.details}`);
  console.log();

  if (dimResult.evidence.length > 0) {
    console.log(chalk.bold("  Evidence:"));
    for (const ev of dimResult.evidence) {
      console.log(`    ${chalk.green("●")} ${ev}`);
    }
    console.log();
  }

  if (dimResult.suggestions.length > 0) {
    console.log(chalk.bold("  Suggestions:"));
    for (const sug of dimResult.suggestions) {
      console.log(`    ${chalk.yellow("→")} ${sug}`);
    }
    console.log();
  }

  if (dimResult.scoringRationale) {
    console.log(chalk.bold("  Scoring Rationale:"));
    console.log(`    ${dimResult.scoringRationale}`);
    console.log();
  }

  const action = result.improvementPlan.find((a) => a.dimension === dimension);
  if (action) {
    console.log(chalk.bold("  Next Action:"));
    console.log(`    ${priorityColor(action.priority)(` ${action.priority.toUpperCase()} `)} ${action.action}`);
    console.log(chalk.dim(`    Target: ${action.currentScore} → ${action.targetScore}  |  Estimated: ${action.estimatedTime}`));
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "audit",
    description: "Run readiness assessment against 6 dimensions",
  },
  args: {
    format: {
      type: "string",
      description: "Output format (json, text, table)",
      default: "text",
    },
    dimension: {
      type: "string",
      description: "Specific dimension to assess",
    },
    override: {
      type: "string",
      description: "Override dimension scores (e.g. cicd=5,security=4). Useful when a dimension cannot be auto-detected.",
    },
    explain: {
      type: "boolean",
      description: "Show scoring rationale for each dimension",
      default: false,
    },
    deep: {
      type: "boolean",
      description: "Run AI-powered deep analysis (requires Claude Code CLI)",
      default: false,
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const configManager = new ConfigManager();

    const format = args.format as string;

    // Load manifest (optional — audit works without one)
    const manifest = await configManager.loadManifest(repoRoot);
    if (!manifest && format !== "json") {
      console.log(chalk.dim("  No .dafke/manifest.yaml found — running standalone assessment."));
      console.log(chalk.dim("  Run `dafke init` to persist results.\n"));
    }

    // Build analyzer context from config + manifest
    const globalConfig = await configManager.loadGlobalConfig();

    let sonarqubeClient: SonarQubeClient | undefined;
    const sqAuth = globalConfig?.auth?.sonarqube;
    if (sqAuth?.token && sqAuth?.serverUrl) {
      sonarqubeClient = new SonarQubeClient({
        baseUrl: sqAuth.serverUrl,
        token: sqAuth.token,
      });
    }

    const analyzerContext: AnalyzerContext = {
      repoRoot,
      manifest: manifest ?? undefined,
      globalConfig: globalConfig ?? undefined,
      sonarqubeClient,
    };

    // Load rules for threshold customization
    const rules = await configManager.loadRules(repoRoot);

    // Create assessment engine with all 6 analyzers
    const engine = new AssessmentEngine([
      new CicdAnalyzer(),
      new CoverageAnalyzer(),
      new SecurityAnalyzer(),
      new ReviewAnalyzer(),
      new DoraAnalyzer(),
      new DocsAnalyzer(),
    ]);

    // Run assessment with context
    const result = await engine.assess(repoRoot, rules ?? undefined, analyzerContext);

    // Apply manual overrides (e.g. --override cicd=5,security=4)
    const overrideArg = args.override as string | undefined;
    if (overrideArg) {
      const validDimensions = Object.keys(result.scores);
      for (const pair of overrideArg.split(",")) {
        const [key, val] = pair.split("=").map((s) => s.trim());
        if (key && val && validDimensions.includes(key)) {
          const score = Math.min(5, Math.max(0, parseInt(val, 10)));
          if (!isNaN(score)) {
            (result.scores as Record<string, number>)[key] = score;
            // Recalculate total
            result.totalScore = Object.values(result.scores).reduce((a, b) => a + b, 0);
            // Remove from improvement plan
            result.improvementPlan = result.improvementPlan.filter((a) => a.dimension !== key);
          }
        }
      }
      // Reassign wave based on updated scores
      const hgMet = HARD_GATES.every((g) => result.scores[g] >= HARD_GATE_THRESHOLD);
      if (hgMet && result.totalScore >= 20) result.wave = "wave1";
      else if (hgMet && result.totalScore >= 12) result.wave = "wave2";
      else result.wave = "wave3";

      if (format !== "json") {
        console.log(chalk.cyan("  Score overrides applied: " + overrideArg));
        console.log();
      }
    }

    // Display based on format
    const dimension = args.dimension as string | undefined;
    const explain = args["explain"] as boolean;

    if (dimension) {
      displayDimensionDetail(result, dimension);
    } else if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === "table") {
      displayTableFormat(result);
    } else {
      displayTextFormat(result);
    }

    // Show scoring rationale when --explain is set
    if (explain && !dimension && format !== "json") {
      console.log(chalk.bold("  Scoring Rationale"));
      console.log(chalk.dim("  " + "─".repeat(50)));
      for (const dimResult of result.dimensionResults) {
        if (dimResult.scoringRationale) {
          const label = DIMENSION_LABELS[dimResult.dimension] ?? dimResult.dimension;
          console.log(`  ${chalk.bold(label)}: ${dimResult.scoringRationale}`);
        }
      }
      console.log();
    }

    // Deep analysis (optional, requires Claude Code CLI)
    const deep = args["deep"] as boolean;
    if (deep) {
      const { shouldUseClaudeAI } = await import("../../utils/claude-cli.js");
      const claudeCheck = await shouldUseClaudeAI(false);
      if (claudeCheck.available) {
        const { runDeepAnalysis } = await import("../../core/analyzer/deep-analyzer.js");
        p.log.info("Running AI-powered deep analysis...");
        const deepResult = await runDeepAnalysis(repoRoot, manifest?.techStack ?? "unknown");
        if (deepResult) {
          console.log();
          console.log(chalk.bold("  AI-Powered Analysis") + chalk.dim(` (sampled ${deepResult.sampledFiles.length} files)`));
          console.log(chalk.dim("  " + "\u2500".repeat(40)));
          console.log(`    Code Complexity:     ${deepResult.codeComplexity}`);
          console.log(`    Error Handling:      ${deepResult.errorHandlingQuality}`);
          console.log(`    Type Safety:         ${deepResult.typeSafety}`);
          if (deepResult.qualitativeNotes.length > 0) {
            console.log();
            console.log(chalk.bold("  Notes:"));
            for (const note of deepResult.qualitativeNotes) {
              console.log(`    - ${note}`);
            }
          }
          console.log();
        } else {
          p.log.warn("Deep analysis could not produce results.");
        }
      } else {
        p.log.warn(`Deep analysis unavailable: ${claudeCheck.reason}`);
      }
    } else if (format !== "json") {
      console.log(chalk.dim("  Run with --deep for AI-powered qualitative analysis"));
    }

    // Save scores to manifest if one exists
    if (manifest) {
      manifest.readinessScores = result.scores;
      manifest.wave = result.wave;
      manifest.lastAudit = new Date().toISOString();
      await configManager.saveManifest(manifest, repoRoot);
    }

    // Check hard gates
    const hardGatesFailed = HARD_GATES.some(
      (gate) => result.scores[gate] < HARD_GATE_THRESHOLD,
    );

    // Actionable next steps (only in text format, not JSON)
    if (format !== "json" && !dimension) {
      if (hardGatesFailed) {
        console.log(chalk.red.bold("  Hard gates failed — CI/CD and Security must score >= 3"));
        console.log();
      }
      if (result.improvementPlan.length > 0) {
        console.log(chalk.dim("  Run ") + chalk.bold("dafke resolve") + chalk.dim(" to auto-fix resolvable gaps."));
        console.log(chalk.dim("  Run ") + chalk.bold("dafke audit --dimension <name>") + chalk.dim(" for detailed evidence."));
        console.log();
      }
    }

    // Exit with code 1 if hard gates fail (after printing next steps)
    if (hardGatesFailed) {
      process.exit(1);
    }
  },
});
