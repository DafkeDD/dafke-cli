import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { TemplateEngine } from "../../src/core/scaffold/template-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-tmpl-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// renderString — variable substitution
// ---------------------------------------------------------------------------

describe("TemplateEngine", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("renderString — variable substitution", () => {
    it("replaces simple variables", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("Hello {{name}}", { name: "World" });
      expect(result).toMatchInlineSnapshot(`"Hello World"`);
    });

    it("replaces multiple variables", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{greeting}} {{name}}!", { greeting: "Hi", name: "Alice" });
      expect(result).toMatchInlineSnapshot(`"Hi Alice!"`);
    });

    it("renders missing variables as empty string", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("Hello {{name}}", {});
      expect(result).toMatchInlineSnapshot(`"Hello "`);
    });

    it("renders null/undefined variables as empty string", () => {
      const engine = new TemplateEngine(makeTempDir());
      expect(engine.renderString("{{a}} {{b}}", { a: null, b: undefined }))
        .toMatchInlineSnapshot(`" "`);
    });

    it("renders numeric and boolean values as strings", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("count={{count}} flag={{flag}}", { count: 42, flag: true });
      expect(result).toMatchInlineSnapshot(`"count=42 flag=true"`);
    });
  });

  // -------------------------------------------------------------------------
  // renderString — {{#if}} blocks
  // -------------------------------------------------------------------------

  describe("renderString — if blocks", () => {
    it("shows block when variable is truthy", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if show}}visible{{/if}}", { show: true });
      expect(result).toMatchInlineSnapshot(`"visible"`);
    });

    it("hides block when variable is falsy", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if show}}hidden{{/if}}", { show: false });
      expect(result).toMatchInlineSnapshot(`""`);
    });

    it("handles if/else — truthy branch", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if ok}}YES{{else}}NO{{/if}}", { ok: "yes" });
      expect(result).toMatchInlineSnapshot(`"YES"`);
    });

    it("handles if/else — falsy branch", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if ok}}YES{{else}}NO{{/if}}", { ok: "" });
      expect(result).toMatchInlineSnapshot(`"NO"`);
    });

    it("handles eq helper — matching", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        '{{#if (eq lang "ts")}}TypeScript{{/if}}',
        { lang: "ts" },
      );
      expect(result).toMatchInlineSnapshot(`"TypeScript"`);
    });

    it("handles eq helper — not matching", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        '{{#if (eq lang "ts")}}TypeScript{{/if}}',
        { lang: "java" },
      );
      expect(result).toMatchInlineSnapshot(`""`);
    });

    it("handles eq helper with else", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        '{{#if (eq lang "ts")}}TypeScript{{else}}Other{{/if}}',
        { lang: "java" },
      );
      expect(result).toMatchInlineSnapshot(`"Other"`);
    });

    it("handles nested content in if blocks", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        "{{#if show}}Hello {{name}}{{/if}}",
        { show: true, name: "World" },
      );
      expect(result).toMatchInlineSnapshot(`"Hello World"`);
    });
  });

  // -------------------------------------------------------------------------
  // renderString — {{#each}} blocks
  // -------------------------------------------------------------------------

  describe("renderString — each blocks", () => {
    it("iterates over primitive array", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        "{{#each items}}- {{this}}\n{{/each}}",
        { items: ["a", "b", "c"] },
      );
      expect(result).toMatchInlineSnapshot(`
        "- a
        - b
        - c
        "
      `);
    });

    it("iterates over object array", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString(
        "{{#each people}}{{name}}: {{age}}\n{{/each}}",
        { people: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }] },
      );
      expect(result).toMatchInlineSnapshot(`
        "Alice: 30
        Bob: 25
        "
      `);
    });

    it("returns empty for non-array", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#each items}}{{this}}{{/each}}", { items: "not-an-array" });
      expect(result).toMatchInlineSnapshot(`""`);
    });

    it("returns empty for empty array", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#each items}}{{this}}{{/each}}", { items: [] });
      expect(result).toMatchInlineSnapshot(`""`);
    });

    it("returns empty for undefined variable", () => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#each missing}}{{this}}{{/each}}", {});
      expect(result).toMatchInlineSnapshot(`""`);
    });
  });

  // -------------------------------------------------------------------------
  // isTruthy (tested indirectly through if blocks)
  // -------------------------------------------------------------------------

  describe("isTruthy — via if blocks", () => {
    const falsy = [
      { value: 0, label: "0" },
      { value: "", label: "empty string" },
      { value: null, label: "null" },
      { value: undefined, label: "undefined" },
      { value: [], label: "empty array" },
      { value: false, label: "false" },
    ];

    const truthy = [
      { value: 1, label: "1" },
      { value: "hello", label: "non-empty string" },
      { value: [1], label: "non-empty array" },
      { value: true, label: "true" },
      { value: {}, label: "empty object" },
    ];

    it.each(falsy)("$label is falsy", ({ value }) => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if val}}yes{{else}}no{{/if}}", { val: value });
      expect(result).toBe("no");
    });

    it.each(truthy)("$label is truthy", ({ value }) => {
      const engine = new TemplateEngine(makeTempDir());
      const result = engine.renderString("{{#if val}}yes{{else}}no{{/if}}", { val: value });
      expect(result).toBe("yes");
    });
  });

  // -------------------------------------------------------------------------
  // render — loads and renders a real template file
  // -------------------------------------------------------------------------

  describe("render", () => {
    it("loads a template file and renders variables", () => {
      tempDir = makeTempDir();
      writeFileSync(join(tempDir, "greeting.txt"), "Hello {{name}}, welcome to {{project}}!", "utf-8");

      const engine = new TemplateEngine(tempDir);
      const result = engine.render("greeting.txt", { name: "Alice", project: "Dafke" });
      expect(result).toMatchInlineSnapshot(`"Hello Alice, welcome to Dafke!"`);
    });

    it("throws when template does not exist", () => {
      tempDir = makeTempDir();
      const engine = new TemplateEngine(tempDir);
      expect(() => engine.render("missing.txt", {})).toThrow("Template not found");
    });
  });

  // -------------------------------------------------------------------------
  // getTemplate
  // -------------------------------------------------------------------------

  describe("getTemplate", () => {
    it("returns raw content of template file", () => {
      tempDir = makeTempDir();
      writeFileSync(join(tempDir, "raw.txt"), "{{unprocessed}}", "utf-8");

      const engine = new TemplateEngine(tempDir);
      const result = engine.getTemplate("raw.txt");
      expect(result).toBe("{{unprocessed}}");
    });

    it("throws on path traversal", () => {
      tempDir = makeTempDir();
      const engine = new TemplateEngine(tempDir);
      expect(() => engine.getTemplate("../../package.json")).toThrow("Template path traversal detected");
    });

    it("throws when file does not exist", () => {
      tempDir = makeTempDir();
      const engine = new TemplateEngine(tempDir);
      expect(() => engine.getTemplate("nonexistent.txt")).toThrow("Template not found");
    });
  });

  // -------------------------------------------------------------------------
  // hasTemplate
  // -------------------------------------------------------------------------

  describe("hasTemplate", () => {
    it("returns true for existing template", () => {
      tempDir = makeTempDir();
      writeFileSync(join(tempDir, "exists.txt"), "content", "utf-8");

      const engine = new TemplateEngine(tempDir);
      expect(engine.hasTemplate("exists.txt")).toBe(true);
    });

    it("returns false for missing template", () => {
      tempDir = makeTempDir();
      const engine = new TemplateEngine(tempDir);
      expect(engine.hasTemplate("missing.txt")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Nested blocks
  // -------------------------------------------------------------------------

  describe("nested blocks", () => {
    it("handles each with if blocks inside", () => {
      const engine = new TemplateEngine(makeTempDir());
      const template = "{{#each items}}{{#if active}}[{{name}}]{{/if}}{{/each}}";
      const result = engine.renderString(template, {
        items: [
          { name: "A", active: true },
          { name: "B", active: false },
          { name: "C", active: true },
        ],
      });
      expect(result).toBe("[A][C]");
    });
  });

  // -------------------------------------------------------------------------
  // Template override resolution
  // -------------------------------------------------------------------------

  describe("template override resolution", () => {
    const originalEnv = process.env["DAFKE_TEMPLATES_DIR"];
    const originalCwd = process.cwd;
    let envOverrideDir: string;
    let repoOverrideDir: string;
    let builtinDir: string;

    beforeEach(() => {
      envOverrideDir = makeTempDir();
      repoOverrideDir = makeTempDir();
      builtinDir = makeTempDir();
    });

    afterEach(() => {
      // Restore env var
      if (originalEnv === undefined) {
        delete process.env["DAFKE_TEMPLATES_DIR"];
      } else {
        process.env["DAFKE_TEMPLATES_DIR"] = originalEnv;
      }
      // Restore cwd
      process.cwd = originalCwd;
      // Clean up temp dirs
      for (const dir of [envOverrideDir, repoOverrideDir, builtinDir]) {
        if (dir) rmSync(dir, { recursive: true, force: true });
      }
    });

    it("prefers env var override over built-in", () => {
      writeFileSync(join(builtinDir, "test.hbs"), "built-in", "utf-8");
      writeFileSync(join(envOverrideDir, "test.hbs"), "env-override", "utf-8");
      process.env["DAFKE_TEMPLATES_DIR"] = envOverrideDir;

      const engine = new TemplateEngine(builtinDir);
      expect(engine.getTemplate("test.hbs")).toBe("env-override");
    });

    it("prefers repo-level override over built-in", () => {
      // Set up a fake cwd with .dafke/templates/
      const fakeRepo = makeTempDir();
      const repoTemplatesDir = join(fakeRepo, ".dafke", "templates");
      mkdirSync(repoTemplatesDir, { recursive: true });
      writeFileSync(join(repoTemplatesDir, "test.hbs"), "repo-override", "utf-8");
      writeFileSync(join(builtinDir, "test.hbs"), "built-in", "utf-8");

      delete process.env["DAFKE_TEMPLATES_DIR"];
      process.cwd = () => fakeRepo;

      const engine = new TemplateEngine(builtinDir);
      expect(engine.getTemplate("test.hbs")).toBe("repo-override");

      rmSync(fakeRepo, { recursive: true, force: true });
    });

    it("prefers env var over repo-level override", () => {
      const fakeRepo = makeTempDir();
      const repoTemplatesDir = join(fakeRepo, ".dafke", "templates");
      mkdirSync(repoTemplatesDir, { recursive: true });
      writeFileSync(join(repoTemplatesDir, "test.hbs"), "repo-override", "utf-8");
      writeFileSync(join(envOverrideDir, "test.hbs"), "env-override", "utf-8");
      writeFileSync(join(builtinDir, "test.hbs"), "built-in", "utf-8");

      process.env["DAFKE_TEMPLATES_DIR"] = envOverrideDir;
      process.cwd = () => fakeRepo;

      const engine = new TemplateEngine(builtinDir);
      expect(engine.getTemplate("test.hbs")).toBe("env-override");

      rmSync(fakeRepo, { recursive: true, force: true });
    });

    it("falls back to built-in when no overrides exist", () => {
      delete process.env["DAFKE_TEMPLATES_DIR"];
      writeFileSync(join(builtinDir, "test.hbs"), "built-in", "utf-8");

      const engine = new TemplateEngine(builtinDir);
      expect(engine.getTemplate("test.hbs")).toBe("built-in");
    });
  });
});
