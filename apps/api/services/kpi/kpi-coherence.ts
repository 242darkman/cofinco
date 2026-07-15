/**
 * KPI Coherence — vérification consolidé = somme des agences.
 *
 * Pour une structure bancaire, la vue consolidée doit être réconciliable
 * avec la somme des vues agences. Les clés additives (encours, volumes,
 * comptages) sont comparées en Decimal ; tout écart au-delà de la tolérance
 * d'arrondi produit un warning stocké dans les métadonnées du snapshot
 * consolidé (visible en audit, sans bloquer la publication).
 *
 * Les ratios, taux et moyennes ne sont volontairement pas comparés :
 * ils ne sont pas additifs entre agences.
 */
import { D, Decimal } from "../../lib/money";
import type { KpiPayload } from "@shared/schema/kpi";

/** Clés additives par domaine (sommables entre agences). */
const ADDITIVE_KEYS: ReadonlyArray<{ domain: keyof Omit<KpiPayload, "deltas">; keys: readonly string[] }> = [
  { domain: "credit", keys: ["encoursTotalActif", "nombreCreditsActifs", "decaissementsPeriode", "nombreDecaissements"] },
  { domain: "risque", keys: ["creditsEnSouffrance", "montantEnSouffrance"] },
  { domain: "tontinesEpargne", keys: ["encoursEpargne", "encoursComptesCourants", "tontinesActives", "membresTontines", "volumesCollectes", "volumesRetires", "cotisationsTontines"] },
  { domain: "rentabilite", keys: ["interetsPercus", "fraisCommissions", "revenusTontines", "charges"] },
  { domain: "tresorerie", keys: ["soldeCaisses", "soldeCoffres", "soldeMobileMoney", "fluxEntrants", "fluxSortants", "ecartsCaisses"] },
  { domain: "clients", keys: ["totalClientsActifs", "nouveauxClients"] },
  { domain: "rhProductivite", keys: ["agentsActifs", "masseSalariale"] },
];

export interface CoherenceCheckResult {
  /** true si aucun écart au-delà de la tolérance */
  coherent: boolean;
  /** Un warning par clé en écart, format lisible pour metadata.warnings */
  warnings: string[];
}

/**
 * Compare le payload consolidé à la somme des payloads agences.
 *
 * @param agencyPayloads payloads AGENCY calculés dans le même recalcul
 * @param consolidated   payload CONSOLIDATED calculé sans filtre agence
 * @param toleranceBase  tolérance d'arrondi par agence (défaut 0.01)
 */
export function checkConsolidatedCoherence(
  agencyPayloads: KpiPayload[],
  consolidated: KpiPayload,
  toleranceBase = 0.01,
): CoherenceCheckResult {
  const warnings: string[] = [];
  // Chaque valeur agence est arrondie à 2 décimales : l'écart d'arrondi
  // cumulé maximal est de 0.005 × (nb agences + 1) par clé.
  const tolerance = D(toleranceBase).times(agencyPayloads.length + 1);

  for (const { domain, keys } of ADDITIVE_KEYS) {
    const consolidatedDomain = consolidated[domain] as unknown as Record<string, unknown>;
    for (const key of keys) {
      const consolidatedValue = consolidatedDomain?.[key];
      if (typeof consolidatedValue !== "number") continue;

      let sum = D(0);
      let comparable = true;
      for (const p of agencyPayloads) {
        const v = (p[domain] as unknown as Record<string, unknown>)?.[key];
        if (typeof v !== "number") {
          comparable = false;
          break;
        }
        sum = sum.plus(D(v));
      }
      if (!comparable) continue;

      const diff = D(consolidatedValue).minus(sum).abs();
      if (diff.gt(tolerance)) {
        warnings.push(
          `Écart consolidé/somme agences sur ${String(domain)}.${key} : ` +
          `consolidé=${consolidatedValue}, somme=${sum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()}, ` +
          `écart=${diff.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()}`,
        );
      }
    }
  }

  return { coherent: warnings.length === 0, warnings };
}
