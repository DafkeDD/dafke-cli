---
name: dafke-backlog
description: Use when the user wants to list backlog items, filter tickets, or browse Jira/Azure DevOps work items
category: observability
argument-hint: "[filter: sprint=current | status=todo | assignee=me]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - mcp__azure-devops__wit_query_by_wiql
  - mcp__azure-devops__wit_get_work_items_batch_by_ids
  - mcp__azure-devops__work_list_team_iterations
  - mcp__azure-devops__core_list_project_teams
  - AskUserQuestion
---

# /dafke-backlog

List and filter backlog items from the connected work-item provider.

## Steps

1. **Read manifest** — Load `.dafke/manifest.yaml` from the repository root.
   - Extract `backlogProvider.type` (azure-devops | jira), `backlogProvider.project`, `backlogProvider.organization`, and `backlogProvider.team`.
   - If no manifest exists, tell the user to run `dafke init` first and stop.
   - If manifest exists but `backlogProvider` is missing, tell the user to run `dafke init --resume` to complete board setup and stop.

2. **Parse filters** — Interpret the optional argument string.
   - Supported filters: `sprint=<name|current>`, `status=<value>`, `assignee=<name|me>`, `priority=<value>`, `label=<value>`.
   - Multiple filters can be combined with spaces: `sprint=current status=todo`.
   - Default (no argument): show current sprint items.

3. **Query the provider**
   - **Azure DevOps**: Build a WIQL query from filters.
     - To resolve the current sprint, use the team-scoped iteration API:
       call `work_list_team_iterations` with `timeframe: "current"` and `team` from `backlogProvider.team`.
     - If `backlogProvider.team` is not set and the project has multiple teams, list teams
       via `core_list_project_teams` and ask the user to pick one. Suggest adding it to
       `.dafke/manifest.yaml` under `backlogProvider.team` for future use.
     - Use the resolved iteration path in WIQL: `[System.IterationPath] UNDER '<path>'`.
     - WIQL returns only IDs — fetch details with `wit_get_work_items_batch_by_ids`.
   - **Jira**: Build a JQL query from filters. Run via `npx dafke backlog --provider jira --jql "<query>"`.
   - If the CLI is not available, construct the equivalent API call using MCP tools or `curl`.

4. **Display results** — Render a markdown table:
   ```
   | ID       | Title                  | Status | Priority | Assignee |
   |----------|------------------------|--------|----------|----------|
   | PROJ-101 | Add login endpoint     | To Do  | High     | alice    |
   ```
   - Sort by priority descending, then by ID.
   - Cap at 50 items; mention total count if truncated.

5. **Summary line** — Below the table, show: `Showing X of Y items | Sprint: <name> | Filters: <applied>`.

## Error Handling

- Missing credentials: prompt user to configure via `dafke connect`.
- Network errors: show the HTTP status and suggest retrying.
- Empty results: confirm filters are correct, suggest broadening.
