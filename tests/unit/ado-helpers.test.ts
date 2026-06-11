import { describe, it, expect } from "vitest";
import { extractOrgFromUrl } from "../../src/utils/ado-helpers.js";

describe("extractOrgFromUrl", () => {
  it("extracts org from HTTPS Azure DevOps URL", () => {
    expect(extractOrgFromUrl("https://dev.azure.com/dafkenv")).toBe("dafkenv");
  });

  it("extracts org from URL with trailing path", () => {
    expect(extractOrgFromUrl("https://dev.azure.com/myorg/MyProject")).toBe("myorg");
  });

  it("returns null for non-Azure DevOps URL", () => {
    expect(extractOrgFromUrl("https://github.com/foo/bar")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractOrgFromUrl("")).toBeNull();
  });
});
