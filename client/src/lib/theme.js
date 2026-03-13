const ACCENT_VALUES = {
  gold:   '#f0c040',
  teal:   '#2dd4bf',
  blue:   '#60a5fa',
  purple: '#a78bfa',
  rose:   '#fb7185',
};

export function applyTheme(mode, accent = 'gold') {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
  root.setAttribute('data-accent', accent || 'gold');
  root.style.setProperty('--accent', ACCENT_VALUES[accent] ?? ACCENT_VALUES.gold);
}
