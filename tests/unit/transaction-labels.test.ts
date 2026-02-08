import { describe, it, expect } from "vitest";
import {
  CREDIT_TYPES,
  DEBIT_TYPES,
  deriveSensFromType,
  getTransactionLabel,
  formatTransactionDescription,
} from "@shared/config/transaction-labels";

// ============================================================================
// CREDIT_TYPES / DEBIT_TYPES Sets
// ============================================================================

describe("Transaction Type Sets", () => {
  it("CREDIT_TYPES should contain expected credit operations", () => {
    const expectedCredits = [
      "TRANSFER_IN",
      "DEPOSIT_SAVINGS",
      "DEPOSIT_CURRENT",
      "DEPOSIT_BLOCKED",
      "INITIAL_DEPOSIT",
      "SAVINGS_DEPOSIT",
      "INTEREST_PAYMENT",
      "CREDIT_DISBURSEMENT",
      "TONTINE_WITHDRAWAL",
      "TONTINE_DISTRIBUTION",
      "MOBILE_MONEY_DEPOSIT",
    ];
    expectedCredits.forEach((type) => {
      expect(CREDIT_TYPES.has(type)).toBe(true);
    });
  });

  it("DEBIT_TYPES should contain expected debit operations", () => {
    const expectedDebits = [
      "TRANSFER_OUT",
      "INTERNAL_TRANSFER",
      "WITHDRAWAL_SAVINGS",
      "WITHDRAWAL_CURRENT",
      "WITHDRAWAL_BLOCKED",
      "SAVINGS_WITHDRAWAL",
      "CREDIT_REPAYMENT",
      "LOAN_REPAYMENT",
      "TONTINE_CONTRIBUTION",
      "ENGAGEMENT_FEE",
      "BANK_FEE",
      "MOBILE_MONEY_WITHDRAWAL",
    ];
    expectedDebits.forEach((type) => {
      expect(DEBIT_TYPES.has(type)).toBe(true);
    });
  });

  it("CREDIT_TYPES and DEBIT_TYPES should have no overlap", () => {
    for (const type of CREDIT_TYPES) {
      expect(DEBIT_TYPES.has(type)).toBe(false);
    }
  });
});

// ============================================================================
// deriveSensFromType
// ============================================================================

describe("deriveSensFromType", () => {
  describe("should return CREDIT for credit operations", () => {
    it("should return CREDIT for TRANSFER_IN", () => {
      expect(deriveSensFromType("TRANSFER_IN")).toBe("CREDIT");
    });

    it("should return CREDIT for DEPOSIT_SAVINGS", () => {
      expect(deriveSensFromType("DEPOSIT_SAVINGS")).toBe("CREDIT");
    });

    it("should return CREDIT for DEPOSIT_CURRENT", () => {
      expect(deriveSensFromType("DEPOSIT_CURRENT")).toBe("CREDIT");
    });

    it("should return CREDIT for INITIAL_DEPOSIT", () => {
      expect(deriveSensFromType("INITIAL_DEPOSIT")).toBe("CREDIT");
    });

    it("should return CREDIT for CREDIT_DISBURSEMENT", () => {
      expect(deriveSensFromType("CREDIT_DISBURSEMENT")).toBe("CREDIT");
    });

    it("should return CREDIT for TONTINE_WITHDRAWAL", () => {
      expect(deriveSensFromType("TONTINE_WITHDRAWAL")).toBe("CREDIT");
    });

    it("should return CREDIT for MOBILE_MONEY_DEPOSIT", () => {
      expect(deriveSensFromType("MOBILE_MONEY_DEPOSIT")).toBe("CREDIT");
    });
  });

  describe("should return DEBIT for debit operations", () => {
    it("should return DEBIT for TRANSFER_OUT", () => {
      expect(deriveSensFromType("TRANSFER_OUT")).toBe("DEBIT");
    });

    it("should return DEBIT for INTERNAL_TRANSFER", () => {
      expect(deriveSensFromType("INTERNAL_TRANSFER")).toBe("DEBIT");
    });

    it("should return DEBIT for WITHDRAWAL_SAVINGS", () => {
      expect(deriveSensFromType("WITHDRAWAL_SAVINGS")).toBe("DEBIT");
    });

    it("should return DEBIT for CREDIT_REPAYMENT", () => {
      expect(deriveSensFromType("CREDIT_REPAYMENT")).toBe("DEBIT");
    });

    it("should return DEBIT for TONTINE_CONTRIBUTION", () => {
      expect(deriveSensFromType("TONTINE_CONTRIBUTION")).toBe("DEBIT");
    });

    it("should return DEBIT for MOBILE_MONEY_WITHDRAWAL", () => {
      expect(deriveSensFromType("MOBILE_MONEY_WITHDRAWAL")).toBe("DEBIT");
    });
  });

  describe("should handle edge cases", () => {
    it("should return DEBIT for null input", () => {
      expect(deriveSensFromType(null)).toBe("DEBIT");
    });

    it("should return DEBIT for undefined input", () => {
      expect(deriveSensFromType(undefined)).toBe("DEBIT");
    });

    it("should return DEBIT for empty string", () => {
      expect(deriveSensFromType("")).toBe("DEBIT");
    });

    it("should return DEBIT for unknown type", () => {
      expect(deriveSensFromType("UNKNOWN_TYPE")).toBe("DEBIT");
    });
  });

  describe("should detect credit operations by pattern matching", () => {
    it("should detect DEPOSIT in type name as CREDIT", () => {
      expect(deriveSensFromType("CUSTOM_DEPOSIT_OPERATION")).toBe("CREDIT");
    });

    it("should detect VERSEMENT in type name as CREDIT", () => {
      expect(deriveSensFromType("VERSEMENT_SPECIAL")).toBe("CREDIT");
    });

    it("should detect ENTREE in type name as CREDIT", () => {
      expect(deriveSensFromType("ENTREE_FONDS")).toBe("CREDIT");
    });

    it("should detect _IN suffix in type name as CREDIT", () => {
      expect(deriveSensFromType("CASH_IN")).toBe("CREDIT");
    });

    it("should detect RECU in type name as CREDIT", () => {
      expect(deriveSensFromType("PAIEMENT_RECU")).toBe("CREDIT");
    });

    it("should detect DISBURSEMENT in type name as CREDIT", () => {
      expect(deriveSensFromType("LOAN_DISBURSEMENT")).toBe("CREDIT");
    });
  });
});

// ============================================================================
// getTransactionLabel
// ============================================================================

describe("getTransactionLabel", () => {
  describe("should return proper bank-style labels for transfers", () => {
    it("should format TRANSFER_OUT with destination account", () => {
      const label = getTransactionLabel("TRANSFER_OUT", {
        compteDestNumero: "001-0012345",
      });
      expect(label).toBe("VIR ÉMIS vers 001-0012345");
    });

    it("should format TRANSFER_OUT without destination account", () => {
      const label = getTransactionLabel("TRANSFER_OUT");
      expect(label).toBe("VIR ÉMIS");
    });

    it("should format TRANSFER_IN with source account", () => {
      const label = getTransactionLabel("TRANSFER_IN", {
        compteSourceNumero: "002-9876543",
      });
      expect(label).toBe("VIR REÇU de 002-9876543");
    });

    it("should format TRANSFER_IN without source account", () => {
      const label = getTransactionLabel("TRANSFER_IN");
      expect(label).toBe("VIR REÇU");
    });

    it("should format INTERNAL_TRANSFER with destination", () => {
      const label = getTransactionLabel("INTERNAL_TRANSFER", {
        compteDestNumero: "003-1111111",
      });
      expect(label).toBe("VIR INTERNE vers 003-1111111");
    });
  });

  describe("should return proper labels for deposits", () => {
    it("should format DEPOSIT_SAVINGS", () => {
      expect(getTransactionLabel("DEPOSIT_SAVINGS")).toBe("VERSEMENT ÉPARGNE");
    });

    it("should format DEPOSIT_CURRENT", () => {
      expect(getTransactionLabel("DEPOSIT_CURRENT")).toBe("VERSEMENT COURANT");
    });

    it("should format DEPOSIT_BLOCKED", () => {
      expect(getTransactionLabel("DEPOSIT_BLOCKED")).toBe("VERSEMENT BLOQUÉ");
    });

    it("should format INITIAL_DEPOSIT", () => {
      expect(getTransactionLabel("INITIAL_DEPOSIT")).toBe(
        "VERSEMENT INITIAL OUVERTURE"
      );
    });
  });

  describe("should return proper labels for withdrawals", () => {
    it("should format WITHDRAWAL_SAVINGS", () => {
      expect(getTransactionLabel("WITHDRAWAL_SAVINGS")).toBe("RETRAIT ÉPARGNE");
    });

    it("should format WITHDRAWAL_CURRENT", () => {
      expect(getTransactionLabel("WITHDRAWAL_CURRENT")).toBe("RETRAIT COURANT");
    });

    it("should format SAVINGS_WITHDRAWAL", () => {
      expect(getTransactionLabel("SAVINGS_WITHDRAWAL")).toBe("RETRAIT ÉPARGNE");
    });
  });

  describe("should return proper labels for credit operations", () => {
    it("should format CREDIT_REPAYMENT with credit number", () => {
      const label = getTransactionLabel("CREDIT_REPAYMENT", {
        numeroCredit: "CR-2026-001",
      });
      expect(label).toBe("REMB. CRÉDIT N°CR-2026-001");
    });

    it("should format CREDIT_REPAYMENT without credit number", () => {
      expect(getTransactionLabel("CREDIT_REPAYMENT")).toBe("REMB. CRÉDIT");
    });

    it("should format CREDIT_DISBURSEMENT with credit number", () => {
      const label = getTransactionLabel("CREDIT_DISBURSEMENT", {
        numeroCredit: "CR-2026-002",
      });
      expect(label).toBe("DÉCAISSEMENT CRÉDIT N°CR-2026-002");
    });

    it("should format ENGAGEMENT_FEE", () => {
      expect(getTransactionLabel("ENGAGEMENT_FEE")).toBe("FRAIS DOSSIER CRÉDIT");
    });
  });

  describe("should return proper labels for tontine operations", () => {
    it("should format TONTINE_CONTRIBUTION with tontine name", () => {
      const label = getTransactionLabel("TONTINE_CONTRIBUTION", {
        tontineName: "Tontine Fraternité",
      });
      expect(label).toBe("COTISATION TONTINE Tontine Fraternité");
    });

    it("should format TONTINE_WITHDRAWAL with tontine name", () => {
      const label = getTransactionLabel("TONTINE_WITHDRAWAL", {
        tontineName: "Tontine du Quartier",
      });
      expect(label).toBe("BÉNÉFICE TONTINE Tontine du Quartier");
    });

    it("should format TONTINE_DISTRIBUTION", () => {
      expect(getTransactionLabel("TONTINE_DISTRIBUTION")).toBe(
        "DISTRIBUTION TONTINE"
      );
    });
  });

  describe("should return proper labels for mobile money operations", () => {
    it("should format MOBILE_MONEY_DEPOSIT with provider", () => {
      const label = getTransactionLabel("MOBILE_MONEY_DEPOSIT", {
        provider: "mtn",
      });
      expect(label).toBe("DÉPÔT MOBILE MTN");
    });

    it("should format MOBILE_MONEY_WITHDRAWAL with provider", () => {
      const label = getTransactionLabel("MOBILE_MONEY_WITHDRAWAL", {
        provider: "orange",
      });
      expect(label).toBe("RETRAIT MOBILE ORANGE");
    });

    it("should format MOBILE_MONEY_DEPOSIT without provider", () => {
      expect(getTransactionLabel("MOBILE_MONEY_DEPOSIT")).toBe(
        "DÉPÔT MOBILE MONEY"
      );
    });
  });

  describe("should return proper labels for special operations", () => {
    it("should format ADJUSTMENT with motif", () => {
      const label = getTransactionLabel("ADJUSTMENT", {
        motif: "Correction solde",
      });
      expect(label).toBe("RÉGULARISATION: Correction solde");
    });

    it("should format ADJUSTMENT without motif", () => {
      expect(getTransactionLabel("ADJUSTMENT")).toBe("RÉGULARISATION COMPTABLE");
    });

    it("should format LIQUIDATION", () => {
      expect(getTransactionLabel("LIQUIDATION")).toBe("SOLDE CLÔTURE COMPTE");
    });

    it("should format INTEREST_PAYMENT", () => {
      expect(getTransactionLabel("INTEREST_PAYMENT")).toBe("INTÉRÊTS CRÉDITEURS");
    });

    it("should format BANK_FEE", () => {
      expect(getTransactionLabel("BANK_FEE")).toBe("FRAIS BANCAIRES");
    });
  });

  describe("should handle edge cases", () => {
    it("should return OPÉRATION for null type", () => {
      expect(getTransactionLabel(null)).toBe("OPÉRATION");
    });

    it("should return OPÉRATION for undefined type", () => {
      expect(getTransactionLabel(undefined)).toBe("OPÉRATION");
    });

    it("should humanize unknown technical codes", () => {
      expect(getTransactionLabel("SOME_UNKNOWN_TYPE")).toBe("Some Unknown Type");
    });

    it("should humanize single word codes", () => {
      expect(getTransactionLabel("WITHDRAWAL")).toBe("Withdrawal");
    });
  });
});

// ============================================================================
// formatTransactionDescription
// ============================================================================

describe("formatTransactionDescription", () => {
  it("should return label only when no observations", () => {
    const desc = formatTransactionDescription("DEPOSIT_SAVINGS", null);
    expect(desc).toBe("VERSEMENT ÉPARGNE");
  });

  it("should return label only when observations are empty", () => {
    const desc = formatTransactionDescription("DEPOSIT_SAVINGS", "  ");
    expect(desc).toBe("VERSEMENT ÉPARGNE");
  });

  it("should combine label and observations when different", () => {
    const desc = formatTransactionDescription(
      "TRANSFER_OUT",
      "Loyer janvier",
      { compteDestNumero: "001-123" }
    );
    expect(desc).toBe("VIR ÉMIS vers 001-123 - Loyer janvier");
  });

  it("should not duplicate if observation equals type", () => {
    const desc = formatTransactionDescription("TRANSFER_OUT", "TRANSFER_OUT");
    expect(desc).toBe("VIR ÉMIS");
  });

  it("should clean common prefixes from observations", () => {
    const desc = formatTransactionDescription(
      "TRANSFER_OUT",
      "Virement vers compte courant"
    );
    expect(desc).toContain("compte courant");
    expect(desc).not.toContain("Virement vers");
  });

  it("should return just the label when cleaned observation matches label", () => {
    const desc = formatTransactionDescription("DEPOSIT_SAVINGS", "Versement ");
    expect(desc).toBe("VERSEMENT ÉPARGNE");
  });
});

// ============================================================================
// Integration Tests - Real World Scenarios
// ============================================================================

describe("Real-world transaction scenarios", () => {
  describe("Virement programmé (Scheduled Transfer)", () => {
    it("should correctly classify and label outgoing scheduled transfer", () => {
      const typePaiement = "TRANSFER_OUT";
      const sens = deriveSensFromType(typePaiement);
      const label = getTransactionLabel(typePaiement, {
        compteDestNumero: "001-DEST-456",
      });

      expect(sens).toBe("DEBIT");
      expect(label).toBe("VIR ÉMIS vers 001-DEST-456");
    });

    it("should correctly classify and label incoming scheduled transfer", () => {
      const typePaiement = "TRANSFER_IN";
      const sens = deriveSensFromType(typePaiement);
      const label = getTransactionLabel(typePaiement, {
        compteSourceNumero: "002-SRC-789",
      });

      expect(sens).toBe("CREDIT");
      expect(label).toBe("VIR REÇU de 002-SRC-789");
    });
  });

  describe("Dépôt espèces (Cash Deposit)", () => {
    it("should handle savings deposit correctly", () => {
      const typePaiement = "DEPOSIT_SAVINGS";
      const sens = deriveSensFromType(typePaiement);
      const description = formatTransactionDescription(
        typePaiement,
        "Épargne mensuelle"
      );

      expect(sens).toBe("CREDIT");
      expect(description).toBe("VERSEMENT ÉPARGNE - Épargne mensuelle");
    });
  });

  describe("Remboursement crédit (Loan Repayment)", () => {
    it("should handle credit repayment correctly", () => {
      const typePaiement = "CREDIT_REPAYMENT";
      const sens = deriveSensFromType(typePaiement);
      const label = getTransactionLabel(typePaiement, {
        numeroCredit: "CR-2026-00123",
      });

      expect(sens).toBe("DEBIT");
      expect(label).toBe("REMB. CRÉDIT N°CR-2026-00123");
    });
  });

  describe("Tontine cycle", () => {
    it("should classify contribution as DEBIT and benefit as CREDIT", () => {
      const contribution = {
        type: "TONTINE_CONTRIBUTION",
        sens: deriveSensFromType("TONTINE_CONTRIBUTION"),
        label: getTransactionLabel("TONTINE_CONTRIBUTION", {
          tontineName: "Les Amis",
        }),
      };

      const benefit = {
        type: "TONTINE_WITHDRAWAL",
        sens: deriveSensFromType("TONTINE_WITHDRAWAL"),
        label: getTransactionLabel("TONTINE_WITHDRAWAL", {
          tontineName: "Les Amis",
        }),
      };

      expect(contribution.sens).toBe("DEBIT");
      expect(contribution.label).toBe("COTISATION TONTINE Les Amis");

      expect(benefit.sens).toBe("CREDIT");
      expect(benefit.label).toBe("BÉNÉFICE TONTINE Les Amis");
    });
  });

  describe("Mobile Money operations", () => {
    it("should classify deposit as CREDIT and withdrawal as DEBIT", () => {
      expect(deriveSensFromType("MOBILE_MONEY_DEPOSIT")).toBe("CREDIT");
      expect(deriveSensFromType("MOBILE_MONEY_WITHDRAWAL")).toBe("DEBIT");
    });
  });
});
