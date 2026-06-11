import { defineCommand } from "citty";
import chalk from "chalk";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isClaudeAvailable } from "../../utils/claude-cli.js";
import { findProjectRoot } from "../../utils/package-root.js";

import { DAFKE_PLUGINS, DAFKE_MARKETPLACE_NAME } from "../../core/plugins/catalogue.js";

async function ensureClaudeCli(): Promise<boolean> {
  if (!(await isClaudeAvailable())) {
    console.error(chalk.red("  Claude Code CLI is required for plugin management."));
    console.error(chalk.dim("  Install: https://docs.anthropic.com/en/docs/claude-code"));
    return false;
  }
  return true;
}

async function ensureMarketplace(): Promise<boolean> {
  try {
    const { stdout } = await execa("claude", ["plugin", "marketplace", "list"], { timeout: 15_000 });
    if (stdout.includes(DAFKE_MARKETPLACE_NAME)) return true;

    const packageRoot = findProjectRoot();
    const marketplacePath = resolve(packageRoot);
    const manifestPath = join(marketplacePath, ".claude-plugin", "marketplace.json");
    if (!existsSync(manifestPath)) {
      console.error(chalk.red(`  Dafke marketplace manifest not found at ${manifestPath}`));
      console.error(chalk.dim("  Reinstall dafke: npm install -g dafke@latest"));
      return false;
    }
    await execa("claude", ["plugin", "marketplace", "add", marketplacePath, "--scope", "project"], { timeout: 30_000 });
    return true;
  } catch (err) {
    console.error(chalk.red(`  Failed to setup Dafke marketplace: ${err instanceof Error ? err.message : String(err)}`));
    return false;
  }
}

export default defineCommand({
  meta: {
    name: "plugin",
    description: "Manage Dafke Claude Code plugins",
  },
  args: {
    action: {
      type: "positional",
      description: "Action: list, install, uninstall",
      required: false,
    },
    name: {
      type: "positional",
      description: "Plugin name (for install/uninstall)",
      required: false,
    },
  },
  async run({ args }) {
    const action = (args.action as string) ?? "list";

    if (!(await ensureClaudeCli())) return;

    if (action === "list") {
      console.log();
      console.log(chalk.bold("  Dafke Plugins"));
      console.log(chalk.dim("  " + "─".repeat(50)));
      console.log();

      // Get installed plugins
      let installedNames: Set<string>;
      try {
        const { stdout } = await execa("claude", ["plugin", "list"], { timeout: 15_000 });
        installedNames = new Set(
          stdout.split("\n")
            .map((line) => line.match(/❯\s+(\S+)@/)?.[1])
            .filter((n): n is string => !!n),
        );
      } catch {
        installedNames = new Set();
      }

      for (const plugin of DAFKE_PLUGINS) {
        const installed = installedNames.has(plugin.name);
        const status = installed
          ? chalk.green("● installed")
          : chalk.dim("○ not installed");
        console.log(`  ${status}  ${chalk.bold(plugin.name)}`);
        console.log(chalk.dim(`            ${plugin.description}`));
      }
      console.log();
      console.log(chalk.dim("  Install: dafke plugin install <name>"));
      console.log(chalk.dim("  Remove:  dafke plugin uninstall <name>"));
      console.log();

    } else if (action === "install") {
      const name = args.name as string;
      if (!name) {
        console.error(chalk.red("  Plugin name required. Run `dafke plugin list` to see available plugins."));
        return;
      }

      const validName = DAFKE_PLUGINS.find((p) => p.name === name || p.name === `dafke-${name}`);
      if (!validName) {
        console.error(chalk.red(`  Unknown plugin: ${name}`));
        console.log(chalk.dim(`  Available: ${DAFKE_PLUGINS.map((p) => p.name).join(", ")}`));
        return;
      }

      if (!(await ensureMarketplace())) return;

      console.log(`  Installing ${validName.name}...`);
      try {
        await execa("claude", ["plugin", "install", `${validName.name}@${DAFKE_MARKETPLACE_NAME}`, "--scope", "project"], { timeout: 60_000 });
        console.log(chalk.green(`  ${validName.name}: installed`));
      } catch (err) {
        console.error(chalk.red(`  Failed to install ${validName.name}: ${err instanceof Error ? err.message : String(err)}`));
      }

    } else if (action === "uninstall" || action === "remove") {
      const name = args.name as string;
      if (!name) {
        console.error(chalk.red("  Plugin name required."));
        return;
      }

      const validName = DAFKE_PLUGINS.find((p) => p.name === name || p.name === `dafke-${name}`);
      const pluginName = validName?.name ?? name;

      try {
        await execa("claude", ["plugin", "uninstall", pluginName, "--scope", "project"], { timeout: 30_000 });
        console.log(chalk.green(`  ${pluginName}: uninstalled`));
      } catch (err) {
        console.error(chalk.red(`  Failed to uninstall ${pluginName}: ${err instanceof Error ? err.message : String(err)}`));
      }

    } else {
      console.error(chalk.red(`  Unknown action: ${action}`));
      console.log(chalk.dim("  Usage: dafke plugin [list|install|uninstall] [name]"));
    }
  },
});
