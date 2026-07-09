/**
 * Routes finance — segment /credits (partie credits-decaissement).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/credits/decaissement
 */
import type { Express } from "express";
import { insertCreditSchema, credits } from "@shared/schema";
import { storage } from "../../storage";
import { getComptesByClient } from "../../storage/finance";
import { DecaissementInsufficientFundsError, InsufficientFundsError } from "../../storage/errors";
import { isCoffreCaisseError } from "../../services/coffre/coffre-errors";
import { StatutCompte, StatutCredit, StatutDemande, TypeCompte } from "@shared/enum/status-constants";
import type {
  StatutCreditDz,
  StatutDemandeDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
  StatutEnqueteCreditDz,
} from "@shared/enum/enums";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { generateCreditReminderSchedule } from "../../services/notifications/credit-reminder-service";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { paymentService } from "../../services/mobile-money/payment-service";
import { currencySymbol } from "@shared/config/currency";
import { generateCreditSchedule } from "../../storage/finance";
import { logger } from "./shared";

export function registerCreditsDecaissementRoutes(app: Express) {
  // Décaissement de crédit (crée le crédit + gère le canal de décaissement)
  // Canaux supportés: ACCOUNT (compte courant), CASH (espèces caisse), MOBILE_MONEY
  // CASL: Requires 'disburse' or channel-specific permission on Credit
  // Uses requireDisbursement() which handles channel-specific permission checks
  /**
   * POST /api/credits/decaissement
   */
  app.post("/api/credits/decaissement", requireAuth, attachAbility, requireDisbursement(), requireAgenceAccess(), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      // Valider les données requises
      if (!data.demandeId) {
        return res.status(400).json({ message: "L'ID de la demande est requis" });
      }

      // 1. Récupérer la demande et vérifier son statut
      const demande = await storage.getDemandeCredit(data.demandeId);
      if (!demande) {
        return res.status(404).json({ message: "Demande de crédit non trouvée" });
      }

      // Only APPROVED and APPROVED_AFTER_REEVALUATION are eligible for disbursement
      const statutsEligiblesDecaissement = [StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as string[];
      if (!demande.statut || !statutsEligiblesDecaissement.includes(demande.statut)) {
        return res.status(400).json({ message: `La demande doit être approuvée pour être décaissée (statut actuel: ${demande.statut})` });
      }

      // 2. Récupérer le compte courant du client
      const comptesClient = await getComptesByClient(demande.clientId);
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      const compteCourant = comptesClient.find((c: any) => {
        const isCompteCourant = c.typeCompte === TypeCompte.CURRENT;
        const isActif = c.statut === StatutCompte.ACTIVE;

        // Vérifier l'agence si nécessaire
        if (agenceFilter?.agenceId) {
          return isCompteCourant && isActif && c.agenceId === agenceFilter.agenceId;
        }
        return isCompteCourant && isActif;
      });

      if (!compteCourant) {
        return res.status(400).json({
          message: "Le client n'a pas de compte courant actif dans cette agence. Impossible de décaisser."
        });
      }

      // 3. Générer les données du crédit
      const { randomUUID } = await import('crypto');
      const creditId = randomUUID();
      const numeroCredit = `CRED-${creditId.substring(0, 8).toUpperCase()}`;
      const montantDecaissement = parseFloat(demande.montantApprouve?.toString() || demande.montantDemande.toString());

      // Canal de décaissement (ACCOUNT par défaut pour rétrocompatibilité)
      const disbursementChannel = data.disbursementChannel || data.channel || 'ACCOUNT';
      const validChannels = ['ACCOUNT', 'CASH', 'MOBILE_MONEY'];
      if (!validChannels.includes(disbursementChannel)) {
        return res.status(400).json({ message: `Canal de décaissement invalide: ${disbursementChannel}. Valeurs acceptées: ${validChannels.join(', ')}` });
      }

      // Déterminer si c'est un décaissement immédiat ou programmé
      const decaissementImmediat = data.decaissementImmediat !== false; // true par défaut
      const dateDecaissement = data.dateDebut || new Date().toISOString().split('T')[0];
      const aujourdhui = new Date().toISOString().split('T')[0];
      const estProgramme = !decaissementImmediat || dateDecaissement > aujourdhui;

      // Récupérer les infos client pour les notifications
      const client = await storage.getClient(demande.clientId);
      const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Client';

      // 4. Déterminer le statut initial du crédit selon le canal
      let statutInitial: string;
      let disbursementStatus: string | null = null;

      if (disbursementChannel === 'CASH') {
        // Canal ESPÈCES: Le crédit attend le décaissement physique par le caissier
        statutInitial = StatutCredit.WAITING_DISBURSEMENT;
        disbursementStatus = 'PENDING';
      } else if (disbursementChannel === 'MOBILE_MONEY') {
        // Canal MOBILE_MONEY: En attente du callback PawaPay pour confirmer le paiement
        statutInitial = StatutCredit.WAITING_DISBURSEMENT;
        disbursementStatus = 'PROCESSING';
      } else {
        // Canal ACCOUNT (par défaut): Flux existant
        // Pour décaissement immédiat: créer en PENDING d'abord, activer APRÈS succès du ledger
        // Ceci garantit qu'on peut annuler (PENDING→CANCELLED) si le transfert échoue
        statutInitial = StatutCredit.PENDING;
        disbursementStatus = estProgramme ? null : 'PENDING';
      }

      // 5. Créer le crédit
      const creditData = {
        id: creditId,
        clientId: demande.clientId,
        numeroCredit,
        montant: montantDecaissement.toString(),
        taux: demande.tauxInteret,
        duree: data.duree || demande.nombreEcheances || demande.dureeValeur,
        typeCredit: demande.typeCredit || 'PERSONAL',
        objetCredit: demande.objetCredit,
        demandeId: demande.id,
        creditPlanId: demande.creditPlanId,
        statut: statutInitial,
        echeance: demande.frequenceRemboursement,
        dateDebut: new Date(dateDecaissement),
        dateFin: data.dateFin ? new Date(data.dateFin) : null,
        dateSolvabilite: data.dateSolvabilite ? new Date(data.dateSolvabilite) : null,
        soldeRestant: data.soldeRestant || montantDecaissement.toString(), // Placeholder — recalculé par generateCreditSchedule
        totalDu: data.soldeRestant || montantDecaissement.toString(), // Placeholder — recalculé par generateCreditSchedule
        agenceId: compteCourant.agenceId,
        // Nouveaux champs multi-canal
        disbursementChannel: disbursementChannel as DisbursementChannelDz,
        disbursementStatus: disbursementStatus as DisbursementStatusDz,
      };

      // Guard: Cancel any orphan credits from previous failed disbursement attempts
      const existingCreditsForDemande = await db.select({ id: credits.id, statut: credits.statut })
        .from(credits)
        .where(eq(credits.demandeId, demande.id));

      for (const existing of existingCreditsForDemande) {
        if (existing.statut === StatutCredit.PENDING || existing.statut === StatutCredit.WAITING_DISBURSEMENT) {
          await storage.updateCredit(existing.id, { statut: StatutCredit.CANCELLED as StatutCreditDz });
          logger.warn({ creditId: existing.id, demandeId: demande.id }, 'Cancelled orphan credit from previous failed disbursement');
        } else if (existing.statut === StatutCredit.ACTIVE) {
          // An active credit already exists for this demande — prevent duplicate
          return res.status(409).json({
            message: `Un crédit actif (${existing.id}) existe déjà pour cette demande. Décaissement impossible.`
          });
        }
      }

      const parsed = insertCreditSchema.parse(creditData);
      const credit = await storage.createCredit(parsed);

      let nouveauSolde = parseFloat(compteCourant.soldeCourant || '0');
      let message = '';

      // 6. Traitement selon le canal de décaissement
      switch (disbursementChannel) {
        case 'CASH':
          // ===== CANAL ESPÈCES =====
          // Ne pas toucher à l'argent maintenant
          // Émettre une notification WebSocket vers le dashboard caisse
          const wsInstance = getWsInstance();
          if (wsInstance) {
            // Notification spécifique pour le dashboard caisse
            wsInstance.broadcast({
              type: "CAISSE_UPDATE",
              payload: {
                subtype: 'NEW_LOAN_DISBURSEMENT',
                creditId: credit.id,
                numeroCredit,
                clientName,
                clientId: demande.clientId,
                montant: montantDecaissement,
                agenceId: compteCourant.agenceId,
                timestamp: new Date().toISOString()
              }
            });
          }
          message = `Ordre de paiement envoyé à la caisse. Le client ${clientName} doit se présenter au guichet pour récupérer ${montantDecaissement.toLocaleString()} ${currencySymbol()}.`;
          break;

        case 'MOBILE_MONEY': {
          // ===== CANAL MOBILE MONEY (PawaPay) =====
          const mobilePhone = client?.telephone;
          if (!mobilePhone) {
            await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
            return res.status(400).json({ message: "Le client n'a pas de numéro de téléphone enregistré. Décaissement Mobile Money impossible." });
          }

          const provider = (data.provider?.toUpperCase() || '') as 'MTN' | 'AIRTEL';
          if (!provider || !['MTN', 'AIRTEL'].includes(provider)) {
            await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
            return res.status(400).json({ message: "Opérateur Mobile Money requis (MTN ou AIRTEL)." });
          }

          try {
            const payoutIntent = await paymentService.initiatePayout({
              provider,
              amount: montantDecaissement,
              phone: mobilePhone,
              clientId: demande.clientId,
              compteId: compteCourant.id,
              creditId: credit.id,
              description: `Décaissement crédit ${numeroCredit}`,
              agenceId: compteCourant.agenceId || undefined,
              idempotencyKey: `disburse-${credit.id}`,
            }, user?.id);

            message = `Paiement Mobile Money ${provider} initié pour ${montantDecaissement.toLocaleString()} ${currencySymbol()} vers ${mobilePhone}. Le crédit sera activé après confirmation du transfert.`;
            logger.info({ creditId: credit.id, intentId: payoutIntent.id, provider }, 'Mobile Money disbursement initiated');
          } catch (payoutError) {
            logger.error({ err: payoutError, creditId: credit.id }, 'Mobile Money disbursement failed');
            await storage.updateCredit(credit.id, { statut: StatutCredit.CANCELLED as StatutCreditDz, disbursementStatus: 'FAILED' as DisbursementStatusDz });
            const errorMsg = payoutError instanceof Error ? payoutError.message : 'Erreur inconnue';
            return res.status(500).json({ message: `Échec du décaissement Mobile Money: ${errorMsg}` });
          }
          break;
        }

        case 'ACCOUNT':
        default:
          // ===== CANAL COMPTE (flux existant) =====
          if (!estProgramme) {
            try {
              const result = await storage.createDecaissementWithLedger({
                creditId: credit.id,
                compteId: compteCourant.id,
                montant: montantDecaissement.toString(),
                numeroCredit
              }, user?.id);

              nouveauSolde += montantDecaissement;

              // Succès: Activer le crédit et marquer le décaissement comme complété
              await storage.updateCredit(credit.id, {
                statut: StatutCredit.ACTIVE as StatutCreditDz,
                disbursementStatus: 'COMPLETED' as DisbursementStatusDz,
                disbursedAt: new Date(),
                disbursedBy: user?.id
              });

              // Générer l'échéancier automatiquement à l'activation (obligatoire)
              try {
                await generateCreditSchedule(credit.id);
              } catch (scheduleErr) {
                // Échéancier obligatoire — rétrograder le crédit
                logger.error({ err: scheduleErr, creditId: credit.id }, 'Échec génération échéancier — crédit rétrogradé à PENDING');
                await storage.updateCredit(credit.id, {
                  statut: StatutCredit.PENDING as StatutCreditDz,
                  disbursementStatus: 'FAILED' as DisbursementStatusDz,
                });
                return res.status(500).json({
                  message: "Le décaissement a été effectué mais la génération de l'échéancier a échoué. Le crédit est en attente de correction manuelle.",
                });
              }

              // Score event: INITIAL_SCORE for newly disbursed credit
              try {
                const { recordScoreEvent } = await import('../services/scoring-engine');
                await recordScoreEvent({
                  clientId: demande.clientId,
                  agenceId: credit.agenceId ?? undefined,
                  eventType: 'INITIAL_SCORE',
                  refId: credit.id,
                  refType: 'credit',
                  montant: montantDecaissement,
                  createdBy: user?.id,
                });
              } catch (scoreErr) {
                logger.warn({ err: scoreErr, creditId: credit.id }, 'Score event INITIAL_SCORE failed (non-blocking)');
              }

            } catch (err: any) {
              logger.error({ err, creditId: credit.id }, 'Erreur Ledger lors du décaissement');

              // ROLLBACK: Annuler le crédit créé puisque le transfert a échoué
              // (PENDING → CANCELLED est autorisé par la state machine)
              try {
                await storage.updateCredit(credit.id, {
                  statut: StatutCredit.CANCELLED as StatutCreditDz,
                  disbursementStatus: 'PENDING' as DisbursementStatusDz
                });
                logger.info({ creditId: credit.id }, 'Crédit annulé après échec du décaissement');
              } catch (cleanupErr) {
                logger.error({ err: cleanupErr, creditId: credit.id }, 'Échec annulation crédit orphelin');
              }

              // Re-throw business errors (coffre guards, insufficient funds) as-is
              // so the outer catch can handle them with structured responses
              if (isCoffreCaisseError(err) || err instanceof DecaissementInsufficientFundsError) {
                throw err;
              }
              throw new Error(`Erreur lors du décaissement effectif: ${err.message}`);
            }
          }
          message = estProgramme
            ? `Décaissement programmé pour le ${new Date(dateDecaissement).toLocaleDateString('fr-FR')}. Crédit ${numeroCredit} créé en attente.`
            : `Crédit ${numeroCredit} décaissé. ${montantDecaissement.toLocaleString()} ${currencySymbol()} crédités sur le compte ${compteCourant.numeroCompte}`;
          break;
      }

      // 7. Mettre à jour le statut de la demande
      await storage.updateDemandeCredit(demande.id, { statut: StatutDemande.DISBURSED });

      // 8. Log audit
      await logAudit(
        req,
        disbursementChannel === 'CASH' ? "DECAISSEMENT_CASH_INITIE" :
        disbursementChannel === 'MOBILE_MONEY' ? "DECAISSEMENT_MOMO_INITIE" :
        estProgramme ? "DECAISSEMENT_PROGRAMME" : "DECAISSEMENT_CREDIT",
        "credit",
        credit.id,
        {
          demandeId: demande.id,
          montant: montantDecaissement,
          compteId: compteCourant.id,
          numeroCredit,
          programme: estProgramme,
          dateDecaissement: estProgramme ? dateDecaissement : null,
          disbursementChannel,
          disbursementStatus
        },
        "success",
        "high"
      );

      // 9. Broadcast updates (sauf pour CASH qui a déjà été notifié)
      const wsInstanceBroadcast = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstanceBroadcast && userAgence) {
        wsInstanceBroadcast.broadcastToAgency(userAgence, {
          type: "CREDIT_UPDATE",
          payload: {
            type: 'credit_decaissement',
            id: credit.id,
            programme: estProgramme,
            disbursementChannel
          }
        });
        wsInstanceBroadcast.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });

        // Activité live avec info sur le canal
        const channelLabel = disbursementChannel === 'CASH' ? '(Espèces)' :
                            disbursementChannel === 'MOBILE_MONEY' ? '(Mobile Money)' : '';
        wsInstanceBroadcast.broadcastToAgency(userAgence, {
          type: "LIVE_ACTIVITY",
          payload: {
            action: disbursementChannel === 'CASH'
              ? `Décaissement en attente ${channelLabel}: ${montantDecaissement.toLocaleString()} ${currencySymbol()} pour ${clientName}`
              : estProgramme
                ? `Décaissement programmé: ${montantDecaissement.toLocaleString()} ${currencySymbol()} → ${compteCourant.numeroCompte} (${dateDecaissement})`
                : `Décaissement ${channelLabel}: ${montantDecaissement.toLocaleString()} ${currencySymbol()} → ${compteCourant.numeroCompte}`,
            user: user?.nom || 'Système',
            type: 'credit',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Domain event: credit disbursed
      dispatchDomainEvent({
        type: "CREDIT_DISBURSED",
        data: {
          creditId: credit.id,
          numeroCredit,
          clientId: demande.clientId,
          clientName,
          montant: montantDecaissement,
          channel: disbursementChannel,
          agenceId: compteCourant.agenceId,
          disbursedByUserId: user?.id,
        },
        timestamp: new Date(),
      });

      // Generate SMS reminder schedules for this credit's repayment dates
      generateCreditReminderSchedule(credit.id).catch((err: unknown) => {
        logger.error({ err, creditId: credit.id }, 'Failed to generate credit reminders');
      });

      res.status(201).json({
        success: true,
        credit: credit,
        compteCourant: (estProgramme || disbursementChannel === 'CASH') ? null : {
          id: compteCourant.id,
          numero: compteCourant.numeroCompte,
          nouveauSolde
        },
        programme: estProgramme,
        dateDecaissement: estProgramme ? dateDecaissement : null,
        disbursementChannel,
        disbursementStatus,
        message
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur décaissement crédit');

      // Gestion d'erreur structurée pour le workflow de réapprovisionnement
      if (error instanceof InsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.toJSON(),
        });
      }

      if (error instanceof DecaissementInsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      // Guard errors (CoffreInsufficientFunds, CoffreInactif, CoffreSoldeMinimum, CoffrePlafondJournalier, etc.)
      if (isCoffreCaisseError(error)) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors du décaissement"
      });
    }
  });
}
