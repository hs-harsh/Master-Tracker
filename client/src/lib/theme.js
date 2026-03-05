export function applyTheme(mode, accent = 'gold') {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
  root.setAttribute('data-accent', accent || 'gold');
}
