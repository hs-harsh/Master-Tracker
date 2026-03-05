/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#0d0f14',
        surface: '#161920',
        card: '#1e2330',
        border: '#2a3040',
        accent: '#f0c040',
        'accent-dim': '#c9a030',
        teal: '#2dd4bf',
        rose: '#fb7185',
        muted: '#6b7280',
        soft: '#9ca3af',
      },
    },
  },
  plugins: [],
};
