import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasFileWithExtension, hasFileShallow, readFileOrNull, hasFile } from "@/adapters/adapter-utils.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "adapter-utils-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("hasFileWithExtension", () => {
  it("returns true when a matching file exists in root", () => {
    writeFileSync(join(tempDir, "main.py"), "");
    expect(hasFileWithExtension(tempDir, ".py")).toBe(true);
  });

  it("returns false when no matching file exists", () => {
    writeFileSync(join(tempDir, "readme.md"), "");
    expect(hasFileWithExtension(tempDir, ".py")).toBe(false);
  });

  it("returns false for empty directory", () => {
    expect(hasFileWithExtension(tempDir, ".py")).toBe(false);
  });

  it("returns false for non-existent directory", () => {
    expect(hasFileWithExtension(join(tempDir, "nope"), ".py")).toBe(false);
  });
});

describe("hasFileShallow", () => {
  it("finds file one level deep", () => {
    mkdirSync(join(tempDir, "src"));
    writeFileSync(join(tempDir, "src", "app.csproj"), "");
    expect(hasFileShallow(tempDir, ".csproj")).toBe(true);
  });

  it("does not find file at root (only checks subdirs)", () => {
    writeFileSync(join(tempDir, "app.csproj"), "");
    expect(hasFileShallow(tempDir, ".csproj")).toBe(false);
  });

  it("returns false when nothing matches", () => {
    mkdirSync(join(tempDir, "src"));
    writeFileSync(join(tempDir, "src", "readme.md"), "");
    expect(hasFileShallow(tempDir, ".csproj")).toBe(false);
  });
});

describe("hasFile", () => {
  it("returns true when file exists", () => {
    writeFileSync(join(tempDir, "setup.py"), "");
    expect(hasFile(tempDir, "setup.py")).toBe(true);
  });

  it("returns false when file does not exist", () => {
    expect(hasFile(tempDir, "setup.py")).toBe(false);
  });
});

describe("readFileOrNull", () => {
  it("returns file contents", () => {
    writeFileSync(join(tempDir, "req.txt"), "flask==2.0");
    expect(readFileOrNull(tempDir, "req.txt")).toBe("flask==2.0");
  });

  it("returns null for missing file", () => {
    expect(readFileOrNull(tempDir, "nope.txt")).toBeNull();
  });
});
