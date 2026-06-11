import { defineCommand, runMain, showUsage } from "citty";
import { VERSION } from "../version.js";
import { printBanner } from "../utils/banner.js";
import { getGlobalConfigPath } from "../utils/platform.js";

const DESCRIPTION = "Dafke AI Control Center — CLI tool for AI-assisted development onboarding";

const main = defineCommand({
  meta: {
    name: "dafke",
    version: VERSION,
    description: DESCRIPTION,
  },
  args: {
    config: {
      type: "string",
      description: `Path to config file (default: ${getGlobalConfigPath()})`,
      alias: "c",
    },
  },
  subCommands: {
    init: () => import("./commands/init.js").then((m) => m.default),
    audit: () => import("./commands/audit.js").then((m) => m.default),
    resolve: () => import("./commands/resolve.js").then((m) => m.default),
    update: () => import("./commands/update.js").then((m) => m.default),
    status: () => import("./commands/status.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    connect: () => import("./commands/connect.js").then((m) => m.default),
    repos: () => import("./commands/repos.js").then((m) => m.default),
    hook: () => import("./commands/hook.js").then((m) => m.default),
    skills: () => import("./commands/skills.js").then((m) => m.default),
    plugin: () => import("./commands/plugin.js").then((m) => m.default),
    docs: () => import("./commands/docs.js").then((m) => m.default),
    gendoc: () => import("./commands/docs.js").then((m) => m.default), // backward-compat alias
  },
  async run({ rawArgs }) {
    // citty calls main run() even for subcommands — only show banner when no subcommand given
    const subCommandNames = ["init", "audit", "resolve", "update", "status", "doctor", "connect", "repos", "hook", "skills", "plugin", "docs", "gendoc"];
    const hasSubCommand = (rawArgs ?? []).some((arg: string) => subCommandNames.includes(arg));
    if (hasSubCommand) return;

    printBanner(VERSION);
    console.log("  Run " + "\x1b[1mdafke --help\x1b[0m" + " for available commands.");
    console.log();
  },
});

runMain(main, {
  showUsage: async (cmd, parent) => {
    // Only show logo for the top-level --help (no parent = main command)
    if (!parent) {
      printBanner(VERSION);
    }
    // Hide the gendoc alias from help output — it still works as a subcommand
    if (!parent && cmd.subCommands) {
      const filtered = { ...cmd.subCommands };
      delete (filtered as Record<string, unknown>)["gendoc"];
      await showUsage({ ...cmd, subCommands: filtered }, parent);
    } else {
      await showUsage(cmd, parent);
    }
  },
});
