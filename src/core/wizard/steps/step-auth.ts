/**
 * Step 1: Authentication & Provider Configuration
 *
 * Prompts the user to configure GitHub, tests the connection, and saves to
 * global config. Dafke is GitHub-only.
 */

import * as p from "@clack/prompts";
import { ConfigManager } from "../../config/config-manager.js";
import { GitHubClient } from "../../../integrations/github/client.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

const PROVIDERS = [
  { value: "github", label: "GitHub", hint: "Personal access token" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["value"];

async function promptGitHub(): Promise<Record<string, string> | null> {
  const token = await p.password({ message: "GitHub personal access token:" });
  if (p.isCancel(token)) return null;
  return { token: token as string };
}

async function testProvider(id: ProviderId, creds: Record<string, string>): Promise<boolean> {
  try {
    switch (id) {
      case "github":
        return await new GitHubClient({ token: creds["token"] ?? "" }).testConnection();
    }
  } catch {
    return false;
  }
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  p.intro("Welcome to Dafke AI Control Center");

  if (ctx.nonInteractive) {
    p.log.info("Non-interactive mode: skipping auth prompts. Configure later with dafke connect.");
    return { success: true, data: { providers: [] } };
  }

  const selected = await p.multiselect({
    message: "Which providers do you want to configure?",
    options: PROVIDERS.map((pr) => ({ value: pr.value, label: pr.label, hint: pr.hint })),
    required: false,
  });

  if (p.isCancel(selected)) {
    return { success: false, message: "Cancelled by user" };
  }

  const configManager = new ConfigManager();
  const globalConfig = await configManager.loadGlobalConfig();
  const configured: string[] = [];

  for (const id of selected as ProviderId[]) {
    const promptFn = { github: promptGitHub }[id];
    const creds = await promptFn();
    if (!creds) {
      p.log.warn(`Skipped ${id}`);
      continue;
    }

    const s = p.spinner();
    s.start(`Testing ${id} connection...`);
    const ok = await testProvider(id, creds);

    if (ok) {
      s.stop(`${id}: connected`);
      if (id === "github") globalConfig.auth.github = { token: creds["token"] };
      configured.push(id);
    } else {
      s.stop(`${id}: connection failed`);
      p.log.error(`Could not connect to ${id}. Check your credentials and try again later.`);
    }
  }

  await configManager.saveGlobalConfig(globalConfig);
  p.log.success(`Configured ${configured.length} provider(s): ${configured.join(", ") || "none"}`);

  return { success: true, data: { providers: configured } };
}
