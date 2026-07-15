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

export function registerClientAuthRoutes(app: Express) {


  // ============================================
  // GÉNÉRER DES IDENTIFIANTS DE PORTAIL POUR LES CLIENTS
  // IMPORTANT : Ces routes DOIVENT être définies AVANT les routes /:id
  // ============================================

  /**
   * GET /api/clients/without-credentials
   * Liste les clients sans accès portail (sans username)
   */
  app.get("/api/clients/without-credentials", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const allClients = await storage.getAllClients({});
      const clientsWithoutCredentials: any[] = [];

      for (const client of allClients) {
        if (client.userId) {
          const clientWithUser = await getClientWithUser(client.id);
          if (clientWithUser && clientWithUser.user && !clientWithUser.user.username) {
            clientsWithoutCredentials.push({
              id: client.id,
              nom: clientWithUser.user.nom,
              prenom: clientWithUser.user.prenom,
              email: clientWithUser.user.email,
              telephone: clientWithUser.user.telephone,
              createdAt: client.createdAt,
            });
          }
        }
      }

      res.json({
        count: clientsWithoutCredentials.length,
        clients: clientsWithoutCredentials,
      });

    } catch (error) {
      logger.error({ err: error }, 'Error fetching clients without credentials');
      res.status(500).json({ message: "Erreur lors de la récupération des clients" });
    }
  });


  /**
   * POST /api/clients/generate-credentials
   * Génère username + password pour les clients sans accès portail
   *
   * Body: { clientIds?: string[], sendEmail?: boolean } - Si clientIds vide, traite tous les clients sans credentials
   * Returns: { generated: number, results: { clientId, username, password, email?, emailSent?, error? }[] }
   */
  app.post("/api/clients/generate-credentials", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const { clientIds, sendEmail = false } = req.body as { clientIds?: string[]; sendEmail?: boolean };
      const crypto = await import("crypto");

      // Récupérer les clients à traiter
      let clientsToProcess: any[] = [];

      if (clientIds && clientIds.length > 0) {
        // Clients spécifiques
        for (const id of clientIds) {
          const client = await getClientWithUser(id);
          if (client && client.user && !client.user.username) {
            clientsToProcess.push(client);
          }
        }
      } else {
        // Tous les clients sans credentials
        const allClients = await storage.getAllClients({});
        for (const client of allClients) {
          if (client.userId) {
            const clientWithUser = await getClientWithUser(client.id);
            if (clientWithUser && clientWithUser.user && !clientWithUser.user.username) {
              clientsToProcess.push(clientWithUser);
            }
          }
        }
      }

      const results: { clientId: string; nom: string; username?: string; password?: string; email?: string; emailSent?: boolean; error?: string }[] = [];
      let generatedCount = 0;
      let emailsSentCount = 0;

      for (const client of clientsToProcess) {
        try {
          const user = client.user;
          if (!user) {
            results.push({ clientId: client.id, nom: 'N/A', error: "Utilisateur non trouvé" });
            continue;
          }

          // Générer username au format p.nom
          const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
          const normalized = fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const parts = normalized.trim().split(/\s+/).filter(Boolean);

          let baseUsername: string;
          if (parts.length < 2) {
            baseUsername = parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client';
          } else {
            const prenom = parts[0];
            const nom = parts[parts.length - 1];
            baseUsername = `${prenom.charAt(0).toLowerCase()}.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          }

          // Vérifier l'unicité et incrémenter si nécessaire
          let finalUsername = baseUsername;
          let counter = 0;
          while (await storage.getUserByUsername(finalUsername)) {
            counter++;
            finalUsername = `${baseUsername}${counter}`;
          }

          // Générer un mot de passe aléatoire sécurisé (12 caractères)
          const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
          const passwordLength = 12;
          const randomBytes = crypto.randomBytes(passwordLength);
          let plainPassword = '';
          for (let i = 0; i < passwordLength; i++) {
            plainPassword += charset[randomBytes[i] % charset.length];
          }

          // S'assurer que le mot de passe respecte les règles (au moins 1 majuscule, 1 chiffre)
          if (!/[A-Z]/.test(plainPassword)) {
            plainPassword = 'A' + plainPassword.slice(1);
          }
          if (!/[0-9]/.test(plainPassword)) {
            plainPassword = plainPassword.slice(0, -1) + '7';
          }

          // Hasher le mot de passe
          const hashedPassword = await hashPassword(plainPassword);

          // Mettre à jour l'utilisateur
          await db.update(users)
            .set({
              username: finalUsername,
              password: hashedPassword,
              canLogin: true,
              mustChangePassword: true,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          // Envoyer un email avec les identifiants si demandé et si l'email est disponible
          let emailSent = false;
          const clientEmail = user.email;

          if (sendEmail && clientEmail) {
            try {
              const { enqueueNotification } = await import("../../services/notifications/notification-service");

              await enqueueNotification({
                channel: 'EMAIL',
                templateCode: 'PORTAL_CREDENTIALS',
                recipient: clientEmail,
                payload: {
                  clientNom: user.nom,
                  clientPrenom: user.prenom || '',
                  username: finalUsername,
                  password: plainPassword,
                  portalUrl: process.env.PORTAL_URL || 'https://portail.example.comm',
                  supportEmail: process.env.SUPPORT_EMAIL || 'support@example.comm',
                },
                userId: user.id,
                agenceId: client.agenceId || undefined,
              });

              emailSent = true;
              emailsSentCount++;
            } catch (emailError) {
              logger.error({ err: emailError, email: clientEmail }, 'Failed to send credentials email');
              // Ne pas faire échouer toute l'opération, journaliser simplement l'erreur
            }
          }

          results.push({
            clientId: client.id,
            nom: `${user.nom} ${user.prenom || ''}`.trim(),
            username: finalUsername,
            password: plainPassword,
            email: clientEmail || undefined,
            emailSent,
          });
          generatedCount++;

          // Journal d'audit
          await logAudit(
            req,
            "GENERATE_CLIENT_CREDENTIALS",
            "user",
            user.id,
            { clientId: client.id, username: finalUsername, emailSent },
            "success",
            "high"
          );

        } catch (clientError: any) {
          results.push({
            clientId: client.id,
            nom: client.user?.nom || 'N/A',
            error: clientError.message || "Erreur inconnue"
          });
        }
      }

      res.json({
        generated: generatedCount,
        total: clientsToProcess.length,
        emailsSent: emailsSentCount,
        results,
      });

    } catch (error) {
      logger.error({ err: error }, 'Error generating client credentials');
      res.status(500).json({ message: "Erreur lors de la génération des identifiants" });
    }
  });
}
