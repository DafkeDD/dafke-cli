import { defineCommand } from "citty";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { readdir, readFile, stat as fsStat, rm } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { ConfigManager } from "../../core/config/config-manager.js";
import { VERSION } from "../../index.js";
import { UpdateChecker } from "../../core/updater/update-checker.js";
import { isClaudeAvailable } from "../../utils/claude-cli.js";
import { findProjectRoot } from "../../utils/package-root.js";
import { DAFKE_PLUGIN_NAMES } from "../../core/plugins/catalogue.js";

/**
 * Compare a legacy skill/agent file against the plugin template.
 * Returns "remove" if content is identical, "warn" if modified.
 */
async function shouldRemoveLegacyFile(
  filePath: string,
  pluginTemplatePath: string,
): Promise<"remove" | "warn"> {
  try {
    const [repo, template] = await Promise.all([
      readFile(filePath, "utf-8"),
      readFile(pluginTemplatePath, "utf-8"),
    ]);
    return repo === template ? "remove" : "warn";
  } catch {
    return "warn";
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "update",
    description: "Check for config drift, propose corrections",
  },
  args: {
    check: {
      type: "boolean",
      description: "Check only, don't apply changes",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Force apply corrections without confirmation",
      default: false,
    },
    plugins: {
      type: "boolean",
      description: "Also update Dafke plugins and migrate legacy skill files",
      default: false,
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const configManager = new ConfigManager();
    const checker = new UpdateChecker();
    const checkOnly = args.check as boolean;
    const force = args.force as boolean;

    console.log();
    console.log(chalk.bold.hex("#f76707")("  Dafke Update"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log();

    // 1. Check for new dafke version
    const s = p.spinner();
    s.start("Checking for updates...");

    const latestVersion = await checker.checkForUpdates();
    s.stop("Version check complete");

    if (latestVersion && latestVersion !== VERSION) {
      console.log(chalk.yellow(`  New version available: ${chalk.bold(latestVersion)} (current: ${VERSION})`));
      console.log(chalk.dim(`  Run: npm install -g dafke@${latestVersion}`));
      console.log();
    } else {
      console.log(chalk.green(`  dafke v${VERSION} is up to date.`));
      console.log();
    }

    // 2. Load manifest
    const manifest = await configManager.loadManifest(repoRoot);
    if (!manifest) {
      console.log(chalk.yellow("  No manifest found. Run `dafke init` first."));
      return;
    }

    // 3. Detect drift
    s.start("Detecting config drift...");
    const driftResults = await checker.detectDrift(repoRoot);
    s.stop("Drift detection complete");

    // Proactive legacy skill scan (always, regardless of drift)
    const legacySkillsDir = join(repoRoot, ".claude", "skills");
    const legacyAgentsDir = join(repoRoot, ".claude", "agents");
    let legacySkillCount = 0;
    let legacyAgentCount = 0;

    try {
      const legacyEntries = await readdir(legacySkillsDir, { withFileTypes: true });
      legacySkillCount = legacyEntries.filter((e) => e.isDirectory() && e.name.startsWith("dafke-")).length;
    } catch {
      // No legacy skills directory
    }

    try {
      const agentEntries = await readdir(legacyAgentsDir, { withFileTypes: true });
      legacyAgentCount = agentEntries.filter((e) => e.isDirectory() && e.name.startsWith("dafke-")).length;
    } catch {
      // No legacy agents directory
    }

    const totalLegacy = legacySkillCount + legacyAgentCount;

    if (totalLegacy > 0 && !(args.plugins as boolean)) {
      console.log(chalk.yellow(`  Detected ${totalLegacy} legacy dafke file(s) (${legacySkillCount} skills, ${legacyAgentCount} agent dirs).`));
      console.log(chalk.dim("  Run `dafke update --plugins` to migrate to the plugin system."));
      console.log();
    }

    if (driftResults.length === 0 && !(args.plugins as boolean) && totalLegacy === 0) {
      console.log(chalk.green("  All generated files match current templates. No drift detected."));
      console.log();
      return;
    }

    // 4. Show drift results
    console.log(chalk.yellow(`  Found ${driftResults.length} file(s) with drift:`));
    console.log();

    for (const drift of driftResults) {
      console.log(`  ${chalk.bold(drift.filePath)}`);
      if (drift.type === "missing") {
        console.log(chalk.red("    File missing — will be created from template"));
      } else if (drift.type === "modified") {
        console.log(chalk.yellow("    File differs from template"));
        if (drift.diff) {
          const lines = drift.diff.split("\n").slice(0, 10);
          for (const line of lines) {
            if (line.startsWith("+")) {
              console.log(chalk.green(`    ${line}`));
            } else if (line.startsWith("-")) {
              console.log(chalk.red(`    ${line}`));
            } else {
              console.log(chalk.dim(`    ${line}`));
            }
          }
          if (drift.diff.split("\n").length > 10) {
            console.log(chalk.dim("    ... (truncated)"));
          }
        }
      }
      console.log();
    }

    // 5. Check-only mode
    if (checkOnly) {
      console.log(chalk.dim("  Check-only mode — no changes applied."));
      return;
    }

    // 6. Apply changes
    if (!force) {
      const shouldApply = await p.confirm({
        message: `Apply ${driftResults.length} change(s)?`,
      });

      if (p.isCancel(shouldApply) || !shouldApply) {
        console.log(chalk.dim("  No changes applied."));
        return;
      }
    }

    s.start("Applying updates...");
    await checker.applyUpdate(repoRoot, driftResults);
    s.stop("Updates applied");

    // 7. Update manifest version
    manifest.corulusCcVersion = VERSION;
    await configManager.saveManifest(manifest, repoRoot);

    console.log(chalk.green(`  ${driftResults.length} file(s) updated. Manifest version bumped.`));
    console.log();

    // 8. Plugin migration (only with --plugins flag)
    if (args.plugins as boolean) {
      console.log(chalk.bold("  Plugin Migration"));
      console.log(chalk.dim("  " + "─".repeat(50)));
      console.log();

      if (!(await isClaudeAvailable())) {
        console.error(chalk.red("  --plugins requires Claude Code CLI."));
        console.error(chalk.dim("  Install: https://docs.anthropic.com/en/docs/claude-code"));
        process.exit(1);
      }

      // Update existing dafke plugins
      for (const name of DAFKE_PLUGIN_NAMES) {
        const sp = p.spinner();
        sp.start(`Updating ${name}...`);
        try {
          await execa("claude", ["plugin", "update", `${name}@dafke`, "--scope", "project"], { timeout: 60_000 });
          sp.stop(`${name}: up to date`);
        } catch {
          sp.stop(`${name}: not installed or update failed`);
        }
      }
      console.log();

      // Migrate legacy .claude/skills/dafke-* files
      if (totalLegacy > 0) {
        console.log(chalk.yellow(`  Migrating ${totalLegacy} legacy file(s)...`));

        let removed = 0;
        let warned = 0;
        let packageRoot: string;

        try {
          packageRoot = findProjectRoot();
        } catch {
          console.error(chalk.red("  Cannot locate dafke package root for template comparison."));
          return;
        }

        // Migrate legacy skills
        let skillEntries: Array<{ isDirectory(): boolean; name: string }> = [];
        try {
          skillEntries = await readdir(legacySkillsDir, { withFileTypes: true });
        } catch {
          // No legacy skills directory — skip to agents
        }
        for (const entry of skillEntries) {
          if (!entry.isDirectory() || !entry.name.startsWith("dafke-")) continue;

          const legacyFile = join(legacySkillsDir, entry.name, "SKILL.md");
          // Find the matching plugin template
          let templateFile: string | null = null;
          for (const plugin of await readdir(join(packageRoot, "plugins"))) {
            const candidate = join(packageRoot, "plugins", plugin, "skills", entry.name, "SKILL.md");
            try {
              await fsStat(candidate);
              templateFile = candidate;
              break;
            } catch {
              // Not in this plugin
            }
          }

          if (!templateFile) {
            console.log(chalk.dim(`    ${entry.name}: no matching plugin template — skipping`));
            continue;
          }

          const action = await shouldRemoveLegacyFile(legacyFile, templateFile);
          if (action === "remove") {
            if (!checkOnly) {
              await rm(join(legacySkillsDir, entry.name), { recursive: true, force: true });
            }
            console.log(chalk.green(`    ${entry.name}: removed (identical to plugin)`));
            removed++;
          } else {
            console.log(chalk.yellow(`    ${entry.name}: differs from plugin template — manual review needed`));
            console.log(chalk.dim(`      This file is no longer loaded via plugins. To migrate:`));
            console.log(chalk.dim(`      1. Review your customizations`));
            console.log(chalk.dim(`      2. Apply them to the plugin skill (claude plugin list for paths)`));
            console.log(chalk.dim(`      3. Delete the legacy file`));
            warned++;
          }
        }

        // Also check legacy agents
        try {
          const agentEntries = await readdir(legacyAgentsDir, { withFileTypes: true });
          for (const entry of agentEntries) {
            if (!entry.isDirectory() || !entry.name.startsWith("dafke-")) continue;
            if (!checkOnly) {
              await rm(join(legacyAgentsDir, entry.name), { recursive: true, force: true });
            }
            console.log(chalk.green(`    ${entry.name}/: removed (agents now in plugins)`));
            removed++;
          }
        } catch {
          // No legacy agents directory
        }

        console.log();
        console.log(chalk.green(`  Migration complete: ${removed} removed, ${warned} need review.`));
      }
      console.log();
    }
  },
});
