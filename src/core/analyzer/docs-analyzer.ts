import { readFile, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import type { AnalyzerContext, DimensionAnalyzer, DimensionResult } from "./dimension-analyzer.js";
import { AssessmentError } from "../../utils/errors.js";

/**
 * Documentation completeness analyzer.
 *
 * Scoring rubric (0-5):
 *   0 = no documentation
 *   1 = outdated or minimal README
 *   2 = README exists with meaningful content
 *   3 = README + build/test commands documented
 *   4 = + architecture docs + API docs + onboarding
 *   5 = + CLAUDE.md + .claude/ directory configured
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

interface DocsFindings {
  hasReadme: boolean;
  readmeLines: number;
  readmeHasBuildCommands: boolean;
  readmeHasTestCommands: boolean;
  hasArchitectureDocs: boolean;
  hasApiDocs: boolean;
  hasContributing: boolean;
  hasOnboarding: boolean;
  hasClaudeMd: boolean;
  hasClaudeDir: boolean;
  hasDocsDir: boolean;
  sources: string[];
}

async function detectDocumentation(repoRoot: string): Promise<DocsFindings> {
  const findings: DocsFindings = {
    hasReadme: false,
    readmeLines: 0,
    readmeHasBuildCommands: false,
    readmeHasTestCommands: false,
    hasArchitectureDocs: false,
    hasApiDocs: false,
    hasContributing: false,
    hasOnboarding: false,
    hasClaudeMd: false,
    hasClaudeDir: false,
    hasDocsDir: false,
    sources: [],
  };

  // Check README
  for (const readmeName of ["README.md", "readme.md", "README.rst", "README.txt", "README"]) {
    const content = await readFileIfExists(join(repoRoot, readmeName));
    if (content) {
      findings.hasReadme = true;
      findings.readmeLines = content.split("\n").length;
      findings.sources.push(`${readmeName} (${findings.readmeLines} lines)`);

      const lower = content.toLowerCase();
      // Check for build commands
      if (
        lower.includes("npm run") ||
        lower.includes("yarn ") ||
        lower.includes("pnpm ") ||
        lower.includes("dotnet build") ||
        lower.includes("mvn ") ||
        lower.includes("gradle ") ||
        lower.includes("make ") ||
        lower.includes("cargo build")
      ) {
        findings.readmeHasBuildCommands = true;
      }
      // Check for test commands
      if (
        lower.includes("npm test") ||
        lower.includes("yarn test") ||
        lower.includes("vitest") ||
        lower.includes("jest") ||
        lower.includes("pytest") ||
        lower.includes("dotnet test") ||
        lower.includes("mvn test") ||
        lower.includes("cargo test")
      ) {
        findings.readmeHasTestCommands = true;
      }
      break;
    }
  }

  // Check for docs directory
  if (await dirExists(join(repoRoot, "docs"))) {
    findings.hasDocsDir = true;
    findings.sources.push("docs/ directory exists");
  }

  // Check for architecture docs
  for (const archDoc of [
    "ARCHITECTURE.md",
    "docs/ARCHITECTURE.md",
    "docs/architecture.md",
    "docs/design.md",
    "DESIGN.md",
  ]) {
    if (await fileExists(join(repoRoot, archDoc))) {
      findings.hasArchitectureDocs = true;
      findings.sources.push(`Architecture doc: ${archDoc}`);
      break;
    }
  }

  // Check for API docs
  for (const apiDoc of [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "docs/api.md",
    "API.md",
  ]) {
    if (await fileExists(join(repoRoot, apiDoc))) {
      findings.hasApiDocs = true;
      findings.sources.push(`API doc: ${apiDoc}`);
      break;
    }
  }

  // Check for contributing guide
  for (const contribDoc of ["CONTRIBUTING.md", "contributing.md", "docs/CONTRIBUTING.md"]) {
    if (await fileExists(join(repoRoot, contribDoc))) {
      findings.hasContributing = true;
      findings.sources.push(`Contributing guide: ${contribDoc}`);
      break;
    }
  }

  // Check for onboarding docs
  for (const onboardDoc of [
    "ONBOARDING.md",
    "docs/onboarding.md",
    "docs/getting-started.md",
    "GETTING_STARTED.md",
  ]) {
    if (await fileExists(join(repoRoot, onboardDoc))) {
      findings.hasOnboarding = true;
      findings.sources.push(`Onboarding doc: ${onboardDoc}`);
      break;
    }
  }

  // Check for CLAUDE.md
  if (await fileExists(join(repoRoot, "CLAUDE.md"))) {
    findings.hasClaudeMd = true;
    findings.sources.push("CLAUDE.md found");
  }

  // Check for .claude/ directory
  if (await dirExists(join(repoRoot, ".claude"))) {
    findings.hasClaudeDir = true;
    findings.sources.push(".claude/ directory found");

    if (await fileExists(join(repoRoot, ".claude/settings.json"))) {
      findings.sources.push(".claude/settings.json found");
    }
  }

  return findings;
}

export class DocsAnalyzer implements DimensionAnalyzer {
  readonly dimension = "docs";

  async analyze(repoRoot: string, context?: AnalyzerContext): Promise<DimensionResult> {
    try {
      const findings = await detectDocumentation(repoRoot);
      const evidence: string[] = [];
      const suggestions: string[] = [];

      // Consume external doc declarations from manifest
      const externalDocs = context?.manifest?.externalTools?.docs ?? [];
      for (const decl of externalDocs) {
        const pages = decl.pages ?? [];
        for (const page of pages) {
          const lower = page.toLowerCase();
          if (lower.includes("architecture")) {
            findings.hasArchitectureDocs = true;
          }
          if (lower.includes("api")) {
            findings.hasApiDocs = true;
          }
          if (lower.includes("onboarding") || lower.includes("getting-started")) {
            findings.hasOnboarding = true;
          }
          if (lower.includes("contributing")) {
            findings.hasContributing = true;
          }
          evidence.push(`${decl.tool}: ${page} docs at ${decl.url ?? "external"} [declared]`);
        }
      }

      if (findings.sources.length > 0) {
        for (const src of findings.sources) {
          evidence.push(src);
        }
      } else if (evidence.length === 0) {
        evidence.push("No documentation files detected.");
      }

      // Count externally-declared documentation categories
      const externalDocCount = [
        findings.hasArchitectureDocs,
        findings.hasApiDocs,
        findings.hasOnboarding,
        findings.hasContributing,
      ].filter(Boolean).length;

      let score: number;
      let details: string;

      if (!findings.hasReadme) {
        // No README — external docs can partially compensate
        if (externalDocCount >= 3) {
          score = 2;
          details = "External documentation compensates for missing README.";
        } else if (externalDocCount >= 1) {
          score = 1;
          details = "External docs found but no README.";
        } else {
          score = 0;
          details = "No documentation found.";
        }
        suggestions.push("Create a README.md with project description, setup, and usage instructions.");
      } else if (findings.hasClaudeMd && findings.hasClaudeDir && findings.readmeHasBuildCommands) {
        score = 5;
        details = "Comprehensive documentation including CLAUDE.md and .claude/ configuration.";
        if (!findings.hasArchitectureDocs) {
          suggestions.push("Consider adding architecture documentation.");
        }
      } else if (
        findings.hasArchitectureDocs &&
        (findings.hasApiDocs || findings.hasOnboarding) &&
        (findings.readmeHasBuildCommands || externalDocCount >= 2)
      ) {
        score = 4;
        details = "Strong documentation with architecture, API, and onboarding docs.";
        if (!findings.hasClaudeMd) {
          suggestions.push("Add a CLAUDE.md file for AI-assisted development configuration.");
        }
        if (!findings.hasClaudeDir) {
          suggestions.push("Create a .claude/ directory with settings.json.");
        }
      } else if (findings.readmeHasBuildCommands || findings.readmeHasTestCommands) {
        score = 3;
        details = "README includes build/test commands.";
        if (!findings.hasArchitectureDocs) {
          suggestions.push("Add architecture documentation (ARCHITECTURE.md).");
        }
        if (!findings.hasApiDocs) {
          suggestions.push("Add API documentation (openapi.yaml or swagger.json).");
        }
        if (!findings.hasOnboarding) {
          suggestions.push("Add an onboarding guide for new contributors.");
        }
      } else if (externalDocCount >= 3) {
        // Extensive external docs compensate for minimal README (check >= 3 before >= 2)
        score = 3;
        details = "Extensive external docs compensate for minimal README.";
        suggestions.push("Add build and test commands to the README.");
      } else if (findings.readmeLines > 20 && externalDocCount >= 2) {
        score = 3;
        details = "External docs provide architecture coverage.";
        suggestions.push("Add build and test commands to the README.");
      } else if (findings.readmeLines > 20 || externalDocCount >= 1) {
        score = 2;
        details = externalDocCount >= 1
          ? "README + external documentation."
          : "README exists with meaningful content.";
        suggestions.push("Add build and test commands to the README.");
        if (!findings.hasContributing) {
          suggestions.push("Add a CONTRIBUTING.md with workflow guidelines.");
        }
      } else {
        score = 1;
        details = "Minimal README found.";
        suggestions.push("Expand the README with project setup, build, and test instructions.");
        suggestions.push("Consider adding a docs/ directory for detailed documentation.");
      }

      const criteria = [
        `README: ${findings.hasReadme ? `yes (${findings.readmeLines} lines)` : "no"}`,
        `Build commands: ${findings.readmeHasBuildCommands ? "yes" : "no"}`,
        `Test commands: ${findings.readmeHasTestCommands ? "yes" : "no"}`,
        `Architecture docs: ${findings.hasArchitectureDocs ? "yes" : "no"}`,
        `API docs: ${findings.hasApiDocs ? "yes" : "no"}`,
        `Contributing guide: ${findings.hasContributing ? "yes" : "no"}`,
        `Onboarding docs: ${findings.hasOnboarding ? "yes" : "no"}`,
        `CLAUDE.md: ${findings.hasClaudeMd ? "yes" : "no"}`,
        `.claude/ dir: ${findings.hasClaudeDir ? "yes" : "no"}`,
      ].join(". ");
      const scoringRationale = `Score ${score}/5. Criteria: ${criteria}. ` +
        (score < 5 ? `To improve: ${suggestions[0] ?? "add more documentation"}.` : "Comprehensive documentation setup.");

      return { dimension: this.dimension, score, details, evidence, suggestions, scoringRationale };
    } catch (error) {
      throw new AssessmentError(
        `Failed to analyze documentation: ${error instanceof Error ? error.message : String(error)}`,
        this.dimension,
      );
    }
  }
}
