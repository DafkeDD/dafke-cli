# Dafke AI Control Center -- Developer Guide

Guide for extending and customizing dafke.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Adding a New Tech Stack Adapter](#2-adding-a-new-tech-stack-adapter)
3. [Creating Custom Skills](#3-creating-custom-skills)
4. [Adding New CLI Commands](#4-adding-new-cli-commands)
5. [Writing Hooks](#5-writing-hooks)
6. [Template Customization](#6-template-customization)

---

## 1. Architecture Overview

dafke follows a modular architecture with clear separation of concerns:

```
src/
  cli/              CLI entry point and commands (citty framework)
    commands/       Individual subcommands (init, audit, doctor, etc.)
    index.ts        Main CLI definition with subcommand routing
  core/             Core business logic
    config/         ConfigManager, schema definitions (Zod), config merging
      rules-schema.ts   Rules configuration schema (.dafke/rules.yaml)
    state/          StateManager for wizard checkpoint/resume
    wizard/         WizardRunner orchestrator and 12 step modules
    analyzer/       AssessmentEngine and 6 dimension analyzers
      deep-analyzer.ts  AI-powered deep analysis (requires Claude Code CLI)
    plugin/         Plugin loading and registry
    scaffold/       File scaffolding and template rendering
      claude-md-merger.ts  Section-based CLAUDE.md merge logic
    updater/        Self-update and version checking
  adapters/         Technology-specific adapters (Java, .NET, TS, Delphi, FoxPro)
    adapter-interface.ts   TechnologyAdapter interface definition
    adapter-registry.ts    Registry with auto-detection logic
    java/           Java adapter implementation
    dotnet/         .NET adapter implementation
    typescript/     TypeScript adapter implementation
    delphi/         Delphi adapter implementation
    foxpro/         FoxPro adapter implementation
  integrations/     External service clients
    azure-devops/   Azure DevOps REST API client
    github/         GitHub API client
    jira/           Jira REST API client
    confluence/     Confluence REST API client
    sonarqube/      SonarQube API client
    base-client.ts  Shared HTTP client base class
    repository-provider.ts  Unified repository provider abstraction
  utils/            Shared utilities
    banner.ts       ASCII banner and compact banner rendering
    errors.ts       Typed error classes (ConfigError, AdapterError, etc.)
    platform.ts     Cross-platform path and OS helpers
    prerequisites.ts  Prerequisite tool detection (required/recommended/optional)
    claude-cli.ts   Claude Code CLI detection and interaction helpers
  templates/        Templates for generated files (Handlebars-style syntax)
  index.ts          Library entry point (public API exports)
  version.ts        Version constant
```

Key design principles:

- **ESM-only**: All imports use `.js` extensions for Node.js ESM compatibility
- **Lazy loading**: Adapters and wizard steps are imported dynamically to keep CLI startup under 500ms
- **Cross-platform**: All paths use `path.join()`/`path.resolve()`, spawning via `cross-spawn`, config via `env-paths`
- **Atomic writes**: All file writes go to a temp file first, then atomic rename
- **Zod schemas**: All config and state objects are validated with Zod schemas at read/write boundaries

### Key Modules (Added in Phase 2-5)

The following modules were introduced to support smart features, configurability, and prerequisite detection:

| Module | Path | Purpose |
|--------|------|---------|
| `prerequisites.ts` | `src/utils/prerequisites.ts` | Detects required, recommended, and optional tools with OS-specific install hints |
| `claude-cli.ts` | `src/utils/claude-cli.ts` | Detects Claude Code CLI availability and provides interaction helpers |
| `rules-schema.ts` | `src/core/config/rules-schema.ts` | Zod schema and loader for `.dafke/rules.yaml` configuration |
| `claude-md-merger.ts` | `src/core/scaffold/claude-md-merger.ts` | Section-based merge for CLAUDE.md preserving user customizations |
| `deep-analyzer.ts` | `src/core/analyzer/deep-analyzer.ts` | AI-powered deep audit analysis using Claude Code CLI |

These modules follow the same design principles as the rest of the codebase: ESM-only, Zod-validated boundaries, cross-platform paths, and typed error handling.

### Package Exports

The library entry point (`src/index.ts`) exports all public modules and types:

```typescript
// Runtime exports
export { ConfigManager } from "./core/config/config-manager.js";
export { StateManager } from "./core/state/state-manager.js";
export { AdapterRegistry, createAdapterRegistry } from "./adapters/adapter-registry.js";
export { AssessmentEngine } from "./core/analyzer/assessment-engine.js";
export { WizardRunner } from "./core/wizard/wizard-runner.js";
export { printBanner, printCompactBanner } from "./utils/banner.js";
export { VERSION } from "./version.js";

// Type exports
export type { GlobalConfig, RepoManifest, WizardState, TechStack, Wave, ReadinessScores } from "./core/config/config-schema.js";
export type { TechnologyAdapter, DetectionResult, AnalysisResult } from "./adapters/adapter-interface.js";
export type { AssessmentResult, ImprovementAction } from "./core/analyzer/assessment-engine.js";
export type { DimensionResult } from "./core/analyzer/dimension-analyzer.js";
```

---

## 2. Adding a New Tech Stack Adapter

To support a new technology (e.g., Python, Go, Rust), implement the `TechnologyAdapter` interface.

### Step 1: Create the adapter directory and file

```bash
mkdir -p src/adapters/python
touch src/adapters/python/adapter.ts
```

### Step 2: Implement the interface

```typescript
// src/adapters/python/adapter.ts
import type {
  TechnologyAdapter,
  DetectionResult,
  AnalysisResult,
  CoverageConfig,
  MutationConfig,
  SecurityConfig,
  BuildInfo,
} from "../adapter-interface.js";
import type { TechStack } from "../../core/config/config-schema.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class PythonAdapter implements TechnologyAdapter {
  readonly name: TechStack = "python" as TechStack;
  readonly displayName = "Python";

  async detect(repoRoot: string): Promise<DetectionResult> {
    const indicators: string[] = [];
    let confidence = 0;

    if (existsSync(join(repoRoot, "pyproject.toml"))) {
      indicators.push("pyproject.toml");
      confidence += 0.5;
    }
    if (existsSync(join(repoRoot, "requirements.txt"))) {
      indicators.push("requirements.txt");
      confidence += 0.3;
    }
    if (existsSync(join(repoRoot, "setup.py"))) {
      indicators.push("setup.py");
      confidence += 0.2;
    }

    return {
      detected: confidence > 0,
      confidence: Math.min(1, confidence),
      indicators,
    };
  }

  async analyze(repoRoot: string): Promise<AnalysisResult> {
    // Implement analysis logic...
    // Return AnalysisResult with build info, coverage, etc.
  }

  getCoverageConfig(): CoverageConfig {
    return {
      tool: "pytest-cov",
      command: "pytest --cov --cov-report=xml",
      reportPath: "coverage.xml",
      reportFormat: "cobertura",
    };
  }

  getMutationConfig(): MutationConfig {
    return {
      tool: "mutmut",
      command: "mutmut run",
      configFile: "setup.cfg",
      supported: true,
    };
  }

  getSecurityConfig(): SecurityConfig {
    return {
      sastTools: ["bandit"],
      secretsDetection: "gitleaks",
      scaTools: ["safety", "pip-audit"],
    };
  }

  async getBuildInfo(repoRoot: string): Promise<BuildInfo> {
    return {
      buildTool: "pip",
      buildCommand: "pip install -e .",
      testCommand: "pytest",
      lintCommand: "ruff check .",
    };
  }

  getClaudeMdSection(): string {
    return `## Python Project
- Test: \`pytest\`
- Lint: \`ruff check .\`
- Format: \`ruff format .\`
- Type check: \`mypy .\``;
  }

  getCITemplateId(): string {
    return "python-standard";
  }
}
```

### Step 3: Add the TechStack enum value

Update `src/core/config/config-schema.ts` to include the new tech stack:

```typescript
export const TechStackSchema = z.enum([
  "java",
  "dotnet",
  "typescript",
  "delphi",
  "foxpro",
  "python",   // <-- add here
  "unknown",
]);
```

### Step 4: Register the adapter

Update `src/adapters/adapter-registry.ts`:

```typescript
import { PythonAdapter } from "./python/adapter.js";

export function createAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  // ... existing adapters ...
  registry.register(new PythonAdapter());
  return registry;
}
```

### Step 5: Write tests

Create `tests/adapters/python/adapter.test.ts` with detection and analysis tests covering both positive and negative cases.

---

## 3. Creating Custom Skills

Skills are slash commands that appear in Claude Code. Each skill lives in the `skills/` directory.

### Skill Structure

```
skills/
  dafke-my-skill/
    SKILL.md         Required: skill definition and instructions
```

The `SKILL.md` file contains the Claude Code instructions for the skill. It defines:
- When the skill should trigger
- What steps Claude should follow
- What tools to use
- Expected output format

### Example: Creating a `/dafke-deps` Skill

Create `skills/dafke-deps/SKILL.md`:

```markdown
# /dafke-deps

Analyze and report on project dependencies.

## Trigger

User types `/dafke-deps` or asks about dependency status.

## Steps

1. Read the project manifest (.dafke/manifest.yaml) to determine the tech stack.
2. Based on tech stack:
   - TypeScript: read package.json, run `npm outdated`
   - Java: read pom.xml, check for outdated dependencies
   - .NET: read *.csproj, run `dotnet list package --outdated`
3. Categorize dependencies: up-to-date, minor update available, major update available, deprecated.
4. Check for known security vulnerabilities using `npm audit` or equivalent.
5. Present a summary table with recommendations.

## Output Format

Present results as a markdown table with columns:
| Package | Current | Latest | Type | Risk |
```

### Registering Skills

Skills in the `skills/` directory are automatically discovered by the plugin system. The `.claude-plugin/plugin.json` file points to the skills directory:

```json
{
  "skills": "./skills/"
}
```

---

## 4. Adding New CLI Commands

CLI commands are implemented using the citty framework and added as subcommands.

### Step 1: Create the command file

```typescript
// src/cli/commands/my-command.ts
import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "my-command",
    description: "Description of what this command does",
  },
  args: {
    target: {
      type: "positional",
      description: "Target to operate on",
      required: false,
    },
    verbose: {
      type: "boolean",
      description: "Enable verbose output",
      alias: "v",
      default: false,
    },
  },
  async run({ args }) {
    const { printCompactBanner } = await import("../../utils/banner.js");
    const { VERSION } = await import("../../version.js");
    printCompactBanner(VERSION);

    // Command implementation here
    console.log(`Running my-command on: ${args.target ?? "default"}`);
  },
});
```

### Step 2: Register the subcommand

Update `src/cli/index.ts` to add the new subcommand:

```typescript
subCommands: {
  // ... existing commands ...
  "my-command": () => import("./commands/my-command.js").then((m) => m.default),
},
```

### Step 3: Test the command

Create `tests/cli/commands/my-command.test.ts` testing argument parsing and execution.

---

## 5. Writing Hooks

Hooks intercept Claude Code lifecycle events. dafke hooks are implemented as Node.js subcommands invoked by Claude Code.

### Hook Lifecycle

```
SessionStart     -> dafke hook session-start
UserPromptSubmit -> dafke hook prompt-submit
PreToolUse       -> dafke hook pre-bash / pre-edit
PostToolUse      -> dafke hook post-bash / post-edit
Stop             -> dafke hook stop
```

### Implementing a Hook Handler

Hooks are handled by the `hook` CLI subcommand. To add a new hook:

1. Add the hook event to `templates/hooks/claude-hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "dafke hook pre-webfetch",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

2. Add the handler in `src/cli/commands/hook.ts`:

```typescript
case "pre-webfetch":
  // Validate URL against allowlist
  // Return approval or rejection
  break;
```

### Hook Return Values

Hooks can return JSON to influence Claude Code behavior:

- `{ "decision": "allow" }` -- permit the tool use
- `{ "decision": "block", "reason": "..." }` -- block with explanation
- `{ "decision": "modify", "toolInput": {...} }` -- modify the tool input

---

## 6. Template Customization

dafke uses a custom template engine (Handlebars-style syntax) for generating configuration files.

### Template Locations

```
templates/
  claude-md/       CLAUDE.md templates per tech stack
  hooks/           Claude Code hook definitions
  settings/        Claude Code settings and MCP configuration
  ci/              CI pipeline templates
```

### Creating a Tech-Stack Template

To add a CLAUDE.md template for a new tech stack, create a template file:

```
templates/claude-md/python.md.hbs
```

Templates have access to the following context variables:

```typescript
{
  techStack: string;          // "python"
  repoName: string;           // repository name
  buildTool: string;          // "pip"
  testCommand: string;        // "pytest"
  lintCommand: string;        // "ruff check ."
  coverageTool: string;       // "pytest-cov"
  version: string;            // dafke version
  readinessScores: object;    // 6-dimension scores
  wave: string;               // "wave1" | "wave2" | "wave3"
}
```

### Overriding Templates

To override a template for a specific repository, place a custom template in:

```
.dafke/templates/claude-md/override.md.hbs
```

Repository-level templates take precedence over built-in templates.

---

## Development Workflow

### Building

```bash
npm run build       # Build with tsup (single ESM bundle)
npm run dev         # Watch mode for development
```

### Testing

```bash
npm test            # Run all tests with Vitest
npm run test:watch  # Watch mode
npm run test:coverage  # With coverage report
```

### Linting and Formatting

```bash
npm run lint        # ESLint
npm run format      # Prettier
npm run typecheck   # TypeScript strict mode check
```

### Quality Requirements

- TypeScript strict mode, no `any` types
- 80%+ test coverage enforced
- All async operations have proper error handling with typed errors
- All file writes are atomic
- CLI startup under 500ms
- Cross-platform (macOS, Linux, Windows)
