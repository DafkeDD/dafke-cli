---
name: dafke-design
description: Use when building or styling ANY app UI. Applies the mandatory Pasport design system (teal accent, light + dark mode) in Next.js. Trigger on any frontend, component, page, theme, or styling work.
category: frontend
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-design

**Every Dafke app uses the Pasport design system, and is ALWAYS built in Next.js (App Router).**

## Hard rules

1. **Next.js only.** No other frontend framework. Use the App Router, `next/font`, and a theme provider.
2. **Light + dark mode are mandatory** on every app. Dark theme via `[data-theme="dark"]`. Ship a working theme toggle.
3. **Use the Pasport tokens** — never hardcode colors/spacing/radii/shadows. The canonical token + component reference lives in `templates/design/pasport.css` (copy it into the project as the design-system base, e.g. `app/pasport.css`, and map it into the Tailwind theme).

## Tokens (summary — full set in templates/design/pasport.css)

- **Accent (teal)**: light `#0d9488` / dark `#2dd4bf` (`--accent`, `--accent-hover`, `--accent-active`, `--accent-fg`, tints, border).
- **Neutrals (slate)**: `--bg`, `--surface`, `--surface-2/3`, `--border`, `--border-strong`, `--text`, `--text-2`, `--text-3` — each redefined under `[data-theme="dark"]`.
- **Status**: green / amber / red / blue / violet (+ tint + border).
- **Radius**: `--r-xs` 6 → `--r-2xl` 26, `--r-full`. **Shadow**: `--sh-xs` → `--sh-xl`. **Focus ring**: `--ring` (color-mix on accent).
- **Fonts**: `Hanken Grotesk` (UI) + `JetBrains Mono` (mono) via `next/font/google`.
- **Layout**: sidebar 256px, topbar 64px, content max-width 1160px.

## Components in the system

Buttons (primary/secondary/ghost/danger, sizes lg/sm/icon), inputs/select/textarea (+ icon/addon/group), cards (+ hover), badges (neutral/accent/status + dot), toggle, sidebar + topbar shell.

## Steps

1. Scaffold (or detect) a Next.js App Router project.
2. Add `app/pasport.css` from `templates/design/pasport.css`; import it in the root layout.
3. Wire `next/font/google` for Hanken Grotesk + JetBrains Mono.
4. Add a theme provider + toggle that flips `data-theme` between light/dark (respect system preference on first load).
5. Build UI strictly from the tokens + components above. Pair with `dafke-ui` for patterns/animation and `dafke-i18n` for copy.
