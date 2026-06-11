---
name: dafke-lint
description: Use when the user wants to run linting, formatting, or type-checking on the codebase
category: quality
allowed-tools:
  - Bash
  - Read
  - Edit
  - Grep
  - Glob
---

# /dafke-lint

Run the full code quality pipeline: linting, formatting, and type-checking.

## Steps

1. **Detect tooling** — Check which tools are configured:
   - Linter: ESLint (`eslint.config.js`, `.eslintrc.*`).
   - Formatter: Prettier (`.prettierrc`, `.prettierrc.*`).
   - Type-checker: TypeScript (`tsconfig.json`), or language equivalent.

2. **Run type-check first** (catches the most impactful errors):
   ```bash
   npm run typecheck
   ```
   - Parse output for error count and locations.
   - Group errors by file and type (missing types, incompatible types, unused vars).

3. **Run linter**:
   ```bash
   npm run lint
   ```
   - Parse output for error and warning counts.
   - Separate auto-fixable from manual-fix issues.
   - If many auto-fixable issues: offer to run `npm run lint -- --fix`.

4. **Run formatter check**:
   ```bash
   npx prettier --check "src/**/*.{ts,js,json}"
   ```
   - If unformatted files found: offer to run `npm run format`.

5. **Report results**:
   ```
   ## Lint Report

   ### Type-Check
   - Status: PASS (0 errors)

   ### ESLint
   - Errors: 2 (in src/auth.ts, src/config.ts)
   - Warnings: 5
   - Auto-fixable: 4 of 7

   ### Prettier
   - Unformatted files: 1 (src/utils/helpers.ts)

   ### Summary
   - Total issues: 8
   - Auto-fixable: 5
   - Manual fixes needed: 3
   ```

6. **Auto-fix option** — If user agrees:
   - Run `npm run lint -- --fix`.
   - Run `npm run format`.
   - Re-run checks to confirm fixes applied.
   - Report remaining manual-fix issues with file:line references.

7. **Show specific issues** — For manual fixes, display:
   - File path and line number.
   - The rule being violated.
   - Suggested fix or reference to rule documentation.

## Error Handling

- Tool not installed: suggest installation command, skip that check.
- Config errors: show the config issue, offer to fix common mistakes.
- Too many errors (>100): show summary first, offer to focus on a specific directory.
