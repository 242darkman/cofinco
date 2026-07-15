import {
  employes,
  feuillesTemps,
  presences,
  projetMembres,
  projetsRh,
  tempsImputes,
  type InsertFeuilleTemps,
  type InsertProjetMembre,
  type InsertProjetRh,
  type InsertTempsImpute
} from "@shared/schema";
import { and, asc, desc, eq, gte, inArray, lte, not, sql } from "drizzle-orm";
import { db } from "../../db";

// ================================================
// PROJETS RH - Gestion du temps projet
// ================================================

export async function getProjects(filter?: { statut?: string; agenceId?: string }) {
  const conditions = [];
  if (filter?.statut) conditions.push(eq(projetsRh.statut, filter.statut));
  if (filter?.agenceId) conditions.push(eq(projetsRh.agenceId, filter.agenceId));

  const query = db.select().from(projetsRh);
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(projetsRh.createdAt));
  }
  return await query.orderBy(desc(projetsRh.createdAt));
}

export async function getProjectById(id: string) {
  const [project] = await db.select().from(projetsRh).where(eq(projetsRh.id, id));
  if (!project) return null;

  const membres = await db.select({
    id: projetMembres.id,
    projetId: projetMembres.projetId,
    employeId: projetMembres.employeId,
    role: projetMembres.role,
    dateAjout: projetMembres.dateAjout,
    employeNom: sql<string>`(SELECT CONCAT(u.prenom, ' ', u.nom) FROM users u JOIN employes e ON e."user_id" = u.id WHERE e.id = ${projetMembres.employeId})`,
    employeMatricule: sql<string>`(SELECT e.matricule FROM employes e WHERE e.id = ${projetMembres.employeId})`,
  }).from(projetMembres).where(eq(projetMembres.projetId, id));

  return { ...project, membres };
}

export async function getEmployeeProjects(employeId: string) {
  const memberRows = await db.select({ projetId: projetMembres.projetId })
    .from(projetMembres).where(eq(projetMembres.employeId, employeId));
  if (memberRows.length === 0) return [];
  const projectIds = memberRows.map(r => r.projetId);
  return await db.select().from(projetsRh)
    .where(and(inArray(projetsRh.id, projectIds), not(eq(projetsRh.statut, 'CANCELLED'))))
    .orderBy(desc(projetsRh.createdAt));
}

export async function createProject(data: InsertProjetRh) {
  const [project] = await db.insert(projetsRh).values(data).returning();
  return project;
}

export async function updateProject(id: string, data: Partial<InsertProjetRh>) {
  const [project] = await db.update(projetsRh).set({ ...data, updatedAt: new Date() })
    .where(eq(projetsRh.id, id)).returning();
  return project;
}

export async function addProjectMember(data: InsertProjetMembre) {
  const [member] = await db.insert(projetMembres).values(data).returning();
  return member;
}

export async function removeProjectMember(projetId: string, employeId: string) {
  await db.delete(projetMembres)
    .where(and(eq(projetMembres.projetId, projetId), eq(projetMembres.employeId, employeId)));
}

// ================================================
// FEUILLES DE TEMPS - Feuilles de temps
// ================================================

export async function getTimesheets(filter?: { employeId?: string; statut?: string; semaine?: string }) {
  const conditions = [];
  if (filter?.employeId) conditions.push(eq(feuillesTemps.employeId, filter.employeId));
  if (filter?.statut) conditions.push(eq(feuillesTemps.statut, filter.statut));
  if (filter?.semaine) conditions.push(eq(feuillesTemps.semaine, filter.semaine));

  const query = db.select().from(feuillesTemps);
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(feuillesTemps.dateDebut));
  }
  return await query.orderBy(desc(feuillesTemps.dateDebut));
}

export async function getTimesheetById(id: string) {
  const [sheet] = await db.select().from(feuillesTemps).where(eq(feuillesTemps.id, id));
  if (!sheet) return null;

  const entries = await db.select({
    id: tempsImputes.id,
    feuilleTempsId: tempsImputes.feuilleTempsId,
    projetId: tempsImputes.projetId,
    date: tempsImputes.date,
    heures: tempsImputes.heures,
    description: tempsImputes.description,
    tauxHoraireSnapshot: tempsImputes.tauxHoraireSnapshot,
    coutCalcule: tempsImputes.coutCalcule,
    projetNom: sql<string>`(SELECT nom FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    projetCode: sql<string>`(SELECT code FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
  }).from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id))
    .orderBy(asc(tempsImputes.date), asc(tempsImputes.projetId));

  return { ...sheet, entries };
}

export async function createOrGetTimesheet(data: InsertFeuilleTemps) {
  // Check if a timesheet already exists for this employee + week
  const [existing] = await db.select().from(feuillesTemps)
    .where(and(
      eq(feuillesTemps.employeId, data.employeId),
      eq(feuillesTemps.semaine, data.semaine),
    ));
  if (existing) return existing;
  const [sheet] = await db.insert(feuillesTemps).values(data).returning();
  return sheet;
}

export async function submitTimesheet(id: string) {
  // Recalculate total hours
  const entries = await db.select().from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id));
  const totalHeures = entries.reduce((sum, e) => sum + parseFloat(e.heures), 0);

  const [sheet] = await db.update(feuillesTemps).set({
    statut: 'SUBMITTED',
    totalHeures: totalHeures.toFixed(2),
    soumisAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return sheet;
}

export async function approveTimesheet(id: string, approuveParId: string) {
  // Get the timesheet with employee info for cost calculation
  const [sheet] = await db.select().from(feuillesTemps).where(eq(feuillesTemps.id, id));
  if (!sheet) return null;

  const [emp] = await db.select().from(employes).where(eq(employes.id, sheet.employeId));
  if (!emp) return null;

  // Calculate hourly rate based on pay mode
  let hourlyRate = 0;
  if (emp.modeCalculPaie === 'HOURLY') {
    hourlyRate = emp.tauxHoraire || 0;
  } else if (emp.modeCalculPaie === 'DAILY') {
    hourlyRate = Math.round((emp.tauxJournalier || 0) / 8);
  } else {
    // MONTHLY: divide by 173.33 (standard monthly hours)
    hourlyRate = Math.round((emp.salaireBase || 0) / 173.33);
  }

  // Update each time entry with cost snapshot
  const entries = await db.select().from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id));
  for (const entry of entries) {
    const heures = parseFloat(entry.heures);
    const cout = Math.round(heures * hourlyRate);
    await db.update(tempsImputes).set({
      tauxHoraireSnapshot: hourlyRate,
      coutCalcule: cout,
    }).where(eq(tempsImputes.id, entry.id));
  }

  const totalHeures = entries.reduce((sum, e) => sum + parseFloat(e.heures), 0);

  const [updated] = await db.update(feuillesTemps).set({
    statut: 'APPROVED',
    totalHeures: totalHeures.toFixed(2),
    approuvePar: approuveParId,
    approuveAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return updated;
}

export async function rejectTimesheet(id: string, motif: string) {
  const [sheet] = await db.update(feuillesTemps).set({
    statut: 'REJECTED',
    rejeteMotif: motif,
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return sheet;
}

// ================================================
// TEMPS IMPUTÉS - Entrées de temps
// ================================================

export async function upsertTimeEntry(data: InsertTempsImpute) {
  // Check if an entry already exists for this timesheet + project + date
  const [existing] = await db.select().from(tempsImputes)
    .where(and(
      eq(tempsImputes.feuilleTempsId, data.feuilleTempsId),
      eq(tempsImputes.projetId, data.projetId),
      eq(tempsImputes.date, data.date),
    ));

  if (existing) {
    const [updated] = await db.update(tempsImputes).set({
      heures: data.heures,
      description: data.description,
    }).where(eq(tempsImputes.id, existing.id)).returning();
    return updated;
  }

  const [entry] = await db.insert(tempsImputes).values(data).returning();
  return entry;
}

export async function deleteTimeEntry(entryId: string) {
  await db.delete(tempsImputes).where(eq(tempsImputes.id, entryId));
}

// Get presence records for an employee over a date range (for timesheet linking)
export async function getPresenceForWeek(employeId: string, dateDebut: string, dateFin: string) {
  return await db.select({
    id: presences.id,
    date: presences.date,
    statut: presences.statut,
    heureArrivee: presences.heureArrivee,
    heureDepart: presences.heureDepart,
    heuresTravaillees: presences.heuresTravaillees,
    heuresSupplementaires: presences.heuresSupplementaires,
  }).from(presences)
    .where(and(
      eq(presences.employeId, employeId),
      gte(presences.date, dateDebut),
      lte(presences.date, dateFin),
    ))
    .orderBy(asc(presences.date));
}

// ================================================
// REPORTING - Coût du projet et affectation des employés
// ================================================

export async function getProjectCostSummary(projetId: string) {
  const result = await db.select({
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
    nbEntries: sql<number>`COUNT(*)::int`,
  }).from(tempsImputes)
    .where(eq(tempsImputes.projetId, projetId));

  // Get breakdown by employee
  const byEmployee = await db.select({
    employeId: feuillesTemps.employeId,
    employeNom: feuillesTemps.employeNom,
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
  }).from(tempsImputes)
    .innerJoin(feuillesTemps, eq(tempsImputes.feuilleTempsId, feuillesTemps.id))
    .where(eq(tempsImputes.projetId, projetId))
    .groupBy(feuillesTemps.employeId, feuillesTemps.employeNom);

  return { ...(result[0] || { totalHeures: 0, totalCout: 0, nbEntries: 0 }), byEmployee };
}

export async function getEmployeeTimeAllocation(employeId: string, from?: string, to?: string) {
  const conditions = [eq(feuillesTemps.employeId, employeId)];
  if (from) conditions.push(gte(feuillesTemps.dateDebut, from));
  if (to) conditions.push(lte(feuillesTemps.dateFin, to));

  const sheets = await db.select({ id: feuillesTemps.id })
    .from(feuillesTemps).where(and(...conditions));

  if (sheets.length === 0) return { byProject: [], totalHeures: 0 };

  const sheetIds = sheets.map(s => s.id);

  const byProject = await db.select({
    projetId: tempsImputes.projetId,
    projetNom: sql<string>`(SELECT nom FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    projetCode: sql<string>`(SELECT code FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
  }).from(tempsImputes)
    .where(inArray(tempsImputes.feuilleTempsId, sheetIds))
    .groupBy(tempsImputes.projetId);

  const totalHeures = byProject.reduce((s, p) => s + Number(p.totalHeures), 0);

  return { byProject, totalHeures };
}
