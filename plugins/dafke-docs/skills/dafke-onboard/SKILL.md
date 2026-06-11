---
name: dafke-onboard
description: Use when a new team member needs guidance on the Dafke AI workflow, tools, and practices
category: tool
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-onboard

Guide a new team member through the Dafke AI-assisted development workflow.

## Steps

1. **Welcome and assess** — Determine the new member's context:
   - Role: developer, tech lead, QA, DevOps.
   - Experience with: Claude Code, AI-assisted dev, this specific codebase.
   - Tailor the onboarding depth accordingly.

2. **Environment setup check**:
   - Node.js >= 20 installed.
   - Claude Code CLI installed and authenticated.
   - Git configured with correct user identity.
   - Access to backlog provider (Jira/Azure DevOps).
   - Access to code hosting (GitHub/Azure Repos).
   - Run `/dafke-doctor` to verify everything works.

3. **Explain the Dafke workflow** — Walk through the story-to-PR pipeline:
   ```
   Story -> Spec -> Plan -> Dev -> Review -> PR -> CI -> Deploy
     |        |       |       |       |        |     |      |
   backlog   spec    plan    dev   review     pr    ci   deploy
   ```
   - Each step has a corresponding `/dafke-*` command.
   - The workflow is designed to be iterative and resumable.

4. **Explain key rules**:
   - **AI share governance**: Keep AI-assisted commits between 25-40%.
   - **PR size cap**: Maximum 400 lines changed per PR.
   - **7-item AI code checklist**: Required for all PRs.
   - **Co-Authored-By**: Required on all AI-assisted commits.
   - **Tests**: Both happy and failure paths required.
   - **Human review**: Always required, AI review is supplementary.

5. **Hands-on tutorial** — Guide through a small task:
   - Pick a low-priority backlog item: `/dafke-backlog status=todo priority=low`.
   - Read the story: `/dafke-story <ID>`.
   - Generate a plan: `/dafke-plan <ID>`.
   - Review the plan together.
   - Optionally execute: `/dafke-dev <ID>`.

6. **Reference materials**:
   - Point to `CLAUDE.md` in the repo root for project-specific rules.
   - Point to `/dafke-help` for the full command reference.
   - Point to `/dafke-metrics` to understand team goals.

7. **Completion** — Mark team member as onboarded in `.dafke/team.json` (if tracked).

## Error Handling

- Missing access: provide links to request access for each system.
- Unfamiliar with Claude Code: provide a 2-minute primer before starting.
- Setup issues: redirect to `/dafke-doctor` for automated fixes.
