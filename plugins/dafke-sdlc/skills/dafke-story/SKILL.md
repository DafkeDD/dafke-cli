---
name: dafke-story
description: Use when the user wants to read a user story from the backlog, check story details, or verify acceptance criteria
category: sdlc
argument-hint: "<story-id> (e.g., PROJ-123)"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - mcp__azure-devops__wit_get_work_item
  - mcp__azure-devops__wit_get_work_items_batch_by_ids
  - AskUserQuestion
---

# /dafke-story

Fetch, display, and quality-check a user story.

## Steps

1. **Validate argument** — A story ID is required (e.g., `PROJ-123` or Azure DevOps work-item number).
   - If missing, ask the user for the story ID and stop.

2. **Read manifest** — Load `.dafke/manifest.yaml` to determine the provider and project.
   - Read `backlogProvider.type`, `backlogProvider.project`, `backlogProvider.organization`, and `backlogProvider.team`.
   - If `backlogProvider` is missing, tell the user to run `dafke init --resume` to complete board setup and stop.

3. **Fetch story** — Retrieve the full work item:
   - **Jira**: `npx dafke story --id <ID>` or REST API using `backlogProvider.project`.
   - **Azure DevOps**: Use `wit_get_work_item` MCP tool with `backlogProvider.organization` and `backlogProvider.project` for context.
     If fetching iteration details, use `backlogProvider.team` for team-scoped APIs.

4. **Display story details** in structured format:
   ```
   ## PROJ-123: <Title>
   **Status**: To Do | **Priority**: High | **Sprint**: Sprint 12 | **Assignee**: alice

   ### Description
   <full description text>

   ### Acceptance Criteria
   - [ ] AC1: Given X, when Y, then Z
   - [ ] AC2: ...
   ```

5. **Analyze acceptance criteria quality** — Evaluate each AC against:
   - **Testable**: Can it be verified with an automated test?
   - **Complete**: Does it cover the full behavior (happy + failure)?
   - **Unambiguous**: Is there only one interpretation?
   - **Measurable**: Are success metrics defined where applicable?
   Rate each AC as pass/warn/fail.

6. **Report findings**:
   - If all ACs pass: "Acceptance criteria are well-defined."
   - If issues found: list specific improvements per AC.
   - Suggest missing ACs (error handling, edge cases, security).

## Error Handling

- Story not found: confirm ID is correct, check project scope.
- Partial data: display what is available, flag missing fields.
