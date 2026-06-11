/**
 * Step 10: Jira / Azure DevOps Connection
 *
 * Configures project board mapping, tests reading backlog items,
 * and sets up bidirectional PR linking.
 */

import * as p from "@clack/prompts";
import { ConfigManager } from "../../config/config-manager.js";
import { AzureDevOpsClient } from "../../../integrations/azure-devops/client.js";
import { JiraClient } from "../../../integrations/jira/client.js";
import { extractOrgFromUrl } from "../../../utils/ado-helpers.js";
import type { WizardStepContext, WizardStepResult } from "../wizard-steps.js";

function isValidProjectKey(key: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(key);
}

export async function execute(ctx: WizardStepContext): Promise<WizardStepResult> {
  const configManager = new ConfigManager();
  const globalConfig = await configManager.loadGlobalConfig();
  const hasAzure = !!globalConfig.auth.azureDevOps?.pat;
  const hasJira = !!globalConfig.auth.jira?.apiToken;

  if (!hasAzure && !hasJira) {
    p.log.warn("No project board providers configured. Skipping connection setup.");
    p.log.info("Run `dafke init --resume` or `dafke connect` to configure Azure DevOps or Jira.");
    return { success: true, data: { boardConnected: false } };
  }

  if (ctx.nonInteractive) {
    p.log.info("Non-interactive mode: skipping board connection prompts.");
    return { success: true, data: { boardConnected: false } };
  }

  // Choose provider
  const boardOptions: Array<{ value: string; label: string }> = [];
  boardOptions.push({ value: "skip", label: "Skip this step" });

  const board = await p.select({ message: "Connect to project board:", options: boardOptions });
  if (p.isCancel(board) || board === "skip") {
    return { success: true, data: { boardConnected: false } };
  }

  if (board === "azure-devops" && globalConfig.auth.azureDevOps) {
    const project = await p.text({ message: "Azure DevOps project name:" });
    if (p.isCancel(project)) return { success: true, data: { boardConnected: false } };

    const s = p.spinner();
    s.start("Testing Azure DevOps connection...");
    try {
      const client = new AzureDevOpsClient({
        organizationUrl: globalConfig.auth.azureDevOps.orgUrl ?? "",
        pat: globalConfig.auth.azureDevOps.pat ?? "",
      });
      const items = await client.queryWorkItems(
        project as string,
        "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'New' ORDER BY [System.CreatedDate] DESC",
      );
      s.stop(`Connected! Found ${items.workItems.length} backlog items.`);
      p.log.success("Azure DevOps board linked successfully");

      // Persist backlog provider to manifest (best-effort)
      try {
        const manifest = await configManager.loadManifest(ctx.repoRoot);
        if (manifest) {
          const org = extractOrgFromUrl(globalConfig.auth.azureDevOps.orgUrl ?? "");
          manifest.backlogProvider = {
            type: "azure-devops" as const,
            project: project as string,
            ...(org ? { organization: org } : {}),
          };
          await configManager.saveManifest(manifest, ctx.repoRoot);
        }
      } catch {
        p.log.warn("Could not save backlog provider to manifest.");
      }

      return { success: true, data: { boardConnected: true, boardProvider: "azure-devops", project } };
    } catch (error) {
      s.stop("Connection failed");
      p.log.error(error instanceof Error ? error.message : String(error));
      return { success: true, data: { boardConnected: false } };
    }
  }

  if (board === "jira" && globalConfig.auth.jira) {
    const projectKey = await p.text({ message: "Jira project key:", placeholder: "PROJ" });
    if (p.isCancel(projectKey)) return { success: true, data: { boardConnected: false } };

    if (!isValidProjectKey(projectKey as string)) {
      p.log.warn(`Invalid project key: ${projectKey as string}. Must start with a letter and contain only letters, digits, hyphens, or underscores.`);
      return { success: true, data: { boardConnected: false } };
    }

    const s = p.spinner();
    s.start("Testing Jira connection...");
    try {
      const client = new JiraClient({
        baseUrl: globalConfig.auth.jira.siteUrl ?? "",
        email: globalConfig.auth.jira.email ?? "",
        apiToken: globalConfig.auth.jira.apiToken ?? "",
      });
      const result = await client.searchIssues(`project = ${projectKey} ORDER BY created DESC`);
      s.stop(`Connected! Found ${result.total} issues.`);
      p.log.success("Jira board linked successfully");

      // Persist backlog provider to manifest (best-effort)
      try {
        const manifest = await configManager.loadManifest(ctx.repoRoot);
        if (manifest) {
          manifest.backlogProvider = {
            type: "jira" as const,
            project: projectKey as string,
          };
          await configManager.saveManifest(manifest, ctx.repoRoot);
        }
      } catch {
        p.log.warn("Could not save backlog provider to manifest.");
      }

      return { success: true, data: { boardConnected: true, boardProvider: "jira", projectKey } };
    } catch (error) {
      s.stop("Connection failed");
      p.log.error(error instanceof Error ? error.message : String(error));
      return { success: true, data: { boardConnected: false } };
    }
  }

  return { success: true, data: { boardConnected: false } };
}
