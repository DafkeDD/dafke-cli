# Execution Prompt: Build the Dafke AI Control Center

## Context

You are building **dafke** (Dafke AI Control Center), a CLI tool and Claude Code plugin that automates the onboarding of software repositories into AI-assisted development workflows. It is the single entry point for setting up Claude Code integration across Dafke's portfolio of 200+ repositories spanning Java, .NET, TypeScript, Delphi, and FoxPro.

The tool:
1. Assesses a repository's "AI readiness" across 6 dimensions (CI/CD, coverage, security, code review, DORA metrics, documentation)
2. Generates all configuration files needed for Claude Code (CLAUDE.md, settings.json, hooks, MCP config)
3. Installs development skills (`/dafke-backlog`, `/dafke-story`, `/dafke-plan`, `/dafke-dev`, `/dafke-review`, `/dafke-pr`, `/dafke-ci`, `/dafke-deploy`) and management skills (`/dafke-init`, `/dafke-audit`, `/dafke-update`, `/dafke-doctor`, `/dafke-gate`, `/dafke-coverage`, `/dafke-mutate`, `/dafke-security`, `/dafke-arch`, `/dafke-lint`, `/dafke-spec`, `/dafke-spec-verify`, `/dafke-spec-update`)
4. Installs agent teams for multi-agent development (dafke-dev-team, dafke-assess-team, dafke-fix-team)
5. Connects to Azure DevOps, GitHub, Jira, and Confluence for work item tracking
6. Provides ongoing maintenance via audit, update, and self-healing commands

Reference documents:
- `docs/implementation-steps.md` — the phased implementation plan (94 tasks across 13 phases)

## Prerequisites

Before starting:
- Node.js >= 20 installed
- npm >= 10 installed
- Claude Code CLI installed and authenticated
- Git installed
- Working directory: the `dafke` project root

## Instructions

Follow the implementation steps in `docs/implementation-steps.md` exactly. This prompt provides the detailed implementation guidance for each phase.

---

## Phase 0: Project Scaffolding

### Task 1: Initialize npm project

```bash
npm init -y
```

Then configure `package.json`:

```json
{
  "name": "dafke",
  "version": "0.1.0",
  "description": "Dafke AI Control Center — CLI tool and Claude Code plugin for AI-assisted development onboarding",
  "type": "module",
  "engines": { "node": ">=20" },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    }
  },
  "bin": {
    "dafke": "./dist/cli.mjs"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@/*": ["./src/*"],
      "@templates/*": ["./templates/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Create `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "tests", "**/*.test.ts", "**/*.spec.ts"]
}
```

### Task 2: Set up tsup build system

Create `tsup.config.ts`:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli/index.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    // Externalize heavy optional deps for faster startup
    "xstate",
    "@octokit/rest",
  ],
});
```

### Task 3: Configure ESLint + Prettier

Create `eslint.config.js`:

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "*.config.*"],
  }
);
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

### Task 4: Set up Vitest

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/index.ts"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
```

Create `tests/setup.ts`:

```typescript
import { beforeEach, afterEach, vi } from "vitest";

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

### Task 5: Create directory structure

Create all directories as defined in the implementation steps. Every leaf directory gets a `.gitkeep` file.

### Task 6: Install dependencies

```bash
# Runtime dependencies
npm install citty @clack/prompts listr2 chalk cosmiconfig xstate yaml zod execa update-notifier

# Dev dependencies
npm install -D typescript tsup vitest @vitest/coverage-v8 eslint @eslint/js typescript-eslint prettier @types/node @types/update-notifier
```

### Task 7: Create CLI entry point

Create `src/cli/index.ts`:

```typescript
import { defineCommand, runMain } from "citty";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string; description: string };

const main = defineCommand({
  meta: {
    name: "dafke",
    version: pkg.version,
    description: pkg.description,
  },
  args: {
    verbose: {
      type: "boolean",
      description: "Enable verbose output",
      alias: "v",
      default: false,
    },
    config: {
      type: "string",
      description: "Path to config file",
      alias: "c",
    },
  },
  subCommands: {
    init: () => import("./commands/init.js").then((m) => m.default),
    audit: () => import("./commands/audit.js").then((m) => m.default),
    update: () => import("./commands/update.js").then((m) => m.default),
    status: () => import("./commands/status.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    connect: () => import("./commands/connect.js").then((m) => m.default),
    repos: () => import("./commands/repos.js").then((m) => m.default),
    migrate: () => import("./commands/migrate.js").then((m) => m.default),
  },
  run({ args }) {
    // Default behavior: show help
    // This runs when no subcommand is provided
    console.log(`${pkg.description} v${pkg.version}`);
    console.log("Run 'dafke --help' for available commands.");
  },
});

runMain(main);
```

Create command placeholders. Each command file follows this pattern:

```typescript
// src/cli/commands/init.ts
import { defineCommand } from "citty";

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
      description: "Comma-separated list of steps to skip",
    },
    "non-interactive": {
      type: "boolean",
      description: "Run in non-interactive mode with defaults",
      default: false,
    },
  },
  async run({ args }) {
    // TODO: Implement in Phase 5
    console.log("Init wizard — not yet implemented");
  },
});
```

Create similar placeholder files for: `audit.ts`, `update.ts`, `status.ts`, `doctor.ts`, `connect.ts`, `repos.ts`, `migrate.ts`.

---

## Phase 1: Core Engine

### Task 8: ConfigManager

The ConfigManager reads, writes, merges, and validates configuration files using cosmiconfig. The configuration schema is validated with Zod.

Create `src/core/config/config-schema.ts`:

```typescript
import { z } from "zod";

// Authentication configuration for external providers
export const AuthConfigSchema = z.object({
  azureDevOps: z
    .object({
      organization: z.string(),
      pat: z.string().optional(),
      azureAdTenantId: z.string().optional(),
    })
    .optional(),
  github: z
    .object({
      token: z.string().optional(),
      appId: z.string().optional(),
      privateKey: z.string().optional(),
    })
    .optional(),
  jira: z
    .object({
      host: z.string().url(),
      email: z.string().email(),
      apiToken: z.string(),
    })
    .optional(),
  confluence: z
    .object({
      host: z.string().url(),
      email: z.string().email(),
      apiToken: z.string(),
    })
    .optional(),
});

// Technology adapter configuration
export const AdapterConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  overrides: z.record(z.unknown()).optional(),
});

// Assessment thresholds configuration
export const ThresholdsSchema = z.object({
  coverage: z.number().min(0).max(100).default(80),
  mutationScore: z.number().min(0).max(100).default(60),
  securitySeverity: z.enum(["low", "medium", "high", "critical"]).default("high"),
});

// The full dafke configuration
export const DafkeCCConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1).default(1),
  root: z.boolean().default(false),
  projectName: z.string().optional(),
  techStack: z.array(AdapterConfigSchema).optional(),
  auth: AuthConfigSchema.optional(),
  thresholds: ThresholdsSchema.optional(),
  wave: z.number().min(1).max(4).optional(),
  generatedFiles: z
    .record(
      z.object({
        hash: z.string(),
        templateVersion: z.string(),
        generatedAt: z.string().datetime(),
      })
    )
    .optional(),
  connections: z
    .object({
      repository: z.enum(["azure-devops", "github"]).optional(),
      workItems: z.enum(["jira", "azure-devops"]).optional(),
      docs: z.enum(["confluence"]).optional(),
    })
    .optional(),
  extends: z.string().optional(),
});

export type DafkeCCConfig = z.infer<typeof DafkeCCConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;
```

Create `src/core/config/config-manager.ts`:

```typescript
import { cosmiconfig, type CosmiconfigResult } from "cosmiconfig";
import { writeFile, rename, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import { DafkeCCConfigSchema, type DafkeCCConfig } from "./config-schema.js";

const MODULE_NAME = "dafke";
const DEFAULT_CONFIG_NAME = ".dafke.yaml";

export class ConfigManager {
  private readonly explorer;
  private cachedConfig: DafkeCCConfig | null = null;
  private configPath: string | null = null;

  constructor(private readonly searchFrom?: string) {
    this.explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: [
        `.${MODULE_NAME}.yaml`,
        `.${MODULE_NAME}.yml`,
        `.${MODULE_NAME}.json`,
        `.${MODULE_NAME}.config.ts`,
        `.${MODULE_NAME}.config.js`,
        `package.json`,
      ],
      stopDir: undefined, // Walk up to filesystem root unless `root: true` found
    });
  }

  /**
   * Read and validate the configuration file.
   * Uses cosmiconfig walk-up resolution.
   * Stops at the first config with `root: true`.
   */
  async read(): Promise<DafkeCCConfig> {
    if (this.cachedConfig) return this.cachedConfig;

    const result: CosmiconfigResult = await this.explorer.search(this.searchFrom);

    if (!result || result.isEmpty) {
      // Return defaults if no config found
      return DafkeCCConfigSchema.parse({});
    }

    this.configPath = result.filepath;
    const validated = DafkeCCConfigSchema.parse(result.config);

    // Handle `extends` — merge with parent config
    if (validated.extends) {
      const parentPath = join(dirname(result.filepath), validated.extends);
      const parentResult = await this.explorer.load(parentPath);
      if (parentResult && !parentResult.isEmpty) {
        const parentConfig = DafkeCCConfigSchema.parse(parentResult.config);
        this.cachedConfig = this.deepMerge(parentConfig, validated);
        return this.cachedConfig;
      }
    }

    this.cachedConfig = validated;
    return validated;
  }

  /**
   * Write the configuration to disk. Atomic write via temp file + rename.
   */
  async write(config: DafkeCCConfig, path?: string): Promise<void> {
    const targetPath = path ?? this.configPath ?? join(process.cwd(), DEFAULT_CONFIG_NAME);
    const validated = DafkeCCConfigSchema.parse(config);

    // Ensure directory exists
    await mkdir(dirname(targetPath), { recursive: true });

    // Atomic write: write to temp, then rename
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    const { stringify } = await import("yaml");
    const content = stringify(validated, { indent: 2 });

    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, targetPath);

    this.cachedConfig = validated;
    this.configPath = targetPath;
  }

  /**
   * Merge partial config into the existing config and write.
   */
  async merge(partial: Partial<DafkeCCConfig>): Promise<DafkeCCConfig> {
    const current = await this.read();
    const merged = this.deepMerge(current, partial);
    const validated = DafkeCCConfigSchema.parse(merged);
    await this.write(validated);
    return validated;
  }

  /**
   * Validate a config object without writing.
   */
  validate(config: unknown): DafkeCCConfig {
    return DafkeCCConfigSchema.parse(config);
  }

  /**
   * Clear cached config (force re-read on next access).
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.configPath = null;
  }

  /**
   * Get the resolved config file path.
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Deep merge two objects. Source values override target values.
   * Arrays are replaced, not merged.
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal !== undefined &&
        typeof sourceVal === "object" &&
        sourceVal !== null &&
        !Array.isArray(sourceVal) &&
        typeof targetVal === "object" &&
        targetVal !== null &&
        !Array.isArray(targetVal)
      ) {
        result[key] = this.deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>,
        ) as T[keyof T];
      } else if (sourceVal !== undefined) {
        result[key] = sourceVal as T[keyof T];
      }
    }
    return result;
  }
}
```

### Task 9: StateManager

The StateManager persists wizard state to enable resumable execution. State is checkpointed after every wizard step.

Create `src/core/state/state-schema.ts`:

```typescript
import { z } from "zod";

export const WizardStepResultSchema = z.object({
  step: z.string(),
  status: z.enum(["completed", "skipped", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  data: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

export const WizardStateSchema = z.object({
  version: z.literal(1).default(1),
  sessionId: z.string().uuid(),
  startedAt: z.string().datetime(),
  currentStep: z.string(),
  completedSteps: z.array(WizardStepResultSchema),
  context: z
    .object({
      techStack: z.array(z.string()).optional(),
      provider: z.enum(["azure-devops", "github"]).optional(),
      assessmentScores: z.record(z.number()).optional(),
      wave: z.number().optional(),
      generatedFiles: z.array(z.string()).optional(),
    })
    .optional(),
  locked: z.boolean().default(false),
  lockPid: z.number().optional(),
});

export type WizardState = z.infer<typeof WizardStateSchema>;
export type WizardStepResult = z.infer<typeof WizardStepResultSchema>;
```

Create `src/core/state/state-manager.ts`:

```typescript
import { readFile, writeFile, rename, mkdir, unlink } from "fs/promises";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import { WizardStateSchema, type WizardState, type WizardStepResult } from "./state-schema.js";

const STATE_DIR = ".dafke";
const STATE_FILE = ".state.json";
const LOCK_FILE = ".state.lock";

export class StateManager {
  private readonly statePath: string;
  private readonly lockPath: string;
  private state: WizardState | null = null;

  constructor(private readonly projectRoot: string) {
    this.statePath = join(projectRoot, STATE_DIR, STATE_FILE);
    this.lockPath = join(projectRoot, STATE_DIR, LOCK_FILE);
  }

  /**
   * Initialize a new wizard session. Fails if a session is already in progress (locked).
   */
  async init(): Promise<WizardState> {
    await this.acquireLock();

    const state: WizardState = {
      version: 1,
      sessionId: randomUUID(),
      startedAt: new Date().toISOString(),
      currentStep: "welcome",
      completedSteps: [],
      context: {},
      locked: true,
      lockPid: process.pid,
    };

    await this.persist(state);
    this.state = state;
    return state;
  }

  /**
   * Load existing state from disk. Returns null if no state file exists.
   */
  async load(): Promise<WizardState | null> {
    try {
      const raw = await readFile(this.statePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      this.state = WizardStateSchema.parse(parsed);
      return this.state;
    } catch {
      return null;
    }
  }

  /**
   * Resume from the last checkpoint. Acquires lock and returns the state.
   */
  async resume(): Promise<WizardState> {
    const state = await this.load();
    if (!state) {
      throw new Error("No wizard session to resume. Run 'dafke init' first.");
    }
    await this.acquireLock();
    state.locked = true;
    state.lockPid = process.pid;
    await this.persist(state);
    this.state = state;
    return state;
  }

  /**
   * Checkpoint: record a completed step and advance to the next step.
   */
  async checkpoint(result: WizardStepResult, nextStep: string): Promise<void> {
    if (!this.state) throw new Error("No active session. Call init() or resume() first.");

    this.state.completedSteps.push(result);
    this.state.currentStep = nextStep;

    await this.persist(this.state);
  }

  /**
   * Get the result of a previously completed step.
   */
  getStepResult(stepName: string): WizardStepResult | undefined {
    return this.state?.completedSteps.find((s) => s.step === stepName);
  }

  /**
   * Update the shared context (tech stack, scores, etc.).
   */
  async updateContext(update: Partial<NonNullable<WizardState["context"]>>): Promise<void> {
    if (!this.state) throw new Error("No active session.");
    this.state.context = { ...this.state.context, ...update };
    await this.persist(this.state);
  }

  /**
   * Complete the session: release lock, mark as done.
   */
  async complete(): Promise<void> {
    if (!this.state) throw new Error("No active session.");
    this.state.locked = false;
    this.state.lockPid = undefined;
    this.state.currentStep = "done";
    await this.persist(this.state);
    await this.releaseLock();
  }

  /**
   * Reset: delete state file and lock.
   */
  async reset(): Promise<void> {
    try {
      await unlink(this.statePath);
    } catch {
      // Ignore if not exists
    }
    await this.releaseLock();
    this.state = null;
  }

  /**
   * Get the current state (in-memory).
   */
  getState(): WizardState | null {
    return this.state;
  }

  // --- Private ---

  private async persist(state: WizardState): Promise<void> {
    const dir = dirname(this.statePath);
    await mkdir(dir, { recursive: true });

    // Atomic write
    const tempPath = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tempPath, this.statePath);
  }

  private async acquireLock(): Promise<void> {
    try {
      const existing = await readFile(this.lockPath, "utf-8");
      const lockData = JSON.parse(existing) as { pid: number };

      // Check if the process that holds the lock is still alive
      try {
        process.kill(lockData.pid, 0); // Signal 0 = check if process exists
        throw new Error(
          `Another dafke session (PID ${lockData.pid}) is running. ` +
            `Use 'dafke doctor --force-unlock' to break the lock.`
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ESRCH") {
          // Process is dead — stale lock, safe to take over
          await this.writeLock();
        } else {
          throw err;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // No lock file — safe to create
        await this.writeLock();
      } else {
        throw err;
      }
    }
  }

  private async writeLock(): Promise<void> {
    const dir = dirname(this.lockPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.lockPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf-8");
  }

  private async releaseLock(): Promise<void> {
    try {
      await unlink(this.lockPath);
    } catch {
      // Ignore
    }
  }
}
```

### Task 10: AdapterRegistry

Create `src/core/adapter-types.ts`:

```typescript
/**
 * The interface every tech stack adapter must implement.
 * Adapters are lazy-loaded via dynamic import for fast CLI startup.
 */
export interface TechnologyAdapter {
  /** Unique adapter name (e.g., "java", "dotnet", "typescript", "delphi", "foxpro") */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Detect whether this adapter applies to the given directory.
   * Returns a confidence score 0.0 to 1.0.
   * 0.0 = definitely not this tech stack.
   * 1.0 = definitely this tech stack.
   */
  detect(dir: string): Promise<DetectionResult>;

  /**
   * Get the shell command to run test coverage.
   * Returns null if coverage is not supported.
   */
  getCoverageCommand(): CoverageCommand | null;

  /**
   * Parse a coverage report file and return structured results.
   */
  parseCoverageReport(reportPath: string): Promise<CoverageReport>;

  /**
   * Get the shell command to run mutation testing.
   * Returns null if mutation testing is not supported.
   */
  getMutationCommand(): MutationCommand | null;

  /**
   * Parse a mutation test report.
   */
  parseMutationReport(reportPath: string): Promise<MutationReport>;

  /**
   * Get architecture analysis command (dependency-cruiser, jdeps, etc.)
   */
  getArchCommand(): ArchCommand | null;

  /**
   * Get linting command for this tech stack.
   */
  getLintCommand(): LintCommand | null;

  /**
   * Get SAST tools applicable to this tech stack.
   */
  getSASTTools(): ToolInfo[];

  /**
   * Get SCA (dependency scanning) tools for this tech stack.
   */
  getSCATools(): ToolInfo[];

  /**
   * Get secrets detection tools.
   */
  getSecretsTools(): ToolInfo[];

  /**
   * Get tech-stack-specific sections for CLAUDE.md.
   */
  getClaudeMDSections(): ClaudeMDSection[];

  /**
   * Get settings.json overrides for this tech stack.
   */
  getSettingsOverrides(): Record<string, unknown>;

  /**
   * Get the CI pipeline template name for this tech stack.
   */
  getCITemplateName(): string;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number; // 0.0 to 1.0
  buildSystem?: string; // "maven", "gradle", "dotnet", "npm", "pnpm", etc.
  version?: string; // Java 17, .NET 8, Node 20, etc.
  markers: string[]; // Files that triggered detection
}

export interface CoverageCommand {
  command: string;
  args: string[];
  reportPath: string; // Where the report will be generated
  reportFormat: "jacoco-xml" | "cobertura-xml" | "lcov" | "clover" | "html";
}

export interface CoverageReport {
  totalLines: number;
  coveredLines: number;
  percentage: number;
  packages: PackageCoverage[];
}

export interface PackageCoverage {
  name: string;
  totalLines: number;
  coveredLines: number;
  percentage: number;
  files: FileCoverage[];
}

export interface FileCoverage {
  path: string;
  totalLines: number;
  coveredLines: number;
  percentage: number;
}

export interface MutationCommand {
  command: string;
  args: string[];
  reportPath: string;
  reportFormat: "pit-xml" | "stryker-json" | "stryker-html";
}

export interface MutationReport {
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  score: number; // percentage
  modules: MutationModuleReport[];
}

export interface MutationModuleReport {
  name: string;
  total: number;
  killed: number;
  survived: number;
  score: number;
}

export interface ArchCommand {
  command: string;
  args: string[];
  reportPath: string;
  reportFormat: "json" | "dot" | "mermaid";
}

export interface LintCommand {
  command: string;
  args: string[];
}

export interface ToolInfo {
  name: string;
  command: string;
  installCommand?: string;
  configFile?: string;
  description: string;
}

export interface ClaudeMDSection {
  title: string;
  order: number; // For positioning within CLAUDE.md
  content: string; // Markdown content
}
```

Create `src/core/adapter-registry.ts`:

```typescript
import type { TechnologyAdapter, DetectionResult } from "./adapter-types.js";

interface AdapterRegistration {
  name: string;
  /** File patterns that trigger detection (glob patterns) */
  markerFiles: string[];
  /** Priority for when multiple adapters match (higher = preferred) */
  priority: number;
  /** Dynamic import path for lazy loading */
  importPath: string;
}

interface DetectedAdapter {
  adapter: TechnologyAdapter;
  detection: DetectionResult;
}

const ADAPTER_REGISTRATIONS: AdapterRegistration[] = [
  {
    name: "java",
    markerFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
    priority: 10,
    importPath: "../adapters/java/index.js",
  },
  {
    name: "dotnet",
    markerFiles: ["*.csproj", "*.sln", "global.json"],
    priority: 10,
    importPath: "../adapters/dotnet/index.js",
  },
  {
    name: "typescript",
    markerFiles: ["tsconfig.json", "tsconfig*.json"],
    priority: 10,
    importPath: "../adapters/typescript/index.js",
  },
  {
    name: "delphi",
    markerFiles: ["*.dpr", "*.dproj", "*.groupproj"],
    priority: 5,
    importPath: "../adapters/delphi/index.js",
  },
  {
    name: "foxpro",
    markerFiles: ["*.prg", "*.vcx", "*.scx", "*.pjx"],
    priority: 1,
    importPath: "../adapters/foxpro/index.js",
  },
];

export class AdapterRegistry {
  private readonly loadedAdapters = new Map<string, TechnologyAdapter>();

  /**
   * Detect all applicable tech stacks for the given directory.
   * Returns adapters sorted by detection confidence (highest first).
   */
  async detect(dir: string): Promise<DetectedAdapter[]> {
    const results: DetectedAdapter[] = [];

    for (const reg of ADAPTER_REGISTRATIONS) {
      try {
        const adapter = await this.loadAdapter(reg);
        const detection = await adapter.detect(dir);

        if (detection.detected && detection.confidence > 0) {
          results.push({ adapter, detection });
        }
      } catch {
        // Adapter failed to load or detect — skip silently
      }
    }

    // Sort by confidence descending, then by priority descending
    return results.sort((a, b) => {
      if (b.detection.confidence !== a.detection.confidence) {
        return b.detection.confidence - a.detection.confidence;
      }
      const aPriority = ADAPTER_REGISTRATIONS.find((r) => r.name === a.adapter.name)?.priority ?? 0;
      const bPriority = ADAPTER_REGISTRATIONS.find((r) => r.name === b.adapter.name)?.priority ?? 0;
      return bPriority - aPriority;
    });
  }

  /**
   * Get a specific adapter by name.
   */
  async getAdapter(name: string): Promise<TechnologyAdapter | undefined> {
    const reg = ADAPTER_REGISTRATIONS.find((r) => r.name === name);
    if (!reg) return undefined;
    return this.loadAdapter(reg);
  }

  /**
   * List all registered adapter names.
   */
  getRegisteredAdapters(): string[] {
    return ADAPTER_REGISTRATIONS.map((r) => r.name);
  }

  // --- Private ---

  private async loadAdapter(reg: AdapterRegistration): Promise<TechnologyAdapter> {
    const cached = this.loadedAdapters.get(reg.name);
    if (cached) return cached;

    const module = (await import(reg.importPath)) as { default: TechnologyAdapter } | { createAdapter: () => TechnologyAdapter };

    const adapter = "default" in module
      ? module.default
      : "createAdapter" in module
        ? module.createAdapter()
        : (undefined as never);

    this.loadedAdapters.set(reg.name, adapter);
    return adapter;
  }
}
```

### Task 11: TemplateEngine

Create `src/core/template-engine.ts`:

```typescript
import { readFile } from "fs/promises";
import { join } from "path";

type TemplateContext = Record<string, unknown>;

/**
 * Lightweight Mustache/Handlebars-style template engine.
 *
 * Supports:
 * - {{variable}} — variable substitution
 * - {{nested.path}} — dot-notation access
 * - {{#if condition}}...{{/if}} — conditionals
 * - {{#if condition}}...{{else}}...{{/if}} — if/else
 * - {{#each items}}...{{/each}} — loops ({{.}} for current item, {{@index}} for index)
 * - {{> partialName}} — partial inclusion
 */
export class TemplateEngine {
  private readonly partials = new Map<string, string>();
  private readonly templateDir: string;

  constructor(templateDir: string) {
    this.templateDir = templateDir;
  }

  /**
   * Register a partial template by name.
   */
  registerPartial(name: string, template: string): void {
    this.partials.set(name, template);
  }

  /**
   * Load a template file from the template directory.
   */
  async loadTemplate(relativePath: string): Promise<string> {
    const fullPath = join(this.templateDir, relativePath);
    return readFile(fullPath, "utf-8");
  }

  /**
   * Render a template string with the given context.
   */
  render(template: string, context: TemplateContext): string {
    let result = template;

    // Process partials: {{> partialName}}
    result = this.processPartials(result, context);

    // Process {{#each items}}...{{/each}}
    result = this.processEach(result, context);

    // Process {{#if condition}}...{{else}}...{{/if}}
    result = this.processIf(result, context);

    // Process {{variable}} substitution
    result = this.processVariables(result, context);

    return result;
  }

  /**
   * Load a template file and render it.
   */
  async renderFile(relativePath: string, context: TemplateContext): Promise<string> {
    const template = await this.loadTemplate(relativePath);
    return this.render(template, context);
  }

  // --- Private ---

  private processPartials(template: string, context: TemplateContext): string {
    return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_match, name: string) => {
      const partial = this.partials.get(name);
      if (!partial) return `<!-- partial "${name}" not found -->`;
      return this.render(partial, context);
    });
  }

  private processEach(template: string, context: TemplateContext): string {
    const eachRegex = /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachRegex, (_match, path: string, body: string) => {
      const items = this.resolvePath(context, path);
      if (!Array.isArray(items)) return "";

      return items
        .map((item: unknown, index: number) => {
          const itemContext: TemplateContext = {
            ...context,
            ".": item,
            "@index": index,
            "@first": index === 0,
            "@last": index === items.length - 1,
          };

          // If item is an object, spread its properties into context
          if (typeof item === "object" && item !== null) {
            Object.assign(itemContext, item);
          }

          return this.render(body, itemContext);
        })
        .join("");
    });
  }

  private processIf(template: string, context: TemplateContext): string {
    // Process {{#if condition}}...{{else}}...{{/if}}
    const ifElseRegex = /\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let result = template.replace(ifElseRegex, (_match, path: string, truthy: string, falsy: string) => {
      const value = this.resolvePath(context, path);
      return this.isTruthy(value) ? this.render(truthy, context) : this.render(falsy, context);
    });

    // Process {{#if condition}}...{{/if}} (no else)
    const ifRegex = /\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(ifRegex, (_match, path: string, body: string) => {
      const value = this.resolvePath(context, path);
      return this.isTruthy(value) ? this.render(body, context) : "";
    });

    return result;
  }

  private processVariables(template: string, context: TemplateContext): string {
    return template.replace(/\{\{([\w.@]+)\}\}/g, (_match, path: string) => {
      const value = this.resolvePath(context, path);
      if (value === undefined || value === null) return "";
      return String(value);
    });
  }

  private resolvePath(context: TemplateContext, path: string): unknown {
    if (path === ".") return context["."];
    if (path.startsWith("@")) return context[path];

    const parts = path.split(".");
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private isTruthy(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.length > 0;
    return Boolean(value);
  }
}
```

### Task 12: UpdateChecker

Create `src/core/update-checker.ts`:

```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createRequire } from "module";

const CACHE_DIR = ".dafke";
const CACHE_FILE = ".update-check.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  checkedAt: string;
}

interface CachedResult extends UpdateCheckResult {
  cachedAt: number; // timestamp
}

export class UpdateChecker {
  private readonly cachePath: string;
  private readonly currentVersion: string;

  constructor(projectRoot: string) {
    this.cachePath = join(projectRoot, CACHE_DIR, CACHE_FILE);
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version: string };
    this.currentVersion = pkg.version;
  }

  /**
   * Check for updates (uses cache if fresh, fetches from npm if stale).
   * Non-blocking — catches all errors and returns null on failure.
   */
  async check(): Promise<UpdateCheckResult | null> {
    try {
      // Check cache first
      const cached = await this.readCache();
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached;
      }

      // Fetch from npm registry
      const response = await fetch("https://registry.npmjs.org/dafke/latest");
      if (!response.ok) return null;

      const data = (await response.json()) as { version: string };
      const latestVersion = data.version;

      const result: UpdateCheckResult = {
        currentVersion: this.currentVersion,
        latestVersion,
        updateAvailable: this.isNewer(latestVersion, this.currentVersion),
        checkedAt: new Date().toISOString(),
      };

      // Cache the result
      await this.writeCache({ ...result, cachedAt: Date.now() });

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Format an update notification message for terminal display.
   */
  formatNotification(result: UpdateCheckResult): string | null {
    if (!result.updateAvailable) return null;
    return [
      "",
      `  Update available: ${result.currentVersion} → ${result.latestVersion}`,
      `  Run: npm update -g dafke`,
      "",
    ].join("\n");
  }

  // --- Private ---

  private async readCache(): Promise<CachedResult | null> {
    try {
      const raw = await readFile(this.cachePath, "utf-8");
      return JSON.parse(raw) as CachedResult;
    } catch {
      return null;
    }
  }

  private async writeCache(result: CachedResult): Promise<void> {
    try {
      const dir = join(this.cachePath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(result, null, 2), "utf-8");
    } catch {
      // Cache write failure is non-critical
    }
  }

  private isNewer(latest: string, current: string): boolean {
    const [lMaj = 0, lMin = 0, lPatch = 0] = latest.split(".").map(Number);
    const [cMaj = 0, cMin = 0, cPatch = 0] = current.split(".").map(Number);

    if (lMaj !== cMaj) return lMaj > cMaj;
    if (lMin !== cMin) return lMin > cMin;
    return lPatch > cPatch;
  }
}
```

### Task 13: DriftDetector

Create `src/core/drift-detector.ts`:

```typescript
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import type { DafkeCCConfig } from "./config/config-schema.js";

export interface DriftResult {
  file: string;
  status: "unchanged" | "customized" | "stale" | "missing";
  currentHash: string | null;
  expectedHash: string | null;
  templateVersion: string | null;
}

export class DriftDetector {
  /**
   * Check all generated files for drift against their stored hashes.
   */
  async detectDrift(config: DafkeCCConfig): Promise<DriftResult[]> {
    const results: DriftResult[] = [];
    const generatedFiles = config.generatedFiles ?? {};

    for (const [filePath, meta] of Object.entries(generatedFiles)) {
      try {
        const content = await readFile(filePath, "utf-8");
        const currentHash = this.hashContent(content);

        results.push({
          file: filePath,
          status: currentHash === meta.hash ? "unchanged" : "customized",
          currentHash,
          expectedHash: meta.hash,
          templateVersion: meta.templateVersion,
        });
      } catch {
        results.push({
          file: filePath,
          status: "missing",
          currentHash: null,
          expectedHash: meta.hash,
          templateVersion: meta.templateVersion,
        });
      }
    }

    return results;
  }

  /**
   * Compute a SHA-256 hash of file content.
   */
  hashContent(content: string): string {
    return createHash("sha256").update(content, "utf-8").digest("hex");
  }
}
```

---

## Phase 2: External Integrations

### Design Pattern for All Clients

Every external integration client follows this pattern:

```typescript
// 1. Auth module — handles token management and refresh
export interface AuthProvider {
  getHeaders(): Promise<Record<string, string>>;
  validate(): Promise<boolean>;
  refresh?(): Promise<void>;
}

// 2. Base HTTP client — handles retries, rate limiting, pagination
export abstract class BaseHttpClient {
  constructor(
    protected readonly baseUrl: string,
    protected readonly auth: AuthProvider,
  ) {}

  protected async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: Record<string, string> },
  ): Promise<T> {
    const headers = await this.auth.getHeaders();
    const url = new URL(path, this.baseUrl);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(30_000), // 30s timeout
        });

        // Rate limit handling
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new HttpError(response.status, response.statusText, await response.text());
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  /**
   * Handle paginated responses. Yields items one by one.
   */
  protected async *paginate<T>(
    path: string,
    params?: Record<string, string>,
  ): AsyncGenerator<T> {
    // Implement per-provider pagination (continuation tokens, link headers, etc.)
    throw new Error("Not implemented — override in subclass");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${body}`);
    this.name = "HttpError";
  }
}
```

### Task 14: Azure DevOps Client

Implement the Azure DevOps REST API client. Key endpoints:

- `GET https://dev.azure.com/{org}/_apis/projects` — list projects
- `GET https://dev.azure.com/{org}/{project}/_apis/git/repositories` — list repos
- `GET https://dev.azure.com/{org}/{project}/_apis/build/definitions` — list pipelines
- `GET/POST https://dev.azure.com/{org}/{project}/_apis/wit/workitems` — work items
- `GET https://dev.azure.com/{org}/{project}/_apis/policy/configurations` — branch policies

Auth: PAT encoded as base64 `:{pat}` in Authorization header, or Azure AD bearer token via MSAL.

### Task 15: GitHub Client

Use `@octokit/rest` as the underlying client. Implement a thin typed wrapper:

```typescript
import { Octokit } from "@octokit/rest";

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listRepos(org: string): Promise<GitHubRepo[]> {
    const repos = await this.octokit.paginate(this.octokit.repos.listForOrg, { org });
    return repos.map(mapRepo);
  }

  async getBranchProtection(owner: string, repo: string, branch: string): Promise<BranchProtection> {
    const { data } = await this.octokit.repos.getBranchProtection({ owner, repo, branch });
    return mapBranchProtection(data);
  }

  async getWorkflows(owner: string, repo: string): Promise<Workflow[]> {
    const { data } = await this.octokit.actions.listRepoWorkflows({ owner, repo });
    return data.workflows.map(mapWorkflow);
  }

  // ... more methods
}
```

### Task 16: Jira Client

Implement REST v3 endpoints:

- `GET /rest/api/3/search` — JQL search
- `GET /rest/api/3/issue/{key}` — get issue
- `POST /rest/api/3/issue` — create issue
- `PUT /rest/api/3/issue/{key}` — update issue
- `POST /rest/api/3/issue/{key}/transitions` — transition status

### Task 17: Confluence Client

Implement REST v2 endpoints:

- `GET /wiki/api/v2/pages` — list pages
- `GET /wiki/api/v2/pages/{id}` — get page
- `POST /wiki/api/v2/pages` — create page
- `PUT /wiki/api/v2/pages/{id}` — update page
- `GET /wiki/api/v2/search` — CQL search

### Task 18: RepositoryProvider Interface

```typescript
export interface RepositoryProvider {
  readonly providerName: "azure-devops" | "github";

  listRepos(): Promise<RepoInfo[]>;
  getRepo(id: string): Promise<RepoInfo>;
  getBranches(repoId: string): Promise<BranchInfo[]>;
  getBranchProtection(repoId: string, branch: string): Promise<BranchProtectionInfo>;
  getPipelineConfig(repoId: string): Promise<PipelineConfig | null>;
  getCodeOwners(repoId: string): Promise<string | null>;
}

export interface RepoInfo {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  url: string;
  cloneUrl: string;
  provider: "azure-devops" | "github";
  lastActivity: Date;
}

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
}

export interface BranchProtectionInfo {
  requiresPR: boolean;
  requiredReviewers: number;
  requiresStatusChecks: boolean;
  statusChecks: string[];
  requiresLinearHistory: boolean;
}

export interface PipelineConfig {
  type: "azure-pipelines" | "github-actions" | "jenkins";
  filePath: string;
  content: string;
  stages: string[];
  hasTests: boolean;
  hasCoverage: boolean;
  hasQualityGate: boolean;
  hasSecurity: boolean;
}
```

---

## Phase 3: Tech Stack Adapters

### Implementation Pattern

Each adapter extends the abstract `BaseAdapter`:

```typescript
// src/adapters/base-adapter.ts
import type { TechnologyAdapter, DetectionResult, ClaudeMDSection } from "../core/adapter-types.js";
import { glob } from "glob";

export abstract class BaseAdapter implements TechnologyAdapter {
  abstract readonly name: string;
  abstract readonly displayName: string;

  async detect(dir: string): Promise<DetectionResult> {
    const markers = await this.findMarkers(dir);
    if (markers.length === 0) {
      return { detected: false, confidence: 0, markers: [] };
    }
    return this.analyzeMarkers(dir, markers);
  }

  protected abstract getMarkerPatterns(): string[];
  protected abstract analyzeMarkers(dir: string, markers: string[]): Promise<DetectionResult>;

  private async findMarkers(dir: string): Promise<string[]> {
    const patterns = this.getMarkerPatterns();
    const found: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { cwd: dir, maxDepth: 3 });
      found.push(...matches);
    }
    return found;
  }

  // Default implementations for unsupported features
  getCoverageCommand() { return null; }
  async parseCoverageReport(_path: string) { return { totalLines: 0, coveredLines: 0, percentage: 0, packages: [] }; }
  getMutationCommand() { return null; }
  async parseMutationReport(_path: string) { return { totalMutants: 0, killedMutants: 0, survivedMutants: 0, score: 0, modules: [] }; }
  getArchCommand() { return null; }
  getLintCommand() { return null; }
  getSASTTools(): ToolInfo[] { return []; }
  getSCATools(): ToolInfo[] { return []; }
  getSecretsTools(): ToolInfo[] {
    return [
      { name: "gitleaks", command: "gitleaks detect", installCommand: "brew install gitleaks", description: "Scan for secrets in git history" },
    ];
  }
  getClaudeMDSections(): ClaudeMDSection[] { return []; }
  getSettingsOverrides() { return {}; }
  getCITemplateName() { return "generic"; }
}
```

### Task 21: JavaAdapter

```typescript
// src/adapters/java/java-adapter.ts
import { BaseAdapter } from "../base-adapter.js";
import type { DetectionResult, CoverageCommand, MutationCommand, ToolInfo, ClaudeMDSection } from "../../core/adapter-types.js";

export class JavaAdapter extends BaseAdapter {
  readonly name = "java";
  readonly displayName = "Java";

  protected getMarkerPatterns(): string[] {
    return ["pom.xml", "build.gradle", "build.gradle.kts", "**/pom.xml", "**/build.gradle"];
  }

  protected async analyzeMarkers(dir: string, markers: string[]): Promise<DetectionResult> {
    const isMaven = markers.some((m) => m.endsWith("pom.xml"));
    const isGradle = markers.some((m) => m.includes("build.gradle"));

    return {
      detected: true,
      confidence: 0.95,
      buildSystem: isMaven ? "maven" : "gradle",
      markers,
    };
  }

  getCoverageCommand(): CoverageCommand {
    // Assumes JaCoCo is configured in the build
    return {
      command: "mvn",
      args: ["test", "jacoco:report"],
      reportPath: "target/site/jacoco/jacoco.xml",
      reportFormat: "jacoco-xml",
    };
  }

  getMutationCommand(): MutationCommand {
    return {
      command: "mvn",
      args: ["test-compile", "org.pitest:pitest-maven:mutationCoverage"],
      reportPath: "target/pit-reports/mutations.xml",
      reportFormat: "pit-xml",
    };
  }

  getSASTTools(): ToolInfo[] {
    return [
      { name: "SpotBugs", command: "mvn spotbugs:check", configFile: "spotbugs-exclude.xml", description: "Java static analysis" },
      { name: "PMD", command: "mvn pmd:check", configFile: "pmd-rules.xml", description: "Java code quality rules" },
    ];
  }

  getSCATools(): ToolInfo[] {
    return [
      { name: "OWASP Dependency-Check", command: "mvn org.owasp:dependency-check-maven:check", description: "Dependency vulnerability scanner" },
    ];
  }

  getClaudeMDSections(): ClaudeMDSection[] {
    return [
      {
        title: "Java Development",
        order: 10,
        content: `## Java Development

### Build & Test
- Build: \`mvn clean install\` or \`gradle build\`
- Test: \`mvn test\` or \`gradle test\`
- Coverage: \`mvn test jacoco:report\` (report at target/site/jacoco/index.html)
- Mutation: \`mvn test-compile org.pitest:pitest-maven:mutationCoverage\`

### Code Style
- Follow team's checkstyle/PMD rules
- No suppressed warnings without documented justification
- Use records for DTOs, sealed interfaces for algebraic types

### Architecture Rules (ArchUnit)
- Domain layer must not depend on infrastructure
- No circular package dependencies
- Repository implementations in infrastructure package only
`,
      },
    ];
  }

  getCITemplateName(): string {
    return "java-maven"; // or "java-gradle" based on detection
  }
}
```

Follow the same pattern for Tasks 22-25 (DotNetAdapter, TypeScriptAdapter, DelphiAdapter, FoxProAdapter), adjusting the tool names, commands, and CLAUDE.md sections for each technology.

---

## Phase 4: Readiness Assessment Engine

### Scoring Model

Each dimension scores 0-5. The scoring criteria are consistent across dimensions:

| Score | Meaning |
|-------|---------|
| 0 | Nothing in place |
| 1 | Minimal / exists but non-functional |
| 2 | Basic / below industry standard |
| 3 | Adequate / meets minimum standard |
| 4 | Good / above average |
| 5 | Excellent / best practice |

### Task 27: CICDAnalyzer

```typescript
// src/core/assessment/cicd-analyzer.ts
import type { RepositoryProvider, PipelineConfig } from "../../integrations/repository-provider.js";

export interface CICDScore {
  score: number; // 0-5
  dimension: "cicd";
  details: {
    hasPipeline: boolean;
    hasBuildStep: boolean;
    hasTestStep: boolean;
    hasQualityGate: boolean;
    hasDeploymentStage: boolean;
    pipelineType: string | null;
    findings: string[];
  };
}

export class CICDAnalyzer {
  async analyze(dir: string, provider?: RepositoryProvider): Promise<CICDScore> {
    // 1. Check for pipeline files in the repo directory
    // 2. Parse pipeline content to identify stages
    // 3. Score based on what's present

    // Detection order: azure-pipelines.yml, .github/workflows/*.yml, Jenkinsfile
    const findings: string[] = [];
    let score = 0;

    // ... implementation with file scanning and scoring logic

    return {
      score,
      dimension: "cicd",
      details: {
        hasPipeline: score >= 1,
        hasBuildStep: score >= 2,
        hasTestStep: score >= 3,
        hasQualityGate: score >= 4,
        hasDeploymentStage: score >= 5,
        pipelineType: null,
        findings,
      },
    };
  }
}
```

Follow the same pattern for Tasks 28-32, implementing each analyzer with its specific detection logic and scoring criteria.

### Task 33: WaveAssigner

```typescript
// src/core/assessment/wave-assigner.ts

export interface WaveAssignment {
  wave: 1 | 2 | 3 | 4;
  waveName: string;
  totalScore: number;
  maxScore: number;
  description: string;
  recommendation: string;
}

const WAVE_DEFINITIONS = [
  { wave: 1 as const, name: "AI-Ready", min: 24, max: 30, description: "Full AI-assisted development capable", recommendation: "Run the full init wizard and start using all skills immediately." },
  { wave: 2 as const, name: "Near-Ready", min: 18, max: 23, description: "Minor gaps to address before full AI adoption", recommendation: "Run init wizard, then focus on improvement plan for scoring dimensions below 4." },
  { wave: 3 as const, name: "Foundation Needed", min: 12, max: 17, description: "Significant infrastructure gaps", recommendation: "Run init wizard in guided mode. Focus on CI/CD and coverage first." },
  { wave: 4 as const, name: "Legacy Transformation", min: 0, max: 11, description: "Major modernization needed", recommendation: "Start with basic CI/CD setup and documentation. AI skills will be limited initially." },
] as const;

export function assignWave(scores: Record<string, number>): WaveAssignment {
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const maxScore = Object.keys(scores).length * 5;

  for (const def of WAVE_DEFINITIONS) {
    if (totalScore >= def.min) {
      return {
        wave: def.wave,
        waveName: def.name,
        totalScore,
        maxScore,
        description: def.description,
        recommendation: def.recommendation,
      };
    }
  }

  return {
    wave: 4,
    waveName: "Legacy Transformation",
    totalScore,
    maxScore,
    description: WAVE_DEFINITIONS[3].description,
    recommendation: WAVE_DEFINITIONS[3].recommendation,
  };
}
```

### Task 34: ImprovementPlanGenerator

```typescript
// src/core/assessment/improvement-plan.ts

export interface ImprovementAction {
  dimension: string;
  currentScore: number;
  targetScore: number;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  effort: "S" | "M" | "L" | "XL";
  steps: string[];
}

export function generateImprovementPlan(
  scores: Record<string, number>,
  techStack: string[],
): ImprovementAction[] {
  const actions: ImprovementAction[] = [];

  for (const [dimension, score] of Object.entries(scores)) {
    if (score >= 4) continue; // No improvement needed

    const dimensionActions = getActionsForDimension(dimension, score, techStack);
    actions.push(...dimensionActions);
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function getActionsForDimension(
  dimension: string,
  currentScore: number,
  techStack: string[],
): ImprovementAction[] {
  // Return specific, actionable improvement steps based on the dimension and current score.
  // Each action includes concrete steps (install X, configure Y, add Z to pipeline).
  // Implementations are tech-stack-aware (different tools for Java vs .NET vs TS).
  // ...
  return [];
}
```

---

## Phase 5: The Init Wizard

### XState Machine (Task 48)

The wizard uses XState v5 for state management:

```typescript
// src/cli/wizard/wizard-machine.ts
import { createMachine, assign } from "xstate";

interface WizardContext {
  techStack: string[];
  provider: "azure-devops" | "github" | null;
  assessmentScores: Record<string, number>;
  wave: number;
  generatedFiles: string[];
  errors: Array<{ step: string; error: string }>;
  skippedSteps: string[];
}

type WizardEvent =
  | { type: "NEXT" }
  | { type: "SKIP" }
  | { type: "RETRY" }
  | { type: "BACK" }
  | { type: "ERROR"; error: string }
  | { type: "COMPLETE"; data: Record<string, unknown> };

export const wizardMachine = createMachine({
  id: "dafke-wizard",
  initial: "welcome",
  context: {
    techStack: [],
    provider: null,
    assessmentScores: {},
    wave: 0,
    generatedFiles: [],
    errors: [],
    skippedSteps: [],
  } satisfies WizardContext,
  states: {
    welcome: {
      on: {
        NEXT: "detection",
        ERROR: {
          target: "error",
          actions: assign({
            errors: ({ context, event }) => [
              ...context.errors,
              { step: "welcome", error: event.error },
            ],
          }),
        },
      },
    },
    detection: {
      on: {
        NEXT: "assessment",
        SKIP: {
          target: "assessment",
          actions: assign({
            skippedSteps: ({ context }) => [...context.skippedSteps, "detection"],
          }),
        },
        BACK: "welcome",
        ERROR: {
          target: "error",
          actions: assign({
            errors: ({ context, event }) => [
              ...context.errors,
              { step: "detection", error: event.error },
            ],
          }),
        },
      },
    },
    assessment: {
      on: {
        NEXT: "claudemd",
        COMPLETE: {
          target: "claudemd",
          actions: assign({
            assessmentScores: ({ event }) =>
              (event.data as { scores: Record<string, number> }).scores,
            wave: ({ event }) => (event.data as { wave: number }).wave,
          }),
        },
        ERROR: { target: "error" },
      },
    },
    claudemd: {
      on: { NEXT: "settings", SKIP: "settings", ERROR: { target: "error" } },
    },
    settings: {
      on: { NEXT: "plugins", SKIP: "plugins", ERROR: { target: "error" } },
    },
    plugins: {
      on: { NEXT: "cicd", SKIP: "cicd", ERROR: { target: "error" } },
    },
    cicd: {
      on: { NEXT: "coverage", SKIP: "coverage", ERROR: { target: "error" } },
    },
    coverage: {
      on: { NEXT: "architecture", SKIP: "architecture", ERROR: { target: "error" } },
    },
    architecture: {
      on: { NEXT: "connections", SKIP: "connections", ERROR: { target: "error" } },
    },
    connections: {
      on: { NEXT: "skills", SKIP: "skills", ERROR: { target: "error" } },
    },
    skills: {
      on: { NEXT: "verify", SKIP: "verify", ERROR: { target: "error" } },
    },
    verify: {
      on: { NEXT: "done", ERROR: { target: "error" } },
    },
    done: {
      type: "final",
    },
    error: {
      on: {
        RETRY: {
          // Return to the step that failed
          target: "welcome", // Dynamic — use history or context
        },
        SKIP: {
          // Skip the failed step and continue
          target: "welcome", // Dynamic
        },
      },
    },
  },
});
```

### Wizard Step Pattern

Each wizard step follows this pattern:

```typescript
// src/cli/wizard/step-NN-name.ts
import * as p from "@clack/prompts";
import type { StateManager } from "../../core/state/state-manager.js";
import type { WizardStepResult } from "../../core/state/state-schema.js";

export interface StepInput {
  stateManager: StateManager;
  // ... other dependencies injected by the orchestrator
}

export interface StepOutput {
  // Step-specific output data
}

export async function runStep(input: StepInput): Promise<WizardStepResult> {
  const startedAt = new Date().toISOString();

  try {
    p.intro("Step N: Step Title");

    // ... step implementation using @clack/prompts for UI

    const result: StepOutput = {
      // ... collected data
    };

    return {
      step: "step-name",
      status: "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      data: result as Record<string, unknown>,
    };
  } catch (error) {
    return {
      step: "step-name",
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### Wizard Orchestrator (Task 48)

```typescript
// src/cli/wizard/wizard-orchestrator.ts
import { createActor } from "xstate";
import { wizardMachine } from "./wizard-machine.js";
import { StateManager } from "../../core/state/state-manager.js";
import { ConfigManager } from "../../core/config/config-manager.js";
import { AdapterRegistry } from "../../core/adapter-registry.js";
import * as p from "@clack/prompts";

// Import all steps
import { runStep as runWelcome } from "./step-01-welcome.js";
import { runStep as runDetection } from "./step-02-detection.js";
// ... import all steps

const STEP_RUNNERS: Record<string, (input: StepInput) => Promise<WizardStepResult>> = {
  welcome: runWelcome,
  detection: runDetection,
  // ... all steps
};

export class WizardOrchestrator {
  private readonly stateManager: StateManager;
  private readonly configManager: ConfigManager;
  private readonly adapterRegistry: AdapterRegistry;

  constructor(projectRoot: string) {
    this.stateManager = new StateManager(projectRoot);
    this.configManager = new ConfigManager(projectRoot);
    this.adapterRegistry = new AdapterRegistry();
  }

  async run(options: { resume?: boolean; skip?: string[] }): Promise<void> {
    // Initialize or resume state
    let state;
    if (options.resume) {
      state = await this.stateManager.resume();
      p.log.info(`Resuming from step: ${state.currentStep}`);
    } else {
      state = await this.stateManager.init();
    }

    // Create and start the XState actor
    const actor = createActor(wizardMachine, {
      // If resuming, start from the saved step
      snapshot: options.resume ? this.getSnapshotForStep(state.currentStep) : undefined,
    });
    actor.start();

    // Run steps in sequence
    let currentStep = state.currentStep;

    while (currentStep !== "done") {
      if (options.skip?.includes(currentStep)) {
        actor.send({ type: "SKIP" });
        await this.stateManager.checkpoint(
          { step: currentStep, status: "skipped", startedAt: new Date().toISOString() },
          this.getNextStep(currentStep),
        );
        currentStep = this.getNextStep(currentStep);
        continue;
      }

      const runner = STEP_RUNNERS[currentStep];
      if (!runner) {
        throw new Error(`Unknown wizard step: ${currentStep}`);
      }

      const result = await runner({
        stateManager: this.stateManager,
        configManager: this.configManager,
        adapterRegistry: this.adapterRegistry,
      });

      if (result.status === "completed") {
        const nextStep = this.getNextStep(currentStep);
        await this.stateManager.checkpoint(result, nextStep);
        actor.send({ type: "NEXT" });
        currentStep = nextStep;
      } else if (result.status === "failed") {
        p.log.error(`Step "${currentStep}" failed: ${result.error}`);
        const action = await p.select({
          message: "What would you like to do?",
          options: [
            { value: "retry", label: "Retry this step" },
            { value: "skip", label: "Skip this step" },
            { value: "abort", label: "Abort the wizard" },
          ],
        });

        if (action === "retry") continue;
        if (action === "skip") {
          actor.send({ type: "SKIP" });
          currentStep = this.getNextStep(currentStep);
        }
        if (action === "abort") break;
      }
    }

    await this.stateManager.complete();
    p.outro("Wizard complete! Run 'dafke status' to see your setup.");
  }

  private getNextStep(current: string): string {
    const order = [
      "welcome", "detection", "assessment", "claudemd", "settings",
      "plugins", "cicd", "coverage", "architecture", "connections",
      "skills", "verify", "done",
    ];
    const idx = order.indexOf(current);
    return order[idx + 1] ?? "done";
  }

  private getSnapshotForStep(_step: string): unknown {
    // Create an XState snapshot that starts from the given step
    return undefined; // TODO: implement snapshot creation
  }
}
```

---

## Phase 6: Skills Development

### SKILL.md Standard Format

Every skill follows this format:

```markdown
---
name: dafke-<name>
trigger: /dafke-<name>
description: One-line description
version: 1.0.0
author: Dafke
tags: [dafke, <category>]
requires:
  - dafke (configured via `dafke init`)
inputs:
  - name: arg1
    type: string
    required: true
    description: Description of arg1
---

# /dafke-<name>

> One-line description of what this skill does.

## When to Use

- Bullet list of triggers / situations

## Prerequisites

- What must be configured before this skill works

## Steps

1. Step-by-step instructions for Claude Code to follow
2. Each step is an actionable instruction
3. Steps reference tools (Read, Bash, Edit, etc.)

## Output Format

Describe the expected output format.

## Error Handling

What to do when things go wrong.

## Examples

### Example 1: [Scenario]
```
/dafke-<name> <args>
```
Expected behavior description.
```

### Task 50: /dafke-backlog

The SKILL.md should instruct Claude Code to:
1. Read the connection config from `.dafke.yaml`
2. Use the appropriate integration (Jira JQL or Azure DevOps WIQL) to list current sprint items
3. Format results as a terminal table: ID | Title | Status | Assignee | Points | Priority
4. Support filtering via arguments: `--status`, `--assignee`, `--sprint`

### Task 51: /dafke-story

Instructions for Claude Code to:
1. Accept a story/work item ID as argument
2. Fetch full details from Jira/Azure DevOps
3. Display: title, description, acceptance criteria, linked items
4. Parse ACs into a numbered checklist
5. Validate ACs are testable (each has a "given/when/then" or equivalent)

### Task 52: /dafke-plan

Instructions for Claude Code to:
1. Read the story (via /dafke-story internally)
2. Analyze the codebase using GitNexus (`gitnexus_query`, `gitnexus_context`)
3. For each AC, identify: files to modify, new files to create, tests to write
4. Generate a step-by-step implementation plan in markdown
5. Save the plan to `.dafke/plans/<story-id>.md`
6. Estimate complexity per step

### Task 53: /dafke-dev

Instructions for Claude Code to:
1. Load the implementation plan (from /dafke-plan)
2. Dispatch parallel agents for independent tasks (using the dafke-dev-team)
3. For each plan step:
   a. Explorer agent: analyze relevant code
   b. Developer agent: implement the change
   c. Test agent: write and run tests
   d. Reviewer agent: check quality
4. After each step, run the test suite to verify no regressions
5. Create a summary of all changes

### Tasks 54-60

Follow the same SKILL.md format for each skill, with step-by-step instructions tailored to each skill's purpose.

---

## Phase 7: Agent Teams

### Agent Definition Format

```markdown
---
name: <agent-name>
role: <role in the team>
goal: One-line goal
team: dafke-<team-name>
---

# <Agent Name>

## Role
<role description>

## Goal
<what this agent tries to achieve>

## Constraints
- What this agent must NOT do
- Boundaries of its authority

## Tools Allowed
- List of Claude Code tools this agent can use

## Instructions
Step-by-step instructions for this agent's behavior.

## Communication
How this agent communicates with other team members.
```

### Task 61: dafke-dev-team

**Lead Agent**: Orchestrates the development workflow. Reads the implementation plan, assigns tasks to other agents, tracks progress, handles failures.

**Explorer Agent**: Uses GitNexus tools to analyze the codebase. Maps dependencies, identifies affected files, provides context to the Developer.

**Developer Agent**: Writes production code. Uses Edit, Write, Bash tools. Follows the plan step by step. Never writes tests (that's the Test agent's job).

**Test Agent**: Writes unit tests, integration tests. Runs the test suite. Reports coverage. Uses Bash to run test commands.

**Reviewer Agent**: Reviews all changes. Checks: code quality, test coverage, security, style, architecture rules. Creates a review checklist and reports findings.

### Task 62: dafke-assess-team

**Lead Agent**: Orchestrates the assessment. Dispatches dimension-specific agents in parallel. Compiles the scorecard.

**Dimension Agents** (6): Each runs its analyzer (CICDAnalyzer, CoverageAnalyzer, etc.), interprets results, and reports findings with the score and improvement recommendations.

### Task 63: dafke-fix-team

**Lead Agent**: Receives the assessment results and improvement plan. Prioritizes issues by impact.

**Planner Agent**: Creates a concrete fix plan from the improvement recommendations.

**Implementer Agent**: Executes the fixes (adds configs, modifies CI files, installs tools).

**Verifier Agent**: Re-runs assessment after fixes to verify improvement.

---

## Phase 8: Templates

### Task 64: CLAUDE.md Template

The base template structure:

```handlebars
# CLAUDE.md — {{projectName}}

> Generated by dafke v{{version}} on {{generatedAt}}
> Template version: {{templateVersion}}
> DO NOT delete the version header above — it enables drift detection and updates.

## Project Overview

- **Name**: {{projectName}}
- **Tech Stack**: {{#each techStack}}{{.}}{{#if @last}}{{else}}, {{/if}}{{/each}}
- **Repository**: {{repoUrl}}
- **Wave**: {{wave}} ({{waveName}})

## Work Principles

### Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately

### Build & Test Commands

{{#each techStack}}
{{> (lookup ../partials .)}}
{{/each}}

### Code Style
{{#if hasLinter}}
- Run `{{lintCommand}}` before committing
- All lint errors must be resolved, no suppressions without justification
{{/if}}

### Testing Requirements
- All new code must have tests
- Minimum coverage: {{thresholds.coverage}}%
{{#if hasMutationTesting}}
- Mutation score target: {{thresholds.mutationScore}}%
{{/if}}

### Security
- Never commit secrets, tokens, or credentials
- Run `gitleaks detect` before pushing
{{#if hasSAST}}
- SAST: `{{sastCommand}}`
{{/if}}

## Available Skills

| Skill | Description |
|-------|-------------|
{{#each skills}}
| `{{trigger}}` | {{description}} |
{{/each}}

## Agent Teams

{{#each agentTeams}}
### {{name}}
{{description}}
{{/each}}

## Git Workflow
- Branch from `{{defaultBranch}}`
- Branch naming: `feature/<ticket-id>-<short-description>`
- Commit messages: conventional commits format
- PR required for merge to `{{defaultBranch}}`

{{#if techStackSections}}
---
{{#each techStackSections}}
{{content}}

{{/each}}
{{/if}}
```

### Task 65: Hook Templates

Pre-commit hook template:

```handlebars
#!/bin/bash
# Generated by dafke v{{version}}
# Template version: {{templateVersion}}
set -eo pipefail

echo "Running pre-commit checks..."

{{#if hasLinter}}
# Lint
echo "  Linting..."
{{lintCommand}} || { echo "Lint failed"; exit 1; }
{{/if}}

{{#if hasFormatter}}
# Format check
echo "  Checking formatting..."
{{formatCheckCommand}} || { echo "Format check failed"; exit 1; }
{{/if}}

# Secrets detection
echo "  Checking for secrets..."
gitleaks detect --no-banner --redact 2>/dev/null || {
  echo "Potential secrets detected! Review and remove before committing."
  exit 1
}

{{#if hasFastTests}}
# Fast tests (unit tests only)
echo "  Running fast tests..."
{{fastTestCommand}} || { echo "Tests failed"; exit 1; }
{{/if}}

echo "All pre-commit checks passed."
```

### Task 66: CI Pipeline Templates

Azure Pipelines template:

```handlebars
# Generated by dafke v{{version}}
trigger:
  branches:
    include:
      - {{defaultBranch}}
      - feature/*

pool:
  vmImage: '{{vmImage}}'

stages:
  - stage: Build
    jobs:
      - job: BuildAndTest
        steps:
          {{> buildSteps}}
          {{> testSteps}}
          {{> coverageSteps}}
          {{> qualityGateSteps}}

  - stage: SecurityScan
    dependsOn: Build
    jobs:
      - job: Security
        steps:
          {{> securitySteps}}
```

GitHub Actions template:

```handlebars
# Generated by dafke v{{version}}
name: CI

on:
  push:
    branches: [{{defaultBranch}}]
  pull_request:
    branches: [{{defaultBranch}}]

jobs:
  build-and-test:
    runs-on: {{runsOn}}
    steps:
      - uses: actions/checkout@v4
      {{> buildSteps}}
      {{> testSteps}}
      {{> coverageSteps}}

  quality-gate:
    needs: build-and-test
    runs-on: {{runsOn}}
    steps:
      {{> qualityGateSteps}}

  security-scan:
    runs-on: {{runsOn}}
    steps:
      {{> securitySteps}}
```

---

## Phase 9-13: CLI Commands, Self-Healing, Plugin, Docs, Testing

These phases follow the same patterns established above. Key implementation notes:

### CLI Commands (Phase 9)

Each command follows the citty pattern:

```typescript
import { defineCommand } from "citty";
import { ConfigManager } from "../../core/config/config-manager.js";
import { Listr } from "listr2";

export default defineCommand({
  meta: { name: "audit", description: "Run readiness assessment and detect drift" },
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
    markdown: { type: "boolean", description: "Output as Markdown", default: false },
  },
  async run({ args }) {
    const config = await new ConfigManager().read();

    const tasks = new Listr([
      { title: "Running CI/CD analysis", task: async (ctx) => { /* ... */ } },
      { title: "Running coverage analysis", task: async (ctx) => { /* ... */ } },
      { title: "Running security analysis", task: async (ctx) => { /* ... */ } },
      { title: "Running review analysis", task: async (ctx) => { /* ... */ } },
      { title: "Running DORA analysis", task: async (ctx) => { /* ... */ } },
      { title: "Running docs analysis", task: async (ctx) => { /* ... */ } },
      { title: "Detecting config drift", task: async (ctx) => { /* ... */ } },
    ], { concurrent: true });

    const ctx = await tasks.run();

    if (args.json) {
      console.log(JSON.stringify(ctx, null, 2));
    } else {
      // Render terminal scorecard
      renderScorecard(ctx);
    }
  },
});
```

### Self-Healing (Phase 10)

The doctor command runs a checklist of diagnostics:

```typescript
interface Diagnostic {
  name: string;
  description: string;
  check: () => Promise<DiagnosticResult>;
  heal?: () => Promise<void>;
}

interface DiagnosticResult {
  status: "pass" | "fail" | "warn";
  message: string;
  autoFixable: boolean;
}
```

### Plugin Packaging (Phase 11)

The plugin.json manifest:

```json
{
  "name": "dafke",
  "version": "0.1.0",
  "description": "Dafke AI Control Center",
  "skills": [
    { "name": "dafke-backlog", "path": "skills/dafke-backlog/SKILL.md" },
    { "name": "dafke-story", "path": "skills/dafke-story/SKILL.md" }
  ],
  "agents": [
    { "name": "dafke-dev-team", "path": "agents/dafke-dev-team/" }
  ],
  "hooks": {
    "preCommit": "templates/hooks/pre-commit.sh",
    "postToolUse": "templates/hooks/post-tool-use.sh"
  }
}
```

---

## Key Design Decisions

1. **CLI Framework**: `citty` — lightweight, TypeScript-native, ESM-first, lazy command loading for fast startup
2. **Interactive UI**: `@clack/prompts` — beautiful terminal UI with spinners, selects, confirms
3. **Task Display**: `listr2` — concurrent task execution with progress display
4. **Config Resolution**: `cosmiconfig` — walk-up file resolution, multiple format support
5. **State Machine**: `xstate` v5 — formal state machine for wizard flow, prevents invalid transitions
6. **Schema Validation**: `zod` — runtime type validation for configs and API responses
7. **Template Engine**: Custom lightweight — no heavy dependency for simple variable substitution
8. **Process Execution**: `execa` — better child process management than raw `child_process`

## Quality Requirements

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess`, no `any` types (eslint rule)
- **80%+ test coverage** — enforced via Vitest coverage thresholds
- **All async operations have proper error handling** — no unhandled rejections, all errors are typed
- **All file writes are atomic** — write to temp file, then rename (prevents corruption on crash)
- **CLI startup < 500ms** — measured via performance tests, enforced via lazy imports
- **Every wizard step is independently testable** — pure functions with dependency injection
- **All operations are idempotent** — running `dafke init` twice produces the same result
- **State is checkpointed after every wizard step** — crash recovery is automatic

## Architecture Patterns

- **Config**: cosmiconfig walk-up with `root: true` stop. Zod-validated schemas. Atomic writes.
- **State**: Checkpoint-based with atomic JSON writes. Lock file for concurrency.
- **Adapters**: Strategy pattern with auto-detection from marker files. Lazy-loaded via dynamic import.
- **Integrations**: Adapter pattern with unified `RepositoryProvider` interface. Retries + rate limiting.
- **Skills**: SKILL.md files with YAML frontmatter + step-by-step instructions for Claude Code.
- **Agents**: Markdown definitions with role/goal/constraints/tools/instructions.
- **Templates**: Handlebars-style with conditionals, loops, and partials. Version-stamped output.

## Testing Strategy

- **Unit tests** for core modules (Vitest) — config, state, adapters, assessment, template engine
- **Integration tests** for adapters (fixture repos) — detect, parse reports, generate configs
- **Integration tests** for external clients (MSW mocks) — auth, CRUD, pagination, errors
- **E2E tests** for wizard flow — full init from scratch, resume, skip steps
- **E2E tests** for CLI commands — each command with fixture data
- **Performance tests** — CLI startup time, wizard step latency
- **Live tests** (manual) — real Azure DevOps and GitHub repos

## What to Build First

**Priority order for fastest path to a working system:**

1. **Phase 0** — scaffolding (must be first)
2. **Phase 1** — core engine (everything depends on this)
3. **Phase 5, Tasks 36-39, 48** — get the wizard skeleton working with welcome + detection + assessment + CLAUDE.md generation
4. **Phase 3, Task 23** — TypeScript adapter (test with dafke itself)
5. **Phase 5, Tasks 40-47** — complete the remaining wizard steps
6. **Phase 8** — templates (needed for wizard to generate files)
7. **Phase 6, Tasks 50-55** — core development skills (backlog -> story -> plan -> dev -> review -> PR)
8. **Phase 7** — agent teams
9. **Phase 9** — CLI commands (audit, status, doctor)
10. **Phase 2** — external integrations (can be stubbed initially)
11. **Phases 10-13** — polish, packaging, docs, hardening

This order gets you a working `dafke init` as fast as possible, then fills in the breadth of skills and commands.

## File Naming Conventions

- Source files: `kebab-case.ts` (e.g., `config-manager.ts`)
- Test files: `kebab-case.test.ts` (e.g., `config-manager.test.ts`)
- Barrel exports: `index.ts` in every module directory
- Templates: `name.ext.hbs` (e.g., `settings.json.hbs`)
- Skills: `skills/dafke-*/SKILL.md`
- Agents: `agents/dafke-*/role-name.md`

## Error Handling Contract

Every function that can fail must:

1. Throw a typed error from `src/utils/errors.ts`
2. Include a user-friendly message
3. Include recovery guidance (what to do next)
4. Be catchable by the wizard orchestrator for retry/skip

```typescript
// src/utils/errors.ts
export class DafkeCCError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recovery?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "DafkeCCError";
  }
}

export class ConfigError extends DafkeCCError {
  constructor(message: string, recovery?: string, cause?: Error) {
    super(message, "CONFIG_ERROR", recovery, cause);
  }
}

export class IntegrationError extends DafkeCCError {
  constructor(message: string, provider: string, recovery?: string, cause?: Error) {
    super(`[${provider}] ${message}`, "INTEGRATION_ERROR", recovery, cause);
  }
}

export class AdapterError extends DafkeCCError {
  constructor(message: string, adapter: string, recovery?: string, cause?: Error) {
    super(`[${adapter}] ${message}`, "ADAPTER_ERROR", recovery, cause);
  }
}
```

## Generated File Version Header

Every file generated by dafke includes a version header comment:

```
# Generated by dafke v0.1.0
# Template version: claude-md-base@1.0.0
# Generated at: 2026-04-16T10:00:00.000Z
# DO NOT delete this header — it enables drift detection and updates.
```

This header is used by the DriftDetector and UpdateChecker to manage the file lifecycle.
