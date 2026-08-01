/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      colors: {
        /* ─── Structural planes ─────────────────────────────────────────────
         * Every plane is a CSS custom property, so switching theme retints the
         * whole application without a single component knowing a theme exists.
         * Tokens are assigned by ROLE, not by luminance: `ink-950` is always the
         * page, `ink-800` always the card surface and `ink-850` always the
         * recessed inset — which is why dark and light can order their actual
         * luminance differently and both read correctly.
         * ─────────────────────────────────────────────────────────────────── */
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          650: 'rgb(var(--ink-650) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        /* Foreground ink */
        fg: {
          DEFAULT: 'rgb(var(--fg-default) / <alpha-value>)',
          soft: 'rgb(var(--fg-soft) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          dim: 'rgb(var(--fg-dim) / <alpha-value>)',
          faint: 'rgb(var(--fg-faint) / <alpha-value>)',
        },
        /**
         * Translucent wash used for hover states, insets and chips. White on a
         * dark surface, near-black on a light one — so `bg-overlay/[0.06]` is a
         * subtle lift in dark mode and a subtle recess in light mode, with no
         * per-component conditionals anywhere.
         */
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        /** Hairline borders, rings and dividers. Tuned separately from fills. */
        line: 'rgb(var(--line) / <alpha-value>)',
        /**
         * Backdrop behind modals, drawers and the command palette. Always darker
         * than the page in both themes — a white scrim over a white page would
         * not read as "the surface behind is inactive".
         */
        scrim: 'rgb(var(--scrim) / <alpha-value>)',
        /* Brand accent — UI chrome (buttons, links, focus). Not a series color. */
        brand: {
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        /* Status palette — reserved, never reused as a series color. Deliberately
         * NOT themed: these four steps are the fixed vocabulary of condition, and
         * shifting them per theme would break the icon+label pairing they rely on. */
        status: {
          good: '#0CA30C',
          warning: '#FAB219',
          serious: '#EC835A',
          critical: '#D03B3B',
        },
        grid: 'var(--gridline)',
        hairline: 'var(--line-solid)',
      },
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '6.5': '1.625rem',
        '7.5': '1.875rem',
        '8.5': '2.125rem',
        '9.5': '2.375rem',
        '10.5': '2.625rem',
        '11.5': '2.875rem',
        13: '3.25rem',
        15: '3.75rem',
        17: '4.25rem',
        18: '4.5rem',
        68: '17rem',
        76: '19rem',
        88: '22rem',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      /* Elevation is theme-specific: dark mode leans on deep shadow to separate
       * planes, light mode on soft diffusion plus a hairline. Both are declared
       * as variables so a card never carries the wrong elevation language. */
      boxShadow: {
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
        glow: 'var(--shadow-glow)',
        'glow-sm': 'var(--shadow-glow-sm)',
      },
      backgroundImage: {
        'grid-fine':
          'linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)',
        'radial-brand': 'radial-gradient(ellipse 80% 60% at 50% 0%, var(--brand-wash), transparent 70%)',
        'panel-sheen': 'var(--panel-sheen)',
      },
      backgroundSize: {
        'grid-fine': '44px 44px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        'sweep-y': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        /* Branding screen: the mark settles in, the wordmark follows. */
        'brand-in': {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'brand-sheen': {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '100%': { transform: 'translateX(220%) skewX(-18deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'rise-in': 'rise-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.8s infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24,0,0.38,1) infinite',
        'sweep-y': 'sweep-y 3.2s linear infinite',
        'spin-slow': 'spin-slow 9s linear infinite',
        'brand-in': 'brand-in 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'brand-sheen': 'brand-sheen 1.6s cubic-bezier(0.4,0,0.2,1) 0.25s both',
      },
      transitionTimingFunction: {
        enterprise: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
