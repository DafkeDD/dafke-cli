/**
 * Step 5: .claude/rules/ Generation
 *
 * Generates tech-stack-specific instruction files in .claude/rules/.
 * Global rules (architecture, git-conventions, mcp-tools) are always created.
 * Tech-specific rules use `globs:` frontmatter for on-demand loading.
 */

import * as p from "@clack/prompts";
import { createAdapterRegistry } from "../../../adapters/adapter-registry.js";
import { generateRules, getRuleTemplateNames } from "../../scaffold/rules-generator.js";
import type { TechStack } from "../../config/config-schema.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const techStack = (ctx.answers["techStack"] as TechStack) ?? "unknown";

  // Get adapter-specific template names (if adapter supports it)
  let adapterTemplates: string[] = [];

  if (techStack !== "unknown") {
    try {
      const registry = createAdapterRegistry();
      const adapter = registry.get(techStack);

      if (adapter?.getInstructionTemplates) {
        adapterTemplates = adapter.getInstructionTemplates();
      }
    } catch {
      // Adapter not available — fall back to global-only rules
      if (ctx.verbose) {
        p.log.warn(`No adapter found for ${techStack}, generating global rules only`);
      }
    }
  }

  const templateNames = getRuleTemplateNames(adapterTemplates);

  p.log.info(`Generating ${templateNames.length} rule files for .claude/rules/`);

  const result = await generateRules(ctx.repoRoot, templateNames);

  // Report results
  if (result.created.length > 0) {
    p.log.success(`Created: ${result.created.join(", ")}`);
  }

  if (result.skipped.length > 0) {
    p.log.info(`Preserved (user-modified): ${result.skipped.join(", ")}`);
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      p.log.warn(`Warning: ${error}`);
    }
  }

  return {
    success: true,
    data: {
      rulesGenerated: result.created,
      rulesSkipped: result.skipped,
    },
    message: `${result.created.length} rule files generated`,
  };
}
