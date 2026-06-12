/**
 * Step 10: Project Board Connection
 *
 * Dafke is GitHub-only and uses GitHub Issues as the backlog, so there is no
 * separate project-board connection. Kept as a no-op for wizard step ordering.
 */

import * as p from "@clack/prompts";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

export async function execute(_ctx: WizardStepContext): Promise<WizardStepResult> {
  p.log.info("GitHub Issues are used as the project board — no separate connection needed.");
  return { success: true, data: { boardConnected: false } };
}
