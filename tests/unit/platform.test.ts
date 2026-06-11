import { describe, it, expect, vi, afterEach } from "vitest";
import { join } from "node:path";
import {
  isWindows,
  isMac,
  isLinux,
  getConfigDir,
  getDataDir,
  getCacheDir,
  getClaudeDir,
  getGlobalConfigPath,
  getRepoDafkeDir,
  getRepoClaudeDir,
} from "../../src/utils/platform.js";

describe("platform detection", () => {
  it("isWindows() returns a boolean", () => {
    expect(typeof isWindows()).toBe("boolean");
  });

  it("isMac() returns a boolean", () => {
    expect(typeof isMac()).toBe("boolean");
  });

  it("isLinux() returns a boolean", () => {
    expect(typeof isLinux()).toBe("boolean");
  });

  it("exactly one platform function returns true", () => {
    const results = [isWindows(), isMac(), isLinux()];
    const trueCount = results.filter(Boolean).length;
    // On macOS/Linux/Windows exactly one should be true (or none if exotic platform)
    expect(trueCount).toBeLessThanOrEqual(1);
  });
});

describe("directory functions", () => {
  it("getConfigDir() returns a string", () => {
    const dir = getConfigDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("getDataDir() returns a string", () => {
    const dir = getDataDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("getCacheDir() returns a string", () => {
    const dir = getCacheDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });
});

describe("getClaudeDir()", () => {
  it("returns correct path based on platform", () => {
    const dir = getClaudeDir();
    expect(typeof dir).toBe("string");

    if (isWindows()) {
      expect(dir).toContain("claude");
    } else {
      // macOS/Linux: ~/.claude
      expect(dir).toMatch(/\.claude$/);
    }
  });
});

describe("getGlobalConfigPath()", () => {
  it("ends with config.yaml", () => {
    const configPath = getGlobalConfigPath();
    expect(configPath).toMatch(/config\.yaml$/);
  });
});

describe("getRepoDafkeDir()", () => {
  it("appends .dafke to repoRoot", () => {
    const result = getRepoDafkeDir("/my/repo");
    expect(result).toBe(join("/my/repo", ".dafke"));
  });

  it("defaults to process.cwd() when no repoRoot provided", () => {
    const result = getRepoDafkeDir();
    expect(result).toBe(join(process.cwd(), ".dafke"));
  });
});

describe("getRepoClaudeDir()", () => {
  it("appends .claude to repoRoot", () => {
    const result = getRepoClaudeDir("/my/repo");
    expect(result).toBe(join("/my/repo", ".claude"));
  });

  it("defaults to process.cwd() when no repoRoot provided", () => {
    const result = getRepoClaudeDir();
    expect(result).toBe(join(process.cwd(), ".claude"));
  });
});

// ---------------------------------------------------------------------------
// Platform-specific behavior with mocked os.platform()
// ---------------------------------------------------------------------------

describe("platform detection with mocked os.platform()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isWindows() returns true when platform is win32", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({
      platform: () => "win32",
    }));
    vi.doMock("env-paths", () => ({
      default: () => ({ config: "C:\\config", data: "C:\\data", cache: "C:\\cache" }),
    }));

    const mod = await import("../../src/utils/platform.js");
    expect(mod.isWindows()).toBe(true);
    expect(mod.isMac()).toBe(false);
    expect(mod.isLinux()).toBe(false);
  });

  it("isMac() returns true when platform is darwin", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({
      platform: () => "darwin",
    }));
    vi.doMock("env-paths", () => ({
      default: () => ({ config: "/Users/test/config", data: "/Users/test/data", cache: "/Users/test/cache" }),
    }));

    const mod = await import("../../src/utils/platform.js");
    expect(mod.isMac()).toBe(true);
    expect(mod.isWindows()).toBe(false);
    expect(mod.isLinux()).toBe(false);
  });

  it("isLinux() returns true when platform is linux", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({
      platform: () => "linux",
    }));
    vi.doMock("env-paths", () => ({
      default: () => ({ config: "/home/test/.config/dafke", data: "/home/test/.local/share/dafke", cache: "/home/test/.cache/dafke" }),
    }));

    const mod = await import("../../src/utils/platform.js");
    expect(mod.isLinux()).toBe(true);
    expect(mod.isWindows()).toBe(false);
    expect(mod.isMac()).toBe(false);
  });
});

describe("getClaudeDir with APPDATA env var (Windows path)", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("uses APPDATA when platform is win32", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({
      platform: () => "win32",
    }));
    vi.doMock("env-paths", () => ({
      default: () => ({ config: "C:\\config", data: "C:\\data", cache: "C:\\cache" }),
    }));

    process.env = { ...originalEnv, APPDATA: "C:\\Users\\TestUser\\AppData\\Roaming" };
    const mod = await import("../../src/utils/platform.js");
    const claudeDir = mod.getClaudeDir();
    expect(claudeDir).toBe(join("C:\\Users\\TestUser\\AppData\\Roaming", "claude"));
  });
});
