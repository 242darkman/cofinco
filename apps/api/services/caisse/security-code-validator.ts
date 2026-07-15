import { db } from "../../db";
import { caisseSecurityCodes, caisseUserAuthorizations, caisseCodeUsages, accessCodeUsageLogs, type CaisseSecurityCode } from "@shared/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import bcrypt from "bcrypt";

const logger = createLogger('SecurityCodeValidator');

export class SecurityCodeValidator {
  /**
   * Valide un code de sécurité et crée une autorisation
   */
  async validateCode(params: {
    code: string;
    agenceId?: string;
    caisseId?: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    action?: string;
  }) {
    const { code, agenceId, caisseId, userId, ipAddress, userAgent, action } = params;

    try {
      const conditions = [eq(caisseSecurityCodes.active, true)];

      if (caisseId) {
        conditions.push(
          sql`(${caisseSecurityCodes.caisseId} = ${caisseId} OR (${caisseSecurityCodes.caisseId} IS NULL AND ${caisseSecurityCodes.agenceId} = ${agenceId}))`
        );
      } else if (agenceId) {
        conditions.push(
          sql`(${caisseSecurityCodes.agenceId} = ${agenceId} OR ${caisseSecurityCodes.agenceId} IS NULL)`
        );
      }

      const activeCodes = await db.select()
        .from(caisseSecurityCodes)
        .where(and(...conditions));

      for (const securityCode of activeCodes) {
        const isMatch = await bcrypt.compare(code, securityCode.codeHash);
        if (!isMatch) continue;

        const now = new Date();

        if (securityCode.expiresAt && new Date(securityCode.expiresAt) < now) {
          await this.logUsage(securityCode.id, userId, action || 'VALIDATE', false, 'Code expiré', ipAddress, userAgent);
          return { success: false, error: 'Code expiré', errorCode: 'CODE_EXPIRED' };
        }

        if (securityCode.maxUsages && securityCode.usageCount! >= securityCode.maxUsages) {
          await this.logUsage(securityCode.id, userId, action || 'VALIDATE', false, 'Nombre max d\'utilisations atteint', ipAddress, userAgent);
          return { success: false, error: 'Nombre maximum d\'utilisations atteint', errorCode: 'MAX_USAGES_REACHED' };
        }

        const authExpiresAt = new Date();
        authExpiresAt.setHours(authExpiresAt.getHours() + (securityCode.authorizationDurationHours || 4));

        const [authorization] = await db.insert(caisseUserAuthorizations).values({
          userId,
          caisseId: securityCode.caisseId || caisseId || null,
          agenceId: securityCode.agenceId || agenceId || null,
          codeId: securityCode.id,
          reason: action || 'Validation code sécurité',
          expiresAt: authExpiresAt,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        }).returning();

        await db.update(caisseSecurityCodes)
          .set({ usageCount: sql`${caisseSecurityCodes.usageCount} + 1` })
          .where(eq(caisseSecurityCodes.id, securityCode.id));

        await this.logUsage(securityCode.id, userId, action || 'VALIDATE', true, undefined, ipAddress, userAgent);

        logger.info({ codeId: securityCode.id, authorizationId: authorization.id, userId, expiresAt: authExpiresAt }, 'Code validé, autorisation créée');

        return { success: true, authorization: { id: authorization.id, expiresAt: authExpiresAt } };
      }

      await this.logUsage(null, userId, action || 'VALIDATE', false, 'Code non trouvé', ipAddress, userAgent);
      return { success: false, error: 'Code invalide', errorCode: 'CODE_NOT_FOUND' };
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur validation code');
      return { success: false, error: (error as Error).message || 'Erreur lors de la validation' };
    }
  }

  /**
   * Récupère les codes actifs pour une agence/caisse
   */
  async getActiveCodes(agenceId?: string, caisseId?: string): Promise<CaisseSecurityCode[]> {
    const conditions = [eq(caisseSecurityCodes.active, true)];

    if (caisseId) {
      conditions.push(eq(caisseSecurityCodes.caisseId, caisseId));
    } else if (agenceId) {
      conditions.push(eq(caisseSecurityCodes.agenceId, agenceId));
    }

    return await db.select()
      .from(caisseSecurityCodes)
      .where(and(...conditions))
      .orderBy(desc(caisseSecurityCodes.createdAt));
  }

  /**
   * Révoque un code de sécurité
   */
  async revokeCode(codeId: string, revokedBy: string, reason?: string): Promise<boolean> {
    try {
      await db.update(caisseSecurityCodes)
        .set({ active: false })
        .where(eq(caisseSecurityCodes.id, codeId));

      await db.insert(accessCodeUsageLogs).values({
        codeId,
        usedBy: revokedBy,
        action: 'REVOKED',
        success: true,
        failureReason: reason || undefined,
      });

      logger.info({ codeId, revokedBy, reason }, 'Code révoqué');
      return true;
    } catch (error: unknown) {
      logger.error({ err: error, codeId }, 'Erreur révocation code');
      return false;
    }
  }

  private async logUsage(
    codeId: string | null,
    userId: string,
    action: string,
    success: boolean,
    failureReason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      if (codeId) {
        await db.insert(caisseCodeUsages).values({
          codeId,
          userId,
          success,
          failureReason: failureReason || null,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        });
      }

      await db.insert(accessCodeUsageLogs).values({
        codeId: codeId || '00000000-0000-0000-0000-000000000000',
        usedBy: userId,
        action,
        success,
        failureReason: failureReason || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      });
    } catch (error) {
      logger.error({ err: error }, 'Erreur logging usage code');
    }
  }
}

export const securityCodeValidator = new SecurityCodeValidator();
