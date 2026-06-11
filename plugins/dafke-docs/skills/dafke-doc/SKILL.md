---
name: dafke-doc
description: Generate feature documentation (Confluence or local). Creates Technical Changes, User Changes, and Change Log entries for features and bugs.
category: docs
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - Skill
  - AskUserQuestion
  - mcp__plugin_atlassian_atlassian__createConfluencePage
  - mcp__plugin_atlassian_atlassian__updateConfluencePage
  - mcp__plugin_atlassian_atlassian__getConfluencePage
  - mcp__plugin_atlassian_atlassian__searchConfluenceUsingCql
  - mcp__plugin_atlassian_atlassian__getConfluencePageDescendants
---

# /dafke-doc

Generate feature documentation for a user story or bug. Creates Technical Changes (for engineers) and User Changes (for stakeholders) pages, plus a Change Log entry.

**Supports two modes:**
- **Confluence mode:** Creates pages in Confluence via Atlassian MCP (requires config)
- **Local mode:** Generates markdown files in `docs/features/` (fallback when no Confluence)

## Arguments

- `<story-id>` (required) — The user story or bug ID (e.g., `PROJ-123`, `12345`)

## Workflow

### Step 1: Validate Configuration

1. Read `.dafke/manifest.yaml` — check for `confluence` section
2. If Confluence config exists, validate it (cloudId, spaceId, folder pageIds)
3. If Confluence config missing:
   - In interactive mode: prompt user for configuration and save to manifest
   - In non-interactive mode: switch to **local mode**
4. Check if Atlassian MCP server is available (`mcp__plugin_atlassian_atlassian__*` tools)
   - If not available: switch to **local mode** with message: "Atlassian MCP not available. Generating local docs."

### Step 2: Check Idempotency

1. **Confluence mode:** Search for existing pages matching `[<story-id>]*` under features/bugs folder
2. **Local mode:** Check if `docs/features/<story-id>/` or `docs/bugs/<story-id>/` directory exists
3. If documentation exists:
   - Ask: "Documentation exists for <story-id>. [Update existing / Skip / Create new]"
   - Default: Update existing

### Step 3: Fetch Context

1. Fetch story details via `/dafke-story <story-id>` (title, description, acceptance criteria)
2. Run `git diff main..HEAD --stat` for file change summary
3. Run `git log main..HEAD --oneline` for commit summary
4. Classify changes: technical vs. user-facing

### Step 4: Generate Documentation Locally

Generate documentation files using templates from `templates/doc/`:

**For Features:**
```
docs/features/<story-id>/
  technical-changes.md    — Architecture, API, DB, code patterns, testing
  user-changes.md         — User-facing summary, new features, how to use
```

**For Bugs:**
```
docs/bugs/<story-id>/
  technical-analysis.md   — Root cause, fix details, affected components
  user-impact.md          — User-facing impact (if any)
```

### Step 5: Human Review Gate

**STOP and present the generated documentation to the user:**

1. Show summary: sections generated, key facts extracted, warnings
2. Ask: "Publish to Confluence? [Yes / Edit first / Local only / Abort]"
   - **Yes:** Proceed to Step 6
   - **Edit first:** Tell user to edit files in `docs/features/<story-id>/`, then re-run
   - **Local only:** Skip Step 6, report local file paths
   - **Abort:** Delete generated files, exit

### Step 6: Publish to Confluence (if approved)

Only execute if Confluence mode is active AND user approved in Step 5.

1. Create folder: `Features/[<story-id>] <story-title>/` (parent: `featuresFolder.pageId`)
2. Create page: **Technical Changes** (content from `technical-changes.md`)
3. Create page: **User Changes** (content from `user-changes.md`)
4. Prepend entry to **Change Log** page (`changeLog.pageId`)
5. Handle rate limiting: exponential backoff (1s, 2s, 4s), max 3 retries

### Step 7: Report

- **Confluence mode:** Show page URLs
- **Local mode:** Show file paths
- Show any warnings or skipped sections
- If Change Log update failed: warn but don't fail

## Error Handling

| Scenario | Action |
|----------|--------|
| Confluence not configured | Switch to local mode |
| Atlassian MCP unavailable | Switch to local mode |
| Auth token expired | Error with suggestion: `/dafke-connect` |
| Network timeout | Retry once, then local mode |
| Duplicate page | Offer update/skip/create-new |
| Story not found | Error with story ID |
| Rate limiting (429) | Exponential backoff, max 3 retries |
| Permission denied (403) | Error with space permissions suggestion |

## Confluence Configuration

Stored in `.dafke/manifest.yaml` under the `confluence` key:

```yaml
confluence:
  cloudId: "<cloud-id>"
  spaceId: "<space-id>"
  spaceKey: "<space-key>"
  rootFolder:
    name: "Project Docs"
    pageId: "<page-id>"
  changeLog:
    name: "Change Log"
    pageId: "<page-id>"
  featuresFolder:
    name: "Features"
    pageId: "<page-id>"
  bugsFolder:
    name: "Bugs"
    pageId: "<page-id>"
```

Authentication credentials (email, apiToken, siteUrl) are stored separately in `~/.dafke/config.yaml` under `auth.confluence`.
