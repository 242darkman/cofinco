/**
 * Test de contrat — couverture des feature flags tenant.
 *
 * Garantit qu'aucune route API appartenant à un domaine désactivable
 * (tontines, SMS, mobile money, agents terrain) n'échappe au middleware
 * enforceTenantFeatures. Le test scanne statiquement les chemins déclarés
 * dans apps/api/routes.ts et apps/api/routes/*.ts : toute nouvelle route
 * d'un domaine flaggé doit être couverte par les règles du middleware,
 * sinon ce test échoue.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TenantFeatureKey } from "../../packages/shared/tenant-config";
import { getRequiredTenantFeature } from "../../apps/api/middleware/tenant-features";

const ROUTES_DIR = join(__dirname, "../../apps/api/routes");
const ROUTES_FILE = join(__dirname, "../../apps/api/routes.ts");

/**
 * Chemins volontairement hors du périmètre des flags, avec justification.
 * Toute exemption doit être documentée ici.
 */
const EXEMPTED_PATHS: Array<{ pattern: RegExp; justification: string }> = [
  {
    // Le webhook générique /api/webhooks n'est gated qu'au niveau /pawapay :
    // d'autres fournisseurs non liés au mobile money peuvent s'y ajouter.
    pattern: /^\/api\/webhooks$/,
    justification: "préfixe multi-fournisseurs — seul /pawapay relève du mobile money",
  },
];

/** Associe un chemin à la feature attendue selon le vocabulaire du domaine. */
function expectedFeature(path: string): TenantFeatureKey | undefined {
  if (/tontine/.test(path)) return "enableTontine";
  if (/sms/.test(path)) return "enableSms";
  if (/mobile-money|pawapay|\/payments(?:-test)?(?:\/|$)/.test(path)) return "enableMobileMoney";
  if (
    /agents-terrain|\/agents(?:\/|$)|\/agent-|\/tracking|prospection|visites-terrain|paiements-terrain|\/zones(?:\/|$)|objectifs-mensuels/.test(
      path,
    )
  ) {
    return "enableFieldAgents";
  }
  return undefined;
}

function collectApiPaths(): string[] {
  const files = readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(ROUTES_DIR, f));
  files.push(ROUTES_FILE);

  const paths = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/["'`](\/api\/[A-Za-z0-9/:_-]*)["'`]/g)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

function isExempted(path: string): boolean {
  return EXEMPTED_PATHS.some((e) => e.pattern.test(path));
}

describe("contrat de couverture des feature flags tenant", () => {
  const apiPaths = collectApiPaths();

  it("scanne un nombre plausible de routes", () => {
    expect(apiPaths.length).toBeGreaterThan(100);
  });

  it("chaque route d'un domaine flaggé est couverte par le middleware", () => {
    const leaks: string[] = [];

    for (const path of apiPaths) {
      const expected = expectedFeature(path);
      if (!expected || isExempted(path)) continue;

      const actual = getRequiredTenantFeature(path);
      if (actual !== expected) {
        leaks.push(`${path} → attendu ${expected}, obtenu ${actual ?? "aucun"}`);
      }
    }

    expect(
      leaks,
      `Routes de domaines flaggés non couvertes par enforceTenantFeatures :\n${leaks.join("\n")}\n` +
        "Ajouter la règle correspondante dans apps/api/middleware/tenant-features.ts " +
        "ou documenter une exemption justifiée dans ce test.",
    ).toEqual([]);
  });

  it("le middleware ne bloque pas les routes hors domaine flaggé", () => {
    const overreach = apiPaths.filter(
      (path) => !expectedFeature(path) && !isExempted(path) && getRequiredTenantFeature(path),
    );

    expect(
      overreach,
      `Routes bloquées par le middleware sans appartenir à un domaine flaggé :\n${overreach.join("\n")}`,
    ).toEqual([]);
  });
});
