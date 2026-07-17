/**
 * Storage — Cartes de pointage (épargne libre par cases).
 * Façade préservant le chemin d'import historique.
 *
 * Les responsabilités sont découpées dans `./cartes-pointage/` :
 * - `cartes.ts` : référence, lectures, création, verrou pessimiste ;
 * - `versement.ts` : pointage d'une case (ACID, idempotence, ledger/GL) ;
 * - `retrait.ts` : clôture, répartition M×N − M / commission M ;
 * - `types.ts` : interfaces et constantes GL.
 *
 * Les règles de calcul pures vivent dans `@shared/utils/carte-pointage`.
 */

export {
  generateCartePointageReference,
  getCartePointage,
  getCartePointageByReference,
  getAllCartesPointage,
  getTransactionsPointageByCard,
  createCartePointage,
} from "./cartes-pointage/cartes";
export { createVersementCartePointage } from "./cartes-pointage/versement";
export { createRetraitCartePointage } from "./cartes-pointage/retrait";
export type {
  CartePointageAvecClient,
  VersementCartePointageParams,
  RetraitCartePointageParams,
  RetraitCartePointageResult,
} from "./cartes-pointage/types";
