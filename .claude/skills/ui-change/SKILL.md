---
name: ui-change
description: Frontend-only change recipe — layout tweaks, new charts/cards on existing pages, filter bars, styling, mobile fixes. Use for visual/presentation requests that need no schema or API changes ("make X more compact", "add a chart of existing data", "fix this on mobile"). For new data → add-feature.
---

# UI Change — Frontend Recipe

Read `ui-conventions` first. No server files should change under this skill — if you find yourself needing a new endpoint or column, stop and switch to `add-feature`.

## Steps

1. **Find the pattern.** Locate the closest existing implementation of what's being asked (tables/filters → Portfolio.jsx, CRUD forms → OtherAssets.jsx, stat cards/charts → Dashboard.jsx, chart component → PriceChartCard.jsx). Match its structure, class usage, and naming — don't invent a parallel style.

2. **Make the change** using the design system: `.card`/`.card-hero`/`.btn-*` classes, Tailwind theme tokens (`ink`, `surface`, `accent`, `soft`, `text`), `var(--accent)` — never hardcoded hex. lucide-react icons sized like their neighbors.

3. **Existing data only.** New charts/views must be computed from data the client already fetches (or existing endpoints). Currency rule applies: convert to INR before aggregating.

4. **Preserve behavior.** Keep localStorage filter persistence intact; keep sort behavior on tables; don't break Settings-based section gating.

5. **Verify visually** in the browser preview:
   - Dark AND light theme (`applyTheme` — toggle in Settings)
   - Mobile width (narrow the pane; check `.overflow-x-auto` on tables, safe-area classes, 44px touch targets)
   - No console errors

## Done means

The change is visible and correct in both themes and at mobile width. Hand off to `verify-ship` when the user approves.
