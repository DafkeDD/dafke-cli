---
name: dafke-audit
description: Use when the user wants to check readiness, run an audit, see scores, or assess their project
category: tool
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Skill
---

# /dafke-audit

Run a comprehensive readiness assessment across 6 dimensions and display a scorecard.

## Steps

1. **Load configuration** — Read `.dafke/manifest.yaml` for project context and adapter type.

2. **Run 6-dimension assessment** — Use the dafke-assess-team agents to evaluate in parallel:

   | # | Dimension | What to Check |
   |---|-----------|---------------|
   | 1 | **CI/CD** | Pipeline exists, stages (build/test/deploy), branch protection, auto-deploy |
   | 2 | **Testing** | Test framework configured, coverage %, mutation testing, test naming |
   | 3 | **Security** | SAST configured, SCA (dep audit), secrets scanning, CODEOWNERS |
   | 4 | **Code Quality** | Linter configured, type-checking, formatter, no `any` types |
   | 5 | **Documentation** | CLAUDE.md exists and is quality, API docs, architecture docs |
   | 6 | **AI Readiness** | AI share tracking, PR checklist, Co-Authored-By enforcement, skill registration |

3. **Score each dimension** — 0-5 scale based on weighted checks:
   - Each check is pass (full points), partial (half points), or fail (0 points).
   - Dimension score = weighted sum of its checks.

4. **Calculate overall score** — Weighted average of all 6 dimensions.

5. **Display scorecard**:
   ```
   ## Dafke Readiness Scorecard

   | Dimension       | Score | Rating     | Status     |
   |-----------------|-------|------------|------------|
   | CI/CD           | 4     | Good       | Ready      |
   | Testing         | 3     | Adequate   | Needs work |
   | Security        | 2     | Needs Work | At risk    |
   | Code Quality    | 5     | Excellent  | Ready      |
   | Documentation   | 4     | Good       | Ready      |
   | AI Readiness    | 1     | Poor       | Not ready  |
   |-----------------|-------|------------|------------|
   | **Overall**     | **3** | **Adequate** |          |

   ### Top 3 Improvements
   1. Security: Add npm audit to CI pipeline (+1 point)
   2. AI Readiness: Configure Co-Authored-By hook (+1 point)
   3. Testing: Add mutation testing (+0.5 points)
   ```

6. **Save results** — Write to `.dafke/audit-results.json` with timestamp for trend tracking.

7. **Suggest next steps** — Recommend running `/dafke-gate <dimension>` for the lowest-scoring dimension.

## Error Handling

- Missing tools (e.g., no linter installed): score as 0 for that check, note in report.
- Adapter not found for language: use generic checks, warn about limited assessment.
