import { describe, it, expect, vi } from "vitest";
import { parseSections, sectionBasedMerge, claudeAiMerge } from "../../src/core/wizard/steps/claude-md-merger.js";

// ---------------------------------------------------------------------------
// Mock claude-cli so tests do not invoke real CLI
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/claude-cli.js", () => ({
  invokeClaudePrompt: vi.fn(),
}));

// ---------------------------------------------------------------------------
// parseSections
// ---------------------------------------------------------------------------

describe("parseSections", () => {
  it("splits on ## headings correctly", () => {
    const content = [
      "## Section A",
      "Content A line 1",
      "Content A line 2",
      "## Section B",
      "Content B",
    ].join("\n");

    const sections = parseSections(content);
    expect(sections.size).toBe(2);
    expect(sections.has("Section A")).toBe(true);
    expect(sections.has("Section B")).toBe(true);
    expect(sections.get("Section A")).toContain("Content A line 1");
    expect(sections.get("Section B")).toContain("Content B");
  });

  it("handles preamble (content before first ##)", () => {
    const content = [
      "# Title",
      "Some preamble text",
      "",
      "## First Section",
      "Section content",
    ].join("\n");

    const sections = parseSections(content);
    expect(sections.has("__preamble__")).toBe(true);
    expect(sections.get("__preamble__")).toContain("# Title");
    expect(sections.get("__preamble__")).toContain("Some preamble text");
    expect(sections.has("First Section")).toBe(true);
  });

  it("handles single section", () => {
    const content = "## Only Section\nSome content here";
    const sections = parseSections(content);
    expect(sections.size).toBe(1);
    expect(sections.has("Only Section")).toBe(true);
    expect(sections.get("Only Section")).toContain("Some content here");
  });

  it("handles empty content", () => {
    const sections = parseSections("");
    // An empty string still produces a preamble entry with an empty line
    expect(sections.size).toBe(1);
    expect(sections.has("__preamble__")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sectionBasedMerge
// ---------------------------------------------------------------------------

describe("sectionBasedMerge", () => {
  it("preserves Lessons Learned from existing", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "Old disclaimer text",
      "",
      "## Lessons Learned",
      "- Bug #42: always validate input",
      "- Bug #99: check null before access",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "New disclaimer text",
      "",
      "## Lessons Learned",
      "_After ANY correction from the user, add an entry here._",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    expect(result.merged).toContain("Bug #42: always validate input");
    expect(result.merged).toContain("Bug #99: check null before access");
    expect(result.preserved).toContain("Lessons Learned");
  });

  it("adds new sections from template", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "Disclaimer text",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "Disclaimer text",
      "",
      "## Security Rules",
      "- NEVER commit secrets",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    expect(result.merged).toContain("Security Rules");
    expect(result.merged).toContain("NEVER commit secrets");
    expect(result.added).toContain("Security Rules");
  });

  it("preserves user-added sections not in template", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "Disclaimer text",
      "",
      "## My Custom Section",
      "My custom notes here",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Disclaimer",
      "Disclaimer text",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    expect(result.merged).toContain("My Custom Section");
    expect(result.merged).toContain("My custom notes here");
    expect(result.preserved).toContain("My Custom Section");
  });

  it("updates Disclaimer from template", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Disclaimer — MANDATORY",
      "Old disclaimer",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Disclaimer — MANDATORY",
      "New updated disclaimer",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    expect(result.merged).toContain("New updated disclaimer");
    expect(result.merged).not.toContain("Old disclaimer");
    expect(result.updated).toContain("Disclaimer \u2014 MANDATORY");
  });

  it("keeps existing modified sections", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Code Standards",
      "- Follow conventions",
      "- My custom rule: always add logging",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Code Standards",
      "- Follow conventions",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    expect(result.merged).toContain("My custom rule: always add logging");
    expect(result.preserved).toContain("Code Standards");
  });

  it("replaces unchanged template sections", () => {
    const sectionContent = "- Follow conventions\n- Write tests";
    const existing = [
      "# CLAUDE.md",
      "",
      "## Code Standards",
      sectionContent,
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Code Standards",
      sectionContent,
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    // Section should be present but not listed as preserved (it's unchanged)
    expect(result.merged).toContain("Code Standards");
    expect(result.preserved).not.toContain("Code Standards");
    expect(result.added).not.toContain("Code Standards");
  });

  it("returns correct added/preserved/updated counts", () => {
    const existing = [
      "# CLAUDE.md",
      "",
      "## Disclaimer — MANDATORY",
      "Old disclaimer",
      "",
      "## Code Standards",
      "- My custom standards",
      "",
      "## Lessons Learned",
      "- Lesson 1: do X",
      "",
      "## My Notes",
      "Personal notes",
    ].join("\n");

    const generated = [
      "# CLAUDE.md",
      "",
      "## Disclaimer — MANDATORY",
      "New disclaimer",
      "",
      "## Code Standards",
      "- Default standards",
      "",
      "## Lessons Learned",
      "_Empty_",
      "",
      "## New Section",
      "Brand new content",
    ].join("\n");

    const result = sectionBasedMerge(existing, generated);

    // Disclaimer: updated (1)
    expect(result.updated).toContain("Disclaimer \u2014 MANDATORY");
    expect(result.updated).toHaveLength(1);

    // Code Standards: preserved (modified), Lessons Learned: preserved (from existing), My Notes: preserved (user-added)
    expect(result.preserved).toContain("Code Standards");
    expect(result.preserved).toContain("Lessons Learned");
    expect(result.preserved).toContain("My Notes");
    expect(result.preserved).toHaveLength(3);

    // New Section: added
    expect(result.added).toContain("New Section");
    expect(result.added).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// claudeAiMerge
// ---------------------------------------------------------------------------

describe("claudeAiMerge", () => {
  it("falls back to null when Claude unavailable", async () => {
    const { invokeClaudePrompt } = await import("../../src/utils/claude-cli.js");
    vi.mocked(invokeClaudePrompt).mockResolvedValueOnce(null);

    const result = await claudeAiMerge("existing content", "generated content");
    expect(result).toBeNull();
    expect(invokeClaudePrompt).toHaveBeenCalledOnce();
  });

  it("returns merged content when Claude succeeds", async () => {
    const { invokeClaudePrompt } = await import("../../src/utils/claude-cli.js");
    const mergedContent = "# Merged CLAUDE.md\n## Merged Section\nMerged content";
    vi.mocked(invokeClaudePrompt).mockResolvedValueOnce(mergedContent);

    const result = await claudeAiMerge("existing content", "generated content");
    expect(result).toBe(mergedContent);
    expect(invokeClaudePrompt).toHaveBeenCalledOnce();
    // Verify the prompt contains both existing and generated content
    const callArgs = vi.mocked(invokeClaudePrompt).mock.calls[0];
    expect(callArgs?.[0]).toContain("existing content");
    expect(callArgs?.[0]).toContain("generated content");
    expect(callArgs?.[1]).toEqual({ timeout: 30_000 });
  });
});
