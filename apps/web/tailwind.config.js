/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b0e14',
        panel: '#121826',
        raised: '#182033',
        edge: '#222b3d',
        ink: '#e8edf5',
        muted: '#8b98a9',
        faint: '#5d6878',
        accent: '#6d9bff',
        'accent-strong': '#4f7ff0',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
