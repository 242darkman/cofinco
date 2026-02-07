/**
 * RÉFÉRENCE CODE - Seeds Extraits des Migrations
 *
 * Ce fichier contient le code TypeScript extrait et implémenté dans server/seed-prod.ts
 * pour référence et documentation.
 */

// ============================================================================
// IMPORTS AJOUTÉS
// ============================================================================

import { caissesAgent } from '@shared/schema/caisse-agent';
import { agentsTerrain } from '@shared/schema/operations';

// ============================================================================
// JOURNAUX AJOUTÉS À JOURNAUX_DATA
// ============================================================================

const JOURNAUX_DATA_ADDITIONS = [
  { code: 'BNK', intitule: 'Banque', typeJournal: 'Trésorerie' },
  { code: 'TON', intitule: 'Tontines', typeJournal: 'Tontines' },
  { code: 'AN', intitule: 'À Nouveau', typeJournal: 'Reprise' },
];

// ============================================================================
// FONCTION PRINCIPALE: seedMigrationBackfills()
// ============================================================================

/**
 * Seeds extracted from migration files:
 * - 0009_coffre_fort_workflow.sql: coffres-forts et config par agence
 * - 0010_caisse_agent_workflow.sql: caisses agent pour agents terrain
 * - 0030_accounting_gl_enhancement.sql: journaux et plan comptable OHADA
 * - 0034_rbac_versions.sql: version RBAC (table non implémentée)
 */
async function seedMigrationBackfills(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Migration Backfills...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [
      { table: 'caisses (coffres)', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'configCoffreFort', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'caissesAgent', action: 'skipped', count: 1, details: 'dry-run' },
    ];
  }

  // ========================================================================
  // Migration 0009: Coffres-forts pour chaque agence
  // ========================================================================
  const allAgences = await db.select().from(agences);
  let coffresCreated = 0;

  for (const agence of allAgences) {
    // Vérifier si un coffre-fort existe déjà pour cette agence
    const [existingCoffre] = await db.select()
      .from(caisses)
      .where(and(
        eq(caisses.agenceId, agence.id),
        eq(caisses.type, 'Coffre-Fort')
      ));

    if (!existingCoffre) {
      await db.insert(caisses).values({
        nom: `Coffre-Fort ${agence.nom}`,
        agenceId: agence.id,
        type: 'Coffre-Fort',
        solde: '0',
        statut: StatutCaisse.OPEN,
      });
      coffresCreated++;
    }
  }

  if (coffresCreated > 0) {
    results.push({
      table: 'caisses (coffres)',
      action: 'created',
      count: coffresCreated,
      details: `${coffresCreated} coffres-forts créés pour les agences`
    });
  } else {
    results.push({ table: 'caisses (coffres)', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0009: Config coffre-fort par défaut pour chaque agence
  // ========================================================================
  let configsCreated = 0;

  for (const agence of allAgences) {
    const [existingConfig] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agence.id));

    if (!existingConfig) {
      await db.insert(configCoffreFort).values({
        agenceId: agence.id,
        seuilDoubleValidation: '1000000',
        separationInitiateurValideur: true,
        separationValideurExecuteur: false,
        rolesInitiateurs: ['caissier', 'chef_caisse'],
        rolesValideurs: ['chef_agence', 'superviseur'],
        rolesExecuteurs: ['caissier', 'chef_caisse', 'chef_agence'],
        billetageObligatoire: false,
        actif: true,
      });
      configsCreated++;
    }
  }

  if (configsCreated > 0) {
    results.push({
      table: 'configCoffreFort',
      action: 'created',
      count: configsCreated,
      details: `${configsCreated} configurations créées`
    });
  } else {
    results.push({ table: 'configCoffreFort', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0010: Caisse agent pour chaque agent terrain existant
  // ========================================================================
  const allAgents = await db.select()
    .from(agentsTerrain)
    .where(isNull(agentsTerrain.deletedAt));

  let caissesAgentCreated = 0;

  for (const agent of allAgents) {
    const [existingCaisseAgent] = await db.select()
      .from(caissesAgent)
      .where(and(
        eq(caissesAgent.agentId, agent.id),
        isNull(caissesAgent.deletedAt)
      ));

    if (!existingCaisseAgent) {
      await db.insert(caissesAgent).values({
        agentId: agent.id,
        soldeValide: '0',
        devise: 'XOF',
        statut: 'ACTIVE',
      });
      caissesAgentCreated++;
    }
  }

  if (caissesAgentCreated > 0) {
    results.push({
      table: 'caissesAgent',
      action: 'created',
      count: caissesAgentCreated,
      details: `${caissesAgentCreated} caisses agent créées`
    });
  } else {
    results.push({ table: 'caissesAgent', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0030: Journaux et Plan Comptable OHADA
  // Note: Ces données sont déjà dans JOURNAUX_DATA et PLAN_COMPTABLE_DATA
  // qui sont seedés par seedAccountingBootstrap()
  // ========================================================================

  // ========================================================================
  // Migration 0034: RBAC Versions
  // Note: Table rbac_versions n'existe pas encore dans le schema TypeScript
  // TODO: Créer le schema et ajouter le seed quand la table sera créée
  // ========================================================================

  return results;
}

// ============================================================================
// APPEL DANS seedProd() - À ajouter après seedNotificationSystem
// ============================================================================

/*
// Migration Backfills (coffres, caisses agent, etc.)
const backfillResults = await seedMigrationBackfills(report.context, DRY_RUN);
report.steps.push(...backfillResults);
*/

// ============================================================================
// TODO: SEED RBAC VERSIONS (une fois le schema créé)
// ============================================================================

/**
 * Schema à créer dans shared/schema/auth.ts ou nouveau fichier:
 *
 * export const rbacVersions = pgTable('rbac_versions', {
 *   id: text('id').primaryKey().default('global'),
 *   version: bigint('version', { mode: 'number' }).notNull().default(1),
 *   lastChangeType: text('last_change_type'),
 *   lastChangeEntity: text('last_change_entity'),
 *   lastChangeDetail: jsonb('last_change_detail'),
 *   updatedAt: timestamp('updated_at').notNull().defaultNow(),
 * });
 *
 * Puis ajouter dans seedMigrationBackfills():
 *
 * // RBAC Versions (singleton)
 * const [existingVersion] = await db.select()
 *   .from(rbacVersions)
 *   .where(eq(rbacVersions.id, 'global'));
 *
 * if (!existingVersion) {
 *   await db.insert(rbacVersions).values({
 *     id: 'global',
 *     version: 1,
 *   });
 *   results.push({ table: 'rbacVersions', action: 'created', count: 1 });
 * } else {
 *   results.push({ table: 'rbacVersions', action: 'skipped', count: 0, details: 'exists' });
 * }
 */

// ============================================================================
// MAPPING SQL → TypeScript
// ============================================================================

/*
Migration 0009 - Ligne 193-207:
SQL:
  INSERT INTO caisses (id, nom, agence_id, type, solde, statut, created_at, updated_at)
  SELECT gen_random_uuid(), 'Coffre-Fort ' || a.nom, a.id, 'Coffre-Fort', '0', 'Ouverte', NOW(), NOW()
  FROM agences a
  WHERE NOT EXISTS (SELECT 1 FROM caisses c WHERE c.agence_id = a.id AND c.type = 'Coffre-Fort');

TypeScript:
  for (const agence of allAgences) {
    const [existingCoffre] = await db.select()
      .from(caisses)
      .where(and(eq(caisses.agenceId, agence.id), eq(caisses.type, 'Coffre-Fort')));

    if (!existingCoffre) {
      await db.insert(caisses).values({
        nom: `Coffre-Fort ${agence.nom}`,
        agenceId: agence.id,
        type: 'Coffre-Fort',
        solde: '0',
        statut: StatutCaisse.OPEN,
      });
    }
  }

---

Migration 0009 - Ligne 210-214:
SQL:
  INSERT INTO config_coffre_fort (agence_id)
  SELECT id FROM agences a
  WHERE NOT EXISTS (SELECT 1 FROM config_coffre_fort c WHERE c.agence_id = a.id);

TypeScript:
  for (const agence of allAgences) {
    const [existingConfig] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agence.id));

    if (!existingConfig) {
      await db.insert(configCoffreFort).values({
        agenceId: agence.id,
        seuilDoubleValidation: '1000000',
        separationInitiateurValideur: true,
        // ... autres valeurs par défaut
      });
    }
  }

---

Migration 0010 - Ligne 266-278:
SQL:
  INSERT INTO caisses_agent (agent_id, solde_valide, devise, statut, created_at, updated_at)
  SELECT id, '0', 'XOF', 'Active', NOW(), NOW()
  FROM agents_terrain
  WHERE deleted_at IS NULL
  AND id NOT IN (SELECT agent_id FROM caisses_agent WHERE deleted_at IS NULL);

TypeScript:
  const allAgents = await db.select()
    .from(agentsTerrain)
    .where(isNull(agentsTerrain.deletedAt));

  for (const agent of allAgents) {
    const [existingCaisseAgent] = await db.select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, agent.id), isNull(caissesAgent.deletedAt)));

    if (!existingCaisseAgent) {
      await db.insert(caissesAgent).values({
        agentId: agent.id,
        soldeValide: '0',
        devise: 'XOF',
        statut: 'ACTIVE',
      });
    }
  }

---

Migration 0030 - Ligne 235-246:
SQL:
  INSERT INTO "journaux_comptables" ("code", "intitule", "type_journal", "actif")
  VALUES
    ('CAI', 'Caisse Espèces', 'Trésorerie', true),
    ('BNK', 'Banque', 'Trésorerie', true),
    ('TON', 'Tontines', 'Général', true),
    ('AN', 'À Nouveau', 'Général', true)
  ON CONFLICT (code) DO UPDATE SET intitule = EXCLUDED.intitule;

TypeScript:
  Ajouté directement dans JOURNAUX_DATA:
  { code: 'BNK', intitule: 'Banque', typeJournal: 'Trésorerie' },
  { code: 'TON', intitule: 'Tontines', typeJournal: 'Tontines' },
  { code: 'AN', intitule: 'À Nouveau', typeJournal: 'Reprise' },

  Les INSERT sont gérés par seedAccountingBootstrap() avec upsert.

---

Migration 0034 - Ligne 15-17:
SQL:
  INSERT INTO rbac_versions (id, version, updated_at)
  VALUES ('global', 1, NOW())
  ON CONFLICT (id) DO NOTHING;

TypeScript (TODO - nécessite création du schema):
  const [existingVersion] = await db.select()
    .from(rbacVersions)
    .where(eq(rbacVersions.id, 'global'));

  if (!existingVersion) {
    await db.insert(rbacVersions).values({
      id: 'global',
      version: 1,
    });
  }
*/
