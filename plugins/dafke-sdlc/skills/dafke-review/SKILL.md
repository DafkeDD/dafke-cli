---
name: dafke-review
description: Use when the user wants to self-review before creating a PR, check code quality, or validate against the AI checklist
category: sdlc
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-review

Run a comprehensive self-review before submitting a pull request.

## Steps

1. **Gather change scope** — Run `git diff --stat main...HEAD` (or the appropriate base branch) to determine:
   - Total files changed.
   - Total lines added/removed.
   - List of changed files.

2. **Run quality gates** — Execute each and capture results:

   | Gate | Command | Pass Criteria |
   |------|---------|---------------|
   | Lint | `npm run lint` | Zero errors |
   | Type-check | `npm run typecheck` | Zero errors |
   | Tests | `npm test` | All passing |
   | Coverage | `npm run test:coverage` | >= 80% and no regression |
   | Security | `npm audit --audit-level=moderate` | No moderate+ vulnerabilities |

3. **Check PR size** — If total lines changed > 400:
   - Severity: WARNING
   - Suggest splitting the PR into smaller pieces.
   - Identify logical split points from the commit history.

4. **Run 7-item AI code checklist** — Review the diff against each item:

   | # | Check | How to Verify |
   |---|-------|---------------|
   | 1 | Matches spec? | Compare changes against the story's acceptance criteria |
   | 2 | No new vulnerabilities? | Check for SQL injection, XSS, auth bypass, insecure deps |
   | 3 | Tests cover happy + failure? | Verify test files exist for each changed module with both paths |
   | 4 | No hardcoded secrets? | Scan for API keys, tokens, passwords, connection strings |
   | 5 | Follows existing patterns? | Compare against adjacent files for naming, structure, style |
   | 6 | Under 400 lines? | Check `git diff --stat` total |
   | 7 | CLAUDE.md rules followed? | Cross-platform, typed errors, atomic writes, no `any` |

   Rate each: PASS / WARN / FAIL with explanation.

5. **Generate report**:
   ```
   ## Self-Review Report

   ### Quality Gates
   - [x] Lint: PASS
   - [x] Type-check: PASS
   - [ ] Tests: FAIL — 2 tests failing in auth.test.ts
   ...

   ### AI Code Checklist
   1. Matches spec: PASS
   2. No vulnerabilities: WARN — new dependency not audited
   ...

   ### Verdict: READY / NEEDS WORK
   <summary of blocking issues>
   ```

6. **Verdict**:
   - All PASS: "Ready for PR."
   - Any WARN: "Ready with notes — reviewer should check flagged items."
   - Any FAIL: "Not ready — fix blocking issues first." List each.

## Error Handling

- Command not found: skip that gate, note it as SKIP with setup instructions.
- Test timeout: report and suggest investigating slow tests.
