---
name: dafke-status
description: Use when the user wants to see the success criteria dashboard, adoption metrics, or quality scores
category: tool
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-status

Display the success criteria dashboard tracking Adoption, Quality, and Experience.

## Steps

1. **Gather data** — Collect metrics from multiple sources:
   - `.dafke/audit-results.json` — readiness scores.
   - `.dafke/coverage-report.json` — test coverage.
   - `.dafke/security-report.json` — security findings.
   - Git history — commit patterns, AI share, PR metrics.
   - CI/CD — pipeline success rates, deploy frequency.

2. **Calculate Adoption metrics**:
   - **Team activation rate**: Members using Dafke skills / total members.
   - **Skill usage breadth**: Distinct skills used in last 30 days.
   - **Workflow completion rate**: Stories that went through full pipeline.
   - **AI share compliance**: Teams within 25-40% governance band.

3. **Calculate Quality metrics**:
   - **Audit score trend**: Overall readiness score over time.
   - **Test coverage**: Current % and trend direction.
   - **Security posture**: Open critical/high findings.
   - **PR quality**: Average checklist pass rate.
   - **CI stability**: Pipeline pass rate (last 30 days).

4. **Calculate Experience metrics**:
   - **Time to first PR**: How long from init to first Dafke-assisted PR.
   - **Developer satisfaction**: Survey score (if tracked).
   - **Workflow friction**: Skills that error frequently, common blockers.
   - **Onboarding time**: Average time to complete `/dafke-onboard`.

5. **Display dashboard**:
   ```
   ## Dafke Success Dashboard

   ### Adoption (target: 80% team activation)
   | Metric | Value | Target | Status |
   |--------|-------|--------|--------|
   | Team activation | 71% | 80% | APPROACHING |
   | Skill usage | 8/12 skills | 10/12 | APPROACHING |
   | Workflow completion | 65% | 75% | NEEDS WORK |
   | AI share compliance | 4/5 teams | all | ON TRACK |

   ### Quality (target: audit score 80+)
   | Metric | Value | Target | Status |
   |--------|-------|--------|--------|
   | Audit score | 71 | 80 | APPROACHING |
   | Test coverage | 82% | 80% | MET |
   | Security findings | 1 high | 0 critical | ON TRACK |
   | CI pass rate | 94% | 95% | APPROACHING |

   ### Experience (target: positive trend)
   | Metric | Value | Trend |
   |--------|-------|-------|
   | Time to first PR | 2.1 days | improving |
   | Common blockers | auth setup | — |
   | Onboarding time | 45 min | stable |

   ### Overall Status: ON TRACK
   Next milestone: Reach 80% team activation by end of sprint.
   ```

6. **Recommendations** — Based on the dashboard, suggest 1-3 actions to improve the weakest area.

## Error Handling

- Insufficient data: show available metrics, note what is missing.
- No audit history: suggest running `/dafke-audit` to establish a baseline.
- Metrics contradictory: flag and suggest investigation.
