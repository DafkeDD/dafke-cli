/**
 * Shared filesystem utilities — atomic writes, safe file operations.
 *
 * All file writes in dafke MUST use atomic write (write to temp, rename)
 * to prevent partial writes that corrupt config on crash/interrupt.
 */

import { mkdir, writeFile, rename, chmod, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Write content to a temp file then atomically rename to the target path.
 *
 * The temp file is created in the same directory as the target so that
 * rename(2) is a same-device atomic operation on every platform.
 *
 * @param targetPath - Absolute path to the final file location
 * @param content - String content to write
 * @param mode - Optional file permission mode (e.g., 0o600 for secrets)
 */
export async function atomicWrite(
  targetPath: string,
  content: string,
  mode?: number,
): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });

  const tmpPath = join(dir, `.tmp-${randomUUID()}`);

  try {
    await writeFile(tmpPath, content, "utf-8");

    if (mode !== undefined) {
      await chmod(tmpPath, mode);
    }

    await rename(tmpPath, targetPath);
  } catch (error) {
    // Clean up orphaned temp file on any failure
    try {
      await unlink(tmpPath);
    } catch {
      // Temp file may not exist if writeFile itself failed — ignore cleanup errors
    }
    throw error;
  }
}

/** Atomic write with JSON serialization. */
export async function atomicWriteJson(
  targetPath: string,
  data: unknown,
  mode?: number,
): Promise<void> {
  await atomicWrite(targetPath, JSON.stringify(data, null, 2), mode);
}
