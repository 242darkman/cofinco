import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tenantConfigSchema } from "../../packages/shared/tenant-config";
import { computeTenantThemeVariables, parseColor } from "../../apps/web/src/lib/tenant-theme";

/**
 * Vérifie que le branding du client Micro-Cred Sepela est appliqué via la
 * configuration tenant (source unique de vérité) et dérive une charte cohérente,
 * sans dépendre d'un quelconque système de couleurs legacy.
 */
describe("branding tenant Micro-Cred Sepela", () => {
  const config = tenantConfigSchema.parse(
    JSON.parse(
      readFileSync(join(process.cwd(), "config/tenants/micro-cred-sepela.json"), "utf8"),
    ),
  );

  it("est une configuration tenant valide (id == nom de fichier)", () => {
    expect(config.id).toBe("micro-cred-sepela");
    expect(config.name).toBe("Micro-Cred Sepela");
    expect(config.theme.logoUrl).toBe("/brand/micro-cred-sepela/logo-microcred-sepela.jpg");
    expect(config.theme.faviconUrl).toBe("/brand/micro-cred-sepela/logo-microcred-sepela.jpg");
  });

  it("dérive une charte or/anthracite cohérente sur les thèmes clair et sombre", () => {
    const vars = computeTenantThemeVariables(config);
    expect(vars).toBeDefined();

    // Primaire : or chaud (~41°)
    const primary = parseColor(config.theme.primaryColor);
    expect(primary).toBeDefined();
    expect(primary!.h).toBeGreaterThan(35);
    expect(primary!.h).toBeLessThan(50);

    expect(vars!.root["--accent-primary"]).toBe("hsl(41, 53%, 55%)");
    expect(vars!.dark["--accent-primary"]).toBe("hsl(41, 53%, 60%)");

    // Secondaire : anthracite dérivé sur les deux thèmes
    expect(vars!.root["--accent-secondary"]).toBeDefined();
    expect(vars!.dark["--accent-secondary"]).toBeDefined();
  });
});
