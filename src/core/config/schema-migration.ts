/**
 * Schema migration framework for .dafke/manifest.yaml.
 *
 * Migrations run transparently inside ConfigManager.loadManifest() before
 * Zod parsing, so every caller (doctor, status, audit, update) benefits
 * without any changes.
 *
 * Flow:  read raw YAML → check configSchemaVersion → run migrations → parse with Zod
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, atomicWriteJson } from "../../utils/fs.js";

// ---------------------------------------------------------------------------
// Current schema version — bump when adding migrations
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Migration registry — ordered by target version
// ---------------------------------------------------------------------------

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Each entry maps a TARGET version to the function that migrates
 * from version (target - 1) to target.
 *
 * Example: migrations.set(2, migrateV1ToV2);
 */
// ---------------------------------------------------------------------------
// Migration: v1 → v2  (add externalTools)
// ---------------------------------------------------------------------------

function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  // Add externalTools with empty defaults if not already present
  if (!raw["externalTools"]) {
    raw["externalTools"] = {};
  }
  return raw;
}

const migrations: Map<number, MigrationFn> = new Map([
  [2, migrateV1ToV2],
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MigrationResult {
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  stepsApplied: number[];
}

/**
 * Run all pending migrations on raw manifest data (pre-Zod-parse).
 *
 * Returns the migrated data and metadata about what changed.
 * Throws on migration failure — caller should handle rollback.
 */
export function runMigrations(
  raw: Record<string, unknown>,
): { data: Record<string, unknown>; result: MigrationResult } {
  const fromVersion = typeof raw["configSchemaVersion"] === "number"
    ? raw["configSchemaVersion"]
    : 1;

  const result: MigrationResult = {
    migrated: false,
    fromVersion,
    toVersion: fromVersion,
    stepsApplied: [],
  };

  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return { data: raw, result };
  }

  let current = { ...raw };

  for (let v = fromVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations.get(v);
    if (!migrate) {
      throw new Error(
        `Missing migration from schema version ${v - 1} to ${v}. ` +
        `This may indicate a corrupted manifest or incompatible dafke version.`,
      );
    }

    current = migrate(current);
    current["configSchemaVersion"] = v;
    result.stepsApplied.push(v);
  }

  result.migrated = true;
  result.toVersion = CURRENT_SCHEMA_VERSION;

  return { data: current, result };
}

/**
 * Backup the manifest file before migration.
 * Returns the backup path, or null if the source does not exist.
 */
export async function backupManifest(
  repoRoot: string,
): Promise<string | null> {
  const manifestPath = join(repoRoot, ".dafke", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    return null;
  }

  const content = await readFile(manifestPath, "utf-8");
  const backupPath = `${manifestPath}.bak`;
  await atomicWrite(backupPath, content);

  return backupPath;
}

/**
 * Restore the manifest from a backup file.
 */
export async function restoreManifest(
  repoRoot: string,
  backupPath: string,
): Promise<void> {
  const content = await readFile(backupPath, "utf-8");
  const manifestPath = join(repoRoot, ".dafke", "manifest.yaml");
  await atomicWrite(manifestPath, content);
}

/**
 * Log a migration event to .dafke/migration-log.json.
 * Appends to existing log if present.
 */
export async function logMigration(
  repoRoot: string,
  result: MigrationResult,
): Promise<void> {
  const logPath = join(repoRoot, ".dafke", "migration-log.json");

  let log: unknown[] = [];
  try {
    if (existsSync(logPath)) {
      const raw = await readFile(logPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        log = parsed;
      }
    }
  } catch {
    // Corrupted log — start fresh
    log = [];
  }

  log.push({
    timestamp: new Date().toISOString(),
    ...result,
  });

  await atomicWriteJson(logPath, log);
}
