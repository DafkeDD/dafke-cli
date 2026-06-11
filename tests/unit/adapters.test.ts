import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock node:fs BEFORE importing adapters
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { JavaAdapter } from "@/adapters/java/adapter.js";
import { DotNetAdapter } from "@/adapters/dotnet/adapter.js";
import { TypeScriptAdapter } from "@/adapters/typescript/adapter.js";
import { PythonAdapter } from "@/adapters/python/adapter.js";
import { DelphiAdapter } from "@/adapters/delphi/adapter.js";
import { FoxProAdapter } from "@/adapters/foxpro/adapter.js";

// Typed mocks
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

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

// Ensure template passthrough is always active (TemplateEngine needs real file reads)
beforeEach(() => {
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
});

/** Configure existsSync to return true only for listed paths.
 *  Passes through to real fs for template paths (used by TemplateEngine). */
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
}

/** Configure readdirSync to return listed filenames. */
function stubDir(filenames: string[]): void {
  mockReaddirSync.mockReturnValue(filenames as unknown as ReturnType<typeof readdirSync>);
}

const REPO = "/test/repo";

// ---------------------------------------------------------------------------
// Java Adapter
// ---------------------------------------------------------------------------

describe("JavaAdapter", () => {
  let adapter: JavaAdapter;

  beforeEach(() => {
    adapter = new JavaAdapter();
  });

  describe("detect", () => {
    it("detects pom.xml", async () => {
      stubFiles(REPO, ["pom.xml"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.indicators).toContain("pom.xml");
    });

    it("detects build.gradle", async () => {
      stubFiles(REPO, ["build.gradle"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("build.gradle");
    });

    it("detects build.gradle.kts", async () => {
      stubFiles(REPO, ["build.gradle.kts"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("build.gradle.kts");
    });

    it("detects *.java files", async () => {
      stubFiles(REPO, []);
      stubDir(["Main.java", "App.java"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.java files");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("configs", () => {
    it("returns JaCoCo coverage config", () => {
      const config = adapter.getCoverageConfig();

      expect(config.tool).toBe("JaCoCo");
      expect(config.reportFormat).toBe("cobertura");
    });

    it("returns PIT mutation config with supported=true", () => {
      const config = adapter.getMutationConfig();

      expect(config.tool).toContain("PIT");
      expect(config.supported).toBe(true);
    });

    it("returns Semgrep and CodeQL for SAST", () => {
      const config = adapter.getSecurityConfig();

      expect(config.sastTools).toContain("Semgrep");
      expect(config.sastTools).toContain("CodeQL");
      expect(config.secretsDetection).toBe("Gitleaks");
    });
  });
});

// ---------------------------------------------------------------------------
// .NET Adapter
// ---------------------------------------------------------------------------

describe("DotNetAdapter", () => {
  let adapter: DotNetAdapter;

  beforeEach(() => {
    adapter = new DotNetAdapter();
  });

  describe("detect", () => {
    it("detects *.csproj files", async () => {
      stubFiles(REPO, []);
      stubDir(["MyApp.csproj"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.indicators).toContain("*.csproj files");
    });

    it("detects *.sln files", async () => {
      stubFiles(REPO, []);
      stubDir(["Solution.sln"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.sln files");
    });

    it("detects *.fsproj files", async () => {
      stubFiles(REPO, []);
      stubDir(["App.fsproj"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.fsproj files");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("configs", () => {
    it("returns Coverlet coverage config with cobertura format", () => {
      const config = adapter.getCoverageConfig();

      expect(config.tool).toBe("Coverlet");
      expect(config.reportFormat).toBe("cobertura");
    });

    it("returns Stryker.NET mutation config", () => {
      const config = adapter.getMutationConfig();

      expect(config.tool).toBe("Stryker.NET");
      expect(config.supported).toBe(true);
    });

    it("returns Semgrep and CodeQL for SAST", () => {
      const config = adapter.getSecurityConfig();

      expect(config.sastTools).toContain("Semgrep");
      expect(config.sastTools).toContain("CodeQL");
      expect(config.secretsDetection).toBe("Gitleaks");
    });
  });
});

// ---------------------------------------------------------------------------
// TypeScript Adapter
// ---------------------------------------------------------------------------

describe("TypeScriptAdapter", () => {
  let adapter: TypeScriptAdapter;

  beforeEach(() => {
    adapter = new TypeScriptAdapter();
  });

  describe("detect", () => {
    it("detects tsconfig.json", async () => {
      stubFiles(REPO, ["tsconfig.json"]);
      stubDir([]);
      // readFileSync for package.json will throw (not mocked) — that's fine
      mockReadFileSync.mockImplementation(() => {
        throw new Error("not found");
      });

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("tsconfig.json");
    });

    it("detects package.json with typescript dependency", async () => {
      stubFiles(REPO, ["package.json"]);
      stubDir([]);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          devDependencies: { typescript: "^5.0.0" },
        }),
      );

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain(
        "package.json (typescript dependency)",
      );
    });

    it("detects *.ts files", async () => {
      stubFiles(REPO, []);
      stubDir(["index.ts", "utils.ts"]);
      mockReadFileSync.mockImplementation(() => {
        throw new Error("not found");
      });

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.ts files");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);
      mockReadFileSync.mockImplementation(() => {
        throw new Error("not found");
      });

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("configs", () => {
    it("returns c8/Vitest coverage config with lcov format", () => {
      const config = adapter.getCoverageConfig();

      expect(config.tool).toContain("c8");
      expect(config.reportFormat).toBe("lcov");
    });

    it("returns Stryker Mutator config", () => {
      const config = adapter.getMutationConfig();

      expect(config.tool).toBe("Stryker Mutator");
      expect(config.supported).toBe(true);
    });

    it("returns Semgrep and eslint-plugin-security for SAST", () => {
      const config = adapter.getSecurityConfig();

      expect(config.sastTools).toContain("Semgrep");
      expect(config.sastTools).toContain("eslint-plugin-security");
      expect(config.secretsDetection).toBe("Gitleaks");
    });
  });
});

// ---------------------------------------------------------------------------
// Python Adapter
// ---------------------------------------------------------------------------

describe("PythonAdapter", () => {
  let adapter: PythonAdapter;

  beforeEach(() => {
    adapter = new PythonAdapter();
  });

  describe("detect", () => {
    it("detects pyproject.toml", async () => {
      stubFiles(REPO, ["pyproject.toml"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.indicators).toContain("pyproject.toml");
    });

    it("detects setup.py", async () => {
      stubFiles(REPO, ["setup.py"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("setup.py");
    });

    it("detects requirements.txt", async () => {
      stubFiles(REPO, ["requirements.txt"]);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("requirements.txt");
    });

    it("detects *.py files", async () => {
      stubFiles(REPO, []);
      stubDir(["main.py", "utils.py"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.py files");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("configs", () => {
    it("returns coverage.py config with cobertura format", () => {
      const config = adapter.getCoverageConfig();

      expect(config.tool).toContain("coverage.py");
      expect(config.reportFormat).toBe("cobertura");
      expect(config.reportPath).toBe("coverage.xml");
    });

    it("returns mutmut mutation config with supported=true", () => {
      const config = adapter.getMutationConfig();

      expect(config.tool).toBe("mutmut");
      expect(config.supported).toBe(true);
    });

    it("returns Bandit and Semgrep for SAST", () => {
      const config = adapter.getSecurityConfig();

      expect(config.sastTools).toContain("Bandit");
      expect(config.sastTools).toContain("Semgrep");
      expect(config.secretsDetection).toBe("Gitleaks");
      expect(config.scaTools).toContain("pip-audit");
    });

    it("CI template id is 'python'", () => {
      expect(adapter.getCITemplateId()).toBe("python");
    });
  });

  describe("getBuildInfo", () => {
    it("prefers poetry when poetry.lock present", async () => {
      stubFiles(REPO, ["poetry.lock"]);

      const info = await adapter.getBuildInfo(REPO);

      expect(info.buildTool).toBe("poetry");
      expect(info.testCommand).toBe("poetry run pytest");
    });

    it("uses pipenv when Pipfile.lock present", async () => {
      stubFiles(REPO, ["Pipfile.lock"]);

      const info = await adapter.getBuildInfo(REPO);

      expect(info.buildTool).toBe("pipenv");
    });

    it("falls back to pip for requirements-only repos", async () => {
      stubFiles(REPO, ["requirements.txt"]);

      const info = await adapter.getBuildInfo(REPO);

      expect(info.buildTool).toBe("pip");
      expect(info.testCommand).toBe("pytest");
    });
  });
});

// ---------------------------------------------------------------------------
// Delphi Adapter
// ---------------------------------------------------------------------------

describe("DelphiAdapter", () => {
  let adapter: DelphiAdapter;

  beforeEach(() => {
    adapter = new DelphiAdapter();
  });

  describe("detect", () => {
    it("detects *.dpr files", async () => {
      stubFiles(REPO, []);
      stubDir(["Project1.dpr"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.dpr files (Delphi project)");
    });

    it("detects *.pas files", async () => {
      stubFiles(REPO, []);
      stubDir(["Unit1.pas"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.pas files (Pascal units)");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
    });
  });

  describe("configs", () => {
    it("mutation testing is NOT supported", () => {
      const config = adapter.getMutationConfig();

      expect(config.supported).toBe(false);
      expect(config.tool).toBe("none");
    });

    it("returns DelphiCodeCoverage for coverage", () => {
      const config = adapter.getCoverageConfig();

      expect(config.tool).toBe("DelphiCodeCoverage");
    });

    it("returns SonarQube and Pascal Analyzer for SAST", () => {
      const config = adapter.getSecurityConfig();

      expect(config.sastTools).toContain("SonarQube (Delphi plugin)");
      expect(config.sastTools).toContain("Pascal Analyzer");
    });

    it("CLAUDE.md section mentions comprehension-only mode", () => {
      const section = adapter.getClaudeMdSection();

      expect(section).toContain("comprehension");
      expect(section).toContain("NOT a code generator");
    });
  });
});

// ---------------------------------------------------------------------------
// FoxPro Adapter
// ---------------------------------------------------------------------------

describe("FoxProAdapter", () => {
  let adapter: FoxProAdapter;

  beforeEach(() => {
    adapter = new FoxProAdapter();
  });

  describe("detect", () => {
    it("detects *.prg files", async () => {
      stubFiles(REPO, []);
      stubDir(["main.prg"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.prg files (FoxPro programs)");
    });

    it("detects *.scx files", async () => {
      stubFiles(REPO, []);
      stubDir(["form1.scx"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.scx files (FoxPro forms)");
    });

    it("detects *.dbf files", async () => {
      stubFiles(REPO, []);
      stubDir(["data.dbf"]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(true);
      expect(result.indicators).toContain("*.dbf files (FoxPro tables)");
    });

    it("returns not detected for empty directory", async () => {
      stubFiles(REPO, []);
      stubDir([]);

      const result = await adapter.detect(REPO);

      expect(result.detected).toBe(false);
    });
  });

  describe("configs", () => {
    it("mutation testing is NOT supported", () => {
      const config = adapter.getMutationConfig();

      expect(config.supported).toBe(false);
      expect(config.tool).toBe("none");
    });

    it("security config has Gitleaks only", () => {
      const config = adapter.getSecurityConfig();

      expect(config.secretsDetection).toBe("Gitleaks");
      expect(config.sastTools).toEqual([]);
    });

    it("CLAUDE.md section mentions end-of-life", () => {
      const section = adapter.getClaudeMdSection();

      expect(section).toContain("end-of-life");
      expect(section).toContain("Do NOT generate new FoxPro code");
    });

    it("CLAUDE.md section mentions migration", () => {
      const section = adapter.getClaudeMdSection();

      expect(section).toContain("migration");
      expect(section).toContain("business logic extraction");
    });
  });
});
