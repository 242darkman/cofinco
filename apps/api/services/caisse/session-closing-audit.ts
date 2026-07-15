import {
  mouvementsFinanciers,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { createMouvementFinancier } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { createLogger } from "../../lib/logger";
import type { DbTransaction } from "./types";

const logger = createLogger('SessionClosingAudit');

export async function recordEcartAudit(
  tx: DbTransaction,
  params: {
    sessionId: string;
    caissierId: string;
    agenceId?: string;
    soldeTheorique: number;
    montantPhysique: number;
    ecart: number;
    justification: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  // Créer une entrée dans la table d'audit des écarts
  // Note: La table ecarts_caisse_audit doit exister (créée dans la migration)
  try {
    await tx.execute(sql`
      INSERT INTO ecarts_caisse_audit (
        session_id, caissier_id, agence_id,
        solde_theorique, montant_physique, ecart,
        justification, type_ecart, ip_address, user_agent
      ) VALUES (
        ${params.sessionId}, ${params.caissierId}, ${params.agenceId},
        ${params.soldeTheorique}, ${params.montantPhysique}, ${params.ecart},
        ${params.justification}, ${params.ecart > 0 ? "SURPLUS" : "DEFICIT"},
        ${params.ipAddress}, ${params.userAgent}
      )
    `);
  } catch (error) {
    logger.warn({ err: error }, 'Ecart audit recording failed (table may not exist)');
    // Ne pas bloquer le processus si la table d'audit n'existe pas encore
  }
}

export async function createEcartComptable(
  tx: DbTransaction,
  params: {
    sessionId: string;
    caissierId: string;
    agenceId: string;
    caisseId: string;
    ecart: number;
    justification: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  const { sessionId, caissierId, agenceId, caisseId, ecart, justification } = params;

  // Déterminer le type d'écriture (produit ou charge exceptionnelle)
  const isExcedent = ecart > 0;
  const montantAbsolu = Math.abs(ecart);

  try {
    // Créer le mouvement financier pour l'écart de caisse
    const typePaiement = isExcedent ? "SESSION_SURPLUS" : "SESSION_DEFICIT";
    const mouvement = await createMouvementFinancier(
      tx,
      {
        agenceId,
        sens: isExcedent ? "CREDIT" : "DEBIT",
        montant: montantAbsolu.toString(),
        sourceModule: "CAISSE",
        typePaiement,
        requiresGlPosting: true,
        metadata: {
          ecart,
          justification,
          type: isExcedent ? "EXCEDENT_CAISSE" : "DEFICIT_CAISSE",
          sessionId,
          caisseId,
        },
      },
      caissierId
    );

    // GL posting — write the accounting entry for this écart
    if (agenceId) {
      try {
        const glResult = await postGlForMouvement(tx, mouvement, agenceId, caissierId, {
          sessionId,
          caisseId,
          ecart,
          direction: isExcedent ? "SURPLUS" : "DEFICIT",
        });
        if (glResult) {
          await tx.update(mouvementsFinanciers)
            .set({ glPostingStatus: "POSTED", glPostingError: null })
            .where(eq(mouvementsFinanciers.id, mouvement.id));
        }
      } catch (glError: unknown) {
        const message = glError instanceof Error ? glError.message : "Unknown GL error";
        logger.error({ mouvementId: mouvement.id, error: message }, 'GL posting failed for ecart mouvement');
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "FAILED", glPostingError: message })
          .where(eq(mouvementsFinanciers.id, mouvement.id));
        // Don't rethrow — closing should still succeed even if GL posting fails
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Ecart comptable creation failed');
    // Ne pas bloquer le processus, mais logger l'erreur
  }
}
