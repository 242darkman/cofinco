/**
 * AgentGlProvisioningService - Auto-provisioning de sous-comptes GL par agent
 *
 * Chaque agent terrain reçoit un sous-compte GL unique sous le parent 573
 * (Caisse agents terrain). Format: 573{codeAgence}{séquence} ex: 573BZV001
 *
 * Utilise glSequences pour la génération anti-collision des numéros.
 * Mode A (recommandé) : un sous-compte GL par agence de rattachement.
 */

import { db } from "../../db";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  agentsTerrain,
  agentAgencyHistory,
  planComptable,
  glSequences,
  agences,
  employes,
  users,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";

const logger = createLogger('AgentGlProvisioning');

/** Parent account for all agent sub-accounts */
const AGENT_GL_PARENT = "573";
/** Conventional key in glSequences (not a real journal code) */
const AGENT_GL_SEQUENCE_KEY = "AGENT_GL";
/** Year value for agent GL sequences (not year-scoped) */
const AGENT_GL_SEQUENCE_YEAR = 0;

export interface GlProvisioningResult {
  glAccountId: string;
  glAccountNumber: string;
  isNew: boolean;
}

export class AgentGlProvisioningService {
  /**
   * Provisions (or returns existing) GL sub-account for an agent at a specific agency.
   *
   * Steps:
   * 1. Check if agent already has a GL account at this agency (via agentAgencyHistory)
   * 2. If not, generate next sequence number using glSequences
   * 3. Create planComptable entry
   * 4. Update agentsTerrain.currentGlAccountId and currentAgenceId
   * 5. Create agentAgencyHistory record
   *
   * @param tx - Database transaction (required for atomicity)
   * @param agentId - The field agent ID
   * @param agenceId - The agency to provision for
   */
  async provisionOrGetGlAccount(
    tx: PgTransaction<any, any, any>,
    agentId: string,
    agenceId: string,
  ): Promise<GlProvisioningResult> {
    // 1. Check existing assignment with GL account for this agency
    const [existing] = await tx
      .select({
        glAccountId: agentAgencyHistory.glAccountId,
        glAccountNumber: agentAgencyHistory.glAccountNumber,
      })
      .from(agentAgencyHistory)
      .where(
        and(
          eq(agentAgencyHistory.agentId, agentId),
          eq(agentAgencyHistory.agenceId, agenceId),
          isNull(agentAgencyHistory.dateTo),
        ),
      )
      .limit(1);

    if (existing?.glAccountId && existing.glAccountNumber) {
      // Already provisioned — ensure agentsTerrain is in sync
      await tx
        .update(agentsTerrain)
        .set({
          currentGlAccountId: existing.glAccountId,
          currentAgenceId: agenceId,
          updatedAt: new Date(),
        })
        .where(eq(agentsTerrain.id, agentId));

      return {
        glAccountId: existing.glAccountId,
        glAccountNumber: existing.glAccountNumber,
        isNew: false,
      };
    }

    // 2. Get agency code for GL account number
    const [agency] = await tx
      .select({ codeAgence: agences.codeAgence, nom: agences.nom })
      .from(agences)
      .where(eq(agences.id, agenceId))
      .limit(1);

    if (!agency) {
      throw new Error(`Agency not found: ${agenceId}`);
    }

    // Get agent name for GL account label
    const agentName = await this.getAgentDisplayName(tx, agentId);

    // 3. Generate next sequence number (atomic via INSERT ON CONFLICT)
    const agencyCode = agency.codeAgence.substring(0, 3).toUpperCase();

    const [seq] = await tx
      .insert(glSequences)
      .values({
        agenceId,
        journalCode: AGENT_GL_SEQUENCE_KEY,
        year: AGENT_GL_SEQUENCE_YEAR,
        lastNumber: 1,
      })
      .onConflictDoUpdate({
        target: [glSequences.agenceId, glSequences.journalCode, glSequences.year],
        set: {
          lastNumber: sql`${glSequences.lastNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    // 4. Create GL account in plan comptable
    const glAccountNumber = `${AGENT_GL_PARENT}${agencyCode}${String(seq.lastNumber).padStart(3, "0")}`;

    const [glAccount] = await tx
      .insert(planComptable)
      .values({
        numeroCompte: glAccountNumber,
        intitule: `Caisse Agent ${agentName} - ${agency.nom}`,
        classe: 5,
        typeCompte: "Actif",
        sensNormal: "Débit",
        niveau: 3,
        parentCompte: AGENT_GL_PARENT,
        actif: true,
        isSystem: true,
        agenceId,
      })
      .returning();

    logger.info(
      { agentId, agenceId, glAccountNumber, glAccountId: glAccount.id },
      'GL sub-account provisioned for agent',
    );

    // 5. Update agentsTerrain
    await tx
      .update(agentsTerrain)
      .set({
        currentGlAccountId: glAccount.id,
        currentAgenceId: agenceId,
        updatedAt: new Date(),
      })
      .where(eq(agentsTerrain.id, agentId));

    // 6. Close any previous assignment for this agent (if any)
    await tx
      .update(agentAgencyHistory)
      .set({ dateTo: new Date() })
      .where(
        and(
          eq(agentAgencyHistory.agentId, agentId),
          isNull(agentAgencyHistory.dateTo),
        ),
      );

    // 7. Create new agency history record
    await tx.insert(agentAgencyHistory).values({
      agentId,
      agenceId,
      glAccountId: glAccount.id,
      glAccountNumber,
      reason: "Initial",
    });

    return {
      glAccountId: glAccount.id,
      glAccountNumber,
      isNew: true,
    };
  }

  /**
   * Get agent's current GL account for a given agency.
   * Returns null if no account exists.
   */
  async getGlAccountForAgency(
    agentId: string,
    agenceId: string,
  ): Promise<{ glAccountId: string; glAccountNumber: string } | null> {
    const [result] = await db
      .select({
        glAccountId: agentAgencyHistory.glAccountId,
        glAccountNumber: agentAgencyHistory.glAccountNumber,
      })
      .from(agentAgencyHistory)
      .where(
        and(
          eq(agentAgencyHistory.agentId, agentId),
          eq(agentAgencyHistory.agenceId, agenceId),
          isNull(agentAgencyHistory.dateTo),
        ),
      )
      .limit(1);

    if (!result?.glAccountId || !result.glAccountNumber) return null;
    return { glAccountId: result.glAccountId, glAccountNumber: result.glAccountNumber };
  }

  /**
   * Get agent display name for GL account label.
   */
  private async getAgentDisplayName(
    tx: PgTransaction<any, any, any>,
    agentId: string,
  ): Promise<string> {
    const [result] = await tx
      .select({
        nom: users.nom,
        prenom: users.prenom,
      })
      .from(agentsTerrain)
      .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
      .innerJoin(users, eq(employes.userId, users.id))
      .where(eq(agentsTerrain.id, agentId))
      .limit(1);

    if (!result) return "Agent";
    return [result.prenom, result.nom].filter(Boolean).join(" ") || "Agent";
  }
}

export const agentGlProvisioningService = new AgentGlProvisioningService();
