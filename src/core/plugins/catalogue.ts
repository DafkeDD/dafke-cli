/**
 * Dafke plugin catalogue — single source of truth for all plugin names
 * and metadata. Imported by plugin.ts, update.ts, and step-plugins.ts.
 */

export interface CorulusPlugin {
  readonly name: string;
  readonly description: string;
}

export const DAFKE_PLUGINS: readonly CorulusPlugin[] = [
  { name: "dafke-sdlc", description: "Story-to-PR development pipeline (9 skills, 5 agents)" },
  { name: "dafke-quality", description: "Code quality gates — lint, coverage, mutation, security, audit (6 skills, 5 agents)" },
  { name: "dafke-observability", description: "CI/CD monitoring, DORA metrics, backlog (5 skills)" },
  { name: "dafke-docs", description: "Architecture docs, AI doc crew, feature docs, onboarding (5 skills, 11 agents)" },
  { name: "dafke-config", description: "Init, doctor, update, discover (4 skills)" },
] as const;

export const DAFKE_PLUGIN_NAMES: readonly string[] = DAFKE_PLUGINS.map((p) => p.name);

export const DAFKE_MARKETPLACE_NAME = "dafke";
