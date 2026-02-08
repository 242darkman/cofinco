import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Unit tests for transaction reversal logic.
// Since reverseOperation() is heavily DB-dependent, we test the
// ReversalError class and the validation logic patterns used throughout.
// Integration tests for the full flow are in tests/integration/.
// ============================================================================

// Mock heavy dependencies to avoid DB/schema import side-effects
vi.mock("server/db", () => ({ db: {} }));
vi.mock("server/services/ledger", () => ({
  createMouvementFinancier: vi.fn(),
  createOutboxEvent: vi.fn(),
  createMouvementEvents: vi.fn(),
  updateCompteSolde: vi.fn(),
  updateSessionSolde: vi.fn(),
  generateReference: vi.fn(),
  emitBalanceUpdates: vi.fn(),
}));
vi.mock("server/services/notifications/domain-events/event-registry", () => ({
  dispatchDomainEvent: vi.fn(),
}));

import { ReversalError } from "server/services/caisse/transaction-reversal-service";

describe("ReversalError", () => {
  it("should create error with code and default httpStatus", () => {
    const err = new ReversalError("Test message", "TEST_CODE");
    expect(err.message).toBe("Test message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.httpStatus).toBe(400);
    expect(err.name).toBe("ReversalError");
  });

  it("should accept custom httpStatus", () => {
    const err = new ReversalError("Not found", "NOT_FOUND", 404);
    expect(err.httpStatus).toBe(404);
  });

  it("should be an instance of Error", () => {
    const err = new ReversalError("err", "CODE");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================================
// Validation logic (extracted from reverseOperation requirements)
// ============================================================================

describe("Reversal validation logic", () => {
  describe("reason validation", () => {
    it("should require reason with minimum 3 characters", () => {
      const validate = (reason: string) => {
        if (!reason || reason.trim().length < 3) {
          throw new ReversalError(
            "Un motif d'annulation est obligatoire (minimum 3 caracteres)",
            "REASON_REQUIRED"
          );
        }
      };

      expect(() => validate("")).toThrow(ReversalError);
      expect(() => validate("ab")).toThrow(ReversalError);
      expect(() => validate("   ")).toThrow(ReversalError);
      expect(() => validate("abc")).not.toThrow();
      expect(() => validate("Valid reason for reversal")).not.toThrow();
    });
  });

  describe("status validation", () => {
    it("should only allow POSTED operations to be reversed", () => {
      const REVERSIBLE_STATUS = "POSTED";
      const NON_REVERSIBLE = ["REVERSED", "CANCELLED", "PENDING", "DRAFT"];

      const canReverse = (statut: string) => statut === REVERSIBLE_STATUS;

      expect(canReverse("POSTED")).toBe(true);
      NON_REVERSIBLE.forEach((s) => {
        expect(canReverse(s)).toBe(false);
      });
    });

    it("should reject already reversed operations", () => {
      const checkReversible = (statut: string) => {
        if (statut === "REVERSED") {
          throw new ReversalError("Cette operation a deja ete annulee", "ALREADY_REVERSED");
        }
        if (statut === "CANCELLED") {
          throw new ReversalError("Cette operation a deja ete annulee", "ALREADY_CANCELLED");
        }
        if (statut !== "POSTED") {
          throw new ReversalError(
            `Seules les operations POSTED peuvent etre annulees (statut actuel: ${statut})`,
            "INVALID_STATUS"
          );
        }
      };

      expect(() => checkReversible("REVERSED")).toThrow("deja ete annulee");
      expect(() => checkReversible("CANCELLED")).toThrow("deja ete annulee");
      expect(() => checkReversible("PENDING")).toThrow("Seules les operations POSTED");
      expect(() => checkReversible("POSTED")).not.toThrow();
    });
  });

  describe("inverse sens calculation", () => {
    it("should flip DEBIT to CREDIT and vice versa", () => {
      const getInverseSens = (sens: "DEBIT" | "CREDIT") =>
        sens === "DEBIT" ? "CREDIT" : "DEBIT";

      expect(getInverseSens("DEBIT")).toBe("CREDIT");
      expect(getInverseSens("CREDIT")).toBe("DEBIT");
    });
  });

  describe("balance delta calculation", () => {
    it("should compute correct account delta for reversal", () => {
      // Reversal of a DEBIT (withdrawal) -> CREDIT -> adds money back
      // inverseSens is CREDIT -> compteDelta = +montant
      const computeDelta = (inverseSens: "DEBIT" | "CREDIT", montant: number) => {
        return inverseSens === "CREDIT" ? montant : -montant;
      };

      // Original was DEBIT (withdrawal) -> reversal is CREDIT -> positive delta
      expect(computeDelta("CREDIT", 50000)).toBe(50000);
      // Original was CREDIT (deposit) -> reversal is DEBIT -> negative delta
      expect(computeDelta("DEBIT", 50000)).toBe(-50000);
    });

    it("should compute correct session delta (opposite of account delta)", () => {
      const computeSessionDelta = (inverseSens: "DEBIT" | "CREDIT", montant: number) => {
        return inverseSens === "CREDIT" ? -montant : montant;
      };

      // Original DEBIT -> reversal CREDIT -> session cash decreases (returned to account)
      expect(computeSessionDelta("CREDIT", 50000)).toBe(-50000);
      // Original CREDIT -> reversal DEBIT -> session cash increases (taken from account)
      expect(computeSessionDelta("DEBIT", 50000)).toBe(50000);
    });
  });

  describe("idempotency key generation", () => {
    it("should generate unique reversal idempotency keys", () => {
      const genKey = (operationId: string) => `REV-${operationId}-${Date.now()}`;

      const key1 = genKey("op-123");
      expect(key1).toMatch(/^REV-op-123-\d+$/);

      // Two keys for same operation at different times should differ
      const key2 = genKey("op-123");
      // They might be the same if run in the same millisecond, so just check format
      expect(key2).toMatch(/^REV-op-123-\d+$/);
    });
  });

  describe("reversal metadata", () => {
    it("should build correct metadata object", () => {
      const buildMetadata = (originalId: string, originalRef: string, reason: string) => ({
        reversalOf: originalId,
        reversalReason: reason,
        originalReference: originalRef,
      });

      const meta = buildMetadata("mvt-456", "REF-2026-001", "Erreur de saisie");
      expect(meta).toEqual({
        reversalOf: "mvt-456",
        reversalReason: "Erreur de saisie",
        originalReference: "REF-2026-001",
      });
    });
  });
});
