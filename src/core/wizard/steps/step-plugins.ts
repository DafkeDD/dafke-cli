/**
 * Step 5: Plugin Installation
 *
 * Installs:
 *   1. Dafke plugins from the local Dafke marketplace (this package).
 *   2. Recommended plugins from Anthropic's official marketplace
 *      (claude-plugins-official) — superpowers, commit-commands, etc.
 *
 * Both marketplaces are registered first (idempotent).
 */

import * as p from "@clack/prompts";
import { execa } from "execa";
import { resolve } from "node:path";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";
import { isClaudeAvailable } from "../../../utils/claude-cli.js";
import { findProjectRoot } from "../../../utils/package-root.js";
import { DAFKE_PLUGIN_NAMES, DAFKE_MARKETPLACE_NAME } from "../../plugins/catalogue.js";

// ---------------------------------------------------------------------------
// Official Anthropic marketplace
// ---------------------------------------------------------------------------

const OFFICIAL_MARKETPLACE = "claude-plugins-official";
const OFFICIAL_MARKETPLACE_SOURCE = "anthropics/claude-plugins-official";

export interface PluginRecommendation {
  name: string;
  marketplace: string;
  description: string;
  priority: "essential" | "recommended" | "useful";
}

/** Recommended plugins from the official Anthropic marketplace, by priority. */
export const RECOMMENDED_PLUGINS: PluginRecommendation[] = [
  { name: "superpowers", marketplace: OFFICIAL_MARKETPLACE, description: "Planning, debugging, TDD workflows", priority: "essential" },
  { name: "commit-commands", marketplace: OFFICIAL_MARKETPLACE, description: "Git commit, push, PR automation", priority: "essential" },
  { name: "claude-md-management", marketplace: OFFICIAL_MARKETPLACE, description: "CLAUDE.md management", priority: "essential" },
  { name: "code-simplifier", marketplace: OFFICIAL_MARKETPLACE, description: "Code quality and refactoring", priority: "recommended" },
  { name: "feature-dev", marketplace: OFFICIAL_MARKETPLACE, description: "Guided feature development", priority: "recommended" },
  { name: "context7", marketplace: OFFICIAL_MARKETPLACE, description: "Library documentation lookup", priority: "useful" },
  { name: "skill-creator", marketplace: OFFICIAL_MARKETPLACE, description: "Create and manage skills", priority: "useful" },
];

const PRIORITY_ORDER: Record<string, number> = { essential: 0, recommended: 1, useful: 2 };

export function prioritizePlugins(plugins: PluginRecommendation[]): PluginRecommendation[] {
  return [...plugins].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
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

/** Add a marketplace if it isn't already registered. Returns true when ready. */
async function ensureMarketplace(name: string, source: string): Promise<boolean> {
  try {
    const { stdout } = await execa("claude", ["plugin", "marketplace", "list"], { timeout: 15_000 });
    if (stdout.includes(name)) return true;
    p.log.info(`Adding ${name} marketplace...`);
    await execa("claude", ["plugin", "marketplace", "add", source, "--scope", "project"], { timeout: 30_000 });
    p.log.success(`${name} marketplace added`);
    return true;
  } catch (err) {
    p.log.warn(`Could not add ${name} marketplace: ${err instanceof Error ? err.message : String(err)}`);
    p.log.info(`Add it manually: claude plugin marketplace add ${source}`);
    return false;
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

async function installGroup(
  items: { name: string; marketplace: string }[],
  installedNames: Set<string>,
): Promise<{ installed: number; failures: string[] }> {
  let installed = 0;
  const failures: string[] = [];
  for (const item of items) {
    if (installedNames.has(item.name)) continue;
    const s = p.spinner();
    s.start(`Installing ${item.name}...`);
    const ok = await installPlugin(item.name, item.marketplace);
    if (ok) {
      installed++;
      s.stop(`${item.name}: installed`);
    } else {
      s.stop(`${item.name}: failed`);
      failures.push(item.name);
    }
  }
  return { installed, failures };
}

// ---------------------------------------------------------------------------
// Step executor
// ---------------------------------------------------------------------------

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  if (!(await isClaudeAvailable())) {
    p.log.warn("Claude Code CLI not found. Skipping plugin installation.");
    p.log.info("Install Claude Code first: https://claude.ai/claude-code");
    return { success: true, data: { pluginsInstalled: 0, reason: "cli-not-found" } };
  }

  const installedBefore = await getInstalledPlugins();
  const installedNames = new Set(installedBefore.map((pl) => pl.name));

  let totalInstalled = 0;
  const allFailures: string[] = [];

  // --- 1. Dafke plugins (local marketplace) ---
  const dafkeReady = await ensureMarketplace(DAFKE_MARKETPLACE_NAME, resolve(findProjectRoot()));
  if (dafkeReady) {
    const dafkeItems = DAFKE_PLUGIN_NAMES.map((name) => ({ name, marketplace: DAFKE_MARKETPLACE_NAME }));
    const pending = dafkeItems.filter((i) => !installedNames.has(i.name));
    if (pending.length === 0) {
      p.log.success("All Dafke plugins already installed.");
    } else {
      p.log.info(`Dafke plugins: ${pending.map((i) => i.name).join(", ")}`);
      const res = await installGroup(dafkeItems, installedNames);
      totalInstalled += res.installed;
      allFailures.push(...res.failures);
    }
  }

  // --- 2. Recommended plugins (official Anthropic marketplace) ---
  const officialReady = await ensureMarketplace(OFFICIAL_MARKETPLACE, OFFICIAL_MARKETPLACE_SOURCE);
  if (officialReady) {
    const sorted = prioritizePlugins(RECOMMENDED_PLUGINS);
    const pending = sorted.filter((pl) => !installedNames.has(pl.name));
    if (pending.length === 0) {
      p.log.success("All recommended plugins already installed.");
    } else {
      for (const pl of pending) {
        p.log.message(`  ${pl.name} — ${pl.description}`);
      }
      let proceed = true;
      if (!ctx.nonInteractive) {
        const answer = await p.confirm({ message: `Install ${pending.length} recommended plugin(s)?` });
        proceed = !p.isCancel(answer) && answer === true;
      }
      if (proceed) {
        const res = await installGroup(sorted, installedNames);
        totalInstalled += res.installed;
        allFailures.push(...res.failures);
      } else {
        p.log.info("Skipped recommended plugins");
      }
    }
  }

  if (allFailures.length > 0) {
    p.log.warn(`${allFailures.length} plugin(s) failed: ${allFailures.join(", ")}`);
  }
  p.log.success(`Installed ${totalInstalled} plugin(s)`);

  return { success: true, data: { pluginsInstalled: totalInstalled, pluginsFailed: allFailures } };
}
