// Accent definitions. `hex` stays for the two call sites that read var(--accent)
// directly; `rgb` is the space-separated triplet Tailwind's
// rgb(var(--accent-rgb) / <alpha-value>) tokens compile against.
//
// These are the JS-side mirror of the [data-accent="…"] declarations in
// index.css. Both are needed: the CSS block covers the first paint (before this
// module runs) and any accent applied purely via the data attribute, while this
// sets the vars inline when the user switches accent at runtime. Keep them in
// sync — if you add an accent, add it in both places.
const ACCENTS = {
  gold:   { hex: '#f0c040', rgb: '240 192 64',  dim: '201 160 48'  },
  teal:   { hex: '#2dd4bf', rgb: '45 212 191',  dim: '20 184 166'  },
  blue:   { hex: '#60a5fa', rgb: '96 165 250',  dim: '59 130 246'  },
  purple: { hex: '#a78bfa', rgb: '167 139 250', dim: '139 92 246'  },
  rose:   { hex: '#fb7185', rgb: '251 113 133', dim: '244 63 94'   },
};

export function applyTheme(mode, accent = 'gold') {
  const root = document.documentElement;
  const a = ACCENTS[accent] ?? ACCENTS.gold;

  root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
  root.setAttribute('data-accent', accent || 'gold');

  root.style.setProperty('--accent', a.hex);
  root.style.setProperty('--accent-rgb', a.rgb);
  root.style.setProperty('--accent-dim-rgb', a.dim);
}
