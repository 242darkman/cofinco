/**
 * KPI Queries — point d'entrée public du module de requêtes KPI.
 *
 * Les requêtes sont découpées par domaine métier :
 * - kpi-queries-credit.ts     : crédit, risque (PAR30/60/90)
 * - kpi-queries-finance.ts    : tontines & épargne, rentabilité, trésorerie
 * - kpi-queries-personnes.ts  : clients, RH & productivité
 *
 * Chaque fonction accepte un exécuteur `KpiDb` en dernier paramètre
 * (par défaut `db`) afin que le moteur KPI puisse exécuter l'ensemble
 * dans une transaction REPEATABLE READ (cohérence point-in-time).
 */
export { type KpiDb } from "./kpi-query-helpers";
export { queryCreditKpis, queryRisqueKpis } from "./kpi-queries-credit";
export {
  queryTontinesEpargneKpis,
  queryRentabiliteKpis,
  queryTresorerieKpis,
} from "./kpi-queries-finance";
export { queryClientsKpis, queryRhProductiviteKpis } from "./kpi-queries-personnes";
