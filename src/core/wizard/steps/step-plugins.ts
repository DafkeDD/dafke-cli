/**
 * Step 6: Plugin Installation
 *
 * Installs recommended Claude Code plugins from the official marketplace.
 * Detects which plugins are already installed and only installs missing ones.
 * Prioritizes plugins based on readiness scores from the assessment step.
 */

import * as p from "@clack/prompts";
import { execa } from "execa";
import { resolve } from "node:path";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";
import { isClaudeAvailable } from "../../../utils/claude-cli.js";
import { findProjectRoot } from "../../../utils/package-root.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A relevance rule that triggers contextual reasoning based on assessment scores. */
interface RelevanceRule {
  condition: "low-score";
  dimension: string;
  threshold: number;
  reason: string;
}

/** Plugin recommendation with priority level and optional relevance rules. */
export interface PluginRecommendation {
  name: string;
  marketplace: string;
  description: string;
  priority: "essential" | "recommended" | "useful";
  relevanceRules?: RelevanceRule[];
}

// ---------------------------------------------------------------------------
// Plugin catalogue
// ---------------------------------------------------------------------------

import { DAFKE_PLUGIN_NAMES, DAFKE_MARKETPLACE_NAME } from "../../plugins/catalogue.js";

/** Plugins from the claude-plugins-official marketplace, ordered by priority. */
export const RECOMMENDED_PLUGINS: PluginRecommendation[] = [
  {
    name: "superpowers",
    marketplace: "claude-plugins-official",
    description: "Planning, debugging, TDD workflows",
    priority: "essential",
    relevanceRules: [
      { condition: "low-score", dimension: "review", threshold: 3, reason: "TDD workflows strengthen code review" },
    ],
  },
  {
    name: "commit-commands",
    marketplace: "claude-plugins-official",
    description: "Git commit, push, PR automation",
    priority: "essential",
  },
  {
    name: "claude-md-management",
    marketplace: "claude-plugins-official",
    description: "CLAUDE.md management",
    priority: "essential",
  },
  {
    name: "code-simplifier",
    marketplace: "claude-plugins-official",
    description: "Code quality and refactoring",
    priority: "recommended",
    relevanceRules: [
      { condition: "low-score", dimension: "review", threshold: 4, reason: "helps enforce code quality standards" },
    ],
  },
  {
    name: "feature-dev",
    marketplace: "claude-plugins-official",
    description: "Guided feature development",
    priority: "recommended",
    relevanceRules: [
      { condition: "low-score", dimension: "coverage", threshold: 3, reason: "guided development enforces test writing" },
    ],
  },
  {
    name: "context7",
    marketplace: "claude-plugins-official",
    description: "Library documentation lookup",
    priority: "useful",
  },
  {
    name: "skill-creator",
    marketplace: "claude-plugins-official",
    description: "Create and manage skills",
    priority: "useful",
  },
];

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = { essential: 0, recommended: 1, useful: 2 };

/**
 * Sort plugins by priority: essential first, then recommended, then useful.
 */
export function prioritizePlugins(
  plugins: PluginRecommendation[],
  _scores: Record<string, number> | undefined,
): PluginRecommendation[] {
  return [...plugins].sort((a, b) => {
    return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
  });
}

/**
 * Evaluate relevance rules against assessment scores and return matching reasons.
 */
export function getPluginReasons(
  plugin: PluginRecommendation,
  scores: Record<string, number> | undefined,
): string[] {
  if (!scores || !plugin.relevanceRules) return [];
  const reasons: string[] = [];
  for (const rule of plugin.relevanceRules) {
    const score = scores[rule.dimension];
    if (score !== undefined && score < rule.threshold) {
      reasons.push(rule.reason);
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface InstalledPlugin {
  name: string;
  marketplace: string;
}

async function getInstalledPlugins(): Promise<InstalledPlugin[]> {
  try {
    const result = await execa("claude", ["plugin", "list"], { timeout: 15_000 });
    const lines = result.stdout.split("\n");
    const plugins: InstalledPlugin[] = [];

    for (const line of lines) {
      // Format: "  ❯ plugin-name@marketplace"
      const match = line.match(/❯\s+(\S+)@(\S+)/);
      if (match && match[1] && match[2]) {
        plugins.push({ name: match[1], marketplace: match[2] });
      }
    }

    return plugins;
  } catch (err) {
    console.error(`dafke: failed to list plugins: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function installPlugin(name: string, marketplace: string): Promise<boolean> {
  try {
    await execa("claude", ["plugin", "install", `${name}@${marketplace}`, "--scope", "project"], { timeout: 60_000 });
    return true;
  } catch (err) {
    console.error(`dafke: failed to install ${name}@${marketplace}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Group label for each priority tier. */
const GROUP_LABELS: Record<string, string> = {
  essential: "Essential plugins:",
  recommended: "Recommended for your project:",
  useful: "Additional plugins:",
};

/**
 * Display plugins grouped by priority with contextual reasons from scores.
 */
function displayGroupedPlugins(
  plugins: PluginRecommendation[],
  scores: Record<string, number> | undefined,
): void {
  const groups = new Map<string, PluginRecommendation[]>();
  for (const plugin of plugins) {
    const list = groups.get(plugin.priority) ?? [];
    list.push(plugin);
    groups.set(plugin.priority, list);
  }

  for (const tier of ["essential", "recommended", "useful"]) {
    const group = groups.get(tier);
    if (!group || group.length === 0) continue;

    p.log.info(GROUP_LABELS[tier] ?? `${tier}:`);
    for (const plugin of group) {
      const reasons = getPluginReasons(plugin, scores);
      const reasonSuffix = reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
      p.log.message(`  ${plugin.name} — ${plugin.description}${reasonSuffix}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step executor
// ---------------------------------------------------------------------------

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  // Check if claude CLI is available
  if (!(await isClaudeAvailable())) {
    p.log.warn("Claude Code CLI not found. Skipping plugin installation.");
    p.log.info("Install Claude Code first: https://claude.ai/claude-code");
    return { success: true, data: { pluginsInstalled: 0, reason: "cli-not-found" } };
  }

  // --- Install Dafke plugins from local marketplace ---
  try {
    const packageRoot = findProjectRoot();

    // Add Dafke marketplace from local package (idempotent — check first)
    let marketplaceReady = false;
    try {
      const { stdout: marketplaces } = await execa("claude", ["plugin", "marketplace", "list"], { timeout: 15_000 });
      if (marketplaces.includes(DAFKE_MARKETPLACE_NAME)) {
        marketplaceReady = true;
      } else {
        p.log.info("Adding Dafke plugin marketplace...");
        await execa("claude", ["plugin", "marketplace", "add", resolve(packageRoot), "--scope", "project"], { timeout: 30_000 });
        p.log.success("Dafke marketplace added");
        marketplaceReady = true;
      }
    } catch (marketplaceErr) {
      p.log.warn(`Dafke marketplace setup failed: ${marketplaceErr instanceof Error ? marketplaceErr.message : String(marketplaceErr)}`);
      p.log.info("You can add it manually: claude plugin marketplace add <path-to-dafke>");
    }

    // Install dafke plugins (only if marketplace is ready)
    if (marketplaceReady) {
      const installed = await getInstalledPlugins();
      const installedNames = new Set(installed.map((pl) => pl.name));
      let corulusInstalled = 0;

      for (const name of DAFKE_PLUGIN_NAMES) {
        if (installedNames.has(name)) continue;
        p.log.info(`Installing ${name}...`);
        const ok = await installPlugin(name, DAFKE_MARKETPLACE_NAME);
        if (ok) {
          corulusInstalled++;
          p.log.success(`${name}: installed`);
        } else {
          p.log.warn(`${name}: failed`);
        }
      }

      if (corulusInstalled > 0) {
        p.log.success(`Installed ${corulusInstalled} Dafke plugin(s)`);
      } else if (installedNames.size > 0) {
        p.log.info("All Dafke plugins already installed");
      }
    }
  } catch (err) {
    p.log.warn(`Dafke plugin setup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Install third-party plugins ---

  // Read assessment scores from the context (set by step-assess)
  const scores = ctx.answers["scores"] as Record<string, number> | undefined;

  // Sort plugins by priority, taking scores into account
  const sorted = prioritizePlugins(RECOMMENDED_PLUGINS, scores);

  // In non-interactive mode, skip "useful" plugins to reduce noise in CI
  const candidates = ctx.nonInteractive
    ? sorted.filter((pl) => pl.priority !== "useful")
    : sorted;

  if (ctx.nonInteractive && sorted.length !== candidates.length) {
    const skipped = sorted.filter((pl) => pl.priority === "useful");
    p.log.info(
      `Skipping ${skipped.length} optional plugin(s) in non-interactive mode: ${skipped.map((pl) => pl.name).join(", ")}`,
    );
  }

  // Check which plugins are already installed
  const installed = await getInstalledPlugins();
  const installedNames = new Set(installed.map((pl) => pl.name));

  const toInstall = candidates.filter((pl) => !installedNames.has(pl.name));

  if (toInstall.length === 0) {
    p.log.success(`All ${candidates.length} recommended plugins already installed.`);
    return { success: true, data: { pluginsInstalled: 0, alreadyInstalled: candidates.length } };
  }

  // Display grouped overview
  displayGroupedPlugins(toInstall, scores);

  p.log.info(`${toInstall.length} plugin(s) to install (${installed.length} already present)`);

  if (!ctx.nonInteractive) {
    const proceed = await p.confirm({ message: `Install ${toInstall.length} plugin(s)?` });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Skipped plugin installation");
      return { success: true, data: { pluginsInstalled: 0 } };
    }
  }

  let successCount = 0;
  const failures: string[] = [];

  for (const plugin of toInstall) {
    const s = p.spinner();
    s.start(`Installing ${plugin.name}...`);
    const ok = await installPlugin(plugin.name, plugin.marketplace);
    if (ok) {
      successCount++;
      s.stop(`${plugin.name}: installed`);
    } else {
      s.stop(`${plugin.name}: failed`);
      failures.push(plugin.name);
    }
  }

  if (failures.length > 0) {
    p.log.warn(`${failures.length} plugin(s) failed: ${failures.join(", ")}`);
    p.log.info("You can install them manually: claude plugin install <name>@claude-plugins-official");
  }

  p.log.success(`Installed ${successCount}/${toInstall.length} plugins`);

  return {
    success: true,
    data: { pluginsInstalled: successCount, pluginsFailed: failures },
  };
}
