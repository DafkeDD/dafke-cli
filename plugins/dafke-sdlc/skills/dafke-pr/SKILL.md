---
name: dafke-pr
description: Use when the user wants to create a pull request, submit changes for review, or push work to the remote
category: sdlc
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-pr

Create a well-structured pull request linked to the originating ticket.

## Steps

1. **Validate argument** — Story ID is required. If missing, ask and stop.

2. **Read manifest** — Load `.dafke/manifest.yaml` for provider config and PR conventions.

3. **Gather context**:
   - Run `git log main...HEAD --oneline` to list commits being merged.
   - Run `git diff --stat main...HEAD` for change summary.
   - Load the implementation plan from `.dafke/plans/<story-id>.md` if it exists.
   - Load the story details (title, description, ACs).

4. **Run self-review** — Invoke `/dafke-review` to verify quality gates pass.
   - If verdict is FAIL: stop and tell user to fix blocking issues first.
   - If WARN: proceed but include warnings in PR description.

5. **Generate PR content**:
   - **Title**: `feat(<scope>): <short description> [<STORY-ID>]` (under 70 chars).
   - **Body**:
     ```markdown
     ## Summary
     <1-3 sentences describing what this PR does and why>

     ## Linked Ticket
     <link to Jira/Azure DevOps ticket>

     ## Changes
     - <bullet list of key changes>

     ## Test Plan
     - [ ] Unit tests added for happy paths
     - [ ] Unit tests added for failure paths
     - [ ] Manual testing steps (if applicable)

     ## AI Code Checklist
     - [x] Matches spec
     - [x] No new vulnerabilities
     - [x] Tests cover happy + failure
     - [x] No hardcoded secrets
     - [x] Follows existing patterns
     - [x] Under 400 lines
     - [x] CLAUDE.md rules followed

     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

6. **Create the PR**:
   - Push branch: `git push -u origin HEAD`.
   - **GitHub**: `gh pr create --title "<title>" --body "<body>"`.
   - **Azure DevOps**: use `az repos pr create` or REST API.

7. **Link to ticket**:
   - **Jira**: Add PR link via REST API or include ticket ID in branch/title.
   - **Azure DevOps**: Link work item via `--work-items <id>`.

8. **Request reviewers** — Check CODEOWNERS file and request appropriate reviewers.

9. **Report** — Display PR URL, linked ticket, and reviewer assignments.

## Error Handling

- No remote configured: prompt to add remote first.
- PR already exists for branch: show existing PR URL.
- Push rejected: suggest pulling/rebasing first.
