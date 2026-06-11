---
name: dafke-mutate
description: Use when the user wants to run mutation testing, validate test quality, or check if tests catch real bugs
category: quality
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-mutate

Run incremental mutation testing on changed files to verify test effectiveness.

## Steps

1. **Identify changed files** — Determine scope for mutation testing:
   - Run `git diff --name-only main...HEAD -- '*.ts' '*.js'` for changed source files.
   - Exclude test files, config files, and type-only files.
   - If no changes detected, offer to run on a specific file or directory.

2. **Check mutation testing setup**:
   - Look for Stryker config (`stryker.config.json`, `stryker.conf.js`, `stryker.conf.mjs`, `.stryker/`).
   - If not configured: offer to set up Stryker with sensible defaults for the project.

3. **Run mutation testing** — Execute incrementally on changed files only:
   ```bash
   npx stryker run --mutate "src/changed-file.ts"
   ```
   - Use `--concurrency` based on available CPU cores.
   - Set timeout multiplier to avoid hanging on infinite loops.

4. **Parse results** — Extract mutation score and surviving mutants:
   ```
   ## Mutation Testing Report

   ### Summary
   - Files tested: 3
   - Mutants generated: 47
   - Mutants killed: 39
   - Mutants survived: 6
   - Timed out: 2
   - **Mutation score: 83%** (target: 80%)

   ### Surviving Mutants (tests missed these)
   | File | Line | Mutation | Why it survived |
   |------|------|----------|-----------------|
   | src/auth.ts | 23 | Removed null check | No test for null input |
   | src/config.ts | 45 | Changed > to >= | Boundary not tested |
   ```

5. **Suggest test improvements** — For each surviving mutant:
   - Explain what the mutation did.
   - Suggest a specific test case that would catch it.
   - Prioritize by risk (business logic mutations > cosmetic).

6. **Report** — Display results and save to `.dafke/mutation-report.json`.

## Error Handling

- Stryker not installed: `npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner`.
- Mutation run too slow: suggest reducing scope or using incremental mode.
- Out of memory: reduce concurrency, suggest running on fewer files.
