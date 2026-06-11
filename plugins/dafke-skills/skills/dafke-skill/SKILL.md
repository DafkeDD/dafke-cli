---
name: dafke-skill
description: Use whenever the user wants to create, edit, optimize, or token-audit a Dafke skill — phrases like "make a skill", "new skill", "improve this skill", "why doesn't my skill trigger", or "this skill is too big". Drives skill authoring through the official skill-creator while enforcing Dafke's progressive-disclosure and token-efficiency rules.
category: tool
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
---

# /dafke-skill

Author and improve Dafke skills with token efficiency built in.

## Use the official skill-creator for the heavy lifting

The full create → test → review → optimize loop (eval runner, benchmark viewer, description optimizer) lives in Anthropic's `skill-creator`. Do not reimplement it. Install once:

```
/plugin marketplace add anthropics/skills
/plugin install skill-creator
```

Then invoke it (the `skill-creator` skill) to draft, run evals, and optimize triggering. This skill (`dafke-skill`) adds the Dafke-specific conventions on top.

## Dafke conventions (enforce these)

**Progressive disclosure — keep tokens low.** A skill loads in three levels; only what's needed enters context:

1. **name + description** — always in context. Keep the description concrete and a little "pushy" about *when* to trigger.
2. **SKILL.md body** — loads only when the skill triggers. Keep it under ~500 lines.
3. **`references/`, `scripts/`, `assets/`** — load only when needed. Scripts can even execute without entering context.

**Rules:**

- If the body approaches ~500 lines, move detail into `references/` and point to it from the body.
- Heavy data (datasets, CSVs, long token files like the Pasport CSS or ui-ux-pro-max data) goes in `references/`, never inline.
- Repeated deterministic work (scaffolds, generators) goes in `scripts/` — write once, reuse, save tokens per call.
- One concern per skill; don't merge unrelated workflows.
- Prefer enabling only the plugins a project needs — every enabled skill's description is a permanent context cost.

**Frontend skills additionally** must respect: Next.js only, Pasport tokens + light/dark (`dafke-design`), next-intl 4 languages (`dafke-i18n`), Framer Motion patterns (`dafke-ui`).

## Quick token-audit

To check existing skills for bloat:

```bash
for f in plugins/*/skills/*/SKILL.md; do echo "$(wc -l < "$f") $f"; done | sort -rn | head
```

Flag any body > 500 lines (move detail to `references/`) and any description < ~80 chars (too vague to trigger reliably). See `SKILLS-AUDIT.md` for the current baseline.
