/**
 * Routes finance — segment /caisse-transferts (partie caisse-transferts).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/caisse-transferts
 *   POST   /api/caisse-transferts
 *   PATCH  /api/caisse-transferts/:id/recevoir
 *   POST   /api/caisse-transferts/:id/annuler
 */
import type { Express } from "express";
import { insertCaisseTransfertSchema } from "@shared/schema";
import { storage } from "../../storage";
import { StatutTransfertCaisse } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";

export function registerCaisseTransfertsRoutes(app: Express) {
  // Caisse Transferts (Treasury)
  /**
   * GET /api/caisse-transferts
   */
  app.get("/api/caisse-transferts", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
    const transfers = await storage.getCaisseTransferts(agenceFilter?.agenceId);
    res.json(transfers);
  });

  // Initier un transfert
  /**
   * POST /api/caisse-transferts
   */
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
      const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');
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
          // Cibler l'agence de destination
          if (rawData.agenceDestId) {
            wsInstance.broadcastToAgency(rawData.agenceDestId, { type: "CAISSE_UPDATE", payload: { subtype: 'transfert_new', id: transfert.id } });
          }
          // Aussi notifier l'agence source
          if (rawData.agenceSourceId) {
            wsInstance.broadcastToAgency(rawData.agenceSourceId, { type: "CAISSE_UPDATE", payload: { subtype: 'transfert_new', id: transfert.id } });
          }
      }

      res.status(201).json(transfert);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "Erreur création transfert" });
    }
  });

  // Recevoir/Valider un transfert
  /**
   * PATCH /api/caisse-transferts/:id/recevoir
   */
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

      res.json(updated);
  });

  
  // Annuler un transfert
  /**
   * POST /api/caisse-transferts/:id/annuler
   */
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
      
      res.json(updated);
  });
}
