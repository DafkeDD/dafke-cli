import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { findAzurePipelineFiles } from "../detection/pipeline-files.js";
import { AssessmentError } from "../../utils/errors.js";

/**
 * CI/CD Maturity analyzer.
 *
 * Scoring rubric (0-5):
 *   0 = no automation
 *   1 = manual builds only
 *   2 = some CI detected
 *   3 = automated pipeline with tests + lint on PRs
 *   4 = + SAST/DAST + deploy gates
 *   5 = self-healing CD (canary/rollback automation)
 */

const PIPELINE_LOCATIONS = [
  { dir: ".github/workflows", glob: true },
  { file: "Jenkinsfile" },
  { file: ".gitlab-ci.yml" },
] as const;

const TEST_KEYWORDS = ["test", "jest", "vitest", "mocha", "pytest", "dotnet test", "mvn test", "gradle test"];
const LINT_KEYWORDS = ["lint", "eslint", "prettier", "checkstyle", "ktlint", "rubocop", "flake8"];
const SAST_KEYWORDS = ["semgrep", "codeql", "sonar", "snyk", "fortify", "checkmarx"];
const DAST_KEYWORDS = ["dast", "zap", "burp", "nuclei"];
const DEPLOY_KEYWORDS = ["deploy", "release", "publish"];
const SELFHEAL_KEYWORDS = ["canary", "rollback", "self-healing", "auto-revert", "blue-green", "progressive"];

async function fileExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readPipelineFiles(repoRoot: string): Promise<{ name: string; content: string }[]> {
  const results: { name: string; content: string }[] = [];

  for (const loc of PIPELINE_LOCATIONS) {
    if ("dir" in loc && loc.dir) {
      const dirPath = join(repoRoot, loc.dir);
      if (await dirExists(dirPath)) {
        const entries = await readdir(dirPath);
        for (const entry of entries) {
          if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
            const filePath = join(dirPath, entry);
            const content = await readFile(filePath, "utf-8");
            results.push({ name: `${loc.dir}/${entry}`, content });
          }
        }
      }
    }
    if ("file" in loc && loc.file) {
      const filePath = join(repoRoot, loc.file);
      if (await fileExists(filePath)) {
        const content = await readFile(filePath, "utf-8");
        results.push({ name: loc.file, content });
      }
    }
  }

  // Azure Pipelines YAML files — all filename variants, root or sub-folders.
  for (const match of findAzurePipelineFiles(repoRoot)) {
    const content = await readFile(match.absolutePath, "utf-8");
    results.push({ name: match.displayName, content });
  }

  return results;
}

function containsKeyword(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Build-tool quality plugins (Maven / Gradle)
// ---------------------------------------------------------------------------

const MAVEN_LINT_PLUGINS = [
  "maven-checkstyle-plugin",
  "maven-pmd-plugin",
  "spotbugs-maven-plugin",
  "findbugs-maven-plugin",
];
const MAVEN_SAST_PLUGINS = ["dependency-check-maven", "owasp"];
const GRADLE_LINT_PLUGINS = ["checkstyle", "pmd", "spotbugs"];

interface BuildToolSignals {
  hasLint: boolean;
  hasSast: boolean;
  sources: string[];
}

async function detectBuildToolPlugins(repoRoot: string): Promise<BuildToolSignals> {
  const result: BuildToolSignals = { hasLint: false, hasSast: false, sources: [] };

  // Check pom.xml
  const pomPath = join(repoRoot, "pom.xml");
  if (await fileExists(pomPath)) {
    const content = await readFile(pomPath, "utf-8");
    const lower = content.toLowerCase();
    for (const plugin of MAVEN_LINT_PLUGINS) {
      if (lower.includes(plugin)) {
        result.hasLint = true;
        result.sources.push(`Maven lint plugin: ${plugin} (pom.xml)`);
      }
    }
    for (const plugin of MAVEN_SAST_PLUGINS) {
      if (lower.includes(plugin)) {
        result.hasSast = true;
        result.sources.push(`Maven SAST plugin: ${plugin} (pom.xml)`);
      }
    }
  }

  // Check build.gradle / build.gradle.kts
  for (const gradleFile of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = join(repoRoot, gradleFile);
    if (await fileExists(gradlePath)) {
      const content = await readFile(gradlePath, "utf-8");
      const lower = content.toLowerCase();
      for (const plugin of GRADLE_LINT_PLUGINS) {
        if (lower.includes(plugin)) {
          result.hasLint = true;
          result.sources.push(`Gradle lint plugin: ${plugin} (${gradleFile})`);
        }
      }
    }
  }

  return result;
}

export class CicdAnalyzer implements DimensionAnalyzer {
  readonly dimension = "cicd";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const evidence: string[] = [];
      const suggestions: string[] = [];

      const pipelineFiles = await readPipelineFiles(repoRoot);

      if (pipelineFiles.length === 0) {
        return {
          dimension: this.dimension,
          score: 0,
          details: "No CI/CD pipeline configuration found.",
          evidence: ["No pipeline files detected in standard locations."],
          suggestions: [
            "Add a GitHub Actions CI pipeline (.github/workflows/ci.yml).",
            "Start with a basic build + test workflow.",
          ],
        };
      }

      evidence.push(`Found ${pipelineFiles.length} pipeline file(s): ${pipelineFiles.map((f) => f.name).join(", ")}`);

      const allContent = pipelineFiles.map((f) => f.content).join("\n");

      let hasTests = containsKeyword(allContent, TEST_KEYWORDS);
      let hasLint = containsKeyword(allContent, LINT_KEYWORDS);
      let hasSast = containsKeyword(allContent, SAST_KEYWORDS);
      let hasDast = containsKeyword(allContent, DAST_KEYWORDS);
      let hasDeploy = containsKeyword(allContent, DEPLOY_KEYWORDS);
      const hasSelfHeal = containsKeyword(allContent, SELFHEAL_KEYWORDS);

      // Augment with build tool plugins (pom.xml, build.gradle)
      const buildToolSignals = await detectBuildToolPlugins(repoRoot);
      if (buildToolSignals.hasLint) hasLint = true;
      if (buildToolSignals.hasSast) hasSast = true;
      for (const src of buildToolSignals.sources) {
        evidence.push(src);
      }

      // Consume external cicd declarations from manifest
      const externalCicd = context?.manifest?.externalTools?.cicd ?? [];
      for (const decl of externalCicd) {
        if (decl.tool) {
          if (decl.category === "lint") hasLint = true;
          if (decl.category === "test") hasTests = true;
          if (decl.category === "sast") hasSast = true;
          if (decl.category === "dast") hasDast = true;
          if (decl.category === "deploy") hasDeploy = true;
          evidence.push(`${decl.tool} (${decl.category ?? "general"}) [declared]`);
        }
      }

      if (hasTests) evidence.push("Test step detected in pipeline.");
      if (hasLint) evidence.push("Lint step detected in pipeline.");
      if (hasSast) evidence.push("SAST/security scanning detected in pipeline.");
      if (hasDast) evidence.push("DAST scanning detected in pipeline.");
      if (hasDeploy) evidence.push("Deployment step detected in pipeline.");
      if (hasSelfHeal) evidence.push("Self-healing/canary deployment detected.");

      let score: number;

      if (hasSelfHeal && hasDeploy && hasSast) {
        score = 5;
      } else if (hasSast && hasDeploy && hasTests) {
        score = 4;
      } else if (hasTests && hasLint) {
        score = 3;
      } else if (hasTests || hasLint) {
        score = 2;
      } else {
        score = 1;
      }

      if (!hasTests) suggestions.push("Add automated tests to your CI pipeline.");
      if (!hasLint) suggestions.push("Add linting to your CI pipeline.");
      if (score < 4 && !hasSast) suggestions.push("Add SAST scanning (e.g. Semgrep, CodeQL) to your pipeline.");
      if (score < 4 && !hasDeploy) suggestions.push("Add automated deployment gates.");
      if (score < 5 && !hasSelfHeal) suggestions.push("Consider canary deployments or auto-rollback for self-healing CD.");

      const details =
        score >= 4
          ? "Mature CI/CD pipeline with security and deployment gates."
          : score === 3
            ? "Good CI pipeline with tests and linting."
            : score === 2
              ? "Basic CI pipeline detected but incomplete (missing tests or lint)."
              : "Pipeline files found but minimal automation configured.";

      const detectedSources = [
        hasTests ? "tests" : null,
        hasLint ? "lint" : null,
        hasSast ? "SAST" : null,
        hasDast ? "DAST" : null,
        hasDeploy ? "deploy" : null,
        hasSelfHeal ? "self-healing" : null,
      ].filter(Boolean).join(", ") || "none";
      const scoringRationale = `Score ${score}/5. Detected: ${detectedSources}. ` +
        (score < 5 ? `To reach ${Math.min(score + 1, 5)}: ${suggestions[0] ?? "add more automation"}.` : "Fully mature pipeline.");

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze CI/CD maturity: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }
}
