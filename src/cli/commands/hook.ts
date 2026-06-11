import { defineCommand } from "citty";
import { ConfigManager } from "../../core/config/config-manager.js";
import { VERSION } from "../../index.js";
import { readHandoff, writeHandoff, archiveHandoff } from "../../core/handoff/handoff-manager.js";

// ---------------------------------------------------------------------------
// Hook protocol types
// ---------------------------------------------------------------------------

interface HookResponse {
  continue?: boolean;
  suppress?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dangerous command patterns
// ---------------------------------------------------------------------------

const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+\*/,
  /rm\s+-rf\s+~/,
  /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\S+\s*;?\s*$/i,
  /mkfs\./,
  /dd\s+if=/,
  /:\(\)\{\s*:\|:\s*&\s*\}\s*;/,  // fork bomb
  /chmod\s+-R\s+777\s+\//,
  /git\s+push\s+--force\s+origin\s+main/,
  /git\s+push\s+-f\s+origin\s+main/,
  /git\s+reset\s+--hard\s+HEAD~\d+/,
];

// ---------------------------------------------------------------------------
// Security patterns for edits
// ---------------------------------------------------------------------------

const SECURITY_PATTERNS = [
  /\beval\s*\(/,
  /\binnerHTML\s*=/,
  /\bdocument\.write\s*\(/,
  /\bchild_process\.exec\s*\(/,
  /\bFunction\s*\(/,
  /\bdangerouslySetInnerHTML/,
  /\bchild_process/,
  /(?:password|secret|api_key|apikey|token)\s*[:=]\s*["'][^"']+["']/i,
];

// ---------------------------------------------------------------------------
// Ticket ID patterns
// ---------------------------------------------------------------------------

const TICKET_PATTERNS = [
  /\b([A-Z]{2,10}-\d{1,6})\b/,              // JIRA: PROJ-123
  /\bAB#(\d+)\b/,                              // Azure DevOps: AB#123
  /\b#(\d{1,6})\b/,                            // GitHub: #123
];

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleSessionStart(): Promise<HookResponse> {
  const configManager = new ConfigManager();
  const manifest = await configManager.loadManifest(process.cwd());

  if (!manifest) {
    return {
      continue: true,
      data: { status: "no-manifest", version: VERSION },
    };
  }

  const drifted = manifest.corulusCcVersion !== VERSION;
  const wave = manifest.wave ?? "unknown";
  const hasScores = !!manifest.readinessScores;

  // Check for session handoff
  let handoffMessage: string | undefined;
  try {
    const handoff = await readHandoff(process.cwd());
    if (handoff) {
      if (handoff.isStale) {
        await archiveHandoff(process.cwd());
        handoffMessage = "Stale handoff archived (>7 days old).";
      } else {
        handoffMessage = handoff.compact;
      }
    }
  } catch {
    // Handoff read failure is non-blocking
  }

  return {
    continue: true,
    message: handoffMessage,
    data: {
      status: "ok",
      version: VERSION,
      wave,
      drifted,
      hasScores,
      techStack: manifest.techStack,
      hasHandoff: !!handoffMessage,
    },
  };
}

function handlePreBash(payload: Record<string, unknown>): HookResponse {
  const command = String(payload["command"] ?? payload["input"] ?? "");

  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(command)) {
      return {
        continue: false,
        suppress: true,
        message: `Blocked dangerous command: ${command.slice(0, 100)}`,
      };
    }
  }

  return { continue: true };
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(normalized) ||
         /(\/__tests__\/|\/tests?\/|\/fixtures?\/)/.test(normalized);
}

function handlePreEdit(payload: Record<string, unknown>): HookResponse {
  const filePath = String(payload["file_path"] ?? payload["path"] ?? "");

  // Skip security scans for test files
  if (filePath && isTestFile(filePath)) {
    return { continue: true, data: { securitySkipped: "test-file" } };
  }

  const content = String(payload["content"] ?? payload["new_content"] ?? "");
  const warnings: string[] = [];

  for (const pattern of SECURITY_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`Security pattern detected: ${pattern.source}`);
    }
  }

  if (warnings.length > 0) {
    return {
      continue: true,
      message: `Security review needed:\n${warnings.join("\n")}`,
      data: { warnings },
    };
  }

  return { continue: true };
}

function handlePostBash(payload: Record<string, unknown>): HookResponse {
  const command = String(payload["command"] ?? payload["input"] ?? "");

  const isGitCommit = /\bgit\s+commit\b/.test(command);

  return {
    continue: true,
    data: {
      tracked: isGitCommit,
      type: isGitCommit ? "git-commit" : "bash",
    },
  };
}

function handlePostEdit(_payload: Record<string, unknown>): HookResponse {
  return {
    continue: true,
    data: { editCount: 1 },
  };
}

async function handleStop(_payload: Record<string, unknown>): Promise<HookResponse> {
  // Write session handoff (non-blocking — errors logged but never thrown)
  try {
    await writeHandoff(process.cwd(), {});
  } catch {
    // Handoff write failure must never block session end
  }

  return {
    continue: true,
    data: { sessionEnd: new Date().toISOString() },
  };
}

async function handleSkillsCheck(): Promise<HookResponse> {
  const { existsSync, readdirSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  // Find package skills directory
  let dir = dirname(fileURLToPath(import.meta.url));
  let packageSkillsDir: string | null = null;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "skills");
    if (existsSync(candidate) && existsSync(join(dir, "package.json"))) {
      packageSkillsDir = candidate;
      break;
    }
    dir = dirname(dir);
  }

  const projectSkillsDir = join(process.cwd(), ".claude", "skills");

  if (!packageSkillsDir || !existsSync(projectSkillsDir)) {
    return { continue: true };
  }

  try {
    const packageSkills = new Set(readdirSync(packageSkillsDir).filter(
      (e: string) => existsSync(join(packageSkillsDir, e, "SKILL.md")),
    ));
    const projectSkills = new Set(readdirSync(projectSkillsDir).filter(
      (e: string) => existsSync(join(projectSkillsDir, e, "SKILL.md")),
    ));

    const missing = [...packageSkills].filter((s) => !projectSkills.has(s));
    if (missing.length > 0) {
      return {
        continue: true,
        message: `${missing.length} new skill(s) available: ${missing.join(", ")}. Run \`dafke init --skip auth,detect,assess,claude_md,hooks,plugins,ci,coverage,arch,connect,verify\` to update.`,
      };
    }
  } catch {
    // Ignore errors in skill check
  }

  return { continue: true };
}

async function handleDocCheck(): Promise<HookResponse> {
  const { existsSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const archPath = join(process.cwd(), "docs", "ARCHITECTURE.md");
  if (!existsSync(archPath)) {
    return { continue: true }; // No docs to check
  }

  // Check if ARCHITECTURE.md is older than 7 days
  try {
    const archStat = statSync(archPath);
    const ageMs = Date.now() - archStat.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      return {
        continue: true,
        message: `Architecture docs are ${Math.floor(ageDays)} days old. Run \`dafke docs\` to refresh.`,
      };
    }
  } catch {
    // Can't stat — skip
  }

  return { continue: true };
}

function handlePromptSubmit(payload: Record<string, unknown>): HookResponse {
  const prompt = String(payload["prompt"] ?? payload["input"] ?? "");
  const ticketIds: string[] = [];

  for (const pattern of TICKET_PATTERNS) {
    const matches = prompt.matchAll(new RegExp(pattern.source, "g"));
    for (const match of matches) {
      const id = match[1] ?? match[0];
      if (id && !ticketIds.includes(id)) {
        ticketIds.push(id);
      }
    }
  }

  if (ticketIds.length > 0) {
    return {
      continue: true,
      data: { ticketIds },
      message: `Detected ticket IDs: ${ticketIds.join(", ")}`,
    };
  }

  return { continue: true };
}

// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

const MAX_STDIN_SIZE = 1_048_576; // 1 MB

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("{}");
      return;
    }

    process.stdin.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize <= MAX_STDIN_SIZE) {
        chunks.push(chunk);
      }
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", () => resolve("{}"));

    // Timeout in case stdin never closes
    setTimeout(() => resolve(Buffer.concat(chunks).toString("utf-8") || "{}"), 5000);
  });
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleList(): Promise<void> {
  const chalk = (await import("chalk")).default;
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const repoRoot = process.cwd();

  console.log();
  console.log(chalk.bold.hex("#6366f1")("  Configured Hooks"));
  console.log(chalk.dim("  " + "─".repeat(60)));

  // Claude Code hooks (.claude/settings.json)
  const settingsPath = join(repoRoot, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      const hooks = settings["hooks"] as Record<string, unknown[]> | undefined;
      if (hooks && Object.keys(hooks).length > 0) {
        console.log();
        console.log(chalk.bold("  Claude Code hooks") + chalk.dim(` (.claude/settings.json)`));
        for (const [hookType, entries] of Object.entries(hooks)) {
          for (const entry of entries as Record<string, unknown>[]) {
            const matcher = (entry["matcher"] as string) ?? "(all)";
            const innerHooks = entry["hooks"] as Record<string, unknown>[] | undefined;
            if (innerHooks) {
              for (const h of innerHooks) {
                const cmd = (h["command"] as string) ?? "";
                const short = cmd.length > 70 ? cmd.slice(0, 67) + "..." : cmd;
                console.log(`    ${chalk.cyan(hookType.padEnd(20))} ${chalk.dim(matcher.padEnd(25))} ${short}`);
              }
            }
          }
        }
      }
    } catch { /* invalid settings */ }
  } else {
    console.log();
    console.log(chalk.dim("  No .claude/settings.json found."));
  }

  // Git hooks (lefthook.yml)
  const lefthookPath = join(repoRoot, "lefthook.yml");
  if (existsSync(lefthookPath)) {
    const content = readFileSync(lefthookPath, "utf-8");
    console.log();
    console.log(chalk.bold("  Git hooks") + chalk.dim(` (lefthook.yml)`));
    const lines = content.split("\n");
    let currentHook = "";
    for (const line of lines) {
      if (/^[a-z]/.test(line) && line.includes(":")) {
        currentHook = line.replace(":", "").trim();
      }
      const runMatch = line.match(/^\s+run:\s*(.+)/);
      if (runMatch?.[1]) {
        const runCmd = runMatch[1];
        const cmd = runCmd.length > 60 ? runCmd.slice(0, 57) + "..." : runCmd;
        console.log(`    ${chalk.cyan(currentHook.padEnd(20))} ${cmd}`);
      }
    }
  } else {
    console.log();
    console.log(chalk.dim("  No lefthook.yml found."));
  }

  // Available hook events
  console.log();
  console.log(chalk.bold("  Available hook events"));
  const events = [
    ["session-start", "Runs on Claude Code session start"],
    ["pre-bash", "Validates bash commands (blocks dangerous patterns)"],
    ["pre-edit", "Checks file edits for security patterns"],
    ["post-bash", "Tracks git commits and AI share"],
    ["post-edit", "Post-write validation"],
    ["stop", "Session cleanup"],
    ["prompt-submit", "Detects ticket IDs in prompts"],
    ["skills-check", "Checks for new available skills"],
    ["doc-check", "Warns if architecture docs are stale"],
  ];
  for (const evt of events) {
    console.log(`    ${chalk.cyan((evt[0] ?? "").padEnd(20))} ${chalk.dim(evt[1] ?? "")}`);
  }
  console.log();
}

export default defineCommand({
  meta: {
    name: "hook",
    description: "Execute a Claude Code hook handler, or list all hooks",
  },
  args: {
    event: {
      type: "positional",
      description: "Hook event (or 'list' to show all hooks)",
      required: false,
    },
  },
  async run({ args }) {
    const event = (args.event as string | undefined) ?? "list";

    // "list" doesn't need stdin — handle it early to avoid blocking on pipe reads in CI
    if (event === "list") {
      await handleList();
      return;
    }

    // Read payload from stdin
    const rawPayload = await readStdin();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      if (rawPayload !== "{}") {
        process.stderr.write(`dafke hook: invalid JSON payload\n`);
      }
    }

    let response: HookResponse;

    switch (event) {
      case "session-start":
        response = await handleSessionStart();
        break;
      case "pre-bash":
        response = handlePreBash(payload);
        break;
      case "pre-edit":
        response = handlePreEdit(payload);
        break;
      case "post-bash":
        response = handlePostBash(payload);
        break;
      case "post-edit":
        response = handlePostEdit(payload);
        break;
      case "stop":
        response = await handleStop(payload);
        break;
      case "prompt-submit":
        response = handlePromptSubmit(payload);
        break;
      case "skills-check":
        response = await handleSkillsCheck();
        break;
      case "doc-check":
        response = await handleDocCheck();
        break;
      default:
        response = { continue: true };
    }

    // Output JSON to stdout per hook protocol
    process.stdout.write(JSON.stringify(response) + "\n");

    // Exit with 2 to block, 0 for success
    if (response.continue === false) {
      process.exit(2);
    }
  },
});
