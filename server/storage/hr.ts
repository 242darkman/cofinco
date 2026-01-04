import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  demandesConges, 
  formations, 
  sanctions, 
  candidatures, 
  bulletinsPaie, InsertBulletinPaie,
  avantages, Avantage,
  avantagesEmployes, InsertAvantageEmploye, AvantageEmploye,
  presences, Presence, users, horairesTravail, employes
} from "@shared/schema";

// Demandes de Congés
export async function getConges(filter?: { statut?: string; employeId?: string }) {
  let query = db.select().from(demandesConges);
  const conditions = [];
  if (filter?.statut) conditions.push(eq(demandesConges.statut, filter.statut));
  if (filter?.employeId) conditions.push(eq(demandesConges.employeId, filter.employeId));
  
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt));
  }
  return await query.orderBy(desc(demandesConges.createdAt));
}

export async function createConge(conge: any) {
  const [newConge] = await db.insert(demandesConges).values(conge).returning();
  return newConge;
}

export async function updateCongeStatus(id: number, status: string, userId: string, commentaire?: string) {
    const [updated] = await db.update(demandesConges)
      .set({
        statut: status,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null
      })
      .where(eq(demandesConges.id, id))
      .returning();
    return updated;
}

// Formations
export async function getFormations(statut?: string) {
    if (statut) {
        return await db.select().from(formations).where(eq(formations.statut, statut)).orderBy(desc(formations.dateDebut));
    }
    return await db.select().from(formations).orderBy(desc(formations.dateDebut));
}

export async function createFormation(formation: any) {
    const [newFormation] = await db.insert(formations).values(formation).returning();
    return newFormation;
}

// Sanctions
export async function getSanctions(employeId?: string) {
    if (employeId) {
        return await db.select().from(sanctions).where(eq(sanctions.employeId, employeId)).orderBy(desc(sanctions.date));
    }
    return await db.select().from(sanctions).orderBy(desc(sanctions.date));
}

export async function createSanction(sanction: any) {
    const [newSanction] = await db.insert(sanctions).values(sanction).returning();
    return newSanction;
}

// Candidatures
export async function getCandidatures(statut?: string) {
    if (statut) {
        return await db.select().from(candidatures).where(eq(candidatures.statut, statut)).orderBy(desc(candidatures.datePostulation));
    }
    return await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));
}

// Bulletins
export async function getBulletins(employeId?: string) {
    if (employeId) {
        return await db.select().from(bulletinsPaie).where(eq(bulletinsPaie.employeId, employeId)).orderBy(desc(bulletinsPaie.mois));
    }
    return await db.select().from(bulletinsPaie).orderBy(desc(bulletinsPaie.mois));
}

// Avantages
export async function getAllAvantages(): Promise<Avantage[]> {
    return await db.select().from(avantages).where(eq(avantages.actif, true));
}

export async function getAvantagesEmploye(employeId: string): Promise<any[]> {
    return await db.select({
        id: avantagesEmployes.id,
        avantageId: avantages.id,
        nom: avantages.nom,
        type: avantages.type,
        montant: avantagesEmployes.montant,
        dateAttribution: avantagesEmployes.dateAttribution
    })
    .from(avantagesEmployes)
    .innerJoin(avantages, eq(avantagesEmployes.avantageId, avantages.id))
    .where(eq(avantagesEmployes.employeId, employeId));
}

export async function assignAvantage(data: InsertAvantageEmploye): Promise<AvantageEmploye> {
    const [assigned] = await db.insert(avantagesEmployes).values(data).returning();
    return assigned;
}

// Presence
export async function getPresenceAujourdhui(): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    const totalEmployes = await db.select({ count: sql<number>`count(*)` }).from(employes);
    
    const presencesList = await db.select().from(presences).where(eq(presences.date, today));
    
    // Stats calculation
    const presents = presencesList.filter(p => p.statut === 'Présent').length;
    const retards = presencesList.filter(p => p.statut === 'Retard').length;
    const absents = presencesList.filter(p => p.statut === 'Absent').length;
    
    return {
        date: today,
        totalEmployes: totalEmployes[0]?.count || 0,
        presents,
        retards,
        absents,
        tauxPresence: totalEmployes[0]?.count ? Math.round((presents / totalEmployes[0].count) * 100) : 0,
        liste: presencesList
    };
}

export async function checkIn(employeId: string): Promise<Presence> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    // Check if already checked in
    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    
    if (existing.length > 0) return existing[0]; // Already present

    // Determine status based on time (e.g. after 9:00 is Retard)
    const hour = now.getHours();
    let statut = "Présent";
    if (hour >= 9) statut = "Retard";

    const [presence] = await db.insert(presences).values({
        employeId,
        date: today,
        statut,
        heureArrivee: now
    }).returning();
    
    return presence;
}

export async function checkOut(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0) return null; // Not checked in

    const heureArrivee = existing[0].heureArrivee;
    if (!heureArrivee) return null;

    // Calculate total time from arrival to departure
    const diffMs = now.getTime() - new Date(heureArrivee).getTime();
    let totalMinutes = Math.floor(diffMs / 60000);
    
    // Fetch scheduled pause duration from horairesTravail
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const horaires = await db.select().from(horairesTravail)
        .where(and(
            eq(horairesTravail.employeId, employeId),
            eq(horairesTravail.jourSemaine, dayOfWeek),
            eq(horairesTravail.actif, true)
        ));
    
    let pauseMinutesFixe = 60; // Default scheduled pause: 60 min
    if (horaires.length > 0) {
        pauseMinutesFixe = horaires[0].pauseMinutes || 60;
    }
    
    // Calculate actual pause time if recorded
    let pauseMinutesReelle = 0;
    if (existing[0].pauseDebut && existing[0].pauseFin) {
        const pauseMs = new Date(existing[0].pauseFin).getTime() - new Date(existing[0].pauseDebut).getTime();
        pauseMinutesReelle = Math.floor(pauseMs / 60000);
    }
    
    // Use actual pause if recorded, otherwise use scheduled pause
    const pauseMinutes = pauseMinutesReelle > 0 ? pauseMinutesReelle : pauseMinutesFixe;
    
    const minutesTravaillees = Math.max(0, totalMinutes - pauseMinutes);
    
    // Standard work day = 8 hours = 480 minutes
    const standardMinutes = 480;
    const heuresSupplementaires = Math.max(0, minutesTravaillees - standardMinutes);

    const [updated] = await db.update(presences)
        .set({ 
            heureDepart: now,
            heuresTravaillees: minutesTravaillees,
            heuresSupplementaires: heuresSupplementaires
        })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

export async function startBreak(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0 || !existing[0].heureArrivee) return null; // Not checked in

    const [updated] = await db.update(presences)
        .set({ pauseDebut: now })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

export async function endBreak(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0 || !existing[0].pauseDebut) return null; // No break started

    const [updated] = await db.update(presences)
        .set({ pauseFin: now })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

// Paie Management
export async function createBulletinPaie(data: InsertBulletinPaie): Promise<any> {
    const [bulletin] = await db.insert(bulletinsPaie).values(data).returning();
    return bulletin;
}

export async function updateBulletinStatut(id: number, statut: string): Promise<any> {
    const [updated] = await db.update(bulletinsPaie)
        .set({ statut })
        .where(eq(bulletinsPaie.id, id))
        .returning();
    return updated;
}

export async function generateMonthlyPaie(mois: string, genereParId?: string): Promise<any[]> {
    // 1. Get all active employees with salary info from employes + users
    const employeesData = await db.select({
        employeId: employes.id,
        userId: users.id,
        nom: users.nom,
        prenom: users.prenom,
        salaireBase: employes.salaireBase,
        tauxHoraire: employes.tauxHoraire,
        tauxJournalier: employes.tauxJournalier,
        modeCalculPaie: employes.modeCalculPaie,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, 'Actif'));
    
    const results = [];

    // Parse month to get date range
    const [year, month] = mois.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    for (const emp of employeesData) {
        // Check if bulletin already exists
        const existing = await db.select().from(bulletinsPaie).where(
            and(eq(bulletinsPaie.employeId, emp.employeId), eq(bulletinsPaie.mois, mois))
        );
        
        if (existing.length > 0) continue; // Skip if exists

        // Fetch presences for the month
        const monthPresences = await db.select().from(presences).where(
            and(
                eq(presences.employeId, emp.employeId),
                gte(presences.date, startDate),
                lte(presences.date, endDate)
            )
        );

        let salaireBrut = 0;
        const modeCalcul = emp.modeCalculPaie || 'Mensuel';

        if (modeCalcul === 'Horaire') {
            // Calculate based on hours worked
            const totalMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0);
            const totalHours = totalMinutes / 60;
            const tauxHoraire = emp.tauxHoraire || 0;
            salaireBrut = Math.round(totalHours * tauxHoraire);
            
            // Overtime (1.5x rate)
            const overtimeMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresSupplementaires || 0), 0);
            const overtimeHours = overtimeMinutes / 60;
            salaireBrut += Math.round(overtimeHours * tauxHoraire * 1.5);
            
        } else if (modeCalcul === 'Journalier') {
            // Calculate based on days present
            const joursPresents = monthPresences.filter(p => p.statut === 'Présent' || p.statut === 'Retard').length;
            const tauxJournalier = emp.tauxJournalier || 0;
            salaireBrut = joursPresents * tauxJournalier;
            
        } else {
            // Mensuel (fixed monthly salary)
            salaireBrut = emp.salaireBase || 0;
        }

        // Add transport allowance
        const transport = 50000;
        salaireBrut += transport;

        // Deductions
        const cnss = Math.round(salaireBrut * 0.05);
        const ipr = Math.round(salaireBrut * 0.15);
        const net = salaireBrut - cnss - ipr;

        const bulletinData: InsertBulletinPaie = {
            employeId: emp.employeId,
            employeNom: `${emp.nom} ${emp.prenom || ''}`,
            mois,
            salaireBase: (salaireBrut - transport).toString(),
            primeTransport: transport.toString(),
            salaireBrut: salaireBrut.toString(),
            cnssEmploye: cnss.toString(),
            ipr: ipr.toString(),
            totalRetenues: (cnss + ipr).toString(),
            salaireNet: net.toString(),
            cnssPatronale: Math.round(salaireBrut * 0.1).toString(),
            statut: 'Brouillon',
            genereParId: genereParId
        };
        
        const [bulletin] = await db.insert(bulletinsPaie).values(bulletinData).returning();
        results.push(bulletin);
    }
    
    return results;
}

// Organigramme Hiérarchique
interface OrgNode {
    id: string;
    nom: string;
    prenom: string;
    poste: string;
    departement: string;
    email?: string;
    photoProfile?: string;
    subordinates: OrgNode[];
}

export async function getOrganigramme(agenceId?: string): Promise<OrgNode[]> {
    // Fetch all active employees with user data, filtered by agency if provided
    const employeesData = await db.select({
        employeId: employes.id,
        userId: users.id,
        nom: users.nom,
        prenom: users.prenom,
        email: users.email,
        photoProfile: users.photoProfile,
        poste: employes.poste,
        departement: employes.departement,
        managerId: employes.managerId,
        agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(agenceId 
        ? and(eq(users.statut, 'Actif'), eq(employes.agenceId, agenceId))
        : eq(users.statut, 'Actif')
    );
    
    // Build map for quick lookup
    const employeeMap = new Map<string, any>();
    employeesData.forEach(emp => employeeMap.set(emp.employeId, { ...emp, subordinates: [] }));
    
    // Find top-level employees (no manager) and build tree
    const topLevel: OrgNode[] = [];
    
    employeesData.forEach(emp => {
        const node: OrgNode = {
            id: emp.employeId,
            nom: emp.nom,
            prenom: emp.prenom || '',
            poste: emp.poste || 'Non défini',
            departement: emp.departement || 'Non assigné',
            email: emp.email || undefined,
            photoProfile: emp.photoProfile || undefined,
            subordinates: []
        };
        
        if (!emp.managerId) {
            // Top-level employee
            topLevel.push(node);
            employeeMap.set(emp.employeId, node);
        } else {
            // Has a manager, add to manager's subordinates
            const manager = employeeMap.get(emp.managerId);
            if (manager) {
                manager.subordinates.push(node);
            } else {
                // Manager not found (inactive or deleted), treat as top-level
                topLevel.push(node);
            }
            employeeMap.set(emp.employeId, node);
        }
    });
    
    return topLevel;
}

export async function getHrStats(): Promise<any> {
    const employesCount = await db.select({ count: sql<number>`count(*)` }).from(employes);
    const congesEnAttente = await db.select({ count: sql<number>`count(*)` }).from(demandesConges).where(eq(demandesConges.statut, 'En attente'));
    const recrutementsEnCours = await db.select({ count: sql<number>`count(*)` }).from(candidatures).where(eq(candidatures.statut, 'En attente'));
    
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
