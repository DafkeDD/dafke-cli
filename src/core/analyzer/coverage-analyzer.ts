import { readFile, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { readPipelineContent } from "../detection/pipeline-content.js";
import { AssessmentError } from "../../utils/errors.js";

/**
 * Code Coverage analyzer.
 *
 * Scoring rubric (0-5):
 *   0 = <40% or unmeasured
 *   1 = <40% measured
 *   2 = 40-60%
 *   3 = 60-80%
 *   4 = 80-90% + PR enforcement
 *   5 = >90% + mutation testing
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

interface CoverageFindings {
  hasCoverageConfig: boolean;
  hasCoverageReports: boolean;
  hasEnforcement: boolean;
  hasMutationTesting: boolean;
  detectedPercentage: number | null;
  configSources: string[];
}

async function detectCoverageConfig(repoRoot: string): Promise<CoverageFindings> {
  const findings: CoverageFindings = {
    hasCoverageConfig: false,
    hasCoverageReports: false,
    hasEnforcement: false,
    hasMutationTesting: false,
    detectedPercentage: null,
    configSources: [],
  };

  // Check package.json for coverage config (narrow to scripts and config sections, not devDep names)
  const pkgJson = await readFileIfExists(join(repoRoot, "package.json"));
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      // Check scripts for coverage-related commands
      const scripts = JSON.stringify(pkg.scripts || {}).toLowerCase();
      if (scripts.includes("coverage") || scripts.includes("c8") || scripts.includes("istanbul") || scripts.includes("nyc")) {
        findings.hasCoverageConfig = true;
        findings.configSources.push("package.json (coverage scripts)");
      }
      // Check for explicit coverage/jest/vitest config sections
      if (pkg.c8 || pkg.nyc || pkg.jest?.coverageThreshold || pkg.jest?.collectCoverage) {
        findings.hasCoverageConfig = true;
        findings.configSources.push("package.json (coverage config)");
      }
      // Check for coverage thresholds in config sections
      const configStr = JSON.stringify(pkg.jest || pkg.c8 || pkg.nyc || {}).toLowerCase();
      if (configStr.includes("threshold") || configStr.includes("coveragethreshold")) {
        findings.hasEnforcement = true;
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  // Check vitest/jest configs
  for (const configFile of [
    "vitest.config.ts", "vitest.config.js", "vitest.config.mts",
    "jest.config.ts", "jest.config.js", "jest.config.mjs",
  ]) {
    const content = await readFileIfExists(join(repoRoot, configFile));
    if (content) {
      const lower = content.toLowerCase();
      if (lower.includes("coverage")) {
        findings.hasCoverageConfig = true;
        findings.configSources.push(configFile);
      }
      if (lower.includes("threshold")) {
        findings.hasEnforcement = true;
      }
      // Try to detect threshold percentage
      const thresholdMatch = content.match(/(?:branches|functions|lines|statements)\s*:\s*(\d+)/);
      if (thresholdMatch?.[1]) {
        findings.detectedPercentage = parseInt(thresholdMatch[1], 10);
      }
    }
  }

  // Check for JaCoCo (Java/Maven)
  const pomXml = await readFileIfExists(join(repoRoot, "pom.xml"));
  if (pomXml) {
    const lower = pomXml.toLowerCase();
    if (lower.includes("jacoco")) {
      findings.hasCoverageConfig = true;
      findings.configSources.push("pom.xml (JaCoCo)");
      if (lower.includes("minimum")) {
        findings.hasEnforcement = true;
      }
    }
  }

  // Check for Coverlet (.NET)
  // Check for a common pattern: coverlet in any .csproj-like file
  const coverletConfig = await readFileIfExists(join(repoRoot, "coverlet.runsettings"));
  if (coverletConfig) {
    findings.hasCoverageConfig = true;
    findings.configSources.push("coverlet.runsettings");
  }

  // Detect SonarQube/SonarCloud configuration (even without live client)
  for (const sonarFile of ["sonar-project.properties", ".sonarcloud.properties"]) {
    const sonarContent = await readFileIfExists(join(repoRoot, sonarFile));
    if (sonarContent && !findings.hasCoverageConfig) {
      findings.hasCoverageConfig = true;
      findings.configSources.push(`${sonarFile} (SonarQube/SonarCloud)`);
      const sonarLower = sonarContent.toLowerCase();
      if (sonarLower.includes("qualitygate") || sonarLower.includes("coverage")) {
        findings.hasEnforcement = true;
        findings.configSources.push("SonarQube quality gate detected in config");
      }
    }
  }

  // Detect SonarQube/SonarCloud enforcement in CI pipelines
  const pipelineContent = await readPipelineContent(repoRoot);
  const pipelineLower = pipelineContent.toLowerCase();
  if (
    !findings.hasEnforcement &&
    (pipelineLower.includes("sonar-scanner") ||
      pipelineLower.includes("sonar:sonar") ||
      pipelineLower.includes("sonarqube") ||
      pipelineLower.includes("sonarcloud"))
  ) {
    if (!findings.hasCoverageConfig) {
      findings.hasCoverageConfig = true;
    }
    findings.hasEnforcement = true;
    findings.configSources.push("SonarQube/SonarCloud step in CI pipeline");
  }

  // Check for coverage reports (must be recent — within last 30 days)
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const reportPaths = [
    "coverage",
    "coverage/lcov.info",
    "lcov.info",
    "coverage/cobertura.xml",
    "cobertura.xml",
  ];
  for (const rp of reportPaths) {
    const fullPath = join(repoRoot, rp);
    try {
      const s = await fsStat(fullPath);
      if ((s.isFile() || s.isDirectory()) && (Date.now() - s.mtimeMs) < THIRTY_DAYS_MS) {
        findings.hasCoverageReports = true;
        findings.configSources.push(`Coverage report: ${rp}`);
        break;
      }
    } catch {
      // Not found
    }
  }

  // Check for JaCoCo report (must be recent)
  try {
    const jacocoPath = join(repoRoot, "target/site/jacoco/jacoco.xml");
    const s = await fsStat(jacocoPath);
    if (s.isFile() && (Date.now() - s.mtimeMs) < THIRTY_DAYS_MS) {
      findings.hasCoverageReports = true;
      findings.configSources.push("JaCoCo XML report");
    }
  } catch {
    // Not found
  }

  // Check coverage enforcement in CI
  const ghDir = join(repoRoot, ".github/workflows");
  if (await dirExists(ghDir)) {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(ghDir);
    for (const entry of entries) {
      if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
        const content = await readFile(join(ghDir, entry), "utf-8");
        const lower = content.toLowerCase();
        if (lower.includes("coverage") && (lower.includes("threshold") || lower.includes("fail") || lower.includes("minimum"))) {
          findings.hasEnforcement = true;
        }
      }
    }
  }

  // Check for mutation testing
  for (const mutationConfig of [
    "stryker.conf.js", "stryker.conf.mjs", "stryker.conf.json",
    "stryker.config.js", "stryker.config.mjs", "stryker.config.json",
    ".stryker-tmp",
  ]) {
    if (await fileExists(join(repoRoot, mutationConfig))) {
      findings.hasMutationTesting = true;
      findings.configSources.push(`Mutation testing: ${mutationConfig}`);
      break;
    }
  }

  // Check for PIT (Java mutation testing)
  if (pomXml && pomXml.toLowerCase().includes("pitest")) {
    findings.hasMutationTesting = true;
    findings.configSources.push("Mutation testing: PIT (pitest)");
  }

  return findings;
}

export class CoverageAnalyzer implements DimensionAnalyzer {
  readonly dimension = "coverage";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const findings = await detectCoverageConfig(repoRoot);

      // Enrich from SonarQube if available
      await this.enrichFromSonarQube(context, findings);

      const evidence: string[] = [];
      const suggestions: string[] = [];

      if (findings.configSources.length > 0) {
        for (const src of findings.configSources) {
          evidence.push(`Found: ${src}`);
        }
      } else {
        evidence.push("No coverage configuration or reports detected.");
      }

      let score: number;

      if (!findings.hasCoverageConfig && !findings.hasCoverageReports) {
        score = 0;
        suggestions.push("Set up code coverage measurement for your test suite.");
        suggestions.push("Configure a coverage reporter (e.g. V8, Istanbul, JaCoCo, Coverlet).");
      } else if (findings.hasMutationTesting && findings.hasEnforcement) {
        score = 5;
      } else if (findings.hasEnforcement) {
        // Has enforcement — score based on detected threshold
        if (findings.detectedPercentage !== null && findings.detectedPercentage >= 80) {
          score = 4;
        } else if (findings.detectedPercentage !== null && findings.detectedPercentage >= 60) {
          score = 3;
        } else {
          score = 3; // Has enforcement but threshold unknown — don't assume 80%+
        }
        if (!findings.hasMutationTesting) {
          suggestions.push("Add mutation testing (e.g. Stryker, PIT) for deeper coverage confidence.");
        }
      } else if (findings.hasCoverageReports) {
        // Reports exist but no enforcement
        if (findings.detectedPercentage !== null) {
          if (findings.detectedPercentage >= 80) score = 3;
          else if (findings.detectedPercentage >= 60) score = 3;
          else if (findings.detectedPercentage >= 40) score = 2;
          else score = 1;
        } else {
          score = 2; // Reports exist, unknown %
        }
        suggestions.push("Add coverage threshold enforcement in CI to prevent regressions.");
      } else {
        // Config exists but no recent reports or enforcement
        score = 1;
        suggestions.push("Coverage config found but no recent reports. Run your test suite with coverage enabled.");
        suggestions.push("Add coverage enforcement thresholds to prevent regression.");
      }

      const details =
        score === 5
          ? "Excellent coverage with enforcement and mutation testing."
          : score === 4
            ? "Strong coverage with threshold enforcement."
            : score === 3
              ? "Good coverage (60-80% range) detected."
              : score === 2
                ? "Coverage configured but may be insufficient (40-60%)."
                : score === 1
                  ? "Coverage tooling found but coverage appears low or unmeasured."
                  : "No code coverage measurement detected.";

      const pctStr = findings.detectedPercentage !== null ? `${findings.detectedPercentage}%` : "unknown";
      const scoringRationale = `Score ${score}/5. Coverage: ${pctStr}. ` +
        `Config: ${findings.hasCoverageConfig ? "yes" : "no"}. ` +
        `Reports: ${findings.hasCoverageReports ? "yes" : "no"}. ` +
        `Enforcement: ${findings.hasEnforcement ? "yes" : "no"}. ` +
        `Mutation testing: ${findings.hasMutationTesting ? "yes" : "no"}.` +
        (score < 5 ? ` To improve: ${suggestions[0] ?? "increase coverage"}.` : "");

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze code coverage: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }

  private async enrichFromSonarQube(
    context: AnalyzerContext | undefined,
    findings: CoverageFindings,
  ): Promise<void> {
    if (!context?.sonarqubeClient) return;

    // Determine project key: manifest > sonar-project.properties
    const manifestKey = context.manifest?.externalTools?.coverage?.sonarProjectKey;
    let projectKey = manifestKey;

    if (!projectKey) {
      // Try auto-detect from sonar-project.properties
      const propsContent = await readFileIfExists(join(context.repoRoot, "sonar-project.properties"));
      if (propsContent) {
        const match = propsContent.match(/sonar\.projectKey\s*=\s*(.+)/);
        if (match?.[1]) {
          projectKey = match[1].trim();
        }
      }
    }

    if (!projectKey) return;

    try {
      const measures = await context.sonarqubeClient.getMeasures(projectKey, [
        "coverage",
        "line_coverage",
        "branch_coverage",
      ]);

      const coverageMeasure = measures.component.measures.find(
        (m) => m.metric === "coverage",
      );
      if (coverageMeasure?.value) {
        const pct = parseFloat(coverageMeasure.value);
        if (!isNaN(pct)) {
          findings.detectedPercentage = pct;
          findings.hasCoverageConfig = true;
          findings.hasCoverageReports = true;
          findings.configSources.push(
            `SonarQube reports ${pct.toFixed(1)}% coverage (project: ${projectKey})`,
          );
        }
      }

      // Check quality gate for enforcement
      const gate = await context.sonarqubeClient.getQualityGate(projectKey);
      if (gate.projectStatus.status !== "NONE") {
        const hasCoverageCondition = gate.projectStatus.conditions.some(
          (c) => c.metricKey.includes("coverage"),
        );
        if (hasCoverageCondition) {
          findings.hasEnforcement = true;
          findings.configSources.push("SonarQube quality gate enforces coverage threshold");
        }
      }
    } catch {
      // SonarQube unreachable — skip enrichment silently
    }
  }
}
