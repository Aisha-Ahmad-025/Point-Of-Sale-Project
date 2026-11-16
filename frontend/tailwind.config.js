const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), raised: v('raised'), line: v('line'), ink: v('ink'), muted: v('muted'),
        brand: v('brand'), 'brand-deep': v('brand-deep'), forest: v('forest'), 'forest-2': v('forest-2'), accent: v('accent'), danger: v('danger'), warn: v('warn'), ok: v('ok'), info: v('info'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgb(var(--shadow) / .05), 0 8px 24px -12px rgb(var(--shadow) / .12)', lift: '0 2px 4px rgb(var(--shadow) / .06), 0 16px 32px -14px rgb(var(--shadow) / .28)', pop: '0 24px 60px -12px rgb(var(--shadow) / .4)', glow: '0 8px 24px -8px rgb(130 210 70 / .65)' },
    },
  },
  plugins: [],
};
