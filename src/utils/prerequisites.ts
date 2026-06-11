/**
 * Cross-platform prerequisite tool detection.
 * Checks for required, recommended, and optional tools.
 */
import { platform } from "node:os";
import { execa } from "execa";

export interface ToolCheckResult {
  name: string;
  category: "required" | "recommended" | "optional";
  installed: boolean;
  version?: string;
  installHint: string;
}

/** Get OS-aware install hint for a tool. */
export function getInstallHint(tool: string): string {
  const os = platform();
  const hints: Record<string, Record<string, string>> = {
    git: {
      darwin: "brew install git  OR  xcode-select --install",
      linux: "apt install git  OR  yum install git",
      win32: "winget install Git.Git",
    },
    gitleaks: {
      darwin: "brew install gitleaks",
      linux: "snap install gitleaks  OR  https://github.com/gitleaks/gitleaks",
      win32: "choco install gitleaks  OR  scoop install gitleaks",
    },
    az: {
      darwin: "brew install azure-cli",
      linux: "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash",
      win32: "winget install Microsoft.AzureCLI",
    },
    gh: {
      darwin: "brew install gh",
      linux: "apt install gh  OR  https://cli.github.com",
      win32: "winget install GitHub.cli",
    },
    lefthook: {
      darwin: "brew install lefthook  OR  npx @evilmartians/lefthook install",
      linux: "npx @evilmartians/lefthook install",
      win32: "npx @evilmartians/lefthook install",
    },
    claude: {
      darwin: "npm install -g @anthropic-ai/claude-code",
      linux: "npm install -g @anthropic-ai/claude-code",
      win32: "npm install -g @anthropic-ai/claude-code",
    },
  };
  return hints[tool]?.[os] ?? `See documentation for ${tool}`;
}

/** Parse a version string, extracting the major.minor.patch numbers. */
function parseVersion(output: string): string | undefined {
  const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match?.[1];
}

/** Check if installed version meets minimum requirement. */
function meetsMinVersion(version: string, minVersion: string): boolean {
  const parts = version.split(".").map(Number);
  const minParts = minVersion.split(".").map(Number);
  for (let i = 0; i < minParts.length; i++) {
    const v = parts[i] ?? 0;
    const m = minParts[i] ?? 0;
    if (v > m) return true;
    if (v < m) return false;
  }
  return true;
}

/** Check a single tool's availability. */
async function checkTool(
  name: string,
  command: string,
  args: string[],
  category: "required" | "recommended" | "optional",
  minVersion?: string,
): Promise<ToolCheckResult> {
  const installHint = getInstallHint(name);
  try {
    const result = await execa(command, args, { timeout: 5_000, reject: false });
    if (result.exitCode !== 0) {
      return { name, category, installed: false, installHint };
    }
    const version = parseVersion(result.stdout + result.stderr);
    if (minVersion && version && !meetsMinVersion(version, minVersion)) {
      return {
        name,
        category,
        installed: false,
        version,
        installHint: `${installHint} (need >= ${minVersion}, found ${version})`,
      };
    }
    return { name, category, installed: true, version, installHint };
  } catch {
    return { name, category, installed: false, installHint };
  }
}

/**
 * Run all prerequisite checks.
 * @param providers - the list of configured auth providers (e.g., ["azureDevOps", "github"]).
 */
export async function checkPrerequisites(
  providers?: string[],
): Promise<ToolCheckResult[]> {
  const checks: Promise<ToolCheckResult>[] = [
    // Required
    checkTool("git", "git", ["--version"], "required", "2.30"),
    checkTool("node", "node", ["--version"], "required", "20"),
    // Recommended
    checkTool("claude", "claude", ["--version"], "recommended"),
    checkTool("gitleaks", "gitleaks", ["version"], "recommended"),
    checkTool("lefthook", "lefthook", ["version"], "recommended"),
  ];

  // Optional: only check if provider is configured
  const provList = providers ?? [];
  if (provList.includes("azureDevOps")) {
    checks.push(checkTool("az", "az", ["--version"], "optional"));
  }
  if (provList.includes("github")) {
    checks.push(checkTool("gh", "gh", ["--version"], "optional"));
  }

  return Promise.all(checks);
}
