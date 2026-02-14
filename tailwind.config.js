/** @type {import('tailwindcss').Config} */
export default {
  // ========== CONTENT PATHS FOR CSS PURGING ==========
  // Tailwind scans these files to determine which classes to include
  // This reduces CSS bundle size by ~50-70%
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Include shared types that might contain class names
    '../shared/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  // ========== FUTURE FLAGS FOR SMALLER OUTPUT ==========
  future: {
    hoverOnlyWhenSupported: true, // Reduces hover state CSS on touch devices
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Theme-aware colors using CSS variables
      colors: {
        // Surface/Background colors
        surface: {
          base: 'var(--bg-base)',
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          muted: 'var(--bg-muted)',
          subtle: 'var(--bg-subtle)',
        },
        // Text colors
        content: {
          DEFAULT: 'var(--text-primary)',
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverted: 'var(--text-inverted)',
        },
        // Border colors
        edge: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        // Accent/Brand colors
        accent: {
          DEFAULT: 'var(--accent-primary)',
          primary: 'var(--accent-primary)',
          'primary-hover': 'var(--accent-primary-hover)',
          secondary: 'var(--accent-secondary)',
          'secondary-hover': 'var(--accent-secondary-hover)',
        },
        // Semantic status colors
        status: {
          success: 'var(--color-success)',
          'success-bg': 'var(--color-success-bg)',
          'success-text': 'var(--color-success-text)',
          warning: 'var(--color-warning)',
          'warning-bg': 'var(--color-warning-bg)',
          'warning-text': 'var(--color-warning-text)',
          danger: 'var(--color-danger)',
          'danger-bg': 'var(--color-danger-bg)',
          'danger-text': 'var(--color-danger-text)',
          info: 'var(--color-info)',
          'info-bg': 'var(--color-info-bg)',
          'info-text': 'var(--color-info-text)',
        },
        // Sidebar specific
        sidebar: {
          bg: 'var(--sidebar-bg)',
          border: 'var(--sidebar-border)',
          hover: 'var(--sidebar-item-hover)',
          active: 'var(--sidebar-item-active)',
          text: 'var(--sidebar-text)',
          'text-active': 'var(--sidebar-text-active)',
        },
        // Input specific
        input: {
          bg: 'var(--input-bg)',
          border: 'var(--input-border)',
          focus: 'var(--input-focus)',
          text: 'var(--input-text)',
          placeholder: 'var(--input-placeholder)',
        },
        // Card specific
        card: {
          border: 'var(--card-border)',
        },
        // Header specific
        header: {
          bg: 'var(--header-bg)',
          border: 'var(--header-border)',
          text: 'var(--header-text)',
          icon: 'var(--header-icon)',
          'icon-hover': 'var(--header-icon-hover)',
        },
        // Button colors - consistent across light/dark themes
        btn: {
          success: 'var(--btn-success)',
          'success-hover': 'var(--btn-success-hover)',
          danger: 'var(--btn-danger)',
          'danger-hover': 'var(--btn-danger-hover)',
          warning: 'var(--btn-warning)',
          'warning-hover': 'var(--btn-warning-hover)',
          info: 'var(--btn-info)',
          'info-hover': 'var(--btn-info-hover)',
        },
        // Brand/Logo colors - fixed across themes
        brand: {
          navy: 'var(--brand-navy)',
          green: 'var(--brand-green)',
          amber: 'var(--brand-amber)',
          teal: 'var(--brand-teal)',
        },
      },
      // Theme-aware shadows
      boxShadow: {
        'theme-sm': 'var(--shadow-sm)',
        'theme-md': 'var(--shadow-md)',
        'theme-lg': 'var(--shadow-lg)',
        'theme-glow': 'var(--shadow-glow)',
        'card': 'var(--card-shadow)',
        'glow': '0 0 20px rgba(59, 130, 246, 0.5)',
        'glow-lg': '0 0 40px rgba(59, 130, 246, 0.6)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
