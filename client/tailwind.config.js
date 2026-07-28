/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  future: {
    // Compile `hover:` inside @media (hover: hover). Without this, tapping a
    // nav item or tag button on a touch device leaves its hover style stuck on
    // until the next tap elsewhere — very visible now that hover states
    // actually resolve to the accent at every opacity. No effect on desktop.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        // The `* Fallback` families are metric-matched local faces declared in
        // src/fonts.css — they hold the layout still while the webfont swaps.
        display: ['Outfit', 'Outfit Fallback', 'Inter', 'Inter Fallback', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        body:    ['Inter', 'Inter Fallback', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"JetBrains Mono Fallback"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Surface ramp. Token-backed for exactly the same reason the foreground
        // ramp is: as literals, the theme split had to be patched by four
        // exact-class overrides in index.css (`.bg-ink`, `.bg-surface`,
        // `.bg-card`, `.border-border`), and any opacity modifier escaped them
        // — `bg-surface/40` and `border-border/40` matched no override at all
        // and kept painting the DARK value on a light page. 34 background sites
        // and 21 border sites were wrong that way. This is the enumerated-list
        // rot the rest of this phase deleted; it lives at the token now.
        ink:          'rgb(var(--ink-rgb) / <alpha-value>)',
        surface:      'rgb(var(--surface-rgb) / <alpha-value>)',
        card:         'rgb(var(--card-rgb) / <alpha-value>)',
        border:       'rgb(var(--border-rgb) / <alpha-value>)',

        // Themed tokens. These MUST stay in the rgb(var(--x) / <alpha-value>)
        // form: it is what lets Tailwind compile `bg-accent/15`, `hover:bg-accent/5`,
        // `bg-accent/[0.07]` and every other opacity/variant combination straight
        // to the live accent. A static hex here is what forced the old
        // hand-maintained `[data-accent="…"]` override list in index.css, which
        // silently missed any class name nobody remembered to add.
        accent:       'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-dim': 'rgb(var(--accent-dim-rgb) / <alpha-value>)',
        // The contrasting foreground for anything sitting ON an accent fill.
        // Per-accent (rose needs white, the rest take ink) and deliberately not
        // theme-split, because the accent fill underneath isn't either — which
        // is exactly why `bg-ink`/`text-ink` broke here once ink became
        // theme-aware. A plain var, so no <alpha-value>: opacity on a knob or
        // label sitting on an accent fill would only reintroduce the problem.
        'accent-fg': 'var(--accent-fg)',

        // Accent as a FOREGROUND (text, icons) as opposed to a fill. Tailwind
        // maps one token to bg-/text-/border- alike, so there is no way to give
        // `text-accent` a different value from `bg-accent` at the token layer —
        // which is why Phase 4 needed the `[data-theme="light"] .text-accent`
        // override, and why that override only ever covered that one exact
        // class string (`text-accent/80` and `hover:text-accent` stayed bright
        // gold and jumped on hover). A second token is the fix: foreground call
        // sites use `text-accent-ink`, and every opacity and variant of it
        // falls out of the token for free. Fills keep `accent`.
        'accent-ink': 'rgb(var(--accent-ink-rgb) / <alpha-value>)',

        // Semantic, theme-split. Gains/losses need a darker green and rose on
        // light backgrounds than on dark, and charts need grid/axis strokes that
        // follow the theme rather than being hardcoded per chart.
        pos:          'rgb(var(--pos-rgb) / <alpha-value>)',
        neg:          'rgb(var(--neg-rgb) / <alpha-value>)',
        grid:         'rgb(var(--grid-rgb) / <alpha-value>)',
        axis:         'rgb(var(--axis-rgb) / <alpha-value>)',

        // Neutral hairline. Defined now so the ~140 `border-white/*` call sites
        // can migrate to `border-hairline` in Phase 5 — not swept here.
        hairline:     'rgb(var(--hairline-rgb) / <alpha-value>)',

        // Identity hues. Same tokens the charts and `.tag-*` classes read, so a
        // category is one colour whether it appears as a pie slice, a tag or a
        // line of status text. Exposed as Tailwind colours so `text-hue-amber`,
        // `bg-hue-amber/10` and every variant compile from the token and pick up
        // the light-theme cut automatically — the raw `text-amber-400` shades
        // these replaced measured under 2:1 on a white card.
        'hue-gold':    'rgb(var(--hue-gold-rgb) / <alpha-value>)',
        'hue-amber':   'rgb(var(--hue-amber-rgb) / <alpha-value>)',
        'hue-orange':  'rgb(var(--hue-orange-rgb) / <alpha-value>)',
        'hue-emerald': 'rgb(var(--hue-emerald-rgb) / <alpha-value>)',
        'hue-green':   'rgb(var(--hue-green-rgb) / <alpha-value>)',
        'hue-teal':    'rgb(var(--hue-teal-rgb) / <alpha-value>)',
        'hue-blue':    'rgb(var(--hue-blue-rgb) / <alpha-value>)',
        'hue-violet':  'rgb(var(--hue-violet-rgb) / <alpha-value>)',
        'hue-purple':  'rgb(var(--hue-purple-rgb) / <alpha-value>)',
        'hue-rose':    'rgb(var(--hue-rose-rgb) / <alpha-value>)',
        'hue-pink':    'rgb(var(--hue-pink-rgb) / <alpha-value>)',
        'hue-slate':   'rgb(var(--hue-slate-rgb) / <alpha-value>)',

        teal:         '#2dd4bf',
        // The app's own loss colour. Routed through --neg-rgb so every
        // `text-rose`, `bg-rose/10`, `hover:text-rose` … at any opacity picks up
        // the theme-split value. Dark resolves to the same #fb7185 as before, so
        // this is a no-op there; light gets the darker cut it needs for contrast.
        rose:         'rgb(var(--neg-rgb) / <alpha-value>)',
        // Neutral foreground ramp. Token-backed rather than literal so the
        // theme split no longer needs the `[data-theme="light"] .text-soft`
        // style override list — and, more importantly, so chrome that stays
        // dark in BOTH themes (the sidebar) can re-pin the ramp on itself with
        // `.on-dark`. The old literals were why light theme painted sidebar
        // labels slate-600 on near-black at ~2:1.
        muted:        'rgb(var(--fg-muted-rgb) / <alpha-value>)',
        soft:         'rgb(var(--fg-soft-rgb) / <alpha-value>)',
        text:         'rgb(var(--fg-body-rgb) / <alpha-value>)',
      },
      // Tailwind's stock opacity scale runs in steps of 5, so the `/8` modifier
      // silently compiled to nothing at all — not to the wrong colour, to no
      // rule whatsoever. That silently blanked 44 call sites, including the
      // active sidebar item's tint in Layout.jsx (`bg-accent/8`, 9 sites) and
      // `border-white/8` (27 sites). Registering the step fixes every one of
      // them at the token layer, with no JSX change.
      opacity: {
        8: '0.08',
      },
      boxShadow: {
        'glow-accent': '0 0 24px rgb(var(--accent-rgb) / 0.18)',
        'glow-gold':  '0 0 24px rgba(240, 192, 64, 0.18)',
        'glow-teal':  '0 0 20px rgba(45, 212, 191, 0.15)',
        'glow-rose':  '0 0 20px rgba(251, 113, 133, 0.15)',
        'card':       '0 4px 32px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 48px rgba(0, 0, 0, 0.6)',
      },
      backgroundImage: {
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
        'hero-gradient': 'linear-gradient(135deg, rgb(var(--accent-rgb) / 0.06) 0%, rgb(var(--accent-rgb) / 0) 60%)',
      },
    },
  },
  plugins: [],
};
