---
name: dafke-spec-update
description: Use when the user wants to update a specification based on implementation changes or new requirements
category: sdlc
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-spec-update

Update an existing specification to reflect implementation changes or requirement evolution.

## Steps

1. **Validate argument** — Story ID is required. If missing, ask and stop.

2. **Load current spec** — Read `.dafke/specs/<story-id>.md`.
   - If no spec exists: suggest running `/dafke-spec <ID>` first.

3. **Detect changes since spec was written**:
   - Get spec creation/modification date.
   - Find code changes after that date: `git log --since="<spec-date>" --name-only -- <relevant-dirs>`.
   - Find story updates from the backlog provider (if available).
   - Run `/dafke-spec-verify` to identify divergences.

4. **Categorize changes**:
   - **Additions**: New behavior not in the original spec.
   - **Modifications**: Changed behavior from what was specified.
   - **Removals**: Specified behavior that was not implemented or removed.
   - **Refinements**: Implementation details that clarify the spec.

5. **Generate spec diff** — Show what will change:
   ```
   ## Spec Update: <STORY-ID>

   ### Additions
   - FR3: Added rate limiting (implemented in middleware.ts)
   - Scenario 4: Rate limit exceeded returns 429

   ### Modifications
   - FR1: Changed response format from XML to JSON
   - Scenario 1: Updated expected response body

   ### Removals
   - NFR2: Removed caching requirement (deferred to next sprint)
   ```

6. **Apply updates** — After user approval:
   - Update the spec file with changes.
   - Add a changelog section at the bottom of the spec.
   - Update the `Generated` date.
   - Preserve traceability (link changes to commits or story updates).

7. **Re-verify** — Run `/dafke-spec-verify` to confirm spec and implementation are in sync.

## Error Handling

- Conflicting changes (implementation contradicts story update): flag for human decision.
- Spec format changed: migrate to latest format before updating.
- No detectable changes: confirm spec is still current, update timestamp only.
