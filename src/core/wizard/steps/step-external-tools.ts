/**
 * Step: External Tools Configuration
 *
 * Auto-detects and prompts for external tools (security scanners,
 * documentation hosting, DORA metrics, code review practices) to
 * improve audit scoring accuracy. Saves results to ctx.answers.externalTools.
 */

import * as p from "@clack/prompts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";
import {
  type SecurityCategory,
  SECURITY_UMBRELLA_TOOLS,
} from "../../analyzer/umbrella-tools.js";

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  p.log.info("Detecting external tools for audit accuracy...");

  const externalTools: Record<string, unknown> = {};

  // --- Auto-detect SonarQube project key ---
  const sonarPropsPath = join(ctx.repoRoot, "sonar-project.properties");
  if (existsSync(sonarPropsPath)) {
    try {
      const content = readFileSync(sonarPropsPath, "utf-8");
      const match = content.match(/sonar\.projectKey\s*=\s*(.+)/);
      if (match?.[1]) {
        const projectKey = match[1].trim();
        externalTools["coverage"] = { sonarProjectKey: projectKey };
        p.log.success(`Auto-detected SonarQube project key: ${projectKey}`);
      }
    } catch (err) {
      p.log.warn(`Could not read sonar-project.properties: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Skip prompts in non-interactive mode
  if (ctx.nonInteractive) {
    ctx.answers["externalTools"] = externalTools;
    return { success: true, message: "External tools auto-detected (non-interactive mode)." };
  }

  // --- Security: external scanners ---
  const securityAnswer = await p.select({
    message: "Do you use an external security scanner?",
    options: [
      { value: "none", label: "No — repo-level tools only" },
      { value: "aikido", label: "Aikido", hint: "SAST, secrets, SCA, DAST, SBOM" },
      { value: "fortify", label: "Fortify", hint: "SAST, DAST" },
      { value: "veracode", label: "Veracode", hint: "SAST, SCA, DAST" },
      { value: "checkmarx", label: "Checkmarx", hint: "SAST, SCA, DAST" },
      { value: "other", label: "Other" },
    ],
  });

  if (p.isCancel(securityAnswer)) {
    return { success: true, message: "Skipped external tools configuration." };
  }

  if (securityAnswer !== "none") {
    let toolName = securityAnswer as string;
    if (securityAnswer === "other") {
      const custom = await p.text({ message: "Tool name:" });
      if (p.isCancel(custom)) {
        return { success: true, message: "Skipped external tools configuration." };
      }
      toolName = custom;
    }

    const umbrellaCats = SECURITY_UMBRELLA_TOOLS[toolName.toLowerCase()];
    let selectedCats: readonly SecurityCategory[];

    if (umbrellaCats && umbrellaCats.length > 1) {
      // Umbrella tool: ask which modules are active
      const moduleAnswer = await p.multiselect({
        message: `Which ${toolName} modules are active?`,
        options: [
          ...umbrellaCats.map((cat) => ({
            value: cat,
            label: cat.toUpperCase(),
          })),
          { value: "all" as SecurityCategory, label: "All modules / Not sure", hint: "Select if unsure" },
        ],
        initialValues: ["all" as SecurityCategory],
      });

      if (p.isCancel(moduleAnswer)) {
        return { success: true, message: "Skipped external tools configuration." };
      }

      selectedCats = (moduleAnswer as string[]).includes("all")
        ? umbrellaCats
        : (moduleAnswer as SecurityCategory[]);
    } else {
      // Non-umbrella tool or single-category: default to sast
      selectedCats = umbrellaCats ?? (["sast"] as const);
    }

    externalTools["security"] = selectedCats.map((cat) => ({
      tool: toolName,
      category: cat,
      evidence: `${toolName} (${cat}) configured externally`,
    }));
  }

  // --- Docs: documentation hosting ---
  const docsAnswer = await p.select({
    message: "Where is your documentation hosted?",
    options: [
      { value: "repo", label: "In-repo only (README, docs/)" },
      { value: "other", label: "Other external" },
    ],
  });

  if (p.isCancel(docsAnswer)) {
    return { success: true, message: "Skipped external tools configuration." };
  }

  if (docsAnswer !== "repo") {
    let url: string | undefined;
    const urlAnswer = await p.text({ message: "Documentation URL (optional):", defaultValue: "" });
    if (!p.isCancel(urlAnswer) && urlAnswer) {
      url = urlAnswer;
    }

    const pagesAnswer = await p.multiselect({
      message: "Which documentation categories are maintained externally?",
      options: [
        { value: "architecture", label: "Architecture docs" },
        { value: "api", label: "API docs" },
        { value: "onboarding", label: "Onboarding / Getting started" },
        { value: "contributing", label: "Contributing guide" },
      ],
      required: false,
    });

    if (!p.isCancel(pagesAnswer) && pagesAnswer.length > 0) {
      externalTools["docs"] = [
        { tool: docsAnswer as string, url, pages: pagesAnswer },
      ];
    }
  }

  // --- DORA: deployment tracking ---
  const doraAnswer = await p.select({
    message: "How do you track releases/deployments?",
    options: [
      { value: "git-tags", label: "Git tags (default)" },
      { value: "manual", label: "Manual count (we'll ask how many)" },
    ],
  });

  if (p.isCancel(doraAnswer)) {
    return { success: true, message: "Skipped external tools configuration." };
  }

  if (doraAnswer === "manual") {
    const countAnswer = await p.text({
      message: "How many deployments in the last 90 days?",
      validate: (v: string | undefined) => {
        const n = parseInt(v ?? "", 10);
        if (isNaN(n) || n < 0) return "Enter a non-negative number.";
        return undefined;
      },
    });

    if (!p.isCancel(countAnswer)) {
      const evidenceAnswer = await p.text({
        message: "How are deployments tracked? (e.g., Azure DevOps Release Management)",
        defaultValue: "",
      });

      externalTools["dora"] = {
        deploymentSignal: "manual",
        deploymentsLast90Days: parseInt(String(countAnswer), 10),
        ...((!p.isCancel(evidenceAnswer) && evidenceAnswer) ? { deploymentEvidence: evidenceAnswer } : {}),
      };
    }
  }

  // --- Review: declared practices ---
  const reviewAnswer = await p.confirm({
    message: "Do you have code review practices configured outside the repo (e.g., Azure DevOps branch policies)?",
  });

  if (!p.isCancel(reviewAnswer) && reviewAnswer) {
    const practiceAnswer = await p.text({
      message: "Describe your review practice (e.g., '2 required approvals via Azure DevOps branch policy'):",
    });

    if (!p.isCancel(practiceAnswer) && practiceAnswer) {
      externalTools["review"] = [{ practice: practiceAnswer }];
    }
  }

  ctx.answers["externalTools"] = externalTools;

  const count = Object.keys(externalTools).length;
  if (count > 0) {
    p.log.success(`Configured ${count} external tool category(ies). These will improve audit accuracy.`);
  } else {
    p.log.info("No external tools configured. Audit will use repo-level detection only.");
  }

  return { success: true, message: "External tools configured." };
}
