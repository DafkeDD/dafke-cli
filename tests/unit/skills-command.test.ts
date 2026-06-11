import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-skills-test-${randomUUID()}`);
  return dir;
}

describe("skills command (deprecated)", () => {
  let tempDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.resetModules();
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("prints deprecation message to stderr", async () => {
    const { default: skillsCommand } = await import("../../src/cli/commands/skills.js");
    // @ts-expect-error - internal run
    await skillsCommand.run({ args: {} });

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("deprecated");
    expect(output).toContain("dafke plugin list");
  });

  it("mentions plugin install as alternative", async () => {
    const { default: skillsCommand } = await import("../../src/cli/commands/skills.js");
    // @ts-expect-error - internal run
    await skillsCommand.run({ args: {} });

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("dafke plugin install");
  });

  it("does not produce any stdout output", async () => {
    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { default: skillsCommand } = await import("../../src/cli/commands/skills.js");
    // @ts-expect-error - internal run
    await skillsCommand.run({ args: {} });

    expect(stdoutSpy.mock.calls.length).toBe(0);
  });
});
