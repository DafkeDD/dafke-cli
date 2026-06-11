import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { atomicWrite, atomicWriteJson } from "../../src/utils/fs.js";

describe("atomicWrite", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `dafke-fs-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Happy paths
  it("writes a file atomically", async () => {
    const filePath = join(tempDir, "test.txt");
    await atomicWrite(filePath, "hello world");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  it("creates parent directories if they don't exist", async () => {
    const filePath = join(tempDir, "deep", "nested", "dir", "file.txt");
    await atomicWrite(filePath, "nested content");
    expect(readFileSync(filePath, "utf-8")).toBe("nested content");
  });

  it("overwrites existing files", async () => {
    const filePath = join(tempDir, "overwrite.txt");
    await atomicWrite(filePath, "original");
    await atomicWrite(filePath, "updated");
    expect(readFileSync(filePath, "utf-8")).toBe("updated");
  });

  it("writes empty content", async () => {
    const filePath = join(tempDir, "empty.txt");
    await atomicWrite(filePath, "");
    expect(readFileSync(filePath, "utf-8")).toBe("");
  });

  it("leaves no temp files after success", async () => {
    const filePath = join(tempDir, "clean.txt");
    await atomicWrite(filePath, "content");
    const files = readdirSync(tempDir);
    expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("handles unicode content correctly", async () => {
    const filePath = join(tempDir, "unicode.txt");
    await atomicWrite(filePath, "héàlthcàre données pàtients 日本語");
    expect(readFileSync(filePath, "utf-8")).toBe("héàlthcàre données pàtients 日本語");
  });

  // Failure paths — temp file cleanup
  it("propagates error when target dir cannot be created", async () => {
    // Use an invalid path that cannot be created as a directory
    const filePath = join(tempDir, "test.txt", "impossible", "path.txt");
    // First create test.txt as a file — so mkdir on test.txt/impossible fails
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(join(tempDir, "test.txt"), "blocker", "utf-8");

    await expect(atomicWrite(filePath, "content")).rejects.toThrow();

    // No orphaned temp files in tempDir
    const files = readdirSync(tempDir);
    expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("cleans up temp file when rename fails due to target being a directory", async () => {
    // Create a directory where the target file should be — rename(file, dir) fails
    const targetPath = join(tempDir, "target-is-dir");
    mkdirSync(targetPath);
    // Also put a file inside so rmdir would fail and rename definitely fails
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(join(targetPath, "blocker.txt"), "content", "utf-8");

    await expect(atomicWrite(targetPath, "content")).rejects.toThrow();

    // No orphaned temp files
    const files = readdirSync(tempDir);
    expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });
});

describe("atomicWriteJson", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `dafke-json-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes valid JSON with indentation", async () => {
    const filePath = join(tempDir, "data.json");
    await atomicWriteJson(filePath, { key: "value", num: 42 });
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.key).toBe("value");
    expect(parsed.num).toBe(42);
    expect(content).toContain("  "); // indented
  });

  it("writes arrays", async () => {
    const filePath = join(tempDir, "array.json");
    await atomicWriteJson(filePath, [1, 2, 3]);
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed).toEqual([1, 2, 3]);
  });

  it("writes null", async () => {
    const filePath = join(tempDir, "null.json");
    await atomicWriteJson(filePath, null);
    expect(readFileSync(filePath, "utf-8").trim()).toBe("null");
  });
});
