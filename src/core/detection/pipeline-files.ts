import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Matches Azure Pipelines YAML filenames.
 *
 * Azure DevOps accepts all four of these as valid default pipeline filenames:
 *   - azure-pipelines.yml      (canonical)
 *   - azure-pipelines.yaml     (alternate extension)
 *   - .azure-pipelines.yml     (hidden-file convention)
 *   - .azure-pipelines.yaml    (hidden + alternate extension)
 */
export const AZURE_PIPELINE_FILE_PATTERN = /^\.?azure-pipelines\.ya?ml$/;

/** Directory name reserved by Azure DevOps for multi-pipeline layouts. */
const AZURE_PIPELINE_DIR = ".azure-pipelines";

/** Maximum walk depth from the repo root. */
const DEFAULT_MAX_DEPTH = 4;

/**
 * Directories that are never searched. Covers the common build-output, cache,
 * and VCS folders — searching them produces noise and is slow on large trees.
 */
const DEFAULT_IGNORED_DIRS = new Set([
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
]);

export interface FindAzurePipelineOptions {
  /** Maximum depth to recurse from `repoRoot`. Defaults to 4. */
  maxDepth?: number;
  /** Directory basenames to skip entirely. Defaults to common build/VCS folders. */
  ignoredDirs?: Set<string>;
}

export interface PipelineFileMatch {
  /** Absolute path to the pipeline file. */
  absolutePath: string;
  /** Path relative to `repoRoot`, normalized to forward slashes. */
  displayName: string;
}

function toDisplayName(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath).split(sep).join("/");
}

function isYamlFile(name: string): boolean {
  return name.endsWith(".yml") || name.endsWith(".yaml");
}

/**
 * Find Azure Pipelines YAML files anywhere under `repoRoot`.
 *
 * Searches both:
 *   - Files matching {@link AZURE_PIPELINE_FILE_PATTERN} at any depth up to `maxDepth`.
 *   - All `.yml` / `.yaml` files inside any `.azure-pipelines/` directory
 *     encountered during the walk (Azure's multi-pipeline convention).
 *
 * Silently returns `[]` if `repoRoot` does not exist — this mirrors the
 * existence-check semantics of the call sites it replaces.
 */
export function findAzurePipelineFiles(
  repoRoot: string,
  options: FindAzurePipelineOptions = {},
): PipelineFileMatch[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const ignored = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const results: PipelineFileMatch[] = [];

  function walk(dir: string, depth: number): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        if (ignored.has(entry)) continue;
        if (entry === AZURE_PIPELINE_DIR) {
          collectAzureDir(fullPath);
          continue;
        }
        if (depth >= maxDepth) continue;
        walk(fullPath, depth + 1);
      } else if (stats.isFile() && AZURE_PIPELINE_FILE_PATTERN.test(entry)) {
        results.push({
          absolutePath: fullPath,
          displayName: toDisplayName(repoRoot, fullPath),
        });
      }
    }
  }

  function collectAzureDir(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!isYamlFile(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        if (!statSync(fullPath).isFile()) continue;
      } catch {
        continue;
      }
      results.push({
        absolutePath: fullPath,
        displayName: toDisplayName(repoRoot, fullPath),
      });
    }
  }

  walk(repoRoot, 0);
  return results;
}

/** True when the repo contains at least one Azure Pipelines YAML file. */
export function hasAzurePipeline(repoRoot: string): boolean {
  return findAzurePipelineFiles(repoRoot).length > 0;
}
