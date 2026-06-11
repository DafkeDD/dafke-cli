import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock node:fs BEFORE importing adapters
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { JavaAdapter } from "../../src/adapters/java/adapter.js";
import { DotNetAdapter } from "../../src/adapters/dotnet/adapter.js";
import { TypeScriptAdapter } from "../../src/adapters/typescript/adapter.js";
import { DelphiAdapter } from "../../src/adapters/delphi/adapter.js";
import { FoxProAdapter } from "../../src/adapters/foxpro/adapter.js";

// Typed mocks
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

// Real fs functions for template passthrough (TemplateEngine needs real file reads)
let realExistsSync: typeof existsSync;
let realReadFileSync: typeof readFileSync;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  realExistsSync = actual.existsSync;
  realReadFileSync = actual.readFileSync;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all fs mocks and re-establish template passthrough. */
function resetFsMocks(): void {
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  mockReaddirSync.mockReset();
  mockStatSync.mockReset();
  mockStatSync.mockImplementation(() => {
    throw new Error("ENOENT");
  });
  // Re-establish passthrough for TemplateEngine
  mockExistsSync.mockImplementation((p) => {
    const pathStr = String(p);
    if (/[\\/]templates[\\/]/.test(pathStr) || /[\\/]templates$/.test(pathStr)) {
      return realExistsSync(pathStr);
    }
    return false;
  });
  mockReadFileSync.mockImplementation(((p: string | URL, ...args: unknown[]) => {
    const pathStr = String(p);
    if (/[\\/]templates[\\/]/.test(pathStr)) {
      return realReadFileSync(pathStr, ...args as []);
    }
    return "";
  }) as typeof readFileSync);
}

function stubFiles(repoRoot: string, files: string[]): void {
  mockExistsSync.mockImplementation((p) => {
    const pathStr = String(p);
    if (/[\\/]templates[\\/]/.test(pathStr) || /[\\/]templates$/.test(pathStr)) {
      return realExistsSync(pathStr);
    }
    return files.some((f) => pathStr === join(repoRoot, f));
  });
  mockReadFileSync.mockImplementation(((p: string | URL, ...args: unknown[]) => {
    const pathStr = String(p);
    if (/[\\/]templates[\\/]/.test(pathStr)) {
      return realReadFileSync(pathStr, ...args as []);
    }
    return "";
  }) as typeof readFileSync);
  // statSync — used by the pipeline-file walker. Return a minimal file-like
  // stat for any path declared via stubFiles; throw for everything else.
  mockStatSync.mockImplementation(((p: string | URL) => {
    const pathStr = String(p);
    if (files.some((f) => pathStr === join(repoRoot, f))) {
      return { isFile: () => true, isDirectory: () => false } as ReturnType<typeof statSync>;
    }
    throw new Error(`ENOENT: no such file or directory, stat '${pathStr}'`);
  }) as typeof statSync);
}

function stubDir(filenames: string[]): void {
  mockReaddirSync.mockReturnValue(filenames as unknown as ReturnType<typeof readdirSync>);
}

const REPO = "/fake/repo";

// ===========================================================================
// JavaAdapter — analyze()
// ===========================================================================

describe("JavaAdapter analyze()", () => {
  const adapter = new JavaAdapter();

  beforeEach(() => {
    resetFsMocks();
  });

  it("analyzes Maven project with JUnit and JaCoCo", async () => {
    stubFiles(REPO, ["pom.xml"]);
    stubDir([]);

    mockReadFileSync.mockReturnValue(`
<project>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
    </dependency>
    <dependency>
      <groupId>org.jacoco</groupId>
      <artifactId>jacoco-maven-plugin</artifactId>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <mainClass>com.dafke.Main</mainClass>
      </plugin>
    </plugins>
  </build>
</project>
`);

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("java");
    expect(result.testFramework).toBe("JUnit");
    expect(result.coverageToolDetected).toBe(true);
    expect(result.dependencies.total).toBe(2);
    expect(result.entryPoints).toContain("com.dafke.Main");
    expect(result.buildInfo.buildTool).toBe("Maven");
  });

  it("analyzes Gradle project", async () => {
    stubFiles(REPO, ["build.gradle.kts"]);
    stubDir([]);

    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes("pom.xml")) throw new Error("not found");
      return `
plugins {
  id("org.jetbrains.kotlin.jvm")
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter")
  testImplementation("org.junit.jupiter:junit-jupiter")
  implementation("com.fasterxml.jackson.core:jackson-databind")
}

jacoco {
  toolVersion = "0.8.10"
}
`;
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("java");
    expect(result.testFramework).toBe("JUnit");
    expect(result.coverageToolDetected).toBe(true);
    expect(result.dependencies.total).toBe(3);
    expect(result.buildInfo.buildTool).toBe("Gradle");
  });

  it("analyzes project with both Maven and Gradle", async () => {
    stubFiles(REPO, ["pom.xml", "build.gradle"]);
    stubDir([]);

    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes("pom.xml")) {
        return `<project><dependencies><dependency>junit</dependency></dependencies></project>`;
      }
      if (p.includes("build.gradle")) {
        return `dependencies { implementation("lib1") }`;
      }
      return "";
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("java");
    expect(result.testFramework).toBe("JUnit");
  });

  it("handles pom.xml read failure", async () => {
    stubFiles(REPO, ["pom.xml"]);
    stubDir([]);

    mockReadFileSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("java");
    expect(result.testFramework).toBeNull();
    expect(result.coverageToolDetected).toBe(false);
  });

  it("detects CI, SAST, and secrets detection files", async () => {
    stubFiles(REPO, ["pom.xml", ".github/workflows", ".github/codeql", ".gitleaks.toml"]);
    stubDir([]);
    mockReadFileSync.mockReturnValue("<project></project>");

    const result = await adapter.analyze(REPO);

    expect(result.hasCI).toBe(true);
    expect(result.hasSAST).toBe(true);
    expect(result.hasSecretsDetection).toBe(true);
  });

  it("getBuildInfo returns Maven for non-Gradle project", async () => {
    stubFiles(REPO, ["pom.xml"]);

    const buildInfo = await adapter.getBuildInfo(REPO);

    expect(buildInfo.buildTool).toBe("Maven");
    expect(buildInfo.buildCommand).toBe("mvn clean package");
    expect(buildInfo.testCommand).toBe("mvn test");
  });

  it("getBuildInfo returns Gradle for Gradle project", async () => {
    stubFiles(REPO, ["build.gradle.kts"]);

    const buildInfo = await adapter.getBuildInfo(REPO);

    expect(buildInfo.buildTool).toBe("Gradle");
    expect(buildInfo.buildCommand).toBe("./gradlew build");
  });

  it("getCoverageConfig returns JaCoCo config", () => {
    const config = adapter.getCoverageConfig();
    expect(config.tool).toBe("JaCoCo");
    expect(config.reportFormat).toBe("cobertura");
  });

  it("getMutationConfig returns PIT config", () => {
    const config = adapter.getMutationConfig();
    expect(config.tool).toContain("PIT");
    expect(config.supported).toBe(true);
  });

  it("getSecurityConfig returns expected tools", () => {
    const config = adapter.getSecurityConfig();
    expect(config.sastTools).toContain("Semgrep");
    expect(config.secretsDetection).toBe("Gitleaks");
  });

  it("getClaudeMdSection returns Java guidelines", () => {
    const section = adapter.getClaudeMdSection();
    expect(section).toContain("Java");
    expect(section).toContain("JaCoCo");
  });

  it("getCITemplateId returns java-maven", () => {
    expect(adapter.getCITemplateId()).toBe("java-maven");
  });
});

// ===========================================================================
// DotNetAdapter — analyze()
// ===========================================================================

describe("DotNetAdapter analyze()", () => {
  const adapter = new DotNetAdapter();

  beforeEach(() => {
    resetFsMocks();
  });

  it("analyzes .NET project with xUnit and Coverlet", async () => {
    stubFiles(REPO, []);
    stubDir(["App.csproj", "App.Tests.csproj", "App.sln"]);

    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes("App.csproj")) {
        return `<Project>
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Hosting" />
    <PackageReference Include="Serilog" />
  </ItemGroup>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
</Project>`;
      }
      if (p.includes("App.Tests.csproj")) {
        return `<Project>
  <ItemGroup>
    <PackageReference Include="xunit" />
    <PackageReference Include="coverlet.collector" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
  </ItemGroup>
</Project>`;
      }
      return "";
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("dotnet");
    expect(result.testFramework).toBe("xUnit");
    expect(result.coverageToolDetected).toBe(true);
    expect(result.dependencies.total).toBe(5);
    expect(result.entryPoints).toContain("App.csproj");
  });

  it("detects NUnit test framework", async () => {
    stubFiles(REPO, []);
    stubDir(["Test.csproj"]);

    mockReadFileSync.mockReturnValue(`<Project>
  <ItemGroup>
    <PackageReference Include="NUnit" />
  </ItemGroup>
</Project>`);

    const result = await adapter.analyze(REPO);

    expect(result.testFramework).toBe("NUnit");
  });

  it("detects MSTest framework", async () => {
    stubFiles(REPO, []);
    stubDir(["Test.csproj"]);

    mockReadFileSync.mockReturnValue(`<Project>
  <ItemGroup>
    <PackageReference Include="MSTest.TestFramework" />
    <PackageReference Include="Microsoft.VisualStudio.TestPlatform.TestFramework" />
  </ItemGroup>
</Project>`);

    const result = await adapter.analyze(REPO);

    expect(result.testFramework).toBe("MSTest");
  });

  it("handles .csproj read failure", async () => {
    stubFiles(REPO, []);
    stubDir(["Bad.csproj"]);

    mockReadFileSync.mockImplementation(() => {
      throw new Error("Cannot read");
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("dotnet");
    expect(result.testFramework).toBeNull();
    expect(result.dependencies.total).toBe(0);
  });

  it("detects CI, SAST, and secrets detection", async () => {
    stubFiles(REPO, ["azure-pipelines.yml", ".semgrep.yml", ".pre-commit-config.yaml"]);
    // readdirSync must include the Azure pipeline so the walker can see it.
    stubDir(["azure-pipelines.yml"]);

    const result = await adapter.analyze(REPO);

    expect(result.hasCI).toBe(true);
    expect(result.hasSAST).toBe(true);
    expect(result.hasSecretsDetection).toBe(true);
  });

  it("getCoverageConfig returns Coverlet config", () => {
    const config = adapter.getCoverageConfig();
    expect(config.tool).toBe("Coverlet");
    expect(config.reportFormat).toBe("cobertura");
  });

  it("getMutationConfig returns Stryker.NET", () => {
    const config = adapter.getMutationConfig();
    expect(config.tool).toBe("Stryker.NET");
    expect(config.supported).toBe(true);
  });

  it("getClaudeMdSection returns .NET guidelines", () => {
    const section = adapter.getClaudeMdSection();
    expect(section).toContain(".NET");
    expect(section).toContain("dotnet build");
  });

  it("getCITemplateId returns dotnet", () => {
    expect(adapter.getCITemplateId()).toBe("dotnet");
  });

  it("detect finds .csproj and .sln files", async () => {
    stubDir(["App.csproj", "App.sln"]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.indicators).toContain("*.csproj files");
    expect(result.indicators).toContain("*.sln files");
  });

  it("detect finds .fsproj files", async () => {
    stubDir(["App.fsproj"]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.indicators).toContain("*.fsproj files");
  });

  it("detect finds .vbproj files", async () => {
    stubDir(["App.vbproj"]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.indicators).toContain("*.vbproj files");
  });
});

// ===========================================================================
// TypeScriptAdapter — analyze()
// ===========================================================================

describe("TypeScriptAdapter analyze()", () => {
  const adapter = new TypeScriptAdapter();

  beforeEach(() => {
    resetFsMocks();
  });

  it("analyzes TypeScript project with Vitest", async () => {
    stubFiles(REPO, ["tsconfig.json", "package.json", "src/index.ts"]);
    stubDir(["index.ts", "main.ts"]);

    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { "express": "^4.0.0" },
      devDependencies: { "typescript": "^5.0.0", "vitest": "^1.0.0", "@vitest/coverage-v8": "^1.0.0" },
      scripts: { start: "node dist/index.js", test: "vitest", build: "tsc" },
    }));

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("typescript");
    expect(result.testFramework).toBe("Vitest");
    expect(result.coverageToolDetected).toBe(true);
    expect(result.dependencies.total).toBe(4);
    expect(result.entryPoints).toContain("package.json#scripts.start");
    expect(result.entryPoints).toContain("src/index.ts");
  });

  it("analyzes TypeScript project with Jest", async () => {
    stubFiles(REPO, ["tsconfig.json", "package.json"]);
    stubDir(["index.ts"]);

    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { "typescript": "^5.0.0", "jest": "^29.0.0", "nyc": "^15.0.0" },
      scripts: { test: "jest" },
    }));

    const result = await adapter.analyze(REPO);

    expect(result.testFramework).toBe("Jest");
    expect(result.coverageToolDetected).toBe(true);
  });

  it("analyzes TypeScript project with Mocha", async () => {
    stubFiles(REPO, ["tsconfig.json", "package.json"]);
    stubDir(["app.ts"]);

    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { "typescript": "^5.0.0", "mocha": "^10.0.0", "c8": "^8.0.0" },
    }));

    const result = await adapter.analyze(REPO);

    expect(result.testFramework).toBe("Mocha");
    expect(result.coverageToolDetected).toBe(true);
  });

  it("handles missing package.json", async () => {
    stubFiles(REPO, ["tsconfig.json"]);
    stubDir(["app.ts"]);

    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("typescript");
    expect(result.testFramework).toBeNull();
    expect(result.coverageToolDetected).toBe(false);
    expect(result.dependencies.total).toBe(0);
  });

  it("detects pnpm and yarn package managers", async () => {
    // pnpm
    stubFiles(REPO, ["pnpm-lock.yaml", "package.json"]);
    let buildInfo = await adapter.getBuildInfo(REPO);
    expect(buildInfo.buildTool).toBe("pnpm");
    expect(buildInfo.buildCommand).toBe("pnpm build");

    // yarn
    stubFiles(REPO, ["yarn.lock", "package.json"]);
    buildInfo = await adapter.getBuildInfo(REPO);
    expect(buildInfo.buildTool).toBe("yarn");
    expect(buildInfo.buildCommand).toBe("yarn build");

    // npm (default)
    stubFiles(REPO, ["package-lock.json", "package.json"]);
    buildInfo = await adapter.getBuildInfo(REPO);
    expect(buildInfo.buildTool).toBe("npm");
  });

  it("detects CI, SAST, eslint-plugin-security, and secrets detection", async () => {
    stubFiles(REPO, [".github/workflows", ".semgrep.yml", ".gitleaks.toml", "package.json"]);
    stubDir([]);

    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { "eslint-plugin-security": "^1.0.0" },
    }));

    const result = await adapter.analyze(REPO);

    expect(result.hasCI).toBe(true);
    expect(result.hasSAST).toBe(true);
    expect(result.hasSecretsDetection).toBe(true);
  });

  it("detect returns high confidence for TS project", async () => {
    stubFiles(REPO, ["tsconfig.json", "package.json"]);
    stubDir(["index.ts"]);

    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { "typescript": "^5.0.0" },
    }));

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.indicators).toContain("tsconfig.json");
  });

  it("detect returns zero confidence for non-TS project", async () => {
    stubFiles(REPO, []);
    stubDir([]);
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("getCoverageConfig returns c8/Vitest config", () => {
    const config = adapter.getCoverageConfig();
    expect(config.tool).toContain("c8");
    expect(config.reportFormat).toBe("lcov");
  });

  it("getMutationConfig returns Stryker", () => {
    const config = adapter.getMutationConfig();
    expect(config.tool).toContain("Stryker");
    expect(config.supported).toBe(true);
  });

  it("getClaudeMdSection returns TypeScript guidelines", () => {
    const section = adapter.getClaudeMdSection();
    expect(section).toContain("TypeScript");
    expect(section).toContain("ESLint");
  });

  it("getCITemplateId returns typescript", () => {
    expect(adapter.getCITemplateId()).toBe("typescript");
  });
});

// ===========================================================================
// DelphiAdapter — analyze()
// ===========================================================================

describe("DelphiAdapter analyze()", () => {
  const adapter = new DelphiAdapter();

  beforeEach(() => {
    resetFsMocks();
  });

  it("analyzes Delphi project", async () => {
    stubFiles(REPO, []);
    stubDir(["MyApp.dpr", "Unit1.pas", "Unit2.pas", "Form1.dfm"]);

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("delphi");
    expect(result.testFramework).toBe("DUnit");
    expect(result.coverageToolDetected).toBe(false);
    expect(result.entryPoints).toContain("MyApp.dpr");
    expect(result.dependencies.total).toBe(3); // 2 pas + 1 dfm
  });

  it("handles read errors in entry point detection", async () => {
    stubFiles(REPO, []);
    mockReaddirSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("delphi");
    expect(result.entryPoints).toEqual([]);
    expect(result.dependencies.total).toBe(0);
  });

  it("detects CI and SAST files", async () => {
    stubFiles(REPO, [".github/workflows", "sonar-project.properties", ".gitleaks.toml"]);
    stubDir([]);

    const result = await adapter.analyze(REPO);

    expect(result.hasCI).toBe(true);
    expect(result.hasSAST).toBe(true);
    expect(result.hasSecretsDetection).toBe(true);
  });

  it("detect returns confidence for Delphi files", async () => {
    stubDir(["MyApp.dpr", "Unit.pas", "Form.dfm", "Package.dpk"]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(1); // caps at 1
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it("detect returns no detection for empty directory", async () => {
    stubDir([]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("getCoverageConfig returns DelphiCodeCoverage config", () => {
    const config = adapter.getCoverageConfig();
    expect(config.tool).toBe("DelphiCodeCoverage");
  });

  it("getMutationConfig returns unsupported", () => {
    const config = adapter.getMutationConfig();
    expect(config.supported).toBe(false);
  });

  it("getClaudeMdSection contains comprehension warning", () => {
    const section = adapter.getClaudeMdSection();
    expect(section).toContain("comprehension");
    expect(section).toContain("NOT a code generator");
  });

  it("getCITemplateId returns delphi", () => {
    expect(adapter.getCITemplateId()).toBe("delphi");
  });

  it("getBuildInfo returns RAD Studio info", async () => {
    const buildInfo = await adapter.getBuildInfo(REPO);
    expect(buildInfo.buildTool).toContain("RAD Studio");
    expect(buildInfo.lintCommand).toBeNull();
  });
});

// ===========================================================================
// FoxProAdapter — analyze()
// ===========================================================================

describe("FoxProAdapter analyze()", () => {
  const adapter = new FoxProAdapter();

  beforeEach(() => {
    resetFsMocks();
  });

  it("analyzes FoxPro project", async () => {
    stubDir(["main.prg", "form1.scx", "cls.vcx", "report.frx", "data.dbf", "project.pjx"]);
    stubFiles(REPO, []);

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("foxpro");
    expect(result.testFramework).toBeNull();
    expect(result.coverageToolDetected).toBe(false);
    expect(result.entryPoints).toContain("project.pjx");
    expect(result.dependencies.total).toBe(5); // prg + scx + vcx + frx + dbf
  });

  it("handles empty FoxPro project", async () => {
    stubDir([]);
    stubFiles(REPO, []);

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("foxpro");
    expect(result.entryPoints).toEqual([]);
    expect(result.dependencies.total).toBe(0);
  });

  it("handles readdirSync failure for entry points", async () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });
    stubFiles(REPO, []);

    const result = await adapter.analyze(REPO);

    expect(result.techStack).toBe("foxpro");
    expect(result.entryPoints).toEqual([]);
  });

  it("detects CI and secrets detection", async () => {
    stubDir(["azure-pipelines.yml"]);
    stubFiles(REPO, ["azure-pipelines.yml", ".pre-commit-config.yaml"]);

    const result = await adapter.analyze(REPO);

    expect(result.hasCI).toBe(true);
    expect(result.hasSAST).toBe(false);
    expect(result.hasSecretsDetection).toBe(true);
  });

  it("detect returns confidence for FoxPro files", async () => {
    stubDir(["main.prg", "form.scx", "cls.vcx", "report.frx", "project.pjx", "data.dbf"]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(1); // caps at 1
    expect(result.indicators.length).toBeGreaterThanOrEqual(3);
  });

  it("detect returns no detection for empty directory", async () => {
    stubDir([]);

    const result = await adapter.detect(REPO);

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("getCoverageConfig returns VFP SET COVERAGE", () => {
    const config = adapter.getCoverageConfig();
    expect(config.tool).toContain("VFP");
  });

  it("getMutationConfig returns unsupported", () => {
    const config = adapter.getMutationConfig();
    expect(config.supported).toBe(false);
  });

  it("getClaudeMdSection contains EOL warning", () => {
    const section = adapter.getClaudeMdSection();
    expect(section).toContain("end-of-life");
    expect(section).toContain("migration");
    expect(section).toContain("Do NOT generate new FoxPro code");
  });

  it("getCITemplateId returns foxpro", () => {
    expect(adapter.getCITemplateId()).toBe("foxpro");
  });

  it("getBuildInfo returns VFP IDE info", async () => {
    const buildInfo = await adapter.getBuildInfo(REPO);
    expect(buildInfo.buildTool).toContain("Visual FoxPro");
    expect(buildInfo.lintCommand).toBeNull();
  });

  it("getSecurityConfig returns limited tools", () => {
    const config = adapter.getSecurityConfig();
    expect(config.sastTools).toHaveLength(0);
    expect(config.secretsDetection).toBe("Gitleaks");
    expect(config.scaTools).toHaveLength(0);
  });
});
