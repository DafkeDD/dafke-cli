import { defineCommand } from "citty";
import chalk from "chalk";
import { ResolveEngine } from "../../core/resolver/resolve-engine.js";
import type { ResolveReport } from "../../core/resolver/resolve-engine.js";
import { CicdResolver } from "../../core/resolver/resolvers/cicd-resolver.js";
import { SecurityResolver } from "../../core/resolver/resolvers/security-resolver.js";
import { CoverageResolver } from "../../core/resolver/resolvers/coverage-resolver.js";
import { ReviewResolver } from "../../core/resolver/resolvers/review-resolver.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  cicd: "CI/CD Maturity",
  coverage: "Test Coverage",
  security: "Security Pipeline",
  review: "Code Review Culture",
};

function scoreColor(score: number): (text: string) => string {
  if (score >= 4) return chalk.green;
  if (score >= 3) return chalk.yellow;
  return chalk.red;
}

function displayTextReport(report: ResolveReport, dryRun: boolean): void {
  console.log();
  if (dryRun) {
    console.log(chalk.cyan.bold("  [DRY RUN] Resolve Preview"));
  } else {
    console.log(chalk.bold.hex("#6366f1")("  Resolve Results"));
  }
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();

  if (report.results.length === 0) {
    console.log(chalk.green("  All resolvable dimensions already meet their targets."));
    console.log();
    return;
  }

  for (const result of report.results) {
    const label = DIMENSION_LABELS[result.dimension] ?? result.dimension;
    const before = scoreColor(result.previousScore)(`${result.previousScore}/5`);
    const after = scoreColor(result.expectedScore)(`${result.expectedScore}/5`);

    console.log(`  ${chalk.bold(label)}  ${before} → ${after}`);
    console.log(chalk.dim(`    ${result.summary}`));

    for (const file of result.generatedFiles) {
      const lines = file.content.split("\n").length;
      if (file.written) {
        const action = file.existedBefore ? chalk.yellow("OVERWRITE") : chalk.green("CREATE");
        console.log(`    ${action} ${file.relativePath} (${lines} lines)`);
      } else if (file.skipReason) {
        console.log(`    ${chalk.dim("SKIP")}    ${file.relativePath} — ${chalk.dim(file.skipReason)}`);
      } else {
        const action = file.existedBefore ? chalk.yellow("WOULD OVERWRITE") : chalk.cyan("WOULD CREATE");
        console.log(`    ${action} ${file.relativePath} (${lines} lines)`);
      }
    }

    console.log();
  }

  // Summary
  console.log(chalk.dim("  " + "─".repeat(50)));
  const beforeTotal = scoreColor(report.previousTotalScore)(`${report.previousTotalScore}/30`);
  const afterTotal = scoreColor(report.expectedTotalScore)(`${report.expectedTotalScore}/30`);
  console.log(`  ${chalk.bold("Score:")} ${beforeTotal} → ${afterTotal}`);

  if (dryRun) {
    const wouldCreate = report.results.reduce(
      (sum, r) => sum + r.generatedFiles.filter((f) => !f.skipReason).length,
      0,
    );
    console.log(`  ${chalk.bold("Files:")} ${wouldCreate} would be created`);
  } else {
    console.log(`  ${chalk.bold("Files:")} ${report.totalFilesGenerated} generated, ${report.totalFilesSkipped} skipped`);
  }

  // Warnings
  if (report.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow.bold("  Warnings:"));
    for (const warning of report.warnings) {
      console.log(`  ${chalk.yellow("⚠")} ${warning}`);
    }
  }

  console.log();

  if (dryRun) {
    console.log(chalk.dim("  Run without --dry-run to apply changes."));
  } else if (report.totalFilesGenerated > 0) {
    console.log(chalk.dim("  Run ") + chalk.bold("dafke audit") + chalk.dim(" to verify improvements."));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "resolve",
    description: "Auto-fix readiness gaps by generating configuration files",
  },
  args: {
    dimension: {
      type: "string",
      description: "Specific dimension to resolve (cicd, security, coverage, review)",
    },
    "dry-run": {
      type: "boolean",
      description: "Preview what would be generated without writing files",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing files",
      default: false,
    },
    format: {
      type: "string",
      description: "Output format (text, json)",
      default: "text",
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const dryRun = args["dry-run"] as boolean;
    const force = args.force as boolean;
    const format = args.format as string;
    const dimension = args.dimension as string | undefined;

    // Build resolver list (order matters: cicd first)
    const resolvers = [
      new CicdResolver(),
      new SecurityResolver(),
      new CoverageResolver(),
      new ReviewResolver(),
    ];

    const engine = new ResolveEngine(resolvers);

    const dimensions = dimension ? dimension.split(",").map((d) => d.trim()) : undefined;

    const report = await engine.resolve({
      repoRoot,
      dimensions,
      dryRun,
      force,
    });

    if (format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      displayTextReport(report, dryRun);
    }
  },
});
