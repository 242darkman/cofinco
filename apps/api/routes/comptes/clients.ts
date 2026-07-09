/**
 * Routes comptes — segment /clients (partie clients).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/clients/:clientId/kyc-status
 *   GET    /api/clients/:id/portfolio
 *   GET    /api/clients/:id/can-create-compte/:type
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";
import { logger, getRequiredKycTypes } from "./shared";

export function registerClientsRoutes(app: Express) {
  /**
   * GET /api/clients/:clientId/kyc-status - Vérifie le statut KYC d'un client
   * Retourne les documents requis, présents, manquants et le statut global
   */
  /**
   * GET /api/clients/:clientId/kyc-status
   */
  app.get("/api/clients/:clientId/kyc-status", requireAuth, async (req, res) => {
    try {
      const { clientId } = req.params;

      const [client] = await db.select({
        id: clients.id,
        documents: clients.documents,
        typePiece: clients.typePiece,
      }).from(clients).where(eq(clients.id, clientId));

      if (!client) return res.status(404).json({ error: "Client non trouvé" });

      // Required document types for account activation (depends on client's typePiece)
      const requiredTypes = getRequiredKycTypes(client.typePiece);
      const recommendedTypes = ['PROOF_OF_ADDRESS'];

      // Parse documents from JSONB
      const docs: Array<{ documentType: string; status: string; documentName?: string }> = Array.isArray(client.documents)
        ? (client.documents as any[])
        : [];

      const verifiedDocs = docs.filter(d => d.status === 'verified');
      const pendingDocs = docs.filter(d => d.status === 'pending');
      const rejectedDocs = docs.filter(d => d.status === 'rejected');

      const presentTypes = new Set(docs.map(d => d.documentType));
      const verifiedTypes = new Set(verifiedDocs.map(d => d.documentType));

      const missingRequired = requiredTypes.filter(t => !presentTypes.has(t));
      const missingRecommended = recommendedTypes.filter(t => !presentTypes.has(t));
      const unverifiedRequired = requiredTypes.filter(t => presentTypes.has(t) && !verifiedTypes.has(t));

      const allRequiredVerified = requiredTypes.every(t => verifiedTypes.has(t));
      const allRequiredPresent = requiredTypes.every(t => presentTypes.has(t));

      let kycStatus: 'COMPLETE' | 'INCOMPLETE' | 'PENDING_VERIFICATION' | 'REJECTED';
      if (allRequiredVerified) {
        kycStatus = 'COMPLETE';
      } else if (rejectedDocs.some(d => requiredTypes.includes(d.documentType))) {
        kycStatus = 'REJECTED';
      } else if (allRequiredPresent) {
        kycStatus = 'PENDING_VERIFICATION';
      } else {
        kycStatus = 'INCOMPLETE';
      }

      const docTypeLabels: Record<string, string> = {
        ID_CARD_FRONT: 'Pièce d\'identité (recto)',
        ID_CARD_BACK: 'Pièce d\'identité (verso)',
        PASSPORT: 'Passeport',
        DRIVING_LICENSE: 'Permis de conduire',
        RESIDENT_CARD: 'Carte de résident',
        PROOF_OF_ADDRESS: 'Justificatif de domicile',
        CONTRACT: 'Contrat de travail',
      };

      res.json({
        clientId,
        kycStatus,
        canActivate: allRequiredPresent, // Allow if docs present (even if not yet verified)
        requiredDocuments: requiredTypes.map(type => ({
          type,
          label: docTypeLabels[type] || type,
          present: presentTypes.has(type),
          verified: verifiedTypes.has(type),
        })),
        recommendedDocuments: recommendedTypes.map(type => ({
          type,
          label: docTypeLabels[type] || type,
          present: presentTypes.has(type),
          verified: verifiedTypes.has(type),
        })),
        summary: {
          total: docs.length,
          verified: verifiedDocs.length,
          pending: pendingDocs.length,
          rejected: rejectedDocs.length,
          missingRequired: missingRequired.length,
          missingRecommended: missingRecommended.length,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Erreur KYC status');
      res.status(500).json({ error: "Erreur lors de la vérification KYC" });
    }
  });

  /**
   * GET /api/clients/:id/portfolio - Portfolio complet du client
   * Retourne: comptes, crédits, tontines, totaux
   */
  /**
   * GET /api/clients/:id/portfolio
   */
  app.get("/api/clients/:id/portfolio", requireAuth, async (req, res) => {
    try {
      const portfolio = await comptesService.getClientPortfolio(req.params.id);
      res.json(portfolio);
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting portfolio');
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // VALIDATION ENDPOINT (pour le frontend)
  // ============================================================================

  /**
   * GET /api/clients/:id/can-create-compte/:type - Vérifie si le client peut créer ce type de compte
   */
  /**
   * GET /api/clients/:id/can-create-compte/:type
   */
  app.get(
    "/api/clients/:id/can-create-compte/:type",
    requireAuth,
    async (req, res) => {
      try {
        const { id, type } = req.params;
        const validTypes = [TypeCompte.SAVINGS, TypeCompte.CURRENT, TypeCompte.BLOCKED];

        if (!(validTypes as readonly string[]).includes(type)) {
          return res.status(400).json({
            message: "Type de compte invalide",
            allowed: false,
          });
        }

        const hasExisting = await comptesService.clientHasCompteOfType(
          id,
          type as typeof TypeCompte[keyof typeof TypeCompte]
        );

        res.json({
          allowed: !hasExisting,
          reason: hasExisting
            ? `Le client possède déjà un compte ${type}`
            : null,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error checking compte eligibility');
        res.status(500).json({ message: error.message });
      }
    }
  );
}
