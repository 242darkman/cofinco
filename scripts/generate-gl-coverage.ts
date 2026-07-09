#!/usr/bin/env tsx
/**
 * GL Coverage Matrix Generator
 *
 * Queries the live database and generates:
 *   1. docs/audit/GL_COVERAGE_MATRIX.generated.md  (human-readable)
 *   2. docs/audit/gl_coverage.json                  (machine-readable)
 *
 * EXIT 1 if any required event type lacks a rule, or if any
 * referenced account/journal does not exist.
 *
 * Run via Docker:
 *   docker exec microflex-app node --import tsx scripts/generate-gl-coverage.ts
 */

import { db, pool } from "../apps/api/db";
import { accountingRules } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED EVENT TYPES — authoritative list of all event_types that must
// have at least one active accounting rule.  Sourced from seed-prod.ts.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_EVENT_TYPES = [
  // Account deposits
  "DEPOSIT_CURRENT",
  "DEPOSIT_SAVINGS",
  "DEPOSIT_BLOCKED",
  "INITIAL_DEPOSIT",
  // Account withdrawals
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
  "SALARY_PAYMENT",
  // Interest
  "INTEREST_PAYMENT",
  "CREDIT_INTEREST_ACCRUAL",
  "CREDIT_INTEREST_COLLECTION",
  // Frais de cycle de vie des comptes (ouverture, tenue, clôture, restitution)
  "OPENING_FEE",
  "MAINTENANCE_FEE_CURRENT",
  "MAINTENANCE_FEE_SAVINGS",
  "MAINTENANCE_FEE_BLOCKED",
  "CLOSING_FEE_CURRENT",
  "CLOSING_FEE_SAVINGS",
  "CLOSING_FEE_BLOCKED",
  "CLOSURE_PAYOUT_CURRENT",
  "CLOSURE_PAYOUT_SAVINGS",
  "CLOSURE_PAYOUT_BLOCKED",
  "FEE_REFUND",
  // Sync offline (alias crédit) — utilisés par le journal de synchronisation
  "LOAN_DISBURSEMENT",
  "LOAN_REPAYMENT",
  // Agents terrain — sessions et écarts
  "AGENT_COMMISSION",
  "AGENT_PROVISIONING",
  "AGENT_SESSION_CLOSE",
  "AGENT_ECART_DEFICIT",
  "AGENT_ECART_SURPLUS",
  "AGENT_WITHDRAWAL_CURRENT",
  "AGENT_WITHDRAWAL_SAVINGS",
  // Mobile Money — revenus de frais
  "MM_FEE_REVENUE",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Domain grouping for readable output
// ─────────────────────────────────────────────────────────────────────────────

function getDomain(eventType: string): string {
  if (eventType.startsWith("DEPOSIT") || eventType === "INITIAL_DEPOSIT") return "Comptes - Depots";
  if (eventType.startsWith("WITHDRAWAL")) return "Comptes - Retraits";
  if (eventType.includes("TRANSFER")) return "Virements";
  if (eventType.startsWith("CREDIT") || eventType === "ENGAGEMENT_FEE") return "Credits";
  if (eventType.startsWith("TONTINE") || eventType === "COMMISSION") return "Tontines";
  if (eventType.includes("COFFRE") || eventType.includes("CAISSE") || eventType === "SAFE_SUPPLY" || eventType === "RESTITUTION" || eventType === "LIQUIDATION" || eventType === "ENTREE_COFFRE" || eventType === "SORTIE_COFFRE") return "Coffre / Caisse";
  if (eventType.startsWith("EVACUATION")) return "Evacuation Coffre";
  if (eventType.startsWith("SESSION")) return "Sessions Caisse";
  if (["MISC_COLLECTION", "CASH_TRANSFER", "SETTLEMENT_CASH", "COLLECT_CASH"].includes(eventType)) return "Agents Terrain";
  if (["OPERATOR_FEE", "REVERSAL_COLLECTION", "REVERSAL_PAYOUT"].includes(eventType)) return "Mobile Money";
  if (["PAYROLL_ENGAGEMENT", "PAYROLL_PAYMENT", "PROSPECTION_PRIME", "SALARY_ADVANCE"].includes(eventType)) return "Payroll / RH";
  if (eventType === "INTEREST_PAYMENT") return "Interets";
  return "Autres";
}

// ─────────────────────────────────────────────────────────────────────────────

interface RuleRow {
  code: string;
  eventType: string;
  sourceType: string;
  debitAccount: string;
  creditAccount: string;
  journalCode: string;
  paymentMethod: string | null;
  provider: string | null;
  priority: number | null;
}

interface AccountRow {
  numero_compte: string;
  intitule: string;
}

interface JournalRow {
  code: string;
  intitule: string;
}

interface CoverageEntry {
  eventType: string;
  domain: string;
  status: "OK" | "MISSING";
  ruleCount: number;
  rules: Array<{
    code: string;
    debit: string;
    credit: string;
    journal: string;
    paymentMethod: string | null;
    provider: string | null;
  }>;
  accountIssues: string[];
  journalIssues: string[];
}

async function main() {
  console.log("=== GL COVERAGE MATRIX GENERATOR ===\n");

  // 1. Fetch all active rules
  const rules = await db
    .select({
      code: accountingRules.code,
      eventType: accountingRules.eventType,
      sourceType: accountingRules.sourceType,
      debitAccount: accountingRules.debitAccount,
      creditAccount: accountingRules.creditAccount,
      journalCode: accountingRules.journalCode,
      paymentMethod: accountingRules.paymentMethod,
      provider: accountingRules.provider,
      priority: accountingRules.priority,
    })
    .from(accountingRules)
    .where(eq(accountingRules.active, true));

  console.log(`Found ${rules.length} active accounting rules`);

  // Group rules by eventType
  const rulesByEvent: Record<string, RuleRow[]> = {};
  for (const rule of rules) {
    if (!rulesByEvent[rule.eventType]) rulesByEvent[rule.eventType] = [];
    rulesByEvent[rule.eventType].push(rule);
  }

  // 2. Fetch all plan comptable accounts
  const accountRows = (await db.execute(
    sql`SELECT numero_compte, intitule FROM plan_comptable`
  )).rows as unknown as AccountRow[];
  const validAccounts = new Set(accountRows.map((a) => a.numero_compte));
  console.log(`Found ${validAccounts.size} plan comptable accounts`);

  // 3. Fetch all journals
  const journalRows = (await db.execute(
    sql`SELECT code, intitule FROM journaux_comptables WHERE actif = true`
  )).rows as unknown as JournalRow[];
  const validJournals = new Set(journalRows.map((j) => j.code));
  console.log(`Found ${validJournals.size} journaux comptables`);

  // 4. Build coverage entries
  const entries: CoverageEntry[] = [];
  let totalMissing = 0;
  let totalAccountIssues = 0;
  let totalJournalIssues = 0;

  for (const eventType of REQUIRED_EVENT_TYPES) {
    const eventRules = rulesByEvent[eventType] || [];
    const entry: CoverageEntry = {
      eventType,
      domain: getDomain(eventType),
      status: eventRules.length > 0 ? "OK" : "MISSING",
      ruleCount: eventRules.length,
      rules: [],
      accountIssues: [],
      journalIssues: [],
    };

    for (const rule of eventRules) {
      entry.rules.push({
        code: rule.code,
        debit: rule.debitAccount,
        credit: rule.creditAccount,
        journal: rule.journalCode,
        paymentMethod: rule.paymentMethod,
        provider: rule.provider,
      });

      // Validate accounts
      if (!validAccounts.has(rule.debitAccount)) {
        entry.accountIssues.push(`${rule.code}: debit ${rule.debitAccount} NOT IN plan_comptable`);
      }
      if (!validAccounts.has(rule.creditAccount)) {
        entry.accountIssues.push(`${rule.code}: credit ${rule.creditAccount} NOT IN plan_comptable`);
      }

      // Validate journal
      if (!validJournals.has(rule.journalCode)) {
        entry.journalIssues.push(`${rule.code}: journal ${rule.journalCode} NOT IN journaux_comptables`);
      }
    }

    if (entry.status === "MISSING") totalMissing++;
    totalAccountIssues += entry.accountIssues.length;
    totalJournalIssues += entry.journalIssues.length;

    entries.push(entry);
  }

  // 5. Detect extra rules not in REQUIRED list
  const requiredSet = new Set<string>(REQUIRED_EVENT_TYPES);
  const extraEventTypes = Object.keys(rulesByEvent).filter((et) => !requiredSet.has(et));

  // 6. Aggregate stats
  const totalOK = entries.filter((e) => e.status === "OK").length;
  const totalRequired = REQUIRED_EVENT_TYPES.length;
  const hasGaps = totalMissing > 0 || totalAccountIssues > 0 || totalJournalIssues > 0;

  // 7. Generate markdown
  const md = generateMarkdown(entries, extraEventTypes, rulesByEvent, {
    totalRules: rules.length,
    totalAccounts: validAccounts.size,
    totalJournals: validJournals.size,
    totalRequired,
    totalOK,
    totalMissing,
    totalAccountIssues,
    totalJournalIssues,
  });

  // 8. Generate JSON
  const json = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRules: rules.length,
      totalAccounts: validAccounts.size,
      totalJournals: validJournals.size,
      requiredEventTypes: totalRequired,
      covered: totalOK,
      missing: totalMissing,
      accountIssues: totalAccountIssues,
      journalIssues: totalJournalIssues,
      coveragePercent: Math.round((totalOK / totalRequired) * 10000) / 100,
      status: hasGaps ? "FAIL" : "PASS",
    },
    entries,
    extraEventTypes,
  };

  // 9. Write files
  const outDir = path.resolve(process.cwd(), "docs/audit");
  fs.mkdirSync(outDir, { recursive: true });

  const mdPath = path.join(outDir, "GL_COVERAGE_MATRIX.generated.md");
  fs.writeFileSync(mdPath, md, "utf-8");
  console.log(`\nWrote ${mdPath}`);

  const jsonPath = path.join(outDir, "gl_coverage.json");
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), "utf-8");
  console.log(`Wrote ${jsonPath}`);

  // 10. Final verdict
  console.log("\n=== RESULTAT ===");
  console.log(`Couverture: ${totalOK} OK / ${totalRequired} requis (${json.summary.coveragePercent}%)`);
  if (totalMissing > 0) {
    console.log(`MANQUANTS: ${entries.filter((e) => e.status === "MISSING").map((e) => e.eventType).join(", ")}`);
  }
  if (totalAccountIssues > 0) {
    console.log(`Comptes invalides: ${totalAccountIssues}`);
  }
  if (totalJournalIssues > 0) {
    console.log(`Journaux invalides: ${totalJournalIssues}`);
  }

  await pool.end();

  if (hasGaps) {
    console.log("\nFAIL — des ecarts existent, EXIT 1");
    process.exit(1);
  }

  console.log("\nPASS — couverture 100%, aucun ecart");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────

function generateMarkdown(
  entries: CoverageEntry[],
  extraEventTypes: string[],
  rulesByEvent: Record<string, RuleRow[]>,
  stats: {
    totalRules: number;
    totalAccounts: number;
    totalJournals: number;
    totalRequired: number;
    totalOK: number;
    totalMissing: number;
    totalAccountIssues: number;
    totalJournalIssues: number;
  }
): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const coveragePct = Math.round((stats.totalOK / stats.totalRequired) * 10000) / 100;

  let md = "";
  md += `# GL COVERAGE MATRIX (Auto-Generated)\n\n`;
  md += `> **Generated**: ${now} UTC\n`;
  md += `> **Status**: ${stats.totalMissing === 0 && stats.totalAccountIssues === 0 && stats.totalJournalIssues === 0 ? "PASS" : "FAIL"}\n\n`;

  // Summary box
  md += `## Resume\n\n`;
  md += `| Metrique | Valeur |\n`;
  md += `|----------|--------|\n`;
  md += `| Regles comptables actives | ${stats.totalRules} |\n`;
  md += `| Comptes plan comptable | ${stats.totalAccounts} |\n`;
  md += `| Journaux comptables | ${stats.totalJournals} |\n`;
  md += `| Event types requis | ${stats.totalRequired} |\n`;
  md += `| Couverts (OK) | ${stats.totalOK} |\n`;
  md += `| Manquants | ${stats.totalMissing} |\n`;
  md += `| Comptes invalides | ${stats.totalAccountIssues} |\n`;
  md += `| Journaux invalides | ${stats.totalJournalIssues} |\n`;
  md += `| **Couverture** | **${coveragePct}%** |\n\n`;

  // Group entries by domain
  const byDomain: Record<string, CoverageEntry[]> = {};
  for (const entry of entries) {
    if (!byDomain[entry.domain]) byDomain[entry.domain] = [];
    byDomain[entry.domain].push(entry);
  }

  md += `## Matrice detaillee\n\n`;

  for (const [domain, domainEntries] of Object.entries(byDomain)) {
    md += `### ${domain}\n\n`;
    md += `| Event Type | Statut | Regles | Debit | Credit | Journal |\n`;
    md += `|------------|--------|--------|-------|--------|---------|\n`;

    for (const entry of domainEntries) {
      if (entry.rules.length === 0) {
        md += `| ${entry.eventType} | **MISSING** | 0 | — | — | — |\n`;
      } else if (entry.rules.length === 1) {
        const r = entry.rules[0];
        const suffix = r.paymentMethod ? ` (${r.paymentMethod}${r.provider ? "/" + r.provider : ""})` : "";
        md += `| ${entry.eventType} | OK | ${r.code}${suffix} | ${r.debit} | ${r.credit} | ${r.journal} |\n`;
      } else {
        // Multi-rule: first row
        const r0 = entry.rules[0];
        const suffix0 = r0.paymentMethod ? ` (${r0.paymentMethod}${r0.provider ? "/" + r0.provider : ""})` : "";
        md += `| ${entry.eventType} | OK (${entry.rules.length}) | ${r0.code}${suffix0} | ${r0.debit} | ${r0.credit} | ${r0.journal} |\n`;
        for (let i = 1; i < entry.rules.length; i++) {
          const r = entry.rules[i];
          const suffix = r.paymentMethod ? ` (${r.paymentMethod}${r.provider ? "/" + r.provider : ""})` : "";
          md += `| | | ${r.code}${suffix} | ${r.debit} | ${r.credit} | ${r.journal} |\n`;
        }
      }
    }

    md += `\n`;
  }

  // Account/journal issues
  const allAccountIssues = entries.flatMap((e) => e.accountIssues);
  const allJournalIssues = entries.flatMap((e) => e.journalIssues);

  if (allAccountIssues.length > 0 || allJournalIssues.length > 0) {
    md += `## Ecarts detectes\n\n`;
    if (allAccountIssues.length > 0) {
      md += `### Comptes invalides\n\n`;
      for (const issue of allAccountIssues) md += `- ${issue}\n`;
      md += `\n`;
    }
    if (allJournalIssues.length > 0) {
      md += `### Journaux invalides\n\n`;
      for (const issue of allJournalIssues) md += `- ${issue}\n`;
      md += `\n`;
    }
  }

  // Extra event types
  if (extraEventTypes.length > 0) {
    md += `## Event types supplementaires (non requis)\n\n`;
    for (const et of extraEventTypes) {
      const eventRules = rulesByEvent[et] || [];
      md += `- ${et}: ${eventRules.length} regle(s)\n`;
    }
    md += `\n`;
  }

  md += `---\n*Auto-generated by scripts/generate-gl-coverage.ts — do not edit manually*\n`;

  return md;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
