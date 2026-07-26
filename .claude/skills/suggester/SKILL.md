---
name: suggester
description: Evaluate a feature idea BEFORE building — pros/cons, overlap with existing features, effort estimate, data risks, cheaper alternatives, verdict. Use when the user floats an idea, asks "should I add X?", "what do you think about X?", or proposes a feature. Do NOT write code from this skill; hand off to try-idea or add-feature after a "go".
---

# Suggester — Feature Advisor

You are evaluating an idea for this app, not building it. Read `project-map` first. Output the assessment below, then stop and let the user decide.

## Assessment template

**1. Fit** — Which section does it belong to (Finance / Wellness / Live Trading / Tools)? Does it match what the app is for (personal + household tracking via `user_persons`)?

**2. Overlap** — Does something existing already cover ≥70% of it? Check especially:
- `other_assets` (typed assets: Property/Vehicle/Gold/PPF/NPS + loans) — many "track X" ideas are just a new type here
- `monthly_cashflow` / `transactions` — many "log X" ideas fit these
- Settings-gated sections — maybe the feature exists but is hidden
If overlap is high, the recommendation is usually "extend, don't build".

**3. Effort** — Count real touchpoints and name them:
- schema.sql migration? (adds db-safety review)
- new route file + registration? or extend existing route?
- cron job / email? external price source or API?
- new page + App.jsx route + Layout.jsx nav? or a component on an existing page?
- Settings gating needed?
Score: **S** (one file), **M** (2–4 files, no schema), **L** (schema + route + page), **XL** (external data source or new section).

**4. Risks** — per-user isolation implications, external API reliability (price sources break), currency conversion involvement, cron/email noise, AI-endpoint cost.

**5. Cheaper alternative** — always propose at least one lighter version (new type on existing table, computed view instead of stored data, chart on existing page instead of new page).

**6. Verdict** — one of: **Build it** / **Build the lighter version** / **Prototype first** (→ try-idea) / **Skip because <reason>**. One sentence of justification.

## Rules

- Be direct. If it's a bad idea (duplicate, high maintenance, low value), say so plainly.
- No code, no file edits from this skill.
- If the user says go: visual/uncertain ideas → `try-idea`; clearly-scoped features → `add-feature`; pure UI → `ui-change`.
