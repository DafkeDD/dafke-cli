import { defineCommand } from "citty";
import chalk from "chalk";
import { ConfigManager } from "../../core/config/config-manager.js";
import {
  createRepositoryProvider,
  type Repository,
  type RepositoryProviderFactoryConfig,
} from "../../integrations/repository-provider.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function displayReposTable(repos: Repository[]): void {
  if (repos.length === 0) {
    console.log(chalk.dim("  No repositories found."));
    return;
  }

  const header = `${"Name".padEnd(30)} ${"Provider".padEnd(14)} ${"Default Branch".padEnd(16)} ${"Clone URL"}`;
  console.log(chalk.bold(header));
  console.log("─".repeat(90));

  for (const repo of repos) {
    const name = repo.fullName.length > 28 ? repo.fullName.slice(0, 28) + ".." : repo.fullName;
    const provider = repo.provider === "azure-devops" ? chalk.blue("Azure DevOps") : chalk.hex("#6e5494")("GitHub");
    console.log(`${name.padEnd(30)} ${provider.padEnd(14)} ${repo.defaultBranch.padEnd(16)} ${chalk.dim(repo.cloneUrl)}`);
  }

  console.log();
  console.log(chalk.dim(`  Total: ${repos.length} repository(ies)`));
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "repos",
    description: "List accessible repos",
  },
  args: {
    provider: {
      type: "string",
      description: "Provider to list repos from (azure-devops, github, all)",
      default: "all",
    },
    format: {
      type: "string",
      description: "Output format (json, text)",
      default: "text",
    },
  },
  async run({ args }) {
    const configManager = new ConfigManager();
    const globalConfig = await configManager.loadGlobalConfig();
    const provider = args.provider as string;
    const format = args.format as string;

    const allRepos: Repository[] = [];
    const errors: string[] = [];

    // Azure DevOps
    if (provider === "azure-devops" || provider === "all") {
      const azConfig = globalConfig.auth?.azureDevOps;
      if (azConfig?.pat && azConfig?.orgUrl) {
        try {
          const azProvider = createRepositoryProvider({
            type: "azure-devops",
            config: { organizationUrl: azConfig.orgUrl, pat: azConfig.pat },
          } satisfies RepositoryProviderFactoryConfig);
          const repos = await azProvider.listRepositories();
          allRepos.push(...repos);
        } catch (err) {
          errors.push(`Azure DevOps: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (provider === "azure-devops") {
        console.log(chalk.yellow("  Azure DevOps not configured. Run `dafke connect azure-devops` first."));
        return;
      }
    }

    // GitHub
    if (provider === "github" || provider === "all") {
      const ghConfig = globalConfig.auth?.github;
      if (ghConfig?.token) {
        try {
          const ghProvider = createRepositoryProvider({
            type: "github",
            config: { token: ghConfig.token },
          } satisfies RepositoryProviderFactoryConfig);
          const repos = await ghProvider.listRepositories();
          allRepos.push(...repos);
        } catch (err) {
          errors.push(`GitHub: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (provider === "github") {
        console.log(chalk.yellow("  GitHub not configured. Run `dafke connect github` first."));
        return;
      }
    }

    // Show errors
    for (const err of errors) {
      console.log(chalk.red(`  Error: ${err}`));
    }

    // Output
    if (format === "json") {
      console.log(JSON.stringify(allRepos, null, 2));
    } else {
      console.log();
      console.log(chalk.bold.hex("#6366f1")("  Repositories"));
      console.log(chalk.dim("  " + "─".repeat(50)));
      console.log();
      displayReposTable(allRepos);
      console.log();
    }
  },
});
