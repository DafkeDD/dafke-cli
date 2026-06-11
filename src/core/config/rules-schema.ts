/**
 * Rules configuration schema — all tunable values for dafke.
 * Loaded from .dafke/rules.yaml with sensible defaults.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Default values — centralized for reuse in schema defaults and exports
// ---------------------------------------------------------------------------

const ASSESSMENT_DEFAULTS = {
  wave1Threshold: 20,
  wave2Threshold: 12,
  hardGateThreshold: 3,
  hardGates: ["cicd", "security"],
} as const;

const GOVERNANCE_DEFAULTS = {
  prSizeLimit: 400,
  coverageThreshold: 80,
} as const;

const SECURITY_DEFAULTS = {
  exemptPaths: ["**/*.test.ts", "**/*.spec.ts", "__tests__/**"],
} as const;

const CONSTITUTION_DEFAULTS = {
  enabled: true,
} as const;

const TIMEOUT_DEFAULTS = {
  pluginInstall: 60000,
  claudePrompt: 30000,
  toolCheck: 5000,
} as const;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const RulesSchema = z.object({
  assessment: z.object({
    wave1Threshold: z.number().int().min(0).max(30).default(ASSESSMENT_DEFAULTS.wave1Threshold),
    wave2Threshold: z.number().int().min(0).max(30).default(ASSESSMENT_DEFAULTS.wave2Threshold),
    hardGateThreshold: z.number().int().min(0).max(5).default(ASSESSMENT_DEFAULTS.hardGateThreshold),
    hardGates: z.array(z.string()).default([...ASSESSMENT_DEFAULTS.hardGates]),
  }).default(() => ({
    wave1Threshold: ASSESSMENT_DEFAULTS.wave1Threshold,
    wave2Threshold: ASSESSMENT_DEFAULTS.wave2Threshold,
    hardGateThreshold: ASSESSMENT_DEFAULTS.hardGateThreshold,
    hardGates: [...ASSESSMENT_DEFAULTS.hardGates],
  })),
  governance: z.object({
    prSizeLimit: z.number().int().min(50).max(2000).default(GOVERNANCE_DEFAULTS.prSizeLimit),
    coverageThreshold: z.number().int().min(0).max(100).default(GOVERNANCE_DEFAULTS.coverageThreshold),
  }).default(() => ({
    prSizeLimit: GOVERNANCE_DEFAULTS.prSizeLimit,
    coverageThreshold: GOVERNANCE_DEFAULTS.coverageThreshold,
  })),
  security: z.object({
    exemptPaths: z.array(z.string()).default([...SECURITY_DEFAULTS.exemptPaths]),
  }).default(() => ({
    exemptPaths: [...SECURITY_DEFAULTS.exemptPaths],
  })),
  constitution: z.object({
    enabled: z.boolean().default(CONSTITUTION_DEFAULTS.enabled),
  }).default(() => ({
    enabled: CONSTITUTION_DEFAULTS.enabled,
  })),
  timeouts: z.object({
    pluginInstall: z.number().int().min(5000).max(300000).default(TIMEOUT_DEFAULTS.pluginInstall),
    claudePrompt: z.number().int().min(5000).max(120000).default(TIMEOUT_DEFAULTS.claudePrompt),
    toolCheck: z.number().int().min(1000).max(30000).default(TIMEOUT_DEFAULTS.toolCheck),
  }).default(() => ({
    pluginInstall: TIMEOUT_DEFAULTS.pluginInstall,
    claudePrompt: TIMEOUT_DEFAULTS.claudePrompt,
    toolCheck: TIMEOUT_DEFAULTS.toolCheck,
  })),
}).default(() => ({
  assessment: {
    wave1Threshold: ASSESSMENT_DEFAULTS.wave1Threshold,
    wave2Threshold: ASSESSMENT_DEFAULTS.wave2Threshold,
    hardGateThreshold: ASSESSMENT_DEFAULTS.hardGateThreshold,
    hardGates: [...ASSESSMENT_DEFAULTS.hardGates],
  },
  governance: {
    prSizeLimit: GOVERNANCE_DEFAULTS.prSizeLimit,
    coverageThreshold: GOVERNANCE_DEFAULTS.coverageThreshold,
  },
  security: {
    exemptPaths: [...SECURITY_DEFAULTS.exemptPaths],
  },
  constitution: {
    enabled: CONSTITUTION_DEFAULTS.enabled,
  },
  timeouts: {
    pluginInstall: TIMEOUT_DEFAULTS.pluginInstall,
    claudePrompt: TIMEOUT_DEFAULTS.claudePrompt,
    toolCheck: TIMEOUT_DEFAULTS.toolCheck,
  },
}));

export type Rules = z.infer<typeof RulesSchema>;
