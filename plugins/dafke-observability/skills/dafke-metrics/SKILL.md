---
name: dafke-metrics
description: Use when the user wants to see DORA metrics, AI share statistics, coverage trends, or activation rates
category: observability
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-metrics

Display key metrics for the project: DORA, AI share, test coverage, and adoption.

## Steps

1. **Gather data sources**:
   - Git history: `git log` for commit frequency, authors, Co-Authored-By tags.
   - CI/CD: pipeline run history for deploy frequency and failure rates.
   - Coverage reports: `.dafke/coverage-report.json` or coverage output.
   - Audit results: `.dafke/audit-results.json` for readiness scores.
   - PR history: merged PRs with size and review time.

2. **Calculate DORA metrics** (last 30 days):

   | Metric | Calculation | Target |
   |--------|------------|--------|
   | Deployment Frequency | Deploys / 30 days | Daily |
   | Lead Time for Changes | Avg first-commit-to-deploy | < 1 day |
   | Change Failure Rate | Failed deploys / total | < 15% |
   | Mean Time to Recovery | Avg failure-to-fix duration | < 1 hour |

3. **Calculate AI share metrics**:
   - Total commits in period.
   - Commits with Co-Authored-By (AI-assisted).
   - AI share percentage: AI commits / total commits.
   - Governance status: <25% green | 25-40% optimal | 40-50% warning | >50% mandatory reduction.

4. **Calculate quality trends**:
   - Coverage trend: current vs. 7d ago vs. 30d ago.
   - Audit score trend: current vs. last assessment.
   - PR size trend: average lines changed per PR.
   - Review time trend: average time from PR open to merge.

5. **Calculate activation rate**:
   - Skills registered vs. skills used (from git/session history).
   - Team members onboarded vs. total team size.
   - Quality gates passing vs. total gates configured.

6. **Display dashboard**:
   ```
   ## Dafke Metrics Dashboard

   ### DORA Metrics (30-day)
   | Metric | Value | Target | Status |
   |--------|-------|--------|--------|
   | Deploy Frequency | 8/month | daily | NEEDS WORK |
   | Lead Time | 3.2 days | <1 day | NEEDS WORK |
   | Change Failure Rate | 12% | <15% | ON TRACK |
   | MTTR | 52 min | <1 hour | ON TRACK |

   ### AI Share
   - AI-assisted commits: 34/120 (28%) — OPTIMAL
   - Governance: GREEN

   ### Quality Trends
   - Coverage: 82% (+2% this month)
   - Audit score: 71/100 (+8 since last assessment)
   - Avg PR size: 185 lines (within 400-line cap)

   ### Activation
   - Skills used: 8/12 (67%)
   - Team onboarded: 5/7 (71%)
   ```

## Error Handling

- Insufficient history: show what is available, note minimum data needed for accurate metrics.
- No deployments tracked: skip DORA, suggest configuring deploy tracking.
- No Co-Authored-By tags: report 0% AI share, suggest enforcing the commit hook.
