/**
 * Step 9: Architecture Documentation
 *
 * Runs a quick GitNexus index for the knowledge graph, then suggests
 * running `dafke docs` for comprehensive architecture docs.
 * Heavy documentation generation is NOT on the init critical path.
 */

import * as p from "@clack/prompts";
import { execa } from "execa";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const s = p.spinner();
  s.start("Running architecture analysis...");

  // Quick GitNexus index for knowledge graph (used by MCP and hooks)
  let indexed = false;
  try {
    await execa("npx", ["-y", "gitnexus", "analyze"], { cwd: ctx.repoRoot, timeout: 120_000 });
    indexed = true;
  } catch {
    // GitNexus not available — not critical
  }

  s.stop("Analysis complete");

  if (indexed) {
    p.log.info("GitNexus knowledge graph indexed");
  } else {
    p.log.message("  GitNexus not available — install with: npx gitnexus analyze");
  }

  p.log.info("For comprehensive architecture documentation, run:");
  p.log.message("  dafke docs");
  p.log.message("  or use /dafke-arch in Claude Code");

  return { success: true, data: { archDocGenerated: false, gitnexusIndexed: indexed } };
}
