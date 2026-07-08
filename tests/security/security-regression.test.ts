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
import { createLogger } from "server/lib/logger";
import { D, roundMoney, roundFCFA, roundRate, splitEvenly, isEffectivelyZero } from "server/lib/money";

const logger = createLogger('SecurityTest');

const PROJECT_ROOT = resolve(__dirname, "../..");
const ROOT = resolve(PROJECT_ROOT, "apps/api");

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
      logger.warn({ violations }, "App-layer arithmetic on coffre/caisse solde detected");
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

// ============================================================================
// APPSEC — Session fixation prevention
// ============================================================================

describe("Session fixation — Session regeneration on login", () => {

  it("auth routes should call session.regenerate before setting session data on login", () => {
    const content = readFileSync(join(ROOT, "routes/auth.ts"), "utf-8");
    const regenerateIdx = content.indexOf("req.session.regenerate");
    const setUserIdx = content.indexOf("req.session.userId = user.id");
    // regenerate must appear BEFORE the first session assignment
    expect(regenerateIdx).toBeGreaterThan(-1);
    expect(setUserIdx).toBeGreaterThan(-1);
    expect(regenerateIdx).toBeLessThan(setUserIdx);
  });
});

// ============================================================================
// APPSEC — No hardcoded session secrets in production
// ============================================================================

describe("Session secret — No hardcoded fallback in production", () => {

  it("auth.ts should crash if SESSION_SECRET is missing in production", () => {
    const content = readFileSync(join(ROOT, "auth.ts"), "utf-8");
    expect(content).toContain("process.exit(1)");
    expect(content).not.toContain("cofin-secret-key-change-in-production");
  });

  it("ws-server.ts should not use the old hardcoded secret", () => {
    const content = readFileSync(join(ROOT, "ws-server.ts"), "utf-8");
    expect(content).not.toContain("cofin-secret-key-change-in-production");
  });
});

// ============================================================================
// APPSEC — Cryptographic randomness for security-critical operations
// ============================================================================

describe("Cryptographic randomness — No Math.random in security code", () => {

  it("OTP generation should use crypto.randomInt, not Math.random", () => {
    const content = readFileSync(join(ROOT, "routes/otp.ts"), "utf-8");
    expect(content).toContain("crypto.randomInt");
    // Check Math.random is not used for OTP generation
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("Math.random") && lines[i].includes("otpCode")) {
        throw new Error(`Math.random used for OTP at line ${i + 1}`);
      }
    }
  });

  it("security code generation should use crypto.randomInt", () => {
    const content = readFileSync(join(ROOT, "services/caisse/access-control-service.ts"), "utf-8");
    // Find the generateSecurityCode function
    const fnStart = content.indexOf("function generateSecurityCode");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = content.substring(fnStart, fnStart + 500);
    expect(fnBlock).toContain("crypto.randomInt");
    expect(fnBlock).not.toContain("Math.random");
  });

  it("secure OTP service should use crypto.randomInt and HMAC", () => {
    const content = readFileSync(join(ROOT, "services/notifications/otp/otp-service.ts"), "utf-8");
    expect(content).toContain("crypto.randomInt");
    expect(content).toContain("createHmac");
    expect(content).toContain("timingSafeEqual");
  });
});

// ============================================================================
// APPSEC — Authentication on sensitive endpoints
// ============================================================================

describe("Authentication — All reevaluation endpoints require auth", () => {

  it("reevaluation GET endpoints should have requireAuth middleware", () => {
    const content = readFileSync(join(ROOT, "routes/reevaluations.ts"), "utf-8");
    // All app.get routes for reevaluations should include requireAuth
    const getRoutes = content.match(/app\.get\("\/api\/demandes\/:demandeId\/(reevaluation|reevaluations|timeline)"[^)]+\)/g);
    expect(getRoutes).toBeTruthy();
    for (const route of getRoutes!) {
      expect(route).toContain("requireAuth");
    }
  });
});

// ============================================================================
// APPSEC — No open redirects
// ============================================================================

describe("Open redirect — Storage route rejects external URLs", () => {

  it("storage file route should not redirect to external URLs", () => {
    const content = readFileSync(join(ROOT, "routes/storage.ts"), "utf-8");
    // Should NOT contain res.redirect(key) for user-supplied keys
    expect(content).not.toMatch(/res\.redirect\(key\)/);
    expect(content).not.toMatch(/res\.redirect\(rawKey\)/);
  });
});

// ============================================================================
// APPSEC — No debug console.log in production handlers
// ============================================================================

describe("Debug logging — No console.log in webhook handlers", () => {

  it("payments.ts should not contain console.log", () => {
    const content = readFileSync(join(ROOT, "routes/payments.ts"), "utf-8");
    expect(content).not.toMatch(/console\.log/);
  });
});

// ============================================================================
// APPSEC — XSS prevention via DOMPurify
// ============================================================================

describe("XSS prevention — dangerouslySetInnerHTML uses DOMPurify", () => {

  it("NotificationPreview should sanitize HTML with DOMPurify", () => {
    const content = readFileSync(
      resolve(PROJECT_ROOT, "apps/web/src/components/admin/notifications/NotificationPreview.tsx"),
      "utf-8"
    );
    expect(content).toContain("DOMPurify");
    expect(content).toContain("DOMPurify.sanitize");
  });
});

// ============================================================================
// APPSEC — Docker runs as non-root user
// ============================================================================

describe("Docker — Non-root execution", () => {

  it("Dockerfile should have a USER directive", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, "Dockerfile"), "utf-8");
    expect(content).toMatch(/^USER\s+\S+/m);
    expect(content).not.toMatch(/USER\s+root/);
  });
});

// ============================================================================
// APPSEC — No default passwords in docker-compose
// ============================================================================

describe("Docker Compose — No hardcoded passwords", () => {

  it("docker-compose.yml should not contain hardcoded default passwords", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, "docker-compose.yml"), "utf-8");
    expect(content).not.toContain("admin123");
    expect(content).not.toContain("minioadmin123");
  });
});

// ============================================================================
// APPSEC — Production env template has no real credentials
// ============================================================================

describe("Environment — No real credentials in example files", () => {

  it(".env.production.example should not contain real-looking passwords", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, ".env.production.example"), "utf-8");
    expect(content).not.toMatch(/Admin123/);
    expect(content).not.toMatch(/MICROFLEX_SECRET_2026/);
  });
});

// ============================================================================
// APPSEC — Global error handler sanitizes errors in production
// ============================================================================

describe("Error handler — Production error sanitization", () => {

  it("index.ts global error handler should not expose err.message in production", () => {
    const content = readFileSync(resolve(ROOT, "index.ts"), "utf-8");
    // Should check NODE_ENV before exposing error message
    expect(content).toContain("isProduction && status >= 500");
    expect(content).toContain("Erreur interne du serveur");
  });
});

// ============================================================================
// APPSEC — Legacy OTP timing-safe comparison
// ============================================================================

describe("Legacy OTP — Timing-safe comparison", () => {

  it("legacy OTP validate should use timingSafeEqual", () => {
    const content = readFileSync(join(ROOT, "routes/otp.ts"), "utf-8");
    // Find the validate endpoint section
    const validateSection = content.substring(content.indexOf("/api/otp/validate"));
    expect(validateSection).toContain("timingSafeEqual");
    expect(validateSection).not.toMatch(/otpRecord\.otpCode\s*!==\s*otpCode/);
  });

  it("legacy OTP validate should not expose error.message", () => {
    const content = readFileSync(join(ROOT, "routes/otp.ts"), "utf-8");
    const validateSection = content.substring(content.indexOf("/api/otp/validate"));
    expect(validateSection).not.toContain("details: error.message");
  });
});

// ============================================================================
// APPSEC — Password minimum length
// ============================================================================

describe("Password policy — Minimum length >= 12", () => {

  it("default password requirements should have minLength >= 12", () => {
    const content = readFileSync(resolve(ROOT, "audit.ts"), "utf-8");
    const match = content.match(/minLength:\s*(\d+)/);
    expect(match).toBeTruthy();
    expect(parseInt(match![1])).toBeGreaterThanOrEqual(12);
  });

  it("seed securitySettings should have passwordMinLength >= 12", () => {
    const content = readFileSync(resolve(ROOT, "../../seeds/seed-prod.ts"), "utf-8");
    const matches = content.match(/passwordMinLength:\s*(\d+)/g);
    expect(matches).toBeTruthy();
    for (const m of matches!) {
      const val = parseInt(m.match(/(\d+)/)![1]);
      expect(val).toBeGreaterThanOrEqual(12);
    }
  });
});

// ============================================================================
// APPSEC — Session timeout alignment
// ============================================================================

describe("Session timeout — Aligned with ABSOLUTE_TIMEOUT_MS", () => {

  it("login flow should use SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS for session tracking", () => {
    const content = readFileSync(join(ROOT, "routes/auth.ts"), "utf-8");
    // Should NOT have hardcoded 24h in session tracking
    expect(content).not.toMatch(/expiresAt.*24 \* 60 \* 60 \* 1000/);
    expect(content).toContain("SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS");
  });
});

// ============================================================================
// APPSEC — CSRF protection middleware exists
// ============================================================================

describe("CSRF — Origin/Referer validation middleware", () => {

  it("CSRF middleware should exist", () => {
    const content = readFileSync(resolve(ROOT, "middleware/csrf.ts"), "utf-8");
    expect(content).toContain("csrfProtection");
    expect(content).toContain("Origin");
    expect(content).toContain("Referer");
  });

  it("CSRF middleware should be registered in index.ts", () => {
    const content = readFileSync(resolve(ROOT, "index.ts"), "utf-8");
    expect(content).toContain("csrfProtection");
  });
});

// ============================================================================
// APPSEC — File upload authorization check
// ============================================================================

describe("File upload — Ownership verification", () => {

  it("storage entity upload should check user authorization", () => {
    const content = readFileSync(join(ROOT, "routes/storage.ts"), "utf-8");
    const uploadSection = content.substring(content.indexOf("entity/upload"));
    expect(uploadSection).toContain("isPrivileged");
    expect(uploadSection).toContain("ability");
  });
});

// ============================================================================
// APPSEC — No Math.random() in security-critical server code
// ============================================================================

describe("Math.random() elimination — Server-side references and IDs", () => {

  const SERVER_CRITICAL_FILES = [
    "storage/finance.ts",
    "services/comptes.ts",
    "routes/finance.ts",
    "routes/hr.ts",
    "routes/accounting.ts",
    "services/coffre/transfert-service.ts",
    "services/coffre/transfer-executor.ts",
    "services/caisse/session-opening-service.ts",
    "services/ledger.ts",
    "services/prospection-prime-service.ts",
    "services/hr-accounting-service.ts",
    "services/financial-monitoring-service.ts",
    "services/agency-migration.ts",
    "services/caisse-agent/operation-service.ts",
    "services/transfert-inter-coffres/transfert-service.ts",
    "services/hr-import-service.ts",
    "storage/operations.ts",
    "storage/tontines.ts",
    "mobile-money-service.ts",
    "lib/logger.ts",
  ];

  it("should not use Math.random() for reference/ID generation in any critical server file", () => {
    const violations: string[] = [];
    for (const relPath of SERVER_CRITICAL_FILES) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Math.random()") && !lines[i].trim().startsWith("//") && !lines[i].trim().startsWith("*")) {
          violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("should use crypto.randomInt or crypto.randomBytes instead", () => {
    for (const relPath of SERVER_CRITICAL_FILES) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      // Each file should have at least one crypto call
      const hasCrypto = content.includes("randomInt") || content.includes("randomBytes");
      if (!hasCrypto) {
        // File may not need crypto (e.g. logger uses it for request IDs)
        // Verify no ID/reference generation exists
        expect(content).not.toMatch(/Math\.random/);
      }
    }
  });
});

// ============================================================================
// APPSEC — No Math.random() in client-side security code
// ============================================================================

describe("Math.random() elimination — Client-side security code", () => {

  const CLIENT_CRITICAL_FILES = [
    "components/hr/EmployeeProfileDrawer.tsx",
    "components/finance/operations/TransactionVerificationWrapper.tsx",
    "lib/criticalOperations.ts",
    "services/otpService.ts",
    "components/finance/caisse/CaissePaiementModal.tsx",
    "components/finance/caisse/CaisseTransferts.tsx",
    "components/agent/AgentTerrainPaiement.tsx",
    "contexts/WebSocketContext.tsx",
    "lib/offline-db.ts",
    "components/finance/operations/CompteBloqueForm.tsx",
  ];

  it("should not use Math.random() for passwords, codes, references, or tokens", () => {
    const clientRoot = resolve(PROJECT_ROOT, "apps/web/src");
    const violations: string[] = [];
    for (const relPath of CLIENT_CRITICAL_FILES) {
      const content = readFileSync(join(clientRoot, relPath), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Math.random()") && !lines[i].trim().startsWith("//") && !lines[i].trim().startsWith("*")) {
          violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

});

// ============================================================================
// APPSEC — Shared schema uses crypto for agence code
// ============================================================================

describe("Schema — Agency code generation uses crypto", () => {

  it("settings.ts should use crypto.randomInt for agency code", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, "packages/shared/schema/settings.ts"), "utf-8");
    const genFn = content.substring(content.indexOf("generateAgenceCode"), content.indexOf("generateAgenceCode") + 300);
    expect(genFn).toContain("crypto.randomInt");
    expect(genFn).not.toContain("Math.random");
  });
});

// ============================================================================
// APPSEC — No default passwords in env template
// ============================================================================

describe("Environment — No default passwords in production template", () => {

  it(".env.production.example should not contain ChangeMeInProduction", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, ".env.production.example"), "utf-8");
    expect(content).not.toContain("ChangeMeInProduction");
  });

  it(".env.production.example SESSION_SECRET should be empty", () => {
    const content = readFileSync(resolve(PROJECT_ROOT, ".env.production.example"), "utf-8");
    expect(content).toMatch(/SESSION_SECRET=\s*$/m);
  });
});

// ============================================================================
// APPSEC — Decimal.js for financial arithmetic (no floating-point drift)
// ============================================================================

describe("Decimal precision — money.ts utility functions", () => {

  it("D() should convert string|number|null to Decimal", () => {
    expect(D("123.45").toNumber()).toBe(123.45);
    expect(D(100).toNumber()).toBe(100);
    expect(D(null).toNumber()).toBe(0);
    expect(D(undefined).toNumber()).toBe(0);
    expect(D("").toNumber()).toBe(0);
  });

  it("roundMoney() should round to 2 decimal places", () => {
    expect(roundMoney(D("1.005"))).toBe("1.01");
    expect(roundMoney(D("1.004"))).toBe("1.00");
    expect(roundMoney(D("99.999"))).toBe("100.00");
  });

  it("roundFCFA() should round to 0 decimal places (FCFA has no centimes)", () => {
    expect(roundFCFA(D("1000.6"))).toBe("1001");
    expect(roundFCFA(D("1000.4"))).toBe("1000");
    expect(roundFCFA(D("999.5"))).toBe("1000");
  });

  it("roundRate() should round to 4 decimal places", () => {
    expect(roundRate(D("0.12345"))).toBe("0.1235");
    expect(roundRate(D("0.12344"))).toBe("0.1234");
  });

  it("isEffectivelyZero() should detect near-zero amounts", () => {
    expect(isEffectivelyZero(D("0.001"))).toBe(true);
    expect(isEffectivelyZero(D("-0.005"))).toBe(true);
    expect(isEffectivelyZero(D("0.01"))).toBe(false);
    expect(isEffectivelyZero(D("1"))).toBe(false);
  });

  it("splitEvenly() should distribute total across N parts with no loss", () => {
    const parts = splitEvenly(D("1000"), 3);
    expect(parts.length).toBe(3);
    // Sum must equal exactly 1000 (no floating-point loss)
    const sum = parts.reduce((acc, p) => acc.plus(p), D(0));
    expect(sum.toNumber()).toBe(1000);
    // First two parts = 333.33, last = 333.34
    expect(parts[0].toNumber()).toBe(333.33);
    expect(parts[1].toNumber()).toBe(333.33);
    expect(parts[2].toNumber()).toBe(333.34);
  });

  it("Decimal division then multiplication should not lose precision (unlike float)", () => {
    // Classic float failure: 0.1 + 0.2 !== 0.3 with Number
    const floatResult = 0.1 + 0.2;
    expect(floatResult).not.toBe(0.3); // float fails (gives 0.30000000000000004)

    // Decimal should preserve precision through splitEvenly
    const parts = splitEvenly(D("1000"), 3);
    const decimalSum = parts.reduce((acc, p) => acc.plus(p), D(0));
    expect(decimalSum.eq(1000)).toBe(true); // Decimal succeeds
  });
});

describe("Decimal precision — critical files use Decimal imports", () => {

  const DECIMAL_FILES = [
    "services/interest-scheduler.ts",
    "services/repayment-allocation-service.ts",
    "services/credit-allocation-service.ts",
    "storage/finance.ts",
    "routes/finance.ts",
    "routes/config.ts",
  ];

  it("all critical financial files should import from money.ts", () => {
    for (const relPath of DECIMAL_FILES) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      expect(content).toContain("from \"../lib/money\"");
    }
  });

  it("schedule generation should not use raw toFixed(2) for installment amounts", () => {
    // storage/finance.ts and routes/finance.ts should use roundMoney/splitEvenly
    for (const relPath of ["storage/finance.ts", "routes/finance.ts"]) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      // Should not have the old pattern: capitalPerInstallment.toFixed(2)
      expect(content).not.toMatch(/capitalPerInstallment\.toFixed/);
      expect(content).not.toMatch(/interestPerInstallment\.toFixed/);
      expect(content).not.toMatch(/installmentAmount\.toFixed/);
    }
  });

  it("interest-scheduler should not use parseFloat for interest calculation", () => {
    const content = readFileSync(join(ROOT, "services/interest-scheduler.ts"), "utf-8");
    // The daily interest calculation section should not contain parseFloat
    const dailySection = content.substring(
      content.indexOf("runDailyAccrual"),
      content.indexOf("runMonthlyCapitalization")
    );
    expect(dailySection).not.toContain("parseFloat");
  });

  it("repayment-allocation should not use Math.round for capital/interest split", () => {
    const content = readFileSync(join(ROOT, "services/repayment-allocation-service.ts"), "utf-8");
    // Should not have the old pattern: Math.round(montantAAllouer * ratioCapital * 100) / 100
    expect(content).not.toMatch(/Math\.round\(montantAAllouer\s*\*\s*ratio/);
  });

  it("credit-allocation should not use Math.round for interest calculation", () => {
    const content = readFileSync(join(ROOT, "services/credit-allocation-service.ts"), "utf-8");
    // Should not have old pattern: Math.round(interetsJournaliers * joursRetard * 100) / 100
    expect(content).not.toMatch(/Math\.round\(interetsJournaliers/);
  });

  it("config routes should not use Math.round for installment amounts", () => {
    const content = readFileSync(join(ROOT, "routes/config.ts"), "utf-8");
    expect(content).not.toMatch(/Math\.round\(montantEcheance\)/);
    expect(content).not.toMatch(/Math\.round\(montantTotal\)/);
  });
});
