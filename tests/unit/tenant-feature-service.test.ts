import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveFeatures,
  isTenantFeatureKey,
  mergeFeatureOverrides,
  resetTenantFeatureCacheForTests,
  TENANT_FEATURE_KEYS,
} from "../../apps/api/services/tenant-feature-service";
import { defaultTenantConfig } from "../../packages/shared/tenant-config";

let mockRows: Array<{ feature: string; enabled: boolean }> = [];
let shouldFail = false;
let selectCalls = 0;

vi.mock("../../apps/api/db", () => ({
  db: {
    select: () => ({
      from: async () => {
        selectCalls += 1;
        if (shouldFail) throw new Error("base indisponible");
        return mockRows;
      },
    }),
  },
}));

beforeEach(() => {
  resetTenantFeatureCacheForTests();
  mockRows = [];
  shouldFail = false;
  selectCalls = 0;
});

describe("clés de feature flags", () => {
  it("reconnaît toutes les clés connues et rejette les inconnues", () => {
    for (const key of TENANT_FEATURE_KEYS) {
      expect(isTenantFeatureKey(key)).toBe(true);
    }
    expect(isTenantFeatureKey("enableInconnu")).toBe(false);
  });
});

describe("fusion des surcharges", () => {
  it("applique une surcharge valide sans muter la configuration statique", () => {
    const staticFeatures = { ...defaultTenantConfig.features };
    const merged = mergeFeatureOverrides(staticFeatures, [
      { feature: "enableTontine", enabled: false },
    ]);

    expect(merged.enableTontine).toBe(false);
    expect(staticFeatures.enableTontine).toBe(true);
    expect(merged.enableSms).toBe(staticFeatures.enableSms);
  });

  it("ignore une clé de surcharge inconnue", () => {
    const merged = mergeFeatureOverrides(defaultTenantConfig.features, [
      { feature: "enableInconnu", enabled: false },
    ]);

    expect(merged).toEqual(defaultTenantConfig.features);
  });
});

describe("flags effectifs", () => {
  it("surcharge la configuration statique depuis la base", async () => {
    mockRows = [{ feature: "enableSms", enabled: false }];

    const features = await getEffectiveFeatures({} as NodeJS.ProcessEnv);

    expect(features.enableSms).toBe(false);
    expect(features.enableTontine).toBe(true);
  });

  it("met en cache le résultat pendant la durée de vie du cache", async () => {
    mockRows = [{ feature: "enableSms", enabled: false }];

    await getEffectiveFeatures({} as NodeJS.ProcessEnv);
    await getEffectiveFeatures({} as NodeJS.ProcessEnv);

    expect(selectCalls).toBe(1);
  });

  it("se replie sur la configuration statique si la base est indisponible", async () => {
    shouldFail = true;

    const features = await getEffectiveFeatures({} as NodeJS.ProcessEnv);

    expect(features).toEqual(defaultTenantConfig.features);
  });

  it("ignore la base quand le kill switch est actif", async () => {
    mockRows = [{ feature: "enableSms", enabled: false }];

    const features = await getEffectiveFeatures({
      TENANT_FEATURES_STATIC_ONLY: "true",
    } as NodeJS.ProcessEnv);

    expect(features.enableSms).toBe(true);
    expect(selectCalls).toBe(0);
  });
});
