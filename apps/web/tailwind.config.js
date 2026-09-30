/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // "Daily briefing" palette: warm ink paper, cream type, one ember accent.
      colors: {
        surface: '#0e0d0b',
        panel: '#161411',
        raised: '#1f1c18',
        edge: '#2c2823',
        ink: '#efe8dc',
        muted: '#a39a8c',
        faint: '#6d665c',
        accent: '#ff5b2e',
        success: '#a3d977',
        warning: '#f4b740',
        danger: '#ff6b5b',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        rise: 'rise 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
