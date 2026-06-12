---
name: dafke-design
description: Use when building or styling ANY app UI, or scaffolding a new app from a design. Splits the app into frontend/ (Next.js + Pasport design, light+dark) and backend/ (Node.js + Express + PostgreSQL). Trigger on any frontend, backend scaffold, component, page, theme, or styling work.
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

**Every Dafke app uses the Pasport design system, is ALWAYS built in Next.js (App Router), and is split into `frontend/` + `backend/`.**

## Project structure — ALWAYS split frontend and backend

When implementing a design (e.g. a Claude Design handoff), scaffold the app as **two separate folders at the project root, each with its own `package.json`**:

```
project-root/
├── frontend/   → ALL Next.js code: App Router, Tailwind, Pasport design, next-intl, components
│   └── package.json   (next [latest], react, tailwindcss, framer-motion, next-intl, uuid)
└── backend/    → ALL Node.js code: Express API, routes, controllers, models, PostgreSQL
    └── package.json   (express, pg, dotenv, cors, joi, uuid, bcryptjs)
```

- **`frontend/`** = everything UI/Next.js. **`backend/`** = everything server/Node/Express. Never mix them.
- Each folder installs and runs independently. The frontend talks to the backend over HTTP (`NEXT_PUBLIC_API_URL`); no direct DB access from the frontend.

### Prettier + ESLint in BOTH folders (mandatory)
Set up Prettier (Dafke style: 4-space tabs, single quotes, no semicolons) **and** ESLint in **both** folders:
- `frontend/.prettierrc` ← `templates/config/prettierrc.frontend.json` (printWidth 120, includes `prettier-plugin-tailwindcss`).
- `backend/.prettierrc` ← `templates/config/prettierrc.backend.json` (printWidth 80).
- **ESLint**: the frontend gets it from create-next-app; the backend uses `templates/config/eslint.backend.mjs` (flat config) + `eslint @eslint/js typescript-eslint` devDeps.
- Add `"format"`, `"format:check"`, and `"lint"` scripts to each `package.json`. Run before committing.

## Hard rules

1. **Next.js only** for the frontend (in `frontend/`) — always the **latest** Next.js. App Router, `next/font`, theme provider.
2. **Node.js + Express** for the backend (in `backend/`), with **PostgreSQL** for data.
3. **Light + dark mode are mandatory** on every app. Dark theme via `[data-theme="dark"]`. Ship a working theme toggle.
4. **Use the Pasport tokens** — never hardcode colors/spacing/radii/shadows. Canonical reference: `templates/design/pasport.css` (copy into the project as `frontend/app/pasport.css` and map into the Tailwind theme).
5. **Our own UI only — dafkeUI.** NEVER install shadcn/ui, Radix, MUI, Chakra, or any third-party component library. All components come from **dafkeUI** (`DafkeDD/dafke-ui`) — a shadcn-style library that copies Pasport-styled component source straight into the repo (`@/components/ui/...`), so you own every component. Add them with its CLI (see the `dafke-ui` skill); never reach for an external kit.

## Pasport tokens (summary — full set in templates/design/pasport.css)

- **Accent (teal)**: light `#0d9488` / dark `#2dd4bf` (`--accent`, hover, active, fg, tints, border).
- **Neutrals (slate)**: `--bg`, `--surface`, `--surface-2/3`, `--border`, `--border-strong`, `--text`, `--text-2`, `--text-3` — redefined under `[data-theme="dark"]`.
- **Status**: green / amber / red / blue / violet (+ tint + border). **Radius**: `--r-xs`…`--r-2xl`, `--r-full`. **Shadow**: `--sh-xs`…`--sh-xl`. **Focus ring**: `--ring`.
- **Fonts**: Hanken Grotesk (UI) + JetBrains Mono (mono) via `next/font/google`. **Layout**: sidebar 256px, topbar 64px, max-width 1160px.

Components: buttons (primary/secondary/ghost/danger), inputs/select/textarea, cards, badges, toggle, sidebar + topbar shell.

## Frontend scaffold (standard) — `frontend/`

Keep it **basic and universal** — always the **latest Next.js**, plus Tailwind, Prettier, uuid. **NEVER install shadcn/ui, Radix, MUI, or any third-party component kit** — we build everything from our own UI (**dafkeUI** = the Pasport design system).

```bash
npx create-next-app@latest frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cd frontend
npm i uuid
npm i -D prettier prettier-plugin-tailwindcss
```

Structure (create-next-app generates most of this):

```
frontend/
├── src/
│   ├── app/          ← App Router: layout.tsx, page.tsx, globals.css
│   ├── components/   ← React components
│   ├── hooks/        ← custom hooks
│   └── lib/          ← helpers (cn(), api client)
├── public/
├── next.config.ts
├── tsconfig.json     ← @/* import alias
├── .prettierrc       ← templates/config/prettierrc.frontend.json
└── package.json
```

Then layer Dafke on top:
- **dafkeUI + Pasport** — `npx dafke-ui init` then `npx dafke-ui add all` (copies components + `theme.css` into `@/components/ui/`). Import `@/components/ui/theme.css` in the root layout; wire `next/font/google` (Hanken Grotesk + JetBrains Mono); add a light/dark toggle (`document.documentElement.dataset.theme = 'dark'`).
- **i18n** — `next-intl`, en/nl/fr/de (see `dafke-i18n`).
- **Motion/UX** — Framer Motion + pre-delivery checklist (see `dafke-ui`).

## Backend scaffold (standard) — `backend/`

Mirrors the proven Dafke backend. **Copy the starter files from `templates/backend/`** — don't reinvent them.

```bash
npm init -y
npm i -D typescript @types/node ts-node @types/express @types/pg @types/cors nodemon prettier prettier-plugin-tailwindcss
npm i express pg dotenv cors joi uuid bcryptjs
```

Structure (copy from `templates/backend/`):

```
backend/
├── src/
│   ├── index.ts                  ← dotenv → express+cors+json → mount routers → run migrations → listen (PORT, default 5000)
│   ├── config/database.ts        ← pg Pool from DB_USER/DB_HOST/DB_DATABASE/DB_PASSWORD/DB_PORT
│   ├── controllers/              ← handlers using a sendResponse({success,message,data}) helper
│   ├── data/createUserTable.ts   ← versioned migration runner (database_state table + inline migrations)
│   ├── middleware/               ← errorHandler.ts (central) + inputValidator.ts (Joi)
│   ├── models/                   ← service fns with parameterised pg queries (e.g. userModel.ts)
│   ├── routes/                   ← express.Router() per resource, mounted under /api
│   └── utils/
├── tsconfig.json                 ← templates/backend/tsconfig.json (CommonJS, ES2020, strict)
├── .prettierrc                   ← templates/config/prettierrc.backend.json (printWidth 80)
├── .env.example                  ← templates/backend/.env.example  (copy to .env)
└── package.json
```

Scripts in `backend/package.json`:

```json
"scripts": {
    "dev": "nodemon --watch src --ext ts,js --exec \"ts-node src/index.ts\"",
    "build": "tsc",
    "start": "node dist/index.js",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
}
```

Conventions (follow the starters exactly):
- **Flow**: `routes/` (Router) → `controllers/` (validate + `sendResponse`) → `models/` (service fns, parameterised `pool.query`) → `config/database.ts` (pg Pool).
- **Validation**: Joi schemas in `middleware/inputValidator.ts`; controllers also guard IDs (UUID v4) + types.
- **Errors**: `next(error)` → central `middleware/errorHandler.ts` returns `{success:false,status,message}`.
- **DB & migrations**: PostgreSQL via `pg`; schema changes go in `data/createUserTable.ts` as versioned migrations (bump `DATABASE_VERSION`, add an entry). `uuid-ossp` for UUID PKs.
- **Config**: `dotenv` with `DB_*` env vars; never hardcode credentials.
