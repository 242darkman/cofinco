import type { Express } from "express";
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
  comptes
} from "@shared/schema";
import { storage } from "../storage";
import { getComptesByClient } from "../storage/finance";
import { requireAuth, requireRole } from "../auth";
import { requireAgenceAccess } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, coerceValueToSchema } from "./utils";
import { z } from "zod";
import {
  validerCoherenceFrequenceDuree,
  calculerNombreEcheances,
  type FrequenceRemboursement,
  type DureeUnite
} from "@shared/config/credit-durations";
import { getWsInstance } from "../ws-server";
import { db } from "../db";
import { eq } from "drizzle-orm";

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
    const filter = agenceFilter ? { agence: agenceFilter.agence } : {};
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

      if (demande.statut !== 'Approuvée') {
        return res.status(400).json({ message: `La demande doit être approuvée pour être décaissée (statut actuel: ${demande.statut})` });
      }

      // 2. Récupérer le compte courant du client
      const comptesClient = await getComptesByClient(demande.clientId);
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      const compteCourant = comptesClient.find((c: any) => {
        const isCompteCourant = c.typeCompte === 'Courant' || c.type_compte === 'Courant';
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
        // Si programmé, le crédit est "En attente" (du décaissement), sinon "Actif"
        statut: estProgramme ? 'En attente' as const : 'Actif' as const,
        echeance: demande.frequenceRemboursement,
        dateDebut: dateDecaissement,
        dateFin: data.dateFin,
        dateSolvabilite: data.dateSolvabilite,
        soldeRestant: data.soldeRestant || (montantDecaissement * (1 + parseFloat(demande.tauxInteret.toString()) / 100)).toString(),
        agenceId: compteCourant.agenceId,
      };

      const parsed = insertCreditSchema.parse(creditData);
      const credit = await storage.createCredit(parsed);

      let nouveauSolde = parseFloat(compteCourant.soldeCourant || '0');

      // 5. Si décaissement immédiat: créditer le compte courant du client
      if (!estProgramme) {
        const mouvementData = {
          compteId: compteCourant.id,
          clientId: demande.clientId,
          creditId: credit.id,
          montant: montantDecaissement.toString(),
          sens: 'Crédit' as const,
          sourceModule: 'CREDIT' as const,
          typeOperation: 'Décaissement crédit',
          description: `Décaissement crédit ${numeroCredit}`,
          reference: numeroCredit,
          statut: 'Posté' as const,
          createdBy: user?.id,
        };

        await db.insert(mouvementsFinanciers).values(mouvementData);

        // 6. Mettre à jour le solde du compte courant
        nouveauSolde = nouveauSolde + montantDecaissement;
        await db.update(comptes)
          .set({ soldeCourant: nouveauSolde.toString(), updatedAt: new Date() })
          .where(eq(comptes.id, compteCourant.id));
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
      res.status(500).json({ message: error.message || "Erreur lors du décaissement" });
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
        const erreurValidation = validerCoherenceFrequenceDuree(
          data.frequenceRemboursement as FrequenceRemboursement,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );

        if (erreurValidation) {
          return res.status(400).json({
            message: erreurValidation,
            code: "INVALID_DURATION_FREQUENCY"
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

  app.delete("/api/demandes-credit/:id", requireAuth, requireRole('admin', 'chef', 'credit'), async (req, res) => {
      const success = await storage.deleteDemandeCredit(req.params.id);
      if (!success) return res.status(404).json({ message: "Demande non trouvée" });
      
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_deleted', id: req.params.id } });
      }
      
      res.json({ success: true });
  });

  app.post("/api/demandes-credit/:id/payer-frais", requireAuth, requireRole('admin', 'chef', 'caisse', 'credit'), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          const user = req.session.user;
          
          let sessionCaisseId: string | undefined;
          let activeSession: any = undefined;

          if (user) {
              // Admin override
              if (data.sessionCaisseId && ['admin', 'Administrateur', 'Chef d\'Agence'].includes(user.role)) {
                  activeSession = await storage.getSessionCaisse(data.sessionCaisseId);
                  if (activeSession && activeSession.statut === 'Ouverte') {
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
             
             // Fallback Legacy (Comparaison par nom si les IDs manquent)
             if ((!sessionAgenceId || !clientAgenceId) && activeSession.agence && client.agence && activeSession.agence !== client.agence) {
                  return res.status(403).json({ message: "Le client est affilié à une autre agence (" + client.agence + ")." });
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
          await storage.updateDemandeCredit(enquete.demandeId, { statut: 'En enquête' as any });
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

      const updatedEnquete = await storage.updateEnqueteCredit(req.params.id, {
          statut: decision === 'approuve' ? 'Approuvé' : decision === 'rejete' ? 'Rejeté' : 'Réduit',
          recommandation: commentaire || raison // Store comment
      });

      // Update Demande status if enquete is approved/rejected
      if (enquete.demandeId) {
          let nouveauStatutDemande = 'En enquête'; // Default
          if (decision === 'approuve' || decision === 'reduit') {
              nouveauStatutDemande = 'Enquête terminée'; // Prêt pour décision finale
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
      // Une caisse est occupée si elle a une session 'Ouverte'
      const activeSessions = await storage.getActiveSessions();
      
      const enrichedCaisses = await Promise.all(caisses.map(async (c) => {
         const activeSession = activeSessions.find(s => s.caisseId === c.id && s.statut === 'Ouverte');
         let currentSolde = c.solde || "0";

         if (activeSession) {
            // Calculate real-time balance
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.soldeInitial || 0);
            
            for (const op of ops) {
                const montant = Number(op.montant || 0);
                
                // Logic In/Out expanded for new Enum types
                const IN_TYPES = ['Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit'];
                const OUT_TYPES = ['Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais'];

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
         const activeSession = activeSessions.find(s => s.caisseId === c.id && s.statut === 'Ouverte');
         let currentSolde = c.solde || "0";

         if (activeSession) {
            // Calculate real-time balance for Admin View as well
            const ops = await storage.getOperationsBySession(activeSession.id);
            let solde = Number(activeSession.soldeInitial || 0);
            
            for (const op of ops) {
                const montant = Number(op.montant || 0);
                if (['Versement', 'Depot', 'Encaissement'].includes(op.typeOperation)) {
                    solde += montant;
                } else if (['Retrait', 'Decaissement'].includes(op.typeOperation)) {
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
      
      const isAdmin = user.role === 'admin' || user.role === 'admin_generale' || user.role === 'Administrateur';
      
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
    if (user.role !== 'admin' && user.role !== 'admin_generale' && caisse.agenceId !== user.agenceId) {
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

  app.get("/api/sessions-caisse", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence', 'superviseur'), requireAgenceAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agence?: string } | null;
      // Allow filtering by agenceId from query if not restricted by role (admin)
      // If restricted, req.agenceFilter takes precedence
      const requestedAgenceId = req.query.agenceId as string;
      const requestedStatut = req.query.statut as string;

      const filter = { 
        agence: agenceFilter ? agenceFilter.agence : requestedAgenceId,
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
  app.post("/api/sessions-caisse", requireAuth, async (req, res) => {
      // 1. Validate Roles & Assignments
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const isManager = ['admin', 'Administrateur', 'Chef d\'Agence'].includes(user.role);
      
      const data = normalizeKeysDeep(req.body) as any;
      
      // Fix Zod date validation (expects Date object, received string)
      if (data.dateOuverture && typeof data.dateOuverture === 'string') {
          data.dateOuverture = new Date(data.dateOuverture);
      }
      
      // Parse data
      let parsed; 
      try {
        parsed = insertSessionCaisseSchema.parse(data);
      } catch (e) {
         console.error("Validation Error:", e);
         return res.status(400).json({ message: "Données invalides", details: e });
      }

      // Check Assignment if not Manager
      if (!isManager) {
          if (!parsed.caisseId) return res.status(400).json({ message: "Caisse ID manquant" });
          
          const assignments = await storage.getCaisseAssignments(parsed.caisseId);
          const isAssigned = assignments.some(a => a.userId === user.id);
          
          if (!isAssigned) {
              return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
          }
      }

      // 2. Check concurrency: Is this Caisse already open?
      if (parsed.caisseId) {
          const activeSessions = await storage.getActiveSessions();
          const isOccupied = activeSessions.some(s => s.caisseId === parsed.caisseId && s.statut === 'Ouverte');
          if (isOccupied) {
             return res.status(409).json({ message: "Cette caisse est déjà occupée par une autre session ouverte." });
          }
      } else {
          return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
      }

      // 3. Check if user already has an open session? 
      const activeSessions = await storage.getActiveSessions();
      const userHasSession = activeSessions.some(s => s.caissierId === parsed.caissierId && s.statut === 'Ouverte');
      if (userHasSession) {
          return res.status(409).json({ message: "Vous avez déjà une session ouverte." });
      }

      const session = await storage.createSessionCaisse(parsed);
      
      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: parsed.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(addSnakeCaseAliasesDeep(session));
  });

  // Clôture de session
  app.post("/api/sessions-caisse/:id/close", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;
      
      const session = await storage.getSessionCaisse(id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });

      // Permission check: User must be the owner OR Admin/Chef
      const isManager = ['admin', 'Administrateur', 'Chef d\'Agence'].includes(user.role);
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
          
          const IN_TYPES = ['Versement', 'Depot', 'Encaissement', 'Dépôt épargne', 'Remboursement crédit'];
          const OUT_TYPES = ['Retrait', 'Decaissement', 'Retrait épargne', 'Décaissement crédit', 'Frais'];

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

  app.get("/api/caisses/status", requireAuth, requireRole('admin', 'Administrateur', 'Chef d\'Agence'), async (req, res) => {
    const agenceId = req.query.agenceId as string;
    const caisses = await storage.getCaissesWithStatus(agenceId);
    res.json(addSnakeCaseAliasesDeep(caisses));
  });

  // Opération caisse (roles: admin, chef, caisse)
  app.post("/api/operations-caisse", requireAuth, requireRole('admin', 'chef', 'caisse', 'Administrateur'), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user!;
        
        // Ownership check
        const session = await storage.getSessionCaisse(data.sessionId);
        if (!session) return res.status(404).json({ message: "Session introuvable" });
        
        const isManager = ['admin', 'Administrateur', 'Chef d\'Agence'].includes(user.role);
        if (session.caissierId !== user.id && !isManager) {
            return res.status(403).json({ message: "Vous n'avez pas l'autorisation d'ajouter des opérations à cette session" });
        }

        const parsed = insertOperationCaisseSchema.parse(data);
        const op = await storage.createOperationCaisse(parsed);

        // Update account balance and create transaction history
        let targetCompteId = data.compteId;
        
        // If no specific account provided, try to find the client's default savings account
        if (!targetCompteId && parsed.clientId) {
             const clientAccounts = await storage.getComptesByClient(parsed.clientId);
             const defaultAccount = clientAccounts.find(c => c.typeCompte === 'Épargne' && c.statut === 'Actif') || clientAccounts[0];
             if (defaultAccount) {
                 targetCompteId = defaultAccount.id;
             }
        }

            if (targetCompteId && parsed.montant) {
            const compte = await storage.getCompte(targetCompteId);
            if (compte) {
                const montant = Number(parsed.montant);
                const currentSolde = Number(compte.soldeCourant) || 0;
                let newSolde: number;
                let transactionType = 'Dépôt';

                // Versement/Dépôt = add to balance, Retrait = subtract from balance
                const opType = (parsed.typeOperation || '').toLowerCase();
                const isDeposit = ['versement', 'dépôt', 'depot', 'depôt', 'dépôt épargne'].includes(opType);
                const isWithdrawal = ['retrait', 'retrait épargne'].includes(opType);

                if (isDeposit) {
                    newSolde = currentSolde + montant;
                    transactionType = 'Dépôt';
                } else if (isWithdrawal) {
                    newSolde = currentSolde - montant;
                    transactionType = 'Retrait';
                } else {
                    newSolde = currentSolde; // No change for other operations
                }

                if (newSolde !== currentSolde) {
                    // 1. Update Balance
                    await storage.updateCompte(targetCompteId, { soldeCourant: String(newSolde) });

                    // 2. Create Transaction Record (CRUCIAL for History)
                    // Map transaction type to valid typePaiement
                    const typePaiement = transactionType === 'Dépôt' 
                        ? (compte.typeCompte === 'Courant' ? 'Dépôt Courant' : 'Dépôt Épargne')
                        : (compte.typeCompte === 'Courant' ? 'Retrait Courant' : 'Retrait Épargne');

                    await storage.createTransactionCompte({
                        compteId: targetCompteId,
                        typePaiement: typePaiement as any,
                        montant: String(montant),
                        soldeApres: String(newSolde),
                        methodePaiement: 'Espèces',
                        referenceExterne: op.reference || `OP-${Date.now()}`,
                        observations: `Opération Caisse: ${parsed.typeOperation}`,
                        createdBy: user.id
                    } as any);

                    // 3. Broadcast account update
                    try {
                        const wsInstance = getWsInstance();
                        if (wsInstance) {
                            wsInstance.broadcast({ type: "COMPTE_UPDATE", payload: { compteId: targetCompteId, newSolde } });
                        }
                    } catch (wsErr) {
                        console.error('Error broadcasting compte update:', wsErr);
                    }
                }
            }
        }

        try {
            // Loyalty Points: Award points for deposits
            if (parsed.clientId && parsed.typeOperation === 'Dépôt épargne' && parsed.montant) {
                const points = Math.floor(Number(parsed.montant) / 1000); // 1 point per 1000 FCFA
                await storage.addLoyaltyPoints(
                    parsed.clientId,
                    points,
                    'EPARGNE',
                    `Versement de ${parsed.montant} FCFA`,
                    Number(parsed.montant)
                );
                // Recalculate engagement score
                await storage.calculateEngagementScore(parsed.clientId);
            }
            
            // Notify Client Update for Limits Real-time Refresh
            if (parsed.clientId) {
                const wsInstance = getWsInstance();
                if (wsInstance) {
                    wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: parsed.clientId } });
                    // Also update dashboard & Caisse List
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                    wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
                }
            }
        } catch (wsError) {
             console.error('Error in post-operation processing (WS/Loyalty):', wsError);
        }

        res.json(addSnakeCaseAliasesDeep(op));
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
        try {
             if (updated.clientId) {
                const wsInstance = getWsInstance();
                if (wsInstance) {
                    wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: updated.clientId } });
                    wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
                }
             }
        } catch (wsError) {
             console.error("WS Broadcast error:", wsError);
        }

        res.json(addSnakeCaseAliasesDeep(updated));
      } catch (error: any) {
         console.error('Error updating operation:', error);
         res.status(400).json({ message: error.message || "Erreur lors de la mise à jour" });
      }
  });

  // Factures - Basic logic
  app.get("/api/factures", requireAuth, async (req, res) => {
      const factures = await storage.getAllFactures();
      res.json(addSnakeCaseAliasesDeep(factures));
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
      if (!sessionSource || sessionSource.statut !== 'Ouverte') {
         return res.status(400).json({ message: "Session source invalide ou fermée" });
      }

      // Permission check: User must be owner or manager
      const user = req.session.user!;
      const isManager = ['admin', 'Administrateur', 'Chef d\'Agence'].includes(user.role);
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
      if (!sessionDest || sessionDest.statut !== 'Ouverte') {
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
}
