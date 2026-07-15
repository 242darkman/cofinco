import { describe, expect, it } from "vitest";
import { tenantConfigSchema, isModuleFeature, defaultTenantConfig } from "../../packages/shared/tenant-config";
import { getRequiredTenantFeature } from "../../apps/api/middleware/tenant-features";
import { mergeFeatureOverrides } from "../../apps/api/services/tenant-feature-service";

/**
 * Flags par module : activables/désactivables par tenant, avec parité
 * nav / admin / garde serveur. Ces tests couvrent le défaut du schéma et le
 * mapping chemin → feature (garde API), sans dépendance base de données.
 */
describe("flags modules — schéma (défaut = actif partout)", () => {
  const base = {
    id: "client-min",
    name: "Client Min",
    theme: { primaryColor: "#C9A24E" },
  };

  it("applique le défaut true aux nouveaux flags absents de la config", () => {
    const parsed = tenantConfigSchema.parse({
      ...base,
      features: {
        enableSms: false,
        enableTontine: false,
        enableMobileMoney: false,
        enableFieldAgents: false,
      },
    });
    expect(parsed.features.enableCredits).toBe(true);
    expect(parsed.features.enableComptes).toBe(true);
    expect(parsed.features.enableCaisse).toBe(true);
    expect(parsed.features.enableComptabilite).toBe(true);
    expect(parsed.features.enableKpi).toBe(true);
  });

  it("permet à un tenant de désactiver un module (opt-out)", () => {
    const parsed = tenantConfigSchema.parse({
      ...base,
      id: "client-opt-out",
      features: {
        enableSms: true,
        enableTontine: true,
        enableMobileMoney: true,
        enableFieldAgents: true,
        enableComptabilite: false,
        enableKpi: false,
      },
    });
    expect(parsed.features.enableComptabilite).toBe(false);
    expect(parsed.features.enableKpi).toBe(false);
    expect(parsed.features.enableCredits).toBe(true);
  });
});

describe("garde serveur — mapping chemin → feature", () => {
  it.each([
    ["/api/credits", "enableCredits"],
    ["/api/credits/123/echeances", "enableCredits"],
    ["/api/remboursements", "enableCredits"],
    ["/api/comptes/abc", "enableComptes"],
    ["/api/caisse/authorization-status", "enableCaisse"],
    ["/api/caisses", "enableCaisse"],
    ["/api/caisse-transferts", "enableCaisse"],
    ["/api/coffre/etat", "enableCoffreFort"],
    ["/api/transferts-inter-coffres", "enableCoffreFort"],
    ["/api/transferts", "enableTransfert"],
    ["/api/comptabilite/journaux/1/ecritures", "enableComptabilite"],
    ["/api/kpi/series", "enableKpi"],
    ["/api/hr/bulletins", "enableRH"],
    ["/api/departments/1", "enableRH"],
  ])("%s → %s", (path, feature) => {
    expect(getRequiredTenantFeature(path)).toBe(feature);
  });

  it.each([
    "/api/clients",
    "/api/auth/me",
    "/api/company-info",
    "/api/tenant/config",
    "/api/employes/me",
  ])("%s n'est gardé par aucun flag", (path) => {
    expect(getRequiredTenantFeature(path)).toBeUndefined();
  });

  it("distingue comptes et comptabilité (pas de sur-match)", () => {
    expect(getRequiredTenantFeature("/api/comptabilite")).toBe("enableComptabilite");
    expect(getRequiredTenantFeature("/api/comptes")).toBe("enableComptes");
  });

  it("ne confond pas caisse-transferts / transferts-inter-coffres avec transferts", () => {
    expect(getRequiredTenantFeature("/api/caisse-transferts")).toBe("enableCaisse");
    expect(getRequiredTenantFeature("/api/transferts-inter-coffres")).toBe("enableCoffreFort");
    expect(getRequiredTenantFeature("/api/transferts")).toBe("enableTransfert");
  });
});

describe("classification module / intégration", () => {
  it("classe les modules et les intégrations", () => {
    expect(isModuleFeature("enableTontine")).toBe(true);
    expect(isModuleFeature("enableFieldAgents")).toBe(true);
    expect(isModuleFeature("enableCredits")).toBe(true);
    expect(isModuleFeature("enableComptabilite")).toBe(true);
    expect(isModuleFeature("enableRH")).toBe(true);
    // Intégrations opérationnelles
    expect(isModuleFeature("enableSms")).toBe(false);
    expect(isModuleFeature("enableMobileMoney")).toBe(false);
  });
});

describe("plafond de provisioning (mergeFeatureOverrides)", () => {
  const provisionedAll = defaultTenantConfig.features; // tout provisionné (true)

  it("interdit d'activer un module NON provisionné (plafond)", () => {
    const staticFeatures = { ...provisionedAll, enableComptabilite: false };
    const merged = mergeFeatureOverrides(staticFeatures, [
      { feature: "enableComptabilite", enabled: true },
    ]);
    expect(merged.enableComptabilite).toBe(false);
  });

  it("permet de désactiver puis réactiver un module provisionné", () => {
    expect(
      mergeFeatureOverrides(provisionedAll, [{ feature: "enableCredits", enabled: false }]).enableCredits,
    ).toBe(false);
    expect(
      mergeFeatureOverrides(provisionedAll, [{ feature: "enableCredits", enabled: true }]).enableCredits,
    ).toBe(true);
  });

  it("laisse une intégration se basculer librement, même non provisionnée", () => {
    const staticFeatures = { ...provisionedAll, enableSms: false };
    const merged = mergeFeatureOverrides(staticFeatures, [{ feature: "enableSms", enabled: true }]);
    expect(merged.enableSms).toBe(true);
  });

  it("désactive une intégration provisionnée sur demande", () => {
    const merged = mergeFeatureOverrides(provisionedAll, [
      { feature: "enableMobileMoney", enabled: false },
    ]);
    expect(merged.enableMobileMoney).toBe(false);
  });
});
