import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { WizardStepContext } from "../../src/core/wizard/wizard-steps.js";

// ---------------------------------------------------------------------------
// Mock @clack/prompts globally
// ---------------------------------------------------------------------------

const mockSpinner = { start: vi.fn(), stop: vi.fn() };

const mockPrompts = {
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
  spinner: vi.fn(() => mockSpinner),
  confirm: vi.fn(() => true),
  select: vi.fn(),
  multiselect: vi.fn(() => []),
  text: vi.fn(() => "test-input"),
  password: vi.fn(() => "secret"),
  isCancel: vi.fn(() => false),
};

vi.mock("@clack/prompts", () => mockPrompts);

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function makeCtx(repoRoot: string, overrides: Partial<WizardStepContext> = {}): WizardStepContext {
  return {
    repoRoot,
    verbose: false,
    nonInteractive: true,
    answers: {},
    ...overrides,
  };
}

function makeTempDir(prefix = "dafke-wizard-test"): string {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ===========================================================================
// step-auth
// ===========================================================================

describe("step-auth (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-auth");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("skips prompts in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
    expect(mockPrompts.log.info).toHaveBeenCalled();
  });

  it("handles user cancel on multiselect", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      isCancel: vi.fn(() => true),
      multiselect: vi.fn(() => Symbol.for("cancel")),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Cancelled");
  });

  it("configures azureDevOps provider with successful connection", async () => {
    const savedConfigs: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["azureDevOps"]),
      text: vi.fn(() => "https://dev.azure.com/org"),
      password: vi.fn(() => "test-pat"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig(cfg: unknown) { savedConfigs.push(cfg); }
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async testConnection() { return true; }
      },
    }));

    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class {
        async testConnection() { return true; }
      },
    }));

    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class {
        async testConnection() { return true; }
      },
    }));

    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class {
        async testConnection() { return true; }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual(["azureDevOps"]);
  });

  it("handles connection failure for a provider", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["github"]),
      password: vi.fn(() => "bad-token"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class {
        async testConnection() { return false; }
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return false; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
  });

  it("configures multiple providers (jira + confluence)", async () => {
    let callCount = 0;
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["jira", "confluence"]),
      text: vi.fn(() => {
        callCount++;
        if (callCount <= 2) return "https://site.atlassian.net";
        return "user@test.com";
      }),
      password: vi.fn(() => "api-token"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class { async testConnection() { return true; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect((result.data?.["providers"] as string[]).length).toBe(2);
  });

  it("handles testProvider throwing an exception", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["github"]),
      password: vi.fn(() => "token"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class { async testConnection() { throw new Error("Network error"); } },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return false; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
  });

  it("configures sonarqube provider with successful connection", async () => {
    const savedConfigs: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["sonarqube"]),
      text: vi.fn(() => "https://sonarqube.example.com"),
      password: vi.fn(() => "sqp-test-token"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig(cfg: unknown) { savedConfigs.push(cfg); }
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/sonarqube/client.js", () => ({
      SonarQubeClient: class { async testConnection() { return true; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual(["sonarqube"]);
  });

  it("handles sonarqube connection failure", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["sonarqube"]),
      text: vi.fn(() => "https://sonarqube.example.com"),
      password: vi.fn(() => "bad-token"),
      isCancel: vi.fn(() => false),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return false; } },
    }));
    vi.doMock("../../src/integrations/sonarqube/client.js", () => ({
      SonarQubeClient: class { async testConnection() { return false; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
  });

  it("skips provider when user cancels during credential prompt", async () => {
    let cancelCalled = false;
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      multiselect: vi.fn(() => ["azureDevOps"]),
      text: vi.fn(() => {
        cancelCalled = true;
        return Symbol.for("cancel");
      }),
      isCancel: vi.fn((v: unknown) => typeof v === "symbol"),
    }));

    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: { defaultProvider: "azure-devops", language: "en", colorOutput: true } };
        }
        async saveGlobalConfig() {}
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/github/client.js", () => ({
      GitHubClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class { async testConnection() { return true; } },
    }));
    vi.doMock("../../src/integrations/confluence/client.js", () => ({
      ConfluenceClient: class { async testConnection() { return true; } },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-auth.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(cancelCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data?.["providers"]).toEqual([]);
  });
});

// ===========================================================================
// step-detect
// ===========================================================================

describe("step-detect (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-detect");
    vi.resetModules();
    // Mock claude-cli and prerequisites to avoid real CLI calls and 5s timeouts in tests
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      isClaudeAvailable: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("../../src/utils/prerequisites.js", () => ({
      checkPrerequisites: vi.fn().mockResolvedValue([]),
    }));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("auto-selects best match in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: true, confidence: 0.95, indicators: ["package.json", "tsconfig.json"] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("typescript");
  });

  it("auto-detects Java with indicators", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "java",
            displayName: "Java",
            detect: async () => ({ detected: true, confidence: 0.8, indicators: ["pom.xml"] }),
          },
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: false, confidence: 0, indicators: [] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("java");
  });

  it("returns unknown when no tech stack detected", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: false, confidence: 0, indicators: [] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("unknown");
  });

  it("in interactive mode, user confirms detected stack", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "dotnet"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "dotnet",
            displayName: ".NET",
            detect: async () => ({ detected: true, confidence: 0.7, indicators: [".csproj"] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("dotnet");
  });

  it("in interactive mode, user cancels", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => Symbol.for("cancel")),
      isCancel: vi.fn((v: unknown) => typeof v === "symbol"),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: true, confidence: 0.9, indicators: ["tsconfig.json"] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Cancelled");
  });

  it("detects multiple stacks and picks highest confidence", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "java",
            displayName: "Java",
            detect: async () => ({ detected: true, confidence: 0.5, indicators: ["pom.xml"] }),
          },
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: true, confidence: 0.9, indicators: ["tsconfig.json", "package.json"] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["techStack"]).toBe("typescript");
  });

  // Note: "Claude Code detected" test is covered in tests/unit/claude-cli.test.ts
  // and tests/unit/prerequisites.test.ts. Testing it here is unreliable due to
  // Vitest ESM module caching — the execa/claude-cli mock override doesn't propagate
  // when step-detect.ts has already been imported by other tests in the suite.

  it("shows Claude Code not detected message when unavailable", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        getAll: () => [
          {
            name: "typescript",
            displayName: "TypeScript",
            detect: async () => ({ detected: true, confidence: 0.9, indicators: ["tsconfig.json"] }),
          },
        ],
        get: () => undefined,
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-detect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    await execute(ctx);

    expect(mockPrompts.log.info).toHaveBeenCalledWith(
      expect.stringContaining("fallback mode"),
    );
  });
});

// ===========================================================================
// step-assess
// ===========================================================================

describe("step-assess (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-assess");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  function mockAssessmentDeps(scores = { cicd: 3, coverage: 2, security: 3, review: 2, dora: 1, docs: 1 }, wave = "wave2", total = 12) {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() {
          return {
            scores,
            totalScore: total,
            wave,
            dimensionResults: [],
            improvementPlan: [
              { dimension: "dora", currentScore: 1, targetScore: 2, action: "Improve deploy frequency", estimatedTime: "2-4 weeks", priority: "high" },
              { dimension: "coverage", currentScore: 2, targetScore: 3, action: "Add more tests", estimatedTime: "1-2 weeks", priority: "critical" },
            ],
          };
        }
      },
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({ CicdAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({ CoverageAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({ SecurityAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({ ReviewAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({ DoraAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({ DocsAnalyzer: vi.fn() }));
  }

  it("runs assessment and returns scores in non-interactive mode", async () => {
    mockAssessmentDeps();
    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["wave"]).toBe("wave2");
    expect(result.data?.["totalScore"]).toBe(12);
    expect(result.data?.["scores"]).toEqual({ cicd: 3, coverage: 2, security: 3, review: 2, dora: 1, docs: 1 });
  });

  it("displays scorecard with wave1 colors", async () => {
    mockAssessmentDeps({ cicd: 5, coverage: 5, security: 5, review: 4, dora: 4, docs: 4 }, "wave1", 27);
    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["wave"]).toBe("wave1");
    expect(result.data?.["totalScore"]).toBe(27);
  });

  it("displays scorecard with wave3 colors", async () => {
    mockAssessmentDeps({ cicd: 1, coverage: 0, security: 1, review: 0, dora: 0, docs: 0 }, "wave3", 2);
    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["wave"]).toBe("wave3");
  });

  it("handles assessment failure", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() { throw new Error("Assessment failed: disk error"); }
      },
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({ CicdAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({ CoverageAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({ SecurityAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({ ReviewAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({ DoraAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({ DocsAnalyzer: vi.fn() }));

    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Assessment failed");
  });

  it("in interactive mode, user declines to continue", async () => {
    vi.resetModules();

    // Mock @clack/prompts with confirm returning false — must be a single
    // vi.doMock call to avoid competing registrations from mockAssessmentDeps.
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => false),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/analyzer/assessment-engine.js", () => ({
      AssessmentEngine: class {
        async assess() {
          return {
            scores: { cicd: 3, coverage: 2, security: 3, review: 2, dora: 1, docs: 1 },
            totalScore: 12, wave: "wave2", dimensionResults: [],
            improvementPlan: [
              { dimension: "dora", currentScore: 1, targetScore: 2, action: "Improve deploy frequency", estimatedTime: "2-4 weeks", priority: "high" },
            ],
          };
        }
      },
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({ CicdAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/coverage-analyzer.js", () => ({ CoverageAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/security-analyzer.js", () => ({ SecurityAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/review-analyzer.js", () => ({ ReviewAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/dora-analyzer.js", () => ({ DoraAnalyzer: vi.fn() }));
    vi.doMock("../../src/core/analyzer/docs-analyzer.js", () => ({ DocsAnalyzer: vi.fn() }));

    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("fix issues");
  });

  it("in interactive mode, user confirms to continue", async () => {
    mockAssessmentDeps();

    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-assess.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// step-external-tools
// ===========================================================================

describe("step-external-tools (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-external-tools");
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("auto-detects SonarQube project key in non-interactive mode", async () => {
    writeFileSync(join(testRoot, "sonar-project.properties"), "sonar.projectKey=my-project\nsonar.host.url=https://sonar.example.com");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);
    expect(result.success).toBe(true);
    expect(ctx.answers["externalTools"]).toEqual({ coverage: { sonarProjectKey: "my-project" } });
  });

  it("skips SonarQube when file does not exist in non-interactive mode", async () => {
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);
    expect(result.success).toBe(true);
    expect(ctx.answers["externalTools"]).toEqual({});
  });

  it("handles unreadable sonar-project.properties gracefully", async () => {
    mkdirSync(join(testRoot, "sonar-project.properties"), { recursive: true });
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);
    expect(result.success).toBe(true);
    expect(mockPrompts.log.warn).toHaveBeenCalled();
  });

  it("interactive: selects Aikido with all modules", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("aikido")   // security scanner
      .mockResolvedValueOnce("repo")     // docs
      .mockResolvedValueOnce("git-tags"); // DORA
    mockPrompts.multiselect.mockResolvedValueOnce(["all"]); // Aikido modules
    mockPrompts.confirm.mockResolvedValueOnce(false); // review

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    const security = tools["security"] as Array<{ tool: string; category: string }>;
    expect(security).toHaveLength(5);
    expect(security.map((s) => s.category).sort()).toEqual(["dast", "sast", "sbom", "sca", "secrets"]);
  });

  it("interactive: selects Aikido with specific modules only", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("aikido")
      .mockResolvedValueOnce("repo")
      .mockResolvedValueOnce("git-tags");
    mockPrompts.multiselect.mockResolvedValueOnce(["sast", "secrets"]); // only 2 modules
    mockPrompts.confirm.mockResolvedValueOnce(false);

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    const security = tools["security"] as Array<{ tool: string; category: string }>;
    expect(security).toHaveLength(2);
    expect(security.map((s) => s.category).sort()).toEqual(["sast", "secrets"]);
  });

  it("interactive: selects 'none' for security", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("none")     // security: none
      .mockResolvedValueOnce("repo")     // docs: repo only
      .mockResolvedValueOnce("git-tags"); // DORA: git-tags
    mockPrompts.confirm.mockResolvedValueOnce(false);

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    expect(tools["security"]).toBeUndefined();
  });

  it("interactive: selects 'other' custom tool", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("other")    // security: other
      .mockResolvedValueOnce("repo")
      .mockResolvedValueOnce("git-tags");
    mockPrompts.text.mockResolvedValueOnce("custom-scanner"); // tool name
    mockPrompts.confirm.mockResolvedValueOnce(false);

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    const security = tools["security"] as Array<{ tool: string; category: string }>;
    expect(security).toHaveLength(1);
    expect(security[0].tool).toBe("custom-scanner");
    expect(security[0].category).toBe("sast");
  });

  it("non-interactive mode returns early without prompts", async () => {
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.message).toContain("non-interactive");
    // select/multiselect should NOT have been called
    expect(mockPrompts.select).not.toHaveBeenCalled();
  });

  it("interactive: Azure Wiki with pages + DORA manual + review practices", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("none")         // security
      .mockResolvedValueOnce("azure-wiki")   // docs
      .mockResolvedValueOnce("manual");      // DORA
    mockPrompts.text
      .mockResolvedValueOnce("https://wiki.example.com") // docs URL
      .mockResolvedValueOnce("12")                        // deploy count
      .mockResolvedValueOnce("Azure Release Management")  // deploy evidence
      .mockResolvedValueOnce("2 required approvals via Azure DevOps"); // review
    mockPrompts.multiselect
      .mockResolvedValueOnce(["architecture", "api", "onboarding"]); // doc pages
    mockPrompts.confirm.mockResolvedValueOnce(true); // has review practices

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    expect(tools["docs"]).toBeDefined();
    expect(tools["dora"]).toEqual({
      deploymentSignal: "manual",
      deploymentsLast90Days: 12,
      deploymentEvidence: "Azure Release Management",
    });
    expect(tools["review"]).toEqual([{ practice: "2 required approvals via Azure DevOps" }]);
  });

  it("interactive: no security/docs/DORA selected, only default review", async () => {
    mockPrompts.select
      .mockResolvedValueOnce("none")     // security: none
      .mockResolvedValueOnce("repo")     // docs: repo only
      .mockResolvedValueOnce("git-tags"); // DORA: git-tags
    // confirm defaults to true, text defaults to "test-input" → review gets added
    // This test verifies security/docs/DORA are empty; review depends on confirm mock
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    expect(tools["security"]).toBeUndefined();
    expect(tools["docs"]).toBeUndefined();
    expect(tools["dora"]).toBeUndefined();
  });

  it("interactive: SonarQube auto-detect + interactive prompts combined", async () => {
    writeFileSync(join(testRoot, "sonar-project.properties"), "sonar.projectKey=auto-key");
    mockPrompts.select
      .mockResolvedValueOnce("none")
      .mockResolvedValueOnce("repo")
      .mockResolvedValueOnce("git-tags");
    mockPrompts.confirm.mockResolvedValueOnce(false);

    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const { execute } = await import("../../src/core/wizard/steps/step-external-tools.js");
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const tools = ctx.answers["externalTools"] as Record<string, unknown>;
    expect(tools["coverage"]).toEqual({ sonarProjectKey: "auto-key" });
  });
});

// ===========================================================================
// step-claude-md
// ===========================================================================

describe("step-claude-md (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-claude-md");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("generates CLAUDE.md in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getClaudeMdSection: () => "- Use vitest for testing\n- Use ESLint for linting",
          getBuildInfo: async () => ({
            buildTool: "npm",
            buildCommand: "npm run build",
            testCommand: "npm run test",
            lintCommand: "npm run lint",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["claudeMdGenerated"]).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Security Rules");
    expect(content).toContain("NEVER commit secrets");
    expect(content).toContain("typescript");
    expect(content).toContain("Tech Stack Guidelines");
    expect(content).toContain("Disclaimer");
    // The disclaimer itself is emitted by the SessionStart hook, not the template.
    // CLAUDE.md now just points at the hook as the single source of truth.
    expect(content).toContain("SessionStart");
  });

  it("generates CLAUDE.md without stack section for unknown tech", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).not.toContain("Tech Stack Guidelines");
  });

  it("warns when CLAUDE.md already exists", async () => {
    writeFileSync(join(testRoot, "CLAUDE.md"), "existing content", "utf-8");

    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["claudeMdGenerated"]).toBe(true);
    expect(mockPrompts.log.warn).toHaveBeenCalled();
  });

  it("in interactive mode, user declines to write", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => false),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["claudeMdGenerated"]).toBe(false);
  });

  it("in interactive mode, user selects overwrite of existing file", async () => {
    writeFileSync(join(testRoot, "CLAUDE.md"), "old", "utf-8");

    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "overwrite"),
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getClaudeMdSection: () => "Java section",
          getBuildInfo: async () => ({
            buildTool: "mvn",
            buildCommand: "mvn compile",
            testCommand: "mvn test",
            lintCommand: null,
          }),
        }),
        getAll: () => [],
      }),
    }));
    vi.doMock("../../src/utils/claude-cli.js", () => ({
      shouldUseClaudeAI: vi.fn(async () => ({ available: false, reason: "test" })),
      smartFeatureFallback: vi.fn(() => "fallback"),
      invokeClaudePrompt: vi.fn(async () => null),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false, answers: { techStack: "java" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["claudeMdGenerated"]).toBe(true);
  });

  it("includes Quick Commands section with adapter build info", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getClaudeMdSection: () => "TS section",
          getBuildInfo: async () => ({
            buildTool: "pnpm",
            buildCommand: "pnpm build",
            testCommand: "pnpm test",
            lintCommand: "pnpm lint",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain("## Quick Commands");
    expect(content).toContain("`pnpm build`");
    expect(content).toContain("`pnpm test`");
    expect(content).toContain("`pnpm lint`");
    // TypeScript should include typecheck command
    expect(content).toContain("`npx tsc --noEmit`");
  });

  it("includes Key Decisions section", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain("## Key Decisions");
    expect(content).toContain("preserved across `dafke init` re-runs");
  });

  it("includes CI Pipeline section with platform when provided", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getClaudeMdSection: () => "TS section",
          getBuildInfo: async () => ({
            buildTool: "npm",
            buildCommand: "npm run build",
            testCommand: "npm run test",
            lintCommand: "npm run lint",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { techStack: "typescript", ciPlatform: "github-actions" },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain("## CI Pipeline");
    expect(content).toContain("github-actions");
  });

  it("shows CI not configured when no ciPlatform provided", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-claude-md.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const content = readFileSync(join(testRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Not configured");
    expect(content).toContain("dafke resolve --dimension cicd");
  });
});

// ===========================================================================
// step-hooks
// ===========================================================================

describe("step-hooks (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-hooks");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("writes settings.json and lefthook.yml in non-interactive mode", { timeout: 30_000 }, async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["hooksInstalled"]).toBe(true);

    const settingsPath = join(testRoot, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.permissions).toBeDefined();

    const lefthookPath = join(testRoot, "lefthook.yml");
    expect(existsSync(lefthookPath)).toBe(true);
    const lefthook = readFileSync(lefthookPath, "utf-8");
    expect(lefthook).toContain("pre-commit");
    expect(lefthook).toContain("pre-push");
    expect(lefthook).toContain("commit-msg");
    expect(lefthook).toContain("gitleaks");
  });

  it("in interactive mode, user declines hooks", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => false),
      isCancel: vi.fn(() => false),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["hooksInstalled"]).toBe(false);
  });

  it("in interactive mode, user approves hooks", { timeout: 30_000 }, async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-hooks.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["hooksInstalled"]).toBe(true);
    expect(existsSync(join(testRoot, ".claude", "settings.json"))).toBe(true);
    expect(existsSync(join(testRoot, "lefthook.yml"))).toBe(true);
  });
});

// ===========================================================================
// step-plugins
// ===========================================================================

describe("step-plugins (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-plugins");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("installs all plugins in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/utils/claude-cli.js", () => ({ isClaudeAvailable: vi.fn().mockResolvedValue(true) }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-plugins.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["pluginsInstalled"]).toBeGreaterThan(0);
  });

  it("handles plugin install failures", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/utils/claude-cli.js", () => ({ isClaudeAvailable: vi.fn().mockResolvedValue(true) }));
    let callCount = 0;
    vi.doMock("execa", () => ({
      execa: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) throw new Error("Install failed");
        return Promise.resolve({ stdout: "", exitCode: 0 });
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-plugins.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    const failures = result.data?.["pluginsFailed"] as string[];
    expect(failures.length).toBeGreaterThan(0);
  });

  it("skips install when user declines in interactive mode", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => false),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/utils/claude-cli.js", () => ({ isClaudeAvailable: vi.fn().mockResolvedValue(true) }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-plugins.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["pluginsInstalled"]).toBe(0);
  });

  it("installs dafke and recommended plugins from marketplaces", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/utils/claude-cli.js", () => ({ isClaudeAvailable: vi.fn().mockResolvedValue(true) }));
    vi.doMock("../../src/utils/package-root.js", () => ({ findProjectRoot: vi.fn().mockReturnValue(testRoot) }));
    const pluginNames: string[] = [];
    vi.doMock("execa", () => ({
      execa: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "--version") return Promise.resolve({ stdout: "1.0.0", exitCode: 0 });
        if (args?.[0] === "plugin" && args?.[1] === "list") return Promise.resolve({ stdout: "", exitCode: 0 });
        if (args?.[0] === "plugin" && args?.[1] === "marketplace" && args?.[2] === "list") return Promise.resolve({ stdout: "", exitCode: 0 });
        if (args?.[0] === "plugin" && args?.[1] === "marketplace" && args?.[2] === "add") return Promise.resolve({ stdout: "", exitCode: 0 });
        if (args?.[0] === "plugin" && args?.[1] === "install") {
          pluginNames.push(args[2] ?? "");
          return Promise.resolve({ stdout: "", exitCode: 0 });
        }
        return Promise.resolve({ stdout: "", exitCode: 0 });
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-plugins.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "java" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    // Should install dafke plugins + third-party plugins
    expect(pluginNames.length).toBeGreaterThan(5); // at least 5 dafke + some third-party
    expect(pluginNames.some((n) => n.includes("@dafke"))).toBe(true);
    expect(pluginNames.some((n) => n.includes("@claude-plugins-official"))).toBe(true);
  });

  it("skips already-installed plugins", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/utils/claude-cli.js", () => ({ isClaudeAvailable: vi.fn().mockResolvedValue(true) }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "--version") return Promise.resolve({ stdout: "1.0.0", exitCode: 0 });
        // All recommended plugins already installed
        if (args?.[0] === "plugin" && args?.[1] === "list") {
          return Promise.resolve({
            stdout: [
              "  ❯ superpowers@claude-plugins-official",
              "  ❯ commit-commands@claude-plugins-official",
              "  ❯ code-simplifier@claude-plugins-official",
              "  ❯ feature-dev@claude-plugins-official",
              "  ❯ claude-md-management@claude-plugins-official",
              "  ❯ context7@claude-plugins-official",
              "  ❯ skill-creator@claude-plugins-official",
            ].join("\n"),
            exitCode: 0,
          });
        }
        return Promise.resolve({ stdout: "", exitCode: 0 });
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-plugins.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    // Non-interactive mode skips "useful" plugins (context7, skill-creator), leaving 5 candidates
    expect(result.data?.["alreadyInstalled"]).toBe(5);
  });

  it("prioritizePlugins sorts essential first", async () => {
    const { prioritizePlugins } = await import("../../src/core/wizard/steps/step-plugins.js");
    const plugins = [
      { name: "a", marketplace: "m", description: "d", priority: "useful" as const },
      { name: "b", marketplace: "m", description: "d", priority: "essential" as const },
      { name: "c", marketplace: "m", description: "d", priority: "recommended" as const },
    ];
    const sorted = prioritizePlugins(plugins, undefined);
    expect(sorted[0]?.name).toBe("b");
    expect(sorted[1]?.name).toBe("c");
    expect(sorted[2]?.name).toBe("a");
  });

  it("getPluginReasons returns reasons when scores are low", async () => {
    const { getPluginReasons } = await import("../../src/core/wizard/steps/step-plugins.js");
    const plugin = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended" as const,
      relevanceRules: [
        { condition: "low-score" as const, dimension: "review", threshold: 4, reason: "improves review" },
      ],
    };
    const reasons = getPluginReasons(plugin, { review: 2, coverage: 5 });
    expect(reasons).toEqual(["improves review"]);
  });

  it("getPluginReasons returns empty when scores are high", async () => {
    const { getPluginReasons } = await import("../../src/core/wizard/steps/step-plugins.js");
    const plugin = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended" as const,
      relevanceRules: [
        { condition: "low-score" as const, dimension: "review", threshold: 3, reason: "improves review" },
      ],
    };
    const reasons = getPluginReasons(plugin, { review: 5, coverage: 5 });
    expect(reasons).toEqual([]);
  });

  it("getPluginReasons returns empty when no scores", async () => {
    const { getPluginReasons } = await import("../../src/core/wizard/steps/step-plugins.js");
    const plugin = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended" as const,
      relevanceRules: [
        { condition: "low-score" as const, dimension: "review", threshold: 3, reason: "improves review" },
      ],
    };
    const reasons = getPluginReasons(plugin, undefined);
    expect(reasons).toEqual([]);
  });
});

// ===========================================================================
// step-ci
// ===========================================================================

describe("step-ci (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-ci");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("generates GitHub Actions template in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: class {
        async analyze() {
          return { dimension: "cicd", score: 2, details: "Basic CI", evidence: ["has workflow"], suggestions: ["add SAST"] };
        }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-ci.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["ciGenerated"]).toBe(true);
    expect(result.data?.["ciPlatform"]).toBe("github-actions");

    const ciPath = join(testRoot, ".github", "workflows", "ci.yml");
    expect(existsSync(ciPath)).toBe(true);
    const content = readFileSync(ciPath, "utf-8");
    expect(content).toContain("actions/checkout");
  });

  it("analyzes existing Azure Pipelines instead of overwriting", async () => {
    writeFileSync(join(testRoot, "azure-pipelines.yml"), "trigger: none\n", "utf-8");

    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: class {
        async analyze() {
          return { dimension: "cicd", score: 2, details: "Basic CI", evidence: [], suggestions: [] };
        }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-ci.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["ciPlatform"]).toBe("azure-devops");
    // When a pipeline already exists, step-ci analyzes quality gates
    // instead of overwriting — ciGenerated should be false
    expect(result.data?.["ciGenerated"]).toBe(false);
    expect(result.data?.["qualityGates"]).toBeDefined();
  });

  it("skips generation when CI score >= 4", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: class {
        async analyze() {
          return { dimension: "cicd", score: 4, details: "Mature CI", evidence: [], suggestions: [] };
        }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-ci.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["ciGenerated"]).toBe(false);
  });

  it("in interactive mode, user declines CI template", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => false),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: class {
        async analyze() {
          return { dimension: "cicd", score: 2, details: "Basic", evidence: ["ev1"], suggestions: ["sg1"] };
        }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-ci.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["ciGenerated"]).toBe(false);
  });

  it("in interactive mode, user confirms CI template", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/analyzer/cicd-analyzer.js", () => ({
      CicdAnalyzer: class {
        async analyze() {
          return { dimension: "cicd", score: 1, details: "Minimal", evidence: [], suggestions: [] };
        }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-ci.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["ciGenerated"]).toBe(true);
  });
});

// ===========================================================================
// step-coverage
// ===========================================================================

describe("step-coverage (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-coverage");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("runs coverage analysis and parses report for typescript", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));

    // Create a mock coverage report
    const reportPath = join(testRoot, "coverage", "lcov.info");
    mkdirSync(join(testRoot, "coverage"), { recursive: true });
    writeFileSync(reportPath, '<coverage line-rate="0.85">\n</coverage>', "utf-8");

    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "c8",
            command: "npx vitest run --coverage",
            reportPath: "coverage/lcov.info",
            reportFormat: "lcov",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["coveragePct"]).toBe(85);
    expect(result.data?.["techStack"]).toBe("typescript");
  });

  it("handles missing adapter (unknown stack)", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => undefined,
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "unknown" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["coveragePct"]).toBeNull();
  });

  it("handles coverage command failure gracefully", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("Tests failed")),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "c8",
            command: "npx vitest run --coverage",
            reportPath: "coverage/lcov.info",
            reportFormat: "lcov",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["coveragePct"]).toBeNull();
  });

  it("sets up mutation testing for typescript in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("skip")),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "c8",
            command: "npx vitest run --coverage",
            reportPath: "coverage/lcov.info",
            reportFormat: "lcov",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["mutationTestingConfigured"]).toBe(true);
    expect(existsSync(join(testRoot, "stryker.config.json"))).toBe(true);
  });

  it("sets up mutation testing for java in non-interactive mode", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("skip")),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "JaCoCo",
            command: "mvn verify jacoco:report",
            reportPath: "target/site/jacoco/jacoco.xml",
            reportFormat: "cobertura",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "java" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["mutationTestingConfigured"]).toBe(true);
    expect(existsSync(join(testRoot, "pit-config-snippet.xml"))).toBe(true);
  });

  it("no mutation config for dotnet stack", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("skip")),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "Coverlet",
            command: "dotnet test",
            reportPath: "TestResults/coverage.cobertura.xml",
            reportFormat: "cobertura",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "dotnet" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["mutationTestingConfigured"]).toBe(false);
  });

  it("in interactive mode, user sets up mutation testing", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("skip")),
    }));
    vi.doMock("../../src/adapters/adapter-registry.js", () => ({
      createAdapterRegistry: () => ({
        get: () => ({
          getCoverageConfig: () => ({
            tool: "c8",
            command: "npx vitest run --coverage",
            reportPath: "coverage/lcov.info",
            reportFormat: "lcov",
          }),
        }),
        getAll: () => [],
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-coverage.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(existsSync(join(testRoot, "stryker.config.json"))).toBe(true);
  });
});

// ===========================================================================
// step-arch
// ===========================================================================

describe("step-arch (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-arch");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("suggests docs instead of generating docs (non-interactive)", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not available")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript", wave: "wave2" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["archDocGenerated"]).toBe(false);
    // Should NOT generate ARCHITECTURE.md (moved to docs command)
    expect(existsSync(join(testRoot, "docs", "ARCHITECTURE.md"))).toBe(false);
  });

  it("indexes GitNexus when available", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "indexed" }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "java", wave: "wave1" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["gitnexusIndexed"]).toBe(true);
  });

  it("handles GitNexus failure gracefully", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not available")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true, answers: { techStack: "typescript" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["gitnexusIndexed"]).toBe(false);
  });

  it("in interactive mode, still suggests docs (no direct generation)", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not available")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-arch.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false, answers: { techStack: "dotnet" } });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["archDocGenerated"]).toBe(false);
  });
});

// ===========================================================================
// step-connect
// ===========================================================================

describe("step-connect (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-connect");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("skips when no providers configured", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: {}, preferences: {} };
        }
      },
    }));

    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot);
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
  });

  it("skips in non-interactive mode even with providers configured", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "url" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: true });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
  });

  it("connects to Azure DevOps board", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "azure-devops"),
      text: vi.fn(() => "MyProject"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "https://dev.azure.com/org" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async queryWorkItems() { return { workItems: [{ id: 1 }, { id: 2 }] }; }
      },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(true);
    expect(result.data?.["boardProvider"]).toBe("azure-devops");
  });

  it("connects to Jira board", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "jira"),
      text: vi.fn(() => "PROJ"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { jira: { apiToken: "token", email: "a@b.com", siteUrl: "https://site.atlassian.net" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class {
        async searchIssues() { return { total: 15, issues: [] }; }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(true);
    expect(result.data?.["boardProvider"]).toBe("jira");
  });

  it("handles Azure DevOps connection failure", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "azure-devops"),
      text: vi.fn(() => "MyProject"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "https://dev.azure.com/org" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async queryWorkItems() { throw new Error("Connection refused"); }
      },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
  });

  it("handles user skipping board selection", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "skip"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "url" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
  });

  it("handles Jira connection failure", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "jira"),
      text: vi.fn(() => "PROJ"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { jira: { apiToken: "token", email: "a@b.com", siteUrl: "https://site.atlassian.net" } }, preferences: {} };
        }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class {
        async searchIssues() { throw new Error("Unauthorized"); }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Manifest persistence tests
  // -------------------------------------------------------------------------

  it("writes backlogProvider to manifest on ADO success", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "azure-devops"),
      text: vi.fn(() => "MyProject"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "https://dev.azure.com/org" } }, preferences: {} };
        }
        async loadManifest() {
          return { corulusCcVersion: "0.2.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} };
        }
        async saveManifest(m: unknown) { savedManifests.push(m); }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async queryWorkItems() { return { workItems: [{ id: 1 }] }; }
      },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));
    vi.doMock("../../src/utils/ado-helpers.js", () => ({
      extractOrgFromUrl: () => "org",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    const bp = manifest["backlogProvider"] as Record<string, unknown>;
    expect(bp["type"]).toBe("azure-devops");
    expect(bp["project"]).toBe("MyProject");
    expect(bp["organization"]).toBe("org");
  });

  it("writes backlogProvider to manifest on Jira success", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "jira"),
      text: vi.fn(() => "PROJ"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { jira: { apiToken: "token", email: "a@b.com", siteUrl: "https://site.atlassian.net" } }, preferences: {} };
        }
        async loadManifest() {
          return { corulusCcVersion: "0.2.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} };
        }
        async saveManifest(m: unknown) { savedManifests.push(m); }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: class {
        async searchIssues() { return { total: 5, issues: [] }; }
      },
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    const bp = manifest["backlogProvider"] as Record<string, unknown>;
    expect(bp["type"]).toBe("jira");
    expect(bp["project"]).toBe("PROJ");
  });

  it("does not crash when manifest write fails", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "azure-devops"),
      text: vi.fn(() => "MyProject"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "https://dev.azure.com/org" } }, preferences: {} };
        }
        async loadManifest() {
          return { corulusCcVersion: "0.2.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} };
        }
        async saveManifest() { throw new Error("Disk full"); }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async queryWorkItems() { return { workItems: [{ id: 1 }] }; }
      },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));
    vi.doMock("../../src/utils/ado-helpers.js", () => ({
      extractOrgFromUrl: () => "org",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(true);
  });

  it("does not write manifest when user skips", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "skip"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "url" } }, preferences: {} };
        }
        async loadManifest() {
          return { corulusCcVersion: "0.2.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} };
        }
        async saveManifest(m: unknown) { savedManifests.push(m); }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: vi.fn(),
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
    expect(savedManifests.length).toBe(0);
  });

  it("does not write manifest on connection failure", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      select: vi.fn(() => "azure-devops"),
      text: vi.fn(() => "MyProject"),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadGlobalConfig() {
          return { version: "1.0.0", auth: { azureDevOps: { pat: "token", orgUrl: "https://dev.azure.com/org" } }, preferences: {} };
        }
        async loadManifest() {
          return { corulusCcVersion: "0.2.0", configSchemaVersion: 1, techStack: "typescript", ciPlatform: "none", overrides: {} };
        }
        async saveManifest(m: unknown) { savedManifests.push(m); }
      },
    }));
    vi.doMock("../../src/integrations/azure-devops/client.js", () => ({
      AzureDevOpsClient: class {
        async queryWorkItems() { throw new Error("Connection refused"); }
      },
    }));
    vi.doMock("../../src/integrations/jira/client.js", () => ({
      JiraClient: vi.fn(),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-connect.js");
    const ctx = makeCtx(testRoot, { nonInteractive: false });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["boardConnected"]).toBe(false);
    expect(savedManifests.length).toBe(0);
  });
});

// ===========================================================================
// step-skills — REMOVED (skills now installed as plugins in step-plugins)
// ===========================================================================

// ===========================================================================
// step-verify
// ===========================================================================

describe("step-verify (full)", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-verify");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("builds summary from answers and succeeds", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        claudeMdGenerated: true,
        hooksInstalled: true,
        pluginsInstalled: 7,
        ciGenerated: true,
        boardConnected: true,
        skillsCopied: 5,
        agentsCopied: 3,
        wave: "wave1",
        totalScore: 28,
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["verified"]).toBe(true);
    const summary = result.data?.["summary"] as Record<string, unknown>;
    expect(summary["claudeMd"]).toBe(true);
    expect(summary["hooks"]).toBe(true);
    expect(summary["plugins"]).toBe(7);
    expect(summary["ciGenerated"]).toBe(true);
    expect(summary["boardConnected"]).toBe(true);
    expect(summary["skills"]).toBe(8);
    expect(summary["wave"]).toBe("wave1");
    expect(summary["totalScore"]).toBe(28);
  });

  it("shows next steps for missing items", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        claudeMdGenerated: false,
        hooksInstalled: false,
        pluginsInstalled: 0,
        wave: "wave3",
        totalScore: 8,
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(mockPrompts.log.message).toHaveBeenCalled();
  });

  it("includes audit output when available", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "Audit: All checks passed" }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { wave: "wave1", totalScore: 25 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
  });

  it("in interactive mode, user commits changes", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockResolvedValue({ stdout: "" }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: false,
      answers: { wave: "wave2", totalScore: 20, claudeMdGenerated: true, hooksInstalled: true },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
  });

  it("outputs Getting Started guide with tech-stack-specific tips", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        claudeMdGenerated: true,
        hooksInstalled: true,
        pluginsInstalled: 3,
        ciGenerated: true,
        boardConnected: true,
        skillsCopied: 2,
        agentsCopied: 1,
        wave: "wave1",
        totalScore: 25,
        techStack: "typescript",
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    // Verify the "Getting Started" section is displayed
    const calls = mockPrompts.log.message.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((c: string) => c.includes("Getting Started"))).toBe(true);
    expect(calls.some((c: string) => c.includes("/dafke-help"))).toBe(true);
    expect(calls.some((c: string) => c.includes("dafke audit"))).toBe(true);
    expect(calls.some((c: string) => c.includes("dafke doctor"))).toBe(true);
    expect(calls.some((c: string) => c.includes("npm run test"))).toBe(true);
    expect(calls.some((c: string) => c.includes("--non-interactive"))).toBe(true);
  });

  it("in interactive mode, git commit fails gracefully", async () => {
    vi.doMock("@clack/prompts", () => ({
      ...mockPrompts,
      confirm: vi.fn(() => true),
      isCancel: vi.fn(() => false),
    }));
    vi.doMock("execa", () => ({
      execa: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "commit") {
          throw new Error("not a git repository");
        }
        return Promise.resolve({ stdout: "" });
      }),
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: false,
      answers: { wave: "wave2", totalScore: 20 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// step-verify — manifest finalization
// ===========================================================================

describe("step-verify — manifest finalization", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTempDir("step-verify-manifest");
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("creates manifest when none exists", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return null;
        }
        async saveManifest(m: unknown) {
          savedManifests.push(m);
        }
      },
    }));
    vi.doMock("../../src/version.js", () => ({
      VERSION: "0.2.0",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { techStack: "typescript", wave: "wave2", totalScore: 15 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    expect(manifest["techStack"]).toBe("typescript");
    expect(manifest["corulusCcVersion"]).toBe("0.2.0");
  });

  it("updates existing manifest with wizard data", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return {
            corulusCcVersion: "0.1.0",
            configSchemaVersion: 1,
            techStack: "unknown",
            ciPlatform: "none",
            overrides: {},
          };
        }
        async saveManifest(m: unknown) {
          savedManifests.push(m);
        }
      },
    }));
    vi.doMock("../../src/version.js", () => ({
      VERSION: "0.2.0",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { techStack: "java", wave: "wave1", totalScore: 25 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    expect(manifest["techStack"]).toBe("java");
    expect(manifest["corulusCcVersion"]).toBe("0.2.0");
  });

  it("writes backlogProvider when boardConnected", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return {
            corulusCcVersion: "0.2.0",
            configSchemaVersion: 1,
            techStack: "typescript",
            ciPlatform: "none",
            overrides: {},
          };
        }
        async saveManifest(m: unknown) {
          savedManifests.push(m);
        }
      },
    }));
    vi.doMock("../../src/version.js", () => ({
      VERSION: "0.2.0",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: {
        boardConnected: true,
        boardProvider: "azure-devops",
        project: "HIP",
        wave: "wave1",
        totalScore: 25,
      },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    const bp = manifest["backlogProvider"] as Record<string, unknown>;
    expect(bp["type"]).toBe("azure-devops");
    expect(bp["project"]).toBe("HIP");
  });

  it("does not write backlogProvider when board not connected", async () => {
    const savedManifests: unknown[] = [];
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return {
            corulusCcVersion: "0.2.0",
            configSchemaVersion: 1,
            techStack: "typescript",
            ciPlatform: "none",
            overrides: {},
          };
        }
        async saveManifest(m: unknown) {
          savedManifests.push(m);
        }
      },
    }));
    vi.doMock("../../src/version.js", () => ({
      VERSION: "0.2.0",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { boardConnected: false, wave: "wave2", totalScore: 15 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(savedManifests.length).toBe(1);
    const manifest = savedManifests[0] as Record<string, unknown>;
    expect(manifest["backlogProvider"]).toBeUndefined();
  });

  it("manifest write failure does not crash verify step", async () => {
    vi.doMock("@clack/prompts", () => mockPrompts);
    vi.doMock("execa", () => ({
      execa: vi.fn().mockRejectedValue(new Error("not implemented")),
    }));
    vi.doMock("../../src/core/config/config-manager.js", () => ({
      ConfigManager: class {
        async loadManifest() {
          return {
            corulusCcVersion: "0.2.0",
            configSchemaVersion: 1,
            techStack: "typescript",
            ciPlatform: "none",
            overrides: {},
          };
        }
        async saveManifest() {
          throw new Error("Permission denied");
        }
      },
    }));
    vi.doMock("../../src/version.js", () => ({
      VERSION: "0.2.0",
    }));

    const { execute } = await import("../../src/core/wizard/steps/step-verify.js");
    const ctx = makeCtx(testRoot, {
      nonInteractive: true,
      answers: { techStack: "typescript", wave: "wave2", totalScore: 15 },
    });
    const result = await execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.["verified"]).toBe(true);
  });
});
