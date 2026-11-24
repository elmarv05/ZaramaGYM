import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Alias semánticos compatibles con shadcn/ui sobre tokens Kinetic Ledger/Obsidian */
        background: 'var(--color-bg-canvas)',
        foreground: 'var(--color-text-primary)',
        card: {
          DEFAULT: 'var(--color-bg-surface)',
          foreground: 'var(--color-text-primary)',
        },
        popover: {
          DEFAULT: 'var(--color-bg-elevated)',
          foreground: 'var(--color-text-primary)',
        },
        primary: {
          DEFAULT: 'var(--color-brand-primary)',
          foreground: 'var(--color-brand-text)',
        },
        secondary: {
          DEFAULT: 'var(--color-bg-canvas-subtle)',
          foreground: 'var(--color-text-primary)',
        },
        muted: {
          DEFAULT: 'var(--color-bg-canvas-subtle)',
          foreground: 'var(--color-text-muted)',
        },
        destructive: {
          DEFAULT: 'var(--color-status-danger)',
          foreground: '#ffffff',
        },
        input: 'var(--color-border-subtle)',
        ring: 'var(--color-border-focus)',
        canvas: {
          DEFAULT: 'var(--color-bg-canvas)',
          subtle: 'var(--color-bg-canvas-subtle)',
        },
        surface: {
          DEFAULT: 'var(--color-bg-surface)',
          hover: 'var(--color-bg-surface-hover)',
          active: 'var(--color-bg-surface-active)',
        },
        chrome: {
          sidebar: 'var(--color-chrome-sidebar)',
          'sidebar-surface': 'var(--color-chrome-sidebar-surface)',
          'sidebar-hover': 'var(--color-chrome-sidebar-hover)',
          'sidebar-border': 'var(--color-chrome-sidebar-border)',
          'sidebar-text': 'var(--color-chrome-sidebar-text)',
          'sidebar-secondary': 'var(--color-chrome-sidebar-text-secondary)',
          'sidebar-muted': 'var(--color-chrome-sidebar-text-muted)',
          'sidebar-active': 'var(--color-chrome-sidebar-active-bg)',
          'sidebar-active-text': 'var(--color-chrome-sidebar-active-text)',
          'sidebar-active-icon': 'var(--color-chrome-sidebar-active-icon)',
          'sidebar-active-border': 'var(--color-chrome-sidebar-active-border)',
          'sidebar-danger': 'var(--color-chrome-sidebar-danger)',
          'sidebar-danger-bg': 'var(--color-chrome-sidebar-danger-bg)',
          'sidebar-danger-border': 'var(--color-chrome-sidebar-danger-border)',
          bar: 'var(--color-chrome-bar)',
          'bar-surface': 'var(--color-chrome-bar-surface)',
          'bar-input': 'var(--color-chrome-bar-input)',
          'bar-hover': 'var(--color-chrome-bar-hover)',
          'bar-border': 'var(--color-chrome-bar-border)',
          'bar-text': 'var(--color-chrome-bar-text)',
          'bar-muted': 'var(--color-chrome-bar-text-muted)',
          'bar-accent': 'var(--color-chrome-bar-accent)',
          surface: 'var(--color-chrome-surface)',
          hover: 'var(--color-chrome-hover)',
          border: 'var(--color-chrome-border)',
        },
        elevated: {
          DEFAULT: 'var(--color-bg-elevated)',
          border: 'var(--color-border-elevated)',
        },
        brand: {
          DEFAULT: 'var(--color-brand-primary)',
          hover: 'var(--color-brand-hover)',
          text: 'var(--color-brand-text)',
        },
        accent: {
          DEFAULT: 'var(--color-bg-surface-hover)',
          foreground: 'var(--color-text-primary)',
          indigo: 'var(--color-accent-indigo)',
          sky: 'var(--color-accent-sky)',
        },
        status: {
          success: 'var(--color-status-success)',
          'success-bg': 'var(--color-status-success-bg)',
          'success-border': 'var(--color-status-success-border)',
          warning: 'var(--color-status-warning)',
          'warning-bg': 'var(--color-status-warning-bg)',
          'warning-border': 'var(--color-status-warning-border)',
          danger: 'var(--color-status-danger)',
          'danger-hover': 'var(--color-status-danger-hover)',
          'danger-bg': 'var(--color-status-danger-bg)',
          'danger-border': 'var(--color-status-danger-border)',
          info: 'var(--color-status-info)',
          'info-bg': 'var(--color-status-info-bg)',
          'info-border': 'var(--color-status-info-border)',
        },
        txt: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
        },
        border: {
          DEFAULT: 'var(--color-border-subtle)',
          elevated: 'var(--color-border-elevated)',
          strong: 'var(--color-border-strong)',
          focus: 'var(--color-border-focus)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
      },
      boxShadow: {
        '2xs': 'var(--shadow-2xs)',
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
