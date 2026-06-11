import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock execa before importing the module
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import {
  isClaudeAvailable,
  invokeClaudePrompt,
  shouldUseClaudeAI,
  smartFeatureFallback,
} from "../../src/utils/claude-cli.js";
import { execa } from "execa";

const mockedExeca = vi.mocked(execa);

describe("isClaudeAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when claude --version succeeds", async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: "claude 1.0.0" } as never);
    const result = await isClaudeAvailable();
    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith("claude", ["--version"], { timeout: 5_000 });
  });

  it("returns false when ENOENT error", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockedExeca.mockRejectedValueOnce(err);
    const result = await isClaudeAvailable();
    expect(result).toBe(false);
  });

  it("returns false on timeout", async () => {
    const err = new Error("timed out");
    (err as Record<string, unknown>).timedOut = true;
    mockedExeca.mockRejectedValueOnce(err);
    const result = await isClaudeAvailable();
    expect(result).toBe(false);
  });
});

describe("invokeClaudePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stdout on success", async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: "AI response here" } as never);
    const result = await invokeClaudePrompt("test prompt");
    expect(result).toBe("AI response here");
    expect(mockedExeca).toHaveBeenCalledWith("claude", ["-p", "test prompt"], { timeout: 60_000 });
  });

  it("returns null on failure", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("command failed"));
    const result = await invokeClaudePrompt("test prompt");
    expect(result).toBeNull();
  });

  it("respects custom timeout", async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: "result" } as never);
    await invokeClaudePrompt("prompt", { timeout: 30_000 });
    expect(mockedExeca).toHaveBeenCalledWith("claude", ["-p", "prompt"], { timeout: 30_000 });
  });
});

describe("shouldUseClaudeAI", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns false in non-interactive mode", async () => {
    const result = await shouldUseClaudeAI(true);
    expect(result.available).toBe(false);
    expect(result.reason).toContain("Non-interactive");
  });

  it("returns false when CI=true", async () => {
    process.env["CI"] = "true";
    const result = await shouldUseClaudeAI(false);
    expect(result.available).toBe(false);
    expect(result.reason).toContain("CI");
  });

  it("returns true when claude is available and not in CI/non-interactive", async () => {
    delete process.env["CI"];
    mockedExeca.mockResolvedValueOnce({ stdout: "claude 1.0.0" } as never);
    const result = await shouldUseClaudeAI(false);
    expect(result.available).toBe(true);
    expect(result.reason).toContain("Claude Code detected");
  });

  it("returns false when claude is not available", async () => {
    delete process.env["CI"];
    mockedExeca.mockRejectedValueOnce(new Error("not found"));
    const result = await shouldUseClaudeAI(false);
    expect(result.available).toBe(false);
    expect(result.reason).toContain("not installed");
  });
});

describe("smartFeatureFallback", () => {
  it("formats message correctly", () => {
    const result = smartFeatureFallback("analysis", "using basic heuristics");
    expect(result).toBe("Smart analysis unavailable — using basic heuristics. Install Claude Code for better results: https://claude.ai/claude-code");
  });

  it("includes feature name and fallback text", () => {
    const result = smartFeatureFallback("scoring", "rule-based defaults");
    expect(result).toContain("Smart scoring");
    expect(result).toContain("rule-based defaults");
    expect(result).toContain("claude.ai/claude-code");
  });
});
