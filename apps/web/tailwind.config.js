const color = (token) => ({ opacityValue }) => opacityValue === undefined || opacityValue === '1'
  ? `var(--${token})`
  : `color-mix(in srgb, var(--${token}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: { base: color('bg-base'), panel: color('bg-panel'), hover: color('bg-hover'), desk: color('bg-desk') },
        rule: color('rule'),
        control: color('control'),
        overlay: color('overlay'),
        accent: { brand: color('accent'), ink: color('on-accent') },
        risk: {
          critical: color('risk-critical'),
          high: color('risk-high'),
          medium: color('risk-medium'),
          low: color('risk-low'),
        },
        text: { primary: color('text-primary'), secondary: color('text-secondary'), muted: color('text-muted') },
      },
      fontFamily: {
        sans: ['var(--font-text)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: { inset: 'var(--shadow-1)', sheet: 'var(--shadow-2)', floating: 'var(--shadow-3)' },
      borderRadius: { DEFAULT: 'var(--radius-control)' },
    },
  },
};
