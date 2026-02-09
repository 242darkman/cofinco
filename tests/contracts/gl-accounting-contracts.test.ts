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
import { db, pool } from "server/db";
import { comptes, mouvementsFinanciers, users, clients, accountingRules } from "@shared/schema";
import { glPostingLinks, ecritures } from "@shared/schema/accounting";
import { eq, sql } from "drizzle-orm";
import { faker } from "@faker-js/faker";
import { executeWithLedger } from "server/services/ledger";
import { postGlForMouvement } from "server/services/accounting-posting-service";

// ============================================================================
// TEST HELPERS
// ============================================================================

let testUserId: string;
let testClientId: string;
let testCompteId: string;

async function createTestEntities() {
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
        typePaiement: "WITHDRAWAL_CURRENT",
      },
      async (tx, mouvement) => {
        // Balance update inside a transaction that has a mouvement → should pass
        await tx
          .update(comptes)
          .set({ soldeCourant: "95000" })
          .where(eq(comptes.id, testCompteId));
        return { ok: true };
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
  // All typePaiement values used across the codebase that create mouvements financiers
  // These are the canonical event types that the GL system must handle
  const REQUIRED_EVENT_TYPES = [
    // Account operations
    "DEPOSIT_CURRENT",
    "WITHDRAWAL_CURRENT",
    "DEPOSIT_SAVINGS",
    "WITHDRAWAL_SAVINGS",
    "DEPOSIT_BLOCKED",
    "WITHDRAWAL_BLOCKED",
    "INITIAL_DEPOSIT",
    // Transfers
    "INTERNAL_TRANSFER",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    // Credit operations
    "CREDIT_DISBURSEMENT",
    "CREDIT_REPAYMENT",
    // Tontine operations
    "TONTINE_CONTRIBUTION",
    "TONTINE_WITHDRAWAL",
    // Coffre/Caisse operations
    "COFFRE_APPROVISIONNEMENT",
    "COFFRE_EVACUATION",
    "COFFRE_TO_CAISSE",
    "CAISSE_TO_COFFRE",
    // Mobile Money
    "COLLECTION_MTN",
    "COLLECTION_AIRTEL",
    "PAYOUT_MTN",
    "PAYOUT_AIRTEL",
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
        typePaiement: "WITHDRAWAL_CURRENT",
      },
      async (_tx, mouvement) => {
        return { mouvementId: mouvement.id };
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
        typePaiement: "WITHDRAWAL_CURRENT",
        idempotencyKey,
      },
      async () => ({ ok: true })
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
          typePaiement: "WITHDRAWAL_CURRENT",
          idempotencyKey,
        },
        async () => ({ ok: true })
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
          return { ok: true };
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
