## TypeScript Project

### Project structure — frontend and backend are ALWAYS separate
- **`frontend/`** — all Next.js code (App Router, Tailwind, Pasport design, next-intl). Own `package.json`.
- **`backend/`** — all Node.js + Express code (API, PostgreSQL). Own `package.json`.
- Never mix frontend and backend in one folder. Each installs/runs independently; the frontend calls the backend over HTTP.
- **Prettier is configured and run in BOTH `frontend/` and `backend/`** (Dafke style: 4-space tabs, single quotes, no semicolons, printWidth 120). Each has its own `.prettierrc` and a `format` script; the frontend additionally uses `prettier-plugin-tailwindcss`.

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

### Mutation Testing
- Tool: Stryker (`npx stryker run`)
- Config: `stryker.config.json`
- Run after writing tests to validate test quality
