/**
 * Tests unitaires — Coffre-fort & Caisse Guards + Erreurs structurées
 *
 * Vérifie:
 * - Les classes d'erreurs structurées (code, httpStatus, data)
 * - Le validateur assertValidTypePaiement
 * - Le helper getTypePaiementForCompte
 * - L'intégrité des interfaces guard
 */

import { describe, it, expect } from "vitest";
import {
  CoffreInactifError,
  CoffreInsufficientFundsError,
  CoffreSoldeMinimumError,
  CoffrePlafondJournalierError,
  CaisseInactiveError,
  CaisseInsufficientFundsError,
  isCoffreCaisseError,
} from "../../apps/api/services/coffre/coffre-errors";
import {
  assertValidTypePaiement,
  getTypePaiementForCompte,
  TypePaiementTerrain,
} from "@shared/enum/status-constants";

// ============================================================================
// ERREURS STRUCTURÉES
// ============================================================================

describe("Coffre/Caisse Structured Errors", () => {

  describe("CoffreInactifError", () => {
    it("should have correct code, httpStatus, and data", () => {
      const error = new CoffreInactifError("coffre-123", "SUSPENDED");
      expect(error.code).toBe("COFFRE_INACTIF");
      expect(error.httpStatus).toBe(409);
      expect(error.data.coffreId).toBe("coffre-123");
      expect(error.data.statut).toBe("SUSPENDED");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("CoffreInsufficientFundsError", () => {
    it("should compute deficit correctly", () => {
      const error = new CoffreInsufficientFundsError("coffre-123", 50000, 100000);
      expect(error.code).toBe("COFFRE_INSUFFICIENT_FUNDS");
      expect(error.httpStatus).toBe(409);
      expect(error.data.available).toBe(50000);
      expect(error.data.requested).toBe(100000);
      expect(error.data.deficit).toBe(50000);
    });

    it("should handle zero balance", () => {
      const error = new CoffreInsufficientFundsError("coffre-123", 0, 25000);
      expect(error.data.deficit).toBe(25000);
      expect(error.data.available).toBe(0);
    });
  });

  describe("CoffreSoldeMinimumError", () => {
    it("should expose soldeApresOperation and soldeMinimum", () => {
      const error = new CoffreSoldeMinimumError("coffre-123", 80000, 100000);
      expect(error.code).toBe("COFFRE_SOLDE_MINIMUM");
      expect(error.data.soldeApresOperation).toBe(80000);
      expect(error.data.soldeMinimum).toBe(100000);
    });
  });

  describe("CoffrePlafondJournalierError", () => {
    it("should expose plafond details for DEBIT direction", () => {
      const error = new CoffrePlafondJournalierError(
        "coffre", "coffre-123", "DEBIT", 4000000, 2000000, 5000000
      );
      expect(error.code).toBe("COFFRE_PLAFOND_JOURNALIER");
      expect(error.data.direction).toBe("DEBIT");
      expect(error.data.dailyTotal).toBe(4000000);
      expect(error.data.requested).toBe(2000000);
      expect(error.data.plafond).toBe(5000000);
      expect(error.data.entityType).toBe("coffre");
    });

    it("should work for caisse entity type with CREDIT direction", () => {
      const error = new CoffrePlafondJournalierError(
        "caisse", "caisse-456", "CREDIT", 3000000, 1000000, 3500000
      );
      expect(error.data.entityType).toBe("caisse");
      expect(error.data.direction).toBe("CREDIT");
    });
  });

  describe("CaisseInactiveError", () => {
    it("should have correct data", () => {
      const error = new CaisseInactiveError("caisse-456", "DELETED");
      expect(error.code).toBe("CAISSE_INACTIVE");
      expect(error.httpStatus).toBe(409);
      expect(error.data.caisseId).toBe("caisse-456");
    });
  });

  describe("CaisseInsufficientFundsError", () => {
    it("should compute deficit correctly", () => {
      const error = new CaisseInsufficientFundsError("caisse-456", 10000, 50000);
      expect(error.code).toBe("CAISSE_INSUFFICIENT_FUNDS");
      expect(error.data.deficit).toBe(40000);
    });
  });

  describe("isCoffreCaisseError type guard", () => {
    it("should identify CoffreInactifError", () => {
      const error = new CoffreInactifError("id", "SUSPENDED");
      expect(isCoffreCaisseError(error)).toBe(true);
    });

    it("should identify CoffreInsufficientFundsError", () => {
      const error = new CoffreInsufficientFundsError("id", 100, 200);
      expect(isCoffreCaisseError(error)).toBe(true);
    });

    it("should identify CaisseInsufficientFundsError", () => {
      const error = new CaisseInsufficientFundsError("id", 100, 200);
      expect(isCoffreCaisseError(error)).toBe(true);
    });

    it("should reject regular Error", () => {
      expect(isCoffreCaisseError(new Error("nope"))).toBe(false);
    });

    it("should reject non-Error objects", () => {
      expect(isCoffreCaisseError("string")).toBe(false);
      expect(isCoffreCaisseError(null)).toBe(false);
      expect(isCoffreCaisseError(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// VALIDATEUR typePaiement
// ============================================================================

describe("assertValidTypePaiement", () => {

  it("should accept all defined enum values", () => {
    const validValues = Object.values(TypePaiementTerrain);
    for (const value of validValues) {
      expect(() => assertValidTypePaiement(value)).not.toThrow();
      expect(assertValidTypePaiement(value)).toBe(value);
    }
  });

  it("should reject invalid values", () => {
    expect(() => assertValidTypePaiement("INVALID_TYPE")).toThrow(/Invalid typePaiement/);
    expect(() => assertValidTypePaiement("")).toThrow(/Invalid typePaiement/);
    expect(() => assertValidTypePaiement("Dépôt SAVINGS")).toThrow(/Invalid typePaiement/);
  });

  it("should reject old French strings that were previously used", () => {
    // These were the problematic dynamic strings before the cleanup
    expect(() => assertValidTypePaiement("Dépôt Épargne")).toThrow();
    expect(() => assertValidTypePaiement("Retrait Courant")).toThrow();
    expect(() => assertValidTypePaiement("Liquidation Suppression")).toThrow();
    expect(() => assertValidTypePaiement("INTERETS")).toThrow();
  });
});

// ============================================================================
// HELPER getTypePaiementForCompte
// ============================================================================

describe("getTypePaiementForCompte", () => {

  it("should map SAVINGS deposit correctly", () => {
    expect(getTypePaiementForCompte("SAVINGS", true)).toBe("DEPOSIT_SAVINGS");
  });

  it("should map SAVINGS withdrawal correctly", () => {
    expect(getTypePaiementForCompte("SAVINGS", false)).toBe("WITHDRAWAL_SAVINGS");
  });

  it("should map CURRENT deposit correctly", () => {
    expect(getTypePaiementForCompte("CURRENT", true)).toBe("DEPOSIT_CURRENT");
  });

  it("should map CURRENT withdrawal correctly", () => {
    expect(getTypePaiementForCompte("CURRENT", false)).toBe("WITHDRAWAL_CURRENT");
  });

  it("should map BLOCKED deposit correctly", () => {
    expect(getTypePaiementForCompte("BLOCKED", true)).toBe("DEPOSIT_BLOCKED");
  });

  it("should map BLOCKED withdrawal correctly", () => {
    expect(getTypePaiementForCompte("BLOCKED", false)).toBe("WITHDRAWAL_BLOCKED");
  });

  it("should default to DEPOSIT_SAVINGS for unknown type deposit", () => {
    expect(getTypePaiementForCompte("UNKNOWN", true)).toBe("DEPOSIT_SAVINGS");
  });

  it("should default to WITHDRAWAL_SAVINGS for unknown type withdrawal", () => {
    expect(getTypePaiementForCompte("UNKNOWN", false)).toBe("WITHDRAWAL_SAVINGS");
  });
});
