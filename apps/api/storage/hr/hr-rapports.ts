import { StatutCandidature, StatutConge, StatutUser } from "@shared/enum/status-constants";
import {
  bulletinsPaie,
  candidatures,
  demandesConges,
  departments,
  employes,
  formationParticipants,
  formations,
  jobPositions,
  sanctions,
  users,
} from "@shared/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db";

export async function getHrStats(): Promise<any> {
    const employesCount = await db.select({ count: sql<number>`count(*)` }).from(employes);
    const congesEnAttente = await db.select({ count: sql<number>`count(*)` }).from(demandesConges).where(eq(demandesConges.statut, StatutConge.PENDING));
    const recrutementsEnCours = await db.select({ count: sql<number>`count(*)` }).from(candidatures).where(eq(candidatures.statut, StatutCandidature.PENDING));

    // Payroll total current month (approx)
    const currentMonth = new Date().toISOString().slice(0, 7);
    const masseSalariale = await db.select({ total: sql<number>`sum(${bulletinsPaie.salaireNet})` })
        .from(bulletinsPaie).where(eq(bulletinsPaie.mois, currentMonth));

    return {
        totalEmployes: employesCount[0]?.count || 0,
        congesEnAttente: congesEnAttente[0]?.count || 0,
        recrutementsEnCours: recrutementsEnCours[0]?.count || 0,
        masseSalariale: masseSalariale[0]?.total || 0
    };
}

// =============================================================================
// RAPPORTS RH
// =============================================================================

export async function getRegistrePersonnel(filters?: { statut?: string; departmentId?: string; agenceId?: string }) {
    const conditions = [];

    // By default only active employees
    if (filters?.statut) {
        conditions.push(eq(users.statut, filters.statut));
    }
    if (filters?.departmentId) {
        conditions.push(eq(jobPositions.departmentId, filters.departmentId));
    }
    if (filters?.agenceId) {
        conditions.push(eq(employes.agenceId, filters.agenceId));
    }

    const query = db.select({
        matricule: employes.matricule,
        nom: users.nom,
        prenom: users.prenom,
        sexe: users.sexe,
        dateNaissance: users.dateNaissance,
        dateEmbauche: employes.dateEmbauche,
        poste: jobPositions.name,
        departement: departments.name,
        typeContrat: employes.typeContrat,
        qualification: jobPositions.qualification,
        salaireBase: employes.salaireBase,
        numeroCnss: employes.numeroCnss,
        dateSortie: employes.dateSortie,
        motifSortie: employes.motifSortie,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
    .leftJoin(departments, eq(jobPositions.departmentId, departments.id));

    if (conditions.length > 0) {
        return await query.where(and(...conditions)).orderBy(users.nom);
    }
    return await query.orderBy(users.nom);
}

export async function getBilanSocial(year: number) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 1. Effectifs
    const totalEmployes = await db.select({ count: sql<number>`count(*)::int` }).from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(eq(users.statut, StatutUser.ACTIVE));
    const total = totalEmployes[0]?.count || 0;

    // Par département
    const parDept = await db.select({
        departement: departments.name,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
    .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(departments.name);

    // Par type de contrat
    const parContrat = await db.select({
        typeContrat: employes.typeContrat,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(employes.typeContrat);

    // Par sexe
    const parSexe = await db.select({
        sexe: users.sexe,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(users.sexe);

    // Embauches dans l'année
    const embauches = await db.select({ count: sql<number>`count(*)::int` })
        .from(employes)
        .where(and(
            gte(employes.dateEmbauche, startDate),
            lte(employes.dateEmbauche, endDate)
        ));

    // Départs dans l'année
    const departs = await db.select({ count: sql<number>`count(*)::int` })
        .from(employes)
        .where(and(
            gte(employes.dateSortie, startDate),
            lte(employes.dateSortie, endDate)
        ));

    const nbEmbauches = embauches[0]?.count || 0;
    const nbDeparts = departs[0]?.count || 0;
    const tauxRotation = total > 0 ? Math.round((nbDeparts / total) * 100) : 0;

    // 2. Rémunération
    const moisDebut = `${year}-01`;
    const moisFin = `${year}-12`;
    const masseSalariale = await db.select({
        total: sql<number>`coalesce(sum(${bulletinsPaie.salaireNet}::numeric), 0)::int`,
    })
    .from(bulletinsPaie)
    .where(and(
        gte(bulletinsPaie.mois, moisDebut),
        lte(bulletinsPaie.mois, moisFin)
    ));

    const salaireMoyen = total > 0 ? Math.round((masseSalariale[0]?.total || 0) / (total * 12)) : 0;

    // 3. Congés
    const conges = await db.select({
        totalJours: sql<number>`coalesce(sum(
            (${demandesConges.dateFin}::date - ${demandesConges.dateDebut}::date) + 1
        ), 0)::int`,
    })
    .from(demandesConges)
    .where(and(
        eq(demandesConges.statut, StatutConge.APPROVED),
        gte(demandesConges.dateDebut, startDate),
        lte(demandesConges.dateFin, endDate)
    ));

    // 4. Formations
    const formationsCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(formations)
        .where(and(
            gte(formations.dateDebut, new Date(`${year}-01-01`)),
            lte(formations.dateDebut, new Date(`${year}-12-31`))
        ));

    const participantsCount = await db.select({ count: sql<number>`count(distinct ${formationParticipants.employeId})::int` })
        .from(formationParticipants)
        .innerJoin(formations, eq(formationParticipants.formationId, formations.id))
        .where(and(
            gte(formations.dateDebut, new Date(`${year}-01-01`)),
            lte(formations.dateDebut, new Date(`${year}-12-31`))
        ));

    // 5. Sanctions
    const sanctionsParGravite = await db.select({
        gravite: sanctions.gravite,
        count: sql<number>`count(*)::int`,
    })
    .from(sanctions)
    .where(and(
        gte(sanctions.date, startDate),
        lte(sanctions.date, endDate)
    ))
    .groupBy(sanctions.gravite);

    return {
        annee: year,
        effectifs: {
            total,
            parDepartement: parDept,
            parTypeContrat: parContrat,
            parSexe: parSexe,
            embauches: nbEmbauches,
            departs: nbDeparts,
            tauxRotation,
        },
        remuneration: {
            masseSalariale: masseSalariale[0]?.total || 0,
            salaireMoyen,
        },
        conges: {
            totalJoursApprouves: conges[0]?.totalJours || 0,
        },
        formations: {
            nombreFormations: formationsCount[0]?.count || 0,
            nombreParticipants: participantsCount[0]?.count || 0,
        },
        sanctions: {
            parGravite: sanctionsParGravite,
            total: sanctionsParGravite.reduce((sum, s) => sum + s.count, 0),
        },
    };
}
