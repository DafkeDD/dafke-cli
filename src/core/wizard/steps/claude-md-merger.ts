/**
 * CLAUDE.md merge logic — preserves user customizations when regenerating.
 * Two strategies: section-based (deterministic) and Claude AI-powered (optional).
 */

import { invokeClaudePrompt } from "../../../utils/claude-cli.js";

export interface MergeResult {
  merged: string;
  added: string[];
  preserved: string[];
  updated: string[];
}

/** Protected sections that have special merge rules. */
const PROTECTED_FROM_REMOVAL = ["Disclaimer"];
const ALWAYS_PRESERVE_FROM_EXISTING = ["Lessons Learned"];

/**
 * Parse a markdown document into sections based on ## headings.
 * Returns a Map of heading → content (including the heading line).
 */
export function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split("\n");
  let currentHeading = "__preamble__";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentLines.length > 0) {
        sections.set(currentHeading, currentLines.join("\n"));
      }
      currentHeading = (headingMatch[1] ?? "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  // Save last section
  if (currentLines.length > 0) {
    sections.set(currentHeading, currentLines.join("\n"));
  }

  return sections;
}

/**
 * Deterministic section-based merge.
 * - Template sections: keep existing if modified, use new if unchanged
 * - User-added sections: always preserve
 * - Protected sections: Disclaimer always from template, Lessons Learned always from existing
 */
export function sectionBasedMerge(existing: string, generated: string): MergeResult {
  const existingSections = parseSections(existing);
  const generatedSections = parseSections(generated);

  const added: string[] = [];
  const preserved: string[] = [];
  const updated: string[] = [];
  const result: string[] = [];

  // Start with preamble from generated (contains header, title, etc.)
  const preamble = generatedSections.get("__preamble__") ?? existingSections.get("__preamble__") ?? "";
  if (preamble.trim()) {
    result.push(preamble);
  }

  // Process generated sections in template order
  for (const [heading, generatedContent] of generatedSections) {
    if (heading === "__preamble__") continue;

    // Protected: Disclaimer always from template
    if (PROTECTED_FROM_REMOVAL.some((p) => heading.includes(p))) {
      result.push(generatedContent);
      updated.push(heading);
      continue;
    }

    // Protected: Lessons Learned always from existing
    if (ALWAYS_PRESERVE_FROM_EXISTING.some((p) => heading.includes(p))) {
      const existingContent = existingSections.get(heading);
      if (existingContent && existingContent.trim() !== generatedContent.trim()) {
        result.push(existingContent);
        preserved.push(heading);
      } else {
        result.push(generatedContent);
      }
      continue;
    }

    // Regular section: keep existing if modified, use generated if unchanged
    const existingContent = existingSections.get(heading);
    if (!existingContent) {
      // New section from template
      result.push(generatedContent);
      added.push(heading);
    } else if (existingContent.trim() === generatedContent.trim()) {
      // Unchanged — use generated (may have formatting updates)
      result.push(generatedContent);
    } else {
      // Modified by user — preserve existing
      result.push(existingContent);
      preserved.push(heading);
    }
  }

  // Preserve user-added sections not in template
  for (const [heading, content] of existingSections) {
    if (heading === "__preamble__") continue;
    if (!generatedSections.has(heading)) {
      result.push(content);
      preserved.push(heading);
    }
  }

  return {
    merged: result.join("\n\n"),
    added,
    preserved,
    updated,
  };
}

/**
 * Claude AI-powered merge. Falls back to null on failure.
 */
export async function claudeAiMerge(existing: string, generated: string): Promise<string | null> {
  const prompt = `You are merging two CLAUDE.md files for an AI-assisted development project.

RULES:
1. ALWAYS preserve the "Lessons Learned" section from EXISTING, including all entries
2. ALWAYS preserve any user-added sections not present in NEW
3. For sections in both: prefer EXISTING if it contains custom content beyond the template
4. Add NEW sections that don't exist in EXISTING
5. The "Disclaimer" section must always come from NEW (it's a compliance requirement)
6. Output ONLY the merged CLAUDE.md content, no explanations or markdown fences

EXISTING CLAUDE.md:
---
${existing}
---

NEW TEMPLATE CLAUDE.md:
---
${generated}
---

Output the merged CLAUDE.md:`;

  return invokeClaudePrompt(prompt, { timeout: 30_000 });
}
