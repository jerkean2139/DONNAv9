/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral command-surface palette; brand tokens land in Phase 10 UX.
        surface: '#0b0e14',
        panel: '#141a24',
        edge: '#232b39',
        ink: '#e6edf3',
        muted: '#8b98a9',
        accent: '#5b8def',
      },
    },
  },
  plugins: [],
};
