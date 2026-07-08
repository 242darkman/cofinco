/**
 * GL Accounting Contract Tests
 *
 * These tests enforce 5 invariants that guarantee the accounting system
 * is "comptablement inviolable":
 *
 * 1. NO_DIRECT_BALANCE_UPDATE — DB triggers block direct balance changes
 * 2. EVERY_EVENT_HAS_GL_RULE — All typePaiement values have a matching accounting rule
 * 3. LEDGER_ATOMICITY — Mouvement + GL entry are created in the same transaction
 * 4. GL_IDEMPOTENCE — Duplicate GL postings are rejected by unique constraint
 * 5. ROLLBACK_SAFETY — GL posting failure rolls back the entire operation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, pool } from "../../apps/api/db";
import { comptes, mouvementsFinanciers, users, clients, accountingRules, agences } from "@shared/schema";
import { glPostingLinks, ecritures } from "@shared/schema/accounting";
import { eq, sql } from "drizzle-orm";
import { faker } from "@faker-js/faker";
import { executeWithLedger } from "../../apps/api/services/ledger";
import { postGlForMouvement } from "../../apps/api/services/accounting-posting-service";
import { isGLStrictMode } from "../../apps/api/services/accounting-validation";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TEST HELPERS
// ============================================================================

let testUserId: string;
let testClientId: string;
let testCompteId: string;
let testAgenceId: string;

async function createTestEntities() {
  // Get first agence for GL posting
  const [agence] = await db.select({ id: agences.id }).from(agences).limit(1);
  testAgenceId = agence.id;

  const [user] = await db
    .insert(users)
    .values({
      nom: `TestGL_${faker.string.alphanumeric(5)}`,
      username: `testgl_${faker.string.alphanumeric(8)}`,
      password: "hash_placeholder",
      typeCompte: "client",
      statut: "ACTIVE",
    })
    .returning();
  testUserId = user.id;

  const [client] = await db
    .insert(clients)
    .values({ userId: user.id })
    .returning();
  testClientId = client.id;

  // Start with 100k — use balance_guard_bypass since we're inserting, not updating
  const [compte] = await db
    .insert(comptes)
    .values({
      clientId: client.id,
      numeroCompte: `CPT-${faker.string.numeric(10)}`,
      typeCompte: "CURRENT",
      soldeCourant: "100000",
      statut: "ACTIVE",
      agenceId: testAgenceId,
    })
    .returning();
  testCompteId = compte.id;
}

async function cleanupTestEntities() {
  // Delete in reverse dependency order
  if (testCompteId) {
    await db.delete(comptes).where(eq(comptes.id, testCompteId)).catch(() => {});
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
  }
}

// ============================================================================
// CONTRACT 1: NO DIRECT BALANCE UPDATE
// ============================================================================

describe("Contract 1: No Direct Balance Update", () => {
  beforeEach(createTestEntities);
  afterEach(cleanupTestEntities);

  it("should block direct UPDATE on comptes.solde_courant without mouvement", async () => {
    // Attempt a raw SQL UPDATE outside any mouvement creation
    await expect(
      db.execute(
        sql`UPDATE comptes SET solde_courant = '999999' WHERE id = ${testCompteId}`
      )
    ).rejects.toThrow(/BALANCE_GUARD/);

    // Verify balance is unchanged
    const [compte] = await db
      .select({ soldeCourant: comptes.soldeCourant })
      .from(comptes)
      .where(eq(comptes.id, testCompteId));
    expect(parseFloat(compte.soldeCourant)).toBe(100000);
  });

  it("should allow balance update when mouvement is created in same transaction", async () => {
    // This goes through executeWithLedger which creates a mouvement first
    const result = await executeWithLedger(
      "EPARGNE",
      {
        montant: "5000",
        sens: "DEBIT",
        clientId: testClientId,
        compteId: testCompteId,
        agenceId: testAgenceId,
        typePaiement: "WITHDRAWAL_CURRENT",
        methodePaiement: "CASH",
      },
      async (tx, mouvement) => {
        // Balance update inside a transaction that has a mouvement → should pass
        await tx
          .update(comptes)
          .set({ soldeCourant: "95000" })
          .where(eq(comptes.id, testCompteId));
        return { result: { ok: true } };
      }
    );

    expect(result.result.ok).toBe(true);
  });

  it("should allow bypass with SET LOCAL for seeds/admin", async () => {
    // Simulates what seeds or admin operations would do
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL "app.balance_guard_bypass" = 'true'`);
      await tx.execute(
        sql`UPDATE comptes SET solde_courant = '100000' WHERE id = ${testCompteId}`
      );
    });

    // Should succeed without error
    const [compte] = await db
      .select({ soldeCourant: comptes.soldeCourant })
      .from(comptes)
      .where(eq(comptes.id, testCompteId));
    expect(parseFloat(compte.soldeCourant)).toBe(100000);
  });
});

// ============================================================================
// CONTRACT 2: EVERY EVENT HAS GL RULE
// ============================================================================

describe("Contract 2: Every Event Has GL Rule", () => {
  // All event types that MUST have at least one accounting rule.
  // Sourced from the 53 distinct event_types in accounting_rules (seed-prod.ts).
  // The test verifies the DB has rules for every required financial event.
  const REQUIRED_EVENT_TYPES = [
    // Account operations — deposits
    "DEPOSIT_CURRENT",
    "DEPOSIT_SAVINGS",
    "DEPOSIT_BLOCKED",
    "INITIAL_DEPOSIT",
    // Account operations — withdrawals
    "WITHDRAWAL_CURRENT",
    "WITHDRAWAL_SAVINGS",
    "WITHDRAWAL_BLOCKED",
    // Transfers
    "INTERNAL_TRANSFER",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    // Credit operations
    "CREDIT_DISBURSEMENT",
    "CREDIT_REPAYMENT",
    "CREDIT_REPAYMENT_INTEREST",
    "CREDIT_REPAYMENT_PENALTY",
    "CREDIT_FEE",
    "ENGAGEMENT_FEE",
    // Credit lifecycle
    "CREDIT_LATE_PENALTY",
    "CREDIT_PROVISION",
    "CREDIT_PROVISION_REVERSAL",
    "CREDIT_WRITEOFF",
    // Tontine operations
    "TONTINE_CONTRIBUTION",
    "TONTINE_DISTRIBUTION",
    "TONTINE_PENALTY",
    "COMMISSION",
    // Coffre / Caisse operations
    "COFFRE_TO_CAISSE",
    "CAISSE_TO_COFFRE",
    "ENTREE_COFFRE",
    "SORTIE_COFFRE",
    "COFFRE_TRANSIT_IN",
    "COFFRE_TRANSIT_OUT",
    "SAFE_SUPPLY",
    "RESTITUTION",
    "LIQUIDATION",
    // Evacuation coffre
    "EVACUATION_COFFRE_OUT",
    "EVACUATION_COFFRE_BANQUE",
    "EVACUATION_COFFRE_CENTRAL",
    "EVACUATION_COFFRE_TRANSPORTEUR",
    "EVACUATION_COFFRE_ECART_DEFICIT",
    "EVACUATION_COFFRE_ECART_SURPLUS",
    // Sessions caisse
    "SESSION_DEFICIT",
    "SESSION_SURPLUS",
    // Agents terrain
    "MISC_COLLECTION",
    "CASH_TRANSFER",
    "SETTLEMENT_CASH",
    "COLLECT_CASH",
    // Mobile Money
    "OPERATOR_FEE",
    "REVERSAL_COLLECTION",
    "REVERSAL_PAYOUT",
    // Payroll / RH
    "PAYROLL_ENGAGEMENT",
    "PAYROLL_PAYMENT",
    "PROSPECTION_PRIME",
    "SALARY_ADVANCE",
    // Interets
    "INTEREST_PAYMENT",
  ];

  it("should have an accounting rule for every required event type", async () => {
    const rules = await db
      .select({
        code: accountingRules.code,
        eventType: accountingRules.eventType,
        sourceType: accountingRules.sourceType,
      })
      .from(accountingRules);

    const coveredEventTypes = new Set(rules.map((r) => r.eventType));

    const missingRules: string[] = [];
    for (const eventType of REQUIRED_EVENT_TYPES) {
      if (!coveredEventTypes.has(eventType)) {
        missingRules.push(eventType);
      }
    }

    expect(missingRules).toEqual([]);
  });

  it("should have valid debit and credit accounts for every rule", async () => {
    const rules = await db.execute(sql`
      SELECT ar.code, ar.event_type, ar.debit_account, ar.credit_account,
             pd.numero_compte AS debit_exists,
             pc.numero_compte AS credit_exists
      FROM accounting_rules ar
      LEFT JOIN plan_comptable pd ON pd.numero_compte = ar.debit_account
      LEFT JOIN plan_comptable pc ON pc.numero_compte = ar.credit_account
    `);

    const invalidRules: string[] = [];
    for (const rule of rules.rows as any[]) {
      if (!rule.debit_exists) {
        invalidRules.push(`${rule.code}: debit account ${rule.debit_account} not in plan comptable`);
      }
      if (!rule.credit_exists) {
        invalidRules.push(`${rule.code}: credit account ${rule.credit_account} not in plan comptable`);
      }
    }

    expect(invalidRules).toEqual([]);
  });
});

// ============================================================================
// CONTRACT 3: LEDGER ATOMICITY
// ============================================================================

describe("Contract 3: Ledger Atomicity", () => {
  beforeEach(createTestEntities);
  afterEach(cleanupTestEntities);

  it("should create mouvement AND gl_posting_link in the same operation", async () => {
    const result = await executeWithLedger(
      "EPARGNE",
      {
        montant: "1000",
        sens: "DEBIT",
        clientId: testClientId,
        compteId: testCompteId,
        agenceId: testAgenceId,
        typePaiement: "WITHDRAWAL_CURRENT",
        methodePaiement: "CASH",
      },
      async (_tx, mouvement) => {
        return { result: { mouvementId: mouvement.id } };
      }
    );

    const mouvementId = result.result.mouvementId;

    // Verify mouvement exists
    const [mouvement] = await db
      .select()
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.id, mouvementId));
    expect(mouvement).toBeDefined();
    expect(mouvement.statut).toBe("POSTED");

    // Verify GL posting link exists for this mouvement
    const [glLink] = await db
      .select()
      .from(glPostingLinks)
      .where(eq(glPostingLinks.mouvementId, mouvementId));
    expect(glLink).toBeDefined();
    expect(glLink.status).toBe("POSTED");
  });
});

// ============================================================================
// CONTRACT 4: GL IDEMPOTENCE
// ============================================================================

describe("Contract 4: GL Idempotence", () => {
  beforeEach(createTestEntities);
  afterEach(cleanupTestEntities);

  it("should reject duplicate idempotency keys", async () => {
    const idempotencyKey = `idem-gl-${faker.string.uuid()}`;

    // First call succeeds
    await executeWithLedger(
      "EPARGNE",
      {
        montant: "1000",
        sens: "DEBIT",
        clientId: testClientId,
        compteId: testCompteId,
        agenceId: testAgenceId,
        typePaiement: "WITHDRAWAL_CURRENT",
        methodePaiement: "CASH",
        idempotencyKey,
      },
      async () => ({ result: { ok: true } })
    );

    // Second call with same key should fail
    await expect(
      executeWithLedger(
        "EPARGNE",
        {
          montant: "1000",
          sens: "DEBIT",
          clientId: testClientId,
          compteId: testCompteId,
          agenceId: testAgenceId,
          typePaiement: "WITHDRAWAL_CURRENT",
          methodePaiement: "CASH",
          idempotencyKey,
        },
        async () => ({ result: { ok: true } })
      )
    ).rejects.toThrow(/[Dd]uplicate/);

    // Verify only ONE mouvement was created
    const mouvements = await db
      .select()
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.compteId, testCompteId));
    expect(mouvements.length).toBe(1);
  });
});

// ============================================================================
// CONTRACT 5: ROLLBACK SAFETY
// ============================================================================

describe("Contract 5: Rollback Safety", () => {
  beforeEach(createTestEntities);
  afterEach(cleanupTestEntities);

  it("should rollback mouvement AND balance when callback throws", async () => {
    const initialBalance = 100000;

    await expect(
      executeWithLedger(
        "EPARGNE",
        {
          montant: "5000",
          sens: "DEBIT",
          clientId: testClientId,
          compteId: testCompteId,
          typePaiement: "WITHDRAWAL_CURRENT",
        },
        async (tx) => {
          // Update balance inside transaction
          await tx
            .update(comptes)
            .set({ soldeCourant: "95000" })
            .where(eq(comptes.id, testCompteId));

          // Then throw — everything should rollback
          throw new Error("Simulated business error");
          return { result: {} }; // unreachable, satisfies type
        }
      )
    ).rejects.toThrow("Simulated business error");

    // Verify balance is untouched
    const [compte] = await db
      .select({ soldeCourant: comptes.soldeCourant })
      .from(comptes)
      .where(eq(comptes.id, testCompteId));
    expect(parseFloat(compte.soldeCourant)).toBe(initialBalance);

    // Verify no mouvement was persisted
    const mouvements = await db
      .select()
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.compteId, testCompteId));
    expect(mouvements.length).toBe(0);
  });

  it("should rollback mouvement when GL posting fails", async () => {
    const initialBalance = 100000;

    // Use a typePaiement that has no accounting rule → GL will fail in STRICT mode
    await expect(
      executeWithLedger(
        "EPARGNE",
        {
          montant: "1000",
          sens: "DEBIT",
          clientId: testClientId,
          compteId: testCompteId,
          typePaiement: "NONEXISTENT_TYPE_FOR_TEST",
        },
        async (tx) => {
          await tx
            .update(comptes)
            .set({ soldeCourant: "99000" })
            .where(eq(comptes.id, testCompteId));
          return { result: { ok: true } };
        }
      )
    ).rejects.toThrow();

    // Balance should be unchanged
    const [compte] = await db
      .select({ soldeCourant: comptes.soldeCourant })
      .from(comptes)
      .where(eq(comptes.id, testCompteId));
    expect(parseFloat(compte.soldeCourant)).toBe(initialBalance);
  });
});

// ============================================================================
// CONTRACT 6: STATIC SCAN — NO DIRECT BALANCE UPDATES
// ============================================================================

describe("Contract 6: No Direct Balance Updates (Static Scan)", () => {
  // Balance columns that MUST only be modified via ledger helper functions
  const BALANCE_PATTERNS = [
    /\.set\(\s*\{[^}]*soldeCourant\s*:/,
    /\.set\(\s*\{[^}]*soldeEpargne\s*:/,
    /\.set\(\s*\{[^}]*soldeBloques\s*:/,
    /\.set\(\s*\{[^}]*soldeRestant\s*:/,
    /SET\s+solde_courant\s*=/i,
    /SET\s+solde_restant\s*=/i,
  ];

  // Files allowed to update balances (ledger internals, seeds, DB functions, tests)
  const ALLOWLIST = [
    "apps/api/services/ledger.ts",
    "apps/api/db.ts",
    "seeds/seed-prod.ts",
    // Legacy violations — each must be refactored to use executeWithLedger
    // Adding a file here is TEMPORARY and must be tracked for cleanup
    "apps/api/services/compte-transfers.ts",
    "apps/api/services/scheduled-transfers-service.ts",
    "apps/api/services/automatic-transfers-service.ts",
    "apps/api/routes/finance.ts",
    "apps/api/services/caisse-agent/approval-service.ts",
    "apps/api/services/tontine-production-service.ts",
    "apps/api/services/tontine-logic.ts",
    "apps/api/storage/finance.ts",
    "apps/api/routes/settings.ts",
  ];

  it("should have no NEW direct balance updates outside allowlist", () => {
    const serverDir = path.resolve(process.cwd(), "apps/api");
    const violations: Array<{ file: string; line: number; content: string }> = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          scanDir(fullPath);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          const relPath = path.relative(process.cwd(), fullPath);

          // Skip allowlisted files
          if (ALLOWLIST.some((a) => relPath === a || relPath.startsWith(a))) continue;

          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            for (const pattern of BALANCE_PATTERNS) {
              if (pattern.test(lines[i])) {
                violations.push({
                  file: relPath,
                  line: i + 1,
                  content: lines[i].trim().slice(0, 120),
                });
              }
            }
          }
        }
      }
    }

    scanDir(serverDir);

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.content}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} NEW direct balance update(s) outside allowlist:\n${report}\n\n` +
          `Either refactor to use executeWithLedger() or add to ALLOWLIST with justification.`
      );
    }
  });

  it("should document all legacy violations in allowlist", () => {
    // This test ensures the allowlist doesn't grow silently.
    // Current known legacy violations: 8 files.
    // If you add a file, update this count AND create a cleanup ticket.
    const LEGACY_FILES = ALLOWLIST.filter(
      (f) => !["apps/api/services/ledger.ts", "apps/api/db.ts", "seeds/seed-prod.ts"].includes(f)
    );
    expect(LEGACY_FILES.length).toBeLessThanOrEqual(9);
  });
});

// ============================================================================
// CONTRACT 7: STRICT MODE ENFORCEMENT
// ============================================================================

describe("Contract 7: Strict Mode Enforcement", () => {
  it("should have GL strict mode enabled", () => {
    expect(isGLStrictMode()).toBe(true);
  });

  it("should not have GL_POSTING_MODE set to LENIENT", () => {
    const mode = process.env.GL_POSTING_MODE;
    expect(mode).not.toBe("LENIENT");
  });

  it("should reject operations with unknown typePaiement in STRICT mode", async () => {
    // Attempt to post GL for a non-existent event type — must throw
    await expect(
      db.transaction(async (tx) => {
        // Create a fake mouvement-like object
        const fakeMouvement = {
          id: "00000000-0000-0000-0000-000000000000",
          typePaiement: "THIS_TYPE_DOES_NOT_EXIST",
          montant: "1000",
          sens: "DEBIT",
          sourceModule: "TEST",
          methodePaiement: null,
          metadata: null,
        };
        // postGlForMouvement should throw AccountingRuleNotFoundError
        await postGlForMouvement(tx, fakeMouvement as any, "71dcbdef-14fe-44a8-9ef7-9dbe8aca72ee");
      })
    ).rejects.toThrow(/[Nn]o accounting rule found|AccountingRuleNotFound/);
  });
});
