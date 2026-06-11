import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  AZURE_PIPELINE_FILE_PATTERN,
  findAzurePipelineFiles,
  hasAzurePipeline,
} from "@/core/detection/pipeline-files.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pipeline-files-"));
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows: ignore EBUSY during cleanup; memory still freed when temp is reaped.
  }
});

/** Write a file, creating any parent directories. */
function writeFile(relativePath: string, content = ""): string {
  const full = join(tempDir, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

// ===========================================================================
// AZURE_PIPELINE_FILE_PATTERN — filename variants
// ===========================================================================

describe("AZURE_PIPELINE_FILE_PATTERN", () => {
  it("matches the canonical azure-pipelines.yml", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test("azure-pipelines.yml")).toBe(true);
  });

  it("matches the dot-prefixed .azure-pipelines.yml", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test(".azure-pipelines.yml")).toBe(true);
  });

  it("matches the .yaml extension variant", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test("azure-pipelines.yaml")).toBe(true);
  });

  it("matches the dot-prefixed .yaml variant", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test(".azure-pipelines.yaml")).toBe(true);
  });

  it("does not match unrelated yml files", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test("ci.yml")).toBe(false);
    expect(AZURE_PIPELINE_FILE_PATTERN.test("pipelines.yml")).toBe(false);
    expect(AZURE_PIPELINE_FILE_PATTERN.test("azure-pipeline.yml")).toBe(false); // singular
  });

  it("does not match files with extra suffix", () => {
    expect(AZURE_PIPELINE_FILE_PATTERN.test("azure-pipelines.yml.bak")).toBe(false);
    expect(AZURE_PIPELINE_FILE_PATTERN.test("my-azure-pipelines.yml")).toBe(false);
  });
});

// ===========================================================================
// findAzurePipelineFiles — root-level filename variants
// ===========================================================================

describe("findAzurePipelineFiles — filename variants at root", () => {
  it("finds azure-pipelines.yml at repo root", () => {
    writeFile("azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("azure-pipelines.yml");
  });

  it("finds .azure-pipelines.yml (dot-prefixed) at repo root", () => {
    writeFile(".azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe(".azure-pipelines.yml");
  });

  it("finds azure-pipelines.yaml at repo root", () => {
    writeFile("azure-pipelines.yaml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
  });

  it("finds .azure-pipelines.yaml at repo root", () => {
    writeFile(".azure-pipelines.yaml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
  });

  it("returns all four variants if all are present", () => {
    writeFile("azure-pipelines.yml");
    writeFile(".azure-pipelines.yml");
    writeFile("azure-pipelines.yaml");
    writeFile(".azure-pipelines.yaml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(4);
  });
});

// ===========================================================================
// findAzurePipelineFiles — subfolder search
// ===========================================================================

describe("findAzurePipelineFiles — subfolder search", () => {
  it("finds pipelines in one-level subfolders", () => {
    writeFile("ci/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("ci/azure-pipelines.yml");
  });

  it("finds pipelines in deeply-nested subfolders within maxDepth", () => {
    writeFile("infra/pipelines/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("infra/pipelines/azure-pipelines.yml");
  });

  it("does not descend beyond maxDepth", () => {
    writeFile("a/b/c/d/e/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir, { maxDepth: 2 });
    expect(result).toHaveLength(0);
  });

  it("maxDepth boundary: exactly at depth N is reached, N+1 is not", () => {
    // Depth 1 — file is inside "ci/", accessed when walker is at depth 0.
    writeFile("ci/azure-pipelines.yml");
    // Depth 2 — file is inside "a/b/", accessed when walker is at depth 1.
    writeFile("a/b/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir, { maxDepth: 1 });
    expect(result.map((r) => r.displayName).sort()).toEqual(["ci/azure-pipelines.yml"]);
  });

  it("maxDepth=0 only scans the repo root, no subfolders", () => {
    writeFile("azure-pipelines.yml");
    writeFile("ci/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir, { maxDepth: 0 });
    expect(result.map((r) => r.displayName)).toEqual(["azure-pipelines.yml"]);
  });

  it("ignores node_modules by default", () => {
    writeFile("node_modules/some-pkg/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(0);
  });

  it("ignores .git directory by default", () => {
    writeFile(".git/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(0);
  });

  it("ignores dist/build/coverage/out directories by default", () => {
    writeFile("dist/azure-pipelines.yml");
    writeFile("build/azure-pipelines.yml");
    writeFile("coverage/azure-pipelines.yml");
    writeFile("out/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(0);
  });

  // Every name in DEFAULT_IGNORED_DIRS must actually be skipped. This
  // parameterized test prevents silent drift if the set is edited.
  const DEFAULT_IGNORED = [
    ".git",
    ".hg",
    ".svn",
    ".cache",
    ".next",
    ".nuxt",
    ".turbo",
    ".parcel-cache",
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    "target",
    "bin",
    "obj",
    ".gradle",
    ".idea",
    ".vscode",
    ".venv",
    "venv",
    "__pycache__",
  ];
  it.each(DEFAULT_IGNORED)("ignores %s by default", (dirName) => {
    writeFile(`${dirName}/azure-pipelines.yml`);
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(0);
  });

  it("combines root + subfolder matches", () => {
    writeFile("azure-pipelines.yml");
    writeFile("ci/azure-pipelines.yml");
    writeFile("infra/pipelines/.azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(3);
    const names = result.map((r) => r.displayName).sort();
    expect(names).toEqual([
      "azure-pipelines.yml",
      "ci/azure-pipelines.yml",
      "infra/pipelines/.azure-pipelines.yml",
    ].sort());
  });
});

// ===========================================================================
// findAzurePipelineFiles — .azure-pipelines/ directory convention
// ===========================================================================

describe("findAzurePipelineFiles — .azure-pipelines/ directory", () => {
  it("includes all .yml files inside .azure-pipelines/", () => {
    writeFile(".azure-pipelines/build.yml");
    writeFile(".azure-pipelines/deploy.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.displayName).sort();
    expect(names).toEqual([
      ".azure-pipelines/build.yml",
      ".azure-pipelines/deploy.yml",
    ]);
  });

  it("includes .yaml files inside .azure-pipelines/", () => {
    writeFile(".azure-pipelines/release.yaml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(1);
  });

  it("ignores non-YAML files inside .azure-pipelines/", () => {
    writeFile(".azure-pipelines/README.md");
    writeFile(".azure-pipelines/script.ps1");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// findAzurePipelineFiles — edge cases
// ===========================================================================

describe("findAzurePipelineFiles — edge cases", () => {
  it("returns empty array for an empty repo", () => {
    expect(findAzurePipelineFiles(tempDir)).toEqual([]);
  });

  it("returns empty array for a non-existent directory without throwing", () => {
    expect(findAzurePipelineFiles(join(tempDir, "nope"))).toEqual([]);
  });

  it("does not return random unrelated yml files", () => {
    writeFile("docker-compose.yml");
    writeFile("some-other.yaml");
    writeFile("config.yml");
    const result = findAzurePipelineFiles(tempDir);
    expect(result).toEqual([]);
  });

  it("honors custom ignoredDirs option", () => {
    writeFile("custom-ignore/azure-pipelines.yml");
    const result = findAzurePipelineFiles(tempDir, {
      ignoredDirs: new Set(["custom-ignore"]),
    });
    expect(result).toHaveLength(0);
  });

  it("each result includes a usable absolutePath", () => {
    const absolute = writeFile("azure-pipelines.yml", "content");
    const result = findAzurePipelineFiles(tempDir);
    expect(result[0].absolutePath).toBe(absolute);
  });
});

// ===========================================================================
// hasAzurePipeline
// ===========================================================================

describe("hasAzurePipeline", () => {
  it("returns true when a pipeline file is found at root", () => {
    writeFile("azure-pipelines.yml");
    expect(hasAzurePipeline(tempDir)).toBe(true);
  });

  it("returns true for the dot-prefixed variant", () => {
    writeFile(".azure-pipelines.yml");
    expect(hasAzurePipeline(tempDir)).toBe(true);
  });

  it("returns true when pipeline is in a subfolder", () => {
    writeFile("ci/azure-pipelines.yml");
    expect(hasAzurePipeline(tempDir)).toBe(true);
  });

  it("returns true when .azure-pipelines/ directory contains yml files", () => {
    writeFile(".azure-pipelines/build.yml");
    expect(hasAzurePipeline(tempDir)).toBe(true);
  });

  it("returns false for an empty repo", () => {
    expect(hasAzurePipeline(tempDir)).toBe(false);
  });

  it("returns false when only unrelated yml files exist", () => {
    writeFile("docker-compose.yml");
    writeFile(".github/workflows/ci.yml");
    expect(hasAzurePipeline(tempDir)).toBe(false);
  });
});
