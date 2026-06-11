# Dafke AI Control Center -- User Manual

Version 0.1.0 | Dafke Platform Engineering

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The Init Wizard](#2-the-init-wizard)
3. [Daily Workflow](#3-daily-workflow)
4. [Quality Tools](#4-quality-tools)
5. [Readiness Assessment](#5-readiness-assessment)
6. [Configuration](#6-configuration)
7. [Maintenance](#7-maintenance)
8. [For New Developers](#8-for-new-developers)
9. [Testing & Validation](#9-testing--validation)
10. [Distribution & Deployment](#10-distribution--deployment)
11. [Troubleshooting](#11-troubleshooting)
12. [AI Code Governance](#12-ai-code-governance)

---

## 1. Getting Started

### Prerequisites

Before installing dafke, ensure your workstation meets the following requirements:

**Required:**
- **Node.js 20 or later** -- dafke uses ESM modules and modern APIs that require Node.js 20+. Verify with `node --version`.
- **Git 2.30+** -- required for hooks, branching, and PR workflows. Verify with `git --version`.

**Recommended:**
- **Claude Code CLI** -- the Anthropic CLI, installed and authenticated. Verify with `claude --version`. Enables smart merge, deep audit, and context-aware plugin recommendations.
- **Gitleaks** -- secrets scanning tool. Verify with `gitleaks --version`.
- **Lefthook** -- git hooks manager. Verify with `lefthook --version`.

**Optional (provider-specific):**
- **Azure CLI** (`az`) -- when using Azure DevOps.
- **GitHub CLI** (`gh`) -- when using GitHub.

The init wizard checks for all of these automatically and provides OS-specific installation hints when tools are missing.

### Installation

Install and initialize dafke in any repository:

```bash
npx dafke init
```

This launches the interactive 12-step wizard that configures your repository for AI-assisted development. The wizard detects your tech stack, assesses readiness, generates configuration files, and installs hooks and skills.

For a global install (recommended for frequent use):

```bash
npm install -g dafke
dafke init
```

### First Run Walkthrough

When you run `dafke init` for the first time, the following happens:

1. The Dafke banner is displayed with your version number.
2. The wizard checks for existing `.dafke/state.json` (resumable state).
3. If no prior state exists, a fresh wizard session begins.
4. You are guided through 12 steps covering authentication, detection, assessment, and configuration.
5. At the end, a summary shows your readiness scores and wave assignment.
6. Configuration files are written to `.dafke/` in your repository root.

The wizard saves progress after every step. If interrupted, resume with:

```bash
dafke init --resume
```

---

## 2. The Init Wizard

The init wizard consists of 12 sequential steps. Each step can be skipped, retried on failure, or resumed from a checkpoint.

### Step 1: Authentication & Providers (`auth`)

Configures connections to your development platform. You will be prompted for:

- **Azure DevOps**: Organization URL and Personal Access Token (PAT)
- **GitHub**: Personal access token with repo scope
- **Jira**: Email, API token, and site URL (optional)
- **Confluence**: Email, API token, and site URL (optional)
- **SonarQube**: Server URL and token (optional)

Credentials are stored in `~/.dafke/config.yaml` with file permissions set to owner-only (0600).

### Step 2: Repository Detection (`detect`)

Automatically scans your repository to identify the primary technology stack. The adapter registry runs detection for:

- **Java** -- looks for `pom.xml`, `build.gradle`, `.java` files
- **.NET** -- looks for `*.csproj`, `*.sln`, `global.json`
- **TypeScript** -- looks for `tsconfig.json`, `package.json` with TypeScript dependency
- **Delphi** -- looks for `*.dpr`, `*.dpk`, `*.pas` files
- **FoxPro** -- looks for `*.prg`, `*.vcx`, `*.scx` files

Each adapter returns a confidence score (0-1). The highest-confidence adapter is selected. If no adapter exceeds a minimum threshold, the tech stack is set to `unknown`.

### Step 3: Readiness Assessment (`assess`)

Evaluates your repository across 6 dimensions, each scored from 0 to 5:

| Dimension  | What It Measures |
|------------|------------------|
| CI/CD      | Pipeline maturity, build automation, deployment frequency |
| Coverage   | Test coverage percentage, framework detection |
| Security   | SAST tools, secrets detection, SCA scanning |
| Review     | Code review practices, PR policies, approval requirements |
| DORA       | Deployment frequency, lead time, change failure rate, MTTR |
| Docs       | Architecture documentation, README quality, ADRs |

The total score (out of 30) determines your wave assignment.

### Step 4: CLAUDE.md Generation (`claude_md`)

Generates a tailored `CLAUDE.md` file for your repository based on:

- Detected tech stack and build tools
- Test framework and commands
- Dafke enterprise rules (AI share governance, PR caps, review requirements)
- Project-specific patterns and conventions

The generated file is placed at the repository root.

**Smart merge behavior**: When a `CLAUDE.md` already exists, dafke uses section-based merging to preserve your customizations. Dafke-managed sections (identified by their H2 headings) are updated to the latest template, while user-added sections are preserved. The `## Lessons Learned` section is never overwritten. When Claude Code CLI is detected, an AI-powered smart merge is used for more intelligent conflict resolution.

### Step 5: Hooks & Settings (`hooks`)

Installs Claude Code hooks that enforce quality standards during development:

- **SessionStart**: Runs `dafke hook session-start` when Claude Code starts
- **PreToolUse (Bash)**: Validates bash commands before execution
- **PreToolUse (Edit/Write)**: Checks file modifications against policy
- **PostToolUse (Bash/Edit)**: Records metrics after tool execution
- **Stop**: Captures session metrics when Claude Code stops
- **UserPromptSubmit**: Validates prompts before submission

Hooks are written to `.claude/settings.json` in your repository.

### Step 6: Plugin Installation (`plugins`)

Installs recommended Claude Code plugins and MCP servers. Plugins are displayed in grouped categories with relevance scoring:

- **Core** (always recommended):
  - **Context7** -- up-to-date library documentation
  - **Playwright** -- browser automation for testing
  - **GitNexus** -- codebase knowledge graph for architecture exploration
- **Provider-specific** (auto-detected):
  - **Azure DevOps** -- pipelines, builds, PRs, work items (detected from git remote or global config)
  - **Atlassian** -- Jira and Confluence integration (detected from global config)
- **Quality** (recommended when tools are detected):
  - **SonarQube** -- code quality metrics (detected from global config)

Each plugin shows a relevance score based on your tech stack, CI platform, and existing tooling. When Claude Code CLI is available, recommendations are further refined with context-aware analysis.

MCP server configuration is written to `.claude/mcp.json`.

> **Azure DevOps MCP prerequisite**: The Azure DevOps MCP server uses PAT authentication. You must set the `AZURE_PERSONAL_TOKEN` environment variable in your shell profile (`~/.zshrc` or `~/.bashrc`):
> ```bash
> export AZURE_PERSONAL_TOKEN="<your Azure DevOps PAT>"
> ```
> Your PAT is stored in the dafke global config (`~/Library/Preferences/dafke/config.yaml` on macOS).

### Step 7: CI/CD Hardening (`ci`)

Applies CI/CD best practices to your pipeline based on the detected platform:

- **Azure DevOps**: Pipeline YAML templates for build, test, and deploy stages
- **GitHub Actions**: Workflow files with quality gates

Includes AI code governance checks in the pipeline (AI share analysis, checklist validation).

**Quality gate analysis**: When Claude Code CLI is detected, dafke performs a gap analysis between your existing pipeline and the Dafke quality gate requirements, generating targeted recommendations rather than a full template replacement.

### Step 8: Test Coverage Analysis (`coverage`)

Configures test coverage tooling appropriate to your tech stack:

| Tech Stack | Tool | Report Format |
|------------|------|---------------|
| Java       | JaCoCo | jacoco |
| .NET       | Coverlet | cobertura |
| TypeScript | c8 / istanbul | lcov |
| Delphi     | Delphi Coverage | cobertura |
| FoxPro     | (manual) | cobertura |

Sets up coverage thresholds and reporting in your CI pipeline.

### Step 9: Architecture Documentation (`arch`)

Generates or validates architecture documentation:

- Creates an `architecture.md` if none exists
- Validates existing documentation completeness
- Sets up Architecture Decision Records (ADR) templates
- Configures architecture diagram generation if tooling is detected

### Step 10: Project Board Connection (`connect`)

Links your repository to a project management board:

- **Azure DevOps Boards**: Links to work items, sprints, and backlogs
- **Jira**: Connects to projects and boards
- **GitHub Issues/Projects**: Links to issue tracking

This enables the `/dafke-backlog` and `/dafke-story` skills.

### Step 11: Skills & Agents (`skills`)

Installs the Dafke skill set for Claude Code. These appear as slash commands:

- `/dafke-backlog` -- view work items
- `/dafke-story` -- pick and focus on a story
- `/dafke-plan` -- generate an implementation plan
- `/dafke-dev` -- implement a story
- `/dafke-review` -- review changes
- `/dafke-pr` -- create a pull request
- `/dafke-ci` -- monitor CI pipeline
- `/dafke-deploy` -- deploy changes
- And more (coverage, security, architecture, etc.)

### Step 12: Verification & Summary (`verify`)

Performs a final check to confirm everything is configured correctly:

- Validates all generated files exist and are well-formed
- Confirms hooks are installed
- Verifies MCP servers are reachable
- Prints a summary dashboard with readiness scores, wave assignment, and next steps

### Resuming an Interrupted Wizard

The wizard saves a checkpoint after every completed step to `.dafke/state.json`. To resume:

```bash
dafke init --resume
```

Already-completed steps are skipped automatically. The wizard prints which steps were completed and which remain.

### Skipping Steps

To skip specific steps, use the `--skip` flag with a comma-separated list:

```bash
dafke init --skip=auth,connect
```

Valid step names: `auth`, `detect`, `assess`, `claude_md`, `hooks`, `plugins`, `ci`, `coverage`, `arch`, `connect`, `skills`, `verify`.

### Non-Interactive Mode

For CI environments or scripted installs, use non-interactive mode:

```bash
dafke init --non-interactive
```

In this mode, all prompts use default values and failures are logged but do not pause execution.

---

## 3. Daily Workflow

dafke provides a complete set of skills (slash commands) for daily development workflow inside Claude Code.

### Starting Your Day

Open Claude Code in your repository and run:

```
/dafke-backlog
```

This displays your current sprint's work items, sorted by priority. Each item shows:

- Work item ID (e.g., PROJ-123)
- Title and description
- Status, priority, and assignee
- Story points and sprint

### Picking a Story

When you select a story to work on:

```
/dafke-story PROJ-123
```

This command:
- Fetches the full story details from your project board
- Creates a feature branch following your team's naming convention
- Sets the story status to "In Progress"
- Loads relevant context (related code, acceptance criteria)

### Planning Implementation

Before writing code, generate an implementation plan:

```
/dafke-plan PROJ-123
```

This produces:
- A step-by-step plan broken into small, reviewable increments
- File modification list (which files will be created or changed)
- Test plan (what tests to write and why)
- Risk assessment (what could go wrong)

The plan is saved to `.claude/plans/` for reference and review.

### Implementing the Story

Start implementation with:

```
/dafke-dev PROJ-123
```

This enters a focused development mode that:
- Follows the implementation plan from `/dafke-plan`
- Writes code in small increments with tests
- Respects the PR size cap (400 lines maximum)
- Tracks AI share percentage
- Applies tech-stack-specific best practices

### Reviewing Changes

Before creating a PR, review your changes:

```
/dafke-review
```

This performs:
- Code quality analysis
- Test coverage verification
- AI code checklist validation (7-item checklist)
- Security scan for common vulnerabilities
- PR size check (warns if over 400 lines)

### Creating a Pull Request

When satisfied with the review:

```
/dafke-pr PROJ-123
```

This command:
- Creates a PR with a structured description
- Links the PR to the work item
- Adds the AI code checklist to the PR description
- Sets appropriate reviewers based on CODEOWNERS
- Triggers CI pipeline

### Monitoring CI

After pushing, monitor your CI pipeline:

```
/dafke-ci
```

Displays:
- Pipeline status (running, passed, failed)
- Stage-by-stage breakdown
- Test results summary
- Coverage report
- Any failures with suggested fixes

### Deploying

When the PR is merged and you need to deploy:

```
/dafke-deploy
```

Guides you through the deployment process based on your CI/CD platform configuration.

---

## 4. Quality Tools

dafke includes specialized quality tools accessible as slash commands.

### Coverage Analysis

```
/dafke-coverage
```

Runs test coverage analysis and reports:
- Overall coverage percentage
- Per-file and per-function breakdown
- Uncovered lines and branches
- Coverage trend compared to previous runs
- Suggestions for improving coverage

### Mutation Testing

```
/dafke-mutate
```

Runs mutation testing to verify test quality:
- Introduces small code mutations (e.g., changing operators, removing conditions)
- Checks whether tests catch the mutations
- Reports mutation score (percentage of mutations caught)
- Identifies weak test areas that pass despite code changes

Supported frameworks by tech stack:
- **Java**: PIT (pitest)
- **.NET**: Stryker.NET
- **TypeScript**: Stryker

### Security Scanning

```
/dafke-security
```

Performs security analysis:
- **SAST**: Static Application Security Testing for code vulnerabilities
- **SCA**: Software Composition Analysis for dependency vulnerabilities
- **Secrets Detection**: Scans for accidentally committed credentials
- Reports findings by severity (critical, high, medium, low)
- Provides remediation guidance for each finding

### Architecture Documentation

```
/dafke-arch
```

Generates or updates architecture documentation:
- Component diagrams based on codebase structure
- Dependency graphs between modules
- Data flow analysis
- Architecture Decision Records (ADRs) listing
- Identifies architectural drift from documented design

---

## 5. Readiness Assessment

The readiness assessment is a core feature of dafke that determines how prepared a repository is for AI-assisted development.

### The 6 Dimensions

Each dimension is scored from 0 (not ready) to 5 (fully mature):

**1. CI/CD (cicd)**
- Score 0: No pipeline exists
- Score 1: Manual builds only
- Score 2: Basic CI (build + test on PR)
- Score 3: CI with quality gates and automated deployment to dev
- Score 4: Full CD with staging environment and rollback
- Score 5: Production CD with canary/blue-green deployment and monitoring

**2. Test Coverage (coverage)**
- Score 0: No tests
- Score 1: Less than 20% coverage
- Score 2: 20-50% coverage
- Score 3: 50-70% coverage
- Score 4: 70-85% coverage
- Score 5: 85%+ coverage with mutation testing

**3. Security (security)**
- Score 0: No security tooling
- Score 1: Basic secrets scanning only
- Score 2: SAST or SCA configured
- Score 3: SAST + SCA + secrets detection all configured
- Score 4: All tools active in CI with blocking on critical findings
- Score 5: Full supply chain security with SBOM and signed builds

**4. Code Review (review)**
- Score 0: No review process
- Score 1: Optional reviews
- Score 2: Mandatory reviews, single approver
- Score 3: Mandatory reviews, CODEOWNERS configured
- Score 4: Review with automated checks (linting, coverage, security)
- Score 5: Review with automated triage, risk-based reviewer assignment

**5. DORA Metrics (dora)**
- Score 0: Deployment less than once per quarter
- Score 1: Monthly deployments
- Score 2: Bi-weekly deployments
- Score 3: Weekly deployments with <1 week lead time
- Score 4: Multiple deploys per week, <1 day lead time
- Score 5: On-demand deployment, <1 hour lead time, <5% change failure rate

**6. Documentation (docs)**
- Score 0: No documentation beyond default README
- Score 1: Basic README with setup instructions
- Score 2: README + API documentation
- Score 3: Architecture documentation + ADRs
- Score 4: Living documentation with diagram generation
- Score 5: Full documentation suite with onboarding guide and runbooks

### Hard Gates vs Soft Dimensions

Two dimensions are **hard gates**: CI/CD and Security. These must each score at least 3 to qualify for Wave 1 or Wave 2 assignment, regardless of total score. The remaining four dimensions (Coverage, Review, DORA, Docs) are soft -- they contribute to the total score but do not independently block wave advancement.

### Wave Assignment

Waves determine the rollout order for AI-assisted development across Dafke teams:

| Wave | Requirements | Timeline |
|------|-------------|----------|
| Wave 1 | Hard gates met (CI/CD >= 3, Security >= 3) AND total score >= 20 | Immediate rollout |
| Wave 2 | Hard gates met AND total score >= 12 | 1-2 month improvement plan |
| Wave 3 | Hard gates not met OR total score < 12 | Significant preparation needed |

### Improving Your Score

To get guidance on improving a specific dimension:

```
/dafke-gate cicd
/dafke-gate security
/dafke-gate coverage
```

This provides:
- Current score with evidence
- Specific actions to reach the next score level
- Estimated time for each improvement
- Priority ranking (critical actions first)

To see the full improvement plan:

```
/dafke-gate
```

### Deep Audit Mode

When Claude Code CLI is installed, the audit command supports a `--deep` flag for qualitative AI-powered analysis:

```bash
dafke audit --deep
```

Deep mode goes beyond mechanical scoring by using Claude Code to analyze:
- Code quality patterns and anti-patterns
- Architecture alignment with best practices
- Test quality (not just coverage percentage)
- Security posture beyond tool presence

Without Claude Code CLI, `--deep` is unavailable and the audit uses mechanical scoring only.

---

## 6. Configuration

dafke uses a layered configuration system with global user settings and per-repository manifests.

### Global Config (~/.dafke/config.yaml)

The global configuration file stores user-wide settings. Location varies by platform:

| Platform | Path |
|----------|------|
| macOS    | `~/Library/Preferences/dafke/config.yaml` |
| Linux    | `~/.config/dafke/config.yaml` |
| Windows  | `%APPDATA%\dafke\config.yaml` |

Contents include:

```yaml
version: "1.0.0"
auth:
  azureDevOps:
    pat: "***"
    orgUrl: "https://dev.azure.com/dafke"
  github:
    token: "***"
  jira:
    email: "dev@dafke.be"
    apiToken: "***"
    siteUrl: "https://dafke.atlassian.net"
  sonarqube:
    token: "***"
    serverUrl: "https://sonar.dafke.be"
preferences:
  defaultProvider: azure-devops
  language: en
  colorOutput: true
```

This file is written with 0600 permissions (owner-only) because it contains authentication tokens.

### Repo Manifest (.dafke/manifest.yaml)

Each repository has a manifest in `.dafke/manifest.yaml`:

```yaml
corulusCcVersion: "0.1.0"
configSchemaVersion: 1
techStack: dotnet
ciPlatform: azure-devops
readinessScores:
  cicd: 3
  coverage: 2
  security: 3
  review: 4
  dora: 2
  docs: 1
wave: wave2
overrides: {}
```

### Overrides

The `overrides` field in the manifest allows per-repo customization of any setting. These take precedence over tech-stack defaults:

```yaml
overrides:
  coverage:
    threshold: 90
  pr:
    maxLines: 300
  hooks:
    disablePreEdit: true
```

### Tech-Stack-Specific Settings

Each tech stack adapter provides default settings for:

- Build commands (`build`, `test`, `lint`)
- Coverage tool and report format
- Mutation testing framework
- Security scanning tools (SAST, SCA, secrets)
- CLAUDE.md sections specific to the technology

These defaults are applied automatically during detection and can be overridden in the manifest.

### Rules (`.dafke/rules.yaml`)

For fine-grained control over assessment thresholds, governance policies, and security rules, create an optional `.dafke/rules.yaml` file:

```yaml
assessment:
  wave1Threshold: 20    # Total score needed for Wave 1 (default: 20/30)
  hardGateThreshold: 3  # Minimum score for hard-gate dimensions (default: 3/5)
governance:
  prSizeLimit: 400      # Maximum PR lines (default: 400)
  coverageThreshold: 80 # Minimum test coverage percentage (default: 80)
security:
  allowedLicenses:      # SPDX license identifiers to allow
    - MIT
    - Apache-2.0
    - BSD-3-Clause
```

All values have sensible defaults. The file is entirely optional -- dafke works without it. The rules file is validated against a Zod schema at load time; invalid values produce clear error messages.

### Template Overrides

Override built-in templates without forking:

1. **Repo-level**: Place templates in `.dafke/templates/` (e.g., `.dafke/templates/claude-md/base.md`)
2. **Environment variable**: Set `DAFKE_TEMPLATES_DIR` to a custom directory

Override resolution order: env var → `.dafke/templates/` → built-in templates.

This allows teams to customize generated files (CLAUDE.md, CI pipelines, hooks) while still receiving updates to the core template structure.

---

## 7. Maintenance

### Updating

To update dafke and refresh all generated files:

```bash
dafke update
```

This command:
- Checks for newer versions of dafke
- Updates CLAUDE.md templates to the latest version
- Refreshes hook configurations
- Updates MCP server definitions
- Preserves all custom overrides

### Self-Healing (Doctor)

If something is not working correctly, run the diagnostic tool:

```bash
dafke doctor
```

The doctor command checks:
- Node.js version compatibility
- Claude Code CLI availability and version
- Git version and configuration
- Global config file integrity
- Repository manifest validity
- Hook installation status
- MCP server connectivity
- Plugin installation state

For each issue found, the doctor provides a fix recommendation and can auto-fix when possible.

### Checking Status

To see the current state of your dafke installation:

```bash
dafke status
```

Displays:
- dafke version
- Detected tech stack
- Current readiness scores
- Wave assignment
- Installed hooks and plugins
- Connection status for configured integrations

---

## 8. For New Developers

### First Day with Claude Code at Dafke

Welcome to AI-assisted development at Dafke. Here is a step-by-step guide for your first day.

**Step 1: Install prerequisites**

```bash
# Install Node.js 20+ (via nvm recommended)
nvm install 20
nvm use 20

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Authenticate Claude Code
claude auth
```

**Step 2: Clone your repository and initialize**

```bash
git clone https://dev.azure.com/dafke/your-project/_git/your-repo
cd your-repo
npx dafke init
```

**Step 3: Follow the wizard**

The wizard guides you through all configuration. For most prompts, the default answers are correct. If unsure, ask your buddy (see below).

**Step 4: Verify your setup**

```bash
dafke doctor
```

All checks should pass. If any fail, follow the suggested remediation.

**Step 5: Start your first task**

```
# Open Claude Code
claude

# See available work
/dafke-backlog

# Pick a starter task
/dafke-story PROJ-XXX
```

### The Buddy System

Every new developer is paired with an experienced team member (buddy) for the first two weeks. Your buddy can help with:

- Understanding the wizard steps and what they configure
- Navigating your team's specific workflow
- Interpreting readiness scores and improvement actions
- Resolving authentication or platform issues

Ask your team lead for your buddy assignment.

### Training Resources

- **Internal Wiki**: Dafke Confluence space "AI-Assisted Development"
- **Lunch & Learn recordings**: Available in the Teams channel "Platform Engineering"
- **Practice repository**: `dafke/training/claude-code-sandbox` -- a safe environment to experiment
- **Office hours**: Platform Engineering holds weekly office hours (Thursdays 14:00-15:00 CET)

### The Onboard Skill

For interactive guidance at any time, use:

```
/dafke-onboard
```

This skill walks you through:
- Understanding your repository's tech stack and configuration
- How the quality gates apply to your work
- Your team's specific conventions and practices
- Setting up your development environment

### Getting Help

For interactive help within Claude Code:

```
/dafke-help
```

This displays:
- Available commands and their descriptions
- Links to documentation
- How to report issues
- Contact information for platform engineering

---

## 9. Testing & Validation

This section explains how to test dafke on your repositories before rolling out to your team, and how to validate the system works correctly.

### Quick Test (No Installation Required)

You can run dafke against any repository without installing anything permanently. From the dafke source directory:

```bash
# Build the CLI
cd /path/to/dafke
npm install && npm run build

# Test against any repo (replace with your repo path)
cd /path/to/your-repo
node /path/to/dafke/dist/cli.mjs audit
node /path/to/dafke/dist/cli.mjs doctor
node /path/to/dafke/dist/cli.mjs status
```

This runs a full readiness assessment without modifying anything in the target repo.

### Local Link (For Repeated Testing)

Link dafke globally so you can use it from any directory:

```bash
cd /path/to/dafke
npm link

# Now available everywhere:
dafke audit                    # Readiness assessment
dafke status                   # Dashboard
dafke doctor                   # Check what's broken
dafke init                     # Full interactive setup
dafke init --non-interactive   # Headless setup with defaults
```

To unlink later: `npm unlink -g dafke`

### Testing the Init Wizard

The init wizard is the primary onboarding flow. Test it in a safe branch:

```bash
cd /path/to/your-repo
git checkout -b test/dafke-init

# Run the full wizard
dafke init

# Or test specific steps by skipping others
dafke init --skip auth,connect,plugins

# Or resume a previously interrupted wizard
dafke init --resume

# Or run non-interactively (uses defaults for all prompts)
dafke init --non-interactive
```

**What the wizard creates** (review before committing):
- `CLAUDE.md` -- AI operating instructions for this repo
- `.claude/settings.json` -- hooks, permissions, MCP configuration
- `.dafke/manifest.yaml` -- readiness scores, tech stack, config version
- `lefthook.yml` -- git hooks (pre-commit, commit-msg, pre-push)
- `docs/ARCHITECTURE.md` -- auto-generated architecture overview

### Testing Individual Commands

| Command | What It Tests | Safe? |
|---|---|---|
| `dafke audit` | Readiness assessment (6 dimensions) | Read-only, safe |
| `dafke audit --format json` | JSON output for CI integration | Read-only, safe |
| `dafke audit --dimension coverage` | Single dimension deep-dive | Read-only, safe |
| `dafke status` | Dashboard display | Read-only, safe |
| `dafke doctor` | Diagnostic checks | Read-only by default |
| `dafke doctor --fix` | Auto-fix broken config | Creates files |
| `dafke repos` | List accessible repositories | Read-only, needs auth |
| `dafke connect` | Setup external connections | Saves to ~/.dafke/ |
| `dafke update --check` | Check for config drift | Read-only |
| `dafke hook session-start` | Test Claude Code hook handler | Read-only |

### Testing the Claude Code Skills

After running `dafke init`, open Claude Code in the repository and test:

```bash
# Inside a Claude Code session:
/dafke-help                    # Interactive help
/dafke-audit                   # Run assessment from within Claude
/dafke-backlog                 # List backlog items (needs Jira/Azure DevOps)
/dafke-story PROJ-123          # View a specific story
/dafke-coverage                # Analyze test coverage
/dafke-security                # Run security scan
```

### Validating Against Multiple Tech Stacks

Test against repos of different tech stacks to verify adapter detection:

```bash
# .NET repo
cd /path/to/dotnet-repo && dafke audit --format json | jq '.scores'

# Java repo
cd /path/to/java-repo && dafke audit --format json | jq '.scores'

# TypeScript repo
cd /path/to/ts-repo && dafke audit --format json | jq '.scores'

# Delphi repo (should detect comprehension-only mode)
cd /path/to/delphi-repo && dafke audit --format json | jq '.scores'
```

### Running the Test Suite (for contributors)

```bash
cd /path/to/dafke

# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run a specific test file
npx vitest run tests/unit/assessment-engine.test.ts

# Run mutation testing (Stryker)
npx stryker run --mutate "src/core/config/*.ts"

# Type-check
npm run typecheck

# Lint
npm run lint
```

### CI Integration Testing

Test the audit command in your CI pipeline before enabling enforcement:

```yaml
# GitHub Actions
- name: Dafke CC Readiness Check
  run: npx dafke audit --format json > readiness.json
  continue-on-error: true  # Don't block yet, just report

# Azure DevOps
- script: npx dafke audit --format json > readiness.json
  displayName: 'Dafke CC Readiness Check'
  continueOnError: true
```

---

## 10. Distribution & Deployment

This section covers how to distribute dafke to your engineering teams and keep everyone up to date.

### Distribution Options

#### Option 1: Azure DevOps Artifacts (Recommended for Dafke)

Install locally from source — no external feed, no authentication, nothing published anywhere:

```bash
# From the dafke-cli/ folder
npm install
npm run build
npm install -g .      # or: npm link

# Now available everywhere:
dafke init
```

#### Option 2: Claude Code Plugin (Complementary)

Distribute skills and agents as a Claude Code plugin alongside the npm package:

```bash
# Developers install the plugin:
claude plugin install dafke

# This installs:
# - 26 /dafke-* skills
# - 10 agent definitions (3 teams)
# - Claude Code hooks
# - MCP server configuration
```

To set up an internal Claude Code plugin marketplace:

1. Push `dafke` to your Azure DevOps or GitHub repo
2. Create a marketplace registry file pointing to the repo
3. Developers add the marketplace: `claude plugin add-marketplace <url>`
4. Then install: `claude plugin install dafke`

#### Option 3: Direct from Git (Simplest for Pilots)

For the Wave 0 (Nurse team) pilot, direct git clone is fastest:

```bash
# Each developer:
cd /path/to/dafke-cli
npm install && npm run build && npm link

# Now available everywhere:
dafke init
```

### Deployment to Teams (Wave Rollout)

Follow the wave rollout from the Claude Code Acceleration deck:

#### Wave 0: Nurse Team (This Week)

```bash
# Champions install and test:
git clone <dafke-repo>
cd dafke && npm install && npm run build && npm link

# Initialize each Nurse team repo:
cd /path/to/nurse-repo
dafke init

# Verify:
dafke audit
dafke status
```

#### Wave 1: Ready Now Teams (Weeks 1-2)

```bash
# Publish to Azure Artifacts (if not done in Wave 0):
npm publish

# Teams install:
npx @dafke/dafke init

# Champions verify each repo:
dafke audit --format json > readiness-report.json
```

#### Wave 2: Needs Prep Teams (Weeks 3-5)

```bash
# Teams install and run assessment:
npx @dafke/dafke audit

# Use /dafke-gate to improve dimensions:
# (Inside Claude Code session)
/dafke-gate security     # Improve security dimension
/dafke-gate cicd         # Improve CI/CD dimension

# Re-assess after improvements:
dafke audit
```

#### Wave 3: Needs Investment Teams (Weeks 6-8)

```bash
# Includes Delphi/FoxPro teams with adapted plan
npx @dafke/dafke init

# Delphi/FoxPro repos will detect comprehension-only mode:
# "Claude Code as comprehension accelerator, not code generator"
```

### Keeping Teams Up To Date

#### Automatic Update Checks

dafke checks for updates automatically on every run. When a new version is available:

```
  New version available: 0.1.0 → 0.2.0
  Run `dafke update` to apply configuration changes.
```

#### Pushing Configuration Updates

When you update dafke (new hooks, new skills, new templates):

1. **Publish the new version**: `npm version minor && npm publish`
2. **Developers update**: `dafke update`
   - Shows a diff of what changed
   - Asks before applying each change
   - Updates `.dafke/manifest.yaml` version
3. **Force update** (for mandatory security patches): `dafke update --force`

#### Managed Settings (Enterprise)

For organization-wide enforcement, use Claude Code managed settings:

```bash
# Deploy via MDM (Jamf, Intune, GPO):
# Place at /Library/Application Support/ClaudeCode/managed-settings.json (macOS)
# or %ProgramData%/ClaudeCode/managed-settings.json (Windows)

{
  "enabledPlugins": {
    "dafke": true
  },
  "permissions": {
    "deny": ["Bash(rm -rf *)"],
    "allow": ["Read", "Glob", "Grep"]
  },
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "dafke hook pre-bash" }]
    }]
  }
}
```

### Monitoring Adoption

Track rollout progress with the metrics command:

```bash
# Per-repo status:
dafke status

# Organization-wide (run from each repo, aggregate JSON):
for repo in ~/Code/*/; do
  cd "$repo"
  dafke audit --format json 2>/dev/null
done | jq -s '[.[] | {name: .repoName, wave: .wave, score: .totalScore}]'
```

The success criteria from the deployment deck:

| Category | Metric | Target |
|---|---|---|
| **Adoption** | Activation rate | > 85% |
| **Adoption** | Daily usage | > 50% |
| **Adoption** | AI share | 25-40% (optimal) |
| **Quality** | Change failure rate | No increase |
| **Quality** | Coverage | >= 80% |
| **Quality** | PR cycle time | -30% |
| **Experience** | NPS | > +25 |
| **Experience** | Training satisfaction | > 4.0/5 |

### Versioning Strategy

dafke follows semantic versioning:

- **Patch** (0.1.x): bug fixes, template corrections, documentation updates
- **Minor** (0.x.0): new skills, new adapters, new hook events, new analyzers
- **Major** (x.0.0): breaking config schema changes, removed commands, changed defaults

When a new version requires config migration, `dafke update` handles it automatically.

---

## 11. Troubleshooting

### "dafke init" Hangs or Fails at Authentication

**Symptoms**: The wizard stops at the auth step with a timeout or permission error.

**Solutions**:
1. Verify your PAT has not expired: check in Azure DevOps > User Settings > Personal Access Tokens.
2. Ensure your PAT has the required scopes: `Code (Read/Write)`, `Work Items (Read/Write)`, `Build (Read)`.
3. Test connectivity manually: `curl -u :YOUR_PAT https://dev.azure.com/dafke/_apis/projects`
4. If behind a corporate proxy, set `HTTP_PROXY` and `HTTPS_PROXY` environment variables.

### Plugin Installation Fails

**Symptoms**: The plugins step reports errors installing MCP servers.

**Solutions**:
1. Ensure `npx` can download packages: `npx -y cowsay hello` should work.
2. Check npm registry configuration: `npm config get registry` should return `https://registry.npmjs.org/`.
3. If using a private registry, ensure it mirrors the required public packages.
4. Try installing manually: `npx -y @upstash/context7-mcp@latest` to isolate the issue.

### CI Template Conflicts

**Symptoms**: The CI step fails because pipeline files already exist.

**Solutions**:
1. The wizard does not overwrite existing CI files by default. Use `--force-ci` to replace them.
2. Review the diff between your existing pipeline and the generated template.
3. Merge manually if your pipeline has custom stages.

### Coverage Tools Not Detected

**Symptoms**: The coverage step reports "no coverage tool detected" despite having tests.

**Solutions**:
1. Ensure your test framework is properly configured in `package.json` (TypeScript) or `pom.xml` (Java).
2. For .NET, verify that the `coverlet.collector` NuGet package is installed.
3. Run your test command manually to verify it produces coverage output.
4. Use the override to specify the coverage tool explicitly:

```yaml
# .dafke/manifest.yaml
overrides:
  coverage:
    tool: "c8"
    command: "npx c8 vitest run"
    reportPath: "coverage/lcov.info"
    reportFormat: "lcov"
```

### GitNexus Index Issues

**Symptoms**: GitNexus MCP server fails to start or returns stale data.

**Solutions**:
1. Re-index the repository: `npx gitnexus analyze`
2. Check that the `GITNEXUS_REPO_PATH` is set correctly in MCP config.
3. Clear the index and rebuild: `npx gitnexus clean && npx gitnexus analyze`

### Cross-Platform Path Issues

**Symptoms**: Commands fail on Windows with path-related errors.

**Solutions**:
1. Ensure you are using dafke version 0.1.0+ (older versions had Windows path bugs).
2. Avoid manually editing config files with backslash paths -- use forward slashes or let dafke manage them.
3. If hooks fail, check that Node.js is in your PATH (not just in a terminal-specific profile).

### How to Reset Configuration

To start fresh, remove the dafke state and re-run init:

```bash
# Remove repo-level config
rm -rf .dafke/

# Remove global config (optional -- loses all auth tokens)
rm -rf ~/.dafke/          # macOS/Linux
# or: rd /s /q %APPDATA%\dafke   (Windows)

# Re-initialize
dafke init
```

### How to Report Bugs

File issues in the dafke repository:

1. Run `dafke doctor` and copy the output.
2. Include your OS, Node.js version, and Claude Code version.
3. Create an issue at: `https://dev.azure.com/dafke/platform/dafke/_workitems`
4. Or contact Platform Engineering via Teams.

---

## 12. AI Code Governance

Dafke enforces AI code governance policies to maintain code quality and human oversight.

### AI Share Thresholds

AI share measures the percentage of code in a PR that was generated by AI:

| Tier       | AI Share   | Status     | Action Required |
|------------|------------|------------|-----------------|
| Green      | < 25%      | Healthy    | None |
| Optimal    | 25% - 40%  | Target     | None |
| Warning    | 40% - 50%  | Caution    | Justification required in PR description |
| Reduction  | > 50%      | Over limit | Mandatory reduction plan; PR blocked until addressed |

AI share is calculated by analyzing `Co-Authored-By` headers on commits and comparing AI-generated lines to total lines changed.

### The 7-Item AI Code Checklist

Every PR with AI-generated code must include confirmation of the following checklist:

1. **Comprehension** -- I understand every line of the AI-generated code and can explain its purpose.
2. **Tests** -- AI-generated code has corresponding unit tests that I have reviewed and verified.
3. **Edge Cases** -- I have verified the code handles edge cases, null values, and error conditions.
4. **Security** -- I have checked for injection vulnerabilities, improper input validation, and credential exposure.
5. **Performance** -- I have considered the performance implications (loops, queries, memory) of the generated code.
6. **Standards** -- The code follows our team's naming conventions, patterns, and architecture guidelines.
7. **Dependencies** -- Any new dependencies introduced are approved and do not create license or security issues.

This checklist is automatically added to PR descriptions by `/dafke-pr`.

### PR Size Caps

All pull requests are capped at **400 lines changed** (additions + deletions). This policy ensures:

- PRs are reviewable within a reasonable time
- Changes are small and focused
- Risk per PR is bounded

If a story requires more than 400 lines, use `/dafke-plan` to break it into multiple incremental PRs.

### Review Triage Rules

Code review assignments follow these rules:

| Path Category | Reviewers Required | Additional Requirements |
|---------------|--------------------|------------------------|
| Standard code | 1 reviewer         | CODEOWNERS-based assignment |
| High-risk paths (auth, data, healthcare) | 2 reviewers | Security team sign-off required |
| Infrastructure (CI, deployment) | 1 reviewer | Platform Engineering approval |
| Configuration changes | 1 reviewer | Team lead approval |

High-risk paths are defined by file path patterns:
- `**/auth/**`, `**/security/**`
- `**/data/**`, `**/migration/**`
- `**/healthcare/**`, `**/patient/**`, `**/medical/**`

These patterns can be customized in the repository manifest under `overrides.review.highRiskPaths`.

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `dafke init` | Run the 12-step onboarding wizard |
| `dafke init --resume` | Resume interrupted wizard |
| `dafke init --skip=auth,connect` | Skip specific steps |
| `dafke init --non-interactive` | Run without prompts |
| `dafke status` | Show installation status |
| `dafke doctor` | Diagnose and fix issues |
| `dafke update` | Update to latest version |
| `dafke audit [--deep]` | Run full repository audit |
| `/dafke-backlog` | View sprint work items |
| `/dafke-story PROJ-123` | Focus on a story |
| `/dafke-plan PROJ-123` | Generate implementation plan |
| `/dafke-dev PROJ-123` | Implement a story |
| `/dafke-review` | Review changes |
| `/dafke-pr PROJ-123` | Create a pull request |
| `/dafke-ci` | Monitor CI pipeline |
| `/dafke-deploy` | Deploy changes |
| `/dafke-coverage` | Run coverage analysis |
| `/dafke-mutate` | Run mutation testing |
| `/dafke-security` | Run security scanning |
| `/dafke-arch` | Generate architecture docs |
| `/dafke-gate` | View improvement plan |
| `/dafke-gate [dim]` | Improve specific dimension |
| `/dafke-onboard` | New developer walkthrough |
| `/dafke-help` | Interactive help |
