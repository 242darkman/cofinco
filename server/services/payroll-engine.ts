/**
 * Payroll Engine — Rubrique-driven, Congo-Brazzaville compliant
 *
 * Replaces legacy hardcoded calculation in hr-service.ts.
 *
 * Flow:
 *   1. buildPayrollContext()  — collect employee contract, attendance, leave, benefits, overtime, commissions
 *   2. generateRubriques()    — iterate rubriqueDefinitions by priority, compute each line
 *   3. computeCharges()       — iterate chargeDefinitions, apply rate × assiette
 *   4. computeIRPP()          — Congo-Brazza IRPP with 20% abattement + quotient familial
 *   5. computeTotals()        — brut, retenues, patronal, net
 *   6. persistBulletin()      — write bulletin + payslip_lines in transaction
 */

import { db } from "../db";
import {
  employes,
  bulletinsPaie,
  payslipLines,
  presences,
  avantagesEmployes,
  avantages,
  avancesSalaire,
  StatutAvance,
  BulletinStatus,
  rubriqueDefinitions,
  chargeDefinitions,
  irppBaremes,
  overtimeLog,
  payrollRuns,
  payrollRunIssues,
  PayrollRunStatus,
  payrollConfig,
  type BulletinPaie,
  type RubriqueDefinition,
  type ChargeDefinition,
  type IrppBareme,
  type IrppBracket,
  type PayrollRun,
  type BenefitBreakdownItem,
  type PayrollConfig,
} from "@shared/schema";
import { users } from "@shared/schema/auth";
import { agentsTerrain, prospectionPrimes } from "@shared/schema/operations";
import { eq, and, or, sql, gte, lte, desc, isNull, asc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("PayrollEngine");

// ============================================================================
// TYPES
// ============================================================================

export interface PayslipLineItem {
  code: string;
  libelle: string;
  category: "GAIN" | "RETENUE" | "PATRONAL" | "SUBTOTAL" | "NET" | "INFO";
  base: number;
  taux: number | null;
  montantGain: number;
  montantRetenue: number;
  montantPatronal: number;
  sortOrder: number;
}

interface EmployeeContext {
  employe: typeof employes.$inferSelect;
  user: typeof users.$inferSelect;
  config: PayrollConfig;
  month: string; // YYYY-MM
  year: number;
  monthNum: number;
}

interface PayrollContext extends EmployeeContext {
  // Attendance
  joursTravailles: number;
  heuresTravaillees: number; // in hours
  // Overtime (from overtimeLog)
  overtimeByType: Record<string, number>; // type → hours
  // Leave
  joursConge: number;
  // Benefits
  benefits: BenefitsResolution;
  // Commission (agents terrain)
  commissionAmount: number;
  // Salary advance
  avanceDeduction: number;
  // Prorata
  coefficientProrata: number;
  joursContrat: number;
  joursDansMois: number;
}

interface BenefitsResolution {
  items: BenefitBreakdownItem[];
  total: number;
  imposable: number;
  nonImposable: number;
  soumisCnss: number;
  exemptCnss: number;
}

export interface PayrollResult {
  salaireBrut: number;
  totalChargesSalariales: number;
  totalChargesPatronales: number;
  irpp: number;
  totalRetenues: number;
  salaireNet: number;
  lines: PayslipLineItem[];
  issues: { field: string; severity: "WARNING" | "BLOCKING"; message: string }[];
  // Snapshots
  salaireBaseSnapshot: number;
  situationFamilialeSnapshot: string;
  nombreEnfantsSnapshot: number;
  coefficientProrataSnapshot: number;
}

export interface RunGenerationResult {
  run: PayrollRun;
  generated: number;
  skipped: number;
  issues: number;
  bulletins: BulletinPaie[];
}

// ============================================================================
// HELPERS
// ============================================================================

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function round(amount: number, rule: string = "ROUND"): number {
  switch (rule) {
    case "FLOOR": return Math.floor(amount);
    case "CEIL": return Math.ceil(amount);
    default: return Math.round(amount);
  }
}

// ============================================================================
// REFERENCE DATA LOADERS
// ============================================================================

async function loadActiveRubriques(): Promise<RubriqueDefinition[]> {
  return db
    .select()
    .from(rubriqueDefinitions)
    .where(eq(rubriqueDefinitions.active, true))
    .orderBy(asc(rubriqueDefinitions.priority));
}

async function loadActiveCharges(): Promise<ChargeDefinition[]> {
  return db
    .select()
    .from(chargeDefinitions)
    .where(eq(chargeDefinitions.active, true));
}

async function loadIrppBareme(pays: string = "CG"): Promise<IrppBareme | null> {
  const [bareme] = await db
    .select()
    .from(irppBaremes)
    .where(and(eq(irppBaremes.pays, pays), eq(irppBaremes.active, true)))
    .orderBy(desc(irppBaremes.effectiveFrom))
    .limit(1);
  return bareme || null;
}

async function loadPayrollConfig(agenceId?: string): Promise<PayrollConfig | null> {
  if (agenceId) {
    const [agencyConfig] = await db
      .select()
      .from(payrollConfig)
      .where(and(eq(payrollConfig.agenceId, agenceId), eq(payrollConfig.isActive, true)))
      .orderBy(desc(payrollConfig.effectiveFrom))
      .limit(1);
    if (agencyConfig) return agencyConfig;
  }
  const [globalConfig] = await db
    .select()
    .from(payrollConfig)
    .where(and(sql`${payrollConfig.agenceId} IS NULL`, eq(payrollConfig.isActive, true)))
    .orderBy(desc(payrollConfig.effectiveFrom))
    .limit(1);
  return globalConfig || null;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

async function computeProrata(
  emp: typeof employes.$inferSelect,
  year: number,
  monthNum: number
): Promise<{ coefficient: number; joursContrat: number; joursDansMois: number }> {
  const joursDansMois = daysInMonth(year, monthNum);
  const debutMois = new Date(year, monthNum - 1, 1);
  const finMois = new Date(year, monthNum - 1, joursDansMois);

  const dateEmbauche = emp.dateEmbauche ? new Date(emp.dateEmbauche) : null;
  const dateSortie = emp.dateSortie ? new Date(emp.dateSortie) : null;

  const effectiveStart = dateEmbauche && dateEmbauche > debutMois ? dateEmbauche : debutMois;
  const effectiveEnd = dateSortie && dateSortie < finMois ? dateSortie : finMois;

  if (effectiveEnd < effectiveStart) {
    return { coefficient: 0, joursContrat: 0, joursDansMois };
  }

  const joursContrat = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const coefficient = joursContrat / joursDansMois;

  return { coefficient: Math.min(coefficient, 1), joursContrat, joursDansMois };
}

function calculateSeniorityRate(dateEmbauche: string | null | undefined): number {
  if (!dateEmbauche) return 0;
  const hireDate = new Date(dateEmbauche);
  const now = new Date();
  const years = Math.floor((now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.min(years * 0.02, 0.30); // 2% per year, max 30%
}

async function resolveBenefits(
  employeId: string,
  typeContrat: string | undefined,
  salaireBase: number,
  month: string
): Promise<BenefitsResolution> {
  const [, monthNum] = month.split("-").map(Number);

  // Manually assigned active benefits
  const assigned = await db
    .select({ ae: avantagesEmployes, av: avantages })
    .from(avantagesEmployes)
    .innerJoin(avantages, eq(avantagesEmployes.avantageId, avantages.id))
    .where(
      and(
        eq(avantagesEmployes.employeId, employeId),
        eq(avantagesEmployes.statut, "ACTIVE"),
        eq(avantages.actif, true),
        isNull(avantages.deletedAt)
      )
    );

  const assignedIds = new Set(assigned.map((a) => a.av.id));

  // Auto-attributed benefits
  let autoAttributed: (typeof avantages.$inferSelect)[] = [];
  if (typeContrat) {
    const allAuto = await db
      .select()
      .from(avantages)
      .where(and(eq(avantages.autoAttribution, true), eq(avantages.actif, true), isNull(avantages.deletedAt)));

    autoAttributed = allAuto.filter((av) => {
      if (assignedIds.has(av.id)) return false;
      const eligible = av.eligibleContrats as string[] | null;
      return !eligible || eligible.length === 0 || eligible.includes(typeContrat);
    });
  }

  const items: BenefitBreakdownItem[] = [];

  function computeOne(
    av: typeof avantages.$inferSelect,
    overrideMontant: number | null,
    dateAttribution: string | null,
    source: "ASSIGNED" | "AUTO"
  ): BenefitBreakdownItem | null {
    // Date validity
    if (av.dateDebut && month < av.dateDebut.substring(0, 7)) return null;
    if (av.dateFin && month > av.dateFin.substring(0, 7)) return null;
    // Frequency
    const freq = av.frequence || "MENSUEL";
    if (freq === "TRIMESTRIEL" && monthNum % 3 !== 0) return null;
    if (freq === "ANNUEL" && monthNum !== 12) return null;
    if (freq === "PONCTUEL" && (!dateAttribution || dateAttribution.substring(0, 7) !== month)) return null;
    // Amount
    let montant: number;
    const mode = av.modeCalcul || "FIXE";
    if (mode === "POURCENTAGE") {
      const pct = Number(av.pourcentage) || 0;
      montant = Math.round((pct / 100) * salaireBase);
      if (av.plafond && montant > av.plafond) montant = av.plafond;
    } else {
      montant = overrideMontant ?? (av.montantParDefaut || 0);
    }
    if (montant <= 0) return null;
    return {
      avantageId: av.id,
      nom: av.nom,
      categorie: av.categorie || "AUTRE",
      modeCalcul: mode,
      montantCalcule: montant,
      imposable: av.imposable ?? true,
      soumisCnss: av.soumisCnss ?? true,
      source,
    };
  }

  for (const { ae, av } of assigned) {
    const item = computeOne(av, ae.montant, ae.dateAttribution, "ASSIGNED");
    if (item) items.push(item);
  }
  for (const av of autoAttributed) {
    const item = computeOne(av, null, null, "AUTO");
    if (item) items.push(item);
  }

  const total = items.reduce((s, i) => s + i.montantCalcule, 0);
  const imposable = items.filter((i) => i.imposable).reduce((s, i) => s + i.montantCalcule, 0);
  const nonImposable = items.filter((i) => !i.imposable).reduce((s, i) => s + i.montantCalcule, 0);
  const soumisCnss = items.filter((i) => i.soumisCnss).reduce((s, i) => s + i.montantCalcule, 0);
  const exemptCnss = items.filter((i) => !i.soumisCnss).reduce((s, i) => s + i.montantCalcule, 0);

  return { items, total, imposable, nonImposable, soumisCnss, exemptCnss };
}

async function loadOvertimeForMonth(
  employeId: string,
  year: number,
  monthNum: number
): Promise<Record<string, number>> {
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const endDay = daysInMonth(year, monthNum);
  const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const entries = await db
    .select()
    .from(overtimeLog)
    .where(
      and(
        eq(overtimeLog.employeId, employeId),
        gte(overtimeLog.date, startDate),
        lte(overtimeLog.date, endDate)
      )
    );

  const byType: Record<string, number> = {};
  for (const entry of entries) {
    const t = entry.type;
    byType[t] = (byType[t] || 0) + Number(entry.hours);
  }
  return byType;
}

async function loadLeaveHoursForMonth(
  employeId: string,
  year: number,
  monthNum: number
): Promise<number> {
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const endDay = daysInMonth(year, monthNum);
  const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const leavePresences = await db
    .select()
    .from(presences)
    .where(
      and(
        eq(presences.employeId, employeId),
        eq(presences.statut, "Congé"),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      )
    );
  return leavePresences.length;
}

async function loadCommission(employeId: string, month: string): Promise<number> {
  // Find agent terrain linked to this employee
  const [agent] = await db
    .select()
    .from(agentsTerrain)
    .where(eq(agentsTerrain.employeId, employeId))
    .limit(1);

  if (!agent) return 0;

  // Sum approved commissions for the period
  const primes = await db
    .select()
    .from(prospectionPrimes)
    .where(
      and(
        eq(prospectionPrimes.agentId, agent.id),
        eq(prospectionPrimes.periode, month),
        eq(prospectionPrimes.statut, "APPROVED"),
        isNull(prospectionPrimes.deletedAt)
      )
    );

  return primes.reduce((sum, p) => sum + Number(p.montant || 0), 0);
}

async function loadAdvanceDeduction(employeId: string, month: string): Promise<number> {
  const advances = await db
    .select()
    .from(avancesSalaire)
    .where(
      and(
        eq(avancesSalaire.employeId, employeId),
        eq(avancesSalaire.moisDeduction, month),
        or(eq(avancesSalaire.statut, StatutAvance.APPROVED), eq(avancesSalaire.statut, StatutAvance.PAID))
      )
    );
  return advances.reduce((sum, a) => sum + (a.montant || 0), 0);
}

async function loadPresences(
  employeId: string,
  year: number,
  monthNum: number
): Promise<{ joursTravailles: number; heuresTravaillees: number }> {
  const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const endDay = daysInMonth(year, monthNum);
  const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const pres = await db
    .select()
    .from(presences)
    .where(
      and(
        eq(presences.employeId, employeId),
        gte(presences.date, startDate),
        lte(presences.date, endDate)
      )
    );

  const joursTravailles = pres.filter((p) => p.statut === "Présent").length;
  const heuresTravaillees = pres.reduce((sum, p) => sum + (p.heuresTravaillees || 0) / 60, 0);

  return { joursTravailles, heuresTravaillees };
}

// ============================================================================
// BUILD FULL CONTEXT
// ============================================================================

async function buildPayrollContext(
  emp: typeof employes.$inferSelect,
  user: typeof users.$inferSelect,
  month: string,
  config: PayrollConfig
): Promise<PayrollContext> {
  const [year, monthNum] = month.split("-").map(Number);

  const prorata = await computeProrata(emp, year, monthNum);
  const { joursTravailles, heuresTravaillees } = await loadPresences(emp.id, year, monthNum);
  const overtimeByType = await loadOvertimeForMonth(emp.id, year, monthNum);
  const joursConge = await loadLeaveHoursForMonth(emp.id, year, monthNum);

  // Base salary for benefit resolution (before prorata for %‐based benefits)
  const salaireBaseRef = emp.salaireBase || 0;
  const benefits = await resolveBenefits(emp.id, emp.typeContrat || undefined, salaireBaseRef, month);
  const commissionAmount = await loadCommission(emp.id, month);
  const avanceDeduction = await loadAdvanceDeduction(emp.id, month);

  return {
    employe: emp,
    user,
    config,
    month,
    year,
    monthNum,
    joursTravailles,
    heuresTravaillees,
    overtimeByType,
    joursConge,
    benefits,
    commissionAmount,
    avanceDeduction,
    coefficientProrata: prorata.coefficient,
    joursContrat: prorata.joursContrat,
    joursDansMois: prorata.joursDansMois,
  };
}

// ============================================================================
// CALCULATION ENGINE
// ============================================================================

/**
 * Compute IRPP Congo-Brazzaville
 *
 * 1. brutImposable = brut - CNSS salariale - avantages non imposables
 * 2. abattement forfaitaire = 20% du brutImposable
 * 3. revenuNetImposable = brutImposable × 0.80
 * 4. parts: célibataire=1, marié=2, +0.5/enfant (max 6 parts)
 * 5. quotient = revenuNetImposable / parts
 * 6. appliquer barème progressif au quotient
 * 7. IRPP = impôt sur quotient × parts
 */
function computeIRPP(
  brutImposable: number,
  bareme: IrppBareme,
  situationFamiliale: string,
  nombreEnfants: number
): number {
  if (brutImposable <= 0) return 0;

  // 1. Abattement forfaitaire
  const tauxAbattement = Number(bareme.abattementForfaitaire) || 0.20;
  const revenuNetImposable = brutImposable * (1 - tauxAbattement);

  if (revenuNetImposable <= 0) return 0;

  // 2. Parts familiales
  let parts = 1; // Célibataire
  if (situationFamiliale === "MARIE" || situationFamiliale === "VEUF") {
    parts = 2;
  }
  parts += Math.min(nombreEnfants, 8) * 0.5; // +0.5 per child
  parts = Math.min(parts, 6); // Max 6 parts

  // 3. Quotient familial (annualisé)
  const revenuAnnuel = revenuNetImposable * 12;
  const quotient = revenuAnnuel / parts;

  // 4. Barème progressif
  const brackets = (bareme.brackets as IrppBracket[]).sort((a, b) => a.min - b.min);
  let impotQuotient = 0;
  let remaining = quotient;

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const bracketSize = bracket.max !== null ? bracket.max - bracket.min + 1 : Infinity;
    const taxable = Math.min(remaining, bracketSize);
    impotQuotient += taxable * bracket.rate;
    remaining -= taxable;
  }

  // 5. IRPP annuel = impôt sur quotient × parts, puis mensualiser
  const irppAnnuel = impotQuotient * parts;
  const irppMensuel = Math.round(irppAnnuel / 12);

  return irppMensuel;
}

/**
 * Main calculation function — rubrique-driven
 */
export async function calculatePayroll(
  emp: typeof employes.$inferSelect,
  user: typeof users.$inferSelect,
  month: string,
  config: PayrollConfig
): Promise<PayrollResult> {
  const ctx = await buildPayrollContext(emp, user, month, config);

  const rubriques = await loadActiveRubriques();
  const charges = await loadActiveCharges();
  const bareme = await loadIrppBareme("CG");

  const lines: PayslipLineItem[] = [];
  const issues: { field: string; severity: "WARNING" | "BLOCKING"; message: string }[] = [];
  let sortOrder = 0;

  // Intermediate accumulators
  let salaireBase = 0;
  let totalGains = 0;
  let salaireBrut = 0;
  let baseCnss = 0;
  let totalCnssSalariale = 0;
  let totalCnssPatronale = 0;
  let irpp = 0;
  let totalRetenues = 0;
  let totalChargesPatronales = 0;

  // ----- PHASE 1: Compute base salary -----
  const mode = (emp.modeCalculPaie as string) || "MONTHLY";
  switch (mode) {
    case "MONTHLY":
      salaireBase = Math.round((emp.salaireBase || 0) * ctx.coefficientProrata);
      break;
    case "HOURLY":
      salaireBase = Math.round((emp.tauxHoraire || 0) * ctx.heuresTravaillees);
      break;
    case "DAILY":
      salaireBase = Math.round((emp.tauxJournalier || 0) * ctx.joursTravailles);
      break;
    default:
      salaireBase = Math.round((emp.salaireBase || 0) * ctx.coefficientProrata);
  }

  if (salaireBase <= 0) {
    issues.push({ field: "salaireBase", severity: "BLOCKING", message: "Salaire de base est 0 ou négatif" });
  }

  // ----- PHASE 2: Generate rubrique lines -----
  const tauxHoraire = emp.tauxHoraire || Math.round(salaireBase / 173.33);
  const seniorityRate = calculateSeniorityRate(emp.dateEmbauche);
  const primeAnciennete = round(salaireBase * seniorityRate);

  // Overtime amounts by type
  const overtimeRates: Record<string, number> = {
    NORMAL_25: 1.25,
    NORMAL_50: 1.50,
    NIGHT: Number(config.nightShiftRate) || 1.25,
    HOLIDAY: Number(config.holidayRate) || 2.00,
  };

  const overtimeAmounts: Record<string, number> = {};
  let totalOvertime = 0;
  for (const [type, hours] of Object.entries(ctx.overtimeByType)) {
    const rate = overtimeRates[type] || 1.25;
    const amount = round(hours * tauxHoraire * rate);
    overtimeAmounts[type] = amount;
    totalOvertime += amount;
  }

  // Leave allowance (indemnité congés payés)
  let indemniteCP = 0;
  if (ctx.joursConge > 0) {
    // Indemnité CP = salaireBase / 26 × jours de congé pris
    indemniteCP = round((salaireBase / 26) * ctx.joursConge);
  }

  // Now iterate rubriques by priority and build lines
  for (const rub of rubriques) {
    let amount = 0;
    let base = 0;
    let taux: number | null = null;
    let skip = false;

    switch (rub.code) {
      // ---- GAINS ----
      case "100": // Salaire de base
        amount = salaireBase;
        base = emp.salaireBase || 0;
        if (ctx.coefficientProrata < 1) taux = ctx.coefficientProrata * 100;
        break;

      case "110": // Prime d'ancienneté
        if (primeAnciennete <= 0) { skip = true; break; }
        amount = primeAnciennete;
        base = salaireBase;
        taux = seniorityRate * 100;
        break;

      case "120": // Indemnité congés payés
        if (indemniteCP <= 0) { skip = true; break; }
        amount = indemniteCP;
        base = ctx.joursConge;
        taux = null;
        break;

      case "200": // Heures sup 25%
        if (!overtimeAmounts.NORMAL_25) { skip = true; break; }
        amount = overtimeAmounts.NORMAL_25;
        base = ctx.overtimeByType.NORMAL_25 || 0;
        taux = 125;
        break;

      case "201": // Heures sup 50%
        if (!overtimeAmounts.NORMAL_50) { skip = true; break; }
        amount = overtimeAmounts.NORMAL_50;
        base = ctx.overtimeByType.NORMAL_50 || 0;
        taux = 150;
        break;

      case "210": // Heures de nuit
        if (!overtimeAmounts.NIGHT) { skip = true; break; }
        amount = overtimeAmounts.NIGHT;
        base = ctx.overtimeByType.NIGHT || 0;
        taux = (overtimeRates.NIGHT || 1.25) * 100;
        break;

      case "220": // Heures jours fériés
        if (!overtimeAmounts.HOLIDAY) { skip = true; break; }
        amount = overtimeAmounts.HOLIDAY;
        base = ctx.overtimeByType.HOLIDAY || 0;
        taux = (overtimeRates.HOLIDAY || 2) * 100;
        break;

      case "400": // Commission prospection
        if (ctx.commissionAmount <= 0) { skip = true; break; }
        amount = ctx.commissionAmount;
        break;

      case "1000": // Salaire brut (SUBTOTAL)
        // Will be computed after gains
        skip = true; // handled below
        break;

      // ---- RETENUES ----
      case "2001": // CNSS Pension salariale
        // Handled by chargeDefinitions
        skip = true;
        break;

      case "3000": // Total retenues salariales (SUBTOTAL)
        skip = true;
        break;

      case "4000": // IRPP
        skip = true; // Handled separately after charges
        break;

      case "4500": // Avance sur salaire
        if (ctx.avanceDeduction <= 0) { skip = true; break; }
        amount = ctx.avanceDeduction;
        break;

      case "5000": // Total retenues (SUBTOTAL)
        skip = true;
        break;

      // ---- PATRONAL ----
      case "6000": case "6001": case "6002": case "6003": case "6004":
        // Handled by chargeDefinitions
        skip = true;
        break;

      case "7000": // Total charges patronales (SUBTOTAL)
        skip = true;
        break;

      case "9999": // Net à payer
        skip = true;
        break;

      default:
        // Dynamic rubriques (300-399 range = benefits/primes)
        if (rub.code >= "300" && rub.code < "400") {
          // Benefits handled below as dynamic injection
          skip = true;
        } else {
          skip = true;
        }
    }

    if (skip) continue;

    const category = rub.type as PayslipLineItem["category"];
    if (category === "GAIN" || category === "INFO") {
      totalGains += amount;
    }

    lines.push({
      code: rub.code,
      libelle: rub.libelle,
      category,
      base: round(base),
      taux,
      montantGain: category === "GAIN" ? amount : 0,
      montantRetenue: category === "RETENUE" ? amount : 0,
      montantPatronal: category === "PATRONAL" ? amount : 0,
      sortOrder: sortOrder++,
    });
  }

  // ----- PHASE 2b: Inject dynamic benefit lines -----
  for (const benefit of ctx.benefits.items) {
    // Skip categories already handled by specific rubriques
    if (benefit.categorie === "ANCIENNETE") continue;

    const code = `3${String(lines.length).padStart(2, "0")}`;
    totalGains += benefit.montantCalcule;

    lines.push({
      code,
      libelle: benefit.nom,
      category: "GAIN",
      base: benefit.modeCalcul === "POURCENTAGE" ? salaireBase : 0,
      taux: benefit.modeCalcul === "POURCENTAGE" ? (benefit.montantCalcule / Math.max(salaireBase, 1)) * 100 : null,
      montantGain: benefit.montantCalcule,
      montantRetenue: 0,
      montantPatronal: 0,
      sortOrder: sortOrder++,
    });
  }

  // ----- Brut subtotal -----
  salaireBrut = salaireBase + primeAnciennete + totalOvertime + indemniteCP + ctx.benefits.total + ctx.commissionAmount;

  lines.push({
    code: "1000",
    libelle: "Salaire brut",
    category: "SUBTOTAL",
    base: 0,
    taux: null,
    montantGain: salaireBrut,
    montantRetenue: 0,
    montantPatronal: 0,
    sortOrder: sortOrder++,
  });

  // ----- PHASE 3: Charges sociales -----
  baseCnss = salaireBase + primeAnciennete + totalOvertime + ctx.benefits.soumisCnss + ctx.commissionAmount;

  for (const charge of charges) {
    let assiette = 0;
    switch (charge.assietteRule) {
      case "BASE_CNSS":
        assiette = baseCnss;
        break;
      case "BRUT_IMPOSABLE":
        assiette = salaireBrut;
        break;
      default:
        assiette = baseCnss;
    }

    // Apply ceiling
    if (charge.plafond && assiette > charge.plafond) {
      assiette = charge.plafond;
    }
    // Apply floor
    if (charge.plancher && assiette < charge.plancher) {
      assiette = charge.plancher;
    }

    const rate = Number(charge.rate) || 0;
    const chargeAmount = round(assiette * rate);

    const isEmployee = charge.side === "EMPLOYEE" || charge.side === "BOTH";
    const isEmployer = charge.side === "EMPLOYER" || charge.side === "BOTH";

    if (isEmployee) {
      totalCnssSalariale += chargeAmount;
      lines.push({
        code: charge.code,
        libelle: `${charge.libelle} (salariale)`,
        category: "RETENUE",
        base: assiette,
        taux: rate * 100,
        montantGain: 0,
        montantRetenue: chargeAmount,
        montantPatronal: 0,
        sortOrder: sortOrder++,
      });
    }

    if (isEmployer) {
      const patronalAmount = charge.side === "BOTH" ? chargeAmount : chargeAmount;
      totalCnssPatronale += patronalAmount;
      lines.push({
        code: `${charge.code}_P`,
        libelle: `${charge.libelle} (patronale)`,
        category: "PATRONAL",
        base: assiette,
        taux: rate * 100,
        montantGain: 0,
        montantRetenue: 0,
        montantPatronal: patronalAmount,
        sortOrder: sortOrder++,
      });
    }
  }

  // Total charges salariales subtotal
  lines.push({
    code: "3000",
    libelle: "Total charges salariales",
    category: "SUBTOTAL",
    base: 0,
    taux: null,
    montantGain: 0,
    montantRetenue: totalCnssSalariale,
    montantPatronal: 0,
    sortOrder: sortOrder++,
  });

  // ----- PHASE 4: IRPP -----
  if (bareme) {
    const brutImposable = salaireBrut - totalCnssSalariale - ctx.benefits.nonImposable;
    irpp = computeIRPP(
      Math.max(0, brutImposable),
      bareme,
      emp.situationFamiliale || "CELIBATAIRE",
      emp.nombreEnfantsCharge || 0
    );

    lines.push({
      code: "4000",
      libelle: "IRPP",
      category: "RETENUE",
      base: Math.max(0, brutImposable),
      taux: null, // progressive
      montantGain: 0,
      montantRetenue: irpp,
      montantPatronal: 0,
      sortOrder: sortOrder++,
    });
  } else {
    issues.push({ field: "irppBareme", severity: "WARNING", message: "Aucun barème IRPP actif trouvé — IRPP = 0" });
  }

  // ----- Avance déduction -----
  if (ctx.avanceDeduction > 0) {
    lines.push({
      code: "4500",
      libelle: "Avance sur salaire",
      category: "RETENUE",
      base: 0,
      taux: null,
      montantGain: 0,
      montantRetenue: ctx.avanceDeduction,
      montantPatronal: 0,
      sortOrder: sortOrder++,
    });
  }

  // ----- Total retenues -----
  totalRetenues = totalCnssSalariale + irpp + ctx.avanceDeduction;
  totalChargesPatronales = totalCnssPatronale;

  lines.push({
    code: "5000",
    libelle: "Total retenues",
    category: "SUBTOTAL",
    base: 0,
    taux: null,
    montantGain: 0,
    montantRetenue: totalRetenues,
    montantPatronal: totalChargesPatronales,
    sortOrder: sortOrder++,
  });

  // ----- Net à payer -----
  const salaireNet = salaireBrut - totalRetenues;

  lines.push({
    code: "9999",
    libelle: "Net à payer",
    category: "NET",
    base: 0,
    taux: null,
    montantGain: salaireNet,
    montantRetenue: 0,
    montantPatronal: 0,
    sortOrder: sortOrder++,
  });

  return {
    salaireBrut,
    totalChargesSalariales: totalCnssSalariale,
    totalChargesPatronales,
    irpp,
    totalRetenues,
    salaireNet,
    lines,
    issues,
    salaireBaseSnapshot: emp.salaireBase || 0,
    situationFamilialeSnapshot: emp.situationFamiliale || "CELIBATAIRE",
    nombreEnfantsSnapshot: emp.nombreEnfantsCharge || 0,
    coefficientProrataSnapshot: ctx.coefficientProrata,
  };
}

// ============================================================================
// PAYROLL RUN MANAGEMENT
// ============================================================================

/**
 * Generate a payroll run for a given month.
 * Creates a new payroll_run, then calculates bulletins for all active employees.
 */
export async function generatePayrollRun(
  month: string,
  generatedBy: string,
  agenceId?: string
): Promise<RunGenerationResult> {
  const config = await loadPayrollConfig(agenceId);
  if (!config) throw new Error("Configuration paie non trouvée");

  // Determine version (check if a previous run exists for this period)
  const existingRuns = await db
    .select()
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.period, month),
        agenceId ? eq(payrollRuns.agenceId, agenceId) : sql`${payrollRuns.agenceId} IS NULL`
      )
    )
    .orderBy(desc(payrollRuns.version));

  const lastRun = existingRuns[0];
  const version = lastRun ? lastRun.version + 1 : 1;

  // Create run
  const [run] = await db
    .insert(payrollRuns)
    .values({
      period: month,
      version,
      status: PayrollRunStatus.DRAFT,
      agenceId: agenceId || null,
      generatedBy,
      rerunOfRunId: lastRun?.id || null,
      rerunReason: lastRun ? "Re-run demandé" : null,
    })
    .returning();

  logger.info({ runId: run.id, month, version, agenceId }, "Payroll run created");

  // Get active employees
  const whereConditions = agenceId
    ? and(eq(employes.statut, "ACTIVE"), eq(employes.agenceId, agenceId))
    : eq(employes.statut, "ACTIVE");

  const employeesList = await db
    .select({ employe: employes, user: users })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(whereConditions);

  // Also include employees who left during the month (prorata)
  const [yearNum, monthNum] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const endDay = daysInMonth(yearNum, monthNum);
  const monthEnd = `${month}-${String(endDay).padStart(2, "0")}`;

  const departedEmployees = await db
    .select({ employe: employes, user: users })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "INACTIVE"),
        gte(employes.dateSortie, monthStart),
        lte(employes.dateSortie, monthEnd),
        agenceId ? eq(employes.agenceId, agenceId) : sql`1=1`
      )
    );

  const allEmployees = [...employeesList, ...departedEmployees];
  // Deduplicate by employeId
  const seen = new Set<string>();
  const uniqueEmployees = allEmployees.filter(({ employe }) => {
    if (seen.has(employe.id)) return false;
    seen.add(employe.id);
    return true;
  });

  const bulletins: BulletinPaie[] = [];
  let skipped = 0;
  let issueCount = 0;

  for (const { employe, user: usr } of uniqueEmployees) {
    try {
      const result = await calculatePayroll(employe, usr, month, config);

      // Record issues
      for (const issue of result.issues) {
        issueCount++;
        await db.insert(payrollRunIssues).values({
          payrollRunId: run.id,
          employeId: employe.id,
          field: issue.field,
          severity: issue.severity,
          message: issue.message,
        });
      }

      // Skip if blocking issues
      const hasBlocking = result.issues.some((i) => i.severity === "BLOCKING");
      if (hasBlocking) {
        skipped++;
        continue;
      }

      // Create bulletin
      const employeNom = `${usr.nom} ${usr.prenom || ""}`.trim();
      const [bulletin] = await db
        .insert(bulletinsPaie)
        .values({
          payrollRunId: run.id,
          employeId: employe.id,
          employeNom,
          mois: month,
          version,
          salaireBrut: String(result.salaireBrut),
          totalChargesSalariales: String(result.totalChargesSalariales),
          totalChargesPatronales: String(result.totalChargesPatronales),
          irpp: String(result.irpp),
          totalRetenues: String(result.totalRetenues),
          salaireNet: String(result.salaireNet),
          salaireBaseSnapshot: result.salaireBaseSnapshot,
          situationFamilialeSnapshot: result.situationFamilialeSnapshot,
          nombreEnfantsSnapshot: result.nombreEnfantsSnapshot,
          coefficientProrataSnapshot: String(result.coefficientProrataSnapshot),
          genereParId: generatedBy,
          statut: BulletinStatus.DRAFT,
        })
        .returning();

      // Persist payslip lines
      if (result.lines.length > 0) {
        await db.insert(payslipLines).values(
          result.lines.map((line) => ({
            bulletinId: bulletin.id,
            code: line.code,
            libelle: line.libelle,
            category: line.category,
            base: Math.round(line.base),
            taux: line.taux !== null ? String(line.taux) : null,
            montantGain: Math.round(line.montantGain),
            montantRetenue: Math.round(line.montantRetenue),
            montantPatronal: Math.round(line.montantPatronal),
            sortOrder: line.sortOrder,
          }))
        );
      }

      bulletins.push(bulletin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error({ employeId: employe.id, error: msg }, "Payroll calculation failed for employee");
      issueCount++;
      await db.insert(payrollRunIssues).values({
        payrollRunId: run.id,
        employeId: employe.id,
        field: "calculation",
        severity: "BLOCKING",
        message: msg,
      });
      skipped++;
    }
  }

  // Update run totals
  const totalBrut = bulletins.reduce((s, b) => s + Number(b.salaireBrut), 0);
  const totalNet = bulletins.reduce((s, b) => s + Number(b.salaireNet), 0);
  const totalChPatronales = bulletins.reduce((s, b) => s + Number(b.totalChargesPatronales), 0);
  const totalChSalariales = bulletins.reduce((s, b) => s + Number(b.totalChargesSalariales), 0);

  await db
    .update(payrollRuns)
    .set({
      totalBrut: String(totalBrut),
      totalNet: String(totalNet),
      totalChargesPatronales: String(totalChPatronales),
      totalChargesSalariales: String(totalChSalariales),
      employeeCount: bulletins.length,
      issueCount,
    })
    .where(eq(payrollRuns.id, run.id));

  // Refresh run object
  const [updatedRun] = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.id, run.id));

  logger.info(
    { runId: run.id, generated: bulletins.length, skipped, issues: issueCount },
    "Payroll run generation complete"
  );

  return { run: updatedRun, generated: bulletins.length, skipped, issues: issueCount, bulletins };
}
