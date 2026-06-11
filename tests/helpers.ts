import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { WizardStepContext } from "../src/core/wizard/wizard-steps.js";

/** Create a temp directory for tests. Clean up in afterEach with rmSync. */
export function makeTempDir(prefix = "dafke-test"): string {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a WizardStepContext for testing. */
export function makeCtx(repoRoot: string, overrides: Partial<WizardStepContext> = {}): WizardStepContext {
  return {
    repoRoot,
    verbose: false,
    nonInteractive: true,
    answers: {},
    ...overrides,
  };
}

/** Capture console output for assertions. Returns getters for log, error, stdout. */
export function captureOutput() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return {
    getOutput: () => log.mock.calls.map((c) => String(c[0])).join("\n"),
    getErrors: () => error.mock.calls.map((c) => String(c[0])).join("\n"),
  };
}

/** Run a citty command in tests without @ts-expect-error. */
export async function runCommand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: any,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run({ args });
}
