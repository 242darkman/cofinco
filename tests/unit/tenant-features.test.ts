import { describe, expect, it } from "vitest";
import { getRequiredTenantFeature } from "../../apps/api/middleware/tenant-features";
import { isRouteEnabledForTenant, type RouteConfig } from "../../apps/web/src/lib/routes-config";
import { defaultTenantConfig } from "../../packages/shared/tenant-config";

describe("protection des features tenant", () => {
  it.each([
    ["/api/tontines", "enableTontine"],
    ["/api/contributions-tontine", "enableTontine"],
    ["/api/payments/deposit", "enableMobileMoney"],
    ["/api/tracking/batch", "enableFieldAgents"],
    ["/api/agent-classement", "enableFieldAgents"],
    ["/api/sms/status", "enableSms"],
  ])("associe %s à %s", (path, feature) => {
    expect(getRequiredTenantFeature(path)).toBe(feature);
  });

  it("ne bloque pas une route sans feature", () => {
    expect(getRequiredTenantFeature("/api/clients")).toBeUndefined();
  });

  it("masque une route frontend lorsque la feature est désactivée", () => {
    const route = { tenantFeature: "enableTontine" } as RouteConfig;
    const features = { ...defaultTenantConfig.features, enableTontine: false };

    expect(isRouteEnabledForTenant(route, features)).toBe(false);
  });
});
