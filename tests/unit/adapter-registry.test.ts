import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TechStack } from "@/core/config/config-schema.js";
import type {
  TechnologyAdapter,
  DetectionResult,
  AnalysisResult,
  CoverageConfig,
  MutationConfig,
  SecurityConfig,
  BuildInfo,
} from "@/adapters/adapter-interface.js";
import { AdapterRegistry } from "@/adapters/adapter-registry.js";

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(
  name: TechStack,
  displayName: string,
  detectResult: DetectionResult,
): TechnologyAdapter {
  return {
    name,
    displayName,
    detect: vi.fn().mockResolvedValue(detectResult),
    analyze: vi.fn().mockResolvedValue({
      techStack: name,
      buildInfo: {
        buildTool: "mock",
        buildCommand: "mock build",
        testCommand: "mock test",
        lintCommand: null,
      },
      entryPoints: [],
      testFramework: null,
      coverageToolDetected: false,
      existingCoverage: null,
      hasCI: false,
      hasSAST: false,
      hasSecretsDetection: false,
      dependencies: { total: 0, outdated: 0 },
    } satisfies AnalysisResult),
    getCoverageConfig: vi.fn().mockReturnValue({
      tool: "mock",
      command: "mock",
      reportPath: "mock",
      reportFormat: "lcov",
    } satisfies CoverageConfig),
    getMutationConfig: vi.fn().mockReturnValue({
      tool: "mock",
      command: "",
      configFile: "",
      supported: false,
    } satisfies MutationConfig),
    getSecurityConfig: vi.fn().mockReturnValue({
      sastTools: [],
      secretsDetection: "mock",
      scaTools: [],
    } satisfies SecurityConfig),
    getBuildInfo: vi.fn().mockResolvedValue({
      buildTool: "mock",
      buildCommand: "mock",
      testCommand: "mock",
      lintCommand: null,
    } satisfies BuildInfo),
    getClaudeMdSection: vi.fn().mockReturnValue(""),
    getCITemplateId: vi.fn().mockReturnValue("mock"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  // =========================================================================
  // register()
  // =========================================================================

  describe("register", () => {
    it("adds an adapter to the registry", () => {
      const adapter = createMockAdapter("java", "Java", {
        detected: true,
        confidence: 0.8,
        indicators: ["pom.xml"],
      });

      registry.register(adapter);

      expect(registry.get("java")).toBe(adapter);
    });

    it("overwrites an existing adapter for the same tech stack", () => {
      const first = createMockAdapter("java", "Java v1", {
        detected: true,
        confidence: 0.5,
        indicators: [],
      });
      const second = createMockAdapter("java", "Java v2", {
        detected: true,
        confidence: 0.9,
        indicators: [],
      });

      registry.register(first);
      registry.register(second);

      expect(registry.get("java")).toBe(second);
    });
  });

  // =========================================================================
  // detect()
  // =========================================================================

  describe("detect", () => {
    it("returns the highest-confidence adapter", async () => {
      const javaAdapter = createMockAdapter("java", "Java", {
        detected: true,
        confidence: 0.6,
        indicators: ["pom.xml"],
      });
      const dotnetAdapter = createMockAdapter("dotnet", ".NET", {
        detected: true,
        confidence: 0.9,
        indicators: ["*.csproj"],
      });
      const tsAdapter = createMockAdapter("typescript", "TypeScript", {
        detected: true,
        confidence: 0.3,
        indicators: ["tsconfig.json"],
      });

      registry.register(javaAdapter);
      registry.register(dotnetAdapter);
      registry.register(tsAdapter);

      const result = await registry.detect("/some/repo");

      expect(result).not.toBeNull();
      expect(result?.adapter.name).toBe("dotnet");
      expect(result?.result.confidence).toBe(0.9);
    });

    it("returns null when no adapter detects anything", async () => {
      const javaAdapter = createMockAdapter("java", "Java", {
        detected: false,
        confidence: 0,
        indicators: [],
      });
      const dotnetAdapter = createMockAdapter("dotnet", ".NET", {
        detected: false,
        confidence: 0,
        indicators: [],
      });

      registry.register(javaAdapter);
      registry.register(dotnetAdapter);

      const result = await registry.detect("/empty/dir");
      expect(result).toBeNull();
    });

    it("returns null for an empty registry", async () => {
      const result = await registry.detect("/some/repo");
      expect(result).toBeNull();
    });

    it("ignores adapters that did not detect", async () => {
      const javaAdapter = createMockAdapter("java", "Java", {
        detected: false,
        confidence: 0,
        indicators: [],
      });
      const tsAdapter = createMockAdapter("typescript", "TypeScript", {
        detected: true,
        confidence: 0.7,
        indicators: ["tsconfig.json"],
      });

      registry.register(javaAdapter);
      registry.register(tsAdapter);

      const result = await registry.detect("/some/repo");

      expect(result).not.toBeNull();
      expect(result?.adapter.name).toBe("typescript");
    });
  });

  // =========================================================================
  // get()
  // =========================================================================

  describe("get", () => {
    it("returns a registered adapter by tech stack", () => {
      const adapter = createMockAdapter("dotnet", ".NET", {
        detected: true,
        confidence: 0.8,
        indicators: [],
      });

      registry.register(adapter);

      expect(registry.get("dotnet")).toBe(adapter);
    });

    it("returns undefined for an unregistered tech stack", () => {
      expect(registry.get("java")).toBeUndefined();
    });
  });

  // =========================================================================
  // getAll()
  // =========================================================================

  describe("getAll", () => {
    it("returns all registered adapters", () => {
      const javaAdapter = createMockAdapter("java", "Java", {
        detected: false,
        confidence: 0,
        indicators: [],
      });
      const dotnetAdapter = createMockAdapter("dotnet", ".NET", {
        detected: false,
        confidence: 0,
        indicators: [],
      });

      registry.register(javaAdapter);
      registry.register(dotnetAdapter);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.name)).toContain("java");
      expect(all.map((a) => a.name)).toContain("dotnet");
    });

    it("returns empty array for empty registry", () => {
      expect(registry.getAll()).toEqual([]);
    });
  });
});
