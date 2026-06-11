import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock node:fs and node:fs/promises BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-1234"),
}));

// Mock env-paths — the real module is ESM-only, so we replace it entirely.
vi.mock("env-paths", () => ({
  default: (_name: string, _opts?: unknown) => ({
    config: "/mock/global/config",
    data: "/mock/global/data",
    cache: "/mock/global/cache",
    log: "/mock/global/log",
    temp: "/mock/global/temp",
  }),
}));

import { existsSync } from "node:fs";
import { readFile, writeFile, rename, mkdir, chmod } from "node:fs/promises";
import { ConfigManager, mergeConfigs } from "@/core/config/config-manager.js";
import type { GlobalConfig, RepoManifest } from "@/core/config/config-schema.js";

// Typed mocks for convenience
const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockRename = vi.mocked(rename);
const mockMkdir = vi.mocked(mkdir);
const mockChmod = vi.mocked(chmod);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validGlobalYaml = `
version: "1.0.0"
auth:
  azureDevOps:
    pat: "secret-pat-token"
    orgUrl: "https://dev.azure.com/dafke"
preferences:
  defaultProvider: azure-devops
  language: en
  colorOutput: true
`;

const validManifestYaml = `
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
ciPlatform: azure-devops
readinessScores:
  cicd: 3
  coverage: 2
  security: 4
  review: 3
  dora: 1
  docs: 2
wave: wave1
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfigManager", () => {
  let manager: ConfigManager;

  beforeEach(() => {
    // Construct with an explicit global config dir so tests are deterministic
    manager = new ConfigManager("/mock/global/config");
  });

  // =========================================================================
  // getConfigPaths
  // =========================================================================

  describe("getConfigPaths", () => {
    it("returns platform-aware global and repo paths", () => {
      const paths = manager.getConfigPaths("/my/repo");
      expect(paths.global).toBe(
        join("/mock/global/config", "config.yaml"),
      );
      expect(paths.repo).toBe(
        join("/my/repo", ".dafke", "manifest.yaml"),
      );
    });

    it("defaults repo path to process.cwd when no repoRoot given", () => {
      const paths = manager.getConfigPaths();
      expect(paths.repo).toBe(
        join(process.cwd(), ".dafke", "manifest.yaml"),
      );
    });
  });

  // =========================================================================
  // loadGlobalConfig
  // =========================================================================

  describe("loadGlobalConfig", () => {
    it("loads and validates a valid YAML config", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(validGlobalYaml);

      const config = await manager.loadGlobalConfig();

      expect(config.version).toBe("1.0.0");
      expect(config.auth.azureDevOps?.pat).toBe("secret-pat-token");
      expect(config.preferences.defaultProvider).toBe("azure-devops");
    });

    it("returns schema defaults when config file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const config = await manager.loadGlobalConfig();

      expect(config.version).toBe("1.0.0");
      expect(config.auth).toEqual({});
      expect(config.preferences.defaultProvider).toBe("azure-devops");
      expect(config.preferences.language).toBe("en");
      expect(config.preferences.colorOutput).toBe(true);
    });

    it("returns defaults when file contains empty/null YAML", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(""); // empty string -> parseYaml returns null

      const config = await manager.loadGlobalConfig();
      expect(config.version).toBe("1.0.0");
    });

    it("throws on invalid YAML syntax", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue("  invalid:\nyaml: [unterminated");

      await expect(manager.loadGlobalConfig()).rejects.toThrow();
    });

    it("throws on schema validation failure (bad type)", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
version: 123
auth: "not-an-object"
`);

      await expect(manager.loadGlobalConfig()).rejects.toThrow();
    });

    it("throws on schema validation failure (invalid URL)", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
version: "1.0.0"
auth:
  azureDevOps:
    orgUrl: "not-a-url"
`);

      await expect(manager.loadGlobalConfig()).rejects.toThrow();
    });
  });

  // =========================================================================
  // saveGlobalConfig
  // =========================================================================

  describe("saveGlobalConfig", () => {
    it("writes config atomically with restricted permissions", async () => {
      const config: GlobalConfig = {
        version: "1.0.0",
        auth: {},
        preferences: {
          defaultProvider: "azure-devops",
          language: "en",
          colorOutput: true,
        },
      };

      await manager.saveGlobalConfig(config);

      // Should create directory
      expect(mockMkdir).toHaveBeenCalledWith(
        "/mock/global/config",
        { recursive: true },
      );

      // Should write to temp file
      expect(mockWriteFile).toHaveBeenCalledWith(
        join("/mock/global/config", ".tmp-test-uuid-1234"),
        expect.any(String),
        "utf-8",
      );

      // Should set restrictive permissions (0o600)
      expect(mockChmod).toHaveBeenCalledWith(
        join("/mock/global/config", ".tmp-test-uuid-1234"),
        0o600,
      );

      // Should atomically rename
      expect(mockRename).toHaveBeenCalledWith(
        join("/mock/global/config", ".tmp-test-uuid-1234"),
        join("/mock/global/config", "config.yaml"),
      );
    });

    it("validates config before writing (rejects invalid data)", async () => {
      const badConfig = {
        version: "1.0.0",
        auth: "not-an-object",
        preferences: {},
      } as unknown as GlobalConfig;

      await expect(manager.saveGlobalConfig(badConfig)).rejects.toThrow();

      // Should NOT have written anything
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // loadManifest
  // =========================================================================

  describe("loadManifest", () => {
    it("loads and validates a valid manifest", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(validManifestYaml);

      const manifest = await manager.loadManifest("/my/repo");

      expect(manifest).not.toBeNull();
      expect(manifest?.corulusCcVersion).toBe("0.1.0");
      expect(manifest?.techStack).toBe("dotnet");
      expect(manifest?.ciPlatform).toBe("azure-devops");
      expect(manifest?.readinessScores?.cicd).toBe(3);
      expect(manifest?.wave).toBe("wave1");
    });

    it("returns null when .dafke/ does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const manifest = await manager.loadManifest("/my/repo");
      expect(manifest).toBeNull();
    });

    it("returns null when manifest file is empty", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue("");

      const manifest = await manager.loadManifest("/my/repo");
      expect(manifest).toBeNull();
    });

    it("throws on schema validation failure (missing required field)", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
configSchemaVersion: 1
techStack: dotnet
`);
      // missing corulusCcVersion (required)

      await expect(manager.loadManifest("/my/repo")).rejects.toThrow();
    });

    it("throws on invalid techStack value", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
techStack: rust
`);

      await expect(manager.loadManifest("/my/repo")).rejects.toThrow();
    });

    it("applies defaults for optional fields", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
techStack: java
`);

      const manifest = await manager.loadManifest("/my/repo");
      expect(manifest).not.toBeNull();
      expect(manifest?.configSchemaVersion).toBe(2);
      expect(manifest?.ciPlatform).toBe("none");
      expect(manifest?.overrides).toEqual({});
    });

    // -----------------------------------------------------------------------
    // passthrough — preserve unknown keys for forward compatibility
    // -----------------------------------------------------------------------

    describe("passthrough", () => {
      it("preserves unknown keys through parse", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
ciPlatform: azure-devops
futureField: "some-value"
anotherUnknown:
  nested: true
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        expect(manifest?.corulusCcVersion).toBe("0.1.0");
        // Unknown fields should be preserved via .passthrough()
        expect((manifest as Record<string, unknown>)["futureField"]).toBe("some-value");
        expect((manifest as Record<string, unknown>)["anotherUnknown"]).toEqual({ nested: true });
      });

      it("validates known keys normally with passthrough", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
techStack: dotnet
unknownKey: preserved
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        expect(manifest?.techStack).toBe("dotnet");
      });

      it("still rejects invalid known keys with passthrough", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
techStack: rust
unknownKey: preserved
`);

        await expect(manager.loadManifest("/my/repo")).rejects.toThrow();
      });

      it("preserves unknown keys through ciPlatform transform", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
ciPlatform: azure-pipelines
futureField: "kept"
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        // Transform should still work
        expect(manifest?.ciPlatform).toBe("azure-devops");
        // Unknown field should survive the transform
        expect((manifest as Record<string, unknown>)["futureField"]).toBe("kept");
      });
    });

    // -----------------------------------------------------------------------
    // backlogProvider schema tests
    // -----------------------------------------------------------------------

    describe("backlogProvider", () => {
      it("parses manifest with azure-devops backlogProvider", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
ciPlatform: azure-devops
backlogProvider:
  type: azure-devops
  organization: dafkenv
  project: HIP
  team: Helena
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        expect(manifest?.backlogProvider).toBeDefined();
        expect(manifest?.backlogProvider?.type).toBe("azure-devops");
        expect(manifest?.backlogProvider?.organization).toBe("dafkenv");
        expect(manifest?.backlogProvider?.project).toBe("HIP");
        expect(manifest?.backlogProvider?.team).toBe("Helena");
      });

      it("parses manifest with jira backlogProvider", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
backlogProvider:
  type: jira
  project: PROJ
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        expect(manifest?.backlogProvider?.type).toBe("jira");
        expect(manifest?.backlogProvider?.project).toBe("PROJ");
        expect(manifest?.backlogProvider?.organization).toBeUndefined();
      });

      it("parses manifest without backlogProvider (backward compat)", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: java
`);

        const manifest = await manager.loadManifest("/my/repo");
        expect(manifest).not.toBeNull();
        expect(manifest?.backlogProvider).toBeUndefined();
      });

      it("rejects invalid backlogProvider type", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
backlogProvider:
  type: github
  project: X
`);

        await expect(manager.loadManifest("/my/repo")).rejects.toThrow();
      });

      it("rejects backlogProvider missing project", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(`
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
backlogProvider:
  type: azure-devops
`);

        await expect(manager.loadManifest("/my/repo")).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // saveManifest
  // =========================================================================

  describe("saveManifest", () => {
    it("writes manifest atomically (no restrictive permissions)", async () => {
      const manifest: RepoManifest = {
        corulusCcVersion: "0.1.0",
        configSchemaVersion: 1,
        techStack: "dotnet",
        ciPlatform: "azure-devops",
        overrides: {},
      };

      await manager.saveManifest(manifest, "/my/repo");

      // Should create .dafke directory
      expect(mockMkdir).toHaveBeenCalledWith(
        join("/my/repo", ".dafke"),
        { recursive: true },
      );

      // Should write to temp file
      expect(mockWriteFile).toHaveBeenCalled();

      // Should rename atomically
      expect(mockRename).toHaveBeenCalledWith(
        join("/my/repo", ".dafke", ".tmp-test-uuid-1234"),
        join("/my/repo", ".dafke", "manifest.yaml"),
      );

      // Manifest files do NOT get chmod 0o600 (not sensitive)
      expect(mockChmod).not.toHaveBeenCalled();
    });

    it("validates manifest before writing", async () => {
      const badManifest = {
        techStack: "python", // invalid
      } as unknown as RepoManifest;

      await expect(
        manager.saveManifest(badManifest, "/my/repo"),
      ).rejects.toThrow();

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("saveManifest round-trips backlogProvider", async () => {
      const manifest: RepoManifest = {
        corulusCcVersion: "0.1.0",
        configSchemaVersion: 1,
        techStack: "dotnet",
        ciPlatform: "azure-devops",
        overrides: {},
        backlogProvider: {
          type: "azure-devops",
          organization: "dafkenv",
          project: "HIP",
          team: "Helena",
        },
      };

      await manager.saveManifest(manifest, "/my/repo");

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain("backlogProvider");
      expect(writtenContent).toContain("dafkenv");
      expect(writtenContent).toContain("HIP");
      expect(writtenContent).toContain("Helena");
    });
  });

  // =========================================================================
  // Wizard state
  // =========================================================================

  describe("loadWizardState", () => {
    it("loads valid wizard state", async () => {
      const stateJson = JSON.stringify({
        wizardVersion: "1.0.0",
        startedAt: "2024-06-01T10:00:00Z",
        lastStep: "detect",
        completedSteps: ["auth", "detect"],
        answers: { provider: "azure-devops" },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(stateJson);

      const state = await manager.loadWizardState("/my/repo");
      expect(state).not.toBeNull();
      expect(state?.wizardVersion).toBe("1.0.0");
      expect(state?.lastStep).toBe("detect");
      expect(state?.completedSteps).toEqual(["auth", "detect"]);
    });

    it("returns null when state file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const state = await manager.loadWizardState("/my/repo");
      expect(state).toBeNull();
    });

    it("throws on invalid wizard step", async () => {
      const stateJson = JSON.stringify({
        wizardVersion: "1.0.0",
        startedAt: "2024-06-01T10:00:00Z",
        lastStep: "invalid_step",
        completedSteps: [],
        answers: {},
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(stateJson);

      await expect(manager.loadWizardState("/my/repo")).rejects.toThrow();
    });
  });

  describe("saveWizardState", () => {
    it("writes state atomically as JSON", async () => {
      const state = {
        wizardVersion: "1.0.0",
        startedAt: "2024-06-01T10:00:00Z" as const,
        completedSteps: ["auth" as const],
        answers: {},
      };

      await manager.saveWizardState(state, "/my/repo");

      expect(mockWriteFile).toHaveBeenCalledWith(
        join("/my/repo", ".dafke", ".tmp-test-uuid-1234"),
        expect.stringContaining('"wizardVersion"'),
        "utf-8",
      );

      expect(mockRename).toHaveBeenCalledWith(
        join("/my/repo", ".dafke", ".tmp-test-uuid-1234"),
        join("/my/repo", ".dafke", "state.json"),
      );
    });
  });

  // =========================================================================
  // mergeConfigs (deep merge)
  // =========================================================================

  describe("mergeConfigs", () => {
    it("shallow merges top-level keys", () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3, c: 4 };

      expect(mergeConfigs(base, override)).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("deep merges nested objects", () => {
      const base = { auth: { github: { token: "old" }, jira: { email: "a@b.com" } } };
      const override = { auth: { github: { token: "new" } } };

      const result = mergeConfigs(base, override);
      expect(result).toEqual({
        auth: {
          github: { token: "new" },
          jira: { email: "a@b.com" },
        },
      });
    });

    it("replaces arrays instead of concatenating", () => {
      const base = { tags: ["a", "b"] };
      const override = { tags: ["c"] };

      expect(mergeConfigs(base, override)).toEqual({ tags: ["c"] });
    });

    it("skips undefined values in override", () => {
      const base = { a: 1, b: 2 };
      const override = { a: undefined, b: 3 };

      expect(mergeConfigs(base, override)).toEqual({ a: 1, b: 3 });
    });

    it("override scalar replaces object", () => {
      const base = { a: { nested: true } };
      const override = { a: "flat" };

      expect(mergeConfigs(base, override)).toEqual({ a: "flat" });
    });

    it("override object replaces scalar", () => {
      const base = { a: "flat" };
      const override = { a: { nested: true } };

      expect(mergeConfigs(base, override)).toEqual({ a: { nested: true } });
    });

    it("handles empty base", () => {
      expect(mergeConfigs({}, { a: 1 })).toEqual({ a: 1 });
    });

    it("handles empty override", () => {
      expect(mergeConfigs({ a: 1 }, {})).toEqual({ a: 1 });
    });

    it("does not mutate inputs", () => {
      const base = { a: { x: 1 } };
      const override = { a: { y: 2 } };

      mergeConfigs(base, override);

      // Originals must be untouched
      expect(base).toEqual({ a: { x: 1 } });
      expect(override).toEqual({ a: { y: 2 } });
    });
  });

  // =========================================================================
  // Config path detection
  // =========================================================================

  describe("config path detection", () => {
    it("uses injected globalConfigDir for the global path", () => {
      const custom = new ConfigManager("/custom/dir");
      const paths = custom.getConfigPaths("/repo");

      expect(paths.global).toBe(join("/custom/dir", "config.yaml"));
    });

    it("uses env-paths default when no dir is injected", () => {
      // Constructor with no arg falls through to env-paths mock
      const defaultManager = new ConfigManager();
      const paths = defaultManager.getConfigPaths("/repo");

      // Our mock returns /mock/global/config
      expect(paths.global).toBe(join("/mock/global/config", "config.yaml"));
    });
  });
});
