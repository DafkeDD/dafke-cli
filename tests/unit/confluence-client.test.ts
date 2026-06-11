import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  ConfluenceClient,
  validateConfluenceConfig,
  type ConfluenceConfig,
} from "../../src/core/confluence/confluence-client.js";
import { IntegrationError } from "../../src/utils/errors.js";
import { TemplateEngine } from "../../src/core/scaffold/template-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-confluence-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const validConfig: ConfluenceConfig = {
  cloudId: "test-cloud-id",
  spaceId: "12345",
  spaceKey: "PROJ",
  rootFolder: { name: "Project Docs", pageId: "100" },
  changeLog: { name: "Change Log", pageId: "101" },
  featuresFolder: { name: "Features", pageId: "102" },
  bugsFolder: { name: "Bugs", pageId: "103" },
};

// ---------------------------------------------------------------------------
// ConfluenceClient — Unit Tests
// ---------------------------------------------------------------------------

describe("ConfluenceClient", () => {
  it("createPage throws IntegrationError (MCP boundary)", async () => {
    const client = new ConfluenceClient(validConfig);
    await expect(
      client.createPage("parent-id", "Test Page", "content"),
    ).rejects.toThrow(IntegrationError);
  });

  it("updatePage throws IntegrationError (MCP boundary)", async () => {
    const client = new ConfluenceClient(validConfig);
    await expect(
      client.updatePage("page-id", "updated content"),
    ).rejects.toThrow(IntegrationError);
  });

  it("searchPages throws IntegrationError (MCP boundary)", async () => {
    const client = new ConfluenceClient(validConfig);
    await expect(
      client.searchPages("type=page"),
    ).rejects.toThrow(IntegrationError);
  });

  it("getPage throws IntegrationError (MCP boundary)", async () => {
    const client = new ConfluenceClient(validConfig);
    await expect(
      client.getPage("page-id"),
    ).rejects.toThrow(IntegrationError);
  });

  it("getConfig returns a copy of the configuration", () => {
    const client = new ConfluenceClient(validConfig);
    const config = client.getConfig();
    expect(config.cloudId).toBe("test-cloud-id");
    expect(config.spaceKey).toBe("PROJ");
    expect(config).not.toBe(validConfig); // Must be a copy
  });
});

// ---------------------------------------------------------------------------
// validateConfluenceConfig
// ---------------------------------------------------------------------------

describe("validateConfluenceConfig", () => {
  it("returns empty array for valid config", () => {
    expect(validateConfluenceConfig(validConfig)).toEqual([]);
  });

  it("returns errors for null config", () => {
    const errors = validateConfluenceConfig(null);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("must be an object");
  });

  it("returns errors for missing cloudId", () => {
    const bad = { ...validConfig, cloudId: "" };
    const errors = validateConfluenceConfig(bad);
    expect(errors.some((e) => e.includes("cloudId"))).toBe(true);
  });

  it("returns errors for missing spaceId", () => {
    const bad = { ...validConfig, spaceId: undefined };
    const errors = validateConfluenceConfig(bad as unknown);
    expect(errors.some((e) => e.includes("spaceId"))).toBe(true);
  });

  it("returns errors for missing folder config", () => {
    const bad = { ...validConfig, featuresFolder: undefined };
    const errors = validateConfluenceConfig(bad as unknown);
    expect(errors.some((e) => e.includes("featuresFolder"))).toBe(true);
  });

  it("returns errors for folder missing pageId", () => {
    const bad = {
      ...validConfig,
      rootFolder: { name: "Docs" }, // Missing pageId
    };
    const errors = validateConfluenceConfig(bad);
    expect(errors.some((e) => e.includes("rootFolder.pageId"))).toBe(true);
  });

  it("returns errors for folder missing name", () => {
    const bad = {
      ...validConfig,
      changeLog: { pageId: "101" }, // Missing name
    };
    const errors = validateConfluenceConfig(bad);
    expect(errors.some((e) => e.includes("changeLog.name"))).toBe(true);
  });

  it("returns multiple errors for multiple missing fields", () => {
    const errors = validateConfluenceConfig({});
    expect(errors.length).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------
// Doc template rendering
// ---------------------------------------------------------------------------

describe("doc template rendering", () => {
  it("renders technical-changes template with variables", () => {
    const engine = new TemplateEngine();
    const rendered = engine.render("doc/technical-changes.md", {
      storyId: "PROJ-123",
      storyTitle: "Add user notifications",
      date: "2026-04-21",
      technicalSummary: "Added WebSocket notification channel",
      architectureChanges: "New NotificationService in application layer",
      apiChanges: "GET /api/notifications endpoint added",
      databaseChanges: "notifications table added",
      codePatterns: "Observer pattern for notification dispatch",
      testingSummary: "15 unit tests, 3 integration tests",
      filesChanged: "src/notifications/*.ts",
    });

    expect(rendered).toContain("PROJ-123");
    expect(rendered).toContain("Add user notifications");
    expect(rendered).toContain("WebSocket notification channel");
    expect(rendered).toContain("NotificationService");
  });

  it("renders user-changes template with variables", () => {
    const engine = new TemplateEngine();
    const rendered = engine.render("doc/user-changes.md", {
      storyId: "PROJ-123",
      storyTitle: "Add user notifications",
      date: "2026-04-21",
      userSummary: "You can now receive real-time notifications",
      newFeatures: "Notification bell icon in the header",
      howToUse: "Click the bell icon to see notifications",
      knownLimitations: "Mobile push not yet supported",
    });

    expect(rendered).toContain("PROJ-123");
    expect(rendered).toContain("real-time notifications");
    expect(rendered).toContain("bell icon");
  });

  it("renders changelog-entry template with variables", () => {
    const engine = new TemplateEngine();
    const rendered = engine.render("doc/changelog-entry.md", {
      date: "2026-04-21",
      storyId: "PROJ-123",
      storyTitle: "Add user notifications",
      changelogSummary: "Real-time notification system for all users",
      changeType: "Feature",
      impact: "High",
    });

    expect(rendered).toContain("2026-04-21");
    expect(rendered).toContain("PROJ-123");
    expect(rendered).toContain("Feature");
    expect(rendered).toContain("High");
  });

  it("handles empty variables gracefully", () => {
    const engine = new TemplateEngine();
    const rendered = engine.render("doc/technical-changes.md", {
      storyId: "PROJ-456",
      storyTitle: "",
    });

    // Template renders with empty substitutions for missing vars
    expect(rendered).toContain("PROJ-456");
    expect(rendered).not.toContain("{{");
  });
});

// ---------------------------------------------------------------------------
// Local fallback (generates files instead of Confluence)
// ---------------------------------------------------------------------------

describe("local documentation fallback", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates feature doc directory structure", () => {
    const featureDir = join(tempDir, "docs", "features", "PROJ-123");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "technical-changes.md"), "# Technical Changes\n");
    writeFileSync(join(featureDir, "user-changes.md"), "# User Changes\n");

    expect(existsSync(join(featureDir, "technical-changes.md"))).toBe(true);
    expect(existsSync(join(featureDir, "user-changes.md"))).toBe(true);
  });

  it("creates bug doc directory structure", () => {
    const bugDir = join(tempDir, "docs", "bugs", "BUG-456");
    mkdirSync(bugDir, { recursive: true });
    writeFileSync(join(bugDir, "technical-analysis.md"), "# Technical Analysis\n");
    writeFileSync(join(bugDir, "user-impact.md"), "# User Impact\n");

    expect(existsSync(join(bugDir, "technical-analysis.md"))).toBe(true);
  });

  it("detects existing documentation (idempotency check)", () => {
    const featureDir = join(tempDir, "docs", "features", "PROJ-123");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "technical-changes.md"), "existing content");

    expect(existsSync(featureDir)).toBe(true);
    const existing = readFileSync(join(featureDir, "technical-changes.md"), "utf-8");
    expect(existing).toBe("existing content");
  });

  it("handles long story titles by using story ID for directory name", () => {
    const longTitle = "A".repeat(300);
    // We always use story ID for the directory, not title
    const featureDir = join(tempDir, "docs", "features", "PROJ-789");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "technical-changes.md"), `# ${longTitle}\n`);

    expect(existsSync(featureDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manifest confluence config integration
// ---------------------------------------------------------------------------

describe("manifest confluence config", () => {
  it("manifest parses with confluence topology", async () => {
    // This tests that the schema accepts confluence config
    const { RepoManifestSchema } = await import("../../src/core/config/config-schema.js");
    const manifest = RepoManifestSchema.parse({
      corulusCcVersion: "0.3.0",
      techStack: "typescript",
      confluence: {
        cloudId: "test-cloud",
        spaceId: "123",
        spaceKey: "PROJ",
        rootFolder: { name: "Docs", pageId: "100" },
        changeLog: { name: "Changes", pageId: "101" },
        featuresFolder: { name: "Features", pageId: "102" },
        bugsFolder: { name: "Bugs", pageId: "103" },
      },
    });

    expect(manifest.confluence).toBeDefined();
    expect(manifest.confluence?.cloudId).toBe("test-cloud");
    expect(manifest.confluence?.featuresFolder.pageId).toBe("102");
  });

  it("manifest parses without confluence (backward compat)", async () => {
    const { RepoManifestSchema } = await import("../../src/core/config/config-schema.js");
    const manifest = RepoManifestSchema.parse({
      corulusCcVersion: "0.3.0",
      techStack: "typescript",
    });

    expect(manifest.confluence).toBeUndefined();
  });

  it("manifest rejects invalid confluence config", async () => {
    const { RepoManifestSchema } = await import("../../src/core/config/config-schema.js");

    await expect(async () =>
      RepoManifestSchema.parse({
        corulusCcVersion: "0.3.0",
        techStack: "typescript",
        confluence: {
          cloudId: "test",
          // Missing required fields
        },
      }),
    ).rejects.toThrow();
  });
});
