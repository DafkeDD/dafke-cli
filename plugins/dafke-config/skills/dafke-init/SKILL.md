---
name: dafke-init
description: Use when the user wants to initialize dafke in a repository, run the setup wizard, or onboard a new project
category: tool
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-init

Run the initialization wizard to onboard a repository to the Dafke AI Control Center.

## Steps

1. **Check prerequisites**:
   - Verify Node.js >= 20 is installed.
   - Verify git is initialized in the current directory.
   - Check if `.dafke/manifest.yaml` already exists (offer to reconfigure if so).

2. **Run the wizard** — Execute `npx dafke init`:
   - If the CLI is installed: run it directly, it handles the interactive flow.
   - If not installed: guide the user through manual setup (steps 3-6).

3. **Detect project** — Analyze the repository to determine:
   - Language/framework (TypeScript, Java, .NET, Delphi, FoxPro, Python).
   - Package manager (npm, maven, nuget, pip, etc.).
   - Existing CI/CD (GitHub Actions, Azure Pipelines, etc.).
   - Existing test framework and coverage tools.
   - Git hosting (GitHub, Azure DevOps, GitLab).

4. **Configure providers** — Prompt for:
   - Work-item provider: Jira or Azure DevOps (project URL, auth token).
   - CI/CD provider: GitHub Actions or Azure Pipelines.
   - Code hosting: GitHub or Azure Repos.

5. **Generate configuration files**:
   - `.dafke/manifest.yaml` — project config and provider connections.
   - `CLAUDE.md` — project-specific instructions (from template).
   - `.claude/settings.json` — skill registrations and hooks.
   - CI pipeline config (if missing).
   - lefthook config for git hooks (if missing).

6. **Run initial assessment** — Invoke `/dafke-audit` to baseline the project.

7. **Report** — Show what was created, initial scores, and suggested next steps.

## Error Handling

- Not a git repo: suggest `git init` first.
- Unsupported language: warn but continue with generic config.
- Existing config conflicts: show diff and ask before overwriting.
