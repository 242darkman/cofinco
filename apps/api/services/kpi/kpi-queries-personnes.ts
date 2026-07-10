/**
 * KPI Queries — Domaines CLIENTS et RH & PRODUCTIVITÉ.
 *
 * Chaque fonction accepte un exécuteur (`KpiDb`) pour s'exécuter dans la
 * transaction REPEATABLE READ du moteur KPI.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { agencyFilter, safeDiv, toNum, type KpiDb } from "./kpi-query-helpers";

interface TotalRow { total: string }
interface TauxRow { taux: string }
interface SegmentRow { segment: string; total: string }
interface AgentRow { agent_id: string; nom: string; prenom: string; decaissements: string; montant: string; clients: string }
interface DecPeriodeRow { nombre: string; montant: string }

// =====================
// CLIENTS KPIs
// =====================

export async function queryClientsKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  // Total clients actifs
  const actifs = await dbx.execute(sql`
    SELECT COUNT(*) AS total
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE u.statut = 'ACTIVE'
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);

  // Nouveaux clients sur la période
  const nouveaux = await dbx.execute(sql`
    SELECT COUNT(*) AS total
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE c.created_at >= ${periodStart}
      AND c.created_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);

  // Par segment
  const segments = await dbx.execute(sql`
    SELECT
      COALESCE(c.segment, 'Standard') AS segment,
      COUNT(*) AS total
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE u.statut = 'ACTIVE'
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
    GROUP BY c.segment
  `);

  // Taux de rétention : clients actifs en début de période encore actifs
  const retention = await dbx.execute(sql`
    WITH debut AS (
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.created_at < ${periodStart}
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    ),
    retenus AS (
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.created_at < ${periodStart}
        AND u.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    )
    SELECT CASE WHEN debut.total > 0 THEN ROUND(retenus.total::numeric / debut.total * 100, 2) ELSE 0 END AS taux
    FROM debut, retenus
  `);

  const segmentMap: Record<string, number> = {};
  for (const row of segments.rows as unknown as SegmentRow[]) {
    segmentMap[row.segment || 'Standard'] = toNum(row.total);
  }

  return {
    totalClientsActifs: toNum((actifs.rows[0] as unknown as TotalRow | undefined)?.total),
    nouveauxClients: toNum((nouveaux.rows[0] as unknown as TotalRow | undefined)?.total),
    clientsParSegment: segmentMap,
    tauxRetention: toNum((retention.rows[0] as unknown as TauxRow | undefined)?.taux),
  };
}

// =====================
// RH & PRODUCTIVITÉ KPIs
// =====================

export async function queryRhProductiviteKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  // Agents actifs (employés avec statut ACTIVE)
  const agents = await dbx.execute(sql`
    SELECT COUNT(*) AS total
    FROM employes e
    WHERE e.statut = 'ACTIVE'
      ${agencyFilter('e', agencyId)}
  `);
  const agentsActifsRaw = (agents.rows[0] as unknown as TotalRow | undefined)?.total;
  const agentsActifs = toNum(agentsActifsRaw);

  // Clients actifs, encours et décaissements pour ratios par agent
  const clientsTotal = await dbx.execute(sql`
    SELECT COUNT(*) AS total
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE u.statut = 'ACTIVE' AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const encoursTotal = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS total
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE') AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const decPeriode = await dbx.execute(sql`
    SELECT
      COUNT(*) AS nombre,
      ROUND(COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0), 2) AS montant
    FROM credits c
    WHERE c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const cTotal = (clientsTotal.rows[0] as unknown as TotalRow | undefined)?.total;
  const eTotal = (encoursTotal.rows[0] as unknown as TotalRow | undefined)?.total;
  const decNombre = (decPeriode.rows[0] as unknown as DecPeriodeRow | undefined)?.nombre;

  // Top agents (montant décaissé DESC)
  const topQuery = await dbx.execute(sql`
    SELECT
      c.disbursed_by AS agent_id,
      u.nom, u.prenom,
      COUNT(*) AS decaissements,
      ROUND(COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0), 2) AS montant,
      COUNT(DISTINCT c.client_id) AS clients
    FROM credits c
    INNER JOIN users u ON u.id = c.disbursed_by
    WHERE c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      AND c.disbursed_by IS NOT NULL
      ${agencyFilter('c', agencyId)}
    GROUP BY c.disbursed_by, u.nom, u.prenom
    ORDER BY montant DESC
    LIMIT 5
  `);

  // Bottom agents (montant décaissé ASC)
  const bottomQuery = await dbx.execute(sql`
    SELECT
      c.disbursed_by AS agent_id,
      u.nom, u.prenom,
      COUNT(*) AS decaissements,
      ROUND(COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0), 2) AS montant,
      COUNT(DISTINCT c.client_id) AS clients
    FROM credits c
    INNER JOIN users u ON u.id = c.disbursed_by
    WHERE c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      AND c.disbursed_by IS NOT NULL
      ${agencyFilter('c', agencyId)}
    GROUP BY c.disbursed_by, u.nom, u.prenom
    ORDER BY montant ASC
    LIMIT 5
  `);

  const mapAgentRow = (r: AgentRow) => ({
    id: r.agent_id,
    nom: r.nom,
    prenom: r.prenom,
    decaissements: toNum(r.decaissements),
    montant: toNum(r.montant),
    clients: toNum(r.clients),
  });

  const topAgents = (topQuery.rows as unknown as AgentRow[]).map(mapAgentRow);
  const bottomAgents = (bottomQuery.rows as unknown as AgentRow[]).map(mapAgentRow);

  // Masse salariale
  const moisKey = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`
    : '';
  const salaires = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(bp.salaire_net AS DECIMAL)), 0), 2) AS total
    FROM bulletins_paie bp
    INNER JOIN employes e ON e.id = bp.employe_id
    WHERE bp.mois = ${moisKey}
      AND bp.statut IN ('VALIDATED', 'PAID')
      AND (bp.cancelled IS NULL OR bp.cancelled = false)
      ${agencyFilter('e', agencyId)}
  `);

  return {
    agentsActifs,
    clientsParAgent: safeDiv(cTotal, agentsActifsRaw),
    encoursParAgent: safeDiv(eTotal, agentsActifsRaw),
    decaissementsParAgent: safeDiv(decNombre, agentsActifsRaw),
    topAgents,
    bottomAgents,
    masseSalariale: toNum((salaires.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}
