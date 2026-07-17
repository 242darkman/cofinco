/**
 * Règles métier pures des cartes de pointage (épargne libre par cases).
 *
 * Une carte comporte exactement 31 cases. Chaque versement d'un montant
 * unitaire fixe `M` (défini à l'ouverture) coche une case. Au retrait,
 * le client reçoit `A = M×N − M` (N = nombre de versements effectués) et
 * la différence `M` est comptabilisée comme commission (frais de gestion
 * de caisse) au profit de l'institution.
 *
 * Contraintes AGENTS.md §9 : aucun flottant JavaScript — tous les calculs
 * monétaires sont effectués en centimes via BigInt sur des chaînes
 * `numeric(15,2)` telles que stockées par Drizzle/PostgreSQL.
 */

/** Nombre de cases (slots) d'une carte de pointage. Invariant produit. */
export const NOMBRE_CASES_CARTE_POINTAGE = 31;

/**
 * Nombre minimal de versements requis pour autoriser un retrait.
 * Avec N=1 la formule A = M×N − M restituerait 0 au client : le retrait
 * est donc bloqué tant que N < 2 (décision produit validée).
 */
export const MIN_VERSEMENTS_POUR_RETRAIT = 2;

/** Résultat du calcul de retrait, montants en chaînes décimales (scale 2). */
export interface CalculRetraitCartePointage {
  /** Montant restitué au client : M×N − M. */
  montantClient: string;
  /** Commission conservée par l'institution (une échéance M). */
  commission: string;
  /** Total collecté sur la carte : M×N. */
  totalCollecte: string;
}

/**
 * Convertit une chaîne décimale `numeric(15,2)` en centimes (BigInt).
 * Rejette toute valeur non strictement positive ou mal formée : le montant
 * unitaire d'une carte est un invariant financier critique.
 *
 * @throws Error si le montant est invalide ou ≤ 0.
 */
export function montantEnCentimes(montant: string): bigint {
  const normalise = montant.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalise)) {
    throw new Error(`Montant invalide pour une carte de pointage : "${montant}"`);
  }
  const [entier, decimales = ""] = normalise.split(".");
  const cents = BigInt(entier) * 100n + BigInt(decimales.padEnd(2, "0") || "0");
  if (cents <= 0n) {
    throw new Error("Le montant unitaire d'une carte de pointage doit être strictement positif");
  }
  return cents;
}

/** Formate des centimes (BigInt) en chaîne décimale à 2 décimales. */
export function centimesEnMontant(cents: bigint): string {
  const signe = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${signe}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Indique si un versement supplémentaire est possible sur la carte.
 * Une carte est pleine lorsque ses 31 cases sont cochées.
 */
export function peutPointer(completedSlots: number): boolean {
  return Number.isInteger(completedSlots)
    && completedSlots >= 0
    && completedSlots < NOMBRE_CASES_CARTE_POINTAGE;
}

/**
 * Indique si le retrait est autorisé pour un nombre de versements donné.
 * Règle : N ≥ 2 (sinon le client recevrait 0 — voir MIN_VERSEMENTS_POUR_RETRAIT).
 */
export function peutRetirer(nombreVersements: number): boolean {
  return Number.isInteger(nombreVersements)
    && nombreVersements >= MIN_VERSEMENTS_POUR_RETRAIT
    && nombreVersements <= NOMBRE_CASES_CARTE_POINTAGE;
}

/**
 * Calcule la répartition des fonds au retrait d'une carte de pointage.
 *
 * Formule contractuelle : A_retrait = (M × N) − M, où M est le montant
 * unitaire par case et N le nombre de versements effectués. La retenue M
 * est transférée en commission dans la caisse de l'agent validateur.
 *
 * @param montantUnitaire - Montant fixe par case (chaîne `numeric(15,2)`).
 * @param nombreVersements - Nombre de cases cochées (N), 2 ≤ N ≤ 31.
 * @throws Error si N est hors bornes ou si le montant est invalide.
 */
export function calculerRetraitCartePointage(
  montantUnitaire: string,
  nombreVersements: number,
): CalculRetraitCartePointage {
  if (!peutRetirer(nombreVersements)) {
    throw new Error(
      `Retrait refusé : ${nombreVersements} versement(s) — minimum requis ` +
      `${MIN_VERSEMENTS_POUR_RETRAIT}, maximum ${NOMBRE_CASES_CARTE_POINTAGE}`,
    );
  }
  const unitaireCents = montantEnCentimes(montantUnitaire);
  const totalCents = unitaireCents * BigInt(nombreVersements);
  const clientCents = totalCents - unitaireCents;
  return {
    montantClient: centimesEnMontant(clientCents),
    commission: centimesEnMontant(unitaireCents),
    totalCollecte: centimesEnMontant(totalCents),
  };
}
