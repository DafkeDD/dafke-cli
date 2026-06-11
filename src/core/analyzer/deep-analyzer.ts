/**
 * AI-powered deep code analysis.
 *
 * Samples source files and invokes Claude Code CLI for qualitative
 * assessment of code complexity, error handling, and type safety.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { invokeClaudePrompt } from "../../utils/claude-cli.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeepAnalysisResult {
  codeComplexity: "low" | "moderate" | "high";
  errorHandlingQuality: "poor" | "adequate" | "good";
  typeSafety: "weak" | "moderate" | "strong";
  qualitativeNotes: string[];
  sampledFiles: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXT_MAP: Record<string, string> = {
  typescript: ".ts",
  java: ".java",
  dotnet: ".cs",
  delphi: ".pas",
  foxpro: ".prg",
};

/** Excluded directory segments — files under these paths are skipped. */
const EXCLUDED_DIRS = ["node_modules", "dist", "build", "target", ".git"];

/** Excluded file patterns — test and spec files. */
function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[^.]+$/.test(filePath);
}

/**
 * Recursively collect source files matching the target extension.
 * Uses Node 20+ recursive readdir to avoid external dependencies.
 */
async function collectSourceFiles(
  rootDir: string,
  targetExt: string,
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      // Reconstruct relative path from parentPath (Node 20.12+) or name
      const parentPath = (entry as { parentPath?: string }).parentPath ?? rootDir;
      const relativePath = parentPath === rootDir
        ? entry.name
        : join(parentPath.slice(rootDir.length + 1), entry.name);

      // Skip excluded directories
      const parts = relativePath.split("/");
      if (parts.some((p) => EXCLUDED_DIRS.includes(p))) continue;

      // Match extension and exclude tests
      if (extname(entry.name) !== targetExt) continue;
      if (isTestFile(entry.name)) continue;

      results.push(relativePath);
    }
  } catch {
    // Directory may not exist — return empty
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/**
 * Run AI-powered deep analysis on source files.
 *
 * Samples up to 10 of the largest source files, sends the first 150 lines
 * of each to Claude Code CLI, and parses the qualitative result.
 *
 * @returns DeepAnalysisResult or null if analysis is not possible
 */
export async function runDeepAnalysis(
  repoRoot: string,
  techStack: string,
): Promise<DeepAnalysisResult | null> {
  const targetExt = EXT_MAP[techStack] ?? ".ts";
  const srcDir = join(repoRoot, "src");

  const files = await collectSourceFiles(srcDir, targetExt);
  if (files.length === 0) return null;

  // Read file contents and sort by line count (largest first)
  const fileStats = await Promise.all(
    files.map(async (f) => {
      const content = await readFile(join(srcDir, f), "utf-8");
      return { path: f, lines: content.split("\n").length, content };
    }),
  );
  fileStats.sort((a, b) => b.lines - a.lines);

  // Sample up to 10 files (prefer larger ones for richer analysis)
  const sampled = fileStats.slice(0, 10);

  // Build prompt with first 150 lines of each file
  const fileContents = sampled
    .map((f) => `--- ${f.path} (${f.lines} lines) ---\n${f.content.split("\n").slice(0, 150).join("\n")}`)
    .join("\n\n");

  const prompt = `Analyze these source code samples for code quality. Assess:
1. Code complexity: Are functions reasonably sized (<50 lines)? Deeply nested?
2. Error handling: Are errors caught and handled properly?
3. Type safety: Strong typing used? Any unsafe patterns?

Respond ONLY with valid JSON (no markdown fences):
{"codeComplexity":"low|moderate|high","errorHandlingQuality":"poor|adequate|good","typeSafety":"weak|moderate|strong","qualitativeNotes":["note1","note2"]}

Files:
${fileContents}`;

  const rawResult = await invokeClaudePrompt(prompt, { timeout: 45_000 });
  if (!rawResult) return null;

  // Strip markdown code fences if present (Claude often wraps JSON in ```json ... ```)
  const result = rawResult
    .replace(/^\s*```(?:json)?\s*\n?/m, "")
    .replace(/\n?\s*```\s*$/m, "")
    .trim();

  try {
    const parsed = JSON.parse(result) as {
      codeComplexity?: string;
      errorHandlingQuality?: string;
      typeSafety?: string;
      qualitativeNotes?: string[];
    };

    // Validate expected shape before returning
    const validComplexity = ["low", "moderate", "high"];
    const validErrorHandling = ["poor", "adequate", "good"];
    const validTypeSafety = ["weak", "moderate", "strong"];

    if (
      !parsed.codeComplexity ||
      !validComplexity.includes(parsed.codeComplexity) ||
      !parsed.errorHandlingQuality ||
      !validErrorHandling.includes(parsed.errorHandlingQuality) ||
      !parsed.typeSafety ||
      !validTypeSafety.includes(parsed.typeSafety)
    ) {
      return null;
    }

    return {
      codeComplexity: parsed.codeComplexity as DeepAnalysisResult["codeComplexity"],
      errorHandlingQuality: parsed.errorHandlingQuality as DeepAnalysisResult["errorHandlingQuality"],
      typeSafety: parsed.typeSafety as DeepAnalysisResult["typeSafety"],
      qualitativeNotes: Array.isArray(parsed.qualitativeNotes) ? parsed.qualitativeNotes : [],
      sampledFiles: sampled.map((f) => f.path),
    };
  } catch {
    return null;
  }
}
