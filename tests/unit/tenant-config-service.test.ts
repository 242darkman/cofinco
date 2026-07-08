import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeBranding,
  getEffectiveTenantConfig,
  resetTenantBrandingCacheForTests,
} from "../../apps/api/services/tenant-config-service";
import { resetTenantFeatureCacheForTests } from "../../apps/api/services/tenant-feature-service";
import {
  applyBrandingOverrides,
  defaultTenantConfig,
  isTenantBrandingKey,
  tenantBrandingKeys,
} from "../../packages/shared/tenant-config";

let mockRows: Array<{ key: string; value: string; feature?: string; enabled?: boolean }> = [];
let shouldFail = false;

vi.mock("../../apps/api/db", () => ({
  db: {
    select: () => ({
      from: async (table: { key?: unknown }) => {
        if (shouldFail) throw new Error("base indisponible");
        // Différencie branding (colonne key) et feature flags (colonne feature)
        return "key" in table ? mockRows : [];
      },
    }),
  },
}));

beforeEach(() => {
  resetTenantBrandingCacheForTests();
  resetTenantFeatureCacheForTests();
  mockRows = [];
  shouldFail = false;
});

describe("clés de branding", () => {
  it("reconnaît les clés connues, rejette les inconnues et exclut l'id", () => {
    for (const key of tenantBrandingKeys) {
      expect(isTenantBrandingKey(key)).toBe(true);
    }
    expect(isTenantBrandingKey("id")).toBe(false);
    expect(isTenantBrandingKey("inconnu")).toBe(false);
  });
});

describe("application des surcharges de branding", () => {
  it("surcharge nom et couleur sans muter la configuration statique", () => {
    const result = applyBrandingOverrides(defaultTenantConfig, [
      { key: "name", value: "Banque Nationale" },
      { key: "primaryColor", value: "hsl(0, 80%, 40%)" },
    ]);

    expect(result.name).toBe("Banque Nationale");
    expect(result.theme.primaryColor).toBe("hsl(0, 80%, 40%)");
    expect(defaultTenantConfig.name).toBe("MicroFlex");
    expect(result.id).toBe(defaultTenantConfig.id);
  });

  it("ignore les clés inconnues et les valeurs invalides", () => {
    const result = applyBrandingOverrides(defaultTenantConfig, [
      { key: "id", value: "autre-tenant" },
      { key: "name", value: "" },
    ]);

    expect(result).toEqual(defaultTenantConfig);
  });
});

describe("configuration tenant effective", () => {
  it("fusionne les surcharges de branding depuis la base", async () => {
    mockRows = [{ key: "logoUrl", value: "/logos/client-a.png" }];

    const config = await getEffectiveTenantConfig({} as NodeJS.ProcessEnv);

    expect(config.theme.logoUrl).toBe("/logos/client-a.png");
    expect(config.id).toBe(defaultTenantConfig.id);
  });

  it("se replie sur la configuration statique si la base est indisponible", async () => {
    shouldFail = true;

    const config = await getEffectiveTenantConfig({} as NodeJS.ProcessEnv);

    expect(config).toEqual(defaultTenantConfig);
  });

  it("ignore la base quand le kill switch est actif", async () => {
    mockRows = [{ key: "name", value: "Autre" }];

    const config = await getEffectiveTenantConfig({
      TENANT_OVERRIDES_STATIC_ONLY: "true",
    } as NodeJS.ProcessEnv);

    expect(config.name).toBe(defaultTenantConfig.name);
  });

  it("expose la provenance de chaque clé de branding", async () => {
    mockRows = [{ key: "name", value: "Banque Nationale" }];

    const branding = await describeBranding({} as NodeJS.ProcessEnv);
    const name = branding.find((b) => b.key === "name");
    const logo = branding.find((b) => b.key === "logoUrl");

    expect(name?.overridden).toBe(true);
    expect(name?.effective).toBe("Banque Nationale");
    expect(logo?.overridden).toBe(false);
  });
});
