import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";
import {
  runMigrations,
  backupManifest,
  restoreManifest,
  logMigration,
  CURRENT_SCHEMA_VERSION,
  type MigrationResult,
} from "../../src/core/config/schema-migration.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = join(tmpdir(), `dafke-migration-test-${randomUUID()}`);
  mkdirSync(join(dir, ".dafke"), { recursive: true });
  return dir;
}

function writeManifest(repoRoot: string, data: Record<string, unknown>): void {
  const content = stringifyYaml(data);
  writeFileSync(join(repoRoot, ".dafke", "manifest.yaml"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// runMigrations
// ---------------------------------------------------------------------------

describe("runMigrations", () => {
  it("returns unmigrated data when already at current version", () => {
    const raw = {
      corulusCcVersion: "0.2.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION,
      techStack: "typescript",
    };

    const { data, result } = runMigrations(raw);

    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.stepsApplied).toHaveLength(0);
    expect(data).toEqual(raw);
  });

  it("treats missing configSchemaVersion as version 1", () => {
    const raw = {
      corulusCcVersion: "0.1.0",
      techStack: "dotnet",
    };

    const { result } = runMigrations(raw);
    expect(result.fromVersion).toBe(1);
  });

  it("is idempotent — running on current version does nothing", () => {
    const raw = {
      corulusCcVersion: "0.2.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION,
      techStack: "typescript",
      customField: "preserved",
    };

    const { data: first } = runMigrations(raw);
    const { data: second, result } = runMigrations(first);

    expect(result.migrated).toBe(false);
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// backupManifest
// ---------------------------------------------------------------------------

describe("backupManifest", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("creates backup file from existing manifest", async () => {
    writeManifest(tempRepo, { corulusCcVersion: "0.1.0", techStack: "dotnet" });

    const backupPath = await backupManifest(tempRepo);

    expect(backupPath).not.toBeNull();
    expect(backupPath).toBeDefined();
    const bp = backupPath as string;
    expect(existsSync(bp)).toBe(true);
    expect(readFileSync(bp, "utf-8")).toContain("corulusCcVersion");
  });

  it("returns null when manifest does not exist", async () => {
    // Remove the .dafke dir contents
    rmSync(join(tempRepo, ".dafke", "manifest.yaml"), { force: true });

    const backupPath = await backupManifest(tempRepo);
    expect(backupPath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// restoreManifest
// ---------------------------------------------------------------------------

describe("restoreManifest", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("restores manifest from backup", async () => {
    const originalContent = stringifyYaml({ corulusCcVersion: "0.1.0", techStack: "dotnet" });
    const manifestPath = join(tempRepo, ".dafke", "manifest.yaml");
    const backupPath = `${manifestPath}.bak`;

    writeFileSync(backupPath, originalContent, "utf-8");
    writeFileSync(manifestPath, "corrupted content", "utf-8");

    await restoreManifest(tempRepo, backupPath);

    expect(readFileSync(manifestPath, "utf-8")).toBe(originalContent);
  });
});

// ---------------------------------------------------------------------------
// logMigration
// ---------------------------------------------------------------------------

describe("logMigration", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("creates migration log with result", async () => {
    const result: MigrationResult = {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    };

    await logMigration(tempRepo, result);

    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    expect(existsSync(logPath)).toBe(true);

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(Array.isArray(log)).toBe(true);
    expect(log).toHaveLength(1);
    expect(log[0].migrated).toBe(true);
    expect(log[0].fromVersion).toBe(1);
    expect(log[0].toVersion).toBe(2);
    expect(log[0].timestamp).toBeDefined();
  });

  it("appends to existing log", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    writeFileSync(logPath, JSON.stringify([{ existing: true }]), "utf-8");

    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveLength(2);
    expect(log[0].existing).toBe(true);
    expect(log[1].migrated).toBe(true);
  });

  it("starts fresh when log is corrupted", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    writeFileSync(logPath, "not valid json{{{", "utf-8");

    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveLength(1);
    expect(log[0].migrated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// migration v1 → v2
// ---------------------------------------------------------------------------

describe("migration v1 → v2", () => {
  it("migrates v1 to v2 adding externalTools", () => {
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: 1,
      techStack: "typescript",
    };
    const { data, result } = runMigrations(raw);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(result.stepsApplied).toEqual([2]);
    expect(data.configSchemaVersion).toBe(2);
    expect(data.externalTools).toEqual({});
  });

  it("preserves existing fields during v1→v2 migration", () => {
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: 1,
      techStack: "java",
      readinessScores: { cicd: 3, coverage: 3, security: 3, review: 3, dora: 3, docs: 3 },
      wave: "wave1",
      overrides: { custom: "value" },
    };
    const { data } = runMigrations(raw);
    expect(data.techStack).toBe("java");
    expect(data.readinessScores).toEqual(raw.readinessScores);
    expect(data.wave).toBe("wave1");
    expect(data.overrides).toEqual({ custom: "value" });
    expect(data.externalTools).toEqual({});
  });

  it("does not re-migrate already v2 manifest", () => {
    const raw = {
      corulusCcVersion: "0.3.5",
      configSchemaVersion: 2,
      techStack: "typescript",
      externalTools: { security: [{ tool: "aikido" }] },
    };
    const { data, result } = runMigrations(raw);
    expect(result.migrated).toBe(false);
    expect(data).toBe(raw); // same reference
  });

  it("treats missing configSchemaVersion as v1 and migrates to v2", () => {
    const raw = {
      corulusCcVersion: "0.1.0",
      techStack: "dotnet",
    };
    const { data, result } = runMigrations(raw);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(data.externalTools).toEqual({});
  });

  it("does not overwrite existing externalTools during migration", () => {
    // Edge case: v1 manifest that already has externalTools (manually added)
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: 1,
      techStack: "typescript",
      externalTools: { security: [{ tool: "existing" }] },
    };
    const { data } = runMigrations(raw);
    expect(data.externalTools).toEqual({ security: [{ tool: "existing" }] });
  });
});

// ---------------------------------------------------------------------------
// Mutation killing — runMigrations edge cases
// ---------------------------------------------------------------------------

describe("runMigrations — mutation killing", () => {
  it("treats non-number configSchemaVersion as version 1", () => {
    const raw = {
      corulusCcVersion: "0.1.0",
      configSchemaVersion: "not-a-number",
      techStack: "dotnet",
    };

    const { result } = runMigrations(raw as Record<string, unknown>);
    expect(result.fromVersion).toBe(1);
  });

  it("returns exact same data object when no migration needed", () => {
    const raw = {
      corulusCcVersion: "0.2.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION,
      techStack: "typescript",
      extra: "field",
    };

    const { data, result } = runMigrations(raw);
    expect(data).toBe(raw); // same reference, not a copy
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.stepsApplied).toEqual([]);
  });

  it("returns fromVersion = 1 when configSchemaVersion key is missing", () => {
    const raw = { corulusCcVersion: "0.1.0" };
    const { result } = runMigrations(raw);
    expect(result.fromVersion).toBe(1);
    expect(typeof result.fromVersion).toBe("number");
  });

  it("handles configSchemaVersion above current (future version)", () => {
    const raw = {
      corulusCcVersion: "0.5.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION + 10,
      techStack: "java",
    };

    const { data, result } = runMigrations(raw);
    expect(result.migrated).toBe(false);
    expect(data).toBe(raw);
  });

  it("handles configSchemaVersion equal to current", () => {
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION,
    };

    const { result } = runMigrations(raw);
    expect(result.migrated).toBe(false);
    // Verify the >= comparison works (not just >)
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("correctly reads configSchemaVersion by key name", () => {
    // This kills the StringLiteral mutation on raw["configSchemaVersion"] -> raw[""]
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: CURRENT_SCHEMA_VERSION,
      "": 0, // Decoy: if code reads raw[""], it would get 0 (triggering migration)
    };

    const { result } = runMigrations(raw);
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("correctly checks typeof === 'number'", () => {
    // This kills the StringLiteral mutation on typeof === "number" -> typeof === ""
    const raw = {
      corulusCcVersion: "0.3.0",
      configSchemaVersion: true, // typeof true === "boolean", not "number"
    };

    const { result } = runMigrations(raw as Record<string, unknown>);
    // Should fall back to 1 since boolean is not "number"
    expect(result.fromVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mutation killing — migration loop (requires mocking CURRENT_SCHEMA_VERSION)
// ---------------------------------------------------------------------------

describe("runMigrations — migration loop", () => {
  // We can't change CURRENT_SCHEMA_VERSION directly since it's a const,
  // but we can test the error path by providing a version below 1
  // which would try to find migration from 0 to 1

  it("throws when migration function is missing for a version step", () => {
    // Since CURRENT_SCHEMA_VERSION is 1, providing fromVersion 0
    // will try to run migration for version 1, which doesn't exist in the map
    const raw = {
      corulusCcVersion: "0.0.1",
      configSchemaVersion: 0,
      techStack: "typescript",
    };

    expect(() => runMigrations(raw)).toThrow(
      "Missing migration from schema version 0 to 1",
    );
  });

  it("throws with descriptive error message including version numbers", () => {
    const raw = {
      corulusCcVersion: "0.0.1",
      configSchemaVersion: 0,
    };

    expect(() => runMigrations(raw)).toThrow(
      /Missing migration from schema version \d+ to \d+/,
    );
  });

  it("error message mentions corrupted manifest or incompatible version", () => {
    const raw = {
      corulusCcVersion: "0.0.1",
      configSchemaVersion: 0,
    };

    expect(() => runMigrations(raw)).toThrow(
      "This may indicate a corrupted manifest or incompatible dafke version.",
    );
  });
});

// ---------------------------------------------------------------------------
// Mutation killing — backupManifest
// ---------------------------------------------------------------------------

describe("backupManifest — mutation killing", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("backup content matches original manifest content", () => {
    const data = { corulusCcVersion: "0.1.0", techStack: "dotnet", configSchemaVersion: 1 };
    writeManifest(tempRepo, data);
    const originalContent = readFileSync(join(tempRepo, ".dafke", "manifest.yaml"), "utf-8");

    return backupManifest(tempRepo).then((backupPath) => {
      expect(backupPath).not.toBeNull();
      const backupContent = readFileSync(backupPath as string, "utf-8");
      // utf-8 encoding matters: content must be identical
      expect(backupContent).toBe(originalContent);
    });
  });

  it("backup path ends with .bak", async () => {
    writeManifest(tempRepo, { corulusCcVersion: "0.1.0", techStack: "java" });

    const backupPath = await backupManifest(tempRepo);
    expect(backupPath).toMatch(/\.bak$/);
  });
});

// ---------------------------------------------------------------------------
// Mutation killing — restoreManifest
// ---------------------------------------------------------------------------

describe("restoreManifest — mutation killing", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("restored content matches backup content exactly", async () => {
    const originalContent = stringifyYaml({
      corulusCcVersion: "0.1.0",
      techStack: "dotnet",
      specialChars: "café résumé naïve",
    });
    const manifestPath = join(tempRepo, ".dafke", "manifest.yaml");
    const backupPath = `${manifestPath}.bak`;

    writeFileSync(backupPath, originalContent, "utf-8");
    writeFileSync(manifestPath, "corrupted", "utf-8");

    await restoreManifest(tempRepo, backupPath);

    // utf-8 encoding must be preserved for special characters
    const restored = readFileSync(manifestPath, "utf-8");
    expect(restored).toBe(originalContent);
    expect(restored).toContain("café");
  });
});

// ---------------------------------------------------------------------------
// Mutation killing — logMigration edge cases
// ---------------------------------------------------------------------------

describe("logMigration — mutation killing", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("creates new log when file does not exist", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    // Ensure log file does NOT exist
    expect(existsSync(logPath)).toBe(false);

    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveLength(1);
  });

  it("handles non-array JSON in log file", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    // Write a valid JSON object (not array)
    writeFileSync(logPath, '{"not": "an array"}', "utf-8");

    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    // Should start fresh since existing content is not an array
    expect(log).toHaveLength(1);
    expect(log[0].migrated).toBe(true);
  });

  it("handles valid JSON string in log file", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    writeFileSync(logPath, '"just a string"', "utf-8");

    await logMigration(tempRepo, {
      migrated: false,
      fromVersion: 1,
      toVersion: 1,
      stepsApplied: [],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveLength(1);
  });

  it("preserves all existing entries when appending", async () => {
    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    const existing = [
      { timestamp: "2026-01-01T00:00:00Z", migrated: true, fromVersion: 1, toVersion: 2 },
      { timestamp: "2026-02-01T00:00:00Z", migrated: true, fromVersion: 2, toVersion: 3 },
    ];
    writeFileSync(logPath, JSON.stringify(existing), "utf-8");

    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 3,
      toVersion: 4,
      stepsApplied: [4],
    });

    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveLength(3);
    expect(log[0].fromVersion).toBe(1);
    expect(log[1].fromVersion).toBe(2);
    expect(log[2].fromVersion).toBe(3);
  });

  it("log entry includes timestamp", async () => {
    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log[0].timestamp).toBeDefined();
    expect(typeof log[0].timestamp).toBe("string");
    // Verify it looks like an ISO date
    expect(log[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("log entry includes stepsApplied", async () => {
    await logMigration(tempRepo, {
      migrated: true,
      fromVersion: 1,
      toVersion: 2,
      stepsApplied: [2],
    });

    const logPath = join(tempRepo, ".dafke", "migration-log.json");
    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log[0].stepsApplied).toEqual([2]);
  });
});
