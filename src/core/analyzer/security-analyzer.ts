import { stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { readPipelineContent } from "../detection/pipeline-content.js";
import { AssessmentError } from "../../utils/errors.js";
import { type SecurityCategory, SECURITY_UMBRELLA_TOOLS } from "./umbrella-tools.js";

/**
 * Security Pipeline analyzer.
 *
 * Scoring rubric (0-5):
 *   0 = no scanning
 *   1 = ad-hoc scanning only
 *   2 = manual security reviews
 *   3 = SAST + secrets detection active
 *   4 = + SCA + dependency scanning
 *   5 = + DAST + SBOM generation
 */

interface SecuritySignal {
  category: SecurityCategory;
  tool: string;
  source: string;
}

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

export class SecurityAnalyzer implements DimensionAnalyzer {
  readonly dimension = "security";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const signals: SecuritySignal[] = [];
      const evidence: string[] = [];
      const suggestions: string[] = [];

      // Gather pipeline content for keyword scanning
      const pipelineContent = await readPipelineContent(repoRoot);
      const lower = pipelineContent.toLowerCase();

      // --- SAST tools ---
      if (await fileExists(join(repoRoot, ".semgrep.yml")) || await fileExists(join(repoRoot, ".semgrep.yaml"))) {
        signals.push({ category: "sast", tool: "Semgrep", source: "config file" });
      }
      if (lower.includes("semgrep")) {
        signals.push({ category: "sast", tool: "Semgrep", source: "CI pipeline" });
      }

      if (await dirExists(join(repoRoot, ".github/codeql"))) {
        signals.push({ category: "sast", tool: "CodeQL", source: "config directory" });
      }
      if (lower.includes("codeql")) {
        signals.push({ category: "sast", tool: "CodeQL", source: "CI pipeline" });
      }

      if (lower.includes("sonar")) {
        signals.push({ category: "sast", tool: "SonarQube/SonarCloud", source: "CI pipeline" });
      }
      if (await fileExists(join(repoRoot, "sonar-project.properties"))) {
        signals.push({ category: "sast", tool: "SonarQube/SonarCloud", source: "config file" });
      }

      // --- Secrets detection ---
      if (await fileExists(join(repoRoot, ".gitleaks.toml"))) {
        signals.push({ category: "secrets", tool: "Gitleaks", source: "config file" });
      }
      if (lower.includes("gitleaks")) {
        signals.push({ category: "secrets", tool: "Gitleaks", source: "CI pipeline" });
      }
      if (lower.includes("trufflehog")) {
        signals.push({ category: "secrets", tool: "TruffleHog", source: "CI pipeline" });
      }
      if (lower.includes("detect-secrets")) {
        signals.push({ category: "secrets", tool: "detect-secrets", source: "CI pipeline" });
      }

      // --- SCA / Dependency scanning ---
      if (lower.includes("snyk")) {
        signals.push({ category: "sca", tool: "Snyk", source: "CI pipeline" });
      }
      if (await fileExists(join(repoRoot, ".snyk"))) {
        signals.push({ category: "sca", tool: "Snyk", source: "config file" });
      }
      if (lower.includes("trivy")) {
        signals.push({ category: "sca", tool: "Trivy", source: "CI pipeline" });
      }
      if (lower.includes("dependabot")) {
        signals.push({ category: "sca", tool: "Dependabot", source: "CI pipeline" });
      }
      if (await fileExists(join(repoRoot, ".github/dependabot.yml")) || await fileExists(join(repoRoot, ".github/dependabot.yaml"))) {
        signals.push({ category: "sca", tool: "Dependabot", source: "config file" });
      }
      if (lower.includes("renovate")) {
        signals.push({ category: "sca", tool: "Renovate", source: "CI pipeline" });
      }
      if (await fileExists(join(repoRoot, "renovate.json")) || await fileExists(join(repoRoot, ".renovaterc.json"))) {
        signals.push({ category: "sca", tool: "Renovate", source: "config file" });
      }
      if (lower.includes("owasp")) {
        signals.push({ category: "sca", tool: "OWASP Dependency-Check", source: "CI pipeline" });
      }

      // --- DAST ---
      if (lower.includes("zap")) {
        signals.push({ category: "dast", tool: "OWASP ZAP", source: "CI pipeline" });
      }
      if (lower.includes("dast")) {
        signals.push({ category: "dast", tool: "DAST", source: "CI pipeline" });
      }
      if (lower.includes("nuclei")) {
        signals.push({ category: "dast", tool: "Nuclei", source: "CI pipeline" });
      }

      // --- SBOM ---
      if (lower.includes("sbom")) {
        signals.push({ category: "sbom", tool: "SBOM", source: "CI pipeline" });
      }
      if (lower.includes("syft")) {
        signals.push({ category: "sbom", tool: "Syft", source: "CI pipeline" });
      }
      if (lower.includes("cyclonedx")) {
        signals.push({ category: "sbom", tool: "CycloneDX", source: "CI pipeline" });
      }

      // --- Umbrella tools (platforms covering multiple categories) ---
      for (const [toolKey, cats] of Object.entries(SECURITY_UMBRELLA_TOOLS)) {
        if (lower.includes(toolKey)) {
          const displayName = toolKey.charAt(0).toUpperCase() + toolKey.slice(1);
          for (const cat of cats) {
            signals.push({ category: cat, tool: displayName, source: "CI pipeline" });
          }
        }
      }

      // Consume external tool declarations from manifest
      const securityCategories = new Set<SecurityCategory>(["sast", "secrets", "sca", "dast", "sbom"]);
      const externalSecurity = context?.manifest?.externalTools?.security ?? [];
      for (const decl of externalSecurity) {
        if (!decl.tool) continue;

        const umbrellaCats = SECURITY_UMBRELLA_TOOLS[decl.tool.toLowerCase()];
        if (umbrellaCats) {
          // Umbrella tool: expand to all categories it covers
          for (const cat of umbrellaCats) {
            signals.push({
              category: cat,
              tool: decl.tool,
              source: decl.evidence
                ? `${decl.tool} (${cat}) — ${decl.evidence} [declared]`
                : `${decl.tool} covers ${cat} [declared]`,
            });
          }
        } else if (decl.category && securityCategories.has(decl.category as SecurityCategory)) {
          // Non-umbrella tool with valid security category
          signals.push({
            category: decl.category as SecurityCategory,
            tool: decl.tool,
            source: decl.evidence
              ? `${decl.tool} (${decl.category}) — ${decl.evidence} [declared]`
              : `manifest declaration [declared]`,
          });
        } else if (!decl.category) {
          // Non-umbrella tool without category — default to sast
          signals.push({
            category: "sast",
            tool: decl.tool,
            source: decl.evidence
              ? `${decl.tool} — ${decl.evidence} [declared]`
              : `manifest declaration [declared]`,
          });
        }
        // Tools with an explicit but invalid security category (e.g., "lint") are skipped
      }

      // Deduplicate signals by category + tool (case-insensitive on tool name)
      const uniqueSignals = signals.filter(
        (s, i, arr) =>
          arr.findIndex(
            (x) => x.category === s.category && x.tool.toLowerCase() === s.tool.toLowerCase(),
          ) === i,
      );

      // Categorize findings
      const categories = new Set(uniqueSignals.map((s) => s.category));
      const hasSast = categories.has("sast");
      const hasSecrets = categories.has("secrets");
      const hasSca = categories.has("sca");
      const hasDast = categories.has("dast");
      const hasSbom = categories.has("sbom");

      for (const signal of uniqueSignals) {
        evidence.push(`${signal.tool} (${signal.category}) found via ${signal.source}.`);
      }

      if (uniqueSignals.length === 0) {
        evidence.push("No security tooling detected.");
      }

      // Score
      let score: number;

      if (hasSast && hasSecrets && hasSca && hasDast && hasSbom) {
        score = 5;
      } else if (hasSast && hasSecrets && hasSca) {
        score = 4;
      } else if (hasSast && hasSecrets) {
        score = 3;
      } else if (hasSast || hasSecrets) {
        score = 2;
      } else if (uniqueSignals.length > 0) {
        score = 1;
      } else {
        score = 0;
      }

      const categoriesFound = [...categories].join(", ") || "none";
      const categoriesMissing = (["sast", "secrets", "sca", "dast", "sbom"] as const)
        .filter(c => !categories.has(c)).join(", ") || "none";
      const scoringRationale = `Score ${score}/5. Categories detected: ${categoriesFound}. Missing: ${categoriesMissing}. ` +
        (score < 5 ? `To reach ${score + 1}: add ${(["sast", "secrets", "sca", "dast", "sbom"] as const).find(c => !categories.has(c)) ?? "more tools"}.` : "All categories covered.");

      if (!hasSast) suggestions.push("Add SAST scanning (e.g. Semgrep or CodeQL).");
      if (!hasSecrets) suggestions.push("Add secrets detection (e.g. Gitleaks or TruffleHog).");
      if (!hasSca) suggestions.push("Add dependency scanning (e.g. Snyk, Trivy, or Dependabot).");
      if (!hasDast) suggestions.push("Add DAST scanning (e.g. OWASP ZAP).");
      if (!hasSbom) suggestions.push("Generate SBOMs (e.g. Syft, CycloneDX).");

      // Check for config files that exist but may not be wired into CI
      const hasSemgrepConfig = await fileExists(join(repoRoot, ".semgrep.yml")) || await fileExists(join(repoRoot, ".semgrep.yaml"));
      const hasSemgrepInCi = lower.includes(".semgrep.yml") || lower.includes(".semgrep.yaml");
      if (hasSemgrepConfig && !hasSemgrepInCi && lower.includes("semgrep")) {
        suggestions.push(".semgrep.yml exists but is not referenced in CI pipeline. Add '--config .semgrep.yml' to your semgrep scan step.");
      }

      const hasRenovateConfig = await fileExists(join(repoRoot, "renovate.json"));
      const hasRenovateInCi = lower.includes("renovate");
      if (hasRenovateConfig && !hasRenovateInCi) {
        suggestions.push("renovate.json exists but Renovate is not detected in CI. Ensure the Mend Renovate service is enabled.");
      }

      const details =
        score === 5
          ? "Comprehensive security pipeline with SAST, secrets detection, SCA, DAST, and SBOM."
          : score === 4
            ? "Strong security pipeline with SAST, secrets detection, and SCA."
            : score === 3
              ? "SAST and secrets detection are active."
              : score === 2
                ? "Partial security scanning detected."
                : score === 1
                  ? "Ad-hoc security tooling detected."
                  : "No security scanning detected.";

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze security pipeline: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }
}
