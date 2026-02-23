import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface CompanyInfo {
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
}

export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  theme: string;
  fontFamily: string;
  borderRadius: string;
  companyInfo?: CompanyInfo | null;
}

const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'COFIN&CO-M',
  logoUrl: null,
  primaryColor: '#0f766e',
  accentColor: '#c2410c',
  theme: 'DARK',
  fontFamily: 'Inter',
  borderRadius: 'lg',
};

interface BrandingContextType {
  branding: BrandingConfig;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

/**
 * Compute a derived color (lighter or darker) for hover states.
 * Shifts the lightness of an HSL color.
 */
function adjustColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const nr = clamp(r + amount);
  const ng = clamp(g + amount);
  const nb = clamp(b + amount);

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Inject branding colors as CSS custom properties so that
 * Tailwind tokens (bg-accent-primary, etc.) adapt dynamically.
 */
function injectBrandingCssVars(branding: BrandingConfig) {
  const root = document.documentElement;

  // Only inject accent colors if they differ from defaults
  // (the CSS file already defines good defaults)
  if (branding.primaryColor) {
    // Determine if we're in dark or light mode
    const isDark = root.classList.contains('dark');

    if (isDark) {
      // In dark mode, accent-primary should be a bright/vivid version
      root.style.setProperty('--accent-primary', branding.primaryColor);
      root.style.setProperty('--accent-primary-hover', adjustColor(branding.primaryColor, 30));
    } else {
      // In light mode, accent-primary should be a darker version for contrast
      root.style.setProperty('--accent-primary', branding.primaryColor);
      root.style.setProperty('--accent-primary-hover', adjustColor(branding.primaryColor, -20));
    }
  }

  if (branding.accentColor) {
    const isDark = root.classList.contains('dark');
    if (isDark) {
      root.style.setProperty('--accent-secondary', branding.accentColor);
      root.style.setProperty('--accent-secondary-hover', adjustColor(branding.accentColor, 30));
    } else {
      root.style.setProperty('--accent-secondary', branding.accentColor);
      root.style.setProperty('--accent-secondary-hover', adjustColor(branding.accentColor, -20));
    }
  }

  // Update document title and PWA meta tags
  if (branding.appName) {
    document.title = branding.appName;

    // Update apple-mobile-web-app-title meta tag
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute('content', branding.appName);
    }

    // Update application-name meta tag
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) {
      appNameMeta.setAttribute('content', branding.appName);
    }
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch('/api/branding');
      if (res.ok) {
        const config: BrandingConfig = await res.json();
        setBranding(config);
        injectBrandingCssVars(config);
      }
    } catch {
      // Keep defaults on failure
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Re-inject CSS vars when theme class changes (dark ↔ light)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      injectBrandingCssVars(branding);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [branding]);

  // Listen for WebSocket BRANDING_CHANGED events (hot reload)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'BRANDING_CHANGED' && detail.payload) {
        const config = detail.payload as BrandingConfig;
        setBranding(config);
        injectBrandingCssVars(config);
      }
      // Also react to general SETTINGS_UPDATE
      if (detail?.type === 'SETTINGS_UPDATE') {
        fetchBranding();
      }
    };

    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [fetchBranding]);

  return (
    <BrandingContext.Provider value={{ branding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within BrandingProvider');
  }
  return context;
}
