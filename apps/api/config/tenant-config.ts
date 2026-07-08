import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  defaultTenantConfig,
  tenantConfigSchema,
  type TenantConfig,
  type TenantFeatureFlags,
} from "@shared/tenant-config";

type TenantEnvironment = NodeJS.ProcessEnv;

const FEATURE_ENV_KEYS: Record<keyof TenantFeatureFlags, string> = {
  enableSms: "TENANT_FEATURE_SMS",
  enableTontine: "TENANT_FEATURE_TONTINE",
  enableMobileMoney: "TENANT_FEATURE_MOBILE_MONEY",
  enableFieldAgents: "TENANT_FEATURE_FIELD_AGENTS",
};

function parseBoolean(value: string | undefined, fallback: boolean, key: string): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} doit valoir true ou false`);
}

function loadFileConfig(path: string | undefined): TenantConfig {
  if (!path) return defaultTenantConfig;

  const absolutePath = resolve(process.cwd(), path);
  const parsed: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
  return tenantConfigSchema.parse(parsed);
}

export function loadTenantConfig(env: TenantEnvironment = process.env): TenantConfig {
  const fileConfig = loadFileConfig(env.TENANT_CONFIG_PATH);
  const features = Object.fromEntries(
    Object.entries(FEATURE_ENV_KEYS).map(([feature, envKey]) => [
      feature,
      parseBoolean(env[envKey], fileConfig.features[feature as keyof TenantFeatureFlags], envKey),
    ]),
  ) as TenantFeatureFlags;

  return tenantConfigSchema.parse({
    ...fileConfig,
    id: env.TENANT_ID || fileConfig.id,
    name: env.TENANT_NAME || fileConfig.name,
    theme: {
      ...fileConfig.theme,
      primaryColor: env.TENANT_PRIMARY_COLOR || fileConfig.theme.primaryColor,
      secondaryColor: env.TENANT_SECONDARY_COLOR || fileConfig.theme.secondaryColor,
      logoUrl: env.TENANT_LOGO_URL || fileConfig.theme.logoUrl,
      faviconUrl: env.TENANT_FAVICON_URL || fileConfig.theme.faviconUrl,
    },
    features,
  });
}

let cachedConfig: TenantConfig | undefined;

export function getTenantConfig(): TenantConfig {
  cachedConfig ??= Object.freeze(loadTenantConfig());
  return cachedConfig;
}

export function resetTenantConfigCacheForTests(): void {
  cachedConfig = undefined;
}
