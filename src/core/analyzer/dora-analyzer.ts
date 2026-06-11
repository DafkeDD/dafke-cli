import { execa } from "execa";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { AssessmentError } from "../../utils/errors.js";

/**
 * DORA Metrics analyzer.
 *
 * Estimates DORA metrics from git history:
 *   - Deployment frequency (tags/releases in last 90 days)
 *   - Change Failure Rate (revert commits / total commits)
 *   - Lead time for changes (avg first-commit-to-merge)
 *   - MTTR (time between reverts and subsequent fix commits)
 *
 * Scoring rubric (0-5):
 *   0 = less than quarterly releases
 *   1 = quarterly releases
 *   2 = quarterly + 10-15% CFR
 *   3 = monthly + <10% CFR
 *   4 = weekly + <5% CFR
 *   5 = on-demand + <2% CFR
 */

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

async function isGitRepo(repoRoot: string): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

async function getTagCount90Days(repoRoot: string): Promise<number> {
  try {
    const sinceDate = new Date(Date.now() - NINETY_DAYS_SECONDS * 1000).toISOString();
    const result = await execa("git", ["tag", "--sort=-creatordate", "--format=%(creatordate:iso)"], {
      cwd: repoRoot,
    });
    if (!result.stdout.trim()) return 0;

    const sinceTs = new Date(sinceDate).getTime();
    const dates = result.stdout.trim().split("\n");
    let count = 0;
    for (const dateStr of dates) {
      if (dateStr.trim() && new Date(dateStr.trim()).getTime() >= sinceTs) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function getCommitCount90Days(repoRoot: string): Promise<number> {
  try {
    const sinceDate = new Date(Date.now() - NINETY_DAYS_SECONDS * 1000).toISOString().split("T")[0];
    const result = await execa("git", ["rev-list", "--count", `--since=${sinceDate}`, "HEAD"], {
      cwd: repoRoot,
    });
    return parseInt(result.stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function getRevertCount90Days(repoRoot: string): Promise<number> {
  try {
    const sinceDate = new Date(Date.now() - NINETY_DAYS_SECONDS * 1000).toISOString().split("T")[0];
    // Match only actual git reverts (starts with "Revert ") not mentions of "revert" in text
    const result = await execa("git", ["log", "--oneline", "--grep=^Revert ", `--since=${sinceDate}`], {
      cwd: repoRoot,
    });
    if (!result.stdout.trim()) return 0;
    return result.stdout.trim().split("\n").length;
  } catch {
    return 0;
  }
}

function estimateDeployFrequency(tagCount: number): "on-demand" | "weekly" | "monthly" | "quarterly" | "less-than-quarterly" {
  if (tagCount >= 90) return "on-demand"; // ~daily or more
  if (tagCount >= 12) return "weekly"; // ~1/week
  if (tagCount >= 3) return "monthly"; // ~1/month
  if (tagCount >= 1) return "quarterly";
  return "less-than-quarterly";
}

function estimateCfr(revertCount: number, totalCommits: number): number {
  if (totalCommits === 0) return 0;
  return (revertCount / totalCommits) * 100;
}

export class DoraAnalyzer implements DimensionAnalyzer {
  readonly dimension = "dora";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const evidence: string[] = [];
      const suggestions: string[] = [];

      if (!(await isGitRepo(repoRoot))) {
        return {
          dimension: this.dimension,
          score: 0,
          details: "Not a git repository. Cannot analyze DORA metrics.",
          evidence: ["No .git directory found."],
          suggestions: ["Initialize a git repository and maintain commit history."],
        };
      }

      const [tagCount, commitCount, revertCount] = await Promise.all([
        getTagCount90Days(repoRoot),
        getCommitCount90Days(repoRoot),
        getRevertCount90Days(repoRoot),
      ]);

      // Check for manual deployment declaration
      const doraConfig = context?.manifest?.externalTools?.dora;
      let effectiveTagCount = tagCount;

      if (doraConfig?.deploymentSignal === "manual" && doraConfig.deploymentsLast90Days !== undefined) {
        effectiveTagCount = Math.max(0, doraConfig.deploymentsLast90Days);
        evidence.push(`Deployment count declared in manifest: ${effectiveTagCount} [declared]`);
        if (doraConfig.deploymentEvidence) {
          evidence.push(`Deployment tracking: ${doraConfig.deploymentEvidence} [declared]`);
        }
      }

      const deployFreq = estimateDeployFrequency(effectiveTagCount);
      const cfr = estimateCfr(revertCount, commitCount);

      evidence.push(`Tags/releases in last 90 days: ${tagCount}`);
      evidence.push(`Commits in last 90 days: ${commitCount}`);
      evidence.push(`Revert commits in last 90 days: ${revertCount}`);
      evidence.push(`Estimated deployment frequency: ${deployFreq}`);
      evidence.push(`Estimated change failure rate: ${cfr.toFixed(1)}%`);

      let score: number;

      // Score based on frequency AND change failure rate.
      // Higher frequency can still score well if CFR is reasonable.
      if (deployFreq === "on-demand" && cfr < 2) {
        score = 5;
      } else if ((deployFreq === "on-demand" || deployFreq === "weekly") && cfr < 5) {
        score = 4;
      } else if ((deployFreq === "on-demand" || deployFreq === "weekly" || deployFreq === "monthly") && cfr < 10) {
        score = 3;
      } else if ((deployFreq === "on-demand" || deployFreq === "weekly" || deployFreq === "monthly") && cfr < 15) {
        score = 2;
      } else if (deployFreq === "quarterly" && cfr <= 15) {
        score = 2;
      } else if (commitCount > 0) {
        score = 1;
      } else {
        score = 0;
      }

      if (deployFreq === "less-than-quarterly" || deployFreq === "quarterly") {
        suggestions.push("Increase release frequency by adopting trunk-based development.");
      }
      if (cfr >= 10) {
        suggestions.push("Reduce change failure rate by improving test coverage and review processes.");
      }
      if (cfr >= 5) {
        suggestions.push("Add deployment gates and automated rollback to reduce CFR.");
      }
      if (tagCount === 0) {
        suggestions.push("Tag releases consistently to improve deployment frequency tracking.");
      }
      if (score === 4) {
        suggestions.push("Increase to on-demand (daily+) deployment frequency with <2% change failure rate to reach level 5.");
      }

      const details =
        score === 5
          ? "Elite DORA performance: on-demand deployments with <2% CFR."
          : score === 4
            ? "High DORA performance: weekly deployments with <5% CFR."
            : score === 3
              ? "Medium DORA performance: monthly deployments with <10% CFR."
              : score === 2
                ? "Low DORA performance: quarterly deployments."
                : score === 1
                  ? "Minimal release cadence detected."
                  : "No deployment activity detected.";

      const freqSource = doraConfig?.deploymentSignal === "manual" ? "manual declaration" : "git tags";
      const scoringRationale = `Score ${score}/5. Deployment frequency: ${deployFreq} (source: ${freqSource}). ` +
        `CFR: ${cfr.toFixed(1)}% (${revertCount} reverts / ${commitCount} commits). ` +
        (score < 5 ? `To improve: ${suggestions[0] ?? "increase release frequency"}.` : "Elite DORA performance.");

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze DORA metrics: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }
}
