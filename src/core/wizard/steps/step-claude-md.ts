/**
 * Step 4: CLAUDE.md Generation
 *
 * Generates a CLAUDE.md file from the detected tech stack and security rules,
 * shows a preview, and writes it to the repository root after approval.
 * When a CLAUDE.md already exists, intelligently merges to preserve user customizations.
 */

import * as p from "@clack/prompts";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createAdapterRegistry } from "../../../adapters/adapter-registry.js";
import { TemplateEngine } from "../../scaffold/template-engine.js";
import { sectionBasedMerge, claudeAiMerge } from "./claude-md-merger.js";
import { shouldUseClaudeAI, smartFeatureFallback } from "../../../utils/claude-cli.js";
import type { TechStack } from "../../config/config-schema.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

/** Map tech stack to the appropriate mutation testing command. */
function getMutationCommand(techStack: TechStack): string {
  switch (techStack) {
    case "typescript":
      return "npx stryker run";
    case "dotnet":
      return "dotnet stryker";
    case "java":
      return "mvn org.pitest:pitest-maven:mutationCoverage";
    case "python":
      return "mutmut run";
    case "delphi":
    case "foxpro":
    case "unknown":
      return "";
  }
}

async function buildClaudeMd(techStack: TechStack, repoRoot: string, ciPlatform?: string): Promise<string> {
  const registry = createAdapterRegistry();
  const adapter = registry.get(techStack);
  const stackSection = adapter?.getClaudeMdSection() ?? "";

  // Get build info from adapter for Quick Commands section
  let buildCommand = "npm run build";
  let testCommand = "npm run test";
  let lintCommand = "npm run lint";
  let typecheckCommand = "";

  if (adapter) {
    try {
      const buildInfo = await adapter.getBuildInfo(repoRoot);
      buildCommand = buildInfo.buildCommand;
      testCommand = buildInfo.testCommand;
      lintCommand = buildInfo.lintCommand ?? "";
      // TypeScript adapter might have typecheck
      if (techStack === "typescript") {
        typecheckCommand = "npx tsc --noEmit";
      }
    } catch {
      // Fallback to defaults if getBuildInfo fails
    }
  }

  const engine = new TemplateEngine();

  // Load and render the constitution template if it exists.
  // The rendered constitution is injected via simple {{constitution}} substitution
  // (not wrapped in {{#if}}) to avoid regex conflicts with other if/else blocks
  // in the base template — the engine doesn't support nested if blocks with else.
  const constitutionTemplate = engine.hasTemplate("claude-md/constitution.md")
    ? engine.getTemplate("claude-md/constitution.md")
    : "";
  const mutationCommand = getMutationCommand(techStack);
  const renderedConstitution = constitutionTemplate
    ? engine.renderString(constitutionTemplate, { mutationCommand })
    : "";
  // Add trailing newline when present so the next section starts cleanly
  const constitution = renderedConstitution ? `${renderedConstitution}\n` : "";

  return engine.render("claude-md/base.md", {
    techStack,
    stackSection,
    constitution,
    buildCommand,
    testCommand,
    lintCommand,
    typecheckCommand,
    ciPlatform: ciPlatform ?? "",
  });
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const techStack = (ctx.answers["techStack"] as TechStack) ?? "unknown";
  const ciPlatform = (ctx.answers["ciPlatform"] as string | undefined) ?? "";
  const claudeMdPath = join(ctx.repoRoot, "CLAUDE.md");
  const exists = existsSync(claudeMdPath);
  const generated = await buildClaudeMd(techStack, ctx.repoRoot, ciPlatform);

  if (!exists) {
    // No existing CLAUDE.md — write directly
    const previewLines = generated.split("\n").slice(0, 20).join("\n");
    p.log.message(`\n${previewLines}\n  ... (${generated.split("\n").length} lines total)`);

    if (ctx.nonInteractive) {
      await writeFile(claudeMdPath, generated, "utf-8");
      p.log.success("CLAUDE.md written");
      return { success: true, data: { claudeMdPath, claudeMdGenerated: true } };
    }

    const write = await p.confirm({ message: "Write CLAUDE.md to repository root?" });
    if (p.isCancel(write) || !write) {
      p.log.info("Skipped CLAUDE.md generation");
      return { success: true, data: { claudeMdGenerated: false } };
    }

    await writeFile(claudeMdPath, generated, "utf-8");
    p.log.success("CLAUDE.md written");
    return { success: true, data: { claudeMdPath, claudeMdGenerated: true } };
  }

  // Existing CLAUDE.md — merge instead of overwrite
  const existing = await readFile(claudeMdPath, "utf-8");
  p.log.warn("CLAUDE.md already exists — merging to preserve your customizations.");

  let merged: string;
  let strategy: string;

  if (ctx.nonInteractive) {
    // Non-interactive: always use deterministic section-based merge
    const result = sectionBasedMerge(existing, generated);
    merged = result.merged;
    strategy = "section-based";
    p.log.info(
      `Using section-based merge: +${result.added.length} added, =${result.preserved.length} preserved, ~${result.updated.length} updated`,
    );
  } else {
    // Interactive: offer choices
    const action = await p.select({
      message: "How would you like to handle the existing CLAUDE.md?",
      options: [
        { value: "merge" as const, label: "Merge (preserve your content, add missing sections)", hint: "recommended" },
        { value: "overwrite" as const, label: "Overwrite with new template" },
        { value: "skip" as const, label: "Skip (keep existing)" },
      ],
    });

    if (p.isCancel(action) || action === "skip") {
      p.log.info("Skipped CLAUDE.md update");
      return { success: true, data: { claudeMdGenerated: false } };
    }

    if (action === "overwrite") {
      await writeFile(claudeMdPath, generated, "utf-8");
      p.log.success("CLAUDE.md overwritten with new template");
      return { success: true, data: { claudeMdPath, claudeMdGenerated: true } };
    }

    // Merge mode — try Claude AI first, fall back to section-based
    const claudeCheck = await shouldUseClaudeAI(false);
    if (claudeCheck.available) {
      p.log.info("Using AI-powered merge (Claude Code detected)");
      const aiResult = await claudeAiMerge(existing, generated);
      if (aiResult) {
        merged = aiResult;
        strategy = "ai";
      } else {
        p.log.warn("AI merge failed — falling back to section-based merge");
        const result = sectionBasedMerge(existing, generated);
        merged = result.merged;
        strategy = "section-based";
        p.log.info(
          `Section-based merge: +${result.added.length} added, =${result.preserved.length} preserved, ~${result.updated.length} updated`,
        );
      }
    } else {
      p.log.info(smartFeatureFallback("CLAUDE.md merge", "using section-based merge"));
      const result = sectionBasedMerge(existing, generated);
      merged = result.merged;
      strategy = "section-based";
      p.log.info(
        `Section-based merge: +${result.added.length} added, =${result.preserved.length} preserved, ~${result.updated.length} updated`,
      );
    }
  }

  // Show preview
  const previewLines = merged.split("\n").slice(0, 15).join("\n");
  p.log.message(`\n${previewLines}\n  ... (${merged.split("\n").length} lines total)`);

  if (!ctx.nonInteractive) {
    const confirm = await p.confirm({ message: "Apply merged CLAUDE.md?" });
    if (p.isCancel(confirm) || !confirm) {
      p.log.info("Skipped CLAUDE.md update");
      return { success: true, data: { claudeMdGenerated: false } };
    }
  }

  await writeFile(claudeMdPath, merged, "utf-8");
  p.log.success(`CLAUDE.md merged (${strategy})`);
  return { success: true, data: { claudeMdPath, claudeMdGenerated: true, mergeStrategy: strategy } };
}
