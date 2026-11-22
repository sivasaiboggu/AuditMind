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
          base: 'oklch(var(--bg-base) / <alpha-value>)',
          panel: 'oklch(var(--bg-panel) / <alpha-value>)',
          hover: 'oklch(var(--bg-hover) / <alpha-value>)',
        },
        // Subtle tint used for translucent surfaces and hairline borders:
        // white in dark mode, dark slate in light mode.
        overlay: 'oklch(var(--overlay) / <alpha-value>)',
        // One accent, a theme token: teal-700 on paper, teal-400 on ink.
        // The indigo/violet pair is gone — it read as the default
        // purple-blue SaaS accent. Risk hues are the only other colours.
        accent: {
          cyan: 'oklch(var(--accent) / <alpha-value>)',
          brand: 'oklch(var(--accent) / <alpha-value>)',
        },
        // Risk hues are per-theme OKLCH tokens (see index.css): light mode
        // uses the darker step so small badge text passes WCAG AA on white;
        // dark mode keeps the bright step. Chart fills in dashboard.tsx
        // keep the bright hexes — fills are not text.
        risk: {
          critical: 'oklch(var(--risk-critical) / <alpha-value>)',
          high: 'oklch(var(--risk-high) / <alpha-value>)',
          medium: 'oklch(var(--risk-medium) / <alpha-value>)',
          low: 'oklch(var(--risk-low) / <alpha-value>)',
        },
        text: {
          primary: 'oklch(var(--text-primary) / <alpha-value>)',
          secondary: 'oklch(var(--text-secondary) / <alpha-value>)',
          muted: 'oklch(var(--text-muted) / <alpha-value>)',
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
