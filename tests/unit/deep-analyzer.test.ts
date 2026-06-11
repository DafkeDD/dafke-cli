import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// Mock dependencies before importing the module under test
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../src/utils/claude-cli.js", () => ({
  invokeClaudePrompt: vi.fn(),
}));

import { runDeepAnalysis } from "../../src/core/analyzer/deep-analyzer.js";
import { readdir, readFile } from "node:fs/promises";
import { invokeClaudePrompt } from "../../src/utils/claude-cli.js";

const mockedReaddir = vi.mocked(readdir);
const mockedReadFile = vi.mocked(readFile);
const mockedInvoke = vi.mocked(invokeClaudePrompt);

// Helper to create a fake Dirent
function fakeDirent(name: string, parentPath: string, isFile = true): {
  name: string;
  parentPath: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
} {
  return {
    name,
    parentPath,
    isFile: () => isFile,
    isDirectory: () => !isFile,
  };
}

describe("runDeepAnalysis", () => {
  const repoRoot = "/fake/repo";
  const srcDir = join(repoRoot, "src");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no source files are found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedReaddir.mockResolvedValueOnce([] as any);
    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("returns null when readdir throws (directory does not exist)", async () => {
    mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("returns null when Claude returns null", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(null);

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("returns null when Claude returns invalid JSON", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce("not valid json at all");

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("returns null when Claude returns JSON with invalid enum values", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "extreme",
        errorHandlingQuality: "terrible",
        typeSafety: "none",
        qualitativeNotes: [],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("returns DeepAnalysisResult when Claude returns valid JSON", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      fakeDirent("utils.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    // Two readFile calls for the two source files
    mockedReadFile
      .mockResolvedValueOnce("const x = 1;\nconst y = 2;\n")
      .mockResolvedValueOnce("export function foo() { return 42; }\n");
    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "low",
        errorHandlingQuality: "good",
        typeSafety: "strong",
        qualitativeNotes: ["Well-structured code", "Good use of types"],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.codeComplexity).toBe("low");
    expect(result?.errorHandlingQuality).toBe("good");
    expect(result?.typeSafety).toBe("strong");
    expect(result?.qualitativeNotes).toEqual(["Well-structured code", "Good use of types"]);
    expect(result?.sampledFiles).toHaveLength(2);
  });

  it("samples at most 10 files", async () => {
    // Create 15 fake files
    const entries = Array.from({ length: 15 }, (_, i) =>
      fakeDirent(`file${i}.ts`, srcDir),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedReaddir.mockResolvedValueOnce(entries as any);

    // Each file read returns different line counts
    for (let i = 0; i < 15; i++) {
      const lines = Array.from({ length: (i + 1) * 10 }, (_, j) => `line ${j}`).join("\n");
      mockedReadFile.mockResolvedValueOnce(lines);
    }

    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "moderate",
        errorHandlingQuality: "adequate",
        typeSafety: "moderate",
        qualitativeNotes: [],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.sampledFiles).toHaveLength(10);
  });

  it("uses correct file extension for the tech stack", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("Main.java", srcDir),
      fakeDirent("index.ts", srcDir),  // should be excluded for java stack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("public class Main {}\n");
    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "low",
        errorHandlingQuality: "adequate",
        typeSafety: "strong",
        qualitativeNotes: [],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "java");
    expect(result).not.toBeNull();
    expect(result?.sampledFiles).toEqual(["Main.java"]);
  });

  it("excludes test files", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      fakeDirent("index.test.ts", srcDir),
      fakeDirent("utils.spec.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("export const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "low",
        errorHandlingQuality: "good",
        typeSafety: "strong",
        qualitativeNotes: [],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    // Only index.ts should be sampled, not the test/spec files
    expect(result?.sampledFiles).toEqual(["index.ts"]);
  });

  it("parses Claude response wrapped in markdown code fences", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      '```json\n{"codeComplexity":"low","errorHandlingQuality":"good","typeSafety":"strong","qualitativeNotes":["Clean code"]}\n```',
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.codeComplexity).toBe("low");
    expect(result?.errorHandlingQuality).toBe("good");
    expect(result?.typeSafety).toBe("strong");
    expect(result?.qualitativeNotes).toEqual(["Clean code"]);
  });

  it("parses Claude response wrapped in bare code fences (no language tag)", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      '```\n{"codeComplexity":"moderate","errorHandlingQuality":"adequate","typeSafety":"moderate","qualitativeNotes":[]}\n```',
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.codeComplexity).toBe("moderate");
  });

  it("handles Claude response with extra whitespace around fences", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      '  ```json\n{"codeComplexity":"high","errorHandlingQuality":"poor","typeSafety":"weak","qualitativeNotes":["Needs work"]}\n```  ',
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.codeComplexity).toBe("high");
  });

  it("returns null for completely empty Claude response", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce("");

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("returns null for partial/truncated JSON response", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce('{"codeComplexity":"low","errorHandli');

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).toBeNull();
  });

  it("excludes files under node_modules directories", async () => {
    mockedReaddir.mockResolvedValueOnce([
      fakeDirent("index.ts", srcDir),
      fakeDirent("helper.ts", join(srcDir, "node_modules/pkg")),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    mockedReadFile.mockResolvedValueOnce("export const x = 1;\n");
    mockedInvoke.mockResolvedValueOnce(
      JSON.stringify({
        codeComplexity: "low",
        errorHandlingQuality: "good",
        typeSafety: "strong",
        qualitativeNotes: [],
      }),
    );

    const result = await runDeepAnalysis(repoRoot, "typescript");
    expect(result).not.toBeNull();
    expect(result?.sampledFiles).toEqual(["index.ts"]);
  });
});
