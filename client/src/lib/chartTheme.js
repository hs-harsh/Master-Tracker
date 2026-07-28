/**
 * chartTheme — the one definition of recharts chart *chrome* for the whole app.
 *
 * Before this module there were three mutually incompatible `TT` constants and
 * 23 inline `contentStyle` objects, every one of them hardcoding a dark
 * background. That made chart tooltips unreadable in light theme. Everything
 * chrome-shaped now comes from here:
 *
 *   TT     tooltip props bundle  →  <Tooltip {...TT} />
 *   AX     axis props bundle     →  <XAxis {...AX} /> / <YAxis {...AX} />
 *   GRID   grid props bundle     →  <CartesianGrid {...GRID} />
 *   SERIES categorical palette   →  SERIES[i % SERIES.length]
 *
 * ── Chrome vs data ──────────────────────────────────────────────────────────
 * Chrome (tooltips, axes, grid, generic series) belongs here and follows the
 * theme and the accent picker. Colours that carry *identity* — asset class,
 * risk band, person, broker, gold-the-metal, support/resistance — stay in their
 * own per-page maps. Making those follow the accent picker would be wrong.
 *
 * ── Why values are resolved rather than passed through as var() ─────────────
 * Recharts forwards most colours to SVG presentation attributes, where `var()`
 * would resolve on its own — but not all of them (cursor rects, some computed
 * fills), and a half-var/half-hex codebase is exactly the inconsistency this
 * phase removes. So we resolve the tokens off the *root* element with
 * getComputedStyle. Per-element colour computation is unreliable here;
 * documentElement is not.
 *
 * ── Reactivity ──────────────────────────────────────────────────────────────
 * Resolved values must NOT be cached at module load: applyTheme() flips
 * `data-theme` / `data-accent` / the inline --accent vars on <html> at runtime.
 * A MutationObserver invalidates the snapshot, and the exported bundles are
 * getter-backed, so a spread at render time always reads current values.
 * `useChartTheme()` (called once in App) forces the tree to re-render when the
 * theme flips so charts on screen repaint without navigation.
 */

import { useSyncExternalStore } from 'react';

/* Fallbacks mirror the dark (:root) block of index.css. They only matter if a
   token is ever removed from the stylesheet — keep them in sync. */
const FALLBACK = {
  '--grid-rgb':       '30 41 59',
  '--axis-rgb':       '71 85 105',
  '--hairline-rgb':   '255 255 255',
  '--accent':         '#f0c040',
  '--pos-rgb':        '52 211 153',
  '--neg-rgb':        '251 113 133',
  '--tooltip-bg':     '#0f1117',
  '--tooltip-border': 'rgba(255,255,255,0.08)',
  '--tooltip-radius': '12px',
  '--tooltip-shadow': '0 8px 32px rgba(0,0,0,0.6)',
  '--tooltip-fg':     '#e2e8f0',
  '--tooltip-muted':  '#8b95a5',
  '--series-1': '#60a5fa',
  '--series-2': '#34d399',
  '--series-3': '#fbbf24',
  '--series-4': '#a78bfa',
  '--series-5': '#fb7185',
  '--series-6': '#22d3ee',
  '--series-7': '#fb923c',
  '--series-8': '#94a3b8',
  '--hue-gold-rgb':    '202 138 4',
  '--hue-amber-rgb':   '251 191 36',
  '--hue-orange-rgb':  '249 115 22',
  '--hue-emerald-rgb': '52 211 153',
  '--hue-green-rgb':   '74 222 128',
  '--hue-teal-rgb':    '45 212 191',
  '--hue-blue-rgb':    '96 165 250',
  '--hue-violet-rgb':  '167 139 250',
  '--hue-purple-rgb':  '232 121 249',
  '--hue-rose-rgb':    '251 113 133',
  '--hue-pink-rgb':    '236 72 153',
  '--hue-slate-rgb':   '148 163 184',
};

/** The identity hues, in the order they read as a palette. */
const HUE_NAMES = [
  'gold', 'amber', 'orange', 'emerald', 'green', 'teal',
  'blue', 'violet', 'purple', 'rose', 'pink', 'slate',
];

function compute() {
  const cs = typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement)
    : null;
  const v = (name) => {
    const raw = cs ? cs.getPropertyValue(name).trim() : '';
    return raw || FALLBACK[name];
  };

  const grid = `rgb(${v('--grid-rgb')})`;
  const axis = `rgb(${v('--axis-rgb')})`;
  const fg   = v('--tooltip-fg');

  return {
    grid,
    axis,
    accent:   v('--accent'),
    // Accent as a *foreground* — strokes and text on the page background. On
    // light this is a darker cut; `accent` stays correct for fills and tints.
    accentInk: v('--accent-ink'),
    pos:      `rgb(${v('--pos-rgb')})`,
    neg:      `rgb(${v('--neg-rgb')})`,
    hairline: (alpha = 0.12) => `rgb(${v('--hairline-rgb')} / ${alpha})`,

    axisTick: { fill: axis, fontSize: 11 },

    contentStyle: {
      background:   v('--tooltip-bg'),
      border:       `1px solid ${v('--tooltip-border')}`,
      borderRadius: v('--tooltip-radius'),
      boxShadow:    v('--tooltip-shadow'),
      color:        fg,
      fontSize:     12,
      padding:      '8px 12px',
      // Mobile: a long series name must wrap inside the chart rather than push
      // the tooltip off the right edge at 375px.
      maxWidth:     'min(72vw, 320px)',
      whiteSpace:   'normal',
    },
    labelStyle: { color: v('--tooltip-muted'), marginBottom: 4, fontWeight: 600 },
    // No `color` here on purpose. Recharts builds each row as
    // `{ color: entry.color, ...itemStyle }`, so setting it would flatten every
    // series to one grey and break the colour-coding the built-in tooltips had
    // before this module existed — and would split their behaviour from the
    // custom tooltip components, which colour rows by series.
    itemStyle:  { padding: 0 },
    // For custom tooltips that need the plain value colour explicitly.
    valueColor: fg,
    // Recharts' default cursor is a hardcoded light grey — invisible-adjacent
    // on light, a bright slab on dark. Derive it from the axis token instead.
    cursor:       { fill: `rgb(${v('--axis-rgb')} / 0.12)`, stroke: grid },
    wrapperStyle: { outline: 'none', zIndex: 30 },

    series: [
      v('--series-1'), v('--series-2'), v('--series-3'), v('--series-4'),
      v('--series-5'), v('--series-6'), v('--series-7'), v('--series-8'),
    ],

    hues: Object.fromEntries(
      HUE_NAMES.map(n => [n, `rgb(${v(`--hue-${n}-rgb`)})`]),
    ),
  };
}

let snapshot = null;
let version = 0;
const listeners = new Set();

function theme() {
  if (!snapshot) snapshot = compute();
  return snapshot;
}

function invalidate() {
  snapshot = null;
  version += 1;
  listeners.forEach(fn => fn());
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  // `style` is in the list because applyTheme() sets --accent inline on <html>.
  new MutationObserver(invalidate).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-accent', 'style', 'class'],
  });
}

/** Tooltip props bundle. `<Tooltip {...TT} />`, or `style={TT.contentStyle}`
 *  inside a custom tooltip component so it matches the built-in ones. */
export const TT = {
  get contentStyle() { return theme().contentStyle; },
  get labelStyle()   { return theme().labelStyle; },
  get itemStyle()    { return theme().itemStyle; },
  /** Plain value colour, for custom tooltips rendering their own rows. */
  get valueColor()   { return theme().valueColor; },
  get cursor()       { return theme().cursor; },
  get wrapperStyle() { return theme().wrapperStyle; },
};

/** Axis props bundle. Override a single field inline where a dense chart needs
 *  it: `<XAxis {...AX} tick={{ ...AX.tick, fontSize: 9 }} />`. */
export const AX = {
  get tick() { return theme().axisTick; },
  tickLine: false,
  axisLine: false,
};

/** Grid props bundle. Pass `vertical` explicitly to override. */
export const GRID = {
  get stroke() { return theme().grid; },
  strokeDasharray: '3 3',
  vertical: false,
};

/** Categorical palette for charts with no meaningful per-entity colours.
 *  A Proxy so index access, `.length` and `.map` all read the live snapshot. */
export const SERIES = new Proxy([], {
  get: (_t, prop) => Reflect.get(theme().series, prop),
});

/**
 * Identity hues — the counterpart to SERIES.
 *
 * SERIES is chrome: charts whose colours mean nothing, free to follow the
 * accent picker. HUE is for colours that carry identity — a person, a broker,
 * an asset class, a spend category. Those must NOT follow the accent picker
 * (your broker doesn't change colour because you like purple), but they do
 * need a light-theme cut: the 400-level literals these maps used to hardcode
 * measured 1.71–2.69:1 on the light tooltip's white background.
 *
 * `HUE.teal` → the current theme's teal. Hue identity is stable across themes;
 * only the lightness moves.
 */
export const HUE = new Proxy({}, {
  get: (_t, name) => theme().hues[name],
  has: (_t, name) => name in theme().hues,
  ownKeys: () => Reflect.ownKeys(theme().hues),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/**
 * Build a theme-reactive identity palette from hue *names*.
 *
 *   const ASSET_COLORS  = identityPalette({ Equity: 'orange', Debt: 'blue' });
 *   const BROKER_COLORS = identityPalette(['teal', 'gold', 'blue']);
 *
 * Returns a live view, not a snapshot — the same trick SERIES uses. These maps
 * are module-level consts evaluated once at import, so resolving the colours
 * eagerly would freeze them to whichever theme happened to be active on first
 * paint and never repaint on a theme flip. Reading through the proxy means
 * `ASSET_COLORS.Equity` and `Object.values(ASSET_COLORS)` both hit the current
 * theme at render time.
 *
 * Arrays stay arrays (index, .length, .map all work); objects stay objects
 * (Object.keys/values/entries all work).
 */
export function identityPalette(spec) {
  const isArr = Array.isArray(spec);
  const resolve = () => {
    const h = theme().hues;
    return isArr
      ? spec.map(name => h[name])
      : Object.fromEntries(Object.entries(spec).map(([k, name]) => [k, h[name]]));
  };
  return new Proxy(isArr ? [] : {}, {
    get: (_t, prop) => Reflect.get(resolve(), prop),
    has: (_t, prop) => Reflect.has(resolve(), prop),
    ownKeys: () => Reflect.ownKeys(resolve()),
    // Must report configurable:true — the proxy target is empty, and the
    // invariant check would otherwise reject describing a property it lacks.
    getOwnPropertyDescriptor: (_t, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      return d && { ...d, configurable: true };
    },
  });
}

/** Individual chrome colours, for the odd ReferenceLine or legend swatch. */
export const CHROME = {
  get grid()   { return theme().grid; },
  get axis()   { return theme().axis; },
  get accent()    { return theme().accent; },
  get accentInk() { return theme().accentInk; },
  get pos()    { return theme().pos; },
  get neg()    { return theme().neg; },
  hairline: (alpha) => theme().hairline(alpha),
};

/**
 * Subscribe the React tree to theme/accent changes. Called once in App() —
 * that re-renders every route, so charts anywhere repaint on a theme flip
 * without needing to navigate. Returns the resolved snapshot for callers that
 * want the raw colours.
 */
export function useChartTheme() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => version,
    () => version,
  );
  return theme();
}
