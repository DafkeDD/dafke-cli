/**
 * Session handoff manager — preserves work context across Claude Code sessions.
 *
 * Writes .claude/HANDOFF.md at session end with current state.
 * Reads it at session start to provide continuity.
 * Archives stale handoffs (>7 days) to .claude/handoffs/.
 */

import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { atomicWrite } from "../../utils/fs.js";
import { VERSION } from "../../version.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDOFF_PATH = ".claude/HANDOFF.md";
const ARCHIVE_DIR = ".claude/handoffs";
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX_ARCHIVES = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffState {
  branch?: string;
  workingOn?: string;
  phase?: string;
  completed?: string[];
  remaining?: string[];
  nextSteps?: string[];
  decisions?: string[];
  notes?: string;
}

export interface HandoffSummary {
  compact: string;
  full: string;
  branch: string;
  isStale: boolean;
  ageMs: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a HANDOFF.md file at session end.
 * Non-blocking — errors are logged but never thrown.
 */
export async function writeHandoff(
  repoRoot: string,
  state: HandoffState,
): Promise<void> {
  const branch = state.branch ?? await getCurrentBranch(repoRoot);
  const now = new Date().toISOString();

  const lines = [
    "# Session Handoff",
    `**Date:** ${now}`,
    `**Branch:** ${branch}`,
    `**dafke:** v${VERSION}`,
    "",
  ];

  if (state.workingOn || state.phase) {
    lines.push("## Current State");
    if (state.workingOn) lines.push(`- Working on: ${state.workingOn}`);
    if (state.phase) lines.push(`- Phase: ${state.phase}`);
    lines.push("");
  }

  if (state.completed && state.completed.length > 0) {
    lines.push("## Completed");
    for (const item of state.completed) {
      lines.push(`- [x] ${item}`);
    }
    lines.push("");
  }

  if (state.remaining && state.remaining.length > 0) {
    lines.push("## Remaining");
    for (const item of state.remaining) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  if (state.nextSteps && state.nextSteps.length > 0) {
    lines.push("## Next Steps");
    for (let i = 0; i < state.nextSteps.length; i++) {
      lines.push(`${i + 1}. ${state.nextSteps[i]}`);
    }
    lines.push("");
  }

  if (state.decisions && state.decisions.length > 0) {
    lines.push("## Decision Log");
    for (const decision of state.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  if (state.notes) {
    lines.push("## Notes");
    lines.push(state.notes);
    lines.push("");
  }

  const content = lines.join("\n");
  const targetPath = join(repoRoot, HANDOFF_PATH);
  await atomicWrite(targetPath, content);
}

/**
 * Read an existing HANDOFF.md and return a compact summary + full content.
 * Returns null if no handoff file exists.
 */
export async function readHandoff(
  repoRoot: string,
): Promise<HandoffSummary | null> {
  const handoffPath = join(repoRoot, HANDOFF_PATH);

  if (!existsSync(handoffPath)) {
    return null;
  }

  try {
    const full = await readFile(handoffPath, "utf-8");
    const { branch, ageMs, isStale } = parseHandoffMeta(handoffPath, full);

    // Build compact summary (3-5 lines)
    const compact = buildCompactSummary(full, branch, isStale);

    return { compact, full, branch, isStale, ageMs };
  } catch {
    return null;
  }
}

/**
 * Archive a stale handoff to .claude/handoffs/ and clean up old archives.
 */
export async function archiveHandoff(
  repoRoot: string,
  maxArchives: number = DEFAULT_MAX_ARCHIVES,
): Promise<void> {
  const handoffPath = join(repoRoot, HANDOFF_PATH);

  if (!existsSync(handoffPath)) return;

  const content = await readFile(handoffPath, "utf-8");
  const date = new Date().toISOString().slice(0, 10);
  const archiveDir = join(repoRoot, ARCHIVE_DIR);
  const archivePath = join(archiveDir, `HANDOFF-${date}.md`);

  await atomicWrite(archivePath, content);
  unlinkSync(handoffPath);

  // Cleanup old archives
  await cleanupArchives(repoRoot, maxArchives);
}

/**
 * Delete the handoff file (after task completion).
 */
export function deleteHandoff(repoRoot: string): void {
  const handoffPath = join(repoRoot, HANDOFF_PATH);
  if (existsSync(handoffPath)) {
    unlinkSync(handoffPath);
  }
}

/**
 * Keep only the most recent `max` archived handoffs.
 */
export async function cleanupArchives(
  repoRoot: string,
  max: number = DEFAULT_MAX_ARCHIVES,
): Promise<void> {
  const archiveDir = join(repoRoot, ARCHIVE_DIR);
  if (!existsSync(archiveDir)) return;

  try {
    const files = readdirSync(archiveDir)
      .filter((f) => f.startsWith("HANDOFF-") && f.endsWith(".md"))
      .sort()
      .reverse(); // Newest first (ISO date sort)

    const toDelete = files.slice(max);
    for (const file of toDelete) {
      unlinkSync(join(archiveDir, file));
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getCurrentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoRoot,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function parseHandoffMeta(
  handoffPath: string,
  content: string,
): { branch: string; ageMs: number; isStale: boolean } {
  // Extract branch from content
  const branchMatch = content.match(/\*\*Branch:\*\*\s*(.+)/);
  const branch = branchMatch?.[1]?.trim() ?? "unknown";

  // Check age from file mtime
  let ageMs = 0;
  try {
    const stat = statSync(handoffPath);
    ageMs = Date.now() - stat.mtimeMs;
  } catch {
    // stat failed — default age is 0 (treated as fresh)
  }

  return {
    branch,
    ageMs,
    isStale: ageMs > STALE_THRESHOLD_MS,
  };
}

function buildCompactSummary(
  content: string,
  branch: string,
  isStale: boolean,
): string {
  const lines: string[] = [];
  lines.push("--- Session Handoff ---");
  lines.push(`Branch: ${branch}`);

  const workingMatch = content.match(/- Working on:\s*(.+)/);
  if (workingMatch?.[1]) {
    lines.push(`Working on: ${workingMatch[1]}`);
  }

  const completedCount = (content.match(/- \[x\]/g) ?? []).length;
  const remainingCount = (content.match(/- \[ \]/g) ?? []).length;
  if (completedCount > 0 || remainingCount > 0) {
    lines.push(`Progress: ${completedCount}/${completedCount + remainingCount} tasks`);
  }

  const nextMatch = content.match(/## Next Steps\n1\.\s*(.+)/);
  if (nextMatch?.[1]) {
    lines.push(`Next: ${nextMatch[1]}`);
  }

  if (isStale) {
    lines.push("WARNING: Handoff is >7 days old — consider archiving");
  }

  lines.push("-----------------------");

  return lines.join("\n");
}
