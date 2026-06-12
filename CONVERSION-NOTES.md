# DafkeCLI — Conversie-notities

Fork van `corilus-claude-cli` → `dafke-cli`. Dit beschrijft wat gedaan is en wat lokaal nog afgewerkt moet worden.

## Gedaan

- **Rename**: alle `corilus`/`Corilus`/`corilus-cc` → `dafke` (tekst, bestands- en mapnamen). CLI-commando = `dafke`. 0 resterende verwijzingen.
- **TypeScript-only**: adapters `delphi/dotnet/foxpro/java/python` verwijderd (enkel `typescript`). CLAUDE.md-templates + lint-templates teruggebracht tot TS. Registry registreert enkel `TypeScriptAdapter`; `VALID_TECH_STACKS = ["typescript"]`.
- **Integraties → GitHub**: alle keuzemenu's (auth, board-connect, docs-hosting, connect-command) bieden enkel GitHub aan. Azure/Jira/Confluence/Sonar zijn niet meer selecteerbaar.
- **Concrete Corilus-/Azure-koppelingen weg**: `.azuredevops/`, `azure-pipelines*.yml`, `templates/ci/azure-devops/`, `.claude/azure-devops-mcp.sh`, gitnexus-skills + gitnexus-reindex-hook. Private Azure npm-registry → `registry.npmjs.org`.
- **MCP**: enkel `playwright` (context7, gitnexus, azure-devops verwijderd).
- **Config**: `.prettierrc` vervangen door jouw versie; marketplace-owner = ITWorxs.
- **Nieuw plugin `dafke-frontend`** met 3 verplichte skills:
  - `dafke-design` — Pasport design system (teal, light+dark), **Next.js only**. Tokens in `templates/design/pasport.css`.
  - `dafke-i18n` — `next-intl`, altijd 4 talen (en default, nl, fr, de).
  - `dafke-ui` — UI/UX-patronen + **Framer Motion** (respecteert `prefers-reduced-motion`), ondergeschikt aan Pasport.

## Nog af te werken (behind een lokale build)

> De sandbox hier kon geen volledige `npm install` afronden, dus het project is **niet compile-geverifieerd**. Doe dit lokaal:
>
> ```bash
> cd dafke-cli
> npm install
> npm run typecheck && npm run lint && npm run build && npm test
> ```

1. **Dormante integratie-code definitief verwijderen.** Nog aanwezig maar onbereikbaar (UX biedt enkel GitHub):
   - `src/integrations/azure-devops/`, `src/integrations/jira/`, `src/integrations/confluence/`, `src/integrations/sonarqube/`
   - `src/core/confluence/`, `src/utils/ado-helpers.ts`
   - referenties/dode `switch`-takken in `step-auth.ts`, `step-connect.ts`, `connect.ts`, `audit.ts`, `doctor.ts`, `dimension-analyzer.ts`, `repository-provider.ts`
   - bijhorende tests (`tests/unit/ado-helpers.test.ts`, `integrations.test.ts`, `repository-provider.test.ts`, …)
   - zod auth-schema velden `azureDevOps/jira/confluence/sonarqube` in `config-schema.ts`
   
   Verwijder per module en laat `npm run typecheck` de losse eindjes aanwijzen.

2. **TechStack-enum opschonen (optioneel).** De enum bevat nog legacy-waarden (`java/dotnet/...`) puur om bestaande branches te laten compileren. Na het snoeien van die branches kan de enum naar `["typescript","unknown"]`.

3. **CI**: enkel `templates/ci/github-actions` resteert; voeg een eigen GitHub Actions workflow toe voor dit project zelf indien gewenst.

4. **Secrets**: lokaal via Windows Credential Manager (`dev-secrets/github-token`), nooit plaintext (zie `../PLAN.md` §7b).

5. **Versie/Changelog**: `package.json` version + `CHANGELOG.md` bijwerken naar een 0.1.0-startpunt voor Dafke.

## Privacy-audit (niets gaat naar Corilus)

Volledige doorlichting uitgevoerd. Bevindingen:

- **Geen telemetrie/analytics/error-reporting** in de code (geen Sentry/PostHog/Segment/Datadog/…).
- **Geen `corilus`-verwijzing** meer in de hele codebase (enkel in dit notitiebestand).
- **Geen npm lifecycle-scripts** (geen `postinstall`/`prepare`) → er draait niets bij `npm install`.
- **Slechts twee netwerk-calls in de code, beide onschuldig:**
  - `update-checker.ts` → `GET https://registry.npmjs.org/dafke/latest` (publieke npm, enkel een versienummer, géén data verstuurd). Wordt **niet meer automatisch** uitgevoerd — de SessionStart `dafke update --check` hook is verwijderd. Draait enkel nog bij een expliciete `dafke update`.
  - `base-client.ts` → enkel actief wanneer jij zelf de **GitHub**-integratie gebruikt (`api.github.com`). De Jira/Confluence/Sonar/Azure-clients zijn dormant en niet selecteerbaar.
- **Gegenereerde project-templates** (`templates/settings/`) leveren nu enkel de Playwright-MCP; context7/gitnexus/azure-devops zijn eruit.
- **Distributie**: README + user-manual install-instructies wijzen niet meer naar een privé Azure-feed; installatie gebeurt lokaal vanuit deze repo. `.npmrc` = publieke npmjs.

> Restant: `dev.azure.com`-vermeldingen in `docs/` zijn nog louter documentatie/voorbeelden van de **dormante** Azure-integratie (sturen niets door). Ze verdwijnen samen met de dormante integratie-code (zie hierboven).

## Update — dormante integratie-code verwijderd

De Azure DevOps / Jira / Confluence / SonarQube **clientcode is nu volledig weg** uit `src/`:

- Verwijderd: `src/integrations/{azure-devops,jira,confluence,sonarqube}/`, `src/core/confluence/`.
- Behouden (geen netwerk): `src/utils/ado-helpers.ts` (pure URL-parser) en de optionele `auth.*`-velden in `config-schema.ts` (onschuldige config-slots, geen connectie).
- GitHub-only gemaakt: `repository-provider.ts`, `repos.ts`, `connect.ts`, `step-auth.ts`, `step-connect.ts`; Sonar-verrijking uit `audit.ts` / `dimension-analyzer.ts` / `coverage-analyzer.ts`.
- Verwijderde/opgeschoonde tests: `confluence-client`, `integrations`, `repository-provider`, `connect-command`, `wizard-steps-full` (obsoleet), plus de connect-/sonar-blokken uit `cli-full.test.ts`.
- `src/`-scan: geen enkele verwijzing meer naar de verwijderde modules. `tsconfig.json` sluit `tests/` uit van `tsc`, dus `npm run typecheck` valideert de bron.

Kleine rest (geen connectie, dode code): `step-hooks.ts` bevat nog gated Azure-DevOps-MCP-registratie die nooit getriggerd wordt (auth.azureDevOps wordt niet meer gezet). Mag later weg.

> De `qs`/`typed-rest-client`-vulnerability komt **niet** van deze clients (die waren fetch-based) maar is transitief. Check de bron met `npm ls typed-rest-client`.
