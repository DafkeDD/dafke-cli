---
name: dafke-doctor
description: Use when the user wants to diagnose configuration problems, fix broken setup, or verify dafke health
category: tool
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-doctor

Diagnose configuration issues and offer automatic fixes.

## Steps

1. **Run diagnostic checks** — Verify each component in order:

   | # | Check | What to Verify |
   |---|-------|----------------|
   | 1 | Node.js | Version >= 20, `node --version` |
   | 2 | Git | Installed and repo initialized |
   | 3 | Manifest | `.dafke/manifest.yaml` exists and is valid YAML |
   | 4 | CLAUDE.md | Exists at repo root, contains required sections |
   | 5 | Settings | `.claude/settings.json` exists, skills registered |
   | 6 | Git hooks | lefthook installed, hooks configured |
   | 7 | CI config | Pipeline file exists and references correct commands |
   | 8 | Provider auth | Jira/Azure DevOps credentials are valid (test API call) |
   | 9 | Dependencies | All required npm packages installed |
   | 10 | Permissions | Write access to `.dafke/` directory |

2. **Report findings**:
   ```
   ## Doctor Report

   [PASS] Node.js v22.1.0
   [PASS] Git initialized
   [FAIL] Manifest: missing 'provider' field
   [WARN] CLAUDE.md: missing 'Quality Gates' section
   [PASS] Settings: 12 skills registered
   [FAIL] Git hooks: lefthook not installed
   [PASS] CI config: GitHub Actions workflow found
   [SKIP] Provider auth: no credentials configured
   [PASS] Dependencies: all installed
   [PASS] Permissions: writable

   Summary: 6 passed, 2 failed, 1 warning, 1 skipped
   ```

3. **Offer automatic fixes** — For each FAIL/WARN that can be auto-fixed:
   - Show what the fix would do.
   - Ask for confirmation.
   - Apply the fix.
   - Re-run that specific check to verify.

4. **Common auto-fixes**:
   - Missing manifest fields: add with sensible defaults.
   - Missing CLAUDE.md sections: append from template.
   - lefthook not installed: `npx lefthook install`.
   - Missing skill registrations: update settings.json.
   - Outdated config format: run migration.

5. **Final status** — Re-run all checks and show updated report.

## Error Handling

- Permission denied: suggest running with appropriate permissions.
- Corrupted YAML/JSON: offer to regenerate from template (with backup).
- Missing CLI tool: provide install instructions for the platform.
