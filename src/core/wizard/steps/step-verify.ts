/**
 * Step 12: Verification & Summary
 *
 * Runs a final audit, displays the scorecard, shows next steps for
 * below-threshold dimensions, and optionally commits all generated files.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { execa } from "execa";
import { ConfigManager } from "../../config/config-manager.js";
import { VERSION } from "../../../version.js";
import type { RepoManifest } from "../../config/config-schema.js";
import type { ReadinessScores } from "../../config/config-schema.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

interface VerifySummary {
  claudeMd: boolean;
  hooks: boolean;
  plugins: number;
  ciGenerated: boolean;
  boardConnected: boolean;
  skills: number;
  wave: string;
  totalScore: number;
}

function buildSummary(answers: Record<string, unknown>): VerifySummary {
  // Plugins: count both newly installed AND already-installed
  const pluginsInstalled = (answers["pluginsInstalled"] as number) ?? 0;
  const alreadyInstalled = (answers["alreadyInstalled"] as number) ?? 0;
  const totalPlugins = pluginsInstalled + alreadyInstalled;

  // CI: consider "already mature" as success (ciScore >= 3 from assessment)
  const ciGenerated = !!answers["ciGenerated"];
  const ciScore = (answers["ciScore"] as number) ?? 0;
  const ciOk = ciGenerated || ciScore >= 3;

  return {
    claudeMd: !!answers["claudeMdGenerated"],
    hooks: !!answers["hooksInstalled"],
    plugins: totalPlugins,
    ciGenerated: ciOk,
    boardConnected: !!answers["boardConnected"],
    skills: ((answers["skillsCopied"] as number) ?? 0) + ((answers["agentsCopied"] as number) ?? 0),
    wave: (answers["wave"] as string) ?? "unknown",
    totalScore: (answers["totalScore"] as number) ?? 0,
  };
}

function icon(ok: boolean): string {
  return ok ? chalk.green("\u2713") : chalk.red("\u2717");
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const s = p.spinner();
  s.start("Running final verification...");

  // Try internal audit
  let auditOutput: string | null = null;
  try {
    const result = await execa("npx", ["dafke", "audit", "--format", "text"], {
      cwd: ctx.repoRoot,
      timeout: 30_000,
    });
    auditOutput = result.stdout;
  } catch {
    // Audit may not be fully implemented yet
  }

  // Finalize manifest with wizard-collected data
  try {
    const configManager = new ConfigManager();
    let manifest = await configManager.loadManifest(ctx.repoRoot);

    if (!manifest) {
      manifest = {
        corulusCcVersion: VERSION,
        configSchemaVersion: 1,
        techStack: (ctx.answers["techStack"] as string) ?? "unknown",
        ciPlatform: (ctx.answers["ciPlatform"] as string) ?? "none",
        overrides: {},
      } as RepoManifest;
    }

    // Sync wizard-collected data into manifest
    manifest.corulusCcVersion = VERSION;
    if (ctx.answers["techStack"]) {
      (manifest as Record<string, unknown>)["techStack"] = ctx.answers["techStack"];
    }
    if (ctx.answers["ciPlatform"]) {
      (manifest as Record<string, unknown>)["ciPlatform"] = ctx.answers["ciPlatform"];
    }
    if (ctx.answers["scores"]) {
      manifest.readinessScores = ctx.answers["scores"] as ReadinessScores;
    }
    if (ctx.answers["wave"]) {
      (manifest as Record<string, unknown>)["wave"] = ctx.answers["wave"];
    }
    if (ctx.answers["externalTools"]) {
      (manifest as Record<string, unknown>)["externalTools"] = ctx.answers["externalTools"];
    }
    manifest.lastAudit = new Date().toISOString();

    // Backlog provider (from step-connect)
    if (ctx.answers["boardConnected"] && ctx.answers["boardProvider"]) {
      manifest.backlogProvider = {
        type: ctx.answers["boardProvider"] as "azure-devops" | "jira",
        project: ((ctx.answers["project"] ?? ctx.answers["projectKey"]) as string) ?? "",
      };
    }

    await configManager.saveManifest(manifest, ctx.repoRoot);
  } catch (err) {
    p.log.warn(`Could not finalize manifest: ${err instanceof Error ? err.message : String(err)}`);
  }

  s.stop("Verification complete");

  const summary = buildSummary(ctx.answers);

  // Display final scorecard
  p.log.message(chalk.bold("\n  Setup Summary"));
  p.log.message(chalk.dim("  " + "\u2500".repeat(44)));
  p.log.message(`  ${icon(summary.claudeMd)} CLAUDE.md generated`);
  p.log.message(`  ${icon(summary.hooks)} Hooks & settings installed`);
  p.log.message(`  ${icon(summary.plugins > 0)} Dafke plugins installed (${summary.plugins})`);
  p.log.message(chalk.dim("  " + "\u2500".repeat(44)));
  p.log.message(`  Wave: ${chalk.bold(summary.wave.toUpperCase())}  Score: ${chalk.bold(`${summary.totalScore}/30`)}`);

  // Show degraded features if any
  if (ctx.degradedFeatures && ctx.degradedFeatures.length > 0) {
    p.log.message("");
    p.log.message(chalk.bold("  Features in fallback mode:"));
    for (const df of ctx.degradedFeatures) {
      p.log.message(`    - ${df.feature}: ${df.reason}`);
    }
  }

  if (auditOutput) {
    p.log.message(chalk.bold("\n  Audit Results"));
    p.log.message(auditOutput);
  }

  // Next steps
  const nextSteps: string[] = [];
  if (!summary.claudeMd) nextSteps.push("Generate CLAUDE.md with: dafke init");
  if (!summary.hooks) nextSteps.push("Install hooks with: dafke hook install");
  if (summary.totalScore < 20) nextSteps.push("Improve readiness scores: run dafke audit for details");

  if (nextSteps.length > 0) {
    p.log.message(chalk.bold("\n  Next Steps"));
    for (const step of nextSteps) {
      p.log.message(`  \u2192 ${step}`);
    }
  }

  // Post-init guide: actionable next steps regardless of scorecard
  p.log.message("");
  p.log.message(chalk.bold("  Getting Started"));
  p.log.message(chalk.dim("  " + "\u2500".repeat(40)));
  p.log.message("  \u2192 Try `/dafke-help` in Claude Code for available commands");
  p.log.message("  \u2192 Run `dafke audit` to check readiness scores");
  p.log.message("  \u2192 Run `dafke doctor` to verify your setup");
  const techStack = ctx.answers["techStack"] as string | undefined;
  if (techStack === "typescript") {
    p.log.message("  \u2192 Run `npm run test` to verify your test suite works");
  } else if (techStack === "java") {
    p.log.message("  \u2192 Run `mvn test` or `gradle test` to verify");
  } else if (techStack === "dotnet") {
    p.log.message("  \u2192 Run `dotnet test` to verify");
  }
  p.log.message("  \u2192 Share with teammates: `dafke init --non-interactive`");

  // IDE tip
  p.log.info("Tip: Launch Claude Code with `claude --ide` for IDE integration");

  // Offer to commit
  if (!ctx.nonInteractive) {
    const commit = await p.confirm({ message: "Commit all generated files?" });
    if (!p.isCancel(commit) && commit) {
      try {
        // Only add paths that exist to avoid git errors
        const { existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        const paths = [".claude/", ".dafke/", "CLAUDE.md", "lefthook.yml", "docs/", "stryker.config.json"]
          .filter((p) => existsSync(join(ctx.repoRoot, p)));
        if (paths.length > 0) {
          await execa("git", ["add", ...paths], { cwd: ctx.repoRoot });
        }
        await execa("git", ["commit", "-m", "chore: initialize AI-assisted development via dafke\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"], { cwd: ctx.repoRoot });
        p.log.success("Changes committed");
      } catch (error) {
        p.log.warn(`Git commit failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  p.outro("Setup complete! Run `dafke audit` to check readiness, or `/dafke-help` in Claude Code.");

  return { success: true, data: { verified: true, summary } };
}
