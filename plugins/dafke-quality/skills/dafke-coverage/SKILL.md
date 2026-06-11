---
name: dafke-coverage
description: Use when the user wants to check test coverage, find coverage gaps, or generate a test plan
category: quality
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
---

# /dafke-coverage

Analyze test coverage, identify gaps, and optionally iterate to improve.

## Steps

1. **Run coverage** — Execute the project's coverage command:
   ```bash
   npm run test:coverage
   ```
   Parse the output for per-file coverage (statements, branches, functions, lines).

2. **Identify gaps** — Find files and areas with low coverage:
   - Files below 80% line coverage.
   - Uncovered branches (if/else, switch, ternary).
   - Functions with 0% coverage.
   - Recently changed files with no tests (cross-reference `git log --since="2 weeks ago"`).

3. **Categorize gaps by risk**:
   - **Critical**: Business logic, auth, data validation with <50% coverage.
   - **Important**: Core utilities, API handlers with <80% coverage.
   - **Nice-to-have**: Config files, types, trivial getters with <80% coverage.

4. **Generate test plan**:
   ```
   ## Coverage Report

   ### Overall: 74.2% (target: 80%)

   ### Gaps by Priority

   #### Critical (must fix)
   | File | Lines | Branches | Missing |
   |------|-------|----------|---------|
   | src/auth/validate.ts | 45% | 30% | Lines 23-41, 55-60 |

   #### Important
   | File | Lines | Branches | Missing |
   |------|-------|----------|---------|
   | src/core/config.ts | 72% | 65% | Lines 88-95 |

   ### Test Plan
   1. src/auth/validate.ts — Add tests for:
      - Invalid token handling (L23-41)
      - Expired session branch (L55-60)
   2. src/core/config.ts — Add tests for:
      - Missing config file fallback (L88-95)
   ```

5. **Iterative improvement** (optional):
   - Write tests for the highest-priority gap.
   - Run coverage again to verify improvement.
   - Repeat until target coverage is met or all critical gaps are covered.
   - After each iteration, show progress: "Coverage: 74.2% -> 78.5% -> 81.3%"

6. **Save report** — Write to `.dafke/coverage-report.json` for trend tracking.

## Error Handling

- No test framework configured: detect language and suggest setup.
- Coverage tool not installed: install it (e.g., `@vitest/coverage-v8`).
- Tests fail during coverage run: fix failing tests first.
