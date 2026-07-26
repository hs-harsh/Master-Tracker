---
name: try-idea
description: Prototype an idea visually with mock data before committing to real implementation. Use for half-formed UI/feature ideas — "what if the dashboard showed X", "would a chart of Y look good". Builds a throwaway version in the real app, shows it in the browser, then keep (→ add-feature) or discard.
---

# Try Idea — Mock-First Prototyping

Goal: let the user SEE the idea in the real app within minutes, without schema changes, new routes, or commitment. Read `ui-conventions` first (mocks must still look native — real theme tokens, real card/table classes).

## Rules

1. **No backend changes.** No schema.sql edits, no new routes, no cron. Mock data lives in the component as a `const MOCK_...` array.
2. **Build in place.** Put the prototype where it would actually live (e.g., a new card on Dashboard.jsx, a new tab on Portfolio.jsx) so the user sees it in context with real navigation, theme, and surrounding data. Mark it clearly: `{/* PROTOTYPE (try-idea): remove or promote */}`.
3. **Use the design system.** `.card`, theme tokens, Recharts patterns, lucide icons — a prototype that looks foreign gets judged unfairly.
4. **Show it.** Start the app (`npm run dev` if not running) and open the browser preview at the changed page. Check dark theme at minimum; both themes if the verdict is close.
5. **Don't commit prototypes.** Working tree only.

## After showing

Ask exactly one question: **keep, tweak, or discard?**

- **Keep** → hand off to `add-feature` (or `ui-change` if no data layer needed). The prototype JSX is the spec; replace mock data with real API data, remove the PROTOTYPE marker.
- **Tweak** → iterate on the mock, show again.
- **Discard** → `git checkout` the touched files; leave nothing behind. Confirm the tree is clean.

## Scope guard

If the idea can't be faked with mock data (needs real auth flows, real external API behavior), say so and route to `suggester`/`add-feature` instead of building a misleading mock.
