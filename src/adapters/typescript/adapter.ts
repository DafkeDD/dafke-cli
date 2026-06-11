import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TemplateEngine } from "../../core/scaffold/template-engine.js";
import type { TechStack } from "../../core/config/config-schema.js";
import type {
  TechnologyAdapter,
  DetectionResult,
  AnalysisResult,
  CoverageConfig,
  MutationConfig,
  SecurityConfig,
  BuildInfo,
} from "../adapter-interface.js";
import { clampConfidence, hasFile, hasFileWithExtension } from "../adapter-utils.js";
import { hasAzurePipeline } from "../../core/detection/pipeline-files.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readPackageJson(repoRoot: string): PackageJson | null {
  try {
    const raw = readFileSync(join(repoRoot, "package.json"), "utf-8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function hasDependency(pkg: PackageJson, name: string): boolean {
  return (
    pkg.dependencies?.[name] !== undefined ||
    pkg.devDependencies?.[name] !== undefined
  );
}

// ---------------------------------------------------------------------------
// TypeScriptAdapter
// ---------------------------------------------------------------------------

export class TypeScriptAdapter implements TechnologyAdapter {
  readonly name: TechStack = "typescript";
  readonly displayName = "TypeScript";

  async detect(repoRoot: string): Promise<DetectionResult> {
    const indicators: string[] = [];
    let confidence = 0;

    if (hasFile(repoRoot, "tsconfig.json")) {
      indicators.push("tsconfig.json");
      confidence += 0.4;
    }

    const pkg = readPackageJson(repoRoot);
    if (pkg && hasDependency(pkg, "typescript")) {
      indicators.push("package.json (typescript dependency)");
      confidence += 0.3;
    }

    if (hasFileWithExtension(repoRoot, ".ts")) {
      indicators.push("*.ts files");
      confidence += 0.2;
    }

    if (pkg && hasFile(repoRoot, "package.json")) {
      indicators.push("package.json");
      confidence += 0.1;
    }

    confidence = clampConfidence(confidence);

    return {
      detected: confidence > 0,
      confidence,
      indicators,
    };
  }

  async analyze(repoRoot: string): Promise<AnalysisResult> {
    const buildInfo = await this.getBuildInfo(repoRoot);
    const entryPoints: string[] = [];
    let testFramework: string | null = null;
    let coverageToolDetected = false;
    let depTotal = 0;

    const pkg = readPackageJson(repoRoot);

    if (pkg) {
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      depTotal = Object.keys(allDeps).length;

      // Detect test framework
      if (allDeps["vitest"]) {
        testFramework = "Vitest";
      } else if (allDeps["jest"]) {
        testFramework = "Jest";
      } else if (allDeps["mocha"]) {
        testFramework = "Mocha";
      }

      // Detect coverage tools
      if (
        allDeps["c8"] ||
        allDeps["@vitest/coverage-v8"] ||
        allDeps["@vitest/coverage-c8"] ||
        allDeps["nyc"]
      ) {
        coverageToolDetected = true;
      }

      // Detect entry points
      if (pkg.scripts?.["start"]) {
        entryPoints.push("package.json#scripts.start");
      }
      if (hasFile(repoRoot, "src/index.ts")) {
        entryPoints.push("src/index.ts");
      }
    }

    // Detect CI
    const hasCI =
      hasFile(repoRoot, ".github/workflows") ||
      hasAzurePipeline(repoRoot);

    // Detect SAST
    const hasSAST =
      hasFile(repoRoot, ".github/codeql") ||
      hasFile(repoRoot, ".semgrep.yml") ||
      (pkg !== null && hasDependency(pkg, "eslint-plugin-security"));

    // Detect secrets detection
    const hasSecretsDetection =
      hasFile(repoRoot, ".gitleaks.toml") ||
      hasFile(repoRoot, ".pre-commit-config.yaml");

    return {
      techStack: "typescript",
      buildInfo,
      entryPoints,
      testFramework,
      coverageToolDetected,
      existingCoverage: null,
      hasCI,
      hasSAST,
      hasSecretsDetection,
      dependencies: { total: depTotal, outdated: 0 },
    };
  }

  getCoverageConfig(): CoverageConfig {
    return {
      tool: "c8 / Vitest coverage",
      command: "npx vitest run --coverage",
      reportPath: "coverage/lcov.info",
      reportFormat: "lcov",
    };
  }

  getMutationConfig(): MutationConfig {
    return {
      tool: "Stryker Mutator",
      command: "npx stryker run",
      configFile: "stryker.conf.json",
      supported: true,
    };
  }

  getSecurityConfig(): SecurityConfig {
    return {
      sastTools: ["Semgrep", "eslint-plugin-security"],
      secretsDetection: "Gitleaks",
      scaTools: ["npm audit", "Snyk"],
    };
  }

  async getBuildInfo(repoRoot: string): Promise<BuildInfo> {
    // Detect package manager
    let buildTool = "npm";
    let runPrefix = "npm run";

    if (hasFile(repoRoot, "pnpm-lock.yaml")) {
      buildTool = "pnpm";
      runPrefix = "pnpm";
    } else if (hasFile(repoRoot, "yarn.lock")) {
      buildTool = "yarn";
      runPrefix = "yarn";
    }

    return {
      buildTool,
      buildCommand: `${runPrefix} build`,
      testCommand: `${runPrefix} test`,
      lintCommand: `${runPrefix} lint`,
    };
  }

  getClaudeMdSection(): string {
    const engine = new TemplateEngine();
    return engine.getTemplate("claude-md/typescript.md");
  }

  getCITemplateId(): string {
    return "typescript";
  }

  getInstructionTemplates(): string[] {
    return ["typescript-standards", "typescript-testing"];
  }
}
