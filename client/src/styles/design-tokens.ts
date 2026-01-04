/**
 * Design Tokens - COFIN Platform
 * Mobile-first design system with consistent spacing, colors, and sizes
 */

export const designTokens = {
  // ============================================
  // COLORS
  // ============================================
  colors: {
    // Primary colors (Cyan/Blue)
    primary: {
      50: '#ecfeff',
      100: '#cffafe',
      400: '#22d3ee',  // text-cyan-400
      500: '#06b6d4',  // bg-cyan-500
      600: '#0891b2',
      700: '#0e7490',
    },

    // Secondary colors (Blue)
    secondary: {
      400: '#60a5fa',  // text-blue-400
      500: '#3b82f6',  // bg-blue-500
      600: '#2563eb',
      700: '#1d4ed8',
    },

    // Success colors (Emerald/Green)
    success: {
      400: '#34d399',  // text-emerald-400
      500: '#10b981',  // bg-emerald-500
      600: '#059669',
      700: '#047857',
    },

    // Warning colors (Amber)
    warning: {
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
    },

    // Error/Danger colors (Red)
    danger: {
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
    },

    // Neutral colors (Slate)
    neutral: {
      100: '#f1f5f9',
      300: '#cbd5e1',
      400: '#94a3b8',  // text-slate-400
      600: '#475569',
      700: '#334155',  // border-slate-700
      800: '#1e293b',  // bg-slate-800
      900: '#0f172a',  // bg-slate-900
    },
  },

  // ============================================
  // SPACING (Mobile-first scale)
  // ============================================
  spacing: {
    // Base spacing scale (rem units)
    xs: '0.5rem',   // 8px
    sm: '0.75rem',  // 12px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
    '2xl': '3rem',  // 48px
    '3xl': '4rem',  // 64px

    // Specific use cases
    cardPadding: {
      mobile: '1rem',      // p-4
      desktop: '1.5rem',   // sm:p-6
    },
    buttonPadding: {
      sm: '0.5rem 0.75rem',    // px-3 py-2
      md: '0.625rem 1rem',     // px-4 py-2.5
      lg: '0.75rem 1.5rem',    // px-6 py-3
    },
    gap: {
      sm: '0.5rem',   // gap-2
      md: '1rem',     // gap-4
      lg: '1.5rem',   // gap-6
    },
  },

  // ============================================
  // BORDER RADIUS (Standardized)
  // ============================================
  borderRadius: {
    sm: '0.375rem',   // rounded-md
    md: '0.5rem',     // rounded-lg - DEFAULT for cards
    lg: '0.75rem',    // rounded-xl
    full: '9999px',   // rounded-full - for icon buttons
  },

  // ============================================
  // SHADOWS (Elevation system)
  // ============================================
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',

    // Colored shadows for buttons
    primary: '0 10px 15px -3px rgb(6 182 212 / 0.2)',    // cyan-500/20
    success: '0 10px 15px -3px rgb(16 185 129 / 0.2)',   // emerald-500/20
    danger: '0 10px 15px -3px rgb(239 68 68 / 0.2)',     // red-500/20
  },

  // ============================================
  // TYPOGRAPHY
  // ============================================
  typography: {
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // ============================================
  // TRANSITIONS
  // ============================================
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // ============================================
  // BREAKPOINTS (Mobile-first)
  // ============================================
  breakpoints: {
    sm: '640px',   // Small devices (phones in landscape)
    md: '768px',   // Medium devices (tablets)
    lg: '1024px',  // Large devices (laptops)
    xl: '1280px',  // Extra large devices (desktops)
    '2xl': '1536px', // 2X large devices
  },

  // ============================================
  // Z-INDEX LAYERS
  // ============================================
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
  },
} as const;

// Export individual token groups for easier imports
export const colors = designTokens.colors;
export const spacing = designTokens.spacing;
export const borderRadius = designTokens.borderRadius;
export const shadows = designTokens.shadows;
export const typography = designTokens.typography;
export const transitions = designTokens.transitions;
export const breakpoints = designTokens.breakpoints;
export const zIndex = designTokens.zIndex;

// Type exports for TypeScript
export type ColorShade = keyof typeof colors.primary;
export type SpacingSize = keyof typeof spacing;
export type BorderRadiusSize = keyof typeof borderRadius;
