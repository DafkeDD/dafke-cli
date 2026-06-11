---
name: dafke-update
description: Use when the user wants to check for dafke updates, apply config migrations, or refresh templates
category: tool
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-update

Check for configuration updates and apply migrations to keep the project current.

## Steps

1. **Check current version** — Read `.dafke/manifest.yaml` for `dafke-version` field.

2. **Check latest version** — Run `npm view dafke version` or check the installed version.

3. **Compare versions** — If current < latest:
   - List changes between versions (changelog or migration notes).
   - Show which config files need updating.

4. **Check for config drift** — Compare current config against the latest templates:
   - `CLAUDE.md` — any new rules or sections added?
   - `.claude/settings.json` — new skills or hooks available?
   - CI pipeline — new stages or checks recommended?
   - lefthook config — new hooks available?

5. **Apply migrations** — For each needed update:
   - Show the diff (what will change).
   - Ask for confirmation before applying.
   - Apply changes with atomic writes (write to temp, rename).
   - Log each migration to `.dafke/migration-log.json`.

6. **Verify after update**:
   - Run `/dafke-doctor` to confirm everything still works.
   - Run a quick lint/typecheck to confirm no breakage.

7. **Report**:
   ```
   ## Update Report

   - Previous version: 0.3.0
   - Current version: 0.4.0

   ### Applied Migrations
   - [x] Added security scan step to CI pipeline
   - [x] Updated CLAUDE.md with new AI share rules
   - [x] Registered 3 new skills in settings.json

   ### Manual Actions Required
   - Update Azure DevOps service connection for new security scan
   ```

## Error Handling

- Migration fails: rollback to backup, report which migration failed.
- Network unavailable: skip version check, only do local drift detection.
- Conflicting local changes: show merge conflict and ask user to resolve.
