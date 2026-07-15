import type { Express } from "express";

import {
  users,
  clients,
  clientDocumentsArraySchema,
  type ClientDocument,
} from "@shared/schema";
import { createClientApiSchema } from "../../storage/clients";
import { normalizePhone } from "@shared/utils/phone";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { autoCreateCourantAccount } from "../../services/comptes";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { recordScoreEvent } from "../../services/scoring-engine";
import { StorageService } from "../../services/storage-service";
import { storage } from "../../storage";
import { normalizeKeysDeep } from "../utils";

const logger = createLogger('Routes:Clients:Create');

/**
 * Routes de création des clients (unitaire et en masse).
 *
 * - POST /api/clients/bulk — Import en masse
 * - POST /api/clients      — Création d'un client
 */
export function registerClientCreateRoutes(app: Express) {

  // IMPORT EN MASSE
  app.post("/api/clients/bulk", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      // Validation du tableau avec le nouveau schema API (Architecture V3)
      const schema = z.array(createClientApiSchema);
      const data = schema.parse(req.body);

      // Insertion en masse via le storage (qui gère la transaction)
      const createdClients = await storage.createClientsBulk(data);

      // Score initial pour chaque client importé (non-bloquant)
      try {
        const batchSize = 20;
        for (let i = 0; i < createdClients.length; i += batchSize) {
          const batch = createdClients.slice(i, i + batchSize);
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
        logger.error({ err: scoreErr }, 'Échec du calcul de score initial pour l\'import en masse');
      }

      await logAudit(
        req,
        "IMPORT_CLIENTS_BULK",
        "client",
        "BULK",
        { count: createdClients.length },
        "success",
        "high"
      );

      res.status(201).json({
        success: true,
        count: createdClients.length,
        ids: createdClients.map(c => c.id)
      });
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json(e);
      logger.error({ err: e }, 'Erreur d\'import en masse');
      res.status(500).json({ message: "Bulk import failed" });
    }
  });


  // CREATE : Validation de l'agence cible (supporte agenceId)
  app.post("/api/clients", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, unknown>;

        // Valider le tableau de documents séparément pour de meilleurs messages d'erreur
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (!docsResult.success) {
            logger.warn({ err: docsResult.error }, 'Échec de la validation des documents');
            // Autoriser quand même la création, journaliser simplement le problème de validation
          } else {
            validatedDocuments = docsResult.data;
          }

          // Vérifier que les documents privés utilisent les clés du bucket secure-docs
          if (validatedDocuments) {
            validatedDocuments = validatedDocuments.map(doc => {
              // S'assurer que les docs privés ont un format de chemin correct (pas d'URL complètes)
              if (doc.isPrivate && doc.documentUrl.startsWith('http')) {
                logger.warn({ documentType: doc.documentType }, 'Document privé avec URL complète, devrait être une clé objet');
              }
              return doc;
            });
          }
        }

        // Architecture V3 : Utiliser le nouveau schema API qui sépare identité et métier
        const parsed = createClientApiSchema.parse(data);

        // ── Garde anti-doublons ──────────────────────────────────────────
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

        // Déplacer les fichiers du UUID temporaire vers l'ID réel de l'entité
        const tempEntityId = clientData.tempEntityId;
        if (tempEntityId && tempEntityId !== createdClient.id) {
          try {
            const keyMapping = await StorageService.relocateEntityFiles('client', tempEntityId, createdClient.id);

            if (keyMapping.size > 0) {
              // Mettre à jour users.photoProfile si le chemin a changé
              if (createdClient.userId) {
                const [currentUser] = await db.select({ photoProfile: users.photoProfile })
                  .from(users).where(eq(users.id, createdClient.userId));

                if (currentUser?.photoProfile && keyMapping.has(currentUser.photoProfile)) {
                  await db.update(users)
                    .set({ photoProfile: keyMapping.get(currentUser.photoProfile)! })
                    .where(eq(users.id, createdClient.userId));
                }
              }

              // Mettre à jour le tableau JSONB clients.documents
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

            // Nettoyer les fichiers temporaires restants
            await StorageService.deleteEntityFiles('client', tempEntityId);
          } catch (relocateError) {
            logger.error({ err: relocateError, clientId: createdClient.id }, 'Échec du déplacement des fichiers');
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
          }, 'Compte courant auto-créé pour le client');
        } catch (accountError) {
          logger.error({ err: accountError, clientId: client.id }, 'Échec de la création automatique du compte courant');
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

        // Événement domaine : client créé (notification de bienvenue)
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
          logger.error({ err: scoreErr, clientId: client.id }, 'Échec du calcul de score initial');
        }

        // Mise à jour du Dashboard et des listes via WebSocket
        const wsServer = await import("../../ws-server");
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
        // Nettoyer les fichiers temporaires en cas d'échec (pas sur les erreurs de validation)
        if (!(e instanceof z.ZodError)) {
          const tempId = req.body?.tempEntityId || req.body?.temp_entity_id;
          if (tempId) {
            StorageService.deleteEntityFiles('client', tempId)
              .catch(err => logger.error({ err }, 'Échec du nettoyage des fichiers temporaires'));
          }
        }
        if (e instanceof z.ZodError) return res.status(400).json(e);
        logger.error({ err: e }, 'Erreur de création du client');
        res.status(500).json({ message: "Create client failed" });
      }
  });
}
