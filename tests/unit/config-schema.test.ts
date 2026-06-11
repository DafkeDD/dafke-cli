import { describe, it, expect } from "vitest";
import {
  TechStackSchema,
  WaveSchema,
  ReadinessScoreSchema,
  ReadinessScoresSchema,
  AiShareTierSchema,
  GlobalConfigSchema,
  BacklogProviderSchema,
  RepoManifestSchema,
  WizardStepSchema,
  WizardStateSchema,
  ExternalToolsConfigSchema,
} from "../../src/core/config/config-schema.js";

// ---------------------------------------------------------------------------
// TechStackSchema
// ---------------------------------------------------------------------------

describe("TechStackSchema", () => {
  it("accepts java", () => {
    expect(TechStackSchema.parse("java")).toBe("java");
  });

  it("accepts dotnet", () => {
    expect(TechStackSchema.parse("dotnet")).toBe("dotnet");
  });

  it("accepts typescript", () => {
    expect(TechStackSchema.parse("typescript")).toBe("typescript");
  });

  it("accepts python", () => {
    expect(TechStackSchema.parse("python")).toBe("python");
  });

  it("accepts delphi", () => {
    expect(TechStackSchema.parse("delphi")).toBe("delphi");
  });

  it("accepts foxpro", () => {
    expect(TechStackSchema.parse("foxpro")).toBe("foxpro");
  });

  it("accepts unknown", () => {
    expect(TechStackSchema.parse("unknown")).toBe("unknown");
  });

  it("rejects empty string", () => {
    expect(() => TechStackSchema.parse("")).toThrow();
  });

  it("rejects invalid value", () => {
    expect(() => TechStackSchema.parse("rust")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AiShareTierSchema
// ---------------------------------------------------------------------------

describe("AiShareTierSchema", () => {
  it("accepts green", () => {
    expect(AiShareTierSchema.parse("green")).toBe("green");
  });

  it("accepts optimal", () => {
    expect(AiShareTierSchema.parse("optimal")).toBe("optimal");
  });

  it("accepts warning", () => {
    expect(AiShareTierSchema.parse("warning")).toBe("warning");
  });

  it("accepts reduction", () => {
    expect(AiShareTierSchema.parse("reduction")).toBe("reduction");
  });

  it("rejects empty string", () => {
    expect(() => AiShareTierSchema.parse("")).toThrow();
  });

  it("rejects invalid value", () => {
    expect(() => AiShareTierSchema.parse("red")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ReadinessScoreSchema
// ---------------------------------------------------------------------------

describe("ReadinessScoreSchema", () => {
  it("accepts 0", () => {
    expect(ReadinessScoreSchema.parse(0)).toBe(0);
  });

  it("accepts 5", () => {
    expect(ReadinessScoreSchema.parse(5)).toBe(5);
  });

  it("rejects -1", () => {
    expect(() => ReadinessScoreSchema.parse(-1)).toThrow();
  });

  it("rejects 6", () => {
    expect(() => ReadinessScoreSchema.parse(6)).toThrow();
  });

  it("rejects non-integer", () => {
    expect(() => ReadinessScoreSchema.parse(2.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GlobalConfigSchema — defaults and auth sub-objects
// ---------------------------------------------------------------------------

describe("GlobalConfigSchema", () => {
  it("parses minimal input with defaults", () => {
    const result = GlobalConfigSchema.parse({});
    expect(result.version).toBe("1.0.0");
    expect(result.auth).toEqual({});
    expect(result.preferences.defaultProvider).toBe("azure-devops");
    expect(result.preferences.language).toBe("en");
    expect(result.preferences.colorOutput).toBe(true);
  });

  it("accepts github auth with token", () => {
    const result = GlobalConfigSchema.parse({
      auth: { github: { token: "ghp_abc123" } },
    });
    expect(result.auth.github).toBeDefined();
    expect(result.auth.github?.token).toBe("ghp_abc123");
  });

  it("accepts jira auth with email and apiToken", () => {
    const result = GlobalConfigSchema.parse({
      auth: { jira: { email: "a@b.com", apiToken: "tok", siteUrl: "https://x.atlassian.net" } },
    });
    expect(result.auth.jira).toBeDefined();
    expect(result.auth.jira?.email).toBe("a@b.com");
    expect(result.auth.jira?.apiToken).toBe("tok");
    expect(result.auth.jira?.siteUrl).toBe("https://x.atlassian.net");
  });

  it("accepts confluence auth", () => {
    const result = GlobalConfigSchema.parse({
      auth: { confluence: { email: "a@b.com", apiToken: "tok", siteUrl: "https://c.atlassian.net" } },
    });
    expect(result.auth.confluence).toBeDefined();
    expect(result.auth.confluence?.email).toBe("a@b.com");
  });

  it("accepts sonarqube auth", () => {
    const result = GlobalConfigSchema.parse({
      auth: { sonarqube: { token: "sqp_abc", serverUrl: "https://sonar.example.com" } },
    });
    expect(result.auth.sonarqube).toBeDefined();
    expect(result.auth.sonarqube?.token).toBe("sqp_abc");
    expect(result.auth.sonarqube?.serverUrl).toBe("https://sonar.example.com");
  });

  it("accepts github as defaultProvider", () => {
    const result = GlobalConfigSchema.parse({
      preferences: { defaultProvider: "github" },
    });
    expect(result.preferences.defaultProvider).toBe("github");
  });

  it("rejects empty string as defaultProvider", () => {
    expect(() =>
      GlobalConfigSchema.parse({ preferences: { defaultProvider: "" } }),
    ).toThrow();
  });

  it("preserves non-default language", () => {
    const result = GlobalConfigSchema.parse({
      preferences: { language: "nl" },
    });
    expect(result.preferences.language).toBe("nl");
  });

  it("preserves colorOutput false", () => {
    const result = GlobalConfigSchema.parse({
      preferences: { colorOutput: false },
    });
    expect(result.preferences.colorOutput).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RepoManifestSchema — ciPlatform transform, defaults
// ---------------------------------------------------------------------------

describe("RepoManifestSchema", () => {
  const minimal = {
    corulusCcVersion: "0.3.0",
    techStack: "typescript",
  };

  it("parses minimal manifest with defaults", () => {
    const result = RepoManifestSchema.parse(minimal);
    expect(result.configSchemaVersion).toBe(1);
    expect(result.ciPlatform).toBe("none");
    expect(result.overrides).toEqual({});
  });

  it("transforms azure-pipelines to azure-devops", () => {
    const result = RepoManifestSchema.parse({
      ...minimal,
      ciPlatform: "azure-pipelines",
    });
    expect(result.ciPlatform).toBe("azure-devops");
  });

  it("preserves azure-devops unchanged", () => {
    const result = RepoManifestSchema.parse({
      ...minimal,
      ciPlatform: "azure-devops",
    });
    expect(result.ciPlatform).toBe("azure-devops");
  });

  it("preserves github-actions unchanged", () => {
    const result = RepoManifestSchema.parse({
      ...minimal,
      ciPlatform: "github-actions",
    });
    expect(result.ciPlatform).toBe("github-actions");
  });

  it("rejects empty string as ciPlatform", () => {
    expect(() =>
      RepoManifestSchema.parse({ ...minimal, ciPlatform: "" }),
    ).toThrow();
  });

  it("preserves none as ciPlatform", () => {
    const result = RepoManifestSchema.parse({
      ...minimal,
      ciPlatform: "none",
    });
    expect(result.ciPlatform).toBe("none");
  });

  it("preserves unknown keys via passthrough", () => {
    const result = RepoManifestSchema.parse({
      ...minimal,
      futureField: "preserved",
    });
    expect((result as Record<string, unknown>)["futureField"]).toBe("preserved");
  });
});

// ---------------------------------------------------------------------------
// WizardStateSchema — completedSteps default
// ---------------------------------------------------------------------------

describe("WizardStateSchema", () => {
  it("defaults completedSteps to empty array", () => {
    const result = WizardStateSchema.parse({
      wizardVersion: "1.0.0",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.completedSteps).toEqual([]);
    expect(Array.isArray(result.completedSteps)).toBe(true);
    expect(result.completedSteps).toHaveLength(0);
  });

  it("defaults answers to empty object", () => {
    const result = WizardStateSchema.parse({
      wizardVersion: "1.0.0",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.answers).toEqual({});
  });

  it("preserves provided completedSteps", () => {
    const result = WizardStateSchema.parse({
      wizardVersion: "1.0.0",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedSteps: ["auth", "detect"],
    });
    expect(result.completedSteps).toEqual(["auth", "detect"]);
  });

  it("rejects invalid step name in completedSteps", () => {
    expect(() =>
      WizardStateSchema.parse({
        wizardVersion: "1.0.0",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedSteps: ["Stryker was here"],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WaveSchema
// ---------------------------------------------------------------------------

describe("WaveSchema", () => {
  it("accepts wave1", () => {
    expect(WaveSchema.parse("wave1")).toBe("wave1");
  });

  it("accepts wave2", () => {
    expect(WaveSchema.parse("wave2")).toBe("wave2");
  });

  it("accepts wave3", () => {
    expect(WaveSchema.parse("wave3")).toBe("wave3");
  });

  it("rejects invalid wave", () => {
    expect(() => WaveSchema.parse("wave4")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WizardStepSchema
// ---------------------------------------------------------------------------

describe("WizardStepSchema", () => {
  const allSteps = [
    "auth", "detect", "assess", "claude_md", "rules",
    "hooks", "plugins", "ci", "coverage", "arch", "connect", "skills", "verify",
  ];

  for (const step of allSteps) {
    it(`accepts "${step}"`, () => {
      expect(WizardStepSchema.parse(step)).toBe(step);
    });
  }

  it("rejects invalid step", () => {
    expect(() => WizardStepSchema.parse("invalid")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BacklogProviderSchema
// ---------------------------------------------------------------------------

describe("BacklogProviderSchema", () => {
  it("accepts azure-devops with project", () => {
    const result = BacklogProviderSchema.parse({
      type: "azure-devops",
      project: "MyProject",
    });
    expect(result.type).toBe("azure-devops");
    expect(result.project).toBe("MyProject");
  });

  it("accepts jira with project", () => {
    const result = BacklogProviderSchema.parse({
      type: "jira",
      project: "PROJ",
    });
    expect(result.type).toBe("jira");
  });

  it("rejects invalid type", () => {
    expect(() =>
      BacklogProviderSchema.parse({ type: "linear", project: "X" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ReadinessScoresSchema
// ---------------------------------------------------------------------------

describe("ReadinessScoresSchema", () => {
  it("accepts valid scores for all 6 dimensions", () => {
    const result = ReadinessScoresSchema.parse({
      cicd: 3, coverage: 2, security: 4, review: 1, dora: 0, docs: 5,
    });
    expect(result.cicd).toBe(3);
    expect(result.coverage).toBe(2);
    expect(result.security).toBe(4);
    expect(result.review).toBe(1);
    expect(result.dora).toBe(0);
    expect(result.docs).toBe(5);
  });

  it("rejects missing dimension", () => {
    expect(() =>
      ReadinessScoresSchema.parse({
        cicd: 3, coverage: 2, security: 4, review: 1, dora: 0,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExternalToolsConfigSchema
// ---------------------------------------------------------------------------

describe("ExternalToolsConfigSchema", () => {
  describe("happy paths", () => {
    it("parses valid security declarations", () => {
      const result = ExternalToolsConfigSchema.parse({
        security: [{ tool: "aikido", category: "sast", evidence: "Aikido SaaS" }],
      });
      expect(result.security).toHaveLength(1);
      expect(result.security[0].tool).toBe("aikido");
    });

    it("parses valid coverage section with sonarProjectKey", () => {
      const result = ExternalToolsConfigSchema.parse({
        coverage: { sonarProjectKey: "my-project" },
      });
      expect(result.coverage.sonarProjectKey).toBe("my-project");
    });

    it("parses valid docs declarations with pages", () => {
      const result = ExternalToolsConfigSchema.parse({
        docs: [{ tool: "azure-wiki", url: "https://wiki.example.com", pages: ["architecture", "api"] }],
      });
      expect(result.docs[0].pages).toEqual(["architecture", "api"]);
    });

    it("parses valid dora manual section", () => {
      const result = ExternalToolsConfigSchema.parse({
        dora: { deploymentSignal: "manual", deploymentsLast90Days: 24 },
      });
      expect(result.dora.deploymentSignal).toBe("manual");
      expect(result.dora.deploymentsLast90Days).toBe(24);
    });

    it("parses valid review practices", () => {
      const result = ExternalToolsConfigSchema.parse({
        review: [{ practice: "2 required approvals" }],
      });
      expect(result.review).toHaveLength(1);
    });

    it("parses valid cicd declarations with lint category", () => {
      const result = ExternalToolsConfigSchema.parse({
        cicd: [{ tool: "checkstyle", category: "lint" }],
      });
      expect(result.cicd[0].category).toBe("lint");
    });

    it("defaults to empty when not provided", () => {
      const result = ExternalToolsConfigSchema.parse({});
      expect(result.security).toEqual([]);
      expect(result.docs).toEqual([]);
      expect(result.cicd).toEqual([]);
      expect(result.review).toEqual([]);
    });
  });

  describe("failure paths", () => {
    it("rejects security declaration without tool field", () => {
      expect(() => ExternalToolsConfigSchema.parse({
        security: [{ category: "sast" }],
      })).toThrow();
    });

    it("rejects invalid category value", () => {
      expect(() => ExternalToolsConfigSchema.parse({
        security: [{ tool: "x", category: "invalid" }],
      })).toThrow();
    });

    it("rejects negative deploymentsLast90Days", () => {
      expect(() => ExternalToolsConfigSchema.parse({
        dora: { deploymentSignal: "manual", deploymentsLast90Days: -1 },
      })).toThrow();
    });

    it("rejects invalid deploymentSignal", () => {
      expect(() => ExternalToolsConfigSchema.parse({
        dora: { deploymentSignal: "invalid" },
      })).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// RepoManifestSchema — externalTools integration
// ---------------------------------------------------------------------------

describe("RepoManifestSchema — externalTools", () => {
  it("parses manifest with externalTools field", () => {
    const result = RepoManifestSchema.parse({
      corulusCcVersion: "0.3.5",
      techStack: "java",
      externalTools: {
        security: [{ tool: "aikido", category: "sast" }],
      },
    });
    expect(result.externalTools?.security).toHaveLength(1);
  });

  it("parses manifest without externalTools (backward compat)", () => {
    const result = RepoManifestSchema.parse({
      corulusCcVersion: "0.3.5",
      techStack: "typescript",
    });
    // externalTools is optional — when omitted Zod applies the inner default
    // so it resolves to the default empty structure, not undefined
    expect(result.externalTools).toBeDefined();
    expect(result.externalTools?.security).toEqual([]);
    expect(result.externalTools?.cicd).toEqual([]);
  });
});
