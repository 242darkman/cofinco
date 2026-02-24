/**
 * Tests — Agency Migration Service
 *
 * Vérifie:
 * - Structure & guards: coffre-guards, advisory locks, snapshotBefore
 * - Pre-flight checks: all check types are registered
 * - Entity coverage: all entity types are migrated
 * - Rollback: method exists and uses reverse operations
 * - WebSocket: broadcasts are emitted
 * - Reset endpoint: production guard, transaction, no FK bypass
 * - Security regression: no session_replication_role, no raw balance arithmetic
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../..");
const read = (relPath: string) => readFileSync(join(ROOT, relPath), "utf-8");

const migrationService = read("server/services/agency-migration.ts");
const settingsRoute = read("server/routes/settings.ts");
const agencesRoute = read("server/routes/agences.ts");
const wsServer = read("server/ws-server.ts");
const migrationSchema = read("shared/schema/agency_migration.ts");

// ============================================================================
// MIGRATION SERVICE — Treasury Security (Requirement B)
// ============================================================================

describe("Migration Treasury Security", () => {

  it("should import coffre-guard functions", () => {
    expect(migrationService).toContain("assertCoffreCanDebit");
    expect(migrationService).toContain("assertCoffreCanCredit");
    expect(migrationService).toContain("updateCoffreBalance");
    expect(migrationService).toContain("GuardContext");
  });

  it("should use assertCoffreCanDebit for source coffre in treasury transfer", () => {
    expect(migrationService).toContain("assertCoffreCanDebit(");
    // Verify it's used with source coffre
    expect(migrationService).toContain("assertCoffreCanDebit(\n              tx, sourceCoffre.id, amount, guardCtx");
  });

  it("should use assertCoffreCanCredit for target coffre in treasury transfer", () => {
    expect(migrationService).toContain("assertCoffreCanCredit(");
  });

  it("should use updateCoffreBalance for atomic balance updates", () => {
    const debitMatch = migrationService.match(/updateCoffreBalance\(tx,\s*sourceCoffre\.id,\s*-amount\)/);
    const creditMatch = migrationService.match(/updateCoffreBalance\(tx,\s*targetCoffre\.id,\s*\+amount\)/);
    expect(debitMatch).not.toBeNull();
    expect(creditMatch).not.toBeNull();
  });

  it("should create BOTH debit and credit mouvement financier entries", () => {
    // Count DEBIT and CREDIT mouvements in treasury section
    const debitMouvement = migrationService.includes('sens: "DEBIT"');
    const creditMouvement = migrationService.includes('sens: "CREDIT"');
    expect(debitMouvement).toBe(true);
    expect(creditMouvement).toBe(true);
  });

  it("should NOT contain raw SQL balance updates (parseFloat + set solde pattern)", () => {
    // The old pattern was: parseFloat(coffre.solde) + amount then .set({ solde: ... })
    const dangerousPattern = /\.set\(\{[^}]*solde:\s*(?:newSolde|nouveauSolde|amount|sourceAfterSolde)/;
    const hasDangerousPattern = dangerousPattern.test(migrationService);
    expect(hasDangerousPattern).toBe(false);
  });
});

// ============================================================================
// MIGRATION SERVICE — Advisory Lock & Concurrency (Requirement B+)
// ============================================================================

describe("Migration Concurrency", () => {

  it("should use pg_advisory_xact_lock in processMigration", () => {
    expect(migrationService).toContain("pg_advisory_xact_lock(hashtext(");
  });

  it("should check for concurrent migrations on the same agency", () => {
    expect(migrationService).toContain("CONCURRENT_MIGRATION");
  });
});

// ============================================================================
// MIGRATION SERVICE — Entity Coverage (Requirement C)
// ============================================================================

describe("Migration Entity Coverage", () => {

  it("should define all MIGRATION_ENTITY_TYPE constants", () => {
    const entityTypes = [
      "CLIENT", "COMPTE", "CREDIT", "DEMANDE_CREDIT", "TONTINE",
      "EMPLOYE", "MOUVEMENT_FINANCIER", "SESSION_CAISSE",
      "DOSSIER_CREDIT", "TRANSFERT_COFFRE_CAISSE",
      "VIREMENT_PROGRAMME", "MEMBRE_TONTINE", "CONTRIBUTION_TONTINE",
      "TONTINE_CYCLE", "TONTINE_TURN", "TONTINE_SCHEDULE",
      "TREASURY_TRANSFER",
    ];

    for (const type of entityTypes) {
      expect(migrationSchema).toContain(`${type}: "${type}"`);
    }
  });

  it("should use MIGRATION_ENTITY_TYPE constants (not hardcoded strings)", () => {
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.CLIENT");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.COMPTE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.CREDIT");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TONTINE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.EMPLOYE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TREASURY_TRANSFER");
  });

  it("should migrate tontine sub-tables", () => {
    // membresTontine has no agenceId — it follows parent tontine via FK, so not in sub-tables
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.CONTRIBUTION_TONTINE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TONTINE_CYCLE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TONTINE_TURN");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TONTINE_SCHEDULE");
  });

  it("should migrate financial entity types", () => {
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.MOUVEMENT_FINANCIER");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.SESSION_CAISSE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.TRANSFERT_COFFRE_CAISSE");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.VIREMENT_PROGRAMME");
    expect(migrationService).toContain("MIGRATION_ENTITY_TYPE.DOSSIER_CREDIT");
  });

  it("should have batchInsertEntityLogs helper for efficient batch inserts", () => {
    expect(migrationService).toContain("batchInsertEntityLogs");
    // Verify it batches in chunks
    expect(migrationService).toContain("batchSize");
    expect(migrationService).toContain("slice(i, i + batchSize)");
  });
});

// ============================================================================
// MIGRATION SERVICE — snapshotBefore (Requirement A prereq)
// ============================================================================

describe("Migration snapshotBefore", () => {

  it("should include snapshotBefore in entity logs", () => {
    expect(migrationService).toContain("snapshotBefore");
    // snapshotBefore should be in the batch insert method
    expect(migrationService).toContain("snapshotBefore: snapshotFn(e)");
  });

  it("should capture client snapshot fields", () => {
    // Client snapshot should include identity fields
    expect(migrationService).toContain("nom: c.nom");
    expect(migrationService).toContain("prenom: c.prenom");
    expect(migrationService).toContain("email: c.email");
  });

  it("should capture compte snapshot fields", () => {
    expect(migrationService).toContain("numeroCompte: c.numeroCompte");
    expect(migrationService).toContain("typeCompte: c.typeCompte");
    expect(migrationService).toContain("soldeCourant: c.soldeCourant");
  });

  it("should capture treasury transfer snapshot", () => {
    expect(migrationService).toContain("sourceCoffreId: sourceCoffre.id");
    expect(migrationService).toContain("targetCoffreId: targetCoffre.id");
    expect(migrationService).toContain("sourceSoldeBefore: sourceBeforeSolde");
    expect(migrationService).toContain("targetSoldeBefore: targetBeforeSolde");
  });
});

// ============================================================================
// MIGRATION SERVICE — Pre-Flight Checks (Requirement D)
// ============================================================================

describe("Migration Pre-Flight Checks", () => {

  it("should register all check types", () => {
    expect(migrationService).toContain('"OPEN_SESSIONS"');
    expect(migrationService).toContain('"PENDING_TRANSFERS"');
    expect(migrationService).toContain('"DATA_INTEGRITY"');
    expect(migrationService).toContain('"ACTIVE_OPERATIONS"');
    expect(migrationService).toContain('"BALANCE_VERIFICATION"');
    expect(migrationService).toContain('"TREASURY_RULES"');
  });

  it("checkDataIntegrity should detect duplicate emails", () => {
    expect(migrationService).toContain("DUPLICATE_EMAILS");
  });

  it("checkDataIntegrity should detect duplicate phones", () => {
    expect(migrationService).toContain("DUPLICATE_PHONES");
  });

  it("checkDataIntegrity should detect duplicate account numbers", () => {
    expect(migrationService).toContain("DUPLICATE_NUMERO_COMPTE");
  });

  it("checkDataIntegrity should check target agencies exist and are active", () => {
    expect(migrationService).toContain("MISSING_TARGET_AGENCY");
    expect(migrationService).toContain("INACTIVE_TARGET_AGENCY");
  });

  it("checkDataIntegrity should check target coffre exists", () => {
    expect(migrationService).toContain("MISSING_TARGET_COFFRE");
    expect(migrationService).toContain("INACTIVE_TARGET_COFFRE");
  });

  it("checkDataIntegrity should detect orphan clients (FK integrity)", () => {
    expect(migrationService).toContain("ORPHAN_CLIENTS");
  });

  it("checkBalanceVerification should compare DB solde vs calculated solde", () => {
    expect(migrationService).toContain("checkBalanceVerification");
    expect(migrationService).toContain("soldeDb");
    expect(migrationService).toContain("soldeCalculated");
  });

  it("checkActiveOperations should detect credits in disbursement", () => {
    expect(migrationService).toContain("checkActiveOperations");
    expect(migrationService).toContain("WAITING_DISBURSEMENT");
  });

  it("checkTreasuryRules should verify plafond journalier", () => {
    expect(migrationService).toContain("checkTreasuryRules");
    expect(migrationService).toContain("plafondJournalierEntrant");
    expect(migrationService).toContain("plafondJournalierSortant");
  });

  it("DATA_INTEGRITY and ACTIVE_OPERATIONS should be blocking", () => {
    // Verify the checks array marks them as blocking
    const dataIntegrityLine = migrationService.match(/type:\s*"DATA_INTEGRITY"[\s\S]*?blocking:\s*true/);
    const activeOpsLine = migrationService.match(/type:\s*"ACTIVE_OPERATIONS"[\s\S]*?blocking:\s*true/);
    expect(dataIntegrityLine).not.toBeNull();
    expect(activeOpsLine).not.toBeNull();
  });

  it("BALANCE_VERIFICATION and TREASURY_RULES should be non-blocking (warnings)", () => {
    const balanceLine = migrationService.match(/type:\s*"BALANCE_VERIFICATION"[\s\S]*?blocking:\s*false/);
    const treasuryLine = migrationService.match(/type:\s*"TREASURY_RULES"[\s\S]*?blocking:\s*false/);
    expect(balanceLine).not.toBeNull();
    expect(treasuryLine).not.toBeNull();
  });
});

// ============================================================================
// MIGRATION SERVICE — Rollback (Requirement A)
// ============================================================================

describe("Migration Rollback", () => {

  it("should have rollbackMigration method", () => {
    expect(migrationService).toContain("async rollbackMigration(");
  });

  it("should verify migration status is COMPLETED before rollback", () => {
    expect(migrationService).toContain("MIGRATION_STATUS.COMPLETED");
    expect(migrationService).toContain("INVALID_STATUS");
  });

  it("should enforce 24h rollback window", () => {
    expect(migrationService).toContain("ROLLBACK_EXPIRED");
    expect(migrationService).toContain("hoursSinceCompletion");
  });

  it("should use advisory lock in rollback transaction", () => {
    // Rollback should also acquire advisory lock
    const rollbackSection = migrationService.slice(
      migrationService.indexOf("async rollbackMigration("),
      migrationService.indexOf("// MÉTHODES UTILITAIRES")
    );
    expect(rollbackSection).toContain("pg_advisory_xact_lock");
  });

  it("should reverse treasury with coffre-guards", () => {
    const rollbackSection = migrationService.slice(
      migrationService.indexOf("async rollbackMigration("),
      migrationService.indexOf("// MÉTHODES UTILITAIRES")
    );
    expect(rollbackSection).toContain("assertCoffreCanDebit");
    expect(rollbackSection).toContain("assertCoffreCanCredit");
    expect(rollbackSection).toContain("updateCoffreBalance");
  });

  it("should create reverse mouvement entries on rollback", () => {
    expect(migrationService).toContain("MIGRATION_ROLLBACK");
    expect(migrationService).toContain("originalReference");
  });

  it("should reverse entities in correct FK-safe order", () => {
    const rollbackSection = migrationService.slice(
      migrationService.indexOf("async rollbackMigration("),
      migrationService.indexOf("// MÉTHODES UTILITAIRES")
    );
    // Should have reverseOrder array with children before parents
    expect(rollbackSection).toContain("reverseOrder");
    // CLIENT should be after COMPTE in the reverse order
    const clientIdx = rollbackSection.indexOf("MIGRATION_ENTITY_TYPE.CLIENT,");
    const compteIdx = rollbackSection.indexOf("MIGRATION_ENTITY_TYPE.COMPTE,");
    expect(compteIdx).toBeLessThan(clientIdx);
  });

  it("should restore source agency to ACTIVE after rollback", () => {
    const rollbackSection = migrationService.slice(
      migrationService.indexOf("async rollbackMigration("),
      migrationService.indexOf("// MÉTHODES UTILITAIRES")
    );
    expect(rollbackSection).toContain("AGENCY_MIGRATION_MODE.ACTIVE");
  });

  it("should set migration status to ROLLED_BACK", () => {
    const rollbackSection = migrationService.slice(
      migrationService.indexOf("async rollbackMigration("),
      migrationService.indexOf("// MÉTHODES UTILITAIRES")
    );
    expect(rollbackSection).toContain("MIGRATION_STATUS.ROLLED_BACK");
  });
});

// ============================================================================
// ROUTES — Rollback Route
// ============================================================================

describe("Rollback Route", () => {

  it("should have POST rollback endpoint", () => {
    expect(agencesRoute).toContain("/api/agences/migrations/:id/rollback");
    expect(agencesRoute).toContain("rollbackMigration");
  });

  it("should require MANAGE ability on rollback route", () => {
    // The route definition is on a single line — extract the full line
    const rollbackIdx = agencesRoute.indexOf("migrations/:id/rollback");
    const routeBlock = agencesRoute.slice(rollbackIdx, rollbackIdx + 200);
    expect(routeBlock).toContain("requireAbility");
  });

  it("should handle MigrationError with appropriate HTTP status codes", () => {
    const rollbackRouteSection = agencesRoute.slice(
      agencesRoute.indexOf("migrations/:id/rollback"),
      agencesRoute.indexOf("migrations/:id/rollback") + 1600
    );
    expect(rollbackRouteSection).toContain("ROLLBACK_EXPIRED");
    expect(rollbackRouteSection).toContain("410");
  });
});

// ============================================================================
// WEBSOCKET — Migration Events (Requirement F)
// ============================================================================

describe("WebSocket Migration Events", () => {

  it("should define MIGRATION_PROGRESS and MIGRATION_STATUS message types", () => {
    expect(wsServer).toContain('"MIGRATION_PROGRESS"');
    expect(wsServer).toContain('"MIGRATION_STATUS"');
  });

  it("migration service should import getWsInstance", () => {
    expect(migrationService).toContain('import { getWsInstance }');
  });

  it("should have broadcastMigrationProgress helper", () => {
    expect(migrationService).toContain("broadcastMigrationProgress(");
  });

  it("should have broadcastMigrationStatus helper", () => {
    expect(migrationService).toContain("broadcastMigrationStatus(");
  });

  it("should broadcast STARTED status on migration start", () => {
    expect(migrationService).toContain('broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "STARTED"');
  });

  it("should broadcast COMPLETED status on migration completion", () => {
    expect(migrationService).toContain('broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "COMPLETED"');
  });

  it("should broadcast FAILED status on migration failure", () => {
    expect(migrationService).toContain('broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "FAILED"');
  });

  it("should broadcast ROLLED_BACK status on rollback", () => {
    expect(migrationService).toContain('broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "ROLLED_BACK"');
  });
});

// ============================================================================
// RESET ENDPOINT — Security & Atomicity (Requirement E)
// ============================================================================

describe("Reset Endpoint Security", () => {

  // Extract only the agence reset section (not the platform-wide reset)
  const agenceResetSection = (() => {
    const startMarker = "RÉINITIALISATION PAR AGENCE";
    const startIdx = settingsRoute.indexOf(startMarker);
    if (startIdx === -1) return "";
    return settingsRoute.slice(startIdx);
  })();

  it("should guard reset with authorization (requireAbility)", () => {
    // Reset is protected by requireAbility(Actions.MANAGE, Subjects.SETTINGS)
    // at the route level, not by NODE_ENV check
    expect(settingsRoute).toContain("requireAbility");
  });

  it("should NOT use session_replication_role (dangerous FK bypass) in agence reset", () => {
    // Only the agence reset section should be checked (platform reset is separate)
    expect(agenceResetSection).not.toContain("session_replication_role");
  });

  it("should wrap all deletes in a single transaction", () => {
    expect(agenceResetSection).toContain("db.transaction(async (tx)");
  });

  it("should use tx (transaction context) for all DELETE operations", () => {
    // Extract the transaction block within agence reset
    const txStart = agenceResetSection.indexOf("db.transaction(async (tx)");
    const notifyIdx = agenceResetSection.indexOf("// Notify", txStart);
    const transactionBlock = agenceResetSection.slice(txStart, notifyIdx > 0 ? notifyIdx : undefined);

    // All executes inside transaction should use tx, not db
    const dbExecuteInTx = transactionBlock.match(/\bdb\.execute/g);
    expect(dbExecuteInTx).toBeNull(); // No direct db.execute inside transaction block
    const txExecuteCount = transactionBlock.match(/tx\.execute/g);
    expect(txExecuteCount).not.toBeNull();
    expect(txExecuteCount!.length).toBeGreaterThan(10); // Many tables to delete
  });

  it("should delete tontine sub-tables in FK-safe order", () => {
    const txStart = agenceResetSection.indexOf("db.transaction(async (tx)");
    const notifyIdx = agenceResetSection.indexOf("// Notify", txStart);
    const resetBlock = agenceResetSection.slice(txStart, notifyIdx > 0 ? notifyIdx : undefined);

    // tontine_distribution_requests before tontine_turns DELETE
    const distIdx = resetBlock.indexOf("tontine_distribution_requests");
    const turnsDeleteIdx = resetBlock.indexOf("DELETE FROM tontine_turns");
    expect(distIdx).toBeGreaterThan(-1);
    expect(turnsDeleteIdx).toBeGreaterThan(-1);
    expect(distIdx).toBeLessThan(turnsDeleteIdx);

    // contributions before membres before tontines
    const contribIdx = resetBlock.indexOf("contributions_tontine");
    const membresIdx = resetBlock.indexOf("DELETE FROM membres_tontine");
    const tontinesIdx = resetBlock.lastIndexOf("DELETE FROM tontines");
    expect(contribIdx).toBeLessThan(membresIdx);
    expect(membresIdx).toBeLessThan(tontinesIdx);
  });

  it("should delete mouvements_financiers and comptes (missing in old version)", () => {
    expect(agenceResetSection).toContain("DELETE FROM mouvements_financiers WHERE agence_id");
    expect(agenceResetSection).toContain("DELETE FROM comptes WHERE agence_id");
    expect(agenceResetSection).toContain("DELETE FROM virements_programmes WHERE agence_id");
    expect(agenceResetSection).toContain("DELETE FROM transferts_coffre_caisse WHERE agence_id");
    expect(agenceResetSection).toContain("DELETE FROM dossiers_credit WHERE agence_id");
    expect(agenceResetSection).toContain("DELETE FROM demandes_credit WHERE agence_id");
  });

  it("should reset coffre balance and recreate caisse with zero balance", () => {
    expect(agenceResetSection).toContain("UPDATE coffres_forts SET solde = '0'");
    // Caisses are deleted and recreated with solde '0' (clean slate)
    expect(agenceResetSection).toContain("DELETE FROM caisses");
  });
});

// ============================================================================
// CODE CLEANUP — Enum Alignment (Requirement G)
// ============================================================================

describe("Code Cleanup — Enums & Types", () => {

  it("AGENCY_MIGRATION_MODE should use English enum values (not French strings)", () => {
    expect(migrationSchema).toContain('ACTIVE: "ACTIVE"');
    expect(migrationSchema).toContain('CLOSING_PENDING: "CLOSING_PENDING"');
    expect(migrationSchema).toContain('CLOSED: "CLOSED"');
    // Should NOT contain old French strings
    expect(migrationSchema).not.toContain('"Actif"');
    expect(migrationSchema).not.toContain('"En fermeture"');
    expect(migrationSchema).not.toContain('"Fermé"');
  });

  it("should NOT contain 'as any' on status arrays", () => {
    // Check pendingStatuses and cancelableStatuses don't use 'as any'
    const pendingLine = migrationService.match(/pendingStatuses.*as any/);
    const cancelLine = migrationService.match(/cancelableStatuses.*as any/);
    expect(pendingLine).toBeNull();
    expect(cancelLine).toBeNull();
  });

  it("should use StatutAgence.ACTIVE for agency status checks (not StatutCompte)", () => {
    expect(migrationService).toContain("StatutAgence");
    // Should NOT use StatutCompte for agency checks
    expect(migrationService).not.toContain("StatutCompte.ACTIVE");
  });

  it("MigrationVolumetry should include all entity type counts", () => {
    const volumetryTypes = [
      "mouvementsFinanciers", "operationsCaisse", "virementsProgrammes",
      "dossiersCredit", "membresTontine", "contributionsTontine",
      "tontineCycles", "tontineTurns", "tontineSchedules",
      "transfertsCoffreCaisse",
    ];
    for (const type of volumetryTypes) {
      expect(migrationSchema).toContain(`${type}: number`);
    }
  });

  it("should have MigrationOptions interface", () => {
    expect(migrationSchema).toContain("MigrationOptions");
    expect(migrationSchema).toContain("includeArchived");
    expect(migrationSchema).toContain("includeCancelled");
    expect(migrationSchema).toContain("batchSize");
    expect(migrationSchema).toContain("snapshotFields");
  });
});

// ============================================================================
// MIGRATION STATUS — ROLLED_BACK defined
// ============================================================================

describe("Migration Status Schema", () => {

  it("should define ROLLED_BACK status", () => {
    expect(migrationSchema).toContain('ROLLED_BACK: "ROLLED_BACK"');
  });
});
