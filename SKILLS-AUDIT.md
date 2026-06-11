# DafkeCLI — Skills token-audit

Doel: nagaan waar skills tokens verspillen via te lange body's of zwakke descriptions.

## Resultaat: groen

32 skills gemeten. Allemaal goed gestructureerd voor **progressive disclosure**:

- **Body-lengte**: langste = 145 regels (`dafke-doc`). Geen enkele boven de richtlijn van 500. Som van alle body's = 2.404 regels.
- **Descriptions**: allemaal 80–205 tekens — bruikbaar en concreet. (De 3 `dafke-frontend`-skills zijn het langst, bewust "pushy" voor betere triggering.)
- **Geen 500+ regel-monsters, geen anemische descriptions.**

Conclusie: de body-lengte is hier *niet* het probleem. De echte hefbomen zitten elders.

## Echte token-hefbomen

1. **Altijd-in-context kost = de som van alle descriptions.** Enkel naam + description van elke ingeschakelde skill weegt permanent mee (~32 × ~100 tekens ≈ ~800 tokens floor). Grootste winst: **schakel enkel relevante plugins in per project.** Een puur-backend project hoeft `dafke-frontend` niet te laden; een frontend-app hoeft `dafke-observability` niet. Overweeg per-project plugin-enable i.p.v. alles altijd aan.

2. **Zware referentie-data hoort in `references/` + `scripts/`, nooit inline.** Twee concrete gevallen om in het oog te houden bij verdere uitbouw:
   - **Pasport-CSS** — staat al apart in `templates/design/pasport.css` ✓ (niet in de SKILL.md-body).
   - **ui-ux-pro-max-data** — wanneer je de echte dataset (161 regels, kleurpaletten, CSV's) vendort: zet die in `references/` met een `scripts/search.py`, zodat de body klein blijft en data enkel laadt wanneer nodig. Doe dit NIET inline in `dafke-ui/SKILL.md`.

3. **Bundle herhaald werk als scripts.** Als skills steeds dezelfde scaffold genereren (bv. next-intl-opzet, Pasport-tokens injecteren), schrijf één `scripts/`-script. Scheelt tokens per gebruik én is betrouwbaarder.

4. **Description-triggering optimaliseren.** Body's zijn lean, maar onnauwkeurige triggering (onder- of over-triggeren) verspilt alsnog tokens. Gebruik de **description-optimizer** van skill-creator (zie `dafke-skills`) om triggering te meten en aan te scherpen.

## Aanbeveling

Geen herstructurering nodig nu. Hou bij groei deze regels aan (zie ook `dafke-skills/skills/dafke-skill`):
- SKILL.md-body < ~500 regels; zware kennis → `references/`.
- Herhaald deterministisch werk → `scripts/`.
- Per-project enkel de nodige plugins inschakelen.
