---
name: dafke-dev
description: Use when the user wants to execute an implementation plan, develop a story step by step, or continue development work
category: sdlc
argument-hint: "<story-id> | continue"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
---

# /dafke-dev

Execute an implementation plan using the dafke-dev-team agent team.

## Steps

1. **Resolve the plan**:
   - If argument is a story ID: load `.dafke/plans/<story-id>.md`.
   - If argument is `continue`: load `.dafke/state/dev-progress.json` and resume from last completed step.
   - If no plan exists: tell user to run `/dafke-plan <story-id>` first and stop.

2. **Initialize progress tracking** — Create/update `.dafke/state/dev-progress.json`:
   ```json
   {
     "storyId": "PROJ-123",
     "planFile": ".dafke/plans/PROJ-123.md",
     "currentStep": 1,
     "totalSteps": 5,
     "completedSteps": [],
     "status": "in-progress"
   }
   ```

3. **For each implementation step** in the plan:

   a. **Explore** — Use the Explorer agent to re-read relevant files and confirm the plan step is still valid.

   b. **Implement** — Write the code changes following existing codebase patterns:
      - Match naming conventions, file structure, import style.
      - Follow TypeScript strict mode (no `any` types).
      - Use proper error handling with typed errors.
      - Add Co-Authored-By header tracking.

   c. **Test** — Write tests for this step:
      - Happy path tests (expected behavior works).
      - Failure path tests (errors handled correctly).
      - Edge case tests where applicable.

   d. **Verify** — Run the test suite:
      ```bash
      npm test -- --reporter=verbose
      ```
      - If tests fail: diagnose, fix, re-run. Max 3 retry attempts.
      - If tests pass: proceed to commit.

   e. **Commit** — Create a focused commit for this step:
      - Message format: `feat(<scope>): <description> [<STORY-ID>]`
      - Include `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.

   f. **Update progress** — Mark step as completed in dev-progress.json.

4. **Final verification** — After all steps:
   - Run full test suite with coverage.
   - Run lint and type-check.
   - Verify total lines changed < 400.

5. **Report** — Summarize what was implemented, tests added, and coverage delta.

## Error Handling

- Test failures after 3 retries: pause, save progress, report the failure for human review.
- Build errors: diagnose and fix before proceeding.
- Scope creep: if implementation diverges significantly from plan, pause and flag.
