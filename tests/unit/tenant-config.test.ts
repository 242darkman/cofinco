import { describe, expect, it } from "vitest";
import { loadTenantConfig } from "../../apps/api/config/tenant-config";

describe("configuration tenant", () => {
  it("utilise une configuration sûre par défaut", () => {
    const config = loadTenantConfig({});

    expect(config.id).toBe("microflex");
    expect(config.features.enableTontine).toBe(true);
  });

  it("applique les overrides typés de l'environnement", () => {
    const config = loadTenantConfig({
      TENANT_ID: "banque-nationale",
      TENANT_NAME: "Banque Nationale",
      TENANT_FEATURE_TONTINE: "false",
      TENANT_FEATURE_MOBILE_MONEY: "false",
    });

    expect(config.id).toBe("banque-nationale");
    expect(config.name).toBe("Banque Nationale");
    expect(config.features.enableTontine).toBe(false);
    expect(config.features.enableMobileMoney).toBe(false);
  });

  it("refuse une valeur de flag ambiguë", () => {
    expect(() => loadTenantConfig({ TENANT_FEATURE_SMS: "1" })).toThrow(
      "TENANT_FEATURE_SMS doit valoir true ou false",
    );
  });

  it("refuse un identifiant tenant non sûr", () => {
    expect(() => loadTenantConfig({ TENANT_ID: "../../client" })).toThrow();
  });
});
