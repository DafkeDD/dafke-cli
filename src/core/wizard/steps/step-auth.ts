/**
 * Step 1: Authentication & Provider Configuration
 *
 * Prompts the user to select which integration providers to configure,
 * collects credentials, tests each connection, and saves to global config.
 */

import * as p from "@clack/prompts";
import { ConfigManager } from "../../config/config-manager.js";
import { AzureDevOpsClient } from "../../../integrations/azure-devops/client.js";
import { GitHubClient } from "../../../integrations/github/client.js";
import { JiraClient } from "../../../integrations/jira/client.js";
import { ConfluenceClient } from "../../../integrations/confluence/client.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

const PROVIDERS = [
  { value: "azureDevOps", label: "Azure DevOps", hint: "PAT + org URL" },
  { value: "github", label: "GitHub", hint: "Personal access token" },
  { value: "jira", label: "Jira", hint: "Email + API token" },
  { value: "confluence", label: "Confluence", hint: "Email + API token" },
  { value: "sonarqube", label: "SonarQube", hint: "Token + server URL" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["value"];

async function promptAzureDevOps(): Promise<Record<string, string> | null> {
  const orgUrl = await p.text({ message: "Azure DevOps organization URL:", placeholder: "https://dev.azure.com/your-org" });
  if (p.isCancel(orgUrl)) return null;
  const pat = await p.password({ message: "Azure DevOps PAT:" });
  if (p.isCancel(pat)) return null;
  return { orgUrl: orgUrl as string, pat: pat as string };
}

async function promptGitHub(): Promise<Record<string, string> | null> {
  const token = await p.password({ message: "GitHub personal access token:" });
  if (p.isCancel(token)) return null;
  return { token: token as string };
}

async function promptJira(): Promise<Record<string, string> | null> {
  const siteUrl = await p.text({ message: "Jira site URL:", placeholder: "https://your-domain.atlassian.net" });
  if (p.isCancel(siteUrl)) return null;
  const email = await p.text({ message: "Jira email:" });
  if (p.isCancel(email)) return null;
  const apiToken = await p.password({ message: "Jira API token:" });
  if (p.isCancel(apiToken)) return null;
  return { siteUrl: siteUrl as string, email: email as string, apiToken: apiToken as string };
}

async function promptConfluence(): Promise<Record<string, string> | null> {
  const siteUrl = await p.text({ message: "Confluence site URL:", placeholder: "https://your-domain.atlassian.net" });
  if (p.isCancel(siteUrl)) return null;
  const email = await p.text({ message: "Confluence email:" });
  if (p.isCancel(email)) return null;
  const apiToken = await p.password({ message: "Confluence API token:" });
  if (p.isCancel(apiToken)) return null;
  return { siteUrl: siteUrl as string, email: email as string, apiToken: apiToken as string };
}

async function promptSonarQube(): Promise<Record<string, string> | null> {
  const serverUrl = await p.text({ message: "SonarQube server URL:", placeholder: "https://sonarqube.example.com" });
  if (p.isCancel(serverUrl)) return null;
  const token = await p.password({ message: "SonarQube token:" });
  if (p.isCancel(token)) return null;
  return { serverUrl: serverUrl as string, token: token as string };
}

async function testProvider(id: ProviderId, creds: Record<string, string>): Promise<boolean> {
  try {
    switch (id) {
      case "azureDevOps": return await new AzureDevOpsClient({ organizationUrl: creds["orgUrl"] ?? "", pat: creds["pat"] ?? "" }).testConnection();
      case "github": return await new GitHubClient({ token: creds["token"] ?? "" }).testConnection();
      case "jira": return await new JiraClient({ baseUrl: creds["siteUrl"] ?? "", email: creds["email"] ?? "", apiToken: creds["apiToken"] ?? "" }).testConnection();
      case "confluence": return await new ConfluenceClient({ baseUrl: creds["siteUrl"] ?? "", email: creds["email"] ?? "", apiToken: creds["apiToken"] ?? "" }).testConnection();
      case "sonarqube": {
        const { SonarQubeClient } = await import("../../../integrations/sonarqube/client.js");
        return await new SonarQubeClient({ baseUrl: creds["serverUrl"] ?? "", token: creds["token"] ?? "" }).testConnection();
      }
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
    options: PROVIDERS.filter((pr) => pr.value === "github").map((pr) => ({ value: pr.value, label: pr.label, hint: pr.hint })),
    required: false,
  });

  if (p.isCancel(selected)) {
    return { success: false, message: "Cancelled by user" };
  }

  const configManager = new ConfigManager();
  const globalConfig = await configManager.loadGlobalConfig();
  const configured: string[] = [];

  for (const id of selected as ProviderId[]) {
    const promptFn = { azureDevOps: promptAzureDevOps, github: promptGitHub, jira: promptJira, confluence: promptConfluence, sonarqube: promptSonarQube }[id];
    const creds = await promptFn();
    if (!creds) { p.log.warn(`Skipped ${id}`); continue; }

    const s = p.spinner();
    s.start(`Testing ${id} connection...`);
    const ok = await testProvider(id, creds);

    if (ok) {
      s.stop(`${id}: connected`);
      // Save credentials to global config
      if (id === "azureDevOps") globalConfig.auth.azureDevOps = { pat: creds["pat"], orgUrl: creds["orgUrl"] };
      else if (id === "github") globalConfig.auth.github = { token: creds["token"] };
      else if (id === "jira") globalConfig.auth.jira = { email: creds["email"], apiToken: creds["apiToken"], siteUrl: creds["siteUrl"] };
      else if (id === "confluence") globalConfig.auth.confluence = { email: creds["email"], apiToken: creds["apiToken"], siteUrl: creds["siteUrl"] };
      else if (id === "sonarqube") globalConfig.auth.sonarqube = { token: creds["token"], serverUrl: creds["serverUrl"] };
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
