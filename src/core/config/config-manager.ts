import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  GlobalConfigSchema,
  RepoManifestSchema,
  WizardStateSchema,
  type GlobalConfig,
  type RepoManifest,
  type WizardState,
} from "./config-schema.js";
import { RulesSchema, type Rules } from "./rules-schema.js";
import { atomicWrite } from "../../utils/fs.js";
import {
  runMigrations,
  backupManifest,
  logMigration,
  restoreManifest,
} from "./schema-migration.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_NAME = "dafke";
const GLOBAL_CONFIG_FILE = "config.yaml";
const REPO_DIR = ".dafke";
const REPO_MANIFEST_FILE = "manifest.yaml";
const REPO_STATE_FILE = "state.json";

/**
 * Resolves the platform-aware config directory for Dafke.
 *
 * Uses `env-paths` which maps to:
 *   - macOS:   ~/Library/Preferences/dafke
 *   - Linux:   ~/.config/dafke   (XDG)
 *   - Windows: %APPDATA%/dafke
 */
function getGlobalConfigDir(): string {
  const paths = envPaths(APP_NAME, { suffix: "" });
  return paths.config;
}

/** Deep-merge two plain objects. `override` wins. Arrays are replaced, not concatenated. */
export function mergeConfigs(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(override)) {
    const overrideVal = override[key];

    // Skip undefined values in the override
    if (overrideVal === undefined) {
      continue;
    }

    const baseVal = base[key];

    if (
      isPlainObject(baseVal) &&
      isPlainObject(overrideVal)
    ) {
      result[key] = mergeConfigs(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      result[key] = overrideVal;
    }
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

export class ConfigManager {
  private readonly globalConfigDir: string;

  constructor(globalConfigDir?: string) {
    this.globalConfigDir = globalConfigDir ?? getGlobalConfigDir();
  }

  // -----------------------------------------------------------------------
  // Path helpers
  // -----------------------------------------------------------------------

  /** Returns platform-aware paths for the global config and the current repo config. */
  getConfigPaths(repoRoot?: string): { global: string; repo: string } {
    return {
      global: join(this.globalConfigDir, GLOBAL_CONFIG_FILE),
      repo: join(repoRoot ?? process.cwd(), REPO_DIR, REPO_MANIFEST_FILE),
    };
  }

  getStatePath(repoRoot?: string): string {
    return join(repoRoot ?? process.cwd(), REPO_DIR, REPO_STATE_FILE);
  }

  // -----------------------------------------------------------------------
  // Global config
  // -----------------------------------------------------------------------

  /**
   * Load the global user config.
   *
   * Returns schema defaults when the file does not exist yet.
   * Throws on invalid YAML or schema validation failure.
   */
  async loadGlobalConfig(): Promise<GlobalConfig> {
    const filePath = join(this.globalConfigDir, GLOBAL_CONFIG_FILE);

    if (!existsSync(filePath)) {
      return GlobalConfigSchema.parse({});
    }

    const raw = await readFile(filePath, "utf-8");
    const data: unknown = parseYaml(raw);

    if (data === null || data === undefined) {
      return GlobalConfigSchema.parse({});
    }

    return GlobalConfigSchema.parse(data);
  }

  /**
   * Persist global config. The file is written atomically and with mode 0o600
   * (owner read/write only) because it may contain auth tokens.
   */
  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    // Validate before writing
    GlobalConfigSchema.parse(config);

    const filePath = join(this.globalConfigDir, GLOBAL_CONFIG_FILE);
    const content = stringifyYaml(config);

    await atomicWrite(filePath, content, 0o600);
  }

  // -----------------------------------------------------------------------
  // Repository manifest
  // -----------------------------------------------------------------------

  /**
   * Load the repo manifest from `.dafke/manifest.yaml`.
   *
   * Returns `null` when the file (or the `.dafke/` directory) does not exist.
   * Throws on invalid YAML or schema validation failure.
   */
  async loadManifest(repoRoot?: string): Promise<RepoManifest | null> {
    const root = repoRoot ?? process.cwd();
    const filePath = join(root, REPO_DIR, REPO_MANIFEST_FILE);

    if (!existsSync(filePath)) {
      return null;
    }

    const raw = await readFile(filePath, "utf-8");
    const data: unknown = parseYaml(raw);

    if (data === null || data === undefined) {
      return null;
    }

    // Run schema migrations transparently before Zod parsing
    const rawObj = data as Record<string, unknown>;
    const { data: migrated, result: migrationResult } = runMigrations(rawObj);

    if (migrationResult.migrated) {
      // Backup, persist migrated manifest, and log the migration
      try {
        await backupManifest(root);
        const content = stringifyYaml(migrated);
        await atomicWrite(join(root, REPO_DIR, REPO_MANIFEST_FILE), content);
        await logMigration(root, migrationResult);
      } catch (migrationError) {
        // Migration persistence failed — try to restore from backup
        const backupPath = `${join(root, REPO_DIR, REPO_MANIFEST_FILE)}.bak`;
        if (existsSync(backupPath)) {
          try {
            await restoreManifest(root, backupPath);
          } catch (restoreErr) {
            console.error(`dafke: manifest restore failed after migration error: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
          }
        }
        throw migrationError;
      }

      return RepoManifestSchema.parse(migrated);
    }

    return RepoManifestSchema.parse(data);
  }

  /** Persist the repo manifest atomically. */
  async saveManifest(
    manifest: RepoManifest,
    repoRoot?: string,
  ): Promise<void> {
    // Validate before writing
    RepoManifestSchema.parse(manifest);

    const root = repoRoot ?? process.cwd();
    const filePath = join(root, REPO_DIR, REPO_MANIFEST_FILE);
    const content = stringifyYaml(manifest);

    await atomicWrite(filePath, content);
  }

  // -----------------------------------------------------------------------
  // Wizard state
  // -----------------------------------------------------------------------

  /** Load resumable wizard state. Returns `null` when no state file exists. */
  async loadWizardState(repoRoot?: string): Promise<WizardState | null> {
    const filePath = this.getStatePath(repoRoot);

    if (!existsSync(filePath)) {
      return null;
    }

    const raw = await readFile(filePath, "utf-8");
    const data: unknown = JSON.parse(raw);

    return WizardStateSchema.parse(data);
  }

  /** Persist wizard state atomically. */
  async saveWizardState(
    state: WizardState,
    repoRoot?: string,
  ): Promise<void> {
    WizardStateSchema.parse(state);

    const filePath = this.getStatePath(repoRoot);
    const content = JSON.stringify(state, null, 2);

    await atomicWrite(filePath, content);
  }

  // -----------------------------------------------------------------------
  // Rules configuration
  // -----------------------------------------------------------------------

  /**
   * Load rules from .dafke/rules.yaml with defaults fallback.
   * The rules file is optional — all values have sensible defaults.
   */
  async loadRules(repoRoot: string): Promise<Rules> {
    const rulesPath = join(repoRoot, REPO_DIR, "rules.yaml");
    try {
      const raw = await readFile(rulesPath, "utf-8");
      const parsed = parseYaml(raw) as Record<string, unknown>;
      return RulesSchema.parse(parsed);
    } catch {
      return RulesSchema.parse({});
    }
  }
}
