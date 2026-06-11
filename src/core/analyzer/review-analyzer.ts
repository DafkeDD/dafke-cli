import { readFile, stat as fsStat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { AssessmentError } from "../../utils/errors.js";

/**
 * Code Review Culture analyzer.
 *
 * Scoring rubric (0-5):
 *   0 = no reviews
 *   1 = ad-hoc reviews
 *   2 = 1 approval required + <48h turnaround
 *   3 = checklist + defined reviewers
 *   4 = risk-tiered reviews + security sign-off
 *   5 = automated first-pass + review metrics
 */

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await fsStat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await fsStat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readFileIfExists(path: string): Promise<string | null> {
  if (await fileExists(path)) {
    return readFile(path, "utf-8");
  }
  return null;
}

interface ReviewFindings {
  hasCodeowners: boolean;
  hasCodeownersPlaceholder: boolean;
  hasPrTemplate: boolean;
  hasBranchProtection: boolean;
  hasReviewBot: boolean;
  hasReviewChecklist: boolean;
  hasSecurityReviewers: boolean;
  hasReviewMetrics: boolean;
  sources: string[];
}

async function detectReviewPractices(repoRoot: string): Promise<ReviewFindings> {
  const findings: ReviewFindings = {
    hasCodeowners: false,
    hasCodeownersPlaceholder: false,
    hasPrTemplate: false,
    hasBranchProtection: false,
    hasReviewBot: false,
    hasReviewChecklist: false,
    hasSecurityReviewers: false,
    hasReviewMetrics: false,
    sources: [],
  };

  // Check CODEOWNERS
  for (const codeownersPath of [
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "docs/CODEOWNERS",
  ]) {
    const content = await readFileIfExists(join(repoRoot, codeownersPath));
    if (content) {
      // Check for placeholder/FIXME patterns — these don't count as real CODEOWNERS
      if (content.includes("@FIXME") || content.includes("@TODO") || content.includes("@PLACEHOLDER")) {
        findings.hasCodeownersPlaceholder = true;
        findings.sources.push(`CODEOWNERS at ${codeownersPath} (contains placeholder teams — not effective)`);
        break;
      }

      findings.hasCodeowners = true;
      findings.sources.push(`CODEOWNERS at ${codeownersPath}`);

      // Check for security-specific reviewers
      const lower = content.toLowerCase();
      if (lower.includes("security") || lower.includes("sec-") || lower.includes("infosec")) {
        findings.hasSecurityReviewers = true;
        findings.sources.push("Security-specific reviewers found in CODEOWNERS.");
      }
      break;
    }
  }

  // Check PR templates
  for (const templatePath of [
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/pull_request_template.md",
    ".azuredevops/pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
    ".github/PULL_REQUEST_TEMPLATE",
  ]) {
    const content = await readFileIfExists(join(repoRoot, templatePath));
    if (content) {
      findings.hasPrTemplate = true;
      findings.sources.push(`PR template at ${templatePath}`);

      // Check for checklists in the template (require at least 3 items for meaningful checklist)
      const checkboxCount = (content.match(/- \[[ x]\]/g) || []).length;
      if (checkboxCount >= 3) {
        findings.hasReviewChecklist = true;
        findings.sources.push(`Review checklist found in PR template (${checkboxCount} items).`);
      }
      break;
    }
  }

  // Check for PR template directory (multiple templates = risk-tiered)
  if (await dirExists(join(repoRoot, ".github/PULL_REQUEST_TEMPLATE"))) {
    findings.hasPrTemplate = true;
    findings.sources.push("Multiple PR templates (risk-tiered) found.");
    // Multiple templates suggests risk-tiered reviews
    findings.hasReviewChecklist = true;
  }

  // Check for branch protection heuristics in settings
  // (Cannot fully check without API, but can look for config-as-code patterns)
  const branchProtectionFiles = [
    ".github/settings.yml", // probot settings
    ".github/branch-protection.yml",
  ];
  for (const bpFile of branchProtectionFiles) {
    const content = await readFileIfExists(join(repoRoot, bpFile));
    if (content) {
      const lower = content.toLowerCase();
      if (lower.includes("protection") || lower.includes("required_pull_request_reviews") || lower.includes("require_code_owner_reviews")) {
        findings.hasBranchProtection = true;
        findings.sources.push(`Branch protection config at ${bpFile}`);
      }
    }
  }

  // Check for review bots
  const reviewBotConfigs = [
    { file: ".coderabbit.yaml", name: "CodeRabbit" },
    { file: ".coderabbit.yml", name: "CodeRabbit" },
    { file: ".github/copilot-review.yml", name: "Copilot Review" },
    { file: ".reviewbot.yml", name: "ReviewBot" },
    { file: ".prow.yaml", name: "Prow" },
    { file: "dangerfile.js", name: "Danger.js" },
    { file: "dangerfile.ts", name: "Danger.js" },
  ];
  for (const bot of reviewBotConfigs) {
    if (await fileExists(join(repoRoot, bot.file))) {
      findings.hasReviewBot = true;
      findings.sources.push(`Review bot: ${bot.name} (${bot.file})`);
    }
  }

  // Check CI for review-related automation
  const ghDir = join(repoRoot, ".github/workflows");
  if (await dirExists(ghDir)) {
    const entries = await readdir(ghDir);
    for (const entry of entries) {
      if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
        const content = await readFile(join(ghDir, entry), "utf-8");
        const lower = content.toLowerCase();
        if (lower.includes("pull_request_review") || lower.includes("auto-approve") || lower.includes("review-metrics")) {
          findings.hasReviewMetrics = true;
          findings.sources.push(`Review automation in ${entry}`);
        }
      }
    }
  }

  return findings;
}

export class ReviewAnalyzer implements DimensionAnalyzer {
  readonly dimension = "review";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const findings = await detectReviewPractices(repoRoot);

      // Consume external review practice declarations from manifest
      const externalReview = context?.manifest?.externalTools?.review ?? [];
      for (const decl of externalReview) {
        const lower = decl.practice.toLowerCase();
        if (lower.includes("approval") || lower.includes("required reviewer")) {
          findings.hasBranchProtection = true;
        }
        if (lower.includes("security review") || lower.includes("security sign-off")) {
          findings.hasSecurityReviewers = true;
        }
        if (lower.includes("checklist")) {
          findings.hasReviewChecklist = true;
        }
        if (lower.includes("codeowner") || lower.includes("code owner")) {
          findings.hasCodeowners = true;
        }
        findings.sources.push(`${decl.practice} [declared]`);
      }

      const evidence: string[] = [];
      const suggestions: string[] = [];

      if (findings.sources.length > 0) {
        for (const src of findings.sources) {
          evidence.push(src);
        }
      } else {
        evidence.push("No code review configuration detected.");
      }

      let score: number;

      if (findings.sources.length === 0) {
        score = 0;
        suggestions.push("Set up pull request reviews as a team standard.");
        suggestions.push("Add a CODEOWNERS file to define review responsibilities.");
      } else if (findings.hasReviewBot && findings.hasReviewMetrics) {
        score = 5;
      } else if (
        findings.hasCodeowners &&
        findings.hasSecurityReviewers &&
        (findings.hasBranchProtection || findings.hasReviewChecklist)
      ) {
        score = 4;
        if (!findings.hasReviewBot) {
          suggestions.push("Add an automated review bot (e.g. CodeRabbit, Danger.js) for first-pass reviews.");
        }
        if (!findings.hasReviewMetrics) {
          suggestions.push("Add review metrics tracking (turnaround time, review load balancing) to CI workflows.");
        }
        suggestions.push("Configure automated first-pass reviews and track review turnaround metrics to reach level 5.");
      } else if (findings.hasCodeowners && findings.hasReviewChecklist) {
        score = 3;
        suggestions.push("Add security-specific reviewers to CODEOWNERS for sensitive paths.");
        if (!findings.hasReviewBot) {
          suggestions.push("Consider an automated review bot for faster feedback.");
        }
      } else if (findings.hasPrTemplate || findings.hasCodeowners || findings.hasBranchProtection) {
        score = 2;
        if (!findings.hasCodeowners && findings.hasCodeownersPlaceholder) {
          suggestions.push("Update CODEOWNERS with real team handles — currently contains @FIXME placeholders.");
        } else if (!findings.hasCodeowners) {
          suggestions.push("Add a CODEOWNERS file to define reviewers.");
        }
        if (!findings.hasPrTemplate) suggestions.push("Add a PR template with a review checklist.");
        if (!findings.hasReviewChecklist && findings.hasPrTemplate) {
          suggestions.push("Add more checklist items to your PR template (at least 3 required).");
        } else if (!findings.hasReviewChecklist) {
          suggestions.push("Add a PR template with a review checklist.");
        }
      } else {
        score = 1;
        suggestions.push("Formalize code reviews with required PR approvals.");
        if (findings.hasCodeownersPlaceholder) {
          suggestions.push("Update CODEOWNERS with real team handles — currently contains @FIXME placeholders.");
        } else {
          suggestions.push("Add a CODEOWNERS file and PR template.");
        }
      }

      const details =
        score === 5
          ? "Excellent review culture with automated first-pass and metrics tracking."
          : score === 4
            ? "Risk-tiered reviews with security sign-off."
            : score === 3
              ? "Structured reviews with defined reviewers and checklists."
              : score === 2
                ? "Basic review process in place."
                : score === 1
                  ? "Ad-hoc code review practices detected."
                  : "No code review process detected.";

      const criteria = [
        `CODEOWNERS: ${findings.hasCodeowners ? "yes" : "no"}`,
        `PR template: ${findings.hasPrTemplate ? "yes" : "no"}`,
        `Branch protection: ${findings.hasBranchProtection ? "yes" : "no"}`,
        `Review checklist: ${findings.hasReviewChecklist ? "yes" : "no"}`,
        `Security reviewers: ${findings.hasSecurityReviewers ? "yes" : "no"}`,
        `Review bot: ${findings.hasReviewBot ? "yes" : "no"}`,
        `Review metrics: ${findings.hasReviewMetrics ? "yes" : "no"}`,
      ].join(". ");
      const scoringRationale = `Score ${score}/5. Criteria: ${criteria}. ` +
        (score < 5 ? `To improve: ${suggestions[0] ?? "enhance review practices"}.` : "Complete review culture.");

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze code review culture: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }
}
