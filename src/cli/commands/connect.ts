import { defineCommand } from "citty";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { ConfigManager } from "../../core/config/config-manager.js";
import { AzureDevOpsClient } from "../../integrations/azure-devops/client.js";
import { GitHubClient } from "../../integrations/github/client.js";
import { JiraClient } from "../../integrations/jira/client.js";
import { ConfluenceClient } from "../../integrations/confluence/client.js";
import type { GlobalConfig } from "../../core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Connection setup flows
// ---------------------------------------------------------------------------

async function connectAzureDevOps(config: GlobalConfig, configManager: ConfigManager): Promise<void> {
  p.intro("Connect to Azure DevOps");

  const orgUrl = await p.text({
    message: "Organization URL",
    placeholder: "https://github.com/your-org",
    defaultValue: "https://github.com/your-org",
    validate: (value) => {
      if (!value) return "Organization URL is required";
      try { new URL(value); } catch { return "Invalid URL"; }
      return undefined;
    },
  });
  if (p.isCancel(orgUrl)) return;

  const pat = await p.password({
    message: "Personal Access Token (PAT)",
    validate: (value) => value ? undefined : "PAT is required",
  });
  if (p.isCancel(pat)) return;

  const s = p.spinner();
  s.start("Testing connection...");

  const client = new AzureDevOpsClient({ organizationUrl: orgUrl, pat });
  const connected = await client.testConnection();
  s.stop(connected ? "Connection successful" : "Connection failed");

  if (!connected) {
    p.log.error("Could not connect to Azure DevOps. Check your URL and PAT.");
    return;
  }

  config.auth = {
    ...config.auth,
    azureDevOps: { orgUrl, pat },
  };
  await configManager.saveGlobalConfig(config);

  p.log.success("Azure DevOps credentials saved.");
  p.outro("Azure DevOps connected!");
}

async function connectGitHub(config: GlobalConfig, configManager: ConfigManager): Promise<void> {
  p.intro("Connect to GitHub");

  const token = await p.password({
    message: "GitHub Personal Access Token",
    validate: (value) => value ? undefined : "Token is required",
  });
  if (p.isCancel(token)) return;

  const s = p.spinner();
  s.start("Testing connection...");

  const client = new GitHubClient({ token });
  const connected = await client.testConnection();
  s.stop(connected ? "Connection successful" : "Connection failed");

  if (!connected) {
    p.log.error("Could not connect to GitHub. Check your token.");
    return;
  }

  config.auth = {
    ...config.auth,
    github: { token },
  };
  await configManager.saveGlobalConfig(config);

  p.log.success("GitHub credentials saved.");
  p.outro("GitHub connected!");
}

async function connectJira(config: GlobalConfig, configManager: ConfigManager): Promise<void> {
  p.intro("Connect to Jira");

  const siteUrl = await p.text({
    message: "Jira site URL",
    placeholder: "https://dafke.atlassian.net",
    defaultValue: "https://dafke.atlassian.net",
    validate: (value) => {
      if (!value) return "Site URL is required";
      try { new URL(value); } catch { return "Invalid URL"; }
      return undefined;
    },
  });
  if (p.isCancel(siteUrl)) return;

  const email = await p.text({
    message: "Email address",
    validate: (value) => value?.includes("@") ? undefined : "Valid email is required",
  });
  if (p.isCancel(email)) return;

  const apiToken = await p.password({
    message: "API Token",
    validate: (value) => value ? undefined : "API token is required",
  });
  if (p.isCancel(apiToken)) return;

  const s = p.spinner();
  s.start("Testing connection...");

  const client = new JiraClient({ baseUrl: siteUrl, email, apiToken });
  const connected = await client.testConnection();
  s.stop(connected ? "Connection successful" : "Connection failed");

  if (!connected) {
    p.log.error("Could not connect to Jira. Check your credentials.");
    return;
  }

  config.auth = {
    ...config.auth,
    jira: { siteUrl, email, apiToken },
  };
  await configManager.saveGlobalConfig(config);

  p.log.success("Jira credentials saved.");
  p.outro("Jira connected!");
}

async function connectConfluence(config: GlobalConfig, configManager: ConfigManager): Promise<void> {
  p.intro("Connect to Confluence");

  const siteUrl = await p.text({
    message: "Confluence site URL",
    placeholder: "https://dafke.atlassian.net",
    defaultValue: "https://dafke.atlassian.net",
    validate: (value) => {
      if (!value) return "Site URL is required";
      try { new URL(value); } catch { return "Invalid URL"; }
      return undefined;
    },
  });
  if (p.isCancel(siteUrl)) return;

  const email = await p.text({
    message: "Email address",
    validate: (value) => value?.includes("@") ? undefined : "Valid email is required",
  });
  if (p.isCancel(email)) return;

  const apiToken = await p.password({
    message: "API Token",
    validate: (value) => value ? undefined : "API token is required",
  });
  if (p.isCancel(apiToken)) return;

  const s = p.spinner();
  s.start("Testing connection...");

  const client = new ConfluenceClient({ baseUrl: siteUrl, email, apiToken });
  const connected = await client.testConnection();
  s.stop(connected ? "Connection successful" : "Connection failed");

  if (!connected) {
    p.log.error("Could not connect to Confluence. Check your credentials.");
    return;
  }

  config.auth = {
    ...config.auth,
    confluence: { siteUrl, email, apiToken },
  };
  await configManager.saveGlobalConfig(config);

  p.log.success("Confluence credentials saved.");
  p.outro("Confluence connected!");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const SERVICES = ["azure-devops", "github", "jira", "confluence"] as const;
type Service = typeof SERVICES[number];

export default defineCommand({
  meta: {
    name: "connect",
    description: "Setup external connections",
  },
  args: {
    service: {
      type: "string",
      description:
        "Service to connect (azure-devops, github, jira, confluence)",
    },
  },
  async run({ args }) {
    const configManager = new ConfigManager();
    const config = await configManager.loadGlobalConfig();

    let service = args.service as string | undefined;

    if (!service || !SERVICES.includes(service as Service)) {
      // Interactive selection
      const selected = await p.select({
        message: "Which service do you want to connect?",
        options: [
          { value: "github", label: "GitHub", hint: "Repos, actions, PRs" },
        ],
      });

      if (p.isCancel(selected)) return;
      service = selected as string;
    }

    switch (service) {
      case "azure-devops":
        await connectAzureDevOps(config, configManager);
        break;
      case "github":
        await connectGitHub(config, configManager);
        break;
      case "jira":
        await connectJira(config, configManager);
        break;
      case "confluence":
        await connectConfluence(config, configManager);
        break;
      default:
        console.log(chalk.red(`  Unknown service: ${service}`));
        console.log(chalk.dim(`  Available: ${SERVICES.join(", ")}`));
    }
  },
});
