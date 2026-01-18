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
  demandesCredit
} from "@shared/schema";
import { storage } from "../storage";
import { createMouvementFinancier } from "../services/ledger";
import { getComptesByClient, DecaissementInsufficientFundsError } from "../storage/finance";
import { requireAuth, requireRole } from "../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, coerceValueToSchema } from "./utils";
import { db } from "../db";
import { z } from "zod";
import {
  validerCoherenceFrequenceDuree,
  calculerNombreEcheances,
  type FrequenceRemboursement,
  type DureeUnite
} from "@shared/config/credit-durations";
import { getWsInstance } from "../ws-server";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import * as sessionService from "../services/caisse/session-service";

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

  app.post("/api/credit-plans", requireAuth, requireRole('admin', 'chef', 'Administrateur'), requireAgenceAccess(), async (req, res) => {
    const data = normalizeKeysDeep(req.body) as any;
    
    // Validation basique
    if (!data.nom) return res.status(400).json({ message: "Le nom est obligatoire" });
    
    const parsed = insertCreditPlanSchema.parse(data);
    const plan = await storage.createCreditPlan(parsed);
    res.status(201).json(addSnakeCaseAliasesDeep(plan));
  });

  app.patch("/api/credit-plans/:id", requireAuth, requireRole('admin', 'chef', 'Administrateur'), async (req, res) => {
    const data = normalizeKeysDeep(req.body) as any;
    const plan = await storage.updateCreditPlan(req.params.id, data);
    if (!plan) return res.status(404).json({ message: "Plan non trouvé" });
    res.json(addSnakeCaseAliasesDeep(plan));
  });

  app.delete("/api/credit-plans/:id", requireAuth, requireRole('admin', 'chef', 'Administrateur'), async (req, res) => {
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
  app.post("/api/credits", requireAuth, requireRole('admin', 'chef', 'credit'), requireAgenceAccess(), async (req, res) => {
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
       const agenceFilter = req.agenceFilter as { agence?: string } | null;
       if (agenceFilter) {
         const client = await storage.getClient(parsed.clientId);
         // Si le client n'existe pas ou n'est pas de la bonne agence => Refusé
         if (!client || client.agence !== agenceFilter.agence) {
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

  // Décaissement de crédit (crée le crédit + crédite le compte courant du client)
  app.post("/api/credits/decaissement", requireAuth, requireRole('admin', 'chef', 'credit'), requireAgenceAccess(), async (req, res) => {
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

      // Accept both 'Approuvée' and 'Approuvée après réévaluation' for disbursement
      const statutsEligiblesDecaissement = ['Approuvée', 'Approuvée après réévaluation'];
      if (!demande.statut || !statutsEligiblesDecaissement.includes(demande.statut)) {
        return res.status(400).json({ message: `La demande doit être approuvée pour être décaissée (statut actuel: ${demande.statut})` });
      }

      // 2. Récupérer le compte courant du client
      const comptesClient = await getComptesByClient(demande.clientId);
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      const compteCourant = comptesClient.find((c: any) => {
        const isCompteCourant = c.typeCompte === 'Courant';
        const isActif = c.statut === 'Actif';

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

      // Déterminer si c'est un décaissement immédiat ou programmé
      const decaissementImmediat = data.decaissementImmediat !== false; // true par défaut
      const dateDecaissement = data.dateDebut || new Date().toISOString().split('T')[0];
      const aujourdhui = new Date().toISOString().split('T')[0];
      const estProgramme = !decaissementImmediat || dateDecaissement > aujourdhui;

      // 4. Créer le crédit
      const creditData = {
        id: creditId,
        clientId: demande.clientId,
        numeroCredit,
        montant: montantDecaissement.toString(),
        taux: demande.tauxInteret,
        duree: data.duree || demande.nombreEcheances || demande.dureeValeur,
        typeCredit: demande.typeCredit || 'Personnel',
        objetCredit: demande.objetCredit,
        demandeId: demande.id, // Link to the original application
        // Si programmé, le crédit est "En attente" (du décaissement), sinon "Actif"
        statut: estProgramme ? 'En attente' as const : 'Actif' as const,
        echeance: demande.frequenceRemboursement,
        dateDebut: new Date(dateDecaissement),
        dateFin: data.dateFin ? new Date(data.dateFin) : null,
        dateSolvabilite: data.dateSolvabilite ? new Date(data.dateSolvabilite) : null,
        soldeRestant: data.soldeRestant || (montantDecaissement * (1 + parseFloat(demande.tauxInteret.toString()) / 100)).toString(),
        agenceId: compteCourant.agenceId,
      };

      const parsed = insertCreditSchema.parse(creditData);
      const credit = await storage.createCredit(parsed);

      let nouveauSolde = parseFloat(compteCourant.soldeCourant || '0');

      // 5. Si décaissement immédiat: créditer le compte courant du client
      if (!estProgramme) {
          try {
             const result = await storage.createDecaissementWithLedger({
                 creditId: credit.id,
                 compteId: compteCourant.id,
                 montant: montantDecaissement.toString(),
                 numeroCredit
             }, user?.id);
             
             // Update local helper
             nouveauSolde += montantDecaissement;

          } catch (err: any) {
              console.error("Erreur Ledger lors du décaissement:", err);
              // Fallback or rollback? Since we already created the credit, we might be in a half-state if ledger fails.
              // Ideally createCredit should be inside the ledger transaction too... 
              // But for now, let's bubble up the error.
              throw new Error(`Erreur lors du décaissement effectif: ${err.message}`);
          }
      }

      // 7. Mettre à jour le statut de la demande
      // Note: On met "Décaissée" dans les deux cas car le décaissement est engagé.
      // L'information de programmation est stockée dans le crédit (statut "En attente de décaissement")
      await storage.updateDemandeCredit(demande.id, { statut: 'Décaissée' });

      // 8. Log audit
      await logAudit(
        req,
        estProgramme ? "DECAISSEMENT_PROGRAMME" : "DECAISSEMENT_CREDIT",
        "credit",
        credit.id,
        {
          demandeId: demande.id,
          montant: montantDecaissement,
          compteId: compteCourant.id,
          numeroCredit,
          programme: estProgramme,
          dateDecaissement: estProgramme ? dateDecaissement : null
        },
        "success",
        "high"
      );

      // 9. Broadcast updates
      const wsInstance = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstance && userAgence) {
        wsInstance.broadcastToAgency(userAgence, { type: "CREDIT_UPDATE", payload: { type: 'credit_decaissement', id: credit.id, programme: estProgramme } });
        wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
        wsInstance.broadcastToAgency(userAgence, {
          type: "LIVE_ACTIVITY",
          payload: {
            action: estProgramme
              ? `Décaissement programmé: ${montantDecaissement.toLocaleString()} FCFA → ${compteCourant.numeroCompte} (${dateDecaissement})`
              : `Décaissement: ${montantDecaissement.toLocaleString()} FCFA → ${compteCourant.numeroCompte}`,
            user: user?.nom || 'Système',
            type: 'credit',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Message de réponse selon le type de décaissement
      const message = estProgramme
        ? `Décaissement programmé pour le ${new Date(dateDecaissement).toLocaleDateString('fr-FR')}. Crédit ${numeroCredit} créé en attente.`
        : `Crédit ${numeroCredit} décaissé. ${montantDecaissement.toLocaleString()} FCFA crédités sur le compte ${compteCourant.numeroCompte}`;

      res.status(201).json({
        success: true,
        credit: addSnakeCaseAliasesDeep(credit),
        compteCourant: estProgramme ? null : {
          id: compteCourant.id,
          numero: compteCourant.numeroCompte,
          nouveauSolde
        },
        programme: estProgramme,
        dateDecaissement: estProgramme ? dateDecaissement : null,
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

  app.get("/api/credits/:id", requireAuth, requireAgenceAccess(), async (req, res) => {
      const credit = await storage.getCredit(req.params.id);
      if (!credit) return res.status(404).json({ message: "Credit not found" });
      
      // Vérifier accès via client
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      if (agenceFilter) {
        const client = await storage.getClient(credit.clientId);
        if (!client || client.agence !== agenceFilter.agence) {
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

        // Map to frontend tabs
        // toProcess = 'En attente' + 'Rejetée' + 'Annulée' (as per Credits.tsx 'demandes' tab)
        // investigation = 'A enquêter'
        // approval = 'En enquête' + 'Enquête terminée'
        // commission = 'Approuvée' + 'Approuvée après réévaluation'
        // reevaluation = 'Réévaluation en cours'

        const mapping = {
            toProcess: 0,
            investigation: 0,
            approval: 0,
            commission: 0,
            reevaluation: 0
        };

        for (const row of results) {
            const s = row.status || '';
            const c = Number(row.count);

            if (['En attente', 'Rejetée', 'Annulée'].includes(s)) {
                mapping.toProcess += c;
            } else if (s === 'A enquêter') {
                mapping.investigation += c;
            } else if (['En enquête', 'Enquête terminée'].includes(s)) {
                mapping.approval += c;
            } else if (['Approuvée', 'Approuvée après réévaluation'].includes(s)) {
                mapping.commission += c;
            } else if (s === 'Réévaluation en cours') {
                mapping.reevaluation += c;
            }
        }

        res.json(addSnakeCaseAliasesDeep(mapping));
      } catch (error: any) {
          console.error("Error fetching credit counts:", error);
          res.status(500).json({ message: "Erreur lors du comptage des dossiers" });
      }
  });

  app.get("/api/demandes-credit", requireAuth, requireAgenceAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      const filter = agenceFilter ? { agence: agenceFilter.agence } : {};
      
      const demandes = await storage.getAllDemandes(filter);
      
      res.json(addSnakeCaseAliasesDeep(demandes));
  });

  // Create demande credit (roles: admin, chef, credit, superviseur, terrain)
  app.post("/api/demandes-credit", requireAuth, requireRole('admin', 'chef', 'credit', 'superviseur', 'terrain'), requireAgenceAccess(), async (req, res) => {
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
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      if (agenceFilter) {
        const client = await storage.getClient(parsed.clientId);
        if (!client || client.agence !== agenceFilter.agence) {
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
      
      res.json(addSnakeCaseAliasesDeep(demande));
  });

  app.patch("/api/demandes-credit/:id", requireAuth, requireRole('admin', 'chef', 'credit', 'superviseur'), async (req, res) => {
      const { id } = req.params;
      const updateData = normalizeKeysDeep(req.body) as any;

      // Verify existence
      const existing = await storage.getDemandeCredit(id);
      if (!existing) return res.status(404).json({ message: "Demande non trouvée" });

      let updated;

      // Logic for Refund on Rejection
      if (updateData.statut === 'Rejetée' && updateData.montantRemboursement && Number(updateData.montantRemboursement) > 0) {
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
  
            // 3. Update Demande Status
            // Motif Rejet Update
            if (updateData.motifRejet) {
                 updateData.motifRejet += ` (Remboursement de ${refundAmount} FCFA en attente)`;
            }

            return await storage.updateDemandeCredit(id, updateData, tx);
          });
      } else {
          // Normal update
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

           // Si approuvée, notifier en temps réel
           if (updateData.statut === 'Approuvée') {
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
           }
      }

      res.json(addSnakeCaseAliasesDeep(updated));
  });

  app.delete("/api/demandes-credit/:id", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
      const success = await storage.deleteDemandeCredit(req.params.id);
      if (!success) return res.status(404).json({ message: "Demande non trouvée" });
      
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_deleted', id: req.params.id } });
      }
      
      res.json({ success: true });
  });

  app.put("/api/demandes-credit/:id/cancel", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
      const { motif } = req.body;
      const demande = await storage.cancelDemandeCredit(req.params.id, motif);
      
      if (!demande) return res.status(404).json({ message: "Demande non trouvée" });
      
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_cancelled', id: req.params.id } });
      }
      
      res.json(addSnakeCaseAliasesDeep(demande));
  });

  // Reject a credit application from Commission Crédit phase
  app.post("/api/demandes/:id/reject-from-commission", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
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
      const statutsEligiblesCommission = ['Approuvée', 'Approuvée après réévaluation'];
      if (!demande.statut || !statutsEligiblesCommission.includes(demande.statut)) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être rejetée depuis la commission (statut actuel: ${demande.statut}). Seules les demandes approuvées peuvent être rejetées à cette étape.`
        });
      }

      // Update demande status to Rejetée
      const updated = await storage.updateDemandeCredit(id, { 
        statut: 'Rejetée',
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
          statusAvant: 'Approuvée',
          statusApres: 'Rejetée'
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

  app.post("/api/demandes-credit/:id/payer-frais", requireAuth, requireRole('admin', 'chef', 'caisse', 'credit'), async (req, res) => {
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
             // Vérification stricte de l'agence (ID ou Nom legacy)
             // On compare l'agence de la session avec l'agence du client
             const sessionAgenceId = activeSession.agenceId;
             const clientAgenceId = client.agenceId;

             if (sessionAgenceId && clientAgenceId && sessionAgenceId !== clientAgenceId) {
                 return res.status(403).json({ message: "Le client est affilié à une autre agence. Encaissement refusé." });
             } 
             
             // Legacy fallback removed: agenceId is now the source of truth.
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
      if (demande.dureeUnite === 'Jour') {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === 'Semaine') {
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
  app.post("/api/demandes-credit/:id/recalculer-score", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance, mettreAJourScoreClient } = await import('../services/microfinance-scoring');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === 'Jour') {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === 'Semaine') {
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

  // Enquetes (roles: admin, chef, credit, superviseur)
  app.get("/api/enquetes-credit", requireAuth, requireRole('admin', 'chef', 'credit', 'superviseur', 'agent_terrain'), async (req, res) => {
      // Return both completed/in-progress enquetes AND demandes ready for investigation
      // Actually, for now, let's just return enquetes. Frontend can merge if needed, 
      // or we can handle it here.
      // But standard pattern is:
      const enquetes = await storage.getAllEnquetes();
      res.json(addSnakeCaseAliasesDeep(enquetes));
  });

  app.post("/api/enquetes-credit", requireAuth, requireRole('admin', 'chef', 'credit', 'superviseur'), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertEnqueteCreditSchema.parse(data);
      const enquete = await storage.createEnqueteCredit(parsed);
      
      // Update Demande Status
      if (enquete.demandeId) {
          // Si l'enquête est créée, on considère qu'elle est terminée et prête pour approbation
          await storage.updateDemandeCredit(enquete.demandeId, { statut: 'Enquête terminée' as any });
      }

      // Notify Credit Update
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'enquete_new', demandeId: parsed.demandeId } });
      }

      res.json(addSnakeCaseAliasesDeep(enquete));
  });

  app.post("/api/enquetes-credit/:id/valider", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
      const { decision, montant_approuve, commentaire, raison } = req.body;

      const enquete = await storage.getEnqueteCredit(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // IDEMPOTENCE CHECK: Vérifier si l'enquête n'est pas déjà validée
      const statutsTerminaux = ['Approuvé', 'Rejeté', 'Réduit'];
      if (statutsTerminaux.includes(enquete.statut || '')) {
          return res.status(409).json({
              message: "Cette enquête a déjà été traitée",
              statut_actuel: enquete.statut,
              code: "ALREADY_PROCESSED"
          });
      }

      const updatedEnquete = await storage.updateEnqueteCredit(req.params.id, {
          statut: decision === 'approuve' ? 'Approuvé' : decision === 'rejete' ? 'Rejeté' : 'Réduit',
          recommandation: commentaire || raison // Store comment
      });

      // Update Demande status if enquete is approved/rejected
      if (enquete.demandeId) {
          let nouveauStatutDemande = 'En enquête'; // Default
          if (decision === 'approuve' || decision === 'reduit') {
              nouveauStatutDemande = 'Approuvée'; // Prêt pour décaissement
          } else if (decision === 'rejete') {
              nouveauStatutDemande = 'Rejetée'; // Rejetée suite enquête
          }

          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: nouveauStatutDemande as any,
              montantApprouve: montant_approuve ? montant_approuve.toString() : undefined,
              motifRejet: decision === 'rejete' ? raison : undefined
          });

          // Notify
          const wsInstance = getWsInstance();
          if (wsInstance) {
               wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_updated', id: enquete.demandeId, statut: nouveauStatutDemande } });
          }
      }

      res.json(addSnakeCaseAliasesDeep(updatedEnquete));
  });

  // Remboursements (roles: admin, chef, caisse, credit)
  // Now using atomic ledger flow
  app.post("/api/remboursements", requireAuth, requireRole('admin', 'chef', 'caisse', 'credit'), async (req, res) => {
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
         let currentSolde = c.solde || "0";

         if (activeSession) {
            // Calculate real-time balance
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.soldeInitial || 0);
            
            for (const op of ops) {
                const montant = Number(op.montant || 0);
                
                // Logic In/Out expanded for new Enum types
                const IN_TYPES = ['Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit', 'Approvisionnement coffre'];
                const OUT_TYPES = ['Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais', 'Versement coffre'];

                if (IN_TYPES.includes(op.typeOperation)) {
                    solde += montant;
                } else if (OUT_TYPES.includes(op.typeOperation)) {
                    solde -= montant;
                } else if (op.typeOperation === 'Transfert caisse') {
                    // Check reference/description to determine direction for Transfer
                    if (op.reference?.includes('TRF-IN') || op.description?.includes('Réception')) {
                        solde += montant;
                    } else {
                        solde -= montant;
                    }
                }
            }
            currentSolde = solde.toString();
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

  app.get("/api/caisses", requireAuth, requireRole('admin', 'Administrateur', 'admin_generale'), async (req, res) => {
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
         let currentSolde = c.solde || "0";

         if (activeSession) {
            // Calculate real-time balance using Ledger SENS (Source of Truth)
            // This fixes discrepancies where some operation types were missing from the hardcoded list
            const ops = await storage.getOperationsBySessionWithSens(activeSession.id);
            let solde = Number(activeSession.soldeInitial || 0);
            
            for (const op of ops) {
                const montant = Number(op.montant || 0);
                if (op.sens === 'Crédit') {
                    solde += montant;
                } else if (op.sens === 'Débit') {
                    solde -= montant;
                }
            }
            currentSolde = solde.toString();
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

  app.post("/api/caisses/:id/assign", requireAuth, requireRole('admin', 'chef'), requireAgenceAccess(), async (req, res) => {
      const { id } = req.params;
      const { userIds } = req.body; // Expect array of user IDs
      
      if (!Array.isArray(userIds)) {
          return res.status(400).json({ message: "userIds must be an array" });
      }

      await storage.setCaisseAssignments(id, userIds, req.session.user!.id);
      res.json({ success: true });
  });

  app.post("/api/caisses", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), requireAgenceAccess(), async (req, res) => {
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

  app.delete("/api/caisses/:id", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), async (req, res) => {
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

  app.get("/api/sessions-caisse", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence', 'superviseur'), requireAgenceIdAccess(), async (req, res) => {
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
          { caisseId: data.caisseId, soldeInitial: result.session.soldeInitial },
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
      let soldeTheorique = Number(session.soldeInitial);
      
      // Add Operations
      for (const op of ops) {
          const montant = Number(op.montant);
          
          const IN_TYPES = ['Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit', 'Approvisionnement coffre'];
          const OUT_TYPES = ['Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais', 'Versement coffre'];

          if (IN_TYPES.includes(op.typeOperation)) {
              soldeTheorique += montant;
          } else if (OUT_TYPES.includes(op.typeOperation)) {
              soldeTheorique -= montant;
          } else if (op.typeOperation === 'Transfert caisse') {
               if (op.reference?.includes('TRF-IN') || op.description?.includes('Réception')) {
                   soldeTheorique += montant;
               } else {
                   soldeTheorique -= montant;
               }
          }
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

  // Sessions à risque (inactives depuis trop longtemps)
  app.get("/api/sessions-caisse/risky", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), async (req, res) => {
      try {
          const riskySessions = await sessionService.getRiskySessions();
          res.json(addSnakeCaseAliasesDeep(riskySessions));
      } catch (error: any) {
          console.error("Erreur récupération sessions à risque:", error);
          res.status(500).json({ message: error.message });
      }
  });

  // Sessions avec écarts significatifs (monitoring)
  app.get("/api/sessions-caisse/ecarts", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), async (req, res) => {
      try {
          const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
          const sessionsWithEcarts = await sessionService.getSessionsWithSignificantEcarts(threshold);
          res.json(addSnakeCaseAliasesDeep(sessionsWithEcarts));
      } catch (error: any) {
          console.error("Erreur récupération écarts:", error);
          res.status(500).json({ message: error.message });
      }
  });

  // Fermer les sessions expirées (route admin pour déclencher manuellement ou via cron)
  app.post("/api/sessions-caisse/close-expired", requireAuth, requireRole('admin', 'Administrateur'), async (req, res) => {
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

  // Forcer la fermeture d'une session (admin)
  app.post("/api/sessions-caisse/:id/force-close", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), async (req, res) => {
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

  app.get("/api/caisses/status", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence', 'agent', 'terrain'), async (req, res) => {
    const agenceId = req.query.agenceId as string;
    const caisses = await storage.getCaissesWithStatus(agenceId);
    res.json(addSnakeCaseAliasesDeep(caisses));
  });

  // Opérations caisse du jour (pour la session active de l'utilisateur)
  app.get("/api/operations-caisse/today", requireAuth, async (req, res) => {
      try {
        const user = req.session.user!;

        // Récupérer la session active de l'utilisateur
        const activeSession = await storage.getActiveSessionForUser(user.id);

        if (!activeSession) {
          return res.json([]); // Pas de session active, pas d'opérations
        }

        // Récupérer toutes les opérations de cette session
        const operations = await storage.getOperationsBySession(activeSession.id);

        res.json(addSnakeCaseAliasesDeep(operations));
      } catch (error: any) {
        console.error("Erreur récupération opérations du jour:", error);
        res.status(500).json({ message: error.message });
      }
  });

  // Opération caisse (roles: admin, chef, caisse)
  app.post("/api/operations-caisse", requireAuth, requireRole('admin', 'chef', 'caisse', 'Administrateur'), async (req, res) => {
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
                 if (opType.includes('courant')) targetType = 'Courant';
                 else if (opType.includes('bloqué') || opType.includes('bloque')) targetType = 'Bloqué';
                 else if (opType.includes('épargne') || opType.includes('epargne')) targetType = 'Épargne';
                 
                 let foundAccount;
                 if (targetType) {
                     foundAccount = clientAccounts.find(c => c.typeCompte === targetType && c.statut === 'Actif');
                 } else {
                     // Default fallback (usually Epargne)
                     foundAccount = clientAccounts.find(c => c.typeCompte === 'Épargne' && c.statut === 'Actif') || clientAccounts[0];
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
                    if (client && ['Inactif', 'Suspendu', 'Blacklisté'].includes(client.status || '')) {
                        return res.status(403).json({
                            message: `Client ${client.status}. Les opérations de débit ne sont pas autorisées.`
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
                 // Loyalty Points
                if (parsed.clientId && parsed.typeOperation === 'Dépôt épargne' && parsed.montant) {
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
  app.patch("/api/operations-caisse/:id", requireAuth, requireRole('admin', 'chef', 'caisse', 'Administrateur'), async (req, res) => {
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
  app.patch("/api/credits/:id", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const credit = await storage.getCredit(req.params.id);
      
      if (!credit) return res.status(404).json({ message: "Crédit non trouvé" });

      // Clean up fields that shouldn't be updated directly usually, but flexible for now
      // Especially crucial for automated repayment toggle
      
      const updated = await storage.updateCredit(req.params.id, data as any);
      res.json(addSnakeCaseAliasesDeep(updated));
    } catch (e: any) {
      console.error("Erreur mise à jour crédit:", e);
      res.status(400).json({ message: e.message || "Erreur lors de la mise à jour du crédit" });
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
  app.post("/api/factures", requireAuth, requireRole('admin', 'chef', 'comptable'), async (req, res) => {
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
  app.post("/api/caisse-transferts", requireAuth, requireRole('admin', 'chef', 'caisse'), async (req, res) => {
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
      const soldeActuel = Number(sessionSource.soldeReel || sessionSource.soldeTheorique); 
      // Note: soldeReel est souvent null si pas cloturé, on utilise le théorique par défaut.
      // Idéalement on recalcule: Initial + Entrées - Sorties
      // Pour l'instant on se base sur le frontend mais le backend DOIT vérifier.
      
      // Calculer solde théorique courant
      const ops = await storage.getOperationsBySession(sessionSource.id);
      const computedSolde = ops.reduce((acc, op) => {
         // Ajuster selon type ('depot' vs 'retrait')
         // Simplification: le frontend envoie le montant, on verifie juste grossièrement ici ou on fait confiance au process
         return acc; 
      }, Number(sessionSource.soldeInitial));

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
  app.patch("/api/caisse-transferts/:id/recevoir", requireAuth, requireRole('admin', 'chef', 'caisse'), async (req, res) => {
      const { id } = req.params;
      const { sessionId } = req.body; // Session qui reçoit

      const sessionDest = await storage.getSessionCaisse(sessionId);
      if (!sessionDest || sessionDest.closedAt) {
          return res.status(400).json({ message: "Vous devez avoir une session ouverte pour recevoir des fonds" });
      }

      const transfert = await storage.getCaisseTransfert(id);
      if (!transfert || transfert.statut !== 'En attente') {
          return res.status(400).json({ message: "Transfert non disponible" });
      }

      // Valider
      const updated = await storage.updateCaisseTransfert(id, {
          statut: 'Validé',
          sessionDestId: sessionDest.id,
          dateValidation: new Date(),
          validatedBy: req.session.user!.id
      });

      // Créer les opérations miroirs
      // 1. Sortie chez l'expéditeur (Transfert caisse - Sortant)
      await storage.createOperationCaisse({
          sessionId: transfert.sessionSourceId,
          typeOperation: 'Transfert caisse',
          montant: transfert.montant,
          reference: `TRF-OUT-${transfert.reference}`,
          description: `Transfert vers ${sessionDest.agenceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'Virement',
          createdBy: req.session.user!.id
      });

      // 2. Entrée chez le destinataire (Transfert caisse - Entrant)
      await storage.createOperationCaisse({
          sessionId: sessionDest.id,
          typeOperation: 'Transfert caisse',
          montant: transfert.montant, 
          reference: `TRF-IN-${transfert.reference}`,
          description: `Réception transfert de ${transfert.sessionSourceId} (Ref: ${transfert.reference})`,
          methodePaiement: 'Virement',
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
  app.post("/api/caisse-transferts/:id/annuler", requireAuth, requireRole('admin', 'chef'), async (req, res) => {
      const { id } = req.params;
      const transfert = await storage.getCaisseTransfert(id);
      
      if (!transfert || transfert.statut !== 'En attente') {
          return res.status(400).json({ message: "Transfert ne peut pas être annulé" });
      }
      
      // Seul l'émetteur ou un admin peut annuler
      // Implementation simplifiée...
      
      const updated = await storage.updateCaisseTransfert(id, {
          statut: 'Annulé'
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
  app.get("/api/finance/credit-refunds", requireAuth, requireRole('admin', 'chef', 'credit', 'caisse'), requireAgenceAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      let query = db.select({
        refund: creditRefundRequests,
        demande: demandesCredit,
        client: clients
      })
      .from(creditRefundRequests)
      .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
      .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id));

      const conditions = [];
      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      if (req.query.statut) {
        conditions.push(eq(creditRefundRequests.statut, req.query.statut as string));
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
  app.get("/api/finance/credit-refunds/pending/count", requireAuth, requireRole('admin', 'chef', 'credit', 'caisse'), requireAgenceAccess(), async (req, res) => {
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
  app.post("/api/finance/credit-refunds/:id/approve", requireAuth, requireRole('admin', 'chef', 'audit'), async (req, res) => {
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
   * POST /api/finance/credit-refunds/:id/pay - Execute Payment (Cash or Account)
   */
  app.post("/api/finance/credit-refunds/:id/pay", requireAuth, requireRole('admin', 'caisse', 'chef'), async (req, res) => {
    const { method, sessionCaisseId } = req.body; // method: 'CASH' | 'ACCOUNT'
    const user = req.session.user!;

    try {
       // Using simpler transaction wrapper because we need explicit logic
       const refundId = req.params.id;
       
       await db.transaction(async (tx) => {
          // 1. Lock and Get Refund
          const [refundData] = await tx
             .select()
             .from(creditRefundRequests)
             .where(eq(creditRefundRequests.id, refundId))
             //.for('update') // drizzle support for lock? .for('update') might need raw sql or specific driver support
             ;
             
          if (!refundData) throw new Error("Refund not found");
          if (refundData.statut !== 'APPROVED') throw new Error("Refund must be APPROVED before payment");

          const amount = Number(refundData.montantRemboursable);

          // 2. Prepare Ledger Transaction
          // Dynamic import removed
          let mouvement;
          let paymentRefString = '';

          if (method === 'ACCOUNT') {
             // Credit Client Account
             const clientAccounts = await storage.getComptesByClient(refundData.clientId);
             const courantAccount = clientAccounts.find(c => c.typeCompte === 'Courant' && c.statut === 'Actif');
             if (!courantAccount) throw new Error("No active current account found for client");

             // Create Transaction
             await storage.createTransactionCompte({
                compteId: courantAccount.id,
                typePaiement: 'Dépôt Courant',
                montant: amount.toString(),
                observations: `Remboursement Frais Dossier (Ref: ${refundData.id})`,
                methodePaiement: 'Virement', 
             }, tx);

             // Create Ledger Entry
             mouvement = await createMouvementFinancier(tx, {
               montant: amount.toString(),
               sens: 'Crédit',
               sourceModule: 'SYSTEME',
               typePaiement: 'Dépôt Courant',
               clientId: refundData.clientId,
               compteId: courantAccount.id,
               // creditId: refundData.demandeId, // Incorrect: demandeId is not a creditId
               metadata: { type: 'REFUND_PAYMENT', refundId: refundData.id, demandeId: refundData.demandeId }
             }, user.id);
             
             paymentRefString = `VIREMENT-${mouvement.reference}`;

          } else if (method === 'CASH') {
             // Cash Payment (Requires Active Session)
             if (!sessionCaisseId) throw new Error("Session Caisse ID required for cash payment");
             
             // Check Session Balance
             const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionCaisseId));
             if (!session || session.closedAt) throw new Error("Session caisse invalid or closed");
             
             // Debit Caisse -> Insert Operation
             const [op] = await tx.insert(operationsCaisse).values({
               sessionId: sessionCaisseId,
               typeOperation: 'Retrait Courant', 
               montant: amount.toString(),
               methodePaiement: 'Espèces',
               reference: `REFUND-${refundData.id.substring(0,8)}`,
               description: `Remboursement Frais (Ref: ${refundData.id})`,
               clientId: refundData.clientId,
               createdBy: user.id
             }).returning();
             
             // Ledger Mouvement
             mouvement = await createMouvementFinancier(tx, {
               montant: amount.toString(),
               sens: 'Débit',
               sourceModule: 'SYSTEME',
               sourceId: op.id,
               typePaiement: 'Retrait Courant',
               sessionCaisseId: sessionCaisseId,
               clientId: refundData.clientId,
               // creditId: refundData.demandeId, // Incorrect
               metadata: { type: 'REFUND_PAYMENT', refundId: refundData.id, operationId: op.id, demandeId: refundData.demandeId }
             }, user.id);
             
             paymentRefString = `CASH-${op.reference}`;
          } else {
             throw new Error("Invalid payment method");
          }

          // 3. Update Refund Note Status
          await tx.update(creditRefundRequests).set({
             statut: 'PAID',
             paidAt: new Date(),
             paidBy: user.id,
             paymentMethod: method,
             paymentReference: paymentRefString,
             mouvementId: mouvement.id
          }).where(eq(creditRefundRequests.id, refundData.id));
          
       });

       const updated = await storage.getCreditRefundRequest(refundId);
       res.json(addSnakeCaseAliasesDeep(updated));
       
    } catch (error: any) {
       console.error("Payment Error", error);
       res.status(500).json({ message: error.message });
    }
  });


  // ==========================================
  // CAISSE LIQUIDATION & DELETION
  // ==========================================

  // LIQUIDATION CAISSE
  app.post("/api/caisses/:id/liquidate", requireAuth, requireRole('admin', 'chef'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;

      // 1. Get Caisse
      const [caisse] = await db.select().from(schema.caisses).where(eq(schema.caisses.id, id));
      if (!caisse) return res.status(404).json({ error: "Caisse not found" });

      if (caisse.statut === 'Fermée') {
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
                sens: "Débit", // Débit from caisse perspective
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

}
