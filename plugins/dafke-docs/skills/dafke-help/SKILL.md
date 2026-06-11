---
name: dafke-help
description: Use when the user asks for help with dafke commands, workflows, or configuration
category: tool
argument-hint: "[command-name | workflow-name]"
allowed-tools:
  - Bash
  - Read
  - Glob
---

# /dafke-help

Display help for Dafke commands, workflows, and concepts.

## Steps

1. **Parse argument** — Determine what help is needed:
   - No argument: show the full command reference.
   - Command name (e.g., `plan`, `dev`, `review`): show detailed help for that command.
   - Workflow name (e.g., `story-to-pr`, `setup`, `improve`): show the workflow guide.

2. **Full command reference** (no argument):
   ```
   ## Dafke AI Control Center — Command Reference
   Skills are distributed as Claude Code plugins. Install: claude plugin install <name>@dafke

   ### dafke-sdlc plugin (story-to-PR pipeline)
   /dafke-story <id>       Read and verify a user story
   /dafke-plan <id>        Generate implementation plan
   /dafke-spec <id>        Generate spec from story
   /dafke-spec-verify <id> Validate impl matches spec
   /dafke-spec-update <id> Update spec from changes
   /dafke-dev <id>         Execute implementation plan
   /dafke-review           Self-review before PR
   /dafke-pr <id>          Create PR linked to ticket
   /dafke-parallel         Parallel execution via worktrees

   ### dafke-quality plugin (quality gates)
   /dafke-lint             Full lint + format + type-check
   /dafke-coverage         Coverage analysis and test plan
   /dafke-mutate           Mutation testing on changed files
   /dafke-security         SAST + SCA + secrets scan
   /dafke-audit            Run readiness assessment
   /dafke-gate <dim>       Deep-dive into a readiness dimension

   ### dafke-observability plugin (monitoring)
   /dafke-ci               Monitor CI pipeline
   /dafke-deploy           Monitor deployment
   /dafke-status           Success criteria dashboard
   /dafke-metrics          Show DORA + quality metrics
   /dafke-backlog          List/filter backlog items

   ### dafke-docs plugin (documentation)
   /dafke-arch             Regenerate architecture docs
   /dafke-doc              Generate feature documentation
   /dafke-help [topic]     This help system
   /dafke-onboard          New team member guide

   ### dafke-config plugin (setup & maintenance)
   /dafke-init             Run the init wizard
   /dafke-doctor           Diagnose and fix configuration
   /dafke-update           Check and apply config updates
   /dafke-discover         Find community plugins
   ```

3. **Workflow guides** — When a workflow is requested, show the step-by-step flow:

   **story-to-pr**: `story` -> `spec` -> `plan` -> `dev` -> `review` -> `pr` -> `ci`
   **setup**: `init` -> `audit` -> `gate` (repeat) -> `doctor` (if issues)
   **improve**: `audit` -> `gate <lowest>` -> `audit` (verify improvement)

4. **Command detail** — When a specific command is requested:
   - Read the skill's SKILL.md for full details.
   - Show: description, arguments, what it does, example usage.

## Error Handling

- Unknown command: suggest closest match, show full reference.
- Typo in command name: use fuzzy matching to suggest the right command.
