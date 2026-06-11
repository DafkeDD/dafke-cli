---
name: dafke-ci
description: Use when the user wants to check CI pipeline status, diagnose build failures, or monitor pipeline health
category: observability
allowed-tools:
  - Bash
  - Read
  - Grep
---

# /dafke-ci

Monitor CI pipeline status and diagnose failures.

## Steps

1. **Read manifest** — Load `.dafke/manifest.yaml` to determine CI provider:
   - `github-actions` | `azure-pipelines` | `gitlab-ci` | `jenkins`.

2. **Fetch pipeline status**:
   - **GitHub Actions**: `gh run list --limit 5 --branch $(git branch --show-current)`.
   - **Azure Pipelines**: `az pipelines runs list --top 5 --branch $(git branch --show-current)`.
   - Display recent runs in a table: Run ID, Status, Duration, Trigger, Commit.

3. **Analyze current state**:

   **If PASSING**:
   - Show success message with metrics.
   - Report: duration, coverage delta (if available), test count.
   - Compare duration to rolling average (flag if >20% slower).

   **If FAILING**:
   - Fetch failure logs:
     - GitHub: `gh run view <id> --log-failed`.
     - Azure: `az pipelines runs show --id <id>`.
   - Identify the failing step/job.
   - Analyze the error output.
   - Categorize failure: test failure | build error | lint error | timeout | infra issue.
   - Propose a fix with specific file and line references.

   **If RUNNING**:
   - Show progress and estimated time remaining.
   - List completed and pending steps.

4. **Report**:
   ```
   ## CI Status: <PASSING|FAILING|RUNNING>

   ### Latest Run
   - Run: #123 | Branch: feat/login | Duration: 3m42s
   - Trigger: push by alice | Commit: abc1234

   ### Metrics
   - Duration trend: 3m42s (avg: 3m15s, +8%)
   - Tests: 247 passed, 0 failed
   - Coverage: 84.2% (+0.3%)

   ### Issues (if failing)
   - Step: "Run tests" FAILED
   - Error: TypeError in auth.test.ts:42
   - Suggested fix: ...
   ```

## Error Handling

- No CI configured: suggest setting up CI, offer to generate config.
- API rate limits: show cached data if available, retry after cooldown.
- No runs found: confirm branch is pushed and CI is triggered.
