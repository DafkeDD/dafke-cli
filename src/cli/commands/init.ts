import { defineCommand } from "citty";
import chalk from "chalk";
import { WizardRunner } from "../../core/wizard/wizard-runner.js";
import { WIZARD_STEPS } from "../../core/wizard/wizard-steps.js";
import { isClaudeAvailable } from "../../utils/claude-cli.js";

const VALID_TECH_STACKS = ["typescript", "lua"] as const;

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize AI-assisted development for this repository",
  },
  args: {
    resume: {
      type: "boolean",
      description: "Resume from last checkpoint",
      default: false,
    },
    skip: {
      type: "string",
      description: `Comma-separated steps to skip. Valid: ${WIZARD_STEPS.join(", ")}`,
    },
    "tech-stack": {
      type: "string",
      description: `Override tech stack detection. Valid: ${VALID_TECH_STACKS.join(", ")}`,
    },
    "non-interactive": {
      type: "boolean",
      description: "Non-interactive mode (use defaults, no prompts)",
      default: false,
    },
    verbose: {
      type: "boolean",
      description: "Show detailed output",
      default: false,
    },
  },
  async run({ args }) {
    // Validate --skip step names
    if (args.skip) {
      const steps = (args.skip as string).split(",").map((s) => s.trim()).filter(Boolean);
      const invalid = steps.filter((s) => !(WIZARD_STEPS as readonly string[]).includes(s));
      if (invalid.length > 0) {
        console.error(chalk.red(`  Invalid step name(s): ${invalid.join(", ")}`));
        console.error(chalk.dim(`  Valid steps: ${WIZARD_STEPS.join(", ")}`));
        process.exit(1);
      }
    }

    // Validate --tech-stack
    const techStack = args["tech-stack"] as string | undefined;
    if (techStack && !(VALID_TECH_STACKS as readonly string[]).includes(techStack)) {
      console.error(chalk.red(`  Invalid tech stack: ${techStack}`));
      console.error(chalk.dim(`  Valid: ${VALID_TECH_STACKS.join(", ")}`));
      process.exit(1);
    }

    // Pre-flight: Claude CLI is required for init (plugins, hooks, MCP)
    const claudeAvailable = await isClaudeAvailable();
    if (!claudeAvailable) {
      console.error(chalk.red("  Claude Code CLI is required for init."));
      console.error(chalk.dim("  Install: https://docs.anthropic.com/en/docs/claude-code"));
      console.error(chalk.dim("  Then re-run: dafke init"));
      process.exit(1);
    }

    const wizard = new WizardRunner(process.cwd());
    await wizard.run({
      resume: args.resume,
      skip: args.skip,
      nonInteractive: args["non-interactive"],
      verbose: args.verbose,
      techStack: techStack as typeof VALID_TECH_STACKS[number] | undefined,
    });
  },
});
