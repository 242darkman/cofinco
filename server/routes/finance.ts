import type { Express } from "express";
import * as schema from "@shared/schema";
import {
  insertCreditSchema,
  insertDemandeCreditSchema,
  insertEnqueteCreditSchema,
  insertFactureSchema,
  insertSessionCaisseSchema,
  insertOperationCaisseSchema,
  insertCaisseSchema,
  insertCaisseTransfertSchema,
  insertCreditPlanSchema,
  mouvementsFinanciers,
  comptes,
  creditRefundRequests,
  sessionsCaisse,
  operationsCaisse,
  clients,
  demandesCredit,
  credits,
  coffresForts,
  transactionsCompte
} from "@shared/schema";
import { storage } from "../storage";
import { createMouvementFinancier } from "../services/ledger";
import { getComptesByClient, DecaissementInsufficientFundsError } from "../storage/finance";
// State Machine errors for proper error handling
import { CreditTransitionError } from "@shared/machines/credit-workflow";
import { DemandeTransitionError } from "@shared/machines/demande-workflow";
import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  StatutTransfertCaisse,
  StatutClient,
  StatutEnquete,
  StatutCaisse,
  TypeCompte,
  DureeUnite as DureeUniteEnum,
} from "@shared/enum/status-constants";
import { requireAuth } from "../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../authorization";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, coerceValueToSchema } from "./utils";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { db } from "../db";
import { z } from "zod";
import {
  validerCoherenceFrequenceDuree,
  calculerNombreEcheances,
  type FrequenceRemboursement,
  type DureeUnite
} from "@shared/config/credit-durations";
import { getWsInstance } from "../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import * as sessionService from "../services/caisse/session-service";
import { sessionOpeningService } from "../services/caisse/session-opening-service";
import { sessionClosingService } from "../services/caisse/session-closing-service";
import { accessControlService } from "../services/caisse/access-control-service";
import { isIncomingOperation, isOutgoingOperation, getOperationDelta, CAISSE_IN_OPERATIONS } from "@shared/config/caisse-operations";

export function registerFinanceRoutes(app: Express) {
  // Credit Plans Routes
  app.get("/api/credit-plans", requireAuth, async (req, res) => {
    const agenceFilter = req.agenceFilter as { agence?: string } | null;
    const filter: any = {};
    
    // Si pas admin, filtrer par agence ou global (agenceId IS NULL)
    // Mais pour l'instant, on laisse voir tous les plans actifs
    
    // Si query param ?actif=true
    if (req.query.actif === 'true') filter.actif = true;
    
    const plans = await storage.getAllCreditPlans(filter);
    res.json(addSnakeCaseAliasesDeep(plans));
  });

  app.post("/api/credit-plans", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), requireAgenceAccess(), async (req, res) => {
    const data = normalizeKeysDeep(req.body) as any;
    
    // Validation basique
    if (!data.nom) return res.status(400).json({ message: "Le nom est obligatoire" });
    
    const parsed = insertCreditPlanSchema.parse(data);
    const plan = await storage.createCreditPlan(parsed);
    res.status(201).json(addSnakeCaseAliasesDeep(plan));
  });

  app.patch("/api/credit-plans/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), async (req, res) => {
    const data = normalizeKeysDeep(req.body) as any;
    const plan = await storage.updateCreditPlan(req.params.id, data);
    if (!plan) return res.status(404).json({ message: "Plan non trouvé" });
    res.json(addSnakeCaseAliasesDeep(plan));
  });

  app.delete("/api/credit-plans/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PLAN_CREDIT), async (req, res) => {
    const success = await storage.deleteCreditPlan(req.params.id);
    if (!success) return res.status(404).json({ message: "Plan non trouvé" });
    res.json({ success: true });
  });

  // Credits
  app.get("/api/credits", requireAuth, requireAgenceAccess(), async (req, res) => {
    // req.agenceFilter est injecté par requireAgenceAccess
    // Ex: { agence: "Siège" } ou null (admin)
    const agenceFilter = req.agenceFilter as { agence?: string } | null;
    
    // On passe le filtre directement au storage qui l'applique en SQL (jointure client)
    const filter: { agence?: string; clientId?: string } = agenceFilter ? { agence: agenceFilter.agence } : {};
    
    if (req.query.clientId) {
      filter.clientId = req.query.clientId as string;
    }
    
    const credits = await storage.getAllCredits(filter);
    
    res.json(addSnakeCaseAliasesDeep(credits));
  });

  // Create credit (roles: admin, chef, credit only)
  app.post("/api/credits", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
     try {
       const data = normalizeKeysDeep(req.body) as any;
       
       // Generate ID and credit number uniquely
       if (!data.id) {
         const { randomUUID } = await import('crypto'); 
         data.id = randomUUID();
       }

       if (!data.numeroCredit) {
          // Use the generated ID as requested by user
          // "on pourra utilisé l'id du credit"
          data.numeroCredit = `CRED-${data.id.substring(0, 8).toUpperCase()}`;
       }

       const parsed = insertCreditSchema.parse(data);
       
       // Vérifier que le client appartient à l'agence de l'utilisateur
       const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
       if (agenceFilter?.agenceId) {
         const client = await storage.getClient(parsed.clientId);
         // Si le client n'existe pas ou n'est pas de la bonne agence => Refusé
         if (!client || client.agenceId !== agenceFilter.agenceId) {
           return res.status(403).json({ message: "Accès refusé : ce client appartient à une autre agence" });
         }
       }
       
       const credit = await storage.createCredit(parsed);
       
       await logAudit(
          req,
          "CREATE_CREDIT",
          "credit",
          credit.id,
          undefined,
          "success",
          "low"
       );

       // Notify Credit Update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'credit_new', id: credit.id } });
       }

       res.status(201).json(addSnakeCaseAliasesDeep(credit));
     } catch (e) {
       res.status(400).json({ message: "Invalid data" });
     }
  });

  // Décaissement de crédit (crée le crédit + gère le canal de décaissement)
  // Canaux supportés: ACCOUNT (compte courant), CASH (espèces caisse), MOBILE_MONEY
  // CASL: Requires 'disburse' or channel-specific permission on Credit
  // Uses requireDisbursement() which handles channel-specific permission checks
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
        // Canal MOBILE_MONEY: En attente du callback API (à implémenter)
        statutInitial = estProgramme ? StatutCredit.PENDING : StatutCredit.ACTIVE;
        disbursementStatus = 'PROCESSING';
      } else {
        // Canal ACCOUNT (par défaut): Flux existant
        statutInitial = estProgramme ? StatutCredit.PENDING : StatutCredit.ACTIVE;
        disbursementStatus = estProgramme ? null : 'COMPLETED';
      }

      // 5. Créer le crédit
      const creditData = {
        id: creditId,
        clientId: demande.clientId,
        numeroCredit,
        montant: montantDecaissement.toString(),
        taux: demande.tauxInteret,
        duree: data.duree || demande.nombreEcheances || demande.dureeValeur,
        typeCredit: demande.typeCredit || 'Personnel',
        objetCredit: demande.objetCredit,
        demandeId: demande.id,
        statut: statutInitial,
        echeance: demande.frequenceRemboursement,
        dateDebut: new Date(dateDecaissement),
        dateFin: data.dateFin ? new Date(data.dateFin) : null,
        dateSolvabilite: data.dateSolvabilite ? new Date(data.dateSolvabilite) : null,
        soldeRestant: data.soldeRestant || (montantDecaissement * (1 + parseFloat(demande.tauxInteret.toString()) / 100)).toString(),
        agenceId: compteCourant.agenceId,
        // Nouveaux champs multi-canal
        disbursementChannel: disbursementChannel as any,
        disbursementStatus: disbursementStatus as any,
      };

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
          message = `Ordre de paiement envoyé à la caisse. Le client ${clientName} doit se présenter au guichet pour récupérer ${montantDecaissement.toLocaleString()} FCFA.`;
          break;

        case 'MOBILE_MONEY':
          // ===== CANAL MOBILE MONEY =====
          // TODO: Intégrer avec le Payment Gateway (Orange Money, MTN MoMo, etc.)
          // Pour l'instant, on simule un succès
          message = `Paiement Mobile Money initié pour ${montantDecaissement.toLocaleString()} FCFA. Le client recevra une notification SMS.`;
          // Note: Dans une implémentation réelle, on appellerait PaymentGateway.disburse()
          // et le statut passerait à ACTIVE après le callback de confirmation
          break;

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

              // Mettre à jour le statut de décaissement
              await storage.updateCredit(credit.id, {
                disbursementStatus: 'COMPLETED' as any,
                disbursedAt: new Date(),
                disbursedBy: user?.id
              });

            } catch (err: any) {
              console.error("Erreur Ledger lors du décaissement:", err);
              throw new Error(`Erreur lors du décaissement effectif: ${err.message}`);
            }
          }
          message = estProgramme
            ? `Décaissement programmé pour le ${new Date(dateDecaissement).toLocaleDateString('fr-FR')}. Crédit ${numeroCredit} créé en attente.`
            : `Crédit ${numeroCredit} décaissé. ${montantDecaissement.toLocaleString()} FCFA crédités sur le compte ${compteCourant.numeroCompte}`;
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
              ? `Décaissement en attente ${channelLabel}: ${montantDecaissement.toLocaleString()} FCFA pour ${clientName}`
              : estProgramme
                ? `Décaissement programmé: ${montantDecaissement.toLocaleString()} FCFA → ${compteCourant.numeroCompte} (${dateDecaissement})`
                : `Décaissement ${channelLabel}: ${montantDecaissement.toLocaleString()} FCFA → ${compteCourant.numeroCompte}`,
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

      res.status(201).json({
        success: true,
        credit: addSnakeCaseAliasesDeep(credit),
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
      console.error("Erreur décaissement crédit:", error);

      // Gestion d'erreur structurée pour le workflow de réapprovisionnement
      if (error instanceof DecaissementInsufficientFundsError) {
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

  // =====================================================
  // DÉCAISSEMENT CAISSE - Endpoints pour le workflow asynchrone
  // =====================================================

  /**
   * GET /api/credits/pending-disbursements
   * Liste les crédits en attente de décaissement physique à la caisse
   */
  app.get("/api/credits/pending-disbursements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const pendingDisbursements = await storage.getPendingLoanDisbursements(agenceFilter?.agenceId);

      res.json({
        success: true,
        data: pendingDisbursements.map(item => ({
          ...(addSnakeCaseAliasesDeep(item.credit) as Record<string, unknown>),
          client: item.client
        })),
        count: pendingDisbursements.length
      });
    } catch (error: any) {
      console.error("Erreur récupération décaissements en attente:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de la récupération des décaissements en attente"
      });
    }
  });

  /**
   * POST /api/credits/:id/caisse-payout
   * Exécute le décaissement physique par le caissier
   * C'est ce bouton "Décaisser" qui sort l'argent et active le prêt
   */
  app.post("/api/credits/:id/caisse-payout", requireAuth, attachAbility, requireAbility(Actions.DISBURSE_CASH, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      if (!user?.id) {
        return res.status(401).json({ message: "Utilisateur non authentifié" });
      }

      // Vérifier que le caissier a une session ouverte
      if (!data.sessionCaisseId) {
        return res.status(400).json({ message: "L'ID de la session de caisse est requis" });
      }

      // Exécuter le décaissement
      const result = await storage.processLoanCashPayout({
        creditId,
        sessionCaisseId: data.sessionCaisseId,
        paymentReference: data.paymentReference || data.receiptNumber
      }, user.id);

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_CAISSE_EXECUTE",
        "credit",
        creditId,
        {
          sessionCaisseId: data.sessionCaisseId,
          paymentReference: data.paymentReference,
          montant: result.credit.montant,
          numeroCredit: result.credit.numeroCredit
        },
        "success",
        "high"
      );

      // Broadcast updates
      const wsInstance = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstance) {
        // Notification globale pour la caisse
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_COMPLETED',
            creditId,
            numeroCredit: result.credit.numeroCredit,
            montant: result.credit.montant,
            timestamp: new Date().toISOString()
          }
        });

        // Notification crédit
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "CREDIT_UPDATE",
            payload: {
              type: 'credit_activated',
              id: creditId
            }
          });
          wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Décaissement espèces effectué: ${parseFloat(result.credit.montant).toLocaleString()} FCFA - Crédit ${result.credit.numeroCredit} activé`,
              user: user?.nom || 'Caissier',
              type: 'credit',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        credit: addSnakeCaseAliasesDeep(result.credit),
        mouvement: result.mouvement,
        echeances: result.echeances,
        message: `Crédit ${result.credit.numeroCredit} décaissé et activé avec succès.`
      });

    } catch (error: any) {
      console.error("Erreur décaissement caisse:", error);

      if (error instanceof DecaissementInsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors du décaissement caisse"
      });
    }
  });

  /**
   * POST /api/credits/:id/cancel-disbursement
   * Annule un décaissement en attente (si le client ne se présente pas)
   */
  app.post("/api/credits/:id/cancel-disbursement", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      const credit = await storage.getCredit(creditId);
      if (!credit) {
        return res.status(404).json({ message: "Crédit non trouvé" });
      }

      if (credit.statut !== 'WAITING_DISBURSEMENT') {
        return res.status(400).json({
          message: `Impossible d'annuler: le crédit n'est pas en attente de décaissement (statut: ${credit.statut})`
        });
      }

      // Mettre à jour le crédit
      const updatedCredit = await storage.updateCredit(creditId, {
        statut: StatutCredit.CANCELLED,
        disbursementStatus: 'COMPLETED' as any // Completed = processed (even if cancelled)
      });

      // Mettre à jour la demande associée si elle existe
      if (credit.demandeId) {
        await storage.updateDemandeCredit(credit.demandeId, {
          statut: StatutDemande.REJECTED
        });
      }

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_ANNULE",
        "credit",
        creditId,
        {
          raison: data.raison || "Client non présenté",
          numeroCredit: credit.numeroCredit
        },
        "success",
        "medium"
      );

      // Broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_CANCELLED',
            creditId,
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        credit: addSnakeCaseAliasesDeep(updatedCredit),
        message: `Décaissement du crédit ${credit.numeroCredit} annulé.`
      });

    } catch (error: any) {
      console.error("Erreur annulation décaissement:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de l'annulation"
      });
    }
  });

  app.get("/api/credits/:id", requireAuth, requireAgenceAccess(), async (req, res) => {
      const credit = await storage.getCredit(req.params.id);
      if (!credit) return res.status(404).json({ message: "Credit not found" });
      
      // Vérifier accès via client
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter?.agenceId) {
        const client = await storage.getClient(credit.clientId);
        if (!client || client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : crédit d'une autre agence" });
        }
      }
      
      res.json(addSnakeCaseAliasesDeep(credit));
  });

  // Demandes
  // Aggregation endpoint for dashboard badges
  app.get("/api/demandes-credit/counts", requireAuth, requireAgenceAccess(), async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agence?: string } | null;
        
        // Base query - only select status and count
        const query = db.select({ 
            status: demandesCredit.statut, 
            count: count() 
        })
        .from(demandesCredit)
        .groupBy(demandesCredit.statut);

        // Apply Agency Filter
        if (agenceFilter?.agence) {
             // We need to join with clients to filter by agency if the filter is string-based
             // However, for performance on counts, if we have agencyId on demandesCredit it is better.
             // Checking schema... yes, agenceId is on demandesCredit.
             
             // First, get the agency ID(s) corresponding to the name filter if needed, 
             // but requireAgenceAccess middleware (if standard) might just work with storage logic.
             // To be safe and consistent with "storage" usage pattern but optimized:
             
             // If we use pure drizzle here we must replicate filter logic. 
             // Let's use the explicit relation if possible.
             
             const agencesList = await db.select({ id: schema.agences.id }).from(schema.agences).where(eq(schema.agences.nom, agenceFilter.agence));
             if (agencesList.length > 0) {
                 const agenceId = agencesList[0].id;
                 query.where(eq(demandesCredit.agenceId, agenceId));
             }
        }
        
        const results = await query;

        // Map to frontend tabs using standardized EN enum values
        // toProcess = PENDING_FEES
        // investigation = READY_FOR_INVESTIGATION + UNDER_INVESTIGATION + INVESTIGATION_COMPLETE
        // approval = PENDING_APPROVAL
        // commission = APPROVED + APPROVED_AFTER_REEVALUATION
        // reevaluation = REEVALUATION_IN_PROGRESS

        const mapping = {
            toProcess: 0,
            investigation: 0,
            approval: 0,
            commission: 0,
            reevaluation: 0,
            archives: 0
        };

        for (const row of results) {
            const s = row.status || '';
            const c = Number(row.count);

            if ([StatutDemande.PENDING_FEES].includes(s as any)) {
                mapping.toProcess += c;
            } else if ([StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION, StatutDemande.INVESTIGATION_COMPLETE].includes(s as any)) {
                mapping.investigation += c;
            } else if (s === StatutDemande.PENDING_APPROVAL) {
                mapping.approval += c;
            } else if ([StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION].includes(s as any)) {
                mapping.commission += c;
            } else if (s === StatutDemande.REEVALUATION_IN_PROGRESS) {
                mapping.reevaluation += c;
            } else if ([StatutDemande.REJECTED, StatutDemande.CANCELLED, StatutDemande.DEFINITIVELY_REJECTED, StatutDemande.DELETED].includes(s as any)) {
                mapping.archives += c;
            }
        }

        res.json(mapping);
      } catch (error: any) {
          console.error("Error fetching credit counts:", error);
          res.status(500).json({ message: "Erreur lors du comptage des dossiers" });
      }
  });

  app.get("/api/demandes-credit", requireAuth, requireAgenceAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      const includeDeleted = req.query.includeDeleted === 'true';
      const filter = agenceFilter ? { agence: agenceFilter.agence, includeDeleted } : { includeDeleted };
      
      const demandes = await storage.getAllDemandes(filter);
      
      res.json(addSnakeCaseAliasesDeep(demandes));
  });

  // Create demande credit (roles: admin, chef, credit, superviseur, terrain)
  app.post("/api/demandes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;

      // Auto-generate numeroDemande if not provided
      if (!data.numeroDemande) {
          // Format: DEM-YYYYMMDD-XXXX
          const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
          data.numeroDemande = `DEM-${dateStr}-${randomSuffix}`;
      }

      // Validation coherence frequence/duree
      if (data.frequenceRemboursement && data.dureeValeur && data.dureeUnite) {
        const resultatValidation = validerCoherenceFrequenceDuree(
          data.frequenceRemboursement as FrequenceRemboursement,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );

        if (!resultatValidation.isValid) {
          return res.status(400).json({
            message: resultatValidation.debugMessage || "Durée invalide pour cette fréquence",
            code: resultatValidation.errorCode || "INVALID_DURATION_FREQUENCY"
          });
        }

        // Calculer automatiquement le nombre d'echeances
        data.nombreEcheances = calculerNombreEcheances(
          data.frequenceRemboursement as FrequenceRemboursement,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );
      }

      // Nettoyage des champs numériques optionnels (évite "invalid input syntax for type numeric: ''")
      const optionalNumericFields = ['revenusMensuels', 'revenuJournalier', 'chargesMensuelles', 'montantApprouve', 'montantFraisEngagement'];
      for (const field of optionalNumericFields) {
        if (data[field] === "") {
          data[field] = null;
        }
      }

      // Always enforce the client's agency
      if (data.clientId) {
        const client = await storage.getClient(data.clientId);
        if (client) {
          data.agenceId = client.agenceId;
        }
      }

      const parsed = insertDemandeCreditSchema.parse(data);

      // Vérifier agence du client
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter?.agenceId) {
        const client = await storage.getClient(parsed.clientId);
        if (!client || client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      const demande = await storage.createDemandeCredit(parsed);
      
      
      // Notify Admins
       const wsInstance = getWsInstance();
      const userAgence = req.session.user?.agence;

      if (wsInstance && userAgence) {
         // Broadcast only to this agency
         wsInstance.broadcastToAgency(userAgence, {
            type: "NOTIFICATION",
            payload: {
               message: `Nouvelle demande de crédit #${demande.id}`,
               targetRole: "admin"
            }
         });
         // Update Dashboard & Credits List
         wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
         wsInstance.broadcastToAgency(userAgence, { type: "CREDIT_UPDATE", payload: {} });
         
         // Activité en temps réel
         wsInstance.broadcastToAgency(userAgence, {
           type: "LIVE_ACTIVITY",
           payload: {
             action: `Nouveau crédit: ${Number(parsed.montantDemande || 0).toLocaleString()} FCFA`,
             user: req.session.user?.nom || 'Système',
             type: 'credit',
             timestamp: new Date().toISOString()
           }
         });
      }
      
      // Domain event: credit request created
      dispatchDomainEvent({
        type: "CREDIT_REQUEST_CREATED",
        data: {
          demandeId: demande.id,
          numeroDemande: demande.numeroDemande,
          clientId: parsed.clientId,
          montantDemande: Number(parsed.montantDemande || 0),
          agenceId: req.session.user?.agenceId,
          createdByUserId: req.session.user?.id,
          createdByName: req.session.user?.nom,
        },
        timestamp: new Date(),
      });

      res.json(addSnakeCaseAliasesDeep(demande));
  });

  app.patch("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = normalizeKeysDeep(req.body) as any;

      // Verify existence
      const existing = await storage.getDemandeCredit(id);
      if (!existing) return res.status(404).json({ message: "Demande non trouvée" });

      let updated;

      // Auto-transition: UNDER_INVESTIGATION → INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      // When approving from investigation status, automatically route through intermediate states
      if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.UNDER_INVESTIGATION) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.INVESTIGATION_COMPLETE }, tx);
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Auto-transition: INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      else if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.INVESTIGATION_COMPLETE) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Logic for Refund on Rejection
      else if (updateData.statut === StatutDemande.REJECTED && updateData.montantRemboursement && Number(updateData.montantRemboursement) > 0) {
          const refundAmount = Number(updateData.montantRemboursement);

          updated = await db.transaction(async (tx) => {
            // 1. Validation
            if (!existing.fraisEngagementPayes) {
               throw new Error("Aucun frais n'a été payé pour cette demande.");
            }
            const maxRefund = Number(existing.montantFraisEngagement || 0);
            if (refundAmount > maxRefund) {
               throw new Error(`Le montant du remboursement (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund}).`);
            }

            // 2. Create Refund Request (Wait for approval/payment)
            await storage.createCreditRefundRequest({
              demandeId: existing.id,
              clientId: existing.clientId,
              agenceId: req.session.user?.agenceId!, // Validated by middleware
              montantEncaisse: existing.montantFraisEngagement?.toString() || '0',
              montantRemboursable: refundAmount.toString(),
              montantNonRemboursable: (maxRefund - refundAmount).toString(),
              statut: 'SUBMITTED', // Ready for approval/payment
              motifRejetCredit: updateData.motifRejet,
              motifRemboursement: "Remboursement suite rejet", // Default
              makerId: req.session.user?.id,
              makerAt: new Date(),
            }, tx);

            // 3. Update Demande Status (State Machine guard in storage layer)
            // Motif Rejet Update
            if (updateData.motifRejet) {
                 updateData.motifRejet += ` (Remboursement de ${refundAmount} FCFA en attente)`;
            }

            return await storage.updateDemandeCredit(id, updateData, tx);
          });
      } else {
          // Normal update (State Machine guard in storage layer)
          updated = await storage.updateDemandeCredit(id, updateData);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "CREDIT_UPDATE",
            payload: {
              type: 'demande_updated',
              id,
              statut: updateData.statut
            }
          });

           // Si approuvée, notifier en temps réel + SMS
           if (updateData.statut === StatutDemande.APPROVED) {
              const userAgence = req.session.user?.agence;
              if (userAgence) {
                wsInstance.broadcastToAgency(userAgence, {
                  type: "LIVE_ACTIVITY",
                  payload: {
                    action: `Crédit Approuvé: #${existing.numeroDemande}`,
                    user: req.session.user?.nom || 'Système',
                    type: 'validation',
                    timestamp: new Date().toISOString()
                  }
                });
              }

              // Dispatch domain event for credit approval notification
              const montantNotification = existing.montantApprouve || existing.montantDemande;
              if (existing.clientId && montantNotification) {
                dispatchDomainEvent({
                  type: "CREDIT_APPROVED",
                  data: {
                    demandeId: existing.id,
                    numeroDemande: existing.numeroDemande,
                    clientId: existing.clientId,
                    montantApprouve: Number(montantNotification),
                    agenceId: req.session.user?.agenceId,
                    approvedByUserId: req.user?.id,
                  },
                  timestamp: new Date(),
                });
              }
           }

           // Si rejetée, notifier le client
           if (updateData.statut === StatutDemande.REJECTED && existing.clientId) {
              dispatchDomainEvent({
                type: "CREDIT_REJECTED",
                data: {
                  demandeId: existing.id,
                  numeroDemande: existing.numeroDemande,
                  clientId: existing.clientId,
                  motifRejet: updateData.motifRejet,
                  agenceId: req.session.user?.agenceId,
                  rejectedByUserId: req.user?.id,
                },
                timestamp: new Date(),
              });
           }
      }

      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (error: any) {
      console.error("Erreur mise à jour demande crédit:", error);

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de la mise à jour de la demande" });
    }
  });

  app.delete("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const success = await storage.deleteDemandeCredit(req.params.id);
      if (!success) return res.status(404).json({ message: "Demande non trouvée" });
      
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_deleted', id: req.params.id } });
      }
      
      res.json({ success: true });
  });

  app.put("/api/demandes-credit/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { motif } = req.body;
      // State Machine guard is in storage.cancelDemandeCredit
      const demande = await storage.cancelDemandeCredit(req.params.id, motif);

      if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_cancelled', id: req.params.id } });
      }

      res.json(addSnakeCaseAliasesDeep(demande));
    } catch (error: any) {
      console.error("Erreur annulation demande crédit:", error);

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de l'annulation de la demande" });
    }
  });

  // Reject a credit application from Commission Crédit phase
  app.post("/api/demandes/:id/reject-from-commission", requireAuth, attachAbility, requireAbility(Actions.REJECT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const { motif_rejet } = req.body;

      // Validation
      if (!motif_rejet || typeof motif_rejet !== 'string') {
        return res.status(400).json({ message: "Le motif de rejet est requis" });
      }

      if (motif_rejet.trim().length < 10) {
        return res.status(400).json({ message: "Le motif de rejet doit contenir au moins 10 caractères" });
      }

      if (motif_rejet.length > 500) {
        return res.status(400).json({ message: "Le motif de rejet ne peut pas dépasser 500 caractères" });
      }

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is eligible for commission rejection
      const statutsEligiblesCommission = [StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as string[];
      if (!demande.statut || !statutsEligiblesCommission.includes(demande.statut)) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être rejetée depuis la commission (statut actuel: ${demande.statut}). Seules les demandes approuvées peuvent être rejetées à cette étape.`
        });
      }

      // Update demande status to REJECTED
      const updated = await storage.updateDemandeCredit(id, {
        statut: StatutDemande.REJECTED,
        motifRejet: motif_rejet.trim(),
        dateRejet: new Date()
      });

      // Log audit
      await logAudit(
        req,
        "REJECT_FROM_COMMISSION",
        "demande_credit",
        id,
        {
          numeroDemande: demande.numeroDemande,
          motifRejet: motif_rejet.trim(),
          statusAvant: StatutDemande.APPROVED,
          statusApres: StatutDemande.REJECTED
        },
        "success",
        "high"
      );

      // Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ 
          type: "CREDIT_UPDATE", 
          payload: { 
            type: 'demande_rejected_from_commission', 
            id,
            motif: motif_rejet.trim()
          } 
        });

        const userAgence = req.session.user?.agence;
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande rejetée en commission: ${demande.numeroDemande}`,
              user: req.session.user?.nom || 'Système',
              type: 'validation',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({ 
        success: true,
        message: "Demande rejetée avec succès",
        demande: addSnakeCaseAliasesDeep(updated)
      });
    } catch (error: any) {
      console.error("Erreur rejet commission:", error);
      res.status(500).json({ message: error.message || "Erreur lors du rejet de la demande" });
    }
  });

  app.post("/api/demandes-credit/:id/payer-frais", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          const user = req.session.user;
          
          let sessionCaisseId: string | undefined;
          let activeSession: any = undefined;

          if (user) {
              // Admin override
              const normalizedRole = normalizeRole(user.role);
              if (data.sessionCaisseId && (normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE)) {
                  activeSession = await storage.getSessionCaisse(data.sessionCaisseId);
                  if (activeSession && !activeSession.closedAt) {
                      sessionCaisseId = activeSession.id;
                  }
              }

              // Default to user's active session if not overridden or invalid
              if (!sessionCaisseId) {
                  activeSession = await storage.getActiveSessionForUser(user.id);
                  if (activeSession) {
                      sessionCaisseId = activeSession.id;
                  }
              }
          }

          if (!sessionCaisseId) {
              return res.status(400).json({ message: "Aucune caisse ouverte. Vous devez ouvrir votre caisse pour encaisser des frais." });
          }

          // Validation Agence: Le client doit payer dans SON agence
          const demande = await storage.getDemandeCredit(req.params.id);
          if (!demande) return res.status(404).json({ message: "Demande introuvable" });

          const client = await storage.getClient(demande.clientId);
          if (client) {
             const sessionAgenceId = activeSession.agenceId;
             const clientAgenceId = client.agenceId;

             if (sessionAgenceId && clientAgenceId && sessionAgenceId !== clientAgenceId) {
                 return res.status(403).json({ message: "Le client est affilié à une autre agence. Encaissement refusé." });
             }
          }

          const result = await storage.payerFraisEngagement({
              demandeId: req.params.id,
              montant: data.montant.toString(),
              methodePaiement: data.methodePaiement || 'Espèces',
              sessionCaisseId,
              idempotencyKey: data.idempotencyKey
          }, user?.id);

          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_frais_payes', id: req.params.id } });
              if (user?.agence) {
                  wsInstance.broadcastToAgency(user.agence, { type: "DASHBOARD_UPDATE", payload: {} });
              }
          }

          res.json(addSnakeCaseAliasesDeep(result));
      } catch (error: any) {
          console.error("Erreur paiement frais:", error);
          res.status(400).json({ message: error.message });
      }
  });

  // Initiate refund for already rejected demande
  app.post("/api/demandes-credit/:id/initiate-refund", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as { montantRemboursement: number; motif?: string };
      const user = req.session.user;

      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // 1. Validate demande exists and is rejected
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const isRejected = demande.statut === StatutDemande.REJECTED ||
                         demande.statut === StatutDemande.DEFINITIVELY_REJECTED;

      if (!isRejected) {
        return res.status(400).json({ message: "La demande n'est pas en statut rejeté" });
      }

      // 2. Validate fees were paid
      if (!demande.fraisEngagementPayes) {
        return res.status(400).json({ message: "Aucun frais n'a été payé pour cette demande" });
      }

      // 3. Validate refund amount
      const refundAmount = Number(data.montantRemboursement);
      const maxRefund = Number(demande.montantFraisEngagement || 0);

      if (isNaN(refundAmount) || refundAmount <= 0) {
        return res.status(400).json({ message: "Montant de remboursement invalide" });
      }

      if (refundAmount > maxRefund) {
        return res.status(400).json({
          message: `Le montant (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund})`
        });
      }

      // 4. Check if a refund request already exists for this demande
      const existingRefunds = await db.select()
        .from(creditRefundRequests)
        .where(and(
          eq(creditRefundRequests.demandeId, id),
          inArray(creditRefundRequests.statut, ['SUBMITTED', 'APPROVED', 'PENDING_CAISSE'])
        ));

      if (existingRefunds.length > 0) {
        return res.status(400).json({
          message: "Une demande de remboursement est déjà en cours pour ce dossier"
        });
      }

      // 5. Create Refund Request
      const refundRequest = await storage.createCreditRefundRequest({
        demandeId: demande.id,
        clientId: demande.clientId,
        agenceId: user.agenceId!,
        montantEncaisse: demande.montantFraisEngagement?.toString() || '0',
        montantRemboursable: refundAmount.toString(),
        montantNonRemboursable: (maxRefund - refundAmount).toString(),
        statut: 'SUBMITTED',
        motifRejetCredit: demande.motifRejet || undefined,
        motifRemboursement: data.motif || "Remboursement suite rejet de la demande",
        makerId: user.id,
        makerAt: new Date(),
      });

      // 6. Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CREDIT_UPDATE",
          payload: { type: 'refund_created', demandeId: id, refundId: refundRequest.id }
        });
        if (user.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande remboursement créée: ${refundAmount.toLocaleString('fr-FR')} FCFA`,
              user: user.nom || 'Système',
              type: 'finance',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        message: "Demande de remboursement créée avec succès",
        refund: addSnakeCaseAliasesDeep(refundRequest)
      });
    } catch (error: any) {
      console.error("Erreur création remboursement:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la création du remboursement" });
    }
  });

  // Get refund status for a demande
  app.get("/api/demandes-credit/:id/refund-status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Find any refund request for this demande (not cancelled/rejected)
      const refunds = await db.select()
        .from(creditRefundRequests)
        .where(eq(creditRefundRequests.demandeId, id))
        .orderBy(desc(creditRefundRequests.createdAt));

      // Find the most relevant refund (paid > in progress > none)
      const activeRefund = refunds.find(r =>
        ['PAID', 'PENDING_CAISSE', 'APPROVED', 'SUBMITTED'].includes(r.statut)
      );

      if (!activeRefund) {
        return res.json({ refund: null });
      }

      res.json({
        refund: addSnakeCaseAliasesDeep({
          id: activeRefund.id,
          statut: activeRefund.statut,
          montantRemboursable: Number(activeRefund.montantRemboursable),
          montantEncaisse: Number(activeRefund.montantEncaisse),
          paymentMethod: activeRefund.paymentMethod,
          paidAt: activeRefund.paidAt,
          createdAt: activeRefund.createdAt
        })
      });
    } catch (error: any) {
      console.error("Erreur récupération statut remboursement:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/demandes-credit/:id/enquete", requireAuth, async (req, res) => {
      const enquete = await storage.getEnqueteByDemandeId(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });
      res.json(addSnakeCaseAliasesDeep(enquete));
  });

  // Obtenir le détail du scoring pour une demande
  app.get("/api/demandes-credit/:id/scoring", requireAuth, async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance } = await import('../services/microfinance-scoring');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      res.json({
        demandeId: demande.id,
        numeroDemande: demande.numeroDemande,
        ...scoringResult
      });
    } catch (error: any) {
      console.error("Erreur calcul scoring:", error);
      res.status(500).json({ message: error.message || "Erreur lors du calcul du scoring" });
    }
  });

  // Recalculer le score d'une demande
  app.post("/api/demandes-credit/:id/recalculer-score", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance, mettreAJourScoreClient } = await import('../services/microfinance-scoring');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      // Mettre à jour le score de la demande
      await storage.updateDemandeCredit(demande.id, {
        scoreCredit: scoringResult.score
      });

      // Mettre à jour le score du client
      await mettreAJourScoreClient(demande.clientId);

      res.json({
        message: "Score recalculé avec succès",
        nouveauScore: scoringResult.score,
        grade: scoringResult.grade,
        recommendation: scoringResult.recommendation,
        details: scoringResult.details
      });
    } catch (error: any) {
      console.error("Erreur recalcul scoring:", error);
      res.status(500).json({ message: error.message || "Erreur lors du recalcul du scoring" });
    }
  });

  // Timeline d'une demande
  app.get("/api/demandes-credit/:id/timeline", requireAuth, async (req, res) => {
      try {
          // Allow fetching timeline for deleted/archived requests
          const demande = await storage.getDemandeCredit(req.params.id, true);
          if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

          const timeline = [];

          // 1. Demande Créée
          if (demande.createdAt) {
              timeline.push({
                  id: 'creation',
                  type: 'DEMANDE',
                  date: demande.createdAt,
                  titre: 'Demande Créée',
                  description: `Dossier N° ${demande.numeroDemande} initié`,
                  statut: 'Créée'
              });
          }

          // 2. Frais
          if (demande.fraisEngagementPayes) {
             timeline.push({
                 id: 'frais',
                 type: 'FRAIS',
                 date: demande.updatedAt || demande.createdAt,
                 titre: 'Frais Payés',
                 description: 'Frais de dossier réglés',
                 statut: 'PAID'
             });
          }

          // 3. Enquête
          const enquetes = await storage.getEnqueteByDemandeId(demande.id);
          const enquete = enquetes?.[0];
          if (enquete) {
              const enqueteStatus = enquete.statut || StatutEnquete.IN_PROGRESS;

              timeline.push({
                  id: 'enquete_start',
                  type: 'ENQUETE',
                  date: enquete.createdAt,
                  titre: 'Enquête Terrain',
                  description: `Enquête assignée (${enquete.typeActivite || 'Activité'})`,
                  statut: enqueteStatus
              });
          }

          // 4. Decision (Comité)
          // Check if status implies approval or rejection using enum constants
          const decisionStatuses = [
            StatutDemande.APPROVED,
            StatutDemande.APPROVED_AFTER_REEVALUATION,
            StatutDemande.REJECTED,
            StatutDemande.DEFINITIVELY_REJECTED
          ];
          const isDecided = decisionStatuses.includes(demande.statut as any);
          if (isDecided || demande.dateRejet) {
              const isRejected = demande.statut === StatutDemande.REJECTED || demande.statut === StatutDemande.DEFINITIVELY_REJECTED;
              timeline.push({
                  id: 'decision',
                  type: 'DECISION',
                  date: demande.dateRejet || demande.updatedAt || new Date(),
                  titre: isRejected ? 'Demande Rejetée' : 'Approbation Comité',
                  description: isRejected ? (demande.motifRejet || 'Dossier rejeté') : `Montant approuvé: ${demande.montantApprouve || demande.montantDemande}`,
                  statut: demande.statut
              });
          }

          // 5. Décaissement (Link via Credit)
          // Use direct DB query as storage method might be missing for this specific lookup
          const [credit] = await db.select().from(credits).where(eq(credits.demandeId, demande.id));
          
          if (credit) {
              timeline.push({
                 id: 'decaissement',
                 type: 'DECAISSEMENT',
                 date: credit.dateDebut || credit.createdAt || new Date(),
                 titre: 'Crédit Décaissé',
                 description: `Crédit N° ${credit.numeroCredit} actif.`,
                 statut: StatutDemande.DISBURSED
              });
          }

          // 6. Suppression
          if (demande.deletedAt) {
              timeline.push({
                  id: 'suppression',
                  type: 'SUPPRESSION',
                  date: demande.deletedAt,
                  titre: 'Demande Supprimée',
                  description: 'Le dossier a été supprimé.',
                  statut: StatutDemande.DELETED
              });
          }

          // Sort by date
          timeline.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

          res.json({ success: true, timeline, demande });

      } catch (error: any) {
          console.error("Timeline error:", error);
          res.status(500).json({ message: error.message });
      }
  });

  // Enquetes (roles: admin, chef, credit, superviseur)
  app.get("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.DEMANDE_CREDIT), async (req, res) => {
      // Return both completed/in-progress enquetes AND demandes ready for investigation
      // Actually, for now, let's just return enquetes. Frontend can merge if needed, 
      // or we can handle it here.
      // But standard pattern is:
      const enquetes = await storage.getAllEnquetes();
      res.json(addSnakeCaseAliasesDeep(enquetes));
  });

  app.post("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body);
          const parsed = insertEnqueteCreditSchema.parse(data);
          const enquete = await storage.createEnqueteCredit(parsed);

          // Update Demande Status - Transition vers "En enquête" (pas "Enquête terminée")
          // Workflow: READY_FOR_INVESTIGATION -> UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE
          if (enquete.demandeId) {
              await storage.updateDemandeCredit(enquete.demandeId, { statut: StatutDemande.UNDER_INVESTIGATION as any });
          }

          // Notify Credit Update
          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'enquete_new', demandeId: parsed.demandeId } });
          }

          res.json(addSnakeCaseAliasesDeep(enquete));
      } catch (error: any) {
          console.error('[Enquete Create Error]', error);
          res.status(500).json({
              message: error.message || 'Erreur lors de la création de l\'enquête',
              code: 'ENQUETE_CREATE_ERROR'
          });
      }
  });

  app.post("/api/enquetes-credit/:id/valider", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const { decision, montant_approuve, commentaire, raison } = req.body;

      const enquete = await storage.getEnqueteCredit(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // IDEMPOTENCE CHECK: Verify enquete is not already processed
      const terminalStatuses = [StatutEnquete.APPROVED, StatutEnquete.REJECTED, StatutEnquete.REDUCED];
      if (terminalStatuses.includes(enquete.statut as any)) {
          return res.status(409).json({
              message: "Cette enquête a déjà été traitée",
              statut_actuel: enquete.statut,
              code: "ALREADY_PROCESSED"
          });
      }

      const decisionLower = decision?.toLowerCase?.() || decision;
      const statutEnquete = decisionLower === 'approved'
        ? StatutEnquete.APPROVED
        : decisionLower === 'rejected'
          ? StatutEnquete.REJECTED
          : StatutEnquete.REDUCED;

      const updatedEnquete = await storage.updateEnqueteCredit(req.params.id, {
          statut: statutEnquete,
          recommandation: commentaire || raison // Store comment
      });

      // Update Demande status - Workflow: UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE -> PENDING_APPROVAL
      // The enquête validation moves the demande to PENDING_APPROVAL for committee decision
      if (enquete.demandeId) {
          // Step 1: Transition to INVESTIGATION_COMPLETE (enquête terminée)
          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.INVESTIGATION_COMPLETE as any
          });

          // Step 2: Transition to PENDING_APPROVAL (en attente d'approbation par le comité)
          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.PENDING_APPROVAL as any,
              montantApprouve: montant_approuve ? montant_approuve.toString() : undefined
          });

          // Notify
          const wsInstance = getWsInstance();
          if (wsInstance) {
               wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_updated', id: enquete.demandeId, statut: StatutDemande.PENDING_APPROVAL } });
          }
      }

      res.json(addSnakeCaseAliasesDeep(updatedEnquete));
  });

  // Remboursements (roles: admin, chef, caisse, credit)
  // Now using atomic ledger flow
  app.post("/api/remboursements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;
        
        // Get active session if user is caissier
        let sessionCaisseId: string | undefined;
        if (user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }
        
        // Use atomic ledger function
        const { remboursement, mouvement } = await storage.createRemboursementWithLedger({
          creditId: data.creditId,
          montant: data.montant,
          methodePaiement: data.methodePaiement || 'Espèces',
          sessionCaisseId,
          observations: data.observations,
          idempotencyKey: data.idempotencyKey,
        }, user?.id);
        
        // WebSocket notifications are now handled by outbox worker
        // But we still broadcast dashboard update for backward compatibility
        const wsInstance = getWsInstance();
        const userAgence = user?.agence;

        if (wsInstance && userAgence) {
            wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
            
            // Activité en temps réel
            wsInstance.broadcastToAgency(userAgence, {
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Remboursement: ${Number(data.montant).toLocaleString()} FCFA`,
                user: user?.nom || 'Système',
                type: 'payment',
                timestamp: new Date().toISOString()
              }
            });
        }

        res.json(addSnakeCaseAliasesDeep({ ...remboursement, mouvement_id: mouvement.id }));
      } catch (error: any) {
        console.error('Error creating remboursement:', error);
        res.status(400).json({ message: error.message || 'Erreur lors du remboursement' });
      }
  });

  app.get("/api/credits/:id/remboursements", requireAuth, async (req, res) => {
      const rembs = await storage.getRemboursementsByCredit(req.params.id);
      res.json(addSnakeCaseAliasesDeep(rembs));
  });

  // ============================================================================
  // COMPTES ENDPOINTS - See /api/comptes in server/routes/comptes.ts
  // All account operations (create, deposit, withdrawal, block, unblock, transfer)
  // are now handled by the unified comptes routes.
  // ============================================================================

  // Caisse Management
  app.get("/api/agences/:id/caisses", requireAuth, requireAgenceAccess(), async (req, res) => {
      const caisses = await storage.getCaissesByAgence(req.params.id);
      
      // Enrichir avec le statut "Occupé" en temps réel
      // Une caisse est occupée si elle a une session active (closedAt IS NULL)
      const activeSessions = await storage.getActiveSessions();
      
      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance for active session
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);

                // Use centralized helper functions from caisse-operations.ts
                const delta = getOperationDelta(op.typeOperation, montant, {
                    reference: op.reference,
                    description: op.description
                });
                solde += delta;
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // montantReporte is set during the closing workflow when cashier decides to keep funds
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               const montantReporte = Number(lastClosedSession.montantReporte || 0);
               const soldeCaisse = Number(c.solde || 0);
               const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);
               const montantTheorique = Number(lastClosedSession.montantFermetureTheorique || 0);

               if (montantReporte > 0) {
                  currentSolde = montantReporte.toString();
               } else if (soldeCaisse > 0) {
                  currentSolde = soldeCaisse.toString();
               } else if (montantDeclare > 0) {
                  currentSolde = montantDeclare.toString();
               } else if (montantTheorique > 0) {
                  currentSolde = montantTheorique.toString();
               } else {
                  currentSolde = "0";
               }
            } else {
               // No closed session, use caisse.solde directly
               currentSolde = c.solde || "0";
            }
         }

         const assignments = await storage.getCaisseAssignments(c.id);
         return {
             ...c,
             solde: currentSolde,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId)
         };
      }));

      res.json(addSnakeCaseAliasesDeep(enrichedCaisses));
  });

  app.get("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
      // Admin only: Get ALL caisses
      const caisses = await storage.getAllCaisses();
      const activeSessions = await storage.getActiveSessions();
      
      // Need agency names for grouping
      // We can fetch all agencies or assume frontend has them. 
      // Better to enrich here if possible, but storage.getAllCaisses returns flat Caisse objects.
      // Frontend can match agenceId to Agency Name if it constructs the map.
      // Let's stick to returning the caisses list. Frontend will handle grouping.

      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && !s.closedAt);
         let currentSolde = "0";

         if (activeSession) {
            // Calculate real-time balance using Ledger SENS (Source of Truth)
            // This fixes discrepancies where some operation types were missing from the hardcoded list
            const ops = await storage.getOperationsBySessionWithSens(activeSession.id);
            let solde = Number(activeSession.montantOuverture || 0);

            for (const op of ops) {
                const montant = Number(op.montant || 0);
                // Support both old FR and new EN values
                if (op.sens === 'CREDIT' || op.sens === 'Crédit') {
                    solde += montant;
                } else if (op.sens === 'DEBIT' || op.sens === 'Débit') {
                    solde -= montant;
                }
            }
            currentSolde = solde.toString();
         } else {
            // Get balance from last closed session
            const lastClosedSession = await storage.getLastClosedSession(c.id);
            if (lastClosedSession) {
               // Priority: montantReporte (funds kept for next day) > caisse.solde > declared amount
               // IMPORTANT: Use Number() to check actual value, not string truthiness ("0" is truthy!)
               const montantReporte = Number(lastClosedSession.montantReporte || 0);
               const soldeCaisse = Number(c.solde || 0);
               const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);
               const montantTheorique = Number(lastClosedSession.montantFermetureTheorique || 0);

               if (montantReporte > 0) {
                  currentSolde = montantReporte.toString();
               } else if (soldeCaisse > 0) {
                  currentSolde = soldeCaisse.toString();
               } else if (montantDeclare > 0) {
                  currentSolde = montantDeclare.toString();
               } else if (montantTheorique > 0) {
                  currentSolde = montantTheorique.toString();
               } else {
                  currentSolde = "0";
               }
            } else {
               // No closed session, use caisse.solde directly
               currentSolde = c.solde || "0";
            }
         }

         const assignments = await storage.getCaisseAssignments(c.id);
         return {
             ...c,
             solde: currentSolde,
             isOccupied: !!activeSession,
             occupiedBy: activeSession ? activeSession.caissierId : null,
             sessionId: activeSession ? activeSession.id : null,
             assignments: assignments.map(a => a.userId)
         };
      }));

      res.json(addSnakeCaseAliasesDeep(enrichedCaisses));
  });

  app.post("/api/caisses/:id/assign", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const { id } = req.params;
      const { userIds } = req.body; // Expect array of user IDs
      
      if (!Array.isArray(userIds)) {
          return res.status(400).json({ message: "userIds must be an array" });
      }

      await storage.setCaisseAssignments(id, userIds, req.session.user!.id);
      res.json({ success: true });
  });

  app.post("/api/caisses", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user!;
      
      const isAdmin = isAdminRole(user.role);
      
      // If admin, use provided agenceId (validate it exists?)
      // If not admin, FORCE user's agenceId
      if (!isAdmin) {
          data.agenceId = user.agenceId;
      } else {
          // Admin must provide agenceId
          if (!data.agenceId) {
             return res.status(400).json({ message: "L'agence est obligatoire pour la création par un administrateur." });
          }
      }

      const parsed = insertCaisseSchema.parse(data);
      const caisse = await storage.createCaisse(parsed);
      res.status(201).json(addSnakeCaseAliasesDeep(caisse));
  });

  app.delete("/api/caisses/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const caisse = await storage.getCaisse(id);
    if (!caisse) return res.status(404).json({ message: "Caisse non trouvée" });

    // Check Agency Access
    if (!isAdminRole(user.role) && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ message: "Accès refusé à cette agence" });
    }

    const deleted = await storage.deleteCaisse(id);
    if (!deleted) {
        return res.status(409).json({ message: "Impossible de supprimer cette caisse car elle a déjà été utilisée (historique présent)." });
    }

    res.json({ success: true });
  });

  app.get("/api/sessions-caisse/active", requireAuth, async (req, res) => {
      const user = req.session.user!;
      const session = await storage.getActiveSessionForUser(user.id);
      res.json(addSnakeCaseAliasesDeep(session || null));
  });

  /**
   * GET /api/sessions-caisse/my-caisses
   * Récupère les caisses assignées à l'utilisateur avec leur solde disponible
   * Utilisé par le dashboard pour afficher le solde quand aucune session n'est active
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/my-caisses", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const caisses = await storage.getUserAssignedCaissesWithBalance(user.id);
    res.json(addSnakeCaseAliasesDeep(caisses));
  });

  app.get("/api/sessions-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), requireAgenceIdAccess(), async (req, res) => {
      // Use requireAgenceIdAccess for more robust agence filtering (uses UUIDs from userAgences)
      const agenceId = req.selectedAgenceId || req.query.agenceId as string;
      const requestedStatut = req.query.statut as string;

      const filter = { 
        agence: agenceId,
        statut: requestedStatut
      };
      
      const sessions = await storage.getAllSessionsCaisse(filter);
      res.json(addSnakeCaseAliasesDeep(sessions));
  });

  /**
   * GET /api/sessions-caisse/closing
   * Récupère les sessions en cours de fermeture pour l'agence (supervision)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/closing", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), async (req, res) => {
    const user = req.session.user!;
    const agenceId = (req.query.agenceId as string) || user.agenceId;

    if (!agenceId) {
      return res.status(400).json({ message: "L'agence est requise" });
    }

    const sessions = await sessionClosingService.getClosingSessionsForAgence(agenceId);
    res.json(addSnakeCaseAliasesDeep(sessions));
  });

  /**
   * GET /api/sessions-caisse/pending
   * Récupère la session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED) de l'utilisateur
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/pending", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const session = await sessionOpeningService.getPendingSession(user.id);
    res.json(addSnakeCaseAliasesDeep(session || null));
  });

  /**
   * Sessions à risque (inactives depuis trop longtemps)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/risky", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const riskySessions = await sessionService.getRiskySessions();
          res.json(addSnakeCaseAliasesDeep(riskySessions));
      } catch (error: any) {
          console.error("Erreur récupération sessions à risque:", error);
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Sessions avec écarts significatifs (monitoring)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.get("/api/sessions-caisse/ecarts", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
          const sessionsWithEcarts = await sessionService.getSessionsWithSignificantEcarts(threshold);
          res.json(addSnakeCaseAliasesDeep(sessionsWithEcarts));
      } catch (error: any) {
          console.error("Erreur récupération écarts:", error);
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Fermer les sessions expirées (route admin pour déclencher manuellement ou via cron)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  app.post("/api/sessions-caisse/close-expired", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const timeoutHours = req.body.timeoutHours ? Number(req.body.timeoutHours) : 12;
          const closedSessions = await sessionService.closeExpiredSessions(timeoutHours);

          // Notifier via WebSocket
          const wsInstance = getWsInstance();
          if (wsInstance && closedSessions.length > 0) {
              closedSessions.forEach(s => {
                  wsInstance.broadcast({
                      type: "SESSION_TIMEOUT",
                      payload: { sessionId: s.sessionId, caisseId: s.caisseId }
                  });
              });
              wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
          }

          res.json({
              success: true,
              closedCount: closedSessions.length,
              closedSessions
          });
      } catch (error: any) {
          console.error("Erreur fermeture sessions expirées:", error);
          res.status(500).json({ message: error.message });
      }
  });

  app.get("/api/sessions-caisse/:id", requireAuth, async (req, res) => {
      const session = await storage.getSessionCaisse(req.params.id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });
      
      const operations = await storage.getOperationsBySession(req.params.id);
      res.json(addSnakeCaseAliasesDeep({ ...session, operations }));
  });

  app.get("/api/sessions-caisse/caissier/:id", requireAuth, async (req, res) => {
      try {
          const sessions = await storage.getSessionsByCaissier(req.params.id);
          res.json(addSnakeCaseAliasesDeep(sessions));
      } catch (error: any) {
          res.status(500).json({ message: error.message });
      }
  });

  // Session caisse (roles: admin, chef, caisse, et autres si assignés)
  // Utilise le service atomique pour éviter les race conditions
  app.post("/api/sessions-caisse", requireAuth, async (req, res) => {
      // 1. Validate Roles & Assignments
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

      const data = normalizeKeysDeep(req.body) as any;

      // Validation basique des données requises
      if (!data.caisseId) {
          return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
      }

      // Check Assignment if not Manager
      if (!isManager) {
          const assignments = await storage.getCaisseAssignments(data.caisseId);
          const isAssigned = assignments.some(a => a.userId === user.id);

          if (!isAssigned) {
              return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
          }
      }

      // 2. Utiliser le service atomique pour l'ouverture de session
      // Ce service gère les race conditions, la validation du billetage et l'audit
      const result = await sessionService.openSessionAtomic({
          caissierId: data.caissierId || user.id,
          caisseId: data.caisseId,
          agenceId: data.agenceId,
          soldeInitial: data.soldeInitial || "0",
          billetageOuverture: data.billetageOuverture || {},
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
          // Mapper les codes d'erreur vers les codes HTTP appropriés
          const statusMap: Record<string, number> = {
              CAISSE_OCCUPIED: 409,
              USER_HAS_SESSION: 409,
              INVALID_BILLETAGE: 400,
              DB_ERROR: 500,
          };
          const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
          return res.status(status).json({
              message: result.error,
              errorCode: result.errorCode
          });
      }

      // 3. Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: data.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      // 4. Log d'audit (déjà fait dans le service, mais on peut ajouter un log supplémentaire ici)
      await logAudit(
          req,
          "SESSION_OPENED",
          "caisse",
          result.session.id,
          { caisseId: data.caisseId, soldeInitial: result.session.montantOuverture },
          "success",
          "low"
      );

      res.json(addSnakeCaseAliasesDeep(result.session));
  });

  // Clôture de session
  app.post("/api/sessions-caisse/:id/close", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;
      
      const session = await storage.getSessionCaisse(id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });

      // Permission check: User must be the owner OR Admin/Chef
      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
      if (session.caissierId !== user.id && !isManager) {
          return res.status(403).json({ message: "Vous n'avez pas l'autorisation de fermer cette session" });
      }

      const data = normalizeKeysDeep(req.body) as any;
      const billetageFermeture = data.billetageFermeture || {};
      const observations = data.observations;

      // 1. Calculate Real Balance from Billetage
      let soldeReel = 0;
      // Define values for cash counting (should ideally be shared constant)
      const VALUES: Record<string, number> = {
          'billets_10000': 10000, 'billets_5000': 5000, 'billets_1000': 1000, 'billets_500': 500,
          'billets_200': 200, 'billets_100': 100, 'billets_50': 50,
          'pieces_20': 20, 'pieces_10': 10, 'pieces_5': 5
      };

      for (const [key, count] of Object.entries(billetageFermeture)) {
          if (VALUES[key]) {
              soldeReel += (Number(count) || 0) * VALUES[key];
          }
      }

      // 2. Calculate Theoretical Balance (Initial + Ops)
      // This logic should be robust. For now, we trust the frontend 'soldeTheorique' if provided, BUT better to recalculate.
      // Let's recalculate for security.
      const ops = await storage.getOperationsBySession(id);
      let soldeTheorique = Number(session.montantOuverture);
      
      // Add Operations
      for (const op of ops) {
          const montant = Number(op.montant);

          // Use centralized helper functions from caisse-operations.ts
          const delta = getOperationDelta(op.typeOperation, montant, {
              reference: op.reference,
              description: op.description
          });
          soldeTheorique += delta;
      }

      // Add Transfers (IN/OUT)
      // Pending implementation of Transfer logic affecting session balance directly?
      // For MVP closure, we assume Ops cover most. If Transfers exist, they should generate Ops or be queried.
      // Let's assume for now Ops are the source of truth.

      // 3. Calculate Ecart
      const ecart = soldeReel - soldeTheorique;

      // 4. Update Session
      const closedSession = await storage.closeSessionCaisse(id, {
          soldeReel: soldeReel.toString(),
          ecart: ecart.toString(),
          billetageFermeture,
          observations
      });

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(addSnakeCaseAliasesDeep(closedSession));
  });

  // ============================================================================
  // ROUTES DE MONITORING ET HEARTBEAT (Production)
  // ============================================================================

  // Heartbeat - mise à jour de l'activité de la session
  app.post("/api/sessions-caisse/:id/heartbeat", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      // Vérifier que l'utilisateur est propriétaire de la session
      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.caissierId !== user.id) {
          return res.status(403).json({ message: "Non autorisé" });
      }

      const success = await sessionService.updateSessionHeartbeat(id);

      if (success) {
          res.json({ success: true, timestamp: new Date().toISOString() });
      } else {
          res.status(400).json({ success: false, message: "Session non active" });
      }
  });

  // Forcer la fermeture d'une session (admin)
  app.post("/api/sessions-caisse/:id/force-close", requireAuth, attachAbility, requireAbility(Actions.CLOSE_SESSION, Subjects.CAISSE_SESSION), async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.closedAt) {
          return res.status(400).json({ message: "Session déjà fermée" });
      }

      const result = await sessionService.closeSessionAtomic({
          sessionId: id,
          billetageFermeture: {},
          soldeReel: "0",
          observations: `Fermeture forcée par ${user.nom || user.username} - ${req.body.reason || 'Sans raison spécifiée'}`,
          closedBy: user.id,
          closedReason: "admin",
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
          return res.status(500).json({ message: result.error });
      }

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "SESSION_FORCE_CLOSED", payload: { sessionId: id } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(addSnakeCaseAliasesDeep(result.session));
  });

  // ============================================================================

  app.get("/api/caisses/status", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
    const agenceId = req.query.agenceId as string;
    const caisses = await storage.getCaissesWithStatus(agenceId);
    res.json(addSnakeCaseAliasesDeep(caisses));
  });

  // Opérations caisse du jour (historique de la CAISSE physique, pas de l'utilisateur)
  // CORRECTION: Filtre par caisseId pour voir tout l'historique de la machine
  app.get("/api/operations-caisse/today", requireAuth, async (req, res) => {
      try {
        const user = req.session.user!;

        // Récupérer la session active de l'utilisateur pour identifier la caisse
        const activeSession = await storage.getActiveSessionForUser(user.id);

        if (!activeSession) {
          return res.json([]); // Pas de session active, pas d'opérations
        }

        // CORRECTION: Récupérer toutes les opérations de cette CAISSE (pas seulement la session)
        // Cela permet de voir l'historique de la caisse physique, peu importe qui a fait les opérations
        const operations = await storage.getOperationsByCaisse(activeSession.caisseId);

        res.json(addSnakeCaseAliasesDeep(operations));
      } catch (error: any) {
        console.error("Erreur récupération opérations du jour:", error);
        res.status(500).json({ message: error.message });
      }
  });

  // Récupérer les opérations par sessionId (pour les rapports)
  app.get("/api/operations-caisse", requireAuth, async (req, res) => {
      try {
        const { sessionId } = req.query;

        if (!sessionId || typeof sessionId !== 'string') {
          return res.status(400).json({ message: "sessionId requis" });
        }

        const operations = await storage.getOperationsBySession(sessionId);
        res.json(addSnakeCaseAliasesDeep(operations));
      } catch (error: any) {
        console.error("Erreur récupération opérations par session:", error);
        res.status(500).json({ message: error.message });
      }
  });

  // Opération caisse (roles: admin, chef, caisse)
  app.post("/api/operations-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user!;
        
        // Ownership check
        const session = await storage.getSessionCaisse(data.sessionId);
        if (!session) return res.status(404).json({ message: "Session introuvable" });
        
        const normalizedRole = normalizeRole(user.role);
        const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
        if (session.caissierId !== user.id && !isManager) {
            return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'ajouter des opérations à cette session" });
        }

        const parsed = insertOperationCaisseSchema.parse(data);

        // Targeted Account Resolution
        let targetCompteId = data.compteId;
        
        // Auto-resolve account if not provided but client is
        if (!targetCompteId && parsed.clientId) {
             const opType = (parsed.typeOperation || '').toLowerCase();
             
             // Check if operation implies an account interaction
             const impliesAccount = 
                opType.includes('versement') || 
                opType.includes('retrait') || 
                opType.includes('dépôt') || 
                opType.includes('depot') ||
                opType.includes('compte');

             if (impliesAccount) {
                 const clientAccounts = await storage.getComptesByClient(parsed.clientId);
                 
                 // Smart matching based on operation name
                 let targetType: string | undefined;
                 if (opType.includes('courant')) targetType = TypeCompte.CURRENT;
                 else if (opType.includes('bloqué') || opType.includes('bloque')) targetType = TypeCompte.BLOCKED;
                 else if (opType.includes('épargne') || opType.includes('epargne')) targetType = TypeCompte.SAVINGS;
                 
                 let foundAccount;
                 if (targetType) {
                     foundAccount = clientAccounts.find(c => c.typeCompte === targetType && c.statut === StatutCompte.ACTIVE);
                 } else {
                     // Default fallback (usually Epargne)
                     foundAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.SAVINGS && c.statut === StatutCompte.ACTIVE) || clientAccounts[0];
                 }

                 if (foundAccount) {
                     targetCompteId = foundAccount.id;
                 } else {
                     // Only strictly block if we identified a specific target type that is missing
                     // For generic operations like "Encaissement Divers" creating a movement is enough?
                     // But "Versement Courant" MUST fail if no Courant account.
                     if (targetType) {
                         return res.status(400).json({ message: `Aucun compte ${targetType} actif trouvé pour ce client.` });
                     }
                     // Else fallback to generic operation without account update (just cash movement)
                 }
             }
        }

        // --- NEW LEDGER FLOW ---
        // We use the unified function if we have a target Account OR if it's a generic operation we want tracked
        // For now, we assume ALL operations via this endpoint should be robust.
        
        const hasAccountImpact = !!targetCompteId;

        // ====== BUSINESS LOGIC: Block Debit Operations on Frozen Accounts ======
        if (hasAccountImpact && targetCompteId) {
            const opType = (parsed.typeOperation || '').toLowerCase();
            const isDebitOperation = opType.includes('retrait');
            
            if (isDebitOperation) {
                const targetAccount = await storage.getCompte(targetCompteId);
                if (targetAccount?.blocageActif) {
                    return res.status(403).json({ 
                        message: `Ce compte est gelé (${targetAccount.blocageMotif || 'Blocage administratif'}). Les retraits ne sont pas autorisés.` 
                    });
                }
                // Also check if client is frozen
                if (parsed.clientId) {
                    const client = await storage.getClient(parsed.clientId);
                    if (client && [StatutClient.INACTIVE, StatutClient.SUSPENDED].includes(client.statut as any)) {
                        return res.status(403).json({
                            message: `Client ${client.statut}. Les opérations de débit ne sont pas autorisées.`
                        });
                    }
                }
            }
        }
        // ====== END BUSINESS LOGIC ======

        if (hasAccountImpact) {
            const { operation, transaction, mouvement } = await storage.createCashTransactionWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                compteId: targetCompteId,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            // Side Effects (Loyalty, WS) - Kept outside transaction critical path for now or could be moved to events
            try {
                const isSavingsDeposit = ['DEPOSIT_SAVINGS', 'SAVINGS_DEPOSIT'].includes(parsed.typeOperation);
                if (parsed.clientId && isSavingsDeposit && parsed.montant) {
                    const points = Math.floor(Number(parsed.montant) / 1000);
                    await storage.addLoyaltyPoints(
                        parsed.clientId,
                        points,
                        'EPARGNE',
                        `Versement de ${parsed.montant} FCFA`,
                        Number(parsed.montant)
                    );
                    await storage.calculateEngagementScore(parsed.clientId);
                }

                const wsInstance = getWsInstance();
                if (wsInstance) {
                    if (parsed.clientId) wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: parsed.clientId } });
                    if (transaction) wsInstance.broadcast({ type: "COMPTE_UPDATE", payload: { compteId: transaction.compteId, newSolde: Number(transaction.soldeApres) } });
                    
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                    wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
                }
            } catch (err) {
                console.error("Post-operation side-effects error:", err);
            }

            res.json(addSnakeCaseAliasesDeep(operation));

        } else {
            // Fallback for Operations WITHOUT Account impact (e.g. "Divers", "Frais divers" not linked to account)
            // We use the simpler ledger function that only touches Session + Ledger
            const { operation } = await storage.createOperationCaisseWithLedger({
                sessionId: parsed.sessionId,
                typeOperation: parsed.typeOperation,
                montant: parsed.montant.toString(),
                methodePaiement: parsed.methodePaiement || 'Espèces',
                clientId: parsed.clientId || undefined,
                description: parsed.description || undefined,
                idempotencyKey: parsed.idempotencyKey || undefined
            }, user.id);

            res.json(addSnakeCaseAliasesDeep(operation));
        }

      } catch (error: any) {
        console.error('Error creating operation:', error);
        res.status(400).json({ message: error.message || "Erreur lors de la création de l'opération" });
      }
  });

  // Update Opération caisse (PATCH)
  app.patch("/api/operations-caisse/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as any;
        
        const updated = await storage.updateOperationCaisse(id, data);
        if (!updated) {
             return res.status(404).json({ message: "Opération introuvable" });
        }
        
        // Notify updates
             if (updated.clientId) {
                const wsInstance = getWsInstance();
                if (wsInstance) {
                    wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: updated.clientId } });
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                }
             }
             res.json(addSnakeCaseAliasesDeep(updated));
      } catch (error: any) {
         console.error('Error updating operation:', error);
         res.status(400).json({ message: error.message || "Erreur lors de la mise à jour" });
      }
  });

  // Update credit (roles: admin, chef, credit)
  // State Machine guard is in storage.updateCredit
  app.patch("/api/credits/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const credit = await storage.getCredit(req.params.id);

      if (!credit) return res.status(404).json({ message: "Crédit non trouvé" });

      // Clean up fields that shouldn't be updated directly usually, but flexible for now
      // Especially crucial for automated repayment toggle

      const updated = await storage.updateCredit(req.params.id, data as any);
      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (error: any) {
      console.error("Erreur mise à jour crédit:", error);

      // State Machine error: return 400 with clear message
      if (error instanceof CreditTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(400).json({ message: error.message || "Erreur lors de la mise à jour du crédit" });
    }
  });

  // Factures - Basic logic
  app.get("/api/factures", requireAuth, async (req, res) => {
      const factures = await storage.getAllFactures();
      res.json(addSnakeCaseAliasesDeep(factures));
  });

  // Get single facture with lines and client info
  app.get("/api/factures/:id", requireAuth, async (req, res) => {
    try {
      const facture = await storage.getFacture(req.params.id);
      if (!facture) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      // Get invoice lines
      const lignes = await storage.getLignesByFacture(facture.id);
      
      // Get client info if available
      let client = null;
      if (facture.clientId) {
        client = await storage.getClient(facture.clientId);
      }

      // Get modele info if available
      let modele = null;
      if (facture.modeleId) {
        modele = await storage.getModeleFacture(facture.modeleId);
      }

      res.json(addSnakeCaseAliasesDeep({
        ...facture,
        lignes,
        client,
        modele
      }));
    } catch (error: any) {
      console.error("Erreur récupération facture:", error);
      res.status(500).json({ message: error.message || "Erreur lors de la récupération de la facture" });
    }
  });

  // Create facture (roles: admin, chef, comptable)
  app.post("/api/factures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.INVOICE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertFactureSchema.parse(data);
      const facture = await storage.createFacture(parsed);
      res.json(addSnakeCaseAliasesDeep(facture));
  });
  // Caisse Transferts (Treasury)
  app.get("/api/caisse-transferts", requireAuth, requireAgenceAccess(), async (req, res) => {
    const agenceFilter = req.agenceFilter as { agence?: string } | null;
    const transfers = await storage.getCaisseTransferts(agenceFilter?.agence);
    res.json(addSnakeCaseAliasesDeep(transfers));
  });

  // Initier un transfert
  app.post("/api/caisse-transferts", requireAuth, attachAbility, requireAbility(Actions.TRANSFER, Subjects.CAISSE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body as any) as any;
      
      // 1. Vérification session active émetteur
      const sessionSource = await storage.getSessionCaisse(data.sessionId);
      if (!sessionSource || sessionSource.closedAt) {
         return res.status(400).json({ message: "Session source invalide ou fermée" });
      }

      // Permission check: User must be owner or manager
      const user = req.session.user!;
      const normalizedRole = normalizeRole(user.role);
      const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;
      if (sessionSource.caissierId !== user.id && !isManager) {
          return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'initier un transfert depuis cette session" });
      }

      // 2. Vérification solde disponible (Temps réel)
      const soldeActuel = Number(sessionSource.montantFermetureDeclare || sessionSource.montantFermetureTheorique); 
      // Note: soldeReel est souvent null si pas cloturé, on utilise le théorique par défaut.
      // Idéalement on recalcule: Initial + Entrées - Sorties
      // Pour l'instant on se base sur le frontend mais le backend DOIT vérifier.
      
      // Calculer solde théorique courant
      const ops = await storage.getOperationsBySession(sessionSource.id);
      const computedSolde = ops.reduce((acc, op) => {
         // Ajuster selon type ('depot' vs 'retrait')
         // Simplification: le frontend envoie le montant, on verifie juste grossièrement ici ou on fait confiance au process
         return acc; 
      }, Number(sessionSource.montantOuverture));

      // Pour simplifier dans cette étape, on fait confiance au solde théorique stocké s'il est à jour, 
      // ou on vérifie juste que montant < solde (si on avait la logique de calcul de solde ici).
      
      // Creation
      const rawData = insertCaisseTransfertSchema.parse({
        ...(data as any),
        agenceSourceId: sessionSource.agenceId, // Force l'agence source
        createdBy: req.session.user!.id
      });

      const transfert = await storage.createCaisseTransfert(rawData);

      // Notification WS à l'agence de destination
      const wsInstance = getWsInstance();
      if (wsInstance) {
          // Trouver le nom de l'agence destination pour cibler (TODO: mapper ID vers Nom ou utiliser ID dans WS)
          // Pour l'instant on broadcast global ou on essaie de cibler.
          // On envoie un event 'caisse-update' générique
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_new', id: transfert.id } });
      }

      res.status(201).json(addSnakeCaseAliasesDeep(transfert));
    } catch (e: any) {
      res.status(400).json({ message: e.message || "Erreur création transfert" });
    }
  });

  // Recevoir/Valider un transfert
  app.patch("/api/caisse-transferts/:id/recevoir", requireAuth, attachAbility, requireAbility(Actions.TRANSFER, Subjects.CAISSE), async (req, res) => {
      const { id } = req.params;
      const { sessionId } = req.body; // Session qui reçoit

      const sessionDest = await storage.getSessionCaisse(sessionId);
      if (!sessionDest || sessionDest.closedAt) {
          return res.status(400).json({ message: "Vous devez avoir une session ouverte pour recevoir des fonds" });
      }

      const transfert = await storage.getCaisseTransfert(id);
      if (!transfert || transfert.statut !== StatutTransfertCaisse.PENDING) {
          return res.status(400).json({ message: "Transfert non disponible" });
      }

      // Valider
      const updated = await storage.updateCaisseTransfert(id, {
          statut: StatutTransfertCaisse.VALIDATED,
          sessionDestId: sessionDest.id,
          dateValidation: new Date(),
          validatedBy: req.session.user!.id
      });

      // Créer les opérations miroirs
      // 1. Sortie chez l'expéditeur (Transfert caisse - Sortant)
      await storage.createOperationCaisse({
          sessionId: transfert.sessionSourceId,
          typeOperation: 'CASH_TRANSFER',
          montant: transfert.montant,
          reference: `TRF-OUT-${transfert.reference}`,
          description: `Transfert vers ${sessionDest.agenceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'TRANSFER',
          createdBy: req.session.user!.id
      });

      // 2. Entrée chez le destinataire (Transfert caisse - Entrant)
      await storage.createOperationCaisse({
          sessionId: sessionDest.id,
          typeOperation: 'CASH_TRANSFER',
          montant: transfert.montant,
          reference: `TRF-IN-${transfert.reference}`,
          description: `Réception transfert de ${transfert.sessionSourceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'TRANSFER',
          createdBy: req.session.user!.id
      });

      // Notify users
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_validated', id } });
      }

      res.json(addSnakeCaseAliasesDeep(updated));
  });
  
  // Annuler un transfert
  app.post("/api/caisse-transferts/:id/annuler", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
      const { id } = req.params;
      const transfert = await storage.getCaisseTransfert(id);

      if (!transfert || transfert.statut !== StatutTransfertCaisse.PENDING) {
          return res.status(400).json({ message: "Transfert ne peut pas être annulé" });
      }

      // Seul l'émetteur ou un admin peut annuler
      // Implementation simplifiée...

      const updated = await storage.updateCaisseTransfert(id, {
          statut: StatutTransfertCaisse.CANCELLED
      });
      
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { type: 'transfert_cancelled', id } });
      }
      
      res.json(addSnakeCaseAliasesDeep(updated));
  });

  // ============================================================================
  // MOUVEMENTS FINANCIERS API (Phase 3 - Unified Ledger Endpoints)
  // ============================================================================

  /**
   * GET /api/mouvements - Global ledger feed with filtering
   */
  app.get("/api/mouvements", requireAuth, requireAgenceAccess(), async (req, res) => {
    try {
      const { sourceModule, clientId, compteId, creditId, sessionCaisseId, from, to, limit } = req.query;

      const filter: any = {};
      if (sourceModule) filter.sourceModule = sourceModule as string;
      if (clientId) filter.clientId = clientId as string;
      if (compteId) filter.compteId = compteId as string;
      if (creditId) filter.creditId = creditId as string;
      if (sessionCaisseId) filter.sessionCaisseId = sessionCaisseId as string;
      if (from) filter.from = new Date(from as string);
      if (to) filter.to = new Date(to as string);
      if (limit) filter.limit = parseInt(limit as string, 10);

      const mouvements = await storage.getMouvementsFinanciers(filter);
      res.json(addSnakeCaseAliasesDeep(mouvements));
    } catch (error: any) {
      console.error('Error fetching mouvements:', error);
      res.status(500).json({ message: error.message || 'Erreur serveur' });
    }
  });

  /**
   * GET /api/comptes/:id/mouvements - Movements for a specific savings account
   */
  app.get("/api/comptes/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        compteId: req.params.id,
        limit: 100
      });
      res.json(addSnakeCaseAliasesDeep(mouvements));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/credits/:id/mouvements - Movements for a specific credit
   */
  app.get("/api/credits/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        creditId: req.params.id,
        limit: 100
      });
      res.json(addSnakeCaseAliasesDeep(mouvements));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/sessions-caisse/:id/mouvements - Movements for a cash session
   */
  app.get("/api/sessions-caisse/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        sessionCaisseId: req.params.id,
        limit: 100
      });
      res.json(addSnakeCaseAliasesDeep(mouvements));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // CREDIT REFUND WORKFLOW API
  // ============================================================================

  /**
   * GET /api/finance/credit-refunds - List refunds with filters
   */
  app.get("/api/finance/credit-refunds", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      let query = db.select({
        refund: creditRefundRequests,
        demande: demandesCredit,
        client: {
          id: clients.id,
          nom: schema.users.nom,
          prenom: schema.users.prenom,
          phone: schema.users.telephone,
        }
      })
      .from(creditRefundRequests)
      .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
      .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
      .innerJoin(schema.users, eq(clients.userId, schema.users.id));

      const conditions = [];
      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      if (req.query.statut) {
        conditions.push(eq(creditRefundRequests.statut, req.query.statut as typeof creditRefundRequests.statut.enumValues[number]));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      
      const results = await query.orderBy(desc(creditRefundRequests.createdAt));
      res.json(addSnakeCaseAliasesDeep(results));
    } catch (error: any) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending/count - Count pending refunds (SUBMITTED + APPROVED)
   * Used for sidebar badge notification
   */
  app.get("/api/finance/credit-refunds/pending/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const conditions = [
        // Count both SUBMITTED (needs approval) and APPROVED (needs payment)
        sql`${creditRefundRequests.statut} IN ('SUBMITTED', 'APPROVED')`
      ];

      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      const [result] = await db
        .select({ count: count() })
        .from(creditRefundRequests)
        .where(and(...conditions));

      res.json({ count: result?.count || 0 });
    } catch (error: any) {
      console.error("Error counting pending refunds:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/:id - Get Single Refund Details
   */
  app.get("/api/finance/credit-refunds/:id", requireAuth, async (req, res) => {
     try {
        const refund = await storage.getCreditRefundRequest(req.params.id);
        if (!refund) return res.status(404).json({ message: "Refund request not found" });
        res.json(addSnakeCaseAliasesDeep(refund));
     } catch (error: any) {
        res.status(500).json({ message: error.message });
     }
  });

  /**
   * POST /api/finance/credit-refunds/:id/approve - Approve Refund Request
   * Requires N+1 Validation (Checker must be different from Maker)
   */
  app.post("/api/finance/credit-refunds/:id/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.REMBOURSEMENT), async (req, res) => {
     try {
       const user = req.session.user!;
       const refund = await storage.getCreditRefundRequest(req.params.id);
       
       if (!refund) return res.status(404).json({ message: "Refund request not found" });
       
       if (refund.statut !== 'SUBMITTED') {
         return res.status(400).json({ message: `Cannot approve refund in status '${refund.statut}'` });
       }

       if (refund.makerId === user.id && !isAdminRole(user.role)) {
         return res.status(403).json({ message: "Segregation of Duties: Maker cannot approve their own request." });
       }

       const updated = await storage.updateCreditRefundRequest(refund.id, {
         statut: 'APPROVED',
         checkerId: user.id,
         checkerAt: new Date(),
         checkerDecision: 'APPROVED'
       });
       
       // Log Audit
       await logAudit(req, "APPROVE_REFUND", "credit_refund", refund.id, {}, "success", "medium");
       
       res.json(addSnakeCaseAliasesDeep(updated));
     } catch (error: any) {
       res.status(500).json({ message: error.message });
     }
  });

  /**
   * POST /api/finance/credit-refunds/:id/pay - Execute Payment (Cash, Account or Mobile Money)
   *
   * Flow:
   * - ACCOUNT: Direct transfer to client's current account (immediate)
   * - CASH/MOBILE_MONEY: Requires caisse validation - sets status to PENDING_CAISSE
   */
  app.post("/api/finance/credit-refunds/:id/pay", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    const { method, sessionCaisseId } = req.body; // method: 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY'
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Get refund first
       const [refundData] = await db
          .select()
          .from(creditRefundRequests)
          .where(eq(creditRefundRequests.id, refundId));

       if (!refundData) {
          return res.status(404).json({ message: "Remboursement non trouvé" });
       }
       if (refundData.statut !== 'APPROVED') {
          return res.status(400).json({ message: `Le remboursement doit être approuvé avant paiement (statut actuel: ${refundData.statut})` });
       }

       // For CASH or MOBILE_MONEY: Set to PENDING_CAISSE and notify caisse
       if (method === 'CASH' || method === 'MOBILE_MONEY') {
          // Update to PENDING_CAISSE status
          await db.update(creditRefundRequests).set({
             statut: 'PENDING_CAISSE',
             paymentMethod: method,
             updatedAt: new Date()
          }).where(eq(creditRefundRequests.id, refundId));

          // Log Audit
          await logAudit(req, "REFUND_PENDING_CAISSE", "credit_refund", refundId, { method }, "success", "medium");

          // Broadcast WebSocket notification for caisse
          const wsInstance = getWsInstance();
          if (wsInstance) {
             wsInstance.broadcast({
                type: "REFUND_PENDING_CAISSE",
                payload: {
                   refundId,
                   method,
                   amount: refundData.montantRemboursable,
                   agenceId: refundData.agenceId,
                   clientId: refundData.clientId
                }
             });
          }

          const updated = await storage.getCreditRefundRequest(refundId);
          return res.json({
             ...(addSnakeCaseAliasesDeep(updated) as Record<string, unknown>),
             message: method === 'CASH'
                ? 'Remboursement en attente de validation caisse. Le caissier doit confirmer le paiement.'
                : 'Remboursement Mobile Money en attente de validation caisse.'
          });
       }

       // For ACCOUNT: Execute immediate payment (existing flow)
       await db.transaction(async (tx) => {
          // 1. Lock and Get Refund
          const [refundDataLocked] = await tx
             .select()
             .from(creditRefundRequests)
             .where(eq(creditRefundRequests.id, refundId));

          if (!refundDataLocked) throw new Error("Refund not found");
          if (refundDataLocked.statut !== 'APPROVED') throw new Error("Refund must be APPROVED before payment");

          const amount = Number(refundDataLocked.montantRemboursable);

          // 2. Prepare Ledger Transaction
          let mouvement;
          let paymentRefString = '';

          // Credit Client Account (ACCOUNT method only at this point)
          const clientAccounts = await storage.getComptesByClient(refundDataLocked.clientId);
          const courantAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.CURRENT && c.statut === StatutCompte.ACTIVE);
          if (!courantAccount) throw new Error("No active current account found for client");

          // Get client for agency info
          const client = await storage.getClient(refundDataLocked.clientId);
          if (!client) throw new Error("Client not found");

          // CRITICAL: Always use the CLIENT'S agency for the source of funds
          const sourceAgenceId = client.agenceId;
          if (!sourceAgenceId) throw new Error("Client has no agency assigned");

          // Identify Agency Safe (Coffre-Fort) for Source of Funds
          const [agencyCoffre] = await tx.select()
              .from(coffresForts)
              .where(eq(coffresForts.ownerId, sourceAgenceId));
          if (!agencyCoffre) throw new Error("Agency safe not found for refund source");

          // Check Safe Balance
          const safeBalance = Number(agencyCoffre.solde || 0);
          const refundAmount = Number(amount);
          if (safeBalance < refundAmount) {
              throw new Error(`Insufficient funds in agency safe (Required: ${refundAmount}, Available: ${safeBalance})`);
          }

          // DEBIT SAFE (Source)
          await tx.update(coffresForts)
            .set({
                solde: sql`${coffresForts.solde} - ${refundAmount}`,
                updatedAt: new Date()
            })
            .where(eq(coffresForts.id, agencyCoffre.id));

          // Create Debit Mouvement (Coffre)
          const coffreMouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'DEBIT',
            sourceModule: 'COFFRE',
            typePaiement: 'TRANSFER_OUT',
            sourceId: agencyCoffre.id,
            agenceId: refundDataLocked.agenceId,
            metadata: {
                type: 'REFUND_SOURCE',
                refundId: refundDataLocked.id,
                coffreId: agencyCoffre.id,
                description: `Source pour rbt frais (Ref: ${refundDataLocked.id})`
            }
          }, user.id);

          // CREDIT CLIENT ACCOUNT (Destination)
          mouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'CREDIT',
            sourceModule: 'SYSTEME',
            typePaiement: 'DEPOSIT_CURRENT',
            clientId: refundDataLocked.clientId,
            compteId: courantAccount.id,
            metadata: {
                type: 'REFUND_PAYMENT',
                refundId: refundDataLocked.id,
                demandeId: refundDataLocked.demandeId,
                sourceMouvementId: coffreMouvement.id
            }
          }, user.id);

          // Update Client Account Balance
          const [updatedAccount] = await tx.update(comptes)
              .set({
                  soldeCourant: sql`${comptes.soldeCourant} + ${refundAmount}`,
                  updatedAt: new Date()
              })
              .where(eq(comptes.id, courantAccount.id))
              .returning();

          // Create Transaction Record
          await tx.insert(transactionsCompte).values({
            compteId: courantAccount.id,
            mouvementId: mouvement.id,
            typePaiement: 'DEPOSIT_CURRENT',
            montant: refundAmount.toString(),
            soldeApres: updatedAccount.soldeCourant,
            methodePaiement: 'TRANSFER',
            observations: `Remboursement Frais Dossier (Ref: ${refundDataLocked.id})`,
            createdBy: user.id
          });

          paymentRefString = `VIREMENT-${mouvement.reference}`;

          // Update Refund Status to PAID
          await tx.update(creditRefundRequests).set({
             statut: 'PAID',
             paidAt: new Date(),
             paidBy: user.id,
             paymentMethod: method,
             paymentReference: paymentRefString,
             mouvementId: mouvement.id
          }).where(eq(creditRefundRequests.id, refundDataLocked.id));
          
       });

       const updated = await storage.getCreditRefundRequest(refundId);
       res.json(addSnakeCaseAliasesDeep(updated));
       
    } catch (error: any) {
       console.error("Payment Error", error);
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/finance/credit-refunds/:id/validate-caisse - Caisse validates and executes Cash/Mobile Money payment
   *
   * This endpoint is called by caisse staff to confirm a PENDING_CAISSE refund.
   * It requires an active caisse session and executes the actual payment.
   */
  app.post("/api/finance/credit-refunds/:id/validate-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
    const { sessionCaisseId } = req.body;
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Validate session caisse is required for cash payments
       if (!sessionCaisseId) {
          return res.status(400).json({ message: "Session caisse requise pour valider le paiement" });
       }

       await db.transaction(async (tx) => {
          // 1. Get and validate refund
          const [refundData] = await tx
             .select()
             .from(creditRefundRequests)
             .where(eq(creditRefundRequests.id, refundId));

          if (!refundData) throw new Error("Remboursement non trouvé");
          if (refundData.statut !== 'PENDING_CAISSE') {
             throw new Error(`Le remboursement doit être en attente de caisse (statut actuel: ${refundData.statut})`);
          }

          const amount = Number(refundData.montantRemboursable);
          const paymentMethod = refundData.paymentMethod || 'CASH';

          // 2. Validate session
          const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionCaisseId));
          if (!session || session.closedAt) {
             throw new Error("Session caisse invalide ou fermée");
          }

          // 3. Create caisse operation (outgoing payment)
          const [op] = await tx.insert(operationsCaisse).values({
            sessionId: sessionCaisseId,
            typeOperation: 'WITHDRAWAL_CURRENT',
            montant: amount.toString(),
            methodePaiement: paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH',
            reference: `REFUND-${refundData.id.substring(0,8)}`,
            description: `Remboursement Frais ${paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'} (Ref: ${refundData.id})`,
            clientId: refundData.clientId,
            createdBy: user.id
          }).returning();

          // 4. Create ledger mouvement
          const mouvement = await createMouvementFinancier(tx, {
            montant: amount.toString(),
            sens: 'DEBIT',
            sourceModule: 'CAISSE',
            sourceId: op.id,
            typePaiement: paymentMethod === 'MOBILE_MONEY' ? 'TRANSFER_OUT' : 'WITHDRAWAL_CURRENT',
            sessionCaisseId: sessionCaisseId,
            clientId: refundData.clientId,
            agenceId: refundData.agenceId,
            metadata: {
               type: 'REFUND_PAYMENT',
               refundId: refundData.id,
               operationId: op.id,
               demandeId: refundData.demandeId,
               method: paymentMethod
            }
          }, user.id);

          const paymentRefString = paymentMethod === 'MOBILE_MONEY'
             ? `MOMO-${op.reference}`
             : `CASH-${op.reference}`;

          // 5. Update refund to PAID
          await tx.update(creditRefundRequests).set({
             statut: 'PAID',
             paidAt: new Date(),
             paidBy: user.id,
             paymentReference: paymentRefString,
             mouvementId: mouvement.id,
             updatedAt: new Date()
          }).where(eq(creditRefundRequests.id, refundData.id));
       });

       // Log audit
       await logAudit(req, "VALIDATE_CAISSE_REFUND", "credit_refund", refundId, { sessionCaisseId }, "success", "medium");

       // Broadcast update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({
             type: "REFUND_PAID",
             payload: { refundId }
          });
       }

       const updated = await storage.getCreditRefundRequest(refundId);
       res.json({
          ...(addSnakeCaseAliasesDeep(updated) as Record<string, unknown>),
          message: 'Paiement validé avec succès. Le remboursement a été effectué.'
       });

    } catch (error: any) {
       console.error("Caisse Validation Error", error);
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse - List refunds awaiting caisse validation
   */
  app.get("/api/finance/credit-refunds/pending-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const results = await db.select({
          refund: creditRefundRequests,
          demande: demandesCredit,
          client: clients
       })
       .from(creditRefundRequests)
       .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
       .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
       .where(and(...conditions))
       .orderBy(desc(creditRefundRequests.updatedAt));

       res.json(addSnakeCaseAliasesDeep(results));
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse/count - Count refunds awaiting caisse validation
   */
  app.get("/api/finance/credit-refunds/pending-caisse/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const [result] = await db.select({ count: count() })
          .from(creditRefundRequests)
          .where(and(...conditions));

       res.json({ count: result?.count || 0 });
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });


  // ==========================================
  // CAISSE LIQUIDATION & DELETION
  // ==========================================

  // LIQUIDATION CAISSE
  app.post("/api/caisses/:id/liquidate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;

      // 1. Get Caisse
      const [caisse] = await db.select().from(schema.caisses).where(eq(schema.caisses.id, id));
      if (!caisse) return res.status(404).json({ error: "Caisse not found" });

      if (caisse.statut === StatutCaisse.CLOSED) {
         // If already closed, check balance. If 0, just delete.
         if (Number(caisse.solde) === 0) {
            await db.delete(schema.caisses).where(eq(schema.caisses.id, id));
            return res.json({ message: "Caisse fermée et vide supprimée." });
         }
      }

      // 2. Get Agency Safe (Coffre-Fort)
      const [coffre] = await db.select()
        .from(schema.coffresForts)
        .where(eq(schema.coffresForts.ownerId, caisse.agenceId));
      
      if (!coffre) return res.status(400).json({ error: "Aucun coffre-fort trouvé pour cette agence." });

      // 3. Transfer Balance Logique
      const amount = Number(caisse.solde);
      
      await db.transaction(async (tx) => {
        if (amount > 0) {
            // Debit Caisse
            await tx.update(schema.caisses)
                .set({ solde: "0" })
                .where(eq(schema.caisses.id, id));

            // Credit Coffre
            await tx.update(schema.coffresForts)
                .set({ solde: sql`${schema.coffresForts.solde} + ${amount}` })
                .where(eq(schema.coffresForts.id, coffre.id));

            // Mouvement
            await tx.insert(schema.mouvementsFinanciers).values({
                typeMouvement: "LIQUIDATION_CAISSE",
                montant: amount.toString(),
                sourceId: caisse.id,
                destinationId: coffre.id,
                status: "COMPLETED",
                description: `Liquidation Caisse ${caisse.nom} -> Coffre`,
                createdBy: userId,
                sens: "DEBIT", // Débit from caisse perspective
                sourceModule: "CAISSE",
                agenceId: caisse.agenceId
            } as any);
        }

        // 4. Delete Caisse
        await tx.delete(schema.caisses).where(eq(schema.caisses.id, id));
      });

      await logAudit(req, "LIQUIDATE", "caisses", id, { amount });

      res.json({ message: "Caisse liquidée et supprimée avec succès." });

    } catch (e: any) {
      console.error("Erreur liquidation:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================================
  // WORKFLOW SECURISE D'OUVERTURE DE CAISSE (Coffre → Caisse)
  // ============================================================================
  // Règle d'Or: L'argent ne doit jamais apparaître "magiquement".
  // Le solde d'ouverture = solde veille + transfert coffre (tous deux auditables)
  // ============================================================================

  /**
   * POST /api/sessions-caisse/request-opening
   * Phase A: Le caissier demande l'ouverture de sa caisse avec un montant souhaité
   */
  app.post("/api/sessions-caisse/request-opening", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }
    if (!data.montantDemande || Number(data.montantDemande) <= 0) {
      return res.status(400).json({ message: "Le montant demandé doit être positif." });
    }

    // Vérifier l'assignation si pas manager
    const normalizedRole = normalizeRole(user.role);
    const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

    if (!isManager) {
      const assignments = await storage.getCaisseAssignments(data.caisseId);
      const isAssigned = assignments.some(a => a.userId === user.id);
      if (!isAssigned) {
        return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
      }
    }

    const result = await sessionOpeningService.requestSessionOpening({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      montantDemande: Number(data.montantDemande),
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        INVALID_AMOUNT: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "OPENING_REQUEST_CREATED", payload: { agenceId: data.agenceId || user.agenceId } });
    }

    await logAudit(
      req,
      "SESSION_OPENING_REQUESTED",
      "session_caisse",
      result.session.id,
      { caisseId: data.caisseId, montantDemande: data.montantDemande },
      "success",
      "low"
    );

    res.status(201).json(addSnakeCaseAliasesDeep({
      session: result.session,
      transfert: result.transfert,
    }));
  });

  /**
   * POST /api/sessions-caisse/open-direct
   * Ouverture directe avec le fonds reporté existant (sans passer par le coffre)
   * Cas d'usage: Le caissier a laissé un fonds de roulement lors de la fermeture
   * et souhaite reprendre son travail sans approvisionnement supplémentaire.
   */
  app.post("/api/sessions-caisse/open-direct", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }

    // Vérifier l'assignation si pas manager
    const normalizedRole = normalizeRole(user.role);
    const isManager = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.CHEF_AGENCE;

    if (!isManager) {
      const assignments = await storage.getCaisseAssignments(data.caisseId);
      const isAssigned = assignments.some(a => a.userId === user.id);
      if (!isAssigned) {
        return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
      }
    }

    const result = await sessionOpeningService.openDirectWithExistingFunds({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_NOT_FOUND: 404,
        NO_EXISTING_FUNDS: 400,
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { agenceId: data.agenceId || user.agenceId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_DIRECT_OPEN",
      "session_caisse",
      result.session.id,
      { caisseId: data.caisseId, type: "FONDS_REPORTE" },
      "success",
      "low"
    );

    res.status(201).json(addSnakeCaseAliasesDeep({
      session: result.session,
    }));
  });

  /**
   * POST /api/sessions-caisse/:id/receive-funds
   * Phase C: Le caissier confirme la réception des fonds et ouvre la session
   */
  app.post("/api/sessions-caisse/:id/receive-funds", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    if (!data.billetageReception || Object.keys(data.billetageReception).length === 0) {
      return res.status(400).json({ message: "Le billetage de réception est obligatoire." });
    }

    const result = await sessionOpeningService.receiveFundsAndOpen({
      sessionId: id,
      caissierId: user.id,
      billetageReception: data.billetageReception,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: result.session.caisseId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_OPENED_WITH_FUNDS",
      "session_caisse",
      id,
      { soldeOuverture: result.session.montantOuverture },
      "success",
      "low"
    );

    res.json(addSnakeCaseAliasesDeep(result.session));
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-request
   * Annule une demande d'ouverture (uniquement si REQUESTING_FUNDS)
   */
  app.post("/api/sessions-caisse/:id/cancel-request", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await sessionOpeningService.cancelOpeningRequest({
      sessionId: id,
      userId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_OPENING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "low"
    );

    res.json({ success: true });
  });

  // ============================================================================
  // WORKFLOW SECURISE DE FERMETURE DE CAISSE (Caisse → Coffre)
  // ============================================================================
  // Règle d'Or: L'argent compté physiquement doit correspondre à:
  // MontantVersCoffre + MontantReporte = TotalPhysique
  // ============================================================================

  /**
   * POST /api/sessions-caisse/:id/initiate-close
   * Phase A: Gel de la session - Le caissier initie la fermeture
   */
  app.post("/api/sessions-caisse/:id/initiate-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const result = await sessionClosingService.initiateClose({
      sessionId: id,
      caissierId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        PENDING_TRANSACTIONS: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSING_INITIATED",
      "session_caisse",
      id,
      { statut: "CLOSING_COUNT" },
      "success",
      "medium"
    );

    res.json(addSnakeCaseAliasesDeep(result.session));
  });

  /**
   * POST /api/sessions-caisse/:id/submit-count
   * Phase B: Soumission du comptage à l'aveugle (blind count)
   */
  app.post("/api/sessions-caisse/:id/submit-count", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.billetageFermeture || typeof data.billetageFermeture !== 'object') {
      return res.status(400).json({ message: "Le billetage est obligatoire" });
    }

    const result = await sessionClosingService.submitCount({
      sessionId: id,
      caissierId: user.id,
      billetageFermeture: data.billetageFermeture,
      ecartJustification: data.ecartJustification,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        MISSING_JUSTIFICATION: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode,
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      });
    }

    await logAudit(
      req,
      "SESSION_COUNT_SUBMITTED",
      "session_caisse",
      id,
      {
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      },
      "success",
      "medium"
    );

    res.json(addSnakeCaseAliasesDeep({
      session: result.session,
      soldeTheorique: result.soldeTheorique,
      montantPhysique: result.montantPhysique,
      ecart: result.ecart,
    }));
  });

  /**
   * POST /api/sessions-caisse/:id/finalize-close
   * Phase C: Finalisation - Décision de trésorerie et clôture définitive
   */
  app.post("/api/sessions-caisse/:id/finalize-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (typeof data.montantVersCoffre !== 'number' || typeof data.montantReporte !== 'number') {
      return res.status(400).json({ message: "Les montants de transfert et report sont obligatoires" });
    }

    if (data.montantVersCoffre < 0 || data.montantReporte < 0) {
      return res.status(400).json({ message: "Les montants ne peuvent pas être négatifs" });
    }

    const result = await sessionClosingService.finalizeClose({
      sessionId: id,
      caissierId: user.id,
      montantVersCoffre: data.montantVersCoffre,
      montantReporte: data.montantReporte,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        AMOUNT_MISMATCH: 400,
        COFFRE_NOT_FOUND: 500,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "CAISSE_UPDATE",
        payload: {
          sessionId: id,
          statut: "CLOSED",
          hasPendingTransfer: !!result.transfert,
        }
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSED",
      "session_caisse",
      id,
      {
        montantVersCoffre: data.montantVersCoffre,
        montantReporte: data.montantReporte,
        closingTransfertId: result.transfert?.id,
      },
      "success",
      "high"
    );

    res.json(addSnakeCaseAliasesDeep({
      session: result.session,
      transfert: result.transfert,
    }));
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-close
   * Annule le processus de fermeture (uniquement en phase CLOSING_COUNT)
   */
  app.post("/api/sessions-caisse/:id/cancel-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await sessionClosingService.cancelClose({
      sessionId: id,
      caissierId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "medium"
    );

    res.json(addSnakeCaseAliasesDeep(result.session));
  });

  // ============================================================================
  // CAISSE ACCESS CONTROL API
  // ============================================================================

  /**
   * GET /api/access/status/caisse
   * Vérifie si la caisse est accessible selon les horaires d'ouverture
   */
  app.get("/api/access/status/caisse", requireAuth, async (req, res) => {
    try {
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = req.query.agenceId as string | undefined;

      const status = await accessControlService.checkCaisseAccess(caisseId, agenceId);
      res.json(addSnakeCaseAliasesDeep(status));
    } catch (error: any) {
      console.error("Error checking caisse access:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/caisse/authorization-status
   * Vérifie si l'utilisateur a une autorisation valide pour accéder à la caisse
   */
  app.get("/api/caisse/authorization-status", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = (req.query.agenceId as string | undefined) || user.agenceId;

      const status = await accessControlService.checkUserAuthorization(user.id, caisseId, agenceId);
      res.json(addSnakeCaseAliasesDeep(status));
    } catch (error: any) {
      console.error("Error checking authorization:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/validate
   * Valide un code de sécurité et crée une autorisation temporaire
   */
  app.post("/api/caisse/access-codes/validate", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      if (!data.code) {
        return res.status(400).json({ error: "Le code de sécurité est requis" });
      }

      const result = await accessControlService.validateSecurityCode({
        userId: user.id,
        code: data.code,
        caisseId: data.caisseId,
        agenceId: data.agenceId || user.agenceId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(401).json({ success: false, error: result.error });
      }

      await logAudit(
        req,
        "ACCESS_CODE_VALIDATED",
        "caisse_access",
        result.authorization?.id || '',
        { caisseId: data.caisseId },
        "success",
        "medium"
      );

      res.json(addSnakeCaseAliasesDeep({
        success: true,
        authorization: result.authorization,
      }));
    } catch (error: any) {
      console.error("Error validating access code:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/generate
   * Génère un nouveau code de sécurité (admin/chef d'agence seulement)
   */
  app.post("/api/caisse/access-codes/generate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      const agenceId = data.agenceId || user.agenceId;
      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      // Calculate expiry date
      let expiresAt: Date | undefined;
      if (data.expiresInHours) {
        expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
      } else if (data.expiresAt) {
        expiresAt = new Date(data.expiresAt);
      }

      const result = await accessControlService.generateSecurityCodeForCaisse({
        createdBy: user.id,
        agenceId,
        caisseId: data.caisseId,
        codeType: data.codeType || 'EMERGENCY',
        maxUsages: data.maxUsages ?? 1,
        authorizationDurationHours: data.authorizationDurationHours ?? 4,
        expiresAt,
        description: data.description,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      await logAudit(
        req,
        "ACCESS_CODE_GENERATED",
        "caisse_security_code",
        result.codeId || '',
        {
          agenceId,
          caisseId: data.caisseId,
          codeType: data.codeType,
          maxUsages: data.maxUsages,
        },
        "success",
        "high"
      );

      res.json(addSnakeCaseAliasesDeep({
        success: true,
        code: result.code, // Returned only at creation time
        codeId: result.codeId,
        expiresAt,
      }));
    } catch (error: any) {
      console.error("Error generating access code:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/access-codes
   * Liste les codes de sécurité actifs pour une agence
   */
  app.get("/api/caisse/access-codes", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const codes = await accessControlService.getActiveCodesForAgence(agenceId);
      res.json(addSnakeCaseAliasesDeep(codes));
    } catch (error: any) {
      console.error("Error fetching access codes:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/caisse/access-codes/:id
   * Désactive un code de sécurité
   */
  app.delete("/api/caisse/access-codes/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      await accessControlService.deactivateSecurityCode(req.params.id);

      await logAudit(
        req,
        "ACCESS_CODE_DEACTIVATED",
        "caisse_security_code",
        req.params.id,
        {},
        "success",
        "medium"
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deactivating access code:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/authorizations
   * Liste les autorisations actives pour une agence
   */
  app.get("/api/caisse/authorizations", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const authorizations = await accessControlService.getActiveAuthorizationsForAgence(agenceId);
      res.json(addSnakeCaseAliasesDeep(authorizations));
    } catch (error: any) {
      console.error("Error fetching authorizations:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/caisse/authorizations/:id/revoke
   * Révoque une autorisation active
   */
  app.post("/api/caisse/authorizations/:id/revoke", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      await accessControlService.revokeAuthorization(
        req.params.id,
        user.id,
        data.reason
      );

      await logAudit(
        req,
        "AUTHORIZATION_REVOKED",
        "caisse_user_authorization",
        req.params.id,
        { reason: data.reason },
        "success",
        "high"
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error revoking authorization:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/caisses/:id/operating-hours
   * Met à jour les horaires d'ouverture d'une caisse (admin/chef d'agence)
   */
  app.patch("/api/caisses/:id/operating-hours", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      // Validate operating days if provided
      if (data.operatingDays) {
        if (!Array.isArray(data.operatingDays)) {
          return res.status(400).json({ error: "Les jours d'ouverture doivent être un tableau" });
        }
        const validDays = data.operatingDays.every((d: any) => typeof d === 'number' && d >= 0 && d <= 6);
        if (!validDays) {
          return res.status(400).json({ error: "Les jours doivent être des nombres entre 0 (Dimanche) et 6 (Samedi)" });
        }
      }

      // Validate time format if provided
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (data.operatingHoursStart && !timeRegex.test(data.operatingHoursStart)) {
        return res.status(400).json({ error: "Format d'heure de début invalide (HH:MM attendu)" });
      }
      if (data.operatingHoursEnd && !timeRegex.test(data.operatingHoursEnd)) {
        return res.status(400).json({ error: "Format d'heure de fin invalide (HH:MM attendu)" });
      }

      const caisse = await storage.getCaisse(id);
      if (!caisse) {
        return res.status(404).json({ error: "Caisse non trouvée" });
      }

      // Check agency access
      if (!isAdminRole(user.role) && caisse.agenceId !== user.agenceId) {
        return res.status(403).json({ error: "Accès refusé à cette agence" });
      }

      const updateData: any = {};
      if (typeof data.operatingHoursEnabled === 'boolean') {
        updateData.operatingHoursEnabled = data.operatingHoursEnabled;
      }
      if (data.operatingHoursStart) {
        updateData.operatingHoursStart = data.operatingHoursStart;
      }
      if (data.operatingHoursEnd) {
        updateData.operatingHoursEnd = data.operatingHoursEnd;
      }
      if (data.operatingDays) {
        updateData.operatingDays = data.operatingDays;
      }

      const updated = await storage.updateCaisse(id, updateData);

      await logAudit(
        req,
        "CAISSE_OPERATING_HOURS_UPDATED",
        "caisse",
        id,
        updateData,
        "success",
        "medium"
      );

      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (error: any) {
      console.error("Error updating operating hours:", error);
      res.status(500).json({ error: error.message });
    }
  });

}
 