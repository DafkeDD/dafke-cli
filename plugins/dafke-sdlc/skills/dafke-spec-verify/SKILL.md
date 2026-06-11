---
name: dafke-spec-verify
description: Use when the user wants to validate that implementation matches the specification
category: sdlc
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-spec-verify

Verify that the current implementation matches the specification.

## Steps

1. **Validate argument** — Story ID is required. If missing, ask and stop.

2. **Load the spec** — Read `.dafke/specs/<story-id>.md`.
   - If no spec exists: suggest running `/dafke-spec <ID>` first and stop.

3. **Identify implementation files** — From the spec and git history:
   - Files changed for this story: `git log --all --oneline --grep="<story-id>" --name-only`.
   - Files referenced in the implementation plan: `.dafke/plans/<story-id>.md`.
   - Cross-reference with spec's affected modules.

4. **Verify each requirement**:

   **Functional Requirements** — For each FR in the spec:
   - Find the implementing code (function, class, endpoint).
   - Verify the behavior matches the requirement.
   - Check if there is a corresponding test.
   - Status: IMPLEMENTED / PARTIAL / MISSING.

   **Non-Functional Requirements** — For each NFR:
   - Check if performance constraints are tested.
   - Check if security requirements are enforced.
   - Check if error handling matches spec.
   - Status: VERIFIED / UNVERIFIABLE / MISSING.

   **Behavior Scenarios** — For each scenario:
   - Find matching test case(s).
   - Verify test assertions match expected outcomes.
   - Status: COVERED / PARTIAL / NOT TESTED.

5. **Generate verification report**:
   ```
   ## Spec Verification: <STORY-ID>

   ### Requirements Coverage
   | Req | Status | Evidence |
   |-----|--------|----------|
   | FR1 | IMPLEMENTED | src/auth/login.ts:42 |
   | FR2 | PARTIAL | Missing error case |
   | NFR1 | UNVERIFIABLE | No perf test configured |

   ### Scenario Coverage
   | Scenario | Test | Status |
   |----------|------|--------|
   | Happy path login | auth.test.ts:15 | COVERED |
   | Invalid password | auth.test.ts:32 | COVERED |
   | Expired token | — | NOT TESTED |

   ### Verdict: 85% compliant
   - 2 requirements fully met
   - 1 requirement partially met (missing error handling)
   - 1 scenario not tested
   ```

6. **Suggest fixes** — For each gap, provide specific guidance on what to add.

## Error Handling

- Spec is outdated: warn and suggest running `/dafke-spec-update`.
- Implementation files deleted: flag as potential regression.
- Ambiguous mapping: list possible matches and ask user to confirm.
