import { defineCommand } from "citty";
import chalk from "chalk";
import { ConfigManager } from "../../core/config/config-manager.js";
import { printCompactBanner } from "../../utils/banner.js";
import { VERSION } from "../../index.js";
import type { ReadinessScores, RepoManifest } from "../../core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  cicd: "CI/CD Maturity",
  coverage: "Test Coverage",
  security: "Security Pipeline",
  review: "Code Review",
  dora: "DORA Metrics",
  docs: "Documentation",
};

function scoreColor(score: number): (text: string) => string {
  if (score >= 4) return chalk.green;
  if (score >= 3) return chalk.yellow;
  return chalk.red;
}

function scoreBar(score: number, width: number = 20): string {
  const filled = Math.round((score / 5) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return scoreColor(score)(bar);
}

function trafficLight(status: "green" | "yellow" | "red"): string {
  switch (status) {
    case "green": return chalk.green("●");
    case "yellow": return chalk.yellow("●");
    case "red": return chalk.red("●");
  }
}

function waveLabel(wave: string | undefined): string {
  switch (wave) {
    case "wave1": return chalk.green.bold("Wave 1");
    case "wave2": return chalk.yellow.bold("Wave 2");
    case "wave3": return chalk.red.bold("Wave 3");
    default: return chalk.dim("Not assessed");
  }
}

function getAdoptionStatus(scores: ReadinessScores): {
  activationRate: "green" | "yellow" | "red";
  dailyUsage: "green" | "yellow" | "red";
  aiShareTier: "green" | "yellow" | "red";
} {
  const avgScore = (scores.cicd + scores.coverage + scores.security + scores.review + scores.dora + scores.docs) / 6;
  return {
    activationRate: avgScore >= 3.5 ? "green" : avgScore >= 2 ? "yellow" : "red",
    dailyUsage: avgScore >= 3 ? "green" : avgScore >= 2 ? "yellow" : "red",
    aiShareTier: scores.cicd >= 3 && scores.security >= 3 ? "green" : scores.cicd >= 2 ? "yellow" : "red",
  };
}

function getQualityStatus(scores: ReadinessScores): {
  cfrTrend: "green" | "yellow" | "red";
  coveragePct: "green" | "yellow" | "red";
  prCycleTime: "green" | "yellow" | "red";
} {
  return {
    cfrTrend: scores.dora >= 3 ? "green" : scores.dora >= 2 ? "yellow" : "red",
    coveragePct: scores.coverage >= 4 ? "green" : scores.coverage >= 2 ? "yellow" : "red",
    prCycleTime: scores.review >= 3 ? "green" : scores.review >= 2 ? "yellow" : "red",
  };
}

function getExperienceStatus(scores: ReadinessScores): {
  nps: "green" | "yellow" | "red";
  trainingSatisfaction: "green" | "yellow" | "red";
} {
  const avgScore = (scores.cicd + scores.coverage + scores.security + scores.review + scores.dora + scores.docs) / 6;
  return {
    nps: avgScore >= 3.5 ? "green" : avgScore >= 2.5 ? "yellow" : "red",
    trainingSatisfaction: scores.docs >= 3 ? "green" : scores.docs >= 2 ? "yellow" : "red",
  };
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

const DIMENSION_EXPLANATIONS: Record<string, { role: string; rubric: string[] }> = {
  cicd: {
    role: "Measures CI/CD pipeline maturity — from no automation to self-healing deployments.",
    rubric: [
      "0 = No automation",
      "1 = Manual builds only",
      "2 = Some CI detected (pipeline files exist)",
      "3 = Automated pipeline with tests + lint on PRs",
      "4 = + SAST/DAST + deploy gates",
      "5 = Self-healing CD (canary/rollback automation)",
    ],
  },
  coverage: {
    role: "Measures test coverage maturity — from unmeasured to mutation-tested.",
    rubric: [
      "0 = <40% or unmeasured",
      "1 = <40% measured",
      "2 = 40-60%",
      "3 = 60-80%",
      "4 = 80-90% + PR enforcement",
      "5 = >90% + mutation testing",
    ],
  },
  security: {
    role: "Measures security scanning maturity — from no scanning to full DAST + SBOM.",
    rubric: [
      "0 = No scanning",
      "1 = Ad-hoc scanning only",
      "2 = Manual security reviews",
      "3 = SAST + secrets detection active",
      "4 = + SCA + dependency scanning",
      "5 = + DAST + SBOM generation",
    ],
  },
  review: {
    role: "Measures code review culture — from no reviews to automated first-pass.",
    rubric: [
      "0 = No reviews",
      "1 = Ad-hoc reviews",
      "2 = 1 approval required + <48h turnaround",
      "3 = Checklist + defined reviewers",
      "4 = Risk-tiered reviews + security sign-off",
      "5 = Automated first-pass + review metrics",
    ],
  },
  dora: {
    role: "Measures DORA metrics — deployment frequency and change failure rate.",
    rubric: [
      "0 = Less than quarterly releases",
      "1 = Quarterly releases",
      "2 = Quarterly + 10-15% CFR",
      "3 = Monthly + <10% CFR",
      "4 = Weekly + <5% CFR",
      "5 = On-demand + <2% CFR",
    ],
  },
  docs: {
    role: "Measures documentation completeness — from none to AI-ready.",
    rubric: [
      "0 = No documentation",
      "1 = Outdated or minimal README",
      "2 = README with meaningful content",
      "3 = README + build/test commands documented",
      "4 = + Architecture docs + API docs + onboarding",
      "5 = + CLAUDE.md + .claude/ directory configured",
    ],
  },
};

const SUCCESS_CRITERIA_EXPLANATIONS = {
  adoption: {
    title: "Adoption",
    criteria: [
      { name: "Activation Rate", description: "Average score >= 3.5 (green), >= 2 (yellow), < 2 (red)" },
      { name: "Daily Usage", description: "Average score >= 3 (green), >= 2 (yellow), < 2 (red)" },
      { name: "AI Share Tier", description: "CI/CD + Security both >= 3 (green), CI/CD >= 2 (yellow), else (red)" },
    ],
  },
  quality: {
    title: "Quality",
    criteria: [
      { name: "CFR Trend", description: "DORA score >= 3 (green), >= 2 (yellow), < 2 (red)" },
      { name: "Coverage %", description: "Coverage score >= 4 (green), >= 2 (yellow), < 2 (red)" },
      { name: "PR Cycle Time", description: "Review score >= 3 (green), >= 2 (yellow), < 2 (red)" },
    ],
  },
  experience: {
    title: "Experience",
    criteria: [
      { name: "NPS", description: "Average score >= 3.5 (green), >= 2.5 (yellow), < 2.5 (red)" },
      { name: "Training Satisfaction", description: "Docs score >= 3 (green), >= 2 (yellow), < 2 (red)" },
    ],
  },
};

function displayExplanations(): void {
  console.log();
  console.log(chalk.bold("  Dimension Scoring Guide"));
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();

  for (const [key, info] of Object.entries(DIMENSION_EXPLANATIONS)) {
    const label = DIMENSION_LABELS[key] ?? key;
    console.log(`  ${chalk.bold(label)}`);
    console.log(`  ${chalk.dim(info.role)}`);
    for (const line of info.rubric) {
      const score = parseInt(line[0] ?? "0", 10);
      console.log(`    ${scoreColor(score)(line)}`);
    }
    console.log();
  }

  console.log(chalk.bold("  Success Criteria Thresholds"));
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();
  console.log(chalk.dim("  Score colors: ") + chalk.green("green >= 4") + chalk.dim(", ") + chalk.yellow("yellow >= 3") + chalk.dim(", ") + chalk.red("red < 3"));
  console.log();

  for (const group of Object.values(SUCCESS_CRITERIA_EXPLANATIONS)) {
    console.log(`  ${chalk.bold(group.title)}`);
    for (const c of group.criteria) {
      console.log(`    ${chalk.cyan(c.name)}: ${chalk.dim(c.description)}`);
    }
    console.log();
  }
}

function getExplanationsJson(): Record<string, unknown> {
  return {
    dimensions: Object.fromEntries(
      Object.entries(DIMENSION_EXPLANATIONS).map(([key, info]) => [
        key,
        { label: DIMENSION_LABELS[key], role: info.role, rubric: info.rubric },
      ]),
    ),
    successCriteria: SUCCESS_CRITERIA_EXPLANATIONS,
    scoreThresholds: { green: ">= 4", yellow: ">= 3", red: "< 3" },
  };
}

function displayDashboard(manifest: RepoManifest): void {
  console.log();

  // Readiness Scorecard
  console.log(chalk.bold("  Readiness Scorecard"));
  console.log(chalk.dim("  " + "─".repeat(50)));

  if (manifest.readinessScores) {
    const scores = manifest.readinessScores;
    const dimensions = Object.keys(scores) as (keyof ReadinessScores)[];

    for (const dim of dimensions) {
      const score = scores[dim];
      const label = (DIMENSION_LABELS[dim] ?? dim).padEnd(20);
      console.log(`  ${label} ${scoreBar(score)} ${scoreColor(score)(`${score}/5`)}`);
    }

    const total = scores.cicd + scores.coverage + scores.security + scores.review + scores.dora + scores.docs;
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log(`  ${"Total".padEnd(20)} ${chalk.bold(`${total}/30`)}`);
  } else {
    console.log(chalk.dim("  No scores available. Run `dafke audit` first."));
  }

  console.log();

  // Wave & Audit Info
  console.log(`  ${chalk.bold("Wave:")}        ${waveLabel(manifest.wave)}`);
  console.log(`  ${chalk.bold("Last Audit:")}  ${manifest.lastAudit ? chalk.cyan(manifest.lastAudit) : chalk.dim("Never")}`);
  console.log(`  ${chalk.bold("Config v:")}    ${manifest.configSchemaVersion}  ${chalk.dim(`(dafke v${manifest.corulusCcVersion})`)}`);

  // Drift status
  const drifted = manifest.corulusCcVersion !== VERSION;
  console.log(`  ${chalk.bold("Drift:")}       ${drifted ? chalk.yellow("Version mismatch — run `dafke update`") : chalk.green("In sync")}`);
  console.log();

  // Success Criteria
  if (manifest.readinessScores) {
    const scores = manifest.readinessScores;

    // Adoption
    const adoption = getAdoptionStatus(scores);
    console.log(chalk.bold("  Success Criteria — Adoption"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log(`  ${trafficLight(adoption.activationRate)} Activation Rate`);
    console.log(`  ${trafficLight(adoption.dailyUsage)} Daily Usage`);
    console.log(`  ${trafficLight(adoption.aiShareTier)} AI Share Tier`);
    console.log();

    // Quality
    const quality = getQualityStatus(scores);
    console.log(chalk.bold("  Success Criteria — Quality"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log(`  ${trafficLight(quality.cfrTrend)} CFR Trend`);
    console.log(`  ${trafficLight(quality.coveragePct)} Coverage %`);
    console.log(`  ${trafficLight(quality.prCycleTime)} PR Cycle Time`);
    console.log();

    // Experience
    const experience = getExperienceStatus(scores);
    console.log(chalk.bold("  Success Criteria — Experience"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log(`  ${trafficLight(experience.nps)} NPS`);
    console.log(`  ${trafficLight(experience.trainingSatisfaction)} Training Satisfaction`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "status",
    description: "Dashboard of current repo readiness",
  },
  args: {
    format: {
      type: "string",
      description: "Output format (json, text)",
      default: "text",
    },
    explain: {
      type: "boolean",
      description: "Show dimension definitions and scoring criteria",
      default: false,
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const configManager = new ConfigManager();

    const manifest = await configManager.loadManifest(repoRoot);

    const format = args.format as string;
    const explain = args.explain as boolean;

    // --explain without manifest: still show definitions
    if (!manifest && explain) {
      if (format === "json") {
        console.log(JSON.stringify(getExplanationsJson(), null, 2));
      } else {
        printCompactBanner(VERSION);
        console.log();
        console.log(chalk.yellow("  No .dafke/manifest.yaml found."));
        console.log(chalk.dim("  Run `dafke init` to initialize this repository."));
        displayExplanations();
      }
      return;
    }

    if (!manifest) {
      console.log();
      console.log(chalk.yellow("  No .dafke/manifest.yaml found."));
      console.log(chalk.dim("  Run `dafke init` to initialize this repository."));
      console.log();
      return;
    }

    if (format === "json") {
      const json: Record<string, unknown> = {
        version: manifest.corulusCcVersion,
        configSchemaVersion: manifest.configSchemaVersion,
        techStack: manifest.techStack,
        wave: manifest.wave ?? null,
        lastAudit: manifest.lastAudit ?? null,
        scores: manifest.readinessScores ?? null,
      };
      if (explain) {
        json["explanations"] = getExplanationsJson();
      }
      console.log(JSON.stringify(json, null, 2));
      return;
    }

    // Text format — full dashboard
    printCompactBanner(VERSION);
    displayDashboard(manifest);

    if (explain) {
      displayExplanations();
    }
  },
});
