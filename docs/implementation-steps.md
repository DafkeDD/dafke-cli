# Dafke AI Control Center — Implementation Steps

> Numbered todo-list organized by phase. Each task includes complexity, dependencies, and files to create/modify.
>
> **Complexity key**: S = hours, M = half-day, L = full day, XL = multi-day

---

## Phase 0: Project Scaffolding (Foundation)

### 1. Initialize npm project with TypeScript, ESM, strict mode
- **Complexity**: S
- **Dependencies**: None
- **Description**: Run `npm init`, configure `package.json` with `"type": "module"`, `"engines": { "node": ">=20" }`. Initialize `tsconfig.json` with strict mode, ESM module resolution (`"module": "Node16"`, `"moduleResolution": "Node16"`), path aliases, and `"outDir": "dist"`.
- **Files to create**:
  - `package.json`
  - `tsconfig.json`
  - `tsconfig.build.json` (extends base, excludes tests)

### 2. Set up build system (tsup for single-file CLI output)
- **Complexity**: S
- **Dependencies**: Task 1
- **Description**: Configure tsup to produce a single ESM bundle for the CLI entry point. Add `"bin": { "dafke": "./dist/cli.mjs" }` to package.json. Configure banner with `#!/usr/bin/env node`.
- **Files to create/modify**:
  - `tsup.config.ts`
  - `package.json` (add bin field, build scripts)

### 3. Configure ESLint + Prettier
- **Complexity**: S
- **Dependencies**: Task 1
- **Description**: Set up ESLint flat config with `@typescript-eslint/parser`, strict rules, no-`any` rule. Configure Prettier with consistent formatting. Add lint-staged for pre-commit.
- **Files to create**:
  - `eslint.config.js`
  - `.prettierrc`
  - `.prettierignore`

### 4. Set up Vitest for testing
- **Complexity**: S
- **Dependencies**: Task 1
- **Description**: Configure Vitest with TypeScript path alias resolution, coverage via `@vitest/coverage-v8`, and a global setup file for shared test utilities.
- **Files to create**:
  - `vitest.config.ts`
  - `tests/setup.ts`

### 5. Create project directory structure
- **Complexity**: S
- **Dependencies**: Task 1
- **Description**: Create all directories with `.gitkeep` files where needed. This is the canonical layout for the entire project.
- **Directories to create**:
  ```
  dafke/
  ├── src/
  │   ├── cli/           # CLI entry point + commands
  │   ├── core/          # Core engine (config, state, analyzer, scaffold, updater)
  │   ├── adapters/      # Tech stack adapters
  │   ├── integrations/  # Azure DevOps, GitHub, Jira, Confluence
  │   ├── skills/        # /dafke-* skill definitions
  │   ├── agents/        # Agent team definitions
  │   ├── templates/     # CLAUDE.md, hooks, CI pipeline templates
  │   └── utils/         # Shared utilities
  ├── templates/
  │   ├── claude-md/     # CLAUDE.md templates per tech stack
  │   ├── hooks/         # Hook templates
  │   ├── ci/            # CI pipeline templates
  │   └── settings/      # settings.json templates
  ├── skills/            # SKILL.md files for Claude Code
  │   ├── dafke-backlog/
  │   ├── dafke-story/
  │   ├── dafke-plan/
  │   ├── dafke-dev/
  │   ├── dafke-review/
  │   ├── dafke-pr/
  │   ├── dafke-ci/
  │   ├── dafke-deploy/
  │   ├── dafke-init/
  │   ├── dafke-audit/
  │   ├── dafke-update/
  │   ├── dafke-doctor/
  │   ├── dafke-gate/
  │   ├── dafke-coverage/
  │   ├── dafke-mutate/
  │   ├── dafke-security/
  │   ├── dafke-arch/
  │   ├── dafke-lint/
  │   ├── dafke-spec/
  │   ├── dafke-spec-verify/
  │   └── dafke-spec-update/
  ├── agents/            # Agent .md definitions
  │   ├── dafke-dev-team/
  │   ├── dafke-assess-team/
  │   └── dafke-fix-team/
  └── tests/
      ├── unit/
      ├── integration/
      └── e2e/
  ```

### 6. Install core dependencies
- **Complexity**: S
- **Dependencies**: Task 1
- **Description**: Install runtime dependencies: `citty` (CLI framework), `@clack/prompts` (interactive wizard), `listr2` (task execution display), `chalk` (terminal colors), `cosmiconfig` (config resolution), `xstate` (state machine for wizard), `update-notifier` (npm version checks), `yaml` (YAML parsing), `zod` (schema validation), `execa` (process execution). Dev dependencies: `tsup`, `vitest`, `@vitest/coverage-v8`, `typescript`, `eslint`, `prettier`.
- **Files to modify**:
  - `package.json`

### 7. Create CLI entry point with citty command structure
- **Complexity**: M
- **Dependencies**: Tasks 1-6
- **Description**: Create the main CLI entry point using citty. Register all top-level commands: `init`, `audit`, `update`, `status`, `doctor`, `connect`, `repos`, `migrate`. Each command is a lazy-loaded module. Add `--version`, `--help`, `--verbose`, `--config` global flags.
- **Files to create**:
  - `src/cli/index.ts` (main entry, citty app definition)
  - `src/cli/commands/init.ts` (placeholder)
  - `src/cli/commands/audit.ts` (placeholder)
  - `src/cli/commands/update.ts` (placeholder)
  - `src/cli/commands/status.ts` (placeholder)
  - `src/cli/commands/doctor.ts` (placeholder)
  - `src/cli/commands/connect.ts` (placeholder)
  - `src/cli/commands/repos.ts` (placeholder)
  - `src/cli/commands/migrate.ts` (placeholder)

---

## Phase 1: Core Engine

### 8. Implement ConfigManager: read/write/merge config files
- **Complexity**: L
- **Dependencies**: Tasks 1-7
- **Description**: Build the configuration system using cosmiconfig. Support config files at: `.dafke.yaml`, `.dafke.json`, `dafke.config.ts`, and `package.json#dafke`. Implement walk-up resolution with `root: true` stop. Support `extends` for base configs. Provide typed access via Zod-validated schemas. Handle `read()`, `write()`, `merge()`, and `validate()` operations. All writes are atomic (write to temp file, then rename).
- **Files to create**:
  - `src/core/config/config-manager.ts`
  - `src/core/config/config-schema.ts` (Zod schema definitions)
  - `src/core/config/config-types.ts` (TypeScript types derived from Zod)
  - `src/core/config/index.ts` (barrel export)
  - `tests/unit/core/config/config-manager.test.ts`

### 9. Implement StateManager: checkpoint-based resumable state
- **Complexity**: L
- **Dependencies**: Task 8
- **Description**: Build the wizard state persistence system. State is a JSON file at `.dafke/.state.json` containing: current wizard step, completed steps with their outputs, authentication tokens, detected tech stack, assessment scores, and a version field. Every wizard step writes a checkpoint after completion. Resuming reads the last checkpoint and continues from there. Implement `save()`, `load()`, `checkpoint()`, `resume()`, `reset()`, `getStepResult()`. All writes are atomic. Include a lock file mechanism to prevent concurrent runs.
- **Files to create**:
  - `src/core/state/state-manager.ts`
  - `src/core/state/state-schema.ts`
  - `src/core/state/state-types.ts`
  - `src/core/state/index.ts`
  - `tests/unit/core/state/state-manager.test.ts`

### 10. Implement AdapterRegistry: detect tech stack, lazy-load adapters
- **Complexity**: M
- **Dependencies**: Task 8
- **Description**: Build a registry that auto-detects the project's tech stack by scanning for marker files (pom.xml, build.gradle, .csproj, package.json, .dpr, .prg). Each adapter is registered with detection rules (file patterns, priority). The registry returns the best-matching adapter(s) for a given directory. Adapters are lazy-loaded (dynamic import) to keep CLI startup fast. Support multi-stack projects (e.g., Java backend + TypeScript frontend).
- **Files to create**:
  - `src/core/adapter-registry.ts`
  - `src/core/adapter-types.ts` (TechnologyAdapter interface)
  - `tests/unit/core/adapter-registry.test.ts`

### 11. Implement TemplateEngine: render templates with variable substitution
- **Complexity**: M
- **Dependencies**: Task 8
- **Description**: Build a template engine that reads `.hbs` or `.ejs` template files from `templates/` and renders them with context variables. Support conditionals (if tech stack is Java, include JaCoCo section), loops (for each adapter), and partials (shared sections). The engine produces fully rendered files (CLAUDE.md, settings.json, hook scripts). Use a simple Handlebars-like syntax — no need for a full templating library; implement a lightweight mustache-style renderer with `{{variable}}`, `{{#if condition}}...{{/if}}`, and `{{#each items}}...{{/each}}`.
- **Files to create**:
  - `src/core/template-engine.ts`
  - `tests/unit/core/template-engine.test.ts`

### 12. Implement UpdateChecker: background npm registry check + drift detection
- **Complexity**: M
- **Dependencies**: Task 8
- **Description**: Check the npm registry for newer versions of dafke on CLI startup (background, non-blocking). Cache the result for 24 hours. Compare generated files against their templates to detect config drift (file was manually edited after generation). Report drift in `dafke status` and `dafke audit`.
- **Files to create**:
  - `src/core/update-checker.ts`
  - `src/core/drift-detector.ts`
  - `tests/unit/core/update-checker.test.ts`
  - `tests/unit/core/drift-detector.test.ts`

### 13. Write tests for all core modules
- **Complexity**: M
- **Dependencies**: Tasks 8-12
- **Description**: Ensure all core modules have comprehensive unit tests. Target 90%+ coverage for core. Test edge cases: missing config files, corrupted state, concurrent access, permission errors.
- **Files to create/modify**:
  - All test files listed in tasks 8-12
  - `tests/fixtures/` (test fixture files: sample configs, state files, template files)

---

## Phase 2: External Integrations

### 14. Implement Azure DevOps client
- **Complexity**: XL
- **Dependencies**: Task 8
- **Description**: Build a typed client for Azure DevOps REST API. Support authentication via Personal Access Token (PAT) and Azure AD (MSAL). Implement: list organizations/projects, list repositories, read pipeline YAML files, list/create/update work items, read branch policies. Handle pagination, rate limiting, and retries. Store auth tokens securely (OS keychain via `keytar` or encrypted config).
- **Files to create**:
  - `src/integrations/azure-devops/client.ts`
  - `src/integrations/azure-devops/auth.ts`
  - `src/integrations/azure-devops/types.ts`
  - `src/integrations/azure-devops/work-items.ts`
  - `src/integrations/azure-devops/repos.ts`
  - `src/integrations/azure-devops/pipelines.ts`
  - `src/integrations/azure-devops/index.ts`
  - `tests/unit/integrations/azure-devops/client.test.ts`

### 15. Implement GitHub client
- **Complexity**: L
- **Dependencies**: Task 8
- **Description**: Build a typed client for GitHub REST + GraphQL APIs. Support authentication via PAT and GitHub App. Implement: list repos, read/write workflow files, read branch protection rules, manage PR reviews. Use Octokit as the underlying client. Handle rate limits and pagination.
- **Files to create**:
  - `src/integrations/github/client.ts`
  - `src/integrations/github/auth.ts`
  - `src/integrations/github/types.ts`
  - `src/integrations/github/repos.ts`
  - `src/integrations/github/workflows.ts`
  - `src/integrations/github/index.ts`
  - `tests/unit/integrations/github/client.test.ts`

### 16. Implement Jira client
- **Complexity**: L
- **Dependencies**: Task 8
- **Description**: Build a typed client for Jira Cloud REST API v3. Support authentication via API token + email. Implement: JQL search, story/task/bug CRUD, status transitions, link management (blocks, relates-to), sprint operations. Handle pagination, rate limiting.
- **Files to create**:
  - `src/integrations/jira/client.ts`
  - `src/integrations/jira/auth.ts`
  - `src/integrations/jira/types.ts`
  - `src/integrations/jira/issues.ts`
  - `src/integrations/jira/search.ts`
  - `src/integrations/jira/index.ts`
  - `tests/unit/integrations/jira/client.test.ts`

### 17. Implement Confluence client
- **Complexity**: M
- **Dependencies**: Task 16 (shares Atlassian auth)
- **Description**: Build a typed client for Confluence Cloud REST API v2. Implement: page CRUD, search (CQL), space listing, content body retrieval. Share authentication with Jira client.
- **Files to create**:
  - `src/integrations/confluence/client.ts`
  - `src/integrations/confluence/types.ts`
  - `src/integrations/confluence/pages.ts`
  - `src/integrations/confluence/index.ts`
  - `tests/unit/integrations/confluence/client.test.ts`

### 18. Create unified RepositoryProvider interface
- **Complexity**: M
- **Dependencies**: Tasks 14, 15
- **Description**: Define a `RepositoryProvider` interface that abstracts over Azure DevOps and GitHub. Operations: `listRepos()`, `getRepo()`, `getBranches()`, `getBranchProtection()`, `getPipelineConfig()`, `getCodeOwners()`. Implement `AzureDevOpsRepoProvider` and `GitHubRepoProvider` that implement this interface. The wizard and CLI commands work against `RepositoryProvider`, never directly against Azure DevOps or GitHub.
- **Files to create**:
  - `src/integrations/repository-provider.ts` (interface)
  - `src/integrations/azure-devops/repo-provider.ts`
  - `src/integrations/github/repo-provider.ts`
  - `tests/unit/integrations/repository-provider.test.ts`

### 19. Write integration tests with mocks
- **Complexity**: M
- **Dependencies**: Tasks 14-18
- **Description**: Write integration tests for all external clients using `msw` (Mock Service Worker) to intercept HTTP requests. Test authentication flows, pagination, error responses (401, 403, 429, 500), and timeout handling.
- **Files to create**:
  - `tests/integration/azure-devops/` (multiple test files)
  - `tests/integration/github/` (multiple test files)
  - `tests/integration/jira/` (multiple test files)
  - `tests/mocks/handlers/` (MSW request handlers)

---

## Phase 3: Tech Stack Adapters

### 20. Define TechnologyAdapter interface
- **Complexity**: M
- **Dependencies**: Task 10
- **Description**: Define the full `TechnologyAdapter` interface that all tech stack adapters must implement. Methods: `detect(dir)` (returns confidence 0-1), `getCoverageCommand()`, `parseCoverageReport(path)`, `getMutationCommand()`, `parseMutationReport(path)`, `getArchRulesCommand()`, `getLintCommand()`, `getSASTTools()`, `getSCATools()`, `getSecretsTools()`, `getCITemplate()`, `getClaudeMDSections()`, `getSettingsOverrides()`.
- **Files to create/modify**:
  - `src/core/adapter-types.ts` (full interface definition)
  - `src/adapters/base-adapter.ts` (abstract base class with shared logic)

### 21. Implement JavaAdapter
- **Complexity**: L
- **Dependencies**: Task 20
- **Description**: Detect Java projects via `pom.xml` or `build.gradle`. Coverage: JaCoCo (parse XML report). Mutation: PIT (parse XML report). Architecture: ArchUnit. SAST: SpotBugs, PMD. SCA: OWASP Dependency-Check. Build system detection: Maven vs Gradle. CI template: Maven/Gradle build + JaCoCo + PIT steps.
- **Files to create**:
  - `src/adapters/java/java-adapter.ts`
  - `src/adapters/java/jacoco-parser.ts`
  - `src/adapters/java/pit-parser.ts`
  - `src/adapters/java/index.ts`
  - `tests/unit/adapters/java/java-adapter.test.ts`
  - `tests/fixtures/java/` (sample pom.xml, JaCoCo report, PIT report)

### 22. Implement DotNetAdapter
- **Complexity**: L
- **Dependencies**: Task 20
- **Description**: Detect .NET projects via `.csproj`, `.sln`, or `global.json`. Coverage: Coverlet (parse Cobertura XML). Mutation: Stryker.NET (parse JSON report). Architecture: NetArchTest. SAST: Roslyn analyzers, SonarQube. SCA: `dotnet list package --vulnerable`. Build system: dotnet CLI.
- **Files to create**:
  - `src/adapters/dotnet/dotnet-adapter.ts`
  - `src/adapters/dotnet/coverlet-parser.ts`
  - `src/adapters/dotnet/stryker-parser.ts`
  - `src/adapters/dotnet/index.ts`
  - `tests/unit/adapters/dotnet/dotnet-adapter.test.ts`
  - `tests/fixtures/dotnet/` (sample .csproj, Cobertura report, Stryker report)

### 23. Implement TypeScriptAdapter
- **Complexity**: L
- **Dependencies**: Task 20
- **Description**: Detect TypeScript projects via `package.json` + `tsconfig.json`. Coverage: c8/istanbul via Vitest or Jest (parse lcov). Mutation: Stryker (parse JSON report). Architecture: dependency-cruiser (parse JSON). SAST: ESLint security plugins. SCA: `npm audit`. Build system: npm/pnpm/yarn detection.
- **Files to create**:
  - `src/adapters/typescript/typescript-adapter.ts`
  - `src/adapters/typescript/coverage-parser.ts`
  - `src/adapters/typescript/stryker-parser.ts`
  - `src/adapters/typescript/index.ts`
  - `tests/unit/adapters/typescript/typescript-adapter.test.ts`
  - `tests/fixtures/typescript/` (sample package.json, lcov, Stryker report)

### 24. Implement DelphiAdapter
- **Complexity**: L
- **Dependencies**: Task 20
- **Description**: Detect Delphi projects via `.dpr`, `.dproj`, or `.groupproj`. Coverage: DelphiCodeCoverage (parse XML/HTML). Mutation: limited support (SonarQube plugin). Architecture: comprehension-only mode (dependency analysis via uses clauses). SAST: SonarQube Delphi plugin. This is a legacy adapter — many features will be in "guidance-only" mode (recommending manual setup).
- **Files to create**:
  - `src/adapters/delphi/delphi-adapter.ts`
  - `src/adapters/delphi/coverage-parser.ts`
  - `src/adapters/delphi/index.ts`
  - `tests/unit/adapters/delphi/delphi-adapter.test.ts`
  - `tests/fixtures/delphi/` (sample .dpr, coverage report)

### 25. Implement FoxProAdapter
- **Complexity**: M
- **Dependencies**: Task 20
- **Description**: Detect FoxPro projects via `.prg`, `.vcx`, `.scx`, or `.pjx` files. This is the most constrained adapter — coverage is basic (line counting), no mutation testing, architecture is comprehension-only. SAST: manual review guidance. The adapter primarily provides CLAUDE.md sections for AI-assisted comprehension and documentation of legacy FoxPro code.
- **Files to create**:
  - `src/adapters/foxpro/foxpro-adapter.ts`
  - `src/adapters/foxpro/index.ts`
  - `tests/unit/adapters/foxpro/foxpro-adapter.test.ts`
  - `tests/fixtures/foxpro/` (sample .prg)

### 26. Write adapter detection tests
- **Complexity**: M
- **Dependencies**: Tasks 21-25
- **Description**: Test that the AdapterRegistry correctly detects each tech stack from fixture directories. Test multi-stack detection (e.g., a repo with both Java and TypeScript). Test priority ordering when multiple adapters match. Test graceful handling of unrecognized projects.
- **Files to create**:
  - `tests/unit/adapters/detection.test.ts`
  - `tests/fixtures/multi-stack/` (mixed project fixture)

---

## Phase 4: Readiness Assessment Engine

### 27. Implement CICDAnalyzer: scan pipeline files, score 0-5
- **Complexity**: L
- **Dependencies**: Tasks 10, 18
- **Description**: Scan the repository for CI/CD pipeline configurations (Azure Pipelines YAML, GitHub Actions, Jenkinsfile). Score based on: pipeline exists (1), has build step (2), has test step (3), has quality gate (4), has deployment stage (5). Parse pipeline files to identify specific stages and jobs.
- **Files to create**:
  - `src/core/assessment/cicd-analyzer.ts`
  - `tests/unit/core/assessment/cicd-analyzer.test.ts`

### 28. Implement CoverageAnalyzer: run coverage tool, parse reports, score 0-5
- **Complexity**: L
- **Dependencies**: Tasks 10, 20
- **Description**: Use the detected tech adapter to run coverage and parse the report. Score: no coverage tooling (0), tooling exists but no reports (1), <30% coverage (2), 30-60% (3), 60-80% (4), >80% (5). Identify uncovered packages/namespaces for gap analysis.
- **Files to create**:
  - `src/core/assessment/coverage-analyzer.ts`
  - `tests/unit/core/assessment/coverage-analyzer.test.ts`

### 29. Implement SecurityAnalyzer: check SAST/SCA/secrets config, score 0-5
- **Complexity**: L
- **Dependencies**: Tasks 10, 20
- **Description**: Check for presence and configuration of SAST tools (static analysis), SCA tools (dependency scanning), and secrets detection (gitleaks, trufflehog). Score: nothing (0), any one tool (1), SAST present (2), SAST + SCA (3), SAST + SCA + secrets (4), all three + CI integration (5).
- **Files to create**:
  - `src/core/assessment/security-analyzer.ts`
  - `tests/unit/core/assessment/security-analyzer.test.ts`

### 30. Implement ReviewAnalyzer: check branch protection, CODEOWNERS, score 0-5
- **Complexity**: M
- **Dependencies**: Tasks 10, 18
- **Description**: Check repository branch protection rules and code review configuration via the RepositoryProvider. Score: no protection (0), branch protection exists (1), requires PR review (2), requires 2+ reviewers (3), has CODEOWNERS (4), CODEOWNERS + status checks required (5).
- **Files to create**:
  - `src/core/assessment/review-analyzer.ts`
  - `tests/unit/core/assessment/review-analyzer.test.ts`

### 31. Implement DORAAnalyzer: estimate from git history, score 0-5
- **Complexity**: L
- **Dependencies**: Task 10
- **Description**: Estimate DORA metrics from git history: deployment frequency (tag/release frequency), lead time (PR open-to-merge), change failure rate (revert commits), mean time to recovery (time between failure and fix). Score based on DORA benchmarks: Elite (5), High (4), Medium (3), Low (2), Unknown (1), No data (0). Use `execa` to run `git log` commands.
- **Files to create**:
  - `src/core/assessment/dora-analyzer.ts`
  - `tests/unit/core/assessment/dora-analyzer.test.ts`

### 32. Implement DocsAnalyzer: check README, CLAUDE.md, architecture docs, score 0-5
- **Complexity**: M
- **Dependencies**: Task 10
- **Description**: Check for presence and quality of documentation files. Score: nothing (0), README exists (1), README + contributing guide (2), + architecture docs (3), + CLAUDE.md (4), + ADRs + API docs (5). Check README quality: has description, installation, usage sections.
- **Files to create**:
  - `src/core/assessment/docs-analyzer.ts`
  - `tests/unit/core/assessment/docs-analyzer.test.ts`

### 33. Implement WaveAssigner: total score to wave assignment
- **Complexity**: M
- **Dependencies**: Tasks 27-32
- **Description**: Sum all dimension scores (max 30) and assign a wave: Wave 1 "AI-Ready" (24-30), Wave 2 "Near-Ready" (18-23), Wave 3 "Foundation Needed" (12-17), Wave 4 "Legacy Transformation" (0-11). Each wave determines the init wizard's behavior (how many steps to run, how aggressive the recommendations).
- **Files to create**:
  - `src/core/assessment/wave-assigner.ts`
  - `tests/unit/core/assessment/wave-assigner.test.ts`

### 34. Implement ImprovementPlanGenerator: per-dimension action plans
- **Complexity**: L
- **Dependencies**: Tasks 27-33
- **Description**: For each dimension scoring below 4, generate a specific, actionable improvement plan. Plans include: what to install/configure, estimated effort, priority (based on impact), and links to relevant docs. The plan is displayed in the wizard and saved to `.dafke/improvement-plan.md`.
- **Files to create**:
  - `src/core/assessment/improvement-plan.ts`
  - `tests/unit/core/assessment/improvement-plan.test.ts`

### 35. Write assessment tests with fixture repos
- **Complexity**: L
- **Dependencies**: Tasks 27-34
- **Description**: Create fixture directories that simulate various repo states (no CI, full CI, partial coverage, etc.). Run the full assessment engine against each fixture and verify scores match expected values. Test the wave assignment boundaries.
- **Files to create**:
  - `tests/integration/assessment/full-assessment.test.ts`
  - `tests/fixtures/repos/wave1-ready/` (high-scoring fixture)
  - `tests/fixtures/repos/wave4-legacy/` (low-scoring fixture)
  - `tests/fixtures/repos/wave2-nearready/` (mid-scoring fixture)

---

## Phase 5: The Init Wizard

### 36. Implement Step 1: Welcome & Authentication
- **Complexity**: M
- **Dependencies**: Tasks 8, 9, 14-17
- **Description**: Display welcome banner and Dafke branding. Detect existing configuration (resume if present). Prompt for platform choice (Azure DevOps, GitHub, or both). Collect authentication tokens (PAT or OAuth flow). Validate tokens by making a test API call. Store validated tokens in the state manager. If Jira/Confluence is desired, collect those credentials too. Use `@clack/prompts` for all interactive elements.
- **Files to create**:
  - `src/cli/wizard/step-01-welcome.ts`
  - `tests/unit/cli/wizard/step-01-welcome.test.ts`

### 37. Implement Step 2: Repository Detection
- **Complexity**: M
- **Dependencies**: Tasks 10, 36
- **Description**: Use the AdapterRegistry to scan the current directory and detect the tech stack. Display detected technologies with confidence scores. Allow the user to confirm, override, or add additional technologies. If run from a mono-repo root, detect sub-projects. Save detection results to state.
- **Files to create**:
  - `src/cli/wizard/step-02-detection.ts`
  - `tests/unit/cli/wizard/step-02-detection.test.ts`

### 38. Implement Step 3: Readiness Assessment
- **Complexity**: L
- **Dependencies**: Tasks 27-34, 37
- **Description**: Run all 6 dimension analyzers against the repository. Display a real-time progress bar using listr2. Render a scorecard table with dimension names, scores (0-5 with colored bars), and the overall wave assignment. Display the improvement plan summary. Save full assessment results to state.
- **Files to create**:
  - `src/cli/wizard/step-03-assessment.ts`
  - `src/cli/wizard/scorecard-renderer.ts` (terminal scorecard display)
  - `tests/unit/cli/wizard/step-03-assessment.test.ts`

### 39. Implement Step 4: CLAUDE.md Generation
- **Complexity**: L
- **Dependencies**: Tasks 11, 37, 38
- **Description**: Use the TemplateEngine to generate a project-specific `CLAUDE.md`. The template includes: project description (from package.json/pom.xml), tech stack rules, build commands, test commands, coverage commands, linting rules, architecture guidelines, security rules, and Dafke-specific workflow instructions (skills, hooks, agents). Render tech-stack-specific sections based on detected adapters. Show a preview and allow the user to edit before writing.
- **Files to create**:
  - `src/cli/wizard/step-04-claudemd.ts`
  - `tests/unit/cli/wizard/step-04-claudemd.test.ts`

### 40. Implement Step 5: Claude Code Settings & Hooks
- **Complexity**: L
- **Dependencies**: Tasks 11, 37
- **Description**: Generate `.claude/settings.json` with: allowed tools, MCP server configuration, permission rules, model preferences. Generate hook scripts: `pre-commit` (lint + format + test), `PostToolUse` (GitNexus/Graphify re-index triggers). Place hooks in `.claude/hooks/`. Show the user what will be created, confirm, then write files.
- **Files to create**:
  - `src/cli/wizard/step-05-settings.ts`
  - `tests/unit/cli/wizard/step-05-settings.test.ts`

### 41. Implement Step 6: Plugin Installation
- **Complexity**: M
- **Dependencies**: Task 40
- **Description**: Execute `claude plugin install dafke` via shell. Verify installation succeeded. If Claude Code is not installed or not in PATH, display manual instructions. Handle errors gracefully (no Claude Code installed, network errors).
- **Files to create**:
  - `src/cli/wizard/step-06-plugins.ts`
  - `tests/unit/cli/wizard/step-06-plugins.test.ts`

### 42. Implement Step 7: CI/CD Hardening
- **Complexity**: L
- **Dependencies**: Tasks 11, 27, 37
- **Description**: Evaluate the existing CI/CD pipeline. If scoring < 4, generate an enhanced pipeline template (Azure Pipelines YAML or GitHub Actions) that adds: test execution, coverage reporting, quality gates (coverage threshold), SAST scan, SCA scan, secrets detection. Show a diff between current and proposed pipeline. Allow the user to accept, modify, or skip.
- **Files to create**:
  - `src/cli/wizard/step-07-cicd.ts`
  - `tests/unit/cli/wizard/step-07-cicd.test.ts`

### 43. Implement Step 8: Test Coverage Deep Analysis
- **Complexity**: L
- **Dependencies**: Tasks 28, 37
- **Description**: Run the tech adapter's coverage command. Parse the coverage report. Identify the 10 least-covered packages/namespaces. Generate a coverage improvement plan (which files to add tests to, in what order). Configure mutation testing tool (PIT/Stryker) with sensible defaults. Generate a `.stryker.conf.js` or `pom.xml` PIT plugin section.
- **Files to create**:
  - `src/cli/wizard/step-08-coverage.ts`
  - `tests/unit/cli/wizard/step-08-coverage.test.ts`

### 44. Implement Step 9: Architecture Documentation
- **Complexity**: L
- **Dependencies**: Tasks 10, 37
- **Description**: Run dependency analysis (dependency-cruiser for TS, jdeps for Java, dotnet-depends for .NET). Generate a Mermaid dependency diagram. Create or update `docs/architecture.md` with the diagram and a component description. Detect circular dependencies and flag them.
- **Files to create**:
  - `src/cli/wizard/step-09-architecture.ts`
  - `tests/unit/cli/wizard/step-09-architecture.test.ts`

### 45. Implement Step 10: Jira/Azure DevOps Connection
- **Complexity**: M
- **Dependencies**: Tasks 14-17, 36
- **Description**: If the user chose to connect Jira or Azure DevOps work items in Step 1, complete the setup here. Validate the connection by listing recent work items. Configure default project/board. Create a `.dafke/connections.yaml` with connection details. Test the full roundtrip: list items, read a specific item.
- **Files to create**:
  - `src/cli/wizard/step-10-connections.ts`
  - `tests/unit/cli/wizard/step-10-connections.test.ts`

### 46. Implement Step 11: Skills & Agent Installation
- **Complexity**: M
- **Dependencies**: Tasks 9, 37
- **Description**: Copy all `skills/dafke-*/SKILL.md` files to `.claude/skills/dafke-*/`. Copy all `agents/dafke-*/` agent definitions to `.claude/agents/dafke-*/`. Generate entries in the project's `CLAUDE.md` for skill discovery (the `### Available Skills` table). Verify all files were written correctly.
- **Files to create**:
  - `src/cli/wizard/step-11-skills.ts`
  - `tests/unit/cli/wizard/step-11-skills.test.ts`

### 47. Implement Step 12: Verification & Summary
- **Complexity**: M
- **Dependencies**: Tasks 36-46
- **Description**: Run `dafke audit` internally to verify everything was set up correctly. Display the final scorecard (before vs. after, showing improvement). List all files created/modified. Offer to create an initial git commit with all changes. Display next steps and daily workflow instructions.
- **Files to create**:
  - `src/cli/wizard/step-12-verify.ts`
  - `tests/unit/cli/wizard/step-12-verify.test.ts`

### 48. Implement wizard orchestrator with XState state machine
- **Complexity**: XL
- **Dependencies**: Tasks 36-47
- **Description**: Build the wizard's state machine using XState v5. States: `welcome`, `detection`, `assessment`, `claudemd`, `settings`, `plugins`, `cicd`, `coverage`, `architecture`, `connections`, `skills`, `verify`, `done`, `error`. Transitions: each state transitions to the next on success, or to `error` on failure. The `error` state captures the error, offers retry or skip, and transitions back. The state machine is the single source of truth for wizard flow. Integrate with StateManager for checkpointing. Support `--skip` flags to skip specific steps. Support `--resume` to continue from the last checkpoint.
- **Files to create**:
  - `src/cli/wizard/wizard-machine.ts` (XState machine definition)
  - `src/cli/wizard/wizard-orchestrator.ts` (execution engine)
  - `src/cli/wizard/index.ts` (barrel export)
  - `tests/unit/cli/wizard/wizard-machine.test.ts`

### 49. Write wizard flow integration tests
- **Complexity**: L
- **Dependencies**: Task 48
- **Description**: Test the full wizard flow from start to finish using mocked integrations. Test resume from each step. Test skip flags. Test error recovery. Test that all files are generated correctly.
- **Files to create**:
  - `tests/integration/wizard/full-flow.test.ts`
  - `tests/integration/wizard/resume.test.ts`
  - `tests/integration/wizard/skip-steps.test.ts`

---

## Phase 6: Skills Development

### 50. Write SKILL.md for /dafke-backlog
- **Complexity**: M
- **Dependencies**: Tasks 14-16
- **Description**: Skill that lists the current sprint's backlog from Jira or Azure DevOps. Shows: item ID, title, status, assignee, story points, priority. Supports filtering by status, assignee, and sprint. Output is formatted for terminal display.
- **Files to create**:
  - `skills/dafke-backlog/SKILL.md`

### 51. Write SKILL.md for /dafke-story
- **Complexity**: M
- **Dependencies**: Task 50
- **Description**: Skill that reads a specific story/work item by ID. Displays: title, description, acceptance criteria, linked items, attachments, comments. Parses acceptance criteria into a checklist. Verifies that ACs are testable and specific.
- **Files to create**:
  - `skills/dafke-story/SKILL.md`

### 52. Write SKILL.md for /dafke-plan
- **Complexity**: L
- **Dependencies**: Task 51
- **Description**: Skill that generates an implementation plan from a story. Reads the story's ACs, analyzes the codebase (via GitNexus), and produces: a list of files to modify, a list of new files to create, test cases to write, edge cases to handle, and a step-by-step implementation order. The plan is saved as a markdown file in the project.
- **Files to create**:
  - `skills/dafke-plan/SKILL.md`

### 53. Write SKILL.md for /dafke-dev
- **Complexity**: L
- **Dependencies**: Task 52
- **Description**: Skill that executes an implementation plan using the dafke-dev-team agent team. Orchestrates: code exploration, implementation, testing, and self-review. Follows the plan step by step, running tests after each significant change. Uses parallel agents for independent tasks.
- **Files to create**:
  - `skills/dafke-dev/SKILL.md`

### 54. Write SKILL.md for /dafke-review
- **Complexity**: L
- **Dependencies**: Task 53
- **Description**: Skill that performs a self-review of changes before creating a PR. Checks: all ACs are met (checklist), test coverage meets threshold, no security issues, code style is consistent, no TODOs left, architecture rules are followed. Generates a review report with pass/fail per check.
- **Files to create**:
  - `skills/dafke-review/SKILL.md`

### 55. Write SKILL.md for /dafke-pr
- **Complexity**: M
- **Dependencies**: Task 54
- **Description**: Skill that creates a pull request linked to the work item. Generates: PR title (from story title), PR description (summary of changes, ACs checklist, test results), reviewer assignment (from CODEOWNERS), labels. Links the PR to the Jira/Azure DevOps item. Updates the work item status to "In Review".
- **Files to create**:
  - `skills/dafke-pr/SKILL.md`

### 56. Write SKILL.md for /dafke-ci
- **Complexity**: M
- **Dependencies**: Task 55
- **Description**: Skill that monitors CI pipeline execution for the current branch. Displays: pipeline status, job results, test results, coverage report. If a job fails, analyzes the failure log and suggests a fix. Can re-trigger the pipeline.
- **Files to create**:
  - `skills/dafke-ci/SKILL.md`

### 57. Write SKILL.md for /dafke-deploy
- **Complexity**: M
- **Dependencies**: Task 56
- **Description**: Skill that monitors deployment status after merge. Tracks: deployment environment, deployment status, health checks post-deploy. If deployment fails, provides rollback guidance.
- **Files to create**:
  - `skills/dafke-deploy/SKILL.md`

### 58. Write SKILL.md for /dafke-init, /dafke-audit, /dafke-update, /dafke-doctor, /dafke-gate
- **Complexity**: L
- **Dependencies**: Tasks 48, 70-74
- **Description**: Write skill definitions for the CLI management skills. `/dafke-init` triggers the init wizard. `/dafke-audit` runs the readiness assessment and displays drift. `/dafke-update` checks for and applies updates. `/dafke-doctor` runs diagnostics and self-healing. `/dafke-gate` runs quality gates (coverage, mutation, security) and reports pass/fail.
- **Files to create**:
  - `skills/dafke-init/SKILL.md`
  - `skills/dafke-audit/SKILL.md`
  - `skills/dafke-update/SKILL.md`
  - `skills/dafke-doctor/SKILL.md`
  - `skills/dafke-gate/SKILL.md`

### 59. Write SKILL.md for /dafke-coverage, /dafke-mutate, /dafke-security, /dafke-arch, /dafke-lint
- **Complexity**: L
- **Dependencies**: Tasks 20-25, 27-29
- **Description**: Write skill definitions for the quality analysis skills. `/dafke-coverage` runs coverage and displays gap analysis. `/dafke-mutate` runs mutation testing and reports surviving mutants. `/dafke-security` runs SAST + SCA + secrets scan. `/dafke-arch` runs architecture analysis (dependency diagrams, circular dependency detection). `/dafke-lint` runs linting and auto-fixes.
- **Files to create**:
  - `skills/dafke-coverage/SKILL.md`
  - `skills/dafke-mutate/SKILL.md`
  - `skills/dafke-security/SKILL.md`
  - `skills/dafke-arch/SKILL.md`
  - `skills/dafke-lint/SKILL.md`

### 60. Write SKILL.md for /dafke-spec, /dafke-spec-verify, /dafke-spec-update
- **Complexity**: L
- **Dependencies**: Task 52
- **Description**: Write skill definitions for specification management. `/dafke-spec` generates a technical specification from a story or feature description. `/dafke-spec-verify` verifies that the implementation matches the specification. `/dafke-spec-update` updates the specification after implementation changes.
- **Files to create**:
  - `skills/dafke-spec/SKILL.md`
  - `skills/dafke-spec-verify/SKILL.md`
  - `skills/dafke-spec-update/SKILL.md`

---

## Phase 7: Agent Teams

### 61. Write agent definition for dafke-dev-team
- **Complexity**: L
- **Dependencies**: Phase 6
- **Description**: Define 5 agent roles for the development team: **Lead** (orchestrates the team, decides task order, manages context), **Explorer** (analyzes codebase via GitNexus, identifies files to modify, maps dependencies), **Developer** (writes production code following the plan), **Test** (writes tests, runs them, verifies coverage), **Reviewer** (reviews changes against ACs, checks quality gates). Each agent gets a `.md` definition file with: role, goal, constraints, tools allowed, and prompt instructions.
- **Files to create**:
  - `agents/dafke-dev-team/lead.md`
  - `agents/dafke-dev-team/explorer.md`
  - `agents/dafke-dev-team/developer.md`
  - `agents/dafke-dev-team/test.md`
  - `agents/dafke-dev-team/reviewer.md`
  - `agents/dafke-dev-team/README.md` (team overview)

### 62. Write agent definition for dafke-assess-team
- **Complexity**: L
- **Dependencies**: Phase 4
- **Description**: Define agents for readiness assessment: **Lead** (orchestrates assessment, compiles scorecard), plus one agent per dimension: **CICD Assessor**, **Coverage Assessor**, **Security Assessor**, **Review Assessor**, **DORA Assessor**, **Docs Assessor**. Each assessor runs its analyzer, interprets results, and reports findings to the Lead.
- **Files to create**:
  - `agents/dafke-assess-team/lead.md`
  - `agents/dafke-assess-team/cicd-assessor.md`
  - `agents/dafke-assess-team/coverage-assessor.md`
  - `agents/dafke-assess-team/security-assessor.md`
  - `agents/dafke-assess-team/review-assessor.md`
  - `agents/dafke-assess-team/dora-assessor.md`
  - `agents/dafke-assess-team/docs-assessor.md`
  - `agents/dafke-assess-team/README.md`

### 63. Write agent definition for dafke-fix-team
- **Complexity**: M
- **Dependencies**: Phase 4
- **Description**: Define agents for automated fixing: **Lead** (prioritizes issues, orchestrates fixes), **Planner** (creates a fix plan from the issue list), **Implementer** (executes fixes: add configs, modify CI, fix lint errors), **Verifier** (re-runs assessment to verify fixes worked).
- **Files to create**:
  - `agents/dafke-fix-team/lead.md`
  - `agents/dafke-fix-team/planner.md`
  - `agents/dafke-fix-team/implementer.md`
  - `agents/dafke-fix-team/verifier.md`
  - `agents/dafke-fix-team/README.md`

---

## Phase 8: Templates

### 64. Write CLAUDE.md template (base + per-tech-stack sections)
- **Complexity**: XL
- **Dependencies**: Tasks 11, 20-25
- **Description**: Create a comprehensive CLAUDE.md template with Handlebars-style sections. Base sections: project overview, work principles, build commands, test commands, code style, architecture rules, security rules, git workflow, Dafke skills reference. Per-tech-stack sections: Java (Maven/Gradle commands, JaCoCo, PIT, ArchUnit rules), .NET (dotnet commands, Coverlet, Stryker, NetArchTest rules), TypeScript (npm/pnpm commands, Vitest, Stryker, dependency-cruiser), Delphi (build instructions, coverage guidance), FoxPro (comprehension-only guidance).
- **Files to create**:
  - `templates/claude-md/base.hbs`
  - `templates/claude-md/sections/java.hbs`
  - `templates/claude-md/sections/dotnet.hbs`
  - `templates/claude-md/sections/typescript.hbs`
  - `templates/claude-md/sections/delphi.hbs`
  - `templates/claude-md/sections/foxpro.hbs`
  - `templates/claude-md/sections/skills.hbs`
  - `templates/claude-md/sections/hooks.hbs`
  - `templates/claude-md/sections/agents.hbs`

### 65. Write hooks templates
- **Complexity**: L
- **Dependencies**: Task 40
- **Description**: Create hook script templates for Claude Code. Pre-commit hook: run linter, run formatter, check for secrets, run fast tests. PostToolUse hook: trigger GitNexus re-index after `git commit`/`git merge`, trigger Graphify update after doc changes. Pre-push hook: run full test suite. Each hook is a bash script template with tech-stack-specific commands injected.
- **Files to create**:
  - `templates/hooks/pre-commit.sh.hbs`
  - `templates/hooks/post-tool-use.sh.hbs`
  - `templates/hooks/pre-push.sh.hbs`

### 66. Write CI pipeline templates
- **Complexity**: L
- **Dependencies**: Tasks 20-25
- **Description**: Create CI pipeline templates for Azure DevOps YAML and GitHub Actions. Each template includes: build, test (with coverage), quality gates (coverage threshold, mutation score), SAST scan, SCA scan, secrets detection. Templates are parameterized by tech stack.
- **Files to create**:
  - `templates/ci/azure-pipelines.yml.hbs`
  - `templates/ci/github-actions.yml.hbs`
  - `templates/ci/stages/build.hbs` (partials)
  - `templates/ci/stages/test.hbs`
  - `templates/ci/stages/quality-gate.hbs`
  - `templates/ci/stages/security.hbs`

### 67. Write settings.json templates
- **Complexity**: M
- **Dependencies**: Task 40
- **Description**: Create `.claude/settings.json` templates with: allowed tools (bash, read, write, edit, glob, grep + tech-specific tools), MCP server configuration, permission prompts for dangerous operations, model preferences, max context window settings. Per-tech-stack overrides for tool permissions.
- **Files to create**:
  - `templates/settings/settings.json.hbs`
  - `templates/settings/overrides/java.json`
  - `templates/settings/overrides/dotnet.json`
  - `templates/settings/overrides/typescript.json`

### 68. Write .mcp.json template
- **Complexity**: S
- **Dependencies**: Task 40
- **Description**: Create an MCP configuration template that registers: GitNexus MCP server (code intelligence), Graphify MCP server (knowledge graph), and any tech-stack-specific MCP servers. The template is rendered with project-specific paths.
- **Files to create**:
  - `templates/settings/mcp.json.hbs`

### 69. Write CODEOWNERS template
- **Complexity**: S
- **Dependencies**: Task 37
- **Description**: Generate a CODEOWNERS file based on git blame analysis (who contributes most to which directories). Template includes common patterns (docs, CI config, source code) with placeholder team names that the user fills in during the wizard.
- **Files to create**:
  - `templates/settings/CODEOWNERS.hbs`

---

## Phase 9: CLI Commands

### 70. Implement `dafke audit` command
- **Complexity**: L
- **Dependencies**: Tasks 27-34, 48
- **Description**: Run the full readiness assessment and display the scorecard. Compare current scores against the last saved assessment. Show drift detection results (files that have been manually modified since generation). Output: terminal scorecard, JSON report (with `--json` flag), or markdown report (with `--markdown` flag).
- **Files to create/modify**:
  - `src/cli/commands/audit.ts` (full implementation)
  - `tests/unit/cli/commands/audit.test.ts`

### 71. Implement `dafke update` command
- **Complexity**: L
- **Dependencies**: Tasks 12, 48
- **Description**: Check for updates to dafke itself (npm registry). Check for template updates (newer templates than generated files). Apply updates: regenerate files from updated templates while preserving user customizations. Show a diff before applying. Support `--dry-run` to preview without applying.
- **Files to create/modify**:
  - `src/cli/commands/update.ts` (full implementation)
  - `tests/unit/cli/commands/update.test.ts`

### 72. Implement `dafke status` command (dashboard display)
- **Complexity**: M
- **Dependencies**: Tasks 8, 12
- **Description**: Display a dashboard with: current wave assignment, assessment scores, last audit date, drift status, connected integrations status, installed skills count, installed agents count, CLI version, and available updates.
- **Files to create/modify**:
  - `src/cli/commands/status.ts` (full implementation)
  - `tests/unit/cli/commands/status.test.ts`

### 73. Implement `dafke doctor` command (self-healing)
- **Complexity**: L
- **Dependencies**: Tasks 8, 12, 48
- **Description**: Run a series of diagnostic checks and auto-fix issues: missing `.claude/` directory, missing skills, missing agents, broken config files (invalid JSON/YAML), stale indexes, missing plugins, wrong file permissions on hooks, broken integration connections (expired tokens). Display check results with pass/fail/fixed status.
- **Files to create/modify**:
  - `src/cli/commands/doctor.ts` (full implementation)
  - `src/core/doctor/diagnostics.ts` (diagnostic check definitions)
  - `src/core/doctor/healers.ts` (auto-fix implementations)
  - `tests/unit/cli/commands/doctor.test.ts`

### 74. Implement `dafke connect` command
- **Complexity**: M
- **Dependencies**: Tasks 14-17
- **Description**: Manage external connections (Azure DevOps, GitHub, Jira, Confluence). Sub-commands: `connect add <provider>`, `connect remove <provider>`, `connect test <provider>`, `connect list`. Interactive credential collection and validation.
- **Files to create/modify**:
  - `src/cli/commands/connect.ts` (full implementation)
  - `tests/unit/cli/commands/connect.test.ts`

### 75. Implement `dafke repos` command
- **Complexity**: M
- **Dependencies**: Tasks 14, 15, 18
- **Description**: List all accessible repositories from connected providers. Display: repo name, provider, default branch, last activity date, tech stack (if detected). Support filtering by provider and search by name.
- **Files to create/modify**:
  - `src/cli/commands/repos.ts` (full implementation)
  - `tests/unit/cli/commands/repos.test.ts`

### 76. Implement `dafke migrate` command
- **Complexity**: L
- **Dependencies**: Tasks 48, 18
- **Description**: Clone a repository and run the init wizard on it. This is the "batch onboarding" command for migrating many repos. Support: `migrate <repo-url>` (single repo), `migrate --project <project>` (all repos in a project), `migrate --list <file>` (repos from a file). Run the init wizard in non-interactive mode with sensible defaults.
- **Files to create/modify**:
  - `src/cli/commands/migrate.ts` (full implementation)
  - `tests/unit/cli/commands/migrate.test.ts`

---

## Phase 10: Update & Self-Healing System

### 77. Implement version migration system
- **Complexity**: L
- **Dependencies**: Tasks 8, 9
- **Description**: Implement a schema versioning system for config and state files. Each version has a migration function: `v1 -> v2 -> v3`. When dafke detects an older schema version, it automatically runs migrations in sequence. Migrations are reversible (up/down). Include a `--force-migrate` flag for manual triggering.
- **Files to create**:
  - `src/core/migrations/migration-runner.ts`
  - `src/core/migrations/v1-to-v2.ts` (example migration)
  - `src/core/migrations/index.ts`
  - `tests/unit/core/migrations/migration-runner.test.ts`

### 78. Implement config drift detection
- **Complexity**: M
- **Dependencies**: Tasks 8, 11, 12
- **Description**: Compare generated files against their templates (using the same context that was used to generate them). Store a hash of the generated content alongside the file. On audit, compare current file hash against stored hash. If different, the file has drifted. Categorize drift as: intentional customization (user added sections), destructive drift (user deleted required sections), or stale (template updated, file not regenerated).
- **Files to create/modify**:
  - `src/core/drift-detector.ts` (full implementation)
  - `tests/unit/core/drift-detector.test.ts`

### 79. Implement self-healing routines
- **Complexity**: L
- **Dependencies**: Tasks 73, 77, 78
- **Description**: Implement specific healers for common issues: reinstall missing plugins (re-run `claude plugin install`), regenerate broken configs (re-render from template), fix file permissions (`chmod +x` on hooks), refresh expired tokens (prompt for new ones), rebuild stale indexes (re-run GitNexus/Graphify). Each healer is registered in the doctor's diagnostic registry.
- **Files to create/modify**:
  - `src/core/doctor/healers.ts` (full implementation)
  - `tests/unit/core/doctor/healers.test.ts`

### 80. Implement auto-update notification on CLI startup
- **Complexity**: S
- **Dependencies**: Task 12
- **Description**: On every CLI invocation, check the cached update-notifier result. If a newer version is available, display a non-blocking notification at the end of command output. Include the update command (`npm update -g dafke`). Rate-limit notifications to once per day.
- **Files to create/modify**:
  - `src/cli/index.ts` (add startup notification)
  - `tests/unit/cli/update-notification.test.ts`

---

## Phase 11: Plugin Packaging

### 81. Create plugin.json for Claude Code plugin
- **Complexity**: M
- **Dependencies**: Phases 6, 7, 8
- **Description**: Create the `.claude-plugin/plugin.json` manifest that registers dafke as a Claude Code plugin. Define: plugin name, version, description, skills (mapped from `skills/`), agents (mapped from `agents/`), hooks, and MCP configuration. Follow the Claude Code plugin specification.
- **Files to create**:
  - `.claude-plugin/plugin.json`
  - `.claude-plugin/README.md`

### 82. Bundle skills, agents, hooks, and MCP config
- **Complexity**: M
- **Dependencies**: Task 81
- **Description**: Add a build step that bundles all skills, agents, hooks, and MCP configs into the npm package. Ensure `files` field in `package.json` includes: `dist/`, `skills/`, `agents/`, `templates/`, `.claude-plugin/`. Add a `postinstall` script that copies skills/agents to the user's `.claude/` directory.
- **Files to modify**:
  - `package.json` (files field, postinstall script)
  - `scripts/postinstall.ts`

### 83. Create marketplace entry
- **Complexity**: S
- **Dependencies**: Task 82
- **Description**: Create metadata files for Claude Code plugin marketplace listing: description, screenshots, categories, keywords. Ensure the npm package metadata is optimized for discoverability.
- **Files to create/modify**:
  - `package.json` (keywords, description, repository)
  - `.claude-plugin/marketplace.json`

### 84. Test plugin installation and skill discovery
- **Complexity**: M
- **Dependencies**: Tasks 81-83
- **Description**: Write E2E tests that: install the plugin via `claude plugin install ./` (local), verify skills appear in Claude Code's skill list, verify agents are discoverable, verify hooks are registered, verify MCP config is correct. Test uninstall + reinstall cycle.
- **Files to create**:
  - `tests/e2e/plugin-installation.test.ts`
  - `tests/e2e/skill-discovery.test.ts`

---

## Phase 12: Documentation & User Manual

### 85. Write user manual
- **Complexity**: L
- **Dependencies**: Phases 5, 6, 9
- **Description**: Write comprehensive user documentation: getting started (install, first run), init wizard walkthrough (each step explained), daily workflow (backlog -> story -> plan -> dev -> review -> PR -> CI -> deploy), CLI command reference, configuration reference, troubleshooting FAQ.
- **Files to create**:
  - `docs/user-manual/getting-started.md`
  - `docs/user-manual/init-wizard.md`
  - `docs/user-manual/daily-workflow.md`
  - `docs/user-manual/cli-reference.md`
  - `docs/user-manual/configuration.md`

### 86. Write developer guide
- **Complexity**: M
- **Dependencies**: Phases 1-3
- **Description**: Write a developer guide for contributors: how to add a new tech stack adapter, how to add a new skill, how to add a new agent team, how to add a new assessment dimension, how to add a new CLI command. Include code examples and the adapter/skill/agent contracts.
- **Files to create**:
  - `docs/developer-guide/adding-adapters.md`
  - `docs/developer-guide/adding-skills.md`
  - `docs/developer-guide/adding-agents.md`
  - `docs/developer-guide/architecture.md`

### 87. Write troubleshooting guide
- **Complexity**: M
- **Dependencies**: Phases 5, 9, 10
- **Description**: Document common issues and their solutions: authentication failures, plugin installation problems, CI pipeline errors, coverage tool issues per tech stack, wizard resumption problems, config corruption recovery.
- **Files to create**:
  - `docs/troubleshooting.md`

### 88. Write architecture decision records (ADRs)
- **Complexity**: M
- **Dependencies**: Phase 0
- **Description**: Document key architecture decisions: why citty over Commander/oclif, why cosmiconfig for config, why XState for wizard, why Handlebars-style templates, why checkpoint-based state vs event sourcing, why lazy-loaded adapters.
- **Files to create**:
  - `docs/adr/001-cli-framework.md`
  - `docs/adr/002-config-resolution.md`
  - `docs/adr/003-wizard-state-machine.md`
  - `docs/adr/004-template-engine.md`
  - `docs/adr/005-adapter-lazy-loading.md`

---

## Phase 13: Testing & Hardening

### 89. Write E2E tests for the full init wizard flow
- **Complexity**: XL
- **Dependencies**: Phase 5
- **Description**: Test the complete init wizard from `dafke init` to completion. Use a fresh temp directory with a fixture project. Mock external APIs (Azure DevOps, GitHub, Jira). Verify all output files are correct. Test with each tech stack fixture. Test resume from each step.
- **Files to create**:
  - `tests/e2e/wizard/full-flow.test.ts`
  - `tests/e2e/wizard/java-project.test.ts`
  - `tests/e2e/wizard/dotnet-project.test.ts`
  - `tests/e2e/wizard/typescript-project.test.ts`

### 90. Write E2E tests for each CLI command
- **Complexity**: L
- **Dependencies**: Phase 9
- **Description**: Test each CLI command end-to-end: `audit`, `update`, `status`, `doctor`, `connect`, `repos`, `migrate`. Use fixture projects and mocked APIs.
- **Files to create**:
  - `tests/e2e/commands/audit.test.ts`
  - `tests/e2e/commands/update.test.ts`
  - `tests/e2e/commands/status.test.ts`
  - `tests/e2e/commands/doctor.test.ts`
  - `tests/e2e/commands/connect.test.ts`
  - `tests/e2e/commands/repos.test.ts`
  - `tests/e2e/commands/migrate.test.ts`

### 91. Test with real Azure DevOps and GitHub repos
- **Complexity**: L
- **Dependencies**: Phases 2, 5
- **Description**: Manual + semi-automated testing against real Dafke Azure DevOps organization and GitHub repos. Verify: authentication works, repos are listed, work items are accessible, pipelines can be read. Document any API quirks or rate limit issues.
- **Files to create**:
  - `tests/e2e/live/azure-devops.test.ts` (skipped by default, run manually)
  - `tests/e2e/live/github.test.ts`

### 92. Test with each tech stack (fixture projects)
- **Complexity**: L
- **Dependencies**: Phase 3
- **Description**: Create realistic fixture projects for Java (Maven), Java (Gradle), .NET, TypeScript (npm), TypeScript (pnpm), Delphi, and FoxPro. Run the full init wizard and all analyzers against each. Verify adapter detection, coverage parsing, and generated file correctness.
- **Files to create**:
  - `tests/fixtures/repos/java-maven/` (full fixture)
  - `tests/fixtures/repos/java-gradle/` (full fixture)
  - `tests/fixtures/repos/dotnet/` (full fixture)
  - `tests/fixtures/repos/typescript-npm/` (full fixture)
  - `tests/fixtures/repos/typescript-pnpm/` (full fixture)
  - `tests/fixtures/repos/delphi/` (full fixture)
  - `tests/fixtures/repos/foxpro/` (full fixture)

### 93. Performance testing (CLI startup time < 500ms)
- **Complexity**: M
- **Dependencies**: Phase 9
- **Description**: Measure and optimize CLI startup time. Target: < 500ms from invocation to first command output. Profile: module loading, config resolution, adapter detection. Optimize: use lazy imports, minimize top-level imports, defer heavy operations.
- **Files to create**:
  - `tests/perf/startup-time.test.ts`
  - `scripts/bench-startup.sh`

### 94. Error handling audit
- **Complexity**: L
- **Dependencies**: All phases
- **Description**: Audit every async operation for proper error handling. Ensure: no unhandled promise rejections, all file operations have try/catch with descriptive errors, all API calls have timeout and retry logic, all user-facing errors include actionable guidance, `dafke doctor` can recover from every known error state.
- **Files to create/modify**:
  - `src/utils/errors.ts` (custom error classes)
  - `src/utils/retry.ts` (retry utility)
  - All source files (error handling improvements)

---

## Dependency Graph Summary

```
Phase 0 ─────────────────────────────────────────────────────────────
  │
Phase 1 (Core Engine) ───────────────────────────────────────────────
  │           │              │
Phase 2    Phase 3       Phase 4 ─────────────────────────────────
(Integrations) (Adapters)  (Assessment)                           │
  │           │              │                                     │
  └───────────┴──────────────┴─── Phase 5 (Init Wizard) ──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
          Phase 6              Phase 7                 Phase 8
          (Skills)             (Agents)                (Templates)
              │                    │                        │
              └────────────────────┴────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                Phase 9       Phase 10         Phase 11
                (CLI Commands) (Self-Healing)   (Plugin)
                    │              │                │
                    └──────────────┴────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                Phase 12      Phase 13
                (Docs)        (Testing)
```

---

## Estimated Total Effort

| Phase | Tasks | Estimated Days |
|-------|-------|----------------|
| Phase 0: Scaffolding | 7 | 2 |
| Phase 1: Core Engine | 6 | 5 |
| Phase 2: Integrations | 6 | 7 |
| Phase 3: Adapters | 7 | 5 |
| Phase 4: Assessment | 9 | 7 |
| Phase 5: Init Wizard | 14 | 10 |
| Phase 6: Skills | 11 | 6 |
| Phase 7: Agents | 3 | 3 |
| Phase 8: Templates | 6 | 4 |
| Phase 9: CLI Commands | 7 | 5 |
| Phase 10: Self-Healing | 4 | 3 |
| Phase 11: Plugin | 4 | 2 |
| Phase 12: Documentation | 4 | 3 |
| Phase 13: Testing | 6 | 6 |
| **Total** | **94** | **~68 days** |
