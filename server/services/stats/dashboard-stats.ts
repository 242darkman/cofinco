
import { db } from "../../db";
import {
  coffresForts,
  caisses,
  credits,
  comptes,
  users,
  userRoles,
  sessionsCaisse
} from "@shared/schema";
import {
  StatutCredit,
  StatutUser,
  TypeCompte
} from "@shared/enum/status-constants";
import { SystemRole } from "@shared/types/roles";
import { sql, eq, and, sum, count, isNull, isNotNull } from "drizzle-orm";

export interface DashboardStats {
  encaisse: number;        // Cash physique total
  par30: number;           // Pourcentage du capital à risque
  liquidite: number;       // Ratio de couverture (Cash / Épargne)
  agentsActifs: {
    active: number;
    total: number;
  };
}

/**
 * Récupère les statistiques globales financières et opérationnelles
 * Optimisé pour la performance avec des agrégations SQL natives
 */
export async function getGlobalStats(agenceId?: string): Promise<DashboardStats> {
  const isAllAgences = !agenceId || agenceId === 'all';

  // 1. Helper pour filtrer par agence
  // Note: ownerId pour coffres, agenceId pour les autres
  const withAgence = (table: any, column: string = 'agenceId') => {
    if (isAllAgences) return undefined;
    return eq(table[column], agenceId);
  };

  const withCoffreAgence = () => {
    if (isAllAgences) return undefined;
    // Include both AGENCE and SIEGE coffres for the selected agency
    // (SIEGE coffre has ownerId = agenceId for the main agency)
    return eq(coffresForts.ownerId, agenceId);
  };

  // Exécution parallèle pour performance maximale
  const [
    encaisseStats,
    par30Stats,
    epargneStats,
    agentsStats
  ] = await Promise.all([

    // A. ENCAISSE (Coffres + Caisses - calculé dynamiquement)
    Promise.all([
      // Somme Coffres (solde du coffre est mis à jour lors des transferts)
      db.select({
        total: sum(coffresForts.solde)
      }).from(coffresForts)
      .where(withCoffreAgence()),

      // Somme Caisses - Calcul dynamique:
      // 1. Sessions actives: montant d'ouverture (les opérations sont en cours)
      // 2. Sessions fermées: montant de fermeture déclaré (dernière session par caisse)
      // Note: On utilise une sous-requête pour obtenir le solde réel de chaque caisse
      db.execute(sql`
        SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
          SELECT DISTINCT ON (c.id)
            CASE
              -- Session active: utiliser montant d'ouverture
              WHEN s.closed_at IS NULL THEN COALESCE(CAST(s.montant_ouverture AS DECIMAL), 0)
              -- Dernière session fermée: utiliser montant déclaré
              ELSE COALESCE(CAST(s.montant_fermeture_declare AS DECIMAL), CAST(s.montant_fermeture_theorique AS DECIMAL), 0)
            END as solde_reel
          FROM caisses c
          LEFT JOIN sessions_caisse s ON s.caisse_id = c.id
          WHERE 1=1 ${isAllAgences ? sql`` : sql`AND c.agence_id = ${agenceId}`}
          ORDER BY c.id, s.closed_at DESC NULLS FIRST
        ) sub
      `)
    ]),

    // B. RISQUE PAR30 (Basé sur le Capital Restant Dû i.e. soldeRestant)
    db.select({
      portfolioTotal: sql<number>`COALESCE(SUM(CASE 
        WHEN ${credits.statut} IN (${StatutCredit.ACTIVE}, ${StatutCredit.LATE}) 
        THEN CAST(${credits.soldeRestant} AS DECIMAL) 
        ELSE 0 
      END), 0)`,
      portfolioAtRisk: sql<number>`COALESCE(SUM(CASE 
        WHEN ${credits.statut} IN (${StatutCredit.LATE}) 
        THEN CAST(${credits.soldeRestant} AS DECIMAL) 
        ELSE 0 
      END), 0)`
    }).from(credits)
    .where(withAgence(credits)),

    // C. LIQUIDITÉ (Épargne Totale)
    db.select({
      totalEpargne: sql<number>`COALESCE(SUM(CAST(${comptes.soldeCourant} AS DECIMAL)), 0)`
    }).from(comptes)
    .where(and(
      withAgence(comptes),
      // Use strict enum value check (TypeCompte.SAVINGS = 'SAVINGS')
      eq(comptes.typeCompte, TypeCompte.SAVINGS)
    )),

    // D. ACTIVITÉ AGENTS (Architecture V3: via userRoles)
    Promise.all([
      // Total Agents (Role AGENT_TERRAIN via userRoles)
      db.select({ count: count() })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.userId, users.id))
        .where(and(
          eq(userRoles.role, SystemRole.AGENT_TERRAIN),
          eq(userRoles.isPrimary, true)
        )),

      // Agents Actifs (Role AGENT_TERRAIN + User Active)
      db.select({ count: count() })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.userId, users.id))
        .where(and(
          eq(userRoles.role, SystemRole.AGENT_TERRAIN),
          eq(userRoles.isPrimary, true),
          eq(users.statut, StatutUser.ACTIVE)
        ))
    ])
  ]);

  // --- TRAITEMENT DES RÉSULTATS ---

  // 1. Calcul Encaisse
  const totalCoffres = Number(encaisseStats[0][0]?.total || 0);
  // Le résultat de db.execute retourne un QueryResult avec rows
  const caissesResult = encaisseStats[1] as unknown as { rows: Array<{ total: string }> };
  const totalCaisses = Number(caissesResult.rows?.[0]?.total || 0);
  const encaisse = totalCoffres + totalCaisses;

  // 2. Calcul PAR30
  const portfolioTotal = Number(par30Stats[0]?.portfolioTotal || 0);
  const portfolioAtRisk = Number(par30Stats[0]?.portfolioAtRisk || 0);
  // Éviter division par zéro
  const par30 = portfolioTotal > 0 
    ? (portfolioAtRisk / portfolioTotal) * 100 
    : 0;

  // 3. Calcul Liquidité (Ratio de couverture des dépôts)
  const totalEpargne = Number(epargneStats[0]?.totalEpargne || 0);
  // Éviter division par zéro + Cas spécial: si 0 dette envers épargnants, liquidité = 100%
  // Plafonner à 200% pour éviter des valeurs aberrantes d'affichage
  const rawLiquidite = totalEpargne > 0
    ? (encaisse / totalEpargne) * 100
    : 100;
  const liquidite = Math.min(rawLiquidite, 200);

  // 4. Activité Agents
  const totalAgents = agentsStats[0][0]?.count || 0;
  const activeAgents = agentsStats[1][0]?.count || 0;

  return {
    encaisse,
    par30: Number(par30.toFixed(2)), // Arrondi 2 décimales
    liquidite: Number(liquidite.toFixed(2)),
    agentsActifs: {
      active: activeAgents,
      total: totalAgents
    }
  };
}
