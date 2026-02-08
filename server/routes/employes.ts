import type { Express } from "express";
import { z } from "zod";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:Employes');
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, employes, agentsTerrain, userRoles } from "@shared/schema";
import { SystemRole } from "@shared/types/roles"; // Still needed for role enum values
import { StatutUser } from "@shared/enum/status-constants";
import { storage } from "../storage";
import { generateMatricule } from "../storage/employes";
import { requireAuth, hashPassword } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../audit";
import { StorageService } from "../services/storage-service";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";

// Helper pour accepter string ou number et convertir en number
const numericString = z.union([z.number(), z.string()]).transform((val) => {
  if (typeof val === 'number') return val;
  const parsed = parseFloat(val.replace(/\s/g, '').replace(/,/g, '.'));
  return isNaN(parsed) ? 0 : parsed;
});

// Mapping modeCalculPaie: accepter les deux formats (MONTHLY/Mensuel)
const modeCalculPaieSchema = z.enum(['MONTHLY', 'HOURLY', 'DAILY', 'Mensuel', 'Horaire', 'Journalier']).transform((val) => {
  const mapping: Record<string, string> = {
    'MONTHLY': 'MONTHLY', 'Mensuel': 'MONTHLY',
    'HOURLY': 'HOURLY', 'Horaire': 'HOURLY',
    'DAILY': 'DAILY', 'Journalier': 'DAILY',
  };
  return mapping[val] || 'MONTHLY';
});

// UUID optionnel qui accepte les chaînes vides et les convertit en null
const optionalUuid = z.union([
  z.string().uuid(),
  z.literal(''),
  z.null(),
]).transform((val) => (val === '' ? null : val)).nullable();

// Schéma de validation pour la création d'un employé complet (user + employe)
const createEmployeWithUserSchema = z.object({
  // Données utilisateur (identité)
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().optional(),
  email: z.string().email("Email invalide").optional().nullable(),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(['M', 'F']).optional().nullable(),
  dateNaissance: z.string().optional().nullable(), // Format: YYYY-MM-DD
  adresse: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  photoProfile: z.string().optional().nullable(),

  // Authentification (optionnel)
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),

  // Données employé (RH)
  matricule: z.string().optional().nullable(),
  jobPositionId: optionalUuid.optional(),
  dateEmbauche: z.string().optional().nullable(),
  typeContrat: z.enum(['CDI', 'CDD', 'Stage', 'Intérim']).optional(),
  agenceId: optionalUuid.optional(),
  managerId: optionalUuid.optional(),
  // Rôle via userRoles table (Architecture V3)
  role: z.nativeEnum(SystemRole).optional(),
  salaireBase: numericString.optional(),
  tauxHoraire: numericString.optional(),
  tauxJournalier: numericString.optional(),
  modeCalculPaie: modeCalculPaieSchema.optional(),
  numeroCnss: z.string().optional().nullable(),
  // Agent Terrain specific fields (optional, used when role === AGENT_TERRAIN)
  zonesAffectation: z.array(z.string()).optional(),
  objectifMensuel: z.string().optional(),
  // UUID temporaire utilisé pour les uploads avant la création de l'entité
  tempEntityId: z.string().uuid().optional().nullable(),
});

const updateEmployeWithUserSchema = z.object({
  // Données utilisateur
  nom: z.string().optional(),
  prenom: z.string().optional(),
  email: z.string().email().optional().nullable(),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(['M', 'F']).optional().nullable(),
  dateNaissance: z.string().optional().nullable(), // Format: YYYY-MM-DD
  adresse: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  photoProfile: z.string().optional().nullable(),
  statut: z.enum([StatutUser.ACTIVE, StatutUser.INACTIVE, StatutUser.SUSPENDED]).optional(),

  // Données employé (RH - sans rôle, géré par userRoles)
  matricule: z.string().optional().nullable(),
  jobPositionId: optionalUuid.optional(),
  dateEmbauche: z.string().optional().nullable(),
  typeContrat: z.enum(['CDI', 'CDD', 'Stage', 'Intérim']).optional(),
  agenceId: optionalUuid.optional(),
  managerId: optionalUuid.optional(),
  // Rôle géré via userRoles table (Architecture V3) - passé séparément à updateEmployeWithUser
  role: z.nativeEnum(SystemRole).optional(),
  salaireBase: numericString.optional(),
  tauxHoraire: numericString.optional(),
  tauxJournalier: numericString.optional(),
  modeCalculPaie: modeCalculPaieSchema.optional(),
  numeroCnss: z.string().optional().nullable(),
});

export function registerEmployesRoutes(app: Express) {

  // ============================================
  // GET - Vérifier l'unicité du numéro CNSS
  // ============================================
  app.get("/api/employes/check-cnss", requireAuth, async (req, res) => {
    try {
      const { numeroCnss, excludeEmployeId } = req.query;

      if (!numeroCnss || typeof numeroCnss !== 'string') {
        return res.status(400).json({ message: "Paramètre 'numeroCnss' requis" });
      }

      const trimmed = numeroCnss.trim().toUpperCase();
      if (!trimmed) {
        return res.json({ available: true });
      }

      const [existing] = await db
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.numeroCnss, trimmed))
        .limit(1);

      if (existing && existing.id !== excludeEmployeId) {
        return res.json({ available: false, message: "Ce numéro CNSS est déjà utilisé par un autre employé" });
      }

      return res.json({ available: true });
    } catch (error) {
      logger.error({ err: error }, 'Error checking CNSS uniqueness');
      res.status(500).json({ message: "Erreur lors de la vérification du numéro CNSS" });
    }
  });

  // ============================================
  // GET - Vérifier et générer un username unique
  // ============================================
  app.get("/api/employes/check-username", requireAuth, async (req, res) => {
    try {
      const { username, fullName } = req.query;

      // Si un username est fourni, vérifier s'il est disponible
      if (username && typeof username === 'string') {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser) {
          // Username existe, générer une suggestion unique
          let counter = 1;
          let suggestion = `${username}${counter}`;
          while (await storage.getUserByUsername(suggestion)) {
            counter++;
            suggestion = `${username}${counter}`;
          }
          return res.json({
            available: false,
            suggestion,
            message: `Ce nom d'utilisateur existe déjà. Suggestion: ${suggestion}`
          });
        }
        return res.json({ available: true, username });
      }

      // Si fullName est fourni, générer un username unique au format p.nom
      if (fullName && typeof fullName === 'string') {
        // Normaliser le nom (supprimer accents et caractères spéciaux)
        const normalized = fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const parts = normalized.trim().split(/\s+/).filter(Boolean);

        let baseUsername: string;
        if (parts.length < 2) {
          baseUsername = parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
        } else {
          const prenom = parts[0];
          const nom = parts[parts.length - 1];
          baseUsername = `${prenom.charAt(0).toLowerCase()}.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }

        // Vérifier l'unicité et incrémenter si nécessaire
        let finalUsername = baseUsername;
        let counter = 0;
        while (await storage.getUserByUsername(finalUsername)) {
          counter++;
          finalUsername = `${baseUsername}${counter}`;
        }

        return res.json({
          available: true,
          username: finalUsername,
          baseUsername,
          wasIncremented: counter > 0
        });
      }

      return res.status(400).json({ message: "Paramètre 'username' ou 'fullName' requis" });
    } catch (error) {
      logger.error({ err: error }, 'Error checking username');
      res.status(500).json({ message: "Erreur lors de la vérification du nom d'utilisateur" });
    }
  });

  // ============================================
  // GET - Données employé de l'utilisateur connecté
  // ============================================
  app.get("/api/employes/me", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const employe = await storage.getEmployeByUserId(userId);
      if (!employe) {
        return res.json({ data: null, message: "Aucun profil employé pour cet utilisateur" });
      }

      // Récupérer avec les données complètes
      const employeWithUser = await storage.getEmployeWithUser(employe.id);
      res.json({ data: employeWithUser });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching current user employe');
      res.status(500).json({ message: "Erreur lors de la récupération du profil employé" });
    }
  });

  // ============================================
  // GET - Liste des employés avec données utilisateur
  // Params: ?agenceId={uuid}&role={AGENT_TERRAIN|CAISSIER|etc}
  // ============================================
  app.get("/api/employes", requireAuth, async (req, res) => {
    try {
      const { agenceId, role } = req.query;
      const roleFilter = typeof role === 'string' ? role : undefined;

      let employesList;
      if (agenceId && typeof agenceId === 'string') {
        employesList = await storage.getEmployesByAgence(agenceId, roleFilter);
      } else {
        employesList = await storage.getAllEmployesWithUsers(roleFilter);
      }

      res.json(employesList);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching employes');
      res.status(500).json({ message: "Erreur lors de la récupération des employés" });
    }
  });

  // ============================================
  // GET - Détail d'un employé avec données utilisateur
  // ============================================
  app.get("/api/employes/:id", requireAuth, async (req, res) => {
    try {
      const employe = await storage.getEmployeWithUser(req.params.id);
      if (!employe) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }
      res.json(employe);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching employe');
      res.status(500).json({ message: "Erreur lors de la récupération de l'employé" });
    }
  });

  // ============================================
  // GET - Récupérer un employé par son userId
  // ============================================
  app.get("/api/employes/by-user/:userId", requireAuth, async (req, res) => {
    try {
      const employe = await storage.getEmployeByUserId(req.params.userId);
      if (!employe) {
        return res.status(404).json({ message: "Employé non trouvé pour cet utilisateur" });
      }

      // Récupérer avec les données user
      const employeWithUser = await storage.getEmployeWithUser(employe.id);
      res.json(employeWithUser);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching employe by userId');
      res.status(500).json({ message: "Erreur lors de la récupération de l'employé" });
    }
  });

  // ============================================
  // POST - Créer un nouvel employé (user + employe)
  // ============================================
  app.post("/api/employes", attachAbility, requireAbility(Actions.MANAGE, Subjects.EMPLOYE), async (req, res) => {
    try {
      const parsed = createEmployeWithUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;
      // Valider le rôle si fourni
      const resolvedRole = data.role || SystemRole.AGENT_TERRAIN;

      // Vérifier si username existe déjà
      if (data.username) {
        const existingUser = await storage.getUserByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
        }
      }

      // Hasher le mot de passe si fourni
      let hashedPassword = null;
      if (data.password) {
        hashedPassword = await hashPassword(data.password);
      }

      // Générer le matricule automatiquement si non fourni
      const matricule = data.matricule || await generateMatricule(data.agenceId);

      // Créer dans une transaction (Architecture V3: user + employe + userRoles)
      const result = await db.transaction(async (tx) => {
        // 1. Créer l'utilisateur
        const [user] = await tx.insert(users).values({
          nom: data.nom,
          prenom: data.prenom || null,
          email: data.email || null,
          telephone: data.telephone || null,
          sexe: data.sexe || null,
          dateNaissance: data.dateNaissance || null,
          adresse: data.adresse || null,
          ville: data.ville || null,
          photoProfile: data.photoProfile || null,
          username: data.username || null,
          password: hashedPassword,
          typeCompte: 'employe',
          canLogin: !!data.username,
          statut: StatutUser.ACTIVE,
        }).returning();

        // 2. Créer l'employé lié (sans roleSystem - géré par userRoles)
        const [employe] = await tx.insert(employes).values({
          userId: user.id,
          matricule,
          jobPositionId: data.jobPositionId || null,
          dateEmbauche: data.dateEmbauche || null,
          typeContrat: data.typeContrat || 'CDI',
          agenceId: data.agenceId || null,
          managerId: data.managerId || null,
          salaireBase: data.salaireBase || 0,
          tauxHoraire: data.tauxHoraire || 0,
          tauxJournalier: data.tauxJournalier || 0,
          modeCalculPaie: data.modeCalculPaie || 'Mensuel',
          numeroCnss: data.numeroCnss || null,
          statut: StatutUser.ACTIVE,
        }).returning();

        // 3. Créer le rôle dans userRoles (Architecture V3)
        await tx.insert(userRoles).values({
          userId: user.id,
          role: resolvedRole,
          agenceId: data.agenceId || null,
          isPrimary: true,
        });

        // 4. Si le rôle est AGENT_TERRAIN, créer l'entrée agents_terrain (synchrone dans la transaction)
        if (resolvedRole === SystemRole.AGENT_TERRAIN) {
          await tx.insert(agentsTerrain).values({
            employeId: employe.id,
            zoneAffectation: data.zonesAffectation?.length ? data.zonesAffectation.join(', ') : null,
            objectifMensuel: data.objectifMensuel || '100000',
            statut: StatutUser.ACTIVE,
          });
        }

        return { user, employe };
      });

      // Relocate files from temp UUID to real entity ID
      const tempEntityId = data.tempEntityId;
      if (tempEntityId && tempEntityId !== result.employe.id) {
        try {
          const keyMapping = await StorageService.relocateEntityFiles('employe', tempEntityId, result.employe.id);

          if (keyMapping.size > 0 && result.user.photoProfile && keyMapping.has(result.user.photoProfile)) {
            await db.update(users)
              .set({ photoProfile: keyMapping.get(result.user.photoProfile)! })
              .where(eq(users.id, result.user.id));
          }

          await StorageService.deleteEntityFiles('employe', tempEntityId);
        } catch (relocateError) {
          logger.warn({ err: relocateError, employeId: result.employe.id }, 'File relocation failed for employe');
        }
      }

      await logAudit(
        req,
        "CREATE_EMPLOYE",
        "employe",
        result.employe.id,
        { nom: data.nom, prenom: data.prenom, matricule },
        "success",
        "medium"
      );

      // Domain event: employee created (welcome notification)
      dispatchDomainEvent({
        type: "EMPLOYEE_CREATED",
        data: {
          employeId: result.employe.id,
          userId: result.user.id,
          nom: data.nom,
          prenom: data.prenom || undefined,
          email: data.email || undefined,
          telephone: data.telephone || undefined,
          matricule,
          username: data.username || undefined,
          agenceId: data.agenceId || undefined,
        },
        timestamp: new Date(),
        agenceId: data.agenceId || undefined,
      });

      // Notify
      try {
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "EMPLOYE_UPDATE", payload: { type: 'employe_new', id: result.employe.id } });
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'Failed to notify via WebSocket');
      }

      // Retourner l'employé avec ses données user
      const employeWithUser = await storage.getEmployeWithUser(result.employe.id);
      res.status(201).json(employeWithUser);

    } catch (error) {
      // Cleanup temp files if creation failed
      const tempId = req.body?.tempEntityId || req.body?.temp_entity_id;
      if (tempId) {
        StorageService.deleteEntityFiles('employe', tempId)
          .catch(err => logger.error({ err }, 'Cleanup temp files failed'));
      }
      logger.error({ err: error }, 'Error creating employe');
      res.status(500).json({ message: "Erreur lors de la création de l'employé" });
    }
  });

  // ============================================
  // PUT - Mettre à jour un employé (user + employe)
  // ============================================
  app.put("/api/employes/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.EMPLOYE), async (req, res) => {
    try {
      const employeId = req.params.id;

      // Vérifier que l'employé existe
      const existingEmploye = await storage.getEmploye(employeId);
      if (!existingEmploye) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const parsed = updateEmployeWithUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;

      // Séparer les données user et employe
      const userData: Record<string, any> = {};
      const employeData: Record<string, any> = {};

      // Données user
      if (data.nom !== undefined) userData.nom = data.nom;
      if (data.prenom !== undefined) userData.prenom = data.prenom;
      if (data.email !== undefined) userData.email = data.email || null;
      if (data.telephone !== undefined) userData.telephone = data.telephone || null;
      if (data.sexe !== undefined) userData.sexe = data.sexe;
      if (data.dateNaissance !== undefined) userData.dateNaissance = data.dateNaissance || null;
      if (data.adresse !== undefined) userData.adresse = data.adresse || null;
      if (data.ville !== undefined) userData.ville = data.ville || null;
      if (data.photoProfile !== undefined) userData.photoProfile = data.photoProfile || null;
      if (data.statut !== undefined) userData.statut = data.statut;

      // Données employe (sans roleSystem - géré par userRoles)
      if (data.matricule !== undefined) employeData.matricule = data.matricule || null;
      if (data.jobPositionId !== undefined) employeData.jobPositionId = data.jobPositionId || null;
      if (data.dateEmbauche !== undefined) employeData.dateEmbauche = data.dateEmbauche || null;
      if (data.typeContrat !== undefined) employeData.typeContrat = data.typeContrat;
      if (data.agenceId !== undefined) employeData.agenceId = data.agenceId;
      if (data.managerId !== undefined) employeData.managerId = data.managerId;
      if (data.salaireBase !== undefined) employeData.salaireBase = data.salaireBase;
      if (data.tauxHoraire !== undefined) employeData.tauxHoraire = data.tauxHoraire;
      if (data.tauxJournalier !== undefined) employeData.tauxJournalier = data.tauxJournalier;
      if (data.modeCalculPaie !== undefined) employeData.modeCalculPaie = data.modeCalculPaie;
      if (data.numeroCnss !== undefined) employeData.numeroCnss = data.numeroCnss || null;

      // Mise à jour (Architecture V3: passe le nouveau rôle à updateEmployeWithUser)
      const updated = await storage.updateEmployeWithUser(employeId, userData, employeData, data.role);

      if (!updated) {
        return res.status(500).json({ message: "Erreur lors de la mise à jour" });
      }

      await logAudit(
        req,
        "UPDATE_EMPLOYE",
        "employe",
        employeId,
        { userData, employeData },
        "success",
        "medium"
      );

      // Notify
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "EMPLOYE_UPDATE", payload: { type: 'employe_updated', id: employeId } });
      }

      res.json(updated);

    } catch (error) {
      logger.error({ err: error }, 'Error updating employe');
      res.status(500).json({ message: "Erreur lors de la mise à jour de l'employé" });
    }
  });

  // ============================================
  // DELETE - Supprimer un employé (soft delete)
  // ============================================
  app.delete("/api/employes/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.EMPLOYE), async (req, res) => {
    try {
      const employeId = req.params.id;

      const employe = await storage.getEmployeWithUser(employeId);
      if (!employe) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const success = await storage.deleteEmploye(employeId);

      if (!success) {
        return res.status(500).json({ message: "Erreur lors de la suppression" });
      }

      await logAudit(
        req,
        "DELETE_EMPLOYE",
        "employe",
        employeId,
        { nom: employe.user.nom, prenom: employe.user.prenom },
        "success",
        "high"
      );

      // Notify
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "EMPLOYE_UPDATE", payload: { type: 'employe_deleted', id: employeId } });
      }

      res.json({ message: "Employé supprimé avec succès" });

    } catch (error) {
      logger.error({ err: error }, 'Error deleting employe');
      res.status(500).json({ message: "Erreur lors de la suppression de l'employé" });
    }
  });

  // ============================================
  // POST - Créer un employé pour un utilisateur existant
  // ============================================
  app.post("/api/employes/from-user/:userId", attachAbility, requireAbility(Actions.MANAGE, Subjects.EMPLOYE), async (req, res) => {
    try {
      const { userId } = req.params;

      // Vérifier que l'utilisateur existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Vérifier qu'il n'a pas déjà un profil employé
      const existingEmploye = await storage.getEmployeByUserId(userId);
      if (existingEmploye) {
        return res.status(400).json({ message: "Cet utilisateur a déjà un profil employé" });
      }

      // Séparer les données user des données employé
      const {
        role: requestedRole,
        // Champs user à mettre à jour
        dateNaissance,
        adresse,
        ville,
        telephone,
        email,
        sexe,
        photoProfile,
        // Le reste va dans employeFields
        ...employeFields
      } = req.body;

      const resolvedRole = requestedRole && Object.values(SystemRole).includes(requestedRole)
        ? requestedRole
        : SystemRole.AGENT_TERRAIN;

      // Mettre à jour les informations de l'utilisateur
      const userUpdateData: Record<string, any> = {
        typeCompte: user.typeCompte === 'client' ? 'both' : 'employe',
      };

      // Ajouter les champs user fournis (ne pas écraser si non fournis)
      if (dateNaissance !== undefined) userUpdateData.dateNaissance = dateNaissance || null;
      if (adresse !== undefined) userUpdateData.adresse = adresse || null;
      if (ville !== undefined) userUpdateData.ville = ville || null;
      if (telephone !== undefined) userUpdateData.telephone = telephone || null;
      if (email !== undefined) userUpdateData.email = email || null;
      if (sexe !== undefined) userUpdateData.sexe = sexe || null;
      if (photoProfile !== undefined) userUpdateData.photoProfile = photoProfile || null;

      await db.update(users)
        .set(userUpdateData)
        .where(eq(users.id, userId));

      // Créer l'employé avec rôle (Architecture V3)
      const employe = await storage.createEmployeForUser(userId, employeFields, resolvedRole);

      await logAudit(
        req,
        "CREATE_EMPLOYE_FROM_USER",
        "employe",
        employe.id,
        { userId },
        "success",
        "medium"
      );

      // Notify
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "EMPLOYE_UPDATE", payload: { type: 'employe_new', id: employe.id } });
      }

      const employeWithUser = await storage.getEmployeWithUser(employe.id);
      res.status(201).json(employeWithUser);

    } catch (error) {
      logger.error({ err: error }, 'Error creating employe from user');
      res.status(500).json({ message: "Erreur lors de la création du profil employé" });
    }
  });
}
