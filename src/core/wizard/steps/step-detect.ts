/**
 * Step 2: Repository Detection
 *
 * Runs all technology adapters in parallel to detect the tech stack,
 * shows results with confidence scores, and lets the user confirm or override.
 */

import * as p from "@clack/prompts";
import { createAdapterRegistry } from "../../../adapters/adapter-registry.js";
import { isClaudeAvailable } from "../../../utils/claude-cli.js";
import { checkPrerequisites, installTool } from "../../../utils/prerequisites.js";
import type { TechStack } from "../../config/config-schema.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

const TECH_LABELS: Record<TechStack, string> = {
  java: "Java (Maven/Gradle)",
  dotnet: ".NET (C#/F#)",
  typescript: "TypeScript / Node.js",
  python: "Python (Poetry/pip)",
  delphi: "Delphi / Object Pascal",
  foxpro: "Visual FoxPro",
  unknown: "Unknown / Other",
};

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const registry = createAdapterRegistry();
  const adapters = registry.getAll();

  const s = p.spinner();
  s.start("Scanning repository for tech stack...");

  const results = await Promise.all(
    adapters.map(async (adapter) => ({
      adapter,
      result: await adapter.detect(ctx.repoRoot),
    })),
  );

  const detected = results
    .filter((r) => r.result.detected)
    .sort((a, b) => b.result.confidence - a.result.confidence);

  s.stop("Scan complete");

  if (detected.length === 0) {
    p.log.warn("No tech stack detected automatically.");
  } else {
    for (const d of detected) {
      const pct = Math.round(d.result.confidence * 100);
      p.log.info(`${TECH_LABELS[d.adapter.name] ?? d.adapter.name}: ${pct}% confidence`);
      if (d.result.indicators.length > 0) {
        p.log.message(`  Indicators: ${d.result.indicators.join(", ")}`);
      }
    }
  }

  const bestMatch = detected[0]?.adapter.name ?? "unknown";

  // Check Claude Code availability for smart features
  const claudeAvailable = await isClaudeAvailable();
  if (claudeAvailable) {
    p.log.info("Claude Code detected \u2014 smart features enabled");
  } else {
    p.log.info("Claude Code not detected \u2014 some features will use fallback mode");
    p.log.message("  Install for best experience: https://claude.ai/claude-code");
  }

  // Check prerequisites
  const providers = ctx.answers["providers"] as string[] | undefined;
  const prereqs = await checkPrerequisites(providers);

  const required = prereqs.filter((r) => r.category === "required" && !r.installed);
  const recommended = prereqs.filter((r) => r.category === "recommended" && !r.installed);

  if (prereqs.some((r) => r.installed)) {
    p.log.message("");
    p.log.message("Prerequisites:");
    for (const r of prereqs) {
      if (r.installed) {
        p.log.message(`  \u2713 ${r.name}${r.version ? ` ${r.version}` : ""}`);
      }
    }
  }

  if (recommended.length > 0) {
    p.log.message("");
    p.log.warn("Missing recommended tools:");
    for (const r of recommended) {
      p.log.message(`  \u2717 ${r.name} \u2014 ${r.installHint}`);
      ctx.degradedFeatures?.push({ feature: r.name, reason: `Not installed. ${r.installHint}` });
    }
  }

  // Offer to auto-install the tools we have a reliable installer for.
  const installable = recommended.filter((r) => r.name === "gitleaks" || r.name === "lefthook");
  if (installable.length > 0 && !ctx.nonInteractive) {
    const doInstall = await p.confirm({
      message: `Install missing recommended tool(s) now? (${installable.map((r) => r.name).join(", ")})`,
      initialValue: true,
    });
    if (!p.isCancel(doInstall) && doInstall) {
      for (const r of installable) {
        p.log.step(`Installing ${r.name}...`);
        const res = await installTool(r.name);
        if (res.ok) p.log.success(`${r.name}: ${res.message}`);
        else p.log.warn(`${r.name}: ${res.message}`);
      }
    }
  }

  if (required.length > 0) {
    p.log.message("");
    p.log.error("Missing required tools:");
    for (const r of required) {
      p.log.message(`  \u2717 ${r.name} \u2014 ${r.installHint}`);
    }
    return { success: false, message: "Required tools missing. Install them and re-run." };
  }

  if (ctx.nonInteractive) {
    p.log.info(`Auto-selected: ${TECH_LABELS[bestMatch] ?? bestMatch}`);
    return { success: true, data: { techStack: bestMatch } };
  }

  const confirmed = await p.select({
    message: "Confirm detected tech stack (or override):",
    options: [
      { value: "typescript", label: "TypeScript / Node.js", hint: "recommended" },
      { value: "unknown", label: "Other / Skip" },
    ],
  });

  if (p.isCancel(confirmed)) {
    return { success: false, message: "Cancelled by user" };
  }

  p.log.success(`Tech stack: ${TECH_LABELS[confirmed as TechStack] ?? confirmed}`);

  return { success: true, data: { techStack: confirmed } };
}
