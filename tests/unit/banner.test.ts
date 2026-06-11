import { describe, it, expect, vi, beforeEach } from "vitest";
import { printBanner, printCompactBanner } from "../../src/utils/banner.js";

describe("Banner", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("printBanner", () => {
    it("should print the full ASCII logo", () => {
      printBanner("1.0.0");
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("██");
      expect(output).toContain("v1.0.0");
      expect(output).toContain("AI Control Center");
    });

    it("should include version number", () => {
      printBanner("2.3.1");
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("v2.3.1");
    });

    it("should call console.log multiple times", () => {
      printBanner("1.0.0");
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.length).toBeGreaterThan(2);
    });

    it("should print a leading blank line before the logo", () => {
      printBanner("1.0.0");
      // First call should be an empty line (no arguments)
      expect(consoleSpy.mock.calls[0]).toEqual([]);
    });
  });

  describe("printCompactBanner", () => {
    it("should print a single-line banner", () => {
      printCompactBanner("1.0.0");
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Dafke");
      expect(output).toContain("v1.0.0");
    });

    it("should include version and tagline", () => {
      printCompactBanner("3.0.0");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("AI Control Center");
      expect(output).toContain("v3.0.0");
    });
  });
});
