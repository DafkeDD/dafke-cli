# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.5] - 2026-04-24

### Added
- External tool declarations in manifest (`externalTools` section) — declare Aikido, SonarQube, Azure Wiki, and other tools that can't be auto-detected
- Live SonarQube integration — coverage analyzer fetches real coverage % from SonarQube when auth is configured
- Maven/Gradle plugin detection — checkstyle, PMD, SpotBugs, OWASP dependency-check now detected from pom.xml/build.gradle
- Manual DORA deployment counts — teams not using git tags can declare deployment frequency
- `--explain` flag for audit — see exactly why each dimension scored the way it did
- New wizard step "External Tools" — auto-detects and prompts for external tools during init
- Doctor check for externalTools — validates declared tools are reachable

### Changed
- Schema version bumped to 2 (automatic migration from v1)
- Assessment engine now passes AnalyzerContext to all analyzers
- Review analyzer explains scoring criteria in evidence (transparency)

### Fixed
- Security scores now reflect external SAST/DAST tools (e.g., Aikido)
- Coverage scores now match SonarQube when configured
- CI/CD scores now credit Maven linting plugins
- DORA scores no longer penalize teams that don't use git tags
- Code review scores now accept declared practices (Azure DevOps branch policies)
- Documentation scores now credit external wikis

## [0.3.4] - 2026-04-22

### Fixed
- Pre-commit `gitleaks` now scans only the staged diff (`gitleaks protect --staged --redact --verbose`) instead of the full working tree. The previous `gitleaks detect --source . --no-git` walked `bin/`, `obj/`, `dist/`, `node_modules/`, `TestResults/`, etc. on every commit — easily ~100 MB / several seconds in a populated workspace. The new command scans just what's about to be committed (tens of ms), still reads `.gitleaks.toml` (allowlists preserved), and still BLOCKS on any finding. Full-tree scans belong in CI as defense in depth.
- Pre-commit `lint` / `typecheck` no longer error out in repos without a root `package.json` (e.g. .NET service repos, .NET + React polyglot repos). Each now has a `glob:` filter (`*.{js,jsx,ts,tsx,mjs,cjs}` for lint, `*.{ts,tsx}` for typecheck) so they skip entirely on non-JS/TS commits, and when JS/TS is staged they walk up from each staged file to the nearest `package.json` and run `npm run lint`/`typecheck` in that project's directory. De-dup ensures each project is linted at most once per commit.

## [0.3.3] - 2026-04-22

### Fixed
- `{{version}}` template placeholder was not resolved in generated `.claude/settings.json`. The wizard now emits `$schema` and `_comment` with the actual version. Drift detection and `applyUpdate()` also resolve `{{version}}` before comparing or writing.

## [0.3.2] - 2026-04-22

### Fixed
- Mandatory-disclaimer UX: the AI-responsibility disclaimer is now emitted once per session via a `SessionStart` hook using Claude Code's `systemMessage` output, instead of being printed by the model in every response. The `UserPromptSubmit` echo that injected a "REMINDER: …" line on every prompt has been removed. The `CLAUDE.md` template no longer instructs the model to print the disclaimer; it now points at the hook as the single source of truth.

## [0.2.0] - 2026-04-20

### Added
- Python as a supported framework language with CI blocks
- Auto-update check on SessionStart
- Skills categorization and mutation score improvements
- Prerequisite detection, configurability, SonarQube integration, and template overrides
- Azure DevOps MCP server and gitleaks registry
- Smart features: AI-powered CLAUDE.md merge, deep audit, plugin recommendations, CI analysis
- Architecture documentation generation (`dafke gendoc`)
- Install instructions for npm feed authentication in README

### Changed
- Deduplicated detection logic across adapters
- Extracted inline templates to independent files via TemplateEngine
- Configurable `prSizeLimit` in CI templates, enforced as blocking gate
- `ciPlatform` schema now accepts `azure-pipelines` value
- Replaced `python3` with `node` in smoke tests for CI compatibility

### Fixed
- Flaky step-assess test due to competing `vi.doMock` registrations
- Gendoc test timeout by skipping external tools in failure test
- Removed generated, local-config, and duplicate files from git tracking
- Init commit paths and Co-Authored-By enforcement
- GitNexus hook error handling and registry override
- `.claude/` directory tracking for agents, skills, and MCP config
- npm publish authentication for Dafke feed
