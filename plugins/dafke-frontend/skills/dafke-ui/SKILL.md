---
name: dafke-ui
description: Use when building or polishing any frontend UI, adding components, or animating. dafkeUI is our own shadcn-style component library (Pasport design system) — copy components into the repo via its CLI. NEVER use shadcn/Radix/MUI. Trigger on components, layout, interaction, animation, or design-quality work.
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

**dafkeUI is our own component library** (`DafkeDD/dafke-ui`) — a shadcn-style, Pasport-themed set of React + TypeScript + Tailwind components. The CLI **copies the component source into your repo** (`src/components/ui/...`), so you own and can edit every component. **Never** install shadcn/ui, Radix, MUI, Chakra, or any other component kit — dafkeUI replaces them all.

## Install & use (in `frontend/`)

```bash
# 1. scaffold config (detects your @/ alias) + copy the theme
npx dafke-ui init

# 2. add components — registry + npm dependencies are pulled in automatically
npx dafke-ui add button       # also pulls icon + theme.css
npx dafke-ui add all          # everything at once
```


Import the theme once at the app root, then use components:

```tsx
import "@/components/ui/theme.css"   // Pasport tokens (light default; dark via document.documentElement.dataset.theme = "dark")
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

<Button icon="plus">New</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger" icon="trash">Delete</Button>
<Badge tone="green" dot>Active</Badge>
```

Components use `forwardRef`, are dependency-free (only React) unless noted, and follow the `variant`/`tone`/`size` prop conventions.

## Component catalogue (use these — don't rebuild them)

- **Primitives**: button, badge, field, input, textarea, select, toggle, checkbox, segmented, card, section, divider, kbd, skeleton, spinner, alert, progress, ring, tabs, table, data-grid, empty-state.
- **Overlays/nav**: modal, drawer, dropdown, navbar, sidebar, user-menu, user-dropdown, avatar, user-avatar, app-icon, icon.
- **Form inputs**: password-input, password-strength, otp-input, animated-input, file-upload, date-picker, day-grid, emote-rating.
- **Charts/data**: bar-chart, line-chart, donut, sparkline, number-ticker, qr-code.
- **Motion/feedback**: motion-button, motion-card, motion-list, page-transition, fade-in, toast, confetti, success-checkmark.

If a needed component truly doesn't exist, build it from the Pasport tokens in the same style — then consider adding it to dafkeUI.

## Animation

dafkeUI ships motion components (`motion-*`, `page-transition`, `fade-in`). For custom motion, use **Framer Motion**: page/section transitions, hover/tap, list stagger, modal/drawer enter-exit. Keep it subtle (150–300ms). **Always respect `prefers-reduced-motion`.**

## Pre-delivery checklist (every screen)

- [ ] Built from dafkeUI components (no shadcn/Radix/MUI, no off-palette colors).
- [ ] No emojis as icons — use the dafkeUI `icon` / Lucide.
- [ ] `cursor-pointer` on clickable elements; hover + focus-visible states (150–300ms).
- [ ] Text contrast ≥ 4.5:1 in both light and dark; visible focus rings (`--ring`).
- [ ] `prefers-reduced-motion` respected.
- [ ] Responsive at 375 / 768 / 1024 / 1440px.
- [ ] All copy via next-intl (no hardcoded strings).
