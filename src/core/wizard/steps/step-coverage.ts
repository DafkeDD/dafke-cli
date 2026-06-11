/**
 * Step 8: Test Coverage Deep Analysis
 *
 * Analyzes test coverage, highlights gaps, generates an improvement plan,
 * and sets up mutation testing configuration.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { createAdapterRegistry } from "../../../adapters/adapter-registry.js";
import { TemplateEngine } from "../../scaffold/template-engine.js";
import type { TechStack } from "../../config/config-schema.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

function buildStrykerConfig(techStack: TechStack): string | null {
  if (techStack === "typescript") {
    return JSON.stringify({
      $schema: "https://raw.githubusercontent.com/stryker-mutator/stryker4s/master/core/src/main/resources/stryker-core-schema.json",
      mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.d.ts"],
      testRunner: "vitest",
      reporters: ["html", "clear-text", "progress"],
      coverageAnalysis: "perTest",
    }, null, 2);
  }
  if (techStack === "java") {
    const engine = new TemplateEngine();
    return engine.getTemplate("coverage/pit-snippet.xml");
  }
  if (techStack === "python") {
    return [
      "# mutmut configuration — merge into pyproject.toml",
      "[tool.mutmut]",
      'paths_to_mutate = "src/"',
      'runner = "pytest -x -q"',
      'tests_dir = "tests/"',
      "",
    ].join("\n");
  }
  return null;
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const techStack = (ctx.answers["techStack"] as TechStack) ?? "unknown";
  const registry = createAdapterRegistry();
  const adapter = registry.get(techStack);

  const s = p.spinner();
  s.start("Analyzing test coverage...");

  let coveragePct: number | null = null;

  if (adapter) {
    const covConfig = adapter.getCoverageConfig();
    try {
      // Split command into executable + args for cross-platform safety (no shell)
      const parts = covConfig.command.split(/\s+/);
      await execa(parts[0] ?? "", parts.slice(1), { cwd: ctx.repoRoot, timeout: 120_000 });
      // Try to parse coverage report for a summary
      const { readFile: rf } = await import("node:fs/promises");
      const reportPath = join(ctx.repoRoot, covConfig.reportPath);
      const report = await rf(reportPath, "utf-8").catch(() => null);
      if (report) {
        const match = report.match(/line-rate="([\d.]+)"/);
        if (match?.[1]) coveragePct = Math.round(parseFloat(match[1]) * 100);
      }
    } catch {
      // Coverage run failed; continue with null
    }
  }

  s.stop("Coverage analysis complete");

  if (coveragePct !== null) {
    const color = coveragePct >= 80 ? chalk.green : coveragePct >= 50 ? chalk.yellow : chalk.red;
    p.log.info(`Line coverage: ${color(`${coveragePct}%`)}`);
  } else {
    p.log.warn("Could not determine coverage. Run tests manually to generate a report.");
  }

  // Mutation testing setup
  const mutConfig = buildStrykerConfig(techStack);
  const mutFilename =
    techStack === "typescript" ? "stryker.config.json"
    : techStack === "python" ? "mutmut-snippet.toml"
    : "pit-config-snippet.xml";
  if (mutConfig) {
    p.log.info("Mutation testing configuration available for your stack.");

    if (!ctx.nonInteractive) {
      const setupMut = await p.confirm({ message: "Set up mutation testing?" });
      if (!p.isCancel(setupMut) && setupMut) {
        const mutPath = join(ctx.repoRoot, mutFilename);
        await writeFile(mutPath, mutConfig, "utf-8");
        p.log.success(`Mutation testing config written to ${mutPath}`);
      }
    } else {
      const mutPath = join(ctx.repoRoot, mutFilename);
      await writeFile(mutPath, mutConfig, "utf-8");
      p.log.success(`Mutation testing config written to ${mutPath}`);
    }
  }

  return {
    success: true,
    data: { coveragePct, techStack, mutationTestingConfigured: !!mutConfig },
  };
}
