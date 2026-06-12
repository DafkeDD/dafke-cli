/**
 * Cross-platform prerequisite tool detection.
 * Checks for required, recommended, and optional tools.
 */
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, copyFileSync, mkdirSync } from "node:fs";
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
  if (provList.includes("github")) {
    checks.push(checkTool("gh", "gh", ["--version"], "optional"));
  }

  return Promise.all(checks);
}

/** Check whether a command is available on PATH (cross-platform). */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const probe = platform() === "win32" ? "where" : "which";
    const r = await execa(probe, [cmd], { reject: false, timeout: 5_000 });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

export interface InstallResult {
  ok: boolean;
  message: string;
}

/**
 * Best-effort auto-install of a recommended tool. Picks an appropriate
 * package manager per OS and streams the installer output to the terminal.
 * Returns ok=false with a hint if no suitable installer is available.
 */
/**
 * Fallback for Windows without scoop/choco: download the gitleaks binary
 * straight from GitHub releases into the npm global bin dir (already on PATH).
 */
async function installGitleaksBinaryWindows(): Promise<InstallResult> {
  try {
    const rel = await fetch("https://api.github.com/repos/gitleaks/gitleaks/releases/latest", {
      headers: { "User-Agent": "dafke-cli", Accept: "application/vnd.github+json" },
    });
    if (!rel.ok) return { ok: false, message: `could not query gitleaks releases (${rel.status})` };
    const data = (await rel.json()) as { tag_name?: string };
    const tag = data.tag_name;
    if (!tag) return { ok: false, message: "could not determine latest gitleaks version" };
    const version = tag.replace(/^v/, "");
    const url = `https://github.com/gitleaks/gitleaks/releases/download/${tag}/gitleaks_${version}_windows_x64.zip`;

    const dl = await fetch(url);
    if (!dl.ok) return { ok: false, message: `download failed (${dl.status})` };
    const buf = Buffer.from(await dl.arrayBuffer());

    const work = join(tmpdir(), `dafke-gitleaks-${version}`);
    mkdirSync(work, { recursive: true });
    const zipPath = join(work, "gitleaks.zip");
    writeFileSync(zipPath, buf);

    await execa(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${work}'`],
      { reject: false, timeout: 120_000 },
    );

    const prefixRes = await execa("npm", ["config", "get", "prefix"], { reject: false, timeout: 10_000 });
    const prefix = prefixRes.stdout.trim();
    if (!prefix) return { ok: false, message: "could not locate npm global bin dir" };

    copyFileSync(join(work, "gitleaks.exe"), join(prefix, "gitleaks.exe"));
    return { ok: true, message: `downloaded ${tag} to ${prefix}` };
  } catch (err) {
    return { ok: false, message: `binary install failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function installTool(name: string): Promise<InstallResult> {
  const os = platform();
  const run = async (cmd: string, args: string[]): Promise<boolean> => {
    const r = await execa(cmd, args, { reject: false, timeout: 300_000, stdio: "inherit" });
    return r.exitCode === 0;
  };

  if (name === "lefthook") {
    // Some npm setups gate install scripts; lefthook's postinstall fetches its
    // binary, so allow it explicitly. The flag is ignored by npm versions that
    // don't support it, so this stays safe across setups.
    if (await run("npm", ["install", "-g", "lefthook", "--allow-scripts=lefthook"])) {
      return { ok: true, message: "installed via npm" };
    }
    if (await run("npm", ["install", "-g", "lefthook"])) {
      return { ok: true, message: "installed via npm (allow its postinstall if 'lefthook' is missing)" };
    }
    return { ok: false, message: "could not install — try: npm install -g lefthook" };
  }

  if (name === "gitleaks") {
    if (os === "win32") {
      if ((await commandExists("scoop")) && (await run("scoop", ["install", "gitleaks"]))) {
        return { ok: true, message: "installed via scoop" };
      }
      if ((await commandExists("choco")) && (await run("choco", ["install", "gitleaks", "-y"]))) {
        return { ok: true, message: "installed via choco" };
      }
      // No package manager (or none with gitleaks) — download the binary directly.
      return await installGitleaksBinaryWindows();
    }
    if ((await commandExists("brew")) && (await run("brew", ["install", "gitleaks"]))) {
      return { ok: true, message: "installed via brew" };
    }
    return { ok: false, message: "install manually — see github.com/gitleaks/gitleaks/releases" };
  }

  return { ok: false, message: `no auto-installer available for ${name}` };
}
