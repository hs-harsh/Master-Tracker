/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body:    ['"Inter"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink:          '#09090e',       // near-void background — deeper than before
        surface:      '#0f1117',       // one step above ink
        card:         '#13161f',       // cards barely lifted off surface
        border:       '#1c2033',       // subtle borders
        accent:       '#f0c040',
        'accent-dim': '#c9a030',
        teal:         '#2dd4bf',
        rose:         '#fb7185',
        muted:        '#4b5563',
        soft:         '#8b95a5',
        text:         '#e2e8f0',
      },
      boxShadow: {
        'glow-gold':  '0 0 24px rgba(240, 192, 64, 0.18)',
        'glow-teal':  '0 0 20px rgba(45, 212, 191, 0.15)',
        'glow-rose':  '0 0 20px rgba(251, 113, 133, 0.15)',
        'card':       '0 4px 32px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 48px rgba(0, 0, 0, 0.6)',
      },
      backgroundImage: {
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
        'hero-gradient': 'linear-gradient(135deg, rgba(240,192,64,0.06) 0%, rgba(240,192,64,0) 60%)',
      },
    },
  },
  plugins: [],
};
