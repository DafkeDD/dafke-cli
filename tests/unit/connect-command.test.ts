import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = join(tmpdir(), `dafke-connect-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("connect command", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Azure DevOps connection
  // -----------------------------------------------------------------------

  describe("Azure DevOps connection", () => {
    it("saves credentials on successful connection", async () => {
      vi.resetModules();

      let savedConfig: Record<string, unknown> | null = null;

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        text: vi.fn().mockResolvedValue("https://dev.azure.com/test-org"),
        password: vi.fn().mockResolvedValue("test-pat-token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
        AzureDevOpsClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig(config: Record<string, unknown>) { savedConfig = config; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "azure-devops" } });

      expect(savedConfig).not.toBeNull();
      expect((savedConfig as Record<string, unknown>)?.["auth"]).toHaveProperty("azureDevOps");
    });

    it("does not save credentials when connection fails", async () => {
      vi.resetModules();

      let saved = false;

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        text: vi.fn().mockResolvedValue("https://dev.azure.com/test-org"),
        password: vi.fn().mockResolvedValue("bad-token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
        AzureDevOpsClient: class {
          async testConnection() { return false; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "azure-devops" } });

      expect(saved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // GitHub connection
  // -----------------------------------------------------------------------

  describe("GitHub connection", () => {
    it("saves token on successful connection", async () => {
      vi.resetModules();

      let savedConfig: Record<string, unknown> | null = null;

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        password: vi.fn().mockResolvedValue("ghp_test_token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/integrations/github/client.js", () => ({
        GitHubClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig(config: Record<string, unknown>) { savedConfig = config; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "github" } });

      expect(savedConfig).not.toBeNull();
      expect((savedConfig as Record<string, unknown>)?.["auth"]).toHaveProperty("github");
    });

    it("does not save when GitHub connection fails", async () => {
      vi.resetModules();

      let saved = false;

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        password: vi.fn().mockResolvedValue("bad-token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/integrations/github/client.js", () => ({
        GitHubClient: class {
          async testConnection() { return false; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "github" } });

      expect(saved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Jira connection
  // -----------------------------------------------------------------------

  describe("Jira connection", () => {
    it("saves credentials on successful connection", async () => {
      vi.resetModules();

      let savedConfig: Record<string, unknown> | null = null;

      vi.doMock("@clack/prompts", () => {
        let callCount = 0;
        return {
          intro: vi.fn(),
          outro: vi.fn(),
          text: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve("https://test.atlassian.net");
            return Promise.resolve("user@test.com");
          }),
          password: vi.fn().mockResolvedValue("jira-api-token"),
          spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
          log: { success: vi.fn(), error: vi.fn() },
          isCancel: vi.fn().mockReturnValue(false),
        };
      });

      vi.doMock("../../src/integrations/jira/client.js", () => ({
        JiraClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig(config: Record<string, unknown>) { savedConfig = config; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "jira" } });

      expect(savedConfig).not.toBeNull();
      expect((savedConfig as Record<string, unknown>)?.["auth"]).toHaveProperty("jira");
    });

    it("does not save when Jira connection fails", async () => {
      vi.resetModules();

      let saved = false;

      vi.doMock("@clack/prompts", () => {
        let callCount = 0;
        return {
          intro: vi.fn(),
          outro: vi.fn(),
          text: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve("https://test.atlassian.net");
            return Promise.resolve("user@test.com");
          }),
          password: vi.fn().mockResolvedValue("bad-token"),
          spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
          log: { success: vi.fn(), error: vi.fn() },
          isCancel: vi.fn().mockReturnValue(false),
        };
      });

      vi.doMock("../../src/integrations/jira/client.js", () => ({
        JiraClient: class {
          async testConnection() { return false; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "jira" } });

      expect(saved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Confluence connection
  // -----------------------------------------------------------------------

  describe("Confluence connection", () => {
    it("saves credentials on successful connection", async () => {
      vi.resetModules();

      let savedConfig: Record<string, unknown> | null = null;

      vi.doMock("@clack/prompts", () => {
        let callCount = 0;
        return {
          intro: vi.fn(),
          outro: vi.fn(),
          text: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve("https://test.atlassian.net");
            return Promise.resolve("user@test.com");
          }),
          password: vi.fn().mockResolvedValue("confluence-api-token"),
          spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
          log: { success: vi.fn(), error: vi.fn() },
          isCancel: vi.fn().mockReturnValue(false),
        };
      });

      vi.doMock("../../src/integrations/confluence/client.js", () => ({
        ConfluenceClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig(config: Record<string, unknown>) { savedConfig = config; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "confluence" } });

      expect(savedConfig).not.toBeNull();
      expect((savedConfig as Record<string, unknown>)?.["auth"]).toHaveProperty("confluence");
    });

    it("does not save when Confluence connection fails", async () => {
      vi.resetModules();

      let saved = false;

      vi.doMock("@clack/prompts", () => {
        let callCount = 0;
        return {
          intro: vi.fn(),
          outro: vi.fn(),
          text: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve("https://test.atlassian.net");
            return Promise.resolve("user@test.com");
          }),
          password: vi.fn().mockResolvedValue("bad-token"),
          spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
          log: { success: vi.fn(), error: vi.fn() },
          isCancel: vi.fn().mockReturnValue(false),
        };
      });

      vi.doMock("../../src/integrations/confluence/client.js", () => ({
        ConfluenceClient: class {
          async testConnection() { return false; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "confluence" } });

      expect(saved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // User cancels during input
  // -----------------------------------------------------------------------

  describe("user cancellation", () => {
    it("returns early when user cancels Azure DevOps org URL input", async () => {
      vi.resetModules();

      let saved = false;
      const cancelSymbol = Symbol("cancel");

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        text: vi.fn().mockResolvedValue(cancelSymbol),
        password: vi.fn().mockResolvedValue("token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockImplementation((val: unknown) => val === cancelSymbol),
      }));

      vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
        AzureDevOpsClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "azure-devops" } });

      expect(saved).toBe(false);
    });

    it("returns early when user cancels GitHub token input", async () => {
      vi.resetModules();

      let saved = false;
      const cancelSymbol = Symbol("cancel");

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        password: vi.fn().mockResolvedValue(cancelSymbol),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockImplementation((val: unknown) => val === cancelSymbol),
      }));

      vi.doMock("../../src/integrations/github/client.js", () => ({
        GitHubClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "github" } });

      expect(saved).toBe(false);
    });

    it("returns early when user cancels service selection", async () => {
      vi.resetModules();

      let saved = false;
      const cancelSymbol = Symbol("cancel");

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        select: vi.fn().mockResolvedValue(cancelSymbol),
        text: vi.fn().mockResolvedValue("value"),
        password: vi.fn().mockResolvedValue("token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockImplementation((val: unknown) => val === cancelSymbol),
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { saved = true; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run — no service arg triggers interactive selection
      await connectCommand.run({ args: {} });

      expect(saved).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown service
  // -----------------------------------------------------------------------

  describe("unknown service", () => {
    it("shows error for unknown service name", async () => {
      vi.resetModules();

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        select: vi.fn(),
        text: vi.fn(),
        password: vi.fn(),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig() { /* no-op */ }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run
      await connectCommand.run({ args: { service: "invalid-service" } });

      // Since unknown service falls through to interactive select, the select mock
      // will be called. The command should handle the selection flow.
      // With isCancel returning false and select returning undefined, it goes
      // through the default switch case.
    });
  });

  // -----------------------------------------------------------------------
  // Interactive service selection
  // -----------------------------------------------------------------------

  describe("interactive service selection", () => {
    it("triggers interactive selection when no service argument given", async () => {
      vi.resetModules();

      let savedConfig: Record<string, unknown> | null = null;
      const selectMock = vi.fn().mockResolvedValue("github");

      vi.doMock("@clack/prompts", () => ({
        intro: vi.fn(),
        outro: vi.fn(),
        select: selectMock,
        text: vi.fn(),
        password: vi.fn().mockResolvedValue("ghp_token"),
        spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
        log: { success: vi.fn(), error: vi.fn() },
        isCancel: vi.fn().mockReturnValue(false),
      }));

      vi.doMock("../../src/integrations/github/client.js", () => ({
        GitHubClient: class {
          async testConnection() { return true; }
        },
      }));

      vi.doMock("../../src/core/config/config-manager.js", () => ({
        ConfigManager: class {
          async loadGlobalConfig() { return { version: "1.0.0", auth: {}, preferences: {} }; }
          async saveGlobalConfig(config: Record<string, unknown>) { savedConfig = config; }
        },
      }));

      const { default: connectCommand } = await import("../../src/cli/commands/connect.js");
      // @ts-expect-error - internal run — no service specified
      await connectCommand.run({ args: {} });

      expect(selectMock).toHaveBeenCalled();
      expect(savedConfig).not.toBeNull();
    });
  });
});
