---
name: dafke-gate
description: Use when the user wants to deep-dive into a specific readiness dimension and improve its score
category: tool
argument-hint: "<dimension: ci-cd | testing | security | code-quality | documentation | ai-readiness>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
---

# /dafke-gate

Deep-dive into a specific readiness dimension, identify gaps, and iteratively improve the score.

## Steps

1. **Validate argument** — Dimension name is required. Must be one of:
   `ci-cd`, `testing`, `security`, `code-quality`, `documentation`, `ai-readiness`.
   If missing or invalid, show the list and ask.

2. **Load current scores** — Read `.dafke/audit-results.json` for baseline.
   - If no audit exists, run `/dafke-audit` first.

3. **Deep analysis** — Use the dafke-fix-team to run a detailed assessment of the dimension:

   **ci-cd**: Check pipeline stages, parallelism, caching, artifact management, branch rules, deploy gates.
   **testing**: Check framework config, coverage %, test naming, fixture usage, mutation score, flaky tests.
   **security**: Check SAST rules, SCA config, secret scanning, CODEOWNERS, dependency age, CVE exposure.
   **code-quality**: Check linter rules, formatter config, type strictness, complexity metrics, dead code.
   **documentation**: Check CLAUDE.md quality, API docs, inline docs, architecture diagrams, changelog.
   **ai-readiness**: Check AI share tracking, PR checklist, commit attribution, skill coverage, hook config.

4. **Generate improvement plan** — Ordered by impact (points gained per effort):
   ```
   ## Gate: Testing (Current: 3/5)

   ### Quick Wins (< 5 min each)
   1. Add --coverage flag to test script (+0.5 pts)
   2. Configure coverage threshold in vitest.config (+0.3 pts)

   ### Medium Effort (< 30 min each)
   3. Add missing test files for 4 untested modules (+0.7 pts)
   4. Add failure-path tests for error handlers (+0.3 pts)

   ### Larger Tasks (> 30 min)
   5. Set up mutation testing with Stryker (+0.2 pts)

   Projected score after all: 5/5
   ```

5. **Execute improvements** — Apply improvements iteratively:
   - Apply quick wins automatically (with confirmation).
   - For medium/large tasks: implement one at a time, re-score after each.
   - Stop when target score is reached or user is satisfied.

6. **Re-score** — Run the dimension assessment again and show before/after comparison.

## Error Handling

- Dimension not assessable: explain what is missing and how to set it up.
- Fix causes regression in another dimension: flag and suggest alternative approach.
