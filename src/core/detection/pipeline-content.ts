/**
 * Reads all CI/CD pipeline content from a repository.
 * Supports GitHub Actions, GitLab CI, Jenkins, and Azure Pipelines.
 *
 * Used by both SecurityAnalyzer and CoverageAnalyzer to detect
 * tool references in CI pipeline configurations.
 */

import { readdir, readFile, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import { findAzurePipelineFiles } from "./pipeline-files.js";

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

/**
 * Concatenates all CI/CD pipeline file contents into a single string.
 * Returns empty string if no pipeline files are found or readable.
 */
export async function readPipelineContent(repoRoot: string): Promise<string> {
  const parts: string[] = [];

  const ghDir = join(repoRoot, ".github/workflows");
  if (await dirExists(ghDir)) {
    const entries = await readdir(ghDir);
    for (const entry of entries) {
      if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
        parts.push(await readFile(join(ghDir, entry), "utf-8"));
      }
    }
  }

  for (const name of [".gitlab-ci.yml", "Jenkinsfile"]) {
    const content = await readFileIfExists(join(repoRoot, name));
    if (content) parts.push(content);
  }

  for (const match of findAzurePipelineFiles(repoRoot)) {
    parts.push(await readFile(match.absolutePath, "utf-8"));
  }

  return parts.join("\n");
}
