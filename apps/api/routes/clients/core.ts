import type { Express, Request } from "express";

import { createLogger } from "../../lib/logger";

import { insertTagSchema, insertClientTagSchema, insertClientActivitySchema, clientTags, clientActivities, users, clients, agences, professions, membresTontine, mouvementsFinanciers, comptes, credits, tontines, remboursements, contributionsTontine, clientDocumentSchema, clientDocumentsArraySchema, enquetesCredit, demandesCredit, creditPlans, type ClientDocument } from "@shared/schema";

import { getTransactionLabel } from "@shared/config/transaction-labels";

const logger = createLogger('Routes:Clients');

import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  StatutClient,
  SegmentClient,
  TypeCompte,
  MethodePaiement,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";

import { StorageService } from '../../services/storage-service';

import { storage } from "../../storage";

import { getClientTags, addClientTag, removeClientTag, createTag, deleteTag, getAllTags, logClientActivity, getClientActivities, getClientByUserId, getClientWithUser, getClientStats, createClientApiSchema, updateClientApiSchema, type ClientFull } from "../../storage/clients";

import { requireAuth, hashPassword } from "../../auth";

import { attachAbility, requireAbility, requireAnyAbility } from "../../authorization";

import { Actions, Subjects } from "@shared/ability";

import { SystemRole } from "@shared/types/roles";

import { requireAgenceAccess, validateAgenceAction, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";

import { logAudit } from "../../audit";

import { normalizeKeysDeep, coerceValueToSchema, parsePagination, paginateResponse } from "../utils";

import { recalculateClientScore, recordScoreEvent, getScoreHistory, getScoreState, getScoreTrend, getAgencyScoreStats, getScorePercentile } from "../../services/scoring-engine";

import { z } from "zod";

import { db } from "../../db";

import { eq, sql, or, isNull, and, gte, lte, desc } from "drizzle-orm";

import { getComptesByClient, getCreditsByClient, getDemandesByClient } from "../../storage/finance";

import { autoCreateCourantAccount } from "../../services/comptes";

import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";

import { evaluateClientAlerts, resolveClientAlert, resolveAllClientAlerts, snoozeClientAlert, getAlertsSummary, getAlertsSummaryPaginated, KNOWN_ALERT_TYPES } from "../../services/client-alerts";

import { normalizePhone } from "@shared/utils/phone";

function getTransactionIcon(sourceModule: string, typePaiement?: string): string {
    const type = (typePaiement || sourceModule || '').toLowerCase();
    if (type.includes('crédit') || type.includes('credit')) return 'credit-card';
    if (type.includes('épargne') || type.includes('epargne')) return 'piggy-bank';
    if (type.includes('tontine')) return 'users';
    if (type.includes('retrait')) return 'arrow-up-right';
    if (type.includes('dépôt') || type.includes('depot') || type.includes('versement')) return 'arrow-down-left';
    if (type.includes('remboursement')) return 'refresh-cw';
    if (type.includes('décaissement') || type.includes('decaissement')) return 'banknote';
    return 'activity';
}

export function registerClientCoreRoutes(app: Express) {


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
      logger.error({ err: e }, 'Failed to fetch clients');
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });


  // RECHERCHE : Filtrée par agence - OPTIMISÉ avec SQL (évite N+1) + pagination serveur (P1.5)
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

        // P1.5: Server-side pagination with COUNT(*) OVER() window function
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
              -- Check if client is active
              CASE WHEN cs.user_statut = ${StatutClient.ACTIVE} THEN TRUE ELSE FALSE END as is_active,
              -- Check if has active current account (EXISTS is faster than COUNT)
              EXISTS (
                SELECT 1 FROM comptes co
                WHERE co.client_id = cs.id
                  AND co.type_compte = ${TypeCompte.CURRENT}
                  AND co.statut = ${StatutCompte.ACTIVE}
              ) as has_compte_courant,
              -- Check if has active credit
              EXISTS (
                SELECT 1 FROM credits cr
                WHERE cr.client_id = cs.id
                  AND cr.statut IN (${StatutCredit.ACTIVE}, ${StatutCredit.LATE})
              ) as has_active_credit,
              -- Check if has pending demande
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

        logger.debug({ total, page, perPage, query: normalizedQuery }, 'Search results (SQL pagination)');

        res.json(
          paginateResponse(enrichedResults as unknown[], total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
            filters: { q: query },
          })
        );
    } catch (e) {
        logger.error({ err: e }, 'Search failed');
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


  // GET ONE: Vérification manuelle de l'agence
  app.get("/api/clients/:id", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    // Valider l'UUID pour éviter de planter la BDD avec une syntaxe invalide (e.g. "eligible-credit" fallthrough)
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

    // Calcule des limites de retrait
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


  // IMPORT EN MASSE
  app.post("/api/clients/bulk", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      // Validation du tableau avec le nouveau schema API (Architecture V3)
      const schema = z.array(createClientApiSchema);
      const data = schema.parse(req.body);

      // Insertion en masse via le storage (qui gère la transaction)
      const clients = await storage.createClientsBulk(data);

      // Score initial pour chaque client importé (non-bloquant)
      try {
        const batchSize = 20;
        for (let i = 0; i < clients.length; i += batchSize) {
          const batch = clients.slice(i, i + batchSize);
          await Promise.allSettled(
            batch.map(c =>
              recordScoreEvent({
                clientId: c.id,
                agenceId: c.agenceId || undefined,
                eventType: 'INITIAL_SCORE',
                refId: `initial-${c.id}`,
                refType: 'client',
                createdBy: req.session.user?.id,
              })
            )
          );
        }
      } catch (scoreErr) {
        logger.error({ err: scoreErr }, 'Failed to seed scores for bulk import');
      }

      await logAudit(
        req,
        "IMPORT_CLIENTS_BULK",
        "client",
        "BULK",
        { count: clients.length },
        "success",
        "high"
      );

      res.status(201).json({
        success: true,
        count: clients.length,
        ids: clients.map(c => c.id)
      });
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json(e);
      logger.error({ err: e }, 'Bulk import error');
      res.status(500).json({ message: "Bulk import failed" });
    }
  });


  // CREATE: Validation de l'agence cible (supporte agenceId)
  app.post("/api/clients", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, unknown>;

        // Valider le tableau de documents séparément pour de meilleurs messages d'erreur
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (!docsResult.success) {
            logger.warn({ err: docsResult.error }, 'Documents validation failed');
            // Autoriser quand même la création, journaliser simplement le problème de validation
          } else {
            validatedDocuments = docsResult.data;
          }

          // Vérifier que les documents privés utilisent les clés du bucket secure-docs
          if (validatedDocuments) {
            validatedDocuments = validatedDocuments.map(doc => {
              // S'assurer que les docs privés ont un format de chemin correct (pas d'URL complètes)
              if (doc.isPrivate && doc.documentUrl.startsWith('http')) {
                logger.warn({ documentType: doc.documentType }, 'Document has full URL for private doc, should be object key');
              }
              return doc;
            });
          }
        }



        // Architecture V3: Utiliser le nouveau schema API qui sépare identité et métier
        const parsed = createClientApiSchema.parse(data);

        // ── Duplicate guard ──────────────────────────────────────────────
        {
          const dupChecks = [];
          const cleanPhone = normalizePhone(parsed.telephone) || parsed.telephone?.trim();
          const cleanEmail = parsed.email?.trim();
          if (cleanPhone) dupChecks.push(eq(users.telephone, cleanPhone));
          if (cleanEmail) dupChecks.push(eq(users.email, cleanEmail));
          if (parsed.nom && parsed.prenom) {
            dupChecks.push(
              and(
                sql`lower(${users.nom}) = lower(${parsed.nom.trim()})`,
                sql`lower(${users.prenom}) = lower(${parsed.prenom.trim()})`,
              )!
            );
          }
          if (dupChecks.length > 0) {
            const existing = await db
              .select({ id: clients.id, nom: users.nom, prenom: users.prenom, telephone: users.telephone, email: users.email })
              .from(clients)
              .leftJoin(users, eq(clients.userId, users.id))
              .where(or(...dupChecks))
              .limit(1);
            if (existing.length > 0) {
              const dup = existing[0];
              const dupName = `${dup.nom} ${dup.prenom || ''}`.trim();
              let field = '';
              if (parsed.nom && parsed.prenom && dup.nom?.toLowerCase() === parsed.nom.trim().toLowerCase() && dup.prenom?.toLowerCase() === parsed.prenom.trim().toLowerCase()) field = 'nom';
              else if (cleanPhone && dup.telephone === cleanPhone) field = 'telephone';
              else if (cleanEmail && dup.email?.toLowerCase() === cleanEmail.toLowerCase()) field = 'email';
              return res.status(409).json({ message: `Un client avec ce ${field || 'identifiant'} existe déjà : ${dupName}`, field });
            }
          }
        }

        // Utiliser les documents validés si disponibles, sinon utiliser ceux analysés
        const clientData = validatedDocuments
          ? { ...parsed, documents: validatedDocuments }
          : parsed;

        // L'agenceId a été validée/forcée par validateAgenceIdAction
        // Si elle manquait, validateAgenceIdAction l'a ajoutée depuis req.selectedAgenceId

        const createdClient = await storage.createClient(clientData);

        // Relocate files from temp UUID to real entity ID
        const tempEntityId = clientData.tempEntityId;
        if (tempEntityId && tempEntityId !== createdClient.id) {
          try {
            const keyMapping = await StorageService.relocateEntityFiles('client', tempEntityId, createdClient.id);

            if (keyMapping.size > 0) {
              // Update users.photoProfile if path changed
              if (createdClient.userId) {
                const [currentUser] = await db.select({ photoProfile: users.photoProfile })
                  .from(users).where(eq(users.id, createdClient.userId));

                if (currentUser?.photoProfile && keyMapping.has(currentUser.photoProfile)) {
                  await db.update(users)
                    .set({ photoProfile: keyMapping.get(currentUser.photoProfile)! })
                    .where(eq(users.id, createdClient.userId));
                }
              }

              // Update clients.documents JSONB array
              if (createdClient.documents && Array.isArray(createdClient.documents)) {
                const updatedDocs = (createdClient.documents as any[]).map(doc => {
                  if (doc.documentUrl && keyMapping.has(doc.documentUrl)) {
                    return { ...doc, documentUrl: keyMapping.get(doc.documentUrl) };
                  }
                  return doc;
                });
                await db.update(clients)
                  .set({ documents: updatedDocs })
                  .where(eq(clients.id, createdClient.id));
              }
            }

            // Cleanup any remaining temp files
            await StorageService.deleteEntityFiles('client', tempEntityId);
          } catch (relocateError) {
            logger.error({ err: relocateError, clientId: createdClient.id }, 'File relocation failed');
          }
        }

        // Récupérer le client complet avec les données fusionnées (nom, prenom depuis users)
        const client = await storage.getClient(createdClient.id);
        if (!client) {
          throw new Error("Client créé mais non récupérable");
        }

        // Auto-création d'un compte courant via le système produit
        let compteCourant = null;
        try {
          const autoResult = await autoCreateCourantAccount(client.id, client.agenceId!, req.session.user?.id!);
          compteCourant = autoResult.compte;
          logger.info({
            numeroCompte: compteCourant.numeroCompte,
            clientId: client.id,
            statut: compteCourant.statut,
            isPending: autoResult.isPending,
          }, 'Compte courant auto-created for client');
        } catch (accountError) {
          logger.error({ err: accountError, clientId: client.id }, 'Failed to create automatic current account for client');
        }

        // agence_nom est déjà fourni par getClient via JOIN
        const agenceNom = client.agence_nom;

        await logAudit(
            req,
            "CREATE_CLIENT",
            "client",
            client.id,
            undefined,
            "success",
            "low"
        );

        // Domain event: client created (welcome notification)
        dispatchDomainEvent({
          type: "CLIENT_CREATED",
          data: {
            clientId: client.id,
            clientNom: client.nom,
            clientPrenom: client.prenom || undefined,
            telephone: client.telephone || undefined,
            email: client.email || undefined,
            agenceId: client.agenceId || undefined,
            agenceNom: agenceNom || undefined,
            numeroCompte: compteCourant?.numeroCompte || undefined,
          },
          timestamp: new Date(),
          agenceId: client.agenceId || undefined,
        });

        // Score initial
        try {
          await recordScoreEvent({
            clientId: client.id,
            agenceId: client.agenceId || undefined,
            eventType: 'INITIAL_SCORE',
            refId: `initial-${client.id}`,
            refType: 'client',
            createdBy: req.session.user?.id,
          });
        } catch (scoreErr) {
          logger.error({ err: scoreErr, clientId: client.id }, 'Failed to create initial score');
        }

        // Update Dashboard & Lists via WebSocket
        const wsServer = await import("../../ws-server"); // Dynamic import for ESM
        const wsInstance = wsServer.getWsInstance();

        if (wsInstance) {
            // Notifier dashboard global (stats)
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });

            // Notifier liste clients (filtrée côté client)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client.agenceId } });

            // Activité en temps réel
            const accountInfo = compteCourant ? ` + Compte ${compteCourant.numeroCompte}` : '';
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Nouveau client: ${client.nom}${client.prenom ? ' ' + client.prenom : ''}${accountInfo}`,
                user: req.session.user?.nom || 'Système',
                type: 'client',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId // Pour filtrage côté client
              }
            });
        }

        res.status(201).json({
            ...client,
            agence_nom: agenceNom,
        });
      } catch (e) {
        // Cleanup temp files if creation failed (not on validation errors)
        if (!(e instanceof z.ZodError)) {
          const tempId = req.body?.tempEntityId || req.body?.temp_entity_id;
          if (tempId) {
            StorageService.deleteEntityFiles('client', tempId)
              .catch(err => logger.error({ err }, 'Cleanup temp files failed'));
          }
        }
        if (e instanceof z.ZodError) return res.status(400).json(e);
        logger.error({ err: e }, 'Create client error');
        res.status(500).json({ message: "Create client failed" });
      }
  });


  // UPDATE: Vérification accès + interdiction changer agence (roles: admin, chef, caisse, terrain, credit)
  app.patch("/api/clients/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
      try {
        const existing = await storage.getClient(req.params.id);
        if (!existing) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        if (agenceFilter?.agenceId && existing.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }

        const data = normalizeKeysDeep(req.body) as Record<string, unknown>;

        // Validate documents array if provided
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (docsResult.success) {
            validatedDocuments = docsResult.data;
          }
        }

        // Architecture V3: Utiliser le schema API pour mises à jour partielles
        const parsed = updateClientApiSchema.parse(data);

        // Merge validated documents
        const updateData = validatedDocuments !== undefined
          ? { ...parsed, documents: validatedDocuments }
          : parsed;

        // Empêcher changement d'agence si non admin
        if (agenceFilter?.agenceId && updateData.agenceId && updateData.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Impossible de changer l'agence du client" });
        }

        // Check for file replacement and cleanup old file
        if (updateData.photoProfile && existing.photoProfile && updateData.photoProfile !== existing.photoProfile) {
             // If old photo was a URL (not base64), delete it
             if (!existing.photoProfile.startsWith('data:')) {
                 StorageService.deleteFileFromUrl(existing.photoProfile).catch((e: any) =>
                    logger.error({ err: e }, 'Failed to delete old profile photo')
                 );
             }
        }

        const client = await storage.updateClient(req.params.id, updateData);

        // ====== SYNC: Auto-update statutVerificationPiece from document statuses ======
        if (validatedDocuments && client) {
          const ID_DOC_TYPES = ['ID_CARD_FRONT', 'ID_CARD_BACK', 'PASSPORT', 'DRIVING_LICENSE', 'RESIDENT_CARD'];
          const idDocs = validatedDocuments.filter(d => ID_DOC_TYPES.includes(d.documentType));

          if (idDocs.length > 0) {
            const allVerified = idDocs.every(d => d.status === 'verified');
            const anyRejected = idDocs.some(d => d.status === 'rejected');

            const newPieceStatus = anyRejected ? 'REJECTED' : allVerified ? 'VERIFIED' : 'PENDING';

            if (newPieceStatus !== existing.statutVerificationPiece) {
              await db.update(clients).set({
                statutVerificationPiece: newPieceStatus,
                ...(newPieceStatus === 'VERIFIED' ? {
                  verificationPieceBy: req.session.user?.id || null,
                  verificationPieceDate: new Date(),
                } : {}),
              }).where(eq(clients.id, req.params.id));

              // Refresh client to include the updated field in the response
              Object.assign(client, {
                statutVerificationPiece: newPieceStatus,
                ...(newPieceStatus === 'VERIFIED' ? {
                  verificationPieceDate: new Date(),
                } : {}),
              });

              logger.info({
                clientId: req.params.id,
                oldStatus: existing.statutVerificationPiece,
                newStatus: newPieceStatus,
                docCount: idDocs.length,
              }, 'Auto-synced statutVerificationPiece from document statuses');
            }
          }
        }

        // ====== BUSINESS LOGIC: Account Freezing on Client Status Change ======
        const INACTIVE_STATUSES = [StatutClient.INACTIVE, StatutClient.SUSPENDED] as string[];
        const wasActive = !INACTIVE_STATUSES.includes(existing.statut || '');
        const isNowInactive = INACTIVE_STATUSES.includes(client?.statut || '');
        
        if (wasActive && isNowInactive && client) {
            // Freeze all client accounts
            const accounts = await getComptesByClient(client.id);
            for (const account of accounts) {
                if (account.statut === StatutCompte.ACTIVE && !account.blocageActif) {
                    await storage.updateCompte(account.id, {
                        blocageActif: true,
                        blocageMotif: 'INTERNAL_DECISION',
                        blocageReference: `CLIENT_STATUS:${client.statut}`,
                        blocageDebut: new Date()
                    });
                }
            }
            logger.info({ accountCount: accounts.length, clientId: client.id, statut: client.statut }, 'Frozen accounts for client due to status change');
        }
        // ====== END BUSINESS LOGIC ======

        // Score events: KYC_VERIFIED and PROFILE_COMPLETED
        try {
          if (client) {
            // KYC_VERIFIED: when KYC status or piece verification changes to VERIFIED
            const kycVerified = ['VERIFIED', 'COMPLETE'].includes(client.kycStatus || '');
            const wasKycVerified = ['VERIFIED', 'COMPLETE'].includes(existing.kycStatus || '');
            const pieceNowVerified = client.statutVerificationPiece === 'VERIFIED';
            const pieceWasVerified = existing.statutVerificationPiece === 'VERIFIED';
            if ((kycVerified && !wasKycVerified) || (pieceNowVerified && !pieceWasVerified)) {
              await recordScoreEvent({
                clientId: client.id,
                agenceId: client.agenceId || undefined,
                eventType: 'KYC_VERIFIED',
                refId: `kyc-${client.id}`,
                refType: 'client',
                createdBy: req.session.user?.id,
              });
            }

            // PROFILE_COMPLETED: when profile reaches completeness threshold (4+ fields)
            const profileFields = [client.adresseDomicile, client.professionId, client.numeroPiece, client.typePiece, client.villeId, client.paysResidenceId];
            const oldProfileFields = [existing.adresseDomicile, existing.professionId, existing.numeroPiece, existing.typePiece, existing.villeId, existing.paysResidenceId];
            const newComplete = profileFields.filter(Boolean).length;
            const oldComplete = oldProfileFields.filter(Boolean).length;
            if (newComplete >= 4 && oldComplete < 4) {
              await recordScoreEvent({
                clientId: client.id,
                agenceId: client.agenceId || undefined,
                eventType: 'PROFILE_COMPLETED',
                refId: `profile-${client.id}`,
                refType: 'client',
                createdBy: req.session.user?.id,
              });
            }
          }
        } catch (scoreErr) {
          logger.error({ err: scoreErr }, 'Scoring event error (client update)');
        }

        await logAudit(
            req,
            "UPDATE_CLIENT",
            "client",
            client!.id,
            undefined,
            "success",
            "low"
        );

        // Update Lists
        const wsServer = await import("../../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client!.agenceId } });
        }

        res.json(client);
      } catch (e) {
          logger.error({ err: e }, 'Update client error');
          res.status(500).json({ message: "Update failed" });
      }
  });


  // DELETE: Vérification accès (roles: admin, chef only)
  app.delete("/api/clients/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
      const existing = await storage.getClient(req.params.id);
      if (!existing) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && existing.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      const success = await storage.deleteClient(req.params.id);

      await logAudit(
            req,
            "DELETE_CLIENT",
            "client",
            req.params.id,
            undefined,
            "success",
            "low"
      );

      // Update Lists
      // Update Lists
      const wsServer = await import("../../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: existing.agenceId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.status(200).json({ message: "Client deleted successfully" });
  });



  // Check Uniqueness
  // Architecture V3: telephone/email sont dans users, numeroPiece dans clients
  app.post("/api/clients/check-uniqueness", requireAuth, async (req, res) => {
      try {
          const { telephone, email, numeroPiece, nom, prenom, excludeClientId } = req.body;

          logger.debug({ phone: telephone, piece: numeroPiece, nom, prenom, excludeId: excludeClientId }, 'Check uniqueness params');

          const cleanPhone = normalizePhone(telephone) || telephone?.trim();
          const cleanEmail = email?.trim();
          const cleanPiece = numeroPiece?.trim();
          const cleanNom = nom?.trim();
          const cleanPrenom = prenom?.trim();

          // Build conditions - telephone/email/nom+prenom are in users table, numeroPiece in clients
          const userChecks = [];
          if (cleanPhone) userChecks.push(eq(users.telephone, cleanPhone));
          if (cleanEmail) userChecks.push(eq(users.email, cleanEmail));

          // Nom + prénom combo check (case-insensitive)
          if (cleanNom && cleanPrenom) {
            userChecks.push(
              and(
                sql`lower(${users.nom}) = lower(${cleanNom})`,
                sql`lower(${users.prenom}) = lower(${cleanPrenom})`,
              )!
            );
          }

          const clientChecks = [];
          if (cleanPiece) clientChecks.push(eq(clients.numeroPiece, cleanPiece));

          if (userChecks.length === 0 && clientChecks.length === 0) {
            return res.json({ available: true });
          }

          // Query: clients JOIN users, check all conditions
          const allChecks = [...userChecks, ...clientChecks];

          const conflicts = await db
            .select({
              id: clients.id,
              numeroPiece: clients.numeroPiece,
              nom: users.nom,
              prenom: users.prenom,
              telephone: users.telephone,
              email: users.email,
            })
            .from(clients)
            .leftJoin(users, eq(clients.userId, users.id))
            .where(or(...allChecks));

          // Filter out excluded client
          const realConflicts = conflicts.filter(c => {
             if (!excludeClientId) return true;
             return String(c.id) !== String(excludeClientId);
          });

          if (realConflicts.length > 0) {
              const conflict = realConflicts[0];
              let field = '';
              const conflictDisplay = `${conflict.nom} ${conflict.prenom || ''}`.trim();

              // Determine which field caused the conflict (priority: nom > phone > email > piece)
              if (cleanNom && cleanPrenom
                  && conflict.nom?.toLowerCase() === cleanNom.toLowerCase()
                  && conflict.prenom?.toLowerCase() === cleanPrenom.toLowerCase()) {
                field = 'nom';
              } else if (cleanPhone && conflict.telephone === cleanPhone) {
                field = 'telephone';
              } else if (cleanEmail && conflict.email?.toLowerCase() === cleanEmail.toLowerCase()) {
                field = 'email';
              } else if (cleanPiece && conflict.numeroPiece === cleanPiece) {
                field = 'numeroPiece';
              }

              const labels: Record<string, string> = {
                nom: 'Ce nom et prénom sont',
                telephone: 'Ce téléphone est',
                email: 'Cet email est',
                numeroPiece: 'Ce numéro de pièce est',
              };

              return res.json({
                  available: false,
                  field,
                  message: `${labels[field] || 'Cette valeur est'} déjà associé(e) au client ${conflictDisplay}`
              });
          }

          res.json({ available: true });
      } catch (error) {
          logger.error({ err: error }, 'Uniqueness check error');
          res.status(500).json({ message: "Validation error" });
      }
  });


  


  // ============================================
  // NOUVELLES ROUTES POUR ARCHITECTURE users/clients
  // ============================================

  // GET - Récupérer un client par son userId
  app.get("/api/clients/by-user/:userId", requireAuth, async (req, res) => {
    try {
      const client = await getClientByUserId(req.params.userId);
      if (!client) {
        return res.json({ data: null, message: "Aucun profil client pour cet utilisateur" });
      }
      res.json({ data: client });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client by userId');
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });


  // GET - Client avec données utilisateur
  app.get("/api/clients/:id/with-user", requireAuth, async (req, res) => {
    try {
      const client = await getClientWithUser(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client non trouvé" });
      }
      res.json(client);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client with user');
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });


  // POST - Créer un client avec un compte utilisateur (pour futur portail client)
  app.post("/api/clients/with-user", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CLIENT), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientWithUser } = await import("../../storage/clients");

      const schema = z.object({
        // Données utilisateur
        nom: z.string().min(1, "Le nom est requis"),
        prenom: z.string().optional(),
        email: z.string().email().optional().nullable(),
        telephone: z.string().optional().nullable(),
        sexe: z.enum(['M', 'F']).optional().nullable(),
        username: z.string().optional().nullable(),
        password: z.string().optional().nullable(),
        // Données client métier
        adresse: z.string().optional(),
        segment: z.string().optional(),
        agenceId: z.string().uuid().optional().nullable(),
        agence: z.string().optional(), // Legacy
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;

      // Vérifier si username existe déjà
      if (data.username) {
        const existingUser = await storage.getUserByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
        }
      }

      // Hasher le mot de passe si fourni
      let hashedPassword = null;
      if (data.password) {
        hashedPassword = await hashPassword(data.password);
      }

      const userData = {
        nom: data.nom,
        prenom: data.prenom,
        email: data.email || undefined,
        telephone: data.telephone || undefined,
        sexe: data.sexe as 'M' | 'F' | undefined,
        username: data.username || undefined,
        password: hashedPassword || undefined,
      };

      const clientData = {
        adresseDomicile: data.adresse,
        segment: data.segment || SegmentClient.STANDARD,
        agenceId: data.agenceId || req.selectedAgenceId,
        statut: 'ACTIVE' as const,
      } as any;

      const result = await createClientWithUser(userData, clientData);

      // Score initial
      try {
        await recordScoreEvent({
          clientId: result.client.id,
          agenceId: result.client.agenceId || undefined,
          eventType: 'INITIAL_SCORE',
          refId: `initial-${result.client.id}`,
          refType: 'client',
          createdBy: req.session.user?.id,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, clientId: result.client.id }, 'Failed to create initial score');
      }

      await logAudit(
        req,
        "CREATE_CLIENT_WITH_USER",
        "client",
        result.client.id,
        { nom: data.nom, hasPortalAccess: !!data.username },
        "success",
        "medium"
      );

      res.status(201).json(result);

    } catch (error) {
      logger.error({ err: error }, 'Error creating client with user');
      res.status(500).json({ message: "Erreur lors de la création du client" });
    }
  });


  // POST - Créer un profil client pour un utilisateur existant
  app.post("/api/clients/from-user/:userId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CLIENT), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientForUser } = await import("../../storage/clients");
      const { userId } = req.params;

      // Vérifier que l'utilisateur existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Vérifier qu'il n'a pas déjà un profil client
      const existingClient = await getClientByUserId(userId);
      if (existingClient) {
        return res.status(400).json({ message: "Cet utilisateur a déjà un profil client" });
      }

      const data = normalizeKeysDeep(req.body);
      // Architecture V3: Pour un user existant, on ne valide que les données métier
      // L'identité (nom, prenom, email, telephone) est déjà dans users
      const clientBusinessSchema = createClientApiSchema.omit({
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        photoProfile: true,
        sexe: true,
      });
      const parsed = clientBusinessSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Forcer l'agenceId si non fournie
      const clientData = {
        ...parsed.data,
        agenceId: parsed.data.agenceId || req.selectedAgenceId,
      };

      const client = await createClientForUser(userId, clientData);

      // Score initial
      try {
        await recordScoreEvent({
          clientId: client.id,
          agenceId: client.agenceId || undefined,
          eventType: 'INITIAL_SCORE',
          refId: `initial-${client.id}`,
          refType: 'client',
          createdBy: req.session.user?.id,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, clientId: client.id }, 'Failed to create initial score');
      }

      // Auto-création d'un compte courant via le système produit
      let compteCourant = null;
      try {
        const autoResult = await autoCreateCourantAccount(client.id, clientData.agenceId || client.agenceId!, req.session.user?.id!);
        compteCourant = autoResult.compte;
        logger.info({ numeroCompte: compteCourant.numeroCompte, clientId: client.id, isPending: autoResult.isPending }, 'Compte courant auto-created for employee-to-client conversion');
      } catch (accountError) {
        logger.error({ err: accountError, clientId: client.id }, 'Failed to create automatic current account for employee-to-client');
      }

      await logAudit(
        req,
        "CREATE_CLIENT_FROM_USER",
        "client",
        client.id,
        { userId, compteCourantId: compteCourant?.id },
        "success",
        "medium"
      );

      res.status(201).json(client);

    } catch (error) {
      logger.error({ err: error }, 'Error creating client from user');
      res.status(500).json({ message: "Erreur lors de la création du profil client" });
    }
  });


  // ============================================
  // CLIENT NOTIFICATION SENDING
  // ============================================

  /**
   * POST /api/clients/:id/send-notification
   * Send a notification (SMS or Email) to a client via the notification queue
   */
  app.post("/api/clients/:id/send-notification", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Acces refuse : client d'une autre agence" });
      }

      const sendNotifSchema = z.object({
        channel: z.enum(["SMS", "EMAIL"]),
        subject: z.string().optional(),
        message: z.string().min(1, "Le message est requis"),
      });

      const parsed = sendNotifSchema.parse(req.body);

      // Determine recipient
      let recipient: string | null = null;
      if (parsed.channel === "SMS") {
        recipient = client.telephone;
      } else if (parsed.channel === "EMAIL") {
        recipient = client.email;
      }

      if (!recipient) {
        return res.status(400).json({
          message: `Le client n'a pas de ${parsed.channel === "SMS" ? "telephone" : "email"} renseigne`,
        });
      }

      // Enqueue notification via the notification service
      const { enqueueNotification } = await import("../../services/notifications/notification-service");

      const correlationId = await enqueueNotification({
        channel: parsed.channel,
        templateCode: "CUSTOM_MESSAGE",
        recipient,
        payload: {
          message: parsed.message,
          subject: parsed.subject || "Message de MicroFlex",
          clientNom: client.nom,
          clientPrenom: client.prenom || "",
          senderNom: req.session.user?.nom || "Systeme",
        },
        userId: client.userId || undefined,
        agenceId: client.agenceId || undefined,
      });

      // Log the activity
      const { logClientActivity } = await import("../../storage/clients");
      await logClientActivity({
        clientId: req.params.id,
        type: parsed.channel === "SMS" ? "sms" : "email",
        description:
          parsed.channel === "SMS"
            ? `SMS envoye: ${parsed.message.substring(0, 50)}...`
            : `Email envoye: ${parsed.subject || "Sans objet"}`,
        metadata: JSON.stringify({
          channel: parsed.channel,
          message: parsed.message,
          subject: parsed.subject,
          correlationId,
          sentBy: req.session.user?.id,
        }),
      });

      await logAudit(
        req,
        "SEND_CLIENT_NOTIFICATION",
        "client",
        req.params.id,
        { channel: parsed.channel, correlationId },
        "success",
        "medium"
      );

      res.json({
        success: true,
        correlationId,
        channel: parsed.channel,
        recipient,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(error);
      logger.error({ err: error }, 'Error sending client notification');
      res.status(500).json({ message: "Erreur lors de l'envoi de la notification" });
    }
  });
}
