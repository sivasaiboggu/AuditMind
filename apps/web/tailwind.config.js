/** @type {import('tailwindcss').Config} */
export default {
  // Class-based dark mode so the theme can be toggled at runtime and
  // persisted; `.dark` on <html> activates the dark token set in index.css.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme tokens resolve to CSS variables defined in index.css.
        // `background` / `text` / `overlay` / `accent` switch between the
        // light and dark token sets; risk hues are identical in both.
        background: {
          base: 'rgb(var(--bg-base) / <alpha-value>)',
          panel: 'rgb(var(--bg-panel) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        },
        // Subtle tint used for translucent surfaces and hairline borders:
        // white in dark mode, dark slate in light mode.
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        // One accent, a theme token: teal-700 on paper, teal-400 on ink.
        // The indigo/violet pair is gone — it read as the default
        // purple-blue SaaS accent. Risk hues are the only other colours.
        accent: {
          cyan: 'rgb(var(--accent) / <alpha-value>)',
          brand: 'rgb(var(--accent) / <alpha-value>)',
        },
        risk: {
          critical: '#EF4444',
          high: '#F97316',
          medium: '#EAB308',
          low: '#10B981',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        // One superfamily (see docs/design-references-1.0.6.md): IBM Plex
        // Sans for everything sans, IBM Plex Mono for labels, IDs, scores
        // and shortcuts. Inter / JetBrains Mono are out.
        sans: [
          'IBM Plex Sans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
