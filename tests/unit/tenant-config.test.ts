import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTenantConfig } from "../../apps/api/config/tenant-config";
import { defaultTenantConfig } from "../../packages/shared/tenant-config";

function writeTenantFile(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "tenant-config-"));
  const path = join(dir, "tenant.json");
  writeFileSync(path, JSON.stringify(config));
  return relative(process.cwd(), path);
}

describe("configuration tenant (fichier uniquement, jamais en variables d'environnement)", () => {
  it("utilise une configuration sûre par défaut sans fichier", () => {
    const config = loadTenantConfig({});

    expect(config).toEqual(defaultTenantConfig);
  });

  it("charge et valide le fichier du client", () => {
    const path = writeTenantFile({
      id: "banque-nationale",
      name: "Banque Nationale",
      theme: { primaryColor: "hsl(0, 80%, 40%)" },
      features: {
        enableSms: true,
        enableTontine: false,
        enableMobileMoney: false,
        enableFieldAgents: true,
      },
    });

    const config = loadTenantConfig({ TENANT_CONFIG_PATH: path });

    expect(config.id).toBe("banque-nationale");
    expect(config.name).toBe("Banque Nationale");
    expect(config.features.enableTontine).toBe(false);
    expect(config.features.enableMobileMoney).toBe(false);
  });

  it("ignore les anciennes variables d'environnement TENANT_*", () => {
    const config = loadTenantConfig({
      TENANT_ID: "autre",
      TENANT_NAME: "Autre",
      TENANT_FEATURE_TONTINE: "false",
    } as NodeJS.ProcessEnv);

    expect(config).toEqual(defaultTenantConfig);
  });

  it("refuse un fichier avec un identifiant tenant non sûr", () => {
    const path = writeTenantFile({
      ...defaultTenantConfig,
      id: "../../client",
    });

    expect(() => loadTenantConfig({ TENANT_CONFIG_PATH: path })).toThrow();
  });

  it("refuse un fichier avec une clé inconnue (schéma strict)", () => {
    const path = writeTenantFile({
      ...defaultTenantConfig,
      surprise: true,
    });

    expect(() => loadTenantConfig({ TENANT_CONFIG_PATH: path })).toThrow();
  });
});
