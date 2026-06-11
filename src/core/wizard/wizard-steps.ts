/**
 * Wizard step definitions, types, and executor interface.
 *
 * The 13-step init wizard walks developers through full AI-assisted
 * development onboarding. Steps are executed in order and are
 * checkpoint-resumable via StateManager.
 *
 * Skills and agents are installed as Claude Marketplace plugins in the
 * "plugins" step — there is no separate "skills" step.
 */

export const WIZARD_STEPS = [
  "auth",
  "detect",
  "assess",
  "external_tools",
  "claude_md",
  "rules",
  "hooks",
  "plugins",
  "ci",
  "coverage",
  "arch",
  "connect",
  "verify",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStepId, string> = {
  auth: "Authentication & Providers",
  detect: "Repository Detection",
  assess: "Readiness Assessment",
  external_tools: "External Tools",
  claude_md: "CLAUDE.md Generation",
  rules: "Instruction Rules",
  hooks: "Hooks & Settings",
  plugins: "Plugin Installation",
  ci: "CI/CD Hardening",
  coverage: "Test Coverage Analysis",
  arch: "Architecture Documentation",
  connect: "Project Board Connection",
  verify: "Verification & Summary",
};

export interface WizardStepContext {
  repoRoot: string;
  verbose: boolean;
  nonInteractive: boolean;
  answers: Record<string, unknown>;
  scores?: Record<string, number>;
  degradedFeatures?: Array<{ feature: string; reason: string }>;
}

export interface WizardStepResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
}

export type WizardStepExecutor = (ctx: WizardStepContext) => Promise<WizardStepResult>;
