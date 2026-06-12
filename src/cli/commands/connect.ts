import { defineCommand } from "citty";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { ConfigManager } from "../../core/config/config-manager.js";
import { GitHubClient } from "../../integrations/github/client.js";
import type { GlobalConfig } from "../../core/config/config-schema.js";

// ---------------------------------------------------------------------------
// Connection setup flows (GitHub only)
// ---------------------------------------------------------------------------

async function connectGitHub(config: GlobalConfig, configManager: ConfigManager): Promise<void> {
  p.intro("Connect to GitHub");

  const token = await p.password({
    message: "GitHub Personal Access Token",
    validate: (value) => (value ? undefined : "Token is required"),
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

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const SERVICES = ["github"] as const;
type Service = (typeof SERVICES)[number];

export default defineCommand({
  meta: {
    name: "connect",
    description: "Setup external connections",
  },
  args: {
    service: {
      type: "string",
      description: "Service to connect (github)",
    },
  },
  async run({ args }) {
    const configManager = new ConfigManager();
    const config = await configManager.loadGlobalConfig();

    let service = args.service as string | undefined;

    if (!service || !SERVICES.includes(service as Service)) {
      const selected = await p.select({
        message: "Which service do you want to connect?",
        options: [{ value: "github", label: "GitHub", hint: "Repos, actions, PRs" }],
      });

      if (p.isCancel(selected)) return;
      service = selected as string;
    }

    switch (service) {
      case "github":
        await connectGitHub(config, configManager);
        break;
      default:
        console.log(chalk.red(`  Unknown service: ${service}`));
        console.log(chalk.dim(`  Available: ${SERVICES.join(", ")}`));
    }
  },
});
