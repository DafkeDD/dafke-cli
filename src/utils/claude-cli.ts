/**
 * Claude Code CLI detection and invocation utilities.
 * Used by wizard steps and commands that optionally leverage Claude Code.
 */
import { execa } from "execa";

/** Check if the Claude Code CLI is installed and callable. */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    await execa("claude", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Invoke Claude Code with a prompt. Returns stdout on success, null on failure. */
export async function invokeClaudePrompt(
  prompt: string,
  options?: { timeout?: number },
): Promise<string | null> {
  try {
    const result = await execa("claude", ["-p", prompt], {
      timeout: options?.timeout ?? 60_000,
    });
    return result.stdout;
  } catch {
    return null;
  }
}

/** Check if Claude Code should be used (available + not in non-interactive/CI mode). */
export async function shouldUseClaudeAI(
  nonInteractive: boolean,
): Promise<{ available: boolean; reason: string }> {
  if (nonInteractive || process.env["CI"] === "true") {
    return { available: false, reason: "Non-interactive or CI mode" };
  }
  const available = await isClaudeAvailable();
  return available
    ? { available: true, reason: "Claude Code detected" }
    : { available: false, reason: "Claude Code CLI not installed" };
}

/** Format a standardized fallback message for when a smart feature is unavailable. */
export function smartFeatureFallback(
  feature: string,
  fallback: string,
): string {
  return `Smart ${feature} unavailable — ${fallback}. Install Claude Code for better results: https://claude.ai/claude-code`;
}
