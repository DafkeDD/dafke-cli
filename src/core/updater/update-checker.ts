import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../../index.js";
import { atomicWrite } from "../../utils/fs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftResult {
  filePath: string;
  type: "missing" | "modified";
  diff?: string;
  templateContent: string;
}

// ---------------------------------------------------------------------------
// Template file mappings — generated files and their template source
// ---------------------------------------------------------------------------

const TEMPLATE_MAP: Record<string, string> = {
  ".claude/settings.json": "settings/claude-settings.json",
  "lefthook.yml": "hooks/lefthook.yml",
};

// ---------------------------------------------------------------------------
// UpdateChecker
// ---------------------------------------------------------------------------

export class UpdateChecker {
  /**
   * Check npm registry for a newer version of dafke.
   * Returns the latest version string, or null if we are up-to-date or
   * the check fails (network error, etc.).
   */
  async checkForUpdates(): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        "https://registry.npmjs.org/dafke/latest",
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = (await response.json()) as { version?: string };
      const latest = data.version;

      if (!latest) return null;
      if (latest === VERSION) return null;

      return latest;
    } catch {
      // Network error, timeout, etc. — silently return null
      return null;
    }
  }

  /**
   * Compare generated files in the repo against their source templates.
   * Returns a list of files that have drifted from the templates.
   */
  async detectDrift(repoRoot: string): Promise<DriftResult[]> {
    const results: DriftResult[] = [];
    const templatesDir = this.findTemplatesDir();

    if (!templatesDir) {
      return results;
    }

    for (const [repoFile, templateFile] of Object.entries(TEMPLATE_MAP)) {
      const repoPath = join(repoRoot, repoFile);
      const templatePath = join(templatesDir, templateFile);

      if (!existsSync(templatePath)) continue;

      const rawTemplate = readFileSync(templatePath, "utf-8");
      const templateContent = rawTemplate.replace(/\{\{version\}\}/g, VERSION);

      if (!existsSync(repoPath)) {
        results.push({
          filePath: repoFile,
          type: "missing",
          templateContent,
        });
        continue;
      }

      const currentContent = readFileSync(repoPath, "utf-8");

      if (currentContent.trim() !== templateContent.trim()) {
        const diff = this.simpleDiff(currentContent, templateContent);
        results.push({
          filePath: repoFile,
          type: "modified",
          diff,
          templateContent,
        });
      }
    }

    return results;
  }

  /**
   * Apply template updates to the repo, writing or overwriting files.
   */
  async applyUpdate(repoRoot: string, changes: DriftResult[]): Promise<void> {
    for (const change of changes) {
      const targetPath = join(repoRoot, change.filePath);
      const resolved = change.templateContent.replace(/\{\{version\}\}/g, VERSION);
      await atomicWrite(targetPath, resolved);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private findTemplatesDir(): string | null {
    // Walk up from this file to find the templates/ directory in the project root
    const candidates = [
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "templates"),
      join(process.cwd(), "templates"),
      join(process.cwd(), "node_modules", "dafke", "templates"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private simpleDiff(current: string, template: string): string {
    const currentLines = current.split("\n");
    const templateLines = template.split("\n");
    const diffLines: string[] = [];

    const maxLen = Math.max(currentLines.length, templateLines.length);

    for (let i = 0; i < maxLen; i++) {
      const c = currentLines[i];
      const t = templateLines[i];

      if (c === t) {
        if (c !== undefined) {
          diffLines.push(` ${c}`);
        }
      } else {
        if (c !== undefined) {
          diffLines.push(`-${c}`);
        }
        if (t !== undefined) {
          diffLines.push(`+${t}`);
        }
      }
    }

    return diffLines.join("\n");
  }
}
