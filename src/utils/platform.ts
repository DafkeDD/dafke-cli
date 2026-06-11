import { platform } from "node:os";
import { join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("dafke", { suffix: "" });

export function isWindows(): boolean { return platform() === "win32"; }
export function isMac(): boolean { return platform() === "darwin"; }
export function isLinux(): boolean { return platform() === "linux"; }

export function getConfigDir(): string { return paths.config; }
export function getDataDir(): string { return paths.data; }
export function getCacheDir(): string { return paths.cache; }

export function getClaudeDir(): string {
  if (isWindows()) {
    return join(process.env["APPDATA"] ?? join(process.env["USERPROFILE"] ?? "", "AppData", "Roaming"), "claude");
  }
  return join(process.env["HOME"] ?? "/tmp", ".claude");
}

export function getGlobalConfigPath(): string {
  return join(getConfigDir(), "config.yaml");
}

export function getRepoDafkeDir(repoRoot: string = process.cwd()): string {
  return join(repoRoot, ".dafke");
}

export function getRepoClaudeDir(repoRoot: string = process.cwd()): string {
  return join(repoRoot, ".claude");
}
