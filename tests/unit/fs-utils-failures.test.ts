/**
 * Failure-path tests for atomicWrite using vi.mock to simulate fs errors.
 *
 * Separate from fs-utils.test.ts because ESM modules require vi.mock
 * at the module level — cannot use vi.spyOn on node:fs/promises exports.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:fs/promises BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockChmod = vi.fn().mockResolvedValue(undefined);
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  chmod: (...args: unknown[]) => mockChmod(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-mock"),
}));

import { atomicWrite } from "../../src/utils/fs.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("atomicWrite failure cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to success by default
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("cleans up temp file on chmod failure", async () => {
    mockChmod.mockRejectedValueOnce(new Error("EPERM"));

    await expect(atomicWrite("/fake/dir/file.txt", "content", 0o600)).rejects.toThrow("EPERM");

    // unlink should have been called to clean up the temp file
    expect(mockUnlink).toHaveBeenCalledWith("/fake/dir/.tmp-test-uuid-mock");
  });

  it("cleans up temp file on rename failure", async () => {
    mockRename.mockRejectedValueOnce(new Error("EXDEV"));

    await expect(atomicWrite("/fake/dir/file.txt", "content")).rejects.toThrow("EXDEV");

    expect(mockUnlink).toHaveBeenCalledWith("/fake/dir/.tmp-test-uuid-mock");
  });

  it("cleans up temp file on writeFile failure", async () => {
    mockWriteFile.mockRejectedValueOnce(new Error("EIO"));

    await expect(atomicWrite("/fake/dir/file.txt", "content")).rejects.toThrow("EIO");

    // unlink is called even if the temp file may not exist (cleanup is best-effort)
    expect(mockUnlink).toHaveBeenCalledWith("/fake/dir/.tmp-test-uuid-mock");
  });

  it("does not throw when temp file cleanup itself fails", async () => {
    mockRename.mockRejectedValueOnce(new Error("EXDEV"));
    mockUnlink.mockRejectedValueOnce(new Error("ENOENT")); // cleanup fails

    // The original error (EXDEV) should be thrown, not the cleanup error
    await expect(atomicWrite("/fake/dir/file.txt", "content")).rejects.toThrow("EXDEV");
  });

  it("successful write does not call unlink", async () => {
    await atomicWrite("/fake/dir/file.txt", "content");

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockRename).toHaveBeenCalled();
  });
});
