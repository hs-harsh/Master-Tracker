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
        ink:          '#09090e',       // near-void background — deeper than before
        surface:      '#0f1117',       // one step above ink
        card:         '#13161f',       // cards barely lifted off surface
        border:       '#1c2033',       // subtle borders

        // Themed tokens. These MUST stay in the rgb(var(--x) / <alpha-value>)
        // form: it is what lets Tailwind compile `bg-accent/15`, `hover:bg-accent/5`,
        // `bg-accent/[0.07]` and every other opacity/variant combination straight
        // to the live accent. A static hex here is what forced the old
        // hand-maintained `[data-accent="…"]` override list in index.css, which
        // silently missed any class name nobody remembered to add.
        accent:       'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-dim': 'rgb(var(--accent-dim-rgb) / <alpha-value>)',

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

        teal:         '#2dd4bf',
        // The app's own loss colour. Routed through --neg-rgb so every
        // `text-rose`, `bg-rose/10`, `hover:text-rose` … at any opacity picks up
        // the theme-split value. Dark resolves to the same #fb7185 as before, so
        // this is a no-op there; light gets the darker cut it needs for contrast.
        rose:         'rgb(var(--neg-rgb) / <alpha-value>)',
        muted:        '#4b5563',
        soft:         '#8b95a5',
        text:         '#e2e8f0',
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
