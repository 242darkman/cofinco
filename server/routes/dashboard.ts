import type { Express } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import {
  clients, credits, comptes, tontines, users, sessionsCaisse,
  transactionsCompte, operationsCaisse, remboursements, agentsTerrain, userRoles,
  coffresForts, caisses
} from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import {
  StatutCompte,
  StatutCredit,
  StatutUser,
  StatutClient,
  TypeCompte,
  StatutParticipationTontine
} from "@shared/enum/status-constants";
import { storage } from "../storage";
import { count, sql, and, gte, eq, desc, sum, ilike, or, isNull } from "drizzle-orm";

import { getGlobalStats } from "../services/stats/dashboard-stats";

// ... existing imports

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      // Cache for 30 seconds with stale-while-revalidate for better UX on slow connections
      res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
      res.setHeader('Vary', 'X-Agence-Id');
      const userRole = req.session.user?.role || 'agent';
      const agenceId = req.headers['x-agence-id'] as string;
      const isAllAgences = !agenceId || agenceId === 'all';
      
      const now = new Date();
      
      // Helper function to apply agence filter
      const withAgence = (table: any, filter: any = null) => {
        if (isAllAgences) return filter ? filter : undefined;
        // Some tables might have agence_id, some agence
        const agenceFilter = eq(table.agenceId, agenceId);
        return filter ? and(filter, agenceFilter) : agenceFilter;
      };

      // Helper for raw SQL queries
      const sqlAgenceFilter = (tableAlias: string) => {
        if (isAllAgences) return sql`TRUE`;
        // Use separate identifiers for table and column to avoid invalid escaping like "sc.agence_id"
        return sql`${sql.raw(tableAlias)}.agence_id = ${agenceId}`;
      };
      
      // ... existing helper functions

      // Calculate date for "recent" stats (last 7 days)
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Start of 6 months ago for chart history
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      sixMonthsAgo.setDate(1);

      // Parallel queries for better performance
      const [
        // Get precise financial KPIs from specialized service
        financialStats,
        
        clientsStats,
        creditsStats,
        epargnesStats,
        tontinesStats,
        usersStats, // Keeping for total count if needed, but financialStats has agents
        sessionsStats,
        weeklyClients,
        weeklyCredits,
        dailyClients,
        dailyCredits,
        monthlyCredits,
        
        // New Queries for Charts & Widgets
        monthlyGrowth, 
        dailyActivity,
        productSplit,
        creditStatus,
        recentActivity,
        topClients,
        alertsData,
        upcomingPaymentsData
        // Removed explicit coffres/caisses queries as they are handled in financialStats
      ] = await Promise.all([
        // 0. Financial KPIs (New Service)
        getGlobalStats(isAllAgences ? undefined : agenceId),

        // 1. Clients statistics - join with users for statut field
        db.select({
          total: count(),
          actifs: sql<number>`COUNT(CASE WHEN ${users.statut} = ${StatutClient.ACTIVE} THEN 1 END)`
        }).from(clients)
          .leftJoin(users, eq(clients.userId, users.id))
          .where(withAgence(clients)),

          // 2. Credits statistics
        // ... (keep existing credit query for counts and other totals not in financialStats)
        db.select({
          total: count(),
          enCours: sql<number>`COUNT(CASE WHEN ${credits.statut} = ${StatutCredit.ACTIVE} THEN 1 END)`,
          enAttente: sql<number>`COUNT(CASE WHEN ${credits.statut} = ${StatutCredit.PENDING} THEN 1 END)`,
          enRetard: sql<number>`COUNT(CASE WHEN ${credits.statut} = ${StatutCredit.LATE} THEN 1 END)`,
          montantTotal: sql<number>`COALESCE(SUM(CASE WHEN ${credits.statut} NOT IN (${StatutCredit.CANCELLED}) THEN ${credits.montant} ELSE 0 END), 0)`,
          montantDecaisse: sql<number>`COALESCE(SUM(CASE WHEN ${credits.statut} IN (${StatutCredit.ACTIVE}, ${StatutCredit.PAID}, ${StatutCredit.LATE}) THEN ${credits.montant} * (1 + COALESCE(${credits.taux}, 0) / 100) ELSE 0 END), 0)`,
          montantRecouvre: sql<number>`COALESCE(SUM(
            CASE WHEN ${credits.statut} IN (${StatutCredit.ACTIVE}, ${StatutCredit.PAID}, ${StatutCredit.LATE})
            THEN (${credits.montant} * (1 + COALESCE(${credits.taux}, 0) / 100) - COALESCE(CAST(${credits.soldeRestant} AS NUMERIC), 0))
            ELSE 0 END
          ), 0)`,
          montantEnAttente: sql<number>`COALESCE(SUM(CASE WHEN ${credits.statut} = ${StatutCredit.PENDING} THEN ${credits.montant} ELSE 0 END), 0)`
        }).from(credits).where(withAgence(credits)),

        // 3. Epargnes statistics - ONLY Savings accounts
        // CRITICAL: montantTotal must EXCLUDE PENDING_ACTIVATION accounts (virtual funds)
        db.select({
          total: count(),
          actifs: sql<number>`COUNT(CASE WHEN ${comptes.statut} = ${StatutCompte.ACTIVE} THEN 1 END)`,
          montantTotal: sql<number>`COALESCE(SUM(CASE WHEN ${comptes.statut} = ${StatutCompte.ACTIVE} THEN ${comptes.soldeCourant}::numeric ELSE 0 END), 0)`
        }).from(comptes).where(withAgence(comptes, eq(comptes.typeCompte, TypeCompte.SAVINGS))),

        // 4. Tontines statistics
        db.select({
          total: count(),
          actives: sql<number>`COUNT(CASE WHEN ${tontines.statut} = ${StatutParticipationTontine.ACTIVE} THEN 1 END)`
        }).from(tontines).where(withAgence(tontines)),

        // 5. Users/Agents statistics (Architecture V3: via userRoles)
        db.select({
          total: count(),
          actifs: sql<number>`COUNT(CASE WHEN ${users.statut} = ${StatutUser.ACTIVE} THEN 1 END)`
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(and(
          eq(userRoles.role, SystemRole.AGENT_TERRAIN),
          eq(userRoles.isPrimary, true)
        )),

        // 6. Caisse sessions ouvertes
        db.select({
          ouvertes: count()
        }).from(sessionsCaisse).where(withAgence(sessionsCaisse, isNull(sessionsCaisse.closedAt))),

        // 7. Weekly clients (last 7 days)
        db.select({
          count: count()
        }).from(clients).where(withAgence(clients, gte(clients.createdAt, sevenDaysAgo))),

        // 8. Weekly credits (last 7 days)
        db.select({
          count: count()
        }).from(credits).where(withAgence(credits, gte(credits.dateDebut, sevenDaysAgo))),

        // 8a. Daily clients (TODAY only)
        db.select({
          count: count()
        }).from(clients).where(withAgence(clients, sql`DATE(${clients.createdAt}) = CURRENT_DATE`)),

        // 8b. Daily credits (TODAY only)
        db.select({
          count: count()
        }).from(credits).where(
            withAgence(credits, and(
            sql`DATE(${credits.createdAt}) = CURRENT_DATE`,
            sql`${credits.statut} NOT IN (${StatutCredit.CANCELLED})`
          ))
        ),

        // 8b. Monthly credits (current month)
        db.select({
          count: count()
        }).from(credits).where(
          withAgence(credits, and(
            gte(credits.createdAt, sql`DATE_TRUNC('month', CURRENT_DATE)`),
            sql`${credits.statut} NOT IN (${StatutCredit.CANCELLED})`
          ))
        ),

        // 9. Monthly Evolution
        db.execute(sql`
          SELECT
            TO_CHAR(d, 'Mon') as name,
            (SELECT COUNT(*) FROM clients c WHERE c.created_at <= d AND (${sqlAgenceFilter('c')})) as clients,
            (SELECT COUNT(*) FROM credits cr WHERE cr.created_at <= d AND (${sqlAgenceFilter('cr')})) as credits,
            (SELECT COUNT(*) FROM comptes co WHERE co.created_at <= d AND (${sqlAgenceFilter('co')})) as epargne
          FROM generate_series(
            DATE_TRUNC('month', ${sixMonthsAgo.toISOString()}::date),
            DATE_TRUNC('month', ${now.toISOString()}::date),
            '1 month'
          ) d
        `),

        // 10. Weekly Activity
        db.execute(sql`
          SELECT
            TO_CHAR(d, 'Dy') as name,
            (SELECT COUNT(*) FROM operations_caisse oc JOIN sessions_caisse sc ON oc.session_id = sc.id WHERE DATE_TRUNC('day', oc.created_at) = d AND (${sqlAgenceFilter('sc')})) +
            (SELECT COUNT(*) FROM transactions_compte tc JOIN comptes co ON tc.compte_id = co.id WHERE DATE_TRUNC('day', tc.created_at) = d AND (${sqlAgenceFilter('co')})) as transactions,
            (SELECT COUNT(*) FROM remboursements r JOIN credits cr ON r.credit_id = cr.id WHERE DATE_TRUNC('day', r.created_at) = d AND (${sqlAgenceFilter('cr')})) as collectes
          FROM generate_series(
            DATE_TRUNC('day', ${sevenDaysAgo.toISOString()}::date),
            DATE_TRUNC('day', ${now.toISOString()}::date),
            '1 day'
          ) d
        `),

        // 11. Product Split
        db.select({
          type: sql<string>`'Crédits'`,
          count: count()
        }).from(credits).where(withAgence(credits))
        .unionAll(
          db.select({
            type: sql<string>`'Épargnes'`,
            count: count()
          }).from(comptes).where(withAgence(comptes))
        )
        .unionAll(
          db.select({
            type: sql<string>`'Tontines'`,
            count: count()
          }).from(tontines).where(withAgence(tontines))
        ),

        // 12. Credit Status Breakdown
        db.select({
          status: credits.statut,
          count: count()
        }).from(credits).where(withAgence(credits)).groupBy(credits.statut),

        // 13. Recent Activity Feed
        db.execute(sql`
          (SELECT 'Nouveau crédit' as action, 'Admin' as user, created_at as time, 'credit' as type FROM credits WHERE DATE(created_at) = CURRENT_DATE AND (${sqlAgenceFilter('credits')}) ORDER BY created_at DESC LIMIT 10)
          UNION ALL
          (SELECT 'Transaction épargne' as action, 'Caisse' as user, tc.created_at as time, 'savings' as type FROM transactions_compte tc JOIN comptes co ON tc.compte_id = co.id WHERE DATE(tc.created_at) = CURRENT_DATE AND (${sqlAgenceFilter('co')}) ORDER BY tc.created_at DESC LIMIT 10)
          UNION ALL
          (SELECT 'Nouveau client' as action, 'Agent' as user, created_at as time, 'client' as type FROM clients WHERE DATE(created_at) = CURRENT_DATE AND (${sqlAgenceFilter('clients')}) ORDER BY created_at DESC LIMIT 10)
          UNION ALL
          (SELECT 'Nouveau remboursement' as action, 'Caisse' as user, r.created_at as time, 'payment' as type FROM remboursements r JOIN credits cr ON r.credit_id = cr.id WHERE DATE(r.created_at) = CURRENT_DATE AND (${sqlAgenceFilter('cr')}) ORDER BY r.created_at DESC LIMIT 10)
          ORDER BY time DESC LIMIT 15
        `),

        // 14. Top Clients - Architecture V3: nom/prenom sont dans users
        db.select({
          name: sql<string>`COALESCE(${users.nom}, '') || ' ' || COALESCE(${users.prenom}, '')`,
          credits: count(credits.id),
          total: sql<number>`COALESCE(SUM(${credits.montant}), 0)`
        }).from(clients)
          .leftJoin(users, eq(clients.userId, users.id))
          .leftJoin(credits, and(
            eq(clients.id, credits.clientId),
            sql`${credits.statut} NOT IN (${StatutCredit.CANCELLED})`
          ))
          .where(withAgence(clients))
          .groupBy(clients.id, users.nom, users.prenom)
          .having(sql`SUM(${credits.montant}) > 0`)
          .orderBy(desc(sql`SUM(${credits.montant})`))
          .limit(5),

        // 15. Alerts
        db.select({
          type: sql<string>`'warning'`,
          message: sql<string>`'Crédits en retard'`,
          count: count()
        }).from(credits).where(withAgence(credits, eq(credits.statut, StatutCredit.LATE))),

        // 16. Upcoming Payments
        storage.getUpcomingEcheances({ agence: isAllAgences ? undefined : agenceId }),
      ]);

      // Process Monthly Evolution
      const monthlyData = monthlyGrowth.rows.map((row: any) => ({
        name: row.name,
        clients: Number(row.clients),
        credits: Number(row.credits),
        epargne: Number(row.epargne)
      }));

      // Process Weekly Activity
      const weeklyData = dailyActivity.rows.map((row: any) => ({
        name: row.name,
        transactions: Number(row.transactions),
        collectes: Number(row.collectes)
      }));

      // Process Product Split
      let totalProducts = 0;
      const productMap: Record<string, number> = {};
      productSplit.forEach((row: any) => {
        productMap[row.type] = Number(row.count);
        totalProducts += Number(row.count);
      });
      const productData = [
        { name: 'Crédits', value: totalProducts ? Math.round((productMap['Crédits'] / totalProducts) * 100) : 0, color: '#10b981' },
        { name: 'Épargnes', value: totalProducts ? Math.round((productMap['Épargnes'] / totalProducts) * 100) : 0, color: '#06b6d4' },
        { name: 'Tontines', value: totalProducts ? Math.round((productMap['Tontines'] / totalProducts) * 100) : 0, color: '#3b82f6' }
      ];

      // Process Credit Status
      let totalCreditsCount = 0;
      const statusMap: Record<string, number> = {};
      creditStatus.forEach(row => {
        statusMap[row.status || 'Autre'] = row.count;
        totalCreditsCount += row.count;
      });
      
      const creditStatusData = [
        { name: 'En cours', value: totalCreditsCount ? Math.round(((statusMap[StatutCredit.ACTIVE] || 0)) / totalCreditsCount * 100) : 0, color: '#10b981' },
        { name: 'En retard', value: totalCreditsCount ? Math.round((statusMap[StatutCredit.LATE] || 0) / totalCreditsCount * 100) : 0, color: '#f59e0b' },
        { name: 'Défaut', value: totalCreditsCount ? Math.round((statusMap['DEFAULT'] || 0) / totalCreditsCount * 100) : 0, color: '#ef4444' }, // DEFAULT not in enum? Assuming LATE covers it or separate enum
        { name: 'Remboursés', value: totalCreditsCount ? Math.round((statusMap[StatutCredit.PAID] || 0) / totalCreditsCount * 100) : 0, color: '#6366f1' }
      ];

      // Process Recent Activity
      const activityFeed = recentActivity.rows.map((row: any) => ({
        action: row.action,
        user: row.user,
        time: new Date(row.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: row.type
      }));

      // Process Top Clients
      const topClientsList = topClients.map(client => ({
        name: client.name,
        credits: client.credits,
        total: Number(client.total || 0)
      }));

      // Process Alerts
      const alertsList = [
        ...alertsData.map(a => ({
          id: 1, 
          type: 'warning' as const, 
          message: `${a.count} crédits en retard de paiement`, 
          time: 'Aujourd\'hui'
        })),
        { id: 2, type: 'info' as const, message: `${creditsStats[0].enAttente} demandes de crédit en attente`, time: 'En cours' }
      ].filter(a => !a.message.startsWith('0')); // Filter out empty alerts

      // Extract results
      const clientsData = clientsStats[0];
      const creditsData = creditsStats[0];
      const epargnesData = epargnesStats[0];
      const tontinesData = tontinesStats[0];
      const usersData = usersStats[0];
      const sessionsData = sessionsStats[0];
      const recentClientsData = weeklyClients[0];
      const recentCreditsData = weeklyCredits[0];

      // Calculate taux recouvrement
      const montantDecaisse = Number(creditsData.montantDecaisse) || 0;
      const montantRecouvre = Number(creditsData.montantRecouvre) || 0;
      
      const tauxRecouvrement = montantDecaisse > 0 
        ? Math.round((montantRecouvre / montantDecaisse) * 100) 
        : 0;

      // Build response
      const stats = {
        role: userRole,
        global: {
          totalClients: clientsData.total,
          clientsActifs: Number(clientsData.actifs) || 0,
          totalCredits: creditsData.total,
          creditsEnCours: Number(creditsData.enCours) || 0,
          creditsEnAttente: Number(creditsData.enAttente) || 0,
          creditsRetard: Number(creditsData.enRetard) || 0,
          montantCreditsTotal: Number(creditsData.montantTotal) || 0,
          montantDecaisse: montantDecaisse,
          montantRecouvre: montantRecouvre,
          montantEnAttente: Number(creditsData.montantEnAttente) || 0,
          tauxRecouvrement: tauxRecouvrement,
          totalEpargnes: epargnesData.total,
          epargneActive: Number(epargnesData.actifs) || 0,
          
          tontinesActives: Number(tontinesData.actives) || 0,
          totalTontines: tontinesData.total,

          // --- REPLACED WITH PRECISE FINANCIAL KPI SERVICE ---
          encaisse: financialStats.encaisse,           // NEW
          par30: financialStats.par30,                 // NEW
          liquidityRatio: financialStats.liquidite,    // NEW (Corrected calculation)
          tresorerieDispo: financialStats.encaisse,    // Alias for backward compatibility
          montantEpargneTotal: Number(epargnesData.montantTotal) || 0, // Keep for now
          
          agentsActifs: financialStats.agentsActifs.active, // NEW
          totalAgents: financialStats.agentsActifs.total,   // NEW
          // ------------------------------------------------

          sessionsOuvertes: sessionsData.ouvertes
        },
        daily: {
          nouveauxClients: Number(dailyClients[0]?.count) || 0,
          nouveauxCredits: Number(dailyCredits[0]?.count) || 0
        },
        weekly: {
          nouveauxClients: Number(weeklyClients[0]?.count) || 0,
          nouveauxCredits: Number(weeklyCredits[0]?.count) || 0
        },
        objectives: {
          monthlyCredits: Number(monthlyCredits[0]?.count) || 0,
          monthlyGoal: 30 // Objectif configurable par agence - par défaut 30 crédits/mois
        },
        charts: {
          monthlyGrowth: monthlyData,
          weeklyActivity: weeklyData,
          productSplit: productData,
          creditStatus: creditStatusData
        },
        widgets: {
          recentActivity: activityFeed,
          topClients: topClientsList,
          upcomingPayments: upcomingPaymentsData,
          alerts: alertsList
        }
      };

      res.json(stats);

    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ 
        message: "Erreur lors de la récupération des statistiques",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ========== LIGHTWEIGHT STATS ENDPOINT FOR SLOW CONNECTIONS ==========
  // Returns only essential KPIs (~5KB vs ~50KB for full stats)
  // Use this endpoint for initial load on 3G/slow networks
  app.get("/api/dashboard/stats-light", requireAuth, async (req, res) => {
    try {
      // Cache for 60 seconds - lightweight endpoint can be cached longer
      res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
      res.setHeader('Vary', 'X-Agence-Id');

      const agenceId = req.headers['x-agence-id'] as string;
      const isAllAgences = !agenceId || agenceId === 'all';

      // Helper function to apply agence filter
      const withAgence = (table: any, filter: any = null) => {
        if (isAllAgences) return filter ? filter : undefined;
        const agenceFilter = eq(table.agenceId, agenceId);
        return filter ? and(filter, agenceFilter) : agenceFilter;
      };

      // Minimal parallel queries - only essential KPIs
      const [
        financialStats,
        clientsCount,
        creditsCount,
        sessionsCount
      ] = await Promise.all([
        // Financial KPIs (uses optimized service)
        getGlobalStats(isAllAgences ? undefined : agenceId),

        // Total clients count only
        db.select({
          total: count(),
          actifs: sql<number>`COUNT(CASE WHEN ${users.statut} = ${StatutClient.ACTIVE} THEN 1 END)`
        }).from(clients)
          .leftJoin(users, eq(clients.userId, users.id))
          .where(withAgence(clients)),

        // Credits summary only
        db.select({
          total: count(),
          enCours: sql<number>`COUNT(CASE WHEN ${credits.statut} = ${StatutCredit.ACTIVE} THEN 1 END)`,
          enRetard: sql<number>`COUNT(CASE WHEN ${credits.statut} = ${StatutCredit.LATE} THEN 1 END)`
        }).from(credits).where(withAgence(credits)),

        // Open sessions count
        db.select({
          ouvertes: count()
        }).from(sessionsCaisse).where(withAgence(sessionsCaisse, isNull(sessionsCaisse.closedAt)))
      ]);

      // Minimal response payload (~5KB instead of ~50KB)
      const statsLight = {
        kpis: {
          totalClients: clientsCount[0]?.total || 0,
          clientsActifs: Number(clientsCount[0]?.actifs) || 0,
          totalCredits: creditsCount[0]?.total || 0,
          creditsEnCours: Number(creditsCount[0]?.enCours) || 0,
          creditsEnRetard: Number(creditsCount[0]?.enRetard) || 0,
          encaisse: financialStats.encaisse,
          par30: financialStats.par30,
          liquidite: financialStats.liquidite,
          sessionsOuvertes: sessionsCount[0]?.ouvertes || 0
        },
        // Flag to indicate this is lightweight data
        isLightweight: true,
        timestamp: new Date().toISOString()
      };

      res.json(statsLight);

    } catch (error) {
      console.error('Error fetching lightweight dashboard stats:', error);
      res.status(500).json({
        message: "Erreur lors de la récupération des statistiques légères",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Balance History endpoint for the chart
  app.get("/api/dashboard/balance-history", requireAuth, async (req, res) => {
    try {
      res.setHeader('Vary', 'X-Agence-Id');
      const agenceId = req.headers['x-agence-id'] as string;
      const isAllAgences = !agenceId || agenceId === 'all';
      
      const sqlAgenceFilter = (tableAlias: string) => {
        if (isAllAgences) return sql`TRUE`;
        return sql`${sql.raw(tableAlias)}.agence_id = ${agenceId}`;
      };

      const period = (req.query.period as string) || '30d';
      let daysBack = 30;
      
      switch (period) {
        case '7d': daysBack = 7; break;
        case '30d': daysBack = 30; break;
        case '90d': daysBack = 90; break;
        case '1y': daysBack = 365; break;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get cumulative totals per day
      const result = await db.execute(sql`
        WITH date_series AS (
          SELECT generate_series(
            ${startDate.toISOString()}::date,
            CURRENT_DATE,
            '1 day'::interval
          )::date AS day
        ),
        daily_credits AS (
          SELECT
            day,
            COALESCE((
              SELECT SUM(montant)::numeric
              FROM credits c
              WHERE statut NOT IN (${sql.raw(`'${StatutCredit.CANCELLED}'`)})
              AND DATE(created_at) <= day
              AND (${sqlAgenceFilter('c')})
            ), 0) as credits_total
          FROM date_series
        ),
        daily_epargnes AS (
          SELECT
            day,
            COALESCE((
              SELECT SUM(solde_courant)::numeric
              FROM comptes co
              WHERE DATE(created_at) <= day
              AND co.statut = 'ACTIVE'
              AND (${sqlAgenceFilter('co')})
            ), 0) as epargnes_total
          FROM date_series
        )
        SELECT
          dc.day,
          dc.credits_total,
          de.epargnes_total,
          (dc.credits_total + de.epargnes_total) as solde_total
        FROM daily_credits dc
        JOIN daily_epargnes de ON dc.day = de.day
        ORDER BY dc.day ASC
      `);

      const data = result.rows.map((row: any) => ({
        date: new Date(row.day).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        fullDate: row.day,
        solde: Number(row.solde_total) || 0,
        credits: Number(row.credits_total) || 0,
        epargnes: Number(row.epargnes_total) || 0
      }));

      res.json(data);
    } catch (error) {
      console.error('Error fetching balance history:', error);
      res.status(500).json({ 
        message: "Erreur lors de la récupération de l'historique",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Global Search endpoint
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const query = (req.query.q as string || '').trim();
      
      if (!query || query.length < 2) {
        return res.json({ clients: [], credits: [], tontines: [], agents: [] });
      }

      const searchPattern = `%${query}%`;

      // Parallel search across all entities
      // Architecture V3: nom/prenom/email/telephone sont dans users
      const [clientsResults, creditsResults, tontinesResults, agentsResults] = await Promise.all([
        // Search clients (via users table for identity fields)
        db.select({
          id: clients.id,
          nom: users.nom,
          prenom: users.prenom,
          email: users.email,
          telephone: users.telephone,
          statut: users.statut
        })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(or(
          ilike(sql`COALESCE(${users.nom}, '')`, searchPattern),
          ilike(sql`COALESCE(${users.prenom}, '')`, searchPattern),
          ilike(sql`COALESCE(${users.email}, '')`, searchPattern),
          ilike(sql`COALESCE(${users.telephone}, '')`, searchPattern)
        ))
        .limit(5),

        // Search credits by type or object, joined with client name
        db.select({
          id: credits.id,
          typeCredit: credits.typeCredit,
          montant: credits.montant,
          statut: credits.statut,
          clientNom: users.nom
        })
        .from(credits)
        .leftJoin(clients, eq(credits.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(or(
          ilike(sql`COALESCE(${credits.typeCredit}, '')`, searchPattern),
          ilike(sql`COALESCE(${credits.objetCredit}, '')`, searchPattern),
          ilike(sql`COALESCE(${users.nom}, '')`, searchPattern)
        ))
        .limit(5),

        // Search tontines
        db.select({
          id: tontines.id,
          nom: tontines.nom,
          statut: tontines.statut,
          montantCotisation: tontines.montantCotisation
        })
        .from(tontines)
        .where(ilike(tontines.nom, searchPattern))
        .limit(5),

        // Search agents terrain - Architecture V3: nom/prenom via employes->users
        db.select({
          id: agentsTerrain.id,
          zoneAffectation: agentsTerrain.zoneAffectation,
          statut: agentsTerrain.statut
        })
        .from(agentsTerrain)
        .where(
          ilike(agentsTerrain.zoneAffectation, searchPattern)
        )
        .limit(5)
      ]);

      res.json({
        clients: clientsResults.map(c => ({ ...c, type: 'client' })),
        credits: creditsResults.map(c => ({ ...c, type: 'credit' })),
        tontines: tontinesResults.map(t => ({ ...t, type: 'tontine' })),
        agents: agentsResults.map(a => ({ ...a, type: 'agent' }))
      });
    } catch (error) {
      console.error('Error in global search:', error);
      res.status(500).json({ 
        message: "Erreur lors de la recherche",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
