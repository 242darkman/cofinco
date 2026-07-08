import { describe, expect, it } from "vitest";
import { decideIdentityAction } from "../../apps/api/services/deployment-identity";

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
