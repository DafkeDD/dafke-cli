/**
 * Step 7: CI/CD Hardening
 *
 * Evaluates the existing CI pipeline, shows what is missing,
 * generates a CI template for the detected platform, and offers to apply.
 * When a pipeline already exists, analyzes it for missing quality gates
 * and reports what is missing instead of overwriting.
 */

import * as p from "@clack/prompts";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { CicdAnalyzer } from "../../analyzer/cicd-analyzer.js";
import { findAzurePipelineFiles } from "../../detection/pipeline-files.js";
import { TemplateEngine } from "../../scaffold/template-engine.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

// ---------------------------------------------------------------------------
// Pipeline analysis — detect quality gates in existing CI config
// ---------------------------------------------------------------------------

export interface PipelineAnalysis {
  hasTests: boolean;
  hasLint: boolean;
  hasTypecheck: boolean;
  hasSast: boolean;
  hasCoverage: boolean;
  detectedStages: string[];
}

/** Analyze pipeline content for quality gate presence. */
export function analyzePipeline(content: string): PipelineAnalysis {
  const lower = content.toLowerCase();
  return {
    hasTests: /\btest\b/.test(lower) || /\bnpm\s+run\s+test/.test(lower),
    hasLint: /\blint\b/.test(lower) || /\beslint\b/.test(lower),
    hasTypecheck: /\btsc\b/.test(lower) || /\btypecheck\b/.test(lower),
    hasSast: /\bsemgrep\b/.test(lower) || /\bgitleaks\b/.test(lower) || /\bsast\b/.test(lower),
    hasCoverage: /\bcoverage\b/.test(lower) || /\bcoverlet\b/.test(lower) || /\bjacoco\b/.test(lower),
    detectedStages: [...content.matchAll(/^\s*-?\s*stage:\s*(.+)$/gim)].map((m) => (m[1] ?? "").trim()),
  };
}

/** Summarize which quality gates are present and which are missing. */
export function getQualityGateSummary(analysis: PipelineAnalysis): { present: string[]; missing: string[] } {
  const gates = [
    { name: "tests", present: analysis.hasTests },
    { name: "lint", present: analysis.hasLint },
    { name: "typecheck", present: analysis.hasTypecheck },
    { name: "SAST/security", present: analysis.hasSast },
    { name: "coverage", present: analysis.hasCoverage },
  ];
  return {
    present: gates.filter((g) => g.present).map((g) => g.name),
    missing: gates.filter((g) => !g.present).map((g) => g.name),
  };
}

// ---------------------------------------------------------------------------
// Template generators
// ---------------------------------------------------------------------------

function generateAzurePipeline(): string {
  const engine = new TemplateEngine();
  return engine.getTemplate("ci/azure-devops/pipeline.yml");
}

function generateGitHubActions(): string {
  const engine = new TemplateEngine();
  return engine.getTemplate("ci/github-actions/ci.yml");
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const analyzer = new CicdAnalyzer();
  const s = p.spinner();
  s.start("Evaluating current CI/CD configuration...");

  const result = await analyzer.analyze(ctx.repoRoot);
  s.stop("CI/CD evaluation complete");

  p.log.info(`Current CI/CD score: ${result.score}/5 - ${result.details}`);

  for (const ev of result.evidence) {
    p.log.message(`  ${ev}`);
  }
  for (const sg of result.suggestions) {
    p.log.message(`  > ${sg}`);
  }

  if (result.score >= 4) {
    p.log.success("CI/CD pipeline is already mature. No changes needed.");
    return { success: true, data: { ciScore: result.score, ciGenerated: false } };
  }

  // Detect platform — use the actual detected file path when one exists
  const azureMatches = findAzurePipelineFiles(ctx.repoRoot);
  const hasAzure = azureMatches.length > 0;
  const hasGitHub = existsSync(join(ctx.repoRoot, ".github", "workflows"));
  const platform = hasAzure ? "azure-devops" : hasGitHub ? "github-actions" : "github-actions";

  const targetPath = platform === "azure-devops"
    ? (azureMatches[0]?.absolutePath ?? join(ctx.repoRoot, "azure-pipelines.yml"))
    : join(ctx.repoRoot, ".github", "workflows", "ci.yml");

  // If a pipeline already exists, analyze it for missing quality gates
  // instead of blindly overwriting. YAML merging is intentionally avoided
  // because it is too error-prone; we report and suggest instead.
  if (existsSync(targetPath)) {
    const existingContent = await readFile(targetPath, "utf-8");
    const analysis = analyzePipeline(existingContent);
    const summary = getQualityGateSummary(analysis);

    const total = summary.present.length + summary.missing.length;
    p.log.info(`Existing pipeline found with ${summary.present.length}/${total} quality gates.`);

    if (summary.missing.length > 0) {
      p.log.warn(`Missing: ${summary.missing.join(", ")}. Consider adding these to your pipeline.`);
    } else {
      p.log.success("CI pipeline is complete — no changes needed.");
    }

    return {
      success: true,
      data: {
        ciScore: result.score,
        ciGenerated: false,
        ciPlatform: platform,
        qualityGates: summary,
      },
    };
  }

  // No pipeline exists — generate from template (existing behavior)
  const template = platform === "azure-devops" ? generateAzurePipeline() : generateGitHubActions();

  p.log.message(`\nGenerated ${platform} template (preview):`);
  const previewLines = template.split("\n").slice(0, 15).join("\n");
  p.log.message(previewLines + "\n  ...");

  if (ctx.nonInteractive) {
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, template, "utf-8");
    p.log.success(`CI template written to ${targetPath}`);
    return { success: true, data: { ciScore: result.score, ciGenerated: true, ciPlatform: platform } };
  }

  const apply = await p.confirm({ message: `Write ${platform} CI template?` });
  if (p.isCancel(apply) || !apply) {
    p.log.info("Skipped CI template generation");
    return { success: true, data: { ciScore: result.score, ciGenerated: false } };
  }

  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, template, "utf-8");
  p.log.success(`CI template written to ${targetPath}`);

  return { success: true, data: { ciScore: result.score, ciGenerated: true, ciPlatform: platform } };
}
