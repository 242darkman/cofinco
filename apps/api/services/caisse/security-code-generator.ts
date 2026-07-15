import { db } from "../../db";
import { caisseSecurityCodes } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import bcrypt from "bcrypt";
import crypto from "crypto";
import type { GenerateCodeParams, GenerateCodeResult } from "./security-code-types";
import { securityCodePolicy } from "./security-code-policy";

const logger = createLogger('SecurityCodeGenerator');

export class SecurityCodeGenerator {
  /**
   * Génère un nouveau code de sécurité
   */
  async generateCode(params: GenerateCodeParams): Promise<GenerateCodeResult> {
    const {
      agenceId,
      caisseId,
      codeType,
      createdBy,
      description,
      maxUsages,
      expiresInHours,
      authorizationDurationHours = 4,
      assignedToUserId,
    } = params;

    try {
      const plainCode = this.generateRandomCode();
      const codeHash = await bcrypt.hash(plainCode, 10);

      let expiresAt: Date | null = null;
      if (expiresInHours) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);
      } else {
        const policy = await securityCodePolicy.getRotationPolicy(agenceId);
        if (policy && policy.rotationFrequencyDays) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + policy.rotationFrequencyDays);
        } else {
          if (codeType !== 'PERMANENT') {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
          }
        }
      }

      const [newCode] = await db.insert(caisseSecurityCodes).values({
        agenceId: agenceId || null,
        caisseId: caisseId || null,
        codeType,
        codeHash,
        active: true,
        expiresAt,
        maxUsages: maxUsages || null,
        usageCount: 0,
        authorizationDurationHours,
        createdBy,
        description,
        agentId: assignedToUserId || null,
      }).returning();

      logger.info({
        codeId: newCode.id,
        codeType,
        agenceId,
        caisseId,
        expiresAt,
        createdBy,
      }, 'Code de sécurité généré');

      return {
        success: true,
        code: plainCode,
        codeId: newCode.id,
        expiresAt: expiresAt || undefined,
      };
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur génération code sécurité');
      return {
        success: false,
        error: (error as Error).message || 'Erreur lors de la génération du code',
      };
    }
  }

  private generateRandomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return code;
  }
}

export const securityCodeGenerator = new SecurityCodeGenerator();
