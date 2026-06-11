import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, utimesSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  writeHandoff,
  readHandoff,
  archiveHandoff,
  deleteHandoff,
  cleanupArchives,
} from "../../src/core/handoff/handoff-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const dir = join(tmpdir(), `dafke-handoff-test-${randomUUID()}`);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  return dir;
}

function writeHandoffFile(repoRoot: string, content: string, ageMs?: number): void {
  const path = join(repoRoot, ".claude", "HANDOFF.md");
  writeFileSync(path, content, "utf-8");
  if (ageMs !== undefined) {
    const past = new Date(Date.now() - ageMs);
    utimesSync(path, past, past);
  }
}

// ---------------------------------------------------------------------------
// writeHandoff
// ---------------------------------------------------------------------------

describe("writeHandoff", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("generates HANDOFF.md with correct structure", async () => {
    await writeHandoff(tempRepo, {
      branch: "feat/test",
      workingOn: "PROJ-123 Add feature",
      phase: "Development (3/5 tasks)",
      completed: ["Task 1", "Task 2", "Task 3"],
      remaining: ["Task 4", "Task 5"],
      nextSteps: ["Continue from Task 4", "Run tests"],
      decisions: ["Chose approach A over B"],
      notes: "Some context here",
    });

    const path = join(tempRepo, ".claude", "HANDOFF.md");
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# Session Handoff");
    expect(content).toContain("**Branch:** feat/test");
    expect(content).toContain("**dafke:** v");
    expect(content).toContain("Working on: PROJ-123 Add feature");
    expect(content).toContain("Phase: Development (3/5 tasks)");
    expect(content).toContain("- [x] Task 1");
    expect(content).toContain("- [ ] Task 4");
    expect(content).toContain("1. Continue from Task 4");
    expect(content).toContain("Chose approach A over B");
    expect(content).toContain("Some context here");
  });

  it("generates minimal handoff with just branch and date", async () => {
    await writeHandoff(tempRepo, { branch: "main" });

    const content = readFileSync(join(tempRepo, ".claude", "HANDOFF.md"), "utf-8");
    expect(content).toContain("# Session Handoff");
    expect(content).toContain("**Branch:** main");
    expect(content).toContain("**Date:**");
  });
});

// ---------------------------------------------------------------------------
// readHandoff
// ---------------------------------------------------------------------------

describe("readHandoff", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("reads existing HANDOFF.md and returns compact summary", async () => {
    const content = [
      "# Session Handoff",
      "**Date:** 2026-04-21T14:30:00Z",
      "**Branch:** feat/test-feature",
      "",
      "## Current State",
      "- Working on: PROJ-123 Add feature",
      "",
      "## Completed",
      "- [x] Task 1",
      "- [x] Task 2",
      "",
      "## Remaining",
      "- [ ] Task 3",
      "",
      "## Next Steps",
      "1. Continue from Task 3",
    ].join("\n");

    writeHandoffFile(tempRepo, content);

    const result = await readHandoff(tempRepo);
    expect(result).not.toBeNull();
    expect(result?.branch).toBe("feat/test-feature");
    expect(result?.compact).toContain("Branch: feat/test-feature");
    expect(result?.compact).toContain("Working on: PROJ-123 Add feature");
    expect(result?.compact).toContain("2/3 tasks");
    expect(result?.compact).toContain("Next: Continue from Task 3");
    expect(result?.isStale).toBe(false);
  });

  it("handles missing HANDOFF.md silently", async () => {
    const result = await readHandoff(tempRepo);
    expect(result).toBeNull();
  });

  it("handles corrupt HANDOFF.md", async () => {
    writeHandoffFile(tempRepo, "");

    const result = await readHandoff(tempRepo);
    // Should still return something (even if minimal) or null
    // An empty file is technically readable
    if (result) {
      expect(result.branch).toBe("unknown");
    }
  });

  it("detects stale HANDOFF.md (>7 days)", async () => {
    writeHandoffFile(
      tempRepo,
      "# Session Handoff\n**Branch:** old-branch\n",
      8 * 24 * 60 * 60 * 1000, // 8 days old
    );

    const result = await readHandoff(tempRepo);
    expect(result).not.toBeNull();
    expect(result?.isStale).toBe(true);
    expect(result?.compact).toContain("WARNING");
  });

  it("detects branch from content", async () => {
    writeHandoffFile(tempRepo, "# Session Handoff\n**Branch:** feature/my-branch\n");

    const result = await readHandoff(tempRepo);
    expect(result?.branch).toBe("feature/my-branch");
  });
});

// ---------------------------------------------------------------------------
// archiveHandoff
// ---------------------------------------------------------------------------

describe("archiveHandoff", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("archives stale HANDOFF.md", async () => {
    writeHandoffFile(tempRepo, "# Session Handoff\n**Branch:** old\n");

    await archiveHandoff(tempRepo);

    // Original should be deleted
    expect(existsSync(join(tempRepo, ".claude", "HANDOFF.md"))).toBe(false);

    // Archive should exist
    const archiveDir = join(tempRepo, ".claude", "handoffs");
    expect(existsSync(archiveDir)).toBe(true);
    const files = readdirSync(archiveDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^HANDOFF-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("does nothing when no HANDOFF.md exists", async () => {
    await expect(archiveHandoff(tempRepo)).resolves.not.toThrow();
  });

  it("limits archive count to maxArchives", async () => {
    const archiveDir = join(tempRepo, ".claude", "handoffs");
    mkdirSync(archiveDir, { recursive: true });

    // Create 7 existing archives
    for (let i = 1; i <= 7; i++) {
      writeFileSync(join(archiveDir, `HANDOFF-2026-01-0${i}.md`), `archive ${i}`, "utf-8");
    }

    writeHandoffFile(tempRepo, "# Session Handoff\n");
    await archiveHandoff(tempRepo, 5);

    const files = readdirSync(archiveDir);
    // 7 existing + 1 new = 8, but max 5, so 5 should remain
    expect(files.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// deleteHandoff
// ---------------------------------------------------------------------------

describe("deleteHandoff", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("deletes existing HANDOFF.md", () => {
    writeHandoffFile(tempRepo, "content");

    deleteHandoff(tempRepo);

    expect(existsSync(join(tempRepo, ".claude", "HANDOFF.md"))).toBe(false);
  });

  it("does nothing when HANDOFF.md missing", () => {
    expect(() => deleteHandoff(tempRepo)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// cleanupArchives
// ---------------------------------------------------------------------------

describe("cleanupArchives", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = makeTempRepo();
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("keeps only the newest max archives", async () => {
    const archiveDir = join(tempRepo, ".claude", "handoffs");
    mkdirSync(archiveDir, { recursive: true });

    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, "0");
      writeFileSync(join(archiveDir, `HANDOFF-2026-04-${day}.md`), `archive ${i}`, "utf-8");
    }

    await cleanupArchives(tempRepo, 3);

    const remaining = readdirSync(archiveDir);
    expect(remaining.length).toBe(3);
    // Newest should be kept (sorted reverse, take first 3)
    expect(remaining).toContain("HANDOFF-2026-04-10.md");
    expect(remaining).toContain("HANDOFF-2026-04-09.md");
    expect(remaining).toContain("HANDOFF-2026-04-08.md");
  });

  it("handles missing archive directory", async () => {
    await expect(cleanupArchives(tempRepo, 5)).resolves.not.toThrow();
  });

  it("handles empty archive directory", async () => {
    mkdirSync(join(tempRepo, ".claude", "handoffs"), { recursive: true });
    await expect(cleanupArchives(tempRepo, 5)).resolves.not.toThrow();
  });
});
