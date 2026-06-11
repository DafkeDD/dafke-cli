import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock execa at module level
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

// Mock node:os to control platform() return value
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    platform: vi.fn(() => "darwin"),
  };
});

import { checkPrerequisites, getInstallHint, type ToolCheckResult } from "../../src/utils/prerequisites.js";
import { execa } from "execa";
import { platform } from "node:os";

const mockedExeca = vi.mocked(execa);
const mockedPlatform = vi.mocked(platform);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeResult(stdout: string, exitCode = 0): ReturnType<typeof execa> {
  return { stdout, stderr: "", exitCode, failed: false } as never;
}

function fakeError(code?: string): Error {
  const err = new Error("command not found") as NodeJS.ErrnoException;
  if (code) err.code = code;
  return err;
}

/** Find a tool result by name, failing the test if not found. */
function findTool(results: ToolCheckResult[], name: string): ToolCheckResult {
  const found = results.find((r) => r.name === name);
  if (!found) {
    throw new Error(`Expected tool "${name}" in results but it was not found`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// getInstallHint
// ---------------------------------------------------------------------------

describe("getInstallHint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { tool: "gitleaks", os: "darwin" as const, expected: "brew install gitleaks" },
    { tool: "az", os: "linux" as const, expected: "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash" },
    { tool: "gh", os: "win32" as const, expected: "winget install GitHub.cli" },
    { tool: "git", os: "darwin" as const, expected: "brew install git" },
    { tool: "claude", os: "linux" as const, expected: "npm install -g @anthropic-ai/claude-code" },
    { tool: "lefthook", os: "win32" as const, expected: "npx @evilmartians/lefthook install" },
  ])("returns $os hint for $tool", ({ tool, os, expected }) => {
    mockedPlatform.mockReturnValue(os);
    const hint = getInstallHint(tool);
    expect(hint).toContain(expected);
  });

  it("returns fallback for unknown tool", () => {
    mockedPlatform.mockReturnValue("darwin");
    const hint = getInstallHint("unknown-tool");
    expect(hint).toBe("See documentation for unknown-tool");
  });
});

// ---------------------------------------------------------------------------
// checkPrerequisites
// ---------------------------------------------------------------------------

describe("checkPrerequisites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("darwin");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // git
  // -----------------------------------------------------------------------

  it("git found with valid version", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(true);
    expect(git.version).toBe("2.45.0");
    expect(git.category).toBe("required");
  });

  it("git not found (ENOENT)", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") throw fakeError("ENOENT");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(false);
  });

  it("git version too low (2.20)", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.20.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(false);
    expect(git.version).toBe("2.20.0");
    expect(git.installHint).toContain("need >= 2.30");
    expect(git.installHint).toContain("found 2.20.0");
  });

  // -----------------------------------------------------------------------
  // node
  // -----------------------------------------------------------------------

  it("node found with valid version", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const node = findTool(results, "node");
    expect(node.installed).toBe(true);
    expect(node.version).toBe("22.1.0");
    expect(node.category).toBe("required");
  });

  it("node version too low (18)", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v18.19.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const node = findTool(results, "node");
    expect(node.installed).toBe(false);
    expect(node.version).toBe("18.19.0");
    expect(node.installHint).toContain("need >= 20");
  });

  // -----------------------------------------------------------------------
  // claude
  // -----------------------------------------------------------------------

  it("claude found", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "claude") return fakeResult("claude 1.0.23");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const claude = findTool(results, "claude");
    expect(claude.installed).toBe(true);
    expect(claude.category).toBe("recommended");
  });

  it("claude not found", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "claude") throw fakeError("ENOENT");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const claude = findTool(results, "claude");
    expect(claude.installed).toBe(false);
    expect(claude.category).toBe("recommended");
  });

  // -----------------------------------------------------------------------
  // gitleaks
  // -----------------------------------------------------------------------

  it("gitleaks found", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "gitleaks") return fakeResult("gitleaks version 8.18.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const gl = findTool(results, "gitleaks");
    expect(gl.installed).toBe(true);
    expect(gl.category).toBe("recommended");
  });

  it("gitleaks not found has recommended category", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "gitleaks") throw fakeError("ENOENT");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const gl = findTool(results, "gitleaks");
    expect(gl.installed).toBe(false);
    expect(gl.category).toBe("recommended");
  });

  // -----------------------------------------------------------------------
  // lefthook
  // -----------------------------------------------------------------------

  it("lefthook found", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "lefthook") return fakeResult("lefthook version 1.6.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const lh = findTool(results, "lefthook");
    expect(lh.installed).toBe(true);
    expect(lh.category).toBe("recommended");
  });

  // -----------------------------------------------------------------------
  // Provider-conditional checks
  // -----------------------------------------------------------------------

  it("az checked only when azureDevOps provider", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "az") return fakeResult("azure-cli 2.60.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites(["azureDevOps"]);
    const az = findTool(results, "az");
    expect(az.installed).toBe(true);
    expect(az.category).toBe("optional");
  });

  it("gh checked only when github provider", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "gh") return fakeResult("gh version 2.50.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites(["github"]);
    const gh = findTool(results, "gh");
    expect(gh.installed).toBe(true);
    expect(gh.category).toBe("optional");
  });

  it("az NOT checked without provider", async () => {
    mockedExeca.mockImplementation(() => fakeResult("1.0.0"));

    const results = await checkPrerequisites();
    const az = results.find((r) => r.name === "az");
    expect(az).toBeUndefined();
  });

  it("gh NOT checked without provider", async () => {
    mockedExeca.mockImplementation(() => fakeResult("1.0.0"));

    const results = await checkPrerequisites();
    const gh = results.find((r) => r.name === "gh");
    expect(gh).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // All tools found
  // -----------------------------------------------------------------------

  it("all tools found returns all installed=true", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      if (cmd === "claude") return fakeResult("claude 1.0.23");
      if (cmd === "gitleaks") return fakeResult("gitleaks 8.18.0");
      if (cmd === "lefthook") return fakeResult("lefthook 1.6.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    expect(results.every((r) => r.installed)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("execa timeout results in installed=false", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") {
        const err = new Error("timed out");
        (err as Record<string, unknown>).timedOut = true;
        throw err;
      }
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(false);
  });

  it("meetsMinVersion: 2.30 >= 2.30 is true (tested via checkTool)", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.30.0");
      if (cmd === "node") return fakeResult("v20.0.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    // 2.30 meets minimum 2.30 exactly, so it should be installed
    expect(git.installed).toBe(true);
    expect(git.version).toBe("2.30.0");
  });

  it("non-zero exit code results in installed=false", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("", 1);
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(false);
  });

  it("version in stderr is detected", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      // az outputs version info to stderr
      if (cmd === "az") return { stdout: "", stderr: "azure-cli 2.60.0", exitCode: 0 } as never;
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites(["azureDevOps"]);
    const az = findTool(results, "az");
    expect(az.installed).toBe(true);
    expect(az.version).toBe("2.60.0");
  });

  // -----------------------------------------------------------------------
  // Exact command and args verification (mutant killers)
  // -----------------------------------------------------------------------

  it("calls execa with exact command 'git' and args ['--version']", async () => {
    mockedExeca.mockImplementation(() => fakeResult("git version 2.45.0"));

    await checkPrerequisites();

    const gitCall = mockedExeca.mock.calls.find((c) => c[0] === "git");
    expect(gitCall).toBeDefined();
    expect(gitCall?.[0]).toBe("git");
    expect(gitCall?.[1]).toEqual(["--version"]);
  });

  it("calls execa with exact command 'node' and args ['--version']", async () => {
    mockedExeca.mockImplementation(() => fakeResult("v22.1.0"));

    await checkPrerequisites();

    const nodeCall = mockedExeca.mock.calls.find((c) => c[0] === "node");
    expect(nodeCall).toBeDefined();
    expect(nodeCall?.[0]).toBe("node");
    expect(nodeCall?.[1]).toEqual(["--version"]);
  });

  it("calls execa with exact command 'claude' and args ['--version']", async () => {
    mockedExeca.mockImplementation(() => fakeResult("claude 1.0.23"));

    await checkPrerequisites();

    const claudeCall = mockedExeca.mock.calls.find((c) => c[0] === "claude");
    expect(claudeCall).toBeDefined();
    expect(claudeCall?.[0]).toBe("claude");
    expect(claudeCall?.[1]).toEqual(["--version"]);
  });

  it("calls execa with exact command 'gitleaks' and args ['version']", async () => {
    mockedExeca.mockImplementation(() => fakeResult("gitleaks 8.18.0"));

    await checkPrerequisites();

    const gitleaksCall = mockedExeca.mock.calls.find((c) => c[0] === "gitleaks");
    expect(gitleaksCall).toBeDefined();
    expect(gitleaksCall?.[0]).toBe("gitleaks");
    expect(gitleaksCall?.[1]).toEqual(["version"]);
  });

  it("calls execa with exact command 'lefthook' and args ['version']", async () => {
    mockedExeca.mockImplementation(() => fakeResult("lefthook 1.6.0"));

    await checkPrerequisites();

    const lefthookCall = mockedExeca.mock.calls.find((c) => c[0] === "lefthook");
    expect(lefthookCall).toBeDefined();
    expect(lefthookCall?.[0]).toBe("lefthook");
    expect(lefthookCall?.[1]).toEqual(["version"]);
  });

  it("calls execa with exact command 'az' and args ['--version'] when azureDevOps provider", async () => {
    mockedExeca.mockImplementation(() => fakeResult("azure-cli 2.60.0"));

    await checkPrerequisites(["azureDevOps"]);

    const azCall = mockedExeca.mock.calls.find((c) => c[0] === "az");
    expect(azCall).toBeDefined();
    expect(azCall?.[0]).toBe("az");
    expect(azCall?.[1]).toEqual(["--version"]);
  });

  it("calls execa with exact command 'gh' and args ['--version'] when github provider", async () => {
    mockedExeca.mockImplementation(() => fakeResult("gh version 2.50.0"));

    await checkPrerequisites(["github"]);

    const ghCall = mockedExeca.mock.calls.find((c) => c[0] === "gh");
    expect(ghCall).toBeDefined();
    expect(ghCall?.[0]).toBe("gh");
    expect(ghCall?.[1]).toEqual(["--version"]);
  });

  it("git command string is not empty", async () => {
    mockedExeca.mockImplementation(() => fakeResult("git version 2.45.0"));

    await checkPrerequisites();

    const gitCall = mockedExeca.mock.calls.find((c) => c[0] === "git");
    expect(gitCall?.[0]).not.toBe("");
  });

  it("node command string is not empty", async () => {
    mockedExeca.mockImplementation(() => fakeResult("v22.1.0"));

    await checkPrerequisites();

    const nodeCall = mockedExeca.mock.calls.find((c) => c[0] === "node");
    expect(nodeCall?.[0]).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// getInstallHint — platform branch mutation killers
// ---------------------------------------------------------------------------

describe("getInstallHint platform-specific branches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gitleaks on darwin contains 'brew'", () => {
    mockedPlatform.mockReturnValue("darwin");
    expect(getInstallHint("gitleaks")).toContain("brew");
  });

  it("az on linux contains 'curl'", () => {
    mockedPlatform.mockReturnValue("linux");
    expect(getInstallHint("az")).toContain("curl");
  });

  it("gh on win32 contains 'winget'", () => {
    mockedPlatform.mockReturnValue("win32");
    expect(getInstallHint("gh")).toContain("winget");
  });

  it("git on darwin contains 'brew'", () => {
    mockedPlatform.mockReturnValue("darwin");
    expect(getInstallHint("git")).toContain("brew");
  });

  it("git on linux contains 'apt'", () => {
    mockedPlatform.mockReturnValue("linux");
    expect(getInstallHint("git")).toContain("apt");
  });

  it("git on win32 contains 'winget'", () => {
    mockedPlatform.mockReturnValue("win32");
    expect(getInstallHint("git")).toContain("winget");
  });

  it("claude on darwin contains 'npm'", () => {
    mockedPlatform.mockReturnValue("darwin");
    expect(getInstallHint("claude")).toContain("npm");
  });

  it("lefthook on darwin contains 'brew'", () => {
    mockedPlatform.mockReturnValue("darwin");
    expect(getInstallHint("lefthook")).toContain("brew");
  });

  it("gitleaks on win32 contains 'choco'", () => {
    mockedPlatform.mockReturnValue("win32");
    expect(getInstallHint("gitleaks")).toContain("choco");
  });

  it("az on darwin contains 'brew'", () => {
    mockedPlatform.mockReturnValue("darwin");
    expect(getInstallHint("az")).toContain("brew");
  });

  it("az on win32 contains 'winget'", () => {
    mockedPlatform.mockReturnValue("win32");
    expect(getInstallHint("az")).toContain("winget");
  });
});

// ---------------------------------------------------------------------------
// meetsMinVersion — edge cases (tested indirectly via checkTool)
// ---------------------------------------------------------------------------

describe("meetsMinVersion edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("darwin");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exact match: 2.30 meets minimum 2.30", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.30.0");
      if (cmd === "node") return fakeResult("v20.0.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(true);
  });

  it("major-only: node 20 meets minimum 20", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v20.0.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const node = findTool(results, "node");
    expect(node.installed).toBe(true);
    expect(node.version).toBe("20.0.0");
  });

  it("major-only: node 19 fails minimum 20", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.45.0");
      if (cmd === "node") return fakeResult("v19.9.9");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const node = findTool(results, "node");
    expect(node.installed).toBe(false);
  });

  it("patch level: 2.30.1 exceeds minimum 2.30", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.30.1");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(true);
    expect(git.version).toBe("2.30.1");
  });

  it("higher major: 3.0.0 exceeds minimum 2.30", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 3.0.0");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(true);
    expect(git.version).toBe("3.0.0");
  });

  it("lower minor: 2.29.9 fails minimum 2.30", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "git") return fakeResult("git version 2.29.9");
      if (cmd === "node") return fakeResult("v22.1.0");
      return fakeResult("1.0.0");
    });

    const results = await checkPrerequisites();
    const git = findTool(results, "git");
    expect(git.installed).toBe(false);
    expect(git.version).toBe("2.29.9");
  });
});
