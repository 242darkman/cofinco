import type { Express } from "express";

import { Actions, Subjects } from "@shared/ability";
import {
  StatutClient,
  StatutCompte,
} from "@shared/enum/status-constants";
import {
  users,
  clients,
  clientDocumentsArraySchema,
  type ClientDocument,
} from "@shared/schema";
import { updateClientApiSchema } from "../../storage/clients";
import { eq } from "drizzle-orm";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { requireAgenceIdAccess } from "../../middleware";
import { recordScoreEvent } from "../../services/scoring-engine";
import { StorageService } from "../../services/storage-service";
import { storage } from "../../storage";
import { getComptesByClient } from "../../storage/finance";
import { normalizeKeysDeep } from "../utils";

const logger = createLogger('Routes:Clients:Write');

/**
 * Routes de création, modification et suppression des clients.
 *
 * - POST   /api/clients/bulk  — Import en masse
 * - POST   /api/clients       — Création d'un client
 * - PATCH  /api/clients/:id   — Mise à jour d'un client
 * - DELETE /api/clients/:id   — Suppression d'un client
 */
export function registerClientWriteRoutes(app: Express) {


  // UPDATE : Vérification accès + interdiction de changer d'agence (roles: admin, chef, caisse, terrain, credit)
  app.patch("/api/clients/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
      try {
        const existing = await storage.getClient(req.params.id);
        if (!existing) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        if (agenceFilter?.agenceId && existing.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }

        const data = normalizeKeysDeep(req.body) as Record<string, unknown>;

        // Valider le tableau de documents si fourni
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (docsResult.success) {
            validatedDocuments = docsResult.data;
          }
        }

        // Architecture V3 : Utiliser le schema API pour mises à jour partielles
        const parsed = updateClientApiSchema.parse(data);

        // Fusionner les documents validés
        const updateData = validatedDocuments !== undefined
          ? { ...parsed, documents: validatedDocuments }
          : parsed;

        // Empêcher le changement d'agence si non admin
        if (agenceFilter?.agenceId && updateData.agenceId && updateData.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Impossible de changer l'agence du client" });
        }

        // Vérifier le remplacement de fichier et nettoyer l'ancien
        if (updateData.photoProfile && existing.photoProfile && updateData.photoProfile !== existing.photoProfile) {
             // Si l'ancienne photo était une URL (pas du base64), la supprimer
             if (!existing.photoProfile.startsWith('data:')) {
                 StorageService.deleteFileFromUrl(existing.photoProfile).catch((e: any) =>
                    logger.error({ err: e }, 'Échec de la suppression de l\'ancienne photo de profil')
                 );
             }
        }

        const client = await storage.updateClient(req.params.id, updateData);

        // ====== SYNC : Auto-mise à jour de statutVerificationPiece depuis les statuts des documents ======
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

              // Rafraîchir le client pour inclure le champ mis à jour dans la réponse
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
              }, 'Auto-synchronisation de statutVerificationPiece depuis les statuts des documents');
            }
          }
        }

        // ====== LOGIQUE MÉTIER : Gel des comptes lors du changement de statut client ======
        const INACTIVE_STATUSES = [StatutClient.INACTIVE, StatutClient.SUSPENDED] as string[];
        const wasActive = !INACTIVE_STATUSES.includes(existing.statut || '');
        const isNowInactive = INACTIVE_STATUSES.includes(client?.statut || '');
        
        if (wasActive && isNowInactive && client) {
            // Geler tous les comptes du client
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
            logger.info({ accountCount: accounts.length, clientId: client.id, statut: client.statut }, 'Comptes gelés suite au changement de statut du client');
        }
        // ====== FIN LOGIQUE MÉTIER ======

        // Événements de score : KYC_VERIFIED et PROFILE_COMPLETED
        try {
          if (client) {
            // KYC_VERIFIED : lorsque le statut KYC ou la vérification de pièce passe à VERIFIED
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

            // PROFILE_COMPLETED : lorsque le profil atteint le seuil de complétude (4+ champs)
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
          logger.error({ err: scoreErr }, 'Erreur d\'événement de scoring (mise à jour client)');
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

        // Mise à jour des listes via WebSocket
        const wsServer = await import("../../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client!.agenceId } });
        }

        res.json(client);
      } catch (e) {
          logger.error({ err: e }, 'Erreur de mise à jour du client');
          res.status(500).json({ message: "Update failed" });
      }
  });


  // DELETE : Vérification accès (roles: admin, chef uniquement)
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

      // Mise à jour des listes via WebSocket
      const wsServer = await import("../../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: existing.agenceId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.status(200).json({ message: "Client deleted successfully" });
  });
}
