export interface TenantThemeConfig {
  primaryColor: string;
  secondaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export interface TenantFeatureFlags {
  enableSms: boolean;
  enableTontine: boolean;
  enableMobileMoney: boolean;
  enableFieldAgents: boolean;
}

export interface TenantConfig {
  id: string;
  name: string;
  theme: TenantThemeConfig;
  features: TenantFeatureFlags;
}

// Default configuration for MicroFlex (Core)
export const defaultTenantConfig: TenantConfig = {
  id: "microflex",
  name: "MicroFlex",
  theme: {
    primaryColor: "hsl(210, 100%, 45%)", // A generic blue
    logoUrl: "/microflex-logo.png",
  },
  features: {
    enableSms: true,
    enableTontine: true,
    enableMobileMoney: true,
    enableFieldAgents: true,
  }
};
