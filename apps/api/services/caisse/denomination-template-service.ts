import { db } from "../../db";
import { denominationTemplates } from "@shared/schema/finance";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { DENOMINATION_VALUES } from "@shared/config/denomination-weights";

const logger = createLogger('DenominationTemplateService');

export class DenominationTemplateService {
  /**
   * Récupère les templates de billetage fréquemment utilisés
   */
  async getFrequentTemplates(agenceId?: string, caisseId?: string): Promise<{
    id: string;
    nom: string;
    billetage: Record<string, number>;
    totalCalcule: number;
    usageCount: number;
  }[]> {
    const conditions = [];
    if (caisseId) conditions.push(eq(denominationTemplates.caisseId, caisseId));
    else if (agenceId) conditions.push(eq(denominationTemplates.agenceId, agenceId));

    const templates = await db.select({
      id: denominationTemplates.id,
      nom: denominationTemplates.nom,
      billetage: denominationTemplates.billetage,
      totalCalcule: denominationTemplates.totalCalcule,
      usageCount: denominationTemplates.usageCount,
    })
    .from(denominationTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(denominationTemplates.usageCount))
    .limit(5);

    return templates.map(t => ({
      id: t.id,
      nom: t.nom,
      billetage: t.billetage as Record<string, number>,
      totalCalcule: Number(t.totalCalcule),
      usageCount: t.usageCount || 0,
    }));
  }

  /**
   * Sauvegarde un template de billetage personnalisé
   */
  async saveTemplate(params: {
    nom: string;
    description?: string;
    billetage: Record<string, number>;
    agenceId?: string;
    caisseId?: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const totalCalcule = Object.entries(params.billetage).reduce((sum, [denom, count]) => {
      return sum + (DENOMINATION_VALUES[denom] || 0) * count;
    }, 0);

    const [template] = await db.insert(denominationTemplates).values({
      nom: params.nom,
      description: params.description,
      agenceId: params.agenceId || null,
      caisseId: params.caisseId || null,
      billetage: params.billetage,
      totalCalcule: totalCalcule.toString(),
      typeTemplate: 'CUSTOM',
      createdBy: params.createdBy,
    }).returning({ id: denominationTemplates.id });

    logger.info({ templateId: template.id, nom: params.nom }, 'Template billetage sauvegardé');

    return template;
  }
}

export const denominationTemplateService = new DenominationTemplateService();
