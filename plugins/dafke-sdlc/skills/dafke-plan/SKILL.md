---
name: dafke-plan
description: Use when the user wants to generate an implementation plan from a user story, plan development work, or break down a ticket
category: sdlc
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Skill
---

# /dafke-plan

Generate a detailed implementation plan for a user story.

## Steps

1. **Validate argument** — Story ID is required. If missing, ask and stop.

2. **Fetch the story** — Use `/dafke-story <ID>` to retrieve story details and acceptance criteria.

3. **Analyze the codebase** — Use the Explorer agent (or GitNexus if indexed) to:
   - Identify files and modules related to the story domain.
   - Map existing patterns (naming, structure, test approach).
   - Identify dependencies and integration points.
   - Check for similar past implementations to follow as reference.

4. **Generate implementation plan** — Write a structured plan to `.dafke/plans/<story-id>.md`:

   ```markdown
   # Implementation Plan: <STORY-ID> — <Title>

   ## Summary
   <1-2 sentence overview>

   ## Affected Files
   | File | Action | Description |
   |------|--------|-------------|
   | src/foo/bar.ts | modify | Add new handler |
   | src/foo/bar.test.ts | create | Tests for handler |

   ## Implementation Steps
   ### Step 1: <description>
   - Files: <list>
   - Details: <what to change and why>
   - Tests: <what tests to write>

   ### Step 2: ...

   ## Architecture Impact
   - New dependencies: <none | list>
   - API changes: <none | list>
   - Database changes: <none | list>

   ## Test Strategy
   - Unit tests: <list of test files>
   - Integration tests: <if applicable>
   - Happy paths: <list>
   - Failure paths: <list>

   ## Risk Assessment
   - <risk and mitigation>

   ## Estimated Scope
   - Files changed: X
   - Lines added/modified: ~Y (must be <400 for single PR)
   ```

5. **Validate plan scope** — If estimated changes exceed 400 lines, suggest splitting into multiple PRs.

6. **Present the plan** — Display the full plan and ask for approval before proceeding.

## Error Handling

- Story has no acceptance criteria: warn and suggest running `/dafke-story` first.
- Codebase not indexed: proceed with file-system analysis, suggest running GitNexus analyze.
