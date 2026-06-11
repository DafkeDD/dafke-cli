---
name: dafke-discover
description: Use when the user wants to find new plugins, search for community skills, or extend capabilities
category: tool
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-discover

Search for community plugins, skills, and integrations that could benefit the current project.

## Steps

1. **Analyze current setup** — Read `.dafke/manifest.yaml` and project config to determine:
   - Language/framework in use.
   - Current integrations (CI, backlog, hosting).
   - Installed skills and plugins.
   - Gaps in the current toolchain (from last audit).

2. **Search for relevant plugins** — Check available sources:
   - Dafke plugin registry: `npx dafke discover --list`.
   - npm packages matching `dafke-plugin-*` or `claude-skill-*`.
   - Community skill repositories (if configured).
   - Claude Code skill marketplace (if available).

3. **Filter and rank results** — Prioritize by:
   - Relevance to current tech stack (language, framework match).
   - Addresses gaps found in the last audit.
   - Community adoption (download count, stars).
   - Maintenance status (last updated, open issues).

4. **Display recommendations**:
   ```
   ## Recommended Plugins & Skills

   ### High Relevance
   | Plugin | Description | Addresses | Popularity |
   |--------|-------------|-----------|------------|
   | dafke-plugin-sonar | SonarQube integration | Security gap | 1.2k/wk |
   | claude-skill-docker | Docker compose management | DevOps | 800/wk |

   ### Medium Relevance
   | Plugin | Description | Addresses | Popularity |
   |--------|-------------|-----------|------------|
   | dafke-plugin-swagger | OpenAPI doc generation | Documentation gap | 500/wk |

   ### Already Installed
   - dafke-plugin-azure (v1.2.0, up to date)
   ```

5. **Install option** — For each recommendation:
   - Show what it does and what it changes.
   - Offer one-click install: `npx dafke plugin install <name>`.
   - Show post-install configuration steps.

## Error Handling

- No registry available: fall back to npm search.
- Network unavailable: show cached recommendations if available.
- Plugin incompatible: warn about version or platform constraints.
