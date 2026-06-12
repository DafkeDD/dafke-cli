# Changelog

## 0.1.0 — Dafke

First Dafke release (forked and rebuilt from an internal CLI).

### Added
- **Frontend/backend scaffold** — every app splits into `frontend/` (latest Next.js + dafkeUI + Pasport design, light/dark) and `backend/` (Node.js + Express + PostgreSQL), each with its own Prettier + ESLint.
- **dafkeUI** as the only component library (`DafkeDD/dafke-ui`); never shadcn/Radix/MUI.
- **i18n** via `next-intl`, always 4 languages (en default, nl, fr, de).
- **Lua / FiveM (QBox)** tech stack support with a tailored CLAUDE.md template.
- **Auto-install** of recommended tools (gitleaks, lefthook) during `init`.
- Frontend uses **Framer Motion** for animation.

### Changed
- **GitHub-only** — Azure DevOps, Jira, Confluence and SonarQube integrations removed.
- **TypeScript-only** adapters (other language adapters removed).
- Lean **6-step `init`** wizard (was 13).
- MCP servers reduced to **Playwright** only (context7 + gitnexus removed).
- Orange branding; new DAFKE logo.

### Removed
- All Corilus branding and connections.
- GitNexus integration and the automatic update-check on session start.
