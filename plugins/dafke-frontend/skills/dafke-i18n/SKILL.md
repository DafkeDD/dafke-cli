---
name: dafke-i18n
description: Use on EVERY Next.js app. Sets up next-intl with 4 locales (en default, nl, fr, de). Trigger whenever building pages, components, or any user-facing copy — no hardcoded strings allowed.
category: frontend
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /dafke-i18n

**Internationalization is mandatory on every Dafke app. ALWAYS use `next-intl`. ALWAYS 4 languages.**

## Hard rules

1. **Library**: `next-intl` (Next.js App Router). Reference: https://i18nexus.com/tutorials/nextjs/next-intl
2. **Locales (always all four)**: `en` (default + fallback), `nl`, `fr`, `de`.
3. **No hardcoded UI strings.** Every user-facing string comes from a message catalog.

## Setup

1. Install: `npm i next-intl`.
2. Create `messages/en.json`, `messages/nl.json`, `messages/fr.json`, `messages/de.json` (en is the source of truth; keep keys in sync across all four).
3. Add `i18n/routing.ts` with `locales: ['en','nl','fr','de']`, `defaultLocale: 'en'`.
4. Add the `next-intl` middleware for locale routing and `NextIntlClientProvider` in the locale layout.
5. Use `useTranslations()` / `getTranslations()` — never inline text.
6. Add a language switcher in the Pasport top bar (see `dafke-design`).

## Checklist

- [ ] All 4 catalogs present and key-aligned.
- [ ] `en` is default + fallback.
- [ ] Middleware + provider wired.
- [ ] No literal user-facing strings in components.
