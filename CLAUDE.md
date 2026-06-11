# CLAUDE.md - AI Development Guidelines


## Project Overview
This repository is managed by the Dafke AI Control Center.
Tech stack: typescript


## Disclaimer
The AI-code-responsibility disclaimer is displayed to the user automatically at session start via a `SessionStart` hook in `.claude/settings.json`. Do not re-print it in your responses.


## Dafke Technology Constitution

### Testing Discipline
- **ALWAYS write tests for ALL happy paths AND ALL failure paths** when adding features, fixing bugs, or implementing stories. No exceptions.
- **ALWAYS validate new tests with mutation testing** (Stryker or equivalent) before considering them done. If mutation score < 80%, the tests are insufficient.
- Run `npx stryker run` after writing tests. Review surviving mutants. Fix tests until mutation score meets threshold.
- Test files follow the naming pattern: `<module>.test.ts` / `<module>.spec.ts`

### Planning & Impact Analysis
- **ALWAYS use plan mode before executing changes** on a codebase. Even "simple" fixes can cascade.
- **ALWAYS analyse the impact of your changes** before finalizing plans — use GitNexus `impact` or equivalent blast radius analysis.
- **ALWAYS propose enhancements and improvements** to the user before finalizing plans — ask before integrating them.
- Before writing code, generate an **enhanced prompt** from user input: clarify intent, add relevant context, inject applicable rules.

### Security — Healthcare Context
- Dafke develops **critical healthcare software**. Patient data, medical workflows, and regulatory compliance are at stake. This is non-negotiable.
- Treat every code change as potentially affecting patient safety. Apply defense-in-depth.
- NEVER commit secrets, API keys, passwords, or tokens — enforce with gitleaks pre-commit hook.
- NEVER bypass branch protection or CI gates — these exist to protect patients.
- NEVER disable security scanning tools — they catch what humans miss.
- Always use parameterized queries for database access — SQL injection in healthcare = HIPAA/GDPR violation.
- Validate ALL external input — untrusted data reaches healthcare systems from many vectors.
- Apply principle of least privilege — services should only access what they need.
- High-risk paths (auth/*, data/*, healthcare/*, patient/*) require 2 reviewers + security sign-off.

### Guardrails & Hooks
- **Propose new hooks** (Claude Code hooks or git hooks) when you identify practices that should be automated and enforced.
- Review existing hooks during planning — are they still effective? Can they be improved?
- Git hooks BLOCK on failure — they are guardrails, not suggestions.

### Architecture Invariants
- Changes must follow the existing architecture — do not introduce new patterns without explicit approval.
- All file I/O is atomic (write temp, rename). No partial writes.
- Cross-platform always: `path.join()`, `cross-spawn`, `env-paths`. No hardcoded `/` or `\\`.



## Work Principles

### Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Write detailed specs upfront to reduce ambiguity.

### Simplicity & Precision
- **Simplicity first**: make every change as simple as possible; impact minimal files.
- **No shortcuts**: find root causes — no temporary fixes. Senior developer standards.
- **Minimal blast radius**: changes should only touch what's necessary; avoid introducing regressions.
- For non-trivial changes, pause and ask "Is there a more elegant way?" Skip this for simple, obvious fixes.

### Autonomous Problem Solving
- When given a bug or issue: just fix it — don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.

### Verification Before Done
- Never mark a task complete without proving it works.
- Run checks, verify behavior, demonstrate correctness.
- Ask yourself: "Would a staff engineer approve this?"


## Security Rules
See [Security — Healthcare Context](#security--healthcare-context) in the Constitution above.
Additionally:
- NEVER modify .env files or credential stores








## Code Standards
- Follow existing project conventions and formatting
- Write tests for ALL happy paths AND ALL failure paths. Validate new tests with mutation testing (Stryker) — mutation score must be >= 80%.
- Keep functions focused and under 50 lines where possible
- Use meaningful variable and function names
- Add JSDoc/Javadoc comments on public APIs








## Tech Stack Guidelines

## TypeScript Project

### Build & Test
- Build: `npm run build` (or pnpm/yarn equivalent)
- Test: `npm run test`
- Coverage: c8 / Vitest coverage — threshold >=80%

### Code Quality
- ESLint for linting, Prettier for formatting
- Run `npm run lint` before committing
- Coverage reports in `coverage/`

### Conventions
- Use strict TypeScript (strict: true in tsconfig.json)
- Prefer named exports over default exports
- Use Zod for runtime validation of external data










## CI Pipeline
- Platform: Azure DevOps Pipelines
- Build validation on PRs: `azure-pipelines-pr.yml`
- Main pipeline: `azure-pipelines.yml`
- Pre-commit hooks: gitleaks (secrets), ESLint (lint), tsc (typecheck) via lefthook

## Session Protocol

### During Work
- **In-place edits only** — never create standalone audit reports or summary docs.
- **Baseline before behavior changes**: When modifying code that has tests, run the test suite BEFORE making changes. After changes, confirm no new failures.
- Only create new files when explicitly required.
- If approaching context limits, save progress and stop.

### Multi-Agent Work
- Use subagents to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- **One task per subagent** for focused execution.
- Assign each parallel agent a **disjoint file set** to avoid conflicts.
- Include a **reviewer/validator** pass for multi-file changes.

### Zero-Warning Policy
- **Always fix pre-existing issues** — warnings, errors, and failing tests encountered during your work. Do not leave them for later or treat them as "known issues".
- Run all linters and tests before committing.


## Git Workflow
- Create feature branches from main/develop
- Write descriptive commit messages (conventional commits preferred)
- Ensure CI passes before requesting review
- Squash-merge feature branches


## File Restrictions
- Do not modify files in node_modules/, dist/, build/, target/, bin/
- Do not modify CI/CD pipeline files without explicit approval
- Do not modify security configuration files without review


## Definition of Done
- [ ] All new code has tests
- [ ] Lint and format checks pass
- [ ] Test suite passes with no new failures
- [ ] Changes committed with descriptive message
- [ ] No broken imports or dead code introduced


## Key Decisions
_Record important architectural and design decisions here. This section is preserved across `dafke init` re-runs._

- **Version must be bumped in every PR.** Both `src/version.ts` and `package.json` must be updated before creating a PR. Enforced at two levels: (1) a PreToolUse hook blocks PR creation if `src/version.ts` is unchanged vs main, and (2) the PR CI pipeline fails if `package.json` version matches main — preventing duplicate versions when multiple PRs are in flight.
- **Instruction files use `.claude/rules/` (not `@import`).** Tech-specific rules use `globs:` frontmatter for on-demand loading — only loaded when Claude touches matching files. Global rules (architecture, git-conventions, mcp-tools) have no frontmatter and always load. This cuts fixed token overhead ~50% vs unconditional loading.
- **Confluence topology in manifest, auth in GlobalConfig.** Confluence page IDs and folder structure go in `.dafke/manifest.yaml` under `confluence`. Credentials (email, apiToken, siteUrl) stay in `~/.dafke/config.yaml` under `auth.confluence`.
- **Schema migrations run transparently in `loadManifest()`.** All callers (doctor, status, audit, update) benefit without changes. Backup created before migration; rollback on failure.
- **Session handoff is non-blocking.** HANDOFF.md write failures never block session end. Read failures never block session start. Archives limited to 5 (configurable in rules.yaml).
- **CLI framework: citty** (not commander/yargs). Tree-shakeable, lazy subcommand loading via dynamic imports. Each command is a `defineCommand()` in `src/cli/commands/`.
- **Interactive prompts: @clack/prompts** (not inquirer). Used for the 13-step init wizard. Supports `p.text()`, `p.confirm()`, `p.select()`, `p.spinner()`.
- **Build tool: tsup.** Two entry points: `src/cli/index.ts` (CLI binary with shebang) and `src/index.ts` (library exports). Output in `dist/`.
- **TemplateEngine is custom Handlebars-like** (not full Handlebars). Supports `{{var}}`, `{{#if}}`, `{{#each}}`, `{{#if (eq ...)}}`. Templates in `templates/` with 3-tier override: env var > repo-level > built-in.
- **Documentation AI crew lives in the `dafke-docs` plugin**, not the CLI. Inspired by [claude-code-documentation-crew](https://github.com/ssmirnovpro/claude-code-documentation-crew). The CLI `docs` command scaffolds baseline docs; the plugin adds 6 specialized AI agents and `/dafke-docs-generate` workflow for source-code-verified documentation.








## Lessons Learned
_After ANY correction from the user, add an entry here. Write rules that prevent the same mistake from recurring._

- **YAML scalars containing `: ` (colon + space) must be quoted or use a block scalar (`|`).** Unquoted values like `run: grep ... || echo "WARNING: Missing..."` break strict YAML parsers (including lefthook's) because the inner `: ` is interpreted as a mapping separator. When drift-checking templates, treat quoting/block-scalar differences on such lines as meaningful fixes, not cosmetic diffs. Applies to all generated YAML templates (lefthook, GitHub Actions, docker-compose, etc.).
- **CLAUDE.md changes go through `dafke init`, not direct edits.** The base template is in `templates/claude-md/base.md`. Direct edits are preserved via the section-based merge strategy but may be overwritten by template sections.

---
_Generated by dafke init_

<!-- gitnexus:start -->

## Documentation

Architecture documentation is generated by `dafke docs` and kept in `docs/`.

| Document | Purpose |
|----------|---------|
| `docs/ARCHITECTURE.md` | Architecture overview with Mermaid diagrams |
| `docs/INDEX.md` | Question → file routing table |
| `docs/modules/*.md` | Per-module documentation |
| `docs/diagrams/*.mmd` | Mermaid diagram sources |

**Before modifying architecture-critical code**, read ARCHITECTURE.md first.
**Regenerate**: `dafke docs` or `/dafke-arch` in Claude Code.

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dafke** (2197 symbols, 4171 relationships, 177 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/dafke/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/dafke/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dafke/clusters` | All functional areas |
| `gitnexus://repo/dafke/processes` | All execution flows |
| `gitnexus://repo/dafke/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
