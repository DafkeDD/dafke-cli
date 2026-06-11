# Dafke AI Control Center

Personal CLI that onboards a Next.js/TypeScript project to AI-assisted development with Claude Code. Detects the stack, assesses readiness, generates configuration, installs plugins, and enforces governance — all through a resumable wizard. Private — for your own use; it sends no data anywhere.

## Install

Build and install locally from this repository (no external feed, no authentication):

```bash
# from the dafke-cli/ folder
npm install
npm run build
npm install -g .
```

### Verify

```bash
dafke --help
```

### Keeping dafke Up to Date

```bash
npm install -g dafke@latest
dafke update   # Apply config drift fixes in each repository
```

## Quick Start

```bash
# Verify Claude Code CLI is installed (required for init)
claude --version

# Run the interactive wizard in any repository
dafke init

# Resume an interrupted session
dafke init --resume

# Non-interactive mode (use defaults)
dafke init --non-interactive

# List available Dafke plugins
dafke plugin list

# Install a specific plugin
dafke plugin install dafke-sdlc
```

## Prerequisites

**Required:**
- **Node.js 20+** — verify with `node --version`
- **Git 2.30+** — for hooks and PR workflows
- **Claude Code CLI** — required for `dafke init` (`claude --version`)

**Recommended:**
- **Gitleaks** — secrets scanning (`gitleaks --version`)
- **Lefthook** — git hooks (`lefthook --version`)

**Optional (provider-specific):**
- **Azure CLI** (`az`) — when using Azure DevOps
- **GitHub CLI** (`gh`) — when using GitHub

The init wizard checks for these automatically and provides OS-specific installation hints.

## What It Does

### 1. Detects Your Tech Stack

Automatically identifies the project's technology with confidence scoring:

| Stack | Detection Signals |
|-------|-------------------|
| **Java** | `pom.xml`, `build.gradle`, `.java` files |
| **.NET** | `.csproj`, `.sln`, `global.json` |
| **TypeScript** | `tsconfig.json`, TypeScript in `package.json` |
| **Python** | `pyproject.toml`, `setup.py`, `requirements.txt`, `.py` files |
| **Delphi** | `.dpr`, `.dpk`, `.pas` files |
| **FoxPro** | `.prg`, `.vcx`, `.scx` files |

### 2. Assesses Readiness

Scores your repository across 6 dimensions (0-5 each):

| Dimension | What's Measured |
|-----------|----------------|
| CI/CD Maturity | Pipeline presence, coverage enforcement |
| Test Coverage | Coverage %, tooling |
| Security Pipeline | SAST, secrets detection, SCA, DAST, SBOM |
| Code Review Culture | PR approval rules, process |
| DORA Metrics | Deployment frequency, lead time |
| Documentation | README, API docs, architecture docs, external wikis |

Hard gates: CI/CD >= 3 and Security >= 3 are mandatory for Wave 1.

### 3. Assigns Rollout Waves

- **Wave 1** (Green) — Ready for AI-assisted development
- **Wave 2** (Yellow) — Needs minor improvements first
- **Wave 3** (Red) — Significant gaps to address

### 4. Generates Configuration

- **`CLAUDE.md`** — Project rules tailored to your tech stack
- **`.claude/rules/`** — Tech-specific instruction files (architecture, testing, conventions)
- **`.claude/settings.json`** — Hooks and permission configuration
- **Claude Code plugins** — 5 Dafke plugin packages installed via marketplace
- **Git hooks** — Pre-commit (gitleaks, lint, typecheck), pre-push (test, coverage)
- **CI/CD pipelines** — Azure Pipelines or GitHub Actions templates
- **`.dafke/manifest.yaml`** — Repository metadata and scores

### 5. Enforces Governance

- **AI share caps** — <25% green, 25-40% optimal, 40-50% warning, >50% mandatory reduction
- **PR size cap** — 400 lines maximum
- **Human review** — Required on all PRs + 7-item AI code checklist
- **High-risk paths** — Auth, data, healthcare require 2 reviewers + security sign-off
- **Co-Authored-By** — Required on all AI-assisted commits

## Plugin Packages

Skills and agents are distributed as 5 independent Claude Marketplace plugins, installed automatically during `dafke init`:

| Plugin | Contents | Description |
|--------|----------|-------------|
| **dafke-sdlc** | 9 skills, 5 agents | Story-to-PR pipeline: `/dafke-story`, `/dafke-plan`, `/dafke-spec`, `/dafke-dev`, `/dafke-review`, `/dafke-pr`, `/dafke-parallel`, `/dafke-spec-update`, `/dafke-spec-verify` |
| **dafke-quality** | 6 skills, 5 agents | Quality gates: `/dafke-lint`, `/dafke-coverage`, `/dafke-mutate`, `/dafke-security`, `/dafke-audit`, `/dafke-gate` |
| **dafke-observability** | 5 skills | Monitoring: `/dafke-ci`, `/dafke-deploy`, `/dafke-status`, `/dafke-metrics`, `/dafke-backlog` |
| **dafke-docs** | 4 skills, 5 agents | Documentation: `/dafke-arch`, `/dafke-doc`, `/dafke-help`, `/dafke-onboard` |
| **dafke-config** | 4 skills | Setup: `/dafke-init`, `/dafke-doctor`, `/dafke-update`, `/dafke-discover` |

```bash
# List plugins and install status
dafke plugin list

# Install a specific plugin
dafke plugin install dafke-sdlc

# Uninstall
dafke plugin uninstall dafke-sdlc
```

## Commands

| Command | Description |
|---------|-------------|
| `dafke init` | 13-step initialization wizard (requires Claude CLI) |
| `dafke audit [--deep]` | Run readiness assessment and display scores |
| `dafke resolve` | Auto-fix readiness gaps by generating configuration files |
| `dafke status` | Dashboard of current repo readiness (`--explain` for scoring guide) |
| `dafke doctor` | Self-heal broken configs |
| `dafke connect` | Authenticate with Azure DevOps / GitHub / Jira / Confluence |
| `dafke update` | Check for CLI updates and detect config drift |
| `dafke plugin` | Manage Dafke Claude Code plugins (list, install, uninstall) |
| `dafke repos` | List accessible repositories |
| `dafke docs` | Scaffold architecture documentation from code analysis (alias: `gendoc`) |
| `dafke hook` | Git hook integration endpoint |
| `dafke skills` | _(deprecated)_ — use `dafke plugin list` instead |

### Audit

```bash
dafke audit                          # Run readiness assessment
dafke audit --dimension cicd         # Detailed evidence for one dimension
dafke audit --override cicd=5,dora=4 # Manual score overrides
dafke audit --deep                   # AI-powered deep analysis (requires Claude CLI)
dafke audit --format json            # Machine-readable output
```

### Resolve

```bash
dafke resolve --dry-run              # Preview what would be generated
dafke resolve                        # Auto-fix all resolvable dimensions
dafke resolve --dimension security   # Fix a specific dimension
dafke resolve --force                # Overwrite existing files
```

| Dimension | Generated Files |
|-----------|-----------------|
| CI/CD | GitHub Actions or Azure Pipelines quality gates |
| Security | `.semgrep.yml`, `.gitleaks.toml`, Dependabot/Renovate |
| Coverage | `.nycrc.json` (TS), `coverlet.runsettings` (.NET), JaCoCo (Java) |
| Code Review | `CODEOWNERS`, PR template, branch protection |

### Docs

```bash
dafke docs                         # Scaffold architecture documentation
dafke docs --dry-run               # Preview what would be generated
dafke docs --update                # Incremental update (changed modules only)
dafke docs --skip graphify,typedoc # Skip slow analysis layers
```

Scaffolds baseline `docs/ARCHITECTURE.md`, per-module stubs, C4 diagrams, and `INDEX.md` from code analysis tools (GitNexus, madge, Graphify, TypeDoc).

For **AI-powered documentation** with source-code verification and iterative quality review, install the `dafke-docs` plugin (`dafke plugin install dafke-docs`) and invoke `/dafke-docs-generate` in Claude Code. The AI crew is inspired by [claude-code-documentation-crew](https://github.com/ssmirnovpro/claude-code-documentation-crew).

### Status

```bash
dafke status                         # Dashboard with scorecard
dafke status --explain               # Show dimension definitions and scoring criteria
dafke status --format json           # Machine-readable output
dafke status --format json --explain # JSON with scoring rubrics
```

## The Init Wizard

The wizard runs 13 steps, saving progress after each one. Resume with `--resume`.

| # | Step | Description |
|---|------|-------------|
| 1 | Authentication & Providers | Connect to Azure DevOps / GitHub |
| 2 | Repository Detection | Auto-detect tech stack |
| 3 | Readiness Assessment | Score across 6 dimensions |
| 4 | External Tools | Configure Aikido, SonarQube, Azure Wiki, etc. |
| 5 | CLAUDE.md Generation | Generate tech-specific project rules |
| 6 | Instruction Rules | Generate `.claude/rules/` files |
| 7 | Hooks & Settings | Install git hooks and Claude Code settings |
| 8 | Plugin Installation | Install Dafke + recommended Claude Code plugins |
| 9 | CI/CD Hardening | Generate or improve CI pipeline |
| 10 | Test Coverage | Configure coverage tooling |
| 11 | Architecture Docs | Generate architecture documentation |
| 12 | Project Board Connection | Link to Jira / Azure Boards |
| 13 | Verification | Summary, commit, and next steps |

## Smart Features

Claude Code CLI is required for `dafke init`. Other commands degrade gracefully without it.

| Feature | With Claude Code | Without Claude Code |
|---------|-----------------|-------------------|
| CLAUDE.md generation | AI-powered smart merge | Section-based merge |
| Code audit | Deep qualitative analysis (`--deep`) | Mechanical scoring only |
| Plugin selection | Context-aware recommendations | All plugins installed |
| CI analysis | Quality gate gap detection | Template generation |

## Configuration

### Global (`~/.dafke/config.yaml`)

```yaml
providers:
  azureDevOps:
    orgUrl: https://dev.azure.com/your-org
    pat: "***"
  github:
    token: "***"
  jira:
    email: you@example.com
    token: "***"
  sonarqube:
    token: "***"
```

### Repository (`.dafke/manifest.yaml`)

Generated by the wizard. Contains tech stack, CI platform, readiness scores, wave assignment, and schema version.

### Template Overrides

Override built-in templates without forking:

1. **Repo-level**: Place templates in `.dafke/templates/`
2. **Environment variable**: Set `DAFKE_TEMPLATES_DIR` to a custom directory

Resolution order: env var → `.dafke/templates/` → built-in templates.

## Platform Integrations

| Platform | Auth Method | Used For |
|----------|-------------|----------|
| Azure DevOps | PAT | Repos, pipelines, PRs |
| GitHub | Token | Repos, Actions, PRs |
| Jira | Email + API token | Issue tracking |
| Confluence | Email + API token | Documentation |
| SonarQube | Token | Code quality metrics |

## Documentation

| Document | Description |
|----------|-------------|
| [User Manual](docs/user-manual.md) | Getting started, wizard walkthrough, daily workflows |
| [Developer Guide](docs/developer-guide.md) | Dev setup, architecture, contribution guidelines |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |
| [Architecture](docs/ARCHITECTURE.md) | Generated architecture overview (via `dafke docs`) |

## Contributing

See [docs/developer-guide.md](docs/developer-guide.md) for development setup, architecture overview, quality standards, tech stack, and cross-platform requirements.

## License

Private — UNLICENSED. Internal use at Dafke only.
