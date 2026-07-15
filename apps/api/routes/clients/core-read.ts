import type { Express } from "express";

import {
  StatutClient,
  StatutCompte,
  StatutCredit,
  StatutDemande,
  TypeCompte,
} from "@shared/enum/status-constants";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { requireAgenceIdAccess } from "../../middleware";
import { storage } from "../../storage";
import { paginateResponse, parsePagination } from "../utils";

const logger = createLogger('Routes:Clients:Read');

/**
 * Routes de lecture des clients.
 *
 * - GET /api/clients          — Liste paginée, filtrée par agence
 * - GET /api/clients/search   — Recherche texte paginée côté serveur
 * - GET /api/clients/with-location — Clients avec coordonnées GPS
 * - GET /api/clients/:id      — Détail d'un client avec limites de retrait
 */
export function registerClientReadRoutes(app: Express) {

  // LISTE CLIENTS : Filtrée par agence (supporte agenceId via header ou agence legacy)
  app.get("/api/clients", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // req.agenceFilter contient { agenceId: "..." } ou { agence: "..." } ou null (admin)
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      // On passe le filtre directement au storage qui l'applique en SQL
      const filter = agenceFilter || {};
      const { page, perPage } = parsePagination(req.query);
      const { data, total } = await storage.getClientsPaginated(filter, page, perPage);

      const transformed = data as unknown[];
      res.json(
        paginateResponse(transformed, total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: filter,
        })
      );
    } catch (e) {
      logger.error({ err: e }, 'Échec de la récupération des clients');
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });


  // RECHERCHE : Filtrée par agence — OPTIMISÉ avec SQL (évite N+1) + pagination serveur (P1.5)
  app.get("/api/clients/search", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return res.json([]);

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        const { page, perPage, offset } = parsePagination(req.query);

        // Normaliser la requête pour une recherche insensible aux accents
        const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const searchPattern = `%${normalizedQuery}%`;

        // Construire la condition d'agence
        const agenceCondition = agenceFilter?.agenceId
          ? sql`AND c.agence_id = ${agenceFilter.agenceId}`
          : sql``;

        // P1.5 : Pagination serveur avec fonction de fenêtrage COUNT(*) OVER()
        const results = await db.execute(sql`
          WITH client_search AS (
            SELECT
              c.id,
              c.agence_id,
              c.numero_piece,
              p.nom as profession,
              c.segment,
              c.created_at,
              c.revenu_mensuel,
              c.revenu_journalier,
              c.type_revenu,
              u.nom,
              u.prenom,
              u.email,
              u.telephone,
              u.photo_profile,
              u.statut as user_statut,
              a.nom as agence_nom
            FROM clients c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN agences a ON c.agence_id = a.id
            LEFT JOIN professions p ON c.profession_id = p.id
            WHERE (
              LOWER(UNACCENT(COALESCE(u.nom, ''))) LIKE LOWER(UNACCENT(${searchPattern}))
              OR LOWER(UNACCENT(COALESCE(u.prenom, ''))) LIKE LOWER(UNACCENT(${searchPattern}))
              OR LOWER(COALESCE(u.email, '')) LIKE LOWER(${searchPattern})
              OR u.telephone LIKE ${searchPattern}
              OR LOWER(UNACCENT(COALESCE(u.nom, '') || ' ' || COALESCE(u.prenom, ''))) LIKE LOWER(UNACCENT(${searchPattern}))
            )
            ${agenceCondition}
          ),
          eligibility AS (
            SELECT
              cs.id,
              -- Vérifier si le client est actif
              CASE WHEN cs.user_statut = ${StatutClient.ACTIVE} THEN TRUE ELSE FALSE END as is_active,
              -- Vérifier s'il possède un compte courant actif (EXISTS plus rapide que COUNT)
              EXISTS (
                SELECT 1 FROM comptes co
                WHERE co.client_id = cs.id
                  AND co.type_compte = ${TypeCompte.CURRENT}
                  AND co.statut = ${StatutCompte.ACTIVE}
              ) as has_compte_courant,
              -- Vérifier s'il possède un crédit actif
              EXISTS (
                SELECT 1 FROM credits cr
                WHERE cr.client_id = cs.id
                  AND cr.statut IN (${StatutCredit.ACTIVE}, ${StatutCredit.LATE})
              ) as has_active_credit,
              -- Vérifier s'il possède une demande en cours
              EXISTS (
                SELECT 1 FROM demandes_credit dc
                WHERE dc.client_id = cs.id
                  AND dc.statut IN (${StatutDemande.PENDING_FEES}, ${StatutDemande.READY_FOR_INVESTIGATION}, ${StatutDemande.UNDER_INVESTIGATION}, ${StatutDemande.APPROVED})
              ) as has_pending_demande
            FROM client_search cs
          )
          SELECT
            cs.*,
            e.is_active,
            e.has_compte_courant,
            e.has_active_credit,
            e.has_pending_demande,
            CASE
              WHEN NOT e.is_active THEN FALSE
              WHEN NOT e.has_compte_courant THEN FALSE
              WHEN e.has_active_credit THEN FALSE
              WHEN e.has_pending_demande THEN FALSE
              ELSE TRUE
            END as is_eligible,
            CASE
              WHEN NOT e.is_active THEN 'Client Inactif/Suspendu'
              WHEN NOT e.has_compte_courant THEN 'Pas de Compte Courant Actif'
              WHEN e.has_active_credit THEN 'Crédit en cours'
              WHEN e.has_pending_demande THEN 'Dossier déjà en cours'
              ELSE NULL
            END as ineligibility_reason,
            COUNT(*) OVER() as total_count
          FROM client_search cs
          JOIN eligibility e ON cs.id = e.id
          ORDER BY cs.nom, cs.prenom
          LIMIT ${perPage}
          OFFSET ${offset}
        `);

        // Récupérer le total depuis la fonction de fenêtrage
        const total = results.rows.length > 0 ? Number((results.rows[0] as any).total_count) : 0;

        // Transformer les résultats pour correspondre au format attendu
        const enrichedResults = results.rows.map((row: any) => ({
          id: row.id,
          agenceId: row.agence_id,
          numeroPiece: row.numero_piece,
          profession: row.profession,
          segment: row.segment,
          statut: row.user_statut,
          createdAt: row.created_at,
          nom: row.nom,
          prenom: row.prenom,
          email: row.email,
          telephone: row.telephone,
          photoProfile: row.photo_profile,
          agence_nom: row.agence_nom,
          isEligible: row.is_eligible,
          ineligibilityReason: row.ineligibility_reason,
          revenuMensuel: row.revenu_mensuel,
          revenuJournalier: row.revenu_journalier,
          typeRevenu: row.type_revenu,
        }));

        logger.debug({ total, page, perPage, query: normalizedQuery }, 'Résultats de recherche (pagination SQL)');

        res.json(
          paginateResponse(enrichedResults as unknown[], total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
            filters: { q: query },
          })
        );
    } catch (e) {
        logger.error({ err: e }, 'Échec de la recherche');
        res.status(500).json({ message: "Search failed" });
    }
  });


  // RECHERCHE AVEC LOCALISATION : Filtré par agence
  app.get("/api/clients/with-location", requireAuth, requireAgenceIdAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const filter = agenceFilter || {};

      const clients = await storage.getAllClients(filter);
      const withLoc = clients.filter(c => c.latitude && c.longitude);
      const { page, perPage, offset } = parsePagination(req.query);
      const total = withLoc.length;
      const paged = withLoc.slice(offset, offset + perPage);
      res.json(
        paginateResponse(paged as unknown[], total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: filter,
        })
      );
  });


  // GET ONE : Vérification manuelle de l'agence
  app.get("/api/clients/:id", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    // Valider l'UUID pour éviter de planter la BDD avec une syntaxe invalide (ex. "eligible-credit" fallthrough)
    if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
    }

    const client = await storage.getClient(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    // Vérifier si l'utilisateur a le droit de voir ce client spécifique
    const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
    if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
      return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
    }

    // Calcul des limites de retrait
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Début de semaine (Lundi)
    const startWeek = new Date(now);
    const day = startWeek.getDay() || 7; // Dimanche = 0 -> 7
    if (day !== 1) startWeek.setHours(-24 * (day - 1));
    startWeek.setHours(0, 0, 0, 0);

    // Début de mois
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Utiliser mouvementsFinanciers (source de vérité) pour suivre tous les types de retrait
    const withdrawalsToday = await storage.getMouvementsByClientAndDateRange(client.id, startToday, endToday, 'retrait');
    const withdrawalsWeek = await storage.getMouvementsByClientAndDateRange(client.id, startWeek, endToday, 'retrait');
    const withdrawalsMonth = await storage.getMouvementsByClientAndDateRange(client.id, startMonth, endToday, 'retrait');

    const sum = (ops: any[]) => ops.reduce((acc, op) => acc + Number(op.montant), 0);
    const usedToday = sum(withdrawalsToday);
    const usedWeek = sum(withdrawalsWeek);
    const usedMonth = sum(withdrawalsMonth);

    const result = {
      ...(client as any),
      security_limits: {
        daily: {
          limit: Number(client.limiteRetraitJournalier),
          used: usedToday,
          remaining: Math.max(0, Number(client.limiteRetraitJournalier) - usedToday)
        },
        weekly: {
          limit: Number(client.limiteRetraitHebdomadaire),
          used: usedWeek,
          remaining: Math.max(0, Number(client.limiteRetraitHebdomadaire) - usedWeek)
        },
        monthly: {
          limit: Number(client.limiteRetraitMensuel),
          used: usedMonth,
          remaining: Math.max(0, Number(client.limiteRetraitMensuel) - usedMonth)
        }
      }
    };

    res.json(result);
  });
}
