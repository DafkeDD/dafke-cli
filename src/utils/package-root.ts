/**
 * Locates the dafke package root directory.
 *
 * Walks up from the current module looking for a directory that contains
 * both `package.json` and either `plugins/` or `skills/` (for backward
 * compatibility during the file-copy → plugin migration).
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DafkeError } from "./errors.js";

const MAX_DEPTH = 8;

export function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (
      existsSync(join(dir, "package.json")) &&
      (existsSync(join(dir, "plugins")) || existsSync(join(dir, "skills")))
    ) {
      return dir;
    }
    dir = dirname(dir);
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, "plugins")) || existsSync(join(cwd, "skills"))) {
    return cwd;
  }

  throw new DafkeError(
    "Cannot locate dafke package root. Ensure dafke is installed correctly.",
    "PACKAGE_ROOT_NOT_FOUND",
    false,
  );
}
