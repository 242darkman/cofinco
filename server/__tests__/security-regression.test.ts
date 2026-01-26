/**
 * Tests de régression sécurité — Coffre-fort & Caisse
 *
 * Vérifie automatiquement que les bonnes pratiques de sécurité
 * sont maintenues dans le code source :
 * - Pas de `as any` sur typePaiement (avec des strings invalides)
 * - Toutes les mutations de coffre/caisse passent par les guards
 * - Pas d'arithmétique app-layer sur les soldes
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(__dirname, "..");

/**
 * Recursively collect all .ts files under a directory (excluding node_modules, __tests__, .d.ts)
 */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "dist") continue;
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

// ============================================================================
// TYPEPAIEMENT — No invalid `as any` casts on string literals
// ============================================================================

describe("typePaiement — No dynamic French strings", () => {

  it("should not contain French string typePaiement patterns (e.g. 'Dépôt', 'Retrait')", () => {
    const serviceFiles = collectTsFiles(join(ROOT, "services"));
    const storageFiles = collectTsFiles(join(ROOT, "storage"));
    const routeFiles = collectTsFiles(join(ROOT, "routes"));
    const allFiles = [...serviceFiles, ...storageFiles, ...routeFiles];

    const violations: string[] = [];
    const frenchPatterns = [
      /typePaiement:\s*[`"']Dépôt/,
      /typePaiement:\s*[`"']Retrait/,
      /typePaiement:\s*[`"']Liquidation Suppression/,
      /typePaiement:\s*[`"']INTERETS[`"']/,
    ];

    for (const file of allFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of frenchPatterns) {
          if (pattern.test(lines[i])) {
            const relPath = file.replace(ROOT + "/", "");
            violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================================
// COFFRE BALANCE — No app-layer arithmetic on coffre solde
// ============================================================================

describe("Coffre balance — No app-layer arithmetic", () => {

  it("should not use parseFloat(coffre.solde) + amount pattern in transaction callbacks", () => {
    const serviceFiles = collectTsFiles(join(ROOT, "services"));
    const storageFiles = collectTsFiles(join(ROOT, "storage"));
    const allFiles = [...serviceFiles, ...storageFiles];

    const violations: string[] = [];
    // Pattern: direct computation on coffre/caisse solde followed by .set({ solde: ... })
    // This catches app-layer arithmetic that should use updateCoffreBalance/updateCaisseBalance
    const dangerousPatterns = [
      // Direct string-to-number coffre solde computation
      /parseFloat\((?:coffre|targetCoffre|coffreSiege)\.solde\s*(?:\|\|\s*["']0["'])?\)\s*[-+]\s*\w+/,
      // Direct set of solde as toString() (should use SQL atomic update)
      /\.set\(\{\s*solde:\s*(?:newSolde|nouveauSolde)\w*\.toString\(\)/,
    ];

    // Files known to be safe (guard module itself, tests)
    const safeFiles = ["coffre-guard.ts"];

    for (const file of allFiles) {
      const filename = file.split("/").pop() || "";
      if (safeFiles.includes(filename)) continue;

      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(lines[i])) {
            const relPath = file.replace(ROOT + "/", "");
            violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      console.warn("App-layer arithmetic on coffre/caisse solde detected:");
      violations.forEach(v => console.warn(`  ${v}`));
    }
    expect(violations).toEqual([]);
  });
});

// ============================================================================
// GUARD COVERAGE — Verify guards are used in key files
// ============================================================================

describe("Guard coverage — Key files use guards", () => {

  it("transfer-executor.ts should import and use assertCoffreCanDebit", () => {
    const content = readFileSync(join(ROOT, "services/coffre/transfer-executor.ts"), "utf-8");
    expect(content).toContain("assertCoffreCanDebit");
    expect(content).toContain("assertCaisseCanDebit");
    expect(content).toContain("updateCoffreBalance");
    expect(content).toContain("updateCaisseBalance");
  });

  it("finance.ts should import coffre guards for disbursement functions", () => {
    const content = readFileSync(join(ROOT, "storage/finance.ts"), "utf-8");
    expect(content).toContain("assertCoffreCanDebit");
    expect(content).toContain("assertCoffreCanCredit");
    expect(content).toContain("updateCoffreBalance");
  });

  it("caisse-liquidation-service.ts should use guards", () => {
    const content = readFileSync(join(ROOT, "services/caisse-liquidation-service.ts"), "utf-8");
    expect(content).toContain("assertCaisseCanDebit");
    expect(content).toContain("updateCaisseBalance");
    expect(content).toContain("updateCoffreBalance");
  });

  it("transfert-service.ts should check plafond journalier at creation", () => {
    const content = readFileSync(join(ROOT, "services/coffre/transfert-service.ts"), "utf-8");
    expect(content).toContain("getDailyCoffreTotal");
    expect(content).toContain("PLAFOND_JOURNALIER_DEPASSE");
    // Should NOT have the old TODO
    expect(content).not.toContain("TODO: Implémenter la vérification du plafond journalier");
  });
});

// ============================================================================
// BROADCAST COVERAGE — Verify balance broadcasts exist
// ============================================================================

describe("Broadcast coverage — Balance updates are broadcast", () => {

  it("transfer-executor.ts should broadcast balance updates", () => {
    const content = readFileSync(join(ROOT, "services/coffre/transfer-executor.ts"), "utf-8");
    expect(content).toContain("broadcastBalanceUpdate");
  });

  it("finance.ts should broadcast coffre balance updates", () => {
    const content = readFileSync(join(ROOT, "storage/finance.ts"), "utf-8");
    expect(content).toContain("balanceService.broadcastBalanceUpdate");
  });

  it("caisse-liquidation-service.ts should broadcast balance updates", () => {
    const content = readFileSync(join(ROOT, "services/caisse-liquidation-service.ts"), "utf-8");
    expect(content).toContain("broadcastBalanceUpdate");
  });
});

// ============================================================================
// ERROR HANDLING — Route handlers catch guard errors
// ============================================================================

describe("Error handling — Routes catch guard errors", () => {

  it("finance routes should handle isCoffreCaisseError", () => {
    const content = readFileSync(join(ROOT, "routes/finance.ts"), "utf-8");
    expect(content).toContain("isCoffreCaisseError");
    // Count occurrences — should appear in at least 2 catch blocks
    const matches = content.match(/isCoffreCaisseError/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});
