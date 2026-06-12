import { defineCommand } from "citty";
import chalk from "chalk";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Listr } from "listr2";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { isClaudeAvailable } from "../../utils/claude-cli.js";
import { checkPrerequisites } from "../../utils/prerequisites.js";
import { StateManager } from "../../core/state/state-manager.js";
import { ConfigManager } from "../../core/config/config-manager.js";
import { VERSION } from "../../version.js";

// ---------------------------------------------------------------------------
// Check types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  fixable: boolean;
  fixed?: boolean;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkSystemDeps(): Promise<CheckResult[]> {
  const prereqs = await checkPrerequisites();
  return prereqs.map((r) => {
    const displayName = r.name === "git" ? "Git"
      : r.name === "node" ? "Node.js"
      : r.name === "claude" ? "Claude CLI"
      : r.name === "gitleaks" ? "Gitleaks"
      : r.name === "lefthook" ? "Lefthook"
      : r.name === "az" ? "Azure CLI"
      : r.name === "gh" ? "GitHub CLI"
      : r.name;
    if (r.installed) {
      const versionStr = r.version ? `v${r.version}` : "installed";
      return { name: displayName, passed: true, message: versionStr, fixable: false };
    }
    const notFoundMsg = r.category === "required"
      ? `Not found \u2014 ${r.installHint}`
      : `Not found (${r.category}) \u2014 ${r.installHint}`;
    return { name: displayName, passed: false, message: notFoundMsg, fixable: false };
  });
}

function checkDafkeDir(repoRoot: string, fix: boolean): CheckResult {
  const dir = join(repoRoot, ".dafke");
  if (existsSync(dir)) {
    return { name: ".dafke/ directory", passed: true, message: "Directory exists", fixable: false };
  }
  if (fix) {
    mkdirSync(dir, { recursive: true });
    return { name: ".dafke/ directory", passed: true, message: "Created .dafke/ directory", fixable: true, fixed: true };
  }
  return { name: ".dafke/ directory", passed: false, message: "Missing .dafke/ directory", fixable: true };
}

function checkManifest(repoRoot: string, fix: boolean): CheckResult {
  const filePath = join(repoRoot, ".dafke", "manifest.yaml");
  if (!existsSync(filePath)) {
    if (fix) {
      // Use wizard state if available, otherwise fall back to defaults
      let techStack = "unknown";
      let ciPlatform = "none";
      try {
        const stateManager = new StateManager(repoRoot);
        const state = stateManager.load();
        if (state?.answers) {
          techStack = (state.answers["techStack"] as string) ?? techStack;
          ciPlatform = (state.answers["ciPlatform"] as string) ?? ciPlatform;
        }
      } catch { /* state file may not exist */ }

      const manifest = {
        corulusCcVersion: VERSION,
        configSchemaVersion: 1,
        techStack,
        ciPlatform,
        overrides: {},
      };
      mkdirSync(join(repoRoot, ".dafke"), { recursive: true });
      writeFileSync(filePath, stringifyYaml(manifest), "utf-8");
      return { name: "manifest.yaml", passed: true, message: "Created default .dafke/manifest.yaml", fixable: true, fixed: true };
    }
    // Check for partial wizard state to suggest --resume
    let hasWizardState = false;
    try {
      const stateManager = new StateManager(repoRoot);
      hasWizardState = stateManager.load() !== null;
    } catch { /* ignore */ }
    const hint = hasWizardState
      ? "Missing .dafke/manifest.yaml — run `dafke init --resume` or `doctor --fix`"
      : "Missing .dafke/manifest.yaml — run `dafke init` or `doctor --fix`";
    return { name: "manifest.yaml", passed: false, message: hint, fixable: true };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    parseYaml(content);
    return { name: "manifest.yaml", passed: true, message: "Valid YAML", fixable: false };
  } catch {
    return { name: "manifest.yaml", passed: false, message: "Invalid YAML in manifest.yaml", fixable: false };
  }
}

function checkClaudeSettings(repoRoot: string, fix: boolean): CheckResult {
  const filePath = join(repoRoot, ".claude", "settings.json");
  if (!existsSync(filePath)) {
    if (fix) {
      const dir = join(repoRoot, ".claude");
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, JSON.stringify({ permissions: {} }, null, 2), "utf-8");
      return { name: "settings.json", passed: true, message: "Created default .claude/settings.json", fixable: true, fixed: true };
    }
    return { name: "settings.json", passed: false, message: "Missing .claude/settings.json", fixable: true };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    JSON.parse(content);
    return { name: "settings.json", passed: true, message: "Valid JSON", fixable: false };
  } catch {
    return { name: "settings.json", passed: false, message: "Invalid JSON in settings.json", fixable: false };
  }
}

function checkClaudeMd(repoRoot: string, fix: boolean): CheckResult {
  const filePath = join(repoRoot, "CLAUDE.md");
  if (existsSync(filePath)) {
    return { name: "CLAUDE.md", passed: true, message: "CLAUDE.md exists", fixable: false };
  }
  if (fix) {
    writeFileSync(filePath, "# CLAUDE.md\n\nGenerated by dafke. Run `dafke init` to populate.\n", "utf-8");
    return { name: "CLAUDE.md", passed: true, message: "Created placeholder CLAUDE.md", fixable: true, fixed: true };
  }
  return { name: "CLAUDE.md", passed: false, message: "Missing CLAUDE.md", fixable: true };
}

async function checkPlugins(_repoRoot: string, _fix: boolean): Promise<CheckResult> {
  try {
    const { execa } = await import("execa");
    const result = await execa("claude", ["plugin", "list"], { reject: false, timeout: 10000 });
    if (result.exitCode === 0) {
      const plugins = result.stdout.toLowerCase();
      const recommended = [
        "superpowers", "commit-commands",
        "dafke-sdlc", "dafke-quality", "dafke-config",
      ];
      const missing = recommended.filter((p) => !plugins.includes(p));
      if (missing.length === 0) {
        return { name: "Plugins", passed: true, message: "Recommended plugins installed", fixable: false };
      }
      return { name: "Plugins", passed: false, message: `Missing recommended: ${missing.join(", ")}. Run dafke init to install.`, fixable: false };
    }
    return { name: "Plugins", passed: false, message: "Could not list plugins (claude CLI not found)", fixable: false };
  } catch {
    return { name: "Plugins", passed: false, message: "Could not check plugins (claude CLI not available)", fixable: false };
  }
}

function checkMcpServers(repoRoot: string, _fix: boolean): CheckResult {
  const locations = [
    join(repoRoot, ".claude", "mcp.json"),
    join(repoRoot, ".mcp.json"),
  ];
  const found = locations.find((p) => existsSync(p));
  if (found) {
    try {
      const content = readFileSync(found, "utf-8");
      JSON.parse(content);
      return { name: "MCP Servers", passed: true, message: `MCP config found at ${found}`, fixable: false };
    } catch {
      return { name: "MCP Servers", passed: false, message: "MCP config exists but is invalid JSON", fixable: false };
    }
  }
  return { name: "MCP Servers", passed: false, message: "No MCP server configuration found", fixable: false };
}

function checkGitHooks(repoRoot: string, _fix: boolean): CheckResult {
  const filePath = join(repoRoot, "lefthook.yml");
  if (existsSync(filePath)) {
    return { name: "Git Hooks", passed: true, message: "lefthook.yml exists", fixable: false };
  }
  // Also check lefthook.yaml
  const altPath = join(repoRoot, "lefthook.yaml");
  if (existsSync(altPath)) {
    return { name: "Git Hooks", passed: true, message: "lefthook.yaml exists", fixable: false };
  }
  return { name: "Git Hooks", passed: false, message: "No lefthook.yml found — git hooks not installed", fixable: false };
}

function checkGitNexusIndex(repoRoot: string, _fix: boolean): CheckResult {
  const dir = join(repoRoot, ".gitnexus");
  if (existsSync(dir)) {
    return { name: "GitNexus Index", passed: true, message: ".gitnexus/ directory exists", fixable: false };
  }
  return { name: "GitNexus Index", passed: false, message: "No .gitnexus/ directory — run `npx gitnexus analyze`", fixable: false };
}

async function checkExternalTools(repoRoot: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const manifestPath = join(repoRoot, ".dafke", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    return [{ name: "External Tools", passed: true, message: "No manifest — skipped", fixable: false }];
  }

  let manifest: Record<string, unknown>;
  try {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = parseYaml(content) as Record<string, unknown>;
  } catch {
    // Manifest parse errors are already reported by checkManifest
    return [];
  }

  const externalTools = manifest["externalTools"] as Record<string, unknown> | undefined;
  if (!externalTools) {
    return [{ name: "External Tools", passed: true, message: "No externalTools declared — skipped", fixable: false }];
  }

  // --- SonarQube auth check ---
  const coverage = externalTools["coverage"] as Record<string, unknown> | undefined;
  const sonarProjectKey = coverage?.["sonarProjectKey"] as string | undefined;

  if (sonarProjectKey) {
    try {
      const configManager = new ConfigManager();
      const globalConfig = await configManager.loadGlobalConfig();
      const sonarAuth = globalConfig.auth.sonarqube;
      if (sonarAuth?.token && sonarAuth?.serverUrl) {
        results.push({
          name: "SonarQube Auth",
          passed: true,
          message: `Auth configured for project "${sonarProjectKey}"`,
          fixable: false,
        });
      } else {
        const missing: string[] = [];
        if (!sonarAuth?.token) missing.push("token");
        if (!sonarAuth?.serverUrl) missing.push("serverUrl");
        results.push({
          name: "SonarQube Auth",
          passed: false,
          message: `sonarProjectKey "${sonarProjectKey}" set but global config missing: ${missing.join(", ")} — run \`dafke connect\``,
          fixable: false,
        });
      }
    } catch {
      results.push({
        name: "SonarQube Auth",
        passed: false,
        message: `sonarProjectKey "${sonarProjectKey}" set but could not load global config`,
        fixable: false,
      });
    }
  }

  // --- Doc URL validation ---
  const docs = externalTools["docs"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(docs) && docs.length > 0) {
    const invalidUrls: string[] = [];
    for (const entry of docs) {
      const url = entry["url"] as string | undefined;
      if (url) {
        try {
          new URL(url);
        } catch {
          invalidUrls.push(url);
        }
      }
    }
    if (invalidUrls.length > 0) {
      results.push({
        name: "Doc URLs",
        passed: false,
        message: `Invalid URL(s): ${invalidUrls.join(", ")}`,
        fixable: false,
      });
    } else {
      results.push({
        name: "Doc URLs",
        passed: true,
        message: "All doc URLs are valid",
        fixable: false,
      });
    }
  }

  // If no specific sub-checks triggered, report a general pass
  if (results.length === 0) {
    results.push({
      name: "External Tools",
      passed: true,
      message: "Declared — no issues found",
      fixable: false,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Self-heal broken configs",
  },
  args: {
    fix: {
      type: "boolean",
      description: "Auto-fix detected issues",
      default: false,
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const fix = args.fix as boolean;

    console.log();
    console.log(chalk.bold.hex("#f76707")("  Dafke Doctor"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log();

    const results: CheckResult[] = [];

    const tasks = new Listr([
      {
        title: "Check system dependencies",
        task: async () => { results.push(...await checkSystemDeps()); },
      },
      {
        title: "Check .dafke/ directory",
        task: () => { results.push(checkDafkeDir(repoRoot, fix)); },
      },
      {
        title: "Check manifest.yaml",
        task: () => { results.push(checkManifest(repoRoot, fix)); },
      },
      {
        title: "Check .claude/settings.json",
        task: () => { results.push(checkClaudeSettings(repoRoot, fix)); },
      },
      {
        title: "Check CLAUDE.md",
        task: () => { results.push(checkClaudeMd(repoRoot, fix)); },
      },
      {
        title: "Check plugins",
        task: async () => { results.push(await checkPlugins(repoRoot, fix)); },
      },
      {
        title: "Check MCP servers",
        task: () => { results.push(checkMcpServers(repoRoot, fix)); },
      },
      {
        title: "Check git hooks",
        task: () => { results.push(checkGitHooks(repoRoot, fix)); },
      },
      {
        title: "Check GitNexus index",
        task: () => { results.push(checkGitNexusIndex(repoRoot, fix)); },
      },
      {
        title: "Check external tools",
        task: async () => { results.push(...await checkExternalTools(repoRoot)); },
      },
    ], { concurrent: false, rendererOptions: { collapseErrors: false } });

    await tasks.run();

    // Display results
    console.log();
    console.log(chalk.bold("  Results"));
    console.log(chalk.dim("  " + "─".repeat(50)));

    let passCount = 0;
    let failCount = 0;
    let fixedCount = 0;

    for (const r of results) {
      if (r.passed) {
        passCount++;
        const suffix = r.fixed ? chalk.cyan(" (fixed)") : "";
        if (r.fixed) fixedCount++;
        console.log(`  ${chalk.green("✓")} ${r.name}: ${r.message}${suffix}`);
      } else {
        failCount++;
        const fixHint = r.fixable && !fix ? chalk.dim(" (use --fix)") : "";
        console.log(`  ${chalk.red("✗")} ${r.name}: ${r.message}${fixHint}`);
      }
    }

    console.log();
    console.log(`  ${chalk.green(`${passCount} passed`)}  ${failCount > 0 ? chalk.red(`${failCount} failed`) : ""}  ${fixedCount > 0 ? chalk.cyan(`${fixedCount} fixed`) : ""}`);

    // Smart Features section
    console.log();
    console.log(chalk.bold("  Smart Features"));
    console.log(chalk.dim("  " + "\u2500".repeat(60)));

    const claudeAvailable = await isClaudeAvailable();
    const features = [
      { name: "CLAUDE.md smart merge", available: claudeAvailable },
      { name: "Plugin recommendations", available: true },
      { name: "CI quality gate analysis", available: true },
      { name: "Deep code audit", available: claudeAvailable },
      { name: "AI conflict resolution", available: claudeAvailable },
    ];

    for (const f of features) {
      const icon = f.available ? chalk.green("+") : chalk.red("-");
      const status = f.available ? chalk.green("available") : chalk.dim("unavailable \u2014 install Claude Code CLI");
      console.log(`    ${icon} ${f.name.padEnd(28)} [${status}]`);
    }

    console.log();

    if (failCount > 0 && !fix) {
      console.log(chalk.dim("  Run `dafke doctor --fix` to attempt auto-repair."));
      console.log();
    }
  },
});
