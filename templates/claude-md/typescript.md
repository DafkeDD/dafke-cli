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

### Mutation Testing
- Tool: Stryker (`npx stryker run`)
- Config: `stryker.config.json`
- Run after writing tests to validate test quality
