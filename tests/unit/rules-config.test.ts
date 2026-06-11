import { describe, it, expect } from "vitest";
import { RulesSchema } from "../../src/core/config/rules-schema.js";

describe("RulesSchema", () => {
  it("parses empty object with all defaults", () => {
    const rules = RulesSchema.parse({});
    expect(rules.assessment.wave1Threshold).toBe(20);
    expect(rules.assessment.wave2Threshold).toBe(12);
    expect(rules.assessment.hardGateThreshold).toBe(3);
    expect(rules.assessment.hardGates).toEqual(["cicd", "security"]);
    expect(rules.governance.prSizeLimit).toBe(400);
    expect(rules.governance.coverageThreshold).toBe(80);
  });

  it("allows overriding individual values", () => {
    const rules = RulesSchema.parse({
      assessment: { wave1Threshold: 25 },
    });
    expect(rules.assessment.wave1Threshold).toBe(25);
    expect(rules.assessment.wave2Threshold).toBe(12); // default preserved
  });

  it("validates wave1Threshold range", () => {
    expect(() => RulesSchema.parse({ assessment: { wave1Threshold: -1 } })).toThrow();
    expect(() => RulesSchema.parse({ assessment: { wave1Threshold: 31 } })).toThrow();
  });

  it("validates prSizeLimit range", () => {
    expect(() => RulesSchema.parse({ governance: { prSizeLimit: 10 } })).toThrow();
    expect(() => RulesSchema.parse({ governance: { prSizeLimit: 3000 } })).toThrow();
  });

  it("validates timeout ranges", () => {
    expect(() => RulesSchema.parse({ timeouts: { pluginInstall: 100 } })).toThrow();
    expect(() => RulesSchema.parse({ timeouts: { pluginInstall: 400000 } })).toThrow();
  });

  it("parses full config with all fields", () => {
    const full = {
      assessment: { wave1Threshold: 22, wave2Threshold: 14, hardGateThreshold: 4, hardGates: ["cicd", "security", "coverage"] },
      governance: { prSizeLimit: 300, coverageThreshold: 90 },
      security: { exemptPaths: ["**/*.test.ts"] },
      timeouts: { pluginInstall: 90000, claudePrompt: 45000, toolCheck: 8000 },
    };
    const rules = RulesSchema.parse(full);
    expect(rules.assessment.wave1Threshold).toBe(22);
    expect(rules.governance.prSizeLimit).toBe(300);
    expect(rules.timeouts.pluginInstall).toBe(90000);
  });

  it("strips unknown fields", () => {
    const rules = RulesSchema.parse({ unknown: "field", assessment: { wave1Threshold: 20 } });
    expect((rules as Record<string, unknown>)["unknown"]).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Default value mutation killers — parsing undefined triggers factories
  // -----------------------------------------------------------------------

  it("parsing undefined returns all correct defaults", () => {
    const rules = RulesSchema.parse(undefined);

    // assessment
    expect(rules.assessment.wave1Threshold).toBe(20);
    expect(rules.assessment.wave2Threshold).toBe(12);
    expect(rules.assessment.hardGateThreshold).toBe(3);
    expect(rules.assessment.hardGates).toEqual(["cicd", "security"]);

    // governance
    expect(rules.governance.prSizeLimit).toBe(400);
    expect(rules.governance.coverageThreshold).toBe(80);

    // security
    expect(rules.security.exemptPaths).toEqual(["**/*.test.ts", "**/*.spec.ts", "__tests__/**"]);

    // timeouts
    expect(rules.timeouts.pluginInstall).toBe(60000);
    expect(rules.timeouts.claudePrompt).toBe(30000);
    expect(rules.timeouts.toolCheck).toBe(5000);
  });

  it("assessment.hardGates default is exactly ['cicd', 'security']", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.assessment.hardGates).toStrictEqual(["cicd", "security"]);
    expect(rules.assessment.hardGates).toHaveLength(2);
    expect(rules.assessment.hardGates[0]).toBe("cicd");
    expect(rules.assessment.hardGates[1]).toBe("security");
  });

  it("security.exemptPaths default contains '**/*.test.ts'", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.security.exemptPaths).toContain("**/*.test.ts");
    expect(rules.security.exemptPaths).toContain("**/*.spec.ts");
    expect(rules.security.exemptPaths).toContain("__tests__/**");
  });

  it("timeouts.toolCheck default is exactly 5000", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.timeouts.toolCheck).toBe(5000);
  });

  it("timeouts.pluginInstall default is exactly 60000", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.timeouts.pluginInstall).toBe(60000);
  });

  it("timeouts.claudePrompt default is exactly 30000", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.timeouts.claudePrompt).toBe(30000);
  });

  it("governance.prSizeLimit default is exactly 400", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.governance.prSizeLimit).toBe(400);
  });

  it("governance.coverageThreshold default is exactly 80", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.governance.coverageThreshold).toBe(80);
  });

  it("assessment.wave1Threshold default is exactly 20", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.assessment.wave1Threshold).toBe(20);
  });

  it("assessment.wave2Threshold default is exactly 12", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.assessment.wave2Threshold).toBe(12);
  });

  it("assessment.hardGateThreshold default is exactly 3", () => {
    const rules = RulesSchema.parse(undefined);
    expect(rules.assessment.hardGateThreshold).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Nested object defaults — empty sub-objects trigger field-level defaults
  // -----------------------------------------------------------------------

  it("empty assessment object gets field-level defaults", () => {
    const rules = RulesSchema.parse({ assessment: {} });
    expect(rules.assessment.wave1Threshold).toBe(20);
    expect(rules.assessment.wave2Threshold).toBe(12);
    expect(rules.assessment.hardGateThreshold).toBe(3);
    expect(rules.assessment.hardGates).toEqual(["cicd", "security"]);
  });

  it("empty security object gets field-level defaults", () => {
    const rules = RulesSchema.parse({ security: {} });
    expect(rules.security.exemptPaths).toEqual(["**/*.test.ts", "**/*.spec.ts", "__tests__/**"]);
  });

  it("empty timeouts object gets field-level defaults", () => {
    const rules = RulesSchema.parse({ timeouts: {} });
    expect(rules.timeouts.pluginInstall).toBe(60000);
    expect(rules.timeouts.claudePrompt).toBe(30000);
    expect(rules.timeouts.toolCheck).toBe(5000);
  });

  it("empty governance object gets field-level defaults", () => {
    const rules = RulesSchema.parse({ governance: {} });
    expect(rules.governance.prSizeLimit).toBe(400);
    expect(rules.governance.coverageThreshold).toBe(80);
  });
});
