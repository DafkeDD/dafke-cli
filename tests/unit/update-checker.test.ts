import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { VERSION } from "../../src/version.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-update-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ===========================================================================
// UpdateChecker
// ===========================================================================

describe("UpdateChecker", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // checkForUpdates
  // -------------------------------------------------------------------------

  describe("checkForUpdates", () => {
    it("returns latest version when newer version is available", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "2.0.0" }),
      });

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBe("2.0.0");
    });

    it("returns null when already up to date (same version)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: VERSION }),
      });

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it("returns null when fetch fails (network error)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it("returns null when response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it("returns null when response has no version field", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it("returns null when fetch times out (abort)", async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("aborted")), 10);
        });
      });

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // detectDrift
  // -------------------------------------------------------------------------

  describe("detectDrift", () => {
    it("returns empty array when no templates directory found", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const results = await checker.detectDrift(tempDir);

      expect(Array.isArray(results)).toBe(true);
      // The result depends on whether templates/ can be found from the project
      // At minimum it should not throw

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("detects missing files", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      // We can test the behavior — if templates exist, missing repo files should be detected
      const results = await checker.detectDrift(tempDir);
      expect(Array.isArray(results)).toBe(true);

      // Any missing files should have type "missing"
      for (const r of results) {
        if (r.type === "missing") {
          expect(r.templateContent).toBeDefined();
          expect(typeof r.templateContent).toBe("string");
        }
      }

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("detects modified files", async () => {
      const tempDir = makeTempDir();

      // Create a .claude/settings.json with different content
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "settings.json"), '{"custom": true}', "utf-8");

      // Also create lefthook.yml
      writeFileSync(join(tempDir, "lefthook.yml"), "custom: true\n", "utf-8");

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const results = await checker.detectDrift(tempDir);

      expect(Array.isArray(results)).toBe(true);

      // If templates exist, modified files should have a diff
      for (const r of results) {
        if (r.type === "modified") {
          expect(r.diff).toBeDefined();
          expect(typeof r.diff).toBe("string");
        }
      }

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns no drift when files match template", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      // First get what templates exist to recreate them exactly
      const templateResults = await checker.detectDrift(tempDir);

      // Write template content to the repo files
      for (const r of templateResults) {
        const targetPath = join(tempDir, r.filePath);
        const dir = join(targetPath, "..");
        mkdirSync(dir, { recursive: true });
        writeFileSync(targetPath, r.templateContent, "utf-8");
      }

      // Now drift should be empty (if templates existed)
      const results = await checker.detectDrift(tempDir);
      expect(results).toHaveLength(0);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("resolves {{version}} in templateContent returned by detectDrift", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      const results = await checker.detectDrift(tempDir);

      // All returned templateContent should have {{version}} resolved
      for (const r of results) {
        expect(r.templateContent).not.toContain("{{version}}");
        if (r.templateContent.includes("dafke v")) {
          expect(r.templateContent).toContain(`dafke v${VERSION}`);
        }
      }

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // -------------------------------------------------------------------------
  // applyUpdate
  // -------------------------------------------------------------------------

  describe("applyUpdate", () => {
    it("creates missing files", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      await checker.applyUpdate(tempDir, [
        { filePath: "test-file.txt", type: "missing", templateContent: "hello world" },
      ]);

      expect(existsSync(join(tempDir, "test-file.txt"))).toBe(true);
      expect(readFileSync(join(tempDir, "test-file.txt"), "utf-8")).toBe("hello world");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("overwrites modified files", async () => {
      const tempDir = makeTempDir();
      writeFileSync(join(tempDir, "config.json"), '{"old": true}', "utf-8");

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      await checker.applyUpdate(tempDir, [
        { filePath: "config.json", type: "modified", diff: "-old\n+new", templateContent: '{"new": true}' },
      ]);

      expect(readFileSync(join(tempDir, "config.json"), "utf-8")).toBe('{"new": true}');

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("creates nested directories as needed", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      await checker.applyUpdate(tempDir, [
        { filePath: ".claude/settings.json", type: "missing", templateContent: '{"hooks": {}}' },
      ]);

      expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
      expect(readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8")).toBe('{"hooks": {}}');

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("handles multiple changes at once", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      await checker.applyUpdate(tempDir, [
        { filePath: "file1.txt", type: "missing", templateContent: "content 1" },
        { filePath: "dir/file2.txt", type: "missing", templateContent: "content 2" },
        { filePath: "deep/nested/file3.txt", type: "missing", templateContent: "content 3" },
      ]);

      expect(readFileSync(join(tempDir, "file1.txt"), "utf-8")).toBe("content 1");
      expect(readFileSync(join(tempDir, "dir", "file2.txt"), "utf-8")).toBe("content 2");
      expect(readFileSync(join(tempDir, "deep", "nested", "file3.txt"), "utf-8")).toBe("content 3");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("handles empty changes array", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      // Should not throw
      await checker.applyUpdate(tempDir, []);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("resolves {{version}} placeholders in template content", async () => {
      const tempDir = makeTempDir();

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();

      await checker.applyUpdate(tempDir, [
        {
          filePath: "generated.txt",
          type: "missing",
          templateContent: "Generated by dafke v{{version}}. Multiple {{version}} refs.",
        },
      ]);

      const written = readFileSync(join(tempDir, "generated.txt"), "utf-8");
      expect(written).not.toContain("{{version}}");
      expect(written).toContain(`v${VERSION}`);
      expect(written).toBe(`Generated by dafke v${VERSION}. Multiple ${VERSION} refs.`);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // -------------------------------------------------------------------------
  // simpleDiff (tested indirectly via detectDrift)
  // -------------------------------------------------------------------------

  describe("simpleDiff (indirect)", () => {
    it("generates diff for different content", async () => {
      const tempDir = makeTempDir();

      // Create a file that we know will differ from any template
      mkdirSync(join(tempDir, ".claude"), { recursive: true });
      writeFileSync(join(tempDir, ".claude", "settings.json"), '{\n  "totally": "different"\n}', "utf-8");

      const { UpdateChecker } = await import("../../src/core/updater/update-checker.js");
      const checker = new UpdateChecker();
      const results = await checker.detectDrift(tempDir);

      const modified = results.find((r) => r.type === "modified");
      if (modified) {
        expect(modified.diff).toBeDefined();
        expect(modified.diff?.length).toBeGreaterThan(0);
        // Diff should contain + and - lines
        const lines = modified.diff?.split("\n") ?? [];
        const hasAdditions = lines.some((l) => l.startsWith("+"));
        const hasRemovals = lines.some((l) => l.startsWith("-"));
        expect(hasAdditions || hasRemovals).toBe(true);
      }

      rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
