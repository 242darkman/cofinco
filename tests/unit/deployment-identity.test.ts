import { describe, expect, it } from "vitest";
import { decideIdentityAction, resolveRebindPolicy } from "../../apps/api/services/deployment-identity";

describe("identité du déploiement (1 instance = 1 client)", () => {
  it("revendique une base vierge au premier démarrage", () => {
    expect(decideIdentityAction(undefined, "microflex", false)).toBe("claim");
    expect(decideIdentityAction(undefined, "banque-nationale", true)).toBe("claim");
  });

  it("autorise le démarrage quand l'identité correspond", () => {
    expect(decideIdentityAction("microflex", "microflex", false)).toBe("match");
  });

  it("refuse le démarrage quand la base appartient à un autre tenant", () => {
    expect(decideIdentityAction("banque-nationale", "microflex", false)).toBe("mismatch");
  });

  it("autorise la réassignation uniquement si elle est explicitement demandée", () => {
    expect(decideIdentityAction("banque-nationale", "microflex", true)).toBe("rebind");
  });

  it("ne considère pas une correspondance comme une réassignation", () => {
    expect(decideIdentityAction("microflex", "microflex", true)).toBe("match");
  });
});

describe("politique de réassignation d'identité", () => {
  it("production : réassignation refusée par défaut", () => {
    expect(resolveRebindPolicy({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual({
      allowed: false,
      reason: "none",
    });
  });

  it("production : réassignation autorisée uniquement via le flag explicite", () => {
    expect(
      resolveRebindPolicy({ NODE_ENV: "production", TENANT_IDENTITY_REBIND: "true" } as NodeJS.ProcessEnv),
    ).toEqual({ allowed: true, reason: "explicit" });
  });

  it("développement : réassignation automatique (bascule de tenant en local)", () => {
    expect(resolveRebindPolicy({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toEqual({
      allowed: true,
      reason: "non-production",
    });
  });

  it("test : réassignation automatique (base éphémère)", () => {
    expect(resolveRebindPolicy({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toEqual({
      allowed: true,
      reason: "non-production",
    });
  });

  it("le flag explicite prime même hors production", () => {
    expect(
      resolveRebindPolicy({ NODE_ENV: "development", TENANT_IDENTITY_REBIND: "true" } as NodeJS.ProcessEnv),
    ).toEqual({ allowed: true, reason: "explicit" });
  });
});
