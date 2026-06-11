import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Check if a file with the given name exists directly under repoRoot. */
export function hasFile(repoRoot: string, filename: string): boolean {
  return existsSync(join(repoRoot, filename));
}

/** Check root directory for any file matching the extension. */
export function hasFileWithExtension(dir: string, ext: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith(ext));
  } catch {
    return false;
  }
}

/** Check one level of subdirectories for any file matching the extension. */
export function hasFileShallow(dir: string, ext: string): boolean {
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory() && hasFileWithExtension(fullPath, ext)) {
          return true;
        }
      } catch { /* skip inaccessible dirs */ }
    }
    return false;
  } catch {
    return false;
  }
}

/** Read file contents or return null if it doesn't exist. */
export function readFileOrNull(repoRoot: string, filename: string): string | null {
  try {
    return readFileSync(join(repoRoot, filename), "utf-8");
  } catch {
    return null;
  }
}

/** Clamp accumulated confidence to maximum 1.0. Individual indicators may sum > 1. */
export function clampConfidence(raw: number): number {
  return Math.min(raw, 1);
}
