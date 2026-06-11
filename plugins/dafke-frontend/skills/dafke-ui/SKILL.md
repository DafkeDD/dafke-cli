---
name: dafke-ui
description: Use when designing or polishing UI/UX. Applies UI/UX best-practice patterns and Framer Motion animation, WITHIN the Pasport design system. Trigger on layout, interaction, animation, or design-quality work.
category: frontend
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-ui

UI/UX patterns and motion for Dafke apps. **Subordinate to `dafke-design`** — Pasport tokens and light/dark are always leading; this skill adds patterns, checks, and animation within those tokens.

## Source

Adapted from the `ui-ux-pro-max` skill (industry reasoning rules, UI styles, font pairings, anti-patterns). Apply its recommendations only insofar as they fit the Pasport tokens — do not introduce off-palette colors or competing styles.

## Animation — Framer Motion (default)

- Use **Framer Motion** for: page/section transitions, hover/tap states, list stagger, modal/drawer enter-exit.
- Keep it subtle (durations ~150–300ms, matching Pasport transitions).
- **Always respect `prefers-reduced-motion`** — disable/again reduce non-essential motion.

## Pre-delivery checklist (every screen)

- [ ] No emojis as icons — use SVG (Lucide/Heroicons).
- [ ] `cursor-pointer` on all clickable elements.
- [ ] Hover + focus-visible states with smooth transitions (150–300ms).
- [ ] Text contrast ≥ 4.5:1 in both light and dark.
- [ ] Keyboard navigable; visible focus rings (`--ring`).
- [ ] `prefers-reduced-motion` respected.
- [ ] Responsive at 375 / 768 / 1024 / 1440px.
- [ ] Built on Pasport tokens (no hardcoded colors) and i18n strings (no literals).
