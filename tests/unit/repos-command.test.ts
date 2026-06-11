import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-repos-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const sampleAzureRepos = [
  {
    id: "az-1",
    name: "backend-api",
    fullName: "ProjectA/backend-api",
    defaultBranch: "main",
    cloneUrl: "https://dev.azure.com/org/ProjectA/_git/backend-api",
    provider: "azure-devops" as const,
    project: "ProjectA",
  },
  {
    id: "az-2",
    name: "frontend-app",
    fullName: "ProjectA/frontend-app",
    defaultBranch: "develop",
    cloneUrl: "https://dev.azure.com/org/ProjectA/_git/frontend-app",
    provider: "azure-devops" as const,
    project: "ProjectA",
  },
];

const sampleGitHubRepos = [
  {
    id: "gh-1",
    name: "oss-lib",
    fullName: "org/oss-lib",
    defaultBranch: "main",
    cloneUrl: "https://github.com/org/oss-lib.git",
    provider: "github" as const,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("repos command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Azure DevOps repos
  // -----------------------------------------------------------------------

  describe("Azure DevOps repos", () => {
    it("lists Azure DevOps repos when configured", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                azureDevOps: { orgUrl: "https://dev.azure.com/org", pat: "test-pat" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockResolvedValue(sampleAzureRepos),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "azure-devops", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("backend-api");
      expect(output).toContain("frontend-app");
      expect(output).toContain("Repositories");
    });
  });

  // -----------------------------------------------------------------------
  // GitHub repos
  // -----------------------------------------------------------------------

  describe("GitHub repos", () => {
    it("lists GitHub repos when configured", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockResolvedValue(sampleGitHubRepos),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("oss-lib");
    });
  });

  // -----------------------------------------------------------------------
  // All providers
  // -----------------------------------------------------------------------

  describe("all providers", () => {
    it("queries both Azure DevOps and GitHub when provider is 'all'", async () => {
      vi.resetModules();

      const createProviderMock = vi.fn().mockImplementation((opts: { type: string }) => {
        if (opts.type === "azure-devops") {
          return { listRepositories: vi.fn().mockResolvedValue(sampleAzureRepos) };
        }
        return { listRepositories: vi.fn().mockResolvedValue(sampleGitHubRepos) };
      });

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                azureDevOps: { orgUrl: "https://dev.azure.com/org", pat: "test-pat" },
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: createProviderMock,
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "all", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("backend-api");
      expect(output).toContain("oss-lib");
      expect(createProviderMock).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Provider not configured
  // -----------------------------------------------------------------------

  describe("provider not configured", () => {
    it("shows warning when Azure DevOps is not configured", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {},
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn(),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "azure-devops", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Azure DevOps not configured");
    });

    it("shows warning when GitHub is not configured", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {},
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn(),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("GitHub not configured");
    });
  });

  // -----------------------------------------------------------------------
  // Provider error handled gracefully
  // -----------------------------------------------------------------------

  describe("provider errors", () => {
    it("shows error message when Azure DevOps provider throws", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                azureDevOps: { orgUrl: "https://dev.azure.com/org", pat: "test-pat" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockRejectedValue(new Error("API rate limit exceeded")),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "azure-devops", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Error");
      expect(output).toContain("API rate limit exceeded");
    });

    it("shows error message when GitHub provider throws", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockRejectedValue(new Error("Unauthorized")),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Error");
      expect(output).toContain("Unauthorized");
    });
  });

  // -----------------------------------------------------------------------
  // Empty repos
  // -----------------------------------------------------------------------

  describe("empty repos", () => {
    it("shows 'No repositories found' when provider returns empty array", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockResolvedValue([]),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "text" } });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("No repositories found");
    });
  });

  // -----------------------------------------------------------------------
  // JSON output
  // -----------------------------------------------------------------------

  describe("JSON output", () => {
    it("outputs valid JSON array of repositories", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockResolvedValue(sampleGitHubRepos),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "json" } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      const repos = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(Array.isArray(repos)).toBe(true);
      expect(repos).toHaveLength(1);
      expect(repos[0]).toHaveProperty("name", "oss-lib");
      expect(repos[0]).toHaveProperty("provider", "github");
      expect(repos[0]).toHaveProperty("cloneUrl");
    });

    it("outputs empty JSON array when no repos", async () => {
      vi.resetModules();

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: vi.fn().mockReturnValue({
          listRepositories: vi.fn().mockResolvedValue([]),
        }),
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "github", format: "json" } });

      const jsonCalls = consoleSpy.mock.calls.filter((call) => {
        try { JSON.parse(call[0] as string); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      const repos = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(repos).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Skips unconfigured providers in "all" mode
  // -----------------------------------------------------------------------

  describe("all mode with partial config", () => {
    it("only queries configured providers", async () => {
      vi.resetModules();

      const createProviderMock = vi.fn().mockReturnValue({
        listRepositories: vi.fn().mockResolvedValue(sampleGitHubRepos),
      });

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() {
            return {
              version: "1.0.0",
              auth: {
                // Only GitHub configured, no Azure DevOps
                github: { token: "ghp_test" },
              },
              preferences: {},
            };
          }
        },
      }));

      vi.doMock("../../src/integrations/repository-provider.js", () => ({
        createRepositoryProvider: createProviderMock,
      }));

      const { default: reposCommand } = await import("../../src/cli/commands/repos.js");
      // @ts-expect-error - internal run
      await reposCommand.run({ args: { provider: "all", format: "text" } });

      // Only GitHub provider should be created (Azure DevOps skipped)
      expect(createProviderMock).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("oss-lib");
    });
  });
});
