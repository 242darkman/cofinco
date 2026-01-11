import { Router } from "express";
import { db } from "../db";
import { 
  demandesConges, 
  formations, 
  formationParticipants,
  sanctions,
  candidatures,
  bulletinsPaie,
  horairesTravail,
  presences
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { getAuthUser, requireRole } from "server/middleware";
import { storage } from "server/storage";
import { users } from "@shared/schema";
import { getWsInstance } from "../ws-server";

export const hrRouter = Router();

/**
 * ========================================
 * DEMANDES DE CONGÉS
 * ========================================
 */

// GET /api/hr/conges - Liste des demandes de congés
hrRouter.get("/conges", getAuthUser, async (req, res) => {
  try {
    const { statut, employeId, dateDebut, dateFin } = req.query;
    
    let query = db.select().from(demandesConges);
    
    const conditions = [];
    if (statut) conditions.push(eq(demandesConges.statut, statut as string));
    if (employeId) conditions.push(eq(demandesConges.employeId, employeId as string));
    
    // RBAC: An employee can only see their own requests unless Admin/RH/Manager/Direction
    // Note: Manager should ideally see only their subordinates, implemented here for simplicity as "all" for Manager role for now, or filtered via frontend + rigorous check later.
    // Ideally: if role === 'manager', fetch subordinates IDs and filter.
    // For now, let's restrict standard 'agent'/'employe'
    const userRole = req.user?.role || 'agent';
    const restrictedRoles = ['agent', 'employe', 'stagiaire'];

    if (restrictedRoles.includes(userRole)) {
        // Force filter to own ID
        conditions.push(eq(demandesConges.employeId, req.user!.id));
    }

    if (dateDebut) conditions.push(gte(demandesConges.dateDebut, dateDebut as string));
    if (dateFin) conditions.push(lte(demandesConges.dateFin, dateFin as string));
    
    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt))
      : await query.orderBy(desc(demandesConges.createdAt));
    
    res.json(result);
  } catch (error) {
    console.error("Erreur récupération congés:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/conges - Créer une demande de congé
hrRouter.post("/conges", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, dateDebut, dateFin, motif } = req.body;
    
    if (!employeId || !type || !dateDebut || !dateFin) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Workflow: Direction (PDG/DG) auto-approves
    // Check if the requester (or the target employee if created by admin) has role 'direction'
    // Here we assume creator is the requester usually, or user object has role.
    const userRole = req.user?.role;
    const isDirection = userRole === 'direction' || userRole === 'pdg' || userRole === 'dg' || userRole === 'admin'; 
    const initialStatus = isDirection ? 'Approuvé' : 'En attente';
    const approuvePar = isDirection ? req.user?.id : null;
    const dateDecision = isDirection ? new Date() : null;
    
    const [newConge] = await db.insert(demandesConges).values({
      employeId,
      employeNom,
      type,
      dateDebut,
      dateFin,
      motif,
      statut: initialStatus,
      approuvePar: approuvePar,
      dateDecision: dateDecision
    }).returning();
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'conge_new', id: newConge.id } });
    }
    
    res.status(201).json(newConge);
  } catch (error) {
    console.error("Erreur création congé:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/conges/:id/approve - Approuver une demande
hrRouter.patch("/conges/:id/approve", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role || 'agent';
    
    // RBAC Check - Supports both code-style roles (admin, manager) and display-style roles (Administrateur, Chef d'Agence)
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'manager', "Chef d'Agence", 'direction', 'pdg', 'dg'];
    if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: "Non autorisé à approuver" });
    }

    // Manager Specific Check
    if (userRole === 'manager') {
        const conge = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
        if (!conge.length) return res.status(404).json({ error: "Demande non trouvée" });
        
        const applicant = await db.select().from(users).where(eq(users.id, conge[0].employeId));
        if (!applicant.length || applicant[0].managerId !== userId) {
            return res.status(403).json({ error: "Vous n'êtes pas le manager de cet employé" });
        }
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: "Approuvé",
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Demande non trouvée" });
    }
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'conge_approved', id: updated.id } });
    }
    
    res.json(updated);
  } catch (error) {
    console.error("Erreur approbation congé:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/conges/:id/reject - Refuser une demande
hrRouter.patch("/conges/:id/reject", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role || 'agent';
    
    // RBAC Check - Supports both code-style roles (admin, manager) and display-style roles (Administrateur, Chef d'Agence)
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'manager', "Chef d'Agence", 'direction', 'pdg', 'dg'];
    if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: "Non autorisé à refuser" });
    }

    // Manager Specific Check
    if (userRole === 'manager') {
        const conge = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
        if (!conge.length) return res.status(404).json({ error: "Demande non trouvée" });
        
        const applicant = await db.select().from(users).where(eq(users.id, conge[0].employeId));
        if (!applicant.length || applicant[0].managerId !== userId) {
            return res.status(403).json({ error: "Vous n'êtes pas le manager de cet employé" });
        }
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: "Refusé",
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Demande non trouvée" });
    }
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'conge_rejected', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    console.error("Erreur rejet congé:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * FORMATIONS
 * ========================================
 */

// GET /api/hr/formations - Liste des formations avec nombre de participants
hrRouter.get("/formations", getAuthUser, async (req, res) => {
  try {
    const { statut } = req.query;
    
    // Fetch formations with participant count using subquery
    const baseFormations = statut
      ? await db.select().from(formations).where(eq(formations.statut, statut as string)).orderBy(desc(formations.dateDebut))
      : await db.select().from(formations).orderBy(desc(formations.dateDebut));
    
    // For each formation, count participants
    const result = await Promise.all(
      baseFormations.map(async (formation) => {
        const participantCount = await db.select({ count: sql<number>`count(*)` })
          .from(formationParticipants)
          .where(eq(formationParticipants.formationId, formation.id));
        
        return {
          ...formation,
          participants: Number(participantCount[0]?.count || 0)
        };
      })
    );
    
    res.json(result);
  } catch (error) {
    console.error("Erreur récupération formations:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/formations - Créer une formation
hrRouter.post("/formations", getAuthUser, async (req, res) => {
  try {
    const { titre, formateur, dateDebut, duree, lieu, description, capaciteMax } = req.body;
    
    if (!titre || !formateur || !dateDebut || !duree) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    
    const [newFormation] = await db.insert(formations).values({
      titre,
      formateur,
      dateDebut,
      duree,
      lieu,
      description,
      capaciteMax,
      statut: "Planifiée"
    }).returning();
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_new', id: newFormation.id } });
    }

    res.status(201).json(newFormation);
  } catch (error) {
    console.error("Erreur création formation:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/formations/:id/participants - Participants d'une formation
hrRouter.get("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const participants = await db.select()
      .from(formationParticipants)
      .where(eq(formationParticipants.formationId, parseInt(id)));
    
    res.json(participants);
  } catch (error) {
    console.error("Erreur récupération participants:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/formations/:id/participants - Ajouter un participant
hrRouter.post("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { employeId, employeNom } = req.body;
    
    if (!employeId || !employeNom) {
      return res.status(400).json({ error: "employeId et employeNom requis" });
    }
    
    await db.insert(formationParticipants).values({
      formationId: parseInt(id),
      employeId,
      employeNom
    });
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_added', formationId: id } });
    }

    res.status(201).json({ message: "Participant ajouté" });
  } catch (error) {
    console.error("Erreur ajout participant:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id/participants/:employeId - Retirer un participant
hrRouter.delete("/formations/:id/participants/:employeId", getAuthUser, async (req, res) => {
  try {
    const { id, employeId } = req.params;
    
    await db.delete(formationParticipants)
      .where(and(
        eq(formationParticipants.formationId, parseInt(id)),
        eq(formationParticipants.employeId, employeId)
      ));
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_removed', formationId: id } });
    }

    res.json({ message: "Participant retiré" });
  } catch (error) {
    console.error("Erreur retrait participant:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/formations/:id - Mettre à jour statut formation
hrRouter.patch("/formations/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    
    if (!["Planifiée", "En cours", "Terminée", "Annulée"].includes(statut)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    
    const [updated] = await db.update(formations)
      .set({ statut })
      .where(eq(formations.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_status_update', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    console.error("Erreur mise à jour formation:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * SANCTIONS
 * ========================================
 */

// GET /api/hr/sanctions - Liste des sanctions
hrRouter.get("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, gravite } = req.query;
    
    let baseQuery = db.select().from(sanctions);
    
    let result;
    if (employeId) {
      result = await baseQuery.where(eq(sanctions.employeId, employeId as string)).orderBy(desc(sanctions.date));
    } else if (gravite) {
      result = await baseQuery.where(eq(sanctions.gravite, gravite as string)).orderBy(desc(sanctions.date));
    } else {
      result = await baseQuery.orderBy(desc(sanctions.date));
    }
    
    res.json(result);
  } catch (error) {
    console.error("Erreur récupération sanctions:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions - Créer une sanction
hrRouter.post("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, motif, date, gravite } = req.body;
    const userId = req.user?.id;
    
    if (!employeId || !type || !motif || !date || !gravite) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    
    const [newSanction] = await db.insert(sanctions).values({
      employeId,
      employeNom,
      type,
      motif,
      date,
      gravite,
      emetteurId: userId
    }).returning();
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_new', id: newSanction.id } });
    }
    
    res.status(201).json(newSanction);
  } catch (error) {
    console.error("Erreur création sanction:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * CANDIDATURES
 * ========================================
 */

// GET /api/hr/candidatures - Liste des candidatures
hrRouter.get("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { statut } = req.query;
    
    const result = statut
      ? await db.select().from(candidatures).where(eq(candidatures.statut, statut as string)).orderBy(desc(candidatures.datePostulation))
      : await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));
    
    res.json(result);
  } catch (error) {
    console.error("Erreur récupération candidatures:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures - Créer une candidature
hrRouter.post("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, posteVise, experience, formation: formationCand } = req.body;
    
    if (!nom || !prenom || !email || !posteVise) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    
    const [newCandidature] = await db.insert(candidatures).values({
      nom,
      prenom,
      email,
      telephone,
      posteVise,
      experience,
      formation: formationCand,
      statut: "En attente"
    }).returning();
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
    }
    
    res.status(201).json(newCandidature);
  } catch (error) {
    console.error("Erreur création candidature:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/candidatures/:id - Mettre à jour une candidature
hrRouter.patch("/candidatures/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, notes, dateEntretien } = req.body;
    
    const updates: any = {};
    if (statut) {
      if (!["En attente", "Entretien", "Accepté", "Refusé"].includes(statut)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updates.statut = statut;
    }
    if (notes !== undefined) updates.notes = notes;
    if (dateEntretien !== undefined) updates.dateEntretien = dateEntretien;
    
    const [updated] = await db.update(candidatures)
      .set(updates)
      .where(eq(candidatures.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_updated', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    console.error("Erreur mise à jour candidature:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * BULLETINS DE PAIE
 * ========================================
 */

// GET /api/hr/bulletins - Liste des bulletins de paie
hrRouter.get("/bulletins", getAuthUser, async (req, res) => {
  try {
    const { employeId, mois, annee } = req.query;
    
    let query = db.select().from(bulletinsPaie);
    
    const conditions = [];
    if (employeId) conditions.push(eq(bulletinsPaie.employeId, employeId as string));
    if (mois && annee) {
      const moisFormat = `${annee}-${String(mois).padStart(2, '0')}`;
      conditions.push(eq(bulletinsPaie.mois, moisFormat));
    }
    
    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(bulletinsPaie.mois))
      : await query.orderBy(desc(bulletinsPaie.mois));
    
    res.json(result);
  } catch (error) {
    console.error("Erreur récupération bulletins:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/paie/generate - Générer les fiches de paie pour un mois
hrRouter.post("/paie/generate", getAuthUser, requireRole(['rh', 'admin']), async (req, res) => {
    try {
        const { mois } = req.body;
        const userId = req.user?.id;
        
        if (!mois) return res.status(400).json({ error: "Mois requis (YYYY-MM)" });

        const results = await storage.generateMonthlyPaie(mois, userId);
        // Broadcast HR Update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'paie_generated', mois } });
        }

        res.status(201).json({ message: `${results.length} fiches de paie générées`, data: results });
    } catch (error) {
        console.error("Erreur génération paie:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/paie/my - Mes fiches de paie
hrRouter.get("/paie/my", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        const bulletins = await storage.getBulletins(userId);
        res.json(bulletins);
    } catch (error) {
        console.error("Erreur récupération mes bulletins:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/bulletins - Archiver un bulletin de paie
hrRouter.post("/bulletins", getAuthUser, async (req, res) => {
  try {
    const {
      employeId,
      employeNom,
      mois,
      salaireBase,
      primeAnciennete,
      primeTransport,
      primeRendement,
      autresPrimes,
      salaireBrut,
      cnssEmploye,
      ipr,
      autresRetenues,
      totalRetenues,
      salaireNet,
      cnssPatronale,
      pdfUrl,
      pdfHash
    } = req.body;
    
    const userId = req.user?.id;
    
    if (!employeId || !mois || !salaireBase || !salaireBrut || !salaireNet) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    
    // Vérifier si bulletin existe déjà pour ce mois
    const existing = await db.select()
      .from(bulletinsPaie)
      .where(and(
        eq(bulletinsPaie.employeId, employeId),
        eq(bulletinsPaie.mois, mois)
      ));
    
    if (existing.length > 0) {
      return res.status(409).json({ error: "Bulletin déjà existant pour ce mois" });
    }
    
    const [newBulletin] = await db.insert(bulletinsPaie).values({
      employeId,
      employeNom,
      mois,
      salaireBase,
      primeAnciennete: primeAnciennete || "0",
      primeTransport: primeTransport || "0",
      primeRendement: primeRendement || "0",
      autresPrimes: autresPrimes || "0",
      salaireBrut,
      cnssEmploye,
      ipr,
      autresRetenues: autresRetenues || "0",
      totalRetenues,
      salaireNet,
      cnssPatronale,
      pdfUrl,
      pdfHash,
      genereParId: userId,
      statut: "Validé" // Directement validé si archivé manuellement
    }).returning();
    
    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'bulletin_archived', id: newBulletin.id } });
    }

    res.status(201).json(newBulletin);
  } catch (error) {
    console.error("Erreur archivage bulletin:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * STATISTIQUES RH
 * ========================================
 */

// GET /api/hr/stats - Statistiques globales RH
hrRouter.get("/stats", getAuthUser, async (req, res) => {
  try {
    const stats = await storage.getHrStats();
    res.json(stats);
  } catch (error) {
    console.error("Erreur récupération stats RH:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * AVANTAGES
 * ========================================
 */

// GET /api/hr/avantages - Liste des avantages disponibles
hrRouter.get("/avantages", getAuthUser, async (req, res) => {
    try {
        const avantagesList = await storage.getAllAvantages();
        res.json(avantagesList);
    } catch (error) {
        console.error("Erreur récupération avantages:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/avantages/employe/:id - Avantages d'un employé
hrRouter.get("/avantages/employe/:id", getAuthUser, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await storage.getAvantagesEmploye(id);
        res.json(result);
    } catch (error) {
        console.error("Erreur récupération avantages employé:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages/assign - Assigner un avantage
hrRouter.post("/avantages/assign", getAuthUser, async (req, res) => {
    try {
        const { employeId, avantageId, montant } = req.body;
        if (!employeId || !avantageId || !montant) {
            return res.status(400).json({ error: "Champs manquants" });
        }
        
        // Check permissions later
        const result = await storage.assignAvantage({
            employeId,
            avantageId: parseInt(avantageId),
            montant: parseInt(montant),
            statut: 'Actif',
            dateAttribution: new Date().toISOString().split('T')[0]
        });
        // Broadcast HR Update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'avantage_assigned', employeId } });
        }

        res.status(201).json(result);
    } catch (error) {
        console.error("Erreur assignation avantage:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * PRESENCE
 * ========================================
 */

// GET /api/hr/presence/today - Stats présence aujourd'hui
hrRouter.get("/presence/today", getAuthUser, async (req, res) => {
    try {
        const stats = await storage.getPresenceAujourdhui();
        res.json(stats);
    } catch (error) {
        console.error("Erreur récupération présence:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkin - Pointage Arrivée
hrRouter.post("/presence/checkin", getAuthUser, async (req, res) => {
    try {
        const employeId = req.user?.id; // PRODUCTION: Use authenticated user only
        if (!employeId) return res.status(401).json({ error: "Non authentifié" });
        
        const result = await storage.checkIn(employeId);
        res.json(result);
    } catch (error) {
        console.error("Erreur pointage:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkout - Pointage Départ
hrRouter.post("/presence/checkout", getAuthUser, async (req, res) => {
    try {
        const employeId = req.user?.id; // PRODUCTION: Use authenticated user only
        if (!employeId) return res.status(401).json({ error: "Non authentifié" });
        
        const result = await storage.checkOut(employeId);
        if (!result) return res.status(404).json({ error: "Aucun pointage d'arrivée trouvé pour aujourd'hui" });
        
        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId } });
        }
        
        res.json(result);
    } catch (error) {
        console.error("Erreur pointage départ:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/start-break - Début pause
hrRouter.post("/presence/start-break", getAuthUser, async (req, res) => {
    try {
        const employeId = req.user?.id;
        if (!employeId) return res.status(401).json({ error: "Non authentifié" });
        
        const result = await storage.startBreak(employeId);
        if (!result) return res.status(404).json({ error: "Aucun pointage d'arrivée trouvé" });
        
        // WebSocket: Notify presence update
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId } });
        }
        
        res.json(result);
    } catch (error) {
        console.error("Erreur début pause:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/end-break - Fin pause
hrRouter.post("/presence/end-break", getAuthUser, async (req, res) => {
    try {
        const employeId = req.user?.id;
        if (!employeId) return res.status(401).json({ error: "Non authentifié" });
        
        const result = await storage.endBreak(employeId);
        if (!result) return res.status(404).json({ error: "Aucune pause en cours" });
        
        // WebSocket: Notify presence update
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId } });
        }
        
        res.json(result);
    } catch (error) {
        console.error("Erreur fin pause:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/by-status/:status - Liste employés par statut
hrRouter.get("/presence/by-status/:status", getAuthUser, async (req, res) => {
    try {
        const { status } = req.params;
        const today = new Date().toISOString().split('T')[0];
        
        const presencesList = await db.select({
            presence: presences,
            employe: users
        })
        .from(presences)
        .innerJoin(users, eq(presences.employeId, users.id))
        .where(and(
            eq(presences.date, today),
            eq(presences.statut, status)
        ));
        
        res.json(presencesList.map(p => ({
            ...p.employe,
            heureArrivee: p.presence.heureArrivee,
            heureDepart: p.presence.heureDepart,
            heuresTravaillees: p.presence.heuresTravaillees
        })));
    } catch (error) {
        console.error("Erreur récupération employés par statut:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * ORGANIGRAMME
 * ========================================
 */

// GET /api/hr/organigramme - Structure hiérarchique
hrRouter.get("/organigramme", getAuthUser, async (req, res) => {
    try {
        const agenceId = req.user?.agence || undefined; // Filter by user's agency
        const orgChart = await storage.getOrganigramme(agenceId);
        res.json(orgChart);
    } catch (error) {
        console.error("Erreur récupération organigramme:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * HORAIRES DE TRAVAIL
 * ========================================
 */

// GET /api/hr/horaires/:employeId - Horaires d'un employé
hrRouter.get("/horaires/:employeId", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;
        const horaires = await db.select().from(horairesTravail)
            .where(and(eq(horairesTravail.employeId, employeId), eq(horairesTravail.actif, true)));
        res.json(horaires);
    } catch (error) {
        console.error("Erreur récupération horaires:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/horaires - Créer un horaire
hrRouter.post("/horaires", getAuthUser, requireRole(['admin', 'rh']), async (req, res) => {
    try {
        const { employeId, jourSemaine, heureDebut, heureFin, pauseMinutes } = req.body;
        if (!employeId || jourSemaine === undefined || !heureDebut || !heureFin) {
            return res.status(400).json({ error: "Champs manquants" });
        }
        
        const [horaire] = await db.insert(horairesTravail).values({
            employeId,
            jourSemaine,
            heureDebut,
            heureFin,
            pauseMinutes: pauseMinutes || 60
        }).returning();
        
        res.status(201).json(horaire);
    } catch (error) {
        console.error("Erreur création horaire:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/horaires/:id - Supprimer un horaire
hrRouter.delete("/horaires/:id", getAuthUser, requireRole(['admin', 'rh']), async (req, res) => {
    try {
        const { id } = req.params;
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.id, parseInt(id)));
        res.json({ message: "Horaire supprimé" });
    } catch (error) {
        console.error("Erreur suppression horaire:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});
