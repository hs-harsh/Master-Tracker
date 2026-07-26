---
name: ui-conventions
description: Design system for this repo — theme tokens, component classes, charts, tables, filters, mobile rules. Load before writing or changing any JSX/CSS. ui-change, try-idea, and add-feature read this first.
---

# UI Conventions

Dark-first design ("ink" background, gold accent) with light mode and 5 switchable accents. The rule that overrides all others: **find the closest existing page and match it** — Portfolio.jsx for tables/filters, OtherAssets.jsx for full CRUD pages, Dashboard.jsx for stat cards.

## Theme system

- `client/src/lib/theme.js` — `applyTheme(mode, accent)` sets `data-theme` (`dark`/`light`) and `data-accent` on `<html>`, plus `--accent` CSS var. Accents: gold (default) `#f0c040`, teal, blue, purple, rose.
- Tailwind tokens (client/tailwind.config.js): `ink` (#09090e background), `surface` (#0f1117), `accent` (#f0c040), `accent-dim`, `soft` (muted text #8b95a5), `text` (#e2e8f0).
- **Never hardcode hex colors in JSX.** Use Tailwind tokens (`bg-ink`, `text-soft`, `bg-accent`) or `var(--accent)`. Verify changes in BOTH themes before calling it done.

## Component classes (client/src/index.css @layer components)

- `.card` — standard container (rounded-2xl, gradient surface, subtle border/shadow).
- `.card-hero` — accent-tinted card for primary financial figures.
- `.btn-primary` — accent pill button, min-height 44px (touch target).
- `.btn-ghost` — outlined secondary button.
- Prefer these classes over rebuilding card/button styles inline.

## Icons & charts

- Icons: `lucide-react` only, matching nav usage in Layout.jsx (size/stroke consistent with neighbors).
- Charts: Recharts. Copy setup from `client/src/components/PriceChartCard.jsx` or Dashboard charts — responsive container, theme-consistent colors, tooltips styled like existing ones.

## Tables & filters

- Tables: sortable headers as in Portfolio.jsx holdings table; wrap in `.overflow-x-auto` for mobile.
- Filters: select dropdowns in a filter bar; persist each filter to localStorage with a page-prefixed key via wrapper setters (see project-map). Filter keys follow `<page>_<name>_filter`.

## Mobile / PWA

- App is installable (InstallPrompt.jsx); respect `safe-area-*` utility classes for fixed headers/bottom nav.
- Touch targets ≥ 44px; base font 14px; test at mobile width (Vite preview, narrow the browser pane).

## Formatting

- Currency: INR primary, `₹` with Indian digit grouping; USD/GBP shown converted (see project-map currency rule).
- Numbers: gains green / losses red, matching existing pages' classes.
- Dates: date-fns, match the format used on the page you're touching.
